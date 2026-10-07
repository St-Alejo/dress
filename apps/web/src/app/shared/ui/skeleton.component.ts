import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Bloque gris que reserva el espacio del contenido mientras carga (evita saltos
 * de maquetación). Con `prefers-reduced-motion` el pulso se desactiva globalmente.
 * El texto accesible lo aporta quien lo usa (p. ej. un `role="status"` cercano).
 */
@Component({
  selector: 'ui-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block animate-pulse bg-surface-2', '[attr.aria-hidden]': 'true', '[style.aspect-ratio]': 'ratio()' },
  template: '',
})
export class SkeletonComponent {
  /** Proporción opcional, p. ej. "3 / 4" para imágenes de producto. */
  readonly ratio = input<string | null>(null);
}
