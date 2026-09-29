import { Injectable, computed, inject, signal } from '@angular/core';
import type { AuthUser } from '@vestirse/shared-types';
import { ApiService } from './api.service';

/** La cuenta es opcional: nada del probador depende de iniciar sesión. */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(ApiService);
  readonly user = signal<AuthUser | null>(null);
  readonly loaded = signal(false);
  readonly isAdmin = computed(() => this.user()?.role === 'admin');

  async refresh() {
    try {
      this.user.set(await this.api.me());
    } catch {
      this.user.set(null);
    } finally {
      this.loaded.set(true);
    }
  }

  async login(email: string, password: string) {
    this.user.set(await this.api.login(email, password));
  }

  async register(email: string, password: string) {
    this.user.set(await this.api.register(email, password));
  }

  async logout() {
    await this.api.logout();
    this.user.set(null);
  }

  async setConsent(value: boolean) {
    const res = await this.api.setConsent(value);
    this.user.update((u) => (u ? { ...u, retrainingConsent: res.retrainingConsent } : u));
  }

  async deleteAccount() {
    const res = await this.api.deleteAccount();
    this.user.set(null);
    return res;
  }
}
