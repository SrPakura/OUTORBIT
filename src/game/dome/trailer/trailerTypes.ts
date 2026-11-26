import type * as THREE from 'three';
import type { EnemyArchetype } from '@/game/dome/DomeCombatSystem';
import type { ActiveSkillId } from '@/game/dome/DomeProgression';

// ============================================================================
// trailerTypes — Contratos compartidos del Bot de Tráiler, Grabador/Replay
// determinista y Cámara de Modo Teatro.
// ============================================================================

export const TRAILER_FIXED_DT = 1 / 60;

export type ReplayCameraMode = 'bot' | 'free' | 'orbit' | 'director';
export type TrailerBotStyle = 'hyper' | 'cinematic' | 'flow' | 'dodge' | 'parry';

/**
 * Entrada sintética por tick compartida entre el Bot (grabación) y el
 * ReplayPlayer (reproducción). Sigue las mismas convenciones que el mando:
 * `moveY < 0` = avanzar, `lookDx / lookDy` = radianes de giro.
 */
export interface SyntheticPlayerInput {
  moveX: number;
  moveY: number;
  lookDx: number;
  lookDy: number;
  wantAttack: boolean;
  attackHeld: boolean;
  wantDash: boolean;
  dashHeld: boolean;
  wantJump: boolean;
  wantSlot: 1 | 2 | 3 | null;
  /** Habilidad arbitraria (de las 7 del catálogo) disparada por el Bot/Replay sin depender de los 3 huecos. */
  extraSkill?: ActiveSkillId | null;
}

export interface TrailerBotConfig {
  wave: number;
  seed: number;
  loadout: [ActiveSkillId, ActiveSkillId, ActiveSkillId];
  infiniteEden: boolean;
  godMode: boolean;
  hud: boolean;
  style: TrailerBotStyle;
  trickshotRate: number;
  trainingArchetype: EnemyArchetype | null;
}

export type TrailerThreatKind =
  | 'ink_ball'
  | 'electric_ball'
  | 'dark_projectile'
  | 'wind_projectile'
  | 'kronos_ring'
  | 'crab_laser'
  | 'enemy_charge';

export interface TrailerThreatInfo {
  kind: TrailerThreatKind;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  radius: number;
  /** true para bolas de tinta / eléctricas capturables con Campo Gravitacional. */
  stealable: boolean;
}

/**
 * Tupla compacta por frame:
 * `[moveX, moveY, lookDx, lookDy, bitmaskFlags, wantSlot]`
 */
export type ReplayFrameTuple = [
  number,
  number,
  number,
  number,
  number,
  number,
  ActiveSkillId | 0,
];

/**
 * Checkpoint de verificación cada 60 ticks:
 * `[tick, px, py, pz, vx, vy, vz, enemyCount]`
 */
export type ReplayCheckpoint = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface ReplayHeader {
  seed: number;
  fixedDt: number;
  viewportW: number;
  viewportH: number;
  baseFov: number;
  wave: number;
  trainingArchetype: EnemyArchetype | null;
  loadout: [ActiveSkillId, ActiveSkillId, ActiveSkillId];
  infiniteEden: boolean;
  godMode: boolean;
  recordedAt: string;
}

export interface ReplayFileV1 {
  version: 1;
  header: ReplayHeader;
  frames: ReplayFrameTuple[];
  checkpoints: ReplayCheckpoint[];
}

export type TrailerSessionRequest =
  | {
      mode: 'record';
      config: TrailerBotConfig;
    }
  | {
      mode: 'replay';
      replay: ReplayFileV1;
      camera: ReplayCameraMode;
      speed: number;
      hud: boolean;
    };

export function createEmptySyntheticInput(): SyntheticPlayerInput {
  return {
    moveX: 0,
    moveY: 0,
    lookDx: 0,
    lookDy: 0,
    wantAttack: false,
    attackHeld: false,
    wantDash: false,
    dashHeld: false,
    wantJump: false,
    wantSlot: null,
    extraSkill: null,
  };
}
