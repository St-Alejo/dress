import io
import json

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from src.config import Settings
from src.main import app, get_settings


def png(color=(200, 50, 50, 255), size=(300, 400)) -> bytes:
    out = io.BytesIO()
    Image.new("RGBA", size, color).save(out, format="PNG")
    return out.getvalue()


def manifest(*categories: str, **extra) -> str:
    body = {
        "contractVersion": "1",
        "requestId": "req-1",
        "garments": [
            {"index": i, "category": c, "name": f"prenda {i}", "color": "", "fit": "regular fit"}
            for i, c in enumerate(categories)
        ],
        "bodyBrief": "person as shown in the photo",
        **extra,
    }
    return json.dumps(body)


def generate_form(*categories: str, person: bytes | None = None, images: int | None = None, **extra):
    n = len(categories) if images is None else images
    files = [("person_image", ("p.png", person if person is not None else png(), "image/png"))]
    files += [("garment_images", (f"g{i}.png", png((0, 0, 255, 255)), "image/png")) for i in range(n)]
    return {"files": files, "data": {"manifest": manifest(*categories, **extra)}}


@pytest.fixture
def make_client():
    def _make(**settings):
        app.dependency_overrides[get_settings] = lambda: Settings(mock_delay_seconds=0, **settings)
        return TestClient(app)

    yield _make
    app.dependency_overrides.clear()


@pytest.fixture
def client(make_client):
    return make_client()
