// ============================================================================
// GUARD FACTION — centinelas uniformados
// ============================================================================
// Guardia, oficial, dron de reconocimiento, torreta y brute: la facción base de la Red de IA intra-planeta. Extraído de proceduralModels.ts (P8).
// ============================================================================

import * as THREE from 'three';
import { createToonMaterial } from '../toonMaterials';
import {
  additiveGlowMaterial,
  toonMesh,
} from '../meshFactory';
import { buildLimb, buildShadowHalo, buildThrusterGlow } from './modelParts';

// ============================================================================
// Guardias (centinelas de prueba del Hito 2) y disfraz robado
// ============================================================================

export const GUARD_UNIFORM = '#3b4463';
export const GUARD_UNIFORM_DARK = '#232a3d';

/**
 * Centinela de prueba: uniforme azul oscuro con casco, visor rojo y hombreras.
 * Contornos finos (0.012-0.018) coherentes con los personajes del escuadrón.
 *
 * Hito 4 — rig articulado: `torso` (pivote de cadera que arrastra pecho,
 * cabeza y brazos al inclinarse), `head` (pivote de cuello), brazos con
 * hombreras articuladas que giran con el hombro, bastón táctico aturdidor
 * dentro de `rightArm` (la punta luminosa acompaña cada swing), radio
 * dorsal con antena, rodilleras y botas.
 */
export function buildGuardModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'guard';

  // Pivote del torso EN LA CADERA: sprint/windup articulan sin despegar nada.
  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.y = 0.42;
  group.add(torso);

  const chest = toonMesh(new THREE.CapsuleGeometry(0.36, 0.36, 8, 14), GUARD_UNIFORM, 0.016);
  chest.position.y = 0.13;
  torso.add(chest);

  // Peto blindado anguloso con filo luminoso.
  const plate = toonMesh(new THREE.BoxGeometry(0.56, 0.42, 0.3), GUARD_UNIFORM_DARK, 0.016);
  plate.position.set(0, 0.2, 0.18);
  plate.rotation.x = -0.14;
  torso.add(plate);
  const plateLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.05, 0.04),
    new THREE.MeshBasicMaterial({ color: 0xf87171 })
  );
  plateLine.position.set(0, 0.3, 0.34);
  torso.add(plateLine);

  const belt = toonMesh(new THREE.CylinderGeometry(0.38, 0.38, 0.14, 14), GUARD_UNIFORM_DARK, 0.014);
  belt.position.y = -0.04;
  torso.add(belt);

  // Radio dorsal con antena: la red de IA intra-planeta.
  const radioPack = toonMesh(new THREE.BoxGeometry(0.34, 0.3, 0.16), GUARD_UNIFORM_DARK, 0.014);
  radioPack.position.set(0, 0.22, -0.32);
  torso.add(radioPack);
  const antenna = toonMesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5), '#94a3b8', 0.01);
  antenna.position.set(0.12, 0.6, -0.34);
  antenna.rotation.z = -0.16;
  torso.add(antenna);
  const antennaTip = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xf87171 })
  );
  antennaTip.position.set(0.16, 0.85, -0.34);
  torso.add(antennaTip);

  // Cabeza sobre pivote de cuello.
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 0.92;
  const skull = toonMesh(new THREE.SphereGeometry(0.5, 18, 14), '#b8c0cc', 0.016);
  head.add(skull);
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.16, 0.18),
    new THREE.MeshBasicMaterial({ color: 0xf87171 })
  );
  visor.position.set(0, 0.06, 0.44);
  head.add(visor);
  const helmet = toonMesh(
    new THREE.SphereGeometry(0.54, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    GUARD_UNIFORM_DARK,
    0.016
  );
  helmet.position.y = 0.08;
  head.add(helmet);
  torso.add(head);

  // Brazos con hombreras articuladas (giran con el hombro) y guantes.
  for (const side of [-1, 1]) {
    const arm = buildLimb(
      side > 0 ? 'leftArm' : 'rightArm',
      0.46 * side,
      0.32,
      0.12,
      0.28,
      GUARD_UNIFORM
    );
    const pad = toonMesh(new THREE.SphereGeometry(0.17, 10, 8), GUARD_UNIFORM_DARK, 0.014);
    pad.position.set(0, 0.12, 0);
    pad.scale.set(1, 0.7, 1);
    arm.add(pad);
    const glove = toonMesh(new THREE.SphereGeometry(0.13, 10, 8), GUARD_UNIFORM_DARK, 0.012);
    glove.position.set(0, -0.36, 0.02);
    glove.scale.set(1, 0.85, 1.1);
    arm.add(glove);
    torso.add(arm);
  }

  // Bastón táctico aturdidor en la mano derecha con punta luminosa.
  const rightArm = torso.getObjectByName('rightArm');
  if (rightArm) {
    const baton = new THREE.Group();
    baton.name = 'stunBaton';
    const handle = toonMesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 6), '#18181b', 0.01);
    baton.add(handle);
    const shaft = toonMesh(new THREE.CylinderGeometry(0.028, 0.028, 0.3, 6), '#3f3f46', 0.01);
    shaft.position.y = 0.24;
    baton.add(shaft);
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xf87171 })
    );
    tip.position.y = 0.4;
    baton.add(tip);
    const tipGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 6),
      additiveGlowMaterial(0xf87171, 0.5, { depthWrite: false })
    );
    tipGlow.position.y = 0.4;
    baton.add(tipGlow);
    baton.position.set(0, -0.36, 0.08);
    baton.rotation.x = 1.15; // empuñado al frente
    rightArm.add(baton);
  }

  // Piernas hermanas del torso (no se inclinan con el sprint) con rodilleras
  // y botas articuladas.
  for (const side of [-1, 1]) {
    const leg = buildLimb(
      side > 0 ? 'leftLeg' : 'rightLeg',
      0.18 * side,
      0.32,
      0.14,
      0.18,
      GUARD_UNIFORM_DARK
    );
    const knee = toonMesh(new THREE.SphereGeometry(0.13, 8, 6), GUARD_UNIFORM_DARK, 0.012);
    knee.position.set(0, -0.17, 0.07);
    knee.scale.set(1, 0.8, 1);
    leg.add(knee);
    const boot = toonMesh(new THREE.BoxGeometry(0.17, 0.1, 0.26), '#18181b', 0.012);
    boot.position.set(0, -0.3, 0.05);
    leg.add(boot);
    group.add(leg);
  }

  return group;
}

// ============================================================================
// Red de IA intra-planeta (Hito 3B): oficial, dron, torreta y brute
// ============================================================================

const OFFICER_GOLD = '#fbbf24';

/**
 * Oficial detector de disfraces: uniforme azul oscuro con gorra y hombreras
 * doradas. Desenmascara a cualquier jugador disfrazado que se acerque mucho.
 *
 * Hito 4 — mismo rig articulado que el guardia (`torso`/`head`/brazos con
 * hombreras doradas que giran con el hombro) + bastón de mando dorado en
 * `rightArm`, radio dorsal y botas articuladas.
 */
export function buildOfficerModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'officer';

  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.y = 0.42;
  group.add(torso);

  const chest = toonMesh(new THREE.CapsuleGeometry(0.38, 0.38, 8, 14), GUARD_UNIFORM, 0.016);
  chest.position.y = 0.13;
  torso.add(chest);

  // Peto blindado con filo dorado: la marca del mando.
  const plate = toonMesh(new THREE.BoxGeometry(0.58, 0.42, 0.3), GUARD_UNIFORM_DARK, 0.016);
  plate.position.set(0, 0.2, 0.18);
  plate.rotation.x = -0.14;
  torso.add(plate);
  const plateLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.05, 0.04),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
  );
  plateLine.position.set(0, 0.3, 0.34);
  torso.add(plateLine);

  const belt = toonMesh(new THREE.CylinderGeometry(0.4, 0.4, 0.14, 14), OFFICER_GOLD, 0.014);
  belt.position.y = -0.04;
  torso.add(belt);

  // Radio dorsal con antena dorada.
  const radioPack = toonMesh(new THREE.BoxGeometry(0.34, 0.3, 0.16), GUARD_UNIFORM_DARK, 0.014);
  radioPack.position.set(0, 0.22, -0.32);
  torso.add(radioPack);
  const antenna = toonMesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5), '#94a3b8', 0.01);
  antenna.position.set(0.12, 0.6, -0.34);
  antenna.rotation.z = -0.16;
  torso.add(antenna);
  const antennaTip = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
  );
  antennaTip.position.set(0.16, 0.85, -0.34);
  torso.add(antennaTip);

  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 0.92;
  const skull = toonMesh(new THREE.SphereGeometry(0.5, 18, 14), '#b8c0cc', 0.016);
  head.add(skull);
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.16, 0.18),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
  );
  visor.position.set(0, 0.06, 0.44);
  head.add(visor);
  // Gorra de oficial con visera dorada.
  const cap = toonMesh(
    new THREE.SphereGeometry(0.54, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2.4),
    GUARD_UNIFORM_DARK,
    0.016
  );
  cap.position.y = 0.14;
  head.add(cap);
  const capBrim = toonMesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 14), OFFICER_GOLD, 0.014);
  capBrim.scale.set(1, 1, 1.25);
  capBrim.position.set(0, 0.14, 0.22);
  head.add(capBrim);
  torso.add(head);

  // Brazos con hombreras doradas articuladas y guantes.
  for (const side of [-1, 1]) {
    const arm = buildLimb(
      side > 0 ? 'leftArm' : 'rightArm',
      0.46 * side,
      0.32,
      0.12,
      0.28,
      GUARD_UNIFORM
    );
    const pad = toonMesh(new THREE.SphereGeometry(0.18, 10, 8), OFFICER_GOLD, 0.014);
    pad.position.set(0, 0.12, 0);
    pad.scale.set(1, 0.65, 1);
    arm.add(pad);
    const glove = toonMesh(new THREE.SphereGeometry(0.13, 10, 8), GUARD_UNIFORM_DARK, 0.012);
    glove.position.set(0, -0.36, 0.02);
    glove.scale.set(1, 0.85, 1.1);
    arm.add(glove);
    torso.add(arm);
  }

  // Bastón de mando dorado en la mano derecha con emisor luminoso.
  const rightArm = torso.getObjectByName('rightArm');
  if (rightArm) {
    const baton = new THREE.Group();
    baton.name = 'commandBaton';
    const handle = toonMesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 6), '#18181b', 0.01);
    baton.add(handle);
    const shaft = toonMesh(new THREE.CylinderGeometry(0.028, 0.028, 0.34, 6), OFFICER_GOLD, 0.01);
    shaft.position.y = 0.26;
    baton.add(shaft);
    const tip = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.07, 0),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
    );
    tip.position.y = 0.46;
    baton.add(tip);
    const tipGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 6),
      additiveGlowMaterial(0xfbbf24, 0.5, { depthWrite: false })
    );
    tipGlow.position.y = 0.46;
    baton.add(tipGlow);
    baton.position.set(0, -0.36, 0.08);
    baton.rotation.x = 1.15;
    rightArm.add(baton);
  }

  // Piernas con rodilleras y botas articuladas.
  for (const side of [-1, 1]) {
    const leg = buildLimb(
      side > 0 ? 'leftLeg' : 'rightLeg',
      0.18 * side,
      0.32,
      0.14,
      0.18,
      GUARD_UNIFORM_DARK
    );
    const knee = toonMesh(new THREE.SphereGeometry(0.13, 8, 6), GUARD_UNIFORM_DARK, 0.012);
    knee.position.set(0, -0.17, 0.07);
    knee.scale.set(1, 0.8, 1);
    leg.add(knee);
    const boot = toonMesh(new THREE.BoxGeometry(0.17, 0.1, 0.26), '#18181b', 0.012);
    boot.position.set(0, -0.3, 0.05);
    leg.add(boot);
    group.add(leg);
  }

  return group;
}

/**
 * Dron rápido de reconocimiento: esfera flotante con anillo giroscópico
 * nítido, 4 rotores que giran, ojo rojo escáner, antena y propulsor de
 * plasma cian hacia abajo. Persigue al jugador deslizando sobre la
 * superficie.
 *
 * Hito 4 — `hoverCore` es el pivote del fuselaje completo (cabeceo de caza +
 * alabeo lateral), `gyroRing`/`rotor0..3` giran de forma visible y
 * `thrusterGlow` pulsa: el dron flota VISIBLEMENTE sobre el terreno.
 */
export function buildDroneModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'drone';
  group.add(buildShadowHalo(0.55));

  const core = new THREE.Group();
  core.name = 'hoverCore';
  group.add(core);

  const body = toonMesh(new THREE.SphereGeometry(0.42, 16, 12), '#64748b', 0.016);
  core.add(body);

  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xf87171 })
  );
  eye.position.set(0, -0.02, 0.36);
  core.add(eye);

  // Anillo giroscópico crujiente con nudos luminosos: el giro se lee.
  const gyro = new THREE.Group();
  gyro.name = 'gyroRing';
  const ring = toonMesh(new THREE.TorusGeometry(0.62, 0.07, 8, 24), '#334155', 0.014);
  ring.rotation.x = Math.PI / 2;
  gyro.add(ring);
  const nubGeometry = new THREE.SphereGeometry(0.09, 8, 6);
  const nubMaterial = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const nub = new THREE.Mesh(nubGeometry, nubMaterial);
    nub.position.set(Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62);
    gyro.add(nub);
  }
  core.add(gyro);

  // 4 rotores con aspas cruzadas sobre el anillo (giran a tope).
  const bladeGeometry = new THREE.BoxGeometry(0.34, 0.02, 0.05);
  const bladeMaterial = createToonMaterial('#94a3b8');
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const rotor = new THREE.Group();
    rotor.name = `rotor${i}`;
    rotor.position.set(Math.cos(a) * 0.62, 0.1, Math.sin(a) * 0.62);
    const bladeA = new THREE.Mesh(bladeGeometry, bladeMaterial);
    rotor.add(bladeA);
    const bladeB = new THREE.Mesh(bladeGeometry, bladeMaterial);
    bladeB.rotation.y = Math.PI / 2;
    rotor.add(bladeB);
    const hub = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee })
    );
    rotor.add(hub);
    core.add(rotor);
  }

  const antenna = toonMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), '#94a3b8', 0.012);
  antenna.position.y = 0.55;
  core.add(antenna);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
  );
  beacon.position.y = 0.82;
  core.add(beacon);

  // Propulsor repulsor de plasma cian hacia abajo.
  core.add(buildThrusterGlow(0x22d3ee, 0.3, 0.75));

  return group;
}

/**
 * Torreta antiaérea fija: base acorazada, cúpula giratoria y doble cañón que
 * dispara proyectiles luminosos (parreables con F/Q).
 */
export function buildTurretModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'turret';

  const base = toonMesh(new THREE.CylinderGeometry(0.85, 1.05, 0.6, 12), '#1f2937', 0.016);
  base.position.y = 0.3;
  group.add(base);

  const dome = toonMesh(new THREE.SphereGeometry(0.55, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), '#374151', 0.016);
  dome.position.y = 0.6;
  group.add(dome);

  const barrelGeometry = new THREE.CylinderGeometry(0.09, 0.11, 1.3, 8);
  for (const side of [-1, 1]) {
    const barrel = toonMesh(barrelGeometry, '#4b5563', 0.014);
    barrel.rotation.x = Math.PI / 2 - 0.5;
    barrel.position.set(0.2 * side, 0.95, 0.42);
    group.add(barrel);
    const muzzle = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xfb923c })
    );
    muzzle.position.set(0.2 * side, 1.22, 0.72);
    group.add(muzzle);
  }

  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xf97316 })
  );
  light.position.set(0, 0.72, 0.42);
  group.add(light);

  return group;
}

const BRUTE_RED = '#b91c1c';
const BRUTE_DARK = '#7f1d1d';

/**
 * Brute de élite: guardia pesado rojo con maza eléctrica estilo Kronos.
 * Resiste el melee frontal y solo cae con explosivos, parry o estasis.
 *
 * Hito 4 — rig articulado (`torso`/`head`/brazos con hombreras que giran con
 * el hombro) y maza eléctrica DENTRO de `rightArm`: el windup la arma por
 * encima del hombro y el follow-through la descarga al frente.
 */
export function buildBruteModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'brute';

  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.y = 0.5;
  group.add(torso);

  const chest = toonMesh(new THREE.CapsuleGeometry(0.52, 0.5, 8, 14), BRUTE_RED, 0.018);
  chest.position.y = 0.18;
  chest.scale.set(1.25, 1, 1.15);
  torso.add(chest);

  // Peto blindado pesado con remaches.
  const plate = toonMesh(new THREE.BoxGeometry(0.92, 0.46, 0.5), BRUTE_DARK, 0.018);
  plate.position.set(0, 0.28, 0.2);
  torso.add(plate);
  const rivetGeometry = new THREE.SphereGeometry(0.05, 8, 6);
  const rivetMaterial = createToonMaterial('#f97316');
  for (const side of [-1, 1]) {
    const rivet = new THREE.Mesh(rivetGeometry, rivetMaterial);
    rivet.position.set(0.34 * side, 0.36, 0.46);
    torso.add(rivet);
  }

  const belt = toonMesh(new THREE.CylinderGeometry(0.56, 0.56, 0.18, 14), BRUTE_DARK, 0.016);
  belt.position.y = -0.08;
  torso.add(belt);

  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.02;
  const skull = toonMesh(new THREE.SphereGeometry(0.46, 18, 14), '#9ca3af', 0.018);
  head.add(skull);
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.52, 0.14, 0.16),
    new THREE.MeshBasicMaterial({ color: 0xf97316 })
  );
  visor.position.set(0, 0.04, 0.4);
  head.add(visor);
  // Casco blindado con cresta.
  const helmet = toonMesh(
    new THREE.SphereGeometry(0.5, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    BRUTE_DARK,
    0.018
  );
  helmet.position.y = 0.08;
  head.add(helmet);
  const crest = toonMesh(new THREE.BoxGeometry(0.1, 0.28, 0.5), '#f97316', 0.014);
  crest.position.set(0, 0.42, -0.05);
  head.add(crest);
  torso.add(head);

  // Brazos robustos con hombreras blindadas articuladas.
  for (const side of [-1, 1]) {
    const arm = buildLimb(
      side > 0 ? 'leftArm' : 'rightArm',
      0.62 * side,
      0.42,
      0.16,
      0.34,
      BRUTE_RED
    );
    const pad = toonMesh(new THREE.SphereGeometry(0.22, 10, 8), BRUTE_DARK, 0.016);
    pad.position.set(0, 0.16, 0);
    pad.scale.set(1, 0.65, 1);
    arm.add(pad);
    const glove = toonMesh(new THREE.SphereGeometry(0.17, 10, 8), BRUTE_DARK, 0.014);
    glove.position.set(0, -0.44, 0.03);
    arm.add(glove);
    torso.add(arm);
  }

  // Maza eléctrica en la mano derecha: mango pesado + cabeza con arcos.
  const rightArm = torso.getObjectByName('rightArm');
  if (rightArm) {
    const mace = new THREE.Group();
    mace.name = 'electroMace';
    const handle = toonMesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), '#3f3f46', 0.014);
    handle.position.y = 0.3;
    mace.add(handle);
    const maceHead = toonMesh(new THREE.DodecahedronGeometry(0.26, 0), '#52525b', 0.016);
    maceHead.position.y = 0.95;
    mace.add(maceHead);
    // Arcos eléctricos aditivos sobre la cabeza de la maza.
    const arcMaterial = additiveGlowMaterial(0xf97316, 0.7, { depthWrite: false });
    const arcGeometry = new THREE.TorusGeometry(0.3, 0.035, 6, 14, Math.PI * 1.2);
    for (let i = 0; i < 2; i++) {
      const arc = new THREE.Mesh(arcGeometry, arcMaterial);
      arc.position.y = 0.95;
      arc.rotation.x = Math.PI / 2 + i * 0.8;
      arc.rotation.y = i * 1.9;
      mace.add(arc);
    }
    const maceGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 6),
      additiveGlowMaterial(0xf97316, 0.55, { depthWrite: false })
    );
    maceGlow.position.y = 0.95;
    mace.add(maceGlow);
    mace.position.set(0, -0.5, 0.12);
    mace.rotation.x = 0.35;
    rightArm.add(mace);
  }

  // Piernas tronadoras con rodilleras y botas pesadas.
  for (const side of [-1, 1]) {
    const leg = buildLimb(
      side > 0 ? 'leftLeg' : 'rightLeg',
      0.26 * side,
      0.4,
      0.18,
      0.2,
      BRUTE_DARK
    );
    const knee = toonMesh(new THREE.SphereGeometry(0.16, 8, 6), BRUTE_DARK, 0.014);
    knee.position.set(0, -0.2, 0.08);
    knee.scale.set(1, 0.8, 1);
    leg.add(knee);
    const boot = toonMesh(new THREE.BoxGeometry(0.22, 0.12, 0.32), '#18181b', 0.014);
    boot.position.set(0, -0.34, 0.06);
    leg.add(boot);
    group.add(leg);
  }

  return group;
}

