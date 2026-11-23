// ============================================================================
// CYBER PROPS — Neon Bastion (Metrópolis)
// ============================================================================
// Props cyberpunk: carteles de neón, rascacielos con ventanas emisivas, pilares holográficos y el pino navideño del distrito frío. Extraído de proceduralModels.ts (P8).
// ============================================================================

import * as THREE from 'three';
import { buildPineTree } from './verdantProps';
import {
  additiveGlowMaterial,
  celMesh,
} from '../meshFactory';

// ============================================================================
// Props cyberpunk (Neon Bastion · Metrópolis): carteles de neón, rascacielos
// futuristas y terminales holográficas del bulevar.
// ============================================================================

/**
 * Cartel publicitario de neón: poste metálico doble y panel luminoso oscuro
 * con barras de neón cian/magenta (glifos katakana estilizados), marco de
 * neón perimetral y antena superior con baliza roja.
 */
export function buildNeonBillboard(): THREE.Group {
  const billboard = new THREE.Group();
  // Poste metálico doble.
  for (const side of [-1, 1]) {
    const post = celMesh(new THREE.CylinderGeometry(0.09, 0.12, 4.6, 8), '#334155', 0.016);
    post.position.set(0.8 * side, 2.3, 0);
    billboard.add(post);
  }
  // Panel del cartel: chapa oscura con marco.
  const panel = celMesh(new THREE.BoxGeometry(3.4, 2.0, 0.22), '#0f172a', 0.02);
  panel.position.y = 4.4;
  billboard.add(panel);
  // Barras de neón cian/magenta: líneas de texto publicitario ilegible.
  const cyanMaterial = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
  const magentaMaterial = new THREE.MeshBasicMaterial({ color: 0xe879f9 });
  const barGeometry = new THREE.BoxGeometry(1, 0.16, 0.06);
  const barWidths = [2.4, 1.7, 2.1, 1.3];
  for (let i = 0; i < barWidths.length; i++) {
    const bar = new THREE.Mesh(barGeometry, i % 2 === 0 ? cyanMaterial : magentaMaterial);
    bar.scale.x = barWidths[i];
    bar.position.set((i % 2 === 0 ? -0.15 : 0.2) * (i % 2), 4.95 - i * 0.38, 0.15);
    billboard.add(bar);
  }
  // Marco de neón cian perimetral.
  const frameVGeometry = new THREE.BoxGeometry(0.08, 2.0, 0.08);
  const frameHGeometry = new THREE.BoxGeometry(3.4, 0.08, 0.08);
  for (const side of [-1, 1]) {
    const frameV = new THREE.Mesh(frameVGeometry, cyanMaterial);
    frameV.position.set(1.62 * side, 4.4, 0.14);
    billboard.add(frameV);
  }
  for (const dy of [-1.04, 1.04]) {
    const frameH = new THREE.Mesh(frameHGeometry, cyanMaterial);
    frameH.position.set(0, 4.4 + dy, 0.14);
    billboard.add(frameH);
  }
  // Antena superior con baliza roja.
  const antenna = celMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), '#94a3b8', 0.012);
  antenna.position.set(1.1, 5.85, 0);
  billboard.add(antenna);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xef4444 })
  );
  beacon.position.set(1.1, 6.32, 0);
  billboard.add(beacon);
  return billboard;
}

/**
 * Rascacielos futurista de Neon Bastion: fuste escalonado oscuro de 3 tramos
 * con franjas horizontales de ventanas neón cian/magenta y baliza roja en la
 * azotea sobre mástil de comunicaciones.
 */
export function buildCyberTower(): THREE.Group {
  const tower = new THREE.Group();
  const bodyColors = ['#0f172a', '#131c33', '#0f172a'];
  const cyanMaterial = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
  const magentaMaterial = new THREE.MeshBasicMaterial({ color: 0xe879f9 });
  // Fuste escalonado: 3 tramos que se estrechan hacia el cielo.
  const sections: Array<[number, number, number]> = [
    [1.5, 5.2, 0],
    [1.15, 4.8, 5.2],
    [0.8, 4.4, 10.0],
  ];
  sections.forEach(([halfX, height, baseY], i) => {
    const body = celMesh(
      new THREE.BoxGeometry(halfX * 2, height, halfX * 2),
      bodyColors[i],
      0.022
    );
    body.position.y = baseY + height / 2;
    tower.add(body);
    // Franjas horizontales de ventanas neón: anillos que rodean las 4 caras.
    const stripeCount = 3;
    for (let s = 0; s < stripeCount; s++) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(halfX * 2 * 1.03, 0.2, halfX * 2 * 1.03),
        (i + s) % 2 === 0 ? cyanMaterial : magentaMaterial
      );
      stripe.position.y = baseY + 0.9 + (s * (height - 1.6)) / (stripeCount - 1);
      tower.add(stripe);
    }
    // Remate blindado entre tramos.
    const cap = celMesh(
      new THREE.BoxGeometry(halfX * 2 * 1.08, 0.24, halfX * 2 * 1.08),
      '#334155',
      0.018
    );
    cap.position.y = baseY + 0.12;
    tower.add(cap);
  });
  // Azotea: remate, mástil y baliza roja de aviación.
  const roof = celMesh(new THREE.BoxGeometry(1.0, 0.3, 1.0), '#334155', 0.018);
  roof.position.y = 14.45;
  tower.add(roof);
  const mast = celMesh(new THREE.CylinderGeometry(0.05, 0.08, 1.7, 6), '#64748b', 0.014);
  mast.position.y = 15.4;
  tower.add(mast);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xef4444 })
  );
  beacon.position.y = 16.3;
  tower.add(beacon);
  return tower;
}

/**
 * Terminal holográfica del bulevar: base metálica con pedestal de mando y
 * pantalla magenta, haz de proyección y prisma flotante cian rodeado por un
 * anillo de luz (ambos aditivos, como un holograma real).
 */
export function buildHoloPillar(): THREE.Group {
  const pillar = new THREE.Group();
  // Base metálica anclada al asfalto.
  const base = celMesh(new THREE.CylinderGeometry(0.55, 0.7, 0.4, 10), '#334155', 0.018);
  base.position.y = 0.2;
  pillar.add(base);
  // Pedestal/terminal oscuro con pantalla luminosa.
  const terminal = celMesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), '#1f2937', 0.016);
  terminal.position.y = 0.85;
  pillar.add(terminal);
  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.5, 0.05),
    new THREE.MeshBasicMaterial({ color: 0xe879f9 })
  );
  screen.position.set(0, 0.95, 0.27);
  pillar.add(screen);
  // Haz de proyección cian translúcido.
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.3, 0.9, 8, 1, true),
    additiveGlowMaterial(0x22d3ee, 0.25, { doubleSide: true, depthWrite: false })
  );
  beam.position.y = 1.6;
  pillar.add(beam);
  // Prisma holográfico flotante cian.
  const holo = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.34, 0),
    additiveGlowMaterial(0x22d3ee, 0.7, { depthWrite: false })
  );
  holo.name = 'holoPrism';
  holo.position.y = 2.15;
  holo.scale.set(0.8, 1.3, 0.8);
  pillar.add(holo);
  // Anillo de luz magenta orbitando el prisma.
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.045, 8, 24),
    additiveGlowMaterial(0xe879f9, 0.75, { depthWrite: false })
  );
  ring.name = 'holoRing';
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 2.15;
  pillar.add(ring);
  return pillar;
}

/** Pino reutilizable como prop (el mismo builder de los planetas). */
export function buildPineTreeProp(): THREE.Group {
  return buildPineTree();
}

