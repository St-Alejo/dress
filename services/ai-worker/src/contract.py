"""
Contrato v1 con la API (fuente de verdad: contracts/ai-worker/v1/*.schema.json).

Un solo tipo de excepción (`WorkerError`) y un solo manejador convierten cualquier
fallo en `{code, detail, retryable}` con el status HTTP de la tabla compartida
(packages/shared-types/src/worker-contract.ts). Así la API nunca tiene que adivinar
qué significa un 422 o un 502.
"""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

CONTRACT_VERSION = "1"

ErrorCode = Literal[
    "bad-input",
    "unsupported",
    "unauthorized",
    "not-configured",
    "rate-limited",
    "content-policy",
    "provider-error",
    "timeout",
]

ERROR_STATUS: dict[str, int] = {
    "bad-input": 400,
    "unauthorized": 401,
    "not-configured": 412,
    "unsupported": 422,
    "rate-limited": 429,
    "content-policy": 451,
    "provider-error": 502,
    "timeout": 504,
}
RETRYABLE: frozenset[str] = frozenset({"rate-limited", "provider-error", "timeout"})

Category = Literal["top", "bottom", "dress", "outerwear", "footwear", "accessory"]


class WorkerError(Exception):
    """Fallo con código del contrato. El detalle nunca incluye claves ni datos de la imagen."""

    def __init__(self, code: ErrorCode, detail: str = "") -> None:
        super().__init__(detail or code)
        self.code = code
        self.detail = detail or code

    @property
    def status(self) -> int:
        return ERROR_STATUS[self.code]

    @property
    def retryable(self) -> bool:
        return self.code in RETRYABLE


class ManifestGarment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    index: Annotated[int, Field(ge=0, le=3)]
    category: Category
    name: Annotated[str, Field(min_length=1, max_length=120)]
    color: Annotated[str, Field(max_length=40)]
    fit: Annotated[str, Field(max_length=400)]


class Manifest(BaseModel):
    """`extra="forbid"`: si alguien intenta colar estatura o peso, se rechaza."""

    model_config = ConfigDict(extra="forbid")

    contractVersion: Literal["1"]
    requestId: Annotated[str, Field(min_length=1, max_length=64)]
    garments: Annotated[list[ManifestGarment], Field(min_length=1, max_length=4)]
    bodyBrief: Annotated[str, Field(max_length=120)]


async def worker_error_handler(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, WorkerError)
    return JSONResponse(
        status_code=exc.status,
        content={"code": exc.code, "detail": exc.detail[:300], "retryable": exc.retryable},
    )
