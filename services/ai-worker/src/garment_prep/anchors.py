"""Anclas medidas de una prenda a partir de la máscara alfa de su recorte.

La cámara en vivo deforma el recorte con una malla de huesos; para eso necesita saber
dónde están, en ESTA foto, el cuello, los hombros, las axilas, los puños, el bajo, la
cintura, el tiro, las rodillas y los tobillos. Antes se usaban proporciones genéricas
por categoría, que fallan con mangas abiertas, prendas oversize o faldas.

Convención (la misma que MediaPipe y `overlay-geometry.ts`): la prenda se mira de
frente, así que el lado IZQUIERDO de quien la viste queda a la DERECHA de la imagen.
Todas las coordenadas van normalizadas a [0, 1] respecto del recorte.
"""
from __future__ import annotations

from typing import Literal

import numpy as np

Kind = Literal["upper", "lower", "skirt", "footwear", "accessory"]
Point = tuple[float, float]

ALPHA_ON = 24
# Una fila es parte de la manga mientras el tramo central sea este tanto más ancho que el torso.
SLEEVE_WIDENING = 1.12


def kind_for(category: str, style: str | None = None) -> Kind:
    if category in ("top", "outerwear", "dress"):
        return "upper"
    if category == "bottom":
        return "skirt" if style == "skirt" else "lower"
    if category == "footwear":
        return "footwear"
    return "accessory"


def _runs(row: np.ndarray) -> list[tuple[int, int]]:
    """Tramos [inicio, fin] de píxeles opacos de una fila."""
    padded = np.concatenate(([False], row, [False]))
    edges = np.flatnonzero(padded[1:] != padded[:-1])
    return [(int(a), int(b) - 1) for a, b in zip(edges[::2], edges[1::2])]


def _run_at(row: np.ndarray, x: int) -> tuple[int, int] | None:
    """Tramo que contiene la columna x (o el más cercano si x cae en un hueco)."""
    runs = _runs(row)
    if not runs:
        return None
    for a, b in runs:
        if a <= x <= b:
            return a, b
    return min(runs, key=lambda r: min(abs(r[0] - x), abs(r[1] - x)))


def _norm(p: tuple[float, float], w: int, h: int) -> Point:
    return (round(min(max(p[0] / max(w - 1, 1), 0.0), 1.0), 4), round(min(max(p[1] / max(h - 1, 1), 0.0), 1.0), 4))


def _upper(mask: np.ndarray) -> tuple[dict[str, Point], str]:
    h, w = mask.shape
    ys = np.flatnonzero(mask.any(axis=1))
    top, bottom = int(ys[0]), int(ys[-1])
    span = bottom - top + 1
    cx = int(round(np.flatnonzero(mask.any(axis=0)).mean()))

    widths = np.zeros(h)
    runs: dict[int, tuple[int, int]] = {}
    for y in range(top, bottom + 1):
        r = _run_at(mask[y], cx)
        if r:
            runs[y] = r
            widths[y] = r[1] - r[0] + 1

    # Torso: mediana del ancho del tramo central en la franja de abajo (sin mangas).
    hem_band = range(top + int(span * 0.62), top + int(span * 0.9))
    torso_w = float(np.median([widths[y] for y in hem_band if widths[y] > 0] or [widths.max()]))

    # Axila: última fila (desde arriba) en la que la manga todavía ensancha el tramo central.
    upper_rows = [y for y in range(top, top + int(span * 0.7)) if widths[y] > torso_w * SLEEVE_WIDENING]
    if upper_rows and upper_rows[-1] > top + span * 0.12:
        armpit_y = upper_rows[-1] + 1
        sleeve = "visible"
    else:
        # Manga pegada al cuerpo (o sin manga): proporción típica.
        armpit_y = top + int(span * 0.3)
        sleeve = "attached"
    armpit_y = min(armpit_y, bottom)
    a, b = runs.get(armpit_y, (cx - torso_w / 2, cx + torso_w / 2))

    def top_at(x: float) -> float:
        col = np.flatnonzero(mask[:, int(round(min(max(x, 0), w - 1)))])
        return float(col[0]) if col.size else float(top)

    # Hombro: arriba del borde del torso a la altura de la axila, un poco hacia dentro.
    inset = (b - a) * 0.04
    right_sh = (a + inset, top_at(a + inset))  # derecha de quien la viste = izquierda de la imagen
    left_sh = (b - inset, top_at(b - inset))
    neck = (float(cx), float(top))
    for y in range(top, top + int(span * 0.2)):
        r = _run_at(mask[y], cx)
        if r and r[0] <= cx <= r[1]:
            neck = (float(cx), float(y))
            break

    hem_y = top + int(span * 0.97)
    ha, hb = runs.get(hem_y, (a, b))

    # Puño: el píxel de la manga más lejano a su hombro (a cada lado del torso).
    yy, xx = np.nonzero(mask)

    def cuff(shoulder: tuple[float, float], side: int) -> tuple[float, float]:
        torso_edge = a if side < 0 else b
        sel = (xx < torso_edge - 2) if side < 0 else (xx > torso_edge + 2)
        sel &= yy < top + span * 0.95
        if not sel.any():
            return (shoulder[0], float(armpit_y))
        d = (xx[sel] - shoulder[0]) ** 2 + (yy[sel] - shoulder[1]) ** 2
        i = int(np.argmax(d))
        return (float(xx[sel][i]), float(yy[sel][i]))

    right_cuff = cuff(right_sh, -1)
    left_cuff = cuff(left_sh, +1)
    # Largo de manga relativo al largo del cuerpo (cuello→bajo): ~0.3 corta, ~1 larga.
    reach = np.hypot(right_cuff[0] - right_sh[0], right_cuff[1] - right_sh[1]) / max(hem_y - neck[1], 1)
    sleeve_kind = "none" if reach < 0.1 else ("short" if reach < 0.62 else "long")
    if sleeve == "attached" and sleeve_kind != "none":
        sleeve_kind = "long"

    points = {
        "neck": neck,
        "rightShoulder": right_sh,
        "leftShoulder": left_sh,
        "rightArmpit": (float(a), float(armpit_y)),
        "leftArmpit": (float(b), float(armpit_y)),
        "rightCuff": right_cuff,
        "leftCuff": left_cuff,
        "rightHem": (float(ha), float(hem_y)),
        "leftHem": (float(hb), float(hem_y)),
    }
    return {k: _norm(v, w, h) for k, v in points.items()}, sleeve_kind


def _lower(mask: np.ndarray, skirt: bool) -> dict[str, Point]:
    h, w = mask.shape
    ys = np.flatnonzero(mask.any(axis=1))
    top, bottom = int(ys[0]), int(ys[-1])
    span = bottom - top + 1
    cx = int(round(np.flatnonzero(mask.any(axis=0)).mean()))

    waist_y = top + int(span * 0.02)
    wa, wb = _run_at(mask[waist_y], cx) or (0, w - 1)
    points: dict[str, tuple[float, float]] = {
        "rightWaist": (float(wa), float(waist_y)),
        "leftWaist": (float(wb), float(waist_y)),
    }

    # Tiro: primera fila (desde la cintura) con hueco entre las piernas cerca del centro.
    crotch_y = None
    if not skirt:
        for y in range(top + int(span * 0.12), bottom):
            runs = _runs(mask[y])
            if len(runs) >= 2 and not any(a <= cx <= b for a, b in runs):
                crotch_y = y
                break
    if crotch_y is None:
        hem_y = top + int(span * 0.98)
        ha, hb = _run_at(mask[hem_y], cx) or (wa, wb)
        points |= {"rightHem": (float(ha), float(hem_y)), "leftHem": (float(hb), float(hem_y)), "crotch": (float(cx), float(top + span * 0.3))}
        return {k: _norm(v, w, h) for k, v in points.items()}

    points["crotch"] = (float(cx), float(crotch_y))

    def leg_center(y: int, side: int) -> tuple[float, float] | None:
        runs = [r for r in _runs(mask[y]) if (r[1] < cx if side < 0 else r[0] > cx)]
        if not runs:
            return None
        a, b = max(runs, key=lambda r: r[1] - r[0])
        return ((a + b) / 2, float(y))

    def leg_bottom(side: int) -> int:
        cols = np.arange(w) < cx if side < 0 else np.arange(w) > cx
        rows = np.flatnonzero(mask[:, cols].any(axis=1))
        return int(rows[-1]) if rows.size else bottom

    for side, name in ((-1, "right"), (1, "left")):
        end = leg_bottom(side)
        knee_y = int(crotch_y + (end - crotch_y) * 0.5)
        ankle_y = int(end - (end - crotch_y) * 0.03)
        knee = leg_center(knee_y, side)
        ankle = leg_center(ankle_y, side)
        if knee:
            points[f"{name}Knee"] = knee
        if ankle:
            points[f"{name}Ankle"] = ankle
    return {k: _norm(v, w, h) for k, v in points.items()}


def _box(mask: np.ndarray) -> dict[str, Point]:
    h, w = mask.shape
    ys = np.flatnonzero(mask.any(axis=1))
    xs = np.flatnonzero(mask.any(axis=0))
    return {
        "topLeft": _norm((xs[0], ys[0]), w, h),
        "bottomRight": _norm((xs[-1], ys[-1]), w, h),
        # Punto de apoyo: centro de la base (calzado) o centro de la parte de arriba (accesorio).
        "base": _norm(((xs[0] + xs[-1]) / 2, ys[-1]), w, h),
        "top": _norm(((xs[0] + xs[-1]) / 2, ys[0]), w, h),
    }


def anchors_of(alpha: np.ndarray, kind: Kind) -> dict:
    """Anclas de un recorte. `alpha` es el canal alfa (H×W, 0–255) del recorte ya ajustado a su caja."""
    mask = np.asarray(alpha) > ALPHA_ON
    if not mask.any():
        raise ValueError("el recorte está vacío")
    h, w = mask.shape
    out: dict = {"version": 1, "kind": kind, "aspect": round(w / h, 4)}
    if kind == "upper":
        out["points"], out["sleeve"] = _upper(mask)
    elif kind in ("lower", "skirt"):
        out["points"] = _lower(mask, skirt=kind == "skirt")
    else:
        out["points"] = _box(mask)
    return out
