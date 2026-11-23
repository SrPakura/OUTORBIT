// ============================================================================
// STRUCTURES — edificios con colisión real (OUTORBIT 2.0)
// ============================================================================
// Murallas, torres, búnkers, arcos, plataformas, pilares y puentes sobre cimientos profundos, y buildStructureMesh. Extraído de proceduralModels.ts (P8).
// ============================================================================

import * as THREE from 'three';
import { type StructureSpec } from '../../types';
import { orientObjectOnSphere } from '../../math/spherical';
import {
  additiveGlowMaterial,
  celMesh,
  lighten,
} from '../meshFactory';

// ============================================================================
// Estructuras con colisión real (OUTORBIT 2.0): murallas, torres, búnkers,
// arcos, plataformas, pilares y puentes. Convención de `StructureSpec`:
// size = [halfX, heightY, halfZ], origen del grupo en la base (superficie +
// altitudeOffset), +Y = normal del planeta, yaw alrededor de la normal.
// ============================================================================

const _structDir = new THREE.Vector3();

/** Cimiento que baja 2 m bajo la superficie: ancla visual sobre la esfera curva. */
const FOUNDATION_DEPTH = 2.0;

function addFoundation(
  group: THREE.Group,
  halfX: number,
  halfZ: number,
  color: string
): void {
  const foundation = celMesh(
    new THREE.BoxGeometry(halfX * 2 * 1.06, FOUNDATION_DEPTH, halfZ * 2 * 1.06),
    color,
    0.02
  );
  foundation.position.y = -FOUNDATION_DEPTH / 2;
  group.add(foundation);
}

function buildWallMesh(
  group: THREE.Group,
  halfX: number,
  heightY: number,
  halfZ: number,
  color: string
): void {
  addFoundation(group, halfX, halfZ, color);
  const body = celMesh(new THREE.BoxGeometry(halfX * 2, heightY, halfZ * 2), color, 0.028);
  body.position.y = heightY / 2;
  group.add(body);

  // Banda superior de acento blindado.
  const band = celMesh(
    new THREE.BoxGeometry(halfX * 2 * 1.02, 0.55, halfZ * 2 * 1.06),
    lighten(color),
    0.02
  );
  band.position.y = heightY - 0.55;
  group.add(band);

  // Almenas a lo largo del adarve.
  const merlonCount = Math.max(2, Math.round(halfX));
  const merlonWidth = (halfX * 2) / (merlonCount * 2 - 1);
  for (let i = 0; i < merlonCount; i++) {
    const merlon = celMesh(
      new THREE.BoxGeometry(merlonWidth, 0.55, halfZ * 2 * 1.05),
      color,
      0.02
    );
    merlon.position.set(-halfX + merlonWidth * 0.5 + i * merlonWidth * 2, heightY + 0.28, 0);
    group.add(merlon);
  }
}

function buildTowerMesh(
  group: THREE.Group,
  halfX: number,
  heightY: number,
  halfZ: number,
  color: string
): void {
  addFoundation(group, halfX * 0.9, halfZ * 0.9, color);
  // Fuste elevado.
  const shaft = celMesh(
    new THREE.BoxGeometry(halfX * 1.5, heightY - 1.4, halfZ * 1.5),
    color,
    0.028
  );
  shaft.position.y = (heightY - 1.4) / 2;
  group.add(shaft);

  // Plataforma de vigilancia arriba (tejado caminable).
  const accent = lighten(color);
  const deck = celMesh(
    new THREE.BoxGeometry(halfX * 2.6, 0.7, halfZ * 2.6),
    accent,
    0.024
  );
  deck.position.y = heightY - 0.7;
  group.add(deck);

  // Barandilla perimetral.
  const railHeight = 0.75;
  const railGeoX = new THREE.BoxGeometry(halfX * 2.6, railHeight, 0.12);
  const railGeoZ = new THREE.BoxGeometry(0.12, railHeight, halfZ * 2.6);
  for (const side of [-1, 1]) {
    const railA = celMesh(railGeoX, accent, 0.018);
    railA.position.set(0, heightY + railHeight / 2 - 0.35, halfZ * 1.3 * side);
    group.add(railA);
    const railB = celMesh(railGeoZ, accent, 0.018);
    railB.position.set(halfX * 1.3 * side, heightY + railHeight / 2 - 0.35, 0);
    group.add(railB);
  }

  // Lámpara de vigilancia.
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
  );
  lamp.position.y = heightY + 0.25;
  group.add(lamp);
}

function buildBunkerMesh(
  group: THREE.Group,
  halfX: number,
  heightY: number,
  halfZ: number,
  color: string
): void {
  addFoundation(group, halfX, halfZ, color);
  const body = celMesh(new THREE.BoxGeometry(halfX * 2, heightY, halfZ * 2), color, 0.03);
  body.position.y = heightY / 2;
  group.add(body);

  // Techo plano accesible con remate perimetral.
  const roof = celMesh(
    new THREE.BoxGeometry(halfX * 2 * 1.08, 0.45, halfZ * 2 * 1.08),
    lighten(color),
    0.024
  );
  roof.position.y = heightY + 0.22;
  group.add(roof);

  // Ranura de puerta al frente.
  const doorHeight = Math.min(2.2, heightY * 0.55);
  const door = celMesh(new THREE.BoxGeometry(1.4, doorHeight, 0.3), '#0f172a', 0.012);
  door.position.set(0, doorHeight / 2, halfZ + 0.05);
  group.add(door);
}

function buildArchGateMesh(
  group: THREE.Group,
  halfX: number,
  heightY: number,
  halfZ: number,
  altitude: number,
  color: string
): void {
  // El collider es el dintel flotante (a `altitude` sobre el suelo): se pasa
  // andando o por debajo. Los pilares son el marco visual y bajan 2 m extra
  // para no flotar sobre la esfera curva.
  const accent = lighten(color);
  const pillarHeight = altitude + FOUNDATION_DEPTH;
  for (const side of [-1, 1]) {
    const pillar = celMesh(
      new THREE.BoxGeometry(0.9, pillarHeight, halfZ * 2),
      color,
      0.026
    );
    pillar.position.set((halfX - 0.45) * side, -pillarHeight / 2, 0);
    group.add(pillar);
    const cap = celMesh(
      new THREE.BoxGeometry(1.15, 0.35, halfZ * 2 * 1.1),
      accent,
      0.02
    );
    cap.position.set((halfX - 0.45) * side, -0.18, 0);
    group.add(cap);
  }

  // Dintel superior.
  const lintel = celMesh(new THREE.BoxGeometry(halfX * 2, heightY, halfZ * 2), color, 0.026);
  lintel.position.y = heightY / 2;
  group.add(lintel);
  const crest = celMesh(
    new THREE.BoxGeometry(halfX * 0.9, 0.5, halfZ * 2 * 0.9),
    accent,
    0.02
  );
  crest.position.y = heightY + 0.25;
  group.add(crest);
}

function buildPlatformMesh(
  group: THREE.Group,
  halfX: number,
  heightY: number,
  _halfZ: number,
  color: string
): void {
  // Losa hexagonal flotante (orbital o de patio).
  const slab = celMesh(
    new THREE.CylinderGeometry(halfX, halfX * 0.92, heightY, 6),
    color,
    0.03
  );
  slab.position.y = heightY / 2;
  group.add(slab);

  // Borde luminoso aditivo.
  const glowColor = lighten(color, 0.25);
  const edge = new THREE.Mesh(
    new THREE.TorusGeometry(halfX * 0.98, 0.14, 8, 32),
    additiveGlowMaterial(glowColor, 0.75, { depthWrite: false })
  );
  edge.rotation.x = Math.PI / 2;
  edge.position.y = heightY + 0.05;
  group.add(edge);

  // Emisor antigravitatorio colgante.
  const emitter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.55, 1.6, 8),
    additiveGlowMaterial(glowColor, 0.85, { depthWrite: false })
  );
  emitter.position.y = -0.9;
  group.add(emitter);
}

function buildPillarMesh(
  group: THREE.Group,
  halfX: number,
  heightY: number,
  halfZ: number,
  color: string
): void {
  const body = celMesh(
    new THREE.CylinderGeometry(halfX, halfX * 1.15, heightY, 8),
    color,
    0.028
  );
  body.position.y = heightY / 2;
  group.add(body);
  const cap = celMesh(
    new THREE.BoxGeometry(halfX * 2.4, 0.4, halfZ * 2.4),
    lighten(color),
    0.02
  );
  cap.position.y = heightY + 0.2;
  group.add(cap);
}

function buildBridgeMesh(
  group: THREE.Group,
  halfX: number,
  heightY: number,
  halfZ: number,
  altitude: number,
  color: string
): void {
  // Tablero caminable (por debajo se pasa libremente).
  const deck = celMesh(new THREE.BoxGeometry(halfX * 2, heightY, halfZ * 2), color, 0.028);
  deck.position.y = heightY / 2;
  group.add(deck);

  // Barandillas laterales.
  const accent = lighten(color);
  for (const side of [-1, 1]) {
    const rail = celMesh(new THREE.BoxGeometry(halfX * 2, 0.55, 0.12), accent, 0.018);
    rail.position.set(0, heightY + 0.28, (halfZ - 0.06) * side);
    group.add(rail);
  }

  // Pilares de apoyo hasta el suelo cuando la pasarela está elevada.
  if (altitude > 0.6) {
    const strutCount = Math.max(2, Math.round(halfX / 4));
    for (let i = 0; i < strutCount; i++) {
      const strut = celMesh(new THREE.BoxGeometry(0.35, altitude, 0.35), color, 0.02);
      const t = strutCount === 1 ? 0.5 : i / (strutCount - 1);
      strut.position.set(-halfX + 1 + t * (halfX * 2 - 2), -altitude / 2, 0);
      group.add(strut);
    }
  }
}

/**
 * Construye el modelo visual de una estructura sobre la superficie de un
 * planeta. Orienta el grupo sobre la normal de la esfera
 * (`orientObjectOnSphere`) y aplica el giro `spec.yaw` alrededor de esa
 * normal — exactamente la misma convención que `createStructureCollider`,
 * así el visual y la colisión coinciden.
 */
export function buildStructureMesh(
  spec: StructureSpec,
  planetCenter: THREE.Vector3,
  planetRadius: number
): THREE.Group {
  const group = new THREE.Group();
  group.name = `structure-${spec.id}`;
  const halfX = spec.size[0];
  const heightY = spec.size[1];
  const halfZ = spec.size[2];
  const altitude = spec.altitudeOffset ?? 0;

  switch (spec.kind) {
    case 'wall':
      buildWallMesh(group, halfX, heightY, halfZ, spec.color);
      break;
    case 'tower':
      buildTowerMesh(group, halfX, heightY, halfZ, spec.color);
      break;
    case 'bunker':
      buildBunkerMesh(group, halfX, heightY, halfZ, spec.color);
      break;
    case 'arch_gate':
      buildArchGateMesh(group, halfX, heightY, halfZ, altitude, spec.color);
      break;
    case 'platform':
      buildPlatformMesh(group, halfX, heightY, halfZ, spec.color);
      break;
    case 'pillar':
      buildPillarMesh(group, halfX, heightY, halfZ, spec.color);
      break;
    case 'bridge':
      buildBridgeMesh(group, halfX, heightY, halfZ, altitude, spec.color);
      break;
  }

  _structDir.set(spec.sphericalDir[0], spec.sphericalDir[1], spec.sphericalDir[2]).normalize();
  orientObjectOnSphere(group, planetCenter, _structDir, planetRadius + altitude);
  group.rotateY(spec.yaw ?? 0);
  return group;
}
