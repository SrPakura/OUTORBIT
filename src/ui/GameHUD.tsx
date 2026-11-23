import { memo } from 'react';
import { GAME_CONSTANTS, type CharacterId, type HudSnapshot } from '@/game/types';
import { TUTORIAL_SPECS } from '@/game/levels/tutorialDefinitions';

const SQUADRON: CharacterId[] = ['kitsune', 'digger', 'axel'];

function formatTime(totalSec: number): string {
  const minutes = Math.floor(totalSec / 60);
  const seconds = Math.floor(totalSec % 60);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Líneas radiales de velocidad estilo cómic/manga: rayos blancos con acentos
 * dorados irrumpiendo desde los bordes de la pantalla hacia el centro. Se
 * generan una sola vez (deterministas) y el contenedor escala su opacidad
 * con `speedLinesIntensity` (0..1).
 */
const SPEED_LINES = Array.from({ length: 28 }, (_, i) => {
  const angle = (i / 28) * Math.PI * 2 + ((i % 3) - 1) * 0.055;
  const inner = 74 + (i % 4) * 7;
  const outer = 118 + (i % 3) * 16;
  return {
    i,
    angle,
    inner,
    outer,
    gold: i % 5 === 0,
    thick: i % 3 === 0,
  };
});

interface GameHUDProps {
  snapshot: HudSnapshot;
  onResume: () => void;
  onExitToTitle: () => void;
  /** Botón rápido M: Audio (alterna el mute del SynthAudio del GameEngine). */
  onToggleMute?: () => void;
  /** PASO B: salta al siguiente tutorial del catálogo (si no es el último). */
  onNextTutorial?: () => void;
  /** PASO B: reinicia el tutorial activo desde el principio. */
  onRestartTutorial?: () => void;
}

// ============================================================================
// Secciones memoizadas: el HudSnapshot llega a ~15 Hz y estas tarjetas solo
// re-renderizan cuando cambian sus props primitivas (no en cada tick del
// reloj). Los comparadores custom cubren los arrays que el engine
// reconstruye en cada emisión (objectives / objectiveMarkers).
// ============================================================================

const PlanetCard = memo(function PlanetCard({ activePlanetName }: { activePlanetName: string }) {
  return (
    <div className="rounded-lg border-2 border-black bg-[#160b2e]/85 px-4 py-2 shadow-[4px_4px_0_#000]">
      <p className="text-[10px] font-bold tracking-[0.25em] text-violet-300">
        PLANETA
      </p>
      <p className="text-sm font-black">{activePlanetName}</p>
    </div>
  );
});

const ObjectivesCard = memo(
  function ObjectivesCard({
    levelTitle,
    objectives,
  }: {
    levelTitle: string;
    objectives: HudSnapshot['objectives'];
  }) {
    return (
      <div className="max-w-md flex-1 rounded-lg border-2 border-black bg-[#160b2e]/85 px-4 py-2 shadow-[4px_4px_0_#000]">
        <p className="mb-1 text-[10px] font-bold tracking-[0.25em] text-violet-300">
          OBJETIVOS — {levelTitle}
        </p>
        <ul className="space-y-0.5">
          {objectives.map((objective) => (
            <li
              key={objective.id}
              className={`text-[11px] font-semibold leading-tight ${
                objective.completed ? 'text-emerald-400 line-through' : 'text-slate-200'
              }`}
            >
              {objective.completed
                ? '[OK]'
                : `[${objective.currentCount}/${objective.targetCount}]`}{' '}
              {objective.description}
            </li>
          ))}
        </ul>
      </div>
    );
  },
  (a, b) =>
    a.levelTitle === b.levelTitle &&
    a.objectives.length === b.objectives.length &&
    a.objectives.every((o, i) => {
      const p = b.objectives[i];
      return (
        o.id === p.id &&
        o.completed === p.completed &&
        o.currentCount === p.currentCount &&
        o.description === p.description
      );
    }),
);

const TimeCard = memo(function TimeCard({ elapsedRunSec }: { elapsedRunSec: number }) {
  return (
    <div className="rounded-lg border-2 border-black bg-[#160b2e]/85 px-4 py-2 text-right shadow-[4px_4px_0_#000]">
      <p className="text-[10px] font-bold tracking-[0.25em] text-violet-300">
        TIEMPO
      </p>
      <p className="font-mono text-sm font-black tabular-nums">
        {formatTime(elapsedRunSec)}
      </p>
    </div>
  );
});

interface StatusPanelProps {
  hp: number;
  maxHp: number;
  activeCharacter: CharacterId;
  stasisHeldCount: number;
  anchorReady: number;
  gravityReady: number;
  isDisguised: boolean;
  suspicionRatio: number;
  isBurrowing: boolean;
  isSwimming: boolean;
  globalAlert: boolean;
  keycardsCollected: number;
  gateLockdownActive: boolean;
  showDamageCard: boolean;
  damageAmount: number;
  damageAttacker: string;
  damageReason: string;
  damageIntensity: number;
}

const StatusPanel = memo(function StatusPanel({
  hp,
  maxHp,
  activeCharacter,
  stasisHeldCount,
  anchorReady,
  gravityReady,
  isDisguised,
  suspicionRatio,
  isBurrowing,
  isSwimming,
  globalAlert,
  keycardsCollected,
  gateLockdownActive,
  showDamageCard,
  damageAmount,
  damageAttacker,
  damageReason,
  damageIntensity,
}: StatusPanelProps) {
  return (
    <div className="absolute bottom-4 left-4 space-y-2">
      <div
        className={`flex items-center gap-2 rounded-lg border-2 border-black bg-[#160b2e]/85 px-3 py-2 shadow-[4px_4px_0_#000] ${
          damageIntensity > 0.15 ? 'ring-2 ring-red-500/90' : ''
        }`}
      >
        <span
          className={`text-[10px] font-black tracking-[0.2em] text-red-400 ${
            damageIntensity > 0.15 ? 'animate-pulse' : ''
          }`}
        >
          HP
        </span>
        <span className="flex gap-1">
          {Array.from({ length: maxHp }, (_, i) => (
            <span
              key={i}
              className={`h-3.5 w-3.5 rounded-full border-2 border-black ${
                i < hp ? 'bg-red-500' : 'bg-slate-700'
              } ${
                damageIntensity > 0.15 && i < hp
                  ? 'animate-pulse shadow-[0_0_10px_rgba(239,68,68,1)]'
                  : ''
              }`}
            />
          ))}
        </span>
      </div>

      <div className="flex gap-2">
        {SQUADRON.map((id) => {
          const profile = GAME_CONSTANTS.CHARACTERS[id];
          const active = activeCharacter === id;
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
                  i < stasisHeldCount ? 'bg-cyan-400' : 'bg-slate-700'
                }`}
              />
            ))}
          </span>
          <span className="font-mono text-[10px] font-black text-cyan-200">
            {stasisHeldCount}/{GAME_CONSTANTS.MAX_STASIS_OBJECTS}
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
        {isDisguised && (
          <span className="rounded-lg border-2 border-black bg-violet-500/90 px-3 py-1 text-[10px] font-black tracking-[0.2em] text-white shadow-[3px_3px_0_#000]">
            DISFRAZADO
          </span>
        )}
        {(isDisguised || suspicionRatio > 0.02) && (
          <div className="flex items-center gap-2 rounded-lg border-2 border-black bg-[#160b2e]/85 px-3 py-1 shadow-[3px_3px_0_#000]">
            <span className="text-[10px] font-black tracking-[0.2em] text-amber-300">
              SOSPECHA
            </span>
            <span className="h-2.5 w-16 overflow-hidden rounded-full border border-black bg-slate-700">
              <span
                className={`block h-full ${
                  suspicionRatio >= 1
                    ? 'bg-red-500'
                    : suspicionRatio > 0.6
                      ? 'bg-amber-400'
                      : 'bg-emerald-400'
                }`}
                style={{ width: `${Math.round(suspicionRatio * 100)}%` }}
              />
            </span>
          </div>
        )}
        {isBurrowing && (
          <span className="rounded-lg border-2 border-black bg-yellow-500/90 px-3 py-1 text-[10px] font-black tracking-[0.2em] text-black shadow-[3px_3px_0_#000]">
            SUBSUELO
          </span>
        )}
        {isSwimming && (
          <span className="rounded-lg border-2 border-black bg-cyan-400/90 px-3 py-1 text-[10px] font-black tracking-[0.2em] text-black shadow-[3px_3px_0_#000]">
            NADO
          </span>
        )}
        {globalAlert && (
          <span className="animate-pulse rounded-lg border-2 border-black bg-red-600/90 px-3 py-1 text-[10px] font-black tracking-[0.2em] text-white shadow-[3px_3px_0_#000]">
            ¡ALERTA!
          </span>
        )}
        {keycardsCollected > 0 && (
          <span className="rounded-lg border-2 border-black bg-yellow-400/90 px-3 py-1 text-[10px] font-black tracking-[0.2em] text-black shadow-[3px_3px_0_#000]">
            TARJETAS x{keycardsCollected}
          </span>
        )}
        {gateLockdownActive && (
          <span className="animate-pulse rounded-lg border-2 border-black bg-red-800/90 px-3 py-1 text-[10px] font-black tracking-[0.2em] text-red-100 shadow-[3px_3px_0_#000]">
            LOCKDOWN COMPUERTAS
          </span>
        )}
      </div>

      {/* --- HITO 3: Tarjeta de causa del daño (píldora P5 skew roja/negra
          bajo los badges): QUÉ pasó, QUIÉN golpeó y POR QUÉ. --- */}
      {showDamageCard && (
        <div
          className="rounded-lg border-2 border-black bg-red-600/95 px-4 py-1.5 shadow-[4px_4px_0_#000]"
          style={{ transform: 'skewX(-8deg)' }}
        >
          <p className="text-xs font-black tracking-[0.14em] text-yellow-300 drop-shadow-[1px_1px_0_#000]">
            DAÑO -{damageAmount} HP · {damageAttacker.toUpperCase()}
          </p>
          <p className="mt-0.5 text-[10px] font-bold leading-snug text-red-100">
            {damageReason}
          </p>
        </div>
      )}
    </div>
  );
});

interface ChallengeBannerProps {
  title: string;
  timeLeftSec: number;
  critical: boolean;
  progressRatio: number;
  progress: number;
  total: number;
  hasRadioToast: boolean;
}

const ChallengeBanner = memo(function ChallengeBanner({
  title,
  timeLeftSec,
  critical,
  progressRatio,
  progress,
  total,
  hasRadioToast,
}: ChallengeBannerProps) {
  return (
    <div
      className={`absolute left-1/2 w-[min(520px,88vw)] -translate-x-1/2 ${
        hasRadioToast ? 'top-[184px]' : 'top-[116px]'
      }`}
    >
      <div
        className="rounded-lg border-2 border-black bg-[#160b2e]/95 px-4 py-2 shadow-[4px_4px_0_#000]"
        style={{ transform: 'skewX(-6deg)' }}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-black tracking-[0.24em] text-cyan-300">
            RETO · {title.toUpperCase()}
          </p>
          <p
            className={`font-mono text-xs font-black tabular-nums ${
              critical ? 'animate-pulse text-red-400' : 'text-slate-200'
            }`}
          >
            {timeLeftSec.toFixed(1)}s
          </p>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="h-2 flex-1 overflow-hidden rounded-full border border-black bg-slate-700">
            <span
              className="block h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all"
              style={{ width: `${Math.round(progressRatio * 100)}%` }}
            />
          </span>
          <span className="font-mono text-[10px] font-black tabular-nums text-emerald-400">
            {progress}/{total}
          </span>
        </div>
      </div>
    </div>
  );
});

const SandboxPopup = memo(function SandboxPopup({
  accent,
  text,
  hasRadioToast,
}: {
  accent: string;
  text: string;
  hasRadioToast: boolean;
}) {
  return (
    <div
      className={`absolute left-1/2 w-[min(460px,86vw)] -translate-x-1/2 ${
        hasRadioToast ? 'top-[244px]' : 'top-[176px]'
      }`}
    >
      <style>{`@keyframes outorbit-sandbox-popup {
        0%, 100% { transform: scale(1) rotate(-1.2deg); }
        50% { transform: scale(1.05) rotate(1.2deg); }
      }`}</style>
      <div className="-skew-x-6">
        <div
          className="rounded-lg border-4 bg-[#160b2e]/95 px-5 py-2 text-center shadow-[6px_6px_0_#000]"
          style={{
            borderColor: accent,
            animation: 'outorbit-sandbox-popup 1.15s ease-in-out infinite',
            boxShadow: `6px 6px 0 #000, 0 0 22px ${accent}88`,
          }}
        >
          <p
            className="skew-x-6 text-sm font-black tracking-[0.12em] drop-shadow-[2px_2px_0_#000]"
            style={{ color: accent }}
          >
            {text}
          </p>
        </div>
      </div>
    </div>
  );
});

const CollectiblesPill = memo(function CollectiblesPill({
  coins,
  coinsTotal,
  orbs,
  orbsTotal,
  challengesDone,
  challengesTotal,
  hasMuteButton,
}: {
  coins: number;
  coinsTotal: number;
  orbs: number;
  orbsTotal: number;
  challengesDone: number;
  challengesTotal: number;
  hasMuteButton: boolean;
}) {
  return (
    <div
      className={`absolute right-4 flex items-center gap-3 rounded-full border-2 border-black bg-[#160b2e]/90 px-4 py-1.5 shadow-[4px_4px_0_#000] ${
        hasMuteButton ? 'top-[122px]' : 'top-[84px]'
      }`}
    >
      <span className="flex items-baseline gap-1.5">
        <span className="text-[9px] font-black tracking-[0.18em] text-yellow-300/80">
          MONEDAS
        </span>
        <span className="font-mono text-xs font-black tabular-nums text-yellow-300">
          {coins}/{coinsTotal}
        </span>
      </span>
      <span className="h-3 w-0.5 bg-violet-400/50" />
      <span className="flex items-baseline gap-1.5">
        <span className="text-[9px] font-black tracking-[0.18em] text-cyan-300/80">
          ORBES
        </span>
        <span className="font-mono text-xs font-black tabular-nums text-cyan-300">
          {orbs}/{orbsTotal}
        </span>
      </span>
      <span className="h-3 w-0.5 bg-violet-400/50" />
      <span className="flex items-baseline gap-1.5">
        <span className="text-[9px] font-black tracking-[0.18em] text-emerald-400/80">
          RETOS
        </span>
        <span className="font-mono text-xs font-black tabular-nums text-emerald-400">
          {challengesDone}/{challengesTotal}
        </span>
      </span>
    </div>
  );
});

const AnchorNotice = memo(function AnchorNotice() {
  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 translate-y-[34px]">
      <p className="animate-pulse whitespace-nowrap rounded-full border-2 border-cyan-300 bg-black/80 px-3 py-1 text-[10px] font-black tracking-[0.22em] text-cyan-200 shadow-[0_0_18px_rgba(103,232,249,0.8)]">
        <span className="text-yellow-300">[ESPACIO]</span> ANCLA
      </p>
    </div>
  );
});

const ObjectiveMarkers = memo(
  function ObjectiveMarkers({
    markers,
    lockOnActive,
    lockOnScreenX,
    lockOnScreenY,
    lockedTargetName,
  }: {
    markers: NonNullable<HudSnapshot['objectiveMarkers']>;
    lockOnActive: boolean;
    lockOnScreenX: number | null;
    lockOnScreenY: number | null;
    lockedTargetName: string | null;
  }) {
    return (
      <>
        {markers.map((marker) => (
          <div
            key={marker.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${((marker.screenX + 1) / 2) * 100}%`,
              top: `${((1 - marker.screenY) / 2) * 100}%`,
            }}
          >
            <div className="flex flex-col items-center">
              <div
                className={`rounded border-2 px-1.5 py-0.5 text-[10px] font-black tracking-widest ${
                  marker.inFront ? '' : 'opacity-70 saturate-50'
                }`}
                style={{
                  borderColor: marker.color,
                  color: marker.color,
                  background: 'rgba(5,1,15,0.78)',
                  boxShadow: `0 0 10px ${marker.color}66`,
                }}
              >
                {marker.inFront ? '' : '> '}
                {marker.label}
              </div>
              <span className="mt-0.5 font-mono text-[9px] font-bold text-white drop-shadow-[1px_1px_0_#000]">
                {Math.round(marker.distanceMeters)}m
              </span>
            </div>
          </div>
        ))}

        {/* --- Marcador Lock-On proyectado en pantalla --- */}
        {lockOnActive && lockOnScreenX != null && lockOnScreenY != null && (
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${((lockOnScreenX + 1) / 2) * 100}%`,
              top: `${((1 - lockOnScreenY) / 2) * 100}%`,
            }}
          >
            <div className="relative flex flex-col items-center">
              <div className="h-8 w-8 rotate-45 rounded-sm border-2 border-red-400 shadow-[0_0_14px_rgba(248,113,113,0.8)]" />
              <p className="mt-2 whitespace-nowrap rounded border-2 border-black bg-black/75 px-1.5 py-0.5 text-[10px] font-black tracking-widest text-red-300">
                {lockedTargetName ?? 'OBJETIVO'}
              </p>
            </div>
          </div>
        )}
      </>
    );
  },
  (a, b) =>
    a.lockOnActive === b.lockOnActive &&
    a.lockOnScreenX === b.lockOnScreenX &&
    a.lockOnScreenY === b.lockOnScreenY &&
    a.lockedTargetName === b.lockedTargetName &&
    a.markers.length === b.markers.length &&
    a.markers.every((m, i) => {
      const p = b.markers[i];
      return (
        m.id === p.id &&
        m.screenX === p.screenX &&
        m.screenY === p.screenY &&
        m.inFront === p.inFront &&
        m.label === p.label &&
        m.color === p.color &&
        m.distanceMeters === p.distanceMeters
      );
    }),
);

interface OverlayScreensProps {
  phase: HudSnapshot['phase'];
  activePlanetName: string;
  tutorialId: string | null;
  tutorialCompleted: boolean;
  tutorialTitle: string;
  completedTimeText: string;
  hasNextTutorial: boolean;
  gameOverReason: string | null;
  onResume: () => void;
  onExitToTitle: () => void;
  onNextTutorial?: () => void;
  onRestartTutorial?: () => void;
}

/** Pausa, Game Over y Tutorial Completado: pantallas casi estáticas que no
 *  necesitan re-renderizar con cada tick del reloj del HUD. */
const OverlayScreens = memo(function OverlayScreens({
  phase,
  activePlanetName,
  tutorialId,
  tutorialCompleted,
  tutorialTitle,
  completedTimeText,
  hasNextTutorial,
  gameOverReason,
  onResume,
  onExitToTitle,
  onNextTutorial,
  onRestartTutorial,
}: OverlayScreensProps) {
  return (
    <>
      {/* --- Pausa --- */}
      {phase === 'paused' && (
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
      {phase === 'game_over' && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[#05010f]/85">
          <div className="rounded-2xl border-4 border-red-500 bg-[#160b2e] p-10 text-center shadow-[10px_10px_0_#000]">
            <h2 className="mb-2 text-4xl font-black tracking-widest text-red-400">
              ESCUADRÓN DERROTADO
            </h2>
            <p className="mb-6 text-sm font-bold text-slate-300">
              {gameOverReason ?? `Los centinelas de ${activePlanetName} te han noqueado.`}
            </p>
            <div className="flex flex-col gap-3">
              {tutorialId && onRestartTutorial && (
                <button
                  type="button"
                  onClick={onRestartTutorial}
                  className="cursor-pointer rounded-xl border-4 border-black bg-cyan-300 px-8 py-3 text-lg font-black tracking-widest text-black shadow-[6px_6px_0_#000] transition-transform hover:-translate-y-0.5"
                >
                  REINTENTAR TUTORIAL
                </button>
              )}
              <button
                type="button"
                onClick={onExitToTitle}
                className="cursor-pointer rounded-xl border-4 border-black bg-yellow-400 px-8 py-3 text-lg font-black tracking-widest text-black shadow-[6px_6px_0_#000] transition-transform hover:-translate-y-0.5"
              >
                VOLVER AL TÍTULO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- PASO B: tarjeta de TUTORIAL COMPLETADO (P5/Frieren). Tres salidas:
          siguiente tutorial (si no es el último), reintentar y volver al menú.
          Nunca abre el Battle Report: los tutoriales no puntúan. --- */}
      {tutorialCompleted && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[#05010f]/85">
          <div className="w-[min(560px,92vw)] rounded-2xl border-4 border-cyan-300 bg-[#160b2e] p-8 text-center shadow-[10px_10px_0_#000]">
            <p className="text-[10px] font-black tracking-[0.4em] text-violet-300">
              TUTORIAL · {tutorialTitle}
            </p>
            <h2
              className="mt-2 text-4xl font-black italic tracking-tight text-transparent"
              style={{
                backgroundImage: 'linear-gradient(180deg, #67e8f9 0%, #a78bfa 55%, #f472b6 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextStroke: '2px #0b0b14',
                filter: 'drop-shadow(5px 5px 0 #0b0b14)',
              }}
            >
              ¡TUTORIAL COMPLETADO!
            </h2>
            <p className="mt-3 text-xs font-semibold leading-relaxed text-slate-300">
              Lección superada en {completedTimeText}. Sin rastro en el
              leaderboard: los tutoriales no puntúan.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              {hasNextTutorial && onNextTutorial && (
                <button
                  type="button"
                  onClick={onNextTutorial}
                  className="cursor-pointer rounded-xl border-4 border-black bg-cyan-300 px-8 py-3 text-lg font-black tracking-widest text-black shadow-[6px_6px_0_#000] transition-transform hover:-translate-y-0.5"
                >
                  SIGUIENTE TUTORIAL
                </button>
              )}
              {onRestartTutorial && (
                <button
                  type="button"
                  onClick={onRestartTutorial}
                  className="cursor-pointer rounded-xl border-4 border-black bg-violet-400 px-8 py-3 text-lg font-black tracking-widest text-black shadow-[6px_6px_0_#000] transition-transform hover:-translate-y-0.5"
                >
                  REINTENTAR
                </button>
              )}
              <button
                type="button"
                onClick={onExitToTitle}
                className="cursor-pointer rounded-xl border-4 border-black bg-yellow-400 px-8 py-3 text-lg font-black tracking-widest text-black shadow-[6px_6px_0_#000] transition-transform hover:-translate-y-0.5"
              >
                VOLVER AL MENÚ
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

/**
 * HUD táctico de la Galaxia Continua (Oleada 2): barra superior (planeta
 * activo, objetivos dinámicos, reloj), marcadores direccionales de objetivos
 * proyectados en pantalla/bordes con distancia en metros, transmisión de
 * radio no bloqueante cuando la IA adapta un planeta recién desbloqueado,
 * aviso de ESCUDO ACTIVO al apuntar con Gravity Shift, selector de
 * escuadrón, HP, Estasis, Disfraz, Subsuelo, Nado, Parry, prompt contextual,
 * barra del COMANDANTE KRONOS y pantallas de pausa/game over.
 */
export default function GameHUD({
  snapshot,
  onResume,
  onExitToTitle,
  onToggleMute,
  onNextTutorial,
  onRestartTutorial,
}: GameHUDProps) {
  const shifting = snapshot.isGravityShifting;
  const anchorReady = 1 - snapshot.anchorCooldownRatio;
  const gravityReady = 1 - (snapshot.gravityShiftCooldownRatio ?? 0);
  // HITO 3: atribución del último golpe (flash, chevron y tarjeta de causa).
  const damageFeedback = snapshot.damageFeedback;
  const damageIntensity = damageFeedback?.intensity ?? 0;
  const damageDirection = damageFeedback?.directionRad ?? null;
  // PASO B: tutorial activo y si queda uno siguiente en el catálogo.
  const tutorialIndex = snapshot.tutorialId
    ? TUTORIAL_SPECS.findIndex((spec) => spec.id === snapshot.tutorialId)
    : -1;
  const hasNextTutorial =
    tutorialIndex >= 0 && tutorialIndex < TUTORIAL_SPECS.length - 1;
  // MODO SANDBOX: contadores de coleccionables, reto
  // activo, aviso de anclaje y popup cómic. Todo el bloque queda inerte si
  // `isSandbox` no es true, así el HUD de tutoriales y campaña no cambia.
  const isSandbox = snapshot.isSandbox === true;
  const sandboxChallenge = snapshot.activeChallenge ?? null;
  const sandboxPopup = snapshot.sandboxPopup ?? null;
  const challengeCritical = (sandboxChallenge?.timeLeftSec ?? Infinity) < 8;
  const challengeProgressRatio = sandboxChallenge
    ? Math.min(1, Math.max(0, sandboxChallenge.progress / Math.max(1, sandboxChallenge.total)))
    : 0;

  return (
    <div className="pointer-events-none fixed inset-0 select-none font-sans text-slate-100">
      {/* --- Overlay cómic: screentone halftone + líneas de velocidad --- */}
      {(snapshot.speedLinesIntensity ?? 0) > 0.01 && (
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ opacity: snapshot.speedLinesIntensity ?? 0 }}
        >
          {/* Trama screentone/halftone estilo manga-P5: puntos radiales en
              esquinas y bordes, desvanecidos hacia el centro para no tapar
              la vista (máscara radial). */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'radial-gradient(circle, rgba(255,255,255,0.5) 1.1px, transparent 1.6px)',
              backgroundSize: '8px 8px',
              maskImage:
                'radial-gradient(ellipse 64% 56% at center, transparent 52%, black 100%)',
              WebkitMaskImage:
                'radial-gradient(ellipse 64% 56% at center, transparent 52%, black 100%)',
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'radial-gradient(circle, rgba(148,110,255,0.4) 2.2px, transparent 2.8px)',
              backgroundSize: '17px 17px',
              maskImage:
                'radial-gradient(ellipse 70% 62% at center, transparent 58%, black 100%)',
              WebkitMaskImage:
                'radial-gradient(ellipse 70% 62% at center, transparent 58%, black 100%)',
            }}
          />
          {/* Líneas radiales de velocidad animadas: el patrón de guiones
              fluye hacia afuera (dashoffset) para el efecto de rushing. */}
          <style>{`@keyframes outorbit-speedlines { to { stroke-dashoffset: -32; } }`}</style>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
          >
            {SPEED_LINES.map((line) => {
              const cos = Math.cos(line.angle);
              const sin = Math.sin(line.angle);
              return (
                <line
                  key={line.i}
                  x1={50 + cos * line.inner}
                  y1={50 + sin * line.inner}
                  x2={50 + cos * line.outer}
                  y2={50 + sin * line.outer}
                  stroke={line.gold ? '#fbbf24' : '#ffffff'}
                  strokeWidth={line.thick ? 0.7 : 0.35}
                  strokeLinecap="round"
                  strokeDasharray="5 11"
                  opacity={line.gold ? 0.85 : 0.5}
                  style={{ animation: 'outorbit-speedlines 0.9s linear infinite' }}
                />
              );
            })}
          </svg>
        </div>
      )}

      {/* --- HITO 3: Flash carmesí en los bordes de la pantalla al recibir
          daño (vignette radial, opacidad = intensidad * 0.65) --- */}
      {damageIntensity > 0.01 && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: damageIntensity * 0.65,
            background:
              'radial-gradient(ellipse at center, transparent 38%, rgba(153,27,27,0.55) 70%, rgba(239,68,68,0.95) 100%)',
          }}
        />
      )}

      {/* --- Barra superior --- */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-4">
        <PlanetCard activePlanetName={snapshot.activePlanetName} />
        <ObjectivesCard levelTitle={snapshot.levelTitle} objectives={snapshot.objectives} />
        <TimeCard elapsedRunSec={snapshot.elapsedRunSec} />
      </div>

      {/* --- PASO B: checklist del TUTORIAL activo (bajo la tarjeta PLANETA).
          Tarjeta cian-violeta flotante con los 2-3 pasos de la lección. --- */}
      {snapshot.phase === 'playing' && snapshot.tutorialId && (
        <div className="absolute left-4 top-[96px] w-[min(330px,74vw)]">
          <div className="rounded-lg border-2 border-cyan-300 bg-[#160b2e]/90 px-4 py-2 shadow-[4px_4px_0_#000]">
            <p className="text-[10px] font-black tracking-[0.26em] text-cyan-300">
              TUTORIAL · {snapshot.tutorialTitle}
            </p>
            <ul className="mt-1.5 space-y-1">
              {(snapshot.tutorialLessons ?? []).map((lesson, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-violet-400 bg-violet-500/30 text-[9px] font-black text-violet-200">
                    {index + 1}
                  </span>
                  <span className="text-[11px] font-semibold leading-snug text-slate-200">
                    {lesson}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* --- Barra prominente del COMANDANTE KRONOS (Hito 4) --- */}
      {snapshot.bossHpRatio !== null && (
        <div className="absolute left-1/2 top-24 w-[min(560px,82vw)] -translate-x-1/2 rounded-lg border-2 border-black bg-[#160b2e]/90 px-4 py-2 shadow-[4px_4px_0_#000]">
          <div className="mb-1 flex items-center justify-between gap-3">
            <p className="animate-pulse text-[11px] font-black tracking-[0.25em] text-red-400">
              COMANDANTE KRONOS
            </p>
            <p className="text-[10px] font-bold text-slate-300">
              {snapshot.bossAdaptedTo
                ? `MLP CONTRARRESTANDO A: ${GAME_CONSTANTS.CHARACTERS[snapshot.bossAdaptedTo].displayName.toUpperCase()}`
                : 'ESCUDO FRONTAL · FLANQUEA O PARREA'}
            </p>
          </div>
          <div className="h-3.5 overflow-hidden rounded-full border-2 border-black bg-slate-800">
            <div
              className="h-full bg-gradient-to-r from-red-600 to-orange-400 transition-all"
              style={{ width: `${Math.round(snapshot.bossHpRatio * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* --- Transmisión de radio: la IA adapta el siguiente planeta --- */}
      {snapshot.phase === 'playing' && snapshot.radioToast && (
        <div className="absolute left-1/2 top-[76px] w-[min(620px,86vw)] -translate-x-1/2">
          <div className="rounded-lg border-2 border-cyan-300 bg-[#160b2e]/95 px-4 py-2 shadow-[4px_4px_0_#000]">
            <p className="text-[11px] font-black tracking-[0.28em] text-cyan-300">
              {snapshot.radioToast.title}
            </p>
            <ul className="mt-1 space-y-0.5">
              {snapshot.radioToast.lines.map((line, i) => (
                <li key={i} className="text-[10px] font-semibold leading-snug text-slate-300">
                  - {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* --- HITO 1: Banner de VIGILANCIA (un enemigo en modo WARNING te
          avisa: cono ámbar + chirp). Cede su carril si hay transmisión de
          radio y nunca roza la guía de controles (bottom-14). --- */}
      {snapshot.phase === 'playing' && snapshot.warningBanner && (
        <div
          className={`absolute left-1/2 w-[min(560px,86vw)] -translate-x-1/2 ${
            snapshot.radioToast ? 'top-[140px]' : 'top-[76px]'
          }`}
        >
          <div
            className="rounded-lg border-2 border-amber-400 bg-[#160b2e]/95 px-4 py-2 shadow-[4px_4px_0_#000]"
            style={{ transform: 'skewX(-6deg)' }}
          >
            <p className="animate-pulse text-[11px] font-black tracking-[0.28em] text-amber-400">
              ⚠ VIGILANCIA · {snapshot.warningBanner.speaker.toUpperCase()}
            </p>
            <p className="mt-0.5 text-xs font-bold leading-snug text-amber-100">
              &ldquo;{snapshot.warningBanner.text}&rdquo;
            </p>
          </div>
        </div>
      )}

      {/* --- MODO SANDBOX: banner del RETO activo (carrera por aros o dianas
          con Estasis). Cede su carril si hay transmisión de radio. --- */}
      {isSandbox && sandboxChallenge && (
        <ChallengeBanner
          title={sandboxChallenge.title}
          timeLeftSec={sandboxChallenge.timeLeftSec}
          critical={challengeCritical}
          progressRatio={challengeProgressRatio}
          progress={sandboxChallenge.progress}
          total={sandboxChallenge.total}
          hasRadioToast={snapshot.radioToast != null}
        />
      )}

      {/* --- MODO SANDBOX: popup cómic inclinado (moneda, orbe, reto superado,
          pista de NPC). Late en el sitio para llamar la atención sin tapar la
          mira ni la guía de controles. --- */}
      {isSandbox && sandboxPopup && (
        <SandboxPopup
          accent={sandboxPopup.accent}
          text={sandboxPopup.text}
          hasRadioToast={snapshot.radioToast != null}
        />
      )}

      {/* --- Botón rápido M: Audio --- */}
      {onToggleMute && (
        <button
          type="button"
          onClick={onToggleMute}
          className="pointer-events-auto absolute right-4 top-[84px] rounded-lg border-2 border-black bg-[#160b2e]/85 px-3 py-1.5 text-[10px] font-black tracking-[0.2em] text-cyan-300 shadow-[3px_3px_0_#000] transition-colors hover:bg-[#1d1240]"
        >
          M: AUDIO {snapshot.muted ? 'OFF' : 'ON'}
        </button>
      )}

      {/* --- MODO SANDBOX: píldora cómic de coleccionables (monedas, orbes y
          retos) justo bajo el botón M: AUDIO, alineada con el reloj. --- */}
      {isSandbox && (
        <CollectiblesPill
          coins={snapshot.sandboxCoins ?? 0}
          coinsTotal={snapshot.sandboxCoinsTotal ?? 0}
          orbs={snapshot.sandboxOrbs ?? 0}
          orbsTotal={snapshot.sandboxOrbsTotal ?? 0}
          challengesDone={snapshot.sandboxChallengesCompleted ?? 0}
          challengesTotal={snapshot.sandboxChallengesTotal ?? 0}
          hasMuteButton={onToggleMute != null}
        />
      )}

      {/* --- Esquina inferior izquierda: HP, escuadrón e indicadores --- */}
      <StatusPanel
        hp={snapshot.hp}
        maxHp={snapshot.maxHp}
        activeCharacter={snapshot.activeCharacter}
        stasisHeldCount={snapshot.stasisHeldCount}
        anchorReady={anchorReady}
        gravityReady={gravityReady}
        isDisguised={snapshot.isDisguised}
        suspicionRatio={snapshot.suspicionRatio}
        isBurrowing={snapshot.isBurrowing}
        isSwimming={snapshot.isSwimming}
        globalAlert={snapshot.globalAlert}
        keycardsCollected={snapshot.keycardsCollected ?? 0}
        gateLockdownActive={snapshot.gateLockdownActive === true}
        showDamageCard={snapshot.phase === 'playing' && damageFeedback != null}
        damageAmount={damageFeedback?.amount ?? 0}
        damageAttacker={damageFeedback?.attacker ?? ''}
        damageReason={damageFeedback?.reason ?? ''}
        damageIntensity={damageIntensity}
      />

      {/* --- Esquina inferior derecha: guía de controles --- */}
      <div className="absolute bottom-14 right-4 rounded-lg border-2 border-black bg-[#160b2e]/85 px-4 py-3 text-[10px] font-semibold leading-relaxed text-slate-300 shadow-[4px_4px_0_#000]">
            <p>
              <span className="text-yellow-300">WASD</span> Mover ·{' '}
              <span className="text-yellow-300">ESPACIO</span> Salto/Ancla
              {isSandbox && (
                <>
                  {' '}
                  · <span className="text-yellow-300">E</span> Reto/Hablar
                </>
              )}
            </p>
            <p>
              <span className="text-yellow-300">SHIFT</span> Sprint/Subsuelo ·{' '}
              <span className="text-yellow-300">R/C</span> Capturar Estasis
            </p>
            <p>
              <span className="text-yellow-300">CLIC IZQ</span> Disparar 1 ·{' '}
              <span className="text-yellow-300">Q</span> Fijar objetivo (
              <span className="text-yellow-300">←/→</span>)
            </p>
            <p>
              <span className="text-yellow-300">F</span> Parry ·{' '}
              <span className="text-yellow-300">E</span> Noquear ·{' '}
              <span className="text-yellow-300">CLIC DER</span> Gravity Shift
            </p>
            <p>
              <span className="text-yellow-300">1/2/3</span> Escuadrón ·{' '}
              <span className="text-yellow-300">RUEDA</span> Zoom ·{' '}
              <span className="text-yellow-300">M</span> Audio{' '}
              {snapshot.muted ? '(silenciado)' : '(activado)'}
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

      {/* --- Bocadillo de diálogo del NPC (FASE B, sin pausar el juego) --- */}
      {snapshot.phase === 'playing' && snapshot.activeDialogue && (
        <div className="absolute bottom-44 left-1/2 w-[min(560px,86vw)] -translate-x-1/2">
          <div className="rounded-xl border-2 border-cyan-300 bg-[#160b2e]/95 px-5 py-3 shadow-[5px_5px_0_#000]">
            <p className="text-[11px] font-black tracking-[0.22em] text-cyan-300">
              {snapshot.activeDialogue.speaker.toUpperCase()}
              <span className="ml-2 font-bold tracking-normal text-slate-400">
                · {snapshot.activeDialogue.role}
              </span>
            </p>
            <p className="mt-1 text-sm font-semibold leading-snug text-slate-100">
              &ldquo;{snapshot.activeDialogue.text}&rdquo;
            </p>
          </div>
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

      {/* --- MODO SANDBOX: aviso de anclaje bajo la mira. Aparece cuando una
          Esfera de Ancla está en rango y el jugador puede engancharse. --- */}
      {isSandbox && snapshot.anchorTargetInRange && snapshot.phase === 'playing' && (
        <AnchorNotice />
      )}

      {/* --- HITO 3: Indicador direccional de golpe — chevron rojo-amarillo
          brillante orbitando la mira (w-36 h-36) y rotado `directionRad`
          apuntando DIRECTO hacia el atacante (0 = arriba/frente,
          +PI/2 = derecha, ±PI = abajo/detrás). --- */}
      {snapshot.phase === 'playing' && damageDirection !== null && damageIntensity > 0.02 && (
        <div className="absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2">
          <div
            className="relative h-full w-full"
            style={{ transform: `rotate(${damageDirection}rad)` }}
          >
            <div
              className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1"
              style={{ opacity: damageIntensity }}
            >
              <svg
                width="38"
                height="30"
                viewBox="0 0 38 30"
                style={{ filter: 'drop-shadow(0 0 8px rgba(239,68,68,0.95))' }}
              >
                <defs>
                  <linearGradient id="outorbit-hit-chevron" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fde047" />
                    <stop offset="55%" stopColor="#f97316" />
                    <stop offset="100%" stopColor="#dc2626" />
                  </linearGradient>
                </defs>
                <polygon
                  points="19,1 37,22 27.5,22 19,11 10.5,22 1,22"
                  fill="url(#outorbit-hit-chevron)"
                  stroke="#7f1d1d"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* --- Marcadores direccionales de objetivos (pantalla/bordes) --- */}
      {snapshot.phase === 'playing' && (
        <ObjectiveMarkers
          markers={snapshot.objectiveMarkers ?? []}
          lockOnActive={snapshot.lockOnActive === true}
          lockOnScreenX={snapshot.lockOnScreenX ?? null}
          lockOnScreenY={snapshot.lockOnScreenY ?? null}
          lockedTargetName={snapshot.lockedTargetName ?? null}
        />
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
        <div className="absolute left-1/2 top-32 -translate-x-1/2 animate-pulse rounded-xl border-2 border-yellow-300 bg-[#160b2e]/90 px-5 py-2 text-xs font-black tracking-widest text-yellow-300 shadow-[4px_4px_0_#000]">
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
          {snapshot.gravityTargetBlockedReason && (
            <div className="mt-1.5 flex flex-col items-center gap-0.5">
              <p className="animate-pulse rounded-lg border-2 border-amber-400 bg-black/80 px-3 py-1 text-xs font-black tracking-[0.25em] text-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.55)]">
                TORMENTA ORBITAL ACTIVA
              </p>
              <p className="max-w-[420px] text-[10px] font-bold leading-snug text-amber-200 drop-shadow-[1px_1px_0_#000]">
                {snapshot.gravityTargetBlockedReason}
              </p>
            </div>
          )}
        </div>
      )}

      <OverlayScreens
        phase={snapshot.phase}
        activePlanetName={snapshot.activePlanetName}
        tutorialId={snapshot.tutorialId ?? null}
        tutorialCompleted={snapshot.tutorialCompleted === true}
        tutorialTitle={snapshot.tutorialTitle ?? ''}
        completedTimeText={formatTime(snapshot.elapsedRunSec)}
        hasNextTutorial={hasNextTutorial}
        gameOverReason={snapshot.gameOverReason ?? null}
        onResume={onResume}
        onExitToTitle={onExitToTitle}
        onNextTutorial={onNextTutorial}
        onRestartTutorial={onRestartTutorial}
      />

      {/* --- Victoria de campaña: el BattleReportScreen (App) toma el relevo --- */}
    </div>
  );
}
