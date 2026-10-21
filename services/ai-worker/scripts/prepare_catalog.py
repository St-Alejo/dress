"""Normaliza las fotos reales del catálogo a partir de seed/photos/_raw.

Por cada entrada de seed/photos/sources.json genera:
  - {kind}/{key}.jpg              foto de tienda: prenda sola centrada sobre fondo claro, 768x1024
  - {kind}/{key}.w384.webp        versión ligera para listados (srcset)
  - garments/{key}.cutout.webp    recorte con transparencia (cámara en vivo y vista aproximada)
  - garments/{key}.anchors.json   anclas medidas en el recorte (cuello, hombros, puños, rodillas…)

Campos de cada prenda en sources.json:
  source/id     de dónde sale la foto ("pexels" | "unsplash"); `pexels: <id>` sigue valiendo
  category      categoría del catálogo (para las anclas y el segmentador)
  style         estilo (skirt, scarf, cap, bag…) cuando cambia la clase a segmentar
  mask          "rembg" (por defecto), "garment" (segmentador de ropa: quita persona, manos y
                perchas), "both" (borde de rembg recortado por el segmentador) o "plain"
                (diferencia con un fondo liso y claro, para telas pálidas)
  classes       clases del segmentador a extraer cuando las de la categoría no sirven
  crop          [x0, y0, x1, y1] en fracciones, para quedarse con una parte de la foto
  anchors       correcciones a mano de puntos concretos, en fracciones del recorte
  kind          cómo se viste en la cámara si no es el de su categoría (p. ej. un short como "skirt")
  sleeve        "none" | "short" | "long" cuando la medida automática se equivoca
  erase         polígonos [[x, y], …] en fracciones (tras `crop`) que se borran: percha, interior del escote

Uso (desde services/ai-worker, con el extra `tools` instalado):
  python scripts/prepare_catalog.py ../../seed/photos [--only g01,g02] [--force]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.garment_prep.anchors import anchors_of, kind_for  # noqa: E402

CANVAS = (768, 1024)
BACKGROUND = (246, 245, 242)
MARGIN = 0.06  # aire alrededor del sujeto, como fracción del lienzo
CUTOUT_MAX = 900
THUMB_W = 384


def raw_path(root: Path, kind: str, source: dict) -> Path:
    photo_id = source.get("id", source.get("pexels"))
    return root / "_raw" / kind / f"{photo_id}.jpg"


def cropped(image: Image.Image, crop: list[float] | None) -> Image.Image:
    if not crop:
        return image
    w, h = image.size
    return image.crop((int(crop[0] * w), int(crop[1] * h), int(crop[2] * w), int(crop[3] * h)))


def largest_component(alpha: Image.Image) -> Image.Image:
    """Quita islas sueltas (restos de fondo, otra prenda al lado) y deja la pieza principal."""
    from scipy import ndimage

    a = np.asarray(alpha)
    labels, n = ndimage.label(a > 24)
    if n <= 1:
        return alpha
    sizes = ndimage.sum(np.ones_like(a), labels, range(1, n + 1))
    keep = 1 + int(np.argmax(sizes))
    # Conserva también las islas grandes (p. ej. las dos zapatillas de un par).
    big = {i + 1 for i, s in enumerate(sizes) if s >= sizes[keep - 1] * 0.25}
    return Image.fromarray(np.where(np.isin(labels, list(big)), a, 0).astype(np.uint8), "L")


def plain_background_mask(image: Image.Image, threshold: int = 40) -> Image.Image:
    """Prenda sobre fondo liso y claro: todo lo que se aparta del color del borde superior.
    Sirve para telas claras o con zonas pálidas, que rembg confunde con el fondo."""
    from scipy import ndimage

    a = np.asarray(image.convert("RGB")).astype(np.int16)
    background = np.median(a[: max(4, a.shape[0] // 40)].reshape(-1, 3), axis=0)
    mask = np.abs(a - background).sum(axis=-1) > threshold
    k = max(5, int(min(image.size) * 0.012) | 1)
    # Apertura (quita cadenas, hilos y ruido fino) y relleno de los huecos del estampado.
    mask = ndimage.binary_opening(mask, structure=np.ones((k, k)))
    mask = ndimage.binary_fill_holes(mask)
    return Image.fromarray((mask * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(1))


def erased(alpha: Image.Image, polygons: list[list[list[float]]] | None) -> Image.Image:
    """Borra a mano lo que el segmentador cuenta como tela: la percha y el interior del escote
    (en la foto se ve la espalda de la prenda; puesta, ahí va el cuello o el pecho)."""
    if not polygons:
        return alpha
    out = alpha.copy()
    draw = ImageDraw.Draw(out)
    w, h = out.size
    for poly in polygons:
        draw.polygon([(x * w, y * h) for x, y in poly], fill=0)
    return out


def cutout_of(image: Image.Image, source: dict, session) -> Image.Image:
    """Sujeto con canal alfa, recortado a su caja."""
    mode = source.get("mask", "rembg")
    if mode == "rembg":
        from rembg import remove

        alpha = remove(image, session=session, post_process_mask=True).getchannel("A")
    elif mode == "both":
        from rembg import remove

        from src.garment_prep.segment import without_hands_and_rails

        alpha = without_hands_and_rails(image, remove(image, session=session, post_process_mask=True).getchannel("A"))
    elif mode == "plain":
        alpha = plain_background_mask(image)
    else:
        from src.garment_prep.segment import classes_for, garment_mask

        classes = source.get("classes") or classes_for(source["category"], source.get("style"))
        alpha = garment_mask(image, classes)
    alpha = largest_component(erased(alpha, source.get("erase")))
    rgba = image.convert("RGBA")
    rgba.putalpha(alpha)
    box = alpha.point(lambda a: 255 if a > 24 else 0).getbbox()
    return rgba.crop(box) if box else rgba


def write_anchors(path: Path, anchors: dict) -> None:
    # Siempre LF: en Windows write_text pondría CRLF y git avisaría en cada regeneración.
    path.write_text(json.dumps(anchors, indent=1) + "\n", encoding="utf-8", newline="\n")


def on_canvas(cutout: Image.Image) -> Image.Image:
    """Encaja el recorte en el lienzo de tienda conservando la proporción, con una sombra suave."""
    canvas = Image.new("RGB", CANVAS, BACKGROUND)
    room = (int(CANVAS[0] * (1 - 2 * MARGIN)), int(CANVAS[1] * (1 - 2 * MARGIN)))
    fitted = ImageOps.contain(cutout, room, Image.LANCZOS)
    at = ((CANVAS[0] - fitted.width) // 2, (CANVAS[1] - fitted.height) // 2)
    shadow = Image.new("L", CANVAS, 0)
    shadow.paste(fitted.getchannel("A").point(lambda a: a * 0.22), (at[0] + 6, at[1] + 10))
    canvas.paste((205, 203, 198), (0, 0), shadow.filter(ImageFilter.GaussianBlur(14)))
    canvas.paste(fitted, at, fitted)
    return canvas


def anchors_for(cutout: Image.Image, source: dict) -> dict:
    anchors = anchors_of(np.asarray(cutout.getchannel("A")), source.get("kind") or kind_for(source["category"], source.get("style")))
    for name, point in (source.get("anchors") or {}).items():
        anchors["points"][name] = [round(float(point[0]), 4), round(float(point[1]), 4)]
    if source.get("sleeve"):
        anchors["sleeve"] = source["sleeve"]
    return anchors


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("photos_dir", type=Path)
    parser.add_argument("--only", default="")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--anchors-only", action="store_true", help="recalcula solo las anclas desde los recortes")
    args = parser.parse_args()

    root: Path = args.photos_dir
    sources = json.loads((root / "sources.json").read_text(encoding="utf-8"))
    only = {k for k in args.only.split(",") if k}
    session = None

    for kind in ("garments", "bodies"):
        for key, source in sources[kind].items():
            if only and key not in only:
                continue
            target = root / kind / f"{key}.jpg"
            cut_path = root / kind / f"{key}.cutout.webp"
            if args.anchors_only:
                if kind == "garments" and cut_path.exists():
                    anchors = anchors_for(Image.open(cut_path), source)
                    write_anchors(root / kind / f"{key}.anchors.json", anchors)
                    print(f"{kind}/{key} anclas")
                continue
            if target.exists() and not args.force:
                continue
            raw = raw_path(root, kind, source)
            image = cropped(ImageOps.exif_transpose(Image.open(raw)).convert("RGB"), source.get("crop"))
            if source.get("background") == "keep":
                store = ImageOps.fit(image, CANVAS, Image.LANCZOS)
                cut_path.unlink(missing_ok=True)
            else:
                if session is None and source.get("mask", "rembg") != "garment":
                    from rembg import new_session

                    session = new_session("isnet-general-use")
                cutout = cutout_of(image, source, session)
                store = on_canvas(cutout)
                if kind == "garments":
                    cutout.thumbnail((CUTOUT_MAX, CUTOUT_MAX), Image.LANCZOS)
                    cutout.save(cut_path, "WEBP", quality=88, method=6)
                    anchors = anchors_for(cutout, source)
                    write_anchors(root / kind / f"{key}.anchors.json", anchors)
            store.save(target, "JPEG", quality=88, optimize=True)
            thumb = ImageOps.contain(store, (THUMB_W, THUMB_W * 4 // 3), Image.LANCZOS)
            thumb.save(root / kind / f"{key}.w{THUMB_W}.webp", "WEBP", quality=82, method=6)
            print(f"{kind}/{key} <- {raw.name} ({source.get('mask', 'rembg')})")


if __name__ == "__main__":
    main()
