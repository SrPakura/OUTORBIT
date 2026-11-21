import * as THREE from 'three';
import type { PlanetRuntime } from '../types';

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
