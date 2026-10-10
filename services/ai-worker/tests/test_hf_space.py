import asyncio
import io

import pytest
from PIL import Image

from src.contract import WorkerError
from src.providers import GarmentInput, TransferRequest
from src.providers.hf_space import SPACES, HfSpaceProvider, chain, classify

from .conftest import png


class FakeClient:
    """Sustituye a gradio_client.Client: guarda la llamada y devuelve un archivo en el directorio temporal."""

    def __init__(self, download_dir: str, fail: Exception | None = None, shape: str = "path") -> None:
        self.download_dir, self.fail, self.shape = download_dir, fail, shape
        self.calls: list[dict] = []

    def predict(self, api_name: str, **kwargs):
        self.calls.append({"api_name": api_name, **kwargs})
        if self.fail:
            raise self.fail
        path = f"{self.download_dir}/out.webp"
        Image.new("RGB", (60, 90), (1, 2, 3)).save(path, "WEBP")
        return {"path": path} if self.shape == "dict" else (path, None) if self.shape == "tuple" else path


def factory(clients: list[FakeClient], fail_for: dict[str, Exception] | None = None, shape: str = "path"):
    def make(space: str, token: str | None, download_dir: str) -> FakeClient:
        client = FakeClient(download_dir, (fail_for or {}).get(space), shape)
        client.space, client.token = space, token
        clients.append(client)
        return client

    return make


def request(category: str = "top", photo_type: str = "flat-lay") -> TransferRequest:
    garment = GarmentInput(png(), category, name="Camiseta", color="orange", photo_type=photo_type)
    return TransferRequest(person=png(size=(200, 300)), garments=[garment])


def test_fashn_maps_category_and_photo_type_and_returns_png():
    clients: list[FakeClient] = []
    provider = HfSpaceProvider(SPACES["hf-fashn"], "hf_x", factory(clients))
    result = asyncio.run(provider.generate(request("dress", "model")))
    assert Image.open(io.BytesIO(result)).format == "PNG"
    call = clients[0].calls[0]
    assert (clients[0].space, clients[0].token) == ("fashn-ai/fashn-vton-1.5", "hf_x")
    assert call["api_name"] == "/try_on"
    assert (call["category"], call["garment_photo_type"]) == ("one-pieces", "model")


@pytest.mark.parametrize("shape", ["dict", "tuple"])
def test_accepts_the_result_shapes_of_other_spaces(shape):
    provider = HfSpaceProvider(SPACES["hf-leffa"], None, factory([], shape=shape))
    assert asyncio.run(provider.generate(request("bottom")))


def test_small_photos_are_enlarged_before_sending():
    seen: list[tuple[int, int]] = []

    def make(space, token, download_dir):
        client = FakeClient(download_dir)
        original = client.predict

        def predict(api_name, **kwargs):
            seen.append(Image.open(kwargs["person_image"]["path"]).size)
            return original(api_name, **kwargs)

        client.predict = predict
        return client

    asyncio.run(HfSpaceProvider(SPACES["hf-fashn"], None, make).generate(request()))
    assert seen == [(864, 1296)]


def test_idm_only_supports_upper_body():
    provider = HfSpaceProvider(SPACES["hf-idm"], None, factory([]))
    with pytest.raises(WorkerError) as err:
        asyncio.run(provider.generate(request("bottom")))
    assert err.value.code == "unsupported"


@pytest.mark.parametrize(
    ("message", "code"),
    [
        ("You have exceeded your GPU quota (60s requested vs. 0s left)", "rate-limited"),
        ("You have exceeded your ZeroGPU runs limit. Authenticate with a Hugging Face token", "rate-limited"),
        ("The read operation timed out", "timeout"),
        ("401 Client Error: Unauthorized", "not-configured"),
        ("something else broke", "provider-error"),
    ],
)
def test_space_failures_become_contract_codes(message, code):
    error = classify(RuntimeError(message))
    assert error.code == code
    assert message not in error.detail


def test_chain_falls_back_when_an_engine_is_down():
    clients: list[FakeClient] = []
    down = {"fashn-ai/fashn-vton-1.5": RuntimeError("Space is paused")}
    provider = chain("hf_x", factory(clients, down))
    assert asyncio.run(provider.generate(request("bottom")))
    assert [c.space for c in clients] == ["fashn-ai/fashn-vton-1.5", "franciszzj/Leffa"]
    assert provider.last_used == "hf-leffa"


def test_chain_stops_at_once_when_the_gpu_quota_is_spent():
    clients: list[FakeClient] = []
    quota = {"fashn-ai/fashn-vton-1.5": RuntimeError("You have exceeded your ZeroGPU runs limit")}
    with pytest.raises(WorkerError) as err:
        asyncio.run(chain(None, factory(clients, quota)).generate(request("bottom")))
    assert err.value.code == "rate-limited"
    assert [c.space for c in clients] == ["fashn-ai/fashn-vton-1.5"]  # la cuota es compartida: no se insiste


def test_chain_does_not_retry_on_bad_input():
    clients: list[FakeClient] = []
    provider = chain(None, factory(clients))
    broken = TransferRequest(person=b"not an image", garments=[GarmentInput(png(), "top")])
    with pytest.raises(WorkerError) as err:
        asyncio.run(provider.generate(broken))
    assert err.value.code == "bad-input"
    assert clients == []


def test_chain_reports_the_last_error_when_every_engine_fails():
    spaces = {s.space: RuntimeError("boom") for s in SPACES.values()}
    with pytest.raises(WorkerError) as err:
        asyncio.run(chain(None, factory([], spaces)).generate(request("top")))
    assert err.value.code == "provider-error"
