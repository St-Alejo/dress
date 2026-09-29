import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth.store';

@Component({
  selector: 'app-account-page',
  imports: [FormsModule, TranslocoPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-lg px-4 pt-8 pb-16 space-y-6">
      <header>
        <p class="eyebrow">{{ 'account.eyebrow' | transloco }}</p>
        <h1 class="mt-2 text-3xl">{{ 'account.title' | transloco }}</h1>
        <p class="mt-2 text-sm text-[var(--ink-2)]">{{ 'account.optional' | transloco }}</p>
      </header>

      @if (auth.user(); as user) {
        <div class="card p-5 space-y-4">
          <p>{{ 'account.signedInAs' | transloco }} <strong>{{ user.email }}</strong></p>
          @if (auth.isAdmin()) {
            <a routerLink="/admin" class="btn">{{ 'nav.admin' | transloco }}</a>
          }
          <label class="flex items-start gap-3 rounded-xl border border-[var(--line)] p-3">
            <input type="checkbox" class="mt-1 size-5" [checked]="user.retrainingConsent" (change)="auth.setConsent(!user.retrainingConsent)" />
            <span class="text-sm">
              <strong class="block">{{ 'account.consent.title' | transloco }}</strong>
              {{ 'account.consent.body' | transloco }}
            </span>
          </label>
          <button type="button" class="btn" (click)="auth.logout()">{{ 'account.logout' | transloco }}</button>
        </div>

        <div class="card p-5 space-y-3 border-[var(--danger)]">
          <h2 class="text-lg">{{ 'account.delete.title' | transloco }}</h2>
          <p class="text-sm text-[var(--ink-2)]">{{ 'account.delete.body' | transloco }}</p>
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
          <div class="flex gap-1 rounded-full bg-[var(--surface-2)] p-1" role="tablist">
            <button type="button" role="tab" class="flex-1 rounded-full py-2 text-sm min-h-[44px]" [class.bg-[var(--surface)]]="tab() === 'login'" [attr.aria-selected]="tab() === 'login'" (click)="tab.set('login')">{{ 'account.login' | transloco }}</button>
            <button type="button" role="tab" class="flex-1 rounded-full py-2 text-sm min-h-[44px]" [class.bg-[var(--surface)]]="tab() === 'register'" [attr.aria-selected]="tab() === 'register'" (click)="tab.set('register')">{{ 'account.register' | transloco }}</button>
          </div>
          <label class="field">{{ 'account.email' | transloco }}<input type="email" name="email" autocomplete="email" required [(ngModel)]="email" /></label>
          <label class="field">{{ 'account.password' | transloco }}
            <input type="password" name="password" minlength="8" required [(ngModel)]="password" [autocomplete]="tab() === 'login' ? 'current-password' : 'new-password'" />
          </label>
          @if (error()) {<p class="text-sm text-[var(--danger)]" role="alert">{{ error()! | transloco }}</p>}
          <button type="submit" class="btn btn-primary w-full" [disabled]="busy()">{{ 'account.' + tab() | transloco }}</button>
        </form>
      }
    </section>
  `,
})
export class AccountPage {
  readonly auth = inject(AuthStore);
  readonly tab = signal<'login' | 'register'>('login');
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

  async deleteAccount() {
    this.deleted.set(await this.auth.deleteAccount());
    this.confirmDelete.set(false);
  }
}
