// ============================================================================
// CRYO/IRON PROPS — Cryo-Drop e Iron Bastion
// ============================================================================
// Props de hielo e industria: cristales translúcidos, iglús, tuberías, antenas, reactores y focos. Extraído de proceduralModels.ts (P8).
// ============================================================================

import * as THREE from 'three';
import { toonMesh } from '../meshFactory';

/** Cristal de hielo gigante: prismas azul claro translúcidos brillantes. */
export function buildIceCrystal(): THREE.Group {
  const crystal = new THREE.Group();
  const shardColors = ['#bae6fd', '#e0f2fe', '#7dd3fc'];
  for (let i = 0; i < 4; i++) {
    const height = 2.2 + (i % 3) * 1.3;
    const shard = toonMesh(
      new THREE.ConeGeometry(0.42 + (i % 2) * 0.2, height, 5),
      shardColors[i % 3],
      0.02
    );
    shard.position.set(((i % 3) - 1) * 0.55, height / 2, ((i % 2) - 0.5) * 0.6);
    shard.rotation.z = ((i % 3) - 1) * 0.14;
    crystal.add(shard);
  }
  return crystal;
}

/** Iglú/cúpula polar de nieve con túnel de entrada. */
export function buildIgloo(): THREE.Group {
  const igloo = new THREE.Group();
  const dome = toonMesh(new THREE.SphereGeometry(1.6, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), '#f8fafc', 0.022);
  igloo.add(dome);
  const entrance = toonMesh(
    new THREE.CylinderGeometry(0.5, 0.5, 1.0, 8, 1, false, 0, Math.PI),
    '#e2e8f0',
    0.016
  );
  entrance.rotation.z = Math.PI / 2;
  entrance.position.set(0, 0.45, 1.7);
  igloo.add(entrance);
  return igloo;
}

/** Tubería industrial acodada con bridas. */
export function buildPipe(): THREE.Group {
  const pipe = new THREE.Group();
  const horizontal = toonMesh(new THREE.CylinderGeometry(0.3, 0.3, 3.2, 10), '#57534e', 0.018);
  horizontal.rotation.z = Math.PI / 2;
  horizontal.position.y = 0.6;
  pipe.add(horizontal);
  const vertical = toonMesh(new THREE.CylinderGeometry(0.3, 0.3, 1.6, 10), '#57534e', 0.018);
  vertical.position.set(1.6, 1.2, 0);
  pipe.add(vertical);
  for (const x of [-1.2, 0.4, 1.6]) {
    const flange = toonMesh(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 10), '#a8a29e', 0.014);
    flange.rotation.z = Math.PI / 2;
    flange.position.set(x, 0.6, 0);
    pipe.add(flange);
  }
  return pipe;
}

/** Antena de comunicaciones con plato y luz roja intermitente. */
export function buildAntenna(): THREE.Group {
  const antenna = new THREE.Group();
  const mast = toonMesh(new THREE.CylinderGeometry(0.1, 0.16, 4.2, 8), '#64748b', 0.016);
  mast.position.y = 2.1;
  antenna.add(mast);
  const dish = toonMesh(new THREE.SphereGeometry(0.7, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), '#94a3b8', 0.016);
  dish.position.set(0, 4.1, 0);
  dish.rotation.x = -0.7;
  antenna.add(dish);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xef4444 })
  );
  beacon.position.y = 4.5;
  antenna.add(beacon);
  for (const side of [-1, 1]) {
    const guy = toonMesh(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 5), '#475569', 0.01);
    guy.position.set(0.7 * side, 1.3, 0);
    guy.rotation.z = 0.55 * side;
    antenna.add(guy);
  }
  return antenna;
}

/** Reactor de energía: núcleo brillante entre dos soportes. */
export function buildReactor(): THREE.Group {
  const reactor = new THREE.Group();
  for (const side of [-1, 1]) {
    const leg = toonMesh(new THREE.BoxGeometry(0.4, 1.6, 0.4), '#334155', 0.018);
    leg.position.set(0.8 * side, 0.8, 0);
    reactor.add(leg);
  }
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.75, 1),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.9 })
  );
  core.position.y = 1.9;
  reactor.add(core);
  const cage = toonMesh(new THREE.TorusGeometry(0.85, 0.08, 8, 20), '#475569', 0.014);
  cage.position.y = 1.9;
  cage.rotation.x = Math.PI / 2;
  reactor.add(cage);
  return reactor;
}

/** Foco de vigilancia sobre poste con haz cálido. */
export function buildSpotlight(): THREE.Group {
  const spot = new THREE.Group();
  const pole = toonMesh(new THREE.CylinderGeometry(0.09, 0.12, 3.4, 8), '#334155', 0.016);
  pole.position.y = 1.7;
  spot.add(pole);
  const head = toonMesh(new THREE.CylinderGeometry(0.34, 0.5, 0.5, 10), '#1f2937', 0.016);
  head.position.set(0, 3.5, 0.1);
  head.rotation.x = 0.6;
  spot.add(head);
  const lens = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xfde68a })
  );
  lens.position.set(0, 3.35, 0.32);
  spot.add(lens);
  return spot;
}

