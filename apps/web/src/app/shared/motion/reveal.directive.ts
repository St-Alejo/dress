import { Directive, ElementRef, OnDestroy, OnInit, inject, input } from '@angular/core';

/**
 * Registro compartido para toda la página (patrón Flyweight): cada elemento se apunta y se olvida al
 * entrar en pantalla. Con la cortinilla el elemento está recortado del todo y el navegador lo da por
 * invisible, así que se vigila un "testigo" (su contenedor) y al entrar este se revelan sus elementos.
 *
 * El IntersectionObserver es el camino normal; como respaldo (pestañas en segundo plano, saltos de
 * scroll que no llegan a pintarse) se comprueba la posición una vez por fotograma al hacer scroll.
 */
const pending = new Map<Element, Set<HTMLElement>>();
let observer: IntersectionObserver | null = null;
let listening = false;
let frame = 0;

function reveal(witness: Element) {
  for (const el of pending.get(witness) ?? []) el.classList.add('is-in');
  pending.delete(witness);
  observer?.unobserve(witness);
}

/** Revela todo testigo cuyo borde superior ya asomó por el 92 % inferior de la ventana. */
function sweep() {
  frame = 0;
  const limit = window.innerHeight * 0.92;
  for (const w of [...pending.keys()]) {
    const r = w.getBoundingClientRect();
    if (r.top < limit && r.bottom > 0) reveal(w);
  }
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(sweep);
}

function setup(): boolean {
  if (typeof window === 'undefined') return false;
  if (!observer && typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) reveal(e.target);
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
  }
  if (!listening) {
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    listening = true;
  }
  return true;
}

/**
 * Revela el elemento al entrar en pantalla: `appReveal` sube y aparece; `appReveal="clip"` abre una
 * cortinilla (para fotos). `revealDelay` escalona elementos vecinos. Con menos movimiento pedido el
 * contenido se ve desde el principio.
 */
@Directive({ selector: '[appReveal]', host: { '[style.--reveal-delay]': 'revealDelay() + "ms"' } })
export class RevealDirective implements OnInit, OnDestroy {
  readonly appReveal = input<'' | 'clip'>('');
  readonly revealDelay = input(0);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private witness: Element = this.el;

  ngOnInit() {
    this.el.classList.add(this.appReveal() === 'clip' ? 'reveal-clip' : 'reveal');
    if (!setup() || matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this.el.classList.add('is-in');
      return;
    }
    this.witness = this.appReveal() === 'clip' ? (this.el.parentElement ?? this.el) : this.el;
    const set = pending.get(this.witness) ?? new Set<HTMLElement>();
    set.add(this.el);
    pending.set(this.witness, set);
    observer?.observe(this.witness);
    // Lo que ya está en pantalla al montarse no espera a que alguien haga scroll.
    schedule();
  }

  ngOnDestroy() {
    const set = pending.get(this.witness);
    set?.delete(this.el);
    if (set && !set.size) {
      pending.delete(this.witness);
      observer?.unobserve(this.witness);
    }
  }
}
