import asyncio
import io

import httpx
import pytest
import respx
from fastapi.testclient import TestClient
from PIL import Image

from src.config import Settings, build_engine
from src.engines import EngineError, FalCatVTONEngine, MockEngine, ReplicateEngine, TransferRequest
from src.main import app, get_engine


def png(color=(200, 50, 50, 255), size=(300, 400)) -> bytes:
    out = io.BytesIO()
    Image.new("RGBA", size, color).save(out, format="PNG")
    return out.getvalue()


def jpeg_with_exif() -> bytes:
    out = io.BytesIO()
    exif = Image.Exif()
    exif[0x0132] = "2026:01:01 10:00:00"  # DateTime
    Image.new("RGB", (100, 100), (10, 10, 10)).save(out, format="JPEG", exif=exif)
    return out.getvalue()


@pytest.fixture
def client():
    app.dependency_overrides[get_engine] = lambda: MockEngine(0)
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_health(client):
    assert client.get("/health").json()["status"] == "ok"


def test_generate_returns_png(client):
    res = client.post(
        "/generate",
        files={"person_image": ("p.png", png(), "image/png"), "garment_image": ("g.png", png((0, 0, 255, 255)), "image/png")},
        data={"category": "top"},
    )
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/png"
    assert res.headers["x-engine"] == "mock"
    assert Image.open(io.BytesIO(res.content)).format == "PNG"


def test_unsupported_category_is_422(client):
    res = client.post(
        "/generate",
        files={"person_image": ("p.png", png(), "image/png"), "garment_image": ("g.png", png(), "image/png")},
        data={"category": "footwear"},
    )
    assert res.status_code == 422


def test_empty_image_is_422(client):
    res = client.post(
        "/generate",
        files={"person_image": ("p.png", b"", "image/png"), "garment_image": ("g.png", png(), "image/png")},
        data={"category": "top"},
    )
    assert res.status_code == 422


def test_mock_output_has_no_exif():
    result = asyncio.run(MockEngine(0).generate(TransferRequest(jpeg_with_exif(), png(), "top")))
    assert not Image.open(io.BytesIO(result)).getexif()


def test_factory_defaults_to_mock():
    assert build_engine(Settings(tryon_engine="mock")).name == "mock"


def test_hosted_engines_require_credentials():
    with pytest.raises(ValueError):
        FalCatVTONEngine("")
    with pytest.raises(ValueError):
        ReplicateEngine("", "")


@respx.mock
def test_fal_adapter_maps_request_and_downloads_result():
    route = respx.post("https://fal.run/fal-ai/cat-vton").mock(
        return_value=httpx.Response(200, json={"image": {"url": "https://cdn.fal/result.png"}})
    )
    respx.get("https://cdn.fal/result.png").mock(return_value=httpx.Response(200, content=png()))
    result = asyncio.run(FalCatVTONEngine("k").generate(TransferRequest(png(), png(), "dress")))
    body = route.calls.last.request.content.decode()
    assert '"cloth_type":"overall"' in body.replace(" ", "")
    assert route.calls.last.request.headers["authorization"] == "Key k"
    assert result.startswith(b"\x89PNG")


@respx.mock
def test_fal_errors_become_engine_error():
    respx.post("https://fal.run/fal-ai/cat-vton").mock(return_value=httpx.Response(500))
    with pytest.raises(EngineError):
        asyncio.run(FalCatVTONEngine("k").generate(TransferRequest(png(), png(), "top")))


@respx.mock
def test_replicate_polls_until_success():
    respx.post("https://api.replicate.com/v1/predictions").mock(
        return_value=httpx.Response(201, json={"status": "starting", "urls": {"get": "https://api.replicate.com/p/1"}})
    )
    respx.get("https://api.replicate.com/p/1").mock(
        return_value=httpx.Response(200, json={"status": "succeeded", "output": "https://r.cdn/out.png", "urls": {}})
    )
    respx.get("https://r.cdn/out.png").mock(return_value=httpx.Response(200, content=png()))
    engine = ReplicateEngine("t", "owner/model:abc", poll_interval=0)
    assert asyncio.run(engine.generate(TransferRequest(png(), png(), "bottom"))).startswith(b"\x89PNG")
