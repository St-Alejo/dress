import { Injectable, computed, signal } from '@angular/core';
import { outfitConflict, slotsOf, type GarmentCategory, type GarmentItem, type OutfitSlot } from '@vestirse/shared-types';
import { localPrefs } from './local-prefs';

/** Una línea del carrito: la prenda y la talla elegida (sin talla si aún no se eligió). */
export interface CartItem {
  garmentId: string;
  size: string | null;
}

const KEY = 'cart';
export const MAX_CART_ITEMS = 30;

/**
 * Carrito en este navegador (sin cuenta, nada sale del dispositivo). Puede tener dos camisas
 * para comprar; lo que no se puede es PONÉRSELAS a la vez: eso lo decide `toggleWorn`.
 */
@Injectable({ providedIn: 'root' })
export class CartStore {
  readonly items = signal<CartItem[]>(localPrefs.read<CartItem[]>(KEY, []).filter(isItem));
  readonly count = computed(() => this.items().length);

  has(garmentId: string, size: string | null = null): boolean {
    return this.items().some((i) => i.garmentId === garmentId && (size === null || i.size === size));
  }

  /** Añade la prenda; si ya estaba con la misma talla no la repite. */
  add(garmentId: string, size: string | null): boolean {
    if (this.has(garmentId, size) || this.count() >= MAX_CART_ITEMS) return false;
    this.persist([...this.items(), { garmentId, size }]);
    return true;
  }

  remove(index: number): void {
    this.persist(this.items().filter((_, i) => i !== index));
  }

  setSize(index: number, size: string): void {
    this.persist(this.items().map((item, i) => (i === index ? { ...item, size } : item)));
  }

  clear(): void {
    this.items.set([]);
    localPrefs.remove(KEY);
  }

  private persist(items: CartItem[]) {
    this.items.set(items);
    localPrefs.write(KEY, items);
  }
}

/**
 * Probador: elegir `garment` para ponérselo. Sustituye lo que ocupaba sus zonas (otra camisa, o
 * el pantalón si es un vestido); volver a elegir lo mismo lo quita.
 */
export function toggleWorn(worn: GarmentItem[], garment: GarmentItem): GarmentItem[] {
  if (worn.some((g) => g.id === garment.id)) return worn.filter((g) => g.id !== garment.id);
  const taken = new Set<OutfitSlot>(slotsOf(garment.category));
  return [...worn.filter((g) => !slotsOf(g.category).some((s) => taken.has(s))), garment];
}

/** Primera prenda de cada zona del carrito: el conjunto inicial del probador, siempre posible. */
export function defaultOutfit(items: GarmentItem[]): GarmentItem[] {
  return items.reduce<GarmentItem[]>((worn, g) => (outfitConflict([...worn.map((w) => w.category), g.category] as GarmentCategory[]) ? worn : [...worn, g]), []);
}

function isItem(v: unknown): v is CartItem {
  const i = v as CartItem;
  return !!i && typeof i.garmentId === 'string' && (i.size === null || typeof i.size === 'string');
}
