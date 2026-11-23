// ============================================================================
// MODEL PARTS — piezas anatómicas compartidas
// ============================================================================
// Partes reutilizadas por varios constructores de modelos: ojos y limbs de los personajes cabezones, y el halo de sombra + propulsor de plasma de los enemigos voladores. Extraídas de proceduralModels.ts (P8).
// ============================================================================

import * as THREE from 'three';
import {
  additiveGlowMaterial,
  toonMesh,
} from '../meshFactory';

export function buildEyes(head: THREE.Group): void {
  const eyeGeometry = new THREE.SphereGeometry(0.075, 10, 8);
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x111122 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(0.2 * side, 0.1, 0.46);
    head.add(eye);
  }
}

export function buildLimb(
  name: string,
  x: number,
  y: number,
  radius: number,
  length: number,
  color: string
): THREE.Group {
  const limb = new THREE.Group();
  limb.name = name;
  limb.position.set(x, y, 0);
  const capsule = toonMesh(
    new THREE.CapsuleGeometry(radius, length, 6, 10),
    color,
    THREE.MathUtils.clamp(radius * 0.16, 0.015, 0.022)
  );
  capsule.position.y = -(length / 2 + radius) * 0.6;
  limb.add(capsule);
  return limb;
}

/** Altura local del halo de sombra bajo los enemigos voladores (~hover). */
const FLYER_SHADOW_HALO_Y = -1.9;

/** Halo de sombra sutil pegado al suelo: el volador SE VE flotar. */
export function buildShadowHalo(radius: number): THREE.Mesh {
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 20),
    new THREE.MeshBasicMaterial({
      color: 0x0b1220,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    })
  );
  halo.name = 'shadowHalo';
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = FLYER_SHADOW_HALO_Y;
  return halo;
}

/** Cono de propulsión antigravitatoria hacia abajo (plasma aditivo). */
export function buildThrusterGlow(color: number, radius: number, length: number): THREE.Group {
  const thruster = new THREE.Group();
  thruster.name = 'thrusterGlow';
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(radius, length, 12, 1, true),
    additiveGlowMaterial(color, 0.38, { doubleSide: true, depthWrite: false })
  );
  cone.position.y = -length / 2 - 0.18;
  thruster.add(cone);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.55, 10, 8),
    additiveGlowMaterial(color, 0.75, { depthWrite: false })
  );
  core.position.y = -0.28;
  thruster.add(core);
  return thruster;
}
