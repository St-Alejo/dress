from __future__ import annotations

import asyncio
import io

from PIL import Image, ImageDraw, ImageFilter

from ..contract import WorkerError
from .base import TransferRequest, TryOnProvider

# Región aproximada por categoría (fracciones del alto de la foto) y orden de capas.
REGION = {"bottom": (0.5, 0.95), "dress": (0.22, 0.85), "top": (0.22, 0.58), "outerwear": (0.2, 0.62)}
LAYER = {"bottom": 0, "dress": 1, "top": 2, "outerwear": 3}


class MockProvider(TryOnProvider):
    """
    Simula la generación sin costo: compone cada prenda sobre su zona de la foto,
    en orden de capas. No es fotorrealista: sirve para desarrollo, demos y tests.
    """

    name = "mock"

    def __init__(self, delay_seconds: float = 0.0) -> None:
        self.delay_seconds = delay_seconds

    async def _generate(self, req: TransferRequest) -> bytes:
        if self.delay_seconds:
            await asyncio.sleep(self.delay_seconds)
        try:
            person = Image.open(io.BytesIO(req.person)).convert("RGBA")
        except Exception as exc:
            raise WorkerError("bad-input", "la foto no se pudo leer") from exc
        person.thumbnail((768, 1024))
        w, h = person.size

        for g in sorted(req.garments, key=lambda g: LAYER[g.category]):
            try:
                garment = Image.open(io.BytesIO(g.image)).convert("RGBA")
            except Exception as exc:
                raise WorkerError("bad-input", f"la prenda {g.name or g.category} no se pudo leer") from exc
            top, bottom = REGION[g.category]
            garment.thumbnail((int(w * 0.62), int(h * (bottom - top))))
            x = (w - garment.width) // 2
            y = int(h * top)
            shadow = Image.new("RGBA", person.size, (0, 0, 0, 0))
            ImageDraw.Draw(shadow).rectangle(
                [x + 6, y + 8, x + garment.width + 6, y + garment.height + 8], fill=(0, 0, 0, 40)
            )
            person = Image.alpha_composite(person, shadow.filter(ImageFilter.GaussianBlur(10)))
            person.alpha_composite(garment, (x, y))

        out = io.BytesIO()
        person.convert("RGB").save(out, format="PNG")
        return out.getvalue()
