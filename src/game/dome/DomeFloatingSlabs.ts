import * as THREE from 'three';
import { addComicOutline } from '@/game/render/toonMaterials';
import type { SlabCollider } from './domeTypes';
import { createP3RTileMaterial, createTornSlabGeometry, mulberry32 } from './DomeSlabGeometry';

// ============================================================================
// Pool de suelos arrancados flotantes (estética P3R / Tartarus) dentro de la
// cúpula. Pre-genera 10 colliders `oneSidedTop` con orientaciones variadas en
// 3D (R = 14..58 m) y los activa/desactiva por oleadas con transiciones
// suaves: entran desde fuera con escala 0 -> 1 y opacidad 0 -> 1, y salen al
// revés cuando la oleada baja a 0 (Miniboss/Boss).
// ============================================================================

const POOL_SIZE = 10;
const MIN_SLAB_RADIUS = 14;
const MAX_SLAB_RADIUS = 58;
/** Velocidad de la transición de entrada (0 -> 1 en ~0.7 s). */
const ENTER_SPEED = 1.5;
/** Salida algo más rápida (0 -> 1 en ~0.45 s). */
const EXIT_SPEED = 2.2;
/** Distancia de la que "vuela" cada suelo al materializarse. */
const ENTER_OFFSET = 30;
/** Transición a partir de la cual el collider participa en el gameplay. */
const ACTIVE_THRESHOLD = 0.5;

interface FloatingSlab {
  collider: SlabCollider;
  material: THREE.ShaderMaterial;
  baseHalfExtents: THREE.Vector3;
  /** Dirección radial de entrada (desde el centro de la cúpula hacia fuera). */
  enterDir: THREE.Vector3;
  driftSpeed: number;
  driftRadius: number;
  active: boolean;
  /** Progreso de la transición 0..1 (escala y uOpacity). */
  transition: number;
}

const _up = new THREE.Vector3();
const _drift = new THREE.Vector3();

function moveTowards(current: number, target: number, maxDelta: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}

export class DomeFloatingSlabManager {
  private readonly scene: THREE.Scene;
  private readonly slabs: FloatingSlab[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.ShaderMaterial[] = [];
  private readonly activeColliders: SlabCollider[] = [];
  private warningLevel = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const rand = mulberry32(0x9e3779b9);

    for (let i = 0; i < POOL_SIZE; i++) {
      const seed = 1000 + i * 137;
      const radiusX = 7 + rand() * 6;
      const radiusZ = 6 + rand() * 6;
      const thickness = 1.6 + rand() * 1.0;

      const { geometry, halfExtents } = createTornSlabGeometry(seed, radiusX, radiusZ, thickness);
      this.geometries.push(geometry);
      const material = createP3RTileMaterial();
      this.materials.push(material);

      const mesh = new THREE.Mesh(geometry, material);
      addComicOutline(mesh, 0.05, 0x090b14);
      mesh.visible = false;
      mesh.scale.setScalar(0.0001);

      // Posición dentro de la cúpula (R = 14..58 m) y orientación 3D variada:
      // algunos casi planos, otros muy inclinados o casi invertidos.
      const angle = rand() * Math.PI * 2;
      const dist = MIN_SLAB_RADIUS + rand() * (MAX_SLAB_RADIUS - MIN_SLAB_RADIUS);
      const height = (rand() * 2 - 1) * 30;
      mesh.position.set(Math.cos(angle) * dist, height, Math.sin(angle) * dist);
      mesh.rotation.set(
        (rand() * 2 - 1) * Math.PI * 0.9,
        rand() * Math.PI * 2,
        (rand() * 2 - 1) * 1.2,
      );
      this.scene.add(mesh);

      const quat = mesh.quaternion.clone();
      const collider: SlabCollider = {
        id: `floating_slab_${i}`,
        mesh,
        basePos: mesh.position.clone(),
        center: mesh.position.clone(),
        halfExtents: halfExtents.clone(),
        quaternion: quat.clone(),
        invQuaternion: quat.clone().invert(),
        phase: rand() * Math.PI * 2,
        bobAmplitude: 0.22 + rand() * 0.3,
        oneSidedTop: true,
      };

      this.slabs.push({
        collider,
        material,
        baseHalfExtents: halfExtents.clone(),
        enterDir: mesh.position.clone().setY(0).normalize(),
        driftSpeed: 0.05 + rand() * 0.08,
        driftRadius: 0.8 + rand() * 1.6,
        active: false,
        transition: 0,
      });
    }
  }

  /**
   * Fija cuántos suelos del pool deben estar activos (0..10). En oleadas
   * básicas se piden entre 5 y 10; en oleadas de Miniboss/Boss se baja a 0
   * para despedazar la arena. Las transiciones (escala + uOpacity) corren en
   * `update`.
   */
  setTargetCount(count: number): void {
    const clamped = Math.max(0, Math.min(POOL_SIZE, Math.round(count)));
    this.slabs.forEach((slab, i) => {
      slab.active = i < clamped;
    });
  }

  /**
   * Nivel de aviso global (0..1) para los suelos activos: pulso rojo/ámbar
   * cuando un suelo de Miniboss está a punto de desaparecer.
   */
  setWarning(level: number): void {
    this.warningLevel = Math.max(0, Math.min(1, level));
  }

  /**
   * Avanza las transiciones de entrada/salida (escala 0 <-> 1, `uOpacity`) y
   * mueve los suelos activos con bob sobre su eje local +Y y una deriva
   * orbital lenta alrededor de `basePos`.
   */
  update(dt: number, elapsed: number): void {
    for (const slab of this.slabs) {
      const target = slab.active ? 1 : 0;
      const speed = slab.active ? ENTER_SPEED : EXIT_SPEED;
      slab.transition = moveTowards(slab.transition, target, speed * dt);

      const t = slab.transition;
      const mesh = slab.collider.mesh;
      mesh.visible = t > 0.001;
      if (!mesh.visible) continue;

      // Escala 0 -> 1 con easing suave; el collider se escala igual para que
      // la colisión OBB siga al mesh durante toda la transición.
      const eased = t * t * (3 - 2 * t);
      const scale = Math.max(eased, 0.0001);
      mesh.scale.setScalar(scale);
      slab.collider.halfExtents.copy(slab.baseHalfExtents).multiplyScalar(scale);

      // Bob a lo largo del eje local +Y + deriva orbital lenta.
      _up.set(0, 1, 0).applyQuaternion(slab.collider.quaternion);
      const bob = Math.sin(elapsed * 0.9 + slab.collider.phase) * slab.collider.bobAmplitude;
      const driftAngle = elapsed * slab.driftSpeed + slab.collider.phase;
      _drift.set(Math.cos(driftAngle), 0, Math.sin(driftAngle)).multiplyScalar(slab.driftRadius);

      slab.collider.center
        .copy(slab.collider.basePos)
        .addScaledVector(_up, bob)
        .add(_drift)
        .addScaledVector(slab.enterDir, (1 - eased) * ENTER_OFFSET);
      mesh.position.copy(slab.collider.center);

      slab.material.uniforms.uOpacity.value = t;
      slab.material.uniforms.uTime.value = elapsed;
      slab.material.uniforms.uWarning.value = this.warningLevel;
    }
  }

  /**
   * Colliders de los suelos activos y suficientemente materializados
   * (transición >= 0.5), listos para el gameplay. El array se reutiliza: no
   * lo conserves entre frames.
   */
  getActiveColliders(): SlabCollider[] {
    this.activeColliders.length = 0;
    for (const slab of this.slabs) {
      if (slab.active && slab.transition >= ACTIVE_THRESHOLD) {
        this.activeColliders.push(slab.collider);
      }
    }
    return this.activeColliders;
  }

  dispose(): void {
    for (const slab of this.slabs) {
      this.scene.remove(slab.collider.mesh);
    }
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.slabs.length = 0;
    this.geometries.length = 0;
    this.materials.length = 0;
    this.activeColliders.length = 0;
  }
}
