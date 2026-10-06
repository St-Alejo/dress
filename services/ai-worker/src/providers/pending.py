from __future__ import annotations

from ..contract import WorkerError
from .base import Credentials, TransferRequest, TryOnProvider


class PendingProvider(TryOnProvider):
    """
    Proveedor registrado cuyo adaptador real aún no está implementado (FASHN y
    Gemini llegan en la fase de motores). Responde `not-configured` (412) para
    que la API caiga al modo similar sin abrir el circuit breaker.
    """

    def __init__(self, name: str, credentials: Credentials) -> None:
        self.name = name
        self.credentials = credentials

    def _refuse(self) -> WorkerError:
        if not self.credentials.api_key:
            return WorkerError("not-configured", f"falta la clave de {self.name}")
        return WorkerError("not-configured", f"el adaptador {self.name} todavía no está disponible")

    async def test(self) -> str:
        raise self._refuse()

    async def _generate(self, req: TransferRequest) -> bytes:
        raise self._refuse()
