import type * as THREE from 'three';

export type NyxMovementMode =
  | 'grounded'      // Adherida a un suelo/pared/techo (cámara libre 360º)
  | 'floating'      // Flotando en 0G (cámara pegada a la espalda con lag + inercia espacial)
  | 'dashing'       // Dash con Clic Derecho + dirección (redirigible con cámara)
  | 'speed_attack'  // Clic Izq: Patada (con lock-in a enemigo) o Caída al Vacío (sin enemigo)
  | 'kick_recover'; // Frenado con 1, 2 o 3 kick_flip tras cancelar con Espacio o impactar

export type SpeedAttackKind = 'gravity_kick' | 'spiral_drill_kick' | 'void_fall';

export type ReticleLockState = 'none' | 'can_lock' | 'locked';

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
  /** Si es true, solo la cara +Y local es pisable (grounded); laterales/fondo rebotan */
  oneSidedTop?: boolean;
  /** Triángulo 2D en plano XZ local [ax, az, bx, bz, cx, cz] para colisión triangular exacta */
  localTriangle2D?: readonly [number, number, number, number, number, number];
}

export interface SlabRaycastHit {
  slab: SlabCollider;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
}

export interface TestEnemySphere {
  id: string;
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  homePos: THREE.Vector3;
  radius: number;
  evasive: boolean;
  evadeCooldown: number;
  hitFlash: number;
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
  speedAttackKind: SpeedAttackKind | null;
  pointerLocked: boolean;
  reticleLockState: ReticleLockState;
  lockedEnemyScreenPos: { x: number; y: number } | null;
  bulletTimeActive: boolean;
  bulletTimeRemaining: number;
  activeSlot: 1 | 2 | 3;
  slots: [
    { keyLabel: string; name: string | null; level: number; cooldownRemaining?: number; maxCooldown?: number },
    { keyLabel: string; name: string | null; level: number; cooldownRemaining?: number; maxCooldown?: number },
    { keyLabel: string; name: string | null; level: number; cooldownRemaining?: number; maxCooldown?: number },
  ];
  domeBounceFlash: number;
  /** Intensidad de mancha de tinta del Pulpo Espiral (0..1) */
  inkOverlayIntensity?: number;
  /** Oleada actual (1..) y tipo ('BÁSICOS' | 'MINIBOSS' | 'BOSS') */
  waveNumber?: number;
  waveLabel?: string;
  /** Flash de impacto (0..1) al golpear un enemigo o estrellarse de lado (hit_stagger) */
  impactFlash: number;
  /** Ángulo de roll/inclinación lateral de la cámara en grados (-15..+15) para el giroscopio del visor */
  cameraRollDeg: number;
  /** Rotación acumulada en radianes de los arcos giroscópicos del visor según la velocidad */
  gyroSpinRad: number;
}

/** Radio visual en píxeles de pantalla del octógono exterior de visor.svg (180x180 px total) */
export const RETICLE_SIZE_PX = 180;
/** Radio lógico en píxeles para poder lockear un enemigo dentro del visor */
export const RETICLE_LOCK_RADIUS_PX = 105;
/** Distancia en píxeles (2.5x radio) a la que se rompe el auto-lock si el enemigo escapa */
export const RETICLE_BREAK_RADIUS_PX = 262;

export const DOME_ARENA_RADIUS = 90;
export const DOME_PLAYER_BOUND_RADIUS = 88.6;
