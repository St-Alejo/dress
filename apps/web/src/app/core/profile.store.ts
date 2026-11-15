import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { ProfilePhotoResult, SavedProfile } from '@vestirse/shared-types';
import { ApiService } from './api.service';
import { AuthStore } from './auth.store';
import { profileMeasurements } from './measurements';
import { TryOnSessionStore } from './tryon-session.store';

export type ProfileValues = Pick<SavedProfile, 'heightCm' | 'weightKg' | 'chestCm' | 'waistCm' | 'hipCm' | 'shoulderCm'>;

/**
 * Perfil guardado en la cuenta (foto + medidas), SOLO si la persona dio su consentimiento.
 * Cada cambio se propaga al instante: las medidas pasan al probador y la talla se recalcula
 * en la ficha, la cámara y la prueba con foto.
 */
@Injectable({ providedIn: 'root' })
export class ProfileStore {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthStore);
  private readonly tryon = inject(TryOnSessionStore);

  readonly profile = signal<SavedProfile | null>(null);
  readonly loaded = signal(false);
  readonly busy = signal(false);
  /** Última respuesta al subir o volver a medir la foto (aviso de encuadre y lo que vio la IA). */
  readonly lastPhoto = signal<ProfilePhotoResult | null>(null);

  /** `updatedAt` en la URL: la imagen no se cachea, pero así el <img> se refresca al cambiarla. */
  readonly photoUrl = computed(() => {
    const p = this.profile();
    return p?.hasPhoto ? `/api/profile/photo?v=${encodeURIComponent(p.updatedAt)}` : null;
  });

  constructor() {
    // Iniciar o cerrar sesión cambia de persona: se carga su perfil o se olvida el anterior.
    effect(() => {
      const user = this.auth.user();
      untracked(() => (user ? void this.load() : this.reset()));
    });
  }

  async load() {
    try {
      const { profile } = await this.api.profile();
      this.set(profile);
    } catch {
      this.profile.set(null);
    } finally {
      this.loaded.set(true);
    }
  }

  /** Guardar implica el consentimiento: el formulario solo lo envía con la casilla marcada. */
  async save(values: ProfileValues) {
    return this.run(async () => this.set(await this.api.saveProfile({ ...values, consent: true })));
  }

  async setPhoto(photo: Blob) {
    return this.run(async () => this.adoptPhotoResult(await this.api.uploadProfilePhoto(photo)));
  }

  async remeasure() {
    return this.run(async () => this.adoptPhotoResult(await this.api.remeasureProfile()));
  }

  async deletePhoto() {
    return this.run(async () => this.set(await this.api.deleteProfilePhoto()));
  }

  /** Retirar el consentimiento: el servidor borra perfil y foto; aquí se olvidan las medidas. */
  async remove() {
    return this.run(async () => {
      await this.api.deleteProfile();
      this.reset();
      this.tryon.forgetMeasurements();
    });
  }

  /** La foto del perfil como archivo, para usarla en «Con tu foto» sin volver a elegirla. */
  photoBlob() {
    return this.api.profilePhoto();
  }

  private adoptPhotoResult(result: ProfilePhotoResult) {
    this.lastPhoto.set(result);
    this.set(result.profile);
  }

  private set(profile: SavedProfile | null) {
    this.profile.set(profile);
    if (profile) void this.tryon.adoptMeasurements(profileMeasurements(profile));
  }

  private reset() {
    this.profile.set(null);
    this.lastPhoto.set(null);
    this.loaded.set(false);
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    this.busy.set(true);
    try {
      return await fn();
    } finally {
      this.busy.set(false);
    }
  }
}
