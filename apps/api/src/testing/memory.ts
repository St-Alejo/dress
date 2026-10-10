import type { Readable } from 'node:stream';
import type { Requester } from '../common/requester';
import { ObjectStorage } from '../common/storage';
import { TryOnSessionRepository } from '../modules/tryon/application/tryon-session.repository';
import type { TryOnSession } from '../modules/tryon/domain/tryon-session.entity';

/** Dobles en memoria para tests (no se incluyen en el build: ver tsconfig.build.json). */
export class MemoryStorage extends ObjectStorage {
  objects = new Map<string, Buffer>();
  async put(key: string, body: Buffer) { this.objects.set(key, body); }
  async get() { return null as { body: Readable } | null; }
  async getBuffer(key: string) { return this.objects.get(key) ?? null; }
  async deleteMany(keys: string[]) { keys.forEach((k) => this.objects.delete(k)); }
}

export class MemorySessions extends TryOnSessionRepository {
  items = new Map<string, TryOnSession>();
  async create(s: TryOnSession) { this.items.set(s.id, s); }
  async save(s: TryOnSession) { this.items.set(s.id, s); }
  async findById(id: string) { return this.items.get(id) ?? null; }
  async findOwned(id: string, r: Requester) { const s = this.items.get(id); return s?.isOwnedBy(r) ? s : null; }
  async listOwned(r: Requester) { return [...this.items.values()].filter((s) => s.isOwnedBy(r)); }
  async findWithExpiredPhotos(now: Date, limit: number) { return [...this.items.values()].filter((s) => s.isExpired(now)).slice(0, limit); }
  async findStuck(changedBefore: Date, limit: number) {
    return [...this.items.values()].filter((s) => s.isInFlight && s.snapshot.statusChangedAt < changedBefore).slice(0, limit);
  }
  async findByUser(userId: string) { return [...this.items.values()].filter((s) => s.snapshot.userId === userId); }
}
