import type { Job } from 'bullmq';
import type { GarmentItem } from '@vestirse/shared-types';
import { MemorySessions, MemoryStorage } from '../../../testing/memory';
import type { AiSettingsService } from '../../ai-settings/ai-settings.module';
import type { CatalogRepository } from '../../catalog/application/catalog.repository';
import type { MetricsService } from '../../metrics/metrics.module';
import { GarmentTransferPort, TransferUnavailableError, type TransferRequest, type TransferResult } from '../application/garment-transfer.port';
import type { GenerationJob } from '../application/tryon.service';
import { TryOnSession } from '../domain/tryon-session.entity';
import { GenerationProcessor } from './generation.processor';
import type { TryOnGateway } from './tryon.gateway';

const PHOTO = Buffer.from('jpeg');

class FakeTransfer extends GarmentTransferPort {
  calls: TransferRequest[] = [];
  next: () => Promise<TransferResult> = async () => ({ image: Buffer.from('png'), engine: 'mock', durationMs: 5 });
  async generate(req: TransferRequest) {
    this.calls.push(req);
    return this.next();
  }
}

const garment = { id: 'g1', name: 'Camisa', category: 'top', color: 'white' } as GarmentItem;

function setup() {
  const sessions = new MemorySessions();
  const storage = new MemoryStorage();
  const transfer = new FakeTransfer();
  const emit = jest.fn();
  const record = jest.fn();
  const catalog = {
    findGarment: async () => garment,
    garmentPhoto: async () => ({ key: 'catalog/garments/g1/photo.jpg', photoType: 'model' }),
  } as unknown as CatalogRepository;
  const aiSettings = { resolve: async () => ({ provider: 'mock' as const }) } as AiSettingsService;
  const processor = new GenerationProcessor(
    sessions,
    catalog,
    storage,
    transfer,
    aiSettings,
    { emit } as unknown as TryOnGateway,
    { record } as unknown as MetricsService,
  );
  storage.objects.set('catalog/garments/g1/photo.jpg', PHOTO);
  return { sessions, storage, transfer, emit, record, processor };
}

async function queuedSession(env: ReturnType<typeof setup>, withPhoto = true) {
  const s = TryOnSession.start({ id: 's1', garmentId: 'g1', mode: 'photorealistic', requester: { sid: 'sid' }, now: new Date() });
  s.attachPhoto(new Date(), 24);
  s.requestGeneration();
  if (withPhoto) await env.storage.put(s.photoKey!, Buffer.from('jpeg'));
  else s.purgePhoto();
  await env.sessions.create(s);
  return s;
}

/** Otra sesión ya terminada, con su foto y su resultado guardados. */
async function finishedSession(env: ReturnType<typeof setup>, args: { id: string; sid?: string; garmentId?: string; photo?: string }) {
  const s = TryOnSession.start({ id: args.id, garmentId: args.garmentId ?? 'g1', mode: 'photorealistic', requester: { sid: args.sid ?? 'sid' }, now: new Date() });
  s.attachPhoto(new Date(), 24);
  s.requestGeneration();
  s.complete();
  await env.storage.put(s.photoKey!, Buffer.from(args.photo ?? 'jpeg'));
  await env.storage.put(s.resultKey!, Buffer.from('anterior'));
  await env.sessions.create(s);
  return s;
}

const job = (attemptsMade = 0, attempts = 3) => ({ data: { sessionId: 's1' }, attemptsMade, opts: { attempts } }) as Job<GenerationJob>;

describe('GenerationProcessor', () => {
  it('genera con el contrato completo y guarda el resultado', async () => {
    const env = setup();
    await queuedSession(env);
    await env.processor.process(job());

    const req = env.transfer.calls[0];
    expect(req.garments).toEqual([expect.objectContaining({ category: 'top', name: 'Camisa', mime: 'image/jpeg', photoType: 'model' })]);
    expect(req.credentials.provider).toBe('mock');
    expect(req.requestId).toBe('s1-1');
    expect(req.bodyBrief).not.toMatch(/\d/);
    const s = (await env.sessions.findById('s1'))!;
    expect(s.status).toBe('done');
    expect(env.storage.objects.get(s.resultKey!)).toEqual(Buffer.from('png'));
    expect(env.emit).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'done' }));
  });

  it('reutiliza el resultado si la misma persona ya probó esa prenda con la misma foto', async () => {
    const env = setup();
    await finishedSession(env, { id: 's0' });
    await queuedSession(env);
    await env.processor.process(job());

    expect(env.transfer.calls).toHaveLength(0);
    const s = (await env.sessions.findById('s1'))!;
    expect(s.status).toBe('done');
    expect(env.storage.objects.get(s.resultKey!)).toEqual(Buffer.from('anterior'));
  });

  it.each([
    ['de otra persona', { sid: 'otra' }],
    ['de otra prenda', { garmentId: 'g2' }],
    ['con otra foto', { photo: 'distinta' }],
  ])('no reutiliza un resultado %s', async (_caso, other) => {
    const env = setup();
    await finishedSession(env, { id: 's0', ...other });
    await queuedSession(env);
    await env.processor.process(job());
    expect(env.transfer.calls).toHaveLength(1);
  });

  it('volver a generar en la misma sesión pide una imagen nueva al motor', async () => {
    const env = setup();
    await finishedSession(env, { id: 's0' });
    const s = await queuedSession(env);
    s.complete();
    s.requestGeneration();
    await env.processor.process(job());
    expect(env.transfer.calls).toHaveLength(1);
  });

  it('sin foto la sesión termina en failed en vez de quedar en cola', async () => {
    const env = setup();
    const s = await queuedSession(env, false);
    expect(s.photoKey).toBeUndefined();
    await env.processor.process(job());
    expect((await env.sessions.findById('s1'))!.toDto()).toMatchObject({ generationStatus: 'failed', failureReason: 'no-photo' });
  });

  it('un fallo transitorio se relanza para que BullMQ reintente', async () => {
    const env = setup();
    await queuedSession(env);
    env.transfer.next = () => Promise.reject(new TransferUnavailableError('timeout', true));
    await expect(env.processor.process(job(0))).rejects.toBeInstanceOf(TransferUnavailableError);
    expect((await env.sessions.findById('s1'))!.status).toBe('processing');
  });

  it('en el último intento el fallo transitorio pasa a fallback', async () => {
    const env = setup();
    await queuedSession(env);
    env.transfer.next = () => Promise.reject(new TransferUnavailableError('timeout', true));
    await env.processor.process(job(2));
    expect((await env.sessions.findById('s1'))!.toDto()).toMatchObject({ generationStatus: 'fallback', failureReason: 'timeout' });
    expect(env.record).toHaveBeenCalledWith('generation-failed', expect.objectContaining({ reason: 'timeout' }));
  });

  it('un fallo definitivo del proveedor da fallback inmediato, sin reintentos', async () => {
    const env = setup();
    await queuedSession(env);
    env.transfer.next = () => Promise.reject(new TransferUnavailableError('not-configured', false));
    await env.processor.process(job(0));
    expect((await env.sessions.findById('s1'))!.status).toBe('fallback');
  });

  it('descarta el trabajo si la sesión ya no está en curso (p. ej. la rescató el reaper)', async () => {
    const env = setup();
    const s = await queuedSession(env);
    s.fail('stuck');
    await env.processor.process(job());
    expect(env.transfer.calls).toHaveLength(0);
    expect((await env.sessions.findById('s1'))!.status).toBe('failed');
  });

  it('si la persona borra la foto durante la generación, el resultado se descarta', async () => {
    const env = setup();
    await queuedSession(env);
    env.transfer.next = async () => {
      (await env.sessions.findById('s1'))!.purgePhoto();
      return { image: Buffer.from('png'), engine: 'mock', durationMs: 1 };
    };
    await env.processor.process(job());
    expect([...env.storage.objects.keys()].some((k) => k.endsWith('result.png'))).toBe(false);
  });
});
