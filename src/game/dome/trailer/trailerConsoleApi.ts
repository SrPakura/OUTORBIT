import type { EnemyArchetype } from '@/game/dome/DomeCombatSystem';
import type { ActiveSkillId } from '@/game/dome/DomeProgression';
import {
  downloadReplayFile,
  pickReplayFileFromDisk,
} from './DomeReplaySystem';
import { generateRandomSeed } from './seededRandom';
import type {
  ReplayCameraMode,
  ReplayFileV1,
  TrailerBotConfig,
  TrailerBotStyle,
  TrailerSessionRequest,
} from './trailerTypes';

// ============================================================================
// trailerConsoleApi — Interfaz oculta en window.outorbitTrailer / window.trailer
// para activar el Bot, descargar grabaciones y controlar el Modo Teatro.
// ============================================================================

export interface TrailerStartOptions {
  wave?: number;
  oleada?: number;
  seed?: number;
  loadout?: [ActiveSkillId, ActiveSkillId, ActiveSkillId];
  infiniteEden?: boolean;
  godMode?: boolean;
  hud?: boolean;
  style?: TrailerBotStyle;
  trickshotRate?: number;
  trainingArchetype?: EnemyArchetype | null;
}

export interface TrailerReplayOptions {
  camera?: ReplayCameraMode;
  speed?: number;
  hud?: boolean;
}

export interface TrailerRuntimeBridge {
  stopRecording: () => ReplayFileV1 | null;
  setCamera: (mode: ReplayCameraMode) => void;
  setSpeed: (speed: number) => void;
  togglePause: () => boolean;
  setHud: (visible: boolean) => void;
  getStatus: () => Record<string, unknown>;
}

export interface TrailerHostHooks {
  launchSession: (request: TrailerSessionRequest | null) => void;
}

let hostHooks: TrailerHostHooks | null = null;
let runtimeBridge: TrailerRuntimeBridge | null = null;
let lastRecordedReplay: ReplayFileV1 | null = null;

export function registerTrailerHost(hooks: TrailerHostHooks | null): void {
  hostHooks = hooks;
}

export function registerTrailerRuntime(bridge: TrailerRuntimeBridge | null): void {
  runtimeBridge = bridge;
}

export function setLastRecordedReplay(replay: ReplayFileV1 | null): void {
  lastRecordedReplay = replay;
}

function normalizeStartConfig(opts: TrailerStartOptions = {}): TrailerBotConfig {
  const waveRaw = opts.oleada ?? opts.wave ?? 1;
  return {
    wave: Math.max(1, Math.floor(waveRaw)),
    seed: typeof opts.seed === 'number' ? opts.seed >>> 0 : generateRandomSeed(),
    loadout: opts.loadout ?? ['gravity_field', 'bounce_horizon', 'black_hole'],
    infiniteEden: opts.infiniteEden ?? true,
    godMode: opts.godMode ?? true,
    hud: opts.hud ?? false,
    style: opts.style ?? 'hyper',
    trickshotRate: opts.trickshotRate ?? 1.0,
    trainingArchetype: opts.trainingArchetype ?? null,
  };
}

export const outorbitTrailerApi = {
  help(): void {
    console.info(
      `%c[OUTORBIT Trailer & Replay Theater]
%cComandos disponibles (window.outorbitTrailer / window.trailer):
  trailer.start({ oleada: 1, hud: false, style: 'hyper'|'cinematic'|'flow'|'dodge'|'parry' })
  trailer.oleada(4, { style: 'parry' }) -> atajo directo de oleada (4=Gólem, 5=Gorrión, 10=Prisma, 15=KRONOS)
  trailer.stop()                         -> detiene el bot y guarda la toma en memoria
  trailer.download('toma.json')          -> descarga el .outorbit-replay.json
  trailer.playLast({ camera: 'free' })   -> reproduce la última toma en Modo Teatro
  trailer.loadReplay({ camera: 'free' }) -> carga un .outorbit-replay.json del disco
  trailer.setCamera('bot'|'free'|'orbit'|'director')
  trailer.setSpeed(0.25)                 -> 0 (pausa) .. 2.0
  trailer.togglePause()
  trailer.setHud(false|true)
  trailer.exit()                         -> vuelve al modo normal

Atajos en Modo Teatro (Replay):
  1/2/3/4 = bot / free / orbit / director
  Space   = pausar / reanudar sim (cámara libre sigue activa)
  [ / ]   = bajar / subir velocidad
  R       = reiniciar replay | H = mostrar/ocultar HUD
  FreeCam = WASD + Q/E + Ratón + Shift/Ctrl + Rueda(FOV) + Z/X(Roll) + C(Reset Roll)`,
      'color:#22d3ee;font-weight:bold;font-size:13px',
      'color:#e2e8f0;font-size:12px',
    );
  },

  oleada(n: number, opts: Omit<TrailerStartOptions, 'wave' | 'oleada'> = {}): void {
    outorbitTrailerApi.start({ ...opts, oleada: n });
  },

  wave(n: number, opts: Omit<TrailerStartOptions, 'wave' | 'oleada'> = {}): void {
    outorbitTrailerApi.start({ ...opts, wave: n });
  },

  start(opts: TrailerStartOptions = {}): void {
    if (!hostHooks) {
      console.warn('[OUTORBIT Trailer] Entra primero en el modo Cúpula para iniciar el Bot.');
      return;
    }
    const config = normalizeStartConfig(opts);
    console.info(
      `[OUTORBIT Trailer] Iniciando Bot | wave=${config.wave} seed=${config.seed} style=${config.style}`,
    );
    hostHooks.launchSession({ mode: 'record', config });
  },

  stop(): ReplayFileV1 | null {
    if (!runtimeBridge) {
      console.warn('[OUTORBIT Trailer] No hay grabación activa.');
      return lastRecordedReplay;
    }
    const replay = runtimeBridge.stopRecording();
    if (replay) {
      lastRecordedReplay = replay;
      console.info(
        `[OUTORBIT Trailer] Toma guardada en memoria (${replay.frames.length} frames, ${(replay.frames.length / 60).toFixed(1)}s). Usa trailer.download() o trailer.playLast().`,
      );
    }
    return replay;
  },

  download(filename?: string): string | null {
    const replay = runtimeBridge?.stopRecording() ?? lastRecordedReplay;
    if (!replay) {
      console.warn('[OUTORBIT Trailer] No hay ninguna grabación para descargar.');
      return null;
    }
    lastRecordedReplay = replay;
    const saved = downloadReplayFile(replay, filename);
    console.info(`[OUTORBIT Trailer] Descargado: ${saved} (${replay.frames.length} frames)`);
    return saved;
  },

  playLast(opts: TrailerReplayOptions = {}): void {
    if (!hostHooks) {
      console.warn('[OUTORBIT Trailer] Entra primero en el modo Cúpula.');
      return;
    }
    const replay = runtimeBridge?.stopRecording() ?? lastRecordedReplay;
    if (!replay) {
      console.warn('[OUTORBIT Trailer] No hay grabación previa en memoria. Usa trailer.start() o trailer.loadReplay().');
      return;
    }
    lastRecordedReplay = replay;
    hostHooks.launchSession({
      mode: 'replay',
      replay,
      camera: opts.camera ?? 'free',
      speed: opts.speed ?? 1,
      hud: opts.hud ?? false,
    });
  },

  async loadReplay(opts: TrailerReplayOptions = {}): Promise<void> {
    if (!hostHooks) {
      console.warn('[OUTORBIT Trailer] Entra primero en el modo Cúpula.');
      return;
    }
    const replay = await pickReplayFileFromDisk();
    lastRecordedReplay = replay;
    hostHooks.launchSession({
      mode: 'replay',
      replay,
      camera: opts.camera ?? 'free',
      speed: opts.speed ?? 1,
      hud: opts.hud ?? false,
    });
  },

  setCamera(mode: ReplayCameraMode): void {
    runtimeBridge?.setCamera(mode);
  },

  setSpeed(speed: number): void {
    runtimeBridge?.setSpeed(speed);
  },

  togglePause(): boolean {
    return runtimeBridge?.togglePause() ?? false;
  },

  setHud(visible: boolean): void {
    runtimeBridge?.setHud(visible);
  },

  restartReplay(): void {
    if (!hostHooks || !lastRecordedReplay) return;
    hostHooks.launchSession({
      mode: 'replay',
      replay: lastRecordedReplay,
      camera: 'free',
      speed: 1,
      hud: false,
    });
  },

  status(): Record<string, unknown> {
    return runtimeBridge?.getStatus() ?? { active: false, hasLastReplay: lastRecordedReplay !== null };
  },

  exit(): void {
    hostHooks?.launchSession(null);
    console.info('[OUTORBIT Trailer] Sesión finalizada. Modo normal restaurado.');
  },
};

export function installTrailerConsoleGlobal(): void {
  const w = window as unknown as Record<string, unknown>;
  w.outorbitTrailer = outorbitTrailerApi;
  w.trailer = outorbitTrailerApi;
}
