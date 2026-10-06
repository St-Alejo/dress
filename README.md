# Vestirse · Probador de ropa virtual

Probador virtual de tres capas, implementado a partir de [`docs/README-virtual-tryon.md`](docs/README-virtual-tryon.md):

| Capa | Qué hace | Dónde corre |
|---|---|---|
| **Cuerpo similar** (por defecto) | La prenda ilustrada sobre 12 cuerpos de referencia XS–4XL, dibujada con la geometría de cada cuerpo | Servidor genera SVG en el seed |
| **Track A · Cámara en vivo** | Pose (MediaPipe) + warp afín de la prenda sobre el video | 100 % navegador; ningún frame sale del dispositivo |
| **Track B · Con tu foto** | Generación por difusión (CatVTON vía fal.ai / Replicate, o *mock*) | Cola BullMQ → microservicio Python |
| **Track C · ¿Es mi talla?** | Recomendación con confianza explícita, editable, calibrada por marca | Librería TS pura `packages/fit-engine` |

## Puesta en marcha

Requisitos: Node ≥ 22.12, Python ≥ 3.12, Docker.

```bash
npm install
npm run infra:up                  # Postgres :55432, Redis :6380, S3 (RustFS) :9000, ai-worker :8000
cp apps/api/.env.example apps/api/.env
npm run build:packages
npm run db:migrate                # aplica migraciones
npm run db:seed                   # 4 marcas, 21 prendas, 12 cuerpos, usuario admin
npm run dev:api                   # http://localhost:3000/api
npm run dev:web                   # http://localhost:4200
```

Admin de demo: `admin@vestirse.local` / `admin1234` (cámbialo con `ADMIN_EMAIL` / `ADMIN_PASSWORD` antes del seed).

> Los puertos de Postgres y Redis del host son 55432 y 6380 para no chocar con instalaciones locales.
> Se usa **RustFS** como S3 local porque las imágenes oficiales de MinIO ya no se publican.

### Todo en contenedores (perfil `full`)

```bash
docker compose -f infra/docker-compose.yml --profile full up -d --build
docker compose -f infra/docker-compose.yml exec api npm run db:seed   # la primera vez
# web en http://localhost:8080 (WEB_PORT=... para cambiarlo; AI_WORKER_PORT para el worker)
```

La API aplica las migraciones al arrancar y expone `GET /api/health` (base de datos y Redis críticos;
el worker aparece como `degraded` si no responde, porque la app sigue funcionando con el fallback).
Los secretos por defecto del perfil `full` son solo para desarrollo local.

### Track B con un modelo real

El proveedor se elige en el panel de admin (o con `AI_PROVIDER` en `apps/api/.env`) y viaja al worker
en cada petición (`X-AI-Provider`), así que cambiarlo no requiere reiniciar nada. `mock` (composición
simple, gratis) siempre está disponible. El contrato API↔worker está versionado en
`contracts/ai-worker/v1/` y ambos lados lo validan en sus tests.

Para que solo la API pueda llamar al worker, define el mismo `WORKER_TOKEN` en `apps/api/.env` y al
levantar la infraestructura (`WORKER_TOKEN=... npm run infra:up`).

Los adaptadores hospedados están cubiertos con tests de contrato (HTTP simulado); no se han probado contra el proveedor real en este repo.

## Tests

```bash
npm test                  # fit-engine, shared-types (tipos), api (jest), web (vitest)
npm run test:invariants   # solo las invariantes éticas
cd services/ai-worker && pytest
```

### Invariantes éticas verificadas (sección 4 del documento)

| Regla | Cómo se verifica |
|---|---|
| Nunca obligar a subir foto | Test de tipos: `TryOnSession.uploadedPhotoUrl` debe ser opcional (falla si se vuelve obligatorio) |
| Sin edición/adelgazamiento de silueta | Test que recorre todas las rutas de la API contra un patrón prohibido; `BodyGeometry` solo acepta medidas reales; script estático del cliente |
| Sin comparación entre usuarios | Mismo test de rutas (`leaderboard`, `compare-users`…) |
| Catálogo de cuerpos diverso desde el día 1 | Test del seed (XS–4XL, ≥10 tipos, ≥5 tonos de piel) + el panel admin **rechaza** borrar un cuerpo si rompe la cobertura |
| La talla nunca es certeza | 48 casos: toda recomendación trae confianza y base; el override siempre se acepta |
| Cámara: solo video, siempre se apaga, sin red | Test de `CameraService` + script que prohíbe red en `features/live-overlay` |
| Retención real (sección 8) | Test del cron de TTL y del borrado de cuenta con almacenamiento en memoria; consentimiento `false` por defecto en el esquema |

## Arquitectura

```
apps/web      Angular 21 (standalone, signals, zoneless) · Tailwind 4 · Transloco es/en · PWA
apps/api      NestJS 11 hexagonal · Prisma 7 · BullMQ · Socket.IO · opossum
services/ai-worker   FastAPI · adaptadores mock / fal CatVTON / Replicate
packages/shared-types   modelo de datos canónico (sección 9)
packages/fit-engine     Track C, sin I/O
```

Cada módulo de la API separa `domain/` (entidades y reglas), `application/` (casos de uso y **puertos** como clases abstractas) e `infrastructure/` (adaptadores Prisma, S3, HTTP).

### Patrones de diseño

| Patrón | Dónde |
|---|---|
| **Strategy** | `FitStrategy` (`ManualMeasurementsStrategy`, `HeightOnlyStrategy`, `PoseRatioStrategy`) · `GarmentTransferEngine` en Python |
| **Adapter** | `AiWorkerAdapter` (puerto `GarmentTransferPort`), `S3ObjectStorage` (puerto `ObjectStorage`), `FalCatVTONEngine`, `ReplicateEngine` |
| **Repository** | `CatalogRepository`, `TryOnSessionRepository`, `CalibrationRepository` con implementaciones Prisma |
| **Facade** | `CameraService` y `PoseService`: el resto de la app nunca toca MediaPipe ni `getUserMedia` |
| **Circuit Breaker** | `AiWorkerAdapter` con opossum → la sesión pasa a `fallback` y la UI ofrece cuerpo similar o cámara |
| **Command** | `AddToComparisonCommand`, `RemoveFromComparisonCommand`, `ChangeSizeCommand` + `CommandHistory` (deshacer/rehacer) |
| **Value Object / Entidad** | `SizeChart`, `BrandCalibration` (inmutables), `TryOnSession` (máquina de estados con reglas de retención) |

### Diagrama de clases (núcleo del dominio)

```mermaid
classDiagram
  class FitEngine {
    -strategies: FitStrategy[]
    +recommend(input) FitRecommendation
    +applyOverride(rec, size, chart) FitRecommendation
  }
  class FitStrategy {
    <<interface>>
    +name: string
    +evaluate(ctx) StrategyResult
  }
  class ManualMeasurementsStrategy
  class HeightOnlyStrategy
  class PoseRatioStrategy
  class SizeChart {
    +sizes: string[]
    +isDetailed() bool
    +indexOf(size) number
  }
  class BrandCalibration {
    +sampleSize: number
    +record(rec, chosen) BrandCalibration
    +offset: number
  }
  FitStrategy <|.. ManualMeasurementsStrategy
  FitStrategy <|.. HeightOnlyStrategy
  FitStrategy <|.. PoseRatioStrategy
  FitEngine o-- FitStrategy
  FitEngine ..> SizeChart
  FitEngine ..> BrandCalibration

  class TryOnSession {
    +start(args)$ TryOnSession
    +attachPhoto(now, ttlHours)
    +requestGeneration()
    +complete()
    +fallback()
    +saveResult(userId)
    +purgePhoto() string[]
    +isOwnedBy(requester) bool
  }
  class TryOnSessionRepository {
    <<abstract>>
  }
  class GarmentTransferPort {
    <<abstract>>
    +generate(person, garment, category)
  }
  class AiWorkerAdapter {
    -breaker: CircuitBreaker
  }
  class ObjectStorage {
    <<abstract>>
    +put() +get() +deleteMany()
  }
  class TryOnService
  class GenerationProcessor
  class RetentionService {
    +purgeExpired(now)
    +deleteAccount(userId)
  }
  GarmentTransferPort <|-- AiWorkerAdapter
  TryOnService --> TryOnSessionRepository
  TryOnService --> ObjectStorage
  GenerationProcessor --> GarmentTransferPort
  GenerationProcessor --> TryOnSessionRepository
  RetentionService --> TryOnSessionRepository
  RetentionService --> ObjectStorage
  TryOnSessionRepository ..> TryOnSession

  class ComparisonCommand {
    <<interface>>
    +execute(state) +undo(state)
  }
  class CommandHistory {
    +run(cmd) +undo() +redo()
  }
  ComparisonCommand <|.. AddToComparisonCommand
  ComparisonCommand <|.. RemoveFromComparisonCommand
  ComparisonCommand <|.. ChangeSizeCommand
  CommandHistory o-- ComparisonCommand
```

## Privacidad (sección 8), en resumen

- Track A: todo en el navegador; el modelo y el WASM de MediaPipe se sirven desde el propio origen.
- Fotos: checklist obligatorio antes de subir, recorte o difuminado del rostro en el navegador, re-codificación sin EXIF en cliente **y** servidor, TTL de 24 h (cron cada 10 min + regla de expiración del bucket), borrado inmediato a pedido.
- Resultados: solo sobreviven al TTL si la persona los guarda en su cuenta.
- Medidas: nunca se guardan en el servidor; en el dispositivo solo con "recordar".
- Métricas: no existe métrica de "tiempo mirando el propio cuerpo".

## Diferencias con el documento original

- **Track C en TypeScript** (no en Python): es lógica pura, se prueba sin infraestructura y la usa la API directamente.
- **Subida de fotos a través de la API** (no URL prefirmada): permite validar y limpiar metadatos en el servidor antes de guardar.
- **Ilustraciones paramétricas** en vez de fotos de modelos reales: permiten cubrir XS–4XL desde el primer commit sin datasets sesgados.
- **Angular 21** en vez de 22: Angular 22 exige Node ≥ 22.22.
