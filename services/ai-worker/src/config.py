from typing import Literal

from pydantic_settings import BaseSettings

from .engines import FalCatVTONEngine, GarmentTransferEngine, MockEngine, ReplicateEngine


class Settings(BaseSettings):
    tryon_engine: Literal["mock", "fal", "replicate"] = "mock"
    mock_delay_seconds: float = 4.0
    fal_key: str = ""
    fal_model: str = "fal-ai/cat-vton"
    replicate_api_token: str = ""
    replicate_model_version: str = ""
    max_upload_bytes: int = 10 * 1024 * 1024


def build_engine(settings: Settings) -> GarmentTransferEngine:
    """Fábrica: elige la estrategia de generación por configuración."""
    if settings.tryon_engine == "fal":
        return FalCatVTONEngine(settings.fal_key, settings.fal_model)
    if settings.tryon_engine == "replicate":
        return ReplicateEngine(settings.replicate_api_token, settings.replicate_model_version)
    return MockEngine(settings.mock_delay_seconds)
