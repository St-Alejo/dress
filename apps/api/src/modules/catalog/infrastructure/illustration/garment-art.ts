import { BodyGeometry } from './body-geometry';
import { mirrorX, polygon, shade, smoothClosedPath, type Pt } from './svg';

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
export type Pattern = 'solid' | 'stripes' | 'dots' | 'check';

export interface GarmentArt {
  id: string;
  style: GarmentStyle;
  color: string;
  pattern: Pattern;
}

/** Orden de capas: lo que va debajo se dibuja primero. */
const LAYER: Record<GarmentStyle, number> = {
  jeans: 1, trousers: 1, shorts: 1, skirt: 1,
  sneakers: 2, boots: 2,
  tshirt: 3, shirt: 3, sweater: 3, 'dress-a': 3, 'dress-wrap': 3,
  hoodie: 4, jacket: 5, coat: 5,
  scarf: 6, bag: 7, cap: 8,
};
export const layerOf = (style: GarmentStyle) => LAYER[style];

export function patternDef(art: GarmentArt): string {
  const id = `p-${art.id}`;
  const base = art.color;
  const accent = shade(art.color, isLight(art.color) ? -0.25 : 0.3);
  switch (art.pattern) {
    case 'stripes':
      return `<pattern id="${id}" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="${base}"/><rect y="0" width="14" height="5" fill="${accent}"/></pattern>`;
    case 'dots':
      return `<pattern id="${id}" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="${base}"/><circle cx="8" cy="8" r="2.6" fill="${accent}"/></pattern>`;
    case 'check':
      return `<pattern id="${id}" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="${base}"/><rect width="12" height="24" fill="${accent}" opacity=".45"/><rect width="24" height="12" fill="${accent}" opacity=".45"/></pattern>`;
    default:
      return '';
  }
}

function isLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 150;
}

const fillOf = (art: GarmentArt) => (art.pattern === 'solid' ? art.color : `url(#p-${art.id})`);

/** Tronco de prenda superior: de hombros a `toY`, con holgura `ease` y vuelo `flare` al final. */
function torsoShell(g: BodyGeometry, toY: number, ease: number, flare = 0, neckDrop = 0.02): Pt[] {
  const neckY = g.shoulderY - g.H * 0.012;
  const ys = [g.chestY, g.waistY, Math.min(toY, g.hipY), toY].filter((y, i, a) => y <= toY && a.indexOf(y) === i);
  const right: Pt[] = [
    [g.cx + g.neckW * 0.9, neckY],
    [g.cx + g.shoulderHalf + ease * 0.5, g.shoulderY + g.H * 0.008],
    ...ys.map((y): Pt => {
      const t = (y - g.chestY) / Math.max(1, toY - g.chestY);
      return [g.cx + g.torsoHalfAt(y) + ease + flare * Math.max(0, t) ** 2, y];
    }),
  ];
  const left = mirrorX(right, g.cx).reverse();
  return [...right, ...left, [g.cx, neckY + g.H * neckDrop]];
}

function sleeve(g: BodyGeometry, side: 'l' | 'r', toY: number, ease: number): Pt[] {
  const s = side === 'l' ? 1 : -1;
  const outer = (y: number) => g.armOuterX(side, y) + s * ease;
  const inner = (y: number) => outer(y) - s * (g.armW + ease * 1.6) * (1 - 0.18 * ((y - g.shoulderY) / (g.wristY - g.shoulderY)));
  return [
    [g.cx + s * (g.shoulderHalf - g.armW * 0.2), g.shoulderY - g.H * 0.006],
    [outer(g.shoulderY + g.H * 0.02), g.shoulderY + g.H * 0.02],
    [outer(toY), toY],
    [inner(toY), toY],
    [inner(g.chestY + g.H * 0.02), g.chestY + g.H * 0.02],
  ];
}

function pantLeg(g: BodyGeometry, side: 'l' | 'r', toY: number, ease: number, wide = 0): Pt[] {
  const s = side === 'l' ? 1 : -1;
  const at = (y: number, half: number): [number, number] => [g.legCx(side, y) + s * half, g.legCx(side, y) - s * half];
  const thigh = at(g.thighMidY, g.thighHalf + ease);
  const knee = at(g.kneeY, g.kneeHalf + ease + wide * 0.5);
  const end = at(toY, Math.max(g.ankleHalf * 1.6, g.kneeHalf * 0.85) + ease + wide);
  const pts: Pt[] = [
    [g.cx + s * (g.hipHalf + ease), g.waistY + (g.hipY - g.waistY) * 0.35],
    [g.cx + s * (g.hipHalf + ease), g.hipY],
    [thigh[0], g.thighMidY],
  ];
  if (toY > g.kneeY) pts.push([knee[0], g.kneeY]);
  pts.push([end[0], toY], [end[1], toY]);
  if (toY > g.kneeY) pts.push([knee[1], g.kneeY]);
  pts.push([thigh[1], g.thighMidY], [g.cx, g.crotchY + 2], [g.cx, g.waistY + (g.hipY - g.waistY) * 0.35]);
  return pts;
}

function path(d: string, fill: string, extra = ''): string {
  return `<path d="${d}" fill="${fill}" stroke="rgba(0,0,0,.18)" stroke-width="1.2" stroke-linejoin="round" ${extra}/>`;
}

/** Dibuja la prenda sobre la geometría del cuerpo. Devuelve SVG (sin <svg> raíz). */
export function drawGarment(g: BodyGeometry, art: GarmentArt): string {
  const fill = fillOf(art);
  const dark = shade(art.color, -0.3);
  const detail = (d: string) => `<path d="${d}" fill="none" stroke="${dark}" stroke-width="2" stroke-linecap="round" opacity=".6"/>`;
  const topHem = g.hipY + g.H * 0.02;
  const bothSleeves = (toY: number, ease: number) =>
    path(polygon(sleeve(g, 'l', toY, ease)), fill) + path(polygon(sleeve(g, 'r', toY, ease)), fill);

  switch (art.style) {
    case 'tshirt':
      return bothSleeves(g.y(0.28), 4) + path(smoothClosedPath(torsoShell(g, topHem, 6), 0.35), fill);
    case 'shirt':
      return (
        bothSleeves(g.wristY - g.H * 0.01, 3) +
        path(smoothClosedPath(torsoShell(g, topHem + g.H * 0.02, 5, 0, 0.05), 0.35), fill) +
        detail(`M${g.cx},${g.shoulderY + g.H * 0.02} L${g.cx},${topHem}`) +
        [0.24, 0.3, 0.36, 0.42, 0.48].map((t) => `<circle cx="${g.cx + 4}" cy="${g.y(t)}" r="2" fill="${dark}"/>`).join('')
      );
    case 'sweater':
      return (
        bothSleeves(g.wristY, 6) +
        path(smoothClosedPath(torsoShell(g, topHem, 9, 0, 0.012), 0.35), fill) +
        detail(`M${g.cx - g.torsoHalfAt(topHem) - 8},${topHem - 8} L${g.cx + g.torsoHalfAt(topHem) + 8},${topHem - 8}`)
      );
    case 'hoodie': {
      const hood = `<ellipse cx="${g.cx}" cy="${g.shoulderY - g.H * 0.005}" rx="${g.neckW * 2.2}" ry="${g.H * 0.03}" fill="${dark}"/>`;
      return (
        hood +
        bothSleeves(g.wristY, 8) +
        path(smoothClosedPath(torsoShell(g, topHem, 12, 0, 0.015), 0.35), fill) +
        path(polygon([[g.cx - g.waistHalf * 0.7, g.y(0.42)], [g.cx + g.waistHalf * 0.7, g.y(0.42)], [g.cx + g.waistHalf * 0.8, g.y(0.48)], [g.cx - g.waistHalf * 0.8, g.y(0.48)]]), shade(art.color, -0.12)) +
        detail(`M${g.cx - 6},${g.shoulderY + 4} l-2,${g.H * 0.06} M${g.cx + 6},${g.shoulderY + 4} l2,${g.H * 0.06}`)
      );
    }
    case 'jacket':
    case 'coat': {
      const hem = art.style === 'coat' ? g.kneeY + g.H * 0.02 : topHem + g.H * 0.01;
      const flare = art.style === 'coat' ? 22 : 4;
      return (
        bothSleeves(g.wristY + g.H * 0.005, 10) +
        path(smoothClosedPath(torsoShell(g, hem, 14, flare, 0.09), 0.3), fill) +
        detail(`M${g.cx},${g.shoulderY + g.H * 0.09} L${g.cx},${hem}`) +
        detail(`M${g.cx},${g.shoulderY + g.H * 0.09} L${g.cx - g.neckW * 1.4},${g.shoulderY} M${g.cx},${g.shoulderY + g.H * 0.09} L${g.cx + g.neckW * 1.4},${g.shoulderY}`)
      );
    }
    case 'jeans':
    case 'trousers': {
      const wide = art.style === 'trousers' ? 8 : 0;
      const legs = path(polygon(pantLeg(g, 'l', g.ankleY, 3, wide)), fill) + path(polygon(pantLeg(g, 'r', g.ankleY, 3, wide)), fill);
      const waistband = path(
        polygon([[g.cx - g.torsoHalfAt(g.waistY + 10) - 4, g.waistY + 2], [g.cx + g.torsoHalfAt(g.waistY + 10) + 4, g.waistY + 2], [g.cx + g.hipHalf + 3, g.waistY + (g.hipY - g.waistY) * 0.45], [g.cx - g.hipHalf - 3, g.waistY + (g.hipY - g.waistY) * 0.45]]),
        fill,
      );
      const seams = art.style === 'jeans' ? detail(`M${g.cx},${g.waistY + 4} L${g.cx},${g.crotchY - 4}`) : '';
      return legs + waistband + seams;
    }
    case 'shorts': {
      const end = g.thighMidY + g.H * 0.03;
      return (
        path(polygon(pantLeg(g, 'l', end, 6)), fill) +
        path(polygon(pantLeg(g, 'r', end, 6)), fill) +
        path(polygon([[g.cx - g.torsoHalfAt(g.waistY + 10) - 5, g.waistY + 2], [g.cx + g.torsoHalfAt(g.waistY + 10) + 5, g.waistY + 2], [g.cx + g.hipHalf + 6, g.hipY], [g.cx - g.hipHalf - 6, g.hipY]]), fill)
      );
    }
    case 'skirt': {
      const end = g.kneeY + g.H * 0.01;
      const halfW = g.torsoHalfAt(g.waistY + 6);
      const pts: Pt[] = [
        [g.cx + halfW + 3, g.waistY + 2],
        [g.cx + g.hipHalf + 6, g.hipY],
        [g.cx + g.hipHalf + 30, end],
        [g.cx - g.hipHalf - 30, end],
        [g.cx - g.hipHalf - 6, g.hipY],
        [g.cx - halfW - 3, g.waistY + 2],
      ];
      return path(smoothClosedPath(pts, 0.2), fill);
    }
    case 'dress-a':
    case 'dress-wrap': {
      const end = g.kneeY + g.H * 0.03;
      const sleeves = art.style === 'dress-wrap' ? bothSleeves(g.elbowY, 4) : '';
      const body = torsoShell(g, end, 5, art.style === 'dress-a' ? 55 : 28, art.style === 'dress-wrap' ? 0.08 : 0.03);
      const wrap = art.style === 'dress-wrap' ? detail(`M${g.cx - g.neckW},${g.shoulderY} L${g.cx + g.waistHalf},${g.waistY} L${g.cx + g.hipHalf * 0.6},${end}`) : '';
      const belt = detail(`M${g.cx - g.waistHalf - 5},${g.waistY} L${g.cx + g.waistHalf + 5},${g.waistY}`);
      return sleeves + path(smoothClosedPath(body, 0.3), fill) + belt + wrap;
    }
    case 'sneakers':
    case 'boots': {
      const top = art.style === 'boots' ? g.y(0.85) : g.ankleY - g.H * 0.005;
      const shoe = (side: 'l' | 'r') => {
        const x = g.legCx(side, g.ankleY);
        const s = side === 'l' ? 1 : -1;
        const w = g.ankleHalf * 1.9;
        return path(
          smoothClosedPath([[x - w, top], [x + w, top], [x + w + 2, g.ankleY + 10], [x + s * (w + 16), g.ankleY + 18], [x - s * (w + 4), g.ankleY + 18]], 0.25),
          fill,
        ) + `<rect x="${Math.min(x - s * (w + 4), x + s * (w + 16))}" y="${g.ankleY + 15}" width="${2 * w + 20}" height="5" rx="2" fill="${art.style === 'sneakers' ? '#f4f4f4' : dark}"/>`;
      };
      return shoe('l') + shoe('r');
    }
    case 'scarf': {
      const y = g.shoulderY - g.H * 0.01;
      return (
        path(smoothClosedPath([[g.cx - g.neckW * 1.8, y - 6], [g.cx + g.neckW * 1.8, y - 6], [g.cx + g.neckW * 2, y + 14], [g.cx - g.neckW * 2, y + 14]], 0.4), fill) +
        path(polygon([[g.cx + g.neckW * 0.4, y + 8], [g.cx + g.neckW * 1.4, y + 8], [g.cx + g.neckW * 1.6, g.y(0.36)], [g.cx + g.neckW * 0.6, g.y(0.36)]]), fill)
      );
    }
    case 'cap': {
      const hy = g.headCy - g.headR * 0.35;
      return (
        path(`M${g.cx - g.headR * 1.05},${hy} A${g.headR * 1.05},${g.headR * 1.0} 0 0 1 ${g.cx + g.headR * 1.05},${hy} Z`, fill) +
        path(smoothClosedPath([[g.cx - g.headR * 1.1, hy], [g.cx + g.headR * 1.1, hy], [g.cx + g.headR * 1.7, hy + 6], [g.cx - g.headR * 0.2, hy + 7]], 0.3), dark)
      );
    }
    case 'bag': {
      const bx = g.cx - g.hipHalf - 10;
      const by = g.hipY - g.H * 0.02;
      return (
        `<path d="M${g.cx + g.shoulderHalf * 0.8},${g.shoulderY} L${bx + 20},${by}" stroke="${dark}" stroke-width="5" fill="none"/>` +
        path(smoothClosedPath([[bx - 28, by], [bx + 30, by], [bx + 34, by + 48], [bx - 32, by + 48]], 0.15), fill)
      );
    }
  }
}
