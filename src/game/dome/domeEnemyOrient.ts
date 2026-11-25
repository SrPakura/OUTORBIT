// ============================================================================
// DOME ENEMY ORIENT — utilidades de orientación compartidas por las IA
// ============================================================================
// lookAtQuat y faceTowards extraídas de DomeWaveManager (P6): el patrón
// "cuaternión que mira hacia una dirección + slerp suavizado" se repetía en
// las poses de KRONOS, cangrejo, pulpo, gorrion, Prisma Necroz y gólem.
// Scratch de módulo: cero allocations por frame.
// ============================================================================

import * as THREE from 'three';

const _basisMat = new THREE.Matrix4();
const _origin = new THREE.Vector3();
const _targetQuat = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

/** Cuaternión que orienta el eje -Z hacia `dir` con `up` como eje vertical. */
export function lookAtQuat(
  dir: THREE.Vector3,
  up: THREE.Vector3,
  out: THREE.Quaternion,
): THREE.Quaternion {
  _basisMat.lookAt(dir, _origin, up);
  return out.setFromRotationMatrix(_basisMat);
}

/**
 * Encara `mesh` hacia `lookDir` (se espera ya normalizado o con fallback)
 * con giro suavizado exponencial: `1 - exp(-turnRate * dt)` de slerp por
 * frame. Es el patrón común de todas las poses de enemigos de la cúpula.
 */
export function faceTowards(
  mesh: THREE.Object3D,
  lookDir: THREE.Vector3,
  turnRate: number,
  dt: number,
): void {
  lookAtQuat(lookDir, _up, _targetQuat);
  mesh.quaternion.slerp(_targetQuat, 1 - Math.exp(-turnRate * dt));
}
