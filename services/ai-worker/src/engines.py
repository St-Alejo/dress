"""
Track B — motores de transferencia de prenda.

Patrón Strategy + Adapter (sección 10): `GarmentTransferEngine` es el puerto;
cada proveedor (mock, fal.ai, Replicate) es un adaptador intercambiable por
configuración, sin que el resto del sistema cambie.

Privacidad (sección 8): las imágenes solo viven en memoria durante la petición;
nada se escribe a disco ni se registra en logs.
"""

from __future__ import annotations

import asyncio
import base64
import io
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Literal

import httpx
from PIL import Image, ImageDraw, ImageFilter

Category = Literal["top", "bottom", "dress", "outerwear", "footwear", "accessory"]
SUPPORTED: set[str] = {"top", "bottom", "dress", "outerwear"}


class EngineError(RuntimeError):
    """Fallo del proveedor; la API lo convierte en fallback (Circuit Breaker)."""


class UnsupportedCategory(EngineError):
    pass


@dataclass(frozen=True)
class TransferRequest:
    person: bytes
    garment: bytes
    category: Category


class GarmentTransferEngine(ABC):
    name: str

    async def generate(self, req: TransferRequest) -> bytes:
        if req.category not in SUPPORTED:
            raise UnsupportedCategory(f"categoría no soportada para generación: {req.category}")
        return await self._generate(req)

    @abstractmethod
    async def _generate(self, req: TransferRequest) -> bytes: ...


def _to_data_uri(data: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(_normalize_png(data)).decode()


def _normalize_png(data: bytes, max_side: int = 1024) -> bytes:
    """Re-codifica a PNG sin metadatos (quita EXIF) y limita el tamaño."""
    img = Image.open(io.BytesIO(data))
    img = img.convert("RGBA" if img.mode in ("RGBA", "LA", "P") else "RGB")
    img.thumbnail((max_side, max_side))
    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


class MockEngine(GarmentTransferEngine):
    """
    Simula la generación sin costo: compone la prenda sobre la zona del torso de
    la foto. No es fotorrealista — sirve para desarrollo, demos y tests.
    """

    name = "mock"

    def __init__(self, delay_seconds: float = 0.0) -> None:
        self.delay_seconds = delay_seconds

    async def _generate(self, req: TransferRequest) -> bytes:
        if self.delay_seconds:
            await asyncio.sleep(self.delay_seconds)
        person = Image.open(io.BytesIO(req.person)).convert("RGBA")
        person.thumbnail((768, 1024))
        garment = Image.open(io.BytesIO(req.garment)).convert("RGBA")

        w, h = person.size
        # Región aproximada según categoría (fracciones del alto de la foto).
        top, bottom = {"top": (0.22, 0.58), "outerwear": (0.2, 0.62), "dress": (0.22, 0.85), "bottom": (0.5, 0.95)}[
            req.category
        ]
        box_h = int(h * (bottom - top))
        box_w = int(w * 0.62)
        garment.thumbnail((box_w, box_h))
        x = (w - garment.width) // 2
        y = int(h * top)
        shadow = Image.new("RGBA", person.size, (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rectangle([x + 6, y + 8, x + garment.width + 6, y + garment.height + 8], fill=(0, 0, 0, 40))
        person = Image.alpha_composite(person, shadow.filter(ImageFilter.GaussianBlur(10)))
        person.alpha_composite(garment, (x, y))

        out = io.BytesIO()
        person.convert("RGB").save(out, format="PNG")
        return out.getvalue()


class FalCatVTONEngine(GarmentTransferEngine):
    """Adaptador a CatVTON hospedado en fal.ai (endpoint síncrono)."""

    name = "fal-catvton"
    CLOTH_TYPE = {"top": "upper", "outerwear": "outer", "bottom": "lower", "dress": "overall"}

    def __init__(self, api_key: str, model: str = "fal-ai/cat-vton", timeout: float = 120.0) -> None:
        if not api_key:
            raise ValueError("FAL_KEY es obligatorio para el motor fal")
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    async def _generate(self, req: TransferRequest) -> bytes:
        payload = {
            "human_image_url": _to_data_uri(req.person),
            "garment_image_url": _to_data_uri(req.garment),
            "cloth_type": self.CLOTH_TYPE[req.category],
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                res = await client.post(
                    f"https://fal.run/{self.model}",
                    json=payload,
                    headers={"Authorization": f"Key {self.api_key}"},
                )
                res.raise_for_status()
                url = res.json()["image"]["url"]
                img = await client.get(url)
                img.raise_for_status()
                return img.content
            except (httpx.HTTPError, KeyError) as exc:
                raise EngineError(f"fal.ai falló: {type(exc).__name__}") from exc


class ReplicateEngine(GarmentTransferEngine):
    """
    Adaptador genérico a Replicate. El modelo y su versión se configuran por
    variable de entorno (por defecto, los nombres de entrada de IDM-VTON).
    """

    name = "replicate"
    CATEGORY = {"top": "upper_body", "outerwear": "upper_body", "bottom": "lower_body", "dress": "dresses"}

    def __init__(self, api_token: str, version: str, timeout: float = 180.0, poll_interval: float = 2.0) -> None:
        if not api_token or not version:
            raise ValueError("REPLICATE_API_TOKEN y REPLICATE_MODEL_VERSION son obligatorios para el motor replicate")
        self.api_token = api_token
        self.version = version
        self.timeout = timeout
        self.poll_interval = poll_interval

    async def _generate(self, req: TransferRequest) -> bytes:
        headers = {"Authorization": f"Bearer {self.api_token}", "Prefer": "wait=60"}
        payload = {
            "version": self.version,
            "input": {
                "human_img": _to_data_uri(req.person),
                "garm_img": _to_data_uri(req.garment),
                "category": self.CATEGORY[req.category],
                "garment_des": req.category,
            },
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                res = await client.post("https://api.replicate.com/v1/predictions", json=payload, headers=headers)
                res.raise_for_status()
                prediction = res.json()
                elapsed = 0.0
                while prediction["status"] not in ("succeeded", "failed", "canceled"):
                    if elapsed > self.timeout:
                        raise EngineError("Replicate excedió el tiempo máximo")
                    await asyncio.sleep(self.poll_interval)
                    elapsed += self.poll_interval
                    poll = await client.get(prediction["urls"]["get"], headers=headers)
                    poll.raise_for_status()
                    prediction = poll.json()
                if prediction["status"] != "succeeded":
                    raise EngineError(f"Replicate terminó en estado {prediction['status']}")
                output = prediction["output"]
                url = output[0] if isinstance(output, list) else output
                img = await client.get(url)
                img.raise_for_status()
                return img.content
            except (httpx.HTTPError, KeyError) as exc:
                raise EngineError(f"Replicate falló: {type(exc).__name__}") from exc
