import type { GarmentCategory, LetterSize } from '@vestirse/shared-types';
import type { BodyShape } from '../modules/catalog/infrastructure/illustration/body-geometry';
import type { GarmentStyle, Pattern } from '../modules/catalog/infrastructure/illustration/garment-art';
import type { HairStyle } from '../modules/catalog/infrastructure/illustration/renderer';

/**
 * Catálogo "cuerpo similar al mío" (sección 4, regla 4): cubre XS–4XL y
 * 150–195 cm desde el primer commit, con tonos de piel variados.
 * Las etiquetas son claves i18n descriptivas, nunca juicios.
 */
export interface SeedBody {
  key: string;
  bodyTypeTag: string;
  typicalSize: LetterSize;
  heightRange: [number, number];
  shape: BodyShape;
  skinTone: string;
  hair: HairStyle;
  hairColor: string;
}

const SKIN = ['#F5D6C6', '#E8B998', '#D39B6F', '#A86B45', '#7D4A2D', '#4F2F1D'];

export const BODIES: SeedBody[] = [
  { key: 'b01', bodyTypeTag: 'petite-slim', typicalSize: 'XS', heightRange: [150, 158], shape: { heightCm: 154, shoulderCm: 36, chestCm: 80, waistCm: 63, hipCm: 86 }, skinTone: SKIN[1], hair: 'bun', hairColor: '#2b1b12' },
  { key: 'b02', bodyTypeTag: 'petite-curvy', typicalSize: 'M', heightRange: [150, 160], shape: { heightCm: 156, shoulderCm: 38, chestCm: 96, waistCm: 77, hipCm: 104 }, skinTone: SKIN[3], hair: 'curly', hairColor: '#1d1410' },
  { key: 'b03', bodyTypeTag: 'average-straight', typicalSize: 'S', heightRange: [162, 170], shape: { heightCm: 166, shoulderCm: 40, chestCm: 87, waistCm: 72, hipCm: 91 }, skinTone: SKIN[0], hair: 'long', hairColor: '#b8894a' },
  { key: 'b04', bodyTypeTag: 'average-curvy', typicalSize: 'L', heightRange: [160, 170], shape: { heightCm: 165, shoulderCm: 39, chestCm: 103, waistCm: 83, hipCm: 110 }, skinTone: SKIN[4], hair: 'long', hairColor: '#120c09' },
  { key: 'b05', bodyTypeTag: 'athletic', typicalSize: 'M', heightRange: [172, 180], shape: { heightCm: 176, shoulderCm: 46, chestCm: 98, waistCm: 78, hipCm: 95 }, skinTone: SKIN[2], hair: 'short', hairColor: '#20150f' },
  { key: 'b06', bodyTypeTag: 'average-broad', typicalSize: 'L', heightRange: [172, 182], shape: { heightCm: 177, shoulderCm: 47, chestCm: 106, waistCm: 92, hipCm: 103 }, skinTone: SKIN[1], hair: 'short', hairColor: '#5a3b24' },
  { key: 'b07', bodyTypeTag: 'tall-slim', typicalSize: 'M', heightRange: [180, 190], shape: { heightCm: 185, shoulderCm: 44, chestCm: 93, waistCm: 77, hipCm: 93 }, skinTone: SKIN[5], hair: 'none', hairColor: '#000000' },
  { key: 'b08', bodyTypeTag: 'tall-broad', typicalSize: 'XL', heightRange: [184, 195], shape: { heightCm: 190, shoulderCm: 50, chestCm: 113, waistCm: 98, hipCm: 108 }, skinTone: SKIN[0], hair: 'short', hairColor: '#d9c29a' },
  { key: 'b09', bodyTypeTag: 'plus-hourglass', typicalSize: 'XXL', heightRange: [162, 172], shape: { heightCm: 167, shoulderCm: 42, chestCm: 120, waistCm: 100, hipCm: 124 }, skinTone: SKIN[2], hair: 'long', hairColor: '#3a2416' },
  { key: 'b10', bodyTypeTag: 'plus-round', typicalSize: '3XL', heightRange: [168, 178], shape: { heightCm: 173, shoulderCm: 46, chestCm: 128, waistCm: 118, hipCm: 128 }, skinTone: SKIN[4], hair: 'short', hairColor: '#0d0a08' },
  { key: 'b11', bodyTypeTag: 'plus-tall', typicalSize: '4XL', heightRange: [180, 192], shape: { heightCm: 186, shoulderCm: 50, chestCm: 136, waistCm: 126, hipCm: 136 }, skinTone: SKIN[3], hair: 'curly', hairColor: '#241810' },
  { key: 'b12', bodyTypeTag: 'mid-soft', typicalSize: 'XL', heightRange: [165, 175], shape: { heightCm: 170, shoulderCm: 43, chestCm: 111, waistCm: 99, hipCm: 113 }, skinTone: SKIN[5], hair: 'bun', hairColor: '#0d0a08' },
];

export interface SeedBrand {
  key: string;
  name: string;
  /** Correcciones históricas simuladas para demostrar la calibración por marca. */
  calibration?: { category: GarmentCategory; sampleSize: number; shiftSum: number }[];
}

export const BRANDS: SeedBrand[] = [
  { key: 'norte', name: 'Norte' },
  { key: 'lumbre', name: 'Lumbre', calibration: [{ category: 'top', sampleSize: 34, shiftSum: 26 }, { category: 'dress', sampleSize: 22, shiftSum: 15 }] },
  { key: 'brisa', name: 'Brisa', calibration: [{ category: 'outerwear', sampleSize: 28, shiftSum: -20 }] },
  { key: 'taller', name: 'Taller 12' },
];

type Range = [number, number];
export interface SeedSizeEntry {
  size: string;
  chest?: Range;
  waist?: Range;
  hip?: Range;
  height?: Range;
}

const LETTER: Record<LetterSize, { chest: Range; waist: Range; hip: Range }> = {
  XS: { chest: [78, 84], waist: [60, 66], hip: [84, 90] },
  S: { chest: [85, 91], waist: [67, 73], hip: [91, 97] },
  M: { chest: [92, 99], waist: [74, 81], hip: [98, 104] },
  L: { chest: [100, 107], waist: [82, 89], hip: [105, 111] },
  XL: { chest: [108, 115], waist: [90, 98], hip: [112, 118] },
  XXL: { chest: [116, 123], waist: [99, 107], hip: [119, 125] },
  '3XL': { chest: [124, 131], waist: [108, 116], hip: [126, 132] },
  '4XL': { chest: [132, 140], waist: [117, 126], hip: [133, 140] },
};
const ALL_LETTERS = Object.keys(LETTER) as LetterSize[];

/** Tabla detallada por tallas alfabéticas; `keys` elige qué medidas publica la marca. */
function letterChart(keys: ('chest' | 'waist' | 'hip')[], sizes: LetterSize[] = ALL_LETTERS): SeedSizeEntry[] {
  return sizes.map((size) => {
    const e: SeedSizeEntry = { size };
    for (const k of keys) e[k] = LETTER[size][k];
    return e;
  });
}
/** Tabla genérica sin medidas (solo nombres de talla): la confianza será media con altura. */
const genericLetters = (sizes: LetterSize[] = ALL_LETTERS): SeedSizeEntry[] => sizes.map((size) => ({ size }));
/** Tallas numéricas de pantalón con cintura/cadera. */
const numericBottoms = (): SeedSizeEntry[] =>
  [36, 38, 40, 42, 44, 46, 48, 50].map((n, i) => ({
    size: String(n),
    waist: [64 + i * 6, 69 + i * 6] as Range,
    hip: [88 + i * 6, 93 + i * 6] as Range,
  }));
const shoeSizes = (): SeedSizeEntry[] => ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'].map((size) => ({ size }));
const oneSize = (): SeedSizeEntry[] => [{ size: 'Única' }];

export interface SeedGarment {
  key: string;
  name: string;
  brand: string;
  category: GarmentCategory;
  style: GarmentStyle;
  color: string;
  pattern: Pattern;
  priceCents: number;
  stretch: 'none' | 'low' | 'medium' | 'high';
  fabricNotes?: string;
  knownLimitations?: string[];
  sizeChart: SeedSizeEntry[];
}

const PATTERN_LIMIT = 'limitation.complexPattern';

export const GARMENTS: SeedGarment[] = [
  { key: 'g01', name: 'Camiseta básica de algodón', brand: 'norte', category: 'top', style: 'tshirt', color: '#f2efe9', pattern: 'solid', priceCents: 1999, stretch: 'medium', fabricNotes: 'fabric.cottonJersey', sizeChart: letterChart(['chest', 'waist']) },
  { key: 'g02', name: 'Camiseta a rayas marinera', brand: 'lumbre', category: 'top', style: 'tshirt', color: '#1f3a5f', pattern: 'stripes', priceCents: 2699, stretch: 'low', fabricNotes: 'fabric.heavyCotton', knownLimitations: [PATTERN_LIMIT], sizeChart: letterChart(['chest']) },
  { key: 'g03', name: 'Camisa Oxford', brand: 'norte', category: 'top', style: 'shirt', color: '#a9c4e0', pattern: 'solid', priceCents: 4499, stretch: 'none', fabricNotes: 'fabric.oxfordNoStretch', sizeChart: letterChart(['chest', 'waist']) },
  { key: 'g04', name: 'Camisa de cuadros de franela', brand: 'taller', category: 'top', style: 'shirt', color: '#8c2f2f', pattern: 'check', priceCents: 4699, stretch: 'none', fabricNotes: 'fabric.flannel', knownLimitations: [PATTERN_LIMIT], sizeChart: genericLetters() },
  { key: 'g05', name: 'Suéter de punto', brand: 'lumbre', category: 'top', style: 'sweater', color: '#c8a165', pattern: 'solid', priceCents: 5999, stretch: 'medium', fabricNotes: 'fabric.knitRelaxed', sizeChart: letterChart(['chest']) },
  { key: 'g06', name: 'Buzo con capucha', brand: 'brisa', category: 'top', style: 'hoodie', color: '#4d5b4a', pattern: 'solid', priceCents: 6499, stretch: 'medium', fabricNotes: 'fabric.fleeceOversize', sizeChart: letterChart(['chest', 'waist']) },
  { key: 'g07', name: 'Chaqueta de mezclilla', brand: 'norte', category: 'outerwear', style: 'jacket', color: '#3f5f86', pattern: 'solid', priceCents: 8999, stretch: 'none', fabricNotes: 'fabric.rigidDenim', sizeChart: letterChart(['chest']) },
  { key: 'g08', name: 'Abrigo largo de paño', brand: 'brisa', category: 'outerwear', style: 'coat', color: '#6b5646', pattern: 'solid', priceCents: 14499, stretch: 'none', fabricNotes: 'fabric.woolCoat', knownLimitations: ['limitation.looseFit'], sizeChart: letterChart(['chest', 'hip']) },
  { key: 'g09', name: 'Chaqueta liviana', brand: 'brisa', category: 'outerwear', style: 'jacket', color: '#d9d2b0', pattern: 'solid', priceCents: 7999, stretch: 'low', sizeChart: letterChart(['chest']) },
  { key: 'g10', name: 'Jean recto', brand: 'taller', category: 'bottom', style: 'jeans', color: '#2e4a6b', pattern: 'solid', priceCents: 6999, stretch: 'low', fabricNotes: 'fabric.denimLowStretch', sizeChart: numericBottoms() },
  { key: 'g11', name: 'Pantalón de lino ancho', brand: 'lumbre', category: 'bottom', style: 'trousers', color: '#d8cbb3', pattern: 'solid', priceCents: 5999, stretch: 'none', fabricNotes: 'fabric.linen', sizeChart: letterChart(['waist', 'hip']) },
  { key: 'g12', name: 'Pantalón de sastre', brand: 'norte', category: 'bottom', style: 'trousers', color: '#2f2f35', pattern: 'solid', priceCents: 7499, stretch: 'low', sizeChart: letterChart(['waist', 'hip']) },
  { key: 'g13', name: 'Short de algodón', brand: 'brisa', category: 'bottom', style: 'shorts', color: '#b5654a', pattern: 'solid', priceCents: 3499, stretch: 'medium', sizeChart: letterChart(['waist']) },
  { key: 'g14', name: 'Falda midi plisada', brand: 'lumbre', category: 'bottom', style: 'skirt', color: '#6d4c7d', pattern: 'solid', priceCents: 4999, stretch: 'low', fabricNotes: 'fabric.pleated', sizeChart: letterChart(['waist', 'hip']) },
  { key: 'g15', name: 'Vestido evasé de lunares', brand: 'lumbre', category: 'dress', style: 'dress-a', color: '#1d2a44', pattern: 'dots', priceCents: 8499, stretch: 'low', fabricNotes: 'fabric.viscoseFlowy', knownLimitations: [PATTERN_LIMIT], sizeChart: letterChart(['chest', 'waist', 'hip']) },
  { key: 'g16', name: 'Vestido cruzado', brand: 'norte', category: 'dress', style: 'dress-wrap', color: '#2f7d6d', pattern: 'solid', priceCents: 8999, stretch: 'medium', fabricNotes: 'fabric.jerseyWrap', sizeChart: letterChart(['chest', 'waist', 'hip']) },
  { key: 'g17', name: 'Tenis de lona', brand: 'taller', category: 'footwear', style: 'sneakers', color: '#e9e4da', pattern: 'solid', priceCents: 4999, stretch: 'none', sizeChart: shoeSizes() },
  { key: 'g18', name: 'Botas de cuero', brand: 'norte', category: 'footwear', style: 'boots', color: '#5a3825', pattern: 'solid', priceCents: 11499, stretch: 'none', sizeChart: shoeSizes() },
  { key: 'g19', name: 'Bufanda tejida', brand: 'brisa', category: 'accessory', style: 'scarf', color: '#c24b3a', pattern: 'solid', priceCents: 2499, stretch: 'high', sizeChart: oneSize() },
  { key: 'g20', name: 'Gorra clásica', brand: 'taller', category: 'accessory', style: 'cap', color: '#26324a', pattern: 'solid', priceCents: 2199, stretch: 'low', sizeChart: oneSize() },
  { key: 'g21', name: 'Bolso bandolera', brand: 'lumbre', category: 'accessory', style: 'bag', color: '#8a5a3b', pattern: 'solid', priceCents: 6999, stretch: 'none', sizeChart: oneSize() },
];
