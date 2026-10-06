import { TestBed } from '@angular/core/testing';
import type { FitRecommendation, GarmentItem, TryOnSession } from '@vestirse/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from './api.service';
import { GenerationSocketService } from './generation-socket.service';
import { AppError } from './http/app-error';
import { NoticeStore } from './notice.store';
import { TryOnSessionStore } from './tryon-session.store';

const garment = { id: 'g1', name: 'Camisa', category: 'top', images: { front: 'f.svg', flat: 'x.svg' } } as GarmentItem;
const fit: FitRecommendation = { recommendedSize: 'M', confidence: 'medium', basis: [] };
const session = (over: Partial<TryOnSession> = {}): TryOnSession => ({
  id: 's1',
  garmentId: 'g1',
  mode: 'photorealistic',
  createdAt: '2026-01-01T00:00:00Z',
  generationStatus: 'idle',
  ...over,
});

const makeApi = () => ({
  garment: vi.fn().mockResolvedValue(garment),
  bodyModels: vi.fn().mockResolvedValue([]),
  modeUsed: vi.fn().mockResolvedValue(undefined),
  session: vi.fn(),
  startSession: vi.fn().mockResolvedValue(session()),
  generate: vi.fn(),
  overrideSize: vi.fn(),
  deletePhoto: vi.fn(),
  changeMode: vi.fn(),
});

describe('TryOnSessionStore', () => {
  let store: TryOnSessionStore;
  let api: ReturnType<typeof makeApi>;
  let notices: NoticeStore;
  let watch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    api = makeApi();
    watch = vi.fn().mockReturnValue(() => undefined);
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: api },
        { provide: GenerationSocketService, useValue: { watch } },
      ],
    });
    store = TestBed.inject(TryOnSessionStore);
    notices = TestBed.inject(NoticeStore);
  });

  it('elegir otra talla es optimista y se revierte si el servidor falla', async () => {
    store.garment.set(garment);
    store.fit.set(fit);
    api.overrideSize.mockRejectedValue(new AppError(0, 'network', 'offline'));
    const pending = store.overrideSize('L');
    expect(store.chosenSize()).toBe('L');
    await pending;
    expect(store.chosenSize()).toBe('M');
    expect(notices.notices()[0]).toMatchObject({ kind: 'error', key: 'errors.network' });
  });

  it('si no se puede encolar la generación, no se finge un fallback del proveedor', async () => {
    store.garment.set(garment);
    api.generate.mockRejectedValue(new AppError(409, 'conflict', 'ya hay una en curso'));
    await store.generate();
    expect(store.generation().status).toBe('idle');
    expect(notices.notices()[0].key).toBe('errors.generate');
  });

  it('recuerda la sesión por pestaña y, al recargar, retoma una generación en curso', async () => {
    store.garment.set(garment);
    await store.ensureSession();
    expect(JSON.parse(sessionStorage.getItem('vestirse:tryon-sessions')!)).toEqual({ g1: 's1' });

    // "Recarga": un store nuevo lee la pestaña y encuentra la sesión procesándose.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: { ...api, session: vi.fn().mockResolvedValue(session({ generationStatus: 'processing' })) } },
        { provide: GenerationSocketService, useValue: { watch } },
      ],
    });
    const reloaded = TestBed.inject(TryOnSessionStore);
    await reloaded.loadGarment('g1');
    expect(reloaded.session()?.id).toBe('s1');
    expect(reloaded.generation().status).toBe('processing');
    expect(watch).toHaveBeenCalledWith('s1', expect.any(Function));
  });

  it('el estado failed del servidor se refleja con su motivo', async () => {
    api.session.mockResolvedValue(session({ generationStatus: 'failed', failureReason: 'stuck' }));
    sessionStorage.setItem('vestirse:tryon-sessions', JSON.stringify({ g1: 's1' }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: api },
        { provide: GenerationSocketService, useValue: { watch } },
      ],
    });
    const s = TestBed.inject(TryOnSessionStore);
    await s.loadGarment('g1');
    expect(s.generation()).toMatchObject({ status: 'failed', fallbackReason: 'stuck' });
    expect(watch).not.toHaveBeenCalled();
  });

  it('borrar la foto solo confirma si el servidor lo hizo', async () => {
    store.session.set(session({ uploadedPhotoUrl: '/p' }));
    api.deletePhoto.mockRejectedValue(new AppError(500, 'internal', 'x'));
    expect(await store.deletePhoto()).toBe(false);
    expect(store.hasPhoto()).toBe(true);
  });
});
