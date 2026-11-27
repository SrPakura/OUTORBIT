import { useCallback, useState } from 'react';
import { loadGameSettings, saveGameSettings, type GameSettings } from '@/game/settings';
import { useI18n } from '@/i18n';
import MobileBlocker from '@/ui/MobileBlocker';
import TitleScreen from '@/ui/TitleScreen';
import DomeGameView from '@/ui/DomeGameView';

type Screen = 'title' | 'game';

/**
 * Punto de entrada UI: alterna entre portada (`TitleScreen`) y la cúpula
 * (`DomeGameView`). `settings` es la única fuente de verdad de los ajustes
 * persistentes (se inicializa desde `localStorage`, se guarda al aplicar y se
 * propaga en vivo al diorama de la portada y a la partida).
 */
export default function App() {
  const [screen, setScreen] = useState<Screen>('title');
  /** Modo Entrenamiento / Debug de la Cúpula (panel con F2 / Tab). */
  const [trainingMode, setTrainingMode] = useState(false);
  const [settings, setSettings] = useState<GameSettings>(() => loadGameSettings());
  const { language } = useI18n();

  /** Guarda en localStorage y propaga a la portada y a la partida. Conserva el
   * idioma activo del LanguageProvider (fuente de verdad del idioma). */
  const handleUpdateSettings = useCallback(
    (next: GameSettings) => {
      saveGameSettings({ ...next, language });
      setSettings(next);
    },
    [language],
  );

  const handleExitToTitle = useCallback(() => {
    setScreen('title');
  }, []);

  /** JUGAR: lanza la partida en la cúpula. */
  const handlePlay = useCallback(() => {
    setTrainingMode(false);
    setScreen('game');
  }, []);

  /** ENTRENAMIENTO [DEBUG]: cúpula con Nyx inmortal, Edén +25/s y panel debug. */
  const handlePlayTraining = useCallback(() => {
    setTrainingMode(true);
    setScreen('game');
  }, []);

  return (
    <div className="relative min-h-screen bg-[#05010f]">
      <MobileBlocker />

      {screen === 'title' ? (
        <TitleScreen
          onPlay={handlePlay}
          onPlayTraining={handlePlayTraining}
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
        />
      ) : (
        <DomeGameView
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          onExit={handleExitToTitle}
          trainingMode={trainingMode}
        />
      )}
    </div>
  );
}
