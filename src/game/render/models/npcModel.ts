// ============================================================================
// NPC MODEL — NPC amigable cabezón
// ============================================================================
// NPC estilo Animal Crossing con boina de explorador, pañuelo del color de acento y bocadillo [E] flotante. Extraído de proceduralModels.ts (P8).
// ============================================================================

import * as THREE from 'three';
import { createToonMaterial } from '../toonMaterials';
import { toonMesh } from '../meshFactory';
import { buildEyes, buildLimb } from './modelParts';

/**
 * NPC amigable cabezón (estilo Animal Crossing): boina/sombrero de
 * explorador, pañuelo del color `accentColor` y un bocadillo azul cian
 * flotante con la letra [E] encima para invitar a hablar.
 */
export function buildNpcModel(accentColor: string): THREE.Group {
  const group = new THREE.Group();
  group.name = 'npc';

  const skin = '#f5d0a9';
  const clothes = '#78716c';

  // Cuerpo compacto con mono de aldeano.
  const torso = toonMesh(new THREE.CapsuleGeometry(0.32, 0.3, 8, 14), clothes, 0.018);
  torso.name = 'torso';
  torso.position.y = 0.52;
  group.add(torso);

  // Piernas cortas.
  group.add(buildLimb('leftLeg', 0.16, 0.3, 0.12, 0.14, clothes));
  group.add(buildLimb('rightLeg', -0.16, 0.3, 0.12, 0.14, clothes));

  // Brazos relajados a los lados.
  group.add(buildLimb('leftArm', 0.4, 0.7, 0.1, 0.24, skin));
  group.add(buildLimb('rightArm', -0.4, 0.7, 0.1, 0.24, skin));

  // Cabeza grande cabezona.
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.28;
  const skull = toonMesh(new THREE.SphereGeometry(0.5, 18, 14), skin, 0.018);
  head.add(skull);
  buildEyes(head);
  // Sonrisa pequeña.
  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.1, 0.025, 6, 12, Math.PI),
    createToonMaterial('#9a6b4f')
  );
  smile.position.set(0, -0.16, 0.44);
  smile.rotation.z = Math.PI;
  head.add(smile);
  // Boina/sombrero de explorador.
  const beret = toonMesh(
    new THREE.SphereGeometry(0.52, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.6),
    '#7c4a21',
    0.016
  );
  beret.position.y = 0.18;
  head.add(beret);
  const beretBrim = toonMesh(
    new THREE.CylinderGeometry(0.56, 0.56, 0.05, 14),
    '#8a5a2b',
    0.014
  );
  beretBrim.position.y = 0.16;
  head.add(beretBrim);
  group.add(head);

  // Pañuelo del color de acento (la marca visual del NPC).
  const scarf = toonMesh(new THREE.TorusGeometry(0.3, 0.08, 10, 20), accentColor, 0.016);
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 0.92;
  group.add(scarf);
  const scarfTail = toonMesh(
    new THREE.BoxGeometry(0.16, 0.34, 0.05),
    accentColor,
    0.014
  );
  scarfTail.position.set(0.18, 0.74, -0.16);
  scarfTail.rotation.x = -0.25;
  group.add(scarfTail);

  // Bocadillo azul cian flotante con la letra [E] encima de la cabeza.
  const icon = new THREE.Group();
  icon.name = 'promptIcon';
  icon.position.y = 2.35;
  const bubbleMaterial = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.85,
  });
  const bubble = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.14), bubbleMaterial);
  icon.add(bubble);
  const bubbleTail = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.2, 6),
    bubbleMaterial
  );
  bubbleTail.position.set(0, -0.32, 0);
  bubbleTail.rotation.x = Math.PI;
  icon.add(bubbleTail);
  // Letra E: 4 cajitas oscuras (palito vertical + 3 barras).
  const eMaterial = new THREE.MeshBasicMaterial({ color: 0x0b1220 });
  const eVertical = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, 0.05), eMaterial);
  eVertical.position.set(-0.09, 0, 0.08);
  icon.add(eVertical);
  for (const [dy, w] of [[0.105, 0.22], [0, 0.18], [-0.105, 0.22]] as const) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, 0.05), eMaterial);
    bar.position.set(0.01, dy, 0.08);
    icon.add(bar);
  }
  group.add(icon);

  return group;
}
