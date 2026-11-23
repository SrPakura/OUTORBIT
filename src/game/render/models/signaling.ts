// ============================================================================
// SIGNALING — escudo, balizas y conos de visión
// ============================================================================
// Cinturón de interceptores del escudo planetario, balizas verticales de energía y conos de visión translúcidos. Extraído de proceduralModels.ts (P8).
// ============================================================================

import * as THREE from 'three';
import {
  additiveGlowMaterial,
  toonMesh,
} from '../meshFactory';

// ============================================================================
// Escudo planetario, balizas verticales y conos de visión (señalización
// diegética: el objetivo debe ser obvio a simple vista)
// ============================================================================

/**
 * Cinturón de Asteroides Interceptores: 5 rocas grandes rojas/oscuras con
 * contorno cómic que orbitan rápido alrededor de un planeta "protegido".
 * Sustituye al antiguo domo de escudo translúcido: el planeta sigue siendo
 * accesible físicamente, pero cruzar la tormenta tiene riesgo de impacto.
 */
export function buildInterceptorBelt(planetRadius: number): {
  group: THREE.Group;
  asteroidCount: number;
  asteroidRadii: number[];
  orbitRadii: number[];
  heights: number[];
  baseAngles: number[];
  speeds: number[];
} {
  const group = new THREE.Group();
  group.name = 'interceptorBelt';

  const asteroidCount = 5;
  const asteroidRadii: number[] = [];
  const orbitRadii: number[] = [];
  const heights: number[] = [];
  const baseAngles: number[] = [];
  const speeds: number[] = [];

  const rockColors = ['#7f1d1d', '#450a0a', '#991b1b', '#5b1113', '#85222a'];
  for (let i = 0; i < asteroidCount; i++) {
    const size = planetRadius * (0.085 + (i % 3) * 0.02);
    const asteroid = toonMesh(
      new THREE.DodecahedronGeometry(size, 0),
      rockColors[i % rockColors.length],
      size * 0.16
    );
    asteroid.name = `interceptor-${i}`;
    group.add(asteroid);
    asteroidRadii.push(size);
    orbitRadii.push(planetRadius * (1.3 + (i % 2) * 0.18));
    heights.push(((i % 3) - 1) * planetRadius * 0.22);
    baseAngles.push((i / asteroidCount) * Math.PI * 2);
    speeds.push(0.85 + (i % 2) * 0.28); // rad/s: órbita rápida y visible
  }

  return { group, asteroidCount, asteroidRadii, orbitRadii, heights, baseAngles, speeds };
}

/**
 * Columna de luz vertical semitransparente aditiva (con halo en la base) para
 * marcar generadores, tarjetas de acceso y zonas clave: el objetivo es 100%
 * obvio a simple vista desde cualquier punto del planeta.
 */
export function buildBeaconBeam(color: string, height = 16): THREE.Mesh {
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.6, height, 10, 1, true),
    additiveGlowMaterial(color, 0.32, { doubleSide: true, depthWrite: false })
  );
  beam.name = 'beaconBeam';
  beam.position.y = height / 2;

  // Núcleo interior más brillante.
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.24, height, 8, 1, true),
    additiveGlowMaterial(0xffffff, 0.45, { depthWrite: false })
  );
  beam.add(core);

  // Halo en la base.
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(1.05, 0.16, 8, 28),
    additiveGlowMaterial(color, 0.7, { depthWrite: false })
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.y = -height / 2 + 0.06;
  beam.add(halo);

  return beam;
}

/**
 * Cono de visión pegado al suelo: sector circular subdividido en 6 anillos
 * radiales cuya altura se curva con la esfera (`y = 0.14 - r²/(2·R)`) para que
 * el cono abrace el planeta y JAMÁS atraviese el horizonte ni apunte al cielo.
 * El ápice está en (0, 0.14, 0) abriéndose hacia +Z (el frente del guardia).
 * El material es básico transparente para recolorearlo en vivo (verde/ámbar
 * patrulla, amarillo investigando, rojo combate).
 */
export function buildVisionConeMesh(
  range: number,
  halfAngleRad: number,
  planetRadius: number
): { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial } {
  const segments = 24;
  const rings = 6;
  const apexY = 0.14;
  const ringHeight = (r: number): number => apexY - (r * r) / (2 * planetRadius);

  // Vértices: ápice + 6 anillos radiales de `segments + 1` puntos.
  const positions: number[] = [0, apexY, 0];
  for (let ring = 1; ring <= rings; ring++) {
    const r = (ring / rings) * range;
    const y = ringHeight(r);
    for (let i = 0; i <= segments; i++) {
      const ang = -halfAngleRad + (i / segments) * halfAngleRad * 2;
      positions.push(Math.sin(ang) * r, y, Math.cos(ang) * r);
    }
  }

  // Índices: abanico del ápice al primer anillo + quads entre anillos.
  const indices: number[] = [];
  const ringStride = segments + 1;
  for (let i = 1; i <= segments; i++) {
    indices.push(0, i, i + 1);
  }
  for (let ring = 1; ring < rings; ring++) {
    const base = 1 + (ring - 1) * ringStride;
    const next = base + ringStride;
    for (let i = 0; i < segments; i++) {
      indices.push(base + i, next + i, base + i + 1);
      indices.push(base + i + 1, next + i, next + i + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({
    color: 0x4ade80,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'visionCone';
  return { mesh, material };
}
