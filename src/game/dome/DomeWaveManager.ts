import * as THREE from 'three';
import { addComicOutline, createComicCelMaterial } from '@/game/render/toonMaterials';
import type { SlabCollider, TestEnemySphere } from './domeTypes';
import { resolveSphereSlabCollision, type SlabContact } from './DomeSlabs';
import {
  createDomeEnemyEntity,
  DOME_ENEMY_ARCHETYPES,
  type DomeEnemyEntity,
  type EnemyArchetype,
} from './DomeCombatSystem';
import {
  collectGolemRig,
  collectKronosRig,
  collectNecrozmaRig,
  collectSparrowRig,
  enemyInkScaleForWave,
  instantiateEnemyVisual,
  INK_DISTANCE_SCALE,
  measureStandHeight,
  onEnemyModelLoaded,
  preloadEnemyModels,
  setEnemyInkScale,
  STAR_CORE_EMISSIVE,
  type EnemyBone,
  type GolemRig,
  type KronosRig,
  type NecrozmaRig,
  type SparrowRig,
} from './DomeEnemyModels';
import {
  CHARGE_CONTACT_PADDING,
  deactivateKronosRings,
  KRONOS_RING_POOL_SIZE,
  updateKronosAttack,
  updateKronosMovement,
  updateKronosPose,
  updateKronosRings,
  type KronosBehaviorContext,
  type KronosRing,
} from './domeKronosBehavior';
import {
  computeCrabMuzzle,
  pickCrabSpawnSlab,
  pickSlabLocalPoint,
  slabTopPoint,
  updateCrabEnemy,
  type CrabBehaviorContext,
  type CrabJump,
} from './domeCrabBehavior';
import {
  CellSwarmDirector,
  CELL_CHILD_EXP,
  CELL_RING_START,
  updateCellEnemy,
  type CellBehaviorContext,
  type CellState,
} from './domeCellBehavior';
import { faceTowards, lookAtQuat } from './domeEnemyOrient';

// ============================================================================
// DomeWaveManager — ciclo infinito de oleadas de la cúpula.
//
// Estructura del ciclo (15 rondas, repetido infinito):
//   1–4   Básicos (4 → 8 enemigos)            suelos 'basic'
//   5     Miniboss/Épico 1: giant_sparrow     suelos 'miniboss'
//   6–9   Básicos (7 → 11)                    suelos 'basic'
//   10    Miniboss/Épico 2: prisma_necrozma   suelos 'miniboss'
//   11–14 Básicos (9 → 13)                    suelos 'basic'
//   15    Boss: kronos_leviathan              suelos 'boss'
//   16+   Repite el ciclo con +2*cycle enemigos y velocidad 1 + cycle*0.2.
//
// Cada enemigo es un `ManagedWaveEnemy` (extiende `TestEnemySphere`), así que
// el array `enemies` es 100% compatible con lo que espera `NyxDomeController`
// para lock-on/patadas, y a la vez lleva su `DomeEnemyEntity` para el
// `DomeCombatSystem` (carne/estrella/puntos débiles).
// ============================================================================

export type WaveFloorMode = 'basic' | 'miniboss' | 'boss';

export interface ManagedWaveEnemy extends TestEnemySphere {
  /** Entidad de combate (HP, carne, estrella, puntos débiles) para DomeCombatSystem. */
  entity: DomeEnemyEntity;
  /** Fase del bob senoidal de flotación. */
  phase: number;
  /** Segundos restantes del dash evasivo (sin freno durante el brusco). */
  dashTimer: number;
  /** Signo del próximo dash lateral (alterna izquierda/derecha). */
  dashSign: 1 | -1;
  /** Cuenta atrás del próximo ataque (proyectil o embestida). */
  attackTimer: number;
}

export interface WaveInfo {
  wave: number;
  label: string;
  floorMode: WaveFloorMode;
  remaining: number;
}

// ---------------------------------------------------------------------------
// Constantes de comportamiento
// ---------------------------------------------------------------------------

const FLOAT_SPRING = 2.4;
const FLOAT_DAMPING = 1.6;
const FLOAT_BOB_AMPLITUDE = 0.9;
const FLOAT_BOB_SPEED = 0.9;
const LEASH_RADIUS = 9.0;
const HOME_PULL = 6.5;
const DOME_KEEP_RADIUS = 78.0;
const DOME_KEEP_PULL = 9.0;

const EVASIVE_DASH_SPEED = 28.0;
const EVASIVE_DASH_TIME = 0.38;
const EVASIVE_DASH_LIFT = 5.5;
const EVASIVE_COOLDOWN = 3.0;
const EVADE_TRIGGER_ATTACK_TIME = 0.85;
const EVADE_TRIGGER_DISTANCE = 14.0;

const HIT_KNOCKBACK = 14.0;
const HIT_KNOCKBACK_DRILL = 26.0;
const HIT_FLASH_DECAY = 3.2;
const HIT_FLASH_SCALE = 0.35;
const HIT_FLASH_EMISSIVE = 0.85;

/** Arquetipos con dash evasivo al ser lockeados/atacados. */
const EVASIVE_ARCHETYPES: ReadonlySet<EnemyArchetype> = new Set([
  'spiral_octopus',
  'lightning_butterfly',
  'giant_sparrow',
  'prisma_necrozma',
]);

const BASIC_ARCHETYPES: readonly EnemyArchetype[] = [
  'abyssal_cell',
  'crab_gunner',
  'spiral_octopus',
  'lightning_butterfly',
  'ground_golem',
];

const CYCLE_LENGTH = 15;

// Pinchos del Prisma Necrozma: salen cuando Nyx se acerca de frente (< 10 m) y
// se retraen en la ventana vulnerable tras su dash evasivo o su ráfaga.
const NECROZMA_SPIKES_RANGE = 10.0;
const NECROZMA_VULN_SEC = 1.8;
const NECROZMA_SPIKES_OUT_SCALE = 1.35;
const NECROZMA_SPIKES_IN_SCALE = 0.15;
const NECROZMA_SPIKES_RIM = 0xff3b3b;
const NECROZMA_BASE_RIM = 0xd9baff;
/** Rim de reposo de las mallas detail (DETAIL_RIM de DomeEnemyModels). */
const NECROZMA_DETAIL_RIM = 0x6b5f8a;

// --- Ave Legendaria Cristalizada: ráfaga de 3 esferas con la boca abierta ---
const SPARROW_BURST_WINDOW_SEC = 1.8;
/** Momentos de disparo dentro de la ventana (telegraph ~0.75 s + 3 esferas). */
const SPARROW_BURST_FIRE_AT = [1.05, 0.75, 0.45];
const SPARROW_BURST_DAMAGE = 12;
const SPARROW_CHARGE_DAMAGE = 12;
const SPARROW_FLAP_SPEED_BASE = 6.2;
const SPARROW_FLAP_SPEED_BURST = 9.5;
const SPARROW_FLAP_SPEED_DIVE = 15.0;
const SPARROW_JAW_OPEN_RAD = 0.55;
const SPARROW_TURN_RATE = 2.4;

// --- Gólem Rompesuelos: manotazo brutal con telegraph de 0.75 s ---
const GOLEM_SMASH_TRIGGER_DISTANCE = 13.0;
const GOLEM_SMASH_WINDUP_SEC = 0.75;
const GOLEM_SMASH_SWING_SEC = 0.22;
const GOLEM_SMASH_RECOVER_SEC = 0.9;
const GOLEM_SMASH_REACH = 4.2;
const GOLEM_SMASH_HIT_RADIUS = 4.6;
const GOLEM_SMASH_DAMAGE = 14;
const GOLEM_SLAB_BREAK_RADIUS = 8.0;
const GOLEM_FIST_NEON_RIM = 0x39ffb0;
const GOLEM_TURN_RATE = 1.8;
const NECROZMA_TURN_RATE = 2.6;

// --- Leviatán KRONOS (Boss): serpenteo con huesos + 3 patrones de ataque ---
// Ondulación serpentina progresiva de la cadena seg_01..seg_12.
// Ataque 1 — Tramo Devorasuelos: embestida que atraviesa la arena rompiendo suelos.
// Ataque 2 — Anillos de Contención: jaw abierta + ondas circulares expansivas.
// Ataque 3 — Enrosco Gravitatorio (Fase < 50% HP).

// Proyectiles oscuros lentos (pool fijo, sin allocations por frame).
const PROJECTILE_POOL_SIZE = 32;
const PROJECTILE_LIFE_SEC = 9.0;
const PROJECTILE_PLAYER_RADIUS = 1.6;
const PROJECTILE_BOUND_RADIUS = 88.0;

// Embestidas (ave legendaria): carga directa contra Nyx.

// --- Pulpo Espiral: orientación procedural + tentáculos sin clips ---
const OCTOPUS_TURN_RATE = 3.2; // Velocidad de giro hacia Nyx (slerp/seg).
const OCTOPUS_SPIRAL_TILT = 0.38; // Inclinación máx. de la espiral al desplazarse.
const OCTOPUS_SPIRAL_SPEED = 2.6; // Velocidad del balanceo en espiral.
const TENTACLE_WAVE_SPEED = 4.5; // Math.sin(elapsed * 4.5 + phase + i).
const TENTACLE_BASE_AMPLITUDE = 0.32;
const TENTACLE_TIP_AMPLITUDE = 0.45;
const OCTOPUS_INK_FORWARD = 0.55; // Fracción del radius: frente del manto.
const OCTOPUS_INK_UP = 0.35; // Elevación del manto sobre el centro.

// --- Cangrejo Artillero: pegado a suelos + cañón que apunta ---
// --- Cangrejo Artillero: spawn sobre suelos + salto entre ellos ---
const CRAB_LEG_WAVE_AMPLITUDE = 0.3; // Amplitud del aleteo de patas (rad).

// --- Voladores contra icebergs (activeSlabs): nunca atraviesan los suelos ---
const SLAB_BOUNCE_RESTITUTION = 0.35; // Rebote suave de la velocidad contra la normal.

// --- Scratch vectors a nivel de módulo: sin allocations por frame --- 
const _toHome = new THREE.Vector3();
const _toEnemy = new THREE.Vector3();
const _perp = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _flat = new THREE.Vector3();
const _shotDir = new THREE.Vector3();
const _lookDir = new THREE.Vector3();
const _aimDir = new THREE.Vector3();
const _basisX = new THREE.Vector3();
const _targetQuat = new THREE.Quaternion();
const _rollQuat = new THREE.Quaternion();
const _invQuat = new THREE.Quaternion();
const _turretWorldQuat = new THREE.Quaternion();
const _slabUp = new THREE.Vector3();
const _slabForward = new THREE.Vector3();
const _localOffset = new THREE.Vector3();
const _targetPos = new THREE.Vector3();
const _muzzlePos = new THREE.Vector3();
const _muzzleDir = new THREE.Vector3();
const _legWaveQuat = new THREE.Quaternion();
const _legWaveAxis = new THREE.Vector3(1, 0, 0);
const _boneQuat = new THREE.Quaternion();
const _boneEuler = new THREE.Euler();
const _spiralDir = new THREE.Vector3();
const _ringForward = new THREE.Vector3(0, 0, 1);
const _slabContact: SlabContact = {
  slab: null,
  normal: new THREE.Vector3(),
  depth: 0,
  point: new THREE.Vector3(),
};

// ---------------------------------------------------------------------------
// Plan de oleada
// ---------------------------------------------------------------------------

/** Arquetipo concreto o mezcla rotada de básicos. */
type WaveSpawnArchetype = EnemyArchetype | 'basic_mix';

interface WaveSpawn {
  archetype: WaveSpawnArchetype;
  count: number;
}

interface WavePlan {
  wave: number;
  label: string;
  floorMode: WaveFloorMode;
  spawns: WaveSpawn[];
  /** Multiplicador de velocidad/agresividad (1 + cycle * 0.2). */
  speedMult: number;
}

/** Cantidad escalonada de básicos entre `from` y `to` a lo largo de la banda. */
function rampCount(bandIndex: number, bandSize: number, from: number, to: number): number {
  const t = bandSize <= 1 ? 1 : bandIndex / (bandSize - 1);
  return Math.round(from + (to - from) * t);
}

function getWavePlan(waveNumber: number): WavePlan {
  const cycle = Math.floor((waveNumber - 1) / CYCLE_LENGTH);
  const inCycle = ((waveNumber - 1) % CYCLE_LENGTH) + 1;
  const speedMult = 1 + cycle * 0.2;
  const extra = 2 * cycle;
  const spawns: WaveSpawn[] = [];

  let label = 'BÁSICOS';
  let floorMode: WaveFloorMode = 'basic';

  if (inCycle === 5) {
    label = 'MINIBOSS';
    floorMode = 'miniboss';
    spawns.push({ archetype: 'giant_sparrow', count: 1 });
  } else if (inCycle === 10) {
    label = 'MINIBOSS';
    floorMode = 'miniboss';
    spawns.push({ archetype: 'prisma_necrozma', count: 1 });
  } else if (inCycle === 15) {
    label = 'BOSS';
    floorMode = 'boss';
    spawns.push({ archetype: 'kronos_leviathan', count: 1 });
  } else {
    // Bandas de básicos: 1–4 (4→8), 6–9 (7→11), 11–14 (9→13).
    let bandStart = 1;
    let bandEnd = 4;
    let from = 4;
    let to = 8;
    if (inCycle >= 6 && inCycle <= 9) {
      bandStart = 6;
      bandEnd = 9;
      from = 7;
      to = 11;
    } else if (inCycle >= 11 && inCycle <= 14) {
      bandStart = 11;
      bandEnd = 14;
      from = 9;
      to = 13;
    }
    const count = rampCount(inCycle - bandStart, bandEnd - bandStart + 1, from, to) + extra;
    spawns.push({ archetype: 'basic_mix', count });
  }

  // En ciclos avanzados, los miniboss/boss traen escoltas básicos (+2*cycle).
  if (extra > 0 && (floorMode === 'miniboss' || floorMode === 'boss')) {
    spawns.push({ archetype: 'basic_mix', count: extra });
  }

  return { wave: waveNumber, label, floorMode, spawns, speedMult };
}

// ---------------------------------------------------------------------------
// RNG determinista por oleada (posiciones reproducibles)
// ---------------------------------------------------------------------------

function makeRng(seed: number): () => number {
  let s = (seed * 2654435761 + 1013904223) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Aspecto provisional por arquetipo (hasta los GLBs finales)
// ---------------------------------------------------------------------------

interface ArchetypeVisual {
  geometry: THREE.BufferGeometry;
  color: number;
  rim: number;
  outlineThickness: number;
  starColor: number;
  starScale: number;
}

function buildArchetypeVisuals(): Record<EnemyArchetype, ArchetypeVisual> {
  return {
    // Célula Abisal: icosaedro pequeño translúcido aqua.
    abyssal_cell: {
      geometry: new THREE.IcosahedronGeometry(1.5, 1),
      color: 0x7ae8dc,
      rim: 0xbafff2,
      outlineThickness: 0.05,
      starColor: 0xfff6c8,
      starScale: 0.45,
    },
    // Pulpo Espiral: toro en espiral (tentáculos enroscados) magenta.
    spiral_octopus: {
      geometry: new THREE.TorusKnotGeometry(1.5, 0.42, 64, 8),
      color: 0xff5f9e,
      rim: 0xffb3d4,
      outlineThickness: 0.05,
      starColor: 0xfff0a3,
      starScale: 0.5,
    },
    // Cangrejo Artillero: caja chata ancha naranja (torreta).
    crab_gunner: {
      geometry: new THREE.BoxGeometry(2.6, 1.2, 1.9),
      color: 0xff8c42,
      rim: 0xffd0a3,
      outlineThickness: 0.05,
      starColor: 0xfff0b0,
      starScale: 0.4,
    },
    // Gólem Rompesuelos: dodecaedro macizo piedra.
    ground_golem: {
      geometry: new THREE.DodecahedronGeometry(2.9),
      color: 0x9c8f7a,
      rim: 0xd8c9a8,
      outlineThickness: 0.06,
      starColor: 0xffe27a,
      starScale: 0.42,
    },
    // Mariposa Relámpago: tetraedro pequeño amarillo eléctrico.
    lightning_butterfly: {
      geometry: new THREE.TetrahedronGeometry(1.3),
      color: 0xfff45f,
      rim: 0xffffffa8,
      outlineThickness: 0.06,
      starColor: 0xffffff,
      starScale: 0.5,
    },
    // Gorrión Gigante (Élite): elipsoide alargado carmesí (cuerpo de ave).
    giant_sparrow: {
      geometry: new THREE.SphereGeometry(2.4, 20, 14),
      color: 0xff4d5e,
      rim: 0xffb0b8,
      outlineThickness: 0.06,
      starColor: 0x9ff0ff,
      starScale: 0.4,
    },
    // Prisma Necrozma (Élite): octaedro prismático violeta.
    prisma_necrozma: {
      geometry: new THREE.OctahedronGeometry(3.4),
      color: 0xb06bff,
      rim: NECROZMA_BASE_RIM,
      outlineThickness: 0.06,
      starColor: 0xbafff2,
      starScale: 0.38,
    },
    // Leviatán KRONOS (Boss): cápsula serpentante azul abisal.
    kronos_leviathan: {
      geometry: new THREE.CapsuleGeometry(2.6, 9.5, 8, 14),
      color: 0x2f6bff,
      rim: 0x9fc0ff,
      outlineThickness: 0.07,
      starColor: 0xfff0a3,
      starScale: 0.35,
    },
  };
}

// ---------------------------------------------------------------------------
// Internos por enemigo (materiales y estado de comportamiento)
// ---------------------------------------------------------------------------

/** Hueso procedural con su pose de reposo: la animación se compone encima
 * para no romper el bind del skin. Sirve a los tentáculos del pulpo
 * (`tentacle_*`) y a las patas del cangrejo (`leg_*`). */
interface TentacleBone {
  bone: THREE.Object3D;
  rest: THREE.Quaternion;
  amplitude: number;
}

/**
 * Recolecta los huesos `tentacle_*` del rig (octopus_rig) ordenados de base a
 * punta, guardando su pose de reposo: la oscilación procedural se compone
 * encima para no romper el bind del skin.
 */
function collectTentacleBones(root: THREE.Object3D): TentacleBone[] {
  const tentacles: TentacleBone[] = [];
  root.traverse((obj) => {
    const match = /^tentacle_(\d+)_(\d+)$/.exec(obj.name);
    if (!match) {
      return;
    }
    const segment = parseInt(match[2], 10);
    tentacles.push({
      bone: obj,
      rest: obj.quaternion.clone(),
      amplitude: segment <= 1 ? TENTACLE_BASE_AMPLITUDE : TENTACLE_TIP_AMPLITUDE,
    });
  });
  tentacles.sort((a, b) => a.bone.name.localeCompare(b.bone.name));
  return tentacles;
}

interface TurretRig {
  node: THREE.Object3D;
  /** Eje local por el que dispara el cañón. */
  forward: THREE.Vector3;
}

/**
 * Localiza el cañón del cangrejo dentro del GLB: hueso `turret` (los huesos de
 * Blender apuntan por su +Y local) o, en su defecto, el mesh `detail_cannon`
 * (geometría extendida hacia +Z local).
 */
function findTurretRig(root: THREE.Object3D): TurretRig | null {
  const turret = root.getObjectByName('turret');
  if (turret) {
    return { node: turret, forward: new THREE.Vector3(0, 1, 0) };
  }
  const cannon = root.getObjectByName('detail_cannon');
  if (cannon) {
    return { node: cannon, forward: new THREE.Vector3(0, 0, 1) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Cangrejo Artillero: suelos (spawn pegado + salto entre ellos)
// ---------------------------------------------------------------------------

/** Huesos `leg_*` del cangrejo para el aleteo procedural en el aire. */
function collectLegBones(root: THREE.Object3D): TentacleBone[] {
  const legs: TentacleBone[] = [];
  root.traverse((obj) => {
    if (/^leg_/.test(obj.name)) {
      legs.push({ bone: obj, rest: obj.quaternion.clone(), amplitude: CRAB_LEG_WAVE_AMPLITUDE });
    }
  });
  legs.sort((a, b) => a.bone.name.localeCompare(b.bone.name));
  return legs;
}

export interface EnemyInternal {
  enemy: ManagedWaveEnemy;
  material: THREE.ShaderMaterial | null;
  outlineMaterial: THREE.ShaderMaterial | null;
  /** Materiales con `uTime` (carne nebulosa + contorno vibrante): reloj por frame. */
  animatedMaterials: THREE.ShaderMaterial[];
  starCores: THREE.Object3D[];
  mixer?: THREE.AnimationMixer;
  isGlb?: boolean;
  /** Pulpo: huesos `tentacle_*` para la oscilación procedural. */
  tentacles: TentacleBone[];
  /** Cangrejo: huesos `leg_*` para el aleteo procedural en el aire. */
  legs: TentacleBone[];
  /** Cangrejo: nodo del cañón (hueso `turret` o mesh `detail_cannon`). */
  turretNode: THREE.Object3D | null;
  /** Cangrejo: eje local de disparo del cañón. */
  turretForward: THREE.Vector3;
  /** Cangrejo: id del slab al que está pegado (null = flotación suave). */
  attachedSlabId: string | null;
  /**
   * Altura del origen del modelo sobre el suelo (m): `-min.y` medido sobre el
   * modelo ya instanciado con su esqueleto aplicado. El cangrejo la usa para
   * apoyar las almohadillas de las 5 patas en la tapa del slab.
   */
  standHeight: number;
  /** Cangrejo: offset local (lx, lz) dentro del slab para no salirse del borde. */
  slabLocalOffset: THREE.Vector2;
  /** Cangrejo: progreso 0..1 del aterrizaje en el slab actual. */
  attachBlend: number;
  /** Cangrejo: posición de partida del aterrizaje suave. */
  attachFrom: THREE.Vector3;
  /** Cangrejo: salto en curso entre suelos (null = pegado o flotando). */
  jump: CrabJump | null;
  /** Ave: huesos del GLB para aleteo, cuello/cabeza, cola y jaw. */
  sparrowRig: SparrowRig | null;
  /** Ave: fase integrada del aleteo (la velocidad cambia sin saltos). */
  flapPhase: number;
  /** Ave: apertura suavizada del jaw (0 = cerrado, 1 = abierto). */
  jawOpen: number;
  /** Ave: segundos restantes de la ráfaga (telegraph + 3 esferas). */
  burstTimer: number;
  /** Ave: esferas pendientes de la ráfaga en curso. */
  burstShotsLeft: number;
  /** Ave: próximo ataque alternado (embestida <-> ráfaga). */
  nextAttack: 'charge' | 'burst';
  /** Necrozma: huesos del GLB + malla `detail_spikes`. */
  necrozmaRig: NecrozmaRig | null;
  /** Necrozma: escala actual de `detail_spikes` (suavizada). */
  spikeScale: number;
  /** Gólem: huesos del GLB + malla `detail_fist`. */
  golemRig: GolemRig | null;
  /** Gólem: fase del manotazo brutal (telegraph -> golpe -> recuperación). */
  golemPhase: 'idle' | 'windup' | 'smash' | 'recover';
  /** Gólem: segundos restantes de la fase actual. */
  golemTimer: number;
  /** Gólem: ángulo del brazo gigante (negativo = alzado, positivo = descargado). */
  golemArmAngle: number;
  /** Gólem: torsión acumulada de spine/chest durante el manotazo. */
  golemTwist: number;
  /** Gólem: punto de impacto del manotazo en espacio mundo. */
  golemImpact: THREE.Vector3;
  /** KRONOS: huesos del GLB (cadena seg_01..12, head/jaw, aletas, estrellas). */
  kronosRig: KronosRig | null;
  /** KRONOS: fase actual de su máquina de ataques. */
  kronosState: 'roam' | 'charge' | 'rings' | 'coil';
  /** KRONOS: segundos restantes del sub-estado actual. */
  kronosTimer: number;
  /** KRONOS: contador de ataques (alterna Devorasuelos <-> Anillos). */
  kronosAttackIndex: number;
  /** KRONOS: anillos pendientes de emitir en el ataque en curso. */
  kronosRingsLeft: number;
  /** KRONOS: apertura suavizada del hueso jaw (0 = cerrado, 1 = abierto). */
  kronosJawOpen: number;
  /** KRONOS: cooldown de daño por contacto durante la embestida. */
  kronosContactCd: number;
  /** KRONOS: cooldown del Enrosco Gravitatorio (solo bajo el 50% de HP). */
  kronosCoilCooldown: number;
  /** KRONOS: ángulo actual de la órbita del enrosco (rad). */
  kronosOrbitAngle: number;
  /** KRONOS: ángulo del abanico espiral de esferas oscuras (rad). */
  kronosSpiralAngle: number;
  /** KRONOS: cuenta atrás del próximo disparo de la espiral (s). */
  kronosSpiralTimer: number;
  /** KRONOS: carne de los segmentos antes del enrosco (se restaura al salir). */
  kronosFleshRestore: number;
  /** Segundos restantes de embestida en curso (0 = libre). */
  chargeTimer: number;
  chargeSpeed: number;
  chargeDamage: number;
  chargeDir: THREE.Vector3;
  /** Célula Abisal: estado de su FSM de oportunista. */
  cellState: CellState;
  /** Célula: segundos restantes de la fase actual (windup/recover/duplicate). */
  cellTimer: number;
  /** Célula: dirección del lunge, FIJADA al iniciar el windup (sin homing). */
  cellLungeDir: THREE.Vector3;
  /** Célula: metros restantes del lunge en curso. */
  cellLungeLeft: number;
  /** Célula: radio actual del anillo de acecho (7 → 5 m). */
  cellRing: number;
  /** Célula: segundos llevada oculta de la vista de Nyx. */
  cellHiddenFor: number;
  /** Célula: slot de órbita asignado por el enjambre (ángulo equidistante). */
  cellSlot: number;
  /** Célula: sentido de giro de la órbita. */
  cellOrbitSign: 1 | -1;
  /** Clips del GLB por nombre (célula animada; null si el modelo no tiene). */
  actions: Map<string, THREE.AnimationAction> | null;
  /** Acción de clip en reproducción (para crossfade solo al cambiar). */
  currentClipAction: THREE.AnimationAction | null;
  /** Célula: segundos restantes del flinch de cell_hit sobre la IA. */
  cellHitTimer: number;
}

/**
 * Enemigo en plena animación de muerte: vibra `DEATH_SHAKE_TIME` y luego se
 * infla y estalla. La malla sigue en escena (ya fuera de `enemies`) hasta que
 * termina el efecto; los materiales se liberan al final.
 */
interface DyingEnemy {
  mesh: THREE.Object3D;
  basePos: THREE.Vector3;
  baseScale: THREE.Vector3;
  elapsed: number;
  radius: number;
  color: number;
  materials: THREE.Material[];
  exploded: boolean;
}

/** Temblor previo al estallido (s). */
const DEATH_SHAKE_TIME = 0.22;
/** Inflado final antes de desaparecer (s). */
const DEATH_POP_TIME = 0.16;

/**
 * Localiza el material del cuerpo del enemigo para el flash de impacto:
 * prefiere la carne nebulosa (uniforms `uTime` + `uEmissiveBoost`) y cae al
 * primer material cel con `uEmissiveBoost` (star_core, forma provisional).
 */
function findBodyMaterial(root: THREE.Object3D): THREE.ShaderMaterial | null {
  let cel: THREE.ShaderMaterial | null = null;
  let nebula: THREE.ShaderMaterial | null = null;
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }
    const m = mesh.material;
    if (!(m instanceof THREE.ShaderMaterial) || !m.uniforms.uEmissiveBoost) {
      return;
    }
    if (m.uniforms.uTime) {
      if (!nebula) nebula = m;
    } else if (!cel) {
      cel = m;
    }
  });
  return nebula ?? cel;
}

interface WaveProjectile {
  mesh: THREE.Mesh;
  active: boolean;
  kind: 'dark' | 'ink';
  damage: number;
  velocity: THREE.Vector3;
  life: number;
}


// ---------------------------------------------------------------------------
// DomeWaveManager
// ---------------------------------------------------------------------------

export class DomeWaveManager implements KronosBehaviorContext, CrabBehaviorContext, CellBehaviorContext {
  /** Enemigos vivos de la oleada (compatibles con TestEnemySphere[]). */
  readonly enemies: ManagedWaveEnemy[] = [];

  /** Coordinador de enjambre de las Células Abisales (slots + token de lunge). */
  readonly cellDirector = new CellSwarmDirector();

  private readonly scene: THREE.Scene;
  private readonly internals = new Map<string, EnemyInternal>();
  private readonly visuals: Record<EnemyArchetype, ArchetypeVisual>;
  private readonly starGeometry = new THREE.OctahedronGeometry(1, 0);
  private readonly projectiles: WaveProjectile[] = [];
  private readonly projectileGeometry = new THREE.SphereGeometry(0.55, 12, 10);
  private readonly darkProjectileMaterial: THREE.ShaderMaterial;
  private readonly inkProjectileMaterial: THREE.ShaderMaterial;
  readonly kronosRings: KronosRing[] = [];
  private readonly kronosRingGeometry = new THREE.TorusGeometry(1, 0.07, 8, 48);
  private readonly kronosRingMaterial: THREE.ShaderMaterial;

  /** Enemigos vibrando/estallando (fuera ya de `enemies`). */
  private readonly dying: DyingEnemy[] = [];
  /**
   * Se dispara cuando un enemigo termina de vibrar y estalla: el bucle de
   * juego lo usa para la ráfaga de chispas y el anillo de la explosión.
   */
  onEnemyExplode?: (position: THREE.Vector3, radius: number, color: number) => void;

  private currentWave = 0;
  private waveTime = 0;
  speedMult = 1;
  /** Modo Entrenamiento: los enemigos no atacan ni esquivan (sacos de boxeo). */
  private enemiesPassive = false;

  private readonly unsubModelLoaded: () => void;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.visuals = buildArchetypeVisuals();
    this.unsubModelLoaded = onEnemyModelLoaded((archetype) => {
      this.upgradeSpawnedVisuals(archetype);
    });
    preloadEnemyModels();

    this.darkProjectileMaterial = createComicCelMaterial(0x1c1030, {
      rimColor: 0x6b4bff,
      rimStrength: 0.9,
      emissiveBoost: 0.35,
    });
    this.inkProjectileMaterial = createComicCelMaterial(0x0a0a12, {
      rimColor: 0x4a2a6a,
      rimStrength: 0.8,
      emissiveBoost: 0.2,
    });

    // Anillos de Contención de KRONOS: ondas expansivas azul eléctrico brillante.
    this.kronosRingMaterial = createComicCelMaterial(0x9fd8ff, {
      rimColor: 0x66e0ff,
      rimStrength: 1.0,
      emissiveBoost: 0.9,
    });

    for (let i = 0; i < PROJECTILE_POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(this.projectileGeometry, this.darkProjectileMaterial);
      addComicOutline(mesh, 0.05);
      mesh.visible = false;
      this.scene.add(mesh);
      this.projectiles.push({
        mesh,
        active: false,
        kind: 'dark',
        damage: 0,
        velocity: new THREE.Vector3(),
        life: 0,
      });
    }

    for (let i = 0; i < KRONOS_RING_POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(this.kronosRingGeometry, this.kronosRingMaterial);
      addComicOutline(mesh, 0.05);
      mesh.visible = false;
      this.scene.add(mesh);
      this.kronosRings.push({
        mesh,
        active: false,
        origin: new THREE.Vector3(),
        dir: new THREE.Vector3(0, 0, 1),
        travel: 0,
        radius: 1,
        pushed: false,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Ciclo de oleadas
  // -------------------------------------------------------------------------

  /**
   * Limpia la oleada anterior y despliega la composición de `waveNumber`.
   * Con `activeSlabs`, los Cangrejos Artilleros aparecen pegados a un suelo
   * flotante dentro de la cúpula (center < 70 m).
   */
  startWave(waveNumber: number, activeSlabs?: SlabCollider[]): void {
    this.clearEnemies();
    this.deactivateAllProjectiles();
    deactivateKronosRings(this);

    this.currentWave = waveNumber;
    this.waveTime = 0;

    const plan = getWavePlan(waveNumber);
    this.speedMult = plan.speedMult;

    const rng = makeRng(waveNumber * 7919 + 13);
    let spawnIndex = 0;

    for (const spawn of plan.spawns) {
      for (let i = 0; i < spawn.count; i++) {
        const archetype =
          spawn.archetype === 'basic_mix'
            ? BASIC_ARCHETYPES[spawnIndex % BASIC_ARCHETYPES.length]
            : spawn.archetype;
        this.spawnEnemy(archetype, spawnIndex, rng, activeSlabs);
        spawnIndex++;
      }
    }
  }

  private upgradeSpawnedVisuals(archetype: EnemyArchetype): void {
    for (const enemy of this.enemies) {
      if (enemy.entity.archetype !== archetype || !enemy.entity.alive) continue;
      const internal = this.internals.get(enemy.id);
      if (!internal || internal.isGlb) continue;
      const glbVisual = instantiateEnemyVisual(archetype);
      if (!glbVisual) continue;

      const oldMesh = enemy.mesh;
      glbVisual.root.name = oldMesh.name;
      glbVisual.root.position.copy(oldMesh.position);
      glbVisual.root.quaternion.copy(oldMesh.quaternion);
      this.scene.remove(oldMesh);
      this.scene.add(glbVisual.root);

      internal.material?.dispose();
      internal.outlineMaterial?.dispose();

      enemy.mesh = glbVisual.root;
      enemy.position = glbVisual.root.position;
      enemy.entity.mesh = glbVisual.root;
      internal.material = findBodyMaterial(glbVisual.root);
      internal.outlineMaterial = null;
      internal.animatedMaterials = glbVisual.animatedMaterials;
      internal.starCores = glbVisual.starCores;
      internal.mixer = glbVisual.mixer;
      internal.actions = glbVisual.actions;
      internal.currentClipAction = null;
      internal.isGlb = true;
      // Altura de apoyo del GLB real: el cangrejo recoloca sus patas sobre la
      // tapa del slab en el siguiente frame con la medida ya skinneada.
      internal.standHeight = glbVisual.standHeight;
      // Huesos procedurales del GLB: tentáculos del pulpo, patas y cañón del cangrejo.
      internal.tentacles = collectTentacleBones(glbVisual.root);
      internal.legs = collectLegBones(glbVisual.root);
      const turretRig = findTurretRig(glbVisual.root);
      internal.turretNode = turretRig?.node ?? null;
      if (turretRig) {
        internal.turretForward.copy(turretRig.forward);
      }
      // Rigs de los élites y el gólem: huesos y mallas detail del GLB real.
      if (enemy.entity.archetype === 'giant_sparrow') {
        internal.sparrowRig = collectSparrowRig(glbVisual.root);
      } else if (enemy.entity.archetype === 'prisma_necrozma') {
        internal.necrozmaRig = collectNecrozmaRig(glbVisual.root);
      } else if (enemy.entity.archetype === 'ground_golem') {
        internal.golemRig = collectGolemRig(glbVisual.root);
      } else if (enemy.entity.archetype === 'kronos_leviathan') {
        internal.kronosRig = collectKronosRig(glbVisual.root);
      }
    }
  }

  private spawnEnemy(
    archetype: EnemyArchetype,
    index: number,
    rng: () => number,
    activeSlabs?: SlabCollider[],
    homePosOverride?: THREE.Vector3,
  ): void {
    // Grosor de tinta de esta oleada: 1-10 normal, 11-20 x1.25, 21-30 x1.5...
    // (el Modo Entrenamiento no pasa por startWave: currentWave 0 cuenta como 1).
    setEnemyInkScale(enemyInkScaleForWave(this.currentWave));
    const stats = DOME_ENEMY_ARCHETYPES[archetype];
    const visual = this.visuals[archetype];
    const glbVisual = instantiateEnemyVisual(archetype);

    let mesh: THREE.Object3D;
    let material: THREE.ShaderMaterial | null = null;
    let outlineMaterial: THREE.ShaderMaterial | null = null;
    let starCores: THREE.Object3D[] = [];
    let mixer: THREE.AnimationMixer | undefined;
    let animatedMaterials: THREE.ShaderMaterial[] = [];
    let standHeight: number;

    if (glbVisual) {
      mesh = glbVisual.root;
      mesh.name = `waveEnemy_${this.currentWave}_${archetype}_${index}`;
      starCores = glbVisual.starCores;
      mixer = glbVisual.mixer;
      animatedMaterials = glbVisual.animatedMaterials;
      material = findBodyMaterial(glbVisual.root);
      standHeight = glbVisual.standHeight;
    } else {
      material = createComicCelMaterial(visual.color, {
        rimColor: visual.rim,
        rimStrength: 0.7,
        emissiveBoost: 0.0,
      });
      const fallbackMesh = new THREE.Mesh(visual.geometry, material);
      fallbackMesh.name = `waveEnemy_${this.currentWave}_${archetype}_${index}`;
      const outline = addComicOutline(
        fallbackMesh,
        visual.outlineThickness * enemyInkScaleForWave(this.currentWave),
        0x090b14,
        INK_DISTANCE_SCALE,
      );
      outlineMaterial = outline.material as THREE.ShaderMaterial;

      // Estrella interior de prueba: núcleo brillante visible a través del cuerpo.
      const starMaterial = createComicCelMaterial(visual.starColor, {
        rimColor: visual.starColor,
        rimStrength: 1.0,
        emissiveBoost: 0.95,
      });
      const star = new THREE.Mesh(this.starGeometry, starMaterial);
      star.scale.setScalar(visual.starScale);
      fallbackMesh.add(star);
      starCores = [star];
      mesh = fallbackMesh;
      standHeight = measureStandHeight(fallbackMesh);
    }

    // Posición de aparición: anillo distribuido + jitter determinista, o la
    // posición explícita del Modo Entrenamiento (delante de Nyx).
    const angle = (index / Math.max(1, this.enemies.length + 6)) * Math.PI * 2 + rng() * 1.2;
    const dist = 26 + rng() * 30;
    const homePos = homePosOverride
      ? homePosOverride.clone()
      : new THREE.Vector3(
          Math.cos(angle) * dist,
          6 + rng() * 30,
          Math.sin(angle) * dist,
        );

    // Cangrejo Artillero: aparece directamente encima de un suelo flotante
    // dentro de la cúpula (preferiblemente center < 70 m).
    let attachedSlabId: string | null = null;
    const slabLocalOffset = new THREE.Vector2();
    if (!homePosOverride && archetype === 'crab_gunner' && activeSlabs && activeSlabs.length > 0) {
      const slab = pickCrabSpawnSlab(activeSlabs, rng);
      if (slab) {
        pickSlabLocalPoint(slab, rng, slabLocalOffset);
        slabTopPoint(slab, slabLocalOffset, homePos);
        _slabUp.set(0, 1, 0).applyQuaternion(slab.quaternion);
        homePos.addScaledVector(_slabUp, standHeight);
        attachedSlabId = slab.id;
      }
    }
    mesh.position.copy(homePos);
    this.scene.add(mesh);

    const entity = createDomeEnemyEntity(mesh.name, archetype, mesh, homePos);
    entity.evasive = EVASIVE_ARCHETYPES.has(archetype);

    const enemy: ManagedWaveEnemy = {
      id: mesh.name,
      mesh,
      position: mesh.position,
      velocity: new THREE.Vector3(),
      homePos,
      radius: stats.radius,
      evasive: entity.evasive,
      evadeCooldown: 0,
      hitFlash: 0,
      entity,
      phase: rng() * Math.PI * 2,
      dashTimer: 0,
      dashSign: index % 2 === 0 ? 1 : -1,
      attackTimer: 1.2 + rng() * 1.8,
    };

    this.enemies.push(enemy);
    const turretRig = findTurretRig(mesh);
    this.internals.set(enemy.id, {
      enemy,
      material,
      outlineMaterial,
      animatedMaterials,
      starCores,
      mixer,
      isGlb: glbVisual !== null,
      tentacles: collectTentacleBones(mesh),
      legs: collectLegBones(mesh),
      turretNode: turretRig?.node ?? null,
      turretForward: turretRig ? turretRig.forward : new THREE.Vector3(0, 0, 1),
      attachedSlabId,
      standHeight,
      slabLocalOffset,
      attachBlend: attachedSlabId ? 1 : 0,
      attachFrom: homePos.clone(),
      jump: null,
      sparrowRig: archetype === 'giant_sparrow' ? collectSparrowRig(mesh) : null,
      flapPhase: enemy.phase,
      jawOpen: 0,
      burstTimer: 0,
      burstShotsLeft: 0,
      nextAttack: 'charge',
      necrozmaRig: archetype === 'prisma_necrozma' ? collectNecrozmaRig(mesh) : null,
      spikeScale: 1,
      golemRig: archetype === 'ground_golem' ? collectGolemRig(mesh) : null,
      golemPhase: 'idle',
      golemTimer: 0,
      golemArmAngle: 0,
      golemTwist: 0,
      golemImpact: new THREE.Vector3(),
      kronosRig: archetype === 'kronos_leviathan' ? collectKronosRig(mesh) : null,
      kronosState: 'roam',
      kronosTimer: 0,
      kronosAttackIndex: 0,
      kronosRingsLeft: 0,
      kronosJawOpen: 0,
      kronosContactCd: 0,
      kronosCoilCooldown: 0,
      kronosOrbitAngle: enemy.phase,
      kronosSpiralAngle: 0,
      kronosSpiralTimer: 0,
      kronosFleshRestore: 0,
      chargeTimer: 0,
      chargeSpeed: 0,
      chargeDamage: 0,
      chargeDir: new THREE.Vector3(),
      cellState: 'seek',
      cellTimer: 0,
      cellLungeDir: new THREE.Vector3(),
      cellLungeLeft: 0,
      cellRing: CELL_RING_START,
      cellHiddenFor: 0,
      cellSlot: 0,
      cellOrbitSign: index % 2 === 0 ? 1 : -1,
      actions: glbVisual ? glbVisual.actions : null,
      currentClipAction: null,
      cellHitTimer: 0,
    });
  }

  // -------------------------------------------------------------------------
  // API pública
  // -------------------------------------------------------------------------

  getWaveInfo(): WaveInfo {
    // Objeto persistente (solo lectura): el bucle de juego lo consulta cada
    // frame sin generar basura.
    const plan = getWavePlan(Math.max(1, this.currentWave));
    this.waveInfoCache.wave = this.currentWave;
    this.waveInfoCache.label = plan.label;
    this.waveInfoCache.floorMode = plan.floorMode;
    this.waveInfoCache.remaining = this.getActiveEnemyCount();
    return this.waveInfoCache;
  }

  getActiveEnemies(): ManagedWaveEnemy[] {
    return this.enemies.filter((e) => e.entity.alive);
  }

  /** Nº de enemigos vivos sin asignar un array nuevo (bucle caliente). */
  getActiveEnemyCount(): number {
    let count = 0;
    for (const enemy of this.enemies) {
      if (enemy.entity.alive) count++;
    }
    return count;
  }

  /**
   * Rellena `out` con los enemigos vivos (vaciándolo antes) y lo devuelve.
   * Versión sin allocations de getActiveEnemies para el bucle de juego.
   */
  fillActiveEnemies(out: ManagedWaveEnemy[]): ManagedWaveEnemy[] {
    out.length = 0;
    for (const enemy of this.enemies) {
      if (enemy.entity.alive) out.push(enemy);
    }
    return out;
  }

  /** Cache de getWaveInfo: los consumidores solo leen, nunca mutan. */
  private readonly waveInfoCache: WaveInfo = {
    wave: 1,
    label: '',
    floorMode: 'basic',
    remaining: 0,
  };

  // -------------------------------------------------------------------------
  // Modo Entrenamiento / Debug
  // -------------------------------------------------------------------------

  /**
   * Modo Entrenamiento: spawnea un único enemigo en `homePos` (p. ej. delante
   * de Nyx), borrando cualquier enemigo anterior y los proyectiles en vuelo.
   */
  spawnSingleEnemy(
    archetype: EnemyArchetype,
    homePos: THREE.Vector3,
    activeSlabs?: SlabCollider[],
  ): ManagedWaveEnemy | null {
    this.clearEnemies();
    this.deactivateAllProjectiles();
    deactivateKronosRings(this);
    const rng = makeRng(Math.floor(Math.random() * 0x7fffffff) || 1);
    this.spawnEnemy(archetype, 0, rng, activeSlabs, homePos);
    return this.enemies[this.enemies.length - 1] ?? null;
  }

  /**
   * Modo Entrenamiento: alterna el comportamiento ofensivo de todos los
   * enemigos vivos. Con `passive` son sacos de boxeo: no atacan, no disparan
   * ni ejecutan dashes evasivos (siguen siendo golpeables y noqueables).
   */
  setEnemiesPassive(passive: boolean): void {
    if (this.enemiesPassive === passive) {
      return;
    }
    this.enemiesPassive = passive;
    if (passive) {
      this.deactivateAllProjectiles();
      deactivateKronosRings(this);
      for (const internal of this.internals.values()) {
        this.resetEnemyOffense(internal);
      }
    }
  }

  /** Cancela todo ataque/telegraph en curso y devuelve al enemigo a reposo. */
  private resetEnemyOffense(internal: EnemyInternal): void {
    internal.enemy.attackTimer = 1.5;
    internal.enemy.entity.mouthOpen = false;
    internal.enemy.entity.spikesActive = false;
    internal.chargeTimer = 0;
    internal.burstTimer = 0;
    internal.burstShotsLeft = 0;
    internal.golemPhase = 'idle';
    internal.golemTimer = 0;
    if (internal.kronosState === 'coil' && internal.kronosFleshRestore > 0) {
      internal.enemy.entity.fleshThickness = internal.kronosFleshRestore;
      internal.kronosFleshRestore = 0;
    }
    internal.kronosState = 'roam';
    internal.kronosTimer = 0;
    internal.kronosRingsLeft = 0;
    internal.kronosJawOpen = 0;
    // Célula Abisal: cancela cualquier fase ofensiva/telegraph en curso.
    if (internal.cellState !== 'seek' && internal.cellState !== 'stalk') {
      internal.cellState = 'stalk';
      internal.cellTimer = 0;
      internal.cellLungeLeft = 0;
    }
    internal.cellHitTimer = 0;
  }

  // -------------------------------------------------------------------------
  // Contexto de la Célula Abisal (CellBehaviorContext)
  // -------------------------------------------------------------------------

  getCurrentWave(): number {
    return this.currentWave;
  }

  isEnemiesPassive(): boolean {
    return this.enemiesPassive;
  }

  /**
   * Duplicación de la Célula Abisal: spawnea la hija junto a la madre (a
   * HP completo pero con EXP reducida) y deja a la madre al 60% de su HP.
   */
  spawnCellChild(mother: ManagedWaveEnemy, offset: THREE.Vector3): void {
    const rng = makeRng(Math.floor(Math.random() * 0x7fffffff) || 1);
    const homePos = mother.position.clone().add(offset);
    const index = this.enemies.length;
    this.spawnEnemy('abyssal_cell', index, rng, undefined, homePos);
    const child = this.enemies[index];
    if (child) {
      child.entity.expValue = CELL_CHILD_EXP;
      child.attackTimer = 1.5;
    }
    mother.entity.hp = Math.max(1, mother.entity.hp * 0.6);
  }

  /**
   * Impacto de patada/taladro de Nyx: knockback físico + flash, sincronizado
   * con la entidad de combate. Acepta cualquier `TestEnemySphere` (el
   * controller no necesita conocer `ManagedWaveEnemy`).
   */
  onHitEnemy(enemy: TestEnemySphere, hitDir: THREE.Vector3, isDrill: boolean, impactSpeed?: number): void {
    const internal = this.internals.get(enemy.id);
    if (!internal) {
      return;
    }
    const kineticMult = Math.max(0.6, Math.pow((impactSpeed ?? 16) / 14, 1.35));
    const baseKnockback = isDrill ? HIT_KNOCKBACK_DRILL : HIT_KNOCKBACK;
    internal.enemy.velocity.addScaledVector(hitDir, baseKnockback * kineticMult);
    internal.enemy.hitFlash = Math.min(1.8, kineticMult);
    internal.enemy.entity.hitFlash = internal.enemy.hitFlash;
    // Un golpe interrumpe la embestida en curso.
    internal.chargeTimer = 0;
    // Célula Abisal: flinch de cell_hit (la FSM ya corta la duplicación por
    // el pico de hitFlash).
    if (internal.enemy.entity.archetype === 'abyssal_cell' && internal.actions) {
      internal.cellHitTimer = 0.2;
    }
  }

  /**
   * Elimina un enemigo (escena + materiales + listas). Idempotente.
   *
   * Con `withVfx` la malla no desaparece de golpe: queda en `dying` vibrando
   * `DEATH_SHAKE_TIME` y luego se infla y estalla. El enemigo sale de
   * `enemies` al instante, así que la lógica de juego no cambia.
   *
   * Devuelve true sólo la primera vez (el caller lo usa para soltar la EXP
   * una única vez aunque el combate ya hubiera marcado `entity.alive = false`).
   */
  killEnemy(enemy: ManagedWaveEnemy, withVfx = true): boolean {
    const internal = this.internals.get(enemy.id);
    if (!internal) {
      return false;
    }
    enemy.entity.alive = false;
    enemy.entity.hp = 0;
    this.internals.delete(enemy.id);
    const idx = this.enemies.indexOf(enemy);
    if (idx >= 0) {
      this.enemies.splice(idx, 1);
    }

    const materials = this.collectEnemyMaterials(enemy, internal);
    if (withVfx) {
      this.dying.push({
        mesh: enemy.mesh,
        basePos: enemy.mesh.position.clone(),
        baseScale: enemy.mesh.scale.clone(),
        elapsed: 0,
        radius: enemy.radius,
        color: this.visuals[enemy.entity.archetype].color,
        materials,
        exploded: false,
      });
      return true;
    }
    this.scene.remove(enemy.mesh);
    for (const material of materials) material.dispose();
    return true;
  }

  /** Materiales propios de la instancia (se liberan al terminar la muerte). */
  private collectEnemyMaterials(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
  ): THREE.Material[] {
    const materials = new Set<THREE.Material>();
    if (internal.material) materials.add(internal.material);
    if (internal.outlineMaterial) materials.add(internal.outlineMaterial);
    // Carne nebulosa + contornos vibrantes: material propio por instancia.
    for (const animatedMaterial of internal.animatedMaterials) {
      materials.add(animatedMaterial);
    }
    // Estrella interior y piezas: material propio por enemigo.
    for (const child of enemy.mesh.children) {
      if (child instanceof THREE.Mesh) materials.add(child.material as THREE.Material);
    }
    return [...materials];
  }

  /** Avanza temblor, estallido y limpieza de los enemigos moribundos. */
  private updateDying(dt: number): void {
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const dying = this.dying[i];
      dying.elapsed += dt;

      if (dying.elapsed < DEATH_SHAKE_TIME) {
        // Vibración de alta frecuencia que crece hacia el estallido, con
        // estrujón de escala para que se lea como un cuerpo a punto de romper.
        const k = dying.elapsed / DEATH_SHAKE_TIME;
        const amp = 0.06 + 0.3 * k;
        dying.mesh.position.set(
          dying.basePos.x + Math.sin(dying.elapsed * 92) * amp,
          dying.basePos.y + Math.cos(dying.elapsed * 77) * amp,
          dying.basePos.z + Math.sin(dying.elapsed * 83 + 1.7) * amp,
        );
        dying.mesh.rotation.z = Math.sin(dying.elapsed * 70) * 0.2 * k;
        const squash = 1 + Math.sin(dying.elapsed * 110) * 0.09 * k;
        dying.mesh.scale.copy(dying.baseScale).multiplyScalar(squash);
        continue;
      }

      if (!dying.exploded) {
        dying.exploded = true;
        dying.mesh.position.copy(dying.basePos);
        dying.mesh.rotation.z = 0;
        this.onEnemyExplode?.(dying.basePos, dying.radius, dying.color);
      }

      const pop = (dying.elapsed - DEATH_SHAKE_TIME) / DEATH_POP_TIME;
      if (pop >= 1) {
        this.scene.remove(dying.mesh);
        for (const material of dying.materials) material.dispose();
        this.dying.splice(i, 1);
        continue;
      }
      // Inflado final: el cuerpo se hincha justo cuando estalla.
      dying.mesh.scale.copy(dying.baseScale).multiplyScalar(1 + pop * 0.7);
    }
  }

  /**
   * true mientras el enemigo salta entre suelos (el Cangrejo Artillero en
   * pleno arco no muere por la Barrera Blanca).
   */
  isEnemyJumping(enemy: TestEnemySphere): boolean {
    return (this.internals.get(enemy.id)?.jump ?? null) !== null;
  }

  /**
   * Update por frame: flotación, dashes evasivos, ataques (proyectiles
   * oscuros / tinta / embestidas / ráfaga del Ave con boca abierta / manotazo
   * del Gólem), pinchos y ventana vulnerable de Necrozma, cangrejo pegado a
   * `activeSlabs` (con saltos entre ellos), colisión de voladores contra los
   * icebergs y proyectiles en vuelo.
   *
   * `onGolemSmash` se dispara cuando el manotazo brutal del Gólem alcanza a
   * Nyx (daño + dirección de empuje para el `hit_stagger`) y `onSlabSmash`
   * cuando el manotazo rompe un suelo flotante cercano. Los Anillos de
   * Contención de KRONOS reutilizan `onGolemSmash` con daño 0 y un empuje
   * radial más fuerte (`pushSpeed`).
   */
  update(
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
    lockedEnemy: TestEnemySphere | null,
    playerAttackTime: number,
    playerVel: THREE.Vector3,
    playerAimForward: THREE.Vector3,
    playerDashing: boolean,
    activeSlabs: SlabCollider[] | undefined,
    onPlayerHit: (damage: number) => void,
    onOctopusInk: () => void,
    onGolemSmash?: (damage: number, pushDir: THREE.Vector3, pushSpeed?: number) => void,
    onSlabSmash?: (slab: SlabCollider) => void,
  ): { didEnemyEvadeDash: boolean } {
    let didEnemyEvadeDash = false;
    this.waveTime += dt;
    this.updateDying(dt);
    const lockedId = lockedEnemy?.id ?? null;

    // Enjambre de Células Abisales: foco de Nyx + slots de órbita + token.
    this.cellDirector.beginFrame(
      dt,
      this.enemies,
      playerPos,
      playerVel,
      playerAimForward,
      playerDashing,
      playerAttackTime,
      lockedId,
      lockedEnemy?.position ?? null,
    );

    // Iteración hacia atrás por índice: killEnemy hace splice de this.enemies
    // durante el bucle y así los índices pendientes no se desplazan (cero
    // allocations, antes era `[...this.enemies]` cada frame).
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      const internal = this.internals.get(enemy.id);
      if (!internal) {
        continue;
      }
      // Limpieza defensiva: si el DomeCombatSystem ya lo mató, lo retiramos.
      if (!enemy.entity.alive) {
        this.killEnemy(enemy);
        continue;
      }

      enemy.evadeCooldown = Math.max(0, enemy.evadeCooldown - dt);
      enemy.entity.evadeCooldown = enemy.evadeCooldown;
      if (enemy.hitFlash > 0) {
        enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * HIT_FLASH_DECAY);
        enemy.entity.hitFlash = enemy.hitFlash;
      }
      enemy.dashTimer = Math.max(0, enemy.dashTimer - dt);
      // Modo pasivo: la cuenta atrás de ataque queda congelada para que al
      // reactivar la IA el enemigo no descargue un ataque instantáneo.
      if (!this.enemiesPassive) {
        enemy.attackTimer -= dt;
      }
      // Ventana vulnerable del Necrozma (tras dash evasivo o ráfaga).
      if ((enemy.entity.vulnerableTimer ?? 0) > 0) {
        enemy.entity.vulnerableTimer = Math.max(0, (enemy.entity.vulnerableTimer ?? 0) - dt);
      }

      // Reloj de los shaders animados: carne nebulosa y contorno vibrante.
      for (const animatedMaterial of internal.animatedMaterials) {
        animatedMaterial.uniforms.uTime.value = elapsed;
      }

      // Rotación continua de la estrella interior en 2 ejes + vibración de
      // energía. Con clips embebidos (célula) el núcleo lo anima el GLB.
      if (!internal.actions) {
        for (const star of internal.starCores) {
          star.rotation.y += dt * 2.8;
          star.rotation.x += dt * 2.0;
          star.position.set(
            Math.sin(elapsed * 29 + enemy.phase) * 0.035,
            Math.cos(elapsed * 34 + enemy.phase) * 0.035,
            Math.sin(elapsed * 23 + enemy.phase * 1.4) * 0.035,
          );
        }
      }
      internal.mixer?.update(dt);

      // --- Dash evasivo: rompe el lock-in de los arquetipos escurridizos ---
      if (
        !this.enemiesPassive &&
        enemy.evasive &&
        enemy.id === lockedId &&
        enemy.evadeCooldown <= 0 &&
        (playerAttackTime >= EVADE_TRIGGER_ATTACK_TIME ||
          enemy.position.distanceTo(playerPos) < EVADE_TRIGGER_DISTANCE)
      ) {
        _toEnemy.subVectors(enemy.position, playerPos);
        const dist = _toEnemy.length();
        if (dist > 1e-4) {
          _toEnemy.divideScalar(dist);
          _perp.crossVectors(_toEnemy, _up);
          if (_perp.lengthSq() < 1e-4) {
            _perp.set(1, 0, 0);
          } else {
            _perp.normalize();
          }
          _perp.multiplyScalar(enemy.dashSign);
          enemy.dashSign = enemy.dashSign === 1 ? -1 : 1;

          enemy.velocity
            .copy(_perp)
            .multiplyScalar(EVASIVE_DASH_SPEED * this.speedMult)
            .addScaledVector(_up, EVASIVE_DASH_LIFT);
          enemy.dashTimer = EVASIVE_DASH_TIME;
          enemy.evadeCooldown = EVASIVE_COOLDOWN;
          enemy.hitFlash = Math.max(enemy.hitFlash, 0.35);
          didEnemyEvadeDash = true;
          // Prisma Necrozma: tras el dash evasivo abre su ventana vulnerable
          // (pinchos retraídos, star_core al alcance).
          if (enemy.entity.archetype === 'prisma_necrozma') {
            enemy.entity.vulnerableTimer = Math.max(
              enemy.entity.vulnerableTimer ?? 0,
              NECROZMA_VULN_SEC,
            );
          }
        }
      }

      // --- Movimiento ANTES del comportamiento: el cangrejo ancla a su suelo
      // y hereda su traslación/rotación del mismo paso físico, de modo que la
      // boca del cañón (turretNode) se calcula sobre la pose mundial ACTUAL
      // justo en el instante del disparo (sin desfase de un frame ni
      // "efecto Coriolis" sobre suelos móviles/giratorios).
      const isCrab = enemy.entity.archetype === 'crab_gunner';
      if (isCrab) {
        updateCrabEnemy(this, enemy, internal, dt, elapsed, playerPos, activeSlabs);
      } else if (enemy.entity.archetype === 'kronos_leviathan') {
        updateKronosMovement(this, enemy, internal, dt, elapsed);
      } else if (enemy.entity.archetype === 'abyssal_cell') {
        // Célula Abisal: FSM de oportunista (acecho, lunge, huida, duplicación)
        // con su propio ataque por contacto — no pasa por updateEnemyBehavior.
        updateCellEnemy(
          this,
          this.cellDirector,
          enemy,
          internal,
          dt,
          elapsed,
          activeSlabs,
          onPlayerHit,
        );
      } else {
        this.applyFloatMovement(enemy, internal, dt, elapsed);
      }

      // --- Comportamiento ofensivo por arquetipo (desactivado en modo pasivo) ---
      if (!this.enemiesPassive && enemy.entity.archetype !== 'abyssal_cell') {
        this.updateEnemyBehavior(
          enemy,
          internal,
          dt,
          playerPos,
          activeSlabs,
          onPlayerHit,
          onOctopusInk,
          onGolemSmash,
          onSlabSmash,
        );
      }

      // --- Voladores contra los icebergs: nunca atraviesan los suelos ---
      // (KRONOS en plena embestida los devora: los rompe en su lugar.)
      const kronosCharging =
        enemy.entity.archetype === 'kronos_leviathan' && internal.kronosState === 'charge';
      const crabOnSlab = isCrab && (internal.jump !== null || internal.attachedSlabId !== null);
      if (
        activeSlabs &&
        !crabOnSlab &&
        !kronosCharging &&
        resolveSphereSlabCollision(activeSlabs, enemy.position, enemy.radius, _slabContact)
      ) {
        enemy.position.addScaledVector(_slabContact.normal, _slabContact.depth);
        const into = enemy.velocity.dot(_slabContact.normal);
        if (into < 0) {
          // Reflejo suave de la velocidad contra la normal del slab.
          enemy.velocity.addScaledVector(
            _slabContact.normal,
            -into * (1 + SLAB_BOUNCE_RESTITUTION),
          );
        }
      }

      // --- Pose procedural: el pulpo encara a Nyx y ondea sus tentáculos ---
      if (enemy.entity.archetype === 'spiral_octopus') {
        this.updateOctopusPose(enemy, internal, dt, elapsed, playerPos);
      } else if (enemy.entity.archetype === 'giant_sparrow') {
        this.updateSparrowPose(enemy, internal, dt, elapsed, playerPos);
      } else if (enemy.entity.archetype === 'prisma_necrozma') {
        this.updateNecrozmaPose(enemy, internal, dt, elapsed, playerPos);
      } else if (enemy.entity.archetype === 'ground_golem') {
        this.updateGolemPose(enemy, internal, dt, elapsed, playerPos);
      } else if (enemy.entity.archetype === 'kronos_leviathan') {
        updateKronosPose(this, enemy, internal, dt, elapsed, playerPos);
      } else if (enemy.entity.archetype === 'abyssal_cell') {
        this.updateCellPose(enemy, internal, dt, elapsed);
      }

      enemy.entity.position.copy(enemy.position);
      enemy.entity.velocity.copy(enemy.velocity);

      // --- Flash de impacto + vibración de energía descontrolada + pinchos ---
      const flash = enemy.hitFlash;
      const baseScale = 1 + flash * HIT_FLASH_SCALE;
      enemy.mesh.scale.set(
        baseScale + Math.sin(elapsed * 27 + enemy.phase) * 0.026,
        baseScale + Math.cos(elapsed * 31 + enemy.phase) * 0.026,
        baseScale + Math.sin(elapsed * 24 + enemy.phase * 1.7) * 0.026,
      );
      let emissive = flash * HIT_FLASH_EMISSIVE;
      if (internal.material) {
        if (enemy.entity.spikesActive) {
          emissive += 0.5;
          internal.material.uniforms.uRimColor.value.setHex(NECROZMA_SPIKES_RIM);
        } else if (enemy.entity.archetype === 'prisma_necrozma') {
          internal.material.uniforms.uRimColor.value.setHex(NECROZMA_BASE_RIM);
        }
        internal.material.uniforms.uEmissiveBoost.value = emissive;
      }
    }

    this.updateProjectiles(dt, playerPos, onPlayerHit, onOctopusInk);
    updateKronosRings(this, dt, playerPos, onGolemSmash);

    return { didEnemyEvadeDash };
  }

  dispose(): void {
    this.unsubModelLoaded();
    this.clearEnemies();
    this.deactivateAllProjectiles();
    for (const projectile of this.projectiles) {
      this.scene.remove(projectile.mesh);
    }
    this.projectileGeometry.dispose();
    this.darkProjectileMaterial.dispose();
    this.inkProjectileMaterial.dispose();
    for (const ring of this.kronosRings) {
      this.scene.remove(ring.mesh);
    }
    this.kronosRings.length = 0;
    this.kronosRingGeometry.dispose();
    this.kronosRingMaterial.dispose();
    for (const visual of Object.values(this.visuals)) {
      visual.geometry.dispose();
    }
    this.starGeometry.dispose();
    this.projectiles.length = 0;
  }

  // -------------------------------------------------------------------------
  // Comportamiento ofensivo
  // -------------------------------------------------------------------------

  private updateEnemyBehavior(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    dt: number,
    playerPos: THREE.Vector3,
    activeSlabs: SlabCollider[] | undefined,
    onPlayerHit: (damage: number) => void,
    onOctopusInk: () => void,
    onGolemSmash?: (damage: number, pushDir: THREE.Vector3, pushSpeed?: number) => void,
    onSlabSmash?: (slab: SlabCollider) => void,
  ): void {
    const archetype = enemy.entity.archetype;

    // Ave Legendaria: ráfaga en curso (telegraph + 3 esferas, boca abierta).
    if (archetype === 'giant_sparrow') {
      if (this.updateSparrowBurst(enemy, internal, dt, playerPos)) {
        return;
      }
      enemy.entity.mouthOpen = false;
    }

    // Prisma Necrozma: saca los pinchos cuando Nyx se acerca de frente
    // (< 10 m); en su ventana vulnerable (tras dash o ráfaga) los retrae.
    if (archetype === 'prisma_necrozma') {
      const vulnerable = (enemy.entity.vulnerableTimer ?? 0) > 0;
      const near = enemy.position.distanceTo(playerPos) < NECROZMA_SPIKES_RANGE;
      enemy.entity.spikesActive = near && !vulnerable;
    }

    // Gólem Rompesuelos: máquina de estados del manotazo brutal.
    if (archetype === 'ground_golem') {
      this.updateGolemAttack(enemy, internal, dt, playerPos, activeSlabs, onGolemSmash, onSlabSmash);
      return;
    }

    // Leviatán KRONOS: máquina de estados de sus 3 patrones de ataque.
    if (archetype === 'kronos_leviathan') {
      updateKronosAttack(this, 
        enemy,
        internal,
        dt,
        playerPos,
        activeSlabs,
        onPlayerHit,
        onGolemSmash,
        onSlabSmash,
      );
      return;
    }

    // Contacto de embestida en curso: daño a Nyx y fin de la carga.
    if (internal.chargeTimer > 0) {
      const dist = enemy.position.distanceTo(playerPos);
      if (dist < enemy.radius + CHARGE_CONTACT_PADDING) {
        onPlayerHit(internal.chargeDamage);
        internal.chargeTimer = 0;
        enemy.attackTimer = 3.2 / this.speedMult;
        // Rebote del propio enemigo tras embestir.
        enemy.velocity.copy(internal.chargeDir).multiplyScalar(-8);
      }
      return;
    }

    if (enemy.attackTimer > 0) {
      return;
    }

    const mult = this.speedMult;

    switch (archetype) {
      case 'crab_gunner':
        // Torreta: dispara esferas oscuras lentas desde la boca del cañón.
        // En pleno salto entre suelos aguanta el disparo hasta aterrizar.
        if (internal.jump) {
          enemy.attackTimer = 0.35;
          break;
        }
        if (computeCrabMuzzle(internal, _muzzlePos)) {
          this.fireProjectile(enemy, playerPos, 'dark', 8, 10 * mult, 0, _muzzlePos);
        } else {
          this.fireProjectile(enemy, playerPos, 'dark', 8, 10 * mult);
        }
        enemy.attackTimer = 2.8 / mult;
        break;

      case 'spiral_octopus': {
        // Chorro de tinta desde el frente del manto: mancha la pantalla de Nyx.
        _muzzleDir.subVectors(playerPos, enemy.position);
        if (_muzzleDir.lengthSq() < 1e-4) {
          _muzzleDir.set(0, 0, 1);
        } else {
          _muzzleDir.normalize();
        }
        _muzzlePos
          .copy(enemy.position)
          .addScaledVector(_muzzleDir, enemy.radius * OCTOPUS_INK_FORWARD)
          .addScaledVector(_up, enemy.radius * OCTOPUS_INK_UP);
        this.fireProjectile(enemy, playerPos, 'ink', 0, 8 * mult, 0, _muzzlePos);
        enemy.attackTimer = 4.5 / mult;
        break;
      }

      case 'giant_sparrow':
        // Élite: alterna embestida aérea (picado) y ráfaga de 3 esferas oscuras
        // por la boca (que abre durante el telegraph + disparo).
        if (internal.nextAttack === 'charge') {
          this.startCharge(enemy, internal, playerPos, 21 * mult, SPARROW_CHARGE_DAMAGE);
          internal.nextAttack = 'burst';
          enemy.attackTimer = 3.2 / mult;
        } else {
          internal.burstTimer = SPARROW_BURST_WINDOW_SEC;
          internal.burstShotsLeft = SPARROW_BURST_FIRE_AT.length;
          enemy.entity.mouthOpen = true;
          internal.nextAttack = 'charge';
          enemy.attackTimer = SPARROW_BURST_WINDOW_SEC + 3.2 / mult;
        }
        break;

      case 'prisma_necrozma': {
        // Élite: ráfaga prismática de 2 esferas; tras disparar abre su
        // ventana vulnerable (pinchos retraídos, star_core rematable).
        this.fireProjectile(enemy, playerPos, 'dark', 10, 11 * mult, -0.14);
        this.fireProjectile(enemy, playerPos, 'dark', 10, 11 * mult, 0.14);
        enemy.entity.vulnerableTimer = Math.max(
          enemy.entity.vulnerableTimer ?? 0,
          NECROZMA_VULN_SEC,
        );
        enemy.attackTimer = 2.4 / mult;
        break;
      }

      case 'lightning_butterfly':
      case 'abyssal_cell':
      default:
        // Pasivos/escurridizos: sin ataque ofensivo propio (el gólem se
        // gestiona en updateGolemAttack).
        enemy.attackTimer = 1.0;
        break;
    }
  }

  /**
   * Progresa la ráfaga del Ave Legendaria: boca abierta (mouthOpen), frenado
   * suave en el aire y 3 esferas oscuras desde el hueso `jaw`. Devuelve true
   * mientras la ráfaga siga en curso.
   */
  private updateSparrowBurst(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    dt: number,
    playerPos: THREE.Vector3,
  ): boolean {
    if (internal.burstTimer <= 0) {
      return false;
    }
    internal.burstTimer -= dt;
    enemy.entity.mouthOpen = true;
    // Se frena en el aire mientras telegrafiza y dispara.
    enemy.velocity.multiplyScalar(Math.exp(-2.5 * dt));

    const shotIndex = SPARROW_BURST_FIRE_AT.length - internal.burstShotsLeft;
    if (
      internal.burstShotsLeft > 0 &&
      shotIndex < SPARROW_BURST_FIRE_AT.length &&
      internal.burstTimer <= SPARROW_BURST_FIRE_AT[shotIndex]
    ) {
      this.fireSparrowShot(enemy, internal, playerPos, (shotIndex - 1) * 0.12);
      internal.burstShotsLeft--;
    }
    if (internal.burstTimer <= 0) {
      enemy.entity.mouthOpen = false;
    }
    return true;
  }

  /** Esfera oscura del Ave naciendo en la boca (hueso `jaw`). */
  private fireSparrowShot(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    playerPos: THREE.Vector3,
    spreadRad: number,
  ): void {
    const jaw = internal.sparrowRig?.jaw;
    if (jaw) {
      jaw.bone.updateWorldMatrix(true, false);
      jaw.bone.getWorldPosition(_muzzlePos);
    } else {
      _muzzlePos.copy(enemy.position);
    }
    this.fireProjectile(
      enemy,
      playerPos,
      'dark',
      SPARROW_BURST_DAMAGE,
      13 * this.speedMult,
      spreadRad,
      _muzzlePos,
    );
  }

  /**
   * Gólem Rompesuelos: manotazo brutal con telegraph de 0.75 s (torsión de
   * spine/chest + brazo gigante alzado + detail_fist pulsando neón), golpe
   * rápido contra el punto de impacto y recuperación. Si alcanza a Nyx la
   * empuja con hit_stagger (vía `onGolemSmash`) y si rompe un suelo flotante
   * cercano lo destroza (vía `onSlabSmash`).
   */
  private updateGolemAttack(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    dt: number,
    playerPos: THREE.Vector3,
    activeSlabs: SlabCollider[] | undefined,
    onGolemSmash?: (damage: number, pushDir: THREE.Vector3) => void,
    onSlabSmash?: (slab: SlabCollider) => void,
  ): void {
    switch (internal.golemPhase) {
      case 'windup':
        internal.golemTimer -= dt;
        if (internal.golemTimer <= 0) {
          // Fija el punto de impacto: delante del golem hacia Nyx.
          _aimDir.subVectors(playerPos, enemy.position);
          if (_aimDir.lengthSq() < 1e-4) {
            _aimDir.set(0, 0, 1);
          } else {
            _aimDir.normalize();
          }
          internal.golemImpact
            .copy(enemy.position)
            .addScaledVector(_aimDir, enemy.radius + GOLEM_SMASH_REACH);
          internal.golemPhase = 'smash';
          internal.golemTimer = GOLEM_SMASH_SWING_SEC;
        }
        return;

      case 'smash':
        internal.golemTimer -= dt;
        if (internal.golemTimer <= 0) {
          // El manotazo alcanza a Nyx: empuje + breve aturdimiento.
          if (playerPos.distanceTo(internal.golemImpact) < GOLEM_SMASH_HIT_RADIUS) {
            _aimDir.subVectors(playerPos, internal.golemImpact);
            if (_aimDir.lengthSq() < 1e-4) {
              _aimDir.set(0, 1, 0);
            } else {
              _aimDir.normalize();
            }
            onGolemSmash?.(GOLEM_SMASH_DAMAGE, _aimDir);
          }
          // Rompe el suelo flotante más cercano al punto de impacto.
          if (activeSlabs && onSlabSmash) {
            let best: SlabCollider | null = null;
            let bestDist = GOLEM_SLAB_BREAK_RADIUS;
            for (const slab of activeSlabs) {
              const d = slab.center.distanceTo(internal.golemImpact);
              if (d < bestDist) {
                best = slab;
                bestDist = d;
              }
            }
            if (best) {
              onSlabSmash(best);
            }
          }
          internal.golemPhase = 'recover';
          internal.golemTimer = GOLEM_SMASH_RECOVER_SEC;
          enemy.attackTimer = 3.4 / this.speedMult;
        }
        return;

      case 'recover':
        internal.golemTimer -= dt;
        if (internal.golemTimer <= 0) {
          internal.golemPhase = 'idle';
        }
        return;

      case 'idle':
      default:
        if (
          enemy.attackTimer <= 0 &&
          enemy.position.distanceTo(playerPos) < GOLEM_SMASH_TRIGGER_DISTANCE
        ) {
          internal.golemPhase = 'windup';
          internal.golemTimer = GOLEM_SMASH_WINDUP_SEC;
          enemy.hitFlash = Math.max(enemy.hitFlash, 0.2);
        } else if (enemy.attackTimer <= 0) {
          enemy.attackTimer = 0.4;
        }
        return;
    }
  }

  // -------------------------------------------------------------------------
  // Leviatán KRONOS: serpenteo con huesos + 3 patrones de ataque (sección 6.4)
  // -------------------------------------------------------------------------

  /**
   * Máquina de estados de los 3 ataques de KRONOS:
   * 1. Tramo Devorasuelos — embiste en línea atravesando la arena; los suelos
   *    flotantes que cruza cerca se rompen en escombros agarrables (onSlabSmash).
   * 2. Anillos de Contención — abre el hueso `jaw` (~0.8 s de telegraph) y emite
   *    1–3 ondas circulares expansivas que empujan a Nyx hacia la Barrera.
   * 3. Enrosco Gravitatorio — bajo el 50% de vida orbita el centro de la cúpula
   *    disparando una espiral continua de esferas oscuras mientras protege sus
   *    segmentos internos (carne al máximo).
   */
  private startCharge(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    playerPos: THREE.Vector3,
    speed: number,
    damage: number,
  ): void {
    internal.chargeDir.subVectors(playerPos, enemy.position);
    if (internal.chargeDir.lengthSq() < 1e-4) {
      internal.chargeDir.set(0, 0, 1);
    } else {
      internal.chargeDir.normalize();
    }
    internal.chargeSpeed = speed;
    internal.chargeDamage = damage;
    internal.chargeTimer = 1.2;
    enemy.hitFlash = Math.max(enemy.hitFlash, 0.25);
  }

  /**
   * Dispara un proyectil del pool hacia Nyx. Con `origin` (boca del cañón o
   * frente del manto) nace allí y sale rugiendo hacia el jugador; sin él,
   * nace en el borde de la esfera del enemigo. Con `dirOverride` (espiral del
   * Enrosco de KRONOS) sale en esa dirección exacta en vez de apuntar a Nyx.
   */
  fireProjectile(
    enemy: ManagedWaveEnemy,
    playerPos: THREE.Vector3,
    kind: 'dark' | 'ink',
    damage: number,
    speed: number,
    spreadRad = 0,
    origin?: THREE.Vector3,
    dirOverride?: THREE.Vector3,
  ): void {
    const projectile = this.projectiles.find((p) => !p.active);
    if (!projectile) {
      return;
    }
    const from = origin ?? enemy.position;
    if (dirOverride) {
      _shotDir.copy(dirOverride);
    } else {
      _shotDir.subVectors(playerPos, from);
      if (_shotDir.lengthSq() < 1e-4) {
        _shotDir.set(0, 0, 1);
      } else {
        _shotDir.normalize();
      }
    }
    if (spreadRad !== 0) {
      _perp.crossVectors(_shotDir, _up);
      if (_perp.lengthSq() < 1e-4) {
        _perp.set(1, 0, 0);
      } else {
        _perp.normalize();
      }
      _shotDir.addScaledVector(_perp, spreadRad).normalize();
    }

    projectile.active = true;
    projectile.kind = kind;
    projectile.damage = damage;
    projectile.life = PROJECTILE_LIFE_SEC;
    projectile.velocity.copy(_shotDir).multiplyScalar(speed);
    projectile.mesh.material = kind === 'ink' ? this.inkProjectileMaterial : this.darkProjectileMaterial;
    projectile.mesh.position.copy(from).addScaledVector(
      _shotDir,
      origin ? 0.35 : enemy.radius + 0.6,
    );
    projectile.mesh.visible = true;
  }

  private updateProjectiles(
    dt: number,
    playerPos: THREE.Vector3,
    onPlayerHit: (damage: number) => void,
    onOctopusInk: () => void,
  ): void {
    for (const projectile of this.projectiles) {
      if (!projectile.active) {
        continue;
      }
      projectile.life -= dt;
      projectile.mesh.position.addScaledVector(projectile.velocity, dt);

      const hitPlayer =
        projectile.mesh.position.distanceTo(playerPos) <
        PROJECTILE_PLAYER_RADIUS + projectile.mesh.scale.x * 0.55;
      const outOfBounds = projectile.mesh.position.length() > PROJECTILE_BOUND_RADIUS;

      if (hitPlayer) {
        if (projectile.kind === 'ink') {
          onOctopusInk();
        } else {
          onPlayerHit(projectile.damage);
        }
        this.deactivateProjectile(projectile);
      } else if (projectile.life <= 0 || outOfBounds) {
        this.deactivateProjectile(projectile);
      }
    }
  }

  private deactivateProjectile(projectile: WaveProjectile): void {
    projectile.active = false;
    projectile.mesh.visible = false;
    projectile.life = 0;
  }

  private deactivateAllProjectiles(): void {
    for (const projectile of this.projectiles) {
      this.deactivateProjectile(projectile);
    }
  }

  // -------------------------------------------------------------------------
  // Movimiento y pose procedural
  // -------------------------------------------------------------------------

  /**
   * Flotación estándar: bob senoidal + muelle hacia homePos (salvo dash o
   * embestida en curso) e integración de la velocidad en la posición.
   */
  applyFloatMovement(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    dt: number,
    elapsed: number,
  ): void {
    // Modo Entrenamiento (saco de boxeo): sin muelle ni bob; el knockback se
    // frena solo y el enemigo queda donde lo dejes para probar física/patadas.
    if (this.enemiesPassive) {
      enemy.velocity.multiplyScalar(Math.exp(-3.5 * dt));
      enemy.position.addScaledVector(enemy.velocity, dt);
      return;
    }
    const bob = Math.sin(elapsed * FLOAT_BOB_SPEED + enemy.phase) * FLOAT_BOB_AMPLITUDE;
    _toHome.subVectors(enemy.homePos, enemy.position);
    const homeDist = _toHome.length();
    _toHome.y += bob * 0.35;

    if (internal.chargeTimer > 0) {
      // Embestida: velocidad constante hacia Nyx, sin freno ni muelle.
      enemy.velocity.copy(internal.chargeDir).multiplyScalar(internal.chargeSpeed);
      internal.chargeTimer = Math.max(0, internal.chargeTimer - dt);
    } else if (enemy.dashTimer <= 0) {
      enemy.velocity.addScaledVector(_toHome, FLOAT_SPRING * dt);
      if (homeDist > LEASH_RADIUS) {
        _toHome.normalize();
        enemy.velocity.addScaledVector(_toHome, HOME_PULL * dt);
      }
      _flat.set(enemy.position.x, 0, enemy.position.z);
      const flatDist = _flat.length();
      if (flatDist > DOME_KEEP_RADIUS) {
        _flat.normalize();
        enemy.velocity.addScaledVector(_flat, -DOME_KEEP_PULL * dt);
      }
      enemy.velocity.multiplyScalar(Math.exp(-FLOAT_DAMPING * dt));
    } else {
      enemy.velocity.multiplyScalar(Math.exp(-0.25 * dt));
    }

    enemy.position.addScaledVector(enemy.velocity, dt);
  }

  /**
   * Célula Abisal: crossfade del clip que corresponde a su estado de FSM
   * (sneak/flee/windup/lunge/recover/duplicate), flinch de `cell_hit` al
   * recibir daño y orientación hacia la dirección de movimiento (el lunge
   * mira el salto comprometido). Sin GLB de clips, solo orienta.
   */
  private updateCellPose(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    dt: number,
    _elapsed: number,
  ): void {
    // Orientación: en windup/lunge mira el salto comprometido; si no, repta
    // de cara a su velocidad.
    if (internal.cellState === 'windup' || internal.cellState === 'lunge') {
      if (internal.cellLungeDir.lengthSq() > 1e-6) {
        _lookDir.copy(internal.cellLungeDir);
        faceTowards(enemy.mesh, _lookDir, 5.0, dt);
      }
    } else if (enemy.velocity.lengthSq() > 0.3) {
      _lookDir.copy(enemy.velocity).normalize();
      faceTowards(enemy.mesh, _lookDir, 3.0, dt);
    }

    if (!internal.actions) {
      // Forma provisional sin clips: la pose la pinta el wobble global.
      return;
    }

    // Clip deseado: el flinch de cell_hit pisa la FSM mientras dura.
    let clipName: string;
    if (internal.cellHitTimer > 0) {
      internal.cellHitTimer -= dt;
      clipName = 'cell_hit';
    } else if (this.enemiesPassive) {
      clipName = 'cell_idle_float';
    } else {
      switch (internal.cellState) {
        case 'windup':
          clipName = 'cell_windup';
          break;
        case 'lunge':
          clipName = 'cell_lunge';
          break;
        case 'recover':
          clipName = 'cell_recover';
          break;
        case 'flee':
          clipName = 'cell_flee_loop';
          break;
        case 'duplicate':
          clipName = 'cell_duplicate';
          break;
        case 'seek':
        case 'stalk':
        default:
          clipName = 'cell_sneak_loop';
          break;
      }
    }
    this.crossfadeCellAction(internal, clipName);
  }

  /** Crossfade suave entre clips de la célula (solo cuando cambia de clip). */
  private crossfadeCellAction(internal: EnemyInternal, clipName: string): void {
    const actions = internal.actions;
    if (!actions) {
      return;
    }
    const next = actions.get(clipName);
    if (!next || next === internal.currentClipAction) {
      return;
    }
    const prev = internal.currentClipAction;
    next.reset();
    next.fadeIn(0.12).play();
    if (prev) {
      prev.fadeOut(0.12);
    }
    internal.currentClipAction = next;
  }

  /** Pulpo: orientación suave hacia Nyx con balanceo en espiral y tentáculos ondeando. */
  private updateOctopusPose(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
  ): void {
    _lookDir.subVectors(playerPos, enemy.position);
    if (_lookDir.lengthSq() < 1e-6) {
      _lookDir.set(0, 0, 1);
    } else {
      _lookDir.normalize();
    }
    lookAtQuat(_lookDir, _up, _targetQuat);
    // Espiral: rodillo alrededor del eje de avance mientras se desplaza.
    _rollQuat.setFromAxisAngle(
      _lookDir,
      Math.sin(elapsed * OCTOPUS_SPIRAL_SPEED + enemy.phase) * OCTOPUS_SPIRAL_TILT,
    );
    _targetQuat.premultiply(_rollQuat);
    enemy.mesh.quaternion.slerp(_targetQuat, 1 - Math.exp(-OCTOPUS_TURN_RATE * dt));

    // Oscilación procedural de los tentáculos sobre su pose de reposo.
    for (let i = 0; i < internal.tentacles.length; i++) {
      const tentacle = internal.tentacles[i];
      _legWaveQuat.setFromAxisAngle(
        _legWaveAxis,
        Math.sin(elapsed * TENTACLE_WAVE_SPEED + enemy.phase + i) * tentacle.amplitude,
      );
      tentacle.bone.quaternion.copy(tentacle.rest).multiply(_legWaveQuat);
    }
  }

  /** Compone una rotación euleriana sobre la pose de reposo de un hueso. */
  poseBone(bone: EnemyBone | null, rotX: number, rotY: number, rotZ: number): void {
    if (!bone) {
      return;
    }
    _boneEuler.set(rotX, rotY, rotZ);
    _boneQuat.setFromEuler(_boneEuler);
    bone.bone.quaternion.copy(bone.rest).multiply(_boneQuat);
  }

  /**
   * Ave Legendaria Cristalizada: encara a Nyx, aleteo potente y coordinado de
   * las 4 alas (acelera antes del picado/embestida), movimiento orgánico de
   * cuello/cabeza/cola y apertura del hueso `jaw` durante la ráfaga, con el
   * star_core_mouth brillando al quedar expuesto.
   */
  private updateSparrowPose(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
  ): void {
    // Encara a Nyx con giro suave (también con la forma provisional).
    _lookDir.subVectors(playerPos, enemy.position);
    if (_lookDir.lengthSq() < 1e-6) {
      _lookDir.set(0, 0, 1);
    } else {
      _lookDir.normalize();
    }
    faceTowards(enemy.mesh, _lookDir, SPARROW_TURN_RATE, dt);

    const rig = internal.sparrowRig;
    if (!rig) {
      return;
    }

    // Aleteo coordinado: fase integrada para acelerar sin saltos bruscos.
    const preDive =
      internal.nextAttack === 'charge' && enemy.attackTimer > 0 && enemy.attackTimer < 0.7;
    const flapSpeed =
      internal.chargeTimer > 0 || preDive
        ? SPARROW_FLAP_SPEED_DIVE
        : internal.burstTimer > 0
          ? SPARROW_FLAP_SPEED_BURST
          : SPARROW_FLAP_SPEED_BASE;
    internal.flapPhase += flapSpeed * dt;
    const flap = Math.sin(internal.flapPhase);
    const flapLag = Math.sin(internal.flapPhase + 0.7);
    const flapQuad = Math.sin(internal.flapPhase + Math.PI * 0.5);
    this.poseBone(rig.wingTopLInner, flap * 0.5, 0, flap * 0.1);
    this.poseBone(rig.wingTopLOuter, flapLag * 0.75, 0, flapLag * 0.14);
    this.poseBone(rig.wingTopRInner, flap * 0.5, 0, -flap * 0.1);
    this.poseBone(rig.wingTopROuter, flapLag * 0.75, 0, -flapLag * 0.14);
    this.poseBone(rig.wingBotL, -flap * 0.45, 0, flapQuad * 0.08);
    this.poseBone(rig.wingBotR, -flap * 0.45, 0, -flapQuad * 0.08);

    // Cuello, cabeza y cola con vaivén orgánico independiente del aleteo.
    this.poseBone(
      rig.neck,
      Math.sin(elapsed * 0.8 + enemy.phase) * 0.09,
      Math.sin(elapsed * 1.2 + enemy.phase) * 0.14,
      0,
    );
    this.poseBone(rig.head, Math.sin(elapsed * 1.6 + enemy.phase * 1.3) * 0.2, 0, 0);
    this.poseBone(rig.tail, Math.sin(elapsed * 1.1) * 0.12, Math.sin(elapsed * 1.9 + enemy.phase) * 0.24, 0);

    // jaw: abre claramente durante la ráfaga (mouthOpen) y permanece cerrada
    // fuera de esa ventana.
    const targetOpen = enemy.entity.mouthOpen === true ? 1 : 0;
    internal.jawOpen += (targetOpen - internal.jawOpen) * Math.min(1, dt * 12);
    this.poseBone(rig.jaw, -SPARROW_JAW_OPEN_RAD * internal.jawOpen, 0, 0);

    // star_core_mouth: brilla intensamente mientras la boca está abierta.
    if (rig.mouthStarMaterial) {
      rig.mouthStarMaterial.uniforms.uEmissiveBoost.value =
        enemy.entity.mouthOpen === true
          ? 2.3 + Math.sin(elapsed * 14) * 0.3
          : STAR_CORE_EMISSIVE;
    }
  }

  /**
   * Prisma Necrozma: flotación amenazante encarando a Nyx, balanceo de brazos
   * y garras prismáticas, giro de cabeza y pinchos (`detail_spikes`) que se
   * escalan hacia fuera con brillo intenso al acercarse Nyx de frente y se
   * retraen (apagados) en la ventana vulnerable.
   */
  private updateNecrozmaPose(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
  ): void {
    _lookDir.subVectors(playerPos, enemy.position);
    if (_lookDir.lengthSq() < 1e-6) {
      _lookDir.set(0, 0, 1);
    } else {
      _lookDir.normalize();
    }
    faceTowards(enemy.mesh, _lookDir, NECROZMA_TURN_RATE, dt);

    const rig = internal.necrozmaRig;
    if (!rig) {
      return;
    }

    // Brazos/garras prismáticas ondeando; la cabeza gira escrutando a Nyx.
    this.poseBone(rig.shoulderL, 0, 0, Math.sin(elapsed * 1.8 + enemy.phase) * 0.15);
    this.poseBone(rig.armL, Math.sin(elapsed * 1.8 + 0.5 + enemy.phase) * 0.3, 0, 0);
    this.poseBone(rig.clawL, 0, Math.sin(elapsed * 2.2 + enemy.phase) * 0.35, 0);
    this.poseBone(rig.shoulderR, 0, 0, -Math.sin(elapsed * 1.8 + 0.9 + enemy.phase) * 0.15);
    this.poseBone(rig.armR, Math.sin(elapsed * 1.8 + 1.4 + enemy.phase) * 0.3, 0, 0);
    this.poseBone(rig.clawR, 0, Math.sin(elapsed * 2.2 + 1.1 + enemy.phase) * 0.35, 0);
    this.poseBone(rig.head, Math.sin(elapsed * 0.9) * 0.06, Math.sin(elapsed * 1.1 + enemy.phase) * 0.3, 0);
    this.poseBone(rig.tail, 0, Math.sin(elapsed * 1.4 + enemy.phase) * 0.28, 0);
    this.poseBone(rig.torso, Math.sin(elapsed * 1.3) * 0.04, 0, 0);

    // Pinchos defensivos: escalan hacia fuera (~1.35) con brillo intenso si
    // Nyx se acerca de frente; retraídos (~0.15) en la ventana vulnerable.
    const spikes = rig.spikes;
    if (spikes) {
      const vulnerable = (enemy.entity.vulnerableTimer ?? 0) > 0;
      const target = vulnerable
        ? NECROZMA_SPIKES_IN_SCALE
        : enemy.entity.spikesActive
          ? NECROZMA_SPIKES_OUT_SCALE
          : 1;
      internal.spikeScale += (target - internal.spikeScale) * Math.min(1, dt * 6);
      spikes.mesh.scale.setScalar(spikes.restScale * internal.spikeScale);
      if (spikes.material) {
        if (enemy.entity.spikesActive) {
          spikes.material.uniforms.uRimColor.value.setHex(NECROZMA_SPIKES_RIM);
          spikes.material.uniforms.uEmissiveBoost.value = 0.85 + Math.sin(elapsed * 11) * 0.4;
        } else {
          spikes.material.uniforms.uRimColor.value.setHex(NECROZMA_DETAIL_RIM);
          spikes.material.uniforms.uEmissiveBoost.value = 0.05;
        }
      }
    }
  }

  /**
   * Gólem Rompesuelos: gira lento hacia Nyx; durante el telegraph del manotazo
   * torsiona spine/chest, alza el brazo gigante y hace brillar/pulsar
   * `detail_fist` con intensidad neón; el swing descarga el golpe y la
   * recuperación devuelve los huesos a su pose de reposo.
   */
  private updateGolemPose(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
  ): void {
    _lookDir.subVectors(playerPos, enemy.position);
    if (_lookDir.lengthSq() < 1e-6) {
      _lookDir.set(0, 0, 1);
    } else {
      _lookDir.normalize();
    }
    faceTowards(enemy.mesh, _lookDir, GOLEM_TURN_RATE, dt);

    const rig = internal.golemRig;
    if (!rig) {
      return;
    }

    // Objetivos de pose por fase: ángulo del brazo gigante (negativo = alzado)
    // y torsión de spine/chest. El swing es mucho más rápido que el telegraph.
    let armTarget = 0;
    let twistTarget = 0;
    let lambda = 3;
    if (internal.golemPhase === 'windup') {
      armTarget = -1.15;
      twistTarget = -0.55;
      lambda = 5.5;
    } else if (internal.golemPhase === 'smash') {
      armTarget = 0.62;
      twistTarget = 0.28;
      lambda = 26;
    } else if (internal.golemPhase === 'recover') {
      lambda = 3.5;
    }
    const blend = 1 - Math.exp(-lambda * dt);
    internal.golemArmAngle += (armTarget - internal.golemArmAngle) * blend;
    internal.golemTwist += (twistTarget - internal.golemTwist) * blend;

    const arm = internal.golemArmAngle;
    const twist = internal.golemTwist;
    this.poseBone(rig.spine, Math.abs(twist) * 0.25, twist, 0);
    this.poseBone(rig.chest, 0, twist * 0.55, 0);
    this.poseBone(rig.head, Math.sin(elapsed * 0.7 + enemy.phase) * 0.08, -twist * 0.45, 0);
    this.poseBone(rig.giantShoulderR, arm, 0, 0);
    this.poseBone(rig.giantArmR, arm * 0.5, 0, 0);
    this.poseBone(rig.giantFistR, arm * 0.3, 0, 0);
    this.poseBone(rig.armLUpper, 0, 0, Math.sin(elapsed * 0.9 + enemy.phase) * 0.05);
    this.poseBone(rig.armLLower, Math.sin(elapsed * 1.2 + enemy.phase) * 0.06, 0, 0);

    // detail_fist: pulso neón creciente durante el telegraph y flash al descargar.
    const fist = rig.fist;
    if (fist) {
      let boost = 0.05;
      let pulse = 1;
      if (internal.golemPhase === 'windup') {
        const w = 1 - internal.golemTimer / GOLEM_SMASH_WINDUP_SEC;
        boost = 0.35 + w * (1.15 + Math.sin(elapsed * 20) * 0.45);
        pulse = 1 + w * 0.15;
      } else if (internal.golemPhase === 'smash') {
        boost = 1.6;
      }
      fist.mesh.scale.setScalar(fist.restScale * pulse);
      if (fist.material) {
        fist.material.uniforms.uEmissiveBoost.value = boost;
        fist.material.uniforms.uRimColor.value.setHex(GOLEM_FIST_NEON_RIM);
      }
    }
  }

  private clearEnemies(): void {
    for (const enemy of [...this.enemies]) {
      // Sin animación: al reiniciar la oleada los cuerpos se van de golpe.
      this.killEnemy(enemy, false);
    }
    this.enemies.length = 0;
    this.internals.clear();
    this.cellDirector.reset();
    for (const dying of this.dying) {
      this.scene.remove(dying.mesh);
      for (const material of dying.materials) material.dispose();
    }
    this.dying.length = 0;
  }
}
