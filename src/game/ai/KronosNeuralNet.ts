import type { BehaviorPercentages, CharacterId } from '../types';

// ============================================================================
// Hito 4 — Red Neuronal MLP Híbrida del Comandante KRONOS
// ============================================================================
//
// MLP real 8 -> 10 -> 4 (134 parámetros: 8*10 + 10 + 10*4 + 4) en TypeScript
// puro, sin dependencias y sin allocations en `predict`/`trainOnline`.
//
// - Entradas (8): [stealth01, aggression01, aerial01, subterranean01,
//   stasis01, isKitsune, isDigger, isAxel]
// - Capa oculta (10): Math.tanh
// - Salidas (4 posturas, sigmoid): anti_kitsune, anti_digger, anti_axel,
//   anti_stasis
//
// Los pesos iniciales vienen de un entrenamiento offline (MSE 0.00185 sobre
// 2000 partidas sintéticas). Cada combate copia esos pesos a buffers
// mutables y refina online con backpropagation real (lr = 0.14) cada vez
// que el jugador daña a Kronos o una postura bloquea un ataque.

/** Posturas de combate que Kronos puede adoptar (índice = neurona de salida). */
export type KronosPosture = 'anti_kitsune' | 'anti_digger' | 'anti_axel' | 'anti_stasis';

export const KRONOS_POSTURES: readonly KronosPosture[] = [
  'anti_kitsune',
  'anti_digger',
  'anti_axel',
  'anti_stasis',
];

/** Total de parámetros entrenables de la red (8*10 + 10 + 10*4 + 4). */
export const KRONOS_PARAM_COUNT = 134;

/** Tasa de aprendizaje del refino online en combate. */
const ONLINE_LR = 0.14;

const INPUT_SIZE = 8;
const HIDDEN_SIZE = 10;
const OUTPUT_SIZE = 4;

// --- Pesos pre-entrenados offline (MSE 0.00185, 2000 partidas sintéticas) ---

const OFFLINE_W1: readonly number[] = [
  -2.5162, 0.5744, -2.6756, -2.7091, 5.8281, -0.4816, -0.495, -0.4615,
  0.805, 0.1969, 0.6447, 0.2165, -0.9841, 0.8504, 0.5466, -1.5698,
  -0.3915, 0.3062, 0.2314, 0.191, 0.1234, -0.6849, -0.3487, 0.3218,
  0.4735, 0.1465, -0.1306, 0.3245, -0.1864, -0.1282, -1.7345, 1.2135,
  1.3573, -0.1478, 1.3941, 1.1111, -2.8104, 0.2909, 0.2647, 0.1916,
  0.2689, -0.0198, -0.3364, -0.2806, 0.1126, -1.3504, 1.4682, -0.1229,
  0.3231, -0.055, -0.054, -0.0502, -0.6255, -1.4665, 0.5625, 1.0774,
  0.4194, -0.3019, 0.4451, 0.2105, -0.5802, -0.607, -0.5589, 0.9465,
  -0.1263, 0.3405, 0.3911, 0.091, -0.0344, 0.6613, -1.4888, 0.6582,
  -0.3781, -0.1704, -0.0814, -0.0067, 0.3283, 1.2085, -0.8119, -0.7227,
];

const OFFLINE_B1: readonly number[] = [
  -0.7112, -0.2117, -0.3035, 0.0544, 0.2462, 0.0033, 0.1776, -0.1583, 0.2832,
  -0.0311,
];

const OFFLINE_W2: readonly number[] = [
  0.8102, 1.4345, -0.2558, 0.2464, -0.3171, -1.8739, -2.1906, -0.6238,
  0.6289, 1.8199, 0.4514, 0.9356, 0.1757, -2.1597, -0.8039, 1.9928,
  0.7142, -0.4335, -2.0012, -0.7589, 0.0458, -2.2372, 0.9232, 2.1298,
  -0.7442, -0.2309, 1.2194, 1.4266, 0.5969, -0.5803, 6.4911, -1.2903,
  0.013, -0.2311, -3.0675, 0.2048, -0.4469, -0.7705, -0.0529, 0.3303,
];

const OFFLINE_B2: readonly number[] = [-0.9689, -0.8222, -1.0716, -0.924];

// ============================================================================
// Mapeos postura <-> personaje contrarrestado
// ============================================================================

/** Personaje que la postura contrarresta (anti_stasis no apunta a un personaje). */
export function postureToCounterCharacter(posture: KronosPosture): CharacterId | null {
  switch (posture) {
    case 'anti_kitsune':
      return 'kitsune';
    case 'anti_digger':
      return 'digger';
    case 'anti_axel':
      return 'axel';
    default:
      return null; // anti_stasis: escudo frontal, obliga a flanquear / parry
  }
}

/** Postura con la que KronOS responde al personaje que lo está dañando. */
export function counterCharacterToPostureIndex(character: CharacterId): number {
  switch (character) {
    case 'kitsune':
      return 0;
    case 'digger':
      return 1;
    default:
      return 2; // axel
  }
}

/** Índice de la postura anti-estasis (parry/estasis abusivos). */
export const ANTI_STASIS_INDEX = 3;

// ============================================================================
// Construcción de la entrada de 8 features (0..1)
// ============================================================================

/**
 * Escribe en `out` (longitud 8, preasignado por el llamador) el vector de
 * entrada de la red: porcentajes de estilo normalizados + one-hot del
 * personaje activo del jugador.
 */
export function buildKronosInput(
  pct: BehaviorPercentages,
  activeCharacter: CharacterId,
  out: number[]
): void {
  out[0] = pct.stealth / 100;
  out[1] = pct.aggression / 100;
  out[2] = pct.aerial / 100;
  out[3] = pct.subterranean / 100;
  out[4] = pct.stasis / 100;
  out[5] = activeCharacter === 'kitsune' ? 1 : 0;
  out[6] = activeCharacter === 'digger' ? 1 : 0;
  out[7] = activeCharacter === 'axel' ? 1 : 0;
}

// ============================================================================
// Red neuronal: copia mutable por combate + aprendizaje online
// ============================================================================

/**
 * Instancia de la red de KRONOS para UN combate: copia los pesos offline a
 * buffers mutables y refina online con pasos reales de backpropagation.
 * `predict` y `trainOnline` no alocan memoria (scratch preasignado).
 */
export class KronosNeuralNet {
  private readonly w1 = new Float64Array(INPUT_SIZE * HIDDEN_SIZE);
  private readonly b1 = new Float64Array(HIDDEN_SIZE);
  private readonly w2 = new Float64Array(HIDDEN_SIZE * OUTPUT_SIZE);
  private readonly b2 = new Float64Array(OUTPUT_SIZE);

  // Scratch preasignado: cero allocations dentro del loop de simulación.
  private readonly hidden = new Float64Array(HIDDEN_SIZE);
  private readonly outputs = new Float64Array(OUTPUT_SIZE);
  private readonly deltaOut = new Float64Array(OUTPUT_SIZE);
  private readonly deltaHidden = new Float64Array(HIDDEN_SIZE);

  private updates = 0;

  constructor() {
    this.w1.set(OFFLINE_W1);
    this.b1.set(OFFLINE_B1);
    this.w2.set(OFFLINE_W2);
    this.b2.set(OFFLINE_B2);
  }

  /** Pasos de backpropagation online realizados durante el combate. */
  get onlineUpdates(): number {
    return this.updates;
  }

  /**
   * Forward pass completo (guarda activaciones en el scratch interno).
   * Capa oculta `tanh`, salidas `sigmoid`.
   */
  private forward(input: number[]): void {
    for (let j = 0; j < HIDDEN_SIZE; j++) {
      let sum = this.b1[j];
      const row = j * INPUT_SIZE;
      for (let i = 0; i < INPUT_SIZE; i++) {
        sum += input[i] * this.w1[row + i];
      }
      this.hidden[j] = Math.tanh(sum);
    }
    for (let k = 0; k < OUTPUT_SIZE; k++) {
      let sum = this.b2[k];
      const col = k;
      for (let j = 0; j < HIDDEN_SIZE; j++) {
        sum += this.hidden[j] * this.w2[j * OUTPUT_SIZE + col];
      }
      this.outputs[k] = 1 / (1 + Math.exp(-sum));
    }
  }

  /**
   * Predice la postura de combate (índice 0..3 de KRONOS_POSTURES) para el
   * vector de entrada dado. Sin allocations.
   */
  predict(input: number[]): number {
    this.forward(input);
    let best = 0;
    let bestVal = this.outputs[0];
    for (let k = 1; k < OUTPUT_SIZE; k++) {
      if (this.outputs[k] > bestVal) {
        bestVal = this.outputs[k];
        best = k;
      }
    }
    return best;
  }

  /**
   * Un paso REAL de backpropagation online (lr = 0.14, cross-entropy sobre
   * salidas sigmoid con objetivo one-hot). Ajusta los 134 parámetros y
   * contabiliza `onlineUpdates`.
   */
  trainOnline(input: number[], targetIdx: number): void {
    this.forward(input);

    // delta de salida: sigmoid + cross-entropy => out - target.
    for (let k = 0; k < OUTPUT_SIZE; k++) {
      this.deltaOut[k] = this.outputs[k] - (k === targetIdx ? 1 : 0);
    }

    // Retropropagación a la capa oculta: tanh' = 1 - h^2.
    for (let j = 0; j < HIDDEN_SIZE; j++) {
      let sum = 0;
      for (let k = 0; k < OUTPUT_SIZE; k++) {
        sum += this.w2[j * OUTPUT_SIZE + k] * this.deltaOut[k];
      }
      this.deltaHidden[j] = sum * (1 - this.hidden[j] * this.hidden[j]);
    }

    // Descenso de gradiente estocástico sobre capa de salida.
    for (let j = 0; j < HIDDEN_SIZE; j++) {
      const h = this.hidden[j];
      for (let k = 0; k < OUTPUT_SIZE; k++) {
        this.w2[j * OUTPUT_SIZE + k] -= ONLINE_LR * this.deltaOut[k] * h;
      }
    }
    for (let k = 0; k < OUTPUT_SIZE; k++) {
      this.b2[k] -= ONLINE_LR * this.deltaOut[k];
    }

    // Capa oculta.
    for (let j = 0; j < HIDDEN_SIZE; j++) {
      const d = this.deltaHidden[j];
      const row = j * INPUT_SIZE;
      for (let i = 0; i < INPUT_SIZE; i++) {
        this.w1[row + i] -= ONLINE_LR * d * input[i];
      }
      this.b1[j] -= ONLINE_LR * d;
    }

    this.updates++;
  }
}
