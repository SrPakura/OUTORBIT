import { useEffect, useState } from 'react';
import {
  CONTROL_ACTIONS,
  DEFAULT_GAMEPAD_BINDINGS,
  DEFAULT_SETTINGS,
  GAMEPAD_ACTIONS,
  SETTINGS_LIMITS,
  cloneGameSettings,
  formatGamepadButton,
  formatKeyCode,
  type ControlAction,
  type GamepadAction,
  type GamepadButtonIndex,
  type GameSettings,
} from '@/game/settings';
import { getConnectedGamepadName, readConnectedGamepad } from '@/game/input/GamepadInput';
import MenuModalShell from '@/ui/MenuModalShell';
import { useI18n } from '@/i18n';

const ACTION_LABEL_KEYS: Record<ControlAction, string> = {
  forward: 'controls.actions.forward',
  back: 'controls.actions.back',
  left: 'controls.actions.left',
  right: 'controls.actions.right',
  jump: 'controls.actions.jump',
  sprint: 'controls.actions.sprint',
  interact: 'controls.actions.interact',
  parry: 'controls.actions.parry',
  stasis: 'controls.actions.stasis',
  lockOn: 'controls.actions.lockOn',
  radar: 'controls.actions.radar',
  slot1: 'controls.actions.slot1',
  slot2: 'controls.actions.slot2',
  slot3: 'controls.actions.slot3',
};

const GAMEPAD_ACTION_LABEL_KEYS: Record<GamepadAction, string> = {
  attack: 'controls.gamepadActions.attack',
  dash: 'controls.gamepadActions.dash',
  jump: 'controls.gamepadActions.jump',
  skill: 'controls.gamepadActions.skill',
  cycleSlot: 'controls.gamepadActions.cycleSlot',
  pause: 'controls.gamepadActions.pause',
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

type ControlsTab = 'keyboard' | 'gamepad';

/**
 * Modal de Controles con dos pestañas:
 *
 *  - TECLADO / RATÓN: sensibilidad, eje Y, FOV, volumen, trama halftone y la
 *    rejilla de rebinding de las 13 acciones. Clic en un binding ->
 *    "PULSA TECLA..."; Escape cancela; cualquier otro `e.code` se asigna al instante.
 *
 *  - MANDO (PS4 / GENÉRICO): estado de conexión en vivo de la Gamepad API,
 *    sliders de sensibilidad/zona muerta, reasignación de cada acción
 *    pulsando el botón físico del mando y restauración por defecto.
 */
export default function ControlsModal({ settings, onClose, onSaveSettings }: ControlsModalProps) {
  const [draft, setDraft] = useState<GameSettings>(() => cloneGameSettings(settings));
  const [capturing, setCapturing] = useState<ControlAction | null>(null);
  const [tab, setTab] = useState<ControlsTab>('keyboard');
  const [capturingPad, setCapturingPad] = useState<GamepadAction | null>(null);
  // Estado de conexión en vivo del mando (poll + eventos de la Gamepad API).
  const [padName, setPadName] = useState<string | null>(() => getConnectedGamepadName());
  const { t } = useI18n();

  useEffect(() => {
    const update = () => setPadName(getConnectedGamepadName());
    update();
    const id = window.setInterval(update, 400);
    window.addEventListener('gamepadconnected', update);
    window.addEventListener('gamepaddisconnected', update);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('gamepadconnected', update);
      window.removeEventListener('gamepaddisconnected', update);
    };
  }, []);

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

  // Captura de botón de mando: espera un flanco real (pulsado ahora y no en
  // el poll anterior) para no asignar un botón que ya estuviera mantenida.
  useEffect(() => {
    if (!capturingPad) return;
    const action = capturingPad;
    let prevStates: boolean[] | null = null;
    let raf = 0;
    const poll = (): void => {
      raf = requestAnimationFrame(poll);
      const pad = readConnectedGamepad();
      if (!pad) return;
      const states: boolean[] = [];
      for (let i = 0; i < pad.buttons.length; i++) {
        const btn = pad.buttons[i];
        states.push(btn ? btn.pressed || btn.value > 0.5 : false);
      }
      if (prevStates) {
        for (let i = 0; i < states.length && i < 18; i++) {
          if (states[i] && !prevStates[i]) {
            const index = i as GamepadButtonIndex;
            setDraft((prev) => ({
              ...prev,
              gamepadBindings: { ...prev.gamepadBindings, [action]: index },
            }));
            setCapturingPad(null);
            return;
          }
        }
      }
      prevStates = states;
    };
    raf = requestAnimationFrame(poll);
    const onKey = (event: KeyboardEvent): void => {
      if (event.code === 'Escape') setCapturingPad(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [capturingPad]);

  const handleSave = (): void => {
    setCapturing(null);
    setCapturingPad(null);
    onSaveSettings(cloneGameSettings(draft));
    onClose();
  };

  const handleResetGamepad = (): void => {
    setCapturingPad(null);
    setDraft((prev) => ({
      ...prev,
      gamepadSensitivity: DEFAULT_SETTINGS.gamepadSensitivity,
      gamepadDeadzone: DEFAULT_SETTINGS.gamepadDeadzone,
      gamepadBindings: { ...DEFAULT_GAMEPAD_BINDINGS },
    }));
  };

  return (
    <MenuModalShell
      title={t('controls.title')}
      subtitle={t('controls.subtitle')}
      accent="#22d3ee"
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              setCapturing(null);
              setCapturingPad(null);
              setDraft(cloneGameSettings(DEFAULT_SETTINGS));
            }}
            className="cursor-pointer rounded-lg border-2 border-[#0b0b14] bg-white/10 px-4 py-2 text-[11px] font-black tracking-[0.16em] text-white transition-colors hover:bg-white/20"
          >
            {t('controls.restoreDefaults')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="cursor-pointer rounded-lg border-2 border-[#0b0b14] bg-gradient-to-r from-cyan-400 to-violet-500 px-5 py-2 text-[11px] font-black tracking-[0.16em] text-[#05010f] shadow-[4px_4px_0_#0b0b14] transition-transform hover:-translate-y-0.5 active:translate-y-0"
          >
            {t('controls.saveApply')}
          </button>
        </div>
      }
    >
      {/* Pestañas: Teclado/Ratón y Mando */}
      <div className="mb-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab('keyboard')}
          className={`cursor-pointer rounded-lg border-2 px-4 py-1.5 text-[11px] font-black tracking-[0.16em] transition-colors ${
            tab === 'keyboard'
              ? 'border-cyan-300 bg-cyan-400/20 text-cyan-100'
              : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
          }`}
        >
          {t('controls.tabKeyboard')}
        </button>
        <button
          type="button"
          onClick={() => setTab('gamepad')}
          className={`cursor-pointer rounded-lg border-2 px-4 py-1.5 text-[11px] font-black tracking-[0.16em] transition-colors ${
            tab === 'gamepad'
              ? 'border-violet-300 bg-violet-400/20 text-violet-100'
              : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
          }`}
        >
          {t('controls.tabGamepad')}
        </button>
      </div>

      {tab === 'keyboard' && (
        <>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-4">
              <SliderRow
                label={t('controls.mouseSensitivity')}
                value={draft.mouseSensitivity}
                min={SETTINGS_LIMITS.mouseSensitivity.min}
                max={SETTINGS_LIMITS.mouseSensitivity.max}
                step={0.05}
                display={`${draft.mouseSensitivity.toFixed(2)}x`}
                onChange={(value) => setDraft((prev) => ({ ...prev, mouseSensitivity: value }))}
              />
              <SliderRow
                label={t('controls.fov')}
                value={draft.baseFov}
                min={SETTINGS_LIMITS.baseFov.min}
                max={SETTINGS_LIMITS.baseFov.max}
                step={1}
                display={`${Math.round(draft.baseFov)}°`}
                onChange={(value) => setDraft((prev) => ({ ...prev, baseFov: value }))}
              />
              <SliderRow
                label={t('controls.volume')}
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
                label={t('controls.invertY')}
                checked={draft.invertY}
                onChange={(checked) => setDraft((prev) => ({ ...prev, invertY: checked }))}
              />
              <ToggleRow
                label={t('controls.halftone')}
                checked={draft.halftonesEnabled}
                onChange={(checked) => setDraft((prev) => ({ ...prev, halftonesEnabled: checked }))}
              />
              <p className="rounded-lg border-2 border-white/10 bg-white/5 px-3 py-2 text-[10px] leading-relaxed text-slate-300">
                {t('controls.keyboardHint')}
              </p>
            </div>
          </div>

          <div className="mt-6">
            <p className="mb-3 text-[11px] font-black uppercase tracking-[0.26em] text-violet-300">
              {t('controls.keyBindings')}
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
                      {t(ACTION_LABEL_KEYS[action])}
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
                      {isCapturing ? t('controls.pressKey') : formatKeyCode(draft.bindings[action])}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {tab === 'gamepad' && (
        <div className="space-y-5">
          {/* Estado de conexión en vivo */}
          <div
            className={`flex items-center justify-between gap-3 rounded-lg border-2 px-3 py-2 ${
              padName
                ? 'border-emerald-300/40 bg-emerald-400/10'
                : 'border-white/10 bg-white/5'
            }`}
          >
            <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-200">
              {t('controls.gamepadConnected')}
            </span>
            <span
              className={`max-w-[60%] truncate text-right text-[10px] font-bold ${
                padName ? 'text-emerald-200' : 'text-slate-400'
              }`}
              title={padName ?? undefined}
            >
              {padName ?? t('controls.gamepadNone')}
            </span>
          </div>
          {!padName && (
            <p className="rounded-lg border-2 border-white/10 bg-white/5 px-3 py-2 text-[10px] leading-relaxed text-slate-300">
              {t('controls.gamepadConnectHint')}
            </p>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            <SliderRow
              label={t('controls.stickSensitivity')}
              value={draft.gamepadSensitivity}
              min={SETTINGS_LIMITS.gamepadSensitivity.min}
              max={SETTINGS_LIMITS.gamepadSensitivity.max}
              step={0.05}
              display={`${draft.gamepadSensitivity.toFixed(2)}x`}
              onChange={(value) => setDraft((prev) => ({ ...prev, gamepadSensitivity: value }))}
            />
            <SliderRow
              label={t('controls.deadzone')}
              value={draft.gamepadDeadzone}
              min={SETTINGS_LIMITS.gamepadDeadzone.min}
              max={SETTINGS_LIMITS.gamepadDeadzone.max}
              step={0.01}
              display={`${Math.round(draft.gamepadDeadzone * 100)}%`}
              onChange={(value) => setDraft((prev) => ({ ...prev, gamepadDeadzone: value }))}
            />
          </div>

          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-black uppercase tracking-[0.26em] text-violet-300">
                {t('controls.buttonBindings')}
              </p>
              <button
                type="button"
                onClick={handleResetGamepad}
                className="cursor-pointer rounded-lg border-2 border-[#0b0b14] bg-white/10 px-4 py-1.5 text-[10px] font-black tracking-[0.16em] text-white transition-colors hover:bg-white/20"
              >
                {t('controls.resetGamepad')}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {GAMEPAD_ACTIONS.map((action) => {
                const isCapturing = capturingPad === action;
                return (
                  <div
                    key={action}
                    className="flex items-center justify-between gap-2 rounded-lg border-2 border-white/10 bg-white/5 px-3 py-2"
                  >
                    <span className="text-[11px] font-bold text-slate-200">
                      {t(GAMEPAD_ACTION_LABEL_KEYS[action])}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCapturingPad(isCapturing ? null : action)}
                      className={`min-w-[110px] cursor-pointer rounded-md border-2 px-2 py-1 text-[10px] font-black tracking-[0.1em] transition-colors ${
                        isCapturing
                          ? 'animate-pulse border-amber-300 bg-amber-400/20 text-amber-200'
                          : 'border-violet-300/40 bg-violet-400/10 text-violet-100 hover:bg-violet-400/20'
                      }`}
                    >
                      {isCapturing
                        ? t('controls.pressButton')
                        : formatGamepadButton(draft.gamepadBindings[action])}
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 rounded-lg border-2 border-white/10 bg-white/5 px-3 py-2 text-[10px] leading-relaxed text-slate-300">
              {t('controls.w3cMappingNote')}
            </p>
          </div>
        </div>
      )}
    </MenuModalShell>
  );
}