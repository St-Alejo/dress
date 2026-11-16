import { Directive, ElementRef, OnDestroy, OnInit, inject, input } from '@angular/core';

/**
 * Un solo observador para toda la página (patrón Flyweight): cada elemento se registra y se olvida al
 * entrar. Con la cortinilla el elemento está recortado del todo y el navegador lo da por invisible,
 * así que se vigila un "testigo" (su contenedor) y al entrar este se revelan sus elementos.
 */
let observer: IntersectionObserver | null = null;
const targets = new WeakMap<Element, Set<HTMLElement>>();
function shared(): IntersectionObserver | null {
  if (observer || typeof IntersectionObserver === 'undefined') return observer;
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        for (const el of targets.get(e.target) ?? []) el.classList.add('is-in');
        targets.delete(e.target);
        observer?.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  return observer;
}

/**
 * Revela el elemento al entrar en pantalla: `appReveal` sube y aparece; `appReveal="clip"` abre una
 * cortinilla (para fotos). `revealDelay` escalona elementos vecinos. Sin IntersectionObserver
 * (o con menos movimiento pedido) el contenido se ve desde el principio.
 */
@Directive({ selector: '[appReveal]', host: { '[style.--reveal-delay]': 'revealDelay() + "ms"' } })
export class RevealDirective implements OnInit, OnDestroy {
  readonly appReveal = input<'' | 'clip'>('');
  readonly revealDelay = input(0);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private witness: Element = this.el;

  ngOnInit() {
    this.el.classList.add(this.appReveal() === 'clip' ? 'reveal-clip' : 'reveal');
    const io = shared();
    if (!io || matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this.el.classList.add('is-in');
      return;
    }
    this.witness = this.appReveal() === 'clip' ? (this.el.parentElement ?? this.el) : this.el;
    const set = targets.get(this.witness) ?? new Set<HTMLElement>();
    set.add(this.el);
    targets.set(this.witness, set);
    io.observe(this.witness);
  }

  ngOnDestroy() {
    const set = targets.get(this.witness);
    set?.delete(this.el);
    if (set && !set.size) {
      targets.delete(this.witness);
      observer?.unobserve(this.witness);
    }
  }
}
