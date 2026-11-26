import * as THREE from 'three';
import { installScopedRandom } from '../src/game/dome/trailer/seededRandom';
import {
  DomeReplayPlayer,
  DomeReplayRecorder,
  validateReplayFile,
} from '../src/game/dome/trailer/DomeReplaySystem';
import {
  TRAILER_FIXED_DT,
  type SyntheticPlayerInput,
} from '../src/game/dome/trailer/trailerTypes';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

const originalRandom = Math.random;
const restoreA = installScopedRandom(421337);
const seqA = Array.from({ length: 10 }, () => Math.random());
restoreA();
assert(Math.random === originalRandom, 'Math.random debe restaurarse tras restoreA()');

const restoreB = installScopedRandom(421337);
const seqB = Array.from({ length: 10 }, () => Math.random());
restoreB();
assert(
  JSON.stringify(seqA) === JSON.stringify(seqB),
  'Misma semilla debe producir secuencia idéntica',
);

const recorder = new DomeReplayRecorder({
  seed: 421337,
  viewportW: 1920,
  viewportH: 1080,
  baseFov: 70,
  wave: 1,
  trainingArchetype: null,
  loadout: ['gravity_field', 'bounce_horizon', 'black_hole'],
  infiniteEden: true,
  godMode: true,
});

const pos = new THREE.Vector3(0, 0, 0);
const vel = new THREE.Vector3(12, 1.5, -24);

for (let tick = 0; tick < 180; tick++) {
  const inp: SyntheticPlayerInput = {
    moveX: Math.sin(tick * 0.1),
    moveY: -1,
    lookDx: tick % 30 === 0 ? 0.123456 : 0.01,
    lookDy: -0.005,
    wantAttack: tick % 15 === 0,
    attackHeld: true,
    wantDash: tick % 40 === 0,
    dashHeld: true,
    wantJump: tick === 5,
    wantSlot: tick === 60 ? 1 : tick === 120 ? 3 : null,
  };
  recorder.recordFrame(inp);
  pos.addScaledVector(vel, TRAILER_FIXED_DT);
  recorder.maybeRecordCheckpoint(tick, pos, vel, 3);
}

const json = JSON.stringify(recorder.buildReplayFile());
const parsed = validateReplayFile(JSON.parse(json));
const player = new DomeReplayPlayer(parsed);

const replayPos = new THREE.Vector3(0, 0, 0);
for (let tick = 0; tick < 180; tick++) {
  const inp = player.nextInput();
  assert(inp !== null, `Falta input en tick ${tick}`);
  assert(inp!.attackHeld === true && inp!.dashHeld === true, 'Flags deben conservarse');
  if (tick === 60) assert(inp!.wantSlot === 1, 'Slot 1 en tick 60');
  if (tick === 120) assert(inp!.wantSlot === 3, 'Slot 3 en tick 120');
  replayPos.addScaledVector(vel, TRAILER_FIXED_DT);
  const drift = player.verifyCheckpoint(tick, replayPos, 3);
  if (drift !== null) {
    assert(drift < 1e-5, `Drift demasiado alto: ${drift}`);
  }
}

assert(player.nextInput() === null, 'El reproductor debe terminar exactamente en tick 180');
assert(player.maxDrift < 1e-5, `maxDrift inesperado: ${player.maxDrift}`);

console.log(
  `[smoke_trailer_replay] OK — 180 frames, json=${json.length} bytes, maxDrift=${player.maxDrift.toFixed(7)}m`,
);
