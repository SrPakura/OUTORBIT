import {
  ACTIVE_SKILLS_CATALOG,
  ACTIVE_SKILL_IDS,
  PASSIVES_CATALOG,
  PASSIVE_IDS,
  type ActiveSkillId,
  type PassiveId,
} from '@/game/dome/DomeProgression';
import type { EnemyArchetype } from '@/game/dome/DomeCombatSystem';
import { useI18n, ENEMY_I18N_KEYS, SKILL_I18N_KEYS } from '@/i18n';

// ============================================================================
// DomeTrainingPanel — Panel Debug flotante del Modo Entrenamiento.
//
// Esquina superior derecha, semi-transparente y limpio. Permite en vivo:
//   - Cambiar entre los 8 enemigos (borra el anterior y spawnea el elegido).
//   - Reiniciar el enemigo (respawn instantáneo con la vida llena).
//   - Alternar Enemigo Pasivo (saco de boxeo) / IA Activa (ataques y
//     telegraphs reales).
//   - Equipar/subir de nivel las 7 Habilidades Activas en las ranuras 1/2/3
//     y fijar el nivel de las 3 Pasivas, sin farmear EXP.
//
// Se muestra/oculta con F2 o Tab (también queda visible al abrir la pausa).
// ============================================================================

export const TRAINING_ENEMY_ORDER: readonly EnemyArchetype[] = [
  'abyssal_cell',
  'spiral_octopus',
  'crab_gunner',
  'ground_golem',
  'lightning_butterfly',
  'giant_sparrow',
  'prisma_necroz',
  'kronos_leviathan',
];

const ENEMY_LABELS: Readonly<Record<EnemyArchetype, string>> = {
  abyssal_cell: 'Célula Abisal',
  spiral_octopus: 'Pulpo Espiral',
  crab_gunner: 'Cangrejo Artillero',
  ground_golem: 'Gólem Rompesuelos',
  lightning_butterfly: 'Mariposa Relámpago',
  giant_sparrow: 'Gorrión Gigante',
  prisma_necroz: 'Prisma Necroz',
  kronos_leviathan: 'Leviatán KRONOS',
};

export interface TrainingSlotInfo {
  keyLabel: string;
  skillId: ActiveSkillId | null;
  level: number;
  maxLevel: number;
}

export interface DomeTrainingPanelProps {
  archetype: EnemyArchetype;
  passive: boolean;
  slots: readonly TrainingSlotInfo[];
  passiveLevels: Record<PassiveId, number>;
  onSetArchetype: (archetype: EnemyArchetype) => void;
  onRespawn: () => void;
  onSetPassive: (passive: boolean) => void;
  onEquipSkill: (slot: 0 | 1 | 2, skillId: ActiveSkillId) => void;
  onClearSlot: (slot: 0 | 1 | 2) => void;
  onUpgradeSlot: (slot: 0 | 1 | 2) => void;
  onSetPassiveLevel: (id: PassiveId, level: number) => void;
  onRefill: () => void;
}

function PanelButton({
  label,
  title,
  active = false,
  accent = 'cyan',
  onClick,
  className = '',
}: {
  label: string;
  title?: string;
  active?: boolean;
  accent?: 'cyan' | 'rose' | 'amber' | 'violet';
  onClick: () => void;
  className?: string;
}) {
  const accentClasses: Record<string, string> = {
    cyan: 'border-cyan-300/70 bg-cyan-400/20 text-cyan-100',
    rose: 'border-rose-400/70 bg-rose-500/20 text-rose-100',
    amber: 'border-amber-300/70 bg-amber-400/20 text-amber-100',
    violet: 'border-violet-400/70 bg-violet-500/20 text-violet-100',
  };
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`cursor-pointer rounded-sm border px-1.5 py-1 text-[10px] font-bold uppercase tracking-[0.06em] transition-colors ${
        active
          ? accentClasses[accent]
          : 'border-white/20 bg-white/5 text-white/70 hover:border-white/50 hover:bg-white/10 hover:text-white'
      } ${className}`}
    >
      {label}
    </button>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h3 className="mb-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200/80">
      {children}
    </h3>
  );
}

export default function DomeTrainingPanel({
  archetype,
  passive,
  slots,
  passiveLevels,
  onSetArchetype,
  onRespawn,
  onSetPassive,
  onEquipSkill,
  onClearSlot,
  onUpgradeSlot,
  onSetPassiveLevel,
  onRefill,
}: DomeTrainingPanelProps) {
  const { t } = useI18n();

  return (
    <aside
      className="pointer-events-auto absolute right-3 top-3 z-[60] max-h-[94vh] w-[320px] overflow-y-auto rounded-md border border-cyan-300/40 bg-[#090314]/85 p-3 font-mono text-white shadow-[0_0_28px_rgba(34,211,238,0.18)] backdrop-blur-md select-none"
      aria-label="Panel de entrenamiento (debug)"
    >
      <header className="mb-2 flex items-center justify-between gap-2 border-b border-white/15 pb-2">
        <span className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">
          {t('trainingPanel.title')}{' '}
          <span className="text-amber-300/90">{t('trainingPanel.debug')}</span>
        </span>
        <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/45">
          {t('trainingPanel.hideHint')}
        </span>
      </header>

      {/* --- Enemigo: selector 8/8 + reinicio + pasivo/ataca --- */}
      <section className="mb-3">
        <SectionTitle>{t('trainingPanel.enemySection')}</SectionTitle>
        <div className="grid grid-cols-2 gap-1">
          {TRAINING_ENEMY_ORDER.map((id) => (
            <PanelButton
              key={id}
              label={t(ENEMY_I18N_KEYS[id])}
              active={archetype === id}
              onClick={() => onSetArchetype(id)}
              className="truncate"
            />
          ))}
        </div>
        <div className="mt-1.5 flex gap-1">
          <PanelButton label={t('trainingPanel.restartEnemy')} accent="amber" onClick={onRespawn} className="flex-1" />
          <PanelButton
            label={passive ? t('trainingPanel.dummyPassive') : t('trainingPanel.dummyActive')}
            title={t('trainingPanel.dummyTitle')}
            accent={passive ? 'violet' : 'rose'}
            active
            onClick={() => onSetPassive(!passive)}
            className="flex-1"
          />
        </div>
      </section>

      {/* --- Ranuras 1/2/3: habilidad equipada, nivel y vaciado --- */}
      <section className="mb-3">
        <SectionTitle>{t('trainingPanel.slotsSection')}</SectionTitle>
        <div className="flex flex-col gap-1">
          {slots.map((slot, index) => {
            const slotIdx = index as 0 | 1 | 2;
            const def = slot.skillId ? ACTIVE_SKILLS_CATALOG[slot.skillId] : null;
            const maxed = def !== null && slot.level >= slot.maxLevel;
            const skillName = slot.skillId ? t(`skills.${SKILL_I18N_KEYS[slot.skillId]}`) : '';
            return (
              <div key={slot.keyLabel} className="flex items-center gap-1">
                <span className="w-4 shrink-0 text-[10px] font-black text-cyan-300">
                  {slot.keyLabel}
                </span>
                <span className="min-w-0 flex-1 truncate text-[10px] font-bold text-white/85">
                  {def ? `${skillName} · ${t('levelUp.levelShort')} ${slot.level}/${slot.maxLevel}` : t('trainingPanel.emptySlot')}
                </span>
                <PanelButton
                  label={t('trainingPanel.upgradeLevel')}
                  title={maxed ? t('trainingPanel.maxLevelTitle') : t('trainingPanel.upgradeLevelTitle')}
                  active={def !== null && !maxed}
                  accent="cyan"
                  onClick={() => onUpgradeSlot(slotIdx)}
                />
                <PanelButton
                  label={t('trainingPanel.clearSlot')}
                  onClick={() => onClearSlot(slotIdx)}
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* --- Habilidades Activas: equipar en la ranura 1, 2 o 3 --- */}
      <section className="mb-3">
        <SectionTitle>{t('trainingPanel.activeSkillsSection')}</SectionTitle>
        <div className="flex flex-col gap-1">
          {ACTIVE_SKILL_IDS.map((skillId) => {
            const def = ACTIVE_SKILLS_CATALOG[skillId];
            const skillKey = SKILL_I18N_KEYS[skillId];
            const skillName = t(`skills.${skillKey}`);
            const skillDesc = t(`skillDescriptions.${skillKey}`);
            return (
              <div key={skillId} className="flex items-center gap-1">
                <span
                  className="min-w-0 flex-1 truncate text-[10px] font-bold"
                  style={{ color: def.accentColor }}
                  title={skillDesc}
                >
                  {skillName}
                </span>
                {([0, 1, 2] as const).map((slotIdx) => {
                  const equippedHere = slots[slotIdx]?.skillId === skillId;
                  return (
                    <PanelButton
                      key={slotIdx}
                      label={`→${slotIdx + 1}`}
                      title={t('trainingPanel.equipToSlotTitle', { n: slotIdx + 1 })}
                      active={equippedHere}
                      onClick={() => onEquipSkill(slotIdx, skillId)}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </section>

      {/* --- Pasivas: nivel directo 0..3 sin farmear EXP --- */}
      <section className="mb-3">
        <SectionTitle>{t('trainingPanel.passivesSection')}</SectionTitle>
        <div className="flex flex-col gap-1">
          {PASSIVE_IDS.map((passiveId) => {
            const def = PASSIVES_CATALOG[passiveId];
            const level = passiveLevels[passiveId];
            const passiveKey = SKILL_I18N_KEYS[passiveId];
            const passiveName = t(`skills.${passiveKey}`);
            const passiveDesc = level > 0 ? t(`skillDescriptions.${passiveKey}${level}`) : t('trainingPanel.noLevel');
            return (
              <div key={passiveId} className="flex items-center gap-1">
                <span
                  className="min-w-0 flex-1 truncate text-[10px] font-bold"
                  style={{ color: def.accentColor }}
                  title={passiveDesc}
                >
                  {passiveName}
                </span>
                {Array.from({ length: def.maxLevel + 1 }, (_, lv) => (
                  <PanelButton
                    key={lv}
                    label={String(lv)}
                    title={lv === 0 ? t('trainingPanel.disabled') : def.levels[lv - 1].label}
                    active={level === lv}
                    accent="violet"
                    onClick={() => onSetPassiveLevel(passiveId, lv)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </section>

      {/* --- Extras de entrenamiento --- */}
      <section>
        <SectionTitle>{t('trainingPanel.extrasSection')}</SectionTitle>
        <PanelButton
          label={t('trainingPanel.refillButton')}
          accent="amber"
          active
          onClick={onRefill}
          className="w-full"
        />
        <p className="mt-1.5 text-[9px] leading-relaxed font-semibold tracking-[0.04em] text-white/45">
          {t('trainingPanel.footerNote')}
        </p>
      </section>
    </aside>
  );
}
