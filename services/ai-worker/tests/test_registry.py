import asyncio

import httpx
import pytest
import respx

from src.config import Settings
from src.contract import WorkerError
from src.providers import Credentials, GarmentInput, ProviderRegistry, TransferRequest, default_registry
from src.providers.legacy import FalCatVTONProvider, ReplicateProvider
from src.providers.mock import MockProvider

from .conftest import png


def req(*categories: str) -> TransferRequest:
    return TransferRequest(person=png(), garments=[GarmentInput(png(), c) for c in categories])  # type: ignore[arg-type]


def test_registry_builds_by_name():
    provider = default_registry().build(Credentials("mock"), Settings(mock_delay_seconds=0))
    assert isinstance(provider, MockProvider)


def test_registry_unknown_name_is_not_configured():
    with pytest.raises(WorkerError) as err:
        ProviderRegistry().build(Credentials("x"), Settings())
    assert err.value.code == "not-configured"


def test_hosted_providers_require_credentials():
    with pytest.raises(WorkerError):
        FalCatVTONProvider("")
    with pytest.raises(WorkerError):
        ReplicateProvider("", "")


def test_legacy_providers_accept_only_one_garment():
    with pytest.raises(WorkerError) as err:
        asyncio.run(FalCatVTONProvider("k").generate(req("top", "bottom")))
    assert err.value.code == "unsupported"


@respx.mock
def test_fal_adapter_maps_request_and_downloads_result():
    route = respx.post("https://fal.run/fal-ai/cat-vton").mock(
        return_value=httpx.Response(200, json={"image": {"url": "https://cdn.fal/result.png"}})
    )
    respx.get("https://cdn.fal/result.png").mock(return_value=httpx.Response(200, content=png()))
    result = asyncio.run(FalCatVTONProvider("k").generate(req("dress")))
    body = route.calls.last.request.content.decode()
    assert '"cloth_type":"overall"' in body.replace(" ", "")
    assert route.calls.last.request.headers["authorization"] == "Key k"
    assert result.startswith(b"\x89PNG")


@respx.mock
@pytest.mark.parametrize(("status", "code"), [(500, "provider-error"), (429, "rate-limited"), (401, "not-configured")])
def test_fal_http_errors_map_to_contract_codes(status, code):
    respx.post("https://fal.run/fal-ai/cat-vton").mock(return_value=httpx.Response(status))
    with pytest.raises(WorkerError) as err:
        asyncio.run(FalCatVTONProvider("k").generate(req("top")))
    assert err.value.code == code


@respx.mock
def test_fal_timeout_is_timeout():
    respx.post("https://fal.run/fal-ai/cat-vton").mock(side_effect=httpx.ReadTimeout("slow"))
    with pytest.raises(WorkerError) as err:
        asyncio.run(FalCatVTONProvider("k").generate(req("top")))
    assert err.value.code == "timeout"
    assert err.value.retryable


@respx.mock
def test_replicate_polls_until_success():
    respx.post("https://api.replicate.com/v1/predictions").mock(
        return_value=httpx.Response(201, json={"status": "starting", "urls": {"get": "https://api.replicate.com/p/1"}})
    )
    respx.get("https://api.replicate.com/p/1").mock(
        return_value=httpx.Response(200, json={"status": "succeeded", "output": "https://r.cdn/out.png", "urls": {}})
    )
    respx.get("https://r.cdn/out.png").mock(return_value=httpx.Response(200, content=png()))
    provider = ReplicateProvider("t", "owner/model:abc", poll_interval=0)
    assert asyncio.run(provider.generate(req("bottom"))).startswith(b"\x89PNG")
