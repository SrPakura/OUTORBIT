// ============================================================================
// PUZZLE OBJECTS — FASE B: puzle, sigilo y acción táctica
// ============================================================================
// Compuertas con llave, palancas de pedestal y muros rompibles. Extraído de proceduralModels.ts (P8).
// ============================================================================

import * as THREE from 'three';
import { type StructureSpec } from '../../types';
import {
  additiveGlowMaterial,
  celMesh,
  hashString,
  lighten,
  makeSeededRandom,
} from '../meshFactory';

// ============================================================================
// FASE B — Sistemas de puzle, sigilo y acción táctica: compuertas con llave,
// palancas, paredes rompibles y NPCs con diálogo.
// ============================================================================

export interface LockedGateMesh {
  group: THREE.Group;
  /** Barrera energética naranja-roja: baja al suelo al abrirse la compuerta. */
  barrier: THREE.Mesh;
  barrierMaterial: THREE.MeshBasicMaterial;
  /** Posición Y de reposo de la barrera (para animar el descenso). */
  barrierBaseY: number;
  /** Candado/visor luminoso del dintel: rojo cerrado, verde abierto. */
  lockMaterial: THREE.MeshBasicMaterial;
}

/**
 * Compuerta bloqueada con marco sólido (pilares + dintel), barrera energética
 * naranja-roja que baja al suelo al abrirse y candado/visor luminoso que
 * pasa de rojo a verde. Convención de `StructureSpec`: origen en la base,
 * size = [halfX, heightY, halfZ], +Y = normal del planeta.
 */
export function buildLockedGateMesh(
  halfX: number,
  heightY: number,
  halfZ: number
): LockedGateMesh {
  const group = new THREE.Group();
  group.name = 'lockedGate';

  const frameColor = '#3b4463';
  const accent = lighten(frameColor);

  // Pilares laterales sólidos (el collider cubre TODO el hueco mientras
  // está cerrada; los pilares son la parte que nunca se abre).
  const pillarWidth = Math.min(0.7, halfX * 0.35);
  const openingHalfX = Math.max(halfX - pillarWidth, halfX * 0.3);
  for (const side of [-1, 1]) {
    const pillar = celMesh(
      new THREE.BoxGeometry(pillarWidth, heightY, halfZ * 2),
      frameColor,
      0.026
    );
    pillar.position.set((halfX - pillarWidth / 2) * side, heightY / 2, 0);
    group.add(pillar);
    const cap = celMesh(
      new THREE.BoxGeometry(pillarWidth * 1.25, 0.3, halfZ * 2 * 1.1),
      accent,
      0.02
    );
    cap.position.set((halfX - pillarWidth / 2) * side, heightY + 0.15, 0);
    group.add(cap);
  }

  // Dintel superior con remate.
  const lintel = celMesh(
    new THREE.BoxGeometry(halfX * 2, 0.55, halfZ * 2),
    frameColor,
    0.024
  );
  lintel.position.y = heightY - 0.275;
  group.add(lintel);
  const crest = celMesh(
    new THREE.BoxGeometry(halfX * 0.8, 0.3, halfZ * 2 * 0.9),
    accent,
    0.02
  );
  crest.position.y = heightY + 0.15;
  group.add(crest);

  // Barrera energética naranja-roja: reja vertical que llena el hueco y baja
  // al suelo (o desaparece) al abrirse la compuerta.
  const barrierMaterial = additiveGlowMaterial(0xf97316, 0.55, { doubleSide: true, depthWrite: false });
  const openingHeight = Math.max(heightY - 1.0, 0.6);
  const barrier = new THREE.Mesh(
    new THREE.BoxGeometry(openingHalfX * 2, openingHeight, 0.12),
    barrierMaterial
  );
  barrier.name = 'gateBarrier';
  const barrierBaseY = 0.35 + openingHeight / 2;
  barrier.position.y = barrierBaseY;
  group.add(barrier);

  // Barrotes verticales de la reja (mismo material, giran con la barrera).
  const barGeometry = new THREE.BoxGeometry(0.09, openingHeight, 0.16);
  const barCount = Math.max(2, Math.floor(openingHalfX * 2 / 0.55));
  for (let i = 1; i < barCount; i++) {
    const bar = new THREE.Mesh(barGeometry, barrierMaterial);
    bar.position.x = -openingHalfX + (i / barCount) * openingHalfX * 2;
    barrier.add(bar);
  }

  // Candado/visor luminoso en el centro del dintel.
  const lockMaterial = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const lock = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), lockMaterial);
  lock.position.set(0, heightY + 0.15, halfZ + 0.05);
  group.add(lock);
  const lockHalo = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.05, 8, 18),
    lockMaterial
  );
  lockHalo.position.copy(lock.position);
  group.add(lockHalo);

  return { group, barrier, barrierMaterial, barrierBaseY, lockMaterial };
}

export interface SwitchLeverMesh {
  group: THREE.Group;
  /** Pivote de la palanca: bascula al activarse. */
  leverPivot: THREE.Group;
  /** Cristal indicador: rojo desactivado, verde/cian activado. */
  crystalMaterial: THREE.MeshBasicMaterial;
}

/**
 * Pedestal con palanca basculante y cristal indicador que pasa de rojo a
 * verde/cian al activarse (con [E] o lanzándole una roca con Estasis).
 */
export function buildSwitchLeverMesh(): SwitchLeverMesh {
  const group = new THREE.Group();
  group.name = 'switchLever';

  // Pedestal metálico.
  const base = celMesh(new THREE.CylinderGeometry(0.55, 0.7, 0.5, 10), '#334155', 0.02);
  base.position.y = 0.25;
  group.add(base);
  const column = celMesh(new THREE.CylinderGeometry(0.28, 0.34, 0.9, 8), '#475569', 0.018);
  column.position.y = 0.9;
  group.add(column);

  // Palanca basculante sobre el pivote superior.
  const leverPivot = new THREE.Group();
  leverPivot.name = 'leverPivot';
  leverPivot.position.y = 1.35;
  leverPivot.rotation.x = -0.55;
  group.add(leverPivot);
  const stick = celMesh(new THREE.CylinderGeometry(0.06, 0.075, 0.85, 8), '#94a3b8', 0.014);
  stick.position.y = 0.42;
  leverPivot.add(stick);
  const knob = celMesh(new THREE.SphereGeometry(0.14, 12, 10), '#f87171', 0.014);
  knob.position.y = 0.85;
  leverPivot.add(knob);

  // Cristal indicador luminoso en el frente del pedestal.
  const crystalMaterial = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), crystalMaterial);
  crystal.position.set(0, 1.0, 0.36);
  crystal.scale.set(1, 1.3, 0.7);
  group.add(crystal);

  return { group, leverPivot, crystalMaterial };
}

export interface BreakableWallMesh {
  group: THREE.Group;
  /** Grietas naranjas/doradas brillantes: se apagan al recibir el 1er golpe. */
  crackMaterial: THREE.MeshBasicMaterial;
}

/**
 * Muro de piedra/metal reforzado con grietas naranjas/doradas brillantes:
 * el jugador reconoce al instante que puede volarlo con un barril, Estasis
 * (2 golpes) o una embestida de Digger. Convención de `StructureSpec`.
 */
export function buildBreakableWallMesh(
  halfX: number,
  heightY: number,
  halfZ: number
): BreakableWallMesh {
  const group = new THREE.Group();
  group.name = 'breakableWall';

  // Cuerpo del muro: piedra oscura con bandas de metal.
  const body = celMesh(
    new THREE.BoxGeometry(halfX * 2, heightY, halfZ * 2),
    '#57534e',
    0.028
  );
  body.position.y = heightY / 2;
  group.add(body);
  for (const y of [heightY * 0.3, heightY * 0.72]) {
    const band = celMesh(
      new THREE.BoxGeometry(halfX * 2 * 1.02, 0.28, halfZ * 2 * 1.04),
      '#7f1d1d',
      0.02
    );
    band.position.y = y;
    group.add(band);
  }

  // Grietas luminosas naranjas/doradas en ambas caras: patrón determinista
  // de segmentos finos que converge hacia el centro (punto de quiebre).
  const crackMaterial = additiveGlowMaterial(0xfbbf24, 0.9, { depthWrite: false });
  const faceZ = halfZ + 0.03;
  const crackGeometry = new THREE.BoxGeometry(1, 0.075, 0.03);
  const random = makeSeededRandom(hashString('breakable-wall'));
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const crack = new THREE.Mesh(crackGeometry, crackMaterial);
      const angle = random() * Math.PI - Math.PI / 2;
      const dist = 0.35 + random() * (halfX * 0.8);
      crack.scale.x = 0.45 + random() * 0.75;
      crack.position.set(
        Math.sin(angle) * dist * (i % 2 === 0 ? 1 : -1),
        heightY * (0.25 + random() * 0.55),
        faceZ * side
      );
      crack.rotation.z = angle * 0.8;
      group.add(crack);
    }
    // Núcleo del quiebre: rombo dorado brillante en el centro de la cara.
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), crackMaterial);
    core.position.set(0, heightY * 0.5, faceZ * side);
    group.add(core);
  }

  return { group, crackMaterial };
}
