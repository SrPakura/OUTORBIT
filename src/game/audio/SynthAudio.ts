// ============================================================================
// Hito 4 — Audio Procedural con Web Audio API
// ============================================================================
//
// Sonidos sintetizados ligeros y agradables (envolventes cortas, volumen
// moderado ~0.18) sin dependencias externas. El AudioContext se crea/reanuda
// al primer gesto del usuario (`unlock`). La tecla M alterna el mute.

/** Tipos de sonido del juego (enrutados desde PlayerController / WorldObjects). */
export type GameSoundKind =
  | 'jump'
  | 'anchor'
  | 'stasisGrab'
  | 'stasisThrow'
  | 'parry'
  | 'gravityShift'
  | 'explosion'
  | 'alert'
  | 'bossHit'
  | 'victory';

const MASTER_VOLUME = 0.18;

/**
 * Sintetizador procedural: osciladores con envolventes cortas + ruido filtrado
 * para explosiones. Todas las llamadas son seguras si el AudioContext aún no
 * existe o el navegador lo tiene suspendido (silencio hasta el primer gesto).
 */
export class SynthAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private _muted = false;

  get muted(): boolean {
    return this._muted;
  }

  /** Crea/reanuda el AudioContext (llamar en el primer gesto del usuario). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this._muted ? 0 : MASTER_VOLUME;
    this.master.connect(this.ctx.destination);
  }

  /** Alterna el mute; devuelve el nuevo estado. */
  toggleMute(): boolean {
    this._muted = !this._muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this._muted ? 0 : MASTER_VOLUME, this.ctx.currentTime, 0.01);
    }
    return this._muted;
  }

  /** Reproduce un sonido por su tipo (no-op si está silenciado o sin contexto). */
  play(kind: GameSoundKind): void {
    if (this._muted || !this.ctx || !this.master) return;
    switch (kind) {
      case 'jump':
        this.playJump();
        break;
      case 'anchor':
        this.playAnchor();
        break;
      case 'stasisGrab':
        this.playStasisGrab();
        break;
      case 'stasisThrow':
        this.playStasisThrow();
        break;
      case 'parry':
        this.playParry();
        break;
      case 'gravityShift':
        this.playGravityShift();
        break;
      case 'explosion':
        this.playExplosion();
        break;
      case 'alert':
        this.playAlert();
        break;
      case 'bossHit':
        this.playBossHit();
        break;
      case 'victory':
        this.playVictory();
        break;
    }
  }

  // --------------------------------------------------------------------------
  // Primitivas de síntesis
  // --------------------------------------------------------------------------

  /** Oscilador con barrido de frecuencia y envolvente ADSR corta. */
  private tone(
    type: OscillatorType,
    fromFreq: number,
    toFreq: number,
    duration: number,
    volume: number,
    delay = 0
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(fromFreq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(toFreq, 1), t0 + duration);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + Math.min(0.02, duration * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  /** Ruido blanco con filtro lowpass y envolvente (explosiones). */
  private noise(duration: number, volume: number, cutoff: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    if (!this.noiseBuffer) {
      const length = Math.floor(ctx.sampleRate * 0.5);
      this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(cutoff * 0.15, 60), t0 + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  // --------------------------------------------------------------------------
  // Sonidos del juego
  // --------------------------------------------------------------------------

  /** Salto: blip ascendente suave. */
  playJump(): void {
    this.tone('sine', 320, 620, 0.12, 0.7);
  }

  /** Ancla gravitatoria: zumbido grave con barrido descendente. */
  playAnchor(): void {
    this.tone('triangle', 240, 110, 0.2, 0.8);
    this.tone('sine', 480, 240, 0.12, 0.35, 0.02);
  }

  /** Captura de Estasis: doble blip cristalino. */
  playStasisGrab(): void {
    this.tone('sine', 520, 760, 0.08, 0.6);
    this.tone('sine', 760, 980, 0.08, 0.45, 0.06);
  }

  /** Lanzamiento de Estasis: barrido rápido descendente. */
  playStasisThrow(): void {
    this.tone('sawtooth', 720, 180, 0.16, 0.5);
  }

  /** Parry: acorde metálico corto. */
  playParry(): void {
    this.tone('square', 880, 880, 0.05, 0.5);
    this.tone('square', 1320, 1180, 0.1, 0.4, 0.02);
  }

  /** Gravity Shift: caída etérea con vibrato (dos tonos entrelazados). */
  playGravityShift(): void {
    this.tone('sine', 420, 150, 0.42, 0.7);
    this.tone('sine', 632, 226, 0.42, 0.4, 0.03);
  }

  /** Explosión: ruido lowpass + golpe grave. */
  playExplosion(): void {
    this.noise(0.34, 0.9, 900);
    this.tone('sine', 120, 40, 0.3, 0.8);
  }

  /** Alerta de la guarnición: dos tonos de sirena cortos. */
  playAlert(): void {
    this.tone('square', 660, 660, 0.09, 0.45);
    this.tone('square', 880, 880, 0.12, 0.45, 0.11);
  }

  /** Golpe al jefe: impacto grave contundente. */
  playBossHit(): void {
    this.tone('square', 150, 85, 0.16, 0.85);
    this.noise(0.1, 0.35, 500);
  }

  /** Victoria: arpegio ascendente alegre. */
  playVictory(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    for (let i = 0; i < notes.length; i++) {
      this.tone('triangle', notes[i], notes[i], 0.22, 0.7, i * 0.13);
    }
    this.tone('sine', 1046.5, 1046.5, 0.5, 0.5, notes.length * 0.13);
  }
}
