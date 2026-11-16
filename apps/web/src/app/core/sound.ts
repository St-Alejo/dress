import { Injectable, signal } from '@angular/core';
import { localPrefs } from './local-prefs';

export type Cue = 'shutter' | 'whoosh' | 'tick';

/**
 * Sonidos de interfaz (obturador, barrido, clic), creados con IA de audio. Apagados por defecto:
 * solo suenan si la persona los activa, y la elección se recuerda en este navegador.
 * Si el navegador no puede reproducir audio, se ignora en silencio.
 */
@Injectable({ providedIn: 'root' })
export class SoundService {
  readonly enabled = signal(localPrefs.read<boolean>('sound', false));
  private readonly cache = new Map<Cue, HTMLAudioElement>();
  private readonly volume: Record<Cue, number> = { shutter: 0.5, whoosh: 0.35, tick: 0.25 };

  toggle() {
    const next = !this.enabled();
    this.enabled.set(next);
    localPrefs.write('sound', next);
    if (next) this.play('tick');
  }

  play(cue: Cue) {
    if (!this.enabled() || typeof Audio === 'undefined') return;
    try {
      let audio = this.cache.get(cue);
      if (!audio) {
        audio = new Audio(`sound/${cue}.mp3`);
        audio.volume = this.volume[cue];
        this.cache.set(cue, audio);
      }
      audio.currentTime = 0;
      void audio.play().catch(() => undefined);
    } catch {
      /* sin audio: la interfaz funciona igual */
    }
  }
}
