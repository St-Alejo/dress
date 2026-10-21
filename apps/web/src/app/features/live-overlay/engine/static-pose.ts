import type { BodyPose } from '@vestirse/shared-types';
import { BodyTracker, type RawLandmark } from './body-tracker';
import { occlusionMask, softenMask } from './occlusion';
import type { Body } from './rig';

/** Deshace la codificación por tramos [etiqueta, longitud, …] de la segmentación guardada. */
export function decodeRle(rle: number[], size: number): Uint8Array {
  const out = new Uint8Array(size);
  let at = 0;
  for (let i = 0; i + 1 < rle.length && at < size; i += 2) {
    const end = Math.min(size, at + rle[i + 1]);
    out.fill(rle[i], at, end);
    at = end;
  }
  return out;
}

/** Cuerpo en píxeles de la foto a partir de la pose medida (sin filtrado: es una sola imagen). */
export function bodyFromPose(pose: BodyPose): Body | null {
  const landmarks: RawLandmark[] = pose.landmarks.map((p) => ({ x: p.x, y: p.y, visibility: p.v }));
  return new BodyTracker().update(landmarks, pose.width, pose.height, 0);
}

/** Máscara de oclusión (brazos y manos delante, cara y pelo encima) en la resolución de la segmentación. */
export function occlusionFromPose(pose: BodyPose, body: Body): Uint8Array {
  const { width, height, rle } = pose.seg;
  const sx = pose.width / width;
  const sy = pose.height / height;
  return softenMask(occlusionMask(decodeRle(rle, width * height), width, height, body, (x, y) => [x * sx, y * sy]), width, height);
}
