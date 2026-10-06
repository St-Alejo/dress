"""
Puerto de los proveedores de try-on (patrón Strategy).

Privacidad (sección 8): las imágenes solo viven en memoria durante la petición;
nada se escribe a disco ni se registra en logs.
"""

from __future__ import annotations

import base64
import io
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from PIL import Image

from ..contract import Category, WorkerError


@dataclass(frozen=True)
class GarmentInput:
    image: bytes
    category: Category
    name: str = ""
    color: str = ""
    fit: str = "regular fit"


@dataclass(frozen=True)
class TransferRequest:
    person: bytes
    garments: list[GarmentInput]
    body_brief: str = ""
    request_id: str = ""


@dataclass(frozen=True)
class Credentials:
    """Llegan por cabecera en cada petición: el worker no guarda claves."""

    provider: str = "mock"
    model: str | None = None
    api_key: str | None = field(default=None, repr=False)


class TryOnProvider(ABC):
    name: str
    supported: frozenset[str] = frozenset({"top", "bottom", "dress", "outerwear"})
    max_garments: int = 4

    async def generate(self, req: TransferRequest) -> bytes:
        """Template Method: validaciones comunes y luego la estrategia concreta."""
        if not req.garments:
            raise WorkerError("bad-input", "se necesita al menos una prenda")
        if len(req.garments) > self.max_garments:
            raise WorkerError("unsupported", f"{self.name} admite hasta {self.max_garments} prendas")
        unsupported = sorted({g.category for g in req.garments} - self.supported)
        if unsupported:
            raise WorkerError("unsupported", f"categoría no soportada: {', '.join(unsupported)}")
        return await self._generate(req)

    async def test(self) -> str:
        """Comprobación barata de credenciales. Devuelve un detalle legible o lanza WorkerError."""
        return "ok"

    @abstractmethod
    async def _generate(self, req: TransferRequest) -> bytes: ...


def normalize_png(data: bytes, max_side: int = 1024) -> bytes:
    """Re-codifica a PNG sin metadatos (quita EXIF) y limita el tamaño."""
    try:
        img = Image.open(io.BytesIO(data))
        img = img.convert("RGBA" if img.mode in ("RGBA", "LA", "P") else "RGB")
    except Exception as exc:  # Pillow lanza varios tipos según el formato
        raise WorkerError("bad-input", "la imagen no se pudo leer") from exc
    img.thumbnail((max_side, max_side))
    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


def to_data_uri(data: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(normalize_png(data)).decode()
