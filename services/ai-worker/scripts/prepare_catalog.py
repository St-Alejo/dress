"""Normaliza las fotos reales del catálogo a partir de seed/photos/_raw.

Por cada entrada de seed/photos/sources.json genera:
  - {kind}/{key}.jpg         foto de tienda: sujeto centrado sobre fondo claro, 768x1024
  - garments/{key}.cutout.webp  recorte con transparencia (cámara en vivo)

`"background": "keep"` conserva el fondo original (piezas claras sobre fondo claro,
donde la segmentación falla) y no genera recorte.

Uso (desde services/ai-worker, con el extra `tools` instalado):
  python scripts/prepare_catalog.py ../../seed/photos [--only g01,g02] [--force]
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageOps
from rembg import new_session, remove

CANVAS = (768, 1024)
BACKGROUND = (246, 245, 242)
MARGIN = 0.06  # aire alrededor del sujeto, como fracción del lienzo
CUTOUT_MAX = 800


def cutout_of(image: Image.Image, session) -> Image.Image:
    """Sujeto con canal alfa, recortado a su caja."""
    rgba = remove(image, session=session, post_process_mask=True)
    box = rgba.getchannel("A").point(lambda a: 255 if a > 24 else 0).getbbox()
    return rgba.crop(box) if box else rgba


def on_canvas(cutout: Image.Image) -> Image.Image:
    """Encaja el recorte en el lienzo de tienda conservando la proporción."""
    canvas = Image.new("RGB", CANVAS, BACKGROUND)
    room = (int(CANVAS[0] * (1 - 2 * MARGIN)), int(CANVAS[1] * (1 - 2 * MARGIN)))
    fitted = ImageOps.contain(cutout, room, Image.LANCZOS)
    at = ((CANVAS[0] - fitted.width) // 2, (CANVAS[1] - fitted.height) // 2)
    canvas.paste(fitted, at, fitted)
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("photos_dir", type=Path)
    parser.add_argument("--only", default="")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    root: Path = args.photos_dir
    sources = json.loads((root / "sources.json").read_text(encoding="utf-8"))
    only = {k for k in args.only.split(",") if k}
    session = new_session("isnet-general-use")

    for kind in ("garments", "bodies"):
        for key, source in sources[kind].items():
            if only and key not in only:
                continue
            target = root / kind / f"{key}.jpg"
            if target.exists() and not args.force:
                continue
            raw = root / "_raw" / kind / f"{source['pexels']}.jpg"
            image = ImageOps.exif_transpose(Image.open(raw)).convert("RGB")
            stale = root / kind / f"{key}.cutout.webp"
            if source.get("background") == "keep":
                ImageOps.fit(image, CANVAS, Image.LANCZOS).save(target, "JPEG", quality=88, optimize=True)
                stale.unlink(missing_ok=True)
                print(f"{kind}/{key} <- {raw.name} (fondo original)")
                continue
            cutout = cutout_of(image, session)
            on_canvas(cutout).save(target, "JPEG", quality=88, optimize=True)
            if kind == "garments":
                cutout.thumbnail((CUTOUT_MAX, CUTOUT_MAX), Image.LANCZOS)
                cutout.save(root / kind / f"{key}.cutout.webp", "WEBP", quality=86, method=6)
            print(f"{kind}/{key} <- {raw.name}")


if __name__ == "__main__":
    main()
