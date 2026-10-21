import type { GarmentItem, SimilarBodyModel } from '@vestirse/shared-types';
import { describe, expect, it } from 'vitest';
import es from '../../../../public/i18n/es.json';
import { describeLook, fitWord } from './look-description';

type Dict = { [key: string]: string | Dict };

/** Traductor mínimo sobre el diccionario real, con {{param}} como Transloco. */
const t = (key: string, params: Record<string, unknown> = {}) => {
  const raw = key.split('.').reduce<Dict | string | undefined>((d, p) => (typeof d === 'object' ? d[p] : undefined), es as Dict);
  return typeof raw === 'string' ? raw.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => String(params[k])) : key;
};

const g = (id: string, name: string) => ({ id, name }) as GarmentItem;
const body = { bodyTypeTag: 'tall-slim', heightRangeCm: [175, 185] } as unknown as SimilarBodyModel;

describe('descripción del look', () => {
  it('nombra las prendas, la talla, la holgura y el modelo', () => {
    const text = describeLook([g('a', 'Camisa Oxford celeste'), g('b', 'Jean pitillo oscuro')], body, t, { a: { size: 'L', fit: { width: 1.06, length: 1.03 } } });
    expect(text).toContain('Camisa Oxford celeste (talla L, holgada)');
    expect(text).toContain(' y Jean pitillo oscuro');
    expect(text).toContain('175–185 cm');
    expect(text).not.toMatch(/look\.|body\./);
  });

  it('sin prendas lo dice, y sin modelo solo enumera', () => {
    expect(describeLook([], null, t)).not.toBe('look.describe.empty');
    expect(describeLook([g('a', 'Gorra negra')], null, t)).toBe('Gorra negra');
  });

  it('la holgura solo se menciona si cambia la talla', () => {
    expect(fitWord({ width: 1, length: 1 })).toBeNull();
    expect(fitWord({ width: 0.94, length: 0.97 })).toBe('snug');
  });
});
