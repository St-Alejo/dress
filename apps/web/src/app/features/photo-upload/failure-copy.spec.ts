import { describe, expect, it } from 'vitest';
import es from '../../../../public/i18n/es.json';
import en from '../../../../public/i18n/en.json';
import { failureCopy } from './failure-copy';

const lookup = (dict: unknown, key: string) => key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], dict);

describe('failureCopy', () => {
  it.each([
    ['fallback', 'rate-limited', 'photo.fallback.quota'],
    ['fallback', 'not-configured', 'photo.fallback.notConfigured'],
    ['fallback', 'content-policy', 'photo.fallback.contentPolicy'],
    ['failed', 'missing-input', 'photo.failed.missingPhoto'],
  ] as const)('%s/%s no ofrece reintentar', (status, reason, body) => {
    expect(failureCopy(status, reason)).toEqual({ body, canRetry: false });
  });

  it.each([
    ['fallback', 'circuit-open', 'photo.fallback.busy'],
    ['fallback', 'timeout', 'photo.fallback.timeout'],
    ['fallback', 'provider-error', 'photo.fallback.body'],
    ['failed', 'stuck', 'photo.failed.body'],
    ['failed', undefined, 'photo.failed.body'],
  ] as const)('%s/%s se puede reintentar', (status, reason, body) => {
    expect(failureCopy(status, reason)).toEqual({ body, canRetry: true });
  });

  it('todas las claves existen en español e inglés', () => {
    const reasons = ['rate-limited', 'not-configured', 'content-policy', 'circuit-open', 'timeout', 'missing-input', 'x'];
    for (const status of ['failed', 'fallback'] as const) {
      for (const r of reasons) {
        const key = failureCopy(status, r).body;
        expect(typeof lookup(es, key), `es: ${key}`).toBe('string');
        expect(typeof lookup(en, key), `en: ${key}`).toBe('string');
      }
    }
  });
});
