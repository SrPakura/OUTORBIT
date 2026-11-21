import { useEffect, useState } from 'react';
import {
  CONTROL_ACTIONS,
  DEFAULT_SETTINGS,
  SETTINGS_LIMITS,
  cloneGameSettings,
  formatKeyCode,
  type ControlAction,
  type GameSettings,
} from '@/game/settings';
import MenuModalShell from '@/ui/MenuModalShell';

const ACTION_LABELS: Record<ControlAction, string> = {
  forward: 'Avanzar',
  back: 'Retroceder',
  left: 'Izquierda',
  right: 'Derecha',
  jump: 'Saltar',
  sprint: 'Sprint',
  interact: 'Interactuar',
  parry: 'Parry',
  stasis: 'Estasis',
  lockOn: 'Fijar objetivo',
  slot1: 'Personaje 1',
  slot2: 'Personaje 2',
  slot3: 'Personaje 3',
};

interface ControlsModalProps {
  settings: GameSettings;
  onClose: () => void;
  onSaveSettings: (settings: GameSettings) => void;
}

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}

function SliderRow({ label, value, min, max, step, display, onChange }: SliderRowProps) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-200">
          {label}
        </span>
        <span className="rounded-md border border-cyan-300/40 bg-cyan-400/10 px-2 py-0.5 text-[11px] font-black text-cyan-200">
          {display}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-cyan-400"
      />
    </label>
  );
}

interface ToggleRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleRow({ label, checked, onChange }: ToggleRowProps) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border-2 border-white/10 bg-white/5 px-3 py-2">
      <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-200">
        {label}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 cursor-pointer accent-cyan-400"
      />
    </label>
  );
}

/**
 * Modal de Controles: sensibilidad, eje Y, FOV, volumen y trama halftone con
 * previsualización en vivo, más la rejilla de rebinding de las 13 acciones.
 * Clic en un binding -> "PULSA TECLA..."; Escape cancela; cualquier otro
 * `e.code` se asigna al instante.
 */
export default function ControlsModal({ settings, onClose, onSaveSettings }: ControlsModalProps) {
  const [draft, setDraft] = useState<GameSettings>(() => cloneGameSettings(settings));
  const [capturing, setCapturing] = useState<ControlAction | null>(null);

  useEffect(() => {
    if (!capturing) return;
    const action = capturing;
    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === 'Escape') {
        setCapturing(null);
        return;
      }
      setDraft((prev) => ({
        ...prev,
        bindings: { ...prev.bindings, [action]: event.code },
      }));
      setCapturing(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing]);

  const handleSave = (): void => {
    onSaveSettings(cloneGameSettings(draft));
    onClose();
  };

  return (
    <MenuModalShell
      title="MODIFICAR CONTROLES"
      subtitle="Ajustes persistentes · se aplican al menú y a la partida"
      accent="#22d3ee"
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              setCapturing(null);
              setDraft(cloneGameSettings(DEFAULT_SETTINGS));
            }}
            className="cursor-pointer rounded-lg border-2 border-[#0b0b14] bg-white/10 px-4 py-2 text-[11px] font-black tracking-[0.16em] text-white transition-colors hover:bg-white/20"
          >
            RESTAURAR DEFECTO
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="cursor-pointer rounded-lg border-2 border-[#0b0b14] bg-gradient-to-r from-cyan-400 to-violet-500 px-5 py-2 text-[11px] font-black tracking-[0.16em] text-[#05010f] shadow-[4px_4px_0_#0b0b14] transition-transform hover:-translate-y-0.5 active:translate-y-0"
          >
            GUARDAR Y APLICAR
          </button>
        </div>
      }
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <SliderRow
            label="Sensibilidad del ratón"
            value={draft.mouseSensitivity}
            min={SETTINGS_LIMITS.mouseSensitivity.min}
            max={SETTINGS_LIMITS.mouseSensitivity.max}
            step={0.05}
            display={`${draft.mouseSensitivity.toFixed(2)}x`}
            onChange={(value) => setDraft((prev) => ({ ...prev, mouseSensitivity: value }))}
          />
          <SliderRow
            label="Campo de visión (FOV)"
            value={draft.baseFov}
            min={SETTINGS_LIMITS.baseFov.min}
            max={SETTINGS_LIMITS.baseFov.max}
            step={1}
            display={`${Math.round(draft.baseFov)}°`}
            onChange={(value) => setDraft((prev) => ({ ...prev, baseFov: value }))}
          />
          <SliderRow
            label="Volumen del audio"
            value={draft.masterVolume}
            min={SETTINGS_LIMITS.masterVolume.min}
            max={SETTINGS_LIMITS.masterVolume.max}
            step={0.05}
            display={`${Math.round(draft.masterVolume * 100)}%`}
            onChange={(value) => setDraft((prev) => ({ ...prev, masterVolume: value }))}
          />
        </div>

        <div className="space-y-3">
          <ToggleRow
            label="Invertir eje Y"
            checked={draft.invertY}
            onChange={(checked) => setDraft((prev) => ({ ...prev, invertY: checked }))}
          />
          <ToggleRow
            label="Trama Halftone (cómic)"
            checked={draft.halftonesEnabled}
            onChange={(checked) => setDraft((prev) => ({ ...prev, halftonesEnabled: checked }))}
          />
          <p className="rounded-lg border-2 border-white/10 bg-white/5 px-3 py-2 text-[10px] leading-relaxed text-slate-300">
            La sensibilidad y el eje Y afectan a la cámara de la partida; el FOV y la trama
            halftone se ven al instante en el diorama y en el juego.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <p className="mb-3 text-[11px] font-black uppercase tracking-[0.26em] text-violet-300">
          Asignación de teclas
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {CONTROL_ACTIONS.map((action) => {
            const isCapturing = capturing === action;
            return (
              <div
                key={action}
                className="flex items-center justify-between gap-2 rounded-lg border-2 border-white/10 bg-white/5 px-3 py-2"
              >
                <span className="text-[11px] font-bold text-slate-200">
                  {ACTION_LABELS[action]}
                </span>
                <button
                  type="button"
                  onClick={() => setCapturing(isCapturing ? null : action)}
                  className={`min-w-[92px] cursor-pointer rounded-md border-2 px-2 py-1 text-[10px] font-black tracking-[0.1em] transition-colors ${
                    isCapturing
                      ? 'animate-pulse border-amber-300 bg-amber-400/20 text-amber-200'
                      : 'border-cyan-300/40 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/20'
                  }`}
                >
                  {isCapturing ? 'PULSA TECLA...' : formatKeyCode(draft.bindings[action])}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </MenuModalShell>
  );
}
