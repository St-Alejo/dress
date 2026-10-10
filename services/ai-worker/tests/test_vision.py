import asyncio
import json

import httpx
import pytest

from src.main import app, get_vision
from src.vision import MAX_PER_MINUTE, GroqVision, VisionUnavailable

from .conftest import png


def groq(handler, clock=None) -> GroqVision:
    kwargs = {"clock": clock} if clock else {}
    return GroqVision("gsk_test", "vision-model", httpx.MockTransport(handler), **kwargs)


def answer(payload: dict, seen: list | None = None):
    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(json.loads(request.content))
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(payload)}}]})

    return handler


GOOD = {"people": 1, "fullBody": True, "frontal": True, "lightingOk": True}


def test_usable_photo_passes_and_sends_one_small_image():
    seen: list = []
    result = asyncio.run(groq(answer(GOOD, seen)).inspect_photo(png(size=(2000, 3000))))
    assert result == {"ok": True, "reason": None}
    parts = seen[0]["messages"][0]["content"]
    assert [p["type"] for p in parts] == ["text", "image_url"]
    assert len(parts[1]["image_url"]["url"]) < 40_000  # reducida antes de enviar
    assert seen[0]["response_format"] == {"type": "json_object"}


@pytest.mark.parametrize(
    ("change", "reason"),
    [
        ({"people": 0}, "no-person"),
        ({"people": 2}, "multiple-people"),
        ({"fullBody": False}, "not-full-body"),
        ({"frontal": False}, "not-frontal"),
        ({"lightingOk": False}, "too-dark"),
    ],
)
def test_reports_the_first_concrete_problem(change, reason):
    result = asyncio.run(groq(answer({**GOOD, **change})).inspect_photo(png()))
    assert result == {"ok": False, "reason": reason}


def test_same_image_is_answered_from_cache():
    seen: list = []
    vision = groq(answer(GOOD, seen))
    asyncio.run(vision.inspect_photo(png()))
    asyncio.run(vision.inspect_photo(png()))
    assert len(seen) == 1


def test_stops_calling_when_the_minute_budget_is_spent():
    seen: list = []
    vision = groq(answer(GOOD, seen))
    for i in range(MAX_PER_MINUTE):
        asyncio.run(vision.inspect_photo(png(color=(i, 0, 0, 255))))
    with pytest.raises(VisionUnavailable):
        asyncio.run(vision.inspect_photo(png(color=(99, 0, 0, 255))))
    assert len(seen) == MAX_PER_MINUTE


def test_rate_limit_response_is_respected_until_retry_after():
    now = [0.0]
    calls: list = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return httpx.Response(429, headers={"retry-after": "30"})

    vision = groq(handler, clock=lambda: now[0])
    with pytest.raises(VisionUnavailable):
        asyncio.run(vision.inspect_photo(png()))
    now[0] = 10
    with pytest.raises(VisionUnavailable):
        asyncio.run(vision.inspect_photo(png()))
    assert len(calls) == 1  # no insiste mientras dura la espera


def test_without_key_it_is_unavailable_and_makes_no_request():
    with pytest.raises(VisionUnavailable):
        asyncio.run(GroqVision("", "m").inspect_photo(png()))


def test_garment_labels_keep_only_valid_values():
    raw = {"style": "jeans", "photoType": "model", "color": "#3B4F66", "name": "Jean pitillo oscuro", "extra": 1}
    assert asyncio.run(groq(answer(raw)).describe_garment(png())) == {
        "style": "jeans", "category": "bottom", "photoType": "model", "color": "#3b4f66", "name": "Jean pitillo oscuro",
    }  # fmt: skip
    odd = {"style": "tuxedo", "photoType": "studio", "color": "blue", "name": ""}
    assert asyncio.run(groq(answer(odd)).describe_garment(png())) == {}


def test_inspect_endpoint_never_blocks_when_vision_is_down(client):
    res = client.post("/v1/photo/inspect", files={"image": ("p.png", png(), "image/png")})
    assert res.status_code == 200
    assert res.json() == {"checked": False, "ok": True, "reason": None}


def test_inspect_endpoint_reports_the_problem(client):
    app.dependency_overrides[get_vision] = lambda: groq(answer({**GOOD, "fullBody": False}))
    res = client.post("/v1/photo/inspect", files={"image": ("p.png", png(), "image/png")})
    assert res.json() == {"checked": True, "ok": False, "reason": "not-full-body"}


def test_describe_endpoint_returns_suggestion(client):
    app.dependency_overrides[get_vision] = lambda: groq(answer({"style": "shirt", "photoType": "flat-lay"}))
    res = client.post("/v1/garment/describe", files={"image": ("g.png", png(), "image/png")})
    assert res.json() == {"checked": True, "suggestion": {"style": "shirt", "category": "top", "photoType": "flat-lay"}}
