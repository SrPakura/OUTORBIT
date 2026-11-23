// ============================================================================
// BEAST ENEMIES — fauna salvaje de Verdant
// ============================================================================
// Pantera, mono vigía, gorila y avispa gigante de la Selva Tropical. Extraído de proceduralModels.ts (P8).
// ============================================================================

import * as THREE from 'three';
import { createToonMaterial } from '../toonMaterials';
import {
  additiveGlowMaterial,
  celMesh,
} from '../meshFactory';
import { buildLimb, buildShadowHalo, buildThrusterGlow } from './modelParts';

// ============================================================================
// Enemigos animales salvajes de la Selva Tropical (Verdant · Paso 2).
// Sustituyen temáticamente a guardias/oficiales (pantera), vigías (mono),
// brutes (gorila) y drones (avispa). Cuerpos cel con contornos finos
// (0.015-0.022) y mirando hacia +Z, como el resto de enemigos.
// ============================================================================

const PANTHER_COAT = '#3b2d63'; // púrpura-índigo oscuro
const PANTHER_BELLY = '#5b4a8f';
const PANTHER_SPOT = '#f59e0b'; // manchas doradas

/**
 * Pantera/jaguar de la selva: cuadrúpedo ágil de pelaje púrpura-índigo con
 * manchas doradas, orejas felinas puntiagudas, ojos ámbar brillantes, colmillos
 * y cola curva alzada. Sustituye a guardias y oficiales en Verdant.
 *
 * Hito 4 — rig de cuadrúpedo completo: `torso` (pivote de columna: galope,
 * rebote y agachado de la embestida), `head` (pivote de cuello), `legFL`/
 * `legFR`/`legBL`/`legBR` (pivotes de hombro/cadera EN la articulación) y
 * `tail` (pivote de la base de la cola).
 */
export function buildPantherModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'panther';

  // Pivote de columna en el centro del cuerpo: el galope articula desde aquí.
  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.y = 0.72;
  group.add(torso);

  // Cuerpo cuadrúpedo ágil: cápsula tendida a lo largo del eje Z.
  const body = celMesh(new THREE.CapsuleGeometry(0.33, 0.72, 8, 14), PANTHER_COAT, 0.02);
  body.rotation.x = Math.PI / 2;
  torso.add(body);

  // Pecho y panza más claros.
  const belly = celMesh(new THREE.SphereGeometry(0.26, 12, 10), PANTHER_BELLY, 0.016);
  belly.scale.set(1, 0.7, 1.6);
  belly.position.set(0, -0.14, 0.1);
  torso.add(belly);

  // Manchas doradas deterministas sobre el lomo (sin contorno: detalle fino).
  const spotGeometry = new THREE.SphereGeometry(0.07, 8, 6);
  const spotMaterial = createToonMaterial(PANTHER_SPOT);
  for (let i = 0; i < 9; i++) {
    const spot = new THREE.Mesh(spotGeometry, spotMaterial);
    const ang = (i * 2.4) % (Math.PI * 2);
    spot.position.set(
      Math.sin(ang) * 0.28,
      0.1 + Math.cos(i * 1.7) * 0.14,
      -0.5 + (i % 5) * 0.26
    );
    spot.scale.set(1, 0.55, 1);
    torso.add(spot);
  }

  // Cabeza felina sobre pivote de cuello al frente de la columna.
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 0.28, 0.72);
  torso.add(head);
  const skull = celMesh(new THREE.SphereGeometry(0.3, 16, 12), PANTHER_COAT, 0.018);
  head.add(skull);
  const muzzle = celMesh(new THREE.SphereGeometry(0.16, 12, 10), PANTHER_BELLY, 0.015);
  muzzle.scale.set(1.15, 0.8, 1.0);
  muzzle.position.set(0, -0.1, 0.26);
  head.add(muzzle);
  const earGeometry = new THREE.ConeGeometry(0.1, 0.26, 6);
  for (const side of [-1, 1]) {
    const ear = celMesh(earGeometry, PANTHER_COAT, 0.015);
    ear.position.set(0.19 * side, 0.54, -0.1);
    ear.rotation.z = -0.3 * side;
    head.add(ear);
  }

  // Ojos ámbar brillantes depredadores (afilados, sin contorno).
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
  const eyeGeometry = new THREE.SphereGeometry(0.06, 8, 6);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(0.13 * side, 0.06, 0.23);
    eye.scale.set(1, 0.8, 0.7);
    head.add(eye);
  }

  // Colmillos blancos bajo el hocico.
  const fangGeometry = new THREE.ConeGeometry(0.035, 0.14, 6);
  const fangMaterial = createToonMaterial('#f8fafc');
  for (const side of [-1, 1]) {
    const fang = new THREE.Mesh(fangGeometry, fangMaterial);
    fang.position.set(0.07 * side, -0.2, 0.32);
    fang.rotation.x = Math.PI; // puntas hacia abajo
    head.add(fang);
  }

  // Patas: 4 pivotes de hombro/cadera EN la articulación (a la altura del
  // hombro/cadera), con la cápsula colgando del pivote.
  const legGeometry = new THREE.CapsuleGeometry(0.085, 0.42, 6, 10);
  const legPivots: Array<[string, number, number, number]> = [
    ['legFL', 0.2, -0.1, 0.42],
    ['legFR', -0.2, -0.1, 0.42],
    ['legBL', 0.2, -0.12, -0.42],
    ['legBR', -0.2, -0.12, -0.42],
  ];
  const pawGeometry = new THREE.SphereGeometry(0.09, 8, 6);
  for (const [name, x, y, z] of legPivots) {
    const leg = new THREE.Group();
    leg.name = name;
    leg.position.set(x, y, z);
    const capsule = celMesh(legGeometry, PANTHER_COAT, 0.015);
    capsule.position.y = -0.3;
    leg.add(capsule);
    const paw = celMesh(pawGeometry, PANTHER_BELLY, 0.012);
    paw.position.set(0, -0.56, 0.03);
    leg.add(paw);
    torso.add(leg);
  }

  // Cola curva sobre pivote en la base: cadena de esferas alzándose.
  const tail = new THREE.Group();
  tail.name = 'tail';
  tail.position.set(0, 0.14, -0.72);
  torso.add(tail);
  const tailBalls: Array<[number, number, number, number]> = [
    [0, 0, 0, 0.12],
    [0, 0.12, -0.2, 0.1],
    [0, 0.28, -0.32, 0.08],
    [0, 0.42, -0.38, 0.06],
  ];
  for (const [tx, ty, tz, tr] of tailBalls) {
    const ball = celMesh(new THREE.SphereGeometry(tr, 10, 8), PANTHER_COAT, 0.015);
    ball.position.set(tx, ty, tz);
    tail.add(ball);
  }

  return group;
}

const MONKEY_FUR = '#8b5e3c'; // marrón
const MONKEY_CREAM = '#e8d0a9'; // crema

/**
 * Mono vigía de las ruinas: marrón con hocico y orejas grandes crema, ojos
 * vivos y cola enroscada hacia arriba. Ideal para torres y puestos de
 * vigilancia estacionarios.
 *
 * Hito 4 — rig articulado (`torso`/`head`/brazos/piernas + `tail` en la base
 * de la cola) y garrote de bambú DENTRO de `rightArm`: los vigías alzan el
 * garrote al avisar y lo descargan al golpear.
 */
export function buildMonkeyModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'monkey';

  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.y = 0.42;
  group.add(torso);

  // Cuerpo compacto con pecho crema.
  const body = celMesh(new THREE.CapsuleGeometry(0.26, 0.3, 8, 12), MONKEY_FUR, 0.018);
  body.position.y = 0.1;
  torso.add(body);
  const belly = celMesh(new THREE.SphereGeometry(0.2, 12, 10), MONKEY_CREAM, 0.015);
  belly.scale.set(1, 1.2, 0.6);
  belly.position.set(0, 0.1, 0.16);
  torso.add(belly);

  // Cabeza con hocico claro y orejas grandes (pivote de cuello).
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 0.64;
  torso.add(head);
  const skull = celMesh(new THREE.SphereGeometry(0.32, 16, 12), MONKEY_FUR, 0.018);
  head.add(skull);
  const face = celMesh(new THREE.SphereGeometry(0.22, 12, 10), MONKEY_CREAM, 0.015);
  face.scale.set(1.05, 0.85, 0.7);
  face.position.set(0, -0.06, 0.22);
  head.add(face);
  const earGeometry = new THREE.SphereGeometry(0.13, 10, 8);
  for (const side of [-1, 1]) {
    const ear = celMesh(earGeometry, MONKEY_FUR, 0.015);
    ear.position.set(0.34 * side, 0.06, -0.02);
    ear.scale.set(0.5, 1, 1);
    head.add(ear);
    const inner = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 6),
      createToonMaterial(MONKEY_CREAM)
    );
    inner.position.set(0.36 * side, 0.06, 0.02);
    inner.scale.set(0.4, 0.9, 0.8);
    head.add(inner);
  }

  // Ojos vivos oscuros con brillo.
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x1c1917 });
  const eyeGeometry = new THREE.SphereGeometry(0.055, 8, 6);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(0.11 * side, 0.04, 0.36);
    head.add(eye);
  }

  // Brazos colgantes con manos crema.
  for (const side of [-1, 1]) {
    const arm = buildLimb(
      side > 0 ? 'leftArm' : 'rightArm',
      0.34 * side,
      0.26,
      0.09,
      0.24,
      MONKEY_FUR
    );
    const hand = celMesh(new THREE.SphereGeometry(0.1, 8, 6), MONKEY_CREAM, 0.012);
    hand.position.set(0, -0.32, 0.02);
    arm.add(hand);
    torso.add(arm);
  }

  // Garrote de bambú en la mano derecha.
  const rightArm = torso.getObjectByName('rightArm');
  if (rightArm) {
    const club = new THREE.Group();
    club.name = 'bambooClub';
    const stalk = celMesh(new THREE.CylinderGeometry(0.045, 0.06, 0.72, 6), '#4ade80', 0.014);
    stalk.position.y = 0.3;
    club.add(stalk);
    for (const ry of [0.12, 0.34, 0.56]) {
      const node = celMesh(new THREE.CylinderGeometry(0.065, 0.065, 0.05, 6), '#16a34a', 0.012);
      node.position.y = ry;
      club.add(node);
    }
    const knob = celMesh(new THREE.SphereGeometry(0.09, 8, 6), '#15803d', 0.014);
    knob.position.y = 0.68;
    club.add(knob);
    club.position.set(0, -0.32, 0.08);
    club.rotation.x = 1.05;
    rightArm.add(club);
  }

  // Piernas con pies prensiles (hermanas del torso).
  for (const side of [-1, 1]) {
    const leg = buildLimb(
      side > 0 ? 'leftLeg' : 'rightLeg',
      0.14 * side,
      0.3,
      0.1,
      0.14,
      MONKEY_FUR
    );
    const foot = celMesh(new THREE.SphereGeometry(0.1, 8, 6), MONKEY_CREAM, 0.012);
    foot.position.set(0, -0.26, 0.03);
    leg.add(foot);
    group.add(leg);
  }

  // Cola enroscada hacia arriba sobre pivote en la base.
  const tail = new THREE.Group();
  tail.name = 'tail';
  tail.position.set(0, 0.08, -0.3);
  torso.add(tail);
  const tailBalls: Array<[number, number, number, number]> = [
    [0, 0, 0, 0.09],
    [0, 0.18, -0.12, 0.08],
    [0, 0.38, -0.18, 0.07],
    [0, 0.56, -0.14, 0.06],
    [0, 0.66, -0.02, 0.05],
  ];
  for (const [tx, ty, tz, tr] of tailBalls) {
    const ball = celMesh(new THREE.SphereGeometry(tr, 10, 8), MONKEY_FUR, 0.015);
    ball.position.set(tx, ty, tz);
    tail.add(ball);
  }

  return group;
}

const GORILLA_FUR = '#3f3f46';
const GORILLA_SILVER = '#d4d4d8'; // lomo plateado
const GORILLA_SKIN = '#52525b'; // cara y pecho

/**
 * Gorila lomo plateado gigante: pecho robusto, hombros anchos, puños grandes
 * y musgo verde creciendo sobre los hombros. Sustituye al brute en la selva.
 *
 * Hito 4 — rig articulado: `torso` (pivote de pecho), `head` (cuello) y
 * brazos/piernas con pivotes de hombro/cadera EN la articulación: el bombeo
 * de nudillos del chase rebota con el paso real.
 */
export function buildGorillaModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'gorilla';

  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.y = 0.75;
  group.add(torso);

  // Torso masivo con pecho robusto.
  const body = celMesh(new THREE.CapsuleGeometry(0.52, 0.5, 8, 14), GORILLA_FUR, 0.022);
  body.position.y = 0.1;
  body.scale.set(1.3, 1, 1.1);
  torso.add(body);
  const chest = celMesh(new THREE.SphereGeometry(0.4, 14, 12), GORILLA_SKIN, 0.018);
  chest.scale.set(1.15, 1.1, 0.6);
  chest.position.set(0, 0.15, 0.42);
  torso.add(chest);

  // Lomo plateado (la marca del alfa).
  const silverback = celMesh(new THREE.SphereGeometry(0.46, 14, 12), GORILLA_SILVER, 0.018);
  silverback.scale.set(1.2, 1.05, 0.55);
  silverback.position.set(0, 0.17, -0.42);
  torso.add(silverback);

  // Cabeza con cresta sagital y cara oscura (pivote de cuello).
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 0.87;
  torso.add(head);
  const skull = celMesh(new THREE.SphereGeometry(0.38, 16, 12), GORILLA_FUR, 0.02);
  head.add(skull);
  const crest = celMesh(new THREE.BoxGeometry(0.16, 0.24, 0.5), GORILLA_FUR, 0.016);
  crest.position.set(0, 0.32, -0.02);
  head.add(crest);
  const face = celMesh(new THREE.SphereGeometry(0.26, 12, 10), GORILLA_SKIN, 0.016);
  face.scale.set(1.05, 0.85, 0.7);
  face.position.set(0, -0.06, 0.26);
  head.add(face);
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xf87171 });
  const eyeGeometry = new THREE.SphereGeometry(0.05, 8, 6);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(0.11 * side, 0.02, 0.44);
    head.add(eye);
  }

  // Brazos largos y gruesos con puños de nudillos: pivote EN el hombro,
  // hombrera con musgo que gira con él y puño al final del brazo.
  const armGeometry = new THREE.CapsuleGeometry(0.15, 0.72, 8, 12);
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.name = side > 0 ? 'leftArm' : 'rightArm';
    arm.position.set(0.66 * side, 0.53, 0.12);
    const pad = celMesh(new THREE.SphereGeometry(0.28, 12, 10), GORILLA_FUR, 0.018);
    pad.position.set(0, 0.05, 0);
    pad.scale.set(1, 0.75, 1);
    arm.add(pad);
    const moss = celMesh(new THREE.SphereGeometry(0.2, 10, 8), '#4ade80', 0.015);
    moss.position.set(0, 0.26, 0.02);
    moss.scale.set(1, 0.5, 0.9);
    arm.add(moss);
    const upper = celMesh(armGeometry, GORILLA_FUR, 0.018);
    upper.position.y = -0.51;
    arm.add(upper);
    const fist = celMesh(new THREE.SphereGeometry(0.21, 12, 10), GORILLA_SKIN, 0.016);
    fist.position.set(0.12 * side, -1.06, 0.04);
    arm.add(fist);
    torso.add(arm);
  }

  // Piernas cortas y fuertes con pivote de cadera y pies planos.
  const legGeometry = new THREE.CapsuleGeometry(0.16, 0.3, 8, 12);
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = side > 0 ? 'leftLeg' : 'rightLeg';
    leg.position.set(0.28 * side, 0.28, -0.12);
    const shin = celMesh(legGeometry, GORILLA_FUR, 0.018);
    shin.position.y = -0.16;
    leg.add(shin);
    const foot = celMesh(new THREE.SphereGeometry(0.15, 10, 8), GORILLA_SKIN, 0.014);
    foot.position.set(0, -0.27, 0.05);
    foot.scale.set(1.1, 0.6, 1.3);
    leg.add(foot);
    group.add(leg);
  }

  return group;
}

/**
 * Avispa gigante de la selva: tórax peludo oscuro, abdomen segmentado
 * amarillo/obsidiana con aguijón de plasma brillante, mandíbulas
 * depredadoras y 4 alas facetadas translúcidas que brillan (grupos
 * `wingL`/`wingR`/`wingBL`/`wingBR`). Sustituye al dron en la selva.
 *
 * Hito 4 — `hoverCore` es el pivote del cuerpo completo (cabeceo de caza +
 * alabeo con el giro; el aguijón se hunde al cargar el aguijonazo) y las 4
 * alas son pivotes de raíz independientes para el aleteo en 8.
 */
export function buildWaspModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'wasp';
  group.add(buildShadowHalo(0.6));

  const core = new THREE.Group();
  core.name = 'hoverCore';
  group.add(core);

  // Tórax peludo oscuro.
  const thorax = celMesh(new THREE.SphereGeometry(0.32, 14, 12), '#292524', 0.018);
  thorax.position.set(0, 0.02, 0.22);
  core.add(thorax);

  // Abdomen segmentado amarillo/obsidiana, alzado hacia el aguijón.
  const abdomen = new THREE.Group();
  abdomen.position.set(0, -0.02, -0.28);
  abdomen.rotation.x = 0.22;
  for (let i = 0; i < 4; i++) {
    const seg = celMesh(
      new THREE.CylinderGeometry(0.27 - i * 0.045, 0.3 - i * 0.045, 0.22, 12),
      i % 2 === 0 ? '#facc15' : '#292524',
      0.016
    );
    seg.rotation.x = Math.PI / 2;
    seg.position.z = -i * 0.21;
    abdomen.add(seg);
  }
  // Aguijón de plasma brillante.
  const stinger = celMesh(new THREE.ConeGeometry(0.08, 0.32, 8), '#18181b', 0.014);
  stinger.rotation.x = -Math.PI / 2;
  stinger.position.z = -0.86;
  abdomen.add(stinger);
  const stingerGlow = new THREE.Mesh(
    new THREE.ConeGeometry(0.1, 0.4, 8),
    additiveGlowMaterial(0x22d3ee, 0.55, { depthWrite: false })
  );
  stingerGlow.rotation.x = -Math.PI / 2;
  stingerGlow.position.z = -0.9;
  abdomen.add(stingerGlow);
  core.add(abdomen);

  // Cabeza con ojos compuestos, antenas y mandíbulas depredadoras.
  const head = celMesh(new THREE.SphereGeometry(0.24, 14, 12), '#292524', 0.016);
  head.position.set(0, 0.08, 0.56);
  core.add(head);
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xf87171 });
  const eyeGeometry = new THREE.SphereGeometry(0.1, 10, 8);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(0.12 * side, 0.12, 0.72);
    eye.scale.set(0.8, 1, 0.7);
    core.add(eye);
  }
  const antennaGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.34, 5);
  for (const side of [-1, 1]) {
    const antenna = celMesh(antennaGeometry, '#18181b', 0.012);
    antenna.position.set(0.09 * side, 0.34, 0.6);
    antenna.rotation.z = 0.35 * side;
    antenna.rotation.x = -0.3;
    core.add(antenna);
  }
  const mandibleGeometry = new THREE.ConeGeometry(0.045, 0.22, 6);
  const mandibleMaterial = createToonMaterial('#18181b');
  for (const side of [-1, 1]) {
    const mandible = celMesh(mandibleGeometry, '#18181b', 0.012);
    mandible.position.set(0.09 * side, -0.02, 0.78);
    mandible.rotation.x = Math.PI / 2 + 0.25;
    mandible.rotation.z = -0.4 * side;
    core.add(mandible);
    const mandibleTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 6, 5),
      mandibleMaterial
    );
    mandibleTip.position.set(0.14 * side, -0.06, 0.86);
    core.add(mandibleTip);
  }

  // 4 alas facetadas translúcidas y brillantes: pivotes de raíz independientes
  // (par delantero largo + par trasero corto) para el aleteo en 8.
  const wingMaterial = new THREE.MeshBasicMaterial({
    color: 0x67e8f9,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const wingVeinMaterial = additiveGlowMaterial(0x22d3ee, 0.7, { depthWrite: false });
  const wingDefs: Array<[string, number, number, number, number]> = [
    // [nombre, lado, z de raíz, largo, ancho]
    ['wingL', -1, 0.18, 0.85, 0.3],
    ['wingR', 1, 0.18, 0.85, 0.3],
    ['wingBL', -1, -0.08, 0.62, 0.26],
    ['wingBR', 1, -0.08, 0.62, 0.26],
  ];
  for (const [name, side, zRoot, len, width] of wingDefs) {
    const wing = new THREE.Group();
    wing.name = name;
    wing.position.set(0.16 * side, 0.26, zRoot);
    // Ala facetada: esfera low-poly achatada (facetas nítidas al girar).
    const blade = new THREE.Mesh(new THREE.SphereGeometry(1, 4, 2), wingMaterial);
    blade.scale.set(len, 0.035, width);
    blade.position.set(side * len * 0.55, 0.06, 0);
    wing.add(blade);
    // Vena luminosa que atraviesa el ala (brillo aditivo).
    const vein = new THREE.Mesh(
      new THREE.BoxGeometry(len * 1.1, 0.015, 0.03),
      wingVeinMaterial
    );
    vein.position.set(side * len * 0.55, 0.07, 0);
    wing.add(vein);
    core.add(wing);
  }

  // Propulsor antigravitatorio sutil hacia abajo (la avispa flota visible).
  core.add(buildThrusterGlow(0x22d3ee, 0.22, 0.55));

  return group;
}

