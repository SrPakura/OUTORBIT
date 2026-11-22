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
// prueba actuales que con los modelos Nevi/Jefes que lleguen después.
// ============================================================================

export type EnemyArchetype =
  | 'abyssal_cell'
  | 'spiral_octopus'
  | 'crab_gunner'
  | 'ground_golem'
  | 'lightning_butterfly'
  | 'giant_sparrow'
  | 'prisma_necrozma'
  | 'kronos_leviathan';

/** Enemigo de la cúpula desacoplado de cualquier modelo 3D concreto. */
export interface DomeEnemyEntity {
  id: string;
  archetype: EnemyArchetype;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  radius: number;
  /** Mesh/Grupo real (esfera de prueba, GLB de Nevi, etc.). Solo para VFX/lock-on. */
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
  /** Puntos débiles restantes (1 normales/Necrozma, 2 Gorrión, N Kronos). */
  weakPointsRemaining: number;
  evasive: boolean;
  evadeCooldown: number;
  /** Flash de impacto 0..1 (decae en el update visual del caller). */
  hitFlash: number;
  stunTimer: number;
  /** Pinchos activos (Prisma Necrozma): repelen cualquier golpe cuerpo a cuerpo. */
  spikesActive?: boolean;
  /** Boca abierta (Gorrión): habilita golpear el cristal interior. */
  mouthOpen?: boolean;
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
  /** Acumulador fraccionario del drenaje de HP por tinta (3 HP/s). */
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
/** Tinta del Pulpo Espiral: 5 s de pantalla manchada, 12 HP en 4 s (3 HP/s). */
const INK_BLIND_DURATION = 5.0;
const INK_DAMAGE_TOTAL = 12;
const INK_DAMAGE_DURATION = 4.0;
const INK_DAMAGE_PER_SEC = INK_DAMAGE_TOTAL / INK_DAMAGE_DURATION;

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
  // Pulpo Espiral: estrella profunda, dashes en espiral, ataque de tinta.
  spiral_octopus: { maxHp: 70, radius: 2.2, fleshThickness: 55, expValue: 1.5, isElite: false, isBoss: false, weakPoints: 1, evasive: true },
  // Cangrejo Artillero: torreta pegada a suelos, dispara esferas oscuras.
  crab_gunner: { maxHp: 60, radius: 1.8, fleshThickness: 35, expValue: 1.25, isElite: false, isBoss: false, weakPoints: 1, evasive: false },
  // Gólem Rompesuelos: mucha carne/blindaje, manotazo que aturde.
  ground_golem: { maxHp: 140, radius: 3.2, fleshThickness: 80, expValue: 2.0, isElite: false, isBoss: false, weakPoints: 1, evasive: false },
  // Mariposa Relámpago: se revienta de un golpe básico pero es escurridiza.
  lightning_butterfly: { maxHp: 25, radius: 1.2, fleshThickness: 8, expValue: 1.5, isElite: false, isBoss: false, weakPoints: 1, evasive: true },
  // Gorrión Gigante (Élite): 2 cristales — pecho y boca (solo con mouthOpen).
  giant_sparrow: { maxHp: 320, radius: 4.5, fleshThickness: 60, expValue: 3.0, isElite: true, isBoss: false, weakPoints: 2, evasive: true },
  // Prisma Necrozma (Élite): 1 cristal en el pecho, saca pinchos de frente.
  prisma_necrozma: { maxHp: 300, radius: 3.8, fleshThickness: 65, expValue: 3.0, isElite: true, isBoss: false, weakPoints: 1, evasive: true },
  // Leviatán KRONOS (Boss): estrellas vitales cada 3 segmentos del cuerpo.
  kronos_leviathan: { maxHp: 900, radius: 6.5, fleshThickness: 90, expValue: 10.0, isElite: false, isBoss: true, weakPoints: 6, evasive: false },
};

/**
 * Fábrica desacoplada: crea un `DomeEnemyEntity` desde un arquetipo y cualquier
 * `THREE.Object3D` (esfera de prueba hoy, GLB de Nevi/Jefe mañana).
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
  private readonly nyxMaxHp: number;

  constructor(nyxMaxHp = 100) {
    this.nyxMaxHp = nyxMaxHp;
    this.nyxHp = nyxMaxHp;
    this.nyxStatus = {
      invulnTimer: 0,
      staggerTimer: 0,
      inkBlindTimer: 0,
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

  reset(nyxMaxHp = this.nyxMaxHp): void {
    this.nyxHp = nyxMaxHp;
    this.nyxStatus.invulnTimer = 0;
    this.nyxStatus.staggerTimer = 0;
    this.nyxStatus.inkBlindTimer = 0;
    this.nyxStatus.inkTickAccum = 0;
  }

  /**
   * Fuerza = f(velocidad) (sección 3.2): calcula el resultado de un impacto
   * cinético contra la carne/estrella de un enemigo.
   *
   * - Pinchos activos (Necrozma de frente): repelen sin daño (`thorns_repel`).
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

    // Prisma Necrozma con pinchos sacados: nada cuerpo a cuerpo le hace daño.
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

    if (bypassFlesh || kineticForce >= enemy.fleshThickness) {
      // Penetración directa a la estrella 3D de 6 puntas.
      penetratedStar = true;
      if (bypassFlesh) {
        reason = 'skill';
      }
      enemy.weakPointsRemaining = Math.max(0, enemy.weakPointsRemaining - 1);
      damage = Math.max(kineticForce * STAR_DAMAGE_PER_FORCE, enemy.maxHp * STAR_DAMAGE_MIN_FRACTION);
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
   * Chorro de tinta del Pulpo Espiral: 5 s de pantalla manchada y 12 HP
   * drenados a lo largo de los primeros 4 s (3 HP/s). El drenaje real ocurre
   * en `updatePlayerStatus`; aquí devuelve el total que quedará pendiente.
   */
  applyOctopusInkAttack(): number {
    if (this.isNyxDown) {
      return 0;
    }
    this.nyxStatus.inkBlindTimer = INK_BLIND_DURATION;
    this.nyxStatus.inkTickAccum = 0;
    return INK_DAMAGE_TOTAL;
  }

  /**
   * Update por frame de las alteraciones de Nyx. Devuelve el daño de tinta
   * aplicado este frame, la intensidad del manchado de pantalla (0..1) y si
   * sigue aturdida (stagger).
   */
  updatePlayerStatus(dt: number): { inkDamageThisFrame: number; inkIntensity: number; isStaggered: boolean } {
    const status = this.nyxStatus;
    let inkDamageThisFrame = 0;

    if (status.inkBlindTimer > 0) {
      const blindElapsed = INK_BLIND_DURATION - status.inkBlindTimer;
      if (blindElapsed < INK_DAMAGE_DURATION) {
        status.inkTickAccum += dt * INK_DAMAGE_PER_SEC;
        const wholeHp = Math.floor(status.inkTickAccum);
        if (wholeHp > 0) {
          status.inkTickAccum -= wholeHp;
          inkDamageThisFrame = wholeHp;
          this.nyxHp = Math.max(0, this.nyxHp - wholeHp);
        }
      }
      status.inkBlindTimer = Math.max(0, status.inkBlindTimer - dt);
    } else {
      status.inkTickAccum = 0;
    }

    status.invulnTimer = Math.max(0, status.invulnTimer - dt);
    status.staggerTimer = Math.max(0, status.staggerTimer - dt);

    return {
      inkDamageThisFrame,
      inkIntensity: Math.min(1, status.inkBlindTimer / INK_BLIND_DURATION),
      isStaggered: status.staggerTimer > 0,
    };
  }
}
