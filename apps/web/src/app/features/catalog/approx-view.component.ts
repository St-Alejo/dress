import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import type { GarmentItem, SimilarBodyModel } from '@vestirse/shared-types';
import { sceneGain } from '../live-overlay/engine/lighting';
import type { Fit } from '../live-overlay/engine/rig';
import { bodyFromPose, occlusionFromPose } from '../live-overlay/engine/static-pose';
import { TryOnScene } from '../live-overlay/engine/tryon-scene';

/**
 * "Vista aproximada": la prenda vestida sobre la foto de un modelo con el mismo motor de la
 * cámara (malla, oclusión y luz), usando la pose medida una vez sobre esa foto. Es instantánea,
 * sin IA ni cuota; cuando existe la prueba IA del modelo se muestra esa en su lugar.
 */
@Component({
  selector: 'app-approx-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative mx-auto aspect-[3/4] h-full max-w-full">
      <img #photo [src]="body().photoUrl" alt="" crossorigin="anonymous" class="absolute inset-0 h-full w-full object-cover" (load)="photoLoads.update((n) => n + 1)" />
      <canvas #canvas class="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true"></canvas>
    </div>
  `,
})
export class ApproxViewComponent {
  readonly body = input.required<SimilarBodyModel>();
  readonly garments = input.required<GarmentItem[]>();
  readonly fits = input<Record<string, Fit>>({});
  /** Cuántas prendas se pudieron colocar (0 = la pose no basta para esta prenda). */
  readonly placed = output<number>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly photo = viewChild.required<ElementRef<HTMLImageElement>>('photo');
  /** Sube con cada carga de la foto: entonces se mide su luz. */
  readonly photoLoads = signal(0);
  private scene: TryOnScene | null = null;
  private loaded = '';
  private run = 0;

  constructor() {
    effect(() => {
      const body = this.body();
      const garments = this.garments();
      const fits = this.fits();
      const ready = this.photoLoads() > 0;
      untracked(() => void this.render(body, garments, fits, ready));
    });
    inject(DestroyRef).onDestroy(() => this.scene?.dispose());
  }

  private async render(body: SimilarBodyModel, garments: GarmentItem[], fits: Record<string, Fit>, photoReady: boolean) {
    const run = ++this.run;
    const pose = body.pose;
    const person = pose ? bodyFromPose(pose) : null;
    if (!pose || !person) {
      this.scene?.clear();
      this.placed.emit(0);
      return;
    }
    this.scene ??= new TryOnScene(this.canvas().nativeElement);
    const key = garments.map((g) => g.id).join(',');
    if (key !== this.loaded) {
      await this.scene.setGarments(garments);
      if (run !== this.run) return; // llegó otro cambio mientras cargaban las imágenes
      this.loaded = key;
    }
    this.scene.setOcclusion(occlusionFromPose(pose, person), pose.seg.width, pose.seg.height);
    if (photoReady) this.scene.setLight(this.photoGain());
    this.placed.emit(this.scene.render(person, pose.width, pose.height, fits));
  }

  /** Luz de la foto del modelo (en estudio queda casi neutra). */
  private photoGain(): [number, number, number] {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 16;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [1, 1, 1];
    try {
      ctx.drawImage(this.photo().nativeElement, 0, 0, 16, 16);
      return sceneGain(ctx.getImageData(0, 0, 16, 16).data);
    } catch {
      return [1, 1, 1]; // imagen de otro origen sin CORS: sin ajuste de luz
    }
  }
}
