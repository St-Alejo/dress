from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Configuración del proceso. Las claves de los proveedores llegan por petición (X-AI-Key)."""

    # Secreto compartido con la API; vacío = sin autenticación (solo desarrollo local).
    worker_token: str = ""
    # Proveedor cuando la petición no trae X-AI-Provider.
    default_provider: str = "mock"
    mock_delay_seconds: float = 4.0
    max_upload_bytes: int = 10 * 1024 * 1024
    # Adaptadores heredados: se pueden configurar por entorno además de por cabecera.
    fal_key: str = ""
    fal_model: str = "fal-ai/cat-vton"
    replicate_api_token: str = ""
    replicate_model_version: str = ""
