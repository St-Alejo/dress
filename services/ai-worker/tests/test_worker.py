import asyncio
import io

from PIL import Image

from src.providers import GarmentInput, TransferRequest
from src.providers.mock import MockProvider

from .conftest import generate_form, png


def jpeg_with_exif() -> bytes:
    out = io.BytesIO()
    exif = Image.Exif()
    exif[0x0132] = "2026:01:01 10:00:00"  # DateTime
    Image.new("RGB", (100, 100), (10, 10, 10)).save(out, format="JPEG", exif=exif)
    return out.getvalue()


def test_health_lists_providers_and_contract(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["contractVersion"] == "1"
    assert {"mock", "hf-chain", "hf-fashn", "hf-leffa", "hf-idm"} <= set(body["providers"])


def test_generate_single_garment_returns_png(client):
    res = client.post("/v1/generate", **generate_form("top"))
    assert res.status_code == 200, res.text
    assert res.headers["content-type"] == "image/png"
    assert res.headers["x-engine"] == "mock"
    assert res.headers["x-request-id"] == "req-1"
    assert Image.open(io.BytesIO(res.content)).format == "PNG"


def test_generate_outfit_with_several_garments(client):
    res = client.post("/v1/generate", **generate_form("top", "bottom"))
    assert res.status_code == 200, res.text


def test_unsupported_category_is_422_with_contract_body(client):
    res = client.post("/v1/generate", **generate_form("footwear"))
    assert res.status_code == 422
    assert res.json() == {"code": "unsupported", "detail": "categoría no soportada: footwear", "retryable": False}


def test_empty_person_image_is_bad_input(client):
    res = client.post("/v1/generate", **generate_form("top", person=b""))
    assert res.status_code == 400
    assert res.json()["code"] == "bad-input"


def test_image_count_must_match_manifest(client):
    res = client.post("/v1/generate", **generate_form("top", "bottom", images=1))
    assert res.status_code == 400
    assert res.json()["code"] == "bad-input"


def test_manifest_rejects_body_measurements(client):
    res = client.post("/v1/generate", **generate_form("top", heightCm=170))
    assert res.status_code == 400
    assert res.json()["code"] == "bad-input"


def test_missing_multipart_field_uses_contract_shape(client):
    res = client.post("/v1/generate", files=[("person_image", ("p.png", png(), "image/png"))])
    assert res.status_code == 400
    assert set(res.json()) == {"code", "detail", "retryable"}


def test_provider_is_chosen_per_request(client):
    res = client.post("/v1/generate", headers={"X-AI-Provider": "fal-catvton"}, **generate_form("top"))
    assert res.status_code == 412
    assert res.json()["code"] == "not-configured"


def test_unknown_provider_is_not_configured(client):
    res = client.post("/v1/generate", headers={"X-AI-Provider": "nope"}, **generate_form("top"))
    assert res.status_code == 412


def test_token_is_required_when_configured(make_client):
    client = make_client(worker_token="s3cret")
    assert client.post("/v1/generate", **generate_form("top")).status_code == 401
    wrong = client.post("/v1/generate", headers={"X-Worker-Token": "nope"}, **generate_form("top"))
    assert wrong.status_code == 401
    ok = client.post("/v1/generate", headers={"X-Worker-Token": "s3cret"}, **generate_form("top"))
    assert ok.status_code == 200


def test_providers_test_endpoint(client):
    assert client.post("/v1/providers/test").json()["ok"] is True
    res = client.post("/v1/providers/test", headers={"X-AI-Provider": "fal-catvton"})
    assert res.status_code == 412
    assert res.json()["code"] == "not-configured"


def test_mock_output_has_no_exif():
    req = TransferRequest(person=jpeg_with_exif(), garments=[GarmentInput(png(), "top")])
    result = asyncio.run(MockProvider(0).generate(req))
    assert not Image.open(io.BytesIO(result)).getexif()
