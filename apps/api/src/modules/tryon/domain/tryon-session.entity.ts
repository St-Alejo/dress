import type { FitRecommendation, GenerationStatus, TryOnMode, TryOnSession as TryOnSessionDto } from '@vestirse/shared-types';
import type { Requester } from '../../../common/requester';

export interface TryOnSessionProps {
  id: string;
  ownerSid: string;
  userId?: string;
  garmentId: string;
  mode: TryOnMode;
  bodyModelId?: string;
  photoKey?: string;
  photoExpiresAt?: Date;
  resultKey?: string;
  resultSaved: boolean;
  generationStatus: GenerationStatus;
  fitRecommendation?: FitRecommendation;
  createdAt: Date;
}

export class DomainError extends Error {}

/**
 * Entidad raíz de una prueba. Encapsula las reglas de la sección 8:
 * la foto es opcional, expira, y solo se conserva el resultado si la persona
 * lo guarda explícitamente en su cuenta.
 */
export class TryOnSession {
  private constructor(private props: TryOnSessionProps) {}

  static start(args: { id: string; garmentId: string; mode: TryOnMode; bodyModelId?: string; requester: Requester; now: Date }) {
    return new TryOnSession({
      id: args.id,
      ownerSid: args.requester.sid,
      userId: args.requester.userId,
      garmentId: args.garmentId,
      mode: args.mode,
      bodyModelId: args.bodyModelId,
      resultSaved: false,
      generationStatus: 'idle',
      createdAt: args.now,
    });
  }

  static restore(props: TryOnSessionProps) {
    return new TryOnSession({ ...props });
  }

  get id() { return this.props.id; }
  get garmentId() { return this.props.garmentId; }
  get mode() { return this.props.mode; }
  get photoKey() { return this.props.photoKey; }
  get resultKey() { return this.props.resultKey; }
  get status() { return this.props.generationStatus; }
  get fitRecommendation() { return this.props.fitRecommendation; }
  get snapshot(): Readonly<TryOnSessionProps> { return { ...this.props }; }

  static photoKeyFor(id: string) { return `uploads/sessions/${id}/photo.jpg`; }
  static resultKeyFor(id: string) { return `uploads/sessions/${id}/result.png`; }
  static savedKeyFor(userId: string, id: string) { return `saved/${userId}/${id}.png`; }

  isOwnedBy(r: Requester): boolean {
    return this.props.ownerSid === r.sid || (!!r.userId && this.props.userId === r.userId);
  }

  changeMode(mode: TryOnMode) {
    this.props.mode = mode;
  }

  /** Adjuntar foto implica modo fotorrealista y fija la expiración (TTL corto por defecto). */
  attachPhoto(now: Date, ttlHours: number) {
    if (this.props.generationStatus === 'queued' || this.props.generationStatus === 'processing') {
      throw new DomainError('no se puede cambiar la foto mientras se genera');
    }
    this.props.mode = 'photorealistic';
    this.props.photoKey = TryOnSession.photoKeyFor(this.id);
    this.props.photoExpiresAt = new Date(now.getTime() + ttlHours * 3600_000);
    this.props.generationStatus = 'idle';
  }

  requestGeneration() {
    if (!this.props.photoKey) throw new DomainError('primero hay que subir una foto');
    if (this.props.generationStatus === 'queued' || this.props.generationStatus === 'processing') {
      throw new DomainError('ya hay una generación en curso');
    }
    this.props.generationStatus = 'queued';
  }

  markProcessing() {
    this.props.generationStatus = 'processing';
  }

  complete() {
    this.props.resultKey = TryOnSession.resultKeyFor(this.id);
    this.props.generationStatus = 'done';
  }

  /** Circuit breaker: se ofrece el modelo similar / overlay en vez de dejar a la persona frente a un error. */
  fallback() {
    this.props.generationStatus = 'fallback';
  }

  saveResult(userId: string) {
    if (!this.props.resultKey) throw new DomainError('no hay resultado para guardar');
    if (this.props.userId && this.props.userId !== userId) throw new DomainError('sesión de otra cuenta');
    this.props.userId = userId;
    this.props.resultSaved = true;
    this.props.resultKey = TryOnSession.savedKeyFor(userId, this.id);
  }

  setFitRecommendation(rec: FitRecommendation) {
    this.props.fitRecommendation = rec;
  }

  isExpired(now: Date): boolean {
    return !!this.props.photoExpiresAt && this.props.photoExpiresAt <= now;
  }

  /**
   * Retira la foto (y el resultado no guardado). Devuelve las claves a borrar del
   * almacenamiento: el borrado es real, no un flag (sección 8.5).
   */
  purgePhoto(): string[] {
    const keys: string[] = [];
    if (this.props.photoKey) keys.push(this.props.photoKey);
    if (this.props.resultKey && !this.props.resultSaved) {
      keys.push(this.props.resultKey);
      this.props.resultKey = undefined;
      if (this.props.generationStatus === 'done') this.props.generationStatus = 'idle';
    }
    this.props.photoKey = undefined;
    this.props.photoExpiresAt = undefined;
    return keys;
  }

  toDto(): TryOnSessionDto {
    const p = this.props;
    return {
      id: p.id,
      userId: p.userId,
      garmentId: p.garmentId,
      mode: p.mode,
      bodyModelId: p.bodyModelId,
      uploadedPhotoUrl: p.photoKey ? `/api/tryon/sessions/${p.id}/photo` : undefined,
      photoExpiresAt: p.photoExpiresAt?.toISOString(),
      resultImageUrl: p.resultKey ? `/api/tryon/sessions/${p.id}/result` : undefined,
      generationStatus: p.generationStatus,
      fitRecommendation: p.fitRecommendation,
      createdAt: p.createdAt.toISOString(),
    };
  }
}
