from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuración del proceso. Las claves de los proveedores llegan por petición (X-AI-Key)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Secreto compartido con la API; vacío = sin autenticación (solo desarrollo local).
    worker_token: str = ""
    # Proveedor cuando la petición no trae X-AI-Provider.
    default_provider: str = "mock"
    mock_delay_seconds: float = 4.0
    max_upload_bytes: int = 10 * 1024 * 1024
    # Token gratuito de Hugging Face para los Spaces (vacío = anónimo, con menos cuota de GPU).
    hf_token: str = ""
    # Groq: visión para el control de calidad de la foto y el etiquetado de prendas.
    groq_api_key: str = ""
    groq_vision_model: str = "qwen/qwen3.8-27b"
    # Adaptadores heredados: se pueden configurar por entorno además de por cabecera.
    fal_key: str = ""
    fal_model: str = "fal-ai/cat-vton"
    replicate_api_token: str = ""
    replicate_model_version: str = ""
