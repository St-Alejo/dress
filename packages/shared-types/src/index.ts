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

export interface SizeChartEntry {
  size: string;
  chestCm?: [number, number];
  waistCm?: [number, number];
  hipCm?: [number, number];
  heightCm?: [number, number];
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
  images: { front: string; flat: string; overlay: string };
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
  fitRecommendation?: FitRecommendation;
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
