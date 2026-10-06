"""
Adaptadores heredados de la primera versión (CatVTON en fal.ai e IDM-VTON en
Replicate). Solo prueban una prenda a la vez; se conservan como alternativas.
"""

from __future__ import annotations

import asyncio

import httpx

from ..contract import WorkerError
from .base import TransferRequest, TryOnProvider, to_data_uri


def map_http_error(provider: str, exc: Exception) -> WorkerError:
    """Traduce fallos de red/proveedor al código del contrato."""
    if isinstance(exc, httpx.TimeoutException):
        return WorkerError("timeout", f"{provider} no respondió a tiempo")
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        if status in (401, 403):
            return WorkerError("not-configured", f"{provider} rechazó la clave")
        if status == 429:
            return WorkerError("rate-limited", f"{provider} limitó la frecuencia")
    return WorkerError("provider-error", f"{provider} falló: {type(exc).__name__}")


class FalCatVTONProvider(TryOnProvider):
    name = "fal-catvton"
    max_garments = 1
    CLOTH_TYPE = {"top": "upper", "outerwear": "outer", "bottom": "lower", "dress": "overall"}

    def __init__(self, api_key: str, model: str = "fal-ai/cat-vton", timeout: float = 120.0) -> None:
        if not api_key:
            raise WorkerError("not-configured", "falta la clave de fal.ai")
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    async def _generate(self, req: TransferRequest) -> bytes:
        garment = req.garments[0]
        payload = {
            "human_image_url": to_data_uri(req.person),
            "garment_image_url": to_data_uri(garment.image),
            "cloth_type": self.CLOTH_TYPE[garment.category],
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                res = await client.post(
                    f"https://fal.run/{self.model}", json=payload, headers={"Authorization": f"Key {self.api_key}"}
                )
                res.raise_for_status()
                img = await client.get(res.json()["image"]["url"])
                img.raise_for_status()
                return img.content
            except (httpx.HTTPError, KeyError) as exc:
                raise map_http_error("fal.ai", exc) from exc


class ReplicateProvider(TryOnProvider):
    name = "replicate"
    max_garments = 1
    CATEGORY = {"top": "upper_body", "outerwear": "upper_body", "bottom": "lower_body", "dress": "dresses"}

    def __init__(self, api_token: str, version: str, timeout: float = 180.0, poll_interval: float = 2.0) -> None:
        if not api_token or not version:
            raise WorkerError("not-configured", "faltan la clave o la versión de Replicate")
        self.api_token = api_token
        self.version = version
        self.timeout = timeout
        self.poll_interval = poll_interval

    async def _generate(self, req: TransferRequest) -> bytes:
        garment = req.garments[0]
        headers = {"Authorization": f"Bearer {self.api_token}", "Prefer": "wait=60"}
        payload = {
            "version": self.version,
            "input": {
                "human_img": to_data_uri(req.person),
                "garm_img": to_data_uri(garment.image),
                "category": self.CATEGORY[garment.category],
                "garment_des": garment.name or garment.category,
            },
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                res = await client.post("https://api.replicate.com/v1/predictions", json=payload, headers=headers)
                res.raise_for_status()
                prediction = res.json()
                elapsed = 0.0
                while prediction["status"] not in ("succeeded", "failed", "canceled"):
                    if elapsed > self.timeout:
                        raise WorkerError("timeout", "Replicate excedió el tiempo máximo")
                    await asyncio.sleep(self.poll_interval)
                    elapsed += self.poll_interval
                    poll = await client.get(prediction["urls"]["get"], headers=headers)
                    poll.raise_for_status()
                    prediction = poll.json()
                if prediction["status"] != "succeeded":
                    raise WorkerError("provider-error", f"Replicate terminó en estado {prediction['status']}")
                output = prediction["output"]
                img = await client.get(output[0] if isinstance(output, list) else output)
                img.raise_for_status()
                return img.content
            except (httpx.HTTPError, KeyError) as exc:
                raise map_http_error("Replicate", exc) from exc
