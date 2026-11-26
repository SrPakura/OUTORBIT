import * as THREE from 'three';
import type { ReplayCameraMode } from './trailerTypes';

// ============================================================================
// DomeTheaterCamera — Cámara de renderizado independiente para Modo Teatro.
//
// Desacoplada por completo de `simCamera` (que permanece congelada a los
// parámetros de la grabación para garantizar cero deriva).
//
// Modos:
//  - bot:      copia exacta de la cámara del bot.
//  - free:     vuelo libre 6-DoF (WASD/QE + ratón + Shift/Ctrl + Rueda FOV + Z/X roll),
//              operativo incluso con la simulación pausada (0x).
//  - orbit:    órbita suave alrededor de Nyx con ratón + rueda de zoom.
//  - director: seguimiento cinematográfico bajo/lateral dinámico.
// ============================================================================

export class DomeTheaterCamera {
  readonly camera: THREE.PerspectiveCamera;
  private mode: ReplayCameraMode;
  private readonly canvas: HTMLCanvasElement;

  // Estado Free-Cam
  private readonly freePos = new THREE.Vector3(0, 6, 18);
  private freeYaw = 0;
  private freePitch = 0;
  private freeRoll = 0;
  private freeFov = 70;
  private readonly keysDown = new Set<string>();
  private dragging = false;

  // Estado Orbit-Cam
  private orbitYaw = 0.6;
  private orbitPitch = 0.22;
  private orbitDist = 9.5;

  // Estado Director-Cam
  private directorTime = 0;
  private readonly directorPos = new THREE.Vector3();
  private directorInit = false;

  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly tmpFwd = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();
  private readonly tmpUp = new THREE.Vector3(0, 1, 0);
  private readonly tmpTarget = new THREE.Vector3();

  constructor(
    canvas: HTMLCanvasElement,
    simCamera: THREE.PerspectiveCamera,
    initialMode: ReplayCameraMode = 'free',
  ) {
    this.canvas = canvas;
    this.mode = initialMode;
    this.camera = new THREE.PerspectiveCamera(
      simCamera.fov,
      window.innerWidth / window.innerHeight,
      simCamera.near,
      simCamera.far,
    );
    this.freeFov = simCamera.fov;
    this.syncFromSimCamera(simCamera);
    this.bindListeners();
  }

  getMode(): ReplayCameraMode {
    return this.mode;
  }

  setMode(mode: ReplayCameraMode, simCamera: THREE.PerspectiveCamera, nyxPos: THREE.Vector3): void {
    if (this.mode === mode) return;
    if (mode === 'free') {
      // Arrancar la cámara libre desde el punto actual de renderizado para una transición limpia
      this.freePos.copy(this.camera.position);
      this.tmpEuler.setFromQuaternion(this.camera.quaternion, 'YXZ');
      this.freeYaw = this.tmpEuler.y;
      this.freePitch = this.tmpEuler.x;
      this.freeRoll = this.tmpEuler.z;
      this.freeFov = this.camera.fov;
    } else if (mode === 'orbit') {
      this.tmpTarget.subVectors(this.camera.position, nyxPos);
      this.orbitDist = THREE.MathUtils.clamp(this.tmpTarget.length(), 3.5, 45);
    } else if (mode === 'director') {
      this.directorPos.copy(this.camera.position);
      this.directorInit = true;
    } else if (mode === 'bot') {
      this.syncFromSimCamera(simCamera);
    }
    this.mode = mode;
  }

  syncAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(
    realDt: number,
    simCamera: THREE.PerspectiveCamera,
    nyxPos: THREE.Vector3,
    nyxVel: THREE.Vector3,
  ): void {
    const dt = Math.min(0.05, Math.max(0.0001, realDt));

    if (this.mode === 'bot') {
      this.syncFromSimCamera(simCamera);
      return;
    }

    if (this.mode === 'free') {
      this.updateFreeCam(dt);
      return;
    }

    if (this.mode === 'orbit') {
      const cosP = Math.cos(this.orbitPitch);
      this.tmpTarget.set(
        nyxPos.x + Math.sin(this.orbitYaw) * cosP * this.orbitDist,
        nyxPos.y + Math.sin(this.orbitPitch) * this.orbitDist,
        nyxPos.z + Math.cos(this.orbitYaw) * cosP * this.orbitDist,
      );
      this.camera.position.lerp(this.tmpTarget, 1 - Math.exp(-16 * dt));
      this.camera.lookAt(nyxPos);
      if (this.camera.fov !== this.freeFov) {
        this.camera.fov = this.freeFov;
        this.camera.updateProjectionMatrix();
      }
      return;
    }

    // Modo director: ángulo heroico lateral-bajo dinámico que sigue la acción
    this.directorTime += dt;
    if (!this.directorInit) {
      this.directorPos.copy(simCamera.position);
      this.directorInit = true;
    }
    const speed = nyxVel.length();
    const angle = this.directorTime * 0.32;
    const radius = THREE.MathUtils.clamp(8.5 + speed * 0.14, 8, 16);
    this.tmpTarget.set(
      nyxPos.x + Math.cos(angle) * radius,
      nyxPos.y - 1.6 + Math.sin(angle * 0.7) * 2.2,
      nyxPos.z + Math.sin(angle) * radius,
    );
    this.directorPos.lerp(this.tmpTarget, 1 - Math.exp(-4.5 * dt));
    this.camera.position.copy(this.directorPos);
    this.camera.lookAt(nyxPos);
    const targetFov = THREE.MathUtils.clamp(68 + speed * 0.45, 62, 88);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.exp(-5 * dt));
      this.camera.updateProjectionMatrix();
    }
  }

  private syncFromSimCamera(simCamera: THREE.PerspectiveCamera): void {
    this.camera.position.copy(simCamera.position);
    this.camera.quaternion.copy(simCamera.quaternion);
    if (Math.abs(this.camera.fov - simCamera.fov) > 0.01) {
      this.camera.fov = simCamera.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private updateFreeCam(dt: number): void {
    this.tmpEuler.set(this.freePitch, this.freeYaw, this.freeRoll, 'YXZ');
    this.tmpQuat.setFromEuler(this.tmpEuler);
    this.camera.quaternion.copy(this.tmpQuat);

    this.tmpFwd.set(0, 0, -1).applyQuaternion(this.tmpQuat);
    this.tmpRight.set(1, 0, 0).applyQuaternion(this.tmpQuat);
    this.tmpUp.set(0, 1, 0).applyQuaternion(this.tmpQuat);

    let speed = 24;
    if (this.keysDown.has('ShiftLeft') || this.keysDown.has('ShiftRight')) speed = 64;
    else if (this.keysDown.has('ControlLeft') || this.keysDown.has('ControlRight')) speed = 6;

    const step = speed * dt;
    if (this.keysDown.has('KeyW')) this.freePos.addScaledVector(this.tmpFwd, step);
    if (this.keysDown.has('KeyS')) this.freePos.addScaledVector(this.tmpFwd, -step);
    if (this.keysDown.has('KeyD')) this.freePos.addScaledVector(this.tmpRight, step);
    if (this.keysDown.has('KeyA')) this.freePos.addScaledVector(this.tmpRight, -step);
    if (this.keysDown.has('KeyE')) this.freePos.addScaledVector(this.tmpUp, step);
    if (this.keysDown.has('KeyQ')) this.freePos.addScaledVector(this.tmpUp, -step);

    if (this.keysDown.has('KeyZ')) this.freeRoll += 1.4 * dt;
    if (this.keysDown.has('KeyX')) this.freeRoll -= 1.4 * dt;
    if (this.keysDown.has('KeyC')) this.freeRoll = 0;

    this.camera.position.copy(this.freePos);
    if (Math.abs(this.camera.fov - this.freeFov) > 0.01) {
      this.camera.fov = this.freeFov;
      this.camera.updateProjectionMatrix();
    }
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    this.keysDown.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.keysDown.delete(e.code);
  };

  private readonly onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (this.mode === 'free' || this.mode === 'orbit') {
      this.dragging = true;
    }
  };

  private readonly onMouseUp = () => {
    this.dragging = false;
  };

  private readonly onMouseMove = (e: MouseEvent) => {
    const locked = document.pointerLockElement === this.canvas;
    if (!locked && !this.dragging) return;
    const sens = 0.0024;
    if (this.mode === 'free') {
      this.freeYaw -= e.movementX * sens;
      this.freePitch = THREE.MathUtils.clamp(
        this.freePitch - e.movementY * sens,
        -Math.PI * 0.49,
        Math.PI * 0.49,
      );
    } else if (this.mode === 'orbit') {
      this.orbitYaw -= e.movementX * sens * 1.4;
      this.orbitPitch = THREE.MathUtils.clamp(
        this.orbitPitch + e.movementY * sens * 1.2,
        -Math.PI * 0.44,
        Math.PI * 0.44,
      );
    }
  };

  private readonly onWheel = (e: WheelEvent) => {
    if (this.mode === 'free') {
      this.freeFov = THREE.MathUtils.clamp(this.freeFov + e.deltaY * 0.03, 22, 110);
    } else if (this.mode === 'orbit') {
      this.orbitDist = THREE.MathUtils.clamp(this.orbitDist + e.deltaY * 0.015, 3, 55);
    }
  };

  private bindListeners(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: true });
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.keysDown.clear();
  }
}
