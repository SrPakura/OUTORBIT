// ============================================================================
// Hito 4 — Audio Procedural con Web Audio API
// ============================================================================
//
// Sonidos sintetizados ligeros y agradables (envolventes cortas, volumen
// moderado) sin dependencias externas. El AudioContext se crea/reanuda
// al primer gesto del usuario (`unlock`). La tecla M alterna el mute.
//
// Además del one-shots, integra el motor de audio gravitacional del
// simulador de referencia: una capa CONTINUA de viento (ruido rosa filtrado)
// cuya frecuencia y volumen siguen la velocidad de Nyx, y un zumbido grave
// de campo gravitacional que se enciende con el Campo Gravitacional y el
// Agujero Negro. Así el movimiento frenético se oye, no solo se ve.

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

/**
 * Volumen maestro de los efectos: subido a 0.65 para que corten por encima de
 * la música (BASE_VOLUME 0.2 del MusicPlayer) incluso en pleno combate.
 */
const MASTER_VOLUME = 0.65;

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

  // --- Motor gravitacional (capa continua, del simulador de referencia) ---
  /** Ruido rosa de 3 s (Paul Kellet): base del viento, más natural que el blanco. */
  private pinkBuffer: AudioBuffer | null = null;
  private windSource: AudioBufferSourceNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windResonance: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private gravityOsc1: OscillatorNode | null = null;
  private gravityOsc2: OscillatorNode | null = null;
  private gravityGain: GainNode | null = null;
  private gravityActive = false;
  /** Última velocidad normalizada aplicada al viento (evita trabajos repetidos). */
  private windSpeed = -1;

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
    this.initGravityEngine();
  }

  /**
   * Libera el contexto y las capas continuas (viento + zumbido). El bucle de
   * la cúpula lo llama al desmontar: sin esto, el viento de una partida
   * anterior seguiría sonando en el AudioContext huérfano.
   */
  dispose(): void {
    try {
      this.windSource?.stop();
      this.gravityOsc1?.stop();
      this.gravityOsc2?.stop();
    } catch {
      // Los nodos pueden haber terminado ya: stop() sobre un nodo parado no
      // debe tumbar el desmontaje.
    }
    this.windSource = null;
    this.gravityOsc1 = null;
    this.gravityOsc2 = null;
    this.windFilter = null;
    this.windResonance = null;
    this.windGain = null;
    this.gravityGain = null;
    this.gravityActive = false;
    this.windSpeed = -1;
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.pinkBuffer = null;
    this.levelUpEcho = null;
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

  // --------------------------------------------------------------------------
  // Motor gravitacional (simulador de audio de referencia)
  // --------------------------------------------------------------------------

  /**
   * Monta las dos capas continuas del simulador:
   * 1. Viento: ruido rosa en bucle -> bandpass (130 Hz base) -> resonancia
   *    peaking -> ganancia. La frecuencia, la Q y el volumen los mueve
   *    `updateMovementSpeed` con la velocidad real de Nyx.
   * 2. Zumbido de gravedad: seno de 55 Hz + triángulo de 110.5 Hz -> lowpass
   *    180 Hz -> ganancia (0 hasta que un campo gravitacional lo enciende).
   * Todo cuelga del bus maestro: mute y volumen de ajustes ya lo respetan.
   */
  private initGravityEngine(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    // Ruido rosa (filtro de Paul Kellet): el viento con blanco era áspero.
    const bufferSize = Math.floor(ctx.sampleRate * 3);
    const pink = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const out = pink.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
      b6 = white * 0.115926;
    }
    this.pinkBuffer = pink;

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = pink;
    noiseSource.loop = true;

    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 130;
    this.windFilter.Q.value = 1.2;

    this.windResonance = ctx.createBiquadFilter();
    this.windResonance.type = 'peaking';
    this.windResonance.frequency.value = 260;
    this.windResonance.gain.value = 5;

    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;

    noiseSource.connect(this.windFilter);
    this.windFilter.connect(this.windResonance);
    this.windResonance.connect(this.windGain);
    this.windGain.connect(master);
    noiseSource.start(0);
    this.windSource = noiseSource;

    this.gravityOsc1 = ctx.createOscillator();
    this.gravityOsc2 = ctx.createOscillator();
    this.gravityOsc1.type = 'sine';
    this.gravityOsc2.type = 'triangle';
    this.gravityOsc1.frequency.value = 55;
    this.gravityOsc2.frequency.value = 110.5;

    const gravFilter = ctx.createBiquadFilter();
    gravFilter.type = 'lowpass';
    gravFilter.frequency.value = 180;

    this.gravityGain = ctx.createGain();
    this.gravityGain.gain.value = 0;

    this.gravityOsc1.connect(gravFilter);
    this.gravityOsc2.connect(gravFilter);
    gravFilter.connect(this.gravityGain);
    this.gravityGain.connect(master);
    this.gravityOsc1.start(0);
    this.gravityOsc2.start(0);
  }

  /**
   * Viento por velocidad de Nyx (0..1 normalizada). Curva del simulador:
   * `curve = speed^1.65` -> el aire pasa de brisa (35%) a silbido de caída
   * (90%+). La resonancia sigue a 1.45x la frecuencia del bandpass. Con el
   * zumbido de gravedad activo, sus osciladores también suben con la velocidad
   * (el campo "se estira" al moverte rápido dentro de él).
   */
  updateMovementSpeed(normalizedSpeed: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.windFilter || !this.windResonance || !this.windGain) return;
    const speed = Math.max(0, Math.min(1, Number.isFinite(normalizedSpeed) ? normalizedSpeed : 0));
    if (Math.abs(speed - this.windSpeed) < 0.01) return;
    this.windSpeed = speed;
    const now = ctx.currentTime;

    const curve = Math.pow(speed, 1.65);
    const targetFreq = 130 + curve * 1520;
    const targetQ = 1.2 + curve * 2.4;
    // Tope algo menor que el del simulador (1.0): aquí el viento compite con
    // one-shots y música; con 0.62 sigue mandando sin tapar los impactos.
    const targetWindVol = speed < 0.02 ? 0 : 0.12 + curve * 0.5;

    this.windFilter.frequency.setTargetAtTime(targetFreq, now, 0.06);
    this.windFilter.Q.setTargetAtTime(targetQ, now, 0.08);
    this.windResonance.frequency.setTargetAtTime(targetFreq * 1.45, now, 0.06);
    this.windGain.gain.setTargetAtTime(targetWindVol, now, 0.08);

    if (this.gravityActive) {
      this.gravityOsc1?.frequency.setTargetAtTime(55 + curve * 24, now, 0.1);
      this.gravityOsc2?.frequency.setTargetAtTime(110.5 + curve * 48, now, 0.1);
    }
  }

  /**
   * Zumbido grave del campo gravitacional (rocas en órbita, agujero negro):
   * sube a 0.24 en 150 ms y baja igual al apagarse.
   */
  setGravityFieldActive(active: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.gravityGain || this.gravityActive === active) return;
    this.gravityActive = active;
    this.gravityGain.gain.setTargetAtTime(active ? 0.24 : 0, ctx.currentTime, 0.15);
    if (!active) {
      // El zumbido vuelve a su frecuencia de reposo para el próximo uso.
      this.gravityOsc1?.frequency.setTargetAtTime(55, ctx.currentTime, 0.1);
      this.gravityOsc2?.frequency.setTargetAtTime(110.5, ctx.currentTime, 0.1);
    }
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
   * alerta encubierta — el guardia te ha visto pero aún no salta la
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
  // Movimiento y combate (motor gravitacional del simulador de referencia)
  // --------------------------------------------------------------------------

  /**
   * Dash lateral: corte de viento con paneo estéreo que barre del lado de
   * origen al de destino (-1 izq, 1 der, 0 sin paneo) + silbido grave del
   * impulso. Del `triggerSideDash` del simulador.
   */
  playSideDash(direction: -1 | 0 | 1): void {
    if (!this.audible) return;
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const duration = 0.24;

    let dest: AudioNode = master;
    if (direction !== 0 && typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(-direction * 0.65, now);
      panner.pan.linearRampToValueAtTime(direction * 0.85, now + duration);
      panner.connect(master);
      dest = panner;
    }

    const buffer = this.pinkBuffer ?? this.getNoiseBuffer();
    if (!buffer) return;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 3.2;
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.exponentialRampToValueAtTime(2600, now + 0.08);
    filter.frequency.exponentialRampToValueAtTime(450, now + duration);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.01, now);
    noiseGain.gain.linearRampToValueAtTime(0.7, now + 0.04);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(dest);
    noise.start(now, Math.random() * 1.5);
    noise.stop(now + duration);

    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + duration);
    oscGain.gain.setValueAtTime(0.24, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(oscGain);
    oscGain.connect(dest);
    osc.start(now);
    osc.stop(now + duration);
  }

  /**
   * Taladro espiral (patada giratoria): el giro comprime aire en el pie —
   * ruido rosa con bandpass estrecho que sube 280 -> 3200 Hz modulado por un
   * LFO de 26 Hz que se apaga al comprimir, más un silbido de sierra que
   * barre el lowpass. El impacto va aparte (`playKineticImpact`) porque el
   * tiempo de vuelo hasta el enemigo es dinámico. Del `triggerAttackKick`.
   */
  playSpinKick(): void {
    if (!this.audible) return;
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const spinDuration = 0.34;
    const buffer = this.pinkBuffer ?? this.getNoiseBuffer();
    if (!buffer) return;

    // 1. Giro y compresión focalizada de aire en el pie.
    const airNoise = ctx.createBufferSource();
    airNoise.buffer = buffer;

    const airFilter = ctx.createBiquadFilter();
    airFilter.type = 'bandpass';
    airFilter.Q.value = 6.5;
    airFilter.frequency.setValueAtTime(280, now);
    airFilter.frequency.exponentialRampToValueAtTime(3200, now + spinDuration);
    airFilter.frequency.exponentialRampToValueAtTime(520, now + spinDuration + 0.2);

    const spinLfo = ctx.createOscillator();
    const spinLfoGain = ctx.createGain();
    spinLfo.frequency.value = 26;
    spinLfoGain.gain.setValueAtTime(180, now);
    spinLfoGain.gain.exponentialRampToValueAtTime(10, now + spinDuration);
    spinLfo.connect(spinLfoGain);
    spinLfoGain.connect(airFilter.frequency);

    const airGain = ctx.createGain();
    airGain.gain.setValueAtTime(0.05, now);
    airGain.gain.exponentialRampToValueAtTime(0.9, now + spinDuration);
    airGain.gain.exponentialRampToValueAtTime(0.001, now + spinDuration + 0.2);

    airNoise.connect(airFilter);
    airFilter.connect(airGain);
    airGain.connect(master);

    spinLfo.start(now);
    spinLfo.stop(now + spinDuration);
    airNoise.start(now, Math.random());
    airNoise.stop(now + spinDuration + 0.2);

    // 2. Silbido giratorio del barrido de la pierna.
    const whipOsc = ctx.createOscillator();
    const whipGain = ctx.createGain();
    whipOsc.type = 'sawtooth';

    const whipFilter = ctx.createBiquadFilter();
    whipFilter.type = 'lowpass';
    whipFilter.frequency.setValueAtTime(400, now);
    whipFilter.frequency.exponentialRampToValueAtTime(2800, now + spinDuration);

    whipOsc.frequency.setValueAtTime(140, now);
    whipOsc.frequency.exponentialRampToValueAtTime(780, now + spinDuration);

    whipGain.gain.setValueAtTime(0.01, now);
    whipGain.gain.linearRampToValueAtTime(0.25, now + spinDuration - 0.03);
    whipGain.gain.exponentialRampToValueAtTime(0.001, now + spinDuration + 0.06);

    whipOsc.connect(whipFilter);
    whipFilter.connect(whipGain);
    whipGain.connect(master);
    whipOsc.start(now);
    whipOsc.stop(now + spinDuration + 0.07);
  }

  /**
   * Impacto cinético del taladro contra el enemigo: golpe de sub grave con
   * ataque seco + chasquido de ruido. Es el "puño" del `triggerAttackKick`,
   * disparado aquí en el frame real del impacto.
   */
  playKineticImpact(): void {
    if (!this.audible) return;
    this.tone('sine', 190, 36, 0.25, 0.85);
    this.tone('square', 150, 60, 0.12, 0.4);
    this.noise(0.12, 0.5, 900);
  }

  /**
   * Caída al Vacío (patada sin enemigo en la mira): ráfaga de viento que
   * cae de agudo a grave — el aire pasa de silbar a rugir al lanzarse.
   */
  playVoidFall(): void {
    if (!this.audible) return;
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const duration = 0.5;
    const buffer = this.pinkBuffer ?? this.getNoiseBuffer();
    if (!buffer) return;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.6;
    filter.frequency.setValueAtTime(2200, now);
    filter.frequency.exponentialRampToValueAtTime(320, now + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0.55, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    src.connect(filter).connect(gain).connect(master);
    src.start(now, Math.random());
    src.stop(now + duration);

    this.tone('sine', 240, 70, 0.4, 0.4);
  }

  // --------------------------------------------------------------------------
  // Habilidades activas (viento y firma sonora por skill)
  // --------------------------------------------------------------------------

  /** Empuje: onda antigravitatoria — ráfaga de aire que explota y se apaga. */
  playRepulsePush(): void {
    if (!this.audible) return;
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const buffer = this.pinkBuffer ?? this.getNoiseBuffer();
    if (!buffer) return;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3200, now);
    filter.frequency.exponentialRampToValueAtTime(180, now + 0.35);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.75, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    src.connect(filter).connect(gain).connect(master);
    src.start(now, Math.random());
    src.stop(now + 0.35);

    this.tone('sine', 95, 42, 0.3, 0.7);
  }

  /** Absorción de Edén: tres armónicos suaves que ascienden (halo de curación). */
  playEdenAbsorb(): void {
    if (!this.audible) return;
    const notes = [392, 523.25, 659.25];
    for (let i = 0; i < notes.length; i++) {
      this.tone('sine', notes[i], notes[i] * 1.5, 0.4, 0.4, i * 0.09);
    }
    this.tone('sine', 1568, 2093, 0.3, 0.2, 0.3);
  }

  /** Pozo de Atracción: tensión grave que se aprieta (dos sierras desafinadas subiendo). */
  playAttractionWell(): void {
    if (!this.audible) return;
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const duration = 1.2;

    for (const detune of [-9, 9]) {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.detune.setValueAtTime(detune, now);
      osc.frequency.setValueAtTime(70, now);
      osc.frequency.exponentialRampToValueAtTime(240, now + duration);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(120, now);
      filter.frequency.exponentialRampToValueAtTime(520, now + duration);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.32, now + duration * 0.55);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(filter).connect(gain).connect(master);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    }
  }

  /** Horizonte de Rebote: ondas cortantes — "shing" metálico agudo y breve. */
  playBounceHorizon(): void {
    if (!this.audible) return;
    this.tone('square', 1900, 700, 0.14, 0.4);
    this.tone('sawtooth', 2600, 1100, 0.1, 0.22, 0.02);
    this.noise(0.1, 0.3, 4200);
  }

  /** Agujero Negro: sub grave que se hunde + succión de aire hacia el núcleo. */
  playBlackHoleCast(): void {
    if (!this.audible) return;
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const buffer = this.pinkBuffer ?? this.getNoiseBuffer();
    if (!buffer) return;

    // Sub que se hunde: la singularidad "aterriza".
    this.tone('sine', 70, 28, 0.9, 0.85);

    // Succión: ruido con bandpass que sube y se traga a sí mismo.
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2.2;
    filter.frequency.setValueAtTime(200, now);
    filter.frequency.exponentialRampToValueAtTime(1600, now + 0.7);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.4, now + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    src.connect(filter).connect(gain).connect(master);
    src.start(now, Math.random());
    src.stop(now + 0.8);
  }

  /** Implosión: el aire se traga hacia dentro y luego el colapso estalla. */
  playImplosion(): void {
    if (!this.audible) return;
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const buffer = this.pinkBuffer ?? this.getNoiseBuffer();
    if (!buffer) return;

    // Succión inversa: el aire corre hacia el enemigo antes del colapso.
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 3.5;
    filter.frequency.setValueAtTime(300, now);
    filter.frequency.exponentialRampToValueAtTime(2600, now + 0.28);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.22);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    src.connect(filter).connect(gain).connect(master);
    src.start(now, Math.random());
    src.stop(now + 0.3);

    // Colapso: golpe grave seco tras la succión.
    this.tone('sine', 170, 32, 0.3, 0.9, 0.26);
    this.tone('square', 220, 70, 0.14, 0.35, 0.27);
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

  // --------------------------------------------------------------------------
  // Secuencia cinemática de subida de nivel (planeta + cartas + iris)
  // --------------------------------------------------------------------------

  /** Fase 1 del planeta: chispa del punto blanco (triangle 1480→2960→880 Hz). */
  playLevelUpSpark(): void {
    if (!this.audible) return;
    this.tone('triangle', 1480, 2960, 0.09, 0.26);
    this.tone('triangle', 2960, 880, 0.2, 0.2, 0.09);
  }

  /** Fase 2 del planeta: whoosh de acercamiento (sawtooth grave + barrido lowpass). */
  playLevelUpApproach(): void {
    if (!this.audible) return;
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(55, t0);
    osc.frequency.exponentialRampToValueAtTime(210, t0 + 0.9);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(220, t0);
    filter.frequency.exponentialRampToValueAtTime(1600, t0 + 0.9);
    filter.Q.value = 7;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.3, t0 + 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.0);
    osc.connect(filter).connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + 1.05);
  }

  /** Fase 3 del planeta: latigazo del barrido blanco (ruido + bandpass 3200→240 Hz). */
  playLevelUpSlash(): void {
    if (!this.audible) return;
    const ctx = this.ctx;
    const master = this.master;
    const buffer = this.getNoiseBuffer();
    if (!ctx || !master || !buffer) return;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.1;
    filter.frequency.setValueAtTime(3200, t0);
    filter.frequency.exponentialRampToValueAtTime(240, t0 + 0.42);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.34, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.46);
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
    src.stop(t0 + 0.5);
  }

  /** Impacto de carta: golpe grave + ruido seco. */
  playCardSlam(): void {
    if (!this.audible) return;
    this.tone('sine', 120, 38, 0.16, 0.5);
    this.noise(0.09, 0.26, 1400);
  }

  /** Retumbo grave mientras la carta elegida tiembla en el centro. */
  playCardTremble(): void {
    if (!this.audible) return;
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 46;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 16;
    lfo.connect(lfoGain).connect(osc.frequency);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.2, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
    osc.connect(filter).connect(gain).connect(master);
    osc.start(t0);
    lfo.start(t0);
    osc.stop(t0 + 0.55);
    lfo.stop(t0 + 0.55);
  }

  /** Sello final: latigazo agudo + golpe. */
  playCardStamp(): void {
    if (!this.audible) return;
    this.tone('square', 880, 110, 0.12, 0.18);
    this.playCardSlam();
  }

  /** Barrido de tinta / vuelo de carta (ruido + bandpass ascendente 240→2600 Hz). */
  playInkWipe(): void {
    if (!this.audible) return;
    const ctx = this.ctx;
    const master = this.master;
    const buffer = this.getNoiseBuffer();
    if (!ctx || !master || !buffer) return;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.1;
    filter.frequency.setValueAtTime(240, t0);
    filter.frequency.exponentialRampToValueAtTime(2600, t0 + 0.42);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.22, t0 + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.48);
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
    src.stop(t0 + 0.52);
  }

  /** Garrido estridente del Gorrión Gigante: chillido agudo modulado + ráfaga aérea. */
  playSparrowShriek(): void {
    if (!this.audible) return;
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t0 = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(1650, t0);
    osc1.frequency.exponentialRampToValueAtTime(3250, t0 + 0.14);
    osc1.frequency.exponentialRampToValueAtTime(1380, t0 + 0.72);

    osc2.frequency.setValueAtTime(2480, t0);
    osc2.frequency.exponentialRampToValueAtTime(3900, t0 + 0.16);
    osc2.frequency.exponentialRampToValueAtTime(1820, t0 + 0.72);

    lfo.frequency.value = 34;
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);
    lfoGain.connect(osc2.frequency);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2400, t0);
    filter.Q.value = 1.8;

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.28, t0 + 0.05);
    gain.gain.setValueAtTime(0.26, t0 + 0.42);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.78);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain).connect(master);

    osc1.start(t0);
    osc2.start(t0);
    lfo.start(t0);
    osc1.stop(t0 + 0.8);
    osc2.stop(t0 + 0.8);
    lfo.stop(t0 + 0.8);

    this.noise(0.55, 0.35, 2200);
  }

  /** Iris de cierre: colapso del círculo + parpadeo final del punto. */
  playIrisWink(): void {
    if (!this.audible) return;
    this.tone('sine', 640, 90, 0.5, 0.24);
    this.tone('sine', 2200, 2200, 0.03, 0.2, 0.5);
    this.tone('sine', 2900, 2900, 0.05, 0.16, 0.56);
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
