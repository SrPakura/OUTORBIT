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
import { areAllTutorialsCompleted, setAllTutorialsCompleted } from '@/game/localStorageState';
import { useI18n } from '@/i18n';

// ============================================================================
// Pantalla de AJUSTES — misma ADN visual que la subida de nivel: papel
// #f1f1ed, tinta #0b0d12, sombras duras, chips sesgados y acentos
// carmesí/cian/dorado. Tres pestañas: GENERAL (sensibilidad, volúmenes,
// cámara, visual, idioma), TECLADO Y RATÓN (rebinding de las 14 acciones) y
// MANDO (estado en vivo, sensibilidad/zona muerta y rebinding de botones) —
// así quien entre ve que el mando se puede usar.
//
// Todo se aplica al instante: cada cambio dispara onUpdateSettings, que
// persiste en localStorage y propaga al juego en vivo.
// ============================================================================

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
  attackAlt: 'controls.gamepadActions.attackAlt',
  dash: 'controls.gamepadActions.dash',
  dashAlt: 'controls.gamepadActions.dashAlt',
  jump: 'controls.gamepadActions.jump',
  slot1: 'controls.gamepadActions.slot1',
  slot2: 'controls.gamepadActions.slot2',
  slot3: 'controls.gamepadActions.slot3',
  pause: 'controls.gamepadActions.pause',
};

export interface SettingsScreenProps {
  settings: GameSettings;
  onClose: () => void;
  /** Aplica y persiste al instante (vive en App.tsx). */
  onUpdateSettings: (settings: GameSettings) => void;
}

type SettingsTab = 'general' | 'keyboard' | 'gamepad';

// ---------------------------------------------------------------------------
// Fila de slider estilo manga: etiqueta tinta, chip de valor sesgado y pista
// con thumb cuadrado de tinta sobre filo de acento.
// ---------------------------------------------------------------------------
function SliderRow({
  label,
  accent,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  accent: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="set-row" style={{ '--accent': accent } as React.CSSProperties}>
      <span className="set-row__label">{label}</span>
      <span className="set-row__value">{display}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="set-slider"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Interruptor: chip [SÍ]/[NO] con acento.
// ---------------------------------------------------------------------------
function ToggleRow({
  label,
  accent,
  checked,
  onChange,
}: {
  label: string;
  accent: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button type="button" className="set-row set-row--toggle" onClick={() => onChange(!checked)}>
      <span className="set-row__label">{label}</span>
      <span
        className="set-chip"
        style={{
          background: checked ? accent : 'transparent',
          color: checked ? '#fff' : 'rgba(11,13,18,0.45)',
          borderColor: checked ? accent : 'rgba(11,13,18,0.35)',
        }}
      >
        {checked ? 'ON' : 'OFF'}
      </span>
    </button>
  );
}

export default function SettingsScreen({ settings, onClose, onUpdateSettings }: SettingsScreenProps) {
  const { t, language, setLanguage } = useI18n();
  const [tab, setTab] = useState<SettingsTab>('general');
  const [skipTutorials, setSkipTutorials] = useState<boolean>(() => areAllTutorialsCompleted());
  const [capturing, setCapturing] = useState<ControlAction | null>(null);
  const [capturingPad, setCapturingPad] = useState<GamepadAction | null>(null);
  const [padName, setPadName] = useState<string | null>(() => getConnectedGamepadName());

  // Aplicación en vivo: cada cambio se persiste y propaga al instante.
  const patch = (mutate: (draft: GameSettings) => GameSettings): void => {
    onUpdateSettings(mutate(cloneGameSettings(settings)));
  };

  // Estado de conexión en vivo del mando (poll + eventos de la Gamepad API).
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

  // ESC cierra la pantalla (salvo mientras se captura una tecla/botón).
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.code === 'Escape' && !capturing && !capturingPad) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, capturing, capturingPad]);

  // Captura de tecla: cualquier `e.code` se asigna al instante; ESC cancela.
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
      patch((draft) => ({ ...draft, bindings: { ...draft.bindings, [action]: event.code } }));
      setCapturing(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            patch((draft) => ({
              ...draft,
              gamepadBindings: { ...draft.gamepadBindings, [action]: index },
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturingPad]);

  const handleResetAll = (): void => {
    setCapturing(null);
    setCapturingPad(null);
    onUpdateSettings(cloneGameSettings(DEFAULT_SETTINGS));
  };

  const handleResetGamepad = (): void => {
    setCapturingPad(null);
    patch((draft) => ({
      ...draft,
      gamepadSensitivity: DEFAULT_SETTINGS.gamepadSensitivity,
      gamepadDeadzone: DEFAULT_SETTINGS.gamepadDeadzone,
      gamepadBindings: { ...DEFAULT_GAMEPAD_BINDINGS },
    }));
  };

  const tabs: Array<{ id: SettingsTab; label: string; accent: string }> = [
    { id: 'general', label: t('settings.tabGeneral'), accent: '#e11d48' },
    { id: 'keyboard', label: t('settings.tabKeyboard'), accent: '#22d3ee' },
    { id: 'gamepad', label: t('settings.tabGamepad'), accent: '#fbbf24' },
  ];

  return (
    <div className="set-root">
      <div className="set-speedlines" />

      <div className="set-header">
        <h1 className="set-title">{t('settings.title')}</h1>
        <p className="set-banner">
          {t('settings.subtitle')}
          <span className="set-banner__slash" />
        </p>
        <button type="button" className="set-close" onClick={onClose}>
          {t('settings.close')} [ESC]
        </button>
      </div>

      {/* Pestañas */}
      <div className="set-tabs">
        {tabs.map(({ id, label, accent }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`set-tab${tab === id ? ' is-on' : ''}`}
            style={{ '--accent': accent } as React.CSSProperties}
          >
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="set-content">
        {tab === 'general' && (
          <div className="set-grid">
            <section className="set-panel">
              <h2 className="set-panel__title" style={{ '--accent': '#22d3ee' } as React.CSSProperties}>
                {t('settings.sectionCamera')}
              </h2>
              <SliderRow
                label={t('settings.mouseSensitivity')}
                accent="#22d3ee"
                value={settings.mouseSensitivity}
                min={SETTINGS_LIMITS.mouseSensitivity.min}
                max={SETTINGS_LIMITS.mouseSensitivity.max}
                step={0.05}
                display={`${settings.mouseSensitivity.toFixed(2)}x`}
                onChange={(value) => patch((draft) => ({ ...draft, mouseSensitivity: value }))}
              />
              <SliderRow
                label={t('settings.fov')}
                accent="#22d3ee"
                value={settings.baseFov}
                min={SETTINGS_LIMITS.baseFov.min}
                max={SETTINGS_LIMITS.baseFov.max}
                step={1}
                display={`${Math.round(settings.baseFov)}°`}
                onChange={(value) => patch((draft) => ({ ...draft, baseFov: value }))}
              />
              <ToggleRow
                label={t('settings.invertY')}
                accent="#22d3ee"
                checked={settings.invertY}
                onChange={(checked) => patch((draft) => ({ ...draft, invertY: checked }))}
              />
            </section>

            <section className="set-panel">
              <h2 className="set-panel__title" style={{ '--accent': '#e11d48' } as React.CSSProperties}>
                {t('settings.sectionAudio')}
              </h2>
              <SliderRow
                label={t('settings.masterVolume')}
                accent="#e11d48"
                value={settings.masterVolume}
                min={SETTINGS_LIMITS.masterVolume.min}
                max={SETTINGS_LIMITS.masterVolume.max}
                step={0.05}
                display={`${Math.round(settings.masterVolume * 100)}%`}
                onChange={(value) => patch((draft) => ({ ...draft, masterVolume: value }))}
              />
              <SliderRow
                label={t('settings.musicVolume')}
                accent="#e11d48"
                value={settings.musicVolume}
                min={SETTINGS_LIMITS.musicVolume.min}
                max={SETTINGS_LIMITS.musicVolume.max}
                step={0.05}
                display={`${Math.round(settings.musicVolume * 100)}%`}
                onChange={(value) => patch((draft) => ({ ...draft, musicVolume: value }))}
              />
              <SliderRow
                label={t('settings.sfxVolume')}
                accent="#e11d48"
                value={settings.sfxVolume}
                min={SETTINGS_LIMITS.sfxVolume.min}
                max={SETTINGS_LIMITS.sfxVolume.max}
                step={0.05}
                display={`${Math.round(settings.sfxVolume * 100)}%`}
                onChange={(value) => patch((draft) => ({ ...draft, sfxVolume: value }))}
              />
            </section>

            <section className="set-panel">
              <h2 className="set-panel__title" style={{ '--accent': '#fbbf24' } as React.CSSProperties}>
                {t('settings.sectionVisual')}
              </h2>
              <ToggleRow
                label={t('settings.halftone')}
                accent="#fbbf24"
                checked={settings.halftonesEnabled}
                onChange={(checked) => patch((draft) => ({ ...draft, halftonesEnabled: checked }))}
              />
              <ToggleRow
                label={t('settings.easyMode')}
                accent="#fbbf24"
                checked={settings.easyMode}
                onChange={(checked) => patch((draft) => ({ ...draft, easyMode: checked }))}
              />
              <ToggleRow
                label={t('settings.skipTutorials')}
                accent="#fbbf24"
                checked={skipTutorials}
                onChange={(checked) => {
                  setAllTutorialsCompleted(checked);
                  setSkipTutorials(checked);
                }}
              />
              <div className="set-row set-row--toggle">
                <span className="set-row__label">{t('settings.language')}</span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (language !== 'es') setLanguage('es');
                    }}
                    className="set-chip set-chip--btn"
                    style={
                      language === 'es'
                        ? { background: '#0b0d12', color: '#22d3ee', borderColor: '#0b0d12' }
                        : undefined
                    }
                  >
                    ES
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (language !== 'en') setLanguage('en');
                    }}
                    className="set-chip set-chip--btn"
                    style={
                      language === 'en'
                        ? { background: '#0b0d12', color: '#22d3ee', borderColor: '#0b0d12' }
                        : undefined
                    }
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (language !== 'ja') setLanguage('ja');
                    }}
                    className="set-chip set-chip--btn"
                    style={
                      language === 'ja'
                        ? { background: '#0b0d12', color: '#22d3ee', borderColor: '#0b0d12' }
                        : undefined
                    }
                  >
                    JA
                  </button>
                </span>
              </div>
            </section>
          </div>
        )}

        {tab === 'keyboard' && (
          <div className="set-panel">
            <h2 className="set-panel__title" style={{ '--accent': '#22d3ee' } as React.CSSProperties}>
              {t('controls.keyBindings')}
            </h2>
            <p className="set-note">{t('controls.keyboardHint')}</p>
            <div className="set-bindings">
              {CONTROL_ACTIONS.map((action) => {
                const isCapturing = capturing === action;
                return (
                  <div key={action} className="set-binding">
                    <span className="set-binding__label">{t(ACTION_LABEL_KEYS[action])}</span>
                    <button
                      type="button"
                      onClick={() => setCapturing(isCapturing ? null : action)}
                      className={`set-key${isCapturing ? ' is-capturing' : ''}`}
                    >
                      {isCapturing ? t('controls.pressKey') : formatKeyCode(settings.bindings[action])}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'gamepad' && (
          <div className="set-grid">
            <section className="set-panel">
              <h2 className="set-panel__title" style={{ '--accent': '#fbbf24' } as React.CSSProperties}>
                {t('settings.tabGamepad')}
              </h2>
              <div className="set-row">
                <span className="set-row__label">{t('controls.gamepadConnected')}</span>
                <span
                  className="set-chip"
                  style={
                    padName
                      ? { background: '#fbbf24', color: '#0b0d12', borderColor: '#fbbf24' }
                      : undefined
                  }
                  title={padName ?? undefined}
                >
                  {padName ?? t('controls.gamepadNone')}
                </span>
              </div>
              {!padName && <p className="set-note">{t('controls.gamepadConnectHint')}</p>}
              <SliderRow
                label={t('controls.stickSensitivity')}
                accent="#fbbf24"
                value={settings.gamepadSensitivity}
                min={SETTINGS_LIMITS.gamepadSensitivity.min}
                max={SETTINGS_LIMITS.gamepadSensitivity.max}
                step={0.05}
                display={`${settings.gamepadSensitivity.toFixed(2)}x`}
                onChange={(value) => patch((draft) => ({ ...draft, gamepadSensitivity: value }))}
              />
              <SliderRow
                label={t('controls.deadzone')}
                accent="#fbbf24"
                value={settings.gamepadDeadzone}
                min={SETTINGS_LIMITS.gamepadDeadzone.min}
                max={SETTINGS_LIMITS.gamepadDeadzone.max}
                step={0.01}
                display={`${Math.round(settings.gamepadDeadzone * 100)}%`}
                onChange={(value) => patch((draft) => ({ ...draft, gamepadDeadzone: value }))}
              />
            </section>

            <section className="set-panel">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="set-panel__title" style={{ '--accent': '#fbbf24' } as React.CSSProperties}>
                  {t('controls.buttonBindings')}
                </h2>
                <button type="button" className="set-mini-btn" onClick={handleResetGamepad}>
                  {t('controls.resetGamepad')}
                </button>
              </div>
              <div className="set-bindings set-bindings--pad">
                {GAMEPAD_ACTIONS.map((action) => {
                  const isCapturing = capturingPad === action;
                  return (
                    <div key={action} className="set-binding">
                      <span className="set-binding__label">{t(GAMEPAD_ACTION_LABEL_KEYS[action])}</span>
                      <button
                        type="button"
                        onClick={() => setCapturingPad(isCapturing ? null : action)}
                        className={`set-key set-key--pad${isCapturing ? ' is-capturing' : ''}`}
                      >
                        {isCapturing
                          ? t('controls.pressButton')
                          : formatGamepadButton(settings.gamepadBindings[action])}
                      </button>
                    </div>
                  );
                })}
              </div>
              <p className="set-note">{t('controls.w3cMappingNote')}</p>
            </section>
          </div>
        )}
      </div>

      <div className="set-footer">
        <button type="button" className="set-restore" onClick={handleResetAll}>
          {t('settings.restoreAll')}
        </button>
      </div>

      <style>{`
        .set-root {
          position: fixed;
          inset: 0;
          z-index: 60;
          overflow-y: auto;
          background-color: #f1f1ed;
          background-image:
            linear-gradient(rgba(11,13,18,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(11,13,18,0.06) 1px, transparent 1px);
          background-size: 96px 96px;
          color: #0b0d12;
          font-family: "Helvetica Neue", Helvetica, Arial, "Noto Sans JP", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        .set-speedlines {
          position: fixed;
          inset: -12%;
          pointer-events: none;
          background: repeating-conic-gradient(
            from 0deg at 50% 30%,
            transparent 0deg 5.2deg,
            rgba(11, 13, 18, 0.045) 5.2deg 5.9deg
          );
          -webkit-mask-image: radial-gradient(circle at 50% 30%, transparent 30%, #000 85%);
          mask-image: radial-gradient(circle at 50% 30%, transparent 30%, #000 85%);
        }

        .set-header {
          position: relative;
          padding: 5vh 4vw 0;
        }
        .set-title {
          margin: 0;
          font-size: clamp(56px, 9vw, 120px);
          font-weight: 900;
          font-style: italic;
          letter-spacing: -0.05em;
          line-height: 0.9;
          color: transparent;
          -webkit-text-stroke: 3px #0b0d12;
          text-shadow: 6px 6px 0 rgba(225, 29, 72, 0.25);
        }
        .set-banner {
          position: relative;
          display: inline-block;
          margin: 10px 0 0;
          background: #0b0d12;
          color: #fff;
          font-weight: 900;
          font-style: italic;
          font-size: clamp(13px, 1.6vw, 19px);
          letter-spacing: 0.04em;
          padding: 7px 22px 10px;
          box-shadow: 5px 5px 0 #e11d48;
          transform: rotate(-2deg);
        }
        .set-banner__slash {
          position: absolute;
          left: -40px;
          top: -12px;
          width: 130%;
          height: 7px;
          background: #e11d48;
          transform: rotate(-2deg) scaleX(0);
          transform-origin: left center;
          z-index: -1;
          animation: setSlashIn 260ms cubic-bezier(.6, 0, .2, 1) 180ms forwards;
        }
        @keyframes setSlashIn { to { transform: rotate(-2deg) scaleX(1); } }
        .set-close {
          position: absolute;
          right: 4vw;
          top: 5vh;
          background: #0b0d12;
          color: #fff;
          border: 2px solid #0b0d12;
          font: 800 11px/1 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.18em;
          padding: 10px 14px 9px;
          cursor: pointer;
          transform: skewX(-8deg);
          box-shadow: 4px 4px 0 #22d3ee;
          transition: transform 120ms ease, box-shadow 120ms ease;
        }
        .set-close:hover { transform: skewX(-8deg) translateY(-2px); box-shadow: 6px 6px 0 #22d3ee; }

        .set-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          padding: 3.5vh 4vw 0;
        }
        .set-tab {
          background: #fbfbf8;
          border: 3px solid #0b0d12;
          font: 900 13px/1 "Helvetica Neue", Helvetica, Arial, sans-serif;
          font-style: italic;
          letter-spacing: 0.08em;
          padding: 12px 22px 13px;
          cursor: pointer;
          transform: skewX(-8deg);
          color: #0b0d12;
          box-shadow: 4px 4px 0 rgba(11,13,18,0.25);
          transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
        }
        .set-tab.is-on {
          background: #0b0d12;
          color: #fff;
          box-shadow: 5px 5px 0 var(--accent, #e11d48);
          transform: skewX(-8deg) translateY(-2px);
        }
        .set-tab > span { display: block; transform: skewX(8deg); }

        .set-content { padding: 3vh 4vw 0; }
        .set-grid {
          display: grid;
          gap: 22px;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          align-items: start;
        }
        .set-panel {
          position: relative;
          background: #fbfbf8;
          border: 3px solid #0b0d12;
          box-shadow: 8px 8px 0 rgba(11,13,18,0.9);
          padding: 20px 20px 18px;
        }
        .set-panel::before {
          content: "";
          position: absolute;
          inset: 0;
          background-image: radial-gradient(rgba(11,13,18,0.08) 1.5px, transparent 1.7px);
          background-size: 11px 11px;
          -webkit-mask-image: linear-gradient(200deg, #000 0%, transparent 46%);
          mask-image: linear-gradient(200deg, #000 0%, transparent 46%);
          pointer-events: none;
        }
        .set-panel__title {
          margin: 0 0 14px;
          font-size: 15px;
          font-weight: 900;
          font-style: italic;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #0b0d12;
          display: inline-block;
          background: var(--accent, #0b0d12);
          color: #fff;
          padding: 5px 12px 6px;
          transform: skewX(-8deg);
        }

        .set-row {
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: center;
          gap: 6px 14px;
          padding: 9px 0;
          border-bottom: 2px dotted rgba(11,13,18,0.18);
        }
        .set-row:last-child { border-bottom: none; }
        .set-row__label {
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #0b0d12;
        }
        .set-row__value {
          font: 800 11px/1 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          background: #0b0d12;
          color: #22d3ee;
          padding: 5px 9px 4px;
          transform: skewX(-8deg);
        }
        .set-slider { grid-column: 1 / -1; }
        .set-row--toggle {
          width: 100%;
          background: transparent;
          border: none;
          cursor: pointer;
          text-align: left;
        }
        .set-chip {
          display: inline-block;
          font: 800 10px/1 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.16em;
          padding: 6px 10px 5px;
          border: 2px solid rgba(11,13,18,0.35);
          transform: skewX(-8deg);
          max-width: 220px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .set-chip--btn { cursor: pointer; background: transparent; color: rgba(11,13,18,0.6); }
        .set-chip--btn:hover { border-color: #0b0d12; color: #0b0d12; }

        /* Slider manga: pista de tinta con thumb cuadrado y filo de acento */
        .set-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 18px;
          background: transparent;
          cursor: pointer;
          margin: 2px 0 0;
        }
        .set-slider::-webkit-slider-runnable-track {
          height: 8px;
          background: #0b0d12;
          border: 2px solid #0b0d12;
        }
        .set-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          margin-top: -7px;
          background: #f1f1ed;
          border: 3px solid var(--accent, #e11d48);
          box-shadow: 2px 2px 0 #0b0d12;
        }
        .set-slider::-moz-range-track {
          height: 8px;
          background: #0b0d12;
          border: 2px solid #0b0d12;
        }
        .set-slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 0;
          background: #f1f1ed;
          border: 3px solid var(--accent, #e11d48);
          box-shadow: 2px 2px 0 #0b0d12;
        }

        .set-note {
          margin: 12px 0 0;
          font-size: 11px;
          line-height: 1.55;
          color: #2a2f3d;
          border: 2px dashed rgba(11,13,18,0.35);
          padding: 10px 12px;
          background: rgba(255,255,255,0.5);
        }

        .set-bindings {
          display: grid;
          gap: 8px;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          margin-top: 14px;
        }
        .set-bindings--pad { grid-template-columns: 1fr; }
        .set-binding {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border: 2px solid rgba(11,13,18,0.8);
          background: rgba(255,255,255,0.6);
          padding: 8px 10px;
        }
        .set-binding__label {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: #0b0d12;
        }
        .set-key {
          min-width: 96px;
          background: #0b0d12;
          color: #22d3ee;
          border: 2px solid #0b0d12;
          font: 800 10px/1 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.1em;
          padding: 7px 10px 6px;
          cursor: pointer;
          transform: skewX(-8deg);
          transition: background 100ms ease, color 100ms ease;
        }
        .set-key:hover { background: #22d3ee; color: #0b0d12; }
        .set-key--pad { color: #fbbf24; }
        .set-key--pad:hover { background: #fbbf24; color: #0b0d12; }
        .set-key.is-capturing {
          background: #e11d48;
          color: #fff;
          animation: setCapturePulse 0.6s steps(2) infinite;
        }
        @keyframes setCapturePulse { 50% { background: #0b0d12; } }

        .set-mini-btn {
          background: transparent;
          border: 2px solid #0b0d12;
          color: #0b0d12;
          font: 800 9px/1 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.14em;
          padding: 7px 10px 6px;
          cursor: pointer;
          transform: skewX(-8deg);
        }
        .set-mini-btn:hover { background: #0b0d12; color: #fbbf24; }

        .set-footer {
          display: flex;
          justify-content: center;
          padding: 4vh 4vw 5vh;
        }
        .set-restore {
          background: #e11d48;
          color: #fff;
          border: 3px solid #0b0d12;
          font: 900 12px/1 "Helvetica Neue", Helvetica, Arial, sans-serif;
          font-style: italic;
          letter-spacing: 0.1em;
          padding: 13px 26px 14px;
          cursor: pointer;
          transform: skewX(-8deg);
          box-shadow: 6px 6px 0 #0b0d12;
          transition: transform 120ms ease, box-shadow 120ms ease;
        }
        .set-restore:hover { transform: skewX(-8deg) translateY(-2px); box-shadow: 8px 8px 0 #0b0d12; }
        .set-restore:active { transform: skewX(-8deg) translateY(1px); box-shadow: 4px 4px 0 #0b0d12; }
      `}</style>
    </div>
  );
}
