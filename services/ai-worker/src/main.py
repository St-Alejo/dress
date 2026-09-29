import time
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from .config import Settings, build_engine
from .engines import EngineError, GarmentTransferEngine, TransferRequest, UnsupportedCategory

app = FastAPI(title="Vestirse AI worker", version="0.1.0")


@lru_cache
def get_settings() -> Settings:
    return Settings()


@lru_cache
def get_engine() -> GarmentTransferEngine:
    return build_engine(get_settings())


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "engine": get_engine().name}


async def _read_limited(file: UploadFile, limit: int) -> bytes:
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, "imagen demasiado grande")
    if not data:
        raise HTTPException(422, "imagen vacía")
    return data


@app.post("/generate")
async def generate(
    person_image: Annotated[UploadFile, File()],
    garment_image: Annotated[UploadFile, File()],
    category: Annotated[str, Form()],
    engine: Annotated[GarmentTransferEngine, Depends(get_engine)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    person = await _read_limited(person_image, settings.max_upload_bytes)
    garment = await _read_limited(garment_image, settings.max_upload_bytes)
    started = time.perf_counter()
    try:
        result = await engine.generate(TransferRequest(person=person, garment=garment, category=category))  # type: ignore[arg-type]
    except UnsupportedCategory as exc:
        raise HTTPException(422, str(exc)) from exc
    except EngineError as exc:
        raise HTTPException(502, str(exc)) from exc
    finally:
        # Las imágenes nunca se persisten: se liberan al terminar la petición.
        del person, garment
    duration_ms = int((time.perf_counter() - started) * 1000)
    return Response(
        content=result,
        media_type="image/png",
        headers={"X-Engine": engine.name, "X-Duration-Ms": str(duration_ms)},
    )
