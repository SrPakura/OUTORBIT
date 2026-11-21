import { GAME_CONSTANTS, type CharacterId, type HudSnapshot } from '@/game/types';

const SQUADRON: CharacterId[] = ['kitsune', 'digger', 'axel'];

function formatTime(totalSec: number): string {
  const minutes = Math.floor(totalSec / 60);
  const seconds = Math.floor(totalSec % 60);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

interface GameHUDProps {
  snapshot: HudSnapshot;
  onResume: () => void;
  onExitToTitle: () => void;
}

/**
 * HUD del Hito 2: barra superior (planeta, objetivos, reloj), selector de
 * escuadrón, HP, indicadores de Estasis (0/4), Disfraz, Subsuelo, Nado,
 * ventana de Parry y cooldown del Ancla, prompt contextual de interacción,
 * transición de planeta y pantallas de pausa/game over/victoria.
 */
export default function GameHUD({ snapshot, onResume, onExitToTitle }: GameHUDProps) {
  const shifting = snapshot.isGravityShifting;
  const anchorReady = 1 - snapshot.anchorCooldownRatio;
  const gravityReady = 1 - (snapshot.gravityShiftCooldownRatio ?? 0);

  return (
    <div className="pointer-events-none fixed inset-0 select-none font-sans text-slate-100">
      {/* --- Barra superior --- */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-4">
        <div className="rounded-lg border-2 border-black bg-[#160b2e]/85 px-4 py-2 shadow-[4px_4px_0_#000]">
          <p className="text-[10px] font-bold tracking-[0.25em] text-violet-300">
            PLANETA
          </p>
          <p className="text-sm font-black">{snapshot.activePlanetName}</p>
        </div>

        <div className="max-w-md flex-1 rounded-lg border-2 border-black bg-[#160b2e]/85 px-4 py-2 shadow-[4px_4px_0_#000]">
          <p className="mb-1 text-[10px] font-bold tracking-[0.25em] text-violet-300">
            OBJETIVOS — {snapshot.levelTitle}
          </p>
          <ul className="space-y-0.5">
            {snapshot.objectives.map((objective) => (
              <li
                key={objective.id}
                className={`text-[11px] font-semibold leading-tight ${
                  objective.completed ? 'text-emerald-400 line-through' : 'text-slate-200'
                }`}
              >
                {objective.completed ? '[OK]' : `[${objective.currentCount}/${objective.targetCount}]`}{' '}
                {objective.description}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border-2 border-black bg-[#160b2e]/85 px-4 py-2 text-right shadow-[4px_4px_0_#000]">
          <p className="text-[10px] font-bold tracking-[0.25em] text-violet-300">
            TIEMPO
          </p>
          <p className="font-mono text-sm font-black tabular-nums">
            {formatTime(snapshot.elapsedRunSec)}
          </p>
        </div>
      </div>

      {/* --- Esquina inferior izquierda: HP, escuadrón e indicadores --- */}
      <div className="absolute bottom-4 left-4 space-y-2">
        <div className="flex items-center gap-2 rounded-lg border-2 border-black bg-[#160b2e]/85 px-3 py-2 shadow-[4px_4px_0_#000]">
          <span className="text-[10px] font-black tracking-[0.2em] text-red-400">HP</span>
          <span className="flex gap-1">
            {Array.from({ length: snapshot.maxHp }, (_, i) => (
              <span
                key={i}
                className={`h-3.5 w-3.5 rounded-full border-2 border-black ${
                  i < snapshot.hp ? 'bg-red-500' : 'bg-slate-700'
                }`}
              />
            ))}
          </span>
        </div>

        <div className="flex gap-2">
          {SQUADRON.map((id) => {
            const profile = GAME_CONSTANTS.CHARACTERS[id];
            const active = snapshot.activeCharacter === id;
            return (
              <div
                key={id}
                className={`rounded-lg border-2 px-3 py-1.5 shadow-[3px_3px_0_#000] transition-all ${
                  active
                    ? 'border-black bg-black/40 scale-105'
                    : 'border-black/60 bg-[#160b2e]/70 opacity-70'
                }`}
                style={active ? { outline: `2px solid ${profile.accentColor}` } : undefined}
              >
                <p className="text-[10px] font-black" style={{ color: profile.accentColor }}>
                  [{profile.keySlot}] {profile.displayName.toUpperCase()}
                </p>
              </div>
            );
          })}
        </div>

        {/* --- Estasis (0/4) + cooldown del Ancla y del Gravity Shift --- */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-black bg-[#160b2e]/85 px-3 py-2 shadow-[4px_4px_0_#000]">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-black tracking-[0.2em] text-cyan-300">
              ESTASIS
            </span>
            <span className="flex gap-1">
              {Array.from({ length: GAME_CONSTANTS.MAX_STASIS_OBJECTS }, (_, i) => (
                <span
                  key={i}
                  className={`h-2.5 w-2.5 rounded-full border border-black ${
                    i < snapshot.stasisHeldCount ? 'bg-cyan-400' : 'bg-slate-700'
                  }`}
                />
              ))}
            </span>
            <span className="font-mono text-[10px] font-black text-cyan-200">
              {snapshot.stasisHeldCount}/{GAME_CONSTANTS.MAX_STASIS_OBJECTS}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-black tracking-[0.2em] text-yellow-300">
              ANCLA
            </span>
            <span className="h-2.5 w-14 overflow-hidden rounded-full border border-black bg-slate-700">
              <span
                className={`block h-full ${anchorReady >= 1 ? 'bg-yellow-300' : 'bg-yellow-600'}`}
                style={{ width: `${Math.round(anchorReady * 100)}%` }}
              />
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-black tracking-[0.2em] text-violet-300">
              GRAV.
            </span>
            <span className="h-2.5 w-14 overflow-hidden rounded-full border border-black bg-slate-700">
              <span
                className={`block h-full ${gravityReady >= 1 ? 'bg-violet-400' : 'bg-violet-800'}`}
                style={{ width: `${Math.round(gravityReady * 100)}%` }}
              />
            </span>
          </div>
        </div>

        {/* --- Badges de estado --- */}
        <div className="flex flex-wrap gap-2">
          {snapshot.isDisguised && (
            <span className="rounded-lg border-2 border-black bg-violet-500/90 px-3 py-1 text-[10px] font-black tracking-[0.2em] text-white shadow-[3px_3px_0_#000]">
              DISFRAZADO
            </span>
          )}
          {snapshot.isBurrowing && (
            <span className="rounded-lg border-2 border-black bg-yellow-500/90 px-3 py-1 text-[10px] font-black tracking-[0.2em] text-black shadow-[3px_3px_0_#000]">
              SUBSUELO
            </span>
          )}
          {snapshot.isSwimming && (
            <span className="rounded-lg border-2 border-black bg-cyan-400/90 px-3 py-1 text-[10px] font-black tracking-[0.2em] text-black shadow-[3px_3px_0_#000]">
              NADO
            </span>
          )}
          {snapshot.globalAlert && (
            <span className="animate-pulse rounded-lg border-2 border-black bg-red-600/90 px-3 py-1 text-[10px] font-black tracking-[0.2em] text-white shadow-[3px_3px_0_#000]">
              ¡ALERTA!
            </span>
          )}
        </div>
      </div>

      {/* --- Esquina inferior derecha: guía de controles --- */}
      <div className="absolute bottom-4 right-4 rounded-lg border-2 border-black bg-[#160b2e]/85 px-4 py-3 text-[10px] font-semibold leading-relaxed text-slate-300 shadow-[4px_4px_0_#000]">
        <p>
          <span className="text-yellow-300">WASD</span> Mover ·{' '}
          <span className="text-yellow-300">ESPACIO</span> Salto/Ancla (aire)
        </p>
        <p>
          <span className="text-yellow-300">SHIFT</span> Sprint/Subsuelo (Digger) ·{' '}
          <span className="text-yellow-300">1/2/3</span> Escuadrón
        </p>
        <p>
          <span className="text-yellow-300">R/C</span> Capturar Estasis ·{' '}
          <span className="text-yellow-300">CLIC IZQ.</span> Disparar 1
        </p>
        <p>
          <span className="text-yellow-300">TAB/V</span> + <span className="text-yellow-300">←/→</span>{' '}
          Lock-On · <span className="text-yellow-300">CLIC DER.</span> Shift/Dash
        </p>
        <p>
          <span className="text-yellow-300">E</span> Noquear ·{' '}
          <span className="text-yellow-300">F/Q</span> Parry ·{' '}
          <span className="text-yellow-300">RUEDA</span> Zoom
        </p>
      </div>

      {/* --- Prompt contextual de interacción --- */}
      {snapshot.interactionPrompt && snapshot.phase === 'playing' && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2">
          <p className="rounded-lg border-2 border-yellow-300 bg-black/75 px-4 py-1.5 text-xs font-black tracking-widest text-yellow-200 shadow-[4px_4px_0_#000]">
            {snapshot.interactionPrompt}
          </p>
        </div>
      )}

      {/* --- Mira central --- */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div
          className={`relative h-6 w-6 transition-colors ${shifting ? 'text-cyan-300' : 'text-white/70'}`}
        >
          <span className="absolute left-1/2 top-0 h-2 w-0.5 -translate-x-1/2 bg-current" />
          <span className="absolute left-1/2 bottom-0 h-2 w-0.5 -translate-x-1/2 bg-current" />
          <span className="absolute top-1/2 left-0 h-0.5 w-2 -translate-y-1/2 bg-current" />
          <span className="absolute top-1/2 right-0 h-0.5 w-2 -translate-y-1/2 bg-current" />
        </div>
      </div>

      {/* --- Marcador Lock-On proyectado en pantalla --- */}
      {snapshot.phase === 'playing' &&
        snapshot.lockOnActive &&
        snapshot.lockOnScreenX != null &&
        snapshot.lockOnScreenY != null && (
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${((snapshot.lockOnScreenX + 1) / 2) * 100}%`,
              top: `${((1 - snapshot.lockOnScreenY) / 2) * 100}%`,
            }}
          >
            <div className="relative flex flex-col items-center">
              <div className="h-8 w-8 rotate-45 rounded-sm border-2 border-red-400 shadow-[0_0_14px_rgba(248,113,113,0.8)]" />
              <p className="mt-2 whitespace-nowrap rounded border-2 border-black bg-black/75 px-1.5 py-0.5 text-[10px] font-black tracking-widest text-red-300">
                {snapshot.lockedTargetName ?? 'OBJETIVO'}
              </p>
            </div>
          </div>
        )}

      {/* --- Ventana de Parry activa --- */}
      {snapshot.parryWindowActive && (
        <div className="absolute left-1/2 top-[38%] -translate-x-1/2">
          <p className="rounded-lg border-2 border-white bg-black/70 px-4 py-1 text-sm font-black tracking-[0.3em] text-white shadow-[0_0_18px_rgba(255,255,255,0.7)]">
            PARRY
          </p>
        </div>
      )}

      {/* --- Aviso inicial de Pointer Lock --- */}
      {snapshot.phase === 'playing' && !snapshot.pointerLocked && (
        <div className="absolute left-1/2 top-24 -translate-x-1/2 animate-pulse rounded-xl border-2 border-yellow-300 bg-[#160b2e]/90 px-5 py-2 text-xs font-black tracking-widest text-yellow-300 shadow-[4px_4px_0_#000]">
          HAZ CLIC EN LA PANTALLA PARA CAPTURAR EL RATÓN
        </div>
      )}

      {/* --- Indicador Gravity Shift --- */}
      {shifting && (
        <div className="absolute left-1/2 top-[58%] -translate-x-1/2 text-center">
          <p className="rounded-lg border-2 border-cyan-300 bg-black/70 px-4 py-1 text-sm font-black tracking-[0.2em] text-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.6)]">
            GRAVITY SHIFT · 0.2x
          </p>
          {snapshot.gravityTargetName && (
            <p className="mt-1 text-xs font-bold text-white drop-shadow-[2px_2px_0_#000]">
              Objetivo: {snapshot.gravityTargetName}
            </p>
          )}
        </div>
      )}

      {/* --- Transición entre planetas --- */}
      {snapshot.phase === 'planet_transition' && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#05010f]/70">
          <div className="rounded-2xl border-4 border-cyan-300 bg-[#160b2e] px-12 py-8 text-center shadow-[10px_10px_0_#000]">
            <p className="mb-2 text-[10px] font-black tracking-[0.5em] text-cyan-300">
              SALTANDO DE ÓRBITA
            </p>
            <h2 className="text-4xl font-black tracking-widest text-white drop-shadow-[3px_3px_0_#000]">
              {snapshot.levelTitle}
            </h2>
          </div>
        </div>
      )}

      {/* --- Pausa --- */}
      {snapshot.phase === 'paused' && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[#05010f]/80">
          <div className="rounded-2xl border-4 border-yellow-400 bg-[#160b2e] p-10 text-center shadow-[10px_10px_0_#000]">
            <h2 className="mb-2 text-4xl font-black tracking-widest text-yellow-300">
              PAUSA
            </h2>
            <p className="mb-6 text-xs text-slate-400">
              El Pointer Lock se liberó. Haz clic para volver a pilotar.
            </p>
            <button
              type="button"
              onClick={onResume}
              className="cursor-pointer rounded-xl border-4 border-black bg-yellow-400 px-8 py-3 text-lg font-black tracking-widest text-black shadow-[6px_6px_0_#000] transition-transform hover:-translate-y-0.5"
            >
              REANUDAR
            </button>
          </div>
        </div>
      )}

      {/* --- Game Over --- */}
      {snapshot.phase === 'game_over' && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[#05010f]/85">
          <div className="rounded-2xl border-4 border-red-500 bg-[#160b2e] p-10 text-center shadow-[10px_10px_0_#000]">
            <h2 className="mb-2 text-4xl font-black tracking-widest text-red-400">
              ESCUADRÓN DERROTADO
            </h2>
            <p className="mb-6 text-sm font-bold text-slate-300">
              Los centinelas de {snapshot.activePlanetName} te han noqueado.
            </p>
            <button
              type="button"
              onClick={onExitToTitle}
              className="cursor-pointer rounded-xl border-4 border-black bg-yellow-400 px-8 py-3 text-lg font-black tracking-widest text-black shadow-[6px_6px_0_#000] transition-transform hover:-translate-y-0.5"
            >
              VOLVER AL TÍTULO
            </button>
          </div>
        </div>
      )}

      {/* --- Victoria / Hito completado --- */}
      {snapshot.phase === 'victory' && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[#05010f]/85">
          <div className="rounded-2xl border-4 border-cyan-300 bg-[#160b2e] p-10 text-center shadow-[10px_10px_0_#000]">
            <h2 className="mb-2 text-4xl font-black tracking-widest text-cyan-300">
              {snapshot.levelId === 'verdant'
                ? '¡PLANETA VERDANT COMPLETADO!'
                : '¡PORTAL ALCANZADO!'}
            </h2>
            <p className="mb-1 text-sm font-bold text-slate-200">
              {snapshot.levelId === 'verdant'
                ? 'Hito 2 completado: el escuadrón está operativo.'
                : 'Has completado el Prólogo Orbital.'}
            </p>
            <p className="mb-6 font-mono text-2xl font-black text-yellow-300">
              {formatTime(snapshot.elapsedRunSec)}
            </p>
            <button
              type="button"
              onClick={onExitToTitle}
              className="cursor-pointer rounded-xl border-4 border-black bg-yellow-400 px-8 py-3 text-lg font-black tracking-widest text-black shadow-[6px_6px_0_#000] transition-transform hover:-translate-y-0.5"
            >
              VOLVER AL TÍTULO
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
