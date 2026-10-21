import numpy as np
import pytest

from src.garment_prep.anchors import anchors_of, kind_for


def tshirt(long_sleeves: bool = False) -> np.ndarray:
    """Camiseta plana: torso 200x300 y mangas que salen en diagonal hacia fuera."""
    m = np.zeros((360, 400), np.uint8)
    m[20:340, 100:300] = 255  # torso
    m[30:150 if not long_sleeves else 330, 30:100] = 255  # manga derecha (izquierda de la imagen)
    m[30:150 if not long_sleeves else 330, 300:370] = 255
    if long_sleeves:  # hueco entre manga y torso bajo la axila
        m[120:330, 95:100] = 0
        m[120:330, 300:305] = 0
    m[20:40, 175:225] = 0  # escote
    return m


def pants() -> np.ndarray:
    m = np.zeros((400, 200), np.uint8)
    m[0:120, 30:170] = 255  # cadera
    m[120:400, 30:95] = 255  # pierna derecha
    m[120:400, 105:170] = 255  # pierna izquierda
    return m


def test_tshirt_anchors_follow_the_photo():
    a = anchors_of(tshirt(), "upper")
    p = a["points"]
    assert a["kind"] == "upper" and a["sleeve"] == "short"
    # Convención MediaPipe: el lado izquierdo de quien la viste está a la derecha de la imagen.
    assert p["leftShoulder"][0] > p["rightShoulder"][0]
    assert p["rightArmpit"][1] == pytest.approx(150 / 359, abs=0.03)
    assert p["rightShoulder"][0] == pytest.approx(100 / 399, abs=0.03)
    assert p["rightCuff"][0] < 0.12 and p["leftCuff"][0] > 0.88
    assert p["leftHem"][1] > 0.9
    assert p["neck"][1] < 0.15


def test_long_sleeves_are_detected():
    a = anchors_of(tshirt(long_sleeves=True), "upper")
    assert a["sleeve"] == "long"
    assert a["points"]["rightCuff"][1] > 0.8


def test_pants_have_crotch_knees_and_ankles():
    p = anchors_of(pants(), "lower")["points"]
    assert p["crotch"][1] == pytest.approx(120 / 399, abs=0.02)
    assert p["leftKnee"][0] > 0.5 > p["rightKnee"][0]
    assert p["leftAnkle"][1] > 0.95
    assert p["leftWaist"][0] > p["rightWaist"][0]


def test_skirt_has_hem_instead_of_legs():
    m = np.zeros((300, 300), np.uint8)
    for y in range(300):
        half = 40 + y // 3
        m[y, 150 - half : 150 + half] = 255
    p = anchors_of(m, "skirt")["points"]
    assert "leftKnee" not in p
    assert p["leftHem"][0] - p["rightHem"][0] > p["leftWaist"][0] - p["rightWaist"][0]


def test_box_kinds_and_empty_mask():
    m = np.zeros((50, 80), np.uint8)
    m[10:40, 20:60] = 255
    assert anchors_of(m, "footwear")["points"]["base"][1] == pytest.approx(39 / 49, abs=0.01)
    with pytest.raises(ValueError):
        anchors_of(np.zeros((5, 5)), "upper")


def test_kind_for_categories():
    assert kind_for("dress") == "upper"
    assert kind_for("bottom", "skirt") == "skirt"
    assert kind_for("bottom", "jeans") == "lower"
    assert kind_for("accessory") == "accessory"
