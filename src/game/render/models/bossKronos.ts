// ============================================================================
// BOSS KRONOS — Comandante (jefe final, Hito 4)
// ============================================================================
// El leviatán acorazado del final de campaña y el overlay de disfraz robado. Extraído de proceduralModels.ts (P8).
// ============================================================================

import * as THREE from 'three';
import { GUARD_UNIFORM, GUARD_UNIFORM_DARK } from './guardFaction';
import { createToonMaterial } from '../toonMaterials';
import {
  additiveGlowMaterial,
  toonMesh,
} from '../meshFactory';

// ============================================================================
// Comandante KRONOS (jefe final, Hito 4)
// ============================================================================

const KRONOS_RED = '#dc2626';
const KRONOS_DARK = '#18181b';
const KRONOS_HORN = '#facc15';
const KRONOS_WHITE = '#f8fafc';

/**
 * Comandante KRONOS: torreón rojo blindado con cuernos dorados, hombreras
 * oscuras con remaches, peto blanco y maza gigante con pinchos (portado de
 * `referencia_visual.html :: buildCommanderKronos`). Lo envuelve un anillo
 * de energía cuyo color cambia según la postura de su red MLP.
 *
 * Devuelve el grupo (mira hacia +Z), el material del anillo de energía y el
 * grupo de la maza para animar el windup del barrido.
 */
export function buildKronosModel(): {
  group: THREE.Group;
  ringMaterial: THREE.MeshBasicMaterial;
  maceGroup: THREE.Group;
} {
  const boss = new THREE.Group();
  boss.name = 'kronos';

  // Torso masivo blindado.
  const torso = toonMesh(
    new THREE.CylinderGeometry(0.48, 0.38, 0.85, 12),
    KRONOS_RED,
    0.036
  );
  torso.name = 'torso';
  torso.position.y = 0.62;
  boss.add(torso);

  // Peto blanco.
  const collar = toonMesh(new THREE.BoxGeometry(0.62, 0.25, 0.54), KRONOS_WHITE, 0.028);
  collar.position.set(0, 0.86, 0.08);
  boss.add(collar);

  // Cabeza con casco rojo.
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.24;
  const skull = toonMesh(new THREE.SphereGeometry(0.36, 16, 16), KRONOS_RED, 0.035);
  head.add(skull);
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.1, 0.12),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
  );
  visor.position.set(0, 0.02, 0.3);
  head.add(visor);
  boss.add(head);

  // Cuernos dorados afilados.
  const hornGeo = new THREE.ConeGeometry(0.09, 0.42, 8);
  for (const side of [-1, 1]) {
    const horn = toonMesh(hornGeo, KRONOS_HORN, 0.026);
    horn.position.set(0.28 * side, 1.48, 0.14);
    horn.rotation.set(0.45, 0, 0.48 * side);
    boss.add(horn);
  }

  // Hombreras negras con remaches dorados.
  const shoulderGeo = new THREE.SphereGeometry(0.26, 12, 12);
  const rivetGeo = new THREE.SphereGeometry(0.05, 8, 6);
  for (const side of [-1, 1]) {
    const pad = toonMesh(shoulderGeo, KRONOS_DARK, 0.03);
    pad.position.set(0.56 * side, 0.85, 0);
    boss.add(pad);
    const rivet = new THREE.Mesh(rivetGeo, createToonMaterial(KRONOS_HORN));
    rivet.position.set(0.56 * side, 0.98, 0.12);
    boss.add(rivet);
  }

  // Maza gigante con pinchos dorados (animable en el windup).
  const maceGroup = new THREE.Group();
  maceGroup.name = 'mace';
  maceGroup.position.set(0.68, 0.48, 0.35);
  maceGroup.rotation.set(1.25, 0.1, -0.25);
  boss.add(maceGroup);

  const club = toonMesh(new THREE.CylinderGeometry(0.18, 0.07, 1.35, 10), KRONOS_DARK, 0.032);
  maceGroup.add(club);
  const tip = toonMesh(new THREE.ConeGeometry(0.18, 0.28, 10), KRONOS_HORN, 0.026);
  tip.position.y = 0.8;
  maceGroup.add(tip);
  const spikeGeo = new THREE.ConeGeometry(0.05, 0.14, 6);
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const yOff = i % 2 === 0 ? 0.25 : 0.48;
    const spike = new THREE.Mesh(spikeGeo, createToonMaterial(KRONOS_HORN));
    spike.position.set(Math.cos(ang) * 0.18, yOff, Math.sin(ang) * 0.18);
    spike.rotation.z = -Math.cos(ang) * (Math.PI / 2);
    spike.rotation.x = Math.sin(ang) * (Math.PI / 2);
    maceGroup.add(spike);
  }

  // Piernas robustas.
  const legGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.32, 10);
  for (const side of [-1, 1]) {
    const leg = toonMesh(legGeo, KRONOS_DARK, 0.025);
    leg.position.set(0.22 * side, 0.16, 0);
    boss.add(leg);
  }

  // Anillo/escudo de energía: su color cambia según la postura de la red MLP.
  const ringMaterial = additiveGlowMaterial(0xf97316, 0.55, { doubleSide: true, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.07, 10, 40), ringMaterial);
  ring.name = 'energyRing';
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.9;
  boss.add(ring);

  // Escala de jefe: imponente frente a los personajes (~1.8 de alto).
  boss.scale.setScalar(2.3);

  return { group: boss, ringMaterial, maceGroup };
}

/**
 * Casco y chaleco de guardia que se superponen al personaje activo cuando
 * `isDisguised = true` (uniforme robado con el noqueo por la espalda).
 * Invisible por defecto.
 */
export function buildDisguiseOverlay(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'disguiseOverlay';

  const helmet = toonMesh(
    new THREE.SphereGeometry(0.56, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    GUARD_UNIFORM_DARK,
    0.014
  );
  helmet.position.y = 1.62;
  group.add(helmet);

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.14, 0.16),
    new THREE.MeshBasicMaterial({ color: 0xf87171 })
  );
  visor.position.set(0, 1.42, 0.46);
  group.add(visor);

  const vest = toonMesh(new THREE.BoxGeometry(0.8, 0.58, 0.62), GUARD_UNIFORM, 0.014);
  vest.position.y = 0.6;
  group.add(vest);

  group.visible = false;
  return group;
}
