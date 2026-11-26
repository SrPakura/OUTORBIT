import * as THREE from 'three';
import type { ManagedWaveEnemy } from '@/game/dome/DomeWaveManager';
import type { ActiveSkillId, DomeProgressionManager } from '@/game/dome/DomeProgression';
import type { SlabCollider } from '@/game/dome/domeTypes';
import {
  createEmptySyntheticInput,
  type SyntheticPlayerInput,
  type TrailerBotConfig,
  type TrailerThreatInfo,
} from './trailerTypes';

// ============================================================================
// DomeTrailerBot — IA de movimiento y combate cinematográfico para tráilers.
//
// Diseñada para ejecutarse a 60 Hz deterministas:
//  - Mantiene velocidad máxima sostenida (18–34 m/s) encadenando impulsos.
//  - Slalom por detrás de los suelos flotantes y cebos contra losas.
//  - Rebotes cinéticos en suelos -> whip-turn instantáneo -> ataque a enemigo.
//  - Trickshots 360° con habilidades a distancia y robo de bolas de tinta/rayo.
//  - Esquives al último segundo (CPA) contra proyectiles, láseres y embestidas.
//  - Parrys perfectos de 2 fases al Gólem + KOs contra la Barrera Blanca.
// ============================================================================

export interface BotParryInfo {
  active: boolean;
  phase: 'parry_decide' | 'parry_dash' | 'parry_strike' | null;
  starPoint: THREE.Vector3;
  headPoint: THREE.Vector3;
}

export interface BotKineticBounceInfo {
  state: 'none' | 'charging' | 'ready';
  aimReady: boolean;
  surfaceNormal: THREE.Vector3;
}

export interface BotWorldContext {
  dt: number;
  tick: number;
  playerPos: THREE.Vector3;
  playerVel: THREE.Vector3;
  playerSpeed: number;
  aimForward: THREE.Vector3;
  aimUp: THREE.Vector3;
  mode: 'grounded' | 'floating' | 'speed_attack' | 'kinetic_bounce';
  enemies: readonly ManagedWaveEnemy[];
  slabs: readonly SlabCollider[];
  threats: readonly TrailerThreatInfo[];
  progression: DomeProgressionManager;
  parry: BotParryInfo;
  kineticBounce: BotKineticBounceInfo;
}

type BotFsmState =
  | 'combat_drill'
  | 'kinetic_bounce_approach'
  | 'kinetic_bounce_redirect'
  | 'trickshot_360'
  | 'flow_slalom';

const DOME_SOFT_BOUND = 76;
const RANGED_TRICKSHOT_SKILLS: readonly ActiveSkillId[] = [
  'gravity_field',
  'bounce_horizon',
  'black_hole',
  'attraction_well',
  'implosion',
];

export class DomeTrailerBot {
  private readonly config: TrailerBotConfig;
  private state: BotFsmState = 'combat_drill';
  private stateTimer = 0;
  private targetEnemyId: string | null = null;
  private targetSlabCenter = new THREE.Vector3();
  private trickshotSkillId: ActiveSkillId = 'bounce_horizon';
  private trickshotDuration = 0.36;
  private trickshotElapsed = 0;
  private trickshotPrevAngle = 0;
  private trickshotSign = 1;
  private dodgeCooldown = 0;
  private bounceCooldown = 2.0;
  private trickshotCooldown = 2.5;
  private dashPulseCooldown = 0;
  private jumpPulseCooldown = 0;
  private slalomPhase = 0;
  private readonly omniCooldowns: Record<ActiveSkillId, number> = {
    gravity_field: 0,
    repulse_push: 0,
    eden_absorb: 0,
    attraction_well: 0,
    bounce_horizon: 0,
    black_hole: 0,
    implosion: 0,
  };

  // Vectores scratch sin asignaciones por tick
  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();
  private readonly tmpDesired = new THREE.Vector3();
  private readonly tmpEnemyOffset = new THREE.Vector3();
  private readonly tmpCross = new THREE.Vector3();
  private readonly tmpBestTarget = new THREE.Vector3();
  private readonly outInput: SyntheticPlayerInput = createEmptySyntheticInput();

  constructor(config: TrailerBotConfig) {
    this.config = config;
  }

  step(ctx: BotWorldContext): SyntheticPlayerInput {
    const inp = this.outInput;
    inp.moveX = 0;
    inp.moveY = -1; // empuje máximo hacia adelante
    inp.lookDx = 0;
    inp.lookDy = 0;
    inp.wantAttack = false;
    inp.attackHeld = false;
    inp.wantDash = false;
    inp.dashHeld = false;
    inp.wantJump = false;
    inp.wantSlot = null;
    inp.extraSkill = null;

    const dt = ctx.dt;
    this.stateTimer += dt;
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.bounceCooldown = Math.max(0, this.bounceCooldown - dt);
    this.trickshotCooldown = Math.max(0, this.trickshotCooldown - dt);
    this.dashPulseCooldown = Math.max(0, this.dashPulseCooldown - dt);
    this.jumpPulseCooldown = Math.max(0, this.jumpPulseCooldown - dt);
    this.slalomPhase += dt * (this.config.style === 'hyper' ? 2.6 : 1.7);
    for (const k of Object.keys(this.omniCooldowns) as ActiveSkillId[]) {
      this.omniCooldowns[k] = Math.max(0, this.omniCooldowns[k] - dt);
    }

    // Si estamos en modo suelo al inicio o tras aterrizar, saltar al instante al vacío
    if (ctx.mode === 'grounded' && this.jumpPulseCooldown <= 0) {
      inp.wantJump = true;
      this.jumpPulseCooldown = 0.35;
    }

    // ------------------------------------------------------------------
    // 1. PRIORIDAD MÁXIMA: Parry perfecto de 2 fases del Gólem
    // ------------------------------------------------------------------
    if (ctx.parry.active) {
      this.state = 'combat_drill';
      if (ctx.parry.phase === 'parry_decide') {
        this.steerCameraToward(ctx, ctx.parry.starPoint, 22, inp);
        if (this.dashPulseCooldown <= 0) {
          inp.wantDash = true;
          this.dashPulseCooldown = 0.12;
        }
        return inp;
      }
      if (ctx.parry.phase === 'parry_strike') {
        this.steerCameraToward(ctx, ctx.parry.headPoint, 24, inp);
        inp.wantAttack = true;
        inp.attackHeld = true;
        return inp;
      }
      if (ctx.parry.phase === 'parry_dash') {
        this.steerCameraToward(ctx, ctx.parry.headPoint, 18, inp);
        inp.attackHeld = true;
        return inp;
      }
    }

    // ------------------------------------------------------------------
    // 2. ESTILO 'dodge': Staredown épico desde lejos + esquives al último segundo
    // ------------------------------------------------------------------
    if (this.config.style === 'dodge') {
      const target = this.pickBestEnemy(ctx.enemies, ctx.playerPos, ctx.aimForward);
      if (target) {
        this.steerCameraToward(ctx, target.position, 9.0, inp);
        const dist = ctx.playerPos.distanceTo(target.position);
        // Mantener distancia épica (24–36 m) mirando fijamente al enemigo
        if (dist > 36) inp.moveY = -0.55;
        else if (dist < 22) inp.moveY = 0.55;
        else inp.moveY = 0;
      } else {
        inp.moveY = 0;
      }
      if (this.dodgeCooldown <= 0 && ctx.threats.length > 0) {
        const dodgeVec = this.evaluateLastSecondDodge(ctx, 0.25, 2.1);
        if (dodgeVec) {
          this.tmpRight.crossVectors(ctx.aimForward, ctx.aimUp).normalize();
          const side = dodgeVec.dot(this.tmpRight);
          inp.moveX = side >= 0 ? 1 : -1;
          inp.moveY = 0;
          inp.wantDash = true;
          inp.dashHeld = true;
          this.dodgeCooldown = 0.48;
        }
      }
      return inp;
    }

    // ------------------------------------------------------------------
    // 2b. ESTILO 'parry': Solo Parrys perfectos (provoca y espera al Gólem)
    // ------------------------------------------------------------------
    if (this.config.style === 'parry') {
      const golem =
        ctx.enemies.find((e) => e.entity.hp > 0 && e.entity.archetype === 'ground_golem') ??
        this.pickBestEnemy(ctx.enemies, ctx.playerPos, ctx.aimForward);
      if (golem) {
        this.steerCameraToward(ctx, golem.position, 11.0, inp);
        const dist = ctx.playerPos.distanceTo(golem.position);
        // Banda óptima para provocar la guardia y esperar la estrella dorada (8–13 m)
        if (dist > 13.5) inp.moveY = -0.65;
        else if (dist < 7.5) inp.moveY = 0.65;
        else inp.moveY = 0;
        inp.moveX = Math.sin(this.slalomPhase * 0.5) * 0.35;
      } else {
        inp.moveY = 0;
      }
      // Esquiva proyectiles si viene otro enemigo en la oleada, sin atacar ni hacer trickshots
      if (this.dodgeCooldown <= 0 && ctx.threats.length > 0) {
        const dodgeVec = this.evaluateLastSecondDodge(ctx, 0.24, 1.85);
        if (dodgeVec) {
          this.tmpRight.crossVectors(ctx.aimForward, ctx.aimUp).normalize();
          inp.moveX = dodgeVec.dot(this.tmpRight) >= 0 ? 1 : -1;
          inp.wantDash = true;
          inp.dashHeld = true;
          this.dodgeCooldown = 0.7;
        }
      }
      return inp;
    }

    // ------------------------------------------------------------------
    // 2c. PRIORIDAD ALTA: Esquive al último segundo (CPA)
    // ------------------------------------------------------------------
    if (this.dodgeCooldown <= 0 && ctx.threats.length > 0) {
      const dodgeVec = this.evaluateLastSecondDodge(ctx);
      if (dodgeVec) {
        // Convertir el vector de esquive a lateral/vertical respecto a la cámara
        this.tmpRight.crossVectors(ctx.aimForward, ctx.aimUp).normalize();
        const side = dodgeVec.dot(this.tmpRight);
        inp.moveX = side >= 0 ? 1 : -1;
        inp.moveY = -0.35;
        inp.wantDash = true;
        inp.dashHeld = true;
        this.dodgeCooldown = this.config.style === 'hyper' ? 0.55 : 0.85;
      }
    }

    // ------------------------------------------------------------------
    // 3. ROBO DE BOLAS (Pulpo / Mariposa) con Campo Gravitacional (cualquier hueco)
    // ------------------------------------------------------------------
    if (this.omniCooldowns.gravity_field <= 0 && this.state !== 'trickshot_360') {
      let stealCount = 0;
      for (const threat of ctx.threats) {
        if (!threat.stealable) continue;
        if (threat.position.distanceToSquared(ctx.playerPos) <= 8.5 * 8.5) {
          stealCount += 1;
        }
      }
      if (stealCount > 0) {
        this.fireOmniSkill('gravity_field', 4.5, inp);
        if (ctx.enemies.length > 0 && this.trickshotCooldown <= 0) {
          this.startTrickshot360('gravity_field', ctx.enemies, ctx.playerPos);
        }
      }
    }

    // ------------------------------------------------------------------
    // 4. REBOTE CINÉTICO ACTIVO -> Snap-Redirect a enemigo cercano
    // ------------------------------------------------------------------
    if (ctx.mode === 'kinetic_bounce' || ctx.kineticBounce.state !== 'none') {
      this.state = 'kinetic_bounce_redirect';
      const target = this.pickBestEnemy(ctx.enemies, ctx.playerPos, ctx.aimForward);
      if (target) {
        this.steerCameraToward(ctx, target.position, 26, inp);
      }
      if (ctx.kineticBounce.aimReady || ctx.kineticBounce.state === 'ready') {
        inp.wantAttack = true;
        inp.attackHeld = true;
        if (this.jumpPulseCooldown <= 0) {
          inp.wantJump = true;
          this.jumpPulseCooldown = 0.2;
        }
        this.bounceCooldown = this.config.style === 'hyper' ? 3.2 : 5.0;
        this.state = 'combat_drill';
        this.stateTimer = 0;
      }
      return inp;
    }

    // ------------------------------------------------------------------
    // 5. TRICKSHOT 360° EN CURSO
    // ------------------------------------------------------------------
    if (this.state === 'trickshot_360') {
      this.trickshotElapsed += dt;
      const t = Math.min(1, this.trickshotElapsed / this.trickshotDuration);
      // Curva smoothstep para que la vuelta de 360° tenga aceleración y frenada limpia
      const smooth = t * t * (3 - 2 * t);
      const targetAngle = smooth * Math.PI * 2 * this.trickshotSign;
      const deltaAngle = targetAngle - this.trickshotPrevAngle;
      this.trickshotPrevAngle = targetAngle;

      inp.lookDx = deltaAngle;
      inp.lookDy = 0;
      inp.moveY = -1;
      inp.dashHeld = true;

      if (t >= 1) {
        const target = this.pickEnemyByIdOrBest(ctx.enemies, this.targetEnemyId, ctx.playerPos, ctx.aimForward);
        if (target) {
          this.steerCameraToward(ctx, target.position, 28, inp);
        }
        this.fireOmniSkill(this.trickshotSkillId, 5.5, inp);
        inp.wantAttack = true;
        this.state = 'combat_drill';
        this.stateTimer = 0;
        this.trickshotCooldown =
          (this.config.style === 'hyper' ? 2.8 : 4.8) / Math.max(0.5, this.config.trickshotRate);
      }
      return inp;
    }

    // ------------------------------------------------------------------
    // 6. SELECCIÓN DE MANIOBRA (Rebote Cinético / 360° / Barrera KO / Drill)
    // ------------------------------------------------------------------
    const target = this.pickBestEnemy(ctx.enemies, ctx.playerPos, ctx.aimForward);

    // Home Run contra la Barrera Blanca con Empuje (sin depender de los 3 huecos)
    if (target) {
      const enemyDistFromCenter = target.position.length();
      const distToEnemy = target.position.distanceTo(ctx.playerPos);
      if (this.omniCooldowns.repulse_push <= 0 && enemyDistFromCenter > 52 && distToEnemy < 16) {
        this.steerCameraToward(ctx, target.position, 18, inp);
        this.fireOmniSkill('repulse_push', 5.0, inp);
      }
    }

    // Iniciar Trickshot 360° si tenemos alguna de las 7 habilidades a distancia lista
    if (
      target &&
      this.trickshotCooldown <= 0 &&
      ctx.playerSpeed > 16.5 &&
      ctx.playerPos.distanceTo(target.position) > 12 &&
      ctx.playerPos.distanceTo(target.position) < 48
    ) {
      const readySkill = this.pickReadyOmniSkill(RANGED_TRICKSHOT_SKILLS);
      if (readySkill !== null && Math.random() < 0.08 * this.config.trickshotRate) {
        this.startTrickshot360(readySkill, ctx.enemies, ctx.playerPos);
        return inp;
      }
    }

    // Iniciar aproximación a suelo flotante para Rebote Cinético (desactivado en 'flow' para no frenar)
    if (
      this.config.style !== 'flow' &&
      this.state === 'combat_drill' &&
      this.bounceCooldown <= 0 &&
      ctx.slabs.length > 0 &&
      target &&
      Math.random() < 0.05 * this.config.trickshotRate
    ) {
      const slab = this.pickBounceSlab(ctx.slabs, ctx.playerPos, target.position);
      if (slab) {
        this.targetSlabCenter.copy(slab.center);
        this.targetEnemyId = target.id;
        this.state = 'kinetic_bounce_approach';
        this.stateTimer = 0;
      }
    }

    if (this.state === 'kinetic_bounce_approach') {
      const distSlab = ctx.playerPos.distanceTo(this.targetSlabCenter);
      if (this.stateTimer > 2.4 || distSlab > 65) {
        this.state = 'combat_drill';
        this.stateTimer = 0;
        this.bounceCooldown = 2.0;
      } else {
        this.steerCameraToward(ctx, this.targetSlabCenter, 14, inp);
        inp.moveY = -1;
        inp.dashHeld = true;
        if (ctx.playerSpeed < 19 && this.dashPulseCooldown <= 0) {
          inp.wantDash = true;
          this.dashPulseCooldown = 0.28;
        }
        return inp;
      }
    }

    // ------------------------------------------------------------------
    // 7. MODO 'flow': Vuelo libre continuo a máxima velocidad + esquive de suelos + skills a distancia
    // ------------------------------------------------------------------
    if (this.config.style === 'flow') {
      // Trayectoria orbital amplia y fluida por el espacio abierto de la cúpula
      const orbitAngle = this.slalomPhase * 0.55;
      const orbitR = 38 + Math.sin(this.slalomPhase * 0.28) * 14;
      this.tmpDesired.set(
        Math.cos(orbitAngle) * orbitR,
        Math.sin(this.slalomPhase * 0.42) * 18,
        Math.sin(orbitAngle) * orbitR,
      );

      // Esquivar activamente cualquier suelo flotante en la ruta (margen amplio, cero frenadas)
      for (const slab of ctx.slabs) {
        this.tmpEnemyOffset.subVectors(ctx.playerPos, slab.center);
        const clearR = Math.max(slab.halfExtents.x, slab.halfExtents.z) + 8.5;
        const distSq = this.tmpEnemyOffset.lengthSq();
        if (distSq < clearR * clearR && distSq > 1e-4) {
          const dist = Math.sqrt(distSq);
          const pushWeight = (clearR - dist) / clearR;
          this.tmpDesired.addScaledVector(this.tmpEnemyOffset.divideScalar(dist), 28 * pushWeight);
        }
      }

      if (ctx.playerPos.length() > DOME_SOFT_BOUND) {
        this.tmpDesired.lerp(this.tmpCross.set(0, 0, 0), 0.7);
      }

      // Disparar habilidades a distancia en pleno vuelo (sin frenar con patadas cuerpo a cuerpo)
      if (target && ctx.playerPos.distanceTo(target.position) < 52) {
        const rangedSkill = this.pickReadyOmniSkill(RANGED_TRICKSHOT_SKILLS);
        if (rangedSkill !== null && Math.random() < 0.06 * this.config.trickshotRate) {
          this.steerCameraToward(ctx, target.position, 14, inp);
          this.fireOmniSkill(rangedSkill, 4.0, inp);
        }
      }

      this.steerCameraToward(ctx, this.tmpDesired, 6.5, inp);
      inp.moveY = -1;
      inp.dashHeld = true;
      inp.attackHeld = false;
      inp.wantAttack = false;
      if (ctx.playerSpeed < 25 && this.dashPulseCooldown <= 0) {
        inp.wantDash = true;
        this.dashPulseCooldown = 0.22;
      }
      return inp;
    }

    // ------------------------------------------------------------------
    // 7. COMBATE A MÁXIMA VELOCIDAD + SLALOM TRAS LOS SUELOS
    // ------------------------------------------------------------------
    if (target) {
      // Punto objetivo con ligero slalom alrededor de los suelos flotantes
      this.tmpDesired.copy(target.position);

      // Evitar bordes de la cúpula
      if (ctx.playerPos.length() > DOME_SOFT_BOUND) {
        this.tmpDesired.lerp(this.tmpCross.set(0, 0, 0), 0.55);
      } else {
        // Slalom sutil si hay un suelo flotante en la línea hacia el enemigo
        const blockingSlab = this.findSlabNearPath(ctx.slabs, ctx.playerPos, target.position);
        if (blockingSlab) {
          this.tmpEnemyOffset
            .subVectors(ctx.playerPos, blockingSlab.center)
            .normalize()
            .multiplyScalar(blockingSlab.halfExtents.x + 4.5);
          this.tmpDesired.copy(blockingSlab.center).add(this.tmpEnemyOffset);
        } else {
          // Ligero movimiento en S para dinamismo visual al acercarse desde lejos
          const dist = ctx.playerPos.distanceTo(target.position);
          if (dist > 22) {
            this.tmpRight.crossVectors(ctx.aimForward, ctx.aimUp).normalize();
            this.tmpDesired.addScaledVector(this.tmpRight, Math.sin(this.slalomPhase) * 4.5);
          }
        }
      }

      const dist = ctx.playerPos.distanceTo(target.position);
      const turnRate = dist < 14 ? 14 : 9.5;
      this.steerCameraToward(ctx, this.tmpDesired, turnRate, inp);

      // Mantener velocidad máxima: dash + ataque taladro continuo
      inp.moveY = -1;
      inp.dashHeld = true;
      inp.attackHeld = dist < 24 || ctx.playerSpeed > 15;
      if (dist < 18 || ctx.playerSpeed < 17.5) {
        if (this.dashPulseCooldown <= 0) {
          inp.wantDash = true;
          this.dashPulseCooldown = 0.38;
        }
      }
      if (dist < 16) {
        inp.wantAttack = true;
      }

      // Usar black_hole o attraction_well si hay varios enemigos juntos
      if (ctx.enemies.length >= 3 && dist > 10 && dist < 38) {
        const clusterSkill = this.pickReadyOmniSkill(['black_hole', 'attraction_well']);
        if (clusterSkill !== null && Math.random() < 0.04) {
          this.fireOmniSkill(clusterSkill, 6.5, inp);
        }
      }
    } else {
      // Sin enemigos vivos todavía: órbita fluida alrededor del centro
      this.tmpDesired.set(
        Math.cos(this.slalomPhase * 0.5) * 24,
        Math.sin(this.slalomPhase * 0.35) * 10,
        Math.sin(this.slalomPhase * 0.5) * 24,
      );
      this.steerCameraToward(ctx, this.tmpDesired, 6.0, inp);
      inp.moveY = -1;
      inp.dashHeld = true;
    }

    return inp;
  }

  private startTrickshot360(
    skillId: ActiveSkillId,
    enemies: readonly ManagedWaveEnemy[],
    playerPos: THREE.Vector3,
  ): void {
    const target = this.pickBestEnemy(enemies, playerPos, null);
    this.targetEnemyId = target ? target.id : null;
    this.trickshotSkillId = skillId;
    this.trickshotElapsed = 0;
    this.trickshotPrevAngle = 0;
    this.trickshotDuration = this.config.style === 'hyper' ? 0.32 : 0.42;
    this.trickshotSign = Math.random() < 0.5 ? 1 : -1;
    this.state = 'trickshot_360';
    this.stateTimer = 0;
  }

  private fireOmniSkill(skillId: ActiveSkillId, cooldownSec: number, out: SyntheticPlayerInput): void {
    out.extraSkill = skillId;
    this.omniCooldowns[skillId] = cooldownSec;
  }

  private pickReadyOmniSkill(candidates: readonly ActiveSkillId[]): ActiveSkillId | null {
    const ready = candidates.filter((id) => this.omniCooldowns[id] <= 0);
    if (ready.length === 0) return null;
    return ready[Math.floor(Math.random() * ready.length)];
  }

  private steerCameraToward(
    ctx: BotWorldContext,
    worldTarget: THREE.Vector3,
    maxAngularSpeed: number,
    out: SyntheticPlayerInput,
  ): void {
    this.tmpDir.subVectors(worldTarget, ctx.playerPos);
    const lenSq = this.tmpDir.lengthSq();
    if (lenSq < 1e-6) return;
    this.tmpDir.divideScalar(Math.sqrt(lenSq));

    this.tmpRight.crossVectors(ctx.aimForward, ctx.aimUp);
    if (this.tmpRight.lengthSq() < 1e-6) return;
    this.tmpRight.normalize();

    const forwardDot = THREE.MathUtils.clamp(this.tmpDir.dot(ctx.aimForward), -1, 1);
    const rightDot = this.tmpDir.dot(this.tmpRight);
    const yawErr = Math.atan2(rightDot, forwardDot);

    const targetPitch = Math.asin(THREE.MathUtils.clamp(this.tmpDir.dot(ctx.aimUp), -0.98, 0.98));
    const currentPitch = Math.asin(THREE.MathUtils.clamp(ctx.aimForward.dot(ctx.aimUp), -0.98, 0.98));
    const pitchErr = targetPitch - currentPitch;

    const maxStep = maxAngularSpeed * ctx.dt;
    // lookDx > 0 gira a la derecha; lookDy < 0 mira hacia arriba
    out.lookDx = THREE.MathUtils.clamp(yawErr, -maxStep, maxStep);
    out.lookDy = THREE.MathUtils.clamp(-pitchErr, -maxStep, maxStep);
  }

  private evaluateLastSecondDodge(
    ctx: BotWorldContext,
    maxCpaSec = 0.30,
    extraMargin = 1.85,
  ): THREE.Vector3 | null {
    let bestThreat: TrailerThreatInfo | null = null;
    let earliestCpa = Infinity;

    for (const threat of ctx.threats) {
      const relPos = this.tmpEnemyOffset.subVectors(threat.position, ctx.playerPos);
      const relVel = this.tmpDir.subVectors(threat.velocity, ctx.playerVel);
      const speedSq = relVel.lengthSq();
      if (speedSq < 1e-4) continue;

      const tCpa = -relPos.dot(relVel) / speedSq;
      if (tCpa < 0.03 || tCpa > maxCpaSec) continue;

      const cpaDistSq =
        relPos.lengthSq() + 2 * relPos.dot(relVel) * tCpa + speedSq * tCpa * tCpa;
      const dangerRadius = threat.radius + extraMargin;
      if (cpaDistSq <= dangerRadius * dangerRadius && tCpa < earliestCpa) {
        earliestCpa = tCpa;
        bestThreat = threat;
      }
    }

    if (!bestThreat) return null;

    // Vector perpendicular a la velocidad de la amenaza y al eje arriba
    this.tmpCross.crossVectors(bestThreat.velocity, ctx.aimUp);
    if (this.tmpCross.lengthSq() < 1e-4) {
      this.tmpCross.set(1, 0, 0);
    } else {
      this.tmpCross.normalize();
    }
    return this.tmpBestTarget.copy(this.tmpCross);
  }

  private pickBestEnemy(
    enemies: readonly ManagedWaveEnemy[],
    playerPos: THREE.Vector3,
    aimForward: THREE.Vector3 | null,
  ): ManagedWaveEnemy | null {
    let best: ManagedWaveEnemy | null = null;
    let bestScore = -Infinity;
    for (const enemy of enemies) {
      if (enemy.entity.hp <= 0) continue;
      const dist = Math.max(1, enemy.position.distanceTo(playerPos));
      let score = 60 / dist;
      if (enemy.entity.isBoss) score += 2.5;
      else if (enemy.entity.isElite) score += 1.5;
      if (aimForward) {
        this.tmpDir.subVectors(enemy.position, playerPos).divideScalar(dist);
        score += this.tmpDir.dot(aimForward) * 2.2;
      }
      if (score > bestScore) {
        bestScore = score;
        best = enemy;
      }
    }
    return best;
  }

  private pickEnemyByIdOrBest(
    enemies: readonly ManagedWaveEnemy[],
    id: string | null,
    playerPos: THREE.Vector3,
    aimForward: THREE.Vector3,
  ): ManagedWaveEnemy | null {
    if (id) {
      const found = enemies.find((e) => e.id === id && e.entity.hp > 0);
      if (found) return found;
    }
    return this.pickBestEnemy(enemies, playerPos, aimForward);
  }

  private pickBounceSlab(
    slabs: readonly SlabCollider[],
    playerPos: THREE.Vector3,
    enemyPos: THREE.Vector3,
  ): SlabCollider | null {
    let best: SlabCollider | null = null;
    let bestScore = -Infinity;
    for (const slab of slabs) {
      const distPlayer = slab.center.distanceTo(playerPos);
      const distEnemy = slab.center.distanceTo(enemyPos);
      if (distPlayer < 8 || distPlayer > 36 || distEnemy > 44) continue;
      const score = 30 - distPlayer * 0.6 - distEnemy * 0.4;
      if (score > bestScore) {
        bestScore = score;
        best = slab;
      }
    }
    return best;
  }

  private findSlabNearPath(
    slabs: readonly SlabCollider[],
    from: THREE.Vector3,
    to: THREE.Vector3,
  ): SlabCollider | null {
    const seg = this.tmpDir.subVectors(to, from);
    const len = seg.length();
    if (len < 1e-3) return null;
    seg.divideScalar(len);

    for (const slab of slabs) {
      const rel = this.tmpEnemyOffset.subVectors(slab.center, from);
      const proj = rel.dot(seg);
      if (proj <= 1 || proj >= len - 2) continue;
      const perpSq = rel.lengthSq() - proj * proj;
      const clearRadius = Math.max(slab.halfExtents.x, slab.halfExtents.z) + 2.0;
      if (perpSq < clearRadius * clearRadius) {
        return slab;
      }
    }
    return null;
  }
}
