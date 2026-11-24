// ============================================================================
// bake_nyx_clips.mjs — Hornea los GLB de animación de Nyx a datos TS.
//
// Lee de public/models/:
//   - nyx_kick_flip.glb / nyx_kick_flip_drill.glb  (one-shot: volteretas de
//     recuperación tras patada, 1 y 2 flips)
//   - nyx_gravity_kick.glb / nyx_spiral_drill_kick.glb  (BUCLES: pose de
//     lanza durante el vuelo de ataque; el taladro gira 360° en hips.y)
//
// y emite src/game/render/nyxBakedClips.ts con los keyframes como Euler XYZ
// (rad, PISTA UNWRAPPED para los giros completos) en el orden de huesos de
// `NyxAnimator.BONE_NAMES`, más el offset de posición de hips respecto al
// rest de nyx_rigged.glb.
//
// Uso: node scripts/bake_nyx_clips.mjs
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// Orden de huesos de NyxAnimator (28; halo_ring no viene en los clips)
const BONE_NAMES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'upperArm_L', 'forearm_L', 'hand_L', 'upperArm_R', 'forearm_R', 'hand_R',
  'thigh_L', 'shin_L', 'thigh_R', 'shin_R',
  'hair_1', 'hair_2', 'hair_3', 'hair_4',
  'clavicle_L', 'clavicle_R', 'foot_L', 'toe_L', 'foot_R', 'toe_R',
  'sleeve_L', 'sleeve_R', 'halo_ring',
];
const BONE_COUNT = BONE_NAMES.length;

function parseGLB(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`No es un GLB: ${file}`);
  let off = 12;
  let json = null;
  let bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942) bin = data;
    off += 8 + len + ((len % 4) & 3 ? 4 - (len % 4) : 0);
  }
  if (!json || !bin) throw new Error(`GLB incompleto: ${file}`);
  return { json, bin };
}

function readAccessor(glb, index) {
  const acc = glb.json.accessors[index];
  if (acc.componentType !== 5126) throw new Error('Solo FLOAT (5126) soportado');
  const comps = acc.type === 'VEC4' ? 4 : acc.type === 'VEC3' ? 3 : 1;
  const out = new Float32Array(acc.count * comps);
  const bv = glb.json.bufferViews[acc.bufferView];
  const stride = bv.byteStride || 0;
  const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  for (let i = 0; i < acc.count; i++) {
    const src = base + (stride ? i * stride : i * comps * 4);
    for (let j = 0; j < comps; j++) {
      out[i * comps + j] = glb.bin.readFloatLE(src + j * 4);
    }
  }
  return out;
}

/** Posición local de reposo del hueso `hips` en nyx_rigged.glb. */
function restHipsPosition() {
  const glb = parseGLB(path.join(ROOT, 'public/models/nyx_rigged.glb'));
  const node = glb.json.nodes.find((n) => n.name === 'hips');
  if (!node || !node.translation) throw new Error('nyx_rigged.glb: falta hips.translation');
  return node.translation;
}

function bakeClip(file) {
  const glb = parseGLB(file);
  const anim = glb.json.animations[0];
  const nodeNames = glb.json.nodes.map((n) => n.name);
  const restHips = restHipsPosition();

  // Tiempos compartidos (todos los samplers comparten el input en estos clips)
  const firstRot = anim.channels.find((c) => c.target.path === 'rotation');
  const times = Array.from(readAccessor(glb, anim.samplers[firstRot.sampler].input));
  const frameCount = times.length;
  const duration = times[frameCount - 1];

  // Euler XYZ unwrapped por hueso y frame
  const rotations = new Float32Array(BONE_COUNT * frameCount * 3);
  const hipsOffset = new Float32Array(frameCount * 3);
  const prev = new Float32Array(BONE_COUNT * 3); // unwrap continuo
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();

  for (const ch of anim.channels) {
    const name = nodeNames[ch.target.node];
    const bi = BONE_NAMES.indexOf(name);
    if (ch.target.path === 'rotation') {
      if (bi < 0) continue;
      const data = readAccessor(glb, anim.samplers[ch.sampler].output);
      for (let f = 0; f < frameCount; f++) {
        q.set(data[f * 4], data[f * 4 + 1], data[f * 4 + 2], data[f * 4 + 3]);
        e.setFromQuaternion(q, 'XYZ');
        const o = (bi * frameCount + f) * 3;
        for (let a = 0; a < 3; a++) {
          let v = a === 0 ? e.x : a === 1 ? e.y : e.z;
          const po = bi * 3 + a;
          // Unwrap: la pista es continua (volteretas de -360°/-720° en X,
          // barrena de +360° en Y)
          while (v - prev[po] > Math.PI) v -= 2 * Math.PI;
          while (v - prev[po] < -Math.PI) v += 2 * Math.PI;
          prev[po] = v;
          rotations[o + a] = v;
        }
      }
    } else if (ch.target.path === 'translation' && name === 'hips') {
      const data = readAccessor(glb, anim.samplers[ch.sampler].output);
      for (let f = 0; f < frameCount; f++) {
        for (let a = 0; a < 3; a++) {
          hipsOffset[f * 3 + a] = data[f * 3 + a] - restHips[a];
        }
      }
    }
  }

  return { duration, frameCount, times, rotations, hipsOffset };
}

function fmt(v) {
  const r = Math.round(v * 10000) / 10000;
  return Object.is(r, -0) ? '0' : String(r);
}

function emitClip(name, clip) {
  const lines = [];
  lines.push(`export const ${name}: NyxBakedClip = {`);
  lines.push(`  duration: ${fmt(clip.duration)},`);
  lines.push(`  frameCount: ${clip.frameCount},`);
  lines.push(`  times: [${clip.times.map(fmt).join(', ')}],`);
  lines.push(`  rotations: [`);
  for (let f = 0; f < clip.frameCount; f++) {
    const row = [];
    for (let b = 0; b < BONE_COUNT; b++) {
      const o = (b * clip.frameCount + f) * 3;
      row.push(`${fmt(clip.rotations[o])}, ${fmt(clip.rotations[o + 1])}, ${fmt(clip.rotations[o + 2])}`);
    }
    lines.push(`    // frame ${f} (t=${fmt(clip.times[f])}s)`);
    lines.push(`    ${row.join(', ')},`);
  }
  lines.push(`  ],`);
  lines.push(`  hipsOffset: [`);
  for (let f = 0; f < clip.frameCount; f++) {
    lines.push(
      `    ${fmt(clip.hipsOffset[f * 3])}, ${fmt(clip.hipsOffset[f * 3 + 1])}, ${fmt(clip.hipsOffset[f * 3 + 2])}, // frame ${f}`,
    );
  }
  lines.push(`  ],`);
  lines.push(`};`);
  return lines.join('\n');
}

const CLIPS = [
  ['KICK_FLIP_CLIP', 'nyx_kick_flip.glb'],
  ['KICK_FLIP_DRILL_CLIP', 'nyx_kick_flip_drill.glb'],
  ['GRAVITY_KICK_LOOP', 'nyx_gravity_kick.glb'],
  ['SPIRAL_DRILL_KICK_LOOP', 'nyx_spiral_drill_kick.glb'],
  ['ZERO_G_FLOAT_LOOP', 'nyx_zero_g_float.glb'],
  ['KINETIC_SQUAT_CLIP', 'nyx_kinetic_squat.glb'],
];

const baked = CLIPS.map(([name, file]) => ({ name, file, clip: bakeClip(path.join(ROOT, 'public/models', file)) }));

// Controles: giros completos y cierre de bucles
for (const { name, file, clip } of baked) {
  const n = clip.frameCount;
  const hipsX0 = clip.rotations[0];
  const hipsX1 = clip.rotations[(n - 1) * 3];
  const hipsY0 = clip.rotations[1];
  const hipsY1 = clip.rotations[(n - 1) * 3 + 1];
  // Cierre del bucle: orientación del último frame vs el primero (mod 2π)
  let maxDelta = 0;
  for (let b = 0; b < BONE_COUNT; b++) {
    for (let a = 0; a < 3; a++) {
      const d0 = clip.rotations[(b * n) * 3 + a];
      const d1 = clip.rotations[(b * n + n - 1) * 3 + a];
      let d = Math.abs(d1 - d0) % (2 * Math.PI);
      if (d > Math.PI) d = 2 * Math.PI - d;
      maxDelta = Math.max(maxDelta, d);
    }
  }
  console.log(`${file}: ${n} frames, ${clip.duration.toFixed(4)} s`);
  console.log(`  hips X: ${hipsX0.toFixed(3)} -> ${hipsX1.toFixed(3)} | hips Y: ${hipsY0.toFixed(3)} -> ${hipsY1.toFixed(3)}`);
  console.log(`  cierre de bucle (último vs primer frame, mod 2π): ${maxDelta.toFixed(4)} rad`);
}

const header = `// ============================================================================
// nyxBakedClips — Keyframes horneados de las animaciones de Nyx.
//
// Generado por scripts/bake_nyx_clips.mjs a partir de los GLB de
// public/models/. NO editar a mano: regenerar con
// "node scripts/bake_nyx_clips.mjs".
//
// - Euler XYZ en rad, PISTA UNWRAPPED (kick_flip: hips.x baja continua de 0 a
//   -2π; drill: 0 a -4π; spiral_drill_kick: hips.y sube +2π por vuelta de
//   barrena). NyxAnimator envuelve \`cur\` hacia \`tgt\` cada frame.
// - Orden de huesos y convención de BONE_NAMES de nyxAnimator.ts (28; el
//   aro halo_ring no viene en los clips y queda a 0).
// - rotations es FRAME-MAJOR: índice = (frame * 28 + boneIndex) * 3.
// - hipsOffset es la posición local de hips respecto al rest de nyx_rigged.glb.
// - Pelo (hair_1..4) y mangas (sleeve_L/R) vienen keyframed pero los sobrees-
//   cribe la física de resorte del animador: se conservan por fidelidad.
// ============================================================================

export interface NyxBakedClip {
  /** Duración total (s) = tiempo del último keyframe. */
  readonly duration: number;
  /** Número de keyframes (todos los huesos comparten los mismos tiempos). */
  readonly frameCount: number;
  /** Tiempo (s) de cada keyframe. */
  readonly times: readonly number[];
  /**
   * Euler XYZ (rad, unwrapped) por keyframe y hueso, plano FRAME-MAJOR:
   * índice = (frame * 28 + boneIndex) * 3.
   */
  readonly rotations: readonly number[];
  /** Offset de posición de hips (m) por keyframe, respecto al rest. */
  readonly hipsOffset: readonly number[];
}

`;

const out =
  header +
  baked.map(({ name, clip }) => emitClip(name, clip)).join('\n\n') +
  '\n';
fs.writeFileSync(path.join(ROOT, 'src/game/render/nyxBakedClips.ts'), out);
console.log(`Escrito src/game/render/nyxBakedClips.ts (${(out.length / 1024).toFixed(1)} KiB)`);
