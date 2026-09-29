/**
 * Invariantes éticas verificadas a nivel de tipos (sección 15, punto 4).
 * Si alguien vuelve obligatoria la foto o quita el override de talla, esto falla.
 */
import { describe, expectTypeOf, test } from 'vitest';
import type { FitRecommendation, TryOnSession } from './index';

type IsOptional<T, K extends keyof T> = {} extends Pick<T, K> ? true : false;

describe('invariantes éticas del modelo de datos', () => {
  test('regla 1: uploadedPhotoUrl es opcional — nunca se obliga a subir foto', () => {
    expectTypeOf<IsOptional<TryOnSession, 'uploadedPhotoUrl'>>().toEqualTypeOf<true>();
  });

  test('una sesión válida puede existir sin foto y sin cuenta', () => {
    const session: TryOnSession = {
      id: 's1',
      garmentId: 'g1',
      mode: 'similar-model',
      createdAt: new Date().toISOString(),
    };
    expectTypeOf(session).toMatchTypeOf<TryOnSession>();
    expectTypeOf<IsOptional<TryOnSession, 'userId'>>().toEqualTypeOf<true>();
  });

  test('regla 5: la confianza es obligatoria y el override siempre existe', () => {
    expectTypeOf<IsOptional<FitRecommendation, 'confidence'>>().toEqualTypeOf<false>();
    expectTypeOf<FitRecommendation>().toHaveProperty('userOverride');
    expectTypeOf<FitRecommendation['basis']>().toEqualTypeOf<string[]>();
  });
});
