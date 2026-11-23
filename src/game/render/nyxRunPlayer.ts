import * as THREE from 'three';
import type { NyxAnimator } from './nyxAnimator';

// ============================================================================
// NYX — Carrera con clips horneados: arranque -> bucle -> frenada.
//
// Los tres clips salen de `scripts/blender_build_run_clips.py`, que construye
// el ciclo de forma procedural (no hay mocap utilizable para la carrera) y
// apoya el pie de apoyo midiendo la malla frame a frame. Mientras dura la
// carrera el `AnimationMixer` manda sobre el esqueleto y el `NyxAnimator`
// procedural queda suspendido; al soltar, el animador adopta la pose del clip
// como punto de partida y se funde desde ahí, sin salto.
//
// Ciclo de vida:
//   off --setMoving(true)--> start --fin--> loop --setMoving(false)--> end
//   end --fin--> off (el animador recupera el esqueleto)
//   end --setMoving(true)--> loop si aún frena, start si ya casi está parada
//
// El clip no tiene root motion: el avance lo sigue poniendo el controlador.
// ============================================================================

/**
 * Velocidad de suelo que representa el clip a ritmo 1, en m/s. El bucle dura
 * 0,667 s y cubre dos pasos, así que a 7,4 m/s la zancada es de 2,47 m por
 * paso: con este valor el ritmo sale exacto y no hay deslizamiento de pies.
 */
const CLIP_GROUND_SPEED = 7.4;
/** Ritmo mínimo y máximo: por debajo se arrastra, por encima parece un dibujo. */
const MIN_RATE = 0.7;
const MAX_RATE = 1.3;
/**
 * Escala de cadencia. A 1,0 el ritmo es exactamente `speed / 7,4`, que es lo
 * que hace coincidir la zancada con el avance. Bajarla ralentiza la carrera y
 * devuelve deslizamiento; subirla la acelera.
 */
const CADENCE_SCALE = 1.0;
/** Mezcla de entrada desde la pose que dejó el animador. */
const ENTER_BLEND = 0.14;
/** Mezcla al saltar entre clips (arranque, bucle, frenada). */
const SWITCH_BLEND = 0.12;
/** Por encima de esta velocidad se entra directo al bucle, sin arranque. */
const LOOP_ENTRY_SPEED = 6.6;
/** Por debajo de esta fracción del clip `end` se reanuda el bucle al volver a correr. */
const END_RESUME_FRACTION = 0.5;

type RunPhase = 'off' | 'start' | 'loop' | 'end';

export interface RunClips {
  start: THREE.AnimationClip;
  loop: THREE.AnimationClip;
  end: THREE.AnimationClip;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export class NyxRunPlayer {
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

  private phase: RunPhase = 'off';
  private current: THREE.AnimationAction | null = null;
  private blend = 1;
  private blendDuration = ENTER_BLEND;
  private moving = false;

  constructor(root: THREE.Object3D, animator: NyxAnimator, clips: RunClips) {
    this.root = root;
    this.animator = animator;
    this.mixer = new THREE.AnimationMixer(root);

    this.actions = {
      start: this.mixer.clipAction(clips.start),
      loop: this.mixer.clipAction(clips.loop),
      end: this.mixer.clipAction(clips.end),
    };
    this.durations = {
      start: clips.start.duration,
      loop: clips.loop.duration,
      end: clips.end.duration,
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
   * Pide arrancar o frenar la carrera. `speed` es la velocidad real de Nyx en
   * el momento de la llamada: si ya viene lanzada se salta el arranque y entra
   * directamente al bucle.
   */
  setMoving(moving: boolean, speed = 0): void {
    if (moving === this.moving) return;
    this.moving = moving;
    if (moving) {
      if (this.phase === 'off') {
        this.activate(speed > LOOP_ENTRY_SPEED ? 'loop' : 'start');
      } else if (this.phase === 'end') {
        const progress = this.actions.end.time / this.durations.end;
        this.play(progress < END_RESUME_FRACTION ? 'loop' : 'start', SWITCH_BLEND);
      }
    } else if (this.phase === 'start' || this.phase === 'loop') {
      this.play('end', SWITCH_BLEND);
    }
  }

  /** Corta la carrera de golpe (salto, dash, ataque, derrape) y devuelve el esqueleto. */
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
