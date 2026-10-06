import type { PrismaService } from '../../common/prisma.service';
import { MemorySessions, MemoryStorage } from '../../testing/memory';
import { TryOnSession } from '../tryon/domain/tryon-session.entity';
import { RetentionService } from './privacy.module';

function sessionWithPhoto(id: string, createdAt: Date, userId?: string) {
  const s = TryOnSession.start({ id, garmentId: 'g', mode: 'similar-model', requester: { sid: 'sid-' + id, userId }, now: createdAt });
  s.attachPhoto(createdAt, 24);
  s.requestGeneration();
  s.complete();
  return s;
}

describe('RetentionService (sección 8)', () => {
  let storage: MemoryStorage;
  let sessions: MemorySessions;
  let userDeleted: string | undefined;
  let service: RetentionService;

  beforeEach(async () => {
    storage = new MemoryStorage();
    sessions = new MemorySessions();
    userDeleted = undefined;
    const prisma = { user: { delete: async ({ where }: { where: { id: string } }) => (userDeleted = where.id) } } as unknown as PrismaService;
    service = new RetentionService(sessions, storage, prisma);
  });

  async function add(s: TryOnSession) {
    await sessions.create(s);
    await storage.put(s.snapshot.photoKey!, Buffer.from('p'));
    await storage.put(s.snapshot.resultKey!, Buffer.from('r'));
  }

  it('borra de verdad las fotos y resultados vencidos, y deja los vigentes', async () => {
    await add(sessionWithPhoto('old', new Date('2026-01-01T00:00:00Z')));
    await add(sessionWithPhoto('new', new Date('2026-01-02T12:00:00Z')));
    const purged = await service.purgeExpired(new Date('2026-01-02T13:00:00Z'));
    expect(purged).toBe(1);
    expect([...storage.objects.keys()].sort()).toEqual(['uploads/sessions/new/photo.jpg', 'uploads/sessions/new/result.png']);
    expect((await sessions.findById('old'))!.toDto().uploadedPhotoUrl).toBeUndefined();
  });

  it('borrar la cuenta elimina los objetos del almacenamiento, no solo un flag', async () => {
    await add(sessionWithPhoto('mine', new Date(), 'u1'));
    await add(sessionWithPhoto('other', new Date(), 'u2'));
    const result = await service.deleteAccount('u1');
    expect(result.deletedObjects).toBe(2);
    expect(userDeleted).toBe('u1');
    expect([...storage.objects.keys()].every((k) => k.includes('/other/'))).toBe(true);
  });
});
