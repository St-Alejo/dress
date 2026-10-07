import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth.store';
import { NoticeStore } from '../../core/notice.store';
import { TabsComponent, type TabItem } from '../../shared/ui/tabs.component';

@Component({
  selector: 'app-account-page',
  imports: [FormsModule, TranslocoPipe, RouterLink, TabsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-md px-4 pt-10 pb-16 space-y-8">
      <header>
        <h1 class="text-[28px] md:text-[32px]">{{ 'account.title' | transloco }}</h1>
        <p class="mt-3 text-[14px] text-ink-2">{{ 'account.optional' | transloco }}</p>
      </header>

      @if (auth.user(); as user) {
        <div class="card p-5 space-y-4">
          <p>{{ 'account.signedInAs' | transloco }} <strong>{{ user.email }}</strong></p>
          @if (auth.isAdmin()) {
            <a routerLink="/admin" class="btn">{{ 'nav.admin' | transloco }}</a>
          }
          <label class="flex items-start gap-3 border-y border-line py-4">
            <input type="checkbox" class="mt-1 size-5" [checked]="user.retrainingConsent" (change)="setConsent(!user.retrainingConsent, $event)" />
            <span class="text-sm">
              <strong class="block">{{ 'account.consent.title' | transloco }}</strong>
              {{ 'account.consent.body' | transloco }}
            </span>
          </label>
          <button type="button" class="btn" (click)="logout()">{{ 'account.logout' | transloco }}</button>
        </div>

        <div class="card p-5 space-y-3 border-danger">
          <h2 class="text-lg">{{ 'account.delete.title' | transloco }}</h2>
          <p class="text-sm text-ink-2">{{ 'account.delete.body' | transloco }}</p>
          @if (!confirmDelete()) {
            <button type="button" class="btn" (click)="confirmDelete.set(true)">{{ 'account.delete.cta' | transloco }}</button>
          } @else {
            <div class="flex flex-wrap gap-2">
              <button type="button" class="btn btn-primary" (click)="deleteAccount()">{{ 'account.delete.confirm' | transloco }}</button>
              <button type="button" class="btn btn-ghost" (click)="confirmDelete.set(false)">{{ 'common.cancel' | transloco }}</button>
            </div>
          }
        </div>
      } @else {
        @if (deleted(); as d) {
          <p class="card p-4 text-sm" role="status">{{ 'account.delete.done' | transloco: d }}</p>
        }
        <form class="card p-5 space-y-3" (ngSubmit)="submit()">
          <ui-tabs [items]="authTabs()" [(active)]="tab" [stretch]="true" />
          <label class="field">{{ 'account.email' | transloco }}<input type="email" name="email" autocomplete="email" required [(ngModel)]="email" /></label>
          <label class="field">{{ 'account.password' | transloco }}
            <input type="password" name="password" minlength="8" required [(ngModel)]="password" [autocomplete]="tab() === 'login' ? 'current-password' : 'new-password'" />
          </label>
          @if (error()) {<p class="text-sm text-danger" role="alert">{{ error()! | transloco }}</p>}
          <button type="submit" class="btn btn-primary w-full" [disabled]="busy()">{{ 'account.' + tab() | transloco }}</button>
        </form>
      }
    </section>
  `,
})
export class AccountPage {
  readonly auth = inject(AuthStore);
  private readonly notices = inject(NoticeStore);
  readonly tab = signal<'login' | 'register'>('login');
  private readonly transloco = inject(TranslocoService);
  private readonly dictionary = toSignal(this.transloco.selectTranslation());
  readonly authTabs = computed<TabItem<'login' | 'register'>[]>(() => {
    this.dictionary();
    return (['login', 'register'] as const).map((t) => ({ id: t, label: this.transloco.translate('account.' + t) }));
  });
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly confirmDelete = signal(false);
  readonly deleted = signal<{ deletedObjects: number; deletedSessions: number } | null>(null);
  email = '';
  password = '';

  async submit() {
    this.busy.set(true);
    this.error.set(null);
    try {
      if (this.tab() === 'login') await this.auth.login(this.email, this.password);
      else await this.auth.register(this.email, this.password);
      this.password = '';
    } catch (err) {
      const status = (err as { status?: number }).status;
      this.error.set(status === 409 ? 'account.error.exists' : status === 401 ? 'account.error.credentials' : 'account.error.generic');
    } finally {
      this.busy.set(false);
    }
  }

  async setConsent(value: boolean, event: Event) {
    try {
      await this.auth.setConsent(value);
    } catch (err) {
      // La casilla vuelve a reflejar lo que dice el servidor.
      (event.target as HTMLInputElement).checked = !value;
      this.notices.error(err, 'errors.consent');
    }
  }

  async logout() {
    try {
      await this.auth.logout();
    } catch (err) {
      this.notices.error(err, 'errors.generic');
    }
  }

  async deleteAccount() {
    this.busy.set(true);
    try {
      this.deleted.set(await this.auth.deleteAccount());
      this.confirmDelete.set(false);
    } catch (err) {
      this.notices.error(err, 'errors.deleteAccount');
    } finally {
      this.busy.set(false);
    }
  }
}
