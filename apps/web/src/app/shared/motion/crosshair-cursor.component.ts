import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, NgZone, afterNextRender, inject, signal, viewChild } from '@angular/core';

/**
 * Cursor de mira de cámara (el gesto del probador): una cruz fina que sigue al ratón con inercia.
 * Sobre un elemento con `data-cursor="Texto"` se abre en un círculo con esa etiqueta.
 * Solo con ratón y sin "reducir movimiento"; en táctil o con teclado no existe.
 * Se mueve fuera de Angular (transformaciones directas) para no provocar detección de cambios.
 */
@Component({
  selector: 'app-crosshair-cursor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  styles: `
    :host {
      position: fixed;
      inset: 0 auto auto 0;
      z-index: 100;
      pointer-events: none;
      mix-blend-mode: difference;
      color: #fff;
    }
    .cross {
      position: absolute;
      width: 0;
      height: 0;
      opacity: 0;
      transition: opacity 0.3s;
    }
    .cross.visible {
      opacity: 1;
    }
    .ring {
      position: absolute;
      left: -9px;
      top: -9px;
      width: 18px;
      height: 18px;
      border: 1px solid currentColor;
      border-radius: 9999px;
      transition:
        width 0.45s var(--ease-out),
        height 0.45s var(--ease-out),
        left 0.45s var(--ease-out),
        top 0.45s var(--ease-out);
    }
    .h,
    .v {
      position: absolute;
      background: currentColor;
      transition: transform 0.45s var(--ease-out);
    }
    .h {
      left: -16px;
      top: 0;
      width: 32px;
      height: 1px;
    }
    .v {
      left: 0;
      top: -16px;
      width: 1px;
      height: 32px;
    }
    .label {
      position: absolute;
      left: 0;
      top: 0;
      transform: translate(-50%, -50%) scale(0.6);
      opacity: 0;
      font-family: var(--font-mono);
      font-size: 11px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      white-space: nowrap;
      transition:
        opacity 0.3s,
        transform 0.45s var(--ease-out);
    }
    .cross.open .ring {
      left: -44px;
      top: -44px;
      width: 88px;
      height: 88px;
    }
    .cross.open .h {
      transform: scaleX(3.4);
    }
    .cross.open .v {
      transform: scaleY(3.4);
    }
    .cross.open .label {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
    .cross.press .ring {
      transform: scale(0.8);
    }
  `,
  template: `
    <div #cross class="cross" [class.visible]="visible()" [class.open]="!!label()">
      <span class="ring"></span><span class="h"></span><span class="v"></span>
      <span class="label">{{ label() }}</span>
    </div>
  `,
})
export class CrosshairCursorComponent {
  private readonly cross = viewChild.required<ElementRef<HTMLElement>>('cross');
  readonly visible = signal(false);
  readonly label = signal('');

  constructor() {
    const zone = inject(NgZone);
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const fine = matchMedia('(pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!fine) return;
      document.documentElement.classList.add('has-crosshair');
      const el = this.cross().nativeElement;
      let x = innerWidth / 2,
        y = innerHeight / 2,
        tx = x,
        ty = y,
        raf = 0;
      const loop = () => {
        x += (tx - x) * 0.22;
        y += (ty - y) * 0.22;
        el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.1 ? requestAnimationFrame(loop) : 0;
      };
      const move = (e: PointerEvent) => {
        if (e.pointerType !== 'mouse') return;
        tx = e.clientX;
        ty = e.clientY;
        if (!this.visible()) zone.run(() => this.visible.set(true));
        if (!raf) raf = requestAnimationFrame(loop);
      };
      const over = (e: Event) => {
        const target = (e.target as Element | null)?.closest?.('[data-cursor]');
        const text = target?.getAttribute('data-cursor') ?? '';
        if (text !== this.label()) zone.run(() => this.label.set(text));
      };
      const leave = () => zone.run(() => this.visible.set(false));
      const down = () => el.classList.add('press');
      const up = () => el.classList.remove('press');
      zone.runOutsideAngular(() => {
        addEventListener('pointermove', move, { passive: true });
        document.addEventListener('pointerover', over, { passive: true });
        document.documentElement.addEventListener('pointerleave', leave);
        addEventListener('pointerdown', down);
        addEventListener('pointerup', up);
      });
      destroyRef.onDestroy(() => {
        cancelAnimationFrame(raf);
        removeEventListener('pointermove', move);
        document.removeEventListener('pointerover', over);
        document.documentElement.removeEventListener('pointerleave', leave);
        removeEventListener('pointerdown', down);
        removeEventListener('pointerup', up);
        document.documentElement.classList.remove('has-crosshair');
      });
    });
  }
}
