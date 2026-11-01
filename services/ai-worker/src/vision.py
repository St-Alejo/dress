"""
Visión (imagen → JSON): control de calidad de la foto de la persona y etiquetado
de prendas. Ningún proveedor genera imágenes; aquí solo describen lo que ven.

Proveedores:
  - Groq (por defecto, gratuito): cupo pequeño (cada imagen cuesta ~2 000 tokens
    de un cupo de 8 000 por minuto).
  - Claude (opcional, de pago): se activa con `VISION_PROVIDER=claude` y una key
    de Anthropic; si falla o no tiene saldo, la petición cae a Groq.

Para todos, el cliente:
  - reduce la imagen antes de enviarla y manda una sola por petición;
  - recuerda las respuestas por hash de la imagen;
  - no pasa de su cupo por minuto y respeta `retry-after` tras un 429.

Nunca bloquea a la persona: si el proveedor no está configurado, no tiene cupo o
falla, se lanza `VisionUnavailable` y quien llama sigue adelante sin el análisis.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import time
from collections import OrderedDict, deque
from typing import Any

import anthropic
import httpx
from PIL import Image

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
MAX_SIDE = 768
MAX_PER_MINUTE = 3
# Claude no tiene el cupo gratuito de Groq, pero cada llamada cuesta: el tope es para el gasto.
CLAUDE_MAX_PER_MINUTE = 20
CACHE_SIZE = 256

PHOTO_REASONS = ("no-person", "multiple-people", "not-full-body", "not-frontal", "too-dark")
STYLES = (
    "tshirt", "shirt", "hoodie", "sweater", "jacket", "coat", "jeans", "trousers", "shorts",
    "skirt", "dress-a", "dress-wrap", "sneakers", "boots", "scarf", "cap", "bag",
)  # fmt: skip
STYLE_CATEGORY = {
    "tshirt": "top", "shirt": "top", "hoodie": "top", "sweater": "top", "jacket": "outerwear", "coat": "outerwear",
    "jeans": "bottom", "trousers": "bottom", "shorts": "bottom", "skirt": "bottom", "dress-a": "dress",
    "dress-wrap": "dress", "sneakers": "footwear", "boots": "footwear", "scarf": "accessory", "cap": "accessory",
    "bag": "accessory",
}  # fmt: skip

PHOTO_PROMPT = (
    "You check whether a photo is usable for a virtual clothing try-on. Describe only framing and lighting; "
    "never comment on the person's body, weight, age or attractiveness. Reply with a JSON object with exactly "
    'these keys: "people" (integer, number of people clearly visible), "fullBody" (boolean, the person is visible '
    'at least from head to knees), "frontal" (boolean, the person faces the camera, standing), "lightingOk" '
    "(boolean, the person is clearly lit and in focus)."
)
GARMENT_PROMPT = (
    "You label a product photo for a clothing store. Reply with a JSON object with exactly these keys: "
    f'"style" (one of: {", ".join(STYLES)}), "photoType" ("flat-lay" if the garment is shown on its own, laid flat, '
    'on a hanger or on an invisible mannequin; "model" if a person is wearing it), "color" (dominant garment color '
    'as a #rrggbb hex string), "name" (a short product name in Spanish, at most 6 words, no brand).'
)

# Esquemas para las salidas estructuradas de Claude: la respuesta llega siempre como JSON válido.
PHOTO_SCHEMA = {
    "type": "object",
    "properties": {
        "people": {"type": "integer"},
        "fullBody": {"type": "boolean"},
        "frontal": {"type": "boolean"},
        "lightingOk": {"type": "boolean"},
    },
    "required": ["people", "fullBody", "frontal", "lightingOk"],
    "additionalProperties": False,
}
GARMENT_SCHEMA = {
    "type": "object",
    "properties": {
        "style": {"type": "string", "enum": list(STYLES)},
        "photoType": {"type": "string", "enum": ["flat-lay", "model"]},
        "color": {"type": "string"},
        "name": {"type": "string"},
    },
    "required": ["style", "photoType", "color", "name"],
    "additionalProperties": False,
}
SCHEMAS = {"photo": PHOTO_SCHEMA, "garment": GARMENT_SCHEMA}


class VisionUnavailable(Exception):
    """El análisis no se pudo hacer. Quien llama debe continuar sin él."""


class RetryLater(VisionUnavailable):
    """El proveedor pidió esperar `seconds` antes de volver a llamarlo."""

    def __init__(self, message: str, seconds: float) -> None:
        super().__init__(message)
        self.seconds = seconds


def _jpeg(image: bytes) -> bytes:
    try:
        img = Image.open(io.BytesIO(image)).convert("RGB")
    except Exception as exc:
        raise VisionUnavailable("imagen ilegible") from exc
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=85)
    return out.getvalue()


def _retry_after(headers: Any, default: float = 60.0) -> float:
    try:
        return float(headers.get("retry-after", default))
    except (TypeError, ValueError):
        return default


class VisionClient:
    """Lo común a todos los proveedores: interpretar la respuesta, caché por imagen y cupo por minuto."""

    label = "visión"
    max_per_minute = MAX_PER_MINUTE

    def __init__(self, clock=time.monotonic) -> None:
        self._clock = clock
        self._calls: deque[float] = deque()
        self._blocked_until = 0.0
        self._cache: OrderedDict[str, dict[str, Any]] = OrderedDict()

    @property
    def configured(self) -> bool:
        raise NotImplementedError

    async def inspect_photo(self, image: bytes) -> dict[str, Any]:
        """Qué tan utilizable es la foto. `reason` es el primer problema encontrado, o None."""
        raw = await self._ask("photo", PHOTO_PROMPT, image)
        people = raw.get("people")
        checks = {
            "no-person": people == 0,
            "multiple-people": isinstance(people, int) and people > 1,
            "not-full-body": raw.get("fullBody") is False,
            "not-frontal": raw.get("frontal") is False,
            "too-dark": raw.get("lightingOk") is False,
        }
        reason = next((r for r in PHOTO_REASONS if checks[r]), None)
        return {"ok": reason is None, "reason": reason}

    async def describe_garment(self, image: bytes) -> dict[str, Any]:
        """Sugerencias para el formulario de alta. Lo que el modelo no devuelva bien se omite."""
        raw = await self._ask("garment", GARMENT_PROMPT, image)
        out: dict[str, Any] = {}
        if raw.get("style") in STYLES:
            out["style"] = raw["style"]
            out["category"] = STYLE_CATEGORY[raw["style"]]
        if raw.get("photoType") in ("flat-lay", "model"):
            out["photoType"] = raw["photoType"]
        color = raw.get("color")
        if isinstance(color, str) and len(color) == 7 and color.startswith("#"):
            try:
                int(color[1:], 16)
                out["color"] = color.lower()
            except ValueError:
                pass
        if isinstance(raw.get("name"), str) and raw["name"].strip():
            out["name"] = raw["name"].strip()[:80]
        return out

    async def _ask(self, task: str, prompt: str, image: bytes) -> dict[str, Any]:
        if not self.configured:
            raise VisionUnavailable(f"{self.label} sin configurar")
        key = f"{task}:{hashlib.sha256(image).hexdigest()}"
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]

        now = self._clock()
        while self._calls and now - self._calls[0] > 60:
            self._calls.popleft()
        if now < self._blocked_until or len(self._calls) >= self.max_per_minute:
            raise VisionUnavailable(f"sin cupo de {self.label} por ahora")
        self._calls.append(now)

        try:
            parsed = await self._request(task, prompt, _jpeg(image))
        except RetryLater as exc:
            self._blocked_until = self._clock() + exc.seconds
            raise
        if not isinstance(parsed, dict):
            raise VisionUnavailable(f"respuesta de {self.label} ilegible")

        self._cache[key] = parsed
        if len(self._cache) > CACHE_SIZE:
            self._cache.popitem(last=False)
        return parsed

    async def _request(self, task: str, prompt: str, jpeg: bytes) -> Any:
        """Una llamada al proveedor con la imagen ya reducida. Devuelve el JSON decodificado."""
        raise NotImplementedError


class GroqVision(VisionClient):
    label = "Groq"

    def __init__(self, api_key: str, model: str, transport: httpx.AsyncBaseTransport | None = None, clock=time.monotonic) -> None:
        super().__init__(clock)
        self.api_key = api_key
        self.model = model
        self._transport = transport

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    async def _request(self, task: str, prompt: str, jpeg: bytes) -> Any:
        body = {
            "model": self.model,
            "temperature": 0,
            "max_completion_tokens": 400,
            "response_format": {"type": "json_object"},
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(jpeg).decode()}},
                    ],
                }
            ],
        }
        try:
            async with httpx.AsyncClient(transport=self._transport, timeout=30) as http:
                res = await http.post(GROQ_URL, json=body, headers={"Authorization": f"Bearer {self.api_key}"})
        except httpx.HTTPError as exc:
            raise VisionUnavailable("Groq no responde") from exc

        if res.status_code == 429:
            raise RetryLater("Groq pidió esperar", _retry_after(res.headers))
        if res.status_code >= 400:
            raise VisionUnavailable(f"Groq respondió {res.status_code}")
        try:
            return json.loads(res.json()["choices"][0]["message"]["content"])
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise VisionUnavailable("respuesta de Groq ilegible") from exc


class ClaudeVision(VisionClient):
    """Visión con Claude (API de Anthropic). Opcional y de pago: sin key se considera sin configurar."""

    label = "Claude"
    max_per_minute = CLAUDE_MAX_PER_MINUTE

    def __init__(self, api_key: str, model: str, client: Any | None = None, clock=time.monotonic) -> None:
        super().__init__(clock)
        self.api_key = api_key
        self.model = model
        # Sin reintentos del SDK: si falla, la cadena pasa a Groq en vez de hacer esperar a la persona.
        self._client = client or (anthropic.AsyncAnthropic(api_key=api_key, max_retries=0, timeout=30.0) if api_key else None)

    @property
    def configured(self) -> bool:
        return bool(self.api_key) and self._client is not None

    async def _request(self, task: str, prompt: str, jpeg: bytes) -> Any:
        try:
            res = await self._client.messages.create(
                model=self.model,
                max_tokens=1024,
                # Tarea de clasificación corta: poco razonamiento basta y abarata la llamada.
                output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMAS[task]}},
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.standard_b64encode(jpeg).decode()},
                            },
                            {"type": "text", "text": prompt},
                        ],
                    }
                ],
            )
        except anthropic.RateLimitError as exc:
            raise RetryLater("Claude pidió esperar", _retry_after(exc.response.headers)) from exc
        except anthropic.APIStatusError as exc:
            # 400 sin saldo, 401 key inválida, 404 modelo inexistente, 5xx: todo se trata como "sin análisis".
            raise VisionUnavailable(f"Claude respondió {exc.status_code}") from exc
        except anthropic.APIConnectionError as exc:
            raise VisionUnavailable("Claude no responde") from exc

        if res.stop_reason in ("refusal", "max_tokens"):
            raise VisionUnavailable(f"Claude no terminó ({res.stop_reason})")
        text = next((b.text for b in res.content if b.type == "text"), None)
        try:
            return json.loads(text)
        except (TypeError, ValueError) as exc:
            raise VisionUnavailable("respuesta de Claude ilegible") from exc


class FallbackVision(VisionClient):
    """Prueba los proveedores en orden; cada uno conserva su caché y su cupo."""

    def __init__(self, clients: list[VisionClient]) -> None:
        super().__init__()
        self.clients = clients
        self.label = " → ".join(c.label for c in clients)

    @property
    def configured(self) -> bool:
        return any(c.configured for c in self.clients)

    async def _ask(self, task: str, prompt: str, image: bytes) -> dict[str, Any]:
        last: VisionUnavailable = VisionUnavailable("visión sin configurar")
        for client in self.clients:
            try:
                return await client._ask(task, prompt, image)
            except VisionUnavailable as exc:
                last = exc
        raise last
