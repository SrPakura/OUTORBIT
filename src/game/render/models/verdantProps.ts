// ============================================================================
// VERDANT PROPS — Aldea Feudal y Selva Tropical
// ============================================================================
// Props ambientales del planeta Verdant: pinos, rocas, torii, casas feudales, pagodas, faroles, bambú, caminos de piedra, puentes, cerezos nevados y la flora tropical (palmeras, helechos, flores gigantes, setas luminosas, estatuas, arcos de enredadera). Extraído de proceduralModels.ts (P8).
// ============================================================================

import * as THREE from 'three';
import { createToonMaterial } from '../toonMaterials';
import {
  additiveGlowMaterial,
  toonMesh,
} from '../meshFactory';

// ============================================================================
// Planetas procedurales
// ============================================================================

export function buildPineTree(): THREE.Group {
  const tree = new THREE.Group();
  const trunk = toonMesh(new THREE.CylinderGeometry(0.06, 0.09, 0.5, 7), '#7c4a21', 0.02);
  trunk.position.y = 0.25;
  tree.add(trunk);
  const foliageColors = ['#22c55e', '#16a34a', '#15803d'];
  for (let i = 0; i < 3; i++) {
    const cone = toonMesh(
      new THREE.ConeGeometry(0.55 - i * 0.14, 0.55, 8),
      foliageColors[i],
      0.025
    );
    cone.position.y = 0.6 + i * 0.32;
    tree.add(cone);
  }
  return tree;
}

export function buildRock(): THREE.Group {
  const rock = new THREE.Group();
  const mesh = toonMesh(new THREE.DodecahedronGeometry(0.4, 0), '#94a3b8', 0.03);
  mesh.scale.set(1, 0.7, 1.15);
  mesh.rotation.y = 0.6;
  mesh.position.y = 0.18;
  rock.add(mesh);
  return rock;
}

// ============================================================================
// Props ambientales (Aldea Feudal de Verdant, Cryo-Drop, Iron Bastion)
// ============================================================================

/** Torii japonés: dos pilares rojos + dintel negro curvado hacia arriba. */
export function buildToriiGate(): THREE.Group {
  const gate = new THREE.Group();
  for (const side of [-1, 1]) {
    const pillar = toonMesh(new THREE.CylinderGeometry(0.22, 0.26, 3.4, 8), '#dc2626', 0.02);
    pillar.position.set(1.5 * side, 1.7, 0);
    gate.add(pillar);
  }
  const lintel = toonMesh(new THREE.BoxGeometry(4.2, 0.34, 0.4), '#18181b', 0.02);
  lintel.position.y = 3.5;
  lintel.rotation.z = 0.03;
  gate.add(lintel);
  const lintelTop = toonMesh(new THREE.BoxGeometry(4.6, 0.22, 0.44), '#18181b', 0.02);
  lintelTop.position.y = 3.78;
  gate.add(lintelTop);
  const tieBeam = toonMesh(new THREE.BoxGeometry(3.2, 0.24, 0.3), '#dc2626', 0.018);
  tieBeam.position.y = 2.9;
  gate.add(tieBeam);
  return gate;
}

/** Casa feudal: base de madera oscura, muros claros y tejado a cuatro aguas. */
export function buildVillageHouse(): THREE.Group {
  const house = new THREE.Group();
  const base = toonMesh(new THREE.BoxGeometry(3.2, 0.5, 2.8), '#5b3a1e', 0.024);
  base.position.y = 0.25;
  house.add(base);
  const walls = toonMesh(new THREE.BoxGeometry(2.9, 1.7, 2.5), '#f5e6c8', 0.024);
  walls.position.y = 1.3;
  house.add(walls);
  const beam = toonMesh(new THREE.BoxGeometry(3.0, 0.18, 2.6), '#7c4a21', 0.016);
  beam.position.y = 2.2;
  house.add(beam);
  // Tejado a cuatro aguas (pirámide achatada).
  const roof = toonMesh(new THREE.ConeGeometry(2.6, 1.3, 4), '#3f2a1a', 0.026);
  roof.position.y = 2.9;
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.12, 1, 0.95);
  house.add(roof);
  const ridge = toonMesh(new THREE.BoxGeometry(2.4, 0.16, 0.3), '#1f1410', 0.016);
  ridge.position.y = 3.5;
  house.add(ridge);
  // Puerta corredera de papel.
  const door = toonMesh(new THREE.BoxGeometry(1.0, 1.3, 0.08), '#e8d5a3', 0.014);
  door.position.set(0, 1.05, 1.28);
  house.add(door);
  return house;
}

/** Pagoda de dos pisos con aleros voladizos. */
export function buildPagodaHouse(): THREE.Group {
  const pagoda = new THREE.Group();
  const base = toonMesh(new THREE.CylinderGeometry(2.0, 2.2, 0.5, 8), '#6b4423', 0.024);
  base.position.y = 0.25;
  pagoda.add(base);
  const floor1 = toonMesh(new THREE.CylinderGeometry(1.5, 1.6, 1.6, 8), '#f5e6c8', 0.024);
  floor1.position.y = 1.3;
  pagoda.add(floor1);
  const eaves1 = toonMesh(new THREE.ConeGeometry(2.4, 0.7, 8), '#7f1d1d', 0.024);
  eaves1.position.y = 2.4;
  pagoda.add(eaves1);
  const floor2 = toonMesh(new THREE.CylinderGeometry(1.1, 1.2, 1.2, 8), '#f5e6c8', 0.022);
  floor2.position.y = 3.3;
  pagoda.add(floor2);
  const eaves2 = toonMesh(new THREE.ConeGeometry(1.9, 0.7, 8), '#7f1d1d', 0.022);
  eaves2.position.y = 4.2;
  pagoda.add(eaves2);
  const spire = toonMesh(new THREE.ConeGeometry(0.16, 0.9, 6), '#facc15', 0.016);
  spire.position.y = 4.9;
  pagoda.add(spire);
  return pagoda;
}

/** Farolillo de papel colgante con luz cálida. */
export function buildPaperLantern(): THREE.Group {
  const lantern = new THREE.Group();
  const cord = toonMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 5), '#3f2a1a', 0.01);
  cord.position.y = 2.35;
  lantern.add(cord);
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffb454, transparent: true, opacity: 0.92 })
  );
  body.position.y = 1.85;
  body.scale.set(1, 1.15, 1);
  lantern.add(body);
  for (const dy of [-0.42, 0.42]) {
    const cap = toonMesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 10), '#7f1d1d', 0.012);
    cap.position.y = 1.85 + dy;
    lantern.add(cap);
  }
  const tassel = toonMesh(new THREE.ConeGeometry(0.08, 0.3, 6), '#facc15', 0.01);
  tassel.position.y = 1.25;
  lantern.add(tassel);
  return lantern;
}

/** Clúster de bambú: 4-5 tallos verdes con nodos. */
export function buildBambooCluster(): THREE.Group {
  const cluster = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const height = 2.6 + (i % 3) * 0.7;
    const stalk = toonMesh(
      new THREE.CylinderGeometry(0.07, 0.09, height, 6),
      i % 2 === 0 ? '#4ade80' : '#22c55e',
      0.014
    );
    stalk.position.set(((i % 3) - 1) * 0.28, height / 2, ((i % 2) - 0.5) * 0.3);
    stalk.rotation.z = ((i % 3) - 1) * 0.06;
    cluster.add(stalk);
    const leaves = toonMesh(new THREE.ConeGeometry(0.3, 0.7, 5), '#16a34a', 0.014);
    leaves.position.set(stalk.position.x + 0.2, height, stalk.position.z);
    leaves.rotation.z = -0.7;
    cluster.add(leaves);
  }
  return cluster;
}

/** Camino de piedra: losas planas hexagonales en línea. */
export function buildStonePath(): THREE.Group {
  const path = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const slab = toonMesh(
      new THREE.CylinderGeometry(0.55, 0.6, 0.16, 6),
      i % 2 === 0 ? '#a8a29e' : '#d6d3d1',
      0.016
    );
    slab.position.set(((i % 2) - 0.5) * 0.5, 0.08, i * 1.15 - 2.3);
    path.add(slab);
  }
  return path;
}

/** Puente de madera decorativo bajo con tablones y cuerdas. */
export function buildWoodBridge(): THREE.Group {
  const bridge = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const plank = toonMesh(new THREE.BoxGeometry(1.6, 0.12, 0.42), '#a16207', 0.014);
    plank.position.set(0, 0.35, i * 0.55 - 1.4);
    bridge.add(plank);
  }
  for (const side of [-1, 1]) {
    const rail = toonMesh(new THREE.CylinderGeometry(0.05, 0.05, 3.4, 5), '#7c4a21', 0.012);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(0.85 * side, 0.75, 0);
    bridge.add(rail);
    for (const z of [-1.2, 0, 1.2]) {
      const post = toonMesh(new THREE.CylinderGeometry(0.06, 0.07, 0.7, 5), '#7c4a21', 0.012);
      post.position.set(0.85 * side, 0.6, z);
      bridge.add(post);
    }
  }
  return bridge;
}

// ============================================================================
/**
 * Cerezo/pino invernal del Shogunato Nevado: tronco oscuro tortuoso (segmentos
 * girados), copa de flores de cerezo rosa suave y copos de nieve blancos
 * aposados sobre las ramas.
 */
export function buildCherrySnowTree(): THREE.Group {
  const tree = new THREE.Group();
  // Tronco tortuoso: 3 segmentos oscuros que se tuercen hacia la copa.
  const trunkColors = ['#3f2a1a', '#4a3220', '#5b3a1e'];
  let leanX = 0;
  for (let i = 0; i < 3; i++) {
    const seg = toonMesh(
      new THREE.CylinderGeometry(0.11 - i * 0.015, 0.15 - i * 0.015, 0.55, 7),
      trunkColors[i],
      0.02
    );
    leanX += i * 0.09 - 0.04;
    seg.position.set(leanX, 0.28 + i * 0.52, 0);
    seg.rotation.z = -0.12 - i * 0.05;
    tree.add(seg);
  }
  // Copa de flores de cerezo rosa pálido: 4 esferas achatadas en racimo.
  const blossomColors = ['#fbcfe8', '#f9a8d4', '#fbcfe8'];
  const crown: Array<[number, number, number, number]> = [
    [leanX, 2.05, 0, 0.62],
    [leanX - 0.5, 1.8, 0.22, 0.44],
    [leanX + 0.48, 1.82, -0.18, 0.46],
    [leanX + 0.05, 1.62, 0.42, 0.4],
  ];
  for (const [bx, by, bz, br] of crown) {
    const blossom = toonMesh(new THREE.SphereGeometry(br, 12, 10), blossomColors[br > 0.45 ? 0 : 1], 0.022);
    blossom.position.set(bx, by, bz);
    blossom.scale.set(1, 0.85, 1);
    tree.add(blossom);
  }
  // Copos de nieve blancos aposados sobre la copa.
  const snowSpots: Array<[number, number, number, number]> = [
    [leanX, 2.5, 0, 0.34],
    [leanX - 0.42, 2.22, 0.26, 0.24],
    [leanX + 0.44, 2.24, -0.2, 0.25],
    [leanX + 0.04, 2.05, 0.46, 0.22],
  ];
  for (const [sx, sy, sz, sr] of snowSpots) {
    const snow = toonMesh(new THREE.SphereGeometry(sr, 10, 8), '#f8fafc', 0.018);
    snow.position.set(sx, sy, sz);
    snow.scale.set(1, 0.45, 1);
    tree.add(snow);
  }
  return tree;
}

// ============================================================================
// Flora y ruinas tropicales (Verdant · Selva Tropical y Templos de Jade)
// ============================================================================
/**
 * Palmera tropical: tronco alto segmentado con ligera inclinación, 5 hojas
 * largas verdes abriéndose en abanico desde la corona y cocos colgando.
 */
export function buildPalmTree(): THREE.Group {
  const palm = new THREE.Group();
  // Tronco segmentado: cada segmento se desplaza un poco más que el anterior.
  const trunkColors = ['#8a5a2b', '#7c4a21'];
  const segments = 5;
  const segHeight = 0.62;
  let leanX = 0;
  for (let i = 0; i < segments; i++) {
    const trunk = toonMesh(
      new THREE.CylinderGeometry(0.115 - i * 0.01, 0.14 - i * 0.01, segHeight, 7),
      trunkColors[i % 2],
      0.02
    );
    leanX += i * 0.045;
    trunk.position.set(leanX, segHeight / 2 + i * segHeight, 0);
    trunk.rotation.z = -0.07;
    palm.add(trunk);
  }
  const crownX = leanX + 0.1;
  const crownY = segments * segHeight + 0.05;
  // 5 hojas de palmera largas radiando en abanico, con caída hacia fuera.
  const leafColors = ['#22c55e', '#16a34a', '#15803d'];
  for (let i = 0; i < 5; i++) {
    const pivot = new THREE.Group();
    pivot.position.set(crownX, crownY, 0);
    pivot.rotation.y = (i / 5) * Math.PI * 2 + 0.4;
    const leaf = toonMesh(new THREE.SphereGeometry(1, 10, 8), leafColors[i % 3], 0.018);
    leaf.scale.set(0.2, 0.06, 1.25);
    leaf.position.set(0, 0.08, 1.1);
    leaf.rotation.x = 0.32;
    pivot.add(leaf);
    palm.add(pivot);
  }
  // Cocos colgando bajo la corona.
  const coconutGeometry = new THREE.SphereGeometry(0.14, 10, 8);
  for (const [dx, dz] of [
    [-0.18, 0.1],
    [0.16, 0.14],
    [0.02, -0.2],
  ] as const) {
    const coconut = toonMesh(coconutGeometry, '#5b3a1e', 0.014);
    coconut.position.set(crownX + dx, crownY - 0.22, dz);
    palm.add(coconut);
  }
  return palm;
}

/**
 * Clúster de helechos tropicales: hojas anchas radiando desde la base y una
 * flor exótica magenta con centro amarillo brillando en el centro.
 */
/**
 * Clúster de helechos tropicales volumétrico (Hito 2): doble capa de frondas
 * (anillo bajo ancho + corona alta alzada) y pequeñas flores tropicales
 * brillantes (magenta/coral/dorado) anidadas entre las frondas.
 */
export function buildFernCluster(): THREE.Group {
  const fern = new THREE.Group();
  const leafColors = ['#22c55e', '#16a34a', '#4ade80'];
  // Capa baja: 8 frondas anchas casi horizontales que abren la base.
  for (let i = 0; i < 8; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / 8) * Math.PI * 2 + 0.25;
    const leaf = toonMesh(new THREE.SphereGeometry(1, 10, 8), leafColors[i % 3], 0.016);
    leaf.scale.set(0.19, 0.05, 0.95);
    leaf.position.set(0, 0.26, 0.44);
    leaf.rotation.x = -1.25; // fronda ancha tendida hacia fuera
    pivot.add(leaf);
    fern.add(pivot);
  }
  // Capa alta: 6 frondas menores alzándose hacia el centro.
  for (let i = 0; i < 6; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / 6) * Math.PI * 2 + 0.78;
    const leaf = toonMesh(new THREE.SphereGeometry(1, 10, 8), leafColors[(i + 1) % 3], 0.016);
    leaf.scale.set(0.15, 0.045, 0.72);
    leaf.position.set(0, 0.5, 0.3);
    leaf.rotation.x = -0.85; // fronda erguida que cierra el volumen
    pivot.add(leaf);
    fern.add(pivot);
  }
  // Flores tropicales pequeñas anidadas entre las frondas.
  const blossomColors = ['#e879f9', '#fb7185', '#facc15'];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const stem = toonMesh(new THREE.CylinderGeometry(0.035, 0.05, 0.42, 6), '#15803d', 0.012);
    stem.position.set(Math.cos(a) * 0.16, 0.21, Math.sin(a) * 0.16);
    stem.rotation.z = Math.cos(a) * 0.25;
    stem.rotation.x = -Math.sin(a) * 0.25;
    fern.add(stem);
    const blossom = toonMesh(new THREE.SphereGeometry(0.13, 10, 8), blossomColors[i], 0.014);
    blossom.scale.set(1, 0.75, 1);
    blossom.position.set(Math.cos(a) * 0.21, 0.46, Math.sin(a) * 0.21);
    fern.add(blossom);
    const heart = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xfde047 })
    );
    heart.position.set(Math.cos(a) * 0.21, 0.52, Math.sin(a) * 0.21);
    fern.add(heart);
  }
  return fern;
}

/**
 * Flor gigante trampolín (~2.2 m, Hito 2): tallo grueso curvado jade, doble
 * corona de pétalos esculpidos magenta/coral y estambre de polen dorado
 * brillante. Física: tallo sólido + techo petalar ancho que rebota al jugador.
 */
export function buildGiantFlower(): THREE.Group {
  const flower = new THREE.Group();
  // Tallo grueso curvado (jade): 4 segmentos que se inclinan suavemente.
  const stalkColors = ['#10b981', '#059669'];
  let leanX = 0;
  for (let i = 0; i < 4; i++) {
    const seg = toonMesh(
      new THREE.CylinderGeometry(0.125 - i * 0.012, 0.16 - i * 0.012, 0.58, 8),
      stalkColors[i % 2],
      0.018
    );
    leanX += i * 0.05;
    seg.position.set(leanX, 0.29 + i * 0.55, 0);
    seg.rotation.z = -0.1 - i * 0.045;
    flower.add(seg);
  }
  // Hojas de la base abriéndose en abanico.
  const leafColors = ['#34d399', '#10b981'];
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / 4) * Math.PI * 2 + 0.5;
    const leaf = toonMesh(new THREE.SphereGeometry(1, 10, 8), leafColors[i % 2], 0.016);
    leaf.scale.set(0.22, 0.05, 0.85);
    leaf.position.set(0, 0.28, 0.5);
    leaf.rotation.x = -1.15;
    pivot.add(leaf);
    flower.add(pivot);
  }
  // Corona de pétalos esculpidos: anillo exterior magenta + interior coral.
  const head = new THREE.Group();
  head.position.set(leanX, 2.32, 0);
  const petalColors = ['#e879f9', '#fb7185'];
  for (let ring = 0; ring < 2; ring++) {
    const count = 8 - ring * 2;
    for (let i = 0; i < count; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (i / count) * Math.PI * 2 + ring * 0.42;
      const petal = toonMesh(new THREE.SphereGeometry(1, 10, 8), petalColors[ring], 0.02);
      petal.scale.set(0.36 - ring * 0.09, 0.085, 0.66 - ring * 0.12);
      petal.position.set(0, 0.03 - ring * 0.06, 0.58 - ring * 0.18);
      petal.rotation.x = 0.55 - ring * 0.18;
      pivot.add(petal);
      head.add(pivot);
    }
  }
  // Estambre central: corazón dorado brillante con puntas de polen.
  const stamen = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xfde047 })
  );
  stamen.position.y = 0.16;
  head.add(stamen);
  const pollenGeometry = new THREE.SphereGeometry(0.055, 8, 6);
  const pollenMaterial = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const pollen = new THREE.Mesh(pollenGeometry, pollenMaterial);
    pollen.position.set(Math.cos(a) * 0.14, 0.3, Math.sin(a) * 0.14);
    head.add(pollen);
  }
  flower.add(head);
  return flower;
}

/**
 * Seta bioluminiscente (~1.6 m, Hito 2): tallo robusto crema con anillo cian
 * y sombrero ancho manchado que brilla suave (Kurogane, Neon Bastion, Luna).
 * Física: tallo sólido + sombrero ancho que rebota al jugador.
 */
export function buildGlowMushroom(): THREE.Group {
  const mushroom = new THREE.Group();
  const stem = toonMesh(new THREE.CylinderGeometry(0.26, 0.38, 1.15, 10), '#fef3c7', 0.018);
  stem.position.y = 0.58;
  mushroom.add(stem);
  const ring = toonMesh(new THREE.TorusGeometry(0.3, 0.05, 8, 16), '#67e8f9', 0.012);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.78;
  mushroom.add(ring);
  const cap = toonMesh(
    new THREE.SphereGeometry(0.95, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    '#22d3ee',
    0.02
  );
  cap.position.y = 1.18;
  cap.scale.set(1, 0.6, 1);
  mushroom.add(cap);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.78, 12, 10),
    additiveGlowMaterial(0xa5f3fc, 0.4, { depthWrite: false })
  );
  glow.position.y = 1.32;
  glow.scale.set(1, 0.55, 1);
  mushroom.add(glow);
  // Manchas crema del sombrero (deterministas).
  const spotGeometry = new THREE.SphereGeometry(0.13, 8, 6);
  const spotMaterial = createToonMaterial('#fef9c3');
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const r = 0.42 + (i % 3) * 0.2;
    const spot = new THREE.Mesh(spotGeometry, spotMaterial);
    spot.position.set(Math.cos(a) * r, 1.5 + Math.sin(i * 1.7) * 0.05, Math.sin(a) * r);
    spot.scale.set(1, 0.4, 1);
    mushroom.add(spot);
  }
  return mushroom;
}

/**
 * Tótem/monolito de piedra antigua musgosa con cara tallada, ceño fruncido y
 * ojos turquesa brillantes que velan el sendero de la selva.
 */
export function buildAncientStatue(): THREE.Group {
  const statue = new THREE.Group();
  const stone = '#78716c';
  const stoneDark = '#57534e';
  const mossColors = ['#4ade80', '#16a34a'];

  const base = toonMesh(new THREE.CylinderGeometry(0.8, 1.0, 0.5, 8), stoneDark, 0.024);
  base.position.y = 0.25;
  statue.add(base);
  const body = toonMesh(new THREE.BoxGeometry(1.05, 2.4, 0.85), stone, 0.026);
  body.position.y = 1.7;
  statue.add(body);
  const head = toonMesh(new THREE.BoxGeometry(1.35, 1.0, 1.0), stone, 0.026);
  head.position.y = 3.3;
  statue.add(head);
  const crown = toonMesh(new THREE.BoxGeometry(1.55, 0.32, 1.15), stoneDark, 0.02);
  crown.position.y = 3.92;
  statue.add(crown);

  // Cara tallada: ceño fruncido, nariz y boca hundidas.
  const brow = toonMesh(new THREE.BoxGeometry(0.92, 0.2, 0.14), stoneDark, 0.016);
  brow.position.set(0, 3.5, 0.52);
  statue.add(brow);
  const nose = toonMesh(new THREE.BoxGeometry(0.2, 0.42, 0.14), stoneDark, 0.014);
  nose.position.set(0, 3.24, 0.52);
  statue.add(nose);
  const mouth = toonMesh(new THREE.BoxGeometry(0.55, 0.14, 0.12), stoneDark, 0.014);
  mouth.position.set(0, 2.98, 0.52);
  statue.add(mouth);

  // Ojos turquesa brillantes (la marca del tótem viviente).
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x2dd4bf });
  const eyeGeometry = new THREE.SphereGeometry(0.11, 10, 8);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(0.26 * side, 3.38, 0.55);
    eye.scale.set(1, 0.75, 0.6);
    statue.add(eye);
  }

  // Musgo: parches verdes achatados sobre la piedra (deterministas).
  const mossGeometry = new THREE.SphereGeometry(0.3, 10, 8);
  const mossSpots: Array<[number, number, number, number]> = [
    [0.3, 4.05, 0.2, 0],
    [-0.45, 2.6, 0.44, 1],
    [0.5, 1.9, 0.4, 0],
    [-0.2, 1.1, 0.45, 1],
    [0.42, 3.75, -0.3, 1],
  ];
  for (const [mx, my, mz, ci] of mossSpots) {
    const moss = toonMesh(mossGeometry, mossColors[ci], 0.014);
    moss.position.set(mx, my, mz);
    moss.scale.set(1, 0.45, 0.8);
    statue.add(moss);
  }
  return statue;
}

/**
 * Arco de piedra antigua cubierto de enredaderas y musgo: medio toro
 * encajado entre dos pilares, con lianas verdes colgando del intradós.
 */
export function buildVineArch(): THREE.Group {
  const arch = new THREE.Group();
  const stone = '#78716c';
  const stoneDark = '#57534e';

  for (const side of [-1, 1]) {
    const pillar = toonMesh(new THREE.CylinderGeometry(0.42, 0.52, 3.6, 8), stone, 0.026);
    pillar.position.set(1.6 * side, 1.8, 0);
    arch.add(pillar);
    const cap = toonMesh(new THREE.CylinderGeometry(0.6, 0.6, 0.28, 8), stoneDark, 0.02);
    cap.position.set(1.6 * side, 3.7, 0);
    arch.add(cap);
  }
  // Dintel curvado: medio toro apoyado sobre las zapatas de los pilares.
  const lintel = toonMesh(new THREE.TorusGeometry(1.6, 0.42, 10, 22, Math.PI), stone, 0.026);
  lintel.position.y = 3.7;
  arch.add(lintel);

  // Enredaderas: cadenas de esferas verdes colgando del arco + musgo en las
  // claves de piedra (patrón determinista, sin PRNG).
  const vineGeometry = new THREE.SphereGeometry(0.09, 8, 6);
  const vineMaterial = createToonMaterial('#16a34a');
  const mossMaterial = createToonMaterial('#4ade80');
  for (let i = 0; i < 5; i++) {
    const ang = Math.PI * (0.18 + i * 0.16);
    const vx = Math.cos(ang) * 1.6;
    const vy = 3.7 + Math.sin(ang) * 1.6;
    const length = 3 + (i % 3) * 0.8;
    for (let j = 0; j < Math.round(length / 0.3); j++) {
      const knot = new THREE.Mesh(vineGeometry, vineMaterial);
      knot.position.set(vx, vy - 0.25 - j * 0.3, (j % 2 === 0 ? 1 : -1) * 0.12);
      arch.add(knot);
    }
    const moss = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mossMaterial);
    moss.position.set(vx, vy + 0.1, 0);
    moss.scale.set(1, 0.5, 1);
    arch.add(moss);
  }
  // Musgo en la base de los pilares.
  for (const side of [-1, 1]) {
    const moss = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), mossMaterial);
    moss.position.set(1.6 * side, 0.35, 0.2);
    moss.scale.set(1, 0.5, 0.9);
    arch.add(moss);
  }
  return arch;
}
