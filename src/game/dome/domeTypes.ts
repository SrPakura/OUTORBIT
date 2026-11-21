import type * as THREE from 'three';

export type NyxMovementMode =
  | 'grounded'
  | 'zero_g'
  | 'falling'
  | 'kicking'
  | 'kick_recover'
  | 'dashing';

export interface SlabCollider {
  id: string;
  mesh: THREE.Mesh;
  basePos: THREE.Vector3;
  center: THREE.Vector3;
  halfExtents: THREE.Vector3;
  quaternion: THREE.Quaternion;
  invQuaternion: THREE.Quaternion;
  phase: number;
  bobAmplitude: number;
}

export interface SlabRaycastHit {
  slab: SlabCollider;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
}

export interface DomeHudState {
  hp: number;
  maxHp: number;
  eden: number;
  maxEden: number;
  exp: number;
  expToNext: number;
  level: number;
  speed: number;
  drillThreshold: number;
  isDrillReady: boolean;
  speedLinesIntensity: number;
  mode: NyxMovementMode;
  pointerLocked: boolean;
  aimingAtSurface: boolean;
  aimDistance: number | null;
  activeSlot: 1 | 2 | 3;
  slots: [
    { keyLabel: string; name: string | null; level: number },
    { keyLabel: string; name: string | null; level: number },
    { keyLabel: string; name: string | null; level: number },
  ];
  domeBounceFlash: number;
}

export const DOME_ARENA_RADIUS = 50;
export const DOME_PLAYER_BOUND_RADIUS = 48.8;
