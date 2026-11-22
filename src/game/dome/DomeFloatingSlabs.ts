import * as THREE from 'three';
import { addComicOutline } from '@/game/render/toonMaterials';
import type { SlabCollider } from './domeTypes';
import { createP3RTileMaterial, createTornSlabGeometry, mulberry32 } from './DomeSlabGeometry';

// ============================================================================
// Pool de suelos arrancados flotantes (estética P3R / Tartarus) dentro de la
// cúpula. Pre-genera 10 colliders `oneSidedTop` con orientaciones variadas en
// 3D y los activa/desactiva por oleadas. Cada suelo activo recorre una CUERDA
// que cruza la esfera de parte a parte: nace fuera de la cúpula (R = 96..102
// m, en una zona que la cámara no esté mirando), la atraviesa a 2.2..4.2 m/s
// con bob y rotación suaves, y al salir (R > 93 m) se desvanece y re-entra
// desde el borde exterior (R = 98 m). Así siempre hay entre 5 y 10 suelos
// moviéndose de forma constante, sin pop-in dentro de la vista.
// ============================================================================

const POOL_SIZE = 10;
/** Velocidad de la transición de entrada (0 -> 1 en ~0.7 s). */
const ENTER_SPEED = 1.5;
/** Salida algo más rápida (0 -> 1 en ~0.45 s). */
const EXIT_SPEED = 2.2;
/** Transición a partir de la cual el collider participa en el gameplay. */
const ACTIVE_THRESHOLD = 0.5;

/** Radio de la cúpula. */
const DOME_RADIUS = 90;
/** Nacimiento de la cuerda: fuera de la cúpula, R = 96..102 m. */
const CHORD_SPAWN_R_MIN = 96;
const CHORD_SPAWN_R_MAX = 102;
/** Re-entrada por reciclaje: siempre desde R = 98 m. */
const REENTRY_SPAWN_R = 98;
/** Fin nominal de la cuerda en el lado opuesto (R = 96 m). */
const CHORD_END_R = 96;
/** Un suelo que ya entró en la cúpula se recicla al superar este radio. */
const EXIT_RADIUS = 93;
/** Velocidad de crucero por la cuerda (m/s). */
const CHORD_SPEED_MIN = 2.2;
const CHORD_SPEED_MAX = 4.2;
/** Separación mínima adicional entre bordes de dos suelos (m). */
const MIN_GAP = 5;
/** Tramo inicial de la trayectoria validado contra el resto de suelos (m). */
const ENTRY_CHECK_DIST = 15;
/** Intentos para hallar un nacimiento fuera de la vista de la cámara. */
const SPAWN_ATTEMPTS = 12;
/** Cota de dot(spawnDir, cameraFwd) por debajo de la cual se considera fuera de vista. */
const OFFSCREEN_DOT = 0.2;
/** Suavidad de la separación mutua durante el vuelo (1/s). */
const SEPARATION_RATE = 5;

interface FloatingSlab {
  collider: SlabCollider;
  material: THREE.ShaderMaterial;
  baseHalfExtents: THREE.Vector3;
  /** Radio de separación (esfera envolvente del trozo). */
  sepRadius: number;
  /** Dirección unitaria de la cuerda actual (atraviesa la cúpula). */
  chordDir: THREE.Vector3;
  /** Velocidad de crucero por la cuerda (m/s). */
  speed: number;
  /** Rotación suave alrededor del eje local +Y (rad/s). */
  spinSpeed: number;
  /** True cuando el centro ya entró en la cúpula (habilita el reciclaje). */
  enteredInside: boolean;
  /** True mientras se desvanece tras salir de la cúpula. */
  exiting: boolean;
  /** True cuando el suelo tiene una cuerda válida asignada. */
  hasChord: boolean;
  active: boolean;
  /** Progreso de la transición 0..1 (escala y uOpacity). */
  transition: number;
}

const _up = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();

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
  private readonly rand: () => number;
  private warningLevel = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.rand = mulberry32(0x9e3779b9);
    const rand = this.rand;

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

      // Orientación 3D variada: algunos casi planos, otros muy inclinados o
      // casi invertidos. La posición real la fija la cuerda al activarse.
      mesh.position.set(0, 0, 0);
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
        icebergDepth: Math.max(2.0, (radiusX + radiusZ) * 0.34 - thickness * 0.5),
      };

      this.slabs.push({
        collider,
        material,
        baseHalfExtents: halfExtents.clone(),
        sepRadius: Math.max(halfExtents.x, halfExtents.y, halfExtents.z),
        chordDir: new THREE.Vector3(0, 0, 0),
        speed: CHORD_SPEED_MIN + rand() * (CHORD_SPEED_MAX - CHORD_SPEED_MIN),
        spinSpeed: (rand() * 2 - 1) * 0.12,
        enteredInside: false,
        exiting: false,
        hasChord: false,
        active: false,
        transition: 0,
      });
    }
  }

  /**
   * Asigna una cuerda nueva al suelo: nace fuera de la cúpula (R =
   * spawnRMin..spawnRMax) en una zona que la cámara NO esté mirando (si se
   * pasa `cameraPos`/`cameraFwd`, exige `dot(normalize(spawnPos - cameraPos),
   * cameraFwd) < 0.2` tras varios intentos) y cruza hacia el lado opuesto
   * (R = 96 m). Valida que el nacimiento y el tramo inicial de entrada estén a
   * `radiusA + radiusB + 5` m o más del resto de suelos activos.
   */
  private assignChord(
    slab: FloatingSlab,
    cameraPos?: THREE.Vector3,
    cameraFwd?: THREE.Vector3,
    spawnRMin: number = CHORD_SPAWN_R_MIN,
    spawnRMax: number = CHORD_SPAWN_R_MAX
  ): void {
    const rand = this.rand;
    let bestStart: THREE.Vector3 | null = null;
    let bestDir: THREE.Vector3 | null = null;
    let bestCamDot = Infinity;
    let bestSepOk = false;

    for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt++) {
      // Dirección de nacimiento aleatoria en la esfera exterior.
      _v1.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
      if (_v1.lengthSq() < 1e-4) _v1.set(0.577, 0.577, 0.577);
      _v1.normalize();
      const spawnR = spawnRMin + rand() * (spawnRMax - spawnRMin);
      _v2.copy(_v1).multiplyScalar(spawnR);

      // Lado opuesto con desviación: la cuerda atraviesa la cúpula.
      _v3.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).multiplyScalar(0.35);
      _v3.addScaledVector(_v1, -1).normalize().multiplyScalar(CHORD_END_R);
      _v4.subVectors(_v3, _v2).normalize();

      // ¿Está el nacimiento fuera de la vista de la cámara?
      let camDot = -1;
      if (cameraPos && cameraFwd) {
        camDot = _v5.subVectors(_v2, cameraPos).normalize().dot(cameraFwd);
      }

      // Separación >= radiusA + radiusB + 5 m respecto a los suelos activos,
      // validando el nacimiento y el primer tramo de la entrada.
      let sepOk = true;
      for (const other of this.slabs) {
        if (other === slab || !other.hasChord || other.transition <= 0.001) continue;
        const minDist = slab.sepRadius + other.sepRadius + MIN_GAP;
        if (_v2.distanceTo(other.collider.basePos) < minDist) {
          sepOk = false;
          break;
        }
        _v5.copy(_v2).addScaledVector(_v4, ENTRY_CHECK_DIST);
        if (_v5.distanceTo(other.collider.basePos) < minDist) {
          sepOk = false;
          break;
        }
      }

      const better =
        bestStart === null ||
        (sepOk && !bestSepOk) ||
        (sepOk === bestSepOk && camDot < bestCamDot);
      if (better) {
        if (!bestStart) bestStart = new THREE.Vector3();
        if (!bestDir) bestDir = new THREE.Vector3();
        bestStart.copy(_v2);
        bestDir.copy(_v4);
        bestCamDot = camDot;
        bestSepOk = sepOk;
      }
      // Con ambas condiciones cumplidas no hace falta seguir intentando.
      if (sepOk && camDot < OFFSCREEN_DOT) break;
    }

    slab.collider.basePos.copy(bestStart!);
    slab.chordDir.copy(bestDir!);
    slab.speed = CHORD_SPEED_MIN + rand() * (CHORD_SPEED_MAX - CHORD_SPEED_MIN);
    slab.enteredInside = false;
    slab.exiting = false;
    slab.hasChord = true;
    slab.collider.center.copy(slab.collider.basePos);
    slab.collider.mesh.position.copy(slab.collider.center);
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
   * Avanza las cuerdas de los suelos activos (cruzan la esfera de parte a
   * parte a 2.2..4.2 m/s con bob sobre su eje local +Y y una rotación suave),
   * recicla los que salen (R > 93 m) re-entrando desde R = 98 m fuera de la
   * vista de la cámara, y aplica una separación suave para que dos suelos
   * nunca se acerquen a menos de `radiusA + radiusB + 5` m.
   */
  update(
    dt: number,
    elapsed: number,
    cameraPos?: THREE.Vector3,
    cameraFwd?: THREE.Vector3
  ): void {
    for (const slab of this.slabs) {
      // Activación: el suelo nace fuera de la cúpula, lejos de la cámara.
      if (slab.active && !slab.hasChord) {
        this.assignChord(slab, cameraPos, cameraFwd);
      }

      // Avance por la cuerda (también mientras se desvanece: sigue derivando).
      if (slab.hasChord) {
        slab.collider.basePos.addScaledVector(slab.chordDir, slab.speed * dt);
      }

      // Reciclaje: cruzó, salió de la cúpula (R > 93 m) -> desvanecer.
      if (slab.active && slab.hasChord && !slab.exiting) {
        const r = slab.collider.basePos.length();
        if (r < DOME_RADIUS) slab.enteredInside = true;
        if (slab.enteredInside && r > EXIT_RADIUS) slab.exiting = true;
      }

      const target = slab.active && !slab.exiting ? 1 : 0;
      const speed = target === 1 ? ENTER_SPEED : EXIT_SPEED;
      slab.transition = moveTowards(slab.transition, target, speed * dt);

      // Re-entrada: al completar el desvanecimiento, cuerda nueva desde R = 98 m.
      if (slab.exiting && slab.transition <= 0) {
        this.assignChord(slab, cameraPos, cameraFwd, REENTRY_SPAWN_R, REENTRY_SPAWN_R);
      }
      // Suelo inactivo totalmente desvanecido: la próxima activación lo
      // renacerá desde fuera con una cuerda fresca.
      if (!slab.active && slab.transition <= 0) {
        slab.hasChord = false;
        slab.exiting = false;
      }

      const t = slab.transition;
      const mesh = slab.collider.mesh;
      mesh.visible = t > 0.001;
      if (!mesh.visible) {
        slab.collider.center.copy(slab.collider.basePos);
        mesh.position.copy(slab.collider.center);
        continue;
      }

      // Escala 0 -> 1 con easing suave; el collider se escala igual para que
      // la colisión OBB siga al mesh durante toda la transición.
      const eased = t * t * (3 - 2 * t);
      const scale = Math.max(eased, 0.0001);
      mesh.scale.setScalar(scale);
      slab.collider.halfExtents.copy(slab.baseHalfExtents).multiplyScalar(scale);

      // Ligera rotación continua alrededor del eje local +Y.
      mesh.rotateY(slab.spinSpeed * dt);
      slab.collider.quaternion.copy(mesh.quaternion);
      slab.collider.invQuaternion.copy(mesh.quaternion).invert();

      // Bob suave a lo largo del eje local +Y (misma fórmula que
      // `updateSlabMotion`, que lo re-aplica a los colliders activos).
      _up.set(0, 1, 0).applyQuaternion(slab.collider.quaternion);
      const bob = Math.sin(elapsed * 0.9 + slab.collider.phase) * slab.collider.bobAmplitude;
      slab.collider.center.copy(slab.collider.basePos).addScaledVector(_up, bob);
      mesh.position.copy(slab.collider.center);

      slab.material.uniforms.uOpacity.value = t;
      slab.material.uniforms.uTime.value = elapsed;
      slab.material.uniforms.uWarning.value = this.warningLevel;
    }

    this.resolveSeparation(dt);
  }

  /**
   * Separación mutua suave: si dos suelos visibles se acercan a menos de
   * `radiusA + radiusB + 5` m, se empujan aparte a lo largo de la línea que
   * los une (desplazando `basePos`, de modo que las skills que empujan suelos
   * y el propio vuelo por la cuerda siguen siendo coherentes).
   */
  private resolveSeparation(dt: number): void {
    const n = this.slabs.length;
    for (let i = 0; i < n; i++) {
      const a = this.slabs[i];
      if (!a.hasChord || a.transition <= 0.001) continue;
      for (let j = i + 1; j < n; j++) {
        const b = this.slabs[j];
        if (!b.hasChord || b.transition <= 0.001) continue;
        const minDist = a.sepRadius + b.sepRadius + MIN_GAP;
        _v1.subVectors(b.collider.center, a.collider.center);
        const dist = _v1.length();
        if (dist >= minDist) continue;
        if (dist < 1e-4) {
          _v1.set(0.577, 0.577, 0.577);
        } else {
          _v1.divideScalar(dist);
        }
        const push = (minDist - dist) * Math.min(1, SEPARATION_RATE * dt) * 0.5;
        _v1.multiplyScalar(push);
        this.shiftSlab(a, _v2.copy(_v1).negate());
        this.shiftSlab(b, _v1);
      }
    }
  }

  /** Desplaza un suelo (cuerda + centro + mesh) sin romper el bob. */
  private shiftSlab(slab: FloatingSlab, delta: THREE.Vector3): void {
    slab.collider.basePos.add(delta);
    slab.collider.center.add(delta);
    slab.collider.mesh.position.copy(slab.collider.center);
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
