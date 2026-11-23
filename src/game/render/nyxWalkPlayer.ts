import * as THREE from 'three';
import type { NyxAnimator } from './nyxAnimator';

// ============================================================================
// NYX — Marcha con clips horneados: arranque -> bucle -> frenada.
//
// Los tres clips salen de `scripts/nyx_walk_clips.py` (Kimodo + retargeting),
// ya corregidos para que la suela toque el suelo. Mientras dura la marcha el
// `AnimationMixer` manda sobre el esqueleto y el `NyxAnimator` procedural queda
// suspendido; al soltar, el animador adopta la pose del clip como punto de
// partida y se funde desde ahí, sin salto.
//
// Ciclo de vida:
//   off --setMoving(true)--> start --fin--> loop --setMoving(false)--> end
//   end --fin--> off (el animador recupera el esqueleto)
//   end --setMoving(true)--> loop si aún frena, start si ya casi está parada
//
// El clip no tiene root motion: el avance lo sigue poniendo el controlador. El
// ritmo se ajusta a la velocidad real, pero escalado por `CADENCE_SCALE` para
// que la zancada se lea tranquila aunque Nyx avance a 2 m/s; el deslizamiento
// que eso deja es deliberado.
// ============================================================================

/** Velocidad de suelo que representa el clip a ritmo 1 (medida del bucle). */
const CLIP_GROUND_SPEED = 0.98;
/** Ritmo mínimo y máximo: por debajo se arrastra, por encima parece un dibujo. */
const MIN_RATE = 1.0;
const MAX_RATE = 2.6;
/**
 * Escala de cadencia: el clip se reproduce deliberadamente más lento de lo que
 * pediría la velocidad real. A 2,0 m/s el ritmo exacto sería 2,04 y la zancada
 * se lee acelerada; con 0,75 baja a 1,53 (1,27 pasos/s) y se ve un andar
 * tranquilo. El precio son ~25% de deslizamiento de pies, asumido a cambio de
 * que la marcha no parezca un trote. Subir hacia 1,0 quita deslizamiento y
 * devuelve la cadencia rápida; bajar hacia 0,6 la vuelve un paseo.
 */
const CADENCE_SCALE = 0.75;
/** Mezcla de entrada desde la pose que dejó el animador. */
const ENTER_BLEND = 0.18;
/** Mezcla al saltar entre clips (arranque, bucle, frenada). */
const SWITCH_BLEND = 0.14;
/** Por debajo de esta fracción del clip `end` se reanuda el bucle al volver a andar. */
const END_RESUME_FRACTION = 0.5;
/** Los clips están horneados a 30 fps; se recortan por frames. */
const CLIP_FPS = 30;
/** `start` arranca con ~0,4 s de pies plantados: se recorta para no patinar. */
const START_TRIM_FRAME = 12;
/** `end` termina con ~0,7 s de quietud: se recorta al asentar los pies. */
const END_TRIM_FRAME = 33;

type WalkPhase = 'off' | 'start' | 'loop' | 'end';

export interface WalkClips {
  start: THREE.AnimationClip;
  loop: THREE.AnimationClip;
  end: THREE.AnimationClip;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export class NyxWalkPlayer {
  private readonly root: THREE.Object3D;
  private readonly animator: NyxAnimator;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Record<'start' | 'loop' | 'end', THREE.AnimationAction>;
  private readonly durations: Record<'start' | 'loop' | 'end', number>;
  private readonly bones: THREE.Bone[] = [];
  private readonly snapQ: THREE.Quaternion[] = [];
  private readonly snapP: THREE.Vector3[] = [];
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpP = new THREE.Vector3();

  private phase: WalkPhase = 'off';
  private current: THREE.AnimationAction | null = null;
  private blend = 1;
  private blendDuration = ENTER_BLEND;
  private moving = false;

  constructor(root: THREE.Object3D, animator: NyxAnimator, clips: WalkClips) {
    this.root = root;
    this.animator = animator;
    this.mixer = new THREE.AnimationMixer(root);

    const start = THREE.AnimationUtils.subclip(
      clips.start,
      'walk_start',
      START_TRIM_FRAME,
      Math.round(clips.start.duration * CLIP_FPS) + 1,
      CLIP_FPS,
    );
    const loop = clips.loop;
    const end = THREE.AnimationUtils.subclip(clips.end, 'walk_end', 0, END_TRIM_FRAME, CLIP_FPS);

    this.actions = {
      start: this.mixer.clipAction(start),
      loop: this.mixer.clipAction(loop),
      end: this.mixer.clipAction(end),
    };
    this.durations = {
      start: start.duration,
      loop: loop.duration,
      end: end.duration,
    };
    for (const name of ['start', 'loop', 'end'] as const) {
      const action = this.actions[name];
      if (name === 'loop') {
        action.setLoop(THREE.LoopRepeat, Infinity);
      } else {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
    }

    root.traverse((o: THREE.Object3D) => {
      if ((o as THREE.Bone).isBone) {
        this.bones.push(o as THREE.Bone);
        this.snapQ.push(new THREE.Quaternion());
        this.snapP.push(new THREE.Vector3());
      }
    });
  }

  /** true mientras el reproductor manda sobre el esqueleto. */
  get active(): boolean { return this.phase !== 'off'; }

  /**
   * Pide arrancar o frenar la marcha. `speed` es la velocidad real de Nyx en el
   * momento de la llamada: si ya viene lanzada se salta el arranque y entra
   * directamente al bucle.
   */
  setMoving(moving: boolean, speed = 0): void {
    if (moving === this.moving) return;
    this.moving = moving;
    if (moving) {
      if (this.phase === 'off') {
        this.activate(speed > CLIP_GROUND_SPEED * 1.6 ? 'loop' : 'start');
      } else if (this.phase === 'end') {
        const progress = this.actions.end.time / this.durations.end;
        this.play(progress < END_RESUME_FRACTION ? 'loop' : 'start', SWITCH_BLEND);
      }
    } else if (this.phase === 'start' || this.phase === 'loop') {
      this.play('end', SWITCH_BLEND);
    }
  }

  /** Corta la marcha de golpe (salto, dash, ataque, derrape) y devuelve el esqueleto. */
  cancel(): void {
    if (this.phase === 'off') return;
    this.release();
  }

  update(dt: number, speed: number): void {
    if (this.phase === 'off') return;

    const rate = clamp((speed / CLIP_GROUND_SPEED) * CADENCE_SCALE, MIN_RATE, MAX_RATE);
    this.actions.start.setEffectiveTimeScale(rate);
    this.actions.loop.setEffectiveTimeScale(rate);
    this.actions.end.setEffectiveTimeScale(rate);

    this.mixer.update(dt);

    // Mezcla desde la pose congelada del cambio: vale igual para entrar desde
    // el animador que para saltar entre clips, y nunca hay discontinuidad
    // aunque el clip nuevo empiece en otro punto de la zancada.
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / this.blendDuration);
      const w = this.blend * this.blend * (3 - 2 * this.blend);
      this.applyBlend(w);
    }

    if (this.phase === 'start' && this.actions.start.time >= this.durations.start - 1e-3) {
      this.play('loop', SWITCH_BLEND);
    } else if (this.phase === 'end' && this.actions.end.time >= this.durations.end - 1e-3) {
      this.release();
    }
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
  }

  // --- Interno ---------------------------------------------------------------

  private activate(name: 'start' | 'loop' | 'end'): void {
    this.animator.suspend();
    this.play(name, ENTER_BLEND);
  }

  private play(name: 'start' | 'loop' | 'end', blendDuration: number): void {
    const next = this.actions[name];
    const prev = this.current;
    if (next === prev) return;
    this.snapshot();
    this.blend = 0;
    this.blendDuration = blendDuration;
    next.reset();
    next.setEffectiveWeight(1);
    next.play();
    if (prev !== null) prev.stop();
    this.current = next;
    this.phase = name;
  }

  private release(): void {
    this.phase = 'off';
    this.current = null;
    this.moving = false;
    this.blend = 1;
    // Se desactivan sin parar: `stop()` dispara `restoreOriginalState` en los
    // bindings y devuelve el esqueleto a la pose que tenía en el bind, así que
    // se perdería la zancada justo antes de que el animador la adopte.
    this.actions.start.enabled = false;
    this.actions.loop.enabled = false;
    this.actions.end.enabled = false;
    this.animator.adoptCurrentPose();
  }

  private snapshot(): void {
    for (let i = 0; i < this.bones.length; i++) {
      this.snapQ[i].copy(this.bones[i].quaternion);
      this.snapP[i].copy(this.bones[i].position);
    }
  }

  private applyBlend(w: number): void {
    const bones = this.bones;
    for (let i = 0; i < bones.length; i++) {
      const bone = bones[i];
      this.tmpQ.copy(bone.quaternion);
      bone.quaternion.slerpQuaternions(this.snapQ[i], this.tmpQ, w);
      this.tmpP.copy(bone.position);
      bone.position.lerpVectors(this.snapP[i], this.tmpP, w);
    }
  }
}
