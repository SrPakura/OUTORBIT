// ============================================================================
// Música de fondo — reproductor con crossfade
// ============================================================================
//
// Cuatro pistas servidas desde `public/audio/`: la del menú, dos que rotan en
// las oleadas básicas y de miniboss, y la del jefe. El volumen se rampa con un
// temporizador corto (50 ms) para que el cambio de pista no corte en seco: la
// saliente baja mientras la entrante sube.
//
// Autoplay: los navegadores bloquean `play()` sin un gesto previo del usuario.
// Si la promesa se rechaza, la pista queda pendiente y se reintenta en el
// primer pointerdown/keydown.

export type MusicTrackId = 'menu' | 'waveA' | 'waveB' | 'boss';

const TRACK_SOURCES: Record<MusicTrackId, string> = {
  menu: '/audio/menu.mp3',
  waveA: '/audio/wave-nocturnal.mp3',
  waveB: '/audio/wave-singularity.mp3',
  boss: '/audio/boss.mp3',
};

/**
 * Volumen base de la música; el multiplicador de ajustes se aplica encima.
 * Se queda por debajo de los efectos para que las alertas del HUD (vida,
 * Edén, subida de nivel, oleada) se oigan siempre por encima del tema.
 */
const BASE_VOLUME = 0.2;
/** Paso de la rampa por tick: 0.05 cada 50 ms -> ~1 s de crossfade completo. */
const FADE_STEP = 0.05;
const FADE_TICK_MS = 50;

export class MusicPlayer {
  private readonly elements = new Map<MusicTrackId, HTMLAudioElement>();
  private current: MusicTrackId | null = null;
  private volumeMultiplier = 1;
  private muted = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private blocked: MusicTrackId | null = null;
  private unlockBound = false;

  /** Pista sonando ahora mismo (null = silencio). */
  get track(): MusicTrackId | null {
    return this.current;
  }

  /** Escala el volumen de la música (ajuste `masterVolume`, 0 .. 1.5). */
  setVolumeMultiplier(mul: number): void {
    this.volumeMultiplier = Number.isFinite(mul) ? Math.min(Math.max(mul, 0), 1.5) : 1;
    this.startFade();
  }

  /** Silencia o restaura la música sin perder la pista en curso. */
  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    this.startFade();
  }

  /** Cambia de pista con crossfade (no-op si ya está sonando). */
  play(track: MusicTrackId): void {
    if (this.current === track) return;
    this.current = track;
    const el = this.element(track);
    el.currentTime = 0;
    this.resume(el, track);
    this.startFade();
  }

  /** Baja el volumen hasta cero y deja de sonar. */
  stop(): void {
    if (this.current === null) return;
    this.current = null;
    this.startFade();
  }

  dispose(): void {
    this.stopTimer();
    for (const el of this.elements.values()) {
      el.pause();
      el.removeAttribute('src');
    }
    this.elements.clear();
    this.current = null;
  }

  // --------------------------------------------------------------------------
  // Interno
  // --------------------------------------------------------------------------

  private element(track: MusicTrackId): HTMLAudioElement {
    let el = this.elements.get(track);
    if (!el) {
      el = new Audio(TRACK_SOURCES[track]);
      el.loop = true;
      el.preload = 'auto';
      el.volume = 0;
      this.elements.set(track, el);
    }
    return el;
  }

  private targetVolume(): number {
    return this.muted ? 0 : BASE_VOLUME * this.volumeMultiplier;
  }

  private resume(el: HTMLAudioElement, track: MusicTrackId): void {
    const attempt = el.play();
    if (!attempt) return;
    attempt.catch(() => {
      this.blocked = track;
      this.bindUnlock();
    });
  }

  /** Reintenta la pista bloqueada en el primer gesto del usuario. */
  private bindUnlock(): void {
    if (this.unlockBound) return;
    this.unlockBound = true;
    const retry = () => {
      window.removeEventListener('pointerdown', retry);
      window.removeEventListener('keydown', retry);
      this.unlockBound = false;
      const track = this.blocked;
      this.blocked = null;
      if (track && this.current === track) this.resume(this.element(track), track);
    };
    window.addEventListener('pointerdown', retry);
    window.addEventListener('keydown', retry);
  }

  private startFade(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.tick(), FADE_TICK_MS);
  }

  private stopTimer(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const target = this.targetVolume();
    let moving = false;
    for (const [id, el] of this.elements) {
      const goal = id === this.current ? target : 0;
      const diff = goal - el.volume;
      if (Math.abs(diff) <= FADE_STEP) {
        if (el.volume !== goal) el.volume = goal;
        if (id !== this.current && !el.paused) el.pause();
        continue;
      }
      el.volume = Math.min(1, Math.max(0, el.volume + Math.sign(diff) * FADE_STEP));
      moving = true;
    }
    if (!moving) this.stopTimer();
  }
}

/** Instancia única: la música sobrevive al cambio de pantalla (menú -> partida). */
export const musicPlayer = new MusicPlayer();
