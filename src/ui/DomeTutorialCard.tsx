import { useEffect, useRef, useState } from 'react';
import type { TutorialProgressId } from '@/game/localStorageState';
import { readConnectedGamepad } from '@/game/input/GamepadInput';
import { useI18n } from '@/i18n';

const CONTINUE_LOCK_MS = 4000;

export interface DomeTutorialCardProps {
  tutorialId: TutorialProgressId | null;
  onDismiss: () => void;
}

/**
 * Tarjeta cómic de tutorial sobre la Cúpula: papel #f1f1ed con trama halftone,
 * tinta #0b0d12, doble marco desplazado cian/ámbar y diagrama vectorial limpio.
 * Incluye bloqueo inicial de 4 s para asegurar la lectura y se descarta con
 * ESPACIO, ENTER, clic en el botón o Cruz/A del mando.
 */
export function DomeTutorialCard({ tutorialId, onDismiss }: DomeTutorialCardProps) {
  const { t } = useI18n();
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const [remainingMs, setRemainingMs] = useState<number>(tutorialId ? CONTINUE_LOCK_MS : 0);
  const unlocked = remainingMs <= 0;
  const unlockedRef = useRef(unlocked);
  unlockedRef.current = unlocked;

  // Cuenta atrás de 4 s al abrir cada tutorial.
  useEffect(() => {
    if (!tutorialId) {
      setRemainingMs(0);
      return;
    }
    const start = performance.now();
    setRemainingMs(CONTINUE_LOCK_MS);
    const interval = window.setInterval(() => {
      const left = Math.max(0, CONTINUE_LOCK_MS - (performance.now() - start));
      setRemainingMs(left);
      if (left <= 0) {
        window.clearInterval(interval);
      }
    }, 50);
    return () => window.clearInterval(interval);
  }, [tutorialId]);

  // Atajo de teclado: ESPACIO / ENTER para continuar (tras el lock de 4 s).
  useEffect(() => {
    if (!tutorialId) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        if (unlockedRef.current) {
          onDismissRef.current();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [tutorialId]);

  // Atajo de mando: botón Cruz/A (índice 0) para continuar (tras el lock de 4 s).
  useEffect(() => {
    if (!tutorialId) return;
    let rafId = 0;
    let prevPressed = true; // evita disparar si ya venía pulsado al abrir
    const poll = (): void => {
      const pad = readConnectedGamepad();
      const pressed = Boolean(pad?.buttons[0]?.pressed);
      if (pressed && !prevPressed && unlockedRef.current) {
        onDismissRef.current();
        return;
      }
      prevPressed = pressed;
      rafId = requestAnimationFrame(poll);
    };
    rafId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafId);
  }, [tutorialId]);

  if (!tutorialId) return null;

  const remainingSec = Math.ceil(remainingMs / 1000);
  const lockProgressPct = Math.min(100, Math.max(0, ((CONTINUE_LOCK_MS - remainingMs) / CONTINUE_LOCK_MS) * 100));

  return (
    <div className="dtut-overlay" role="dialog" aria-modal="true" aria-labelledby="dtut-title">
      {tutorialId === 'tutorial_de_rebotes' && (
        <div className="dtut-reticle-spotlight" aria-hidden="true">
          <div className="dtut-reticle-spotlight__ring" />
          <div className="dtut-reticle-spotlight__ring dtut-reticle-spotlight__ring--outer" />
        </div>
      )}
      <div className={`dtut-stage${tutorialId === 'tutorial_de_habilidades' ? ' dtut-stage--wide' : ''}`}>
        {/* Marcos desplazados cómic (ámbar atrás, cian en medio) */}
        <div className="dtut-frame dtut-frame--amber" aria-hidden="true" />
        <div className="dtut-frame dtut-frame--cyan" aria-hidden="true" />

        <article className="dtut-card">
          {/* Trama halftone sutil */}
          <div className="dtut-halftone" aria-hidden="true" />

          {/* Cabecera: pestaña sesgada TUTORIAL + número fantasma 01 */}
          <header className="dtut-head">
            <span className="dtut-badge">
              <span>{t('domeTutorial.badge')}</span>
            </span>
            <span className="dtut-num" aria-hidden="true">
              {t(`domeTutorial.${tutorialId}.number`)}
            </span>
          </header>

          {/* Diagrama visual */}
          <div className="dtut-diagram" aria-hidden="true">
            {tutorialId === 'tutorial_de_movimiento' ? (
              <>
                <div className="dtut-orbit-ring">
                  <div className="dtut-orbit-arc dtut-orbit-arc--top" />
                  <div className="dtut-orbit-arc dtut-orbit-arc--bottom" />

                  <div className="dtut-controls-visual">
                    {/* Bloque teclado: 1 2 3 + WASD + ESPACIO */}
                    <div className="dtut-kbd-group">
                      <div className="dtut-num-row">
                        <span className="dtut-key dtut-key--skill">1</span>
                        <span className="dtut-key dtut-key--skill">2</span>
                        <span className="dtut-key dtut-key--skill">3</span>
                      </div>
                      <div className="dtut-wasd">
                        <span className="dtut-key dtut-key--w">W</span>
                        <span className="dtut-key dtut-key--a">A</span>
                        <span className="dtut-key dtut-key--s">S</span>
                        <span className="dtut-key dtut-key--d">D</span>
                      </div>
                      <div className="dtut-space-key">{t('domeTutorial.tutorial_de_movimiento.spaceLabel')}</div>
                    </div>

                    {/* Ratón SVG con clic izquierdo (carmesí) y clic derecho (cian) */}
                    <svg
                      className="dtut-mouse-svg"
                      viewBox="0 0 64 92"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <rect
                        x="6"
                        y="6"
                        width="52"
                        height="80"
                        rx="24"
                        fill="#ffffff"
                        stroke="#0b0d12"
                        strokeWidth="4"
                      />
                      <path
                        d="M8 30C8 17.85 17.85 8 30 8H31V38H8V30Z"
                        fill="#e11d48"
                        stroke="#0b0d12"
                        strokeWidth="3"
                      />
                      <path
                        d="M33 8H34C46.15 8 56 17.85 56 30V38H33V8Z"
                        fill="#22d3ee"
                        stroke="#0b0d12"
                        strokeWidth="3"
                      />
                      <line x1="8" y1="38" x2="56" y2="38" stroke="#0b0d12" strokeWidth="3.5" />
                      <rect
                        x="28"
                        y="17"
                        width="8"
                        height="15"
                        rx="4"
                        fill="#0b0d12"
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      />
                    </svg>
                  </div>
                </div>

                {/* Leyenda compacta de chips */}
                <div className="dtut-legend">
                  <span className="dtut-chip dtut-chip--ink">
                    {t('domeTutorial.tutorial_de_movimiento.wasdLabel')} · {t('domeTutorial.tutorial_de_movimiento.legendMove')}
                  </span>
                  <span className="dtut-chip dtut-chip--amber">
                    {t('domeTutorial.tutorial_de_movimiento.spaceLabel')} · {t('domeTutorial.tutorial_de_movimiento.legendBrake')}
                  </span>
                  <span className="dtut-chip dtut-chip--crimson">
                    {t('domeTutorial.tutorial_de_movimiento.attackLabel')} · {t('domeTutorial.tutorial_de_movimiento.legendAttack')}
                  </span>
                  <span className="dtut-chip dtut-chip--cyan">
                    {t('domeTutorial.tutorial_de_movimiento.dashLabel')} · {t('domeTutorial.tutorial_de_movimiento.legendDash')}
                  </span>
                  <span className="dtut-chip dtut-chip--violet">
                    {t('domeTutorial.tutorial_de_movimiento.skillsLabel')} · {t('domeTutorial.tutorial_de_movimiento.legendSkills')}
                  </span>
                </div>
              </>
            ) : tutorialId === 'tutorial_de_rebotes' ? (
              <>
                <div className="dtut-orbit-ring dtut-orbit-ring--cyan">
                  <div className="dtut-orbit-arc dtut-orbit-arc--top" />
                  <div className="dtut-orbit-arc dtut-orbit-arc--bottom" />

                  <div className="dtut-controls-visual">
                    {/* Mira azul (heptágono + estrella 4 puntas cian) */}
                    <svg
                      className="dtut-reticle-svg"
                      viewBox="0 0 96 96"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <polygon
                        points="48,6 79,21 88,54 67,84 29,84 8,54 17,21"
                        fill="#0b0d12"
                        fillOpacity="0.88"
                        stroke="#22d3ee"
                        strokeWidth="3.5"
                      />
                      <path
                        d="M48 15 L55 41 L81 48 L55 55 L48 81 L41 55 L15 48 L41 41 Z"
                        fill="#38bdf8"
                        fillOpacity="0.28"
                        stroke="#38bdf8"
                        strokeWidth="3"
                        strokeLinejoin="round"
                      />
                    </svg>

                    {/* Ratón SVG con clic derecho destacado en azul/cian */}
                    <svg
                      className="dtut-mouse-svg"
                      viewBox="0 0 64 92"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <rect
                        x="6"
                        y="6"
                        width="52"
                        height="80"
                        rx="24"
                        fill="#ffffff"
                        stroke="#0b0d12"
                        strokeWidth="4"
                      />
                      <path
                        d="M8 30C8 17.85 17.85 8 30 8H31V38H8V30Z"
                        fill="#e2e8f0"
                        stroke="#0b0d12"
                        strokeWidth="3"
                      />
                      <path
                        d="M33 8H34C46.15 8 56 17.85 56 30V38H33V8Z"
                        fill="#22d3ee"
                        stroke="#0b0d12"
                        strokeWidth="3"
                      />
                      <line x1="8" y1="38" x2="56" y2="38" stroke="#0b0d12" strokeWidth="3.5" />
                      <rect
                        x="28"
                        y="17"
                        width="8"
                        height="15"
                        rx="4"
                        fill="#0b0d12"
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      />
                    </svg>
                  </div>
                </div>

                <div className="dtut-legend">
                  <span className="dtut-chip dtut-chip--cyan">
                    {t('domeTutorial.tutorial_de_rebotes.reticleLabel')} · {t('domeTutorial.tutorial_de_rebotes.legendReticle')}
                  </span>
                  <span className="dtut-chip dtut-chip--ink">
                    {t('domeTutorial.tutorial_de_rebotes.dashLabel')} · {t('domeTutorial.tutorial_de_rebotes.legendBounce')}
                  </span>
                </div>
              </>
            ) : tutorialId === 'tutorial_de_slow_mo' ? (
              <>
                <div className="dtut-orbit-ring">
                  <div className="dtut-orbit-arc dtut-orbit-arc--top" />
                  <div className="dtut-orbit-arc dtut-orbit-arc--bottom" />

                  <div className="dtut-controls-visual">
                    {/* Cronómetro / Dilatación temporal SVG */}
                    <svg
                      className="dtut-slowmo-svg"
                      viewBox="0 0 96 96"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      {/* Corona superior */}
                      <rect
                        x="40"
                        y="6"
                        width="16"
                        height="8"
                        rx="2"
                        fill="#fbbf24"
                        stroke="#0b0d12"
                        strokeWidth="3"
                      />
                      {/* Esfera exterior */}
                      <circle
                        cx="48"
                        cy="52"
                        r="34"
                        fill="#0b0d12"
                        stroke="#22d3ee"
                        strokeWidth="3.5"
                      />
                      {/* Arco de tiempo dilatado */}
                      <path
                        d="M48 24 A28 28 0 1 1 23 64"
                        stroke="#e11d48"
                        strokeWidth="5"
                        strokeLinecap="round"
                      />
                      {/* Manecillas */}
                      <line
                        x1="48"
                        y1="52"
                        x2="48"
                        y2="31"
                        stroke="#fbbf24"
                        strokeWidth="4"
                        strokeLinecap="round"
                      />
                      <line
                        x1="48"
                        y1="52"
                        x2="65"
                        y2="60"
                        stroke="#ffffff"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                      />
                      <circle cx="48" cy="52" r="4.5" fill="#22d3ee" />
                    </svg>

                    <div className="dtut-slowmo-badge">
                      {t('domeTutorial.tutorial_de_slow_mo.badgeTime')}
                    </div>
                  </div>
                </div>

                <div className="dtut-legend">
                  <span className="dtut-chip dtut-chip--crimson">
                    {t('domeTutorial.tutorial_de_slow_mo.chipParry')}
                  </span>
                  <span className="dtut-chip dtut-chip--cyan">
                    {t('domeTutorial.tutorial_de_slow_mo.chipDodge')}
                  </span>
                  <span className="dtut-chip dtut-chip--amber">
                    {t('domeTutorial.tutorial_de_slow_mo.chipSpecial')}
                  </span>
                </div>
              </>
            ) : (
              <div className="dtut-skills-guide">
                <div className="dtut-skills-subtitle">{t('domeTutorial.tutorial_de_habilidades.statesTitle')}</div>
                <div className="dtut-states-grid">
                  <div className="dtut-state-row">
                    <span className="dtut-slot-dot dtut-slot-dot--ready" />
                    <span>{t('domeTutorial.tutorial_de_habilidades.stateReady')}</span>
                  </div>
                  <div className="dtut-state-row">
                    <span className="dtut-slot-dot dtut-slot-dot--active" />
                    <span>{t('domeTutorial.tutorial_de_habilidades.stateActive')}</span>
                  </div>
                  <div className="dtut-state-row">
                    <span className="dtut-slot-dot dtut-slot-dot--cd" />
                    <span>{t('domeTutorial.tutorial_de_habilidades.stateCooldown')}</span>
                  </div>
                  <div className="dtut-state-row">
                    <span className="dtut-slot-dot dtut-slot-dot--empty" />
                    <span>{t('domeTutorial.tutorial_de_habilidades.stateEmpty')}</span>
                  </div>
                </div>

                <div className="dtut-skills-subtitle">{t('domeTutorial.tutorial_de_habilidades.skillsTitle')}</div>
                <div className="dtut-skills-list">
                  {[
                    ['gravity_field', 's1'],
                    ['repulse_push', 's2'],
                    ['eden_absorb', 's3'],
                    ['attraction_well', 's4'],
                    ['bounce_horizon', 's5'],
                    ['black_hole', 's6'],
                    ['implosion', 's7'],
                  ].map(([iconId, key]) => (
                    <div key={key} className="dtut-skill-item">
                      <img src={`/icons/skills/${iconId}.webp`} alt="" className="dtut-skill-mini-icon" />
                      <span>{t(`domeTutorial.tutorial_de_habilidades.${key}`)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Título + explicación */}
          <div className="dtut-body">
            <h2 id="dtut-title" className="dtut-title">
              {t(`domeTutorial.${tutorialId}.title`)}
            </h2>
            <p className="dtut-copy">{t(`domeTutorial.${tutorialId}.paragraph1`)}</p>
            <p className="dtut-copy">{t(`domeTutorial.${tutorialId}.paragraph2`)}</p>
          </div>

          {/* Botón Continuar (bloqueado 4 s para asegurar lectura) */}
          <footer className="dtut-foot">
            <button
              type="button"
              className={`dtut-continue${unlocked ? '' : ' is-locked'}`}
              disabled={!unlocked}
              onClick={() => {
                if (unlocked) onDismiss();
              }}
            >
              <span
                className="dtut-continue__bar"
                style={{ width: `${lockProgressPct}%` }}
                aria-hidden="true"
              />
              <span className="dtut-continue__key">
                {unlocked ? `[${t('domeTutorial.continueKey')}]` : `[${remainingSec}s]`}
              </span>
              <span className="dtut-continue__label">{t('domeTutorial.continueAction')}</span>
            </button>
          </footer>
        </article>
      </div>

      <style>{`
        .dtut-overlay {
          position: fixed;
          inset: 0;
          z-index: 45;
          pointer-events: auto;
          background: radial-gradient(circle at 30% 50%, rgba(4, 5, 16, 0.18), rgba(4, 5, 16, 0.58) 72%);
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding: 24px clamp(20px, 4.5vw, 68px);
          animation: dtut-fade-in 200ms ease-out;
        }

        @keyframes dtut-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .dtut-reticle-spotlight {
          position: fixed;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 140px;
          height: 140px;
          pointer-events: none;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .dtut-reticle-spotlight__ring {
          position: absolute;
          inset: 14px;
          border-radius: 999px;
          border: 3px solid #38bdf8;
          box-shadow: 0 0 24px rgba(56, 189, 248, 0.75), inset 0 0 18px rgba(56, 189, 248, 0.35);
          animation: dtut-pulse 1.35s ease-in-out infinite;
        }
        .dtut-reticle-spotlight__ring--outer {
          inset: 0;
          border-width: 2px;
          border-style: dashed;
          border-color: #22d3ee;
          box-shadow: none;
          animation: dtut-spin 8s linear infinite;
        }
        @keyframes dtut-pulse {
          0%, 100% { transform: scale(0.95); opacity: 0.9; }
          50% { transform: scale(1.06); opacity: 1; }
        }
        @keyframes dtut-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .dtut-reticle-svg {
          width: 82px;
          height: 82px;
          filter: drop-shadow(3px 3px 0 #0b0d12);
        }

        .dtut-slowmo-svg {
          width: 82px;
          height: 82px;
          filter: drop-shadow(3px 3px 0 #0b0d12);
        }
        .dtut-slowmo-badge {
          background: #0b0d12;
          color: #22d3ee;
          border: 2.5px solid #0b0d12;
          box-shadow: 3px 3px 0 #fbbf24;
          padding: 6px 10px;
          transform: skewX(-10deg);
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.1em;
        }

        .dtut-stage {
          position: relative;
          width: min(440px, 92vw);
          animation: dtut-slide-in 240ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .dtut-stage--wide {
          width: min(560px, 94vw);
        }

        @keyframes dtut-slide-in {
          from { opacity: 0; transform: translateX(28px) scale(0.97); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }

        .dtut-frame {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .dtut-frame--amber {
          border: 4px solid #fbbf24;
          transform: translate(11px, 11px);
        }
        .dtut-frame--cyan {
          border: 4px solid #22d3ee;
          transform: translate(5px, 5px);
        }

        .dtut-card {
          position: relative;
          background: #f1f1ed;
          color: #0b0d12;
          border: 3.5px solid #0b0d12;
          box-shadow: 8px 8px 0 #0b0d12;
          padding: 22px 24px 20px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .dtut-halftone {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.22;
          background-image: radial-gradient(#94a3b8 1.2px, transparent 1.2px);
          background-size: 12px 12px;
        }

        .dtut-head {
          position: relative;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          min-height: 44px;
        }

        .dtut-badge {
          display: inline-flex;
          align-items: center;
          background: #fbbf24;
          color: #0b0d12;
          border: 2.5px solid #0b0d12;
          box-shadow: 3px 3px 0 #0b0d12;
          padding: 4px 14px;
          transform: skewX(-12deg) translate(-8px, -4px);
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.22em;
        }
        .dtut-badge > span {
          transform: skewX(12deg);
        }

        .dtut-num {
          position: absolute;
          right: -2px;
          top: -12px;
          font-size: 56px;
          font-weight: 900;
          font-style: italic;
          line-height: 1;
          color: transparent;
          -webkit-text-stroke: 2px rgba(11, 13, 18, 0.16);
          user-select: none;
        }

        .dtut-diagram {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }

        .dtut-orbit-ring {
          position: relative;
          width: 214px;
          height: 148px;
          border-radius: 999px;
          border: 2px solid rgba(11, 13, 18, 0.16);
          background: radial-gradient(circle, rgba(255, 255, 255, 0.85) 0%, rgba(241, 241, 237, 0.2) 72%);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .dtut-orbit-arc {
          position: absolute;
          inset: -3px;
          border-radius: 999px;
          border: 3.5px solid transparent;
          pointer-events: none;
        }
        .dtut-orbit-arc--top {
          border-top-color: #22d3ee;
          transform: rotate(-16deg);
        }
        .dtut-orbit-arc--bottom {
          border-bottom-color: #e11d48;
          transform: rotate(-12deg);
        }

        .dtut-controls-visual {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .dtut-kbd-group {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }

        .dtut-wasd {
          display: grid;
          grid-template-columns: repeat(3, 28px);
          grid-template-rows: repeat(2, 26px);
          gap: 4px;
        }
        .dtut-key {
          display: flex;
          align-items: center;
          justify-content: center;
          background: #ffffff;
          border: 2.5px solid #0b0d12;
          box-shadow: 2px 2px 0 #0b0d12;
          border-radius: 5px;
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-size: 12px;
          font-weight: 900;
          color: #0b0d12;
        }
        .dtut-key--w { grid-column: 2; grid-row: 1; }
        .dtut-key--a { grid-column: 1; grid-row: 2; }
        .dtut-key--s { grid-column: 2; grid-row: 2; }
        .dtut-key--d { grid-column: 3; grid-row: 2; }

        .dtut-space-key {
          width: 92px;
          height: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #fbbf24;
          border: 2.5px solid #0b0d12;
          box-shadow: 2px 2px 0 #0b0d12;
          border-radius: 5px;
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.12em;
          color: #0b0d12;
        }

        .dtut-mouse-svg {
          width: 52px;
          height: 76px;
          filter: drop-shadow(3px 3px 0 #0b0d12);
        }

        .dtut-legend {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 6px;
        }

        .dtut-chip {
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-size: 9.5px;
          font-weight: 900;
          letter-spacing: 0.08em;
          padding: 3px 7px;
          border: 2px solid #0b0d12;
          background: #ffffff;
          color: #0b0d12;
        }
        .dtut-chip--amber { background: #fef3c7; }
        .dtut-chip--crimson { background: #ffe4e6; border-color: #e11d48; color: #9f1239; }
        .dtut-num-row {
          display: flex;
          gap: 4px;
        }
        .dtut-key--skill {
          width: 28px;
          height: 22px;
          background: #ede9fe;
          border-color: #7c3aed;
          color: #4c1d95;
          font-size: 11px;
        }
        .dtut-chip--cyan { background: #cffafe; border-color: #0891b2; color: #155e75; }
        .dtut-chip--violet { background: #ede9fe; border-color: #7c3aed; color: #4c1d95; }

        .dtut-skills-guide {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 7px;
          text-align: left;
        }
        .dtut-skills-subtitle {
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.1em;
          color: #0b0d12;
          text-transform: uppercase;
        }
        .dtut-states-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 4px;
        }
        .dtut-state-row {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 11px;
          font-weight: 700;
          color: #1e293b;
          background: #ffffff;
          border: 1.5px solid #0b0d12;
          padding: 3px 6px;
        }
        .dtut-slot-dot {
          width: 13px;
          height: 13px;
          border-radius: 999px;
          flex-shrink: 0;
          background: #090418;
        }
        .dtut-slot-dot--ready {
          border: 3px solid #818cf8;
          box-shadow: 0 0 6px #22d3ee;
        }
        .dtut-slot-dot--active {
          border: 3px solid #00e5ff;
          box-shadow: 0 0 8px #00e5ff;
          background: #0f2d46;
        }
        .dtut-slot-dot--cd {
          border: 3px dashed rgba(148, 163, 184, 0.7);
          opacity: 0.65;
        }
        .dtut-slot-dot--empty {
          border: 2px solid rgba(148, 163, 184, 0.4);
          opacity: 0.35;
        }
        .dtut-skills-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
          max-height: 185px;
          overflow-y: auto;
          padding-right: 4px;
        }
        .dtut-skill-item {
          display: flex;
          align-items: flex-start;
          gap: 7px;
          font-size: 11px;
          line-height: 1.32;
          font-weight: 600;
          color: #0b0d12;
          background: #ffffff;
          border: 1.5px solid rgba(11, 13, 18, 0.25);
          padding: 4px 6px;
        }
        .dtut-skill-mini-icon {
          width: 18px;
          height: 18px;
          object-fit: contain;
          background: #090418;
          border-radius: 999px;
          padding: 2px;
          flex-shrink: 0;
          filter: invert(1);
        }

        .dtut-body {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .dtut-title {
          margin: 0;
          font-size: 28px;
          font-weight: 900;
          font-style: italic;
          letter-spacing: -0.02em;
          line-height: 1.05;
          color: #0b0d12;
          text-transform: uppercase;
        }

        .dtut-copy {
          margin: 0;
          font-size: 13.5px;
          line-height: 1.48;
          font-weight: 600;
          color: #1e293b;
        }

        .dtut-foot {
          position: relative;
          display: flex;
          justify-content: flex-end;
          padding-top: 4px;
        }

        .dtut-continue {
          position: relative;
          overflow: hidden;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #0b0d12;
          color: #f1f1ed;
          border: 2.5px solid #0b0d12;
          box-shadow: 4px 4px 0 #22d3ee;
          padding: 9px 16px;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.06em;
          transition: transform 120ms ease, box-shadow 120ms ease, background-color 120ms ease, opacity 120ms ease;
        }
        .dtut-continue.is-locked {
          cursor: not-allowed;
          background: #334155;
          box-shadow: 4px 4px 0 #94a3b8;
          opacity: 0.85;
        }
        .dtut-continue__bar {
          position: absolute;
          left: 0;
          bottom: 0;
          height: 3px;
          background: #22d3ee;
          transition: width 60ms linear;
          pointer-events: none;
        }
        .dtut-continue:not(.is-locked):hover {
          transform: translate(-2px, -2px);
          box-shadow: 6px 6px 0 #e11d48;
          background: #111827;
        }
        .dtut-continue:not(.is-locked):active {
          transform: translate(1px, 1px);
          box-shadow: 2px 2px 0 #22d3ee;
        }
        .dtut-continue__key {
          position: relative;
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-weight: 900;
          color: #fbbf24;
        }
        .dtut-continue__label {
          position: relative;
          text-transform: uppercase;
        }
      `}</style>
    </div>
  );
}

export default DomeTutorialCard;
