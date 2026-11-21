#!/usr/bin/env node
// Análisis temporal: histograma de tris crudos por prefijo de nodo.
import fs from 'node:fs';
import path from 'node:path';

const SRC_DIR = '/home/pakura/Proyectos/OUTORBIT/referencias y base/Blender_exports/ciudad_hekseville';
const FILES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['PilarCentral_base_mt.glb', 'Auldnoir_base_cc.glb', 'Pleajeune_base_dt.glb', 'Endestria_base_ed.glb', 'Vendecentre_base_id.glb'];

function readGlb(filePath) {
  const buf = fs.readFileSync(filePath);
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546c67) throw new Error(`Not a GLB: ${filePath}`);
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binHeaderOffset = 20 + jsonLen;
  const binLen = buf.readUInt32LE(binHeaderOffset);
  const binStart = binHeaderOffset + 8;
  const bin = buf.subarray(binStart, binStart + binLen);
  return { gltf, bin };
}

const SKIP_NODE_PREFIXES = [
  'stone_pot', 'rubble_', 'flower_', 'grass_', 'cardboardbox', 'can_', 'woodbox', 'dust_', 'dustbox',
  'manhole', 'poster_', 'steeldrum', 'fireplug', 'vase_', 'chair_', 'desk_', 'fruit_', 'apple_',
  'barrel_', 'bottle_', 'bag_', 'boxset', 'airconditioner', 'telephonebox', 'roadclosedsign',
  'signboard', 'manekin', 'pylon_', 'cover_', 'post_', 'steelbox', 'pipe1_', 'branch_', 'slide_',
  'swing_', 'light_', 'fence_', 'window_',
];

for (const file of FILES) {
  const { gltf, bin } = readGlb(path.join(SRC_DIR, file));
  const nodes = gltf.nodes || [];
  const meshes = gltf.meshes || [];
  const triCount = (mi) => {
    const m = meshes[mi];
    return (m.primitives || []).reduce((s, pr) => {
      if (pr.indices !== undefined) return s + gltf.accessors[pr.indices].count / 3;
      return s + gltf.accessors[pr.attributes.POSITION].count / 3;
    }, 0);
  };
  const hist = new Map();
  let total = 0;
  let skipped = 0;
  for (const node of nodes) {
    if (node.mesh === undefined) continue;
    const name = (node.name || 'unnamed').toLowerCase();
    if (SKIP_NODE_PREFIXES.some((p) => name.startsWith(p))) {
      skipped += triCount(node.mesh);
      continue;
    }
    const prefix = name.split(/[\d_]/)[0] || name.slice(0, 10);
    const t = triCount(node.mesh);
    total += t;
    hist.set(prefix, (hist.get(prefix) ?? 0) + t);
  }
  const sorted = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 26);
  console.log(`\n=== ${file} — kept ${Math.round(total).toLocaleString()} tris (skipped ${Math.round(skipped).toLocaleString()}) ===`);
  for (const [k, v] of sorted) {
    console.log(`  ${k.padEnd(16)} ${Math.round(v).toLocaleString()}  (${((v / total) * 100).toFixed(1)}%)`);
  }
}
