// ============================================================================
// DOME CELL BEHAVIOR — IA de la Célula Abisal (modo Cúpula)
// ============================================================================
// Depredadora de oportunidad: nunca planta cara. Repta a 20 m/s buscando
// oclusión real (slabs y enemigos grandes) y orbita la RETAGUARDIA de Nyx en
// un anillo que se cierra de 7 a 5 m poco a poco (~10 s; rastrera) — y a
// toda velocidad mientras Nyx está quieta (la emboscada se compromete).
// Solo salta —lunge de 6 m a 30 m/s, trayectoria FIJADA al iniciar el
// windup, sin corrección en vuelo— en el "momento
// matemáticamente perfecto": Nyx quieta (>0.6 s), lockeada/peleando con otro
// enemigo, o en pleno dash (donde el lunge cae en falso y la delata: el dash
// es cebo deliberado). Si la miran de frente o la persiguen, huye tras
// cobertura. Si queda escondida y sola, se duplica (5 s de canal quieta,
// interrumpible con un golpe).
//
// Coordinación de enjambre (CellSwarmDirector): reparte slots de órbita para
// rodear de verdad (N células = N ángulos equidistantes) y gestiona el token
// de lunge (un salto por ventana de ~2.5 s) para que el acoso sea presión
// constante pero siempre esquivable. Información perfecta, actuadores
// físicos: nada de teletransportes ni giros imposibles.
//
// Scratch de módulo: cero allocations por frame.
// ============================================================================

import * as THREE from 'three';
import type { SlabCollider, SlabRaycastHit } from './domeTypes';
import { raycastSlabs } from './DomeSlabs';
import type { EnemyInternal, ManagedWaveEnemy } from './DomeWaveManager';

// ============================================================================
// Constantes de la Célula Abisal
// ============================================================================

/** Velocidad de reptado/acecho (m/s). */
const CELL_SNEAK_SPEED = 20.0;
/** Velocidad de huida en pánico (m/s): más rápida que el acecho. */
const CELL_FLEE_SPEED = 26.0;
/** Velocidad del lunge (m/s): el ataque debe superar al reptado. */
const CELL_LUNGE_SPEED = 30.0;
/** Distancia máxima del lunge (m): obliga a acercarse para atacar. */
const CELL_LUNGE_MAX_DIST = 6.0;
/** Telegraph del lunge: se echa hacia atrás antes de saltar (s). */
const CELL_WINDUP_SEC = 0.45;
/** Aterrizaje expuesta tras el lunge: ventana de castigo (s). */
const CELL_RECOVER_SEC = 0.8;
/** Radio inicial del anillo de acecho (m). */
export const CELL_RING_START = 7.0;
/** Radio mínimo del anillo: "se van acercando" (m). */
const CELL_RING_MIN = 5.0;
/** Cierre del anillo cuando Nyx no puede verla (m/s): 7→5 en ~10 s. */
const CELL_RING_TIGHTEN = 0.2;
/** Cierre acelerado mientras Nyx está QUIETA: la emboscada se compromete. */
const CELL_RING_TIGHTEN_STILL = 0.6;
/** Retroceso del anillo cuando la mira (m/s): la cobarde toma distancia. */
const CELL_RING_WIDEN = 1.4;
/** Radio al que retrocede el anillo mientras la mira (m). */
const CELL_RING_SEEN = 12.0;
/** Anillo de aproximación inicial tras spawn/lejos (m). */
const CELL_SEEK_RING = 11.0;
/** Distancia a la que la aproximación pasa a acecho (m). */
const CELL_SEEK_TO_STALK_DIST = 14.0;
/** Nyx la ve: semiancho del cono de visión (dot con aimForward). */
const CELL_SEEN_DOT = 0.45;
/** Nyx la ve: distancia máx. de visión efectiva (m). */
const CELL_SEEN_MAX_DIST = 42.0;
/** Huye si Nyx la mira de frente más cerca de esto (m): susto a bocajarro. */
const CELL_FLEE_TRIGGER_DIST = 6.5;
/** Deja de huir al superar esta distancia de Nyx (m). */
const CELL_FLEE_SAFE_DIST = 16.0;
/** Daño del lunge al contacto (HP). */
const CELL_LUNGE_DAMAGE = 8;
/** Radio de contacto del cuerpo de Nyx para el lunge (m). */
const CELL_PLAYER_CONTACT = 1.6;
/** Token del enjambre: espera entre lunges de células distintas (s). */
const CELL_LUNGE_TOKEN_CD = 2.5;
/** Quietud de Nyx que cuenta como "distracción" (s). */
const CELL_STILL_SEC = 0.6;
/** Lead máx. de predicción del lunge (s): apunta a donde VAS, no donde estás. */
const CELL_LEAD_MAX = 0.5;
/** Empuje hacia atrás al iniciar el windup (m/s): el "se echa para atrás". */
const CELL_WINDUP_BACKSTEP = 8.0;

// --- Duplicación ---
/** Canal de duplicación quieta y brillando (s). */
const CELL_DUP_CHANNEL = 5.0;
/** Segundos oculta necesarios antes de plantearse duplicarse (s). */
const CELL_DUP_HIDDEN_SEC = 2.0;
/** Cap base de células vivas simultáneas. */
const CELL_DUP_CAP_BASE = 3;
/** +1 al cap cada N oleadas. */
const CELL_DUP_CAP_PER_WAVES = 5;
/** Techo del cap de células vivas. */
const CELL_DUP_CAP_MAX = 6;
/** Solo duplica si su pack está más lejos que esto (m): célula solitaria. */
const CELL_DUP_LONE_DIST = 15.0;
/** No duplica con Nyx más cerca de esto (m). */
const CELL_DUP_SPOTTED_DIST = 8.0;
/** Fracción de HP que conserva la madre tras duplicarse. */
const CELL_DUP_MOTHER_HP = 0.6;
/** EXP de la célula hija (la madre conserva su valor). */
export const CELL_CHILD_EXP = 0.5;
/** hitFlash que indica daño real recibido (>=1 al golpearla). */
const CELL_DAMAGED_FLASH = 0.85;

// --- Cobertura y límites ---
/** Radio mínimo de un enemigo para servir de cobertura (Gólem, élites, Kronos). */
const CELL_COVER_MIN_RADIUS = 3.0;
/** Distancia de separación entre células (m). */
const CELL_SEPARATION_DIST = 2.4;
/** Fuerza del empuje de separación entre células. */
const CELL_SEPARATION_STRENGTH = 8.0;
/** Radio XZ de contención dentro de la arena (m). */
const CELL_ARENA_KEEP_RADIUS = 70.0;
/** Tirón hacia el centro al superar la contención (m/s). */
const CELL_ARENA_KEEP_PULL = 9.0;
/** Velocidad de deriva del ángulo de órbita (rad/s). */
const CELL_ORBIT_DRIFT = 0.16;
/** Separación angular entre slots del abanico trasero (rad). */
const CELL_ORBIT_SPREAD = 0.7;
/** Distancia de frenado al llegar al slot de órbita (m). */
const CELL_ORBIT_ARRIVE_DIST = 4.0;
/** Escondite solitario: distancia mínima del punto de cobertura a Nyx (m). */
const CELL_HIDE_MIN_PLAYER_DIST = 10.0;
/** Margen del punto de cobertura tras el slab/enemigo (m). */
const CELL_COVER_MARGIN = 2.0;

// ============================================================================
// Tipos
// ============================================================================

/** FSM de la Célula Abisal. */
export type CellState = 'seek' | 'stalk' | 'windup' | 'lunge' | 'recover' | 'flee' | 'duplicate';

/** Contexto que aporta el DomeWaveManager (dueño del spawn y del reloj). */
export interface CellBehaviorContext {
  /** Enemigos vivos de la oleada (para pack, cobertura y separación). */
  readonly enemies: readonly ManagedWaveEnemy[];
  /** Multiplicador de velocidad de la oleada activa. */
  readonly speedMult: number;
  /** Nº de oleada actual (escala el cap de duplicación). */
  getCurrentWave(): number;
  /** Modo Entrenamiento: sin IA ofensiva (saco de boxeo). */
  isEnemiesPassive(): boolean;
  /** Spawnea la célula hija junto a la madre (vive en el manager). */
  spawnCellChild(mother: ManagedWaveEnemy, offset: THREE.Vector3): void;
}

/** Instantánea por frame del estado de Nyx que lee el enjambre. */
export interface CellPlayerFocus {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  aimForward: THREE.Vector3;
  dashing: boolean;
  /** Segundos llevados en speed_attack contra un enemigo. */
  attackTime: number;
  /** Id del enemigo lockeado (null = sin lock-in). */
  lockedId: string | null;
  /** Posición del enemigo lockeado (null = sin lock-in). */
  lockedPos: THREE.Vector3 | null;
}

// ============================================================================
// CellSwarmDirector — coordinación de enjambre + modelo de atención
// ============================================================================

export class CellSwarmDirector {
  /** Estado de Nyx leído por todas las células (se refresca cada frame). */
  readonly focus: CellPlayerFocus = {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    aimForward: new THREE.Vector3(0, 0, -1),
    dashing: false,
    attackTime: 0,
    lockedId: null,
    lockedPos: null,
  };

  /** Segundos que lleva Nyx quieta (velocidad < 1.25 m/s). */
  private stillFor = 0;
  /** Cuenta atrás del token de lunge: nadie salta hasta que llegue a 0. */
  lungeTokenCd = 0;
  /** Id de la célula duplicándose (solo una a la vez). */
  duplicateOwnerId: string | null = null;
  /** Células vivas del frame (slots de órbita asignados por índice). */
  readonly cells: ManagedWaveEnemy[] = [];
  /** Cantidad de células vivas (= cells.length, cacheado por legibilidad). */
  cellCount = 0;

  reset(): void {
    this.stillFor = 0;
    this.lungeTokenCd = 0;
    this.duplicateOwnerId = null;
    this.cells.length = 0;
    this.cellCount = 0;
  }

  /**
   * Un tick por frame ANTES de actualizar las células: refresca el foco de
   * Nyx, acumula la quietud, consume el token de lunge y reasigna los slots
   * de órbita (N células repartidas en ángulos equidistantes).
   */
  beginFrame(
    dt: number,
    enemies: readonly ManagedWaveEnemy[],
    internals: Map<string, EnemyInternal>,
    playerPos: THREE.Vector3,
    playerVel: THREE.Vector3,
    playerAimForward: THREE.Vector3,
    playerDashing: boolean,
    playerAttackTime: number,
    lockedId: string | null,
    lockedPos: THREE.Vector3 | null,
  ): void {
    const focus = this.focus;
    focus.position.copy(playerPos);
    focus.velocity.copy(playerVel);
    focus.aimForward.copy(playerAimForward);
    focus.dashing = playerDashing;
    focus.attackTime = playerAttackTime;
    focus.lockedId = lockedId;
    focus.lockedPos = lockedPos;

    this.stillFor = playerVel.lengthSq() < 1.5625 ? this.stillFor + dt : 0;
    this.lungeTokenCd = Math.max(0, this.lungeTokenCd - dt);

    // Slots de órbita: el índice dentro del enjambre fija el ángulo.
    this.cells.length = 0;
    for (const enemy of enemies) {
      if (enemy.entity.alive && enemy.entity.archetype === 'abyssal_cell') {
        const internal = internals.get(enemy.id);
        if (internal) {
          internal.cellSlot = this.cells.length;
        }
        this.cells.push(enemy);
      }
    }
    this.cellCount = this.cells.length;
  }

  /** Nyx lleva quieta demasiado tiempo: el camping se castiga. */
  isPlayerStill(): boolean {
    return this.stillFor >= CELL_STILL_SEC;
  }

  /**
   * Nyx está "distracta" respecto a esta célula: quieta, lockeada/atacando a
   * OTRO enemigo, o dashando (el momento extremo que las delata).
   */
  isPlayerDistracted(cellId: string): boolean {
    if (this.isPlayerStill() || this.focus.dashing) {
      return true;
    }
    const { lockedId, lockedPos, attackTime, position } = this.focus;
    if (lockedId === null || lockedId === cellId || lockedPos === null) {
      return false;
    }
    // Peleando de frente: lock-in activo sobre otro enemigo cercano.
    return attackTime > 0.1 || lockedPos.distanceTo(position) < 12.0;
  }
}

// ============================================================================
// Oclusión: ¿Nyx puede ver a la célula?
// ============================================================================

const _occDir = new THREE.Vector3();
const _occTo = new THREE.Vector3();
const _occHit: SlabRaycastHit = {
  // El campo se sobreescribe con el slab real en cada hit del raycast.
  slab: null as unknown as SlabCollider,
  point: new THREE.Vector3(),
  normal: new THREE.Vector3(),
  distance: 0,
};

/**
 * true si la línea Nyx→célula está tapada por un slab (raycast exacto) o por
 * un enemigo grande (esfera: Gólem, élites, Kronos). La célula usa esto para
 * esconderse de verdad, no con un truco.
 */
function isCellOccluded(
  playerPos: THREE.Vector3,
  cellPos: THREE.Vector3,
  cellRadius: number,
  activeSlabs: SlabCollider[] | undefined,
  enemies: readonly ManagedWaveEnemy[],
  selfId: string,
): boolean {
  _occDir.subVectors(cellPos, playerPos);
  const dist = _occDir.length();
  if (dist < 1e-4) {
    return false;
  }
  _occDir.divideScalar(dist);

  if (activeSlabs && activeSlabs.length > 0) {
    if (raycastSlabs(activeSlabs, playerPos, _occDir, Math.max(0.1, dist - cellRadius), _occHit)) {
      return true;
    }
  }

  for (const other of enemies) {
    if (!other.entity.alive || other.id === selfId) {
      continue;
    }
    if (other.radius < CELL_COVER_MIN_RADIUS) {
      continue;
    }
    // Segmento Nyx→célula contra la esfera envolvente del enemigo grande.
    _occTo.subVectors(other.position, playerPos);
    const t = _occTo.dot(_occDir);
    if (t <= 0 || t >= dist) {
      continue;
    }
    const closestDistSq = _occTo.lengthSq() - t * t;
    if (closestDistSq < other.radius * other.radius) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// Scratch de movimiento
// ============================================================================

const _toPlayer = new THREE.Vector3();
const _fleeDir = new THREE.Vector3();
const _coverDir = new THREE.Vector3();
const _hideDir = new THREE.Vector3();
const _behindDir = new THREE.Vector3();
const _steer = new THREE.Vector3();
const _sep = new THREE.Vector3();
const _orbitTarget = new THREE.Vector3();
const _aimPoint = new THREE.Vector3();
const _childOffset = new THREE.Vector3();
const _flat = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** Contención suave: la célula no se aleja del centro de la arena. */
function keepInsideArena(enemy: ManagedWaveEnemy, dt: number): void {
  _flat.set(enemy.position.x, 0, enemy.position.z);
  const flat = _flat.length();
  if (flat > CELL_ARENA_KEEP_RADIUS) {
    _flat.divideScalar(flat);
    enemy.position.addScaledVector(_flat, -CELL_ARENA_KEEP_PULL * dt);
  }
}

/** Separación entre células para que el enjambre no se apelotone. */
function applyCellSeparation(
  enemy: ManagedWaveEnemy,
  enemies: readonly ManagedWaveEnemy[],
  steer: THREE.Vector3,
): void {
  for (const other of enemies) {
    if (other.id === enemy.id || !other.entity.alive) {
      continue;
    }
    if (other.entity.archetype !== 'abyssal_cell') {
      continue;
    }
    _sep.subVectors(enemy.position, other.position);
    const d = _sep.length();
    if (d > 1e-4 && d < CELL_SEPARATION_DIST) {
      _sep.divideScalar(d).multiplyScalar(
        (1 - d / CELL_SEPARATION_DIST) * CELL_SEPARATION_STRENGTH,
      );
      steer.add(_sep);
    }
  }
}

/** true si hay otra célula del enjambre a menos de CELL_DUP_LONE_DIST (pack). */
function hasPackNearby(
  cells: readonly ManagedWaveEnemy[],
  selfId: string,
  selfPos: THREE.Vector3,
): boolean {
  for (const other of cells) {
    if (other.id !== selfId && other.position.distanceTo(selfPos) < CELL_DUP_LONE_DIST) {
      return true;
    }
  }
  return false;
}

/**
 * Punto de escondite para la célula solitaria: la cara oculta del slab o
 * enemigo grande más cercano respecto de Nyx (a >= CELL_HIDE_MIN_PLAYER_DIST
 * de ella). Escribe el punto en `out` y devuelve true si hay candidato.
 */
function findCoverPoint(
  playerPos: THREE.Vector3,
  cellPos: THREE.Vector3,
  activeSlabs: SlabCollider[] | undefined,
  enemies: readonly ManagedWaveEnemy[],
  selfId: string,
  out: THREE.Vector3,
): boolean {
  let bestDist = Infinity;

  if (activeSlabs && activeSlabs.length > 0) {
    for (const slab of activeSlabs) {
      _hideDir.subVectors(slab.center, playerPos);
      const d = _hideDir.length();
      if (d < 1e-4) {
        continue;
      }
      _hideDir
        .divideScalar(d)
        .multiplyScalar(slab.halfExtents.length() + CELL_COVER_MARGIN)
        .add(slab.center);
      if (_hideDir.distanceTo(playerPos) < CELL_HIDE_MIN_PLAYER_DIST) {
        continue;
      }
      const coverDist = _hideDir.distanceTo(cellPos);
      if (coverDist < bestDist) {
        bestDist = coverDist;
        out.copy(_hideDir);
      }
    }
  }

  for (const other of enemies) {
    if (!other.entity.alive || other.id === selfId || other.radius < CELL_COVER_MIN_RADIUS) {
      continue;
    }
    _hideDir.subVectors(other.position, playerPos);
    const d = _hideDir.length();
    if (d < 1e-4) {
      continue;
    }
    _hideDir
      .divideScalar(d)
      .multiplyScalar(other.radius + CELL_COVER_MARGIN)
      .add(other.position);
    if (_hideDir.distanceTo(playerPos) < CELL_HIDE_MIN_PLAYER_DIST) {
      continue;
    }
    const coverDist = _hideDir.distanceTo(cellPos);
    if (coverDist < bestDist) {
      bestDist = coverDist;
      out.copy(_hideDir);
    }
  }

  return bestDist < Infinity;
}

/**
 * Sesga una dirección de huida hacia la cobertura más cercana: el punto tras
 * un enemigo grande (respecto de Nyx) o el centro de un slab cercano.
 */
function biasTowardCover(
  fleeDir: THREE.Vector3,
  playerPos: THREE.Vector3,
  cellPos: THREE.Vector3,
  activeSlabs: SlabCollider[] | undefined,
  enemies: readonly ManagedWaveEnemy[],
  selfId: string,
): void {
  let bestScore = 0;
  _coverDir.set(0, 0, 0);

  for (const other of enemies) {
    if (!other.entity.alive || other.id === selfId || other.radius < CELL_COVER_MIN_RADIUS) {
      continue;
    }
    // Punto "detrás" del enemigo grande visto desde Nyx.
    _coverDir.subVectors(other.position, playerPos);
    const d = _coverDir.length();
    if (d < 1e-4) {
      continue;
    }
    _coverDir.divideScalar(d).multiplyScalar(other.radius + 1.5).add(other.position);
    _coverDir.sub(cellPos);
    const coverDist = _coverDir.length();
    if (coverDist > 1e-4 && coverDist < 25.0) {
      const score = 1.0 - coverDist / 25.0;
      if (score > bestScore) {
        bestScore = score;
        _coverDir.divideScalar(coverDist);
        fleeDir.lerp(_coverDir, 0.55);
      }
    }
  }

  if (activeSlabs && activeSlabs.length > 0) {
    let bestSlabScore = 0;
    for (const slab of activeSlabs) {
      _coverDir.subVectors(slab.center, cellPos);
      const coverDist = _coverDir.length();
      if (coverDist > 1e-4 && coverDist < 20.0) {
        const score = 1.0 - coverDist / 20.0;
        if (score > bestSlabScore) {
          bestSlabScore = score;
          _coverDir.divideScalar(coverDist);
          fleeDir.lerp(_coverDir, 0.35);
        }
      }
    }
  }

  fleeDir.normalize();
}

// ============================================================================
// updateCellEnemy — FSM de la Célula Abisal
// ============================================================================

/**
 * Un tick de la FSM de la célula: movimiento, acecho, lunge, huida y
 * duplicación. Sustituye a applyFloatMovement y al caso pasivo del switch
 * ofensivo del manager (la célula gestiona su propio ataque por contacto).
 */
export function updateCellEnemy(
  ctx: CellBehaviorContext,
  director: CellSwarmDirector,
  enemy: ManagedWaveEnemy,
  internal: EnemyInternal,
  dt: number,
  elapsed: number,
  activeSlabs: SlabCollider[] | undefined,
  onPlayerHit: (damage: number) => void,
): void {
  // Modo Entrenamiento: saco de boxeo — freno suave, sin IA.
  if (ctx.isEnemiesPassive()) {
    enemy.velocity.multiplyScalar(Math.exp(-3.5 * dt));
    enemy.position.addScaledVector(enemy.velocity, dt);
    internal.cellState = 'stalk';
    return;
  }

  const focus = director.focus;
  const playerPos = focus.position;
  const distToPlayer = enemy.position.distanceTo(playerPos);
  const occluded = isCellOccluded(
    playerPos,
    enemy.position,
    enemy.radius,
    activeSlabs,
    ctx.enemies,
    enemy.id,
  );
  if (occluded) {
    internal.cellHiddenFor += dt;
  } else {
    internal.cellHiddenFor = 0;
  }

  // ¿Nyx la está mirando? (cono frontal + sin oclusión)
  _toPlayer.subVectors(enemy.position, playerPos);
  const facingDot = _toPlayer.lengthSq() > 1e-6
    ? focus.aimForward.dot(_toPlayer.normalize())
    : 1.0;
  const seen =
    !occluded && facingDot > CELL_SEEN_DOT && distToPlayer < CELL_SEEN_MAX_DIST;

  switch (internal.cellState) {
    // -----------------------------------------------------------------
    case 'windup': {
      // Telegraph: estrella al máximo, frenazo y quieto (el clip hará el
      // squash hacia atrás; el hitFlash mantiene el glow del cuerpo).
      internal.cellTimer -= dt;
      enemy.hitFlash = Math.max(enemy.hitFlash, 0.55);
      enemy.velocity.multiplyScalar(Math.exp(-8 * dt));
      enemy.position.addScaledVector(enemy.velocity, dt);
      if (internal.cellTimer <= 0) {
        // La dirección quedó FIJADA al entrar en windup: esquivar durante el
        // telegraph rompe la predicción. Física honesta, cero homing.
        internal.cellLungeLeft = CELL_LUNGE_MAX_DIST;
        internal.cellState = 'lunge';
      }
      return;
    }

    // -----------------------------------------------------------------
    case 'lunge': {
      const speed = CELL_LUNGE_SPEED * ctx.speedMult;
      enemy.velocity.copy(internal.cellLungeDir).multiplyScalar(speed);
      enemy.position.addScaledVector(enemy.velocity, dt);
      internal.cellLungeLeft -= speed * dt;

      if (enemy.position.distanceTo(playerPos) < enemy.radius + CELL_PLAYER_CONTACT) {
        onPlayerHit(CELL_LUNGE_DAMAGE);
        internal.cellState = 'recover';
        internal.cellTimer = CELL_RECOVER_SEC;
        enemy.velocity.multiplyScalar(-0.35); // rebote tras el impacto
      } else if (internal.cellLungeLeft <= 0) {
        // Cayó en falso: aterrizaje expuesto (ventana de castigo).
        internal.cellState = 'recover';
        internal.cellTimer = CELL_RECOVER_SEC;
        enemy.velocity.multiplyScalar(0.2);
      }
      return;
    }

    // -----------------------------------------------------------------
    case 'recover': {
      internal.cellTimer -= dt;
      enemy.velocity.multiplyScalar(Math.exp(-6 * dt));
      enemy.position.addScaledVector(enemy.velocity, dt);
      if (internal.cellTimer <= 0) {
        internal.cellRing = CELL_RING_START;
        internal.cellState = 'stalk';
      }
      return;
    }

    // -----------------------------------------------------------------
    case 'flee': {
      _fleeDir.subVectors(enemy.position, playerPos);
      if (_fleeDir.lengthSq() < 1e-4) {
        _fleeDir.set(1, 0, 0);
      } else {
        _fleeDir.normalize();
      }
      biasTowardCover(_fleeDir, playerPos, enemy.position, activeSlabs, ctx.enemies, enemy.id);

      _steer.copy(_fleeDir).multiplyScalar(CELL_FLEE_SPEED * ctx.speedMult);
      enemy.velocity.lerp(_steer, 1 - Math.exp(-4.5 * dt));
      enemy.position.addScaledVector(enemy.velocity, dt);
      keepInsideArena(enemy, dt);

      // Escapó: oculta un instante o lejos de Nyx → vuelve a acechar.
      if ((occluded && internal.cellHiddenFor > 0.4) || distToPlayer > CELL_FLEE_SAFE_DIST) {
        internal.cellState = 'stalk';
      }
      return;
    }

    // -----------------------------------------------------------------
    case 'duplicate': {
      internal.cellTimer -= dt;
      // Canal quieta: pulso creciente de energía (la estrella partiéndose).
      enemy.hitFlash = Math.max(
        enemy.hitFlash,
        0.3 + 0.3 * Math.sin(elapsed * 18),
      );
      enemy.velocity.multiplyScalar(Math.exp(-6 * dt));
      enemy.position.addScaledVector(enemy.velocity, dt);

      // Interrupciones: daño recibido o Nyx la descubre de cerca.
      if (enemy.hitFlash > CELL_DAMAGED_FLASH || (!occluded && distToPlayer < CELL_DUP_SPOTTED_DIST)) {
        director.duplicateOwnerId = null;
        internal.cellState = 'flee';
        return;
      }
      if (internal.cellTimer <= 0) {
        director.duplicateOwnerId = null;
        // La hija nace al lado de la madre, en perpendicular al avance de
        // Nyx para no solaparse con ella.
        _childOffset.subVectors(enemy.position, playerPos);
        if (_childOffset.lengthSq() < 1e-4) {
          _childOffset.set(1, 0, 0);
        } else {
          _childOffset.normalize();
        }
        _childOffset.applyAxisAngle(_up, Math.PI * 0.5).multiplyScalar(enemy.radius * 1.7);
        ctx.spawnCellChild(enemy, _childOffset);
        internal.cellState = 'stalk';
        internal.cellRing = CELL_RING_START;
      }
      return;
    }

    // -----------------------------------------------------------------
    case 'seek':
    case 'stalk':
    default: {
      // --- ¿Huir? Nyx la mira de frente y se acerca ---
      if (seen && distToPlayer < CELL_FLEE_TRIGGER_DIST) {
        internal.cellState = 'flee';
        return;
      }

      // --- ¿Duplicarse? Oculta, solitaria, bajo el cap y sin otra copiándose ---
      if (
        director.duplicateOwnerId === null &&
        internal.cellHiddenFor >= CELL_DUP_HIDDEN_SEC &&
        distToPlayer > CELL_DUP_SPOTTED_DIST &&
        director.cellCount < Math.min(
          CELL_DUP_CAP_MAX,
          CELL_DUP_CAP_BASE + Math.floor(ctx.getCurrentWave() / CELL_DUP_CAP_PER_WAVES),
        ) &&
        !hasPackNearby(director.cells, enemy.id, enemy.position)
      ) {
        director.duplicateOwnerId = enemy.id;
        internal.cellState = 'duplicate';
        internal.cellTimer = CELL_DUP_CHANNEL;
        return;
      }

      // --- Solitaria sin combate ajeno: a esconderse e incubar compañía ---
      // Solo orbita a Nyx en pandilla, o de oportunista si ella pelea con
      // otro enemigo. Si está sola y Nyx está libre, busca cobertura.
      const playerEngaged = focus.lockedId !== null && focus.lockedId !== enemy.id;
      const hiding =
        director.cellCount <= 1 &&
        !playerEngaged &&
        findCoverPoint(playerPos, enemy.position, activeSlabs, ctx.enemies, enemy.id, _orbitTarget);

      if (!hiding) {
        // --- Aproximación: anillo ancho hasta entrar en zona de acecho ---
        if (internal.cellState === 'seek') {
          internal.cellRing = CELL_SEEK_RING;
          if (distToPlayer < CELL_SEEK_TO_STALK_DIST) {
            internal.cellState = 'stalk';
            internal.cellRing = CELL_RING_START;
          }
        } else {
          // Anillo de acecho: se cierra poco a poco si Nyx no puede verla
          // (ocluida o a la retaguardia) — y mucho más rápido mientras Nyx
          // está QUIETA: la emboscada se compromete. Si la mira, la cobarde
          // retrocede hasta CELL_RING_SEEN (puede rodear por fuera sin
          // cruzar el frente a distancia de susto).
          if (occluded || facingDot < -0.1) {
            const rate = director.isPlayerStill()
              ? CELL_RING_TIGHTEN_STILL
              : CELL_RING_TIGHTEN;
            internal.cellRing = Math.max(CELL_RING_MIN, internal.cellRing - rate * dt);
          } else if (seen) {
            internal.cellRing = Math.min(CELL_RING_SEEN, internal.cellRing + CELL_RING_WIDEN * dt);
          }
        }

        // --- Slot de órbita del enjambre: RETAGUARDIA de Nyx, no de frente.
        // Base del ángulo = opuesta al aimForward; los slots reparten un
        // abanico trasero. Si Nyx gira la cámara, el enjambre se recoloca.
        _behindDir.set(-focus.aimForward.x, 0, -focus.aimForward.z);
        if (_behindDir.lengthSq() < 1e-4) {
          _behindDir.set(0, 0, 1);
        } else {
          _behindDir.normalize();
        }
        const behindAngle = Math.atan2(_behindDir.z, _behindDir.x);
        const spread =
          (internal.cellSlot - (director.cellCount - 1) * 0.5) * CELL_ORBIT_SPREAD;
        const slotAngle =
          behindAngle + spread + elapsed * CELL_ORBIT_DRIFT * internal.cellOrbitSign;
        _orbitTarget
          .set(Math.cos(slotAngle), 0, Math.sin(slotAngle))
          .multiplyScalar(internal.cellRing)
          .add(playerPos);
      }

      _steer.subVectors(_orbitTarget, enemy.position);
      const targetDist = _steer.length();
      if (targetDist > 0.2) {
        _steer.divideScalar(targetDist).multiplyScalar(CELL_SNEAK_SPEED * ctx.speedMult);
        // Arrive: frena en los últimos metros para asentarse en el anillo en
        // vez de orbitar el slot con overshoot (la deriva lo mantiene en movimiento).
        if (targetDist < CELL_ORBIT_ARRIVE_DIST) {
          _steer.multiplyScalar(targetDist / CELL_ORBIT_ARRIVE_DIST);
        }
      } else {
        _steer.set(0, 0, 0);
      }
      applyCellSeparation(enemy, ctx.enemies, _steer);
      // Bob suave de flotación mientras repta.
      _steer.y += Math.sin(elapsed * 2.2 + enemy.phase) * 0.35;
      enemy.velocity.lerp(_steer, 1 - Math.exp(-3.2 * dt));
      enemy.position.addScaledVector(enemy.velocity, dt);
      keepInsideArena(enemy, dt);

      // --- ¿Atacar? Momento perfecto + a rango + token del enjambre ---
      if (
        internal.cellState === 'stalk' &&
        distToPlayer <= CELL_LUNGE_MAX_DIST &&
        director.lungeTokenCd <= 0 &&
        director.isPlayerDistracted(enemy.id)
      ) {
        director.lungeTokenCd = CELL_LUNGE_TOKEN_CD / ctx.speedMult;
        // Predicción con lead (información perfecta, física honesta): apunta
        // a donde VAS a estar si sigues así. El dash a 24 m/s la deja
        // clavada en falso: el error tonto que la delata.
        const lead = Math.min(CELL_LEAD_MAX, distToPlayer / (CELL_LUNGE_SPEED * ctx.speedMult));
        _aimPoint.copy(playerPos).addScaledVector(focus.velocity, lead);
        internal.cellLungeDir.subVectors(_aimPoint, enemy.position);
        if (internal.cellLungeDir.lengthSq() < 1e-4) {
          internal.cellLungeDir.set(0, 1, 0);
        } else {
          internal.cellLungeDir.normalize();
        }
        // "Se echa hacia atrás": pequeño empujón previo al salto.
        enemy.velocity.addScaledVector(internal.cellLungeDir, -CELL_WINDUP_BACKSTEP);
        internal.cellState = 'windup';
        internal.cellTimer = CELL_WINDUP_SEC;
      }
      return;
    }
  }
}
