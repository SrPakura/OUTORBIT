import { TUTORIAL_SPECS, type TutorialId } from '@/game/levels/tutorialDefinitions';
import { GAME_CONSTANTS } from '@/game/types';
import MenuModalShell from '@/ui/MenuModalShell';

interface TutorialsModalProps {
  onClose: () => void;
  onStartTutorial: (id: TutorialId) => void;
}

/**
 * Selector de tutoriales: las 5 lecciones jugables de la Fase B con su orden,
 * personaje recomendado y resumen de una línea. Cada tarjeta lanza el
 * mini-nivel directamente.
 */
export default function TutorialsModal({ onClose, onStartTutorial }: TutorialsModalProps) {
  return (
    <MenuModalShell
      title="TUTORIALES"
      subtitle="Una mecánica por nivel · 5 lecciones jugables"
      accent="#a78bfa"
      onClose={onClose}
    >
      <div className="grid gap-3">
        {TUTORIAL_SPECS.map((spec) => {
          const character = GAME_CONSTANTS.CHARACTERS[spec.recommendedCharacter];
          return (
            <article
              key={spec.id}
              className="flex flex-col gap-3 rounded-xl border-2 border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center"
            >
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2 border-[#0b0b14] text-lg font-black text-[#05010f]"
                style={{ backgroundColor: character.accentColor }}
              >
                {spec.order}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-black tracking-[0.04em] text-white">{spec.title}</h3>
                  <span
                    className="rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em]"
                    style={{
                      borderColor: character.accentColor,
                      color: character.accentColor,
                    }}
                  >
                    {character.displayName}
                  </span>
                  <span className="rounded-full border border-white/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-slate-300">
                    {spec.badge}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{spec.summary}</p>
              </div>

              <button
                type="button"
                onClick={() => onStartTutorial(spec.id)}
                className="shrink-0 cursor-pointer rounded-lg border-2 border-[#0b0b14] bg-gradient-to-r from-violet-400 to-cyan-400 px-4 py-2 text-[10px] font-black tracking-[0.16em] text-[#05010f] shadow-[4px_4px_0_#0b0b14] transition-transform hover:-translate-y-0.5 active:translate-y-0"
              >
                JUGAR TUTORIAL
              </button>
            </article>
          );
        })}
      </div>
    </MenuModalShell>
  );
}
