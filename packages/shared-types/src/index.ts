/**
 * Modelo de datos canónico (docs/README-virtual-tryon.md, sección 9).
 * Fuente única de verdad compartida por web y api.
 *
 * Varias decisiones de este archivo son invariantes éticas (sección 4) y están
 * cubiertas por tests en `invariants.spec.ts`: no cambiar la opcionalidad de
 * campos sin leer esa sección.
 */

export type GarmentCategory = 'top' | 'bottom' | 'dress' | 'outerwear' | 'footwear' | 'accessory';
export type TryOnMode = 'similar-model' | 'live-overlay' | 'photorealistic';
export type FitConfidence = 'low' | 'medium' | 'high';
export type Locale = 'es' | 'en';

/** Orden canónico de tallas alfabéticas; el catálogo de cuerpos debe cubrirlas todas (regla 4). */
export const LETTER_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL'] as const;
export type LetterSize = (typeof LETTER_SIZES)[number];

export interface BodyMeasurements {
  /** El único dato siempre pedido. */
  heightCm: number;
  chestCm?: number;
  waistCm?: number;
  hipCm?: number;
  /** true si se infirió de keypoints, no ingresado a mano. */
  estimatedFromPose?: boolean;
}

/** Proporciones derivadas de keypoints de pose (números, nunca imagen). */
export interface PoseRatios {
  /** Relación hombros/caderas normalizada: 1 ≈ proporción típica. */
  shoulderToHipRatio: number;
  torsoToHeightRatio?: number;
}

export interface SimilarBodyModel {
  id: string;
  heightRangeCm: [number, number];
  /** Etiqueta descriptiva, nunca clasificación reductiva. */
  bodyTypeTag: string;
  /** Talla alfabética de referencia que suele usar este cuerpo. */
  typicalSize: LetterSize;
  skinTone: string;
  avatarUrl: string;
  /** garmentId -> imagen del modelo con esa prenda puesta. */
  previewImages: Record<string, string>;
}

export type Silhouette = 'feminine' | 'masculine' | 'neutral';

/**
 * Perfil corporal para "medirse las prendas por talla". La estatura sigue siendo
 * lo único obligatorio; el peso permite estimar contornos. El peso NUNCA se
 * persiste en el servidor ni se registra en logs.
 */
export interface BodyProfile extends BodyMeasurements {
  weightKg?: number;
  /** Solo orienta la estimación de contornos; "neutral" promedia. */
  silhouette?: Silhouette;
}

/**
 * Cuerpo estimado a partir del perfil (cm). Con solo estatura no se inventan
 * contornos (quedan indefinidos): solo se pueden evaluar largos.
 */
export interface EstimatedBody {
  heightCm: number;
  chestCm?: number;
  waistCm?: number;
  hipCm?: number;
  /** true = inferido de estatura/peso; false = medido con cinta. */
  estimated: boolean;
}

/** Medidas de la PRENDA (no del cuerpo) para una talla: contornos y largos en cm. */
export interface GarmentDims {
  chestCm?: number;
  waistCm?: number;
  hipCm?: number;
  /** Largo desde el hombro (superiores/vestidos/abrigos) o desde la cintura (faldas). */
  lengthCm?: number;
  /** Largo de manga desde el hombro. */
  sleeveCm?: number;
  /** Entrepierna (pantalones y shorts). */
  inseamCm?: number;
}

/** Holgura con la que la prenda está diseñada (cm sobre el contorno del cuerpo). */
export interface FitIntent {
  chestEaseCm?: number;
  waistEaseCm?: number;
  hipEaseCm?: number;
}

export interface SizeChartEntry {
  size: string;
  chestCm?: [number, number];
  waistCm?: [number, number];
  hipCm?: [number, number];
  heightCm?: [number, number];
  /** Dimensiones reales de la prenda en esta talla. */
  garment?: GarmentDims;
}

export type EaseLabel = 'tight' | 'fitted' | 'regular' | 'loose' | 'oversized';
export type LengthLabel = 'too-short' | 'short' | 'as-designed' | 'long' | 'too-long';
export type HemLandmark = 'waist' | 'hip' | 'upper-thigh' | 'mid-thigh' | 'knee' | 'mid-calf' | 'ankle' | 'floor';
export type SleeveLandmark = 'upper-arm' | 'elbow' | 'forearm' | 'wrist' | 'over-hand';
export type FitVerdict = 'too-small' | 'good' | 'large' | 'too-large';

/** Análisis determinista de cómo le queda UNA talla a UN cuerpo. Fuente de verdad de la talla. */
export interface FitAnalysis {
  size: string;
  verdict: FitVerdict;
  zones: { zone: 'chest' | 'waist' | 'hip'; easeCm: number; label: EaseLabel }[];
  length?: { label: LengthLabel; landmark: HemLandmark };
  sleeve?: { label: LengthLabel; landmark: SleeveLandmark };
  /** Claves i18n con notas legibles. */
  notes: string[];
  bodyEstimated: boolean;
}

/** Una prenda del conjunto con la talla elegida. */
export interface OutfitItem {
  garmentId: string;
  size: string;
}

export type AiProvider = 'mock' | 'gemini' | 'fashn' | 'fal-fashn';

/** Configuración de IA visible para el admin. La clave nunca viaja completa al cliente. */
export interface AiProviderSettings {
  provider: AiProvider;
  model?: string;
  keyConfigured: boolean;
  keyHint?: string;
  lastTestOk?: boolean | null;
  updatedAt?: string;
  source: 'database' | 'environment' | 'none';
}

export interface Brand {
  id: string;
  name: string;
}

/** "left" = lado izquierdo de la persona (derecha de la imagen sin espejo), igual que MediaPipe. */
export interface OverlayAnchors {
  leftShoulder: [number, number];
  rightShoulder: [number, number];
  leftHip: [number, number];
  rightHip: [number, number];
}

export interface GarmentItem {
  id: string;
  name: string;
  brandId: string;
  brandName?: string;
  category: GarmentCategory;
  color: string;
  priceCents: number;
  /** `photo` = foto real de producto (subida o generada); se prefiere cuando existe. */
  images: { front: string; flat: string; overlay: string; photo?: string };
  fitIntent?: FitIntent;
  /** Anclas (px en la imagen de overlay) para alinearla con los keypoints de Track A. */
  overlayAnchors: OverlayAnchors;
  overlaySize: [number, number];
  sizeChart: SizeChartEntry[];
  /** "cae holgado", "tela con poco stretch" — contexto no visual. */
  fabricNotes?: string;
  stretch: 'none' | 'low' | 'medium' | 'high';
  knownLimitations?: string[];
}

export interface FitRecommendation {
  recommendedSize: string;
  confidence: FitConfidence;
  /** La persona siempre puede corregir la talla (sección 3, paso 6). */
  userOverride?: string;
  /** Claves i18n que explican el porqué, ej. ["fit.basis.heightProvided"]. */
  basis: string[];
  /** Talla alternativa cuando la persona está entre dos tallas. */
  alternativeSize?: string;
}

export type GenerationStatus = 'idle' | 'queued' | 'processing' | 'done' | 'failed' | 'fallback';

export interface TryOnSession {
  id: string;
  /** Sesiones sin cuenta son válidas — no forzar login. */
  userId?: string;
  garmentId: string;
  mode: TryOnMode;
  bodyModelId?: string;
  /** Solo si mode === 'photorealistic'; NUNCA obligatorio (regla 1). */
  uploadedPhotoUrl?: string;
  /** TTL corto por defecto (sección 8). */
  photoExpiresAt?: string;
  resultImageUrl?: string;
  /** true solo si la persona guardó el resultado en su cuenta (sobrevive al TTL). */
  resultSaved?: boolean;
  generationStatus?: GenerationStatus;
  /** Motivo cuando `generationStatus` es `failed` o `fallback` (p. ej. "timeout", "stuck"). */
  failureReason?: string;
  fitRecommendation?: FitRecommendation;
  /** Conjunto a probar sobre la foto (varias prendas con su talla). */
  outfit?: OutfitItem[];
  createdAt: string;
}

export type FitFeeling = 'runs-small' | 'true-to-size' | 'runs-large';
export type FitZone = 'shoulders' | 'chest' | 'waist' | 'hips' | 'length' | 'sleeves';

export interface FitReview {
  id: string;
  garmentId: string;
  sizeBought: string;
  feeling: FitFeeling;
  zones: FitZone[];
  comment?: string;
  createdAt: string;
}

export interface FitReviewSummary {
  garmentId: string;
  total: number;
  runsSmall: number;
  trueToSize: number;
  runsLarge: number;
  topZones: FitZone[];
}

/** Progreso de Track B emitido por WebSocket. */
export interface GenerationProgressEvent {
  sessionId: string;
  status: GenerationStatus;
  progress: number;
  resultImageUrl?: string;
  fallbackReason?: string;
}

export type MetricEventType =
  | 'mode-used'
  | 'size-recommended'
  | 'size-overridden'
  | 'generation-completed'
  | 'generation-failed'
  | 'return-simulated';

/**
 * Métricas permitidas (sección 14). No existe (ni debe existir) un tipo de evento
 * de "tiempo mirando el propio cuerpo".
 */
export interface MetricEvent {
  type: MetricEventType;
  payload: Record<string, string | number | boolean>;
}

export interface MetricsSummary {
  modeDistribution: Record<TryOnMode, number>;
  recommendations: number;
  overrides: number;
  overrideRate: number;
  avgGenerationMs: number | null;
  avgPerceivedMs: number | null;
  generationFailures: number;
}

export interface AuthUser {
  id: string;
  email: string;
  role: 'user' | 'admin';
  retrainingConsent: boolean;
}

/**
 * Patrones de rutas prohibidas por la sección 4 (reglas 2 y 3): edición de silueta
 * y comparación entre usuarios. Usado por el test de invariantes de la API.
 */
export const FORBIDDEN_ROUTE_PATTERN =
  /silhouette|slim|reshape|body-?edit|leaderboard|compare-?users|body-?rank/i;

/** Retención por defecto de fotos subidas (sección 8, punto 2). */
export const PHOTO_TTL_HOURS = 24;

export * from './worker-contract';
