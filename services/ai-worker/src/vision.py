"""
Visión con Groq (imagen → JSON): control de calidad de la foto de la persona y
etiquetado de prendas. Groq no genera imágenes; aquí solo describe lo que ve.

La cuota gratuita es pequeña (cada imagen cuesta ~2 000 tokens de un cupo de
8 000 por minuto), así que el cliente:
  - reduce la imagen antes de enviarla y manda una sola por petición;
  - recuerda las respuestas por hash de la imagen;
  - no pasa de `MAX_PER_MINUTE` llamadas y respeta `retry-after` tras un 429.

Nunca bloquea a la persona: si Groq no está configurado, no tiene cupo o falla,
se lanza `VisionUnavailable` y quien llama sigue adelante sin el análisis.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import time
from collections import OrderedDict, deque
from typing import Any

import httpx
from PIL import Image

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
MAX_SIDE = 768
MAX_PER_MINUTE = 3
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


class VisionUnavailable(Exception):
    """El análisis no se pudo hacer. Quien llama debe continuar sin él."""


def _data_url(image: bytes) -> str:
    try:
        img = Image.open(io.BytesIO(image)).convert("RGB")
    except Exception as exc:
        raise VisionUnavailable("imagen ilegible") from exc
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=85)
    return "data:image/jpeg;base64," + base64.b64encode(out.getvalue()).decode()


class GroqVision:
    def __init__(self, api_key: str, model: str, transport: httpx.AsyncBaseTransport | None = None, clock=time.monotonic) -> None:
        self.api_key = api_key
        self.model = model
        self._transport = transport
        self._clock = clock
        self._calls: deque[float] = deque()
        self._blocked_until = 0.0
        self._cache: OrderedDict[str, dict[str, Any]] = OrderedDict()

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

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
            raise VisionUnavailable("Groq sin configurar")
        key = f"{task}:{hashlib.sha256(image).hexdigest()}"
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]

        now = self._clock()
        while self._calls and now - self._calls[0] > 60:
            self._calls.popleft()
        if now < self._blocked_until or len(self._calls) >= MAX_PER_MINUTE:
            raise VisionUnavailable("sin cupo de Groq por ahora")
        self._calls.append(now)

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
                        {"type": "image_url", "image_url": {"url": _data_url(image)}},
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
            try:
                wait = float(res.headers.get("retry-after", "60"))
            except ValueError:
                wait = 60.0
            self._blocked_until = self._clock() + wait
            raise VisionUnavailable("Groq pidió esperar")
        if res.status_code >= 400:
            raise VisionUnavailable(f"Groq respondió {res.status_code}")
        try:
            parsed = json.loads(res.json()["choices"][0]["message"]["content"])
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise VisionUnavailable("respuesta de Groq ilegible") from exc
        if not isinstance(parsed, dict):
            raise VisionUnavailable("respuesta de Groq ilegible")

        self._cache[key] = parsed
        if len(self._cache) > CACHE_SIZE:
            self._cache.popitem(last=False)
        return parsed
