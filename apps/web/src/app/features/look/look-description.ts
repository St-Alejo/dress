import type { GarmentItem, SimilarBodyModel } from '@vestirse/shared-types';
import type { Fit } from '../live-overlay/engine/rig';

type Translate = (key: string, params?: Record<string, unknown>) => string;

/** Cómo se ve la talla elegida frente a la habitual del modelo, en palabras. */
export function fitWord(fit: Fit | undefined): 'loose' | 'snug' | null {
  if (!fit) return null;
  if (fit.width > 1.02) return 'loose';
  if (fit.width < 0.98) return 'snug';
  return null;
}

/**
 * Descripción en texto de lo que se ve en el escenario, para lectores de pantalla y para
 * quien no distingue bien la imagen: "Camisa Oxford celeste (talla L, holgada) y Jean
 * pitillo oscuro, sobre el modelo Alta, complexión media, 175–185 cm".
 */
export function describeLook(
  garments: GarmentItem[],
  body: SimilarBodyModel | null,
  t: Translate,
  sizes: Record<string, { size?: string; fit?: Fit }> = {},
): string {
  if (!garments.length) return t('look.describe.empty');
  const parts = garments.map((g) => {
    const s = sizes[g.id];
    const word = fitWord(s?.fit);
    const detail = [s?.size ? t('look.describe.size', { size: s.size }) : '', word ? t('look.describe.' + word) : ''].filter(Boolean).join(', ');
    return detail ? `${g.name} (${detail})` : g.name;
  });
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} ${t('look.describe.and')} ${parts[parts.length - 1]}`;
  if (!body) return list;
  return t('look.describe.onBody', { list, body: t('body.tag.' + body.bodyTypeTag), min: body.heightRangeCm[0], max: body.heightRangeCm[1] });
}
