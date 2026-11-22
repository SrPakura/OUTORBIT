import type { Bone, Object3D } from 'three';
import {
  COUNTER_PARRY_DURATION,
  SPIRAL_DRILL_KICK_DURATION,
  poseCounterParry,
  poseGravityKick,
  poseGravitySlide,
  poseKickFlip,
  poseSpiralDrillKick,
  type PoseWriter,
} from './nyxAnimsCombat';
import {
  DOME_BOUNCE_DURATION,
  WALL_SHIFT_FLIP_DURATION,
  poseDomeBounce,
  poseGravityFall,
  poseVictoryFloat,
  poseWallShiftFlip,
  poseZeroGFloat,
} from './nyxAnimsTraversal';
import {
  poseAirDash,
  poseIdle,
  poseJumpLand,
  poseLandRecover,
  poseRun,
} from './nyxAnimsGrounded';
import {
  poseEdenAbsorb,
  poseHitStagger,
  poseStasisCast,
  poseStasisThrow,
} from './nyxAnimsSkills';

// ============================================================================
// NYX — Animador procedural del esqueleto `nyx_rigged.glb` (25 huesos).
//
// - Sin imports en runtime de three (solo tipos): funciona igual con el three
//   del bundle de Vite y con el three por importmap de `character-sheet.html`.
// - CERO allocations en `update`: huesos indexados en un array, poses en
//   Float32Array preasignados, sin closures, sin literales de objeto/array.
// - Cada frame: (1) se calcula la pose OBJETIVO del estado activo, (2) la pose
//   actual la persigue con lerp exponencial `1 - exp(-lambda*dt)` (de modo que
//   cualquier cambio de estado se funde sin cortes), (3) se escribe en los
//   huesos y (4) se suma encima la física de resorte subamortiguado del pelo
//   de 4 eslabones (hair_1 → hair_4).
//
// Convención (bind pose = T-Pose, +Z frente, +Y arriba, +X brazo izquierdo):
//   brazos      : z<0 (L) baja el brazo; x<0 lo lleva al frente (colgando)
//   codos       : forearm_L.y<0 / forearm_R.y>0 doblan al frente
//   clavículas  : z>0 encoge el hombro hacia arriba; y<0 lo proyecta al frente
//   muslos      : x<0 adelante, x>0 atrás;  rodillas: shin.x>=0 SIEMPRE
//   tobillos    : x<0 extiende la puntera (flexión plantar, bota-lanza);
//                 x>0 encoge el pie hacia la espinilla (talón al impacto)
//   torso/cabeza: x>0 inclina al frente, y twist, z lean lateral
// Las poses se escriben en "convención L" y el brazo/pierna R se espeja
// (y,z invertidos) con los helpers `armR`/`legR`/`footR`/`clavR`.
// ============================================================================

export type NyxAnimState =
  | 'idle'
  | 'run'
  | 'jump_land'
  | 'land_recover'
  | 'zero_g_float'
  | 'gravity_fall'
  | 'air_dash'
  | 'gravity_kick'
  | 'kick_flip'
  | 'spiral_drill_kick'
  | 'gravity_slide'
  | 'counter_parry'
  | 'wall_shift_flip'
  | 'dome_bounce'
  | 'victory_float'
  | 'stasis_cast'
  | 'stasis_throw'
  | 'hit_stagger'
  | 'eden_absorb';

export const NYX_ANIM_STATES: readonly NyxAnimState[] = [
  'idle', 'run', 'jump_land', 'land_recover', 'zero_g_float', 'gravity_fall',
  'air_dash', 'gravity_kick', 'kick_flip', 'spiral_drill_kick', 'gravity_slide',
  'counter_parry', 'wall_shift_flip', 'dome_bounce', 'victory_float',
  'stasis_cast', 'stasis_throw', 'hit_stagger', 'eden_absorb',
];

export interface NyxAnimParams {
  /** 0..1 velocidad normalizada (cadencia/amplitud de `run`, estela del pelo). */
  speed01?: number;
  /** rad/s de giro del personaje (+ = giro a la izquierda, +Y). */
  turnRate?: number;
  /** Velocidad vertical (m/s, + arriba). Intensifica `gravity_fall`. */
  verticalVel?: number;
  /** Dirección de la gravedad en el espacio local del modelo (def. [0,-1,0]). */
  hairGravityLocal?: [number, number, number];
}

// --- Índices de hueso (orden fijo; 3 floats por hueso en las poses) ---------
// 0..14: cuerpo · 15..18: cadena del pelo (hair_1..hair_4) · 19..24: nuevos ·
// 25..26: mangas (sleeve_L/R, opcionales, física de resorte) ·
// 27: aro orbital (halo_ring, opcional, gira sobre su eje).
const HIPS = 0, SPINE = 1, CHEST = 2, NECK = 3, HEAD = 4;
const UA_L = 5, FA_L = 6, HAND_L = 7, UA_R = 8, FA_R = 9, HAND_R = 10;
const TH_L = 11, SH_L = 12, TH_R = 13, SH_R = 14;
const HAIR_1 = 15, HAIR_2 = 16, HAIR_3 = 17, HAIR_4 = 18;
const CLAV_L = 19, CLAV_R = 20, FOOT_L = 21, TOE_L = 22, FOOT_R = 23, TOE_R = 24;
const SLEEVE_L = 25, SLEEVE_R = 26;
const HALO = 27;
const BONE_COUNT = 28;

const BONE_NAMES: readonly string[] = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'upperArm_L', 'forearm_L', 'hand_L', 'upperArm_R', 'forearm_R', 'hand_R',
  'thigh_L', 'shin_L', 'thigh_R', 'shin_R',
  'hair_1', 'hair_2', 'hair_3', 'hair_4',
  'clavicle_L', 'clavicle_R', 'foot_L', 'toe_L', 'foot_R', 'toe_R',
  'sleeve_L', 'sleeve_R', 'halo_ring',
];

const INF = Number.POSITIVE_INFINITY;
/** Duración (s) de los estados de un solo disparo; INF = estado sostenido. */
const DURATION: Record<NyxAnimState, number> = {
  idle: INF, run: INF, jump_land: 1.15, land_recover: 1.1, zero_g_float: INF,
  gravity_fall: INF, air_dash: 0.6, gravity_kick: 1.15, kick_flip: 0.85,
  spiral_drill_kick: SPIRAL_DRILL_KICK_DURATION, gravity_slide: INF,
  counter_parry: COUNTER_PARRY_DURATION, wall_shift_flip: WALL_SHIFT_FLIP_DURATION,
  dome_bounce: DOME_BOUNCE_DURATION, victory_float: INF,
  stasis_cast: INF, stasis_throw: 1.30, hit_stagger: 0.95, eden_absorb: INF,
};
/** Pose a la que se funde un estado de un disparo al terminar. */
const FALLBACK: Record<NyxAnimState, NyxAnimState> = {
  idle: 'idle', run: 'run', jump_land: 'idle', land_recover: 'idle',
  zero_g_float: 'zero_g_float', gravity_fall: 'gravity_fall', air_dash: 'zero_g_float',
  gravity_kick: 'zero_g_float', kick_flip: 'zero_g_float',
  spiral_drill_kick: 'zero_g_float', gravity_slide: 'gravity_slide',
  counter_parry: 'zero_g_float', wall_shift_flip: 'gravity_fall',
  dome_bounce: 'zero_g_float', victory_float: 'victory_float',
  stasis_cast: 'stasis_cast', stasis_throw: 'idle', hit_stagger: 'idle', eden_absorb: 'eden_absorb',
};
/** Cuánto pesa la gravedad sobre el pelo en cada estado (0G ≈ casi flota). */
const HAIR_GRAVITY_SCALE: Record<NyxAnimState, number> = {
  idle: 1, run: 0.7, jump_land: 0.9, land_recover: 1, zero_g_float: 0.12,
  gravity_fall: 0.9, air_dash: 0.35, gravity_kick: 0.3, kick_flip: 0.25,
  spiral_drill_kick: 0.2, gravity_slide: 0.65, counter_parry: 0.35,
  wall_shift_flip: 0.2, dome_bounce: 0.3, victory_float: 0.08,
  stasis_cast: 0.8, stasis_throw: 0.8, hit_stagger: 0.9, eden_absorb: -0.25,
};

// --- Pelo: 4 segmentos (hair_1..hair_4), 2 ejes (pitch, yaw) ------------------
// El 4º eslabón es la punta del látigo: más largo, más blando y menos
// amortiguado → onda de melena más fluida en 0G, giros y frenadas.
const HAIR_W: readonly number[] = [0.28, 0.34, 0.40, 0.44];
const HAIR_K: readonly number[] = [140, 100, 75, 58];       // rigidez ω²
const HAIR_ZETA: readonly number[] = [0.32, 0.28, 0.25, 0.22]; // < 1 → subamortiguado
const HAIR_C: readonly number[] = [
  2 * HAIR_ZETA[0] * Math.sqrt(HAIR_K[0]),
  2 * HAIR_ZETA[1] * Math.sqrt(HAIR_K[1]),
  2 * HAIR_ZETA[2] * Math.sqrt(HAIR_K[2]),
  2 * HAIR_ZETA[3] * Math.sqrt(HAIR_K[3]),
];
// --- Mangas: sleeve_L / sleeve_R, 2 ejes (pitch=eje Y local ~ delante/atrás,
// roll=eje Z local ~ arriba/abajo). Hueso opcional: si el GLB no lo trae, se omite.
const SLEEVE_W = 0.55;      // cuánto responde a gravedad/inercia (rad)
const SLEEVE_K = 85;        // rigidez ω²
const SLEEVE_ZETA = 0.26;   // < 1 → subamortiguado
const SLEEVE_C = 2 * SLEEVE_ZETA * Math.sqrt(SLEEVE_K);
const DEFAULT_GRAVITY: [number, number, number] = [0, -1, 0];

// --- Helpers numéricos puros -------------------------------------------------
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function mix(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}
function smooth(a: number, b: number, v: number): number {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
/** Sube de a→b y baja de b→c (0 fuera de [a,c]). */
function pulse(t: number, a: number, b: number, c: number): number {
  return smooth(a, b, t) * (1 - smooth(b, c, t));
}

export class NyxAnimator {
  private readonly bones: (Bone | null)[] = [];
  private readonly baseHips: Float32Array = new Float32Array(3);

  // Poses (3 floats por hueso) y offset de posición de hips
  private readonly tgt = new Float32Array(BONE_COUNT * 3);
  private readonly cur = new Float32Array(BONE_COUNT * 3);
  private readonly tgtPos = new Float32Array(3);
  private readonly curPos = new Float32Array(3);

  // Pelo (4 segmentos × 2 ejes)
  private readonly hairA = new Float32Array(8);
  private readonly hairV = new Float32Array(8);
  // Mangas ([L.roll, L.pitch, R.roll, R.pitch])
  private readonly sleeveA = new Float32Array(4);
  private readonly sleeveV = new Float32Array(4);

  private state: NyxAnimState = 'idle';
  private stateTime = 0;
  private time = 0;
  private runPhase = 0;
  private lambda = 8;
  private fellBack = false;
  private dashDir = 1;
  private firstFrame = true;

  // Parámetros del frame actual
  private speed = 0.85;
  private turn = 0;
  private vVel = 0;
  private hasVVel = false;
  private prevVVel = 0;
  private prevSpeed = 0;
  private vAcc = 0;
  private speedAcc = 0;

  /** Desactiva la simulación del pelo (deja los 4 huesos a 0). */
  hairEnabled = true;

  private readonly writer: PoseWriter;

  constructor(root: Object3D) {
    this.writer = {
      p: (i, x, y, z) => this.p(i, x, y, z),
      pos: (x, y, z) => this.pos(x, y, z),
      armL: (ux, uy, uz, fx, fy, fz) => this.armL(ux, uy, uz, fx, fy, fz),
      armR: (ux, uy, uz, fx, fy, fz) => this.armR(ux, uy, uz, fx, fy, fz),
      legL: (tx, ty, tz, sx) => this.legL(tx, ty, tz, sx),
      legR: (tx, ty, tz, sx) => this.legR(tx, ty, tz, sx),
      footL: (fx, fy, fz, tx) => this.footL(fx, fy, fz, tx),
      footR: (fx, fy, fz, tx) => this.footR(fx, fy, fz, tx),
      clavL: (x, y, z) => this.clavL(x, y, z),
      clavR: (x, y, z) => this.clavR(x, y, z),
    };
    const found: (Bone | null)[] = [];
    for (let i = 0; i < BONE_COUNT; i++) found.push(null);
    root.traverse((o: Object3D) => {
      if ((o as Bone).isBone) {
        const idx = BONE_NAMES.indexOf(o.name);
        if (idx >= 0) found[idx] = o as Bone;
      }
    });
    for (let i = 0; i < BONE_COUNT; i++) {
      const b = found[i];
      if (!b && i < 18) throw new Error(`NyxAnimator: falta el hueso "${BONE_NAMES[i]}"`);
      this.bones.push(b);
    }
    const hp = this.bones[HIPS]!.position;
    this.baseHips[0] = hp.x;
    this.baseHips[1] = hp.y;
    this.baseHips[2] = hp.z;
    this.neutral();
    this.cur.set(this.tgt);
  }

  getState(): NyxAnimState { return this.state; }
  /** Segundos desde el último `setState`. */
  getStateTime(): number { return this.stateTime; }
  /** true cuando un estado de un solo disparo ya terminó. */
  isFinished(): boolean { return this.stateTime >= DURATION[this.state]; }

  setState(state: NyxAnimState, options?: { dashDir?: -1 | 1; blendDuration?: number }): void {
    const sustained = DURATION[state] === INF;
    if (state === this.state && sustained && !options) return;
    this.state = state;
    this.stateTime = 0;
    this.fellBack = false;
    if (options && options.dashDir !== undefined) this.dashDir = options.dashDir;
    const bd = options && options.blendDuration !== undefined ? options.blendDuration : 0.2;
    // ~98 % del camino a la pose nueva tras `bd` segundos
    this.lambda = 4 / Math.max(bd, 0.01);
  }

  update(dt: number, params?: NyxAnimParams): void {
    if (!(dt > 0)) return;
    if (dt > 0.1) dt = 0.1;

    if (params) {
      if (params.speed01 !== undefined) this.speed = clamp(params.speed01, 0, 1);
      if (params.turnRate !== undefined) this.turn = params.turnRate;
      if (params.verticalVel !== undefined) { this.vVel = params.verticalVel; this.hasVVel = true; }
    }
    // Aceleraciones suavizadas (entradas del pelo)
    if (this.firstFrame) {
      this.prevVVel = this.vVel;
      this.prevSpeed = this.speed;
      this.firstFrame = false;
    }
    const k = Math.min(1, dt * 10);
    this.vAcc += (clamp((this.vVel - this.prevVVel) / dt, -60, 60) - this.vAcc) * k;
    this.speedAcc += (clamp((this.speed - this.prevSpeed) / dt, -8, 8) - this.speedAcc) * k;
    this.prevVVel = this.vVel;
    this.prevSpeed = this.speed;

    this.time += dt;
    this.stateTime += dt;
    this.runPhase += dt * (7 + 6 * this.speed);

    // Estado efectivo (los de un disparo caen a su pose de reposo)
    let st = this.state;
    if (this.stateTime > DURATION[st]) {
      st = FALLBACK[st];
      if (!this.fellBack) { this.fellBack = true; this.lambda = Math.min(this.lambda, 6); }
    }
    this.neutral();
    this.pose(st, this.stateTime, this.time);

    // Envoltorio angular continuo para estados con giro completo (kick_flip en X;
    // spiral_drill_kick, wall_shift_flip, victory_float en Y)
    if (st !== 'kick_flip') {
      const ho = HIPS * 3;
      while (this.cur[ho] > Math.PI) this.cur[ho] -= 2 * Math.PI;
      while (this.cur[ho] <= -Math.PI) this.cur[ho] += 2 * Math.PI;
    }
    if (st === 'spiral_drill_kick' || st === 'wall_shift_flip' || st === 'victory_float') {
      const hy = HIPS * 3 + 1;
      const diff = this.tgt[hy] - this.cur[hy];
      if (diff > Math.PI) this.cur[hy] += 2 * Math.PI;
      else if (diff < -Math.PI) this.cur[hy] -= 2 * Math.PI;
    } else {
      const hy = HIPS * 3 + 1;
      while (this.cur[hy] > Math.PI) this.cur[hy] -= 2 * Math.PI;
      while (this.cur[hy] <= -Math.PI) this.cur[hy] += 2 * Math.PI;
    }

    // Persecución exponencial de la pose objetivo
    const a = 1 - Math.exp(-this.lambda * dt);
    const cur = this.cur, tgt = this.tgt;
    for (let i = 0; i < BONE_COUNT * 3; i++) cur[i] += (tgt[i] - cur[i]) * a;
    for (let i = 0; i < 3; i++) this.curPos[i] += (this.tgtPos[i] - this.curPos[i]) * a;

    const bones = this.bones;
    // Huesos de cuerpo (0..14 y 19..24); la cadena del pelo (15..18) la
    // escribe `updateHair` encima con la física de resorte.
    for (let i = 0; i < HAIR_1; i++) {
      bones[i]?.rotation.set(cur[i * 3], cur[i * 3 + 1], cur[i * 3 + 2]);
    }
    for (let i = HAIR_4 + 1; i < SLEEVE_L; i++) {
      bones[i]?.rotation.set(cur[i * 3], cur[i * 3 + 1], cur[i * 3 + 2]);
    }
    bones[HIPS]?.position.set(
      this.baseHips[0] + this.curPos[0],
      this.baseHips[1] + this.curPos[1],
      this.baseHips[2] + this.curPos[2],
    );

    this.updateHair(dt, params, st);
    this.updateSleeves(dt, params, st);
    this.updateHalo(st);
  }

  // ==========================================================================
  // Pelo: resorte-amortiguador subamortiguado por segmento y eje (4 eslabones)
  // ==========================================================================
  private updateHair(dt: number, params: NyxAnimParams | undefined, st: NyxAnimState): void {
    const bones = this.bones;
    const A = this.hairA, V = this.hairV;
    if (!this.hairEnabled) {
      for (let i = 0; i < 8; i++) { A[i] = 0; V[i] = 0; }
      for (let s = 0; s < 4; s++) bones[HAIR_1 + s]?.rotation.set(0, 0, 0);
      return;
    }
    const g = params && params.hairGravityLocal ? params.hairGravityLocal : DEFAULT_GRAVITY;
    const gs = HAIR_GRAVITY_SCALE[st];
    const gx = g[0] * gs, gy = g[1] * gs;
    const t = this.time;
    const sp = this.speed * (st === 'run' ? 1 : 0.35);
    const lift = clamp(-this.vAcc * 0.02, -0.5, 0.5);
    const calm = gs < 0.3 ? 2.2 : 1; // en 0G el pelo ondula más
    const sub = 2, h = dt / sub;

    for (let s = 0; s < 4; s++) {
      const w = HAIR_W[s];
      const pitchT = w * (gy + 0.9 * sp + 0.3 * clamp(this.speedAcc * 0.1, -1, 1) + lift)
        + Math.sin(t * 2.1 + s * 0.9) * 0.06 * calm;
      const yawT = w * (-gx + clamp(this.turn * 0.35, -1.2, 1.2))
        + Math.cos(t * 1.7 + s * 1.1) * 0.05 * calm;
      const k = HAIR_K[s], c = HAIR_C[s];
      const ip = s * 2, iy = ip + 1;
      for (let n = 0; n < sub; n++) {
        V[ip] += (-k * (A[ip] - pitchT) - c * V[ip]) * h;
        A[ip] += V[ip] * h;
        V[iy] += (-k * (A[iy] - yawT) - c * V[iy]) * h;
        A[iy] += V[iy] * h;
      }
      // pitch+ levanta la melena (-Z) · yaw+ la lleva hacia -X
      bones[HAIR_1 + s]?.rotation.set(A[ip], A[iy], A[iy] * 0.3);
    }
  }

  // ==========================================================================
  // Mangas: resorte-amortiguador subamortiguado (gravedad + inercia + giro)
  // ==========================================================================
  private updateSleeves(dt: number, params: NyxAnimParams | undefined, st: NyxAnimState): void {
    const bL = this.bones[SLEEVE_L], bR = this.bones[SLEEVE_R];
    if (!bL && !bR) return;
    const A = this.sleeveA, V = this.sleeveV;
    const g = params && params.hairGravityLocal ? params.hairGravityLocal : DEFAULT_GRAVITY;
    const gs = HAIR_GRAVITY_SCALE[st];
    const gy = g[1] * gs, gz = g[2] * gs;
    const t = this.time;
    const calm = gs < 0.3 ? 2 : 1; // en 0G la tela ondula más
    const lag = clamp(this.speedAcc * 0.08, -0.6, 0.6) + clamp(this.vAcc * 0.015, -0.5, 0.5);
    const turn = clamp(this.turn * 0.25, -0.8, 0.8);
    const sub = 2, h = dt / sub;
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? 1 : -1; // +X (L) / -X (R): el brazo apunta a ±X
      // roll: la manga cae con la gravedad (L: z<0 baja; R: z>0 baja)
      const rollT = SLEEVE_W * (gy * side * 1.0 + lag * 0.5) + Math.sin(t * 2.6 + s * 1.7) * 0.05 * calm;
      // pitch: arrastre hacia atrás con la velocidad, giro y gravedad en Z
      const pitchT = SLEEVE_W * (gz * 0.6 + 0.35 * this.speed * (st === 'run' ? 1 : 0.2) + turn * side)
        + Math.cos(t * 2.1 + s * 1.3) * 0.045 * calm;
      const ir = s * 2, ip = ir + 1;
      for (let n = 0; n < sub; n++) {
        V[ir] += (-SLEEVE_K * (A[ir] - rollT) - SLEEVE_C * V[ir]) * h;
        A[ir] += V[ir] * h;
        V[ip] += (-SLEEVE_K * (A[ip] - pitchT) - SLEEVE_C * V[ip]) * h;
        A[ip] += V[ip] * h;
      }
      const b = s === 0 ? bL : bR;
      if (b) b.rotation.set(0, A[ip], A[ir]);
    }
  }

  // ==========================================================================
  // Aro orbital: gira suavemente sobre su eje (normal del aro = +Z local)
  // ==========================================================================
  private updateHalo(st: NyxAnimState): void {
    const b = this.bones[HALO];
    if (!b) return;
    const zero = HAIR_GRAVITY_SCALE[st] < 0.3;
    const t = this.time;
    // más vivo en 0G; leve cabeceo para que no parezca un disco rígido
    b.rotation.set(
      Math.sin(t * 0.7) * (zero ? 0.12 : 0.05),
      Math.cos(t * 0.53) * (zero ? 0.1 : 0.04),
      t * (zero ? 0.9 : 0.45),
    );
  }

  // ==========================================================================
  // Escritura de poses objetivo
  // ==========================================================================
  private p(i: number, x: number, y: number, z: number): void {
    const o = i * 3;
    this.tgt[o] = x; this.tgt[o + 1] = y; this.tgt[o + 2] = z;
  }
  private pos(x: number, y: number, z: number): void {
    this.tgtPos[0] = x; this.tgtPos[1] = y; this.tgtPos[2] = z;
  }
  /** Brazo izquierdo (u = upperArm, f = forearm). */
  private armL(ux: number, uy: number, uz: number, fx: number, fy: number, fz: number): void {
    this.p(UA_L, ux, uy, uz); this.p(FA_L, fx, fy, fz);
  }
  /** Brazo derecho: se pasan valores en convención L; se espeja (y,z). */
  private armR(ux: number, uy: number, uz: number, fx: number, fy: number, fz: number): void {
    this.p(UA_R, ux, -uy, -uz); this.p(FA_R, fx, -fy, -fz);
  }
  private legL(tx: number, ty: number, tz: number, sx: number): void {
    this.p(TH_L, tx, ty, tz); this.p(SH_L, sx < 0 ? 0 : sx, 0, 0);
  }
  private legR(tx: number, ty: number, tz: number, sx: number): void {
    this.p(TH_R, tx, -ty, -tz); this.p(SH_R, sx < 0 ? 0 : sx, 0, 0);
  }
  /** Tobillo + puntera izquierdos. fx<0 extiende la bota (plantar). */
  private footL(fx: number, fy: number, fz: number, tx?: number): void {
    this.p(FOOT_L, fx, fy, fz); this.p(TOE_L, tx ?? 0, 0, 0);
  }
  /** Tobillo + puntera derechos: valores en convención L; se espeja (y, z). */
  private footR(fx: number, fy: number, fz: number, tx?: number): void {
    this.p(FOOT_R, fx, -fy, -fz); this.p(TOE_R, tx ?? 0, 0, 0);
  }
  /** Clavícula izquierda: z>0 encoge el hombro, y<0 lo proyecta al frente. */
  private clavL(x: number, y: number, z: number): void {
    this.p(CLAV_L, x, y, z);
  }
  /** Clavícula derecha: valores en convención L; el helper espeja (y, z). */
  private clavR(x: number, y: number, z: number): void {
    this.p(CLAV_R, x, -y, -z);
  }

  private neutral(): void {
    this.p(HIPS, 0, 0, 0); this.p(SPINE, 0, 0, 0); this.p(CHEST, 0, 0, 0);
    this.p(NECK, 0, 0, 0); this.p(HEAD, 0, 0, 0);
    this.armL(0.04, 0, -1.1, 0, -0.12, -0.08);
    this.armR(0.04, 0, -1.1, 0, -0.12, -0.08);
    this.p(HAND_L, 0, 0, 0); this.p(HAND_R, 0, 0, 0);
    this.legL(0, 0, 0.03, 0.04);
    this.legR(0, 0, 0.03, 0.04);
    // Huesos nuevos a 0 por defecto: cualquier pose que no los articule
    // queda en reposo y el lerp los funde suavemente.
    this.clavL(0, 0, 0); this.clavR(0, 0, 0);
    this.footL(0, 0, 0, 0); this.footR(0, 0, 0, 0);
    this.pos(0, 0, 0);
  }

  private pose(st: NyxAnimState, t: number, g: number): void {
    switch (st) {
      case 'idle': poseIdle(this.writer, g); break;
      case 'run': poseRun(this.writer, g, this.runPhase, this.speed, this.turn); break;
      case 'jump_land': poseJumpLand(this.writer, t); break;
      case 'land_recover': poseLandRecover(this.writer, t); break;
      case 'zero_g_float': poseZeroGFloat(this.writer, g); break;
      case 'gravity_fall': poseGravityFall(this.writer, g, this.vVel, this.hasVVel); break;
      case 'air_dash': poseAirDash(this.writer, t, g, this.dashDir); break;
      case 'gravity_kick': poseGravityKick(this.writer, t, g); break;
      case 'kick_flip': {
        const flip = poseKickFlip(this.writer, t, g);
        const o = HIPS * 3;
        while (this.cur[o] - flip > Math.PI) this.cur[o] -= 2 * Math.PI;
        while (this.cur[o] - flip < -Math.PI) this.cur[o] += 2 * Math.PI;
        break;
      }
      case 'spiral_drill_kick': poseSpiralDrillKick(this.writer, t, g); break;
      case 'gravity_slide': poseGravitySlide(this.writer, g, this.speed, this.turn); break;
      case 'counter_parry': poseCounterParry(this.writer, t); break;
      case 'wall_shift_flip': poseWallShiftFlip(this.writer, t); break;
      case 'dome_bounce': poseDomeBounce(this.writer, t); break;
      case 'victory_float': poseVictoryFloat(this.writer, g); break;
      case 'stasis_cast': poseStasisCast(this.writer, t, g); break;
      case 'stasis_throw': poseStasisThrow(this.writer, t, g); break;
      case 'hit_stagger': poseHitStagger(this.writer, t); break;
      case 'eden_absorb': poseEdenAbsorb(this.writer, t, g); break;
    }
  }

  // --- idle: respiración, descarga de peso, mirada lenta ---------------------
  private poseIdle(g: number): void {
    const b = Math.sin(g * 1.7) * 0.02;
    const sh = Math.sin(g * 0.6);
    this.pos(sh * 0.015, -0.012 + b * 0.5, 0);
    this.p(HIPS, 0, sh * 0.04, sh * 0.03);
    this.p(SPINE, 0.02, -sh * 0.03, -sh * 0.02);
    this.p(CHEST, 0.03 + b, 0, 0);
    this.p(HEAD, -0.03 - b * 0.5, Math.sin(g * 0.4) * 0.08, 0);
    this.armL(0.05 + Math.sin(g * 1.2) * 0.03, 0, -1.1 + b * 2, 0, -0.2, -0.08);
    this.armR(0.05 + Math.sin(g * 1.2 + 0.8) * 0.03, 0, -1.1 - b * 2, 0, -0.2, -0.08);
    this.legL(-0.04, 0, 0.03, 0.1);
    this.legR(0.02, 0, 0.03, 0.04);
    // Respiración en los hombros + contrapposto de pies (peso en la izquierda)
    this.clavL(0.015 + b * 0.4, 0, 0.02 + sh * 0.015);
    this.clavR(0.015 + b * 0.4, 0, 0.02 - sh * 0.015);
    this.footL(0.04, 0, 0.02, 0);
    this.footR(-0.05 + sh * 0.02, 0, 0.02, 0);
  }

  // --- run: ciclo con fase acumulada, inclinación según speed01 --------------
  private poseRun(): void {
    const sp = this.speed;
    const amp = 0.45 + 0.55 * sp;
    const ph = this.runPhase;
    const s = Math.sin(ph), c = Math.cos(ph);
    const lean = 0.12 + 0.28 * sp;

    this.pos(0, -0.05 * amp * (0.5 + 0.5 * Math.cos(2 * ph)) - 0.02, 0);
    this.p(HIPS, lean * 0.4, s * 0.25 * amp, s * 0.04);
    this.p(SPINE, lean * 0.5, -s * 0.15 * amp, -s * 0.03);
    this.p(CHEST, lean * 0.5, -s * 0.2 * amp, 0);
    this.p(NECK, -lean * 0.4, 0, 0);
    this.p(HEAD, -lean * 0.8, s * 0.1 * amp, 0);

    // Piernas: L en fase s, R en contrafase (-s,-c)
    this.legL(-s * 0.85 * amp - 0.12 * amp, 0, 0.03,
      0.12 + 1.2 * amp * Math.max(0, c * 0.9 + 0.35));
    this.legR(s * 0.85 * amp - 0.12 * amp, 0, 0.03,
      0.12 + 1.2 * amp * Math.max(0, -c * 0.9 + 0.35));

    // Tobillos/punteras: talón dorsiflexionado al impacto (pierna adelante),
    // latigazo de puntera al impulso (pierna atrás)
    this.footL(s * 0.45 * amp + 0.05, 0, 0.03, -Math.max(0, -s) * 0.5 * amp);
    this.footR(-s * 0.45 * amp + 0.05, 0, 0.03, -Math.max(0, s) * 0.5 * amp);

    // Brazos en contrafase con su pierna, codos a ~90°
    const bend = 0.85 + 0.35 * amp;
    this.armL(s * 0.9 * amp, 0, -1.2, 0, -(bend - s * 0.25), -0.05);
    this.armR(-s * 0.9 * amp, 0, -1.2, 0, -(bend + s * 0.25), -0.05);

    // Clavículas: contrarrota con el brazo y encoge al sprint (misma entrada
    // en convención L → el espejo de clavR produce el contrafaseo físico)
    this.clavL(0.03 + 0.05 * sp, s * 0.09 * amp, -0.05 * sp);
    this.clavR(0.03 + 0.05 * sp, s * 0.09 * amp, -0.05 * sp);
  }

  // --- jump_land: anticipación → impulso → tuck → aterrizaje → recuperación --
  private poseJumpLand(t: number): void {
    const c1 = pulse(t, 0, 0.2, 0.34);
    const air = pulse(t, 0.3, 0.46, 0.72);
    const c2 = pulse(t, 0.62, 0.8, 1.1);
    const cr = Math.max(c1, c2 * 1.1);
    const th = 1.0 * cr;                      // ángulo de muslo
    const drop = 0.84 * (1 - Math.cos(th));   // pie plantado: baja la cadera
    this.pos(0, -drop + 0.1 * air, 0.84 * Math.sin(th) * 0.5);

    this.p(HIPS, 0.1 * cr, 0, 0);
    this.p(SPINE, 0.2 * cr - 0.1 * air, 0, 0);
    this.p(CHEST, 0.2 * cr - 0.1 * air, 0, 0);
    this.p(HEAD, -0.2 * cr, 0, 0);

    // Brazos: atrás al agacharse, arriba en el impulso, abiertos al caer
    const swing = c1 * 0.7 - c2 * 0.5;
    const ua = mix(-1.1, -0.1, air);
    this.armL(mix(0.04, -0.2, air) + swing, 0, ua, 0, -0.2 * (1 - air), -0.08);
    this.armR(mix(0.04, -0.2, air) + swing, 0, ua, 0, -0.2 * (1 - air), -0.08);

    // Piernas: flexión (th, 2·th) y tuck en el aire
    this.legL(-th - 0.6 * air, 0, 0.03 + 0.05 * air, 2 * th + 1.1 * air);
    this.legR(-th - 0.25 * air, 0, 0.03, 2 * th + 0.5 * air);

    // Tobillos: talones abajo al agachar, puntera al impulso, flexión al caer
    this.footL(0.32 * c1 + 0.22 * c2 - 0.35 * air, 0, 0.02, -0.3 * c1 - 0.15 * air);
    this.footR(0.32 * c1 + 0.22 * c2 - 0.35 * air, 0, 0.02, -0.3 * c1 - 0.15 * air);
    // Hombros: encogidos al volar, caídos al amortiguar
    this.clavL(0.05 * air - 0.04 * c2, 0, 0.14 * air - 0.06 * c1);
    this.clavR(0.05 * air - 0.04 * c2, 0, 0.14 * air - 0.06 * c1);
  }

  // --- zero_g_float: flotación asimétrica ------------------------------------
  private poseFloat(g: number): void {
    const bob = Math.sin(g * 1.3);
    const sw = Math.sin(g * 0.9);
    this.pos(0, bob * 0.05, 0);
    this.p(HIPS, -0.06 + bob * 0.03, 0.12 + sw * 0.05, sw * 0.05);
    this.p(SPINE, -0.08, -0.05, -sw * 0.03);
    this.p(CHEST, -0.06 + Math.sin(g * 1.7) * 0.02, -0.04, 0);
    this.p(NECK, -0.04, 0, 0);
    this.p(HEAD, -0.06, -0.08 - sw * 0.04, 0.03);
    // Brazos semiabiertos ~45° en equilibrio, asimétricos
    this.armL(0.15 + Math.sin(g * 1.1) * 0.05, -0.15, -0.8 + Math.sin(g * 1.8) * 0.06, 0.1, -0.35, -0.15);
    this.armR(-0.05 + Math.sin(g * 1.4 + 1) * 0.05, -0.05, -0.62 - Math.sin(g * 1.6 + 0.6) * 0.06, 0.08, -0.25, -0.1);
    // Una rodilla flexionada (L), la otra casi estirada (R)
    this.legL(-0.75 + Math.sin(g * 1.3) * 0.05, 0.05, 0.1, 1.1);
    this.legR(0.1, 0, 0.1, 0.12 + Math.sin(g * 1.3 + 1) * 0.04);
    // 0G: pies en punta de ballet con onda lenta + hombros flotando arriba
    this.footL(-0.38 + Math.sin(g * 1.3) * 0.05, 0.04, 0.05, -0.22);
    this.footR(-0.3 + Math.sin(g * 1.3 + 1) * 0.05, 0, 0.05, -0.16);
    this.clavL(0.04, -0.05, 0.06 + Math.sin(g * 1.1) * 0.02);
    this.clavR(0.04, -0.05, 0.06 + Math.sin(g * 1.4 + 1) * 0.02);
  }

  // --- gravity_fall: caída orgánica, espalda arqueada, extremidades al viento -
  private poseFall(g: number): void {
    const f = this.hasVVel ? clamp(-this.vVel / 18, 0, 1) : 0.8;
    const w1 = Math.sin(g * 7.3), w2 = Math.sin(g * 5.1 + 1.2), w3 = Math.sin(g * 9.2 + 0.4);
    this.pos(0, 0, 0);
    this.p(HIPS, 0.55 + 0.35 * f + w2 * 0.03, Math.sin(g * 1.1) * 0.1, w1 * 0.04);
    this.p(SPINE, -0.3 - 0.05 * f, 0.03 * w2, 0);
    this.p(CHEST, -0.25 + w3 * 0.02, 0, 0);
    this.p(NECK, -0.35, 0, 0);
    this.p(HEAD, -0.15 + w2 * 0.04, w1 * 0.04, 0);
    // Brazos arrastrados hacia atrás con ondulación
    const wv = 0.1 + 0.15 * f;
    this.armL(0.35 + 0.2 * f + w1 * wv, 0.2, -0.95 - w2 * 0.12, 0, -0.35 - w3 * 0.15, -0.1);
    this.armR(0.35 + 0.2 * f + w2 * wv, 0.2, -1.05 - w1 * 0.12, 0, -0.3 - w1 * 0.15, -0.1);
    // Piernas colgando atrás con ondulación (nunca rodilla hacia delante)
    this.legL(0.25 + w1 * 0.1, 0, 0.12, 0.5 + 0.3 * (0.5 + 0.5 * w2));
    this.legR(0.18 + w3 * 0.1, 0, 0.12, 0.35 + 0.3 * (0.5 + 0.5 * w1));
    // Pies dorsiflexionados al viento con aleteo; hombros abiertos atrás
    this.footL(0.28 + 0.2 * f + w1 * 0.12, 0, 0.06, 0.12);
    this.footR(0.2 + 0.15 * f + w3 * 0.12, 0, 0.06, 0.08);
    this.clavL(0.04 * f, 0.14 * f, 0.05 * f);
    this.clavR(0.04 * f, 0.14 * f, 0.05 * f);
  }

  // --- air_dash: sprint lateral con inclinación hacia dashDir -----------------
  // dashDir = +1 → hacia +X del modelo (su costado izquierdo); -1 → hacia -X.
  private poseDash(t: number, g: number): void {
    const d = this.dashDir;
    const e = smooth(0, 0.08, t) * (1 - smooth(0.25, 0.6, t));
    const lean = -d * (0.3 + 0.55 * e);
    this.pos(d * 0.05 * e, 0, 0);
    this.p(HIPS, 0.35 * e, d * 0.3 * e, lean);
    this.p(SPINE, 0.12 * e, d * 0.12 * e, lean * 0.5);
    this.p(CHEST, 0.14 * e, -d * 0.18 * e, lean * 0.3);
    this.p(HEAD, -0.2 * e, 0, -lean * 0.7); // la cabeza mantiene la mirada
    const flutter = Math.sin(g * 14) * 0.05 * e;
    // Brazo guía (lado de d) extendido, el otro recogido atrás
    const leadL = d > 0;
    const lx = -0.2, ly = -0.35 * e, lz = mix(-1.1, -0.35, e);
    const tx = 0.5 * e, ty = 0.5 * e, tz = mix(-1.1, -1.3, e);
    if (leadL) {
      this.armL(lx + flutter, ly, lz, 0, -0.1, 0);
      this.armR(tx, ty, tz, 0, -1.0 * e, -0.1);
    } else {
      this.armR(lx + flutter, ly, lz, 0, -0.1, 0);
      this.armL(tx, ty, tz, 0, -1.0 * e, -0.1);
    }
    // Pierna del lado de d recogida, la opuesta estirada atrás
    if (leadL) {
      this.legL(-0.6 * e, 0, 0.03, 1.1 * e);
      this.legR(0.35 * e, 0, 0.03 - 0.1 * e, 0.2 * e);
    } else {
      this.legR(-0.6 * e, 0, 0.03, 1.1 * e);
      this.legL(0.35 * e, 0, 0.03 - 0.1 * e, 0.2 * e);
    }
    // Clavículas: el hombro guía se proyecta al frente y cae hacia el dash,
    // el de atrás se retrae y encoge → silueta de flecha asimétrica
    if (leadL) {
      this.clavL(0.06 * e, -0.24 * e, -0.1 * e);
      this.clavR(0.06 * e, 0.14 * e, 0.05 * e);
    } else {
      this.clavR(0.06 * e, -0.24 * e, -0.1 * e);
      this.clavL(0.06 * e, 0.14 * e, 0.05 * e);
    }
    // Pies en punta aerodinámica: la pierna estirada atrás extiende la bota
    // al máximo, la recogida apunta como balancín
    if (leadL) {
      this.footL(-0.38 * e, 0, 0.04, -0.28 * e);
      this.footR(-0.55 * e, 0, 0.04, -0.42 * e);
    } else {
      this.footR(-0.38 * e, 0, 0.04, -0.28 * e);
      this.footL(-0.55 * e, 0, 0.04, -0.42 * e);
    }
  }

  // --- gravity_kick: misil gravitatorio — cuerpo entero en la trayectoria ---
  // Fase 1 (0..0.15): se encoge en el aire preparándose. Fase 2 (0.15..0.95,
  // sostenida en vuelo): TODO el cuerpo inclinado al ángulo de vuelo (~66°),
  // pierna derecha extendida en la línea de trayectoria, izquierda recogida
  // atrás, torso de contrapeso y brazos cortando el aire hacia atrás.
  private poseKick(t: number, g: number): void {
    const coil = smooth(0, 0.12, t) * (1 - smooth(0.13, 0.24, t));
    const fly = smooth(0.15, 0.32, t) * (1 - smooth(0.95, 1.15, t));
    const vib = Math.sin(g * 27) * 0.05 * fly;
    const vib2 = Math.cos(g * 21) * 0.03 * fly;

    this.pos(0, 0.08 * fly - 0.02 * coil, 0.18 * fly - 0.05 * coil);
    // Cuerpo completo inclinado al ángulo de vuelo (hacia +Z)
    this.p(HIPS, -0.18 * coil + 1.15 * fly, vib2, 0);
    this.p(SPINE, 0.1 * coil + 0.06 * fly, 0, 0);
    this.p(CHEST, 0.12 * coil, -0.55 * fly, 0);              // contrapeso
    this.p(NECK, -0.08 * fly, 0, 0);
    this.p(HEAD, 0.25 * coil - 0.65 * fly, 0.12 * fly, 0);  // mira al objetivo
    // Brazos extendidos hacia atrás cortando el aire (vibración de alta velocidad)
    this.armL(0.3 * coil + (1.05 + vib) * fly, 0.3 * fly, mix(-1.1, -0.45, fly),
      0, -0.35 * coil - 0.12 * fly, -0.05);
    this.armR(0.3 * coil + (1.0 - vib) * fly, 0.25 * fly, mix(-1.1, -0.5, fly),
      0, -0.3 * coil - 0.1 * fly, -0.05);
    // Pierna derecha extendida en la línea de vuelo; izquierda recogida atrás
    this.legR(-1.3 * coil - 0.65 * fly, 0, 0.03, 1.6 * coil + 0.04);
    this.legL(-1.3 * coil + 0.45 * fly, 0, 0.1, 1.6 * coil + 1.45 * fly);
    // Bota derecha = LANZA: tobillo y puntera extendidos sobre la trayectoria;
    // pie izquierdo encogido (dorsal) pegado al cuerpo
    this.footR(-(0.28 + 0.55 * fly), 0.03 * fly, 0.02, -(0.18 + 0.5 * fly));
    this.footL(0.5 * fly, 0, 0.05, 0.22 * fly);
    // Clavículas retraídas: los hombros se alejan del objetivo (perfil de misil)
    this.clavL(0.06 * fly, 0.16 * fly, -0.04 * fly);
    this.clavR(0.06 * fly, 0.16 * fly, -0.04 * fly);
  }

  // --- kick_flip: voltereta mortal completa tras la patada -------------------
  // Rebota hacia atrás-arriba con las rodillas al pecho y gira 360° hacia
  // atrás sobre hips.x. El ángulo de voltereta es continuo (0 → -2π) pero se
  // escribe normalizado a (-π, π] y la rotación actual se envuelve al
  // equivalente más cercano al objetivo: el lerp persigue por el camino corto
  // y al terminar (-2π ≡ 0) abre con elegancia a zero_g_float sin vuelta atrás.
  private poseKickFlip(t: number, g: number): void {
    const p = clamp(t / 0.85, 0, 1);
    const arc = Math.sin(p * Math.PI);
    const tuck = smooth(0.02, 0.16, t) * (1 - smooth(0.6, 0.85, t));
    const wob = Math.sin(g * 5.2) * 0.04 * arc;

    let flip = -2 * Math.PI * smooth(0.02, 0.78, t);
    while (flip <= -Math.PI) flip += 2 * Math.PI;
    const o = HIPS * 3;
    while (this.cur[o] - flip > Math.PI) this.cur[o] -= 2 * Math.PI;
    while (this.cur[o] - flip < -Math.PI) this.cur[o] += 2 * Math.PI;

    this.pos(0, 0.22 * arc, -0.14 * arc);
    this.p(HIPS, flip, wob, 0);
    this.p(SPINE, 0.2 * tuck, 0, 0);
    this.p(CHEST, 0.16 * tuck, -0.15 * tuck, 0);
    this.p(HEAD, 0.34 * tuck, 0, 0); // barbilla al pecho durante el giro
    // Brazos ligeramente abiertos en equilibrio
    this.armL(0.12 + 0.22 * tuck, -0.3 * tuck, -0.82, 0.08, -0.45 * tuck, -0.1);
    this.armR(0.12 + 0.22 * tuck, -0.25 * tuck, -0.82, 0.08, -0.4 * tuck, -0.1);
    // Rodillas al pecho
    this.legL(-1.15, 0.05, 0.08, 1.55);
    this.legR(-1.15, 0, 0.08, 1.55);
    // Punteras estiradas en el tuck: la voltereta se lee más rápida y limpia
    this.footL(-0.55 * tuck, 0, 0.04, -0.4 * tuck);
    this.footR(-0.55 * tuck, 0, 0.04, -0.4 * tuck);
    this.clavL(0.05 * tuck, -0.1 * tuck, 0.08 * tuck);
    this.clavR(0.05 * tuck, -0.1 * tuck, 0.08 * tuck);
  }

  // --- land_recover: impacto amortiguado → incorporarse hasta idle ----------
  // Fase 1 (0..0.38): cae y amortigua en cuclillas profundas, brazo derecho
  // casi tocando el suelo y brazo izquierdo atrás en equilibrio. Fase 2
  // (0.38..1.10): empuja con las piernas subiendo el torso hasta quedar erguida.
  private poseLandRecover(t: number): void {
    const c = smooth(0.02, 0.14, t) * (1 - smooth(0.38, 0.95, t));
    const rise = smooth(0.38, 0.95, t);
    this.pos(0, -0.36 * c + 0.025 * Math.sin(rise * Math.PI), 0.1 * c);
    this.p(HIPS, 0.35 * c, 0, 0);
    this.p(SPINE, 0.28 * c, 0, 0);
    this.p(CHEST, 0.16 * c, 0, 0);
    this.p(HEAD, -0.28 * c, 0, 0);
    // Brazo derecho bajado casi tocando el suelo; izquierdo atrás en equilibrio
    this.armR(-0.45 * c, 0.15 * c, mix(-1.1, -1.18, c), 0, -0.1 * c, 0);
    this.armL(0.65 * c, -0.25 * c, mix(-1.1, -0.55, c), 0, -0.5 * c, -0.1);
    this.legL(-1.15 * c, 0.05 * c, 0.06, 1.85 * c + 0.04);
    this.legR(-0.85 * c, 0, 0.06, 1.65 * c + 0.04);
    // Sentadilla profunda: tobillos dorsiflexionados (talones plantados);
    // el hombro derecho cae con la mano al suelo, el izquierdo abre arriba
    this.footL(0.5 * c, 0, 0.02, 0.1 * c);
    this.footR(0.5 * c, 0, 0.02, 0.1 * c);
    this.clavL(0.06 * c, 0.12 * c, 0.1 * c);
    this.clavR(0.08 * c, -0.18 * c, -0.12 * c);
  }

  // --- stasis_cast: mano derecha proyecta el campo, izquierda recogida -------
  private poseCast(t: number, g: number): void {
    const a = smooth(0, 0.25, t);
    const tr = Math.sin(g * 41) * 0.012 * a;
    const pu = 0.5 + 0.5 * Math.sin(g * 6);
    this.pos(0, -0.07 * a, 0);
    this.p(HIPS, 0.08 * a, 0.25 * a, 0);
    this.p(SPINE, 0.04 * a, 0, 0);
    this.p(CHEST, 0.04 * a, -0.25 * a, 0);
    this.p(HEAD, -0.05 * a, -0.1 * a, 0);
    // Brazo R extendido al frente (palma), L cerca del pecho
    this.armR(mix(0.04, -0.1, a), mix(0, -1.4, a), mix(-1.1, -0.1, a) + pu * 0.04 * a, 0, 0, tr * 4);
    this.p(HAND_R, -1.0 * a + pu * 0.1 * a, 0, 0);
    this.armL(mix(0.04, 0.15, a), -0.5 * a, mix(-1.1, -0.8, a), 0, -1.5 * a + tr * 4, -0.1);
    // Postura base ancha
    this.legL(-0.25 * a, 0, 0.15 * a + 0.03, 0.45 * a + 0.04);
    this.legR(0.15 * a, 0, 0.15 * a + 0.03, 0.2 * a + 0.04);
    // El hombro derecho proyecta la mano; pies plantados y estables
    this.clavR(0.05 * a, -0.2 * a, 0.04 * a);
    this.clavL(0.04 * a, 0.1 * a, 0.02 * a);
    this.footL(0.12 * a, 0, 0.03, 0);
    this.footR(-0.08 * a, 0, 0.03, 0);
  }

  // --- stasis_throw: estilo Genkidama / Spirit Bomb (arriba -> lanzamiento en "C") ---
  // Fase 1 (0..0.38): flota mirando arriba con AMBOS brazos levantados sobre la
  // cabeza (como eden_absorb) concentrando energía. Fase 2 (0.38..0.92): se dobla
  // entera echando AMBOS brazos y AMBAS piernas hacia delante de forma exagerada
  // formando una "C" vista de perfil al proyectar la descarga gravitatoria.
  private poseThrow(t: number, g: number): void {
    const ch = smooth(0, 0.24, t) * (1 - smooth(0.46, 0.62, t));
    const th = smooth(0.52, 0.72, t) * (1 - smooth(1.06, 1.30, t));
    const tr = Math.sin(g * 33) * 0.02 * ch;

    this.pos(0, 0.12 * ch - 0.04 * th, -0.06 * ch + 0.14 * th);
    // Fase 1: arqueo mirando arriba · Fase 2: torso curvado en "C" hacia +Z
    this.p(HIPS, -0.12 * ch + 0.28 * th, 0, 0);
    this.p(SPINE, -0.15 * ch + 0.32 * th, 0, 0);
    this.p(CHEST, -0.22 * ch + 0.34 * th, 0, 0);
    this.p(NECK, -0.14 * ch - 0.08 * th, 0, 0);
    this.p(HEAD, -0.28 * ch - 0.42 * th, 0, 0);
    // Brazos: bien arriba sobre la cabeza (ch) -> proyectados al frente +Z (th)
    const ux = mix(0.04, -0.05, ch) * (1 - th) - 0.18 * th + tr;
    const uy = -0.15 * ch - 1.42 * th;
    const uz = mix(-1.1, 0.55, ch) * (1 - th) - 0.12 * th;
    const fy = -0.45 * ch - 0.05 * th;
    this.armL(ux, uy, uz, 0, fy, 0.08 * ch - 0.06 * th);
    this.armR(ux - tr * 2, uy, uz, 0, fy, 0.08 * ch - 0.06 * th);
    this.p(HAND_L, -0.35 * ch - 0.35 * th, 0, 0);
    this.p(HAND_R, -0.35 * ch - 0.35 * th, 0, 0);
    // Piernas: sueltas atrás en carga -> lanzadas exageradamente hacia delante (+Z) en "C"
    this.legL(0.12 * ch - 1.18 * th, 0, 0.05, 0.28 * ch + 0.22 * th + 0.04);
    this.legR(0.16 * ch - 1.18 * th, 0, 0.05, 0.34 * ch + 0.22 * th + 0.04);
    // Punteras lanzadas en la "C" + hombros arriba en la carga, proyectados al soltar
    this.footL(-0.42 * th, 0, 0.04, -0.28 * th);
    this.footR(-0.42 * th, 0, 0.04, -0.28 * th);
    this.clavL(0.05 * ch, -0.1 * ch, 0.1 * ch + 0.06 * th);
    this.clavR(0.05 * ch, -0.1 * ch, 0.1 * ch + 0.06 * th);
  }

  // --- hit_stagger: impacto hacia atrás, rodilla vencida y recuperación ------
  private poseHit(t: number): void {
    const i = pulse(t, 0, 0.08, 0.4);
    const wob = Math.exp(-t * 5) * Math.sin(t * 22);
    const buckle = smooth(0.2, 0.45, t) * (1 - smooth(0.45, 0.9, t));
    this.pos(0, -0.1 * buckle, -0.12 * i);
    this.p(HIPS, -0.35 * i + 0.1 * buckle, 0.1 * wob, 0.2 * i + 0.08 * wob);
    this.p(SPINE, -0.2 * i, 0, 0);
    this.p(CHEST, -0.3 * i, -0.2 * wob, 0);
    this.p(NECK, -0.3 * i, 0, 0);
    this.p(HEAD, -0.35 * i, 0.2 * wob, 0.15 * i);
    this.armL(0.7 * i, 0.5 * i, -1.1 + 0.8 * i, 0, -0.5 * i, -0.1);
    this.armR(0.5 * i, 0.4 * i, -1.1 + 0.6 * i, 0, -0.4 * i, -0.1);
    this.legL(-0.3 * i - 0.4 * buckle, 0, 0.03, 0.6 * i + 0.8 * buckle);
    this.legR(0.3 * i - 0.2 * buckle, 0, 0.03, 0.2 * i + 0.6 * buckle);
    // Impacto: pies que agarran el suelo y hombros golpeados hacia atrás
    this.footL(0.2 * i - 0.15 * buckle, 0, 0.03, 0.05 * i);
    this.footR(-0.1 * i - 0.2 * buckle, 0, 0.03, 0.05 * i);
    this.clavL(0.05 * i, 0.15 * i, 0.05 * i);
    this.clavR(0.05 * i, 0.15 * i, 0.05 * i);
  }

  // --- eden_absorb: flotando, brazos arriba, cabeza atrás, pulso de energía --
  private poseAbsorb(t: number, g: number): void {
    const a = smooth(0, 0.5, t);
    const pu = Math.sin(g * 3);
    this.pos(0, a * (0.12 + pu * 0.03), 0);
    this.p(HIPS, -0.06 * a, Math.sin(g * 0.8) * 0.08 * a, 0);
    this.p(SPINE, -0.12 * a, 0, 0);
    this.p(CHEST, -0.2 * a + pu * 0.02 * a, 0, 0);
    this.p(NECK, -0.15 * a, 0, 0);
    this.p(HEAD, -0.3 * a, 0, 0);
    const z = mix(-1.1, 0.55, a) + pu * 0.08 * a;
    this.armL(mix(0.04, -0.05, a), -0.15 * a, z, 0, -0.5 * a, 0.1 * a);
    this.armR(mix(0.04, -0.05, a), -0.15 * a, z - pu * 0.05 * a, 0, -0.5 * a, 0.1 * a);
    this.p(HAND_L, -0.4 * a, 0, 0);
    this.p(HAND_R, -0.4 * a, 0, 0);
    // Piernas sueltas, ligeramente atrás
    this.legL(0.08 * a + Math.sin(g * 1.4) * 0.05 * a, 0.03, 0.06 * a + 0.03, 0.25 * a + 0.04);
    this.legR(0.15 * a + Math.sin(g * 1.4 + 1) * 0.05 * a, 0, 0.06 * a + 0.03, 0.35 * a + 0.04);
    // Flotación de energía: puntas estiradas y hombros elevados hacia el cosmos
    this.footL(-0.3 * a, 0.02, 0.04, -0.2 * a);
    this.footR(-0.35 * a, 0, 0.04, -0.22 * a);
    this.clavL(0.03 * a, -0.08 * a, 0.1 * a);
    this.clavR(0.03 * a, -0.08 * a, 0.1 * a);
  }
}
