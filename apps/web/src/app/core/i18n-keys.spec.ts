/**
 * Español e inglés deben tener exactamente las mismas claves: una clave que
 * falta se muestra cruda en pantalla ("photo.failed.title") en vez del texto.
 */
import { describe, expect, it } from 'vitest';
import en from '../../../public/i18n/en.json';
import es from '../../../public/i18n/es.json';

type Dict = { [key: string]: string | Dict };

function keys(d: Dict, prefix = ''): string[] {
  return Object.entries(d).flatMap(([k, v]) => (typeof v === 'string' ? [prefix + k] : keys(v, `${prefix}${k}.`)));
}

describe('traducciones', () => {
  it('es y en tienen el mismo conjunto de claves', () => {
    const esKeys = new Set(keys(es as Dict));
    const enKeys = new Set(keys(en as Dict));
    expect([...esKeys].filter((k) => !enKeys.has(k))).toEqual([]);
    expect([...enKeys].filter((k) => !esKeys.has(k))).toEqual([]);
  });

  it('ningún texto visible quedó vacío', () => {
    for (const [lang, dict] of [['es', es], ['en', en]] as const) {
      const empty = keys(dict as Dict).filter((k) => k.split('.').reduce<Dict | string>((d, p) => (d as Dict)[p], dict as Dict) === '');
      expect(empty, lang).toEqual([]);
    }
  });
});
