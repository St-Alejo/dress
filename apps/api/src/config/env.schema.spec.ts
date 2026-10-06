import { validateEnv } from './env.schema';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'vestirse',
  S3_ACCESS_KEY: 'a',
  S3_SECRET_KEY: 'b',
  JWT_SECRET: 'x'.repeat(32),
  APP_ENCRYPTION_KEY: 'y'.repeat(32),
  AI_WORKER_URL: 'http://ai-worker:8000',
};

describe('validateEnv', () => {
  it('acepta una configuración completa (los valores llegan como strings)', () => {
    expect(validateEnv({ ...valid, PORT: '3000', PHOTO_TTL_HOURS: '24' })).toMatchObject(valid);
  });

  it('falla al arrancar si falta algo obligatorio, nombrando cada variable', () => {
    const { JWT_SECRET: _j, AI_WORKER_URL: _a, ...rest } = valid;
    expect(() => validateEnv(rest)).toThrow(/JWT_SECRET[\s\S]*AI_WORKER_URL|AI_WORKER_URL[\s\S]*JWT_SECRET/);
  });

  it('rechaza secretos cortos', () => {
    expect(() => validateEnv({ ...valid, APP_ENCRYPTION_KEY: 'corta' })).toThrow(/APP_ENCRYPTION_KEY/);
  });

  it('no permite un TTL de foto mayor que la regla de borrado del bucket', () => {
    expect(() => validateEnv({ ...valid, PHOTO_TTL_HOURS: '48' })).toThrow(/PHOTO_TTL_HOURS/);
  });

  it('rechaza proveedores de IA desconocidos', () => {
    expect(() => validateEnv({ ...valid, AI_PROVIDER: 'otro' })).toThrow(/AI_PROVIDER/);
  });

  it('en producción exige WORKER_TOKEN', () => {
    expect(() => validateEnv({ ...valid, NODE_ENV: 'production' })).toThrow(/WORKER_TOKEN/);
    expect(() => validateEnv({ ...valid, NODE_ENV: 'production', WORKER_TOKEN: 't' })).not.toThrow();
  });
});
