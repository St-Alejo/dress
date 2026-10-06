import { ConfigService } from '@nestjs/config';
import { TransferUnavailableError, type TransferRequest } from '../application/garment-transfer.port';
import { AiWorkerAdapter, WorkerCallError } from './ai-worker.adapter';

const config = (extra: Record<string, unknown> = {}) =>
  new ConfigService({ AI_WORKER_URL: 'http://worker', GENERATION_TIMEOUT_SECONDS: 1, WORKER_TOKEN: 'tok', ...extra });

const request = (provider: 'mock' | 'fashn' = 'mock'): TransferRequest => ({
  requestId: 'sess-1-1',
  person: Buffer.from('person'),
  garments: [{ image: Buffer.from('g'), mime: 'image/png', category: 'top', name: 'Camisa', color: 'white', fit: 'regular fit' }],
  bodyBrief: 'person as shown in the photo',
  credentials: { provider, model: 'm', apiKey: 'k' },
});

const png = () =>
  new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { status: 200, headers: { 'X-Engine': 'mock', 'X-Duration-Ms': '12' } });
const error = (status: number, code: string, retryable: boolean) =>
  new Response(JSON.stringify({ code, detail: code, retryable }), { status, headers: { 'Content-Type': 'application/json' } });

describe('AiWorkerAdapter', () => {
  const realFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterAll(() => (global.fetch = realFetch));

  it('envía el contrato v1: manifest, imágenes y cabeceras de proveedor, token y correlación', async () => {
    fetchMock.mockResolvedValue(png());
    const result = await new AiWorkerAdapter(config()).generate(request());

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://worker/v1/generate');
    const headers = init.headers as Record<string, string>;
    expect(headers).toMatchObject({ 'X-AI-Provider': 'mock', 'X-AI-Model': 'm', 'X-AI-Key': 'k', 'X-Worker-Token': 'tok', 'X-Request-Id': 'sess-1-1' });
    const form = init.body as FormData;
    expect(JSON.parse(form.get('manifest') as string)).toMatchObject({ contractVersion: '1', requestId: 'sess-1-1', garments: [{ index: 0, category: 'top' }] });
    expect(form.getAll('garment_images')).toHaveLength(1);
    expect(result).toMatchObject({ engine: 'mock', durationMs: 12 });
  });

  it.each([
    [412, 'not-configured', false],
    [422, 'unsupported', false],
    [429, 'rate-limited', true],
    [502, 'provider-error', true],
  ])('status %i → %s (reintentable=%s)', async (status, code, retryable) => {
    fetchMock.mockResolvedValue(error(status, code, retryable));
    await expect(new AiWorkerAdapter(config()).generate(request())).rejects.toMatchObject({ reason: code, retryable });
  });

  it('el abort del fetch (TimeoutError) se clasifica como timeout, no como provider-error', async () => {
    fetchMock.mockRejectedValue(new DOMException('aborted', 'TimeoutError'));
    await expect(new AiWorkerAdapter(config()).generate(request())).rejects.toMatchObject({ reason: 'timeout', retryable: true });
  });

  it('worker caído (fetch failed) es transitorio', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(new AiWorkerAdapter(config()).generate(request())).rejects.toMatchObject({ reason: 'provider-error', retryable: true });
  });

  it('el circuito se abre por proveedor: fashn caído no bloquea al mock', async () => {
    const adapter = new AiWorkerAdapter(config());
    fetchMock.mockResolvedValue(error(502, 'provider-error', true));
    for (let i = 0; i < 4; i++) await adapter.generate(request('fashn')).catch(() => undefined);
    await expect(adapter.generate(request('fashn'))).rejects.toMatchObject({ reason: 'circuit-open', retryable: false });

    fetchMock.mockResolvedValue(png());
    await expect(adapter.generate(request('mock'))).resolves.toMatchObject({ engine: 'mock' });
  });

  it('errores de configuración no abren el circuito', async () => {
    const adapter = new AiWorkerAdapter(config());
    fetchMock.mockResolvedValue(error(412, 'not-configured', false));
    for (let i = 0; i < 5; i++) {
      await expect(adapter.generate(request('fashn'))).rejects.toMatchObject({ reason: 'not-configured' });
    }
  });

  it('classify respeta el orden: worker → timeout → circuito → transitorio', () => {
    expect(AiWorkerAdapter.classify(new WorkerCallError('content-policy', false))).toEqual(new TransferUnavailableError('content-policy', false));
    expect(AiWorkerAdapter.classify(Object.assign(new Error('t'), { code: 'ETIMEDOUT' })).reason).toBe('timeout');
    expect(AiWorkerAdapter.classify(Object.assign(new Error('o'), { code: 'EOPENBREAKER' })).reason).toBe('circuit-open');
    expect(AiWorkerAdapter.classify(new Error('?')).reason).toBe('provider-error');
  });
});
