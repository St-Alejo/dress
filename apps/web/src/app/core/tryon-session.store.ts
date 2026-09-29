import { Injectable, computed, inject, signal } from '@angular/core';
import type {
  BodyMeasurements,
  FitRecommendation,
  GarmentItem,
  GenerationStatus,
  PoseRatios,
  SimilarBodyModel,
  TryOnMode,
  TryOnSession,
} from '@vestirse/shared-types';
import { ApiService } from './api.service';
import { GenerationSocketService } from './generation-socket.service';
import { localPrefs } from './local-prefs';

interface GenerationState {
  status: GenerationStatus;
  progress: number;
  startedAt?: number;
  fallbackReason?: string;
}

const REMEMBER_KEY = 'measurements';

/**
 * TryOnSessionStore — única fuente de verdad de la prueba en curso (sección 5).
 * Todo en signals: los componentes leen, las acciones escriben.
 */
@Injectable({ providedIn: 'root' })
export class TryOnSessionStore {
  private readonly api = inject(ApiService);
  private readonly socket = inject(GenerationSocketService);

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
  readonly previewImage = computed(() => {
    const g = this.garment();
    const body = this.selectedBody();
    if (!g) return null;
    return (body && body.previewImages[g.id]) || g.images.front;
  });
  readonly chosenSize = computed(() => {
    const f = this.fit();
    return f ? (f.userOverride ?? f.recommendedSize) : null;
  });
  readonly resultImageUrl = computed(() => this.session()?.resultImageUrl ?? null);
  readonly hasPhoto = computed(() => !!this.session()?.uploadedPhotoUrl);

  private stopWatching?: () => void;
  private sessionsByGarment = new Map<string, string>();

  async loadGarment(id: string) {
    this.error.set(null);
    this.stopWatching?.();
    this.fit.set(null);
    this.session.set(null);
    this.mode.set('similar-model');
    this.generation.set({ status: 'idle', progress: 0 });
    const [garment, bodies] = await Promise.all([this.api.garment(id), this.api.bodyModels(id)]);
    this.garment.set(garment);
    this.bodyModels.set(bodies);
    void this.api.modeUsed('similar-model', garment.id);
    const known = this.sessionsByGarment.get(id);
    if (known) {
      const s = await this.api.session(known).catch(() => null);
      if (s) this.adoptSession(s);
    }
    if (this.measurements()) await this.estimate(this.measurements()!);
  }

  selectBody(id: string) {
    this.selectedBodyId.set(id);
    localPrefs.write('bodyModel', id);
  }

  async setMode(mode: TryOnMode) {
    this.mode.set(mode);
    const g = this.garment();
    if (!g) return;
    const s = this.session();
    if (s) this.session.set(await this.api.changeMode(s.id, mode));
    else void this.api.modeUsed(mode, g.id);
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
    this.fit.set({ ...f, userOverride: size === f.recommendedSize ? undefined : size });
    await this.api.overrideSize({ garmentId: g.id, recommendedSize: f.recommendedSize, chosenSize: size, sessionId: this.session()?.id });
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
    this.adoptSession(await this.api.uploadPhoto(s.id, photo));
  }

  async generate() {
    const s = await this.ensureSession();
    const startedAt = performance.now();
    this.generation.set({ status: 'queued', progress: 0.02, startedAt });
    this.watch(s.id);
    try {
      this.adoptSession(await this.api.generate(s.id));
    } catch {
      this.generation.set({ status: 'fallback', progress: 1, fallbackReason: 'provider-error' });
    }
  }

  async deletePhoto() {
    const s = this.session();
    if (!s) return;
    this.stopWatching?.();
    this.adoptSession(await this.api.deletePhoto(s.id));
    this.generation.set({ status: 'idle', progress: 0 });
  }

  async saveResult() {
    const s = this.session();
    if (s) this.adoptSession(await this.api.saveResult(s.id));
  }

  private adoptSession(s: TryOnSession) {
    this.session.set(s);
    this.sessionsByGarment.set(s.garmentId, s.id);
    if (s.fitRecommendation && !this.fit()) this.fit.set(s.fitRecommendation);
    const status = s.generationStatus ?? 'idle';
    if (status === 'done' || status === 'fallback') {
      this.generation.update((g) => ({ ...g, status, progress: 1 }));
    }
  }

  private watch(sessionId: string) {
    this.stopWatching?.();
    this.stopWatching = this.socket.watch(sessionId, async (e) => {
      this.generation.update((g) => ({ ...g, status: e.status, progress: e.progress, fallbackReason: e.fallbackReason }));
      if (e.status === 'done' || e.status === 'fallback') {
        this.stopWatching?.();
        this.adoptSession(await this.api.session(sessionId));
        const started = this.generation().startedAt;
        if (e.status === 'done' && started) void this.api.generationPerceived(sessionId, Math.round(performance.now() - started));
      }
    });
    // Respaldo si el WebSocket no conecta: sondeo liviano.
    void this.pollUntilSettled(sessionId);
  }

  private async pollUntilSettled(sessionId: string) {
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      const g = this.generation();
      if (g.status === 'done' || g.status === 'fallback' || g.status === 'idle') return;
      if (this.session()?.id !== sessionId) return;
      const s = await this.api.session(sessionId).catch(() => null);
      if (s && (s.generationStatus === 'done' || s.generationStatus === 'fallback')) {
        this.generation.update((x) => ({ ...x, status: s.generationStatus!, progress: 1 }));
        this.adoptSession(s);
        return;
      }
    }
  }
}
