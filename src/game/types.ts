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
  gravityScale: number;       // Kitsune < 1 (lunar), Digger > 1 (júpiter)
  anchorRange: number;        // Axel tiene mayor alcance
  canBurrow: boolean;         // Solo Digger
  swimSpeedMultiplier: number;// Axel supersónico en agua/burbujas
  stealthMultiplier: number;  // Kitsune casi indetectable en sigilo/hierba
}

// ============================================================================
// 2. PLANETAS, ENTORNOS Y OBJETOS DEL MUNDO
// ============================================================================

export type BiomeType = 'tutorial' | 'verdant' | 'cryo' | 'bastion' | 'kronos';

export interface PlanetSpec {
  id: string;
  name: string;
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
}

export interface WaterBubbleSpec {
  id: string;
  center: [number, number, number];
  radius: number;
}

/**
 * Zona de hierba alta sobre un planeta: casquete esférico de briznas instanciadas
 * que otorga sigilo total (especialmente a Kitsune) a quien esté dentro.
 */
export interface GrassZoneSpec {
  id: string;
  planetId: string;
  sphericalDir: [number, number, number];
  angularRadius: number; // radianes: radio angular del casquete de hierba
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
  sphericalDir: [number, number, number]; // Vector unitario desde el centro del planeta
  altitudeOffset?: number;
  radius?: number;
}

export interface PlanetRuntime {
  spec: PlanetSpec;
  mesh: THREE.Group;
  centerVec: THREE.Vector3;
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
  stealth: number;   // 0..100
  aggression: number;// 0..100
  aerial: number;    // 0..100
  subterranean: number; // 0..100
  stasis: number;    // 0..100
}

export interface PlanetAdaptationConfig {
  baseAlertLevel: number;        // 0..1
  extraPatrolCount: number;
  armoredHelmets: boolean;
  pairGuardPatrols: boolean;
  doorScanners: boolean;
  seismicMines: boolean;
  antiAirTurrets: boolean;
  predictiveShields: boolean;
  summaryReasons: string[];      // Explicación legible para el Battle Report / transición
}

// ============================================================================
// 4. NIVELES Y CAMPAÑA
// ============================================================================

export type LevelId = 'prologue' | 'verdant' | 'cryo' | 'bastion' | 'kronos';

export interface LevelObjective {
  id: string;
  description: string;
  completed: boolean;
  currentCount: number;
  targetCount: number;
}

export interface LevelSpec {
  id: LevelId;
  order: number;
  title: string;
  subtitle: string;
  skyTopColor: string;
  skyBottomColor: string;
  planets: PlanetSpec[];
  waterBubbles: WaterBubbleSpec[];
  grassZones?: GrassZoneSpec[];
  objects: WorldObjectSpec[];
  enemies: EnemySpawnSpec[];
  spawnPlanetId: string;
  spawnDir: [number, number, number];
  portalPlanetId: string;
  portalDir: [number, number, number];
  objectiveSummary: string;
}

// ============================================================================
// 5. ESTADO DE JUEGO Y SNAPSHOT PARA HUD REACT
// ============================================================================

export type GamePhase =
  | 'title'
  | 'playing'
  | 'paused'
  | 'planet_transition'
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
  suspicionRatio: number;        // 0..1
  globalAlert: boolean;
  isGravityShifting: boolean;    // Slow-mo 0.2x activo
  gravityTargetName: string | null;
  stasisHeldCount: number;       // 0..4
  isBurrowing: boolean;
  isSwimming: boolean;
  anchorCooldownRatio: number;   // 0 listo, 1 en cooldown
  parryWindowActive: boolean;
  activePlanetName: string;
  objectives: LevelObjective[];
  elapsedRunSec: number;
  pointerLocked: boolean;
  interactionPrompt: string | null;
  adaptation: PlanetAdaptationConfig;
  behaviorVector: PlayerBehaviorVector;
  bossHpRatio: number | null;    // Solo en nivel Kronos
  bossAdaptedTo: CharacterId | null;

  // --- Hito 3A (opcionales y retrocompatibles) ---
  /** Cooldown de Gravity Shift / Gravity Dash: 0 = listo, 1 = acaba de usarse. */
  gravityShiftCooldownRatio?: number;
  /** Lock-On activo sobre un enemigo, barril o generador. */
  lockOnActive?: boolean;
  /** Nombre legible del objetivo fijado (null si no hay Lock-On). */
  lockedTargetName?: string | null;
  /** Posición de pantalla del marcador Lock-On en NDC (-1..1); null = fuera/oculto. */
  lockOnScreenX?: number | null;
  lockOnScreenY?: number | null;

  // --- Hito 4 (opcionales y retrocompatibles) ---
  /** Audio silenciado con la tecla M (o el botón rápido del HUD). */
  muted?: boolean;
  /** Pasos de backpropagation online de la red MLP de KRONOS en la run. */
  kronosUpdates?: number;
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
  PLAYER_MAX_HP: 3,              // Alta letalidad: 2-3 golpes
  CHARACTERS: {
    kitsune: {
      id: 'kitsune',
      keySlot: 1,
      displayName: 'Kitsune',
      title: 'Sigilo y Disfraces',
      accentColor: '#f97316',
      moveSpeed: 10.5,
      jumpImpulse: 13.5,
      gravityScale: 0.72,        // Modo Lunar
      anchorRange: 18,
      canBurrow: false,
      swimSpeedMultiplier: 1.0,
      stealthMultiplier: 0.25,
    },
    digger: {
      id: 'digger',
      keySlot: 2,
      displayName: 'Digger',
      title: 'Subsuelo y Fuerza',
      accentColor: '#eab308',
      moveSpeed: 9.2,
      jumpImpulse: 12.0,
      gravityScale: 1.45,        // Modo Júpiter
      anchorRange: 14,
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
      moveSpeed: 11.4,
      jumpImpulse: 14.5,
      gravityScale: 0.92,
      anchorRange: 28,           // Gran alcance de ancla
      canBurrow: false,
      swimSpeedMultiplier: 2.35, // Nado supersónico
      stealthMultiplier: 0.85,
    },
  } satisfies Record<CharacterId, CharacterProfile>,
} as const;
