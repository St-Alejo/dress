import { BodyGeometry, REFERENCE_SHAPE, VIEW_H, VIEW_W, type BodyShape } from './body-geometry';
import { drawGarment, layerOf, patternDef, type GarmentArt, type GarmentStyle } from './garment-art';
import { mirrorX, polygon, shade, smoothClosedPath, type Pt } from './svg';

export type HairStyle = 'short' | 'long' | 'bun' | 'curly' | 'none';

export interface AvatarSpec {
  shape: BodyShape;
  skinTone: string;
  hair: HairStyle;
  hairColor: string;
}

const BASE_LAYER = '#9aa4b1';

/**
 * Cuerpo ilustrado neutro: sin rasgos faciales (nadie necesita un rostro para
 * probarse ropa, sección 4 regla 1) y con una capa base neutra.
 * La silueta se dibuja tal cual las medidas: no existe parámetro para "estilizarla" (regla 2).
 */
function drawBody(g: BodyGeometry, spec: AvatarSpec): string {
  const skin = spec.skinTone;
  const skinShade = shade(skin, -0.12);
  const leg = (side: 'l' | 'r'): Pt[] => {
    const s = side === 'l' ? 1 : -1;
    const at = (y: number, half: number) => [g.legCx(side, y) + s * half, g.legCx(side, y) - s * half];
    const thigh = at(g.thighMidY, g.thighHalf);
    const knee = at(g.kneeY, g.kneeHalf);
    const ankle = at(g.ankleY, g.ankleHalf);
    return [
      [g.cx + s * g.hipHalf, g.hipY],
      [thigh[0], g.thighMidY],
      [knee[0], g.kneeY],
      [ankle[0], g.ankleY],
      [ankle[1], g.ankleY],
      [knee[1], g.kneeY],
      [thigh[1], g.thighMidY],
      [g.cx, g.crotchY],
    ];
  };
  const arm = (side: 'l' | 'r'): Pt[] => {
    const s = side === 'l' ? 1 : -1;
    const outer = (y: number) => g.armOuterX(side, y);
    const inner = (y: number, k: number) => outer(y) - s * g.armW * k;
    return [
      [g.cx + s * (g.shoulderHalf - g.armW * 0.3), g.shoulderY - g.H * 0.008],
      [outer(g.shoulderY + g.H * 0.02), g.shoulderY + g.H * 0.02],
      [outer(g.elbowY), g.elbowY],
      [outer(g.wristY), g.wristY],
      [inner(g.wristY, 0.72), g.wristY],
      [inner(g.elbowY, 0.85), g.elbowY],
      [inner(g.chestY + g.H * 0.03, 1), g.chestY + g.H * 0.03],
    ];
  };
  const torsoRight: Pt[] = [
    [g.cx + g.neckW * 0.8, g.shoulderY - g.H * 0.01],
    [g.cx + g.shoulderHalf * 0.92, g.shoulderY + g.H * 0.006],
    [g.cx + g.chestHalf, g.chestY],
    [g.cx + g.waistHalf, g.waistY],
    [g.cx + g.hipHalf, g.hipY],
    [g.cx + g.hipHalf * 0.96, g.crotchY],
  ];
  const torso = [...torsoRight, ...mirrorX(torsoRight, g.cx).reverse()];

  const hand = (side: 'l' | 'r') =>
    `<ellipse cx="${g.armOuterX(side, g.wristY) - (side === 'l' ? 1 : -1) * g.armW * 0.36}" cy="${g.wristY + g.H * 0.03}" rx="${g.armW * 0.42}" ry="${g.H * 0.034}" fill="${skin}"/>`;
  const foot = (side: 'l' | 'r') =>
    `<ellipse cx="${g.legCx(side, g.ankleY) + (side === 'l' ? 8 : -8)}" cy="${g.ankleY + 12}" rx="${g.ankleHalf * 2}" ry="9" fill="${skinShade}"/>`;

  const baseTop = torsoShellBase(g);
  const baseBottom: Pt[] = [
    [g.cx - g.waistHalf - 1, g.waistY + g.H * 0.02],
    [g.cx + g.waistHalf + 1, g.waistY + g.H * 0.02],
    [g.cx + g.hipHalf + 1, g.hipY],
    [g.legCx('l', g.crotchY + 18) + g.thighHalf, g.crotchY + 18],
    [g.cx, g.crotchY + 4],
    [g.legCx('r', g.crotchY + 18) - g.thighHalf, g.crotchY + 18],
    [g.cx - g.hipHalf - 1, g.hipY],
  ];

  return [
    path(smoothClosedPath(leg('l'), 0.3), skin),
    path(smoothClosedPath(leg('r'), 0.3), skin),
    foot('l'),
    foot('r'),
    path(smoothClosedPath(torso, 0.35), skin),
    path(smoothClosedPath(arm('l'), 0.3), skin),
    path(smoothClosedPath(arm('r'), 0.3), skin),
    hand('l'),
    hand('r'),
    `<rect x="${g.cx - g.neckW / 2}" y="${g.headCy + g.headR * 0.6}" width="${g.neckW}" height="${g.shoulderY - g.headCy - g.headR * 0.4}" fill="${skin}"/>`,
    path(smoothClosedPath(baseTop, 0.35), BASE_LAYER),
    path(polygon(baseBottom), shade(BASE_LAYER, -0.15)),
    `<ellipse cx="${g.cx}" cy="${g.headCy}" rx="${g.headR * 0.86}" ry="${g.headR}" fill="${skin}"/>`,
    hair(g, spec),
  ].join('');
}

function torsoShellBase(g: BodyGeometry): Pt[] {
  const right: Pt[] = [
    [g.cx + g.neckW * 0.9, g.shoulderY + g.H * 0.02],
    [g.cx + g.shoulderHalf * 0.55, g.shoulderY + g.H * 0.004],
    [g.cx + g.chestHalf + 1, g.chestY],
    [g.cx + g.waistHalf + 1, g.waistY + g.H * 0.025],
  ];
  return [...right, ...mirrorX(right, g.cx).reverse(), [g.cx, g.shoulderY + g.H * 0.045]];
}

function hair(g: BodyGeometry, spec: AvatarSpec): string {
  const r = g.headR;
  const c = spec.hairColor;
  const cap = `M${g.cx - r * 0.9},${g.headCy} A${r * 0.9},${r * 1.02} 0 0 1 ${g.cx + r * 0.9},${g.headCy} Q${g.cx},${g.headCy - r * 0.55} ${g.cx - r * 0.9},${g.headCy}Z`;
  switch (spec.hair) {
    case 'short':
      return `<path d="${cap}" fill="${c}"/>`;
    case 'long':
      return `<path d="M${g.cx - r * 0.95},${g.headCy + r * 1.7} L${g.cx - r * 0.95},${g.headCy} A${r * 0.95},${r * 1.05} 0 0 1 ${g.cx + r * 0.95},${g.headCy} L${g.cx + r * 0.95},${g.headCy + r * 1.7} L${g.cx + r * 0.7},${g.headCy + r * 1.7} L${g.cx + r * 0.7},${g.headCy} Q${g.cx},${g.headCy - r * 0.5} ${g.cx - r * 0.7},${g.headCy} L${g.cx - r * 0.7},${g.headCy + r * 1.7}Z" fill="${c}"/>`;
    case 'bun':
      return `<circle cx="${g.cx}" cy="${g.headCy - r * 1.05}" r="${r * 0.42}" fill="${c}"/><path d="${cap}" fill="${c}"/>`;
    case 'curly':
      return Array.from({ length: 9 }, (_, i) => {
        const a = Math.PI + (i / 8) * Math.PI;
        return `<circle cx="${g.cx + Math.cos(a) * r * 0.85}" cy="${g.headCy - r * 0.1 + Math.sin(a) * r * 0.9}" r="${r * 0.34}" fill="${c}"/>`;
      }).join('');
    case 'none':
      return '';
  }
}

function path(d: string, fill: string): string {
  return `<path d="${d}" fill="${fill}"/>`;
}

function svg(content: string, viewBox = `0 0 ${VIEW_W} ${VIEW_H}`, defs = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${defs ? `<defs>${defs}</defs>` : ''}${content}</svg>`;
}

/** Avatar sin prenda del catálogo (solo capa base). */
export function renderAvatar(spec: AvatarSpec): string {
  return svg(drawBody(new BodyGeometry(spec.shape), spec));
}

/** Preview "cuerpo similar": el cuerpo con una o varias prendas dibujadas sobre su propia geometría. */
export function renderPreview(spec: AvatarSpec, garments: GarmentArt[]): string {
  const g = new BodyGeometry(spec.shape);
  const sorted = [...garments].sort((a, b) => layerOf(a.style) - layerOf(b.style));
  return svg(drawBody(g, spec) + sorted.map((a) => drawGarment(g, a)).join(''), undefined, sorted.map(patternDef).join(''));
}

/** Región de recorte (en fracciones de altura del cuerpo de referencia) por estilo, para la imagen plana. */
const CROP: Record<GarmentStyle, [number, number]> = {
  tshirt: [0.14, 0.56], shirt: [0.14, 0.58], sweater: [0.14, 0.56], hoodie: [0.12, 0.56],
  jacket: [0.13, 0.58], coat: [0.13, 0.8], jeans: [0.36, 1.0], trousers: [0.36, 1.0],
  shorts: [0.36, 0.7], skirt: [0.36, 0.78], 'dress-a': [0.14, 0.8], 'dress-wrap': [0.14, 0.8],
  sneakers: [0.9, 1.01], boots: [0.82, 1.01], scarf: [0.14, 0.4], cap: [0.0, 0.1], bag: [0.14, 0.58],
};

/** Imagen plana de producto: la prenda sola, sobre fondo transparente, recortada. */
export function renderFlat(art: GarmentArt): string {
  const g = new BodyGeometry(REFERENCE_SHAPE);
  const [from, to] = CROP[art.style];
  const y0 = g.y(from) - 12;
  const y1 = Math.min(VIEW_H, g.y(to) + 16);
  return svg(drawGarment(g, art), `0 ${y0.toFixed(0)} ${VIEW_W} ${(y1 - y0).toFixed(0)}`, patternDef(art));
}

/** Imagen de overlay para Track A: lienzo completo del cuerpo de referencia, sin cuerpo. */
export function renderOverlay(art: GarmentArt): string {
  const g = new BodyGeometry(REFERENCE_SHAPE);
  return svg(drawGarment(g, art), undefined, patternDef(art));
}

/** Anclas del overlay en px de imagen (VIEW_W × VIEW_H), coherentes con renderOverlay. */
export function overlayAnchors() {
  return new BodyGeometry(REFERENCE_SHAPE).anchors();
}
