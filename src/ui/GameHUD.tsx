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
 * HUD mínimo y limpio del Hito 1: barra superior (planeta, objetivos, reloj),
 * selector de escuadrón, HP, indicador de GRAVITY SHIFT, mira central y guía
 * compacta de controles. Solo re-renderiza cuando el GameEngine emite un
 * HudSnapshot (~15 Hz o cambios discretos).
 */
export default function GameHUD({ snapshot, onResume, onExitToTitle }: GameHUDProps) {
  const shifting = snapshot.isGravityShifting;

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
                {objective.completed ? '[OK]' : '[ ]'} {objective.description}
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

      {/* --- Esquina inferior izquierda: HP + escuadrón --- */}
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
      </div>

      {/* --- Esquina inferior derecha: guía de controles --- */}
      <div className="absolute bottom-4 right-4 rounded-lg border-2 border-black bg-[#160b2e]/85 px-4 py-3 text-[10px] font-semibold leading-relaxed text-slate-300 shadow-[4px_4px_0_#000]">
        <p>
          <span className="text-yellow-300">WASD</span> Mover ·{' '}
          <span className="text-yellow-300">ESPACIO</span> Salto/Doble
        </p>
        <p>
          <span className="text-yellow-300">SHIFT</span> Sprint ·{' '}
          <span className="text-yellow-300">1/2/3</span> Escuadrón
        </p>
        <p>
          <span className="text-yellow-300">CLIC DER.</span> Gravity Shift (0.2x)
        </p>
        <p>
          <span className="text-yellow-300">ESC</span> Pausa
        </p>
      </div>

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

      {/* --- Victoria --- */}
      {snapshot.phase === 'victory' && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[#05010f]/85">
          <div className="rounded-2xl border-4 border-cyan-300 bg-[#160b2e] p-10 text-center shadow-[10px_10px_0_#000]">
            <h2 className="mb-2 text-4xl font-black tracking-widest text-cyan-300">
              ¡PORTAL ALCANZADO!
            </h2>
            <p className="mb-1 text-sm font-bold text-slate-200">
              Has completado el Prólogo Orbital.
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
