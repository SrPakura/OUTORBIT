// ============================================================================
// CYBER ENEMIES — Neon Bastion (Metrópolis Cyberpunk)
// ============================================================================
// Ciber-guardia (con variante oficial), ciber-dron y ciber-mecha. Extraído de proceduralModels.ts (P8).
// ============================================================================

import * as THREE from 'three';
import { createToonMaterial } from '../toonMaterials';
import {
  additiveGlowMaterial,
  celMesh,
} from '../meshFactory';
import { buildLimb, buildShadowHalo, buildThrusterGlow } from './modelParts';

// ============================================================================
// Metrópolis Cyberpunk (Neon Bastion · Planeta 3): guardias cibernéticos,
// drones de vigilancia y mechas pesados. Sustituyen temáticamente a
// guardias/oficiales (soldado cyber), drones (dron angular) y brutes
// (exoesqueleto mecha). Cuerpos cel con contornos finos y mirando hacia +Z,
// como el resto de enemigos.
// ============================================================================

const CYBER_ARMOR = '#1e1b4b'; // armadura índigo oscura
const CYBER_DARK = '#0f0f1e'; // negro azulado del casco/peto
const CYBER_STEEL = '#3f3f46';

/**
 * Soldado cyberpunk de Neon Bastion: armadura negra/índigo con líneas
 * luminosas cian neón, visor horizontal brillante y rifle energético. Con
 * `isOfficer` (Oficial del Ala Corporativa) las líneas pasan a magenta
 * brillante y añade antena dorsal y hombreras holográficas: es él quien
 * porta la Tarjeta Maestra.
 */
export function buildCyberGuardModel(isOfficer = false): THREE.Group {
  const group = new THREE.Group();
  group.name = 'cyberGuard';
  const lineHex = isOfficer ? 0xe879f9 : 0x22d3ee;
  const lineMaterial = new THREE.MeshBasicMaterial({ color: lineHex });

  // Hito 4: pivote del torso EN la cadera.
  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.y = 0.42;
  group.add(torso);

  // Torso de armadura índigo.
  const body = celMesh(new THREE.CapsuleGeometry(0.36, 0.36, 8, 14), CYBER_ARMOR, 0.016);
  body.position.y = 0.13;
  torso.add(body);

  // Peto angular oscuro con línea de neón vertical sobre el pecho.
  const chest = celMesh(new THREE.BoxGeometry(0.62, 0.5, 0.42), CYBER_DARK, 0.016);
  chest.position.set(0, 0.2, 0.14);
  torso.add(chest);
  const chestLine = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.4, 0.05), lineMaterial);
  chestLine.position.set(0, 0.2, 0.37);
  torso.add(chestLine);

  // Cinturón táctico con hebilla luminosa.
  const belt = celMesh(new THREE.CylinderGeometry(0.38, 0.38, 0.14, 14), CYBER_DARK, 0.014);
  belt.position.y = -0.04;
  torso.add(belt);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.06), lineMaterial);
  buckle.position.set(0, -0.04, 0.38);
  torso.add(buckle);

  // Cabeza: casco oscuro con visor horizontal de neón.
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 0.92;
  const skull = celMesh(new THREE.SphereGeometry(0.5, 18, 14), CYBER_DARK, 0.016);
  head.add(skull);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.14, 0.16), lineMaterial);
  visor.position.set(0, 0.05, 0.44);
  head.add(visor);
  const helmet = celMesh(
    new THREE.SphereGeometry(0.54, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    CYBER_ARMOR,
    0.016
  );
  helmet.position.y = 0.1;
  head.add(helmet);
  // Cristal de comunicación sobre la sien.
  const earJack = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.1), lineMaterial);
  earJack.position.set(0.5, 0.05, 0);
  head.add(earJack);
  if (isOfficer) {
    // Antena dorsal del oficial con punta magenta brillante.
    const antenna = celMesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.55, 6),
      '#94a3b8',
      0.012
    );
    antenna.position.set(0.24, 0.6, -0.08);
    antenna.rotation.z = -0.18;
    head.add(antenna);
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xe879f9 })
    );
    tip.position.set(0.29, 0.88, -0.08);
    head.add(tip);
  }
  torso.add(head);

  // Brazos de armadura con hombreras articuladas; el oficial añade placas
  // holográficas magenta que giran con el hombro.
  for (const side of [-1, 1]) {
    const arm = buildLimb(
      side > 0 ? 'leftArm' : 'rightArm',
      0.46 * side,
      0.32,
      0.12,
      0.28,
      CYBER_ARMOR
    );
    const pad = celMesh(new THREE.SphereGeometry(0.17, 10, 8), CYBER_DARK, 0.014);
    pad.position.set(0, 0.12, 0);
    pad.scale.set(1, 0.7, 1);
    arm.add(pad);
    if (isOfficer) {
      const holo = new THREE.Mesh(
        new THREE.BoxGeometry(0.36, 0.13, 0.32),
        additiveGlowMaterial(0xe879f9, 0.5, { depthWrite: false })
      );
      holo.position.set(0, 0.3, 0);
      arm.add(holo);
    }
    torso.add(arm);
  }

  // Piernas de armadura con botas oscuras (hermanas del torso).
  for (const side of [-1, 1]) {
    const leg = buildLimb(
      side > 0 ? 'leftLeg' : 'rightLeg',
      0.18 * side,
      0.32,
      0.14,
      0.18,
      CYBER_DARK
    );
    const boot = celMesh(new THREE.BoxGeometry(0.18, 0.1, 0.26), '#18181b', 0.012);
    boot.position.set(0, -0.3, 0.05);
    leg.add(boot);
    group.add(leg);
  }

  // Líneas de neón en las espinillas (detalle sin contorno).
  const shinGeometry = new THREE.BoxGeometry(0.05, 0.22, 0.04);
  for (const legName of ['leftLeg', 'rightLeg']) {
    const leg = group.getObjectByName(legName);
    if (!leg) continue;
    const shin = new THREE.Mesh(shinGeometry, lineMaterial);
    shin.position.set(0, -0.3, 0.1);
    leg.add(shin);
  }

  // Arma energética: rifle de pulso (guardia) o bastón de mando (oficial).
  const rightArm = torso.getObjectByName('rightArm');
  if (rightArm) {
    const weapon = new THREE.Group();
    weapon.name = 'energyWeapon';
    if (isOfficer) {
      // Bastón de mando: mástil oscuro con emisor magenta en la punta.
      const shaft = celMesh(new THREE.CylinderGeometry(0.035, 0.035, 1.15, 6), CYBER_STEEL, 0.012);
      weapon.add(shaft);
      const emitter = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.11, 0),
        new THREE.MeshBasicMaterial({ color: 0xe879f9 })
      );
      emitter.position.y = 0.62;
      weapon.add(emitter);
      const gripRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.07, 0.02, 8, 14),
        new THREE.MeshBasicMaterial({ color: 0xe879f9 })
      );
      gripRing.rotation.x = Math.PI / 2;
      gripRing.position.y = 0.1;
      weapon.add(gripRing);
      weapon.position.set(0, -0.3, 0.12);
      weapon.rotation.x = -0.15;
    } else {
      // Rifle de pulso: culata oscura, celda cian y cañón con boquilla.
      const body = celMesh(new THREE.BoxGeometry(0.09, 0.1, 0.8), CYBER_STEEL, 0.012);
      weapon.add(body);
      const cell = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.06, 0.18), lineMaterial);
      cell.position.set(0, 0.09, -0.08);
      weapon.add(cell);
      const muzzle = celMesh(
        new THREE.CylinderGeometry(0.045, 0.055, 0.16, 8),
        '#18181b',
        0.012
      );
      muzzle.rotation.x = Math.PI / 2;
      muzzle.position.z = 0.46;
      weapon.add(muzzle);
      const muzzleGlow = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 6),
        lineMaterial
      );
      muzzleGlow.position.z = 0.55;
      weapon.add(muzzleGlow);
      weapon.position.set(0, -0.34, 0.16);
      weapon.rotation.x = 0.08;
    }
    rightArm.add(weapon);
  }

  // Oficial del Ala Corporativa: penacho holográfico de mando y mini-dron
  // orbital flotando junto al hombro.
  if (isOfficer) {
    const bannerPivot = new THREE.Group();
    bannerPivot.name = 'banner';
    bannerPivot.position.set(0, 0.1, -0.34);
    const pole = celMesh(new THREE.CylinderGeometry(0.022, 0.022, 1.5, 5), CYBER_STEEL, 0.01);
    pole.position.y = 0.75;
    bannerPivot.add(pole);
    const pennant = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.3, 0.02),
      additiveGlowMaterial(0xe879f9, 0.75, { depthWrite: false })
    );
    pennant.position.set(0.12, 1.28, 0);
    bannerPivot.add(pennant);
    torso.add(bannerPivot);

    // Mini-dron orbital: cuerpo esférico, ojo escáner y anillo luminoso.
    const pod = new THREE.Group();
    pod.name = 'hoverPod';
    pod.position.set(0.62, 0.93, -0.06);
    const podBody = celMesh(new THREE.SphereGeometry(0.14, 10, 8), CYBER_DARK, 0.012);
    pod.add(podBody);
    const podEye = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xe879f9 })
    );
    podEye.position.set(0, 0, 0.12);
    pod.add(podEye);
    const podRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.19, 0.02, 6, 16),
      additiveGlowMaterial(0xe879f9, 0.7, { depthWrite: false })
    );
    podRing.rotation.x = Math.PI / 2;
    pod.add(podRing);
    torso.add(pod);
  }

  return group;
}

/**
 * Dron de vigilancia de Neon Bastion: fuselaje angular oscuro con núcleo
 * rojo escáner al frente y 4 rotores/anillos luminosos cian en las esquinas,
 * unidos por brazos de carbono. Sustituye al dron uniformado.
 */
export function buildCyberDroneModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'cyberDrone';
  group.add(buildShadowHalo(0.6));

  // Hito 4: núcleo de flotación; todo el fuselaje se inclina/banca con él.
  const core = new THREE.Group();
  core.name = 'hoverCore';
  group.add(core);

  // Fuselaje angular: octaedro achatado y alargado hacia el frente.
  const body = celMesh(new THREE.OctahedronGeometry(0.5, 0), '#1f2937', 0.016);
  body.scale.set(1.1, 0.68, 1.35);
  core.add(body);

  // Núcleo rojo escáner con anillo, mirando al frente (+Z).
  const scanner = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xef4444 })
  );
  scanner.position.set(0, 0, 0.42);
  core.add(scanner);
  const scannerRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.035, 8, 18),
    new THREE.MeshBasicMaterial({ color: 0xef4444 })
  );
  scannerRing.position.set(0, 0, 0.47);
  core.add(scannerRing);

  // Anillo giroscópico que rodea el fuselaje: el giro se lee de lejos.
  const gyro = new THREE.Group();
  gyro.name = 'gyroRing';
  const gyroRing = celMesh(new THREE.TorusGeometry(0.78, 0.05, 8, 24), '#334155', 0.014);
  gyroRing.rotation.x = Math.PI / 2;
  gyro.add(gyroRing);
  const gyroNubGeometry = new THREE.SphereGeometry(0.07, 8, 6);
  const gyroNubMaterial = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const nub = new THREE.Mesh(gyroNubGeometry, gyroNubMaterial);
    nub.position.set(Math.cos(a) * 0.78, 0, Math.sin(a) * 0.78);
    gyro.add(nub);
  }
  core.add(gyro);

  // 4 rotores en las esquinas: anillo cian + aspas cruzadas girando.
  const rotorGeometry = new THREE.TorusGeometry(0.22, 0.045, 8, 20);
  const rotorMaterial = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
  const bladeGeometry = new THREE.BoxGeometry(0.3, 0.02, 0.05);
  const bladeMaterial = createToonMaterial('#94a3b8');
  const armGeometry = new THREE.BoxGeometry(0.34, 0.05, 0.05);
  let rotorIndex = 0;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const arm = celMesh(armGeometry, '#374151', 0.012);
      arm.position.set(sx * 0.3, 0.12, sz * 0.3);
      arm.rotation.y = Math.atan2(-sz, sx);
      core.add(arm);
      const rotor = new THREE.Group();
      rotor.name = `rotor${rotorIndex++}`;
      rotor.position.set(sx * 0.48, 0.16, sz * 0.48);
      const ring = new THREE.Mesh(rotorGeometry, rotorMaterial);
      ring.rotation.x = Math.PI / 2;
      rotor.add(ring);
      const bladeA = new THREE.Mesh(bladeGeometry, bladeMaterial);
      rotor.add(bladeA);
      const bladeB = new THREE.Mesh(bladeGeometry, bladeMaterial);
      bladeB.rotation.y = Math.PI / 2;
      rotor.add(bladeB);
      core.add(rotor);
    }
  }

  // Antena dorsal con baliza ámbar.
  const antenna = celMesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 6), '#94a3b8', 0.012);
  antenna.position.y = 0.5;
  core.add(antenna);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
  );
  beacon.position.y = 0.72;
  core.add(beacon);

  // Propulsor repulsor de plasma ámbar hacia abajo.
  core.add(buildThrusterGlow(0xfbbf24, 0.28, 0.7));

  return group;
}

/**
 * Mech exoesqueleto pesado de Neon Bastion: chasis angular gris oscuro,
 * visor rojo brillante, reactor pectoral cian y brazo cañón pesado. Sustituye
 * al brute en la Ciudadela de Reactores (solo cae con explosivos, parry o
 * estasis, igual que el brute uniformado).
 */
export function buildCyberMechModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'cyberMech';
  const MECH_FRAME = '#374151';
  const MECH_DARK = '#1f2937';

  // Pelvis y cintura articulada (queda en la raíz: las piernas no se inclinan).
  const pelvis = celMesh(new THREE.BoxGeometry(0.6, 0.3, 0.45), MECH_DARK, 0.016);
  pelvis.position.y = 0.62;
  group.add(pelvis);

  // Hito 4: pivote del torso EN la cintura; cabeza/brazos/propulsores giran con él.
  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.y = 0.85;
  group.add(torso);

  // Chasis angular: torso caja masiva con placas.
  const chassis = celMesh(new THREE.BoxGeometry(0.95, 0.8, 0.6), MECH_FRAME, 0.02);
  chassis.position.y = 0.3;
  torso.add(chassis);
  // Placa pectoral con reactor cian brillante.
  const chest = celMesh(new THREE.BoxGeometry(0.7, 0.55, 0.2), MECH_DARK, 0.018);
  chest.position.set(0, 0.35, 0.36);
  torso.add(chest);
  const reactor = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0x22d3ee })
  );
  reactor.position.set(0, 0.37, 0.5);
  torso.add(reactor);
  const reactorRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.21, 0.04, 8, 18),
    new THREE.MeshBasicMaterial({ color: 0x22d3ee })
  );
  reactorRing.position.set(0, 0.37, 0.52);
  torso.add(reactorRing);
  // Rejillas de ventilación traseras con brillo cian.
  for (const dy of [-0.15, 0.05, 0.25]) {
    const vent = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.06, 0.05),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee })
    );
    vent.position.set(0, 0.35 + dy, -0.34);
    torso.add(vent);
  }

  // Cabeza pequeña con visor rojo brillante y cuernos de sensor.
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 0.93;
  const skull = celMesh(new THREE.BoxGeometry(0.4, 0.3, 0.38), MECH_DARK, 0.016);
  head.add(skull);
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.09, 0.06),
    new THREE.MeshBasicMaterial({ color: 0xef4444 })
  );
  visor.position.set(0, 0.02, 0.21);
  head.add(visor);
  const sensorGeometry = new THREE.ConeGeometry(0.05, 0.22, 5);
  for (const side of [-1, 1]) {
    const sensor = celMesh(sensorGeometry, MECH_FRAME, 0.012);
    sensor.position.set(0.2 * side, 0.24, 0);
    sensor.rotation.z = 0.3 * side;
    head.add(sensor);
  }
  torso.add(head);

  // Hombreras angulares voladizas ancladas al hombro.
  for (const side of [-1, 1]) {
    const pad = celMesh(new THREE.BoxGeometry(0.44, 0.2, 0.52), MECH_DARK, 0.018);
    pad.position.set(0.64 * side, 0.77, 0);
    pad.rotation.z = 0.1 * side;
    torso.add(pad);
  }

  // Brazo izquierdo con puño apoyado: pivote EN el hombro.
  const leftArm = new THREE.Group();
  leftArm.name = 'leftArm';
  leftArm.position.set(-0.66, 0.6, 0.04);
  const leftArmBox = celMesh(new THREE.BoxGeometry(0.26, 0.66, 0.26), MECH_FRAME, 0.018);
  leftArmBox.position.y = -0.33;
  leftArm.add(leftArmBox);
  const fist = celMesh(new THREE.SphereGeometry(0.17, 10, 8), MECH_DARK, 0.016);
  fist.position.set(0, -0.73, 0.04);
  leftArm.add(fist);
  torso.add(leftArm);

  // Brazo derecho: cañón pesado con boquilla roja y líneas de energía.
  const rightArm = new THREE.Group();
  rightArm.name = 'rightArm';
  rightArm.position.set(0.66, 0.6, 0);
  const shoulder = celMesh(new THREE.BoxGeometry(0.32, 0.36, 0.36), MECH_FRAME, 0.018);
  shoulder.position.y = -0.03;
  rightArm.add(shoulder);
  const barrel = celMesh(
    new THREE.CylinderGeometry(0.13, 0.16, 0.95, 10),
    MECH_DARK,
    0.018
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, -0.37, 0.5);
  rightArm.add(barrel);
  const barrelBand = celMesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.12, 10),
    MECH_FRAME,
    0.014
  );
  barrelBand.rotation.x = Math.PI / 2;
  barrelBand.position.set(0, -0.37, 0.32);
  rightArm.add(barrelBand);
  const muzzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.17, 0.1, 10),
    new THREE.MeshBasicMaterial({ color: 0xef4444 })
  );
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0, -0.37, 0.99);
  rightArm.add(muzzle);
  const energyLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.05, 0.6),
    new THREE.MeshBasicMaterial({ color: 0xef4444 })
  );
  energyLine.position.set(0, -0.17, 0.35);
  rightArm.add(energyLine);
  torso.add(rightArm);

  // Propulsores dorsales gemelos con brillo cian (siguen el torso).
  for (const side of [-1, 1]) {
    const thruster = celMesh(
      new THREE.CylinderGeometry(0.1, 0.13, 0.5, 8),
      MECH_DARK,
      0.014
    );
    thruster.position.set(0.3 * side, 0.4, -0.42);
    thruster.rotation.x = 0.35;
    torso.add(thruster);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee })
    );
    glow.position.set(0.3 * side, 0.17, -0.52);
    torso.add(glow);
  }

  // Piernas gruesas articuladas con pies pesados: pivotes EN la cadera.
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = side > 0 ? 'leftLeg' : 'rightLeg';
    leg.position.set(0.3 * side, 0.62, 0);
    const thigh = celMesh(new THREE.BoxGeometry(0.3, 0.42, 0.32), MECH_FRAME, 0.018);
    thigh.position.y = -0.2;
    leg.add(thigh);
    const shin = celMesh(new THREE.BoxGeometry(0.24, 0.34, 0.28), MECH_DARK, 0.016);
    shin.position.set(0, -0.5, 0.02);
    leg.add(shin);
    const foot = celMesh(new THREE.BoxGeometry(0.32, 0.14, 0.44), MECH_FRAME, 0.016);
    foot.position.set(0, -0.55, 0.08);
    leg.add(foot);
    group.add(leg);
  }

  // Escala de mecha pesado: imponente frente a los cyber guardias.
  group.scale.setScalar(1.2);

  return group;
}
