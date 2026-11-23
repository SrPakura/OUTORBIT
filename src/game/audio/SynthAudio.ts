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
  | 'warning'
  | 'bossHit'
  | 'victory'
  | 'keycard'
  | 'switchClick'
  | 'gateOpen'
  | 'step'
  | 'land'
  | 'melee'
  | 'hurt'
  | 'telegraph'
  | 'wallBreak'
  | 'npcTalk'
  | 'bounce';

const MASTER_VOLUME = 0.36;

/**
 * Sintetizador procedural: osciladores con envolventes cortas + ruido filtrado
 * para explosiones. Todas las llamadas son seguras si el AudioContext aún no
 * existe o el navegador lo tiene suspendido (silencio hasta el primer gesto).
 */
export class SynthAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  /** Eco con realimentación del arpegio de subida de nivel (se crea una vez). */
  private levelUpEcho: DelayNode | null = null;
  private _muted = false;
  /** Multiplicador de volumen del ajuste persistente `masterVolume`. */
  private volumeMultiplier = 1;

  get muted(): boolean {
    return this._muted;
  }

  /** True mientras no exista AudioContext (el GameEngine mantiene un listener de pointerdown). */
  get needsUnlock(): boolean {
    return this.ctx === null;
  }

  /** Ganancia efectiva del bus maestro: volumen base x multiplicador de ajustes. */
  private get masterGain(): number {
    return MASTER_VOLUME * this.volumeMultiplier;
  }

  /**
   * True si hay AudioContext y el audio no está silenciado. Reanuda el contexto
   * si el navegador lo suspendió (política de autoplay). Guardia de los sonidos
   * que se disparan fuera de `play()` (alertas del HUD).
   */
  private get audible(): boolean {
    if (this._muted || !this.ctx || !this.master) return false;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return true;
  }

  /**
   * Escala el volumen base del sintetizador (ajuste `masterVolume`, 0 .. 1.5).
   * Se aplica al instante si el AudioContext ya existe y se respeta al crearlo.
   */
  setVolumeMultiplier(mul: number): void {
    this.volumeMultiplier = Number.isFinite(mul) ? Math.min(Math.max(mul, 0), 1.5) : 1;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(
        this._muted ? 0 : this.masterGain,
        this.ctx.currentTime,
        0.01
      );
    }
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
    this.master.gain.value = this._muted ? 0 : this.masterGain;
    this.master.connect(this.ctx.destination);
  }

  /** Alterna el mute; devuelve el nuevo estado. */
  toggleMute(): boolean {
    this._muted = !this._muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this._muted ? 0 : this.masterGain, this.ctx.currentTime, 0.01);
    }
    return this._muted;
  }

  /** Reproduce un sonido por su tipo (no-op si está silenciado o sin contexto). */
  play(kind: GameSoundKind): void {
    if (this._muted || !this.ctx || !this.master) return;
    // Autoplay policy: si el navegador suspendió el contexto, reanuda.
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
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
      case 'warning':
        this.playWarning();
        break;
      case 'bossHit':
        this.playBossHit();
        break;
      case 'victory':
        this.playVictory();
        break;
      case 'keycard':
        this.playKeycard();
        break;
      case 'switchClick':
        this.playSwitchClick();
        break;
      case 'gateOpen':
        this.playGateOpen();
        break;
      case 'step':
        this.playStep();
        break;
      case 'land':
        this.playLand();
        break;
      case 'melee':
        this.playMelee();
        break;
      case 'hurt':
        this.playHurt();
        break;
      case 'telegraph':
        this.playTelegraph();
        break;
      case 'wallBreak':
        this.playWallBreak();
        break;
      case 'npcTalk':
        this.playNpcTalk();
        break;
      case 'bounce':
        this.playBounce();
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

  /** Buffer de ruido blanco compartido (se crea la primera vez que hace falta). */
  private getNoiseBuffer(): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (!this.noiseBuffer) {
      const length = Math.floor(ctx.sampleRate * 0.5);
      this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuffer;
  }

  /** Ruido blanco con filtro lowpass y envolvente (explosiones). */
  private noise(duration: number, volume: number, cutoff: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const buffer = this.getNoiseBuffer();
    if (!buffer) return;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
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

  /**
   * Aviso de vigilancia (modo WARNING): chirp crisp de dos tonos estilo
   * Metal Gear / Persona — el guardia te ha visto pero aún no salta la
   * alarma. Volumen sutil para no saturar con varios guardias a la vez.
   */
  playWarning(): void {
    this.tone('square', 587, 587, 0.07, 0.3);
    this.tone('square', 880, 880, 0.11, 0.26, 0.085);
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

  /** Tarjeta/llave robada: doble blip dorado brillante. */
  playKeycard(): void {
    this.tone('sine', 990, 1320, 0.09, 0.7);
    this.tone('sine', 1320, 1760, 0.12, 0.55, 0.07);
  }

  /** Palanca/switch: clac mecánico + confirmación cian. */
  playSwitchClick(): void {
    this.tone('square', 220, 160, 0.05, 0.55);
    this.tone('sine', 660, 990, 0.12, 0.5, 0.04);
  }

  /** Compuerta abriéndose: barrido metálico ascendente. */
  playGateOpen(): void {
    this.tone('sawtooth', 140, 420, 0.3, 0.45);
    this.tone('sine', 560, 840, 0.18, 0.35, 0.08);
  }

  /** Pisada suave muy sutil al correr (cada ~0.35s). */
  playStep(): void {
    this.tone('sine', 150, 95, 0.045, 0.16);
    this.noise(0.03, 0.06, 420);
  }

  /** Aterrizaje suave: golpe grave amortiguado. */
  playLand(): void {
    this.tone('sine', 190, 60, 0.14, 0.5);
    this.noise(0.07, 0.16, 380);
  }

  /** Melee: whoosh de barrido + golpe seco. */
  playMelee(): void {
    this.noise(0.12, 0.4, 1600);
    this.tone('triangle', 340, 120, 0.1, 0.5, 0.02);
  }

  /**
   * Hito 3 — Golpe recibido: thud de impacto contundente e inequívoco
   * (golpe grave + click de ruido) seguido de un buzz de aviso descendente
   * y áspero. Nada que confundir con un blip suave.
   */
  playHurt(): void {
    // Thud de impacto: golpe grave con ataque seco.
    this.tone('square', 190, 52, 0.17, 0.95);
    this.tone('sine', 105, 36, 0.24, 0.9);
    this.noise(0.11, 0.42, 650);
    // Buzz de aviso: barrido descendente áspero e inconfundible.
    this.tone('sawtooth', 640, 170, 0.26, 0.5, 0.02);
    this.tone('square', 320, 96, 0.2, 0.3, 0.05);
  }

  /**
   * Hito 3 — Telegraph de pre-ataque: click/carga high-tech sutil (880 ->
   * 1320 Hz) que avisa del windup de un enemigo (dron, KRONOS) antes de
   * que el golpe llegue: affordance sonora de ataque justo.
   */
  playTelegraph(): void {
    this.tone('square', 880, 1320, 0.07, 0.34);
    this.tone('sine', 1320, 1760, 0.06, 0.22, 0.05);
  }

  /** Pared rompible: crujido de roca + explosión media. */
  playWallBreak(): void {
    this.noise(0.28, 0.7, 750);
    this.tone('sine', 110, 42, 0.26, 0.7);
    this.tone('sawtooth', 90, 55, 0.12, 0.3, 0.03);
  }

  /** Diálogo de NPC: blip amigable doble. */
  playNpcTalk(): void {
    this.tone('sine', 640, 900, 0.07, 0.55);
    this.tone('sine', 900, 1180, 0.08, 0.4, 0.07);
  }

  /** HITO 2 — Trampolín de flor gigante/seta: barrido ascendente burbujeante
   *  y divertido (240 -> 620 Hz con armónico triangular y colita aguda). */
  playBounce(): void {
    this.tone('sine', 240, 620, 0.18, 0.7);
    this.tone('triangle', 240, 620, 0.16, 0.4, 0.02);
    this.tone('sine', 620, 880, 0.08, 0.3, 0.12);
  }

  // --------------------------------------------------------------------------
  // Alertas del HUD (yin-yang de vida / Edén) y avisos de progresión
  // --------------------------------------------------------------------------

  /**
   * Latido de vida crítica (HP <= 25%): dos golpes graves de seno con caída
   * exponencial y un ping triangular agudo. La variante urgente (HP <= 12%)
   * sube el ping y acorta la separación entre golpes.
   */
  playLowHpPulse(urgent = false): void {
    if (!this.audible) return;
    this.tone('sine', 125, 48, 0.14, 0.9);
    this.tone('sine', 105, 42, 0.14, 0.6, urgent ? 0.14 : 0.18);
    // El pulso grave apenas se oye en altavoces de portátil: el chasquido
    // agudo es el que hace audible la alerta por encima de la música.
    this.tone('triangle', urgent ? 1040 : 880, urgent ? 1040 : 880, 0.09, 0.5);
  }

  /**
   * Descarga de Edén crítica (Edén <= 25%): dos sierras desafinadas que caen
   * a través de un bandpass resonante, más un chispazo de ruido agudo.
   */
  playLowEdenPulse(): void {
    if (!this.audible) return;
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t0 = ctx.currentTime;

    for (const detune of [-12, 12]) {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.detune.setValueAtTime(detune, t0);
      osc.frequency.setValueAtTime(540, t0);
      osc.frequency.exponentialRampToValueAtTime(190, t0 + 0.18);
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(900, t0);
      filter.Q.setValueAtTime(3, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(0.45, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.19);
      osc.connect(filter).connect(gain).connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.2);
    }

    const buffer = this.getNoiseBuffer();
    if (!buffer) return;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(3200, t0);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.28, t0);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.04);
    noise.connect(highpass).connect(noiseGain).connect(master);
    noise.start(t0);
    noise.stop(t0 + 0.05);
  }

  /** Subida de nivel: arpegio de triángulos con eco realimentado. */
  playLevelUp(): void {
    if (!this.audible) return;
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t0 = ctx.currentTime;
    const echo = this.getLevelUpEcho();
    const notes = [523.25, 783.99, 1174.66];

    notes.forEach((freq, i) => {
      const start = t0 + i * 0.065;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.6, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain).connect(master);
      if (echo) gain.connect(echo);
      osc.start(start);
      osc.stop(start + 0.36);
    });
  }

  /** Nueva oleada: caída de sub grave + dos ticks de confirmación. */
  playNewWave(): void {
    if (!this.audible) return;
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t0 = ctx.currentTime;

    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(140, t0);
    sub.frequency.exponentialRampToValueAtTime(42, t0 + 0.24);
    subGain.gain.setValueAtTime(0.9, t0);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);
    sub.connect(subGain).connect(master);
    sub.start(t0);
    sub.stop(t0 + 0.28);

    this.tone('square', 1800, 1800, 0.02, 0.35);
    this.tone('square', 2400, 2400, 0.02, 0.35, 0.06);
  }

  /** Eco del arpegio de nivel: delay con realimentación creado una sola vez. */
  private getLevelUpEcho(): DelayNode | null {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return null;
    if (!this.levelUpEcho) {
      const delay = ctx.createDelay();
      delay.delayTime.value = 0.11;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.28;
      delay.connect(feedback).connect(delay);
      delay.connect(master);
      this.levelUpEcho = delay;
    }
    return this.levelUpEcho;
  }
}
