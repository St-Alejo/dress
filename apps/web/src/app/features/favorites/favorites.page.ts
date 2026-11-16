import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { FavoriteOutfit } from '@vestirse/shared-types';
import { ApiService } from '../../core/api.service';
import { AuthStore } from '../../core/auth.store';
import { NoticeStore } from '../../core/notice.store';
import { PricePipe } from '../../shared/price.pipe';
import { IconComponent } from '../../shared/ui/icon.component';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { fitVerdict, outfitVerdict, totalCents, wearersOf } from './favorite-fit';

/**
 * "Mis favoritos": conjuntos probados con IA y guardados en la cuenta. Cada tarjeta muestra la
 * foto, las prendas con la talla probada frente a la recomendada y qué se ve por eso.
 */
@Component({
  selector: 'app-favorites-page',
  imports: [RouterLink, TranslocoPipe, PricePipe, IconComponent, SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .shot {
      background: #f6f5f2;
    }
  `,
  template: `
    <section class="mx-auto max-w-screen-2xl px-4 pt-8 pb-16 md:px-8">
      <header class="max-w-2xl">
        <h1 class="display text-[clamp(44px,8vw,128px)]">{{ 'favorites.title' | transloco }}</h1>
        <p class="mt-3 max-w-xl text-[14px] text-ink-2">{{ 'favorites.lead' | transloco }}</p>
      </header>

      @if (!auth.user()) {
        <div class="mt-8 border border-line p-10 text-center">
          <p class="text-[15px]">{{ 'favorites.signIn' | transloco }}</p>
          <a routerLink="/cuenta" class="btn btn-primary mt-5">{{ 'nav.signIn' | transloco }}</a>
        </div>
      } @else if (loading()) {
        <p class="sr-only" role="status">{{ 'common.loading' | transloco }}</p>
        <div class="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
          <ui-skeleton class="h-[520px]" /><ui-skeleton class="h-[520px]" /><ui-skeleton class="h-[520px]" />
        </div>
      } @else if (error()) {
        <div class="mt-8 border border-line p-8 text-center" role="alert">
          <p>{{ 'common.loadError' | transloco }}</p>
          <button type="button" class="btn mt-4" (click)="load()">{{ 'common.retry' | transloco }}</button>
        </div>
      } @else if (!favorites().length) {
        <div class="mt-8 border border-line p-10 text-center">
          <p class="text-[15px]">{{ 'favorites.empty' | transloco }}</p>
          <a routerLink="/carrito" class="btn btn-primary mt-5">{{ 'favorites.goCart' | transloco }}</a>
        </div>
      } @else {
        @if (wearers().length > 1) {
          <div class="mt-6 flex flex-wrap gap-2" role="group" [attr.aria-label]="'favorites.filter' | transloco">
            <button type="button" class="btn" [class.btn-primary]="!wearer()" [attr.aria-pressed]="!wearer()" (click)="wearer.set(null)">
              {{ 'favorites.all' | transloco }} <span class="tabular">({{ favorites().length }})</span>
            </button>
            @for (w of wearers(); track w) {
              <button type="button" class="btn" [class.btn-primary]="wearer() === w" [attr.aria-pressed]="wearer() === w" (click)="wearer.set(w)">
                {{ w }} <span class="tabular">({{ countFor(w) }})</span>
              </button>
            }
          </div>
        }

        <ul class="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          @for (fav of shown(); track fav.id) {
            <li class="flex flex-col border border-line">
              <div class="shot relative aspect-[2/3] overflow-hidden">
                <img [src]="fav.imageUrl" [alt]="'favorites.imageAlt' | transloco: { title: fav.title }" loading="lazy" class="absolute inset-0 h-full w-full object-contain" />
                @if (fav.wearer) {
                  <span class="absolute left-3 top-3 bg-paper px-2 py-1 text-[11px] uppercase tracking-[0.18em]">{{ fav.wearer }}</span>
                }
                @if (verdictOf(fav); as v) {
                  @if (v !== 'unknown') {
                    <span class="absolute right-3 top-3 px-2 py-1 text-[11px]" [class]="v === 'true' ? 'bg-paper' : 'bg-ink text-paper'">{{ 'favorites.verdict.' + v | transloco }}</span>
                  }
                }
              </div>
              <div class="flex flex-1 flex-col gap-3 p-4">
                <div class="flex items-start justify-between gap-3">
                  <h2 class="text-[17px] leading-snug">{{ fav.title }}</h2>
                  <span class="tabular text-[13px] text-ink-2">{{ total(fav) | price }}</span>
                </div>
                @if (fav.note) {
                  <p class="text-[13px] text-ink-2">{{ fav.note }}</p>
                }
                <ul class="space-y-1.5 border-t border-line pt-3 text-[13px]">
                  @for (it of fav.items; track it.garment.id) {
                    <li class="flex items-center gap-3">
                      @if (it.garment.images.thumb ?? it.garment.images.photo; as src) {
                        <img [src]="src" alt="" class="h-10 w-8 bg-surface-2 object-cover" loading="lazy" />
                      }
                      <a [routerLink]="['/prenda', it.garment.id]" class="min-w-0 flex-1 truncate hover:underline">{{ it.garment.name }}</a>
                      <span class="tabular whitespace-nowrap" [class.font-semibold]="fit(it) !== 'true' && fit(it) !== 'unknown'">
                        {{ 'favorites.size' | transloco: { size: it.size } }}
                        @if (it.recommendedSize && it.recommendedSize !== it.size) {
                          <span class="text-muted"> · {{ 'favorites.recommended' | transloco: { size: it.recommendedSize } }}</span>
                        }
                      </span>
                    </li>
                  }
                </ul>
                <div class="mt-auto pt-2">
                  <button type="button" class="btn btn-ghost text-[12px]" (click)="remove(fav)" [disabled]="busy() === fav.id">
                    <ui-icon name="trash" [size]="14" /> {{ 'favorites.remove' | transloco }}
                  </button>
                </div>
              </div>
            </li>
          }
        </ul>
        <p class="mt-6 text-[12px] text-muted"><ui-icon name="info" [size]="14" /> {{ 'favorites.disclaimer' | transloco }}</p>
      }
    </section>
  `,
})
export class FavoritesPage {
  private readonly api = inject(ApiService);
  private readonly notices = inject(NoticeStore);
  readonly auth = inject(AuthStore);

  readonly favorites = signal<FavoriteOutfit[]>([]);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly busy = signal<string | null>(null);
  readonly wearer = signal<string | null>(null);
  readonly wearers = computed(() => wearersOf(this.favorites()));
  readonly shown = computed(() => (this.wearer() ? this.favorites().filter((f) => f.wearer === this.wearer()) : this.favorites()));

  readonly fit = fitVerdict;
  readonly verdictOf = outfitVerdict;
  readonly total = totalCents;

  constructor() {
    void this.load();
  }

  async load() {
    if (!this.auth.loaded()) await this.auth.refresh();
    if (!this.auth.user()) return this.loading.set(false);
    this.loading.set(true);
    this.error.set(false);
    try {
      this.favorites.set((await this.api.favorites()).favorites);
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  countFor(w: string) {
    return this.favorites().filter((f) => f.wearer === w).length;
  }

  async remove(fav: FavoriteOutfit) {
    this.busy.set(fav.id);
    try {
      await this.api.deleteFavorite(fav.id);
      this.favorites.update((list) => list.filter((f) => f.id !== fav.id));
    } catch (err) {
      this.notices.error(err, 'errors.generic');
    } finally {
      this.busy.set(null);
    }
  }
}
