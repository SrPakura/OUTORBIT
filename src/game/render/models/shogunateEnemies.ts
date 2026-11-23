// ============================================================================
// SHOGUNATE ENEMIES — Kurogane (Shogunato Feudal Nevado)
// ============================================================================
// Samurái (con variante oficial) y oni acorazado. Extraído de proceduralModels.ts (P8).
// ============================================================================

import * as THREE from 'three';
import { buildLimb } from './modelParts';
import { createToonMaterial } from '../toonMaterials';
import {
  additiveGlowMaterial,
  celMesh,
} from '../meshFactory';

// ============================================================================
// Shogunato Feudal Nevado (Kurogane · Planeta 2): samuráis y oni. Sustituyen
// temáticamente a guardias/oficiales (samurái, capitán con sashimono) y al
// brute (oni acorazado con kanabo). Cuerpos cel con contornos finos y
// mirando hacia +Z, como el resto de enemigos.
// ============================================================================

const SAMURAI_CRIMSON = '#b91c1c'; // laca carmesí
const SAMURAI_INDIGO = '#1e1b4b'; // índigo oscuro
const SAMURAI_GOLD = '#fbbf24';
const SAMURAI_STEEL = '#e2e8f0';

/**
 * Samurái del Shogunato Nevado: armadura lacada rojo-carmesí sobre índigo
 * oscuro, casco kabuto con media luna dorada, máscara menpo oscura con ojos
 * brillantes, hombreras laminares y katana en la mano derecha. Con
 * `isOfficer` añade un estandarte sashimono dorado en la espalda: es el
 * Capitán del Dojo que porta la llave maestra del Castillo.
 */
export function buildSamuraiModel(isOfficer = false): THREE.Group {
  const group = new THREE.Group();
  group.name = 'samurai';

  // Hito 4: pivote del torso EN la cadera — el windup tuerce el cuerpo y el
  // sprint lo inclina sin despegar cabeza ni brazos.
  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.y = 0.42;
  group.add(torso);

  // Torso de índigo oscuro bajo la coraza carmesí.
  const body = celMesh(new THREE.CapsuleGeometry(0.36, 0.36, 8, 14), SAMURAI_INDIGO, 0.016);
  body.position.y = 0.13;
  torso.add(body);

  // Coraza lacada (do-maru) carmesí con cordones dorados.
  const cuirass = celMesh(new THREE.CylinderGeometry(0.4, 0.44, 0.52, 12), SAMURAI_CRIMSON, 0.016);
  cuirass.position.y = 0.2;
  torso.add(cuirass);
  const lace = celMesh(new THREE.CylinderGeometry(0.41, 0.45, 0.1, 12), SAMURAI_GOLD, 0.012);
  lace.position.y = 0.08;
  torso.add(lace);

  // Falda de placas (kusazuri): cono abierto carmesí sobre las caderas.
  const skirt = celMesh(
    new THREE.ConeGeometry(0.52, 0.42, 10, 1, true),
    SAMURAI_CRIMSON,
    0.016
  );
  skirt.position.y = 0;
  torso.add(skirt);

  // Cabeza: cráneo oscuro cubierto por la máscara menpo (pivote de cuello).
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 0.92;
  const skull = celMesh(new THREE.SphereGeometry(0.5, 18, 14), '#2a2432', 0.016);
  head.add(skull);
  // Menpo: máscara facial oscura que cubre el rostro bajo los ojos.
  const menpo = celMesh(new THREE.SphereGeometry(0.42, 14, 12), '#18181b', 0.016);
  menpo.scale.set(1.02, 0.9, 0.72);
  menpo.position.set(0, -0.06, 0.22);
  head.add(menpo);
  // Ojos brillantes tras la máscara (furia del Shogunato).
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xf87171 });
  const eyeGeometry = new THREE.SphereGeometry(0.07, 8, 6);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(0.17 * side, 0.12, 0.42);
    eye.scale.set(1, 0.8, 0.6);
    head.add(eye);
  }
  // Kabuto: casco abombado índigo con ala y protectores de mejilla.
  const helmet = celMesh(
    new THREE.SphereGeometry(0.54, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    SAMURAI_INDIGO,
    0.016
  );
  helmet.position.y = 0.1;
  head.add(helmet);
  const brim = celMesh(new THREE.CylinderGeometry(0.56, 0.56, 0.07, 16), SAMURAI_INDIGO, 0.014);
  brim.position.y = 0.1;
  head.add(brim);
  // Media luna dorada (maedate) al frente del kabuto.
  const crescent = celMesh(
    new THREE.TorusGeometry(0.24, 0.05, 8, 16, Math.PI),
    SAMURAI_GOLD,
    0.014
  );
  crescent.position.set(0, 0.42, 0.3);
  crescent.rotation.z = Math.PI; // cuernos de la luna hacia arriba
  head.add(crescent);
  torso.add(head);

  // Brazos de índigo con hombreras laminares (sode) que giran con el hombro.
  for (const side of [-1, 1]) {
    const arm = buildLimb(
      side > 0 ? 'leftArm' : 'rightArm',
      0.46 * side,
      0.32,
      0.12,
      0.28,
      SAMURAI_INDIGO
    );
    for (let i = 0; i < 3; i++) {
      const plate = celMesh(
        new THREE.SphereGeometry(0.19 - i * 0.03, 10, 8),
        i === 0 ? SAMURAI_GOLD : SAMURAI_CRIMSON,
        0.014
      );
      plate.position.set(0, 0.14 - i * 0.14, 0);
      plate.scale.set(1, 0.5, 1);
      arm.add(plate);
    }
    const gauntlet = celMesh(new THREE.SphereGeometry(0.12, 8, 6), SAMURAI_GOLD, 0.012);
    gauntlet.position.set(0, -0.34, 0.02);
    arm.add(gauntlet);
    torso.add(arm);
  }

  // Piernas de índigo con botas oscuras y espinilleras (hermanas del torso).
  for (const side of [-1, 1]) {
    const leg = buildLimb(
      side > 0 ? 'leftLeg' : 'rightLeg',
      0.18 * side,
      0.32,
      0.14,
      0.18,
      side > 0 ? SAMURAI_INDIGO : '#11111c'
    );
    const shinGuard = celMesh(new THREE.BoxGeometry(0.16, 0.2, 0.14), SAMURAI_CRIMSON, 0.012);
    shinGuard.position.set(0, -0.2, 0.06);
    leg.add(shinGuard);
    group.add(leg);
  }

  // Katana en la mano derecha: empuñadura lacada, tsuba dorada, hoja curva
  // y filo luminoso (el swing del brazo la arrastra automáticamente).
  const rightArm = torso.getObjectByName('rightArm');
  if (rightArm) {
    const katana = new THREE.Group();
    katana.name = 'katana';
    const handle = celMesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 6), '#7f1d1d', 0.012);
    katana.add(handle);
    const guard = celMesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 10), SAMURAI_GOLD, 0.012);
    guard.position.y = 0.16;
    katana.add(guard);
    const blade = celMesh(new THREE.BoxGeometry(0.045, 0.72, 0.02), SAMURAI_STEEL, 0.012);
    blade.position.set(0.03, 0.54, 0);
    blade.rotation.z = -0.08; // leve curvatura de la hoja
    katana.add(blade);
    // Filo luminoso: destello aditivo a lo largo del corte.
    const edgeGlow = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 0.72, 0.024),
      additiveGlowMaterial(0xe0f2fe, 0.85, { depthWrite: false })
    );
    edgeGlow.position.set(0.055, 0.54, 0);
    edgeGlow.rotation.z = -0.08;
    katana.add(edgeGlow);
    const tip = celMesh(new THREE.ConeGeometry(0.032, 0.12, 6), SAMURAI_STEEL, 0.012);
    tip.position.set(0.075, 0.94, 0);
    tip.rotation.z = -0.08;
    katana.add(tip);
    katana.position.set(0, -0.36, 0.12);
    katana.rotation.x = -0.65; // en guardia, hoja alzada hacia el frente
    rightArm.add(katana);
  }

  // Capitán: estandarte sashimono dorado sobre pivote EN la base de la
  // espalda — ondea con el viento y destuerce con el windup del katana.
  if (isOfficer) {
    const bannerPivot = new THREE.Group();
    bannerPivot.name = 'banner';
    bannerPivot.position.set(0, -0.02, -0.4);
    const pole = celMesh(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 6), '#3f2a1a', 0.012);
    pole.position.y = 1.3;
    bannerPivot.add(pole);
    const banner = celMesh(new THREE.BoxGeometry(0.62, 1.3, 0.04), SAMURAI_GOLD, 0.016);
    banner.position.set(0, 1.95, -0.04);
    bannerPivot.add(banner);
    // Emblema carmesí del Shogunato sobre el estandarte.
    const emblem = celMesh(new THREE.OctahedronGeometry(0.18, 0), SAMURAI_CRIMSON, 0.014);
    emblem.position.set(0, 1.95, 0);
    bannerPivot.add(emblem);
    torso.add(bannerPivot);
  }

  return group;
}

const ONI_SKIN = '#60a5fa'; // piel azul hielo
const ONI_CRIMSON = '#b91c1c';
const ONI_GOLD = '#fbbf24';
const ONI_HORN = '#f8fafc';

/**
 * Oni acorazado gigante del Castillo del Shogún: demonio de piel azul hielo
 * con placas carmesí, taparrabos y armadura dorada, dos cuernos blancos
 * curvos y un kanabo (garrote pesado con pinchos) en la mano. Sustituye al
 * brute en el Shogunato Nevado.
 */
export function buildOniModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'oni';

  // Hito 4: pivote del torso EN la cadera (el kanabo va dentro del brazo).
  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.y = 0.55;
  group.add(torso);

  // Torso masivo de piel azul hielo.
  const body = celMesh(new THREE.CapsuleGeometry(0.52, 0.5, 8, 14), ONI_SKIN, 0.02);
  body.position.y = 0.13;
  body.scale.set(1.25, 1, 1.15);
  torso.add(body);

  // Peto de placas carmesí con remaches dorados.
  const chest = celMesh(new THREE.CylinderGeometry(0.56, 0.6, 0.5, 12), ONI_CRIMSON, 0.018);
  chest.position.y = 0.23;
  torso.add(chest);
  const rivetGeometry = new THREE.SphereGeometry(0.06, 8, 6);
  for (const side of [-1, 1]) {
    const rivet = new THREE.Mesh(rivetGeometry, createToonMaterial(ONI_GOLD));
    rivet.position.set(0.42 * side, 0.35, 0.42);
    torso.add(rivet);
  }

  // Taparrabos dorado: cinturón + faldón carmesí entre las piernas.
  const belt = celMesh(new THREE.CylinderGeometry(0.58, 0.58, 0.18, 14), ONI_GOLD, 0.016);
  belt.position.y = -0.13;
  torso.add(belt);
  const loincloth = celMesh(new THREE.BoxGeometry(0.5, 0.6, 0.14), ONI_CRIMSON, 0.016);
  loincloth.position.set(0, -0.27, 0.42);
  torso.add(loincloth);

  // Cabeza demoníaca: calavera azul hielo, boca con colmillos y ojos ardientes.
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 0.97;
  const skull = celMesh(new THREE.SphereGeometry(0.46, 18, 14), ONI_SKIN, 0.018);
  head.add(skull);
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xf87171 });
  const eyeGeometry = new THREE.SphereGeometry(0.08, 8, 6);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(0.16 * side, 0.1, 0.4);
    head.add(eye);
  }
  // Mandíbula con colmillos blancos.
  const jaw = celMesh(new THREE.SphereGeometry(0.3, 12, 10), ONI_SKIN, 0.016);
  jaw.scale.set(1.1, 0.6, 0.9);
  jaw.position.set(0, -0.26, 0.2);
  head.add(jaw);
  const fangGeometry = new THREE.ConeGeometry(0.05, 0.16, 6);
  for (const side of [-1, 1]) {
    const fang = new THREE.Mesh(fangGeometry, createToonMaterial(ONI_HORN));
    fang.position.set(0.14 * side, -0.14, 0.42);
    head.add(fang);
  }
  // Dos cuernos blancos curvos hacia fuera y arriba.
  const hornGeometry = new THREE.ConeGeometry(0.11, 0.55, 8);
  for (const side of [-1, 1]) {
    const horn = celMesh(hornGeometry, ONI_HORN, 0.016);
    horn.position.set(0.3 * side, 0.44, -0.02);
    horn.rotation.set(-0.25, 0, 0.75 * side);
    head.add(horn);
  }
  torso.add(head);

  // Brazos robustos de piel azul hielo con hombreras doradas articuladas.
  for (const side of [-1, 1]) {
    const arm = buildLimb(
      side > 0 ? 'leftArm' : 'rightArm',
      0.62 * side,
      0.37,
      0.16,
      0.34,
      ONI_SKIN
    );
    const pad = celMesh(new THREE.SphereGeometry(0.24, 12, 10), ONI_GOLD, 0.016);
    pad.position.set(0, 0.2, 0);
    pad.scale.set(1, 0.65, 1);
    arm.add(pad);
    const fist = celMesh(new THREE.SphereGeometry(0.16, 10, 8), ONI_SKIN, 0.014);
    fist.position.set(0, -0.46, 0.03);
    arm.add(fist);
    torso.add(arm);
  }

  // Piernas robustas con rodilleras (hermanas del torso).
  for (const side of [-1, 1]) {
    const leg = buildLimb(
      side > 0 ? 'leftLeg' : 'rightLeg',
      0.26 * side,
      0.4,
      0.18,
      0.2,
      ONI_SKIN
    );
    const knee = celMesh(new THREE.SphereGeometry(0.16, 8, 6), ONI_GOLD, 0.014);
    knee.position.set(0, -0.2, 0.08);
    knee.scale.set(1, 0.8, 1);
    leg.add(knee);
    group.add(leg);
  }

  // Kanabo: garrote pesado de hierro con anillos dorados y pinchos, DENTRO
  // de la mano derecha (apoyado al hombro; el swing lo acompaña).
  const rightArm = torso.getObjectByName('rightArm');
  if (rightArm) {
    const kanabo = new THREE.Group();
    kanabo.name = 'kanabo';
    const club = celMesh(new THREE.CylinderGeometry(0.13, 0.09, 1.5, 8), '#3f3f46', 0.018);
    club.position.y = 0.55;
    kanabo.add(club);
    for (const y of [0.25, 0.7, 1.15]) {
      const ring = celMesh(new THREE.CylinderGeometry(0.15, 0.15, 0.09, 8), ONI_GOLD, 0.014);
      ring.position.y = y;
      kanabo.add(ring);
    }
    const spikeGeometry = new THREE.ConeGeometry(0.05, 0.16, 6);
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const spike = new THREE.Mesh(spikeGeometry, createToonMaterial(ONI_HORN));
      spike.position.set(Math.cos(ang) * 0.15, 0.7 + (i % 2) * 0.45, Math.sin(ang) * 0.15);
      spike.rotation.z = -Math.cos(ang) * (Math.PI / 2);
      spike.rotation.x = Math.sin(ang) * (Math.PI / 2);
      kanabo.add(spike);
    }
    kanabo.position.set(0, -0.5, 0.3);
    kanabo.rotation.set(-0.5, 0, 0.12);
    rightArm.add(kanabo);
  }

  // Escala de gigante: impone frente a los samuráis (~1.9 de alto).
  group.scale.setScalar(1.3);

  return group;
}

