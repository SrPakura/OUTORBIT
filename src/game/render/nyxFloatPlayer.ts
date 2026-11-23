import * as THREE from 'three';
import type { NyxAnimator } from './nyxAnimator';

// ============================================================================
// NYX — Reproductor de la flotación 0G direccional.
//
// Cuatro clips derivados del mismo base (`scripts/blender_build_float_clips.py`),
// todos de 2.567 s y con la fase alineada:
//
//   fwd   banco a su derecha          desplazamiento hacia su derecha
//   mir   banco a su izquierda        desplazamiento hacia su izquierda
//   mid   centrada                    avance recto
//   back  centrada, inclinada atrás   retroceso
//
// En vuelo el cuerpo siempre mira al aim de cámara (`updateOrientation`), así
// que el banco no puede seguir al vector de velocidad completo: se reparte
// entre los cuatro según la dirección de la velocidad en el marco del cuerpo.
// Al compartir un único `AnimationMixer` y estar alineados en fase, las mezclas
// entre ellos no producen saltos.
// ============================================================================

export interface FloatClips {
  fwd: THREE.AnimationClip;
  mir: THREE.AnimationClip;
  mid: THREE.AnimationClip;
  back: THREE.AnimationClip;
}

/** Velocidad con la que los pesos persiguen su objetivo, en 1/s. */
const WEIGHT_RATE = 5;
/** Duración de la mezcla de entrada y salida, en segundos. */
const BLEND = 0.3;

export class NyxFloatPlayer {
  private readonly root: THREE.Object3D;
  private readonly animator: NyxAnimator;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: THREE.AnimationAction[];
  private readonly bones: THREE.Bone[] = [];
  private readonly snapQ: THREE.Quaternion[] = [];
  private readonly snapP: THREE.Vector3[] = [];
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpP = new THREE.Vector3();
  /** Reparto objetivo, en el orden fwd / mir / mid / back. */
  private readonly target = [0, 0, 1, 0];
  private readonly weights = [0, 0, 1, 0];

  private active = false;
  private blend = 1;

  constructor(
    root: THREE.Object3D,
    animator: NyxAnimator,
    clips: FloatClips,
  ) {
    this.root = root;
    this.animator = animator;
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = [clips.fwd, clips.mir, clips.mid, clips.back].map((clip) => {
      const action = this.mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.setEffectiveWeight(0);
      return action;
    });

    root.traverse((o: THREE.Object3D) => {
      if ((o as THREE.Bone).isBone) {
        this.bones.push(o as THREE.Bone);
        this.snapQ.push(new THREE.Quaternion());
        this.snapP.push(new THREE.Vector3());
      }
    });
  }

  /** true mientras el reproductor manda sobre el esqueleto. */
  get isActive(): boolean { return this.active; }

  setActive(on: boolean): void {
    if (on === this.active) return;
    if (on) this.activate();
    else this.release();
  }

  /**
   * Reparte el peso entre los cuatro clips según la velocidad en el marco del
   * cuerpo: `forward` es la componente sobre el morro y `lateral` la componente
   * sobre su izquierda (el `right` que construye `updateOrientation`).
   */
  setDirection(forward: number, lateral: number): void {
    const n = Math.hypot(forward, lateral);
    if (n < 1e-4) return; // sin dirección se mantiene el reparto anterior

    const f = forward / n;
    const l = lateral / n;
    const backness = Math.max(0, -f);
    const forwardness = 1 - backness;
    const leftness = Math.max(0, l);
    const rightness = Math.max(0, -l);

    this.target[0] = forwardness * rightness;
    this.target[1] = forwardness * leftness;
    this.target[2] = forwardness * (1 - leftness - rightness);
    this.target[3] = backness;
  }

  update(dt: number): void {
    if (!this.active) return;

    const k = 1 - Math.exp(-WEIGHT_RATE * dt);
    for (let i = 0; i < 4; i++) {
      this.weights[i] += (this.target[i] - this.weights[i]) * k;
      this.actions[i].setEffectiveWeight(this.weights[i]);
    }

    this.mixer.update(dt);

    // Mezcla desde la pose congelada al entrar: nunca hay discontinuidad
    // aunque el clip empiece en otro punto del ciclo.
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / BLEND);
      const w = this.blend * this.blend * (3 - 2 * this.blend);
      this.applyBlend(w);
    }
  }

  /** Suelta el esqueleto de golpe (salto, dash, ataque, cambio de estado). */
  cancel(): void {
    if (this.active) this.release();
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
  }

  // --- Interno ---------------------------------------------------------------

  private activate(): void {
    this.animator.suspend();
    this.snapshot();
    this.blend = 0;
    for (let i = 0; i < 4; i++) {
      // Entra con el reparto ya resuelto: si arrancara con todos los pesos a
      // cero el mixer no escribiría nada y el esqueleto se quedaría congelado.
      this.weights[i] = this.target[i];
      const action = this.actions[i];
      action.reset();
      action.setEffectiveWeight(this.weights[i]);
      action.play();
    }
    this.active = true;
  }

  private release(): void {
    this.active = false;
    this.blend = 1;
    // Se desactiva sin parar: `stop()` dispara `restoreOriginalState` en los
    // bindings y devuelve el esqueleto a la pose de bind, así que se perdería
    // la pose justo antes de que el animador la adopte.
    for (const action of this.actions) action.enabled = false;
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
