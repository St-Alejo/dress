import { Injectable, computed, inject, signal } from '@angular/core';
import type {
  BodyMeasurements,
  FitRecommendation,
  GarmentCategory,
  GarmentItem,
  GenerationStatus,
  PhotoCheck,
  PoseRatios,
  SimilarBodyModel,
  TryOnMode,
  TryOnSession,
} from '@vestirse/shared-types';
import { ApiService } from './api.service';
import { GenerationSocketService } from './generation-socket.service';
import { AppError } from './http/app-error';
import { backoffDelay, sleep } from './http/backoff';
import { localPrefs, tabPrefs } from './local-prefs';
import { NoticeStore } from './notice.store';

interface GenerationState {
  status: GenerationStatus;
  progress: number;
  startedAt?: number;
  fallbackReason?: string;
}

const REMEMBER_KEY = 'measurements';
const SESSIONS_KEY = 'tryon-sessions';
const WEARABLE: ReadonlySet<GarmentCategory> = new Set(['top', 'bottom', 'dress', 'outerwear']);
/** Estados en los que la generación ya no avanza sola. */
export const SETTLED: ReadonlySet<GenerationStatus> = new Set(['done', 'fallback', 'failed', 'idle']);
/** Si ni el socket ni el sondeo traen novedades en este tiempo, se deja de esperar. */
export const POLL_DEADLINE_MS = 6 * 60_000;

/**
 * TryOnSessionStore — única fuente de verdad de la prueba en curso (sección 5).
 * Todo en signals: los componentes leen, las acciones escriben. Ninguna acción
 * falla en silencio: si el servidor rechaza algo, el estado se revierte y se avisa.
 */
@Injectable({ providedIn: 'root' })
export class TryOnSessionStore {
  private readonly api = inject(ApiService);
  private readonly socket = inject(GenerationSocketService);
  private readonly notices = inject(NoticeStore);

  readonly garment = signal<GarmentItem | null>(null);
  readonly bodyModels = signal<SimilarBodyModel[]>([]);
  readonly selectedBodyId = signal<string | null>(localPrefs.read<string | null>('bodyModel', null));
  readonly mode = signal<TryOnMode>('similar-model');
  readonly session = signal<TryOnSession | null>(null);

  /** Medidas: en memoria por defecto; solo persisten si la persona marca "recordar en este dispositivo". */
  readonly measurements = signal<BodyMeasurements | null>(localPrefs.read<BodyMeasurements | null>(REMEMBER_KEY, null));
  readonly rememberMeasurements = signal<boolean>(localPrefs.read<BodyMeasurements | null>(REMEMBER_KEY, null) !== null);
  /** Proporciones de pose (números, nunca imagen) — solo se usan si la persona lo permite. */
  readonly poseRatios = signal<PoseRatios | null>(null);
  readonly usePoseRatios = signal(false);

  readonly fit = signal<FitRecommendation | null>(null);
  readonly fitLoading = signal(false);
  readonly generation = signal<GenerationState>({ status: 'idle', progress: 0 });
  readonly error = signal<string | null>(null);

  readonly selectedBody = computed(() => this.bodyModels().find((b) => b.id === this.selectedBodyId()) ?? null);
  /** Prueba real (generada por IA) de la prenda sobre el modelo elegido, si ya existe. */
  readonly modelPreview = computed(() => {
    const g = this.garment();
    return (g && this.selectedBody()?.previewImages[g.id]) || null;
  });
  readonly previewImage = computed(() => this.modelPreview() ?? this.garment()?.images.photo ?? null);
  /** Calzado y accesorios no se pueden poner sobre una persona con los motores actuales. */
  readonly wearable = computed(() => WEARABLE.has(this.garment()?.category ?? 'accessory'));
  readonly modelPreviewState = signal<'idle' | 'generating' | 'busy' | 'failed'>('idle');
  readonly chosenSize = computed(() => {
    const f = this.fit();
    return f ? (f.userOverride ?? f.recommendedSize) : null;
  });
  readonly resultImageUrl = computed(() => this.session()?.resultImageUrl ?? null);
  readonly hasPhoto = computed(() => !!this.session()?.uploadedPhotoUrl);
  /** Aviso de encuadre de la última foto subida (si se pudo revisar). */
  readonly photoCheck = signal<PhotoCheck | null>(null);

  private stopWatching?: () => void;
  /** Prenda → sesión. Vive en sessionStorage: recargar la página no pierde la prueba en curso. */
  private readonly sessionsByGarment = new Map<string, string>(Object.entries(tabPrefs.read<Record<string, string>>(SESSIONS_KEY, {})));

  async loadGarment(id: string) {
    this.error.set(null);
    this.stopWatching?.();
    this.fit.set(null);
    this.session.set(null);
    this.mode.set('similar-model');
    this.modelPreviewState.set('idle');
    this.photoCheck.set(null);
    this.generation.set({ status: 'idle', progress: 0 });
    const [garment, bodies] = await Promise.all([this.api.garment(id), this.api.bodyModels(id)]);
    this.garment.set(garment);
    this.bodyModels.set(bodies);
    void this.api.modeUsed('similar-model', garment.id);
    const known = this.sessionsByGarment.get(id);
    if (known) {
      const s = await this.api.session(known).catch(() => null);
      if (s) {
        this.adoptSession(s);
        // Una generación que seguía en curso al recargar se vuelve a seguir.
        if (!SETTLED.has(s.generationStatus ?? 'idle')) {
          this.generation.set({ status: s.generationStatus!, progress: 0.1, startedAt: performance.now() });
          this.watch(s.id);
        }
      } else {
        this.forgetSession(id);
      }
    }
    if (this.measurements()) await this.estimate(this.measurements()!);
  }

  selectBody(id: string) {
    this.selectedBodyId.set(id);
    this.modelPreviewState.set('idle');
    localPrefs.write('bodyModel', id);
  }

  /** Pide al servidor la prueba de la prenda sobre el modelo elegido. Se genera una vez y queda para todos. */
  async generateModelPreview() {
    const g = this.garment();
    const body = this.selectedBody();
    if (!g || !body || this.modelPreviewState() === 'generating') return;
    this.modelPreviewState.set('generating');
    try {
      const { imageUrl } = await this.api.modelPreview(body.id, g.id);
      this.bodyModels.update((all) => all.map((b) => (b.id === body.id ? { ...b, previewImages: { ...b.previewImages, [g.id]: imageUrl } } : b)));
      this.modelPreviewState.set('idle');
    } catch (err) {
      // 503 = el motor gratuito está sin cuota o caído: se puede reintentar más tarde.
      this.modelPreviewState.set(AppError.from(err).status === 503 ? 'busy' : 'failed');
    }
  }

  async setMode(mode: TryOnMode) {
    const previous = this.mode();
    this.mode.set(mode);
    const g = this.garment();
    if (!g) return;
    const s = this.session();
    if (!s) return void this.api.modeUsed(mode, g.id);
    try {
      this.session.set(await this.api.changeMode(s.id, mode));
    } catch (err) {
      this.mode.set(previous);
      this.notices.error(err, 'errors.modeChange');
    }
  }

  async estimate(m: BodyMeasurements) {
    const g = this.garment();
    if (!g) return;
    this.measurements.set(m);
    if (this.rememberMeasurements()) localPrefs.write(REMEMBER_KEY, m);
    this.fitLoading.set(true);
    try {
      const rec = await this.api.estimateFit({
        garmentId: g.id,
        measurements: m,
        poseRatios: this.usePoseRatios() ? (this.poseRatios() ?? undefined) : undefined,
        sessionId: this.session()?.id,
      });
      this.fit.set(rec);
    } catch (err) {
      this.notices.error(err, 'errors.fitEstimate');
    } finally {
      this.fitLoading.set(false);
    }
  }

  setRemember(remember: boolean) {
    this.rememberMeasurements.set(remember);
    if (remember && this.measurements()) localPrefs.write(REMEMBER_KEY, this.measurements());
    if (!remember) localPrefs.remove(REMEMBER_KEY);
  }

  forgetMeasurements() {
    this.setRemember(false);
    this.measurements.set(null);
    this.fit.set(null);
  }

  /** La persona siempre puede elegir otra talla (regla 5). */
  async overrideSize(size: string) {
    const g = this.garment();
    const f = this.fit();
    if (!g || !f) return;
    // Actualización optimista: se muestra al instante y se revierte si el servidor falla.
    this.fit.set({ ...f, userOverride: size === f.recommendedSize ? undefined : size });
    try {
      await this.api.overrideSize({ garmentId: g.id, recommendedSize: f.recommendedSize, chosenSize: size, sessionId: this.session()?.id });
    } catch (err) {
      this.fit.set(f);
      this.notices.error(err, 'errors.sizeOverride');
    }
  }

  async ensureSession(): Promise<TryOnSession> {
    const existing = this.session();
    if (existing) return existing;
    const g = this.garment()!;
    const s = await this.api.startSession({ garmentId: g.id, mode: this.mode(), bodyModelId: this.selectedBodyId() ?? undefined });
    this.adoptSession(s);
    return s;
  }

  async uploadPhoto(photo: Blob) {
    const s = await this.ensureSession();
    const updated = await this.api.uploadPhoto(s.id, photo);
    this.photoCheck.set(updated.photoCheck ?? null);
    this.adoptSession(updated);
  }

  async generate() {
    const previous = this.generation();
    try {
      const s = await this.ensureSession();
      this.generation.set({ status: 'queued', progress: 0.02, startedAt: performance.now() });
      this.watch(s.id);
      this.adoptSession(await this.api.generate(s.id));
    } catch (err) {
      // No se pudo ni encolar (sin conexión, ya había una en curso...): no es un fallback del proveedor.
      this.stopWatching?.();
      this.generation.set(SETTLED.has(previous.status) ? previous : { status: 'idle', progress: 0 });
      this.notices.error(err, 'errors.generate');
    }
  }

  /** Devuelve si se borró, para que la vista solo cambie de paso cuando el servidor lo confirmó. */
  async deletePhoto(): Promise<boolean> {
    const s = this.session();
    if (!s) return false;
    try {
      const updated = await this.api.deletePhoto(s.id);
      this.stopWatching?.();
      this.adoptSession(updated);
      this.generation.set({ status: 'idle', progress: 0 });
      this.notices.success('photo.deleted');
      return true;
    } catch (err) {
      this.notices.error(err, 'errors.deletePhoto');
      return false;
    }
  }

  async saveResult() {
    const s = this.session();
    if (!s) return;
    try {
      this.adoptSession(await this.api.saveResult(s.id));
      this.notices.success('photo.saved');
    } catch (err) {
      this.notices.error(err, 'errors.saveResult');
    }
  }

  private adoptSession(s: TryOnSession) {
    this.session.set(s);
    this.sessionsByGarment.set(s.garmentId, s.id);
    tabPrefs.write(SESSIONS_KEY, Object.fromEntries(this.sessionsByGarment));
    if (s.fitRecommendation && !this.fit()) this.fit.set(s.fitRecommendation);
    const status = s.generationStatus ?? 'idle';
    if (status === 'done' || status === 'fallback' || status === 'failed') {
      this.generation.update((g) => ({ ...g, status, progress: 1, fallbackReason: s.failureReason ?? g.fallbackReason }));
    }
  }

  private forgetSession(garmentId: string) {
    this.sessionsByGarment.delete(garmentId);
    tabPrefs.write(SESSIONS_KEY, Object.fromEntries(this.sessionsByGarment));
  }

  private watch(sessionId: string) {
    this.stopWatching?.();
    const abort = new AbortController();
    const unsubscribe = this.socket.watch(sessionId, async (e) => {
      this.generation.update((g) => ({ ...g, status: e.status, progress: e.progress, fallbackReason: e.fallbackReason }));
      if (SETTLED.has(e.status)) {
        this.stopWatching?.();
        const s = await this.api.session(sessionId).catch(() => null);
        if (s) this.adoptSession(s);
        const started = this.generation().startedAt;
        if (e.status === 'done' && started) void this.api.generationPerceived(sessionId, Math.round(performance.now() - started));
      }
    });
    this.stopWatching = () => {
      unsubscribe();
      abort.abort();
    };
    // Respaldo si el WebSocket no conecta: sondeo con espera creciente y tope de tiempo.
    void this.pollUntilSettled(sessionId, abort.signal).catch(() => undefined);
  }

  private async pollUntilSettled(sessionId: string, signal: AbortSignal) {
    const deadline = Date.now() + POLL_DEADLINE_MS;
    for (let attempt = 0; Date.now() < deadline; attempt++) {
      await sleep(backoffDelay(attempt), signal);
      if (SETTLED.has(this.generation().status) || this.session()?.id !== sessionId) return;
      const s = await this.api.session(sessionId).catch(() => null);
      if (s && SETTLED.has(s.generationStatus ?? 'idle')) {
        this.adoptSession(s);
        this.stopWatching?.();
        return;
      }
    }
    // El servidor también rescata las atascadas; aquí solo se deja de esperar y se avisa.
    this.generation.update((g) => ({ ...g, status: 'failed', progress: 1, fallbackReason: 'client-timeout' }));
    this.notices.push('error', 'errors.generationTimeout');
  }
}
