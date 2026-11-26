import type * as THREE from 'three';
import {
  TRAILER_FIXED_DT,
  type ReplayCheckpoint,
  type ReplayFileV1,
  type ReplayFrameTuple,
  type ReplayHeader,
  type SyntheticPlayerInput,
} from './trailerTypes';

// ============================================================================
// DomeReplaySystem — Grabador y Reproductor determinista para OUTORBIT.
// ============================================================================

const FLAG_WANT_ATTACK = 1 << 0;
const FLAG_ATTACK_HELD = 1 << 1;
const FLAG_WANT_DASH = 1 << 2;
const FLAG_DASH_HELD = 1 << 3;
const FLAG_WANT_JUMP = 1 << 4;

/** Redondea a 6 decimales para reducir peso del JSON sin perder determinismo. */
function q6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

function q3(n: number): number {
  return Math.round(n * 1_000) / 1_000;
}

export function encodeSyntheticInput(input: SyntheticPlayerInput): ReplayFrameTuple {
  let flags = 0;
  if (input.wantAttack) flags |= FLAG_WANT_ATTACK;
  if (input.attackHeld) flags |= FLAG_ATTACK_HELD;
  if (input.wantDash) flags |= FLAG_WANT_DASH;
  if (input.dashHeld) flags |= FLAG_DASH_HELD;
  if (input.wantJump) flags |= FLAG_WANT_JUMP;
  return [
    q3(input.moveX),
    q3(input.moveY),
    q6(input.lookDx),
    q6(input.lookDy),
    flags,
    input.wantSlot ?? 0,
    input.extraSkill ?? 0,
  ];
}

export function decodeSyntheticInput(
  tuple: ReplayFrameTuple,
  out: SyntheticPlayerInput,
): SyntheticPlayerInput {
  const flags = tuple[4] | 0;
  out.moveX = tuple[0];
  out.moveY = tuple[1];
  out.lookDx = tuple[2];
  out.lookDy = tuple[3];
  out.wantAttack = (flags & FLAG_WANT_ATTACK) !== 0;
  out.attackHeld = (flags & FLAG_ATTACK_HELD) !== 0;
  out.wantDash = (flags & FLAG_WANT_DASH) !== 0;
  out.dashHeld = (flags & FLAG_DASH_HELD) !== 0;
  out.wantJump = (flags & FLAG_WANT_JUMP) !== 0;
  out.wantSlot = tuple[5] === 1 || tuple[5] === 2 || tuple[5] === 3 ? tuple[5] : null;
  out.extraSkill = typeof tuple[6] === 'string' ? tuple[6] : null;
  return out;
}

export class DomeReplayRecorder {
  private readonly header: ReplayHeader;
  private readonly frames: ReplayFrameTuple[] = [];
  private readonly checkpoints: ReplayCheckpoint[] = [];

  constructor(header: Omit<ReplayHeader, 'fixedDt' | 'recordedAt'>) {
    this.header = {
      ...header,
      fixedDt: TRAILER_FIXED_DT,
      recordedAt: new Date().toISOString(),
    };
  }

  recordFrame(input: SyntheticPlayerInput): void {
    this.frames.push(encodeSyntheticInput(input));
  }

  maybeRecordCheckpoint(
    tick: number,
    playerPos: THREE.Vector3,
    playerVel: THREE.Vector3,
    enemyCount: number,
  ): void {
    if (tick % 60 !== 0) return;
    this.checkpoints.push([
      tick,
      q6(playerPos.x),
      q6(playerPos.y),
      q6(playerPos.z),
      q6(playerVel.x),
      q6(playerVel.y),
      q6(playerVel.z),
      enemyCount,
    ]);
  }

  get frameCount(): number {
    return this.frames.length;
  }

  get durationSeconds(): number {
    return this.frames.length * this.header.fixedDt;
  }

  buildReplayFile(): ReplayFileV1 {
    return {
      version: 1,
      header: { ...this.header, loadout: [...this.header.loadout] as ReplayHeader['loadout'] },
      frames: this.frames.slice(),
      checkpoints: this.checkpoints.slice(),
    };
  }
}

export function validateReplayFile(raw: unknown): ReplayFileV1 {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Replay inválido: el JSON no es un objeto.');
  }
  const obj = raw as Partial<ReplayFileV1>;
  if (obj.version !== 1) {
    throw new Error(`Versión de replay no soportada: ${String(obj.version)}`);
  }
  if (!obj.header || !Array.isArray(obj.frames) || !Array.isArray(obj.checkpoints)) {
    throw new Error('Replay inválido: faltan header, frames o checkpoints.');
  }
  if (typeof obj.header.seed !== 'number' || !Array.isArray(obj.header.loadout)) {
    throw new Error('Replay inválido: cabecera corrupta.');
  }
  return obj as ReplayFileV1;
}

export function downloadReplayFile(replay: ReplayFileV1, filename?: string): string {
  const safeName =
    filename && filename.trim().length > 0
      ? filename.trim()
      : `outorbit_w${replay.header.wave}_${replay.header.seed}.outorbit-replay.json`;
  const json = JSON.stringify(replay);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  return safeName;
}

export async function parseReplayFile(file: File): Promise<ReplayFileV1> {
  const text = await file.text();
  return validateReplayFile(JSON.parse(text));
}

export function pickReplayFileFromDisk(): Promise<ReplayFileV1> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.outorbit-replay.json,application/json';
    input.style.display = 'none';
    document.body.appendChild(input);

    const cleanup = () => input.remove();

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) {
        reject(new Error('Selección de archivo cancelada.'));
        return;
      }
      try {
        const text = await file.text();
        const parsed = validateReplayFile(JSON.parse(text));
        resolve(parsed);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });

    input.addEventListener('cancel', () => {
      cleanup();
      reject(new Error('Selección de archivo cancelada.'));
    });

    input.click();
  });
}

export class DomeReplayPlayer {
  readonly replay: ReplayFileV1;
  private readonly checkpointByTick = new Map<number, ReplayCheckpoint>();
  private readonly scratchInput: SyntheticPlayerInput = {
    moveX: 0,
    moveY: 0,
    lookDx: 0,
    lookDy: 0,
    wantAttack: false,
    attackHeld: false,
    wantDash: false,
    dashHeld: false,
    wantJump: false,
    wantSlot: null,
  };
  private cursor = 0;
  private maxDriftMeters = 0;

  constructor(replay: ReplayFileV1) {
    this.replay = replay;
    for (const cp of replay.checkpoints) {
      this.checkpointByTick.set(cp[0], cp);
    }
  }

  get totalTicks(): number {
    return this.replay.frames.length;
  }

  get currentTick(): number {
    return this.cursor;
  }

  get isFinished(): boolean {
    return this.cursor >= this.replay.frames.length;
  }

  get maxDrift(): number {
    return this.maxDriftMeters;
  }

  nextInput(): SyntheticPlayerInput | null {
    if (this.cursor >= this.replay.frames.length) return null;
    const tuple = this.replay.frames[this.cursor];
    this.cursor += 1;
    return decodeSyntheticInput(tuple, this.scratchInput);
  }

  verifyCheckpoint(
    tick: number,
    playerPos: THREE.Vector3,
    enemyCount: number,
  ): number | null {
    const cp = this.checkpointByTick.get(tick);
    if (!cp) return null;
    const dx = playerPos.x - cp[1];
    const dy = playerPos.y - cp[2];
    const dz = playerPos.z - cp[3];
    const drift = Math.hypot(dx, dy, dz);
    if (drift > this.maxDriftMeters) {
      this.maxDriftMeters = drift;
    }
    if (drift > 0.05 || enemyCount !== cp[7]) {
      console.warn(
        `[OUTORBIT Replay] Checkpoint tick=${tick} drift=${drift.toFixed(5)}m enemies=${enemyCount}/${cp[7]}`,
      );
    }
    return drift;
  }
}
