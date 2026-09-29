import type { Requester } from '../../../common/requester';
import type { TryOnSession } from '../domain/tryon-session.entity';

export abstract class TryOnSessionRepository {
  abstract create(session: TryOnSession): Promise<void>;
  abstract save(session: TryOnSession): Promise<void>;
  abstract findById(id: string): Promise<TryOnSession | null>;
  /** Devuelve la sesión solo si pertenece a quien la pide (sid anónimo o cuenta). */
  abstract findOwned(id: string, requester: Requester): Promise<TryOnSession | null>;
  abstract listOwned(requester: Requester, limit: number): Promise<TryOnSession[]>;
  abstract findWithExpiredPhotos(now: Date, limit: number): Promise<TryOnSession[]>;
  abstract findByUser(userId: string): Promise<TryOnSession[]>;
}
