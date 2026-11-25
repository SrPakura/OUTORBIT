// ============================================================================
// Música de fondo — reproductor con fundidos y silencio entre pistas
// ============================================================================
//
// Cada pista suena de inicio a fin (sin loop). Al terminar, un fundido en
// silencio de duración aleatoria (3-6 s) y arranca la siguiente: la que haya
// quedado en cola (la oleada más reciente la pidió) o, si nadie pidió nada,
// la rotación natural (waveA <-> waveB).
//
// Excepción — jefe: la pista del jefe interrumpe SIEMPRE, aunque la actual
// vaya por la mitad: fundido corto (~1 s) y suena la de boss. Al acabar la
// oleada del jefe ocurre lo contrario: la de boss se funde vaya por donde
// vaya y vuelve la de básicos.
//
// Autoplay: los navegadores bloquean `play()` sin un gesto previo del usuario.
// Si la promesa se rechaza, la pista queda pendiente y se reintenta en el
// primer pointerdown/keydown.
//
// MPRIS (widget multimedia del escritorio): un ÚNICO `<audio>` oculto montado
// en `document.body` que cambia de `src` entre pistas. Elementos sueltos sin
// DOM (o saltar de elemento en elemento) hacen que Firefox/Linux pierda la
// sesión del widget; portada en URL absoluta y duración vía
// `setPositionState` para que salga el reloj en vez de `--:-- / --:--`.

export type MusicTrackId = 'menu' | 'waveA' | 'waveB' | 'boss';

const TRACK_SOURCES: Record<MusicTrackId, string> = {
  menu: '/audio/menu.mp3',
  waveA: '/audio/wave-nocturnal.mp3',
  waveB: '/audio/wave-singularity.mp3',
  boss: '/audio/boss.mp3',
};

/**
 * Metadatos publicados en la Media Session API (`navigator.mediaSession`):
 * el navegador los expone al sistema (MPRIS en Linux) y con ello el widget de
 * medios del escritorio muestra título/portada y estado de reproducción,
 * como con Spotify web o YouTube. Una ÚNICA portada para todo el OST
 * (`public/audio/covers/cover.webp`, cuadrada, 512px+); cada pista se
 * distingue en el widget por su título.
 *
 * URL ABSOLUTA deliberada: los puentes MPRIS de Linux (Firefox) descartan
 * portadas con ruta relativa — la portada se resuelve contra el origen real
 * de la página, vale igual en dev (localhost) y en producción (base44.app).
 */
const COVER_ART = new URL('/audio/covers/cover.webp', window.location.origin).href;

const TRACK_TITLES: Record<MusicTrackId, string> = {
  menu: 'Menú',
  waveA: 'Nocturnal',
  waveB: 'Singularity',
  boss: 'Boss',
};

/** Publica la portada y el título de la pista en los controles del sistema. */
function publishTrackMetadata(track: MusicTrackId): void {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: TRACK_TITLES[track],
    artist: 'OUTORBIT',
    album: 'OUTORBIT OST',
    artwork: [{ src: COVER_ART, sizes: '512x512', type: 'image/webp' }],
  });
}

/** Estado de reproducción para el widget (none = sin medio activo). */
function setMediaPlayback(state: MediaSessionPlaybackState): void {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.playbackState = state;
}

/**
 * Duración/posición de la pista para el widget: sin estado de posición,
 * muchos widgets MPRIS muestran `--:-- / --:--` (portada y título salen,
 * pero el reloj no). Se publica al `loadedmetadata` de cada pista.
 */
function publishPositionState(el: HTMLAudioElement): void {
  if (!('mediaSession' in navigator)) return;
  const duration = Number.isFinite(el.duration) ? el.duration : 0;
  if (duration <= 0 || el.playbackRate <= 0) return;
  try {
    navigator.mediaSession.setPositionState({
      duration,
      playbackRate: el.playbackRate,
      position: Math.min(el.currentTime, duration),
    });
  } catch {
    // Duración/posición fuera de rango (metadata a medias): se ignora.
  }
}

/**
 * Volumen base de la música; el multiplicador de ajustes se aplica encima.
 * Se queda por debajo de los efectos para que las alertas del HUD (vida,
 * Edén, subida de nivel, oleada) se oigan siempre por encima del tema.
 */
const BASE_VOLUME = 0.2;
/** Paso de la rampa por tick: 0.05 cada 50 ms -> ~1 s de fundido completo. */
const FADE_STEP = 0.05;
const FADE_TICK_MS = 50;
/** Silencio entre pistas: 3-6 s aleatorios. */
const GAP_MIN_MS = 3000;
const GAP_MAX_MS = 6000;
/** Rotación natural al terminar una pista sin peticiones en cola. */
const NATURAL_NEXT: Record<MusicTrackId, MusicTrackId> = {
  menu: 'menu',
  waveA: 'waveB',
  waveB: 'waveA',
  boss: 'boss',
};

export class MusicPlayer {
  /**
   * ÚNICO `<audio>` de la música, OCULTO y MONTADO en `document.body`.
   * Firefox sobre Linux solo expone al widget MPRIS los elementos de audio
   * que viven en el DOM, y saltar de elemento en elemento al cambiar de
   * pista (el viejo Map con un `<audio>` por canción) le hacía perder la
   * sesión: con un único elemento que cambia de `src` el controlador no
   * pierde el foco nunca (pasa como con el reproductor de Spotify web).
   */
  private el: HTMLAudioElement | null = null;
  private current: MusicTrackId | null = null;
  /** Pista pedida mientras suena otra (no jefe): suena al terminar la actual. */
  private queued: MusicTrackId | null = null;
  /** Pista que arranca en cuanto termine el fundido de interrupción. */
  private pendingSwitch: MusicTrackId | null = null;
  /** Temporizador del silencio entre pistas (fin natural -> siguiente). */
  private gapTimer: ReturnType<typeof setTimeout> | null = null;
  private volumeMultiplier = 1;
  private muted = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private blocked: MusicTrackId | null = null;
  private unlockBound = false;
  /** Botones play/pausa del widget ya registrados (una vez por pestaña). */
  private mediaActionsBound = false;

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
    // El volumen a 0 no pausa el audio: el estado del widget se publica a mano.
    setMediaPlayback(muted ? 'paused' : this.current !== null ? 'playing' : 'none');
  }

  /**
   * Pide una pista. Reglas:
   * - Nada sonando: arranca ya.
   * - Jefe pedido con otra cosa sonando: interrumpe con fundido (a mitad de
   *   canción si hace falta) y suena la del jefe.
   * - Cambio de contexto menú <-> juego: también interrumpe (la del menú no
   *   se queda sonando minutos dentro de la Cúpula; al volver al título
   *   ocurre lo contrario).
   * - Algo sonando y llega otra del mismo contexto: va a la cola; la actual
   *   acaba de inicio a fin y, tras el silencio, arranca la nueva.
   * - La del jefe sonando y llega una no-jefe (fin de oleada de jefe): se
   *   interrumpe igual, vaya por donde vaya la canción.
   */
  play(track: MusicTrackId): void {
    // Silencio entre pistas: la anterior ya acabó, la petición arranca ya.
    if (this.gapTimer !== null) {
      this.clearGap();
      this.startTrack(track);
      return;
    }
    if (this.current === track && this.pendingSwitch === null) {
      this.queued = null;
      return;
    }
    const interrupting =
      this.current !== null &&
      (track === 'boss' ||
        this.current === 'boss' ||
        (track === 'menu') !== (this.current === 'menu'));
    if (this.current === null) {
      this.startTrack(track);
      return;
    }
    if (interrupting) {
      this.queued = null;
      this.pendingSwitch = track;
      this.startFade();
      return;
    }
    this.queued = track;
  }

  /** Baja el volumen hasta cero y deja de sonar. */
  stop(): void {
    if (this.current === null && this.pendingSwitch === null) return;
    this.current = null;
    this.queued = null;
    this.pendingSwitch = null;
    this.clearGap();
    this.startFade();
    setMediaPlayback('none');
  }

  dispose(): void {
    this.stopTimer();
    this.clearGap();
    if (this.el !== null) {
      this.el.pause();
      this.el.removeAttribute('src');
      this.el.remove();
      this.el = null;
    }
    this.current = null;
    this.pendingSwitch = null;
    this.queued = null;
    setMediaPlayback('none');
  }

  // --------------------------------------------------------------------------
  // Interno
  // --------------------------------------------------------------------------

  /**
   * Crea (una sola vez) el `<audio>` del reproductor y lo MONTA oculto en
   * `document.body`: sin DOM, Firefox/Linux no lo ve para MPRIS.
   */
  private element(): HTMLAudioElement {
    if (this.el !== null) return this.el;
    const el = new Audio();
    // Sin loop: la pista vive de inicio a fin y el `ended` decide qué
    // viene después (silencio aleatorio + siguiente).
    el.loop = false;
    el.preload = 'auto';
    el.hidden = true;
    document.body.appendChild(el);
    el.addEventListener('ended', () => this.onTrackEnded());
    // El reloj del widget: sin esto, Media Session arranca sin duración y
    // el sistema muestra `--:-- / --:--` hasta que algo la refresque.
    el.addEventListener('loadedmetadata', () => publishPositionState(el));
    this.el = el;
    return el;
  }

  /** Arranca una pista desde el principio con fundido de entrada. */
  private startTrack(track: MusicTrackId): void {
    this.current = track;
    this.queued = null;
    this.pendingSwitch = null;
    const el = this.element();
    // Mismo `<audio>`, nueva `src`: reciclar elemento (no crear otro) es lo
    // que mantiene viva la sesión MPRIS entre pistas.
    el.src = TRACK_SOURCES[track];
    el.currentTime = 0;
    // Entrada desde nada: el fundido de arranque sube hasta el objetivo.
    el.volume = 0.01;
    this.resume(el, track);
    this.startFade();
    // Media Session: portada + título en el widget del sistema, estado sonando.
    publishTrackMetadata(track);
    setMediaPlayback(this.muted ? 'paused' : 'playing');
    this.bindMediaSessionActions();
  }

  /** Fin natural de una pista: silencio de 3-6 s y luego la siguiente. */
  private onTrackEnded(): void {
    const track = this.current;
    if (track === null || this.pendingSwitch !== null) return;
    const next = this.queued ?? NATURAL_NEXT[track];
    this.queued = null;
    setMediaPlayback('paused');
    const gap = GAP_MIN_MS + Math.random() * (GAP_MAX_MS - GAP_MIN_MS);
    this.gapTimer = setTimeout(() => {
      this.gapTimer = null;
      // Durante el silencio pudo llegar una interrupción (p. ej. jefe).
      if (this.current !== track || this.pendingSwitch !== null) return;
      this.startTrack(next);
    }, gap);
  }

  private clearGap(): void {
    if (this.gapTimer === null) return;
    clearTimeout(this.gapTimer);
    this.gapTimer = null;
  }

  private targetVolume(): number {
    return this.muted ? 0 : BASE_VOLUME * this.volumeMultiplier;
  }

  private resume(el: HTMLAudioElement, track: MusicTrackId): void {
    const attempt = el.play();
    if (!attempt) return;
    attempt.catch(() => {
      this.blocked = track;
      setMediaPlayback('paused');
      this.bindUnlock();
    });
  }

  /**
   * Botones del widget: play/pausa actúan como el silencio del juego (el
   * audio nunca se congela de verdad — la pista sigue su cola y sus
   * fundidos). previoustrack/nexttrack no se registran: la música depende del
   * estado del juego, no del usuario.
   */
  private bindMediaSessionActions(): void {
    if (this.mediaActionsBound || !('mediaSession' in navigator)) return;
    this.mediaActionsBound = true;
    navigator.mediaSession.setActionHandler('play', () => this.setMuted(false));
    navigator.mediaSession.setActionHandler('pause', () => this.setMuted(true));
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
      if (track && this.current === track) {
        this.resume(this.element(), track);
        setMediaPlayback(this.muted ? 'paused' : 'playing');
      }
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
    const el = this.el;
    if (el === null) {
      this.stopTimer();
      return;
    }
    const target = this.targetVolume();
    // Interrupción en curso: la pista ACTUAL se funde a cero (el relevo
    // sube ya como `current` con su propio cambio de src). Tras stop():
    // fundido a cero y pausa. El resto de cambios (multiplicador/mute) solo
    // persiguen el objetivo sobre la pista que suena.
    const goal =
      this.pendingSwitch !== null || this.current === null ? 0 : target;
    const diff = goal - el.volume;
    if (Math.abs(diff) > FADE_STEP) {
      el.volume = Math.min(1, Math.max(0, el.volume + Math.sign(diff) * FADE_STEP));
      return;
    }
    if (el.volume !== goal) el.volume = goal;
    // Muteado NO pausa: la pista sigue avanzando a volumen 0 (el unmute
    // cae en el compás real). Solo se congela al interrumpir o parar,
    // cuando el elemento ya va a cambiar de src o callar para siempre.
    if (
      goal === 0 &&
      this.pendingSwitch === null &&
      this.current === null &&
      !el.paused
    ) {
      el.pause();
    }
    this.stopTimer();
    // El fundido de interrupción terminó: arranca la pista pendiente.
    if (this.pendingSwitch !== null) {
      const next = this.pendingSwitch;
      this.pendingSwitch = null;
      this.startTrack(next);
    }
  }
}

/** Instancia única: la música sobrevive al cambio de pantalla (menú -> partida). */
export const musicPlayer = new MusicPlayer();
