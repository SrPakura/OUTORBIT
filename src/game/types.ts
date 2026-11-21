import type * as THREE from 'three';

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
  | 'seismic_mine';

export interface WorldObjectSpec {
  id: string;
  kind: InteractableKind;
  planetId: string;
  sphericalDir: [number, number, number];
  altitudeOffset?: number;
  radius?: number;
  yaw?: number;
}

export interface PlanetRuntime {
  spec: PlanetSpec;
  mesh: THREE.Group;
  centerVec: THREE.Vector3;
  shielded: boolean;
  shieldMesh?: THREE.Mesh;
}

// ============================================================================
// 3. ENEMIGOS E INTELIGENCIA ARTIFICIAL (INTRA-PLANETA E INTER-PLANETA)
// ============================================================================

export type EnemyKind = 'guard' | 'officer' | 'drone' | 'turret' | 'brute' | 'kronos';

export type EnemyAlertState = 'patrol' | 'suspicious' | 'searching' | 'combat' | 'knocked_out';

export interface EnemySpawnSpec {
  kind: EnemyKind;
  planetId: string;
  patrolDirs: [number, number, number][];
  hasHelmet?: boolean;
  pairedWithNext?: boolean;
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
  objects: WorldObjectSpec[];
  enemies: EnemySpawnSpec[];
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
