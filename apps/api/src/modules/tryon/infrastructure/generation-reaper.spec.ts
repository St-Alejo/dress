import { ConfigService } from '@nestjs/config';
import { MemorySessions } from '../../../testing/memory';
import type { MetricsService } from '../../metrics/metrics.module';
import { TryOnSession } from '../domain/tryon-session.entity';
import { GenerationReaper } from './generation-reaper';
import type { TryOnGateway } from './tryon.gateway';

const t0 = new Date('2026-01-01T10:00:00Z');
const minutes = (n: number) => new Date(t0.getTime() + n * 60_000);

function session(id: string, status: 'queued' | 'processing' | 'done') {
  const s = TryOnSession.start({ id, garmentId: 'g', mode: 'photorealistic', requester: { sid: 'sid' }, now: t0 });
  s.attachPhoto(t0, 24);
  s.requestGeneration(t0);
  if (status !== 'queued') s.markProcessing(t0);
  if (status === 'done') s.complete(t0);
  return s;
}

describe('GenerationReaper', () => {
  let sessions: MemorySessions;
  let emit: jest.Mock;
  let reaper: GenerationReaper;

  beforeEach(() => {
    sessions = new MemorySessions();
    emit = jest.fn();
    reaper = new GenerationReaper(
      sessions,
      { emit } as unknown as TryOnGateway,
      { record: jest.fn() } as unknown as MetricsService,
      new ConfigService({ GENERATION_STUCK_SECONDS: 300 }),
    );
  });

  it('marca como failed(stuck) las generaciones sin avance y avisa por socket', async () => {
    await sessions.create(session('q', 'queued'));
    await sessions.create(session('p', 'processing'));
    await sessions.create(session('d', 'done'));

    expect(await reaper.reap(minutes(4))).toBe(0);
    expect(await reaper.reap(minutes(6))).toBe(2);

    expect((await sessions.findById('q'))!.toDto()).toMatchObject({ generationStatus: 'failed', failureReason: 'stuck' });
    expect((await sessions.findById('p'))!.status).toBe('failed');
    expect((await sessions.findById('d'))!.status).toBe('done');
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'p', status: 'failed' }));
  });

  it('tras el rescate la persona puede volver a intentarlo', async () => {
    await sessions.create(session('p', 'processing'));
    await reaper.reap(minutes(10));
    const s = (await sessions.findById('p'))!;
    expect(() => s.requestGeneration(minutes(11))).not.toThrow();
    expect(s.toDto()).toMatchObject({ generationStatus: 'queued', failureReason: undefined });
  });
});
