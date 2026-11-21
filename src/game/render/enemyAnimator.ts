import * as THREE from 'three';
import type { EnemyKind, EnemySkin } from '../types';

// ============================================================================
// HITO 4 — Animador procedural articulado de enemigos (CERO allocations).
//
// Los modelos de `proceduralModels.ts` exponen pivotes nombrados EN la
// articulación anatómica (cadera/hombro/cuello/base de la cola). Este módulo:
// - Cachea las referencias UNA VEZ al hacer spawn (`collectEnemyRig`): jamás
//   hay búsquedas por nombre dentro del bucle de render.
// - Anima cada frame con `animateEnemyRig`: SOLO matemática pura (sin `new`,
//   sin closures, sin literales de objeto/array) escribiendo rotaciones y
//   posiciones locales sobre las referencias cacheadas.
// ============================================================================

// --- Estados de la IA intra-planeta (fuente única de verdad) --------------
export const GUARD_STATE_PATROL = 0;
export const GUARD_STATE_CHASE = 1;
export const GUARD_STATE_WINDUP = 2;
export const GUARD_STATE_KO = 3;
export const GUARD_STATE_SEARCH = 4;
/** HITO 1 — Modo aviso: se detiene, encara al jugador y le da una oportunidad. */
export const GUARD_STATE_WARNING = 5;

// --- Estados del jefe KRONOS -----------------------------------------------
export const KRONOS_STATE_CHASE = 0;
export const KRONOS_STATE_WINDUP = 1;
export const KRONOS_STATE_STUNNED = 2;

// ============================================================================
// Rig cacheado del enemigo
// ============================================================================

/**
 * Referencias directas a los pivotes nombrados del modelo de un enemigo.
 * Se rellena UNA vez con `collectEnemyRig` al hacer spawn: el animador por
 * frame no hace ninguna búsqueda por cadena.
 */
export interface EnemyRigRefs {
  /** Pivote de cadera/pecho: inclinación de sprint y torsión del windup. */
  torso: THREE.Object3D | null;
  /** Pivote de cuello: mirada curiosa/alerta/barrido de búsqueda. */
  head: THREE.Object3D | null;
  leftArm: THREE.Object3D | null;
  rightArm: THREE.Object3D | null;
  leftLeg: THREE.Object3D | null;
  rightLeg: THREE.Object3D | null;
  /** Cuadrúpedo (pantera): pivotes de hombro/cadera de las 4 patas. */
  legFL: THREE.Object3D | null;
  legFR: THREE.Object3D | null;
  legBL: THREE.Object3D | null;
  legBR: THREE.Object3D | null;
  /** Base de la cola (pantera, mono). */
  tail: THREE.Object3D | null;
  /** Estandarte sashimono/península (samurái capitán, ciber-oficial). */
  banner: THREE.Object3D | null;
  /** Alas de la avispa en orden [wingL, wingR, wingBL, wingBR]. */
  wings: THREE.Object3D[];
  /** Rotores del dron en orden [rotor0..rotor3]. */
  rotors: THREE.Object3D[];
  /** Anillo giroscópico del dron (gira de forma visible). */
  gyroRing: THREE.Object3D | null;
  /** Cono de propulsión antigravitatoria hacia abajo. */
  thrusterGlow: THREE.Object3D | null;
  /** Pivote del fuselaje completo: cabeceo de caza + alabeo lateral. */
  hoverCore: THREE.Object3D | null;
  /** Mini-dron orbital junto al hombro del ciber-oficial. */
  hoverPod: THREE.Object3D | null;
  /** Y de reposo del pivote del torso (el agachado del aviso/embestida). */
  torsoBaseY: number;
  /** Posición de reposo del pod orbital (la órbita parte de ella). */
  hoverPodBaseX: number;
  hoverPodBaseY: number;
  hoverPodBaseZ: number;
}

/** Rig vacío para inicializar buffers preasignados (una sola vez). */
export function createEmptyEnemyRig(): EnemyRigRefs {
  return {
    torso: null,
    head: null,
    leftArm: null,
    rightArm: null,
    leftLeg: null,
    rightLeg: null,
    legFL: null,
    legFR: null,
    legBL: null,
    legBR: null,
    tail: null,
    banner: null,
    wings: [],
    rotors: [],
    gyroRing: null,
    thrusterGlow: null,
    hoverCore: null,
    hoverPod: null,
    torsoBaseY: 0,
    hoverPodBaseX: 0,
    hoverPodBaseY: 0,
    hoverPodBaseZ: 0,
  };
}

/**
 * Cachea los pivotes nombrados del modelo de un enemigo. SOLO al hacer spawn:
 * aquí se permiten las búsquedas por nombre (jamás dentro del bucle).
 */
export function collectEnemyRig(root: THREE.Group): EnemyRigRefs {
  const torso = root.getObjectByName('torso') ?? null;
  const hoverPod = root.getObjectByName('hoverPod') ?? null;
  const wings: THREE.Object3D[] = [];
  const wingNames = ['wingL', 'wingR', 'wingBL', 'wingBR'];
  for (let i = 0; i < wingNames.length; i++) {
    const wing = root.getObjectByName(wingNames[i]);
    if (wing) wings.push(wing);
  }
  const rotors: THREE.Object3D[] = [];
  for (let i = 0; i < 4; i++) {
    const rotor = root.getObjectByName(`rotor${i}`);
    if (rotor) rotors.push(rotor);
  }
  return {
    torso,
    head: root.getObjectByName('head') ?? null,
    leftArm: root.getObjectByName('leftArm') ?? null,
    rightArm: root.getObjectByName('rightArm') ?? null,
    leftLeg: root.getObjectByName('leftLeg') ?? null,
    rightLeg: root.getObjectByName('rightLeg') ?? null,
    legFL: root.getObjectByName('legFL') ?? null,
    legFR: root.getObjectByName('legFR') ?? null,
    legBL: root.getObjectByName('legBL') ?? null,
    legBR: root.getObjectByName('legBR') ?? null,
    tail: root.getObjectByName('tail') ?? null,
    banner: root.getObjectByName('banner') ?? null,
    wings,
    rotors,
    gyroRing: root.getObjectByName('gyroRing') ?? null,
    thrusterGlow: root.getObjectByName('thrusterGlow') ?? null,
    hoverCore: root.getObjectByName('hoverCore') ?? null,
    hoverPod,
    torsoBaseY: torso ? torso.position.y : 0,
    hoverPodBaseX: hoverPod ? hoverPod.position.x : 0,
    hoverPodBaseY: hoverPod ? hoverPod.position.y : 0,
    hoverPodBaseZ: hoverPod ? hoverPod.position.z : 0,
  };
}

// ============================================================================
// Animación por frame (matemática pura, CERO allocations)
// ============================================================================

/** Parámetros por frame del animador de enemigos (objeto reutilizado). */
export interface EnemyAnimParams {
  rig: EnemyRigRefs;
  kind: EnemyKind;
  skin: EnemySkin;
  /** GUARD_STATE_PATROL/CHASE/WINDUP/KO/SEARCH/WARNING. */
  state: number;
  stationaryLookout: boolean;
  walkPhase: number;
  hoverPhase: number;
  /** 0..1 durante el windup (0 = empieza a cargar, 1 = a punto de golpear). */
  windupProgress: number;
  /** 1 -> 0 justo tras completar el golpe (follow-through visible). */
  strikeDecay: number;
  /** 0..1 velocidad real normalizada (0 = plantado, sin moonwalk). */
  speedRatio: number;
  /** Alabeo suavizado (rad) para el banking de drones/avispas. */
  turnRate: number;
  clock: number;
  dt: number;
  enemyMesh: THREE.Object3D;
}

const WING_NAMES_ORDER = 4;

/**
 * Anima el rig completo de un enemigo según su familia:
 * - Cuadrúpedos (pantera): galope/trote a 4 tiempos, lomo que rebota,
 *   agachado de aviso/embestida y cola que ondea.
 * - Bípedos (guardia, oficial, brute, samurái, oni, mono, gorila, ciber):
 *   respiración, mirada curiosa, balanceo de armas, postura ¡ALTO! del modo
 *   aviso, sprint inclinado, bombeo de extremidades, windup que arma el
 *   brazo por encima y follow-through del golpe.
 * - Voladores (dron, ciber-dron, avispa): rotores giroscópicos, cabeceo
 *   proporcional a la velocidad de caza, alabeo lateral con el giro,
 *   propulsor que pulsa y aleteo en 8 de la avispa.
 */
export function animateEnemyRig(p: EnemyAnimParams): void {
  if (p.kind === 'turret') return;
  if (p.kind === 'drone') {
    animateFlyerRig(p);
    return;
  }
  if (p.skin === 'panther') {
    animateQuadrupedRig(p);
    return;
  }
  animateBipedRig(p);
}

// ----------------------------------------------------------------------------
// Voladores: dron, ciber-dron y avispa (skin del dron)
// ----------------------------------------------------------------------------

function animateFlyerRig(p: EnemyAnimParams): void {
  const rig = p.rig;
  const ko = p.state === GUARD_STATE_KO;
  const core = rig.hoverCore ?? p.enemyMesh;

  // Rotores y anillo giroscópico: giro continuo y crujiente; PARAN limpio en K.O.
  if (!ko) {
    for (let i = 0; i < rig.rotors.length; i++) {
      rig.rotors[i].rotation.y += p.dt * (i % 2 === 0 ? 34 : -30);
    }
    if (rig.gyroRing) rig.gyroRing.rotation.y += p.dt * 2.6;
  }

  // Cabeceo proporcional a la velocidad de caza + alabeo lateral con el giro.
  // La avispa además hunde el aguijón al cargar el aguijonazo.
  let pitch = -0.42 * p.speedRatio;
  if (p.state === GUARD_STATE_WINDUP) {
    pitch += p.skin === 'wasp' ? 0.55 * p.windupProgress : -0.18 * p.windupProgress;
  }
  if (ko) pitch = 0;
  core.rotation.x += (pitch - core.rotation.x) * Math.min(1, p.dt * 6);
  const bank = ko ? 0 : THREE.MathUtils.clamp(p.turnRate, -0.55, 0.55);
  core.rotation.z += (bank - core.rotation.z) * Math.min(1, p.dt * 5);

  // Propulsor antigravitatorio: pulsa más vivo al perseguir/cargar.
  if (rig.thrusterGlow) {
    rig.thrusterGlow.visible = !ko;
    if (!ko) {
      const hot = p.state === GUARD_STATE_CHASE || p.state === GUARD_STATE_WINDUP;
      const pulse =
        (hot ? 1.32 : 1) * (1 + Math.sin(p.clock * (hot ? 18 : 9)) * 0.16);
      rig.thrusterGlow.scale.set(pulse, hot ? 1.3 : 1, pulse);
    }
  }

  // Avispa: aleteo rápido en 8 de las 4 alas (±0.52 rad), pares desfasados.
  if (rig.wings.length > 0) {
    if (ko) {
      // Aleteo congelado al caer: las alas quedan caídas.
      for (let i = 0; i < rig.wings.length; i++) {
        rig.wings[i].rotation.z *= Math.max(0, 1 - p.dt * 6);
      }
    } else {
      const flap = Math.sin(p.clock * 38) * 0.52;
      const flapBack = Math.sin(p.clock * 38 + 1.15) * 0.52;
      const figureEight = Math.sin(p.clock * 19) * 0.14;
      for (let i = 0; i < rig.wings.length && i < WING_NAMES_ORDER; i++) {
        const side = i % 2 === 0 ? -1 : 1; // wingL, wingR, wingBL, wingBR
        const back = i >= 2;
        rig.wings[i].rotation.z = side * (back ? flapBack * 0.85 : flap);
        rig.wings[i].rotation.x = figureEight * (back ? -1 : 1);
      }
    }
  }
}

// ----------------------------------------------------------------------------
// Cuadrúpedos: pantera
// ----------------------------------------------------------------------------

function animateQuadrupedRig(p: EnemyAnimParams): void {
  const rig = p.rig;
  const ko = p.state === GUARD_STATE_KO;

  // Galope/trote a 4 tiempos: pata delantera-izquierda + trasera-derecha
  // emparejadas contra delantera-derecha + trasera-izquierda.
  const gallop = Math.sin(p.walkPhase);
  const amp = 0.85 * p.speedRatio;
  const fl = rig.legFL;
  const fr = rig.legFR;
  const bl = rig.legBL;
  const br = rig.legBR;
  if (fl) fl.rotation.x += (gallop * amp - fl.rotation.x) * Math.min(1, p.dt * 14);
  if (br) br.rotation.x += (gallop * amp - br.rotation.x) * Math.min(1, p.dt * 14);
  if (fr) fr.rotation.x += (-gallop * amp - fr.rotation.x) * Math.min(1, p.dt * 14);
  if (bl) bl.rotation.x += (-gallop * amp - bl.rotation.x) * Math.min(1, p.dt * 14);

  // Lomo: rebote del galope + cabeceo de columna + agachado del aviso y de
  // la embestida (crouch antes de saltar).
  if (rig.torso) {
    let crouch = 0;
    if (p.state === GUARD_STATE_WARNING) crouch = -0.1;
    else if (p.state === GUARD_STATE_WINDUP) crouch = -0.17 * p.windupProgress;
    else if (p.state === GUARD_STATE_CHASE) crouch = 0.02;
    else if (ko) crouch = -0.07;
    const bob = Math.abs(Math.sin(p.walkPhase)) * 0.05 * p.speedRatio;
    const targetY = rig.torsoBaseY + crouch + bob;
    rig.torso.position.y += (targetY - rig.torso.position.y) * Math.min(1, p.dt * 10);
    const spine =
      Math.sin(p.walkPhase * 2) * 0.06 * p.speedRatio +
      (p.state === GUARD_STATE_CHASE ? 0.05 * p.speedRatio : 0);
    rig.torso.rotation.x += (spine - rig.torso.rotation.x) * Math.min(1, p.dt * 9);
  }

  // Cola: ondeo continuo, alzada al acechar.
  if (rig.tail) {
    const swish = ko ? 0.18 : Math.sin(p.clock * 2.6) * 0.45;
    rig.tail.rotation.y += (swish - rig.tail.rotation.y) * Math.min(1, p.dt * 8);
    const tailPitch =
      (p.state === GUARD_STATE_WINDUP ? 0.35 * p.windupProgress : 0) +
      Math.sin(p.clock * 1.7) * 0.08;
    rig.tail.rotation.x += (tailPitch - rig.tail.rotation.x) * Math.min(1, p.dt * 8);
  }

  // Cabeza felina: barrido de búsqueda, mirada curiosa o fija en la caza.
  if (rig.head) {
    let yaw = Math.sin(p.clock * 0.7) * 0.3;
    if (p.state === GUARD_STATE_SEARCH) yaw = Math.sin(p.clock * 2.4) * 0.5;
    else if (
      p.state === GUARD_STATE_CHASE ||
      p.state === GUARD_STATE_WARNING ||
      p.state === GUARD_STATE_WINDUP
    ) {
      yaw = 0;
    }
    rig.head.rotation.y += (yaw - rig.head.rotation.y) * Math.min(1, p.dt * 8);
    const nod = ko ? 0.25 : Math.sin(p.clock * 1.3) * 0.05;
    rig.head.rotation.x += (nod - rig.head.rotation.x) * Math.min(1, p.dt * 8);
  }
}

// ----------------------------------------------------------------------------
// Bípedos: guardia, oficial, brute, samurái, oni, mono, gorila, ciber
// ----------------------------------------------------------------------------

function animateBipedRig(p: EnemyAnimParams): void {
  const rig = p.rig;
  const ko = p.state === GUARD_STATE_KO;
  const moving = p.speedRatio > 0.05;
  const gorilla = p.skin === 'gorilla';

  // Objetivos de pose de este frame (se suavizan al aplicarlos).
  let leftArmX = 0;
  let rightArmX = 0;
  let leftLegX = 0;
  let rightLegX = 0;
  let torsoLean = 0;
  let torsoTwist = 0;
  let torsoY = rig.torsoBaseY;
  let headYaw = 0;
  let headPitch = 0;
  let breathe = 1 + Math.sin(p.clock * 2.1) * 0.02;
  let leftArmZ = 0;
  let rightArmZ = 0;
  const swingAmp = (gorilla ? 1.05 : 0.8) * p.speedRatio;
  const swing = Math.sin(p.walkPhase) * swingAmp;

  if (ko) {
    // K.O.: extremidades relajadas hacia fuera, respiración parada.
    leftArmX = 0.35;
    rightArmX = -0.35;
    leftLegX = 0.16;
    rightLegX = -0.1;
    leftArmZ = 0.55;
    rightArmZ = -0.55;
    headPitch = 0.3;
    breathe = 1;
  } else if (p.state === GUARD_STATE_WINDUP) {
    // Windup: el arma se arma hacia atrás por encima del hombro mientras el
    // torso se tuerce atrás (0 -> 1).
    rightArmX = 2.4 * p.windupProgress;
    torsoTwist = -0.5 * p.windupProgress;
    torsoLean = -0.08 * p.windupProgress;
    leftArmX = -0.5 * p.windupProgress;
    leftLegX = 0.25 * p.windupProgress;
    rightLegX = -0.2 * p.windupProgress;
    headYaw = 0;
  } else if (p.strikeDecay > 0) {
    // Follow-through del golpe: el brazo pega el tajo al frente y el torso
    // destuerce de golpe (strikeDecay 1 -> 0).
    rightArmX = -1.35 * p.strikeDecay;
    torsoTwist = 0.55 * p.strikeDecay;
    leftArmX = 0.4 * p.strikeDecay;
    leftLegX = -0.3 * p.strikeDecay;
    rightLegX = 0.25 * p.strikeDecay;
    torsoLean = 0.1 * p.strikeDecay;
  } else if (p.state === GUARD_STATE_CHASE) {
    // Caza: sprint inclinado al frente + bombeo de alta cadencia.
    torsoLean = 0.22 + 0.18 * p.speedRatio;
    leftArmX = swing;
    rightArmX = -swing;
    leftLegX = -swing;
    rightLegX = swing;
    if (gorilla) {
      // Gorila: rebote pesado de caminar sobre los nudillos.
      torsoY += Math.abs(Math.sin(p.walkPhase)) * 0.07 * p.speedRatio;
      torsoLean += 0.12;
    }
  } else if (p.state === GUARD_STATE_WARNING) {
    // ¡ALTO! Postura de aviso inequívoca: palma alzada al frente, cabeza
    // fija y torso que se yergue.
    leftArmX = -2.35;
    leftArmZ = -0.3;
    rightArmX = 0.15;
    torsoLean = -0.06;
    leftLegX = 0.1;
    rightLegX = -0.1;
  } else if (moving) {
    // Caminar / buscar: balanceo opuesto brazo-pierna escalado por la
    // velocidad REAL (al parar, las piernas se plantan limpio).
    leftArmX = swing;
    rightArmX = -swing;
    leftLegX = -swing;
    rightLegX = swing;
    torsoLean = 0.08 * p.speedRatio;
    if (p.state === GUARD_STATE_SEARCH) {
      headYaw = Math.sin(p.clock * 2.6) * 0.55; // barrido brusco buscando
    }
  } else {
    // Parado: respiración rítmica, mirada curiosa lenta y arma que descansa.
    rightArmX = -0.08 + Math.sin(p.clock * 1.3) * 0.06;
    leftArmX = Math.sin(p.clock * 1.1) * 0.05;
    headYaw = Math.sin(p.clock * 0.7) * 0.32;
    headPitch = Math.sin(p.clock * 0.5) * 0.06;
    if (p.stationaryLookout) {
      // Vigía en su puesto: otea con la cabeza alzada.
      headPitch += 0.08 + Math.sin(p.clock * 0.9) * 0.05;
    }
  }

  // Aplicación suavizada (el estado propio del objeto hace de memoria: sin
  // allocations) — el windup/strike ya son continuos por construcción.
  const kFast = Math.min(1, p.dt * 12);
  const kPose = Math.min(1, p.dt * 9);
  const kRelax = Math.min(1, p.dt * (ko ? 5 : 12));

  if (rig.torso) {
    rig.torso.rotation.x += (torsoLean - rig.torso.rotation.x) * kPose;
    rig.torso.rotation.y += (torsoTwist - rig.torso.rotation.y) * kPose;
    rig.torso.position.y += (torsoY - rig.torso.position.y) * kPose;
    rig.torso.scale.y += (breathe - rig.torso.scale.y) * kPose;
  }
  if (rig.head) {
    rig.head.rotation.y += (headYaw - rig.head.rotation.y) * kPose;
    rig.head.rotation.x += (headPitch - rig.head.rotation.x) * kPose;
  }
  if (rig.leftArm) {
    rig.leftArm.rotation.x += (leftArmX - rig.leftArm.rotation.x) * kRelax;
    rig.leftArm.rotation.z += (leftArmZ - rig.leftArm.rotation.z) * kRelax;
  }
  if (rig.rightArm) {
    rig.rightArm.rotation.x += (rightArmX - rig.rightArm.rotation.x) * kFast;
    rig.rightArm.rotation.z += (rightArmZ - rig.rightArm.rotation.z) * kRelax;
  }
  if (rig.leftLeg) {
    rig.leftLeg.rotation.x += (leftLegX - rig.leftLeg.rotation.x) * kFast;
  }
  if (rig.rightLeg) {
    rig.rightLeg.rotation.x += (rightLegX - rig.rightLeg.rotation.x) * kFast;
  }

  // Cola del mono: rizo que ondea con el ánimo.
  if (rig.tail) {
    const swish = ko ? 0.1 : Math.sin(p.clock * 3.1) * (moving ? 0.5 : 0.3);
    rig.tail.rotation.y += (swish - rig.tail.rotation.y) * kPose;
    rig.tail.rotation.x += (Math.sin(p.clock * 1.9) * 0.12 - rig.tail.rotation.x) * kPose;
  }

  // Estandarte (sashimono/península): ondea con el viento y corre al sprint.
  if (rig.banner) {
    const wave = Math.sin(p.clock * 2.3) * 0.1 + p.speedRatio * 0.24;
    rig.banner.rotation.x += (wave - rig.banner.rotation.x) * kPose;
    rig.banner.rotation.z += (Math.sin(p.clock * 1.7) * 0.08 - rig.banner.rotation.z) * kPose;
  }

  // Pod orbital del ciber-oficial: órbita flotante; al caer K.O. se apaga.
  if (rig.hoverPod) {
    if (ko) {
      const dropY = rig.hoverPodBaseY - 0.5;
      rig.hoverPod.position.y += (dropY - rig.hoverPod.position.y) * kPose;
      const dim = 0.45;
      rig.hoverPod.scale.x += (dim - rig.hoverPod.scale.x) * kPose;
      rig.hoverPod.scale.y += (dim - rig.hoverPod.scale.y) * kPose;
      rig.hoverPod.scale.z += (dim - rig.hoverPod.scale.z) * kPose;
    } else {
      const orbit = p.clock * 1.8;
      const targetX = rig.hoverPodBaseX + Math.cos(orbit) * 0.16;
      const targetY = rig.hoverPodBaseY + Math.sin(p.clock * 2.4) * 0.08;
      const targetZ = rig.hoverPodBaseZ + Math.sin(orbit) * 0.16;
      rig.hoverPod.position.x += (targetX - rig.hoverPod.position.x) * kPose;
      rig.hoverPod.position.y += (targetY - rig.hoverPod.position.y) * kPose;
      rig.hoverPod.position.z += (targetZ - rig.hoverPod.position.z) * kPose;
      rig.hoverPod.rotation.y += p.dt * 3;
      const podScale = 1 + Math.sin(p.clock * 3.2) * 0.08;
      rig.hoverPod.scale.x += (podScale - rig.hoverPod.scale.x) * kPose;
      rig.hoverPod.scale.y += (podScale - rig.hoverPod.scale.y) * kPose;
      rig.hoverPod.scale.z += (podScale - rig.hoverPod.scale.z) * kPose;
    }
  }
}

// ============================================================================
// NPCs amigables: saludo, asentir, respiración y halo [E] girando
// ============================================================================

/** Referencias cacheadas del modelo de un NPC (una vez al hacer spawn). */
export interface NpcRigRefs {
  torso: THREE.Object3D | null;
  head: THREE.Object3D | null;
  leftArm: THREE.Object3D | null;
  rightArm: THREE.Object3D | null;
  icon: THREE.Object3D | null;
}

export function collectNpcRig(root: THREE.Group): NpcRigRefs {
  return {
    torso: root.getObjectByName('torso') ?? null,
    head: root.getObjectByName('head') ?? null,
    leftArm: root.getObjectByName('leftArm') ?? null,
    rightArm: root.getObjectByName('rightArm') ?? null,
    icon: root.getObjectByName('promptIcon') ?? null,
  };
}

/**
 * Animación idle procedural del NPC: respiración sutil, asentir curioso,
 * saludo con la mano cuando el jugador se acerca y el bocadillo [E] que
 * flota girando sobre su cabeza. Matemática pura, sin allocations.
 */
export function animateNpc(
  rig: NpcRigRefs,
  clock: number,
  iconVisible: boolean,
  greeting: boolean
): void {
  if (rig.torso) {
    rig.torso.scale.y = 1 + Math.sin(clock * 2) * 0.025;
  }
  if (rig.head) {
    rig.head.rotation.x = Math.sin(clock * 1.7) * 0.07 + (greeting ? Math.sin(clock * 5.2) * 0.05 : 0);
    rig.head.rotation.y = Math.sin(clock * 0.6) * 0.22;
  }
  if (rig.leftArm) {
    rig.leftArm.rotation.x = Math.sin(clock * 1.1) * 0.08;
  }
  if (rig.rightArm) {
    // Saluda con la mano al acercarse el jugador; en reposo, balanceo suave.
    rig.rightArm.rotation.x = greeting
      ? -2.3 + Math.sin(clock * 6.5) * 0.35
      : Math.sin(clock * 1.3 + 1) * 0.08;
  }
  if (rig.icon) {
    rig.icon.visible = iconVisible;
    if (iconVisible) {
      rig.icon.rotation.y = clock * 1.8; // giro continuo del halo [E]
      rig.icon.position.y = 2.35 + Math.sin(clock * 2.2) * 0.09;
    }
  }
}

// ============================================================================
// Comandante KRONOS: paso pesado, arco de la maza y anillo de energía
// ============================================================================

/** Referencias cacheadas del modelo de KRONOS (una vez al hacer spawn). */
export interface KronosRigRefs {
  torso: THREE.Object3D | null;
  torsoBaseY: number;
  mace: THREE.Object3D | null;
  ring: THREE.Object3D | null;
}

export function collectKronosRig(root: THREE.Group): KronosRigRefs {
  const torso = root.getObjectByName('torso') ?? null;
  return {
    torso,
    torsoBaseY: torso ? torso.position.y : 0,
    mace: root.getObjectByName('mace') ?? null,
    ring: root.getObjectByName('energyRing') ?? null,
  };
}

/** Parámetros por frame del animador de KRONOS (objeto reutilizado). */
export interface KronosAnimParams {
  torso: THREE.Object3D | null;
  torsoBaseY: number;
  mace: THREE.Object3D | null;
  ring: THREE.Object3D | null;
  ringMaterial: THREE.MeshBasicMaterial;
  state: number;
  windupProgress: number;
  speedRatio: number;
  clock: number;
  dt: number;
  defeated: boolean;
}

/**
 * Jefe KRONOS: balanceo de paso pesado al perseguir, arco completo del
 * barrido de maza (carga atrás -> cleave al frente) y anillo de energía
 * pulsando con la postura activa de su red MLP.
 */
export function animateKronos(p: KronosAnimParams): void {
  // Paso pesado: balanceo lateral + rebote del torso al caminar.
  if (p.torso) {
    if (p.defeated) {
      p.torso.rotation.z += (0 - p.torso.rotation.z) * Math.min(1, p.dt * 4);
      p.torso.position.y += (p.torsoBaseY - p.torso.position.y) * Math.min(1, p.dt * 4);
    } else {
      const sway = Math.sin(p.clock * 3.1) * 0.055 * p.speedRatio;
      p.torso.rotation.z += (sway - p.torso.rotation.z) * Math.min(1, p.dt * 8);
      const bob = p.torsoBaseY + Math.abs(Math.sin(p.clock * 3.1)) * 0.05 * p.speedRatio;
      p.torso.position.y += (bob - p.torso.position.y) * Math.min(1, p.dt * 8);
    }
  }

  // Arco de la maza: carga atrás en el windup, cleave al frente y caída al
  // quedar aturdido por un Parry.
  if (p.mace) {
    if (p.state === KRONOS_STATE_STUNNED) {
      p.mace.rotation.z += (-1.1 - p.mace.rotation.z) * Math.min(1, p.dt * 6);
    } else if (p.state === KRONOS_STATE_WINDUP) {
      p.mace.rotation.x = 1.25 - p.windupProgress * 1.0;
    } else {
      p.mace.rotation.x += (1.25 - p.mace.rotation.x) * Math.min(1, p.dt * 5);
    }
  }

  // Anillo de energía: pulso vivo mientras el jefe sigue en pie.
  p.ringMaterial.opacity = p.defeated ? 0 : 0.4 + Math.sin(p.clock * 4) * 0.2;
  if (p.ring) {
    p.ring.rotation.z += p.dt * 0.8;
    const pulse = 1 + Math.sin(p.clock * 4) * 0.06;
    p.ring.scale.setScalar(p.defeated ? 1 : pulse);
  }
}
