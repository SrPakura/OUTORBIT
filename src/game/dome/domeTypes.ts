import type * as THREE from 'three';

export type NyxMovementMode =
  | 'grounded'      // Adherida a un suelo/pared/techo (cámara libre 360º)
  | 'floating'      // Flotando en 0G (cámara pegada a la espalda con lag + inercia espacial)
  | 'dashing'       // Dash con Clic Derecho + dirección (redirigible con cámara)
  | 'speed_attack'  // Clic Izq: Patada (con lock-in a enemigo) o Caída al Vacío (sin enemigo)
  | 'kick_recover'  // Frenado con 1, 2 o 3 kick_flip tras cancelar con Espacio o impactar
  | 'kinetic_bounce'; // Sentadilla Cinética: rebote impulsado en pared (ver nyxKineticBounce.ts)

export type SpeedAttackKind = 'gravity_kick' | 'spiral_drill_kick' | 'void_fall';

export type ReticleLockState = 'none' | 'can_lock' | 'locked';

/**
 * Sentadilla Cinética en el visor: 'available' = pared en la mira con
 * velocidad suficiente (estrella azul clarito, Clic Derecho la adjudica),
 * 'committed' = rebote adjudicado (estrella azul brillante).
 */
export type KineticBounceUiState = 'none' | 'available' | 'committed';

/**
 * Colisión exacta contra la malla del trozo arrancado (tapa + raíz iceberg):
 * los triángulos no indexados de la geometría local SIN escala (el escalado
 * en vivo lo aporta `mesh.scale`), el radio de la esfera envolvente local y
 * el contorno XZ de la tapa superior (polígono `x0, z0, x1, z1, ...`).
 */
export interface SlabExactMesh {
  /** Posiciones de los triángulos (3 vértices × 3 componentes por triángulo). */
  positions: Float32Array;
  /** Radio de la esfera envolvente en espacio local sin escala. */
  boundRadius: number;
  /** Contorno XZ de la tapa superior pisable (polígono x0, z0, x1, z1, ...). */
  capContour: Float32Array;
}

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
  /**
   * Colisión 100% fiel a la malla visible (suelos flotantes arrancados): la
   * esfera y el raycast se resuelven contra los triángulos reales de la tapa
   * y de la raíz iceberg en vez de contra un OBB/cono sobredimensionado.
   */
  exactMesh?: SlabExactMesh;
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
  mesh: THREE.Object3D;
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
  /** Hay un mando (Gamepad API) conectado: el HUD muestra el aviso. */
  gamepadConnected?: boolean;
  reticleLockState: ReticleLockState;
  /** Sentadilla Cinética: disponible (azul clarito) o adjudicada (azul brillante). */
  kineticBounceState: KineticBounceUiState;
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
  /** 0..1: destello de recarga de Edén (touch-and-go o recogida de orbes). */
  edenFlash: number;
  /** Radar de enemigos (Tab): true cuando el marcador de puntos rojos está activado */
  radarEnabled?: boolean;
  /**
   * Puntos rojos del radar: proyección 2D en pantalla de todos los enemigos
   * vivos. Los que quedan fuera del encuadre van pegados al borde con el
   * ángulo (`edgeAngleDeg`) apuntando hacia su dirección.
   */
  radarDots?: ReadonlyArray<DomeRadarDot>;
}

/** Punto del radar de enemigos proyectado a coordenadas de pantalla 2D. */
export interface DomeRadarDot {
  x: number;
  y: number;
  /** true = dentro del encuadre; false = pegado al borde de la pantalla */
  onScreen: boolean;
  /** Ángulo en grados (espacio de pantalla, Y hacia abajo) hacia el enemigo fuera de encuadre */
  edgeAngleDeg?: number;
}

/**
 * Aro de Materia Oscura: marcador de enemigo lejano proyectado a pantalla.
 * El aro es 2D, se mueve con la cámara según distancia y ángulo. Su tamaño
 * está ACOTADO en pantalla: el diámetro base escala proporcionalmente con
 * la distancia dentro de [DARK_RING_MIN_DIAMETER_PX, DARK_RING_MAX_DIAMETER_PX]
 * (nunca crece sin límite con la perspectiva 3D) y los picos más largos no
 * pueden superar DARK_RING_MAX_SPIKE_RADIUS_PX de radio (~70 px absolutos).
 * Solo se ve más allá de DARK_RING_NEAR_DIST_M; al acercarse, desaparece y
 * el lock-in toma el relevo. No requiere pulsar Tab.
 */
export interface DomeDarkRing {
  x: number;
  y: number;
  /** Radio base del aro en píxeles de pantalla (sin picos), ya acotado. */
  radius: number;
  /** 0..1: fundido de entrada/salida cerca del umbral de distancia. */
  alpha: number;
  /** 0..1: posición proporcional dentro del rango [min, max] de tamaño. */
  t: number;
  /** Fase estable por enemigo (hash del id) para que el ruido no "salte". */
  phase: number;
}

/** Tamaño visual en píxeles de pantalla del visor central (visor.svg) */
export const RETICLE_SIZE_PX = 120;
/** Radio lógico en píxeles para poder lockear un enemigo dentro del visor */
export const RETICLE_LOCK_RADIUS_PX = 62;
/** Distancia en píxeles (2.5x radio) a la que se rompe el auto-lock si el enemigo escapa */
export const RETICLE_BREAK_RADIUS_PX = 262;

/**
 * Radio del círculo general del visor en pantalla: el octógono exterior de
 * visor.svg va de 40 a 472 en un viewBox de 512 (radio 216) escalado a
 * RETICLE_SIZE_PX.
 */
export const VISOR_CIRCLE_RADIUS_PX = RETICLE_SIZE_PX * (216 / 512); // ≈ 50.6 px

/** Tamaño FIJO del aro en pantalla (diámetro base, sin picos), esté donde esté el enemigo. */
export const DARK_RING_FIXED_DIAMETER_PX = 65;
/**
 * Tamaño proporcional por debajo del cual el aro se OCULTA: la visibilidad
 * sigue la regla proporcional (55 px a 22 m → 70 px a 60 m), pero el dibujo
 * no encoge — al acercarse, cuando el tamaño proporcional "debería" bajar de
 * este valor, el aro desaparece con fundido.
 */
export const DARK_RING_HIDE_BELOW_SIZE_PX = 60;
/** Tamaño proporcional en el umbral cercano (22 m) — solo para la regla de visibilidad. */
export const DARK_RING_MIN_DIAMETER_PX = 55;
/** Tamaño proporcional saturado (a partir de 60 m) — solo para la regla de visibilidad. */
export const DARK_RING_MAX_DIAMETER_PX = 70;
/** Tope ABSOLUTO de radio con los picos más largos (82 px de diámetro total). */
export const DARK_RING_MAX_SPIKE_RADIUS_PX = 41;
/** Distancia (m) del tamaño proporcional mínimo (umbral cercano). */
export const DARK_RING_NEAR_DIST_M = 22;
/** Distancia (m) a partir de la cual el tamaño proporcional satura. */
export const DARK_RING_FAR_DIST_M = 60;

export const DOME_ARENA_RADIUS = 90;
export const DOME_PLAYER_BOUND_RADIUS = 88.6;
