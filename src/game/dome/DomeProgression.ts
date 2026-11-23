// ============================================================================
// DomeProgression — Progresión en caliente de la Cúpula.
//
// Curva de EXP (Nv N -> N+1 requiere 0.5 x N enemigos), escalado x1.1 de
// HP/Edén máximos por nivel, 3 huecos de habilidad, 3 pasivas (Nv máx. 3) y
// el generador de cartas de la UI de subida de nivel (2 cartas):
//   - Nivel 1: Carta 1 fija (Campo Gravitacional, BASE) + 1 aleatoria.
//   - Niveles impares (3, 5, 7...): habilidad nueva o mejora +1 de equipada.
//   - Niveles pares (2, 4, 6...): 2 pasivas (fallback a activas si todo
//     está al Nv 3).
// ============================================================================

export type ActiveSkillId =
  | 'gravity_field'
  | 'repulse_push'
  | 'eden_absorb'
  | 'attraction_well'
  | 'bounce_horizon'
  | 'black_hole'
  | 'implosion';

export type PassiveId = 'speed_force' | 'eden_regen' | 'hp_regen';

export type SkillRarity = 'base' | 'common' | 'epic' | 'legendary';

export interface SkillSlotState {
  skillId: ActiveSkillId | null;
  level: number;
  cooldownRemaining: number;
  maxCooldown: number;
}

export interface LevelUpCardOption {
  id: string;
  kind: 'active_new' | 'active_upgrade' | 'passive';
  skillId?: ActiveSkillId;
  passiveId?: PassiveId;
  title: string;
  subtitle: string;
  rarity: SkillRarity;
  currentLevel: number;
  nextLevel: number;
  description: string;
  accentColor: string;
  edenCost?: number;
}

export interface DomeModifiers {
  speedMultiplier: number;
  forceMultiplier: number;
  edenRegenPctPerSec: number;
  hpRegenPctPerSec: number;
  magnetRadius: number;
  magnetSpeed: number;
}

// ============================================================================
// Catálogo de las 7 habilidades activas (1 Base + 3 Comunes + 2 Épicas + 1 Legendaria)
// ============================================================================

export interface ActiveSkillDef {
  id: ActiveSkillId;
  name: string;
  rarity: SkillRarity;
  edenCost: number;
  /** Cooldown base en segundos (Nv 1). */
  cooldown: number;
  maxLevel: number;
  description: string;
  accentColor: string;
}

export const ACTIVE_SKILL_IDS: readonly ActiveSkillId[] = [
  'gravity_field',
  'repulse_push',
  'eden_absorb',
  'attraction_well',
  'bounce_horizon',
  'black_hole',
  'implosion',
];

export const ACTIVE_SKILLS_CATALOG: Readonly<Record<ActiveSkillId, ActiveSkillDef>> = {
  gravity_field: {
    id: 'gravity_field',
    name: 'Campo Gravitacional',
    rarity: 'base',
    edenCost: 8,
    cooldown: 5,
    maxLevel: 5,
    description:
      'Agarra hasta 2 escombros con estasis y los orbita frente a Nyx; vuelve a pulsar para lanzarlos contra un enemigo. Cada nivel agarra más objetos, más grandes y los lanza con mucha más fuerza.',
    accentColor: '#7ae8dc',
  },
  repulse_push: {
    id: 'repulse_push',
    name: 'Empuje',
    rarity: 'common',
    edenCost: 12,
    cooldown: 7,
    maxLevel: 5,
    description:
      'Onda antigravitatoria con ambas palmas que empuja lejos a los enemigos del radio (y al suelo flotante si no estás apoyada). Un enemigo empujado contra la Barrera Blanca muere al instante. Cada nivel añade más radio y más fuerza.',
    accentColor: '#42bde8',
  },
  eden_absorb: {
    id: 'eden_absorb',
    name: 'Absorción de Edén',
    rarity: 'common',
    edenCost: 0,
    cooldown: 6,
    maxLevel: 3,
    description:
      'Canaliza quedándote completamente quieta con los brazos en alto para recuperar Vida y Edén al instante con un halo ascendente. Cada nivel aumenta la cantidad recuperada.',
    accentColor: '#7dffa8',
  },
  attraction_well: {
    id: 'attraction_well',
    name: 'Pozo de Atracción',
    rarity: 'common',
    edenCost: 18,
    cooldown: 10,
    maxLevel: 3,
    description:
      'Enlaza dos enemigos cercanos (o dos suelos con un enemigo en medio) con atracción gravitatoria intensa durante 1.8 s; al chocar reciben daño por impacto y quedan aturdidos. Cada nivel amplía el rango y el daño de aplastamiento.',
    accentColor: '#42bde8',
  },
  bounce_horizon: {
    id: 'bounce_horizon',
    name: 'Horizonte de Rebote',
    rarity: 'epic',
    edenCost: 22,
    cooldown: 8,
    maxLevel: 3,
    description:
      'Lanza ondas cortantes que parten el espacio y atraviesan a los enemigos que tocan. Cada nivel lanza más ondas y, desde Nv 2, adquieren auto-aim hacia el enemigo bloqueado.',
    accentColor: '#df9fff',
  },
  black_hole: {
    id: 'black_hole',
    name: 'Agujero Negro',
    rarity: 'epic',
    edenCost: 30,
    cooldown: 16,
    maxLevel: 3,
    description:
      'Lanza una mini-singularidad con disco de acreción que avanza lenta por la cúpula durante 4.5 s, succionando y dañando todo lo que entra en su horizonte de sucesos. Cada nivel amplía el radio de succión y el daño.',
    accentColor: '#df9fff',
  },
  implosion: {
    id: 'implosion',
    name: 'Implosión',
    rarity: 'legendary',
    edenCost: 45,
    cooldown: 25,
    maxLevel: 1,
    description:
      'Comprime la gravedad interna de un enemigo hasta que se colapsa sobre sí mismo y desaparece al instante (a jefes les revienta un cristal/segmento). Habilidad legendaria sin niveles de mejora.',
    accentColor: '#ffd992',
  },
};

// ============================================================================
// Catálogo de las 3 pasivas (niveles pares; máximo 3 niveles cada una)
// ============================================================================

export interface PassiveLevelDef {
  /** Etiqueta corta para la carta ("+20%", "2% / s"...). */
  label: string;
  /** Valor numérico del nivel (multiplicador o fracción por segundo). */
  value: number;
  description: string;
}

export interface PassiveDef {
  id: PassiveId;
  name: string;
  maxLevel: number;
  accentColor: string;
  levels: readonly PassiveLevelDef[];
}

export const PASSIVE_IDS: readonly PassiveId[] = ['speed_force', 'eden_regen', 'hp_regen'];

export const PASSIVES_CATALOG: Readonly<Record<PassiveId, PassiveDef>> = {
  speed_force: {
    id: 'speed_force',
    name: 'Velocidad (+Fuerza física)',
    maxLevel: 3,
    accentColor: '#ffd992',
    levels: [
      {
        label: '+20%',
        value: 0.2,
        description:
          'Vuelo un 20% más rápido respecto a la base y, por física, las patadas golpean con más fuerza y penetran más profundo.',
      },
      {
        label: '+50%',
        value: 0.5,
        description:
          'Vuelo un 50% más rápido: las patadas golpean con mucha más fuerza y es más fácil entrar en Patada Taladro Espiral.',
      },
      {
        label: '+75%',
        value: 0.75,
        description:
          'Vuelo un 75% más rápido: fuerza y penetración máximas en cada impacto gravitatorio.',
      },
    ],
  },
  eden_regen: {
    id: 'eden_regen',
    name: 'Regeneración de Edén',
    maxLevel: 3,
    accentColor: '#df9fff',
    levels: [
      {
        label: '2% / s',
        value: 0.02,
        description: 'Regenera un 2% de tu barra de Edén por segundo, solo cuando estás quieta.',
      },
      {
        label: '3% / s',
        value: 0.03,
        description: 'Regenera un 3% de Edén por segundo mientras flotes inmóvil o estés parada.',
      },
      {
        label: '5% / s',
        value: 0.05,
        description: 'Regenera un 5% de Edén por segundo en cuanto te detienes.',
      },
    ],
  },
  hp_regen: {
    id: 'hp_regen',
    name: 'Regeneración de Vida',
    maxLevel: 3,
    accentColor: '#7dffa8',
    levels: [
      {
        label: '1% / s',
        value: 0.01,
        description: 'Regenera un 1% de Vida por segundo, constante incluso moviéndote o peleando.',
      },
      {
        label: '1.5% / s',
        value: 0.015,
        description: 'Regenera un 1.5% de Vida por segundo en todo momento.',
      },
      {
        label: '2% / s',
        value: 0.02,
        description: 'Regenera un 2% de Vida por segundo en todo momento.',
      },
    ],
  },
};

/** Regeneración base de Edén con la pasiva a Nv 0 (desde el minuto 1). */
export const BASE_EDEN_REGEN_PCT_PER_SEC = 0.01;

const RARITY_LABELS: Readonly<Record<SkillRarity, string>> = {
  base: 'BASE',
  common: 'COMÚN',
  epic: 'ÉPICA',
  legendary: 'LEGENDARIA',
};

function pickRandom<T>(pool: readonly T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Elige 2 entradas distintas del pool (duplica si solo hay 1 disponible). */
function pickTwoDistinct<T>(pool: readonly T[]): [T, T] {
  if (pool.length <= 1) return [pool[0], pool[0]];
  const firstIdx = Math.floor(Math.random() * pool.length);
  let secondIdx = Math.floor(Math.random() * (pool.length - 1));
  if (secondIdx >= firstIdx) secondIdx += 1;
  return [pool[firstIdx], pool[secondIdx]];
}

// ============================================================================
// DomeProgressionManager
// ============================================================================

export class DomeProgressionManager {
  level = 1;
  exp = 0;
  expToNext = 1.0;
  maxHp = 100;
  hp = 100;
  maxEden = 100;
  eden = 100;
  /** La 1ª elección de cartas (Nivel 1) sigue pendiente de resolverse. */
  pendingInitialPick = true;

  readonly slots: [SkillSlotState, SkillSlotState, SkillSlotState] = [
    { skillId: null, level: 0, cooldownRemaining: 0, maxCooldown: 0 },
    { skillId: null, level: 0, cooldownRemaining: 0, maxCooldown: 0 },
    { skillId: null, level: 0, cooldownRemaining: 0, maxCooldown: 0 },
  ];

  readonly passives: Record<PassiveId, number> = {
    speed_force: 0,
    eden_regen: 0,
    hp_regen: 0,
  };

  /**
   * Suma EXP (en "enemigos básicos": 1.0 = un enemigo). Devuelve `true` si
   * subió al menos un nivel. Cada subida multiplica HP/Edén máximos por 1.1
   * (curando/rellenando el incremento) y la curva pide `0.5 x nivel` enemigos.
   */
  addExp(amount: number): boolean {
    if (amount <= 0) return false;
    this.exp += amount;
    let leveledUp = false;
    while (this.exp >= this.expToNext) {
      this.exp -= this.expToNext;
      this.level += 1;
      const hpInc = this.maxHp * 0.1;
      const edenInc = this.maxEden * 0.1;
      this.maxHp += hpInc;
      this.hp = Math.min(this.maxHp, this.hp + hpInc);
      this.maxEden += edenInc;
      this.eden = Math.min(this.maxEden, this.eden + edenInc);
      this.expToNext = 0.5 * this.level;
      leveledUp = true;
    }
    if (leveledUp) this.modifiersDirty = true;
    return leveledUp;
  }

  /** Avanza los cooldowns de los 3 huecos (llamar cada frame). */
  updateCooldowns(dt: number): void {
    for (const slot of this.slots) {
      if (slot.skillId !== null && slot.cooldownRemaining > 0) {
        slot.cooldownRemaining = Math.max(0, slot.cooldownRemaining - dt);
      }
    }
  }

  /**
   * Genera las 2 cartas de la UI de subida al nivel `forLevel`:
   *  - Nivel 1: Carta 1 SIEMPRE Campo Gravitacional (BASE); Carta 2 aleatoria.
   *  - Impares (3, 5, 7...): habilidad nueva (hueco libre o reemplazo) o
   *    mejora +1 de una equipada (implosion queda excluida: maxLevel 1).
   *  - Pares (2, 4, 6...): 2 pasivas que no estén al Nv 3; si todas lo están,
   *    fallback a mejoras/habilidades activas.
   */
  generateLevelUpChoices(forLevel: number): [LevelUpCardOption, LevelUpCardOption] {
    if (forLevel <= 1) {
      const second = pickRandom(ACTIVE_SKILL_IDS.filter((id) => id !== 'gravity_field'));
      return [this.buildNewSkillCard('gravity_field'), this.buildNewSkillCard(second)];
    }

    if (forLevel % 2 === 1) {
      const activePool = this.buildActiveOptionPool();
      if (activePool.length >= 2) return pickTwoDistinct(activePool);
      const combined = [...activePool, ...this.buildPassiveOptionPool()];
      if (combined.length >= 2) return pickTwoDistinct(combined);
    } else {
      const passivePool = this.buildPassiveOptionPool();
      if (passivePool.length >= 2) return pickTwoDistinct(passivePool);
      const combined = [...passivePool, ...this.buildActiveOptionPool()];
      if (combined.length >= 2) return pickTwoDistinct(combined);
    }

    // Caso degenerado (todo maximizado): duplicamos una carta pasiva tope
    // para que la UI de 2 cartas siga teniendo sentido.
    const fallback = this.buildPassiveCard('eden_regen');
    return [fallback, { ...fallback, id: `${fallback.id}:dup` }];
  }

  /**
   * Aplica la carta elegida: equipa en el primer hueco libre (o reemplaza
   * `targetSlotIndex`), mejora la habilidad equipada o sube la pasiva.
   */
  applyChoice(option: LevelUpCardOption, targetSlotIndex?: 0 | 1 | 2): void {
    if (option.kind === 'passive') {
      if (option.passiveId !== undefined) {
        const def = PASSIVES_CATALOG[option.passiveId];
        this.passives[option.passiveId] = Math.min(def.maxLevel, Math.max(0, option.nextLevel));
        this.modifiersDirty = true;
      }
    } else if (option.skillId !== undefined) {
      if (option.kind === 'active_upgrade') {
        const slot = this.slots.find((s) => s.skillId === option.skillId);
        if (slot) {
          slot.level = option.nextLevel;
          slot.maxCooldown = ACTIVE_SKILLS_CATALOG[option.skillId].cooldown;
        }
      } else {
        let index = targetSlotIndex;
        if (index === undefined) {
          const freeIdx = this.slots.findIndex((s) => s.skillId === null);
          index = freeIdx >= 0 ? (freeIdx as 0 | 1 | 2) : 0;
        }
        const def = ACTIVE_SKILLS_CATALOG[option.skillId];
        this.slots[index] = {
          skillId: option.skillId,
          level: option.nextLevel,
          cooldownRemaining: 0,
          maxCooldown: def.cooldown,
        };
      }
    }

    if (this.pendingInitialPick) this.pendingInitialPick = false;
  }

  /**
   * Modificadores derivados de nivel + pasivas. El magnetismo de partículas
   * escala con el nivel (a Nv 1 apenas atraen; a niveles altos vuelan a Nyx).
   *
   * Devuelve SIEMPRE el mismo objeto (recomputado in-place solo cuando cambia
   * el nivel o una pasiva): el bucle de juego lo consulta cada frame sin
   * generar basura. No mutar el resultado.
   */
  getModifiers(): DomeModifiers {
    if (this.modifiersDirty) {
      this.recomputeModifiers();
      this.modifiersDirty = false;
    }
    return this.modifiersCache;
  }

  /** Nivel de una pasiva (vía pública que invalida el cache de modificadores). */
  setPassiveLevel(id: PassiveId, level: number): void {
    this.passives[id] = Math.min(PASSIVES_CATALOG[id].maxLevel, Math.max(0, level));
    this.modifiersDirty = true;
  }

  private readonly modifiersCache: DomeModifiers = {
    speedMultiplier: 1,
    forceMultiplier: 1,
    edenRegenPctPerSec: BASE_EDEN_REGEN_PCT_PER_SEC,
    hpRegenPctPerSec: 0,
    magnetRadius: 6.5,
    magnetSpeed: 17,
  };
  private modifiersDirty = true;

  private recomputeModifiers(): void {
    const speedLvl = this.passives.speed_force;
    const speedBonus = speedLvl > 0 ? PASSIVES_CATALOG.speed_force.levels[speedLvl - 1].value : 0;
    const edenLvl = this.passives.eden_regen;
    const hpLvl = this.passives.hp_regen;
    const cache = this.modifiersCache;
    cache.speedMultiplier = 1 + speedBonus;
    // Por física, más velocidad = más fuerza/penetración de patadas.
    cache.forceMultiplier = 1 + speedBonus;
    cache.edenRegenPctPerSec =
      edenLvl > 0
        ? PASSIVES_CATALOG.eden_regen.levels[edenLvl - 1].value
        : BASE_EDEN_REGEN_PCT_PER_SEC;
    cache.hpRegenPctPerSec = hpLvl > 0 ? PASSIVES_CATALOG.hp_regen.levels[hpLvl - 1].value : 0;
    cache.magnetRadius = 4 + this.level * 2.5;
    cache.magnetSpeed = 10 + this.level * 7;
  }

  // ------------------------------------------------------------------
  // Construcción de cartas
  // ------------------------------------------------------------------

  private buildNewSkillCard(id: ActiveSkillId): LevelUpCardOption {
    const def = ACTIVE_SKILLS_CATALOG[id];
    return {
      id: `active_new:${id}`,
      kind: 'active_new',
      skillId: id,
      title: def.name,
      subtitle: `${RARITY_LABELS[def.rarity]} · Nueva habilidad`,
      rarity: def.rarity,
      currentLevel: 0,
      nextLevel: 1,
      description: def.description,
      accentColor: def.accentColor,
      edenCost: def.edenCost,
    };
  }

  private buildUpgradeCard(id: ActiveSkillId, currentLevel: number): LevelUpCardOption {
    const def = ACTIVE_SKILLS_CATALOG[id];
    return {
      id: `active_upgrade:${id}:${currentLevel + 1}`,
      kind: 'active_upgrade',
      skillId: id,
      title: def.name,
      subtitle: `Mejora Nv ${currentLevel} → Nv ${currentLevel + 1}`,
      rarity: def.rarity,
      currentLevel,
      nextLevel: currentLevel + 1,
      description: def.description,
      accentColor: def.accentColor,
      edenCost: def.edenCost,
    };
  }

  private buildPassiveCard(id: PassiveId): LevelUpCardOption {
    const def = PASSIVES_CATALOG[id];
    const currentLevel = this.passives[id];
    const nextLevel = Math.min(def.maxLevel, currentLevel + 1);
    const levelDef = def.levels[Math.min(def.levels.length - 1, nextLevel - 1)];
    const maxed = currentLevel >= def.maxLevel;
    return {
      id: `passive:${id}:${nextLevel}`,
      kind: 'passive',
      passiveId: id,
      title: def.name,
      subtitle: maxed
        ? `Pasiva · Ya dominada (Nv ${def.maxLevel})`
        : `Pasiva · Nv ${currentLevel} → Nv ${nextLevel} (${levelDef.label})`,
      rarity: 'common',
      currentLevel,
      nextLevel,
      description: levelDef.description,
      accentColor: def.accentColor,
    };
  }

  /** Mejoras de equipadas + habilidades no poseídas (nuevas o de reemplazo). */
  private buildActiveOptionPool(): LevelUpCardOption[] {
    const pool: LevelUpCardOption[] = [];
    const owned = new Set<ActiveSkillId>();
    for (const slot of this.slots) {
      if (slot.skillId === null) continue;
      owned.add(slot.skillId);
      const def = ACTIVE_SKILLS_CATALOG[slot.skillId];
      if (slot.level < def.maxLevel) {
        pool.push(this.buildUpgradeCard(slot.skillId, slot.level));
      }
    }
    for (const id of ACTIVE_SKILL_IDS) {
      if (!owned.has(id)) pool.push(this.buildNewSkillCard(id));
    }
    return pool;
  }

  /** Pasivas que aún no están al Nv 3. */
  private buildPassiveOptionPool(): LevelUpCardOption[] {
    const pool: LevelUpCardOption[] = [];
    for (const id of PASSIVE_IDS) {
      if (this.passives[id] < PASSIVES_CATALOG[id].maxLevel) {
        pool.push(this.buildPassiveCard(id));
      }
    }
    return pool;
  }
}
