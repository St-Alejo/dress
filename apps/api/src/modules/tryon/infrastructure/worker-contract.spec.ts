import Ajv2020 from 'ajv/dist/2020';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RETRYABLE_WORKER_ERRORS, WORKER_ERROR_STATUS, workerErrorFromStatus } from '@vestirse/shared-types';
import { buildManifest, parseWorkerError } from './ai-worker.adapter';

const CONTRACT = join(__dirname, '../../../../../../contracts/ai-worker/v1');
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const fixtures = (kind: 'valid' | 'invalid') =>
  readdirSync(join(CONTRACT, 'fixtures', kind)).map((f) => [f, read(join(CONTRACT, 'fixtures', kind, f))] as const);

const ajv = new Ajv2020({ allErrors: true });
const validateManifest = ajv.compile(read(join(CONTRACT, 'manifest.schema.json')));
const errorsSchema = read(join(CONTRACT, 'errors.schema.json'));
const validateError = ajv.compile(errorsSchema);

describe('Contrato API↔worker v1', () => {
  it.each(fixtures('valid'))('acepta el fixture válido %s', (_name, body) => {
    expect(validateManifest(body)).toBe(true);
  });

  it.each(fixtures('invalid'))('rechaza el fixture inválido %s', (_name, body) => {
    expect(validateManifest(body)).toBe(false);
  });

  it('el manifest que arma el adapter cumple el schema y no lleva medidas', () => {
    const manifest = buildManifest({
      requestId: 'sess-1',
      person: Buffer.from(''),
      garments: [
        { image: Buffer.from(''), mime: 'image/png', category: 'top', name: 'Camisa', color: 'white', fit: 'regular fit' },
        { image: Buffer.from(''), mime: 'image/png', category: 'bottom', name: 'Chino', color: 'beige', fit: 'regular fit' },
      ],
      bodyBrief: 'tall person',
      credentials: { provider: 'mock', apiKey: 'secreto' },
    });
    expect(validateManifest(manifest)).toBe(true);
    expect(manifest.garments.map((g) => g.index)).toEqual([0, 1]);
    expect(JSON.stringify(manifest)).not.toMatch(/secreto|heightCm|weightKg/);
  });

  it('la tabla de status cubre exactamente los códigos del schema de errores', () => {
    expect(Object.keys(WORKER_ERROR_STATUS).sort()).toEqual([...errorsSchema.properties.code.enum].sort());
    for (const [code, status] of Object.entries(WORKER_ERROR_STATUS)) {
      expect(workerErrorFromStatus(status)).toBe(code);
      expect(validateError({ code, detail: 'x', retryable: RETRYABLE_WORKER_ERRORS.has(code as never) })).toBe(true);
    }
  });

  it('interpreta el cuerpo del worker y, si no respeta el contrato, deduce por status', () => {
    expect(parseWorkerError(412, { code: 'not-configured', detail: 'falta clave', retryable: false })).toMatchObject({ code: 'not-configured', retryable: false });
    expect(parseWorkerError(503, null)).toMatchObject({ code: 'provider-error', retryable: true });
    expect(parseWorkerError(504, '<html>')).toMatchObject({ code: 'timeout', retryable: true });
    expect(parseWorkerError(418, {})).toMatchObject({ code: 'bad-input', retryable: false });
  });
});
