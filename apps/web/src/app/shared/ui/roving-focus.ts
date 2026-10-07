/**
 * Navegación con teclado para grupos de un solo foco (tabs, radios): flechas,
 * Inicio y Fin. Devuelve el índice destino saltando opciones deshabilitadas, o
 * `null` si la tecla no corresponde. Función pura: se prueba sin DOM.
 */
export function nextRovingIndex(
  key: string,
  current: number,
  count: number,
  isDisabled: (i: number) => boolean = () => false,
): number | null {
  const step = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 0;
  if (key === 'Home' || key === 'End') {
    const order = [...Array(count).keys()];
    if (key === 'End') order.reverse();
    return order.find((i) => !isDisabled(i)) ?? null;
  }
  if (!step || count === 0) return null;
  for (let n = 1; n <= count; n++) {
    const i = (current + step * n + count) % count;
    if (!isDisabled(i)) return i;
  }
  return null;
}
