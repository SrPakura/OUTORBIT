import * as THREE from 'three';
import type { NyxAnimator } from './nyxAnimator';

// ============================================================================
// NYX — Reproductor de un clip en bucle.
//
// Los clips salen de `scripts/blender_blendcap_retarget_nyx.py` (BlendCap sobre
// los vídeos de Google Flow + retargeting al rig de 27 huesos). Cada GLB llega
// ya recortado al tramo que cierra en bucle, así que no hay máquina de
// arranque/bucle/final como en la marcha: se entra con una mezcla corta desde
// la pose que dejó el animador y se sale igual.
//
// Mientras dura el clip el `AnimationMixer` manda sobre el esqueleto y el
// `NyxAnimator` procedural queda suspendido; al soltar, el animador adopta la
// pose del clip como punto de partida y se funde desde ahí, sin salto.
// ============================================================================

export interface LoopClipOptions {
  /**
   * Velocidad de suelo que representa el clip a ritmo 1, en m/s. Con 0 el ritmo
   * es fijo y `speed` se ignora (clips de flotación, que no son locomoción).
   */
  groundSpeed: number;
  /**
   * Escala de cadencia: el clip se reproduce deliberadamente más lento de lo
   * que pediría la velocidad real, igual que en la marcha. A cambio de algo de
   * deslizamiento la zancada se lee tranquila en vez de acelerada.
   */
  cadenceScale: number;
  minRate: number;
  maxRate: number;
  /** Duración de la mezcla de entrada y salida, en segundos. */
  blend: number;
}

const DEFAULTS: LoopClipOptions = {
  groundSpeed: 0,
  cadenceScale: 1,
  minRate: 1,
  maxRate: 1,
  blend: 0.18,
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export class NyxLoopPlayer {
  private readonly root: THREE.Object3D;
  private readonly animator: NyxAnimator;
  private readonly mixer: THREE.AnimationMixer;
  private readonly action: THREE.AnimationAction;
  private readonly options: LoopClipOptions;
  private readonly bones: THREE.Bone[] = [];
  private readonly snapQ: THREE.Quaternion[] = [];
  private readonly snapP: THREE.Vector3[] = [];
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpP = new THREE.Vector3();

  private active = false;
  private blend = 1;

  constructor(
    root: THREE.Object3D,
    animator: NyxAnimator,
    clip: THREE.AnimationClip,
    options: Partial<LoopClipOptions> = {},
  ) {
    this.root = root;
    this.animator = animator;
    this.options = { ...DEFAULTS, ...options };
    this.mixer = new THREE.AnimationMixer(root);
    this.action = this.mixer.clipAction(clip);
    this.action.setLoop(THREE.LoopRepeat, Infinity);

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

  update(dt: number, speed = 0): void {
    if (!this.active) return;

    const o = this.options;
    if (o.groundSpeed > 0) {
      this.action.setEffectiveTimeScale(
        clamp((speed / o.groundSpeed) * o.cadenceScale, o.minRate, o.maxRate),
      );
    }

    this.mixer.update(dt);

    // Mezcla desde la pose congelada al entrar: nunca hay discontinuidad
    // aunque el clip empiece en otro punto del ciclo.
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / o.blend);
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
    this.action.reset();
    this.action.setEffectiveWeight(1);
    this.action.play();
    this.active = true;
  }

  private release(): void {
    this.active = false;
    this.blend = 1;
    // Se desactiva sin parar: `stop()` dispara `restoreOriginalState` en los
    // bindings y devuelve el esqueleto a la pose de bind, así que se perdería
    // la pose justo antes de que el animador la adopte.
    this.action.enabled = false;
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
