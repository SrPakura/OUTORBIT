import * as THREE from 'three';
import type { PlanetRuntime, StructureSpec } from '../types';

// ============================================================================
// Temporales preasignados: CERO allocations dentro del loop de renderizado.
// ============================================================================
const _currentUp = new THREE.Vector3();
const _targetUp = new THREE.Vector3();
const _correction = new THREE.Quaternion();
const _yawQuat = new THREE.Quaternion();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _upAxis = new THREE.Vector3(0, 1, 0);

const EPSILON = 1e-6;

/**
 * Alinea el eje local +Y de `basisQuat` con `targetUp` (no necesita ser unitario).
 *
 * Usa `Quaternion.setFromUnitVectors(currentUp, targetUp)` para construir la
 * corrección mínima, por lo que NO existe gimbal lock ni en los polos: el yaw
 * relativo se preserva por transporte paralelo sobre la esfera. `slerpAlpha`
 * permite reorientación suave (0..1); el resultado se normaliza siempre para
 * evitar deriva numérica del cuaternión.
 */
export function alignBasisToUp(
  basisQuat: THREE.Quaternion,
  targetUp: THREE.Vector3,
  slerpAlpha = 1
): void {
  _targetUp.copy(targetUp);
  const len = _targetUp.length();
  if (len < EPSILON) return;
  _targetUp.divideScalar(len);

  _currentUp.set(0, 1, 0).applyQuaternion(basisQuat);

  const dot = _currentUp.dot(_targetUp);
  // Ya alineado (o antiparalelo: setFromUnitVectors resuelve el caso opuesto).
  if (dot > 1 - EPSILON) return;

  _correction.setFromUnitVectors(_currentUp, _targetUp);
  if (slerpAlpha < 1) {
    // Interpola la corrección desde la identidad para una transición suave.
    _correction.slerp(_yawQuat.identity(), 1 - slerpAlpha);
  }
  basisQuat.premultiply(_correction).normalize();
}

/**
 * Calcula los ejes tangentes (forward y right) en el marco de `basisQuat`,
 * rotados por `yaw` alrededor del up local. Sin gimbal lock: el yaw vive en el
 * plano tangente, nunca en ejes globales. Escribe en los out-params dados.
 */
export function getTangentAxes(
  basisQuat: THREE.Quaternion,
  yaw: number,
  outForward: THREE.Vector3,
  outRight: THREE.Vector3
): void {
  _yawQuat.setFromAxisAngle(_upAxis, yaw);
  outForward.set(0, 0, -1).applyQuaternion(_yawQuat).applyQuaternion(basisQuat).normalize();
  // right = forward x up (mano derecha), up local del marco base.
  _v1.set(0, 1, 0).applyQuaternion(basisQuat);
  outRight.copy(outForward).cross(_v1).normalize();
}

/**
 * Devuelve el planeta con mayor atracción gravitatoria sobre `pos`:
 * g = gravityStrength * radius^2 / dist^2 (distancia normalizada al radio).
 * El planeta actual recibe una histéresis leve para evitar parpadeo en fronteras.
 * Lanza si `planets` está vacío.
 */
export function findStrongestGravityPlanet(
  pos: THREE.Vector3,
  planets: PlanetRuntime[],
  currentPlanetId: string | null
): PlanetRuntime {
  if (planets.length === 0) {
    throw new Error('findStrongestGravityPlanet: no hay planetas definidos');
  }
  let best: PlanetRuntime = planets[0];
  let bestScore = -Infinity;
  for (let i = 0; i < planets.length; i++) {
    const planet = planets[i];
    _v1.copy(pos).sub(planet.centerVec);
    const dist = Math.max(_v1.length(), planet.spec.radius * 0.05);
    const normalized = dist / planet.spec.radius;
    let score = planet.spec.gravityStrength / (normalized * normalized);
    if (currentPlanetId !== null && planet.spec.id === currentPlanetId) {
      score *= 1.18; // histéresis: cuesta más despegarse del planeta actual
    }
    if (score > bestScore) {
      bestScore = score;
      best = planet;
    }
  }
  return best;
}

/**
 * Coloca `obj` sobre la superficie de una esfera: posición = center + dir * altitude
 * y orientación con su +Y alineado a `dir` (via alignBasisToUp, sin gimbal lock).
 */
export function orientObjectOnSphere(
  obj: THREE.Object3D,
  center: THREE.Vector3,
  dir: THREE.Vector3,
  altitude: number
): void {
  _v2.copy(dir);
  const len = _v2.length();
  if (len < EPSILON) return;
  _v2.divideScalar(len);
  obj.position.copy(center).addScaledVector(_v2, altitude);
  alignBasisToUp(obj.quaternion, _v2, 1);
}

// ============================================================================
// Colisión y línea de visión contra estructuras tangentes (OUTORBIT 2.0)
// ============================================================================
//
// Cada estructura vive en un espacio tangente local: +Y es la normal del
// planeta en su centro, X/Z el plano de la base (halfX x heightY x halfZ).
// El cuaternión `quat` lleva de local a mundo; `invQuat` al revés. Tanto el
// collider como `buildStructureMesh` usan la MISMA convención
// (setFromUnitVectors(up, dir) * yaw), así que colisión y visual coinciden.

export interface StructureCollider {
  id: string;
  planetId: string;
  /** Centro mundial de la base de la caja local (superficie + altitudeOffset). */
  center: THREE.Vector3;
  planetCenter: THREE.Vector3;
  planetRadius: number;
  /** Local -> mundo (incluye el yaw de la estructura). */
  quat: THREE.Quaternion;
  /** Mundo -> local. */
  invQuat: THREE.Quaternion;
  halfX: number;
  /** Altura completa de la estructura (0 = superficie local). */
  heightY: number;
  halfZ: number;
  altitudeOffset: number;
  /** Si Digger puede cruzarla por debajo excavando. */
  passableUnderground: boolean;
}

/** Banda bajo el techo desde la que se puede aterrizar/mantarse encima. */
const STRUCTURE_ROOF_BAND = 0.55;

// Temporales preasignados: CERO allocations dentro del loop de renderizado.
const _scDir = new THREE.Vector3();
const _scYaw = new THREE.Quaternion();
const _scLocal = new THREE.Vector3();
const _scWorld = new THREE.Vector3();
const _scUpAxis = new THREE.Vector3(0, 1, 0);
const _slA = new THREE.Vector3();
const _slB = new THREE.Vector3();
const _resolveResult = { groundAltitude: 0, hitWall: false };

/**
 * Construye el collider de una estructura sobre la superficie de un planeta.
 * Solo se llama al montar el nivel (allocaciones permitidas).
 *
 * Convención de rotación: `quat = setFromUnitVectors(up, dir) * yaw(yaw)`,
 * idéntica a la de `orientObjectOnSphere` + `rotateY` de `buildStructureMesh`.
 */
export function createStructureCollider(
  spec: StructureSpec,
  planetCenter: THREE.Vector3,
  planetRadius: number
): StructureCollider {
  _scDir.set(spec.sphericalDir[0], spec.sphericalDir[1], spec.sphericalDir[2]).normalize();
  const quat = new THREE.Quaternion().setFromUnitVectors(_scUpAxis, _scDir);
  const yaw = spec.yaw ?? 0;
  if (yaw !== 0) {
    _scYaw.setFromAxisAngle(_scUpAxis, yaw);
    quat.multiply(_scYaw);
  }
  const altitudeOffset = spec.altitudeOffset ?? 0;
  const center = new THREE.Vector3()
    .copy(planetCenter)
    .addScaledVector(_scDir, planetRadius + altitudeOffset);
  return {
    id: spec.id,
    planetId: spec.planetId,
    center,
    planetCenter: planetCenter.clone(),
    planetRadius,
    quat,
    invQuat: quat.clone().invert(),
    halfX: spec.size[0],
    heightY: spec.size[1],
    halfZ: spec.size[2],
    altitudeOffset,
    passableUnderground: spec.passableUnderground ?? false,
  };
}

/**
 * Resuelve la colisión del jugador contra todas las estructuras de `planetId`
 * y devuelve el suelo elevado (tejados, torres, puentes, plataformas) en
 * metros sobre la superficie del planeta.
 *
 * - Si `isBurrowing` y la estructura es `passableUnderground`, se ignora
 *   por completo (Digger pasa por debajo).
 * - Dentro en X/Z y por encima del techo (`localY >= heightY - 0.55`):
 *   aporta `altitudeOffset + heightY` a `groundAltitude` (te puedes subir
 *   encima de tejados, torres, puentes y plataformas).
 * - Choque lateral (`localY < heightY - 0.55`): empuja `pos` fuera de la
 *   caja por el eje de mínima penetración en espacio local y lo devuelve
 *   al mundo.
 *
 * SIN allocations: escribe en `pos` y devuelve un objeto módulo-nivel
 * reutilizable (leerlo inmediatamente, no almacenarlo).
 */
export function resolvePlayerStructures(
  pos: THREE.Vector3,
  velY: number,
  isBurrowing: boolean,
  colliders: StructureCollider[],
  planetId: string,
  playerRadius: number
): { groundAltitude: number; hitWall: boolean } {
  let groundAltitude = 0;
  let hitWall = false;

  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.planetId !== planetId) continue;
    // Digger excava por debajo de muros, puertas y vallas marcadas.
    if (isBurrowing && c.passableUnderground) continue;

    _scLocal.copy(pos).sub(c.center).applyQuaternion(c.invQuat);
    const ex = c.halfX + playerRadius;
    const ez = c.halfZ + playerRadius;
    if (_scLocal.x < -ex || _scLocal.x > ex || _scLocal.z < -ez || _scLocal.z > ez) {
      continue;
    }

    // Encima del techo: suelo elevado (cayendo, o claramente por encima).
    if (
      _scLocal.y >= c.heightY - STRUCTURE_ROOF_BAND &&
      (velY <= 0 || _scLocal.y >= c.heightY)
    ) {
      const top = c.altitudeOffset + c.heightY;
      if (top > groundAltitude) groundAltitude = top;
      continue;
    }

    // Por debajo de la base (puentes, plataformas y dinteles flotantes):
    // se puede pasar andando por debajo.
    if (_scLocal.y < 0) continue;

    // Pared lateral: empuje por el eje de mínima penetración en local.
    const penX = ex - Math.abs(_scLocal.x);
    const penZ = ez - Math.abs(_scLocal.z);
    if (penX <= penZ) {
      _scLocal.x = _scLocal.x >= 0 ? ex : -ex;
    } else {
      _scLocal.z = _scLocal.z >= 0 ? ez : -ez;
    }
    _scWorld.copy(_scLocal).applyQuaternion(c.quat).add(c.center);
    pos.copy(_scWorld);
    hitWall = true;
  }

  _resolveResult.groundAltitude = groundAltitude;
  _resolveResult.hitWall = hitWall;
  return _resolveResult;
}

/**
 * ¿Bloquea alguna estructura del planeta el segmento `a -> b`?
 * Intersección segmento vs caja local por el método de los slabs, para que
 * los conos de visión de los guardias NO atraviesen muros ni edificios.
 * SIN allocations (temporales módulo-nivel).
 */
export function isLineBlockedByStructures(
  a: THREE.Vector3,
  b: THREE.Vector3,
  colliders: StructureCollider[],
  planetId: string
): boolean {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.planetId !== planetId) continue;

    _slA.copy(a).sub(c.center).applyQuaternion(c.invQuat);
    _slB.copy(b).sub(c.center).applyQuaternion(c.invQuat);

    let tMin = 0;
    let tMax = 1;

    // Slab X: [-halfX, halfX]
    let d = _slB.x - _slA.x;
    if (Math.abs(d) < 1e-8) {
      if (_slA.x < -c.halfX || _slA.x > c.halfX) continue;
    } else {
      let t1 = (-c.halfX - _slA.x) / d;
      let t2 = (c.halfX - _slA.x) / d;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tMin) tMin = t1;
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) continue;
    }

    // Slab Y: [0, heightY]
    d = _slB.y - _slA.y;
    if (Math.abs(d) < 1e-8) {
      if (_slA.y < 0 || _slA.y > c.heightY) continue;
    } else {
      let t1 = -_slA.y / d;
      let t2 = (c.heightY - _slA.y) / d;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tMin) tMin = t1;
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) continue;
    }

    // Slab Z: [-halfZ, halfZ]
    d = _slB.z - _slA.z;
    if (Math.abs(d) < 1e-8) {
      if (_slA.z < -c.halfZ || _slA.z > c.halfZ) continue;
    } else {
      let t1 = (-c.halfZ - _slA.z) / d;
      let t2 = (c.halfZ - _slA.z) / d;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tMin) tMin = t1;
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) continue;
    }

    // El segmento atraviesa la caja: línea de visión cortada.
    return true;
  }
  return false;
}
