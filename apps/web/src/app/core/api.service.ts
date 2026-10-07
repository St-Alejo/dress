import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  AuthUser,
  BodyMeasurements,
  Brand,
  FitFeeling,
  FitRecommendation,
  FitReview,
  FitReviewSummary,
  FitZone,
  GarmentCategory,
  GarmentItem,
  MetricsSummary,
  PoseRatios,
  SimilarBodyModel,
  TryOnMode,
  TryOnSession,
} from '@vestirse/shared-types';
import { firstValueFrom } from 'rxjs';

export interface AdminGarment extends GarmentItem {
  style: string;
  pattern: string;
  active: boolean;
}

export interface AdminBodyModel {
  id: string;
  bodyTypeTag: string;
  typicalSize: string;
  heightMin: number;
  heightMax: number;
  skinTone: string;
  avatarKey: string;
  photoKey?: string | null;
}

type Range = [number, number];

/** Cuerpo de alta de prenda (refleja GarmentDto de la API). */
export interface AdminGarmentInput {
  name: string;
  brandId: string;
  category: GarmentCategory;
  style: string;
  color: string;
  pattern: string;
  priceCents: number;
  stretch: GarmentItem['stretch'];
  fabricNotes?: string;
  sizeChart: { size: string; chest?: Range; waist?: Range; hip?: Range; height?: Range }[];
}

export type AdminGarmentPatch = Partial<Pick<AdminGarmentInput, 'name' | 'priceCents' | 'color' | 'pattern' | 'fabricNotes' | 'sizeChart'>> & { active?: boolean };

/** Cuerpo de alta de modelo de cuerpo (refleja BodyModelDto de la API). */
export interface AdminBodyModelInput {
  bodyTypeTag: string;
  typicalSize: string;
  heightMin: number;
  heightMax: number;
  skinTone: string;
  hair: string;
  hairColor: string;
  shoulderCm: number;
  chestCm: number;
  waistCm: number;
  hipCm: number;
}

export interface AdminMetrics extends MetricsSummary {
  calibrations: { brand: string; category: string; sampleSize: number; meanShift: number }[];
}

/** Cliente HTTP tipado. Toda la app habla con el backend solo a través de aquí. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api';

  private get<T>(path: string, params?: Record<string, string | undefined>) {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(params ?? {})) if (v) p = p.set(k, v);
    return firstValueFrom(this.http.get<T>(this.base + path, { params: p }));
  }
  private send<T>(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown) {
    return firstValueFrom(this.http.request<T>(method, this.base + path, { body }));
  }

  // Catálogo
  garments(filter: { category?: GarmentCategory; brandId?: string; q?: string } = {}) {
    return this.get<GarmentItem[]>('/catalog/garments', filter);
  }
  garment(id: string) {
    return this.get<GarmentItem>(`/catalog/garments/${id}`);
  }
  brands() {
    return this.get<Brand[]>('/catalog/brands');
  }
  bodyModels(garmentId?: string) {
    return this.get<SimilarBodyModel[]>('/catalog/body-models', { garmentId });
  }

  // Track C
  estimateFit(body: { garmentId: string; measurements: BodyMeasurements; poseRatios?: PoseRatios; sessionId?: string }) {
    return this.send<FitRecommendation>('POST', '/fit/estimate', body);
  }
  overrideSize(body: { garmentId: string; recommendedSize: string; chosenSize: string; sessionId?: string }) {
    return this.send<{ userOverride: string }>('POST', '/fit/override', body);
  }

  // Sesiones de prueba
  startSession(body: { garmentId: string; mode: TryOnMode; bodyModelId?: string }) {
    return this.send<TryOnSession>('POST', '/tryon/sessions', body);
  }
  session(id: string) {
    return this.get<TryOnSession>(`/tryon/sessions/${id}`);
  }
  sessions() {
    return this.get<TryOnSession[]>('/tryon/sessions');
  }
  changeMode(id: string, mode: TryOnMode) {
    return this.send<TryOnSession>('PATCH', `/tryon/sessions/${id}/mode`, { mode });
  }
  uploadPhoto(id: string, photo: Blob) {
    const form = new FormData();
    form.append('photo', photo, 'photo.jpg');
    form.append('privacyAcknowledged', 'true');
    return firstValueFrom(this.http.post<TryOnSession>(`${this.base}/tryon/sessions/${id}/photo`, form));
  }
  deletePhoto(id: string) {
    return this.send<TryOnSession>('DELETE', `/tryon/sessions/${id}/photo`);
  }
  generate(id: string) {
    return this.send<TryOnSession>('POST', `/tryon/sessions/${id}/generate`);
  }
  saveResult(id: string) {
    return this.send<TryOnSession>('POST', `/tryon/sessions/${id}/save`);
  }

  // Reseñas de ajuste
  reviews(garmentId: string) {
    return this.get<{ reviews: FitReview[]; summary: FitReviewSummary }>('/reviews', { garmentId });
  }
  createReview(body: { garmentId: string; sizeBought: string; feeling: FitFeeling; zones: FitZone[]; comment?: string }) {
    return this.send<{ reviews: FitReview[]; summary: FitReviewSummary }>('POST', '/reviews', body);
  }

  // Métricas (sección 14)
  modeUsed(mode: TryOnMode, garmentId: string) {
    return this.send<void>('POST', '/metrics/mode-used', { mode, garmentId }).catch(() => undefined);
  }
  generationPerceived(sessionId: string, perceivedMs: number) {
    return this.send<void>('POST', '/metrics/generation-perceived', { sessionId, perceivedMs }).catch(() => undefined);
  }

  // Privacidad y cuenta
  privacyPolicy() {
    return this.get<{ photoTtlHours: number; liveCameraLeavesDevice: boolean; usedForTrainingByDefault: boolean }>('/privacy/policy');
  }
  setConsent(retrainingConsent: boolean) {
    return this.send<{ retrainingConsent: boolean }>('PATCH', '/privacy/consent', { retrainingConsent });
  }
  deleteAccount() {
    return this.send<{ deletedObjects: number; deletedSessions: number }>('DELETE', '/privacy/account');
  }
  me() {
    return this.get<AuthUser | null>('/auth/me');
  }
  login(email: string, password: string) {
    return this.send<AuthUser>('POST', '/auth/login', { email, password });
  }
  register(email: string, password: string) {
    return this.send<AuthUser>('POST', '/auth/register', { email, password });
  }
  logout() {
    return this.send<void>('POST', '/auth/logout');
  }

  // Admin
  adminGarments() {
    return this.get<AdminGarment[]>('/admin/garments');
  }
  adminCreateGarment(body: AdminGarmentInput) {
    return this.send<{ id: string }>('POST', '/admin/garments', body);
  }
  adminUpdateGarment(id: string, body: AdminGarmentPatch) {
    return this.send<{ id: string }>('PATCH', `/admin/garments/${id}`, body);
  }
  adminBrands() {
    return this.get<Brand[]>('/admin/brands');
  }
  adminCreateBrand(name: string) {
    return this.send<Brand>('POST', '/admin/brands', { name });
  }
  adminBodyModels() {
    return this.get<AdminBodyModel[]>('/admin/body-models');
  }
  adminCreateBodyModel(body: AdminBodyModelInput) {
    return this.send<{ id: string }>('POST', '/admin/body-models', body);
  }
  adminDeleteBodyModel(id: string) {
    return this.send<{ id: string }>('DELETE', `/admin/body-models/${id}`);
  }
  adminMetrics(days?: number) {
    return this.get<AdminMetrics>('/admin/metrics', { days: days ? String(days) : undefined });
  }
}
