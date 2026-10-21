import type { GarmentItem } from '@vestirse/shared-types';
import { GarmentRenderer } from './garment-renderer';
import { affineFrom3 } from './geometry';
import { type Body, type Fit, LAYER_ORDER, type Mesh, NEUTRAL_FIT, buildMesh, poseFor, skinMesh } from './rig';

/** Prenda lista para dibujar: su imagen, su malla y los datos que el rig necesita. */
interface Prepared {
  garment: GarmentItem;
  image: HTMLImageElement;
  mesh: Mesh;
  out: Float32Array;
}

/** Ajuste fino de la persona: desplazamiento (px del lienzo) y escala alrededor de los hombros. */
export interface Adjust {
  dx: number;
  dy: number;
  scale: number;
}

export const NO_ADJUST: Adjust = { dx: 0, dy: 0, scale: 1 };

/** ¿Se puede vestir esta prenda con el motor (cámara o vista aproximada)? */
export function canWear(g: Pick<GarmentItem, 'images' | 'anchors'>): boolean {
  return !!g.images.cutout && !!g.anchors;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`no se pudo cargar ${src}`));
    img.src = src;
  });
}

/** Lee el alfa del recorte (una sola vez, en pequeño) para saber dónde hay tela. */
function alphaSampler(img: HTMLImageElement): (x: number, y: number) => boolean {
  const w = 96;
  const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  return (x, y) => {
    const px = Math.min(w - 1, Math.max(0, Math.floor((x / img.naturalWidth) * w)));
    const py = Math.min(h - 1, Math.max(0, Math.floor((y / img.naturalHeight) * h)));
    return data[(py * w + px) * 4 + 3] > 20;
  };
}

function applyAdjust(pos: Float32Array, a: Adjust, body: Body): Float32Array {
  if (a.dx === 0 && a.dy === 0 && a.scale === 1) return pos;
  const ls = body.leftShoulder?.p;
  const rs = body.rightShoulder?.p;
  const [cx, cy] = ls && rs ? [(ls[0] + rs[0]) / 2, (ls[1] + rs[1]) / 2] : [0, 0];
  for (let i = 0; i < pos.length; i += 2) {
    pos[i] = cx + (pos[i] - cx) * a.scale + a.dx;
    pos[i + 1] = cy + (pos[i + 1] - cy) * a.scale + a.dy;
  }
  return pos;
}

/**
 * Escena de prueba: una o varias prendas vestidas sobre un cuerpo, dibujadas en un lienzo
 * transparente encima del video o de la foto de un modelo. WebGL2 si se puede; si no, un
 * respaldo en Canvas 2D que dibuja la misma malla triángulo a triángulo (sin oclusión).
 */
export class TryOnScene {
  private items: Prepared[] = [];
  private readonly gl: GarmentRenderer | null;
  private readonly ctx2d: CanvasRenderingContext2D | null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.gl = GarmentRenderer.create(canvas);
    this.ctx2d = this.gl ? null : canvas.getContext('2d');
  }

  get usesWebGL(): boolean {
    return !!this.gl;
  }

  /** Prepara las prendas (en orden de capas). Las que no tienen recorte o anclas se ignoran. */
  async setGarments(garments: GarmentItem[]): Promise<void> {
    const wearable = garments.filter(canWear).sort((a, b) => (LAYER_ORDER[a.category] ?? 9) - (LAYER_ORDER[b.category] ?? 9));
    const loaded = await Promise.all(wearable.map(async (garment) => ({ garment, image: await loadImage(garment.images.cutout!) })));
    this.items = loaded.map(({ garment, image }) => {
      const mesh = buildMesh(garment.anchors!, image.naturalWidth, image.naturalHeight, alphaSampler(image), this.gl ? 24 : 12);
      return { garment, image, mesh, out: new Float32Array(mesh.rest.length) };
    });
    this.gl?.setGarments(this.items.map(({ image, mesh }) => ({ image, mesh })));
  }

  get garmentCount(): number {
    return this.items.length;
  }

  setOcclusion(rg: Uint8Array | null, width: number, height: number): void {
    this.gl?.setOcclusion(rg, width, height);
  }

  setLight(gain: [number, number, number]): void {
    this.gl?.setLight(gain);
  }

  /**
   * Dibuja el fotograma. Devuelve cuántas prendas se pudieron colocar (0 si el cuerpo no
   * basta, p. ej. un pantalón sin caderas a la vista).
   */
  render(body: Body | null, width: number, height: number, fits: Record<string, Fit> = {}, adjust: Adjust = NO_ADJUST): number {
    let placed = 0;
    let shadow = 6;
    const positions = this.items.map((it) => {
      if (!body) return null;
      const pose = poseFor(it.garment.anchors!, it.garment.style, it.mesh.width, it.mesh.height, body, fits[it.garment.id] ?? NEUTRAL_FIT);
      if (!pose) return null;
      placed++;
      shadow = Math.max(3, Math.min(14, pose.scale * it.mesh.width * 0.012));
      return applyAdjust(skinMesh(it.mesh, pose, it.out), adjust, body);
    });
    if (this.gl) {
      this.gl.draw(positions, width, height, shadow);
    } else if (this.ctx2d) {
      this.draw2d(positions, width, height);
    }
    return placed;
  }

  clear(): void {
    this.gl?.clear();
    this.ctx2d?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Respaldo sin WebGL2: la misma malla, triángulo a triángulo con un afín por triángulo. */
  private draw2d(positions: (Float32Array | null)[], width: number, height: number): void {
    const ctx = this.ctx2d!;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    this.items.forEach((it, n) => {
      const pos = positions[n];
      if (!pos) return;
      const { indices, rest } = it.mesh;
      for (let t = 0; t < indices.length; t += 3) {
        const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
        const m = affineFrom3(
          [[rest[a * 2], rest[a * 2 + 1]], [rest[b * 2], rest[b * 2 + 1]], [rest[c * 2], rest[c * 2 + 1]]],
          [[pos[a * 2], pos[a * 2 + 1]], [pos[b * 2], pos[b * 2 + 1]], [pos[c * 2], pos[c * 2 + 1]]],
        );
        if (!m) continue;
        ctx.save();
        ctx.beginPath();
        // Un pelo más grande que el triángulo para que no se vean las costuras entre triángulos.
        const cx = (pos[a * 2] + pos[b * 2] + pos[c * 2]) / 3;
        const cy = (pos[a * 2 + 1] + pos[b * 2 + 1] + pos[c * 2 + 1]) / 3;
        const grow = (i: number): [number, number] => [cx + (pos[i * 2] - cx) * 1.04, cy + (pos[i * 2 + 1] - cy) * 1.04];
        ctx.moveTo(...grow(a));
        ctx.lineTo(...grow(b));
        ctx.lineTo(...grow(c));
        ctx.closePath();
        ctx.clip();
        ctx.setTransform(...m);
        ctx.drawImage(it.image, 0, 0);
        ctx.restore();
      }
    });
  }

  dispose(): void {
    this.gl?.dispose();
    this.items = [];
  }
}
