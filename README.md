# Vestirse · Front (web)

Probador virtual de tres capas, implementado a partir de [`docs/README-virtual-tryon.md`](docs/README-virtual-tryon.md):

| Capa | Qué hace | Dónde corre |
|---|---|---|
| **Cuerpo similar** (por defecto) | Foto real del producto y, sobre 12 modelos reales XS–4XL, la prenda puesta al instante con el motor de malla (vista aproximada) o con IA a petición (una vez por modelo y prenda) | Navegador; la prueba IA queda en el catálogo |
| **Track A · Cámara en vivo** | Pose y segmentación (MediaPipe) + malla con huesos en WebGL2: la manga sigue al brazo, la mano tapa la prenda, luz del video y talla visible. De espaldas o de perfil no viste en espejo: pide ponerse de frente. Botón "Foto realista" opcional, con consentimiento | 100 % navegador; ningún frame sale del dispositivo salvo con "Foto realista" |
| **Track B · Con tu foto** | Al subir la foto, la prenda aparece puesta al instante con el motor de malla (pose medida en el navegador, sin IA) y el aviso de encuadre sale antes de subir. Luego, prueba por difusión (FASHN VTON 1.5 en Hugging Face, con Leffa e IDM-VTON de respaldo; o *mock*). Sin cupo o con fallo, queda la vista aproximada | Cola BullMQ → microservicio Python |
| **Track C · ¿Es mi talla?** | Recomendación con confianza explícita, editable, calibrada por marca | Librería TS pura `packages/fit-engine` (repo del back) |

Además:
- **Armar look** (`/look`): un hueco por parte del cuerpo (arriba o vestido, abajo, abrigo, calzado y
  accesorio), visto en un modelo o en la cámara. Las sugerencias de color y estilo salen de reglas
  fijas. El look se guarda en el navegador y se comparte por enlace.
- **Tienda:** filtros por categoría, color, talla, precio y marca, con búsqueda y orden. Todo queda en la
  URL, y al pasar el ratón la prenda aparece puesta en un modelo.
- **Ficha:** galería con la foto, el recorte y la prenda en tres tallas, zoom, "Combina con" y una
  descripción textual de la vista para lectores de pantalla.

Decisiones: [ADR 0001](docs/adr/0001-fotos-reales-y-motor-gratuito.md) (fotos reales y motor gratuito),
[ADR 0002](docs/adr/0002-camara-malla-oclusion-y-fotos-de-producto.md) (cámara con malla y oclusión; incluye
el prototipo descartado de mangas colgantes) y [ADR 0003](docs/adr/0003-vision-opcional-con-claude.md)
(visión opcional con Claude).

> Este repositorio contiene **solo el front** (Angular). La API NestJS, el microservicio de IA (FastAPI),
> la base de datos y el seed del catálogo están en el repo del back:
> **[St-Alejo/dress-back](https://github.com/St-Alejo/dress-back)**.

## Puesta en marcha

Requisitos: Node ≥ 22.12 y el back levantado (ver su README; la API escucha en `http://localhost:3000/api`).

```bash
npm install
npm run dev        # http://localhost:4200 (proxy de /api y websockets a localhost:3000)
```

Si la API corre en otro puerto, cambia `target` en `apps/web/proxy.conf.json`.

### Imagen Docker

```bash
docker build -f infra/docker/web.Dockerfile -t vestirse-web .
docker run -p 8080:80 -e API_UPSTREAM=host.docker.internal:3000 vestirse-web
```

nginx sirve el build de producción y reenvía `/api/` (y Socket.IO) a `API_UPSTREAM`.

Capturas de la app funcionando con el motor real: [`docs/capturas/`](docs/capturas/README.md).

## Tests

```bash
npm test                  # shared-types (tipos) y web (vitest)
npm run test:invariants   # invariantes éticas del cliente
npm run build             # build de producción
npm run e2e:camera -w apps/web   # e2e de la cámara (app y API levantadas, Chrome): cámara falsa .y4m;
                                 # usa una foto de cuerpo del seed del back (--api si la API no va en :3000)
```

Invariantes del cliente: la cámara solo pide video, siempre se apaga y `features/live-overlay` no puede
hacer peticiones de red (test de `CameraService` + `scripts/check-invariants.mjs`). Las demás invariantes
(rutas de la API, seed diverso, TTL) se verifican en el repo del back.

## Arquitectura

```
apps/web                Angular 21 (standalone, signals, zoneless) · Tailwind 4 · Transloco es/en · PWA
packages/shared-types   modelo de datos canónico compartido con la API (copia del mismo paquete del back)
infra/docker            web.Dockerfile + plantilla de nginx
```

Comunicación con el back: REST bajo `/api` y Socket.IO para el progreso de la prueba con IA. Los tipos de
las respuestas vienen de `@vestirse/shared-types`; si cambian en el back, hay que copiar el paquete aquí.

### Patrones de diseño en el front

| Patrón | Dónde |
|---|---|
| **Facade** | `CameraService` y `PoseService`: el resto de la app nunca toca MediaPipe ni `getUserMedia` |
| **Command** | `AddToComparisonCommand`, `RemoveFromComparisonCommand`, `ChangeSizeCommand` + `CommandHistory` (deshacer/rehacer) |

Los patrones del dominio (Strategy, Adapter, Repository, Chain of Responsibility, Circuit Breaker) están
en el back.

## Privacidad (sección 8), en resumen


- Track A: todo en el navegador; el modelo y el WASM de MediaPipe se sirven desde el propio origen.
- Fotos: checklist obligatorio antes de subir, recorte o difuminado opcional del rostro en el navegador (por defecto se envía entera: sin la cabeza el motor deforma el resultado), re-codificación sin EXIF en cliente **y** servidor, TTL de 24 h (cron cada 10 min + regla de expiración del bucket), borrado inmediato a pedido.
- Resultados: solo sobreviven al TTL si la persona los guarda en su cuenta.
- Medidas: nunca se guardan en el servidor; en el dispositivo solo con "recordar".
- Métricas: no existe métrica de "tiempo mirando el propio cuerpo".
