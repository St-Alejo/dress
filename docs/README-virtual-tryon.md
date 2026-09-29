# Probador de Ropa Virtual (Virtual Try-On)

> Documento de arquitectura y contexto de producto, escrito para que un agente de ingeniería (Claude Code) pueda planificar e implementar el proyecto directamente a partir de este archivo. No es material de presentación: es la base técnica de trabajo.

---

## 0. TL;DR para quien vaya a implementar esto

- El usuario ve cómo le quedaría una prenda **sin tener que subir necesariamente una foto propia** (puede elegir un modelo de cuerpo similar al suyo, patrón que ya usa Walmart) — y si sí sube su foto, obtiene un resultado fotorrealista generado por difusión.
- El sistema tiene **tres capas, no dos**, porque la investigación de mercado es tajante en un punto: *ningún* probador virtual existente (ni Google, ni Snap, ni Zalando) predice bien cómo se **ajusta** físicamente una prenda — solo muestran cómo se **ve**. Ver y ajustar son problemas distintos:
  - **Track A — Overlay en vivo (cliente, gratis, instantáneo)**: cámara + pose estimation corriendo 100% en el navegador, superpone la prenda en tiempo real. Es el "probar rápido" tipo Snapchat.
  - **Track B — Generación fotorrealista (servidor, bajo demanda)**: sube una foto, un modelo de difusión (tipo IDM-VTON/CatVTON) genera una imagen realista de esa persona con esa prenda puesta.
  - **Track C — Motor de ajuste (el diferenciador real)**: a partir de medidas corporales (estimadas o ingresadas), compara contra la tabla de tallas real de la prenda y da una recomendación de talla con nivel de confianza — esto es lo único que la evidencia muestra que **sí** reduce devoluciones de verdad (14-50%, según sistemas basados en medidas como Zalando/True Fit), más que cualquier imagen generada.
- Este proyecto tiene una responsabilidad de diseño que no es opcional: la evidencia documenta que probadores virtuales mal diseñados **redujeron ventas en clientes de talla grande y disminuyeron autoestima** (estudio de Iowa State, +8,000 clientes). La sección 8 no es un anexo legal — son restricciones de arquitectura de primera clase.
- Stack recomendado: mismo patrón que el resto del portafolio — **Angular (standalone + signals)**, con el pipeline de cámara/pose aislado de Change Detection igual que se aisló Three.js en el proyecto de interiores. Backend NestJS + microservicio Python para los modelos de IA, cola de trabajos con BullMQ + Redis.

---

## 1. Contexto: qué existe hoy y por qué casi nadie lo usa

La inversión en "probadores virtuales" lleva más de una década y el resultado medido es incómodo de leer, pero es la base más honesta para diseñar bien: **solo el 1.4% de los adultos entre 18-65 años usa regularmente alguna forma de probador virtual**, a pesar de años de inversión multimillonaria de Google, Snap, Zalando y decenas de startups. Esto no significa que la idea esté mal — significa que casi todas las implementaciones resuelven el problema equivocado.

| Producto | Tecnología | Qué resuelve bien | Por qué casi nadie lo adoptó |
|---|---|---|---|
| **Google Shopping Try-On** | Difusión entrenada con pares imagen-ropa-cuerpo, parte de una selfie | Accesible sin fricción, representación diversa de tallas (XXS–4XL) y tonos de piel | No tiene datos de medidas corporales reales — muestra cómo se *ve*, no cómo se *ajusta* (costuras, tensión de mangas) |
| **Snapchat AR Try-On** | Overlay en tiempo real sobre cámara en vivo, igual que un filtro facial extendido al cuerpo | Funciona bien en accesorios (lentes: 70-80% de adopción) | Para ropa es inefectivo: la cámara no conoce la forma corporal real, muestra el mismo overlay a una talla 4 y a una 14. Snap cerró su servicio empresarial (ARES) a los 6 meses |
| **Zalando Virtual Fitting Room** | Avatar 3D a partir de medidas corporales reales, simula el ajuste con mapas de calor | **Es el único enfoque serio que intenta predecir ajuste, no solo apariencia** — redujo devoluciones ~10% | Cobertura mínima (algunos jeans/tops, nada de vestidos ni calzado); ~80,000 usuarios acumulados de 50 millones de clientes |
| **IDM-VTON / OOTDiffusion / CatVTON (open source)** | Modelos de difusión (UNets duales o concatenación espacial) para transferencia fotorrealista de prenda | La mejor calidad visual disponible hoy, código abierto | Son motores de *generación de imagen*, no de *predicción de ajuste* — resuelven el mismo problema que Google, solo que mejor |

**Hallazgo clave de la investigación, y el que define la arquitectura de este proyecto**: casi todos los sistemas de "solo imagen" obtienen una puntuación de predicción de ajuste de 1/5. Los sistemas basados en medidas corporales (Zalando, True Fit) llegan a 7-8/10. Y la reducción de devoluciones más alta medida (14-50%) viene de **sistemas de recomendación de talla sin ninguna imagen** — texto y medidas, nada más.

Esto cambia la pregunta de diseño de "¿cómo genero la imagen más realista posible?" (que es donde compiten Google, Snap y los modelos open source) a **"¿cómo combino una imagen útil con una predicción de ajuste honesta?"** — que es el hueco real del mercado.

---

## 2. Propuesta de valor

Un probador virtual de tres capas, donde cada capa es honesta sobre lo que puede y no puede prometer:

1. **"Pruébatelo ya" (Track A)**: cámara en vivo, sin subir nada, superposición instantánea de la prenda sobre el cuerpo detectado — para la decisión rápida de "¿me gusta este color/corte en general?".
2. **"Mira cómo te quedaría de verdad" (Track B, opcional)**: si el usuario decide subir una foto, obtiene una imagen fotorrealista generada por difusión, mucho más creíble que el overlay en vivo.
3. **"¿Es mi talla?" (Track C, el diferenciador)**: independientemente de si el usuario usó A o B, el sistema pregunta 2-3 datos simples (altura, y opcionalmente una medida más) y cruza eso contra la tabla de tallas real de la prenda, devolviendo una recomendación con nivel de confianza explícito — nunca una certeza falsa.

Ninguna de las tres capas es obligatoria para comprar. Esto es una decisión de producto, no solo técnica: la investigación de UX es explícita en que *"si estoy comprando por impulso desde la cama, no voy a levantarme a tomar una foto de mi cuerpo"* — forzar el flujo mata conversión, no la mejora.

---

## 3. Flujo de usuario completo (con justificación de UX)

### Paso 1 — Ver la prenda sin fricción (default, sin cámara)
Por defecto, el usuario ve la prenda puesta en **un modelo de cuerpo similar al suyo** (altura + tipo de cuerpo, elegido de un set curado), tal como hace Walmart. Cero fricción, cero foto, cero cámara. Esto no es una versión "pobre" del producto — es la entrada correcta para la mayoría de los casos de compra por impulso.

### Paso 2 — Invitar, no forzar, a probar en vivo
Un botón claro y opcional: **"Pruébatelo con tu cámara"**. Al activarlo, se pide permiso de cámara del navegador (nunca acceso al rollo completo de fotos — es una señal de alerta identificada en la investigación de privacidad: pedir más acceso del que la función necesita).

### Paso 3 — Feedback de cámara conversacional, no un cuadro genérico
Guía en tiempo real tipo la app de Ray-Ban evaluada: un óvalo/silueta guía visual con indicaciones ("acércate un poco", "tu cuerpo completo debe verse") en vez de un simple recuadro de detección. Esto viene directo de la investigación de UX de captura para apps de prueba corporal.

### Paso 4 — Resultado del overlay en vivo (Track A)
La prenda se ajusta en tiempo real a la pose detectada. Es deliberadamente transparente sobre su propia limitación: un pequeño indicador (*"vista previa rápida — para un resultado más realista, sube una foto"*) evita que el usuario confunda este resultado rápido con una predicción real de ajuste.

### Paso 5 — Subir foto para el resultado fotorrealista (Track B, opcional)
Antes de subir, se muestra un **checklist de privacidad de una sola pantalla** (inspirado en el framework de 18 puntos evaluado): usa la foto menos identificable que funcione (puede recortarse para no incluir el rostro), fondo neutro, nadie más en la foto. Se explica en una frase qué pasa con la foto (ver sección 8).

### Paso 6 — Recomendación de talla (Track C), siempre editable
Se muestra con un nivel de confianza explícito ("Recomendado: M · confianza media — basado en tu altura"), nunca como un hecho absoluto. El usuario **siempre puede cambiar la talla manualmente** — la investigación de UX es clara: *"como usuario, sé cuánto mido"*, y quitarle el control a la persona sobre su propia talla es un error de diseño, no un detalle menor.

### Paso 7 — Contexto adicional, no solo la imagen
Junto al resultado (de cualquier track), se muestran reseñas reales de otros compradores sobre el ajuste ("me quedó grande", "ajustado en hombros") y una descripción de tela/caída — la investigación es explícita en que el probador visual funciona *mejor combinado* con esto, no como reemplazo.

### Paso 8 — Guardar y comparar
El usuario puede guardar varias prendas probadas para comparar lado a lado, sin necesidad de repetir el proceso de captura cada vez (se reutiliza la sesión de pose/foto ya procesada).

---

## 4. Diseño responsable: por qué esto no es una sección opcional

Este es el único proyecto de los tres del portafolio donde el propio producto puede, mal diseñado, causar daño real y medido a las personas que lo usan. La evidencia no es hipotética:

- Un estudio con más de 8,000 clientes (Iowa State) encontró que la tecnología de prueba virtual **redujo ventas en clientes de talla grande y disminuyó su autoestima**.
- Los datos de entrenamiento de varios sistemas evaluados están sesgados hacia cuerpos jóvenes (100% en la muestra revisada), delgados (87.5%) y con ropa reveladora (87.5%) — lo que significa que el sistema puede funcionar visiblemente peor, o de forma menos favorecedora, para cuerpos que no encajan en ese patrón.

**Restricciones de diseño no negociables para este proyecto**, derivadas directamente de esa evidencia:

1. **Nunca mostrar el rostro es un requisito para probar ropa**, no un extra — el flujo por defecto (Paso 1, sección 3) no necesita foto de nadie, y cuando se sube una foto, se puede recortar antes de procesar.
2. **Nunca ofrecer edición/adelgazamiento del cuerpo detectado.** El sistema muestra la prenda sobre el cuerpo real detectado, tal cual — no hay "slider de silueta" ni filtro que modifique la forma corporal. Esa función, aunque técnicamente trivial de añadir con los mismos modelos de segmentación, queda explícitamente **fuera de alcance** de este proyecto.
3. **Nunca forzar comparación entre usuarios** (sin "leaderboard" de cuerpos, sin compartir automático a redes con la imagen corporal de otra persona visible).
4. **El catálogo de modelos "cuerpo similar al mío" (Paso 1) debe cubrir un rango real de tallas y tipos de cuerpo desde el día uno** — no como una fase 2 posterior, precisamente porque la investigación muestra que omitir esto ya causó daño medible en productos reales.
5. **La recomendación de talla nunca se presenta como certeza** — siempre con nivel de confianza visible y siempre editable (Paso 6, sección 3).

Estas cinco reglas deben quedar reflejadas en el modelo de datos (sección 7) y no solo en el diseño visual, para que ningún desarrollador futuro las pueda "optimizar" accidentalmente.

---

## 5. Arquitectura de alto nivel

```
┌───────────────────────────────────────────────────────────────────┐
│  CLIENTE — Angular (standalone components + signals)               │
│  ┌────────────────┐ ┌───────────────────┐ ┌──────────────────────┐│
│  │ Catálogo /      │ │ Track A: Overlay   │ │ Track B/C: Resultado ││
│  │ selector de     │ │ en vivo (cámara +  │ │ fotorrealista +      ││
│  │ "modelo similar"│ │ pose, 100% cliente)│ │ recomendación talla  ││
│  └────────────────┘ └───────────────────┘ └──────────────────────┘│
│           TryOnSessionStore (signals) — única fuente de verdad     │
└───────────────────────────────┬───────────────────────────────────┘
                                 │ REST + WebSocket (progreso Track B)
┌───────────────────────────────▼───────────────────────────────────┐
│  API GATEWAY — Node.js / NestJS                                    │
│  Controllers · Casos de uso (GenerateTryOn, EstimateFit, Catalog)   │
│  · Puertos (interfaces) · Política estricta de retención de fotos  │
└───────────────────────────────┬───────────────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  BullMQ + Redis          │  (Track B es lento:
                    │  cola de trabajos        │   10-70s por generación)
                    └────────────┬────────────┘
                                 │
┌───────────────────────────────▼───────────────────────────────────┐
│  MICROSERVICIO DE IA — Python + FastAPI                            │
│  ┌──────────────────┐ ┌────────────────────┐ ┌───────────────────┐│
│  │ Track B: Garment  │ │ Track C: Fit Engine │ │ Segmentación /    ││
│  │ Transfer (difusión│ │ medidas + tabla de  │ │ pose (server-side ││
│  │ IDM-VTON/CatVTON) │ │ tallas → confianza  │ │ para Track B)     ││
│  └──────────────────┘ └────────────────────┘ └───────────────────┘│
└───────────────────────────────┬───────────────────────────────────┘
                                 │
┌────────────────────┐  ┌───────▼────────┐  ┌─────────────────────┐
│ PostgreSQL          │  │ S3 / R2        │  │ Catálogo de prendas  │
│ sesiones, medidas   │  │ fotos (TTL     │  │ + tabla de tallas +  │
│ (opt-in), catálogo  │  │ corto), resul- │  │ modelos "cuerpo      │
│                      │  │ tados          │  │ similar"             │
└────────────────────┘  └────────────────┘  └─────────────────────┘
```

El punto de diseño más importante de este diagrama: **Track A nunca toca el servidor**. La cámara, la detección de pose y el overlay corren enteramente en el navegador — no porque sea más barato (aunque lo es), sino porque es la opción más respetuosa con la privacidad: si el usuario solo quiere "probar rápido", su imagen nunca necesita salir de su propio dispositivo.

---

## 6. Decisión de stack: Angular, cámara en vivo, y por qué se trata igual que el viewport 3D

Mismo criterio que en el proyecto de interiores: Angular es una base sólida para todo lo que **no** es el pipeline de visión en tiempo real (catálogo, sesiones, cuenta, checklist de privacidad, recomendaciones) — y el pipeline de cámara+IA se trata como una caja negra aislada, por la misma razón técnica: un ciclo de detección corriendo a 30 FPS disparando Change Detection de Angular en cada frame degrada la app entera.

```typescript
// live-tryon.component.ts — mismo patrón de aislamiento que ThreeViewportComponent
@Component({ selector: 'app-live-tryon', standalone: true, template: `
  <video #video autoplay playsinline></video>
  <canvas #overlay></canvas>
` })
export class LiveTryOnComponent implements AfterViewInit, OnDestroy {
  @ViewChild('video') videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('overlay') canvasRef!: ElementRef<HTMLCanvasElement>;
  private detector!: PoseDetector;       // TensorFlow.js / MediaPipe, backend WebGL
  private stream?: MediaStream;
  private rafId?: number;

  // Solo esta señal entra al mundo de Angular, y a una tasa reducida —
  // el dibujo del overlay en el canvas ocurre completamente fuera de NgZone.
  readonly fitHint = signal<'too-close' | 'too-far' | 'good' | null>(null);

  constructor(private zone: NgZone, private tryOnStore: TryOnSessionStore) {}

  async ngAfterViewInit() {
    this.stream = await navigator.mediaDevices.getUserMedia({ video: true }); // nunca getUserMedia({video, audio:true}) — no se necesita audio
    this.videoRef.nativeElement.srcObject = this.stream;
    this.detector = await createPoseDetector();
    this.zone.runOutsideAngular(() => this.detectLoop());
  }

  private detectLoop = async () => {
    const pose = await this.detector.estimate(this.videoRef.nativeElement);
    drawGarmentOverlay(this.canvasRef.nativeElement, pose);   // 30 FPS, fuera de Angular
    this.throttledPushHint(pose);                             // dentro de Angular, ~2-4 Hz
    this.rafId = requestAnimationFrame(this.detectLoop);
  };

  ngOnDestroy() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.stream?.getTracks().forEach(t => t.stop());  // apagar la cámara siempre, sin excepción
    this.detector?.dispose();
  }
}
```

Dos detalles no negociables en este componente, ambos ligados a la sección 4: la cámara se apaga explícitamente en `ngOnDestroy` (nunca dejar un stream de cámara vivo más tiempo del necesario), y el frame de video **nunca se envía a ningún servidor** durante el Track A — solo los keypoints de pose (números, no imagen) se usan localmente para dibujar el overlay.

---

## 7. El pipeline de IA en detalle (las tres capas)

### 7.1 Track A — Overlay en vivo (cliente, sin servidor)

```
Cámara del navegador (getUserMedia)
   │
   ▼
Detección de pose en tiempo real (BlazePose vía TensorFlow.js/MediaPipe, backend WebGL)
   │   ~30 FPS, corre en GPU del dispositivo del usuario, sin salir del navegador
   ▼
Segmentación de silueta (Selfie Segmentation, mismo stack)
   │
   ▼
Warp 2D simple de la imagen de la prenda alineado a los keypoints de hombros/cintura/cadera
   │   (transformación afín por región, no generación — es deliberadamente simple y rápido)
   ▼
Overlay dibujado en <canvas>, superpuesto al video en vivo
```

Este track usa exactamente el mismo tipo de modelos (BlazePose + Selfie Segmentation) que ya evaluamos como maduros y con soporte first-class en TensorFlow.js — no requiere entrenar nada, y corre en cualquier laptop o celular de gama media sin GPU dedicada.

### 7.2 Track B — Generación fotorrealista (servidor, bajo demanda)

```
Foto subida por el usuario (persona) + imagen de la prenda (catálogo)
   │
   ▼
Segmentación de la prenda actual + máscara del área a reemplazar
   │
   ▼
Estimación de pose/DensePose (server-side, mayor precisión que el track cliente)
   │
   ▼
Modelo de transferencia de prenda (elegir uno según el trade-off velocidad/calidad):
   │
   ├─ CatVTON  → ~11-35s, arquitectura simple (concatenación espacial persona+prenda,
   │             solo 49M parámetros entrenables), buena precisión estructural
   │
   └─ IDM-VTON → ~17-70s, dos UNets sobre SDXL, mejor fidelidad de color/textura,
                 pero más lento y más pesado de operar
   │
   ▼
Imagen fotorrealista resultado
```

**Recomendación para el MVP**: empezar con **CatVTON** — es notablemente más liviano (49M parámetros entrenables vs. arquitecturas mucho más pesadas), da tiempos de generación más consistentes, y su limitación principal (algo menos de fidelidad de textura en patrones muy complejos) es aceptable para validar el producto. Migrar a IDM-VTON como opción de mayor calidad es una mejora de v2, no un bloqueante inicial.

Limitaciones conocidas y honestas a comunicar en la UI (no ocultarlas): ninguno de estos modelos reconstruye bien manos superpuestas a la prenda, acolchados/costuras complejas, ni prendas muy holgadas — se documenta como limitación visible ("la textura puede no ser exacta") en vez de prometer una réplica perfecta.

### 7.3 Track C — Motor de ajuste (el diferenciador, inspirado en Zalando/True Fit)

```
Altura del usuario (siempre pedida) + medida adicional opcional (pecho/cintura, si el usuario la da)
   │
   ▼
Estimación de proporciones corporales adicionales a partir de los keypoints de pose de
Track A o B (ej. relación hombro-cadera, longitud de torso) — refuerza, no reemplaza,
el dato que el usuario ingresó a mano
   │
   ▼
Comparación contra la tabla de tallas real de la prenda (dato del catálogo, por marca/corte)
   │
   ▼
Recomendación de talla + nivel de confianza explícito
   │   alto:  el usuario dio medidas + la prenda tiene tabla de tallas detallada
   │   medio: solo altura + tabla de tallas genérica
   │   bajo:  datos insuficientes → se muestra igual, pero marcado como tal
```

Este track es intencionalmente el más simple técnicamente de los tres (no requiere modelos de IA pesados, es principalmente lógica de negocio + geometría básica) y es, según toda la evidencia de mercado revisada, **el que más impacto real tiene en reducir devoluciones**. No hay que subestimarlo por ser "menos vistoso" que la generación de imagen — es el corazón del valor del producto.

---

## 8. Privacidad y retención de datos (no es una nota legal, es arquitectura)

Basado directamente en el framework de privacidad evaluado para este tipo de apps:

1. **Track A nunca envía imagen ni video a ningún servidor** — ya está garantizado por diseño en la sección 6 (el procesamiento es 100% cliente).
2. **Las fotos subidas para Track B tienen retención con TTL corto por defecto** (ej. 24-48 horas) salvo que el usuario guarde explícitamente el resultado en su cuenta — igual que se hizo en el proyecto de interiores, pero aquí es más sensible porque es una foto del cuerpo de una persona, no de su sala.
3. **Nunca se solicita acceso al rollo completo de fotos** — solo al selector de archivo único o a la cámara en el momento (es una señal de alerta identificada explícitamente en la investigación).
4. **Ninguna foto se usa para reentrenar modelos sin consentimiento explícito y separado** (checkbox aparte, nunca marcado por defecto).
5. **Borrado de cuenta = borrado real de las fotos en S3**, no soft-delete en base de datos.
6. **El checklist de privacidad (Paso 5, sección 3) se muestra siempre antes de la primera subida de foto**, no enterrado en términos y condiciones.

---

## 9. Modelo de datos canónico

```typescript
interface BodyMeasurements {
  heightCm: number;                 // el único dato siempre pedido
  chestCm?: number;                 // opcional
  waistCm?: number;                 // opcional
  estimatedFromPose?: boolean;      // true si se infirió de keypoints, no ingresado a mano
}

interface SimilarBodyModel {
  // Catálogo de modelos "cuerpo similar al mío" — obligatorio desde el día uno (sección 4)
  id: string;
  heightRangeCm: [number, number];
  bodyTypeTag: string;              // etiqueta descriptiva, nunca clasificación reductiva
  previewImages: Record<string, string>; // garmentId -> imagen del modelo con esa prenda puesta
}

interface GarmentItem {
  id: string;
  name: string;
  category: 'top' | 'bottom' | 'dress' | 'outerwear' | 'footwear' | 'accessory';
  images: { front: string; flat: string };
  sizeChart: SizeChartEntry[];
  fabricNotes?: string;             // "cae holgado", "tela con poco stretch" — contexto no-visual
  knownLimitations?: string[];      // ej. "patrón complejo, la textura puede no ser exacta en el resultado generado"
}

interface SizeChartEntry {
  size: string;                     // "S", "M", "38", etc.
  chestCm?: [number, number];
  waistCm?: [number, number];
}

interface TryOnSession {
  id: string;
  userId?: string;                  // sesiones sin cuenta son válidas — no forzar login
  garmentId: string;
  mode: 'similar-model' | 'live-overlay' | 'photorealistic';
  uploadedPhotoUrl?: string;        // solo si mode === 'photorealistic'; nunca obligatorio
  photoExpiresAt?: string;          // TTL corto por defecto (sección 8)
  resultImageUrl?: string;
  fitRecommendation?: FitRecommendation;
}

interface FitRecommendation {
  recommendedSize: string;
  confidence: 'low' | 'medium' | 'high';
  userOverride?: string;            // la persona siempre puede corregir la talla (sección 3, paso 6)
  basis: string[];                  // ej. ["altura ingresada", "tabla de tallas detallada"]
}
```

Nótese que `uploadedPhotoUrl` es opcional en el tipo mismo — esto es intencional: el modelo de datos hace **imposible** representar un flujo que obligue a subir foto, alineado con la sección 4.

---

## 10. Patrones de diseño aplicados

| Patrón | Dónde | Por qué |
|---|---|---|
| **Strategy** | Motores de Track B (CatVTON vs. IDM-VTON) y estrategias de Track C (basado en medidas ingresadas vs. estimadas por pose) | Cambiar de modelo de difusión o de método de estimación de ajuste sin tocar el resto del sistema |
| **Facade** | `PoseService` / `CameraService` como única puerta de entrada al pipeline de visión desde Angular | El resto de la app nunca toca la API de MediaPipe/TensorFlow.js directamente |
| **Circuit Breaker** | Si Track B (difusión) tarda más de un umbral o falla, se ofrece automáticamente el resultado de Track A o el modelo similar como fallback | Nunca dejar al usuario esperando frente a un error sin alternativa |
| **Repository** | Acceso a `TryOnSession`, `GarmentItem`, `SizeChartEntry` | El dominio no sabe dónde viven los datos |
| **Adapter** | Integración con el proveedor de inferencia de difusión (self-hosted o API externa) | Aísla el sistema de cambios en el proveedor de IA |
| **Command** | Guardar/cambiar/quitar una prenda de la sesión de comparación (paso 8) | Permite deshacer sin miedo a "romper" la sesión |

---

## 11. Estructura de proyecto sugerida

```
virtual-tryon/
├── apps/
│   ├── web/                          # Angular
│   │   └── src/app/
│   │       ├── core/                 # guards, interceptors, servicios singleton
│   │       ├── features/
│   │       │   ├── catalog/          # navegación de prendas, selector de "modelo similar"
│   │       │   ├── live-overlay/     # LiveTryOnComponent (Track A, sección 6)
│   │       │   ├── photo-upload/     # checklist de privacidad + subida (Track B)
│   │       │   ├── fit-engine/       # formulario de medidas + resultado con confianza (Track C)
│   │       │   └── comparison/       # comparar varias prendas probadas (paso 8)
│   │       └── shared/models/        # interfaces de la sección 9 (fuente única)
│   └── api/                          # NestJS
│       └── src/modules/
│           ├── tryon-sessions/       # GenerateTryOnUseCase
│           ├── fit-engine/           # EstimateFitUseCase
│           ├── catalog/
│           └── privacy/              # políticas de retención/borrado (sección 8), aplicadas en código
├── services/
│   └── ai-worker/                    # Python + FastAPI
│       └── src/
│           ├── garment_transfer/     # CatVTON / IDM-VTON (Track B)
│           ├── pose_estimation/      # server-side, mayor precisión que el cliente
│           └── fit_model/            # lógica de Track C
└── packages/
    └── shared-types/                 # interfaces TS compartidas entre web y api
```

---

## 12. Stack tecnológico completo

| Capa | Herramienta | Notas |
|---|---|---|
| Frontend | Angular 18+ (standalone, signals) | Catálogo, sesiones, checklist de privacidad, formularios |
| Track A (cliente) | TensorFlow.js + MediaPipe (BlazePose, Selfie Segmentation), backend WebGL | 100% en el navegador, sin servidor, ver sección 6 |
| Cámara | `navigator.mediaDevices.getUserMedia` | Solo video, nunca audio; stream detenido siempre en `ngOnDestroy` |
| Estado | Angular Signals + `TryOnSessionStore` | Igual patrón que el proyecto de interiores |
| Backend | Node.js + NestJS | Arquitectura hexagonal, consistente con el resto del portafolio |
| Cola de trabajos | BullMQ + Redis | Track B es lento (10-70s) y costoso en GPU |
| IA — Track B | CatVTON (MVP) → IDM-VTON (v2, mayor fidelidad) | Microservicio Python/FastAPI; se puede empezar con una API de inferencia hospedada |
| IA — Track C | Lógica propia (no requiere modelo pesado) + keypoints de pose como refuerzo | Python o incluso Node, es principalmente reglas + geometría |
| Base de datos | PostgreSQL | Sesiones, catálogo, tabla de tallas — nunca fotos (van a object storage con TTL) |
| Almacenamiento | S3 / Cloudflare R2, con reglas de expiración automática (TTL) | Ver sección 8 |
| Infraestructura | Docker Compose (dev) | Mismo patrón que el resto de proyectos del portafolio |

---

## 13. Roadmap por fases

- **Fase 0 — Sin cámara ni IA todavía**: catálogo de prendas + catálogo de "modelos cuerpo similar" (sección 4) + selector básico. Valida que el producto es útil incluso en su forma más simple y más respetuosa con la privacidad, antes de tocar visión por computadora.
- **Fase 1 — Track A**: overlay en vivo con pose estimation en el cliente, completamente aislado de Angular (sección 6).
- **Fase 2 — Track C**: motor de ajuste basado en medidas — deliberadamente antes que Track B, porque es lo que más impacto real tiene y es más simple de construir bien.
- **Fase 3 — Track B**: generación fotorrealista con CatVTON, con cola de trabajos y checklist de privacidad obligatorio antes de cualquier subida de foto.
- **Fase 4 — Comparación y reseñas**: guardar/comparar varias prendas, integrar reseñas de ajuste de otros compradores junto al resultado (paso 7, sección 3).
- **Fase 5 — Mejora de fidelidad**: evaluar migrar Track B a IDM-VTON u otro modelo de mayor calidad, una vez validado que el motor de ajuste (Track C) es el que realmente mueve la conversión.

---

## 14. Métricas a medir

- **Tasa de devoluciones por talla incorrecta**, antes y después de introducir Track C — es la métrica de negocio que más evidencia tiene detrás.
- Distribución de uso entre las tres modalidades (modelo similar / overlay en vivo / foto real) — valida si forzar menos fricción (Fase 0) realmente concentra el uso ahí, como predice la investigación.
- Tasa de corrección manual de la talla recomendada (indica qué tan confiable es el motor de ajuste en la práctica, igual que se hizo con la calibración de escala en el proyecto de interiores).
- Tiempo real vs. percibido de generación en Track B.
- **Nunca** medir ni optimizar por "tiempo que el usuario pasa mirando su propio cuerpo en la app" — sería la métrica equivocada dado todo lo discutido en la sección 4.

---

## 15. Cómo debería proceder Claude Code con este documento

1. Empezar por la **Fase 0** (sección 13) — el catálogo de "modelos cuerpo similar" no es un placeholder temporal, es un requisito de producto desde el primer commit (sección 4, regla 4).
2. Implementar el aislamiento de cámara/pose de la sección 6 desde el primer prototipo de Track A, no como una optimización posterior — los problemas de Change Detection con un loop a 30 FPS son mucho más caros de corregir después que de prevenir desde el diseño inicial del componente.
3. Construir **Track C antes que Track B**, aunque Track B sea visualmente más impresionante — la evidencia de mercado (sección 1) es clara en que el motor de ajuste es el que aporta valor real medido, y es técnicamente más simple.
4. Tratar las cinco reglas de la sección 4 como invariantes verificables (ej. un test que falle si `uploadedPhotoUrl` se vuelve un campo obligatorio en el tipo, o si aparece cualquier endpoint de "editar silueta"), no solo como guía de diseño.
