export type Pt = [number, number];

const f = (n: number) => Math.round(n * 10) / 10;

/** Contorno suave (Catmull-Rom → Bézier cúbica) cerrado a partir de puntos. */
export function smoothClosedPath(points: Pt[], tension = 0.5): string {
  const n = points.length;
  let d = `M${f(points[0][0])},${f(points[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const c1: Pt = [p1[0] + ((p2[0] - p0[0]) * tension) / 3, p1[1] + ((p2[1] - p0[1]) * tension) / 3];
    const c2: Pt = [p2[0] - ((p3[0] - p1[0]) * tension) / 3, p2[1] - ((p3[1] - p1[1]) * tension) / 3];
    d += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return d + 'Z';
}

export function polygon(points: Pt[]): string {
  return 'M' + points.map(([x, y]) => `${f(x)},${f(y)}`).join(' L') + 'Z';
}

export function mirrorX(points: Pt[], cx: number): Pt[] {
  return points.map(([x, y]) => [2 * cx - x, y]);
}

export function escapeAttr(s: string): string {
  return s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Oscurece/aclara un color hex (amount -1..1). */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
