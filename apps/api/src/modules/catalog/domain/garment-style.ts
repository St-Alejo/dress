/** Tipo de prenda: decide el patronaje (holguras y largos) con el que se calculan las tallas. */
export const GARMENT_STYLES = [
  'tshirt',
  'shirt',
  'hoodie',
  'sweater',
  'jacket',
  'coat',
  'jeans',
  'trousers',
  'shorts',
  'skirt',
  'dress-a',
  'dress-wrap',
  'sneakers',
  'boots',
  'scarf',
  'cap',
  'bag',
] as const;
export type GarmentStyle = (typeof GARMENT_STYLES)[number];
