import type { GarmentCategory } from '@vestirse/shared-types';
import type { ObjectStorage } from '../../../../common/storage';
import { REFERENCE_SHAPE } from './body-geometry';
import type { GarmentArt } from './garment-art';
import { renderAvatar, renderFlat, renderOverlay, renderPreview, type AvatarSpec } from './renderer';

const SVG = 'image/svg+xml';
const buf = (s: string) => Buffer.from(s, 'utf8');

/** Acompañante neutro para que el preview de, p. ej., una camiseta no quede sin pantalón. */
const COMPANION: Partial<Record<GarmentCategory, GarmentArt>> = {
  top: { id: 'companion-trousers', style: 'trousers', color: '#2f2f35', pattern: 'solid' },
  outerwear: { id: 'companion-jeans', style: 'jeans', color: '#2e4a6b', pattern: 'solid' },
  footwear: { id: 'companion-jeans', style: 'jeans', color: '#2e4a6b', pattern: 'solid' },
  accessory: { id: 'companion-tee', style: 'tshirt', color: '#f2efe9', pattern: 'solid' },
};

export const REFERENCE_AVATAR: AvatarSpec = { shape: REFERENCE_SHAPE, skinTone: '#C99A74', hair: 'short', hairColor: '#2b1b12' };

/**
 * Renderiza y publica en el almacenamiento las ilustraciones del catálogo.
 * Clase simple (sin DI) para poder usarla desde el seed y desde el panel admin.
 */
export class IllustrationPublisher {
  constructor(private readonly storage: ObjectStorage) {}

  withCompanion(category: GarmentCategory, art: GarmentArt): GarmentArt[] {
    const companion = COMPANION[category];
    return companion ? [companion, art] : [art];
  }

  async publishGarment(key: string, category: GarmentCategory, art: GarmentArt) {
    const keys = {
      front: `catalog/garments/${key}/front.svg`,
      flat: `catalog/garments/${key}/flat.svg`,
      overlay: `catalog/garments/${key}/overlay.svg`,
    };
    await Promise.all([
      this.storage.put(keys.front, buf(renderPreview(REFERENCE_AVATAR, this.withCompanion(category, art))), SVG),
      this.storage.put(keys.flat, buf(renderFlat(art)), SVG),
      this.storage.put(keys.overlay, buf(renderOverlay(art)), SVG),
    ]);
    return keys;
  }

  async publishAvatar(bodyKey: string, spec: AvatarSpec) {
    const key = `catalog/bodies/${bodyKey}/avatar.svg`;
    await this.storage.put(key, buf(renderAvatar(spec)), SVG);
    return key;
  }

  async publishPreview(bodyKey: string, garmentKey: string, spec: AvatarSpec, category: GarmentCategory, art: GarmentArt) {
    const key = `catalog/bodies/${bodyKey}/previews/${garmentKey}.svg`;
    await this.storage.put(key, buf(renderPreview(spec, this.withCompanion(category, art))), SVG);
    return key;
  }
}
