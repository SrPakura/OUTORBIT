import type * as THREE from 'three';
import type { TutorialId } from './levels/tutorialDefinitions';

// ============================================================================
// 1. PERSONAJES Y HABILIDADES DEL ESCUADRÓN
// ============================================================================

export type CharacterId = 'kitsune' | 'digger' | 'axel';

export interface CharacterProfile {
  id: CharacterId;
  keySlot: 1 | 2 | 3;
  displayName: string;
  title: string;
  accentColor: string;
  moveSpeed: number;
  jumpImpulse: number;
  gravityScale: number;
  anchorRange: number;
  canBurrow: boolean;
  swimSpeedMultiplier: number;
  stealthMultiplier: number;
}

// ============================================================================
// 2. PLANETAS, ESTRUCTURAS (EDIFICIOS), ENTORNOS Y OBJETOS DEL MUNDO
// ============================================================================

export type BiomeType = 'tutorial' | 'verdant' | 'cryo' | 'bastion' | 'kronos';

export type StructureKind =
  | 'wall'
  | 'tower'
  | 'bunker'
  | 'arch_gate'
  | 'platform'
  | 'pillar'
  | 'bridge';

/**
 * Edificio o estructura sobre la superficie de un planeta (o en órbita baja).
 * Define colisión real en espacio tangente local (halfExtents [x, height, z])
 * y bloquea la línea de visión de los enemigos.
 */
export interface StructureSpec {
  id: string;
  kind: StructureKind;
  planetId: string;
  sphericalDir: [number, number, number];
  /** Desplazamiento radial sobre la superficie (ej. plataformas aéreas). */
  altitudeOffset?: number;
  /** Giro local alrededor de la normal del planeta (radianes). */
  yaw?: number;
  /** Semi-anchos locales [halfWidthX, fullHeightY, halfDepthZ]. */
  size: [number, number, number];
  color: string;
  /** Si Digger puede cruzar por debajo excavando (muros/puertas). */
  passableUnderground?: boolean;
}

export interface PlanetSpec {
  id: string;
  order: number;
  name: string;
  subtitle: string;
  biome: BiomeType;
  center: [number, number, number];
  radius: number;
  gravityStrength: number;
  surfaceColor: string;
  patchColor: string;
  atmosphereColor: string;
  hasWaterShell?: boolean;
  waterRadius?: number;
  hasIcePatches?: boolean;
  hasOrbitalRings?: boolean;
  ringColor?: string;
  /** Planeta anterior necesario para desbloquear el escudo (null si abierto). */
  unlockedByPlanetId: string | null;
}

export interface WaterBubbleSpec {
  id: string;
  center: [number, number, number];
  radius: number;
}

export interface GrassZoneSpec {
  id: string;
  planetId: string;
  sphericalDir: [number, number, number];
  angularRadius: number;
}

/**
 * Zona restringida de un planeta (Hito 1): recintos fortificados, templos
 * sellados, reactores y la arena de KRONOS. Estar dentro (`trespassing`)
 * convierte cualquier avistamiento en infracción de escalada rápida;
 * aldeas, senderos, playas y campamentos quedan zonas públicas.
 */
export interface RestrictedZoneSpec {
  id: string;
  planetId: string;
  sphericalDir: [number, number, number];
  angularRadius: number;
  label: string;
}

export type InteractableKind =
  | 'rock'
  | 'barrel_explosive'
  | 'snowball'
  | 'crate'
  | 'generator'
  | 'keycard'
  | 'teleport_pipe'
  | 'teleporter_exit'
  | 'laser_gate'
  | 'scanner_gate'
  | 'seismic_mine'
  | 'locked_gate'
  | 'switch_lever'
  | 'breakable_wall';

export interface WorldObjectSpec {
  id: string;
  kind: InteractableKind;
  planetId: string;
  sphericalDir: [number, number, number];
  altitudeOffset?: number;
  radius?: number;
  yaw?: number;
  /** Dimensiones locales [halfX, heightY, halfZ] de `locked_gate` / `breakable_wall`. */
  size?: [number, number, number];
  /** `switch_lever`: id de la `locked_gate` que abre al activarse. */
  linkedGateId?: string;
  /** `locked_gate`: se abre con [E] si el jugador lleva alguna tarjeta/llave. */
  requiresKeycard?: boolean;
  /** `locked_gate`: si salta la alarma en su planeta, se cierra de golpe (lockdown). */
  lockdownOnAlert?: boolean;
}

// ============================================================================
// PROPS DECORATIVOS DE AMBIENTACIÓN (Aldea Feudal de Verdant, Cryo, Bastion)
// ============================================================================

export type PropKind =
  | 'torii_gate'
  | 'pagoda_house'
  | 'village_house'
  | 'paper_lantern'
  | 'bamboo_cluster'
  | 'pine_tree'
  | 'stone_path'
  | 'wood_bridge'
  | 'ice_crystal'
  | 'igloo'
  | 'pipe'
  | 'antenna'
  | 'reactor'
  | 'spotlight'
  // --- Selva Tropical (Verdant · Templos de Jade) ---
  | 'palm_tree'
  | 'fern_cluster'
  | 'ancient_statue'
  | 'vine_arch'
  // --- Shogunato Feudal Nevado (Kurogane · Planeta 2) ---
  | 'cherry_snow_tree'
  // --- Metrópoli Cyberpunk (Neon Bastion · Planeta 3) ---
  | 'neon_billboard'
  | 'cyber_tower'
  | 'holo_pillar'
  // --- Flora interactiva y rocas con colisión (Hito 2: terreno + props) ---
  | 'giant_flower'
  | 'glow_mushroom'
  | 'rock';

/**
 * Prop ambiental con colisión física real (Hito 2): troncos sólidos, techos
 * caminables, flores trampolín, follaje de sigilo y rocas escalables. Todos
 * se apoyan en la altura exacta del terreno esférico.
 */
export interface PropSpec {
  id: string;
  kind: PropKind;
  planetId: string;
  sphericalDir: [number, number, number];
  yaw?: number;
  scale?: number;
  /** Altura sobre la superficie (props sobre plataformas orbitales). */
  altitudeOffset?: number;
}

export interface PlanetRuntime {
  spec: PlanetSpec;
  mesh: THREE.Group;
  centerVec: THREE.Vector3;
  shielded: boolean;
  /** Cinturón de asteroides interceptores mientras el planeta siga protegido. */
  shieldMesh?: THREE.Object3D;
}

// ============================================================================
// 3. ENEMIGOS E INTELIGENCIA ARTIFICIAL (INTRA-PLANETA E INTER-PLANETA)
// ============================================================================

export type EnemyKind = 'guard' | 'officer' | 'drone' | 'turret' | 'brute' | 'kronos';

/**
 * Skin temática del modelo de un enemigo: la Selva Tropical de Verdant usa
 * animales salvajes (pantera, mono, gorila, avispa); los pasos 3 y 4 añadirán
 * samuráis/onis (Planeta 2) y guardias cibernéticos (Planeta 3).
 */
export type EnemySkin =
  | 'default'
  | 'panther'
  | 'monkey'
  | 'gorilla'
  | 'wasp'
  | 'samurai'
  | 'oni'
  | 'cyber_guard'
  | 'cyber_officer'
  | 'cyber_drone'
  | 'cyber_mech';

export type EnemyAlertState =
  | 'patrol'
  | 'suspicious'
  | 'warning'
  | 'searching'
  | 'combat'
  | 'knocked_out';

export interface EnemySpawnSpec {
  kind: EnemyKind;
  planetId: string;
  patrolDirs: [number, number, number][];
  /** Skin temática del modelo (por defecto 'default': uniforme de Kronos). */
  skin?: EnemySkin;
  hasHelmet?: boolean;
  pairedWithNext?: boolean;
  /** Al caer K.O. entrega la llave/tarjeta del sector (keycardsCollected++). */
  dropsKeycard?: boolean;
  /** Vigía estacionario en puesto elevado/torre: rota ±60º oteando el patio. */
  stationaryLookout?: boolean;
  /** Altura sobre la superficie (vigías encima de torres o murallas). */
  altitudeOffset?: number;
}

/** NPC amigable sobre la superficie de un planeta: pistas por diálogo [E]. */
export interface NpcSpec {
  id: string;
  name: string;
  role: string;
  planetId: string;
  sphericalDir: [number, number, number];
  yaw?: number;
  accentColor: string;
  dialogue: string[];
}

export interface PlayerBehaviorVector {
  stealthKnockouts: number;
  disguiseTimeSec: number;
  alarmsTriggered: number;
  bruteKills: number;
  aerialAttacks: number;
  burrowDistance: number;
  burrowTimeSec: number;
  stasisThrows: number;
  parriesLanded: number;
  damageTaken: number;
  totalTimeSec: number;
}

export interface BehaviorPercentages {
  stealth: number;
  aggression: number;
  aerial: number;
  subterranean: number;
  stasis: number;
}

export interface PlanetAdaptationConfig {
  baseAlertLevel: number;
  extraPatrolCount: number;
  armoredHelmets: boolean;
  pairGuardPatrols: boolean;
  doorScanners: boolean;
  seismicMines: boolean;
  antiAirTurrets: boolean;
  predictiveShields: boolean;
  summaryReasons: string[];
}

// ============================================================================
// 4. GALAXIA CONTINUA Y PROGRESIÓN
// ============================================================================

export type LevelId = 'prologue' | 'verdant' | 'cryo' | 'bastion' | 'kronos';

export interface LevelObjective {
  id: string;
  description: string;
  completed: boolean;
  currentCount: number;
  targetCount: number;
}

export interface GalaxySpec {
  skyTopColor: string;
  skyBottomColor: string;
  planets: PlanetSpec[];
  structures: StructureSpec[];
  waterBubbles: WaterBubbleSpec[];
  grassZones: GrassZoneSpec[];
  /** Zonas restringidas (patios fortificados, templos, reactores, arena). */
  restrictedZones?: RestrictedZoneSpec[];
  objects: WorldObjectSpec[];
  enemies: EnemySpawnSpec[];
  /** NPCs amigables con diálogo (pistas de puzle sin pausar el juego). */
  npcs?: NpcSpec[];
  /** Props ambientales (aldea feudal, cristales, maquinaria) sin colisión. */
  props?: PropSpec[];
  spawnPlanetId: string;
  spawnDir: [number, number, number];
}

export interface ObjectiveMarker {
  id: string;
  label: string;
  distanceMeters: number;
  /** Coordenadas normalizadas en pantalla (-1..1), clampeadas al borde si detrás. */
  screenX: number;
  screenY: number;
  inFront: boolean;
  color: string;
}

export interface RadioToast {
  title: string;
  lines: string[];
  accent: string;
}

/**
 * Hito 3 — Atribución cristalina del daño recibido: quién golpeó, por qué,
 * desde qué dirección respecto a la cámara y con qué intensidad se muestra
 * el flash rojo / chevrons direccional del HUD.
 */
export interface DamageFeedbackInfo {
  attacker: string;
  reason: string;
  /** Ángulo en radianes respecto a la cámara (0 = frente/arriba HUD, +PI/2 = derecha, PI = detrás). */
  directionRad: number | null;
  /** Intensidad del flash rojo y arco direccional (1 -> 0). */
  intensity: number;
  amount: number;
}

// ============================================================================
// 5. ESTADO DE JUEGO Y SNAPSHOT PARA HUD REACT
// ============================================================================

export type GamePhase =
  | 'title'
  | 'playing'
  | 'paused'
  | 'game_over'
  | 'victory';

export interface HudSnapshot {
  phase: GamePhase;
  levelId: LevelId;
  levelTitle: string;
  activeCharacter: CharacterId;
  unlockedCharacters: CharacterId[];
  hp: number;
  maxHp: number;
  isDisguised: boolean;
  suspicionRatio: number;
  globalAlert: boolean;
  isGravityShifting: boolean;
  gravityTargetName: string | null;
  gravityTargetBlockedReason: string | null;
  stasisHeldCount: number;
  isBurrowing: boolean;
  isSwimming: boolean;
  anchorCooldownRatio: number;
  parryWindowActive: boolean;
  activePlanetName: string;
  objectives: LevelObjective[];
  elapsedRunSec: number;
  pointerLocked: boolean;
  interactionPrompt: string | null;
  adaptation: PlanetAdaptationConfig;
  behaviorVector: PlayerBehaviorVector;
  bossHpRatio: number | null;
  bossAdaptedTo: CharacterId | null;
  gravityShiftCooldownRatio?: number;
  lockOnActive?: boolean;
  lockedTargetName?: string | null;
  lockOnScreenX?: number | null;
  lockOnScreenY?: number | null;
  muted?: boolean;
  kronosUpdates?: number;
  objectiveMarkers?: ObjectiveMarker[];
  radioToast?: RadioToast | null;
  /** Intensidad 0..1 de las líneas de velocidad cómic (sprint/dash/vuelo/picado). */
  speedLinesIntensity?: number;
  /** Deriva espacial: el jugador se alejó >260 m de toda superficie. */
  spaceDriftWarning?: boolean;
  /** Motivo específico de la derrota (null: texto por defecto del HUD). */
  gameOverReason?: string | null;
  /** Bocadillo de diálogo del NPC cercano (null: ninguno activo). */
  activeDialogue?: { speaker: string; role: string; text: string } | null;
  /** Tarjetas/llaves robadas que lleva el escuadrón (HUD si > 0). */
  keycardsCollected?: number;
  /** Un lockdown de compuertas saltó por la alarma (aviso HUD). */
  gateLockdownActive?: boolean;
  /**
   * Hito 1 — Banner de VIGILANCIA: un enemigo en modo WARNING te está
   * avisando (cono ámbar + chirp). null: ningún aviso activo.
   */
  warningBanner?: { speaker: string; text: string } | null;
  /**
   * Hito 3 — Atribución del último golpe: atacante, motivo, dirección
   * respecto a la cámara e intensidad del flash. null: sin feedback activo.
   */
  damageFeedback?: DamageFeedbackInfo | null;
  /** PASO B — Tutorial activo (null: campaña principal). */
  tutorialId?: TutorialId | null;
  /** Título legible del tutorial activo ("1 · Parkour, Combate y Parry"). */
  tutorialTitle?: string | null;
  /** Pasos de la lección del tutorial activo (checklist del HUD). */
  tutorialLessons?: string[];
  /** El tutorial activo ya cumplió su meta (tarjeta de victoria del HUD). */
  tutorialCompleted?: boolean;
}

// ============================================================================
// 6. LEADERBOARD EN BASE44
// ============================================================================

export interface LeaderboardEntryRecord {
  id?: string;
  player_name: string;
  clear_time_sec: number;
  score: number;
  dominant_style: string;
  stealth_pct: number;
  aggression_pct: number;
  aerial_pct: number;
  subterranean_pct: number;
  stasis_pct: number;
  alarms_triggered: number;
  created_date?: string;
}

// ============================================================================
// 7. CONSTANTES DE SIMULACIÓN COMPARTIDAS
// ============================================================================

export const GAME_CONSTANTS = {
  FIXED_MAX_DT: 0.05,
  GRAVITY_SHIFT_TIME_SCALE: 0.2,
  MAX_STASIS_OBJECTS: 4,
  PLAYER_MAX_HP: 3,
  CHARACTERS: {
    kitsune: {
      id: 'kitsune',
      keySlot: 1,
      displayName: 'Kitsune',
      title: 'Sigilo y Disfraces',
      accentColor: '#f97316',
      moveSpeed: 11.5,
      jumpImpulse: 14.0,
      gravityScale: 0.72,
      anchorRange: 20,
      canBurrow: false,
      swimSpeedMultiplier: 1.0,
      stealthMultiplier: 0.22,
    },
    digger: {
      id: 'digger',
      keySlot: 2,
      displayName: 'Digger',
      title: 'Subsuelo y Fuerza',
      accentColor: '#eab308',
      moveSpeed: 10.2,
      jumpImpulse: 12.5,
      gravityScale: 1.45,
      anchorRange: 15,
      canBurrow: true,
      swimSpeedMultiplier: 0.85,
      stealthMultiplier: 1.0,
    },
    axel: {
      id: 'axel',
      keySlot: 3,
      displayName: 'Axel',
      title: 'Agua, Aire y Parkour',
      accentColor: '#06b6d4',
      moveSpeed: 12.6,
      jumpImpulse: 15.0,
      gravityScale: 0.92,
      anchorRange: 30,
      canBurrow: false,
      swimSpeedMultiplier: 2.35,
      stealthMultiplier: 0.85,
    },
  } satisfies Record<CharacterId, CharacterProfile>,
} as const;
