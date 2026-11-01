import asyncio
import json
from types import SimpleNamespace

import anthropic
import httpx
import httpx2
import pytest

from src.config import Settings
from src.main import app, get_vision
from src.vision import (
    MAX_PER_MINUTE, PHOTO_SCHEMA, STYLES, ClaudeVision, FallbackVision, GroqVision, VisionUnavailable,
)  # fmt: skip

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


# --- Claude (opcional) y cadena Claude → Groq ---


class FakeMessages:
    """Sustituye a `client.messages` del SDK de Anthropic: devuelve `reply` o lanza `error`."""

    def __init__(self, reply: dict | None = None, error: Exception | None = None, stop_reason: str = "end_turn") -> None:
        self.reply, self.error, self.stop_reason = reply, error, stop_reason
        self.seen: list[dict] = []

    async def create(self, **kwargs):
        self.seen.append(kwargs)
        if self.error:
            raise self.error
        return SimpleNamespace(
            stop_reason=self.stop_reason,
            content=[SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text=json.dumps(self.reply))],
        )


def claude(messages: FakeMessages, clock=None) -> ClaudeVision:
    kwargs = {"clock": clock} if clock else {}
    return ClaudeVision("sk-ant-test", "claude-haiku-5-5", SimpleNamespace(messages=messages), **kwargs)


def api_error(cls, status: int, headers: dict | None = None):
    response = httpx2.Response(status, headers=headers or {}, request=httpx2.Request("POST", "https://api.anthropic.com/v1/messages"))
    return cls("error", response=response, body=None)


def test_claude_sends_one_small_image_with_a_json_schema():
    fake = FakeMessages(GOOD)
    assert asyncio.run(claude(fake).inspect_photo(png(size=(2000, 3000)))) == {"ok": True, "reason": None}
    call = fake.seen[0]
    assert call["model"] == "claude-haiku-5-5"
    image, text = call["messages"][0]["content"]
    assert image["type"] == "image" and image["source"]["media_type"] == "image/jpeg"
    assert len(image["source"]["data"]) < 40_000  # reducida antes de enviar
    assert "never comment on the person's body" in text["text"]
    assert call["output_config"]["format"]["schema"] == PHOTO_SCHEMA


def test_claude_garment_labels_go_through_the_same_validation():
    fake = FakeMessages({"style": "coat", "photoType": "flat-lay", "color": "#AA00FF", "name": "Abrigo largo"})
    assert asyncio.run(claude(fake).describe_garment(png())) == {
        "style": "coat", "category": "outerwear", "photoType": "flat-lay", "color": "#aa00ff", "name": "Abrigo largo",
    }  # fmt: skip
    assert fake.seen[0]["output_config"]["format"]["schema"]["properties"]["style"]["enum"] == list(STYLES)


@pytest.mark.parametrize(
    "error",
    [
        api_error(anthropic.BadRequestError, 400),  # p. ej. sin saldo
        api_error(anthropic.AuthenticationError, 401),
        api_error(anthropic.InternalServerError, 529),
        anthropic.APIConnectionError(request=httpx2.Request("POST", "https://api.anthropic.com/v1/messages")),
    ],
)
def test_claude_failures_become_unavailable(error):
    with pytest.raises(VisionUnavailable):
        asyncio.run(claude(FakeMessages(error=error)).inspect_photo(png()))


def test_claude_refusal_is_unavailable_not_a_verdict():
    with pytest.raises(VisionUnavailable):
        asyncio.run(claude(FakeMessages(GOOD, stop_reason="refusal")).inspect_photo(png()))


def test_claude_rate_limit_is_respected_until_retry_after():
    now = [0.0]
    fake = FakeMessages(error=api_error(anthropic.RateLimitError, 429, {"retry-after": "20"}))
    vision = claude(fake, clock=lambda: now[0])
    with pytest.raises(VisionUnavailable):
        asyncio.run(vision.inspect_photo(png()))
    now[0] = 5
    with pytest.raises(VisionUnavailable):
        asyncio.run(vision.inspect_photo(png()))
    assert len(fake.seen) == 1


def test_claude_without_key_is_unavailable():
    vision = ClaudeVision("", "claude-haiku-5-5")
    assert not vision.configured
    with pytest.raises(VisionUnavailable):
        asyncio.run(vision.inspect_photo(png()))


def test_chain_uses_claude_first_and_skips_groq():
    groq_calls: list = []
    chain = FallbackVision([claude(FakeMessages({**GOOD, "frontal": False})), groq(answer(GOOD, groq_calls))])
    assert asyncio.run(chain.inspect_photo(png())) == {"ok": False, "reason": "not-frontal"}
    assert groq_calls == []


def test_chain_falls_back_to_groq_when_claude_fails():
    groq_calls: list = []
    chain = FallbackVision([claude(FakeMessages(error=api_error(anthropic.BadRequestError, 400))), groq(answer(GOOD, groq_calls))])
    assert asyncio.run(chain.inspect_photo(png())) == {"ok": True, "reason": None}
    assert len(groq_calls) == 1


def test_chain_with_nothing_configured_is_unavailable():
    chain = FallbackVision([ClaudeVision("", "m"), GroqVision("", "m")])
    assert not chain.configured
    with pytest.raises(VisionUnavailable):
        asyncio.run(chain.inspect_photo(png()))


@pytest.mark.parametrize(("provider", "expected"), [("groq", GroqVision), ("claude", FallbackVision), (" Claude ", FallbackVision)])
def test_vision_provider_setting_picks_the_client(provider, expected):
    settings = Settings(vision_provider=provider, groq_api_key="g", anthropic_api_key="a")
    assert isinstance(get_vision(settings), expected)
