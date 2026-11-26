import * as THREE from 'three';
import { DOME_PLAYER_BOUND_RADIUS } from './domeTypes';

// ============================================================================
// DomeCombatSystem — combate, daño y anatomía de enemigos de la cúpula.
//
// Anatomía ("Carne amortiguadora + Estrella 3D de 6 puntas", sección 6.1 del
// diseño): cada enemigo envuelve una estrella interior con una capa de "carne"
// cuyo grosor (`fleshThickness`, 0..100) define cuánta fuerza cinética hace
// falta para atravesarla. El sistema es agnóstico del modelo 3D: solo habla
// de posiciones, radios y estados, así que sirve igual con las esferas de
// prueba actuales que con los modelos de Jefes que lleguen después.
// ============================================================================

export type EnemyArchetype =
  | 'abyssal_cell'
  | 'spiral_octopus'
  | 'crab_gunner'
  | 'ground_golem'
  | 'lightning_butterfly'
  | 'giant_sparrow'
  | 'prisma_necroz'
  | 'kronos_leviathan';

/** Enemigo de la cúpula desacoplado de cualquier modelo 3D concreto. */
export interface DomeEnemyEntity {
  id: string;
  archetype: EnemyArchetype;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  radius: number;
  /** Mesh/Grupo real (esfera de prueba, GLB de enemigo, etc.). Solo para VFX/lock-on. */
  mesh: THREE.Object3D;
  hp: number;
  maxHp: number;
  /** Grosor de la carne amortiguadora (0..100). Fuerza cinética mínima para penetrar. */
  fleshThickness: number;
  /** true si su estrella interior es alcanzable (todos los enemigos la tienen). */
  hasInnerStar: boolean;
  expValue: number;
  isElite: boolean;
  isBoss: boolean;
  /** Puntos débiles restantes (1 normales/Prisma Necroz, 2 Gorrión, N Kronos). */
  weakPointsRemaining: number;
  evasive: boolean;
  evadeCooldown: number;
  /** Flash de impacto 0..1 (decae en el update visual del caller). */
  hitFlash: number;
  stunTimer: number;
  /** Pinchos activos (Prisma Necroz): repelen cualquier golpe cuerpo a cuerpo. */
  spikesActive?: boolean;
  /** Boca abierta (Gorrión): habilita golpear el cristal interior. */
  mouthOpen?: boolean;
  /**
   * Segundos restantes de ventana vulnerable (Prisma Necroz tras su dash
   * evasivo o su ráfaga): los golpes penetran directo al star_core.
   */
  vulnerableTimer?: number;
  alive: boolean;
}

/** Resultado de un impacto cinético de Nyx (patada/taladro) contra un enemigo. */
export interface KineticImpactResult {
  damage: number;
  /** true si el golpe atravesó la carne y alcanzó la estrella interior. */
  penetratedStar: boolean;
  killed: boolean;
  /** Velocidad a la que sale despedido el enemigo (para el knockback físico). */
  knockbackSpeed: number;
  /** true si Nyx debe rebotar con kick_flip (no penetró) en vez de atravesar. */
  recoilBounce: boolean;
  /** Hit-stop sugerido en segundos (congelar el frame para el game feel). */
  hitStopSec: number;
  reason: 'normal' | 'drill' | 'skill' | 'barrier_kill' | 'thorns_repel';
}

/** Estado de daño/alteraciones de Nyx gestionado por el sistema de combate. */
export interface NyxStatusEffects {
  invulnTimer: number;
  staggerTimer: number;
  /** Segundos restantes de ceguera por tinta del Pulpo Espiral (0 = limpia). */
  inkBlindTimer: number;
  /** Duración TOTAL de la mancha activa (s): regula el fundido inicial/final. */
  inkStainDuration: number;
  /** Opacidad de la mancha activa (0.55 bola base, 0.65 contra-parry a bocajarro). */
  inkStainOpacity: number;
  /** Acumulador fraccionario del drenaje de HP por tinta (4 HP/s). */
  inkTickAccum: number;
}

// ---------------------------------------------------------------------------
// Constantes de combate
// ---------------------------------------------------------------------------

/** Multiplicador de fuerza de la Patada Taladro Espiral (sección 3.3). */
const DRILL_FORCE_MULTIPLIER = 1.55;
/** Carne desgastada por cada punto de fuerza cinética al no penetrar. */
const FLESH_WEAR_PER_FORCE = 0.18;
/** Daño parcial por punto de fuerza al golpear solo la carne. */
const FLESH_DAMAGE_PER_FORCE = 0.9;
/** Daño por punto de fuerza al penetrar y tocar la estrella. */
const STAR_DAMAGE_PER_FORCE = 2.2;
/** Fracción mínima del maxHp que arranca cada penetración a la estrella. */
const STAR_DAMAGE_MIN_FRACTION = 0.34;
/** Knockback del enemigo por punto de fuerza (reducido si Nyx lo atraviesa). */
const KNOCKBACK_PER_FORCE = 0.35;
const KNOCKBACK_PENETRATED_SCALE = 0.35;
const HITSTOP_BASE = 0.045;
const HITSTOP_PENETRATE = 0.09;
const HITSTOP_KILL = 0.12;

/** Regla de la Barrera Blanca (sección 2.1): -10 HP para Nyx. */
const NYX_BARRIER_DAMAGE = 10;
const NYX_BARRIER_INVULN_SEC = 0.8;
const NYX_BARRIER_STAGGER_SEC = 0.5;
/**
 * Tinta Ácida del Pulpo Espiral (rediseño): la mancha ya NO es un bucle fijo
 * — cada impacte fija su duración y opacidad. Bola base: 3.0 s al 55 %;
 * contra-parry a bocajarro: 5–10 s aleatorios al 65 %. El DoT drena 4 HP/s
 * durante TODA la duración de la mancha sin cortar el movimiento de Nyx.
 */
export const INK_DOT_PER_SEC = 4.0;
/** Mancha de impacto de las bolas de tinta (base y de la Bola Gigante). */
export const INK_STAIN_SEC = 3.0;
export const INK_STAIN_OPACITY = 0.55;
/** Mancha del contra-parry a bocajarro (opacidad y duración aleatoria). */
export const INK_COUNTER_OPACITY = 0.65;
export const INK_COUNTER_MIN_SEC = 5.0;
export const INK_COUNTER_MAX_SEC = 10.0;
/** Fundidos de la mancha (s): arranque instantáneo, cola corta al expirar. */
const INK_FADE_IN_SEC = 0.12;
const INK_FADE_OUT_SEC = 0.45;
/**
 * Daño que recibe Nyx al golpear cuerpo a cuerpo al Prisma Necroz con los
 * pinchos sacados (además de la repulsión del `thorns_repel`).
 */
export const THORNS_DAMAGE_TO_NYX = 8;

// ---------------------------------------------------------------------------
// Stats por arquetipo (secciones 6.2–6.4 del diseño)
// ---------------------------------------------------------------------------

export interface EnemyArchetypeStats {
  maxHp: number;
  radius: number;
  fleshThickness: number;
  expValue: number;
  isElite: boolean;
  isBoss: boolean;
  weakPoints: number;
  evasive: boolean;
}

export const DOME_ENEMY_ARCHETYPES: Record<EnemyArchetype, EnemyArchetypeStats> = {
  // Célula Abisal: poca carne, estrella bien visible, revienta con poca velocidad.
  abyssal_cell: { maxHp: 40, radius: 1.6, fleshThickness: 15, expValue: 1.0, isElite: false, isBoss: false, weakPoints: 1, evasive: false },
  // Pulpo Espiral (rediseño): hostigador táctico de media distancia. Toda su
  // evasión y el Contra-Parry los gobierna su propio ciclo de 5.0 s en
  // DomeWaveManager — el dash evasivo genérico de 3 s NO aplica.
  spiral_octopus: { maxHp: 70, radius: 2.2, fleshThickness: 55, expValue: 1.5, isElite: false, isBoss: false, weakPoints: 1, evasive: false },
  // Cangrejo Artillero: torreta pegada a suelos, dispara esferas oscuras.
  crab_gunner: { maxHp: 60, radius: 1.8, fleshThickness: 35, expValue: 1.25, isElite: false, isBoss: false, weakPoints: 1, evasive: false },
  // Gólem Rompesuelos: mucha carne/blindaje, manotazo que aturde.
  ground_golem: { maxHp: 140, radius: 3.2, fleshThickness: 80, expValue: 2.0, isElite: false, isBoss: false, weakPoints: 1, evasive: false },
  // Mariposa Relámpago: aguanta 2 rocas pequeñas (30 dmg), muere con 1 mediana (32 dmg) o bola eléctrica devuelta.
  lightning_butterfly: { maxHp: 31, radius: 1.2, fleshThickness: 8, expValue: 1.5, isElite: false, isBoss: false, weakPoints: 1, evasive: false },
  // Gorrión Gigante (Élite): 2 cristales — pecho y boca (solo con mouthOpen).
  giant_sparrow: { maxHp: 416, radius: 4.5, fleshThickness: 85, expValue: 3.0, isElite: true, isBoss: false, weakPoints: 2, evasive: false },
  // Prisma Necroz (Élite): 1 cristal en el pecho, saca pinchos de frente.
  prisma_necroz: { maxHp: 300, radius: 3.8, fleshThickness: 65, expValue: 3.0, isElite: true, isBoss: false, weakPoints: 1, evasive: false },
  // Leviatán KRONOS (Boss, rediseño): la barra genérica de HP NO existe — su
  // vida son 4 Estrellas Dorsales (hp 4 = 1 punto por estrella; se rompen en
  // el manager con las reglas anti-skip, jamás vía computeKineticImpact).
  // El radio de su esfera es el de la CABEZA: el resto del cuerpo son las
  // hitboxes segmentadas reales de la cadena (domeKronosBehavior).
  kronos_leviathan: { maxHp: 4, radius: 3.2, fleshThickness: 90, expValue: 10.0, isElite: false, isBoss: true, weakPoints: 4, evasive: false },
};

/**
 * Fábrica desacoplada: crea un `DomeEnemyEntity` desde un arquetipo y cualquier
 * `THREE.Object3D` (esfera de prueba hoy, GLB de enemigo/Jefe mañana).
 */
export function createDomeEnemyEntity(
  id: string,
  archetype: EnemyArchetype,
  mesh: THREE.Object3D,
  position: THREE.Vector3,
): DomeEnemyEntity {
  const stats = DOME_ENEMY_ARCHETYPES[archetype];
  return {
    id,
    archetype,
    position: position.clone(),
    velocity: new THREE.Vector3(),
    radius: stats.radius,
    mesh,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    fleshThickness: stats.fleshThickness,
    hasInnerStar: true,
    expValue: stats.expValue,
    isElite: stats.isElite,
    isBoss: stats.isBoss,
    weakPointsRemaining: stats.weakPoints,
    evasive: stats.evasive,
    evadeCooldown: 0,
    hitFlash: 0,
    stunTimer: 0,
    spikesActive: false,
    mouthOpen: false,
    vulnerableTimer: 0,
    alive: true,
  };
}

// ---------------------------------------------------------------------------
// Sistema de combate
// ---------------------------------------------------------------------------

export class DomeCombatSystem {
  /** Estado de alteraciones de Nyx (leerlo para el HUD/VFX, no mutarlo a mano). */
  readonly nyxStatus: NyxStatusEffects;
  private nyxHp: number;
  private nyxMaxHp: number;

  constructor(nyxMaxHp = 100) {
    this.nyxMaxHp = nyxMaxHp;
    this.nyxHp = nyxMaxHp;
    this.nyxStatus = {
      invulnTimer: 0,
      staggerTimer: 0,
      inkBlindTimer: 0,
      inkStainDuration: INK_STAIN_SEC,
      inkStainOpacity: 0,
      inkTickAccum: 0,
    };
  }

  get hp(): number {
    return this.nyxHp;
  }

  get maxHp(): number {
    return this.nyxMaxHp;
  }

  get isNyxDown(): boolean {
    return this.nyxHp <= 0;
  }

  /**
   * Sincroniza la vida real de Nyx desde el controlador para que `isNyxDown` no
   * quede atascado en `true` tras curaciones (p. ej. Absorción de Edén) y bloquee
   * alteraciones como la mancha de tinta ácida.
   */
  syncNyxHp(hp: number, maxHp?: number): void {
    if (maxHp !== undefined && maxHp > 0) {
      this.nyxMaxHp = maxHp;
    }
    this.nyxHp = Math.max(0, hp);
  }

  reset(nyxMaxHp = this.nyxMaxHp): void {
    this.nyxHp = nyxMaxHp;
    this.nyxStatus.invulnTimer = 0;
    this.nyxStatus.staggerTimer = 0;
    this.nyxStatus.inkBlindTimer = 0;
    this.nyxStatus.inkStainDuration = INK_STAIN_SEC;
    this.nyxStatus.inkStainOpacity = 0;
    this.nyxStatus.inkTickAccum = 0;
  }

  /**
   * Fuerza = f(velocidad) (sección 3.2): calcula el resultado de un impacto
   * cinético contra la carne/estrella de un enemigo.
   *
   * - Pinchos activos (Prisma Necroz de frente): repelen sin daño (`thorns_repel`).
   * - Boca abierta del Gorrión o ventana vulnerable del Prisma Necroz: el golpe
   *   penetra directo a la estrella (daño pleno) sin importar la fuerza.
   * - Si `bypassFlesh` (habilidad) o la fuerza supera `fleshThickness`, el
   *   golpe penetra hasta la estrella: destruye 1 punto débil y hace daño
   *   masivo.
   * - Si no supera la carne, la desgasta y hace daño parcial proporcional.
   */
  computeKineticImpact(
    enemy: DomeEnemyEntity,
    impactSpeed: number,
    speedForceMultiplier: number,
    isDrill: boolean,
    bypassFlesh = false,
  ): KineticImpactResult {
    if (!enemy.alive) {
      return {
        damage: 0,
        penetratedStar: false,
        killed: false,
        knockbackSpeed: 0,
        recoilBounce: false,
        hitStopSec: 0,
        reason: 'normal',
      };
    }

    const kineticForce = impactSpeed * speedForceMultiplier * (isDrill ? DRILL_FORCE_MULTIPLIER : 1.0);

    // Prisma Necroz con pinchos sacados: nada cuerpo a cuerpo le hace daño.
    if (enemy.spikesActive) {
      return {
        damage: 0,
        penetratedStar: false,
        killed: false,
        knockbackSpeed: kineticForce * KNOCKBACK_PER_FORCE,
        recoilBounce: true,
        hitStopSec: HITSTOP_BASE,
        reason: 'thorns_repel',
      };
    }

    let damage: number;
    let penetratedStar = false;
    let reason: KineticImpactResult['reason'] = isDrill ? 'drill' : 'normal';

    // Boca abierta del Gorrión (star_core_mouth expuesto) o ventana vulnerable
    // del Prisma Necroz (pinchos retraídos): la carne se ignora y el golpe alcanza
    // la estrella con daño pleno.
    const mouthExposed = enemy.archetype === 'giant_sparrow' && enemy.mouthOpen === true;
    const vulnerable = (enemy.vulnerableTimer ?? 0) > 0;

    if (bypassFlesh || mouthExposed || vulnerable || kineticForce >= enemy.fleshThickness) {
      // Penetración directa a la estrella 3D de 6 puntas.
      penetratedStar = true;
      if (bypassFlesh) {
        reason = 'skill';
      }
      enemy.weakPointsRemaining = Math.max(0, enemy.weakPointsRemaining - 1);
      const starFloor =
        enemy.isElite && !isDrill && impactSpeed < 16
          ? 0
          : enemy.maxHp * STAR_DAMAGE_MIN_FRACTION;
      damage = Math.max(kineticForce * STAR_DAMAGE_PER_FORCE, starFloor);
    } else {
      // Solo alcanza la carne: la desgasta y hace daño parcial proporcional.
      const wear = Math.min(enemy.fleshThickness, kineticForce * FLESH_WEAR_PER_FORCE);
      enemy.fleshThickness -= wear;
      damage = kineticForce * FLESH_DAMAGE_PER_FORCE;
    }

    enemy.hp = Math.max(0, enemy.hp - damage);
    enemy.hitFlash = 1;
    const killed = enemy.hp <= 0;
    if (killed) {
      enemy.alive = false;
    }

    return {
      damage,
      penetratedStar,
      killed,
      // El taladro atraviesa: el enemigo apenas sale despedido.
      knockbackSpeed: kineticForce * KNOCKBACK_PER_FORCE * (penetratedStar ? KNOCKBACK_PENETRATED_SCALE : 1.0),
      // Sin penetrar, Nyx rebota con 1 kick_flip; el taladro pasa de largo.
      recoilBounce: !penetratedStar,
      hitStopSec: killed ? HITSTOP_KILL : penetratedStar ? HITSTOP_PENETRATE : HITSTOP_BASE,
      reason,
    };
  }

  /**
   * Regla de la Barrera Blanca (sección 2.1): cualquier enemigo normal (no
   * élite, no boss) que toca la barrera muere instantáneamente.
   */
  checkDomeBarrierKill(enemy: DomeEnemyEntity, boundRadius = DOME_PLAYER_BOUND_RADIUS): boolean {
    if (!enemy.alive || enemy.isBoss || enemy.isElite) {
      return false;
    }
    if (enemy.position.length() + enemy.radius >= boundRadius) {
      enemy.hp = 0;
      enemy.alive = false;
      return true;
    }
    return false;
  }

  /** Envoltorio de la barrera como impacto (para reutilizar el hit-stop/VFX). */
  computeBarrierImpact(enemy: DomeEnemyEntity, boundRadius = DOME_PLAYER_BOUND_RADIUS): KineticImpactResult | null {
    if (!this.checkDomeBarrierKill(enemy, boundRadius)) {
      return null;
    }
    return {
      damage: enemy.maxHp,
      penetratedStar: true,
      killed: true,
      knockbackSpeed: 0,
      recoilBounce: false,
      hitStopSec: HITSTOP_BASE,
      reason: 'barrier_kill',
    };
  }

  /**
   * Nyx choca contra la Barrera Blanca: -10 HP, invulnerabilidad breve y
   * stagger para la animación `dome_bounce`. Devuelve el HP restado (0 si
   * estaba invulnerable).
   */
  applyDomeBarrierDamageToNyx(): number {
    if (this.nyxStatus.invulnTimer > 0 || this.isNyxDown) {
      return 0;
    }
    this.nyxHp = Math.max(0, this.nyxHp - NYX_BARRIER_DAMAGE);
    this.nyxStatus.invulnTimer = NYX_BARRIER_INVULN_SEC;
    this.nyxStatus.staggerTimer = NYX_BARRIER_STAGGER_SEC;
    return NYX_BARRIER_DAMAGE;
  }

  /**
   * Tinta Ácida del Pulpo Espiral: mancha la pantalla con opacidad y duración
   * dadas (3.0 s/55 % bola base; 5-10 s/65 % contra-parry) y drena 4 HP/s
   * durante toda la mancha. El drenaje real ocurre en `updatePlayerStatus`;
   * aquí devuelve el total que quedará pendiente.
   */
  applyOctopusInkAttack(durationSec: number, opacity: number): number {
    if (this.isNyxDown) {
      return 0;
    }
    this.nyxStatus.inkBlindTimer = durationSec;
    this.nyxStatus.inkStainDuration = durationSec;
    this.nyxStatus.inkStainOpacity = opacity;
    this.nyxStatus.inkTickAccum = 0;
    return Math.round(INK_DOT_PER_SEC * durationSec);
  }

  /**
   * Update por frame de las alteraciones de Nyx. Devuelve el daño de tinta
   * aplicado este frame, la intensidad del manchado de pantalla (opacidad de
   * la mancha con fundidos de entrada/salida, 0..1) y si sigue aturdida.
   */
  updatePlayerStatus(dt: number): { inkDamageThisFrame: number; inkIntensity: number; isStaggered: boolean } {
    const status = this.nyxStatus;
    let inkDamageThisFrame = 0;
    let inkIntensity = 0;

    if (status.inkBlindTimer > 0) {
      // DoT Ácido: drena 4 HP/s durante TODA la duración de la mancha.
      status.inkTickAccum += dt * INK_DOT_PER_SEC;
      const wholeHp = Math.floor(status.inkTickAccum);
      if (wholeHp > 0) {
        status.inkTickAccum -= wholeHp;
        inkDamageThisFrame = wholeHp;
        this.nyxHp = Math.max(0, this.nyxHp - wholeHp);
      }
      // Mancha: opacidad plena durante la duración, arranque instantáneo y
      // fundido corto en los últimos 0.45 s antes de limpiarse.
      const elapsedSec = status.inkStainDuration - status.inkBlindTimer;
      const fadeIn = Math.min(1, elapsedSec / INK_FADE_IN_SEC);
      const fadeOut = Math.min(1, status.inkBlindTimer / INK_FADE_OUT_SEC);
      inkIntensity = status.inkStainOpacity * fadeIn * fadeOut;
      status.inkBlindTimer = Math.max(0, status.inkBlindTimer - dt);
    } else {
      status.inkTickAccum = 0;
    }

    status.invulnTimer = Math.max(0, status.invulnTimer - dt);
    status.staggerTimer = Math.max(0, status.staggerTimer - dt);

    return {
      inkDamageThisFrame,
      inkIntensity,
      isStaggered: status.staggerTimer > 0,
    };
  }
}
