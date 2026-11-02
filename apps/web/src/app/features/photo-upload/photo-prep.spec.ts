import { describe, expect, it } from 'vitest';
import { cropTopBelowFace, faceSearchTiles, tileBoxToImage } from './photo-prep';

describe('faceSearchTiles', () => {
  it('solo genera cuadrados dentro de la imagen', () => {
    for (const [w, h] of [[768, 1024], [1024, 768], [600, 600], [3000, 4000]]) {
      for (const t of faceSearchTiles(w, h)) {
        expect(t.x).toBeGreaterThanOrEqual(0);
        expect(t.y).toBeGreaterThanOrEqual(0);
        expect(t.x + t.size).toBeLessThanOrEqual(w);
        expect(t.y + t.size).toBeLessThanOrEqual(h);
      }
    }
  });

  it('en cuerpo entero vertical busca un cuadrado pequeño centrado arriba, donde suele estar la cara', () => {
    const tiles = faceSearchTiles(768, 1024);
    const small = Math.round(768 * 0.6);
    expect(tiles).toContainEqual({ x: Math.round((768 - small) / 2), y: 0, size: small });
  });

  it('incluye un cuadrado del lado completo para selfies y primeros planos', () => {
    expect(faceSearchTiles(768, 1024)).toContainEqual({ x: 0, y: 0, size: 768 });
  });

  it('no repite recortes en una imagen cuadrada', () => {
    const tiles = faceSearchTiles(600, 600);
    const keys = tiles.map((t) => `${t.x},${t.y},${t.size}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('tileBoxToImage', () => {
  it('traslada la caja del recorte a coordenadas de la imagen', () => {
    expect(tileBoxToImage({ x: 154, y: 50, size: 461 }, { x: 195, y: 64, width: 85, height: 85 })).toEqual({
      x: 349,
      y: 114,
      width: 85,
      height: 85,
    });
  });

  it('con la caja corregida, recortar el rostro deja el torso (corta bajo la barbilla, no a media altura)', () => {
    const face = tileBoxToImage({ x: 154, y: 0, size: 461 }, { x: 191, y: 112, width: 82, height: 82 });
    expect(cropTopBelowFace(face, 1024)).toBeLessThan(1024 * 0.25);
  });
});
