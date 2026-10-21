"""Máscara de UNA prenda dentro de una foto, con un segmentador de ropa gratuito.

Sirve para dos casos del catálogo:
  - la prenda está puesta en una persona: se queda solo la prenda (sin piel, pelo ni zapatos);
  - la prenda cuelga de una percha o la sostiene una mano: se quitan percha, mano y barra.

Modelo: `mattmdjaga/segformer_b2_clothes` (SegFormer entrenado en ATR, licencia MIT), en CPU.
Solo lo usan los scripts de catálogo; el worker en producción no lo carga.
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np
from PIL import Image, ImageFilter

MODEL_ID = "mattmdjaga/segformer_b2_clothes"

# Etiquetas del modelo (config.id2label).
LABELS = {
    "upper": 4, "skirt": 5, "pants": 6, "dress": 7, "belt": 8,
    "left-shoe": 9, "right-shoe": 10, "bag": 16, "scarf": 17, "hat": 1,
}

# Qué clases forman la prenda según su categoría/estilo del catálogo.
CLASSES_FOR = {
    "top": ["upper"],
    "outerwear": ["upper"],
    "dress": ["dress", "upper", "skirt"],
    "bottom": ["pants", "belt"],
    # El modelo duda entre falda, pantalón y vestido en faldas cortas o rectas: se aceptan las tres.
    "skirt": ["skirt", "pants", "dress"],
    "footwear": ["left-shoe", "right-shoe"],
    "scarf": ["scarf"],
    "cap": ["hat"],
    "bag": ["bag"],
}


@lru_cache(maxsize=1)
def _model():
    from transformers import AutoModelForSemanticSegmentation, SegformerImageProcessor

    return SegformerImageProcessor.from_pretrained(MODEL_ID), AutoModelForSemanticSegmentation.from_pretrained(MODEL_ID).eval()


def labels_of(image: Image.Image) -> np.ndarray:
    """Mapa de etiquetas H×W a la resolución de la imagen."""
    import torch

    processor, model = _model()
    with torch.no_grad():
        logits = model(**processor(images=image, return_tensors="pt")).logits
    up = torch.nn.functional.interpolate(logits, size=image.size[::-1], mode="bilinear", align_corners=False)
    return up.argmax(dim=1)[0].numpy().astype(np.uint8)


def garment_mask(image: Image.Image, classes: list[str]) -> Image.Image:
    """Máscara 'L' (0/255) de las clases pedidas, con huecos pequeños cerrados y borde suave."""
    labels = labels_of(image)
    mask = np.isin(labels, [LABELS[c] for c in classes])
    if not mask.any():
        raise ValueError(f"el segmentador no encontró {classes} en la foto")
    from scipy.ndimage import binary_fill_holes

    img = Image.fromarray((mask * 255).astype(np.uint8), "L")
    # Cierre morfológico (dilatar y erosionar) para tapar agujeros de botones o estampados.
    img = img.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    # Huecos cerrados por completo (una mano o una pierna por delante): son tela tapada.
    img = Image.fromarray((binary_fill_holes(np.asarray(img) > 127) * 255).astype(np.uint8), "L")
    return img.filter(ImageFilter.GaussianBlur(0.8))


SKIN_AND_HAIR = [2, 11, 12, 13, 14, 15]  # pelo, cara, piernas, brazos
CLOTHING = [4, 5, 6, 7, 8, 16, 17]  # cualquier prenda o complemento


def without_hands_and_rails(image: Image.Image, alpha: Image.Image) -> Image.Image:
    """Limpia el recorte de una prenda colgada: quita manos/brazos (segmentador) y barras,
    ganchos y perchas finas (apertura morfológica), conservando el borde fino de rembg."""
    labels = labels_of(image)
    a = np.asarray(alpha).astype(np.float32)
    # Si el segmentador reconoce la prenda (lo normal en una percha), todo lo que no sea ropa
    # (barra, gancho, pared) se descarta. En una prenda plana vista desde arriba a veces no la
    # reconoce: entonces se confía solo en rembg.
    cloth = np.isin(labels, CLOTHING)
    if cloth.sum() >= 0.5 * (a > 24).sum():
        near = Image.fromarray((cloth * 255).astype(np.uint8), "L").filter(ImageFilter.MaxFilter(15))
        a *= np.asarray(near) / 255.0
    skin = Image.fromarray((np.isin(labels, SKIN_AND_HAIR) * 255).astype(np.uint8), "L").filter(ImageFilter.MaxFilter(9))
    a *= 1 - np.asarray(skin) / 255.0
    cleaned = Image.fromarray(a.astype(np.uint8), "L")
    k = max(5, int(min(image.size) * 0.018) | 1)  # impar, ~2 % del lado corto
    keep = cleaned.point(lambda v: 255 if v > 24 else 0).filter(ImageFilter.MinFilter(k)).filter(ImageFilter.MaxFilter(k + 4))
    return Image.fromarray((a * (np.asarray(keep) / 255.0)).astype(np.uint8), "L")


def classes_for(category: str, style: str | None) -> list[str]:
    if style in CLASSES_FOR and category in ("bottom", "accessory"):
        return CLASSES_FOR[style]
    return CLASSES_FOR.get(category, ["upper"])
