// ============================================================================
// PLANET MODEL — planetas procedurales de la galaxia
// ============================================================================
// placeOnSphere, shaders de atmósfera con halo BackSide y anillos orbitales de maná translúcido, y buildPlanetModel. Extraído de proceduralModels.ts (P8).
// ============================================================================

import * as THREE from 'three';
import { type PlanetSpec } from '../../types';
import { getPlanetTerrainOffset } from '../../math/terrain';
import {
  hashString,
  makeSeededRandom,
  toonMesh,
} from '../meshFactory';

// ============================================================================
// Utilidades
// ============================================================================

const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _alignQuat = new THREE.Quaternion();

/** Coloca un objeto sobre la superficie de una esfera (dir no unitario permitido). */
function placeOnSphere(
  obj: THREE.Object3D,
  center: THREE.Vector3,
  dirX: number,
  dirY: number,
  dirZ: number,
  altitude: number
): void {
  _dir.set(dirX, dirY, dirZ).normalize();
  obj.position.copy(center).addScaledVector(_dir, altitude);
  _alignQuat.setFromUnitVectors(_up, _dir);
  obj.quaternion.copy(_alignQuat);
}

// ============================================================================
// Atmósfera con halo BackSide en el limbo exterior (referencia_visual.html):
// esfera a radius * 1.12 renderizada por su cara INTERIOR, de modo que el
// halo vive solo en el borde exterior del planeta y NUNCA corta por delante
// de la superficie ni de los edificios (la cara frontal se descarta, y el
// depth test ocluye el halo tras el limbo del planeta).
// ============================================================================

const atmosphereVertexShader = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 wp = modelMatrix * vec4( position, 1.0 );
    vN = normalize( mat3( modelMatrix ) * normal );
    vV = normalize( cameraPosition - wp.xyz );
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const atmosphereFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float rim = pow( clamp( dot( -vN, vV ), 0.0, 1.0 ), 3.0 ) * smoothstep( 0.0, 0.35, dot( -vN, vV ) );
    gl_FragColor = vec4( uColor, rim * 0.85 );
  }
`;

// ============================================================================
// Anillos orbitales: maná translúcido animado con borde de energía brillante
// (Persona 5 x Epic Mickey x Frieren). `uv.x` recorre el anillo y `uv.y` la
// sección del tubo (0/1 = borde exterior, 0.5 = borde interior).
// ============================================================================

const ringVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalWorld;
  varying vec3 vViewDir;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4( position, 1.0 );
    vNormalWorld = normalize( mat3( modelMatrix ) * normal );
    vViewDir = normalize( cameraPosition - wp.xyz );
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const ringFragmentShader = /* glsl */ `
  uniform vec3 uRingColor;
  uniform vec3 uEdgeColor;
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormalWorld;
  varying vec3 vViewDir;

  void main() {
    float around = vUv.x;
    float tube = vUv.y;

    // Ondas de maná que derivan despacio alrededor del anillo.
    float waveA = 0.5 + 0.5 * sin( around * 42.0 - uTime * 1.6 );
    float waveB = 0.5 + 0.5 * sin( around * 17.0 + uTime * 0.9 + tube * 6.2831853 );
    float mana = pow( waveA * 0.6 + waveB * 0.4, 1.6 );

    // Borde exterior de energía: limbo del tubo (uv.y 0/1) encendido.
    float edge = smoothstep( 0.55, 1.0, abs( tube - 0.5 ) * 2.0 );
    // Fresnel suave: el anillo se enciende en su silueta contra el espacio.
    float rim = pow( 1.0 - abs( dot( normalize( vNormalWorld ), normalize( vViewDir ) ) ), 2.0 );

    vec3 col = mix( uRingColor, uEdgeColor, edge );
    col += uEdgeColor * edge * 0.85;
    col += uRingColor * mana * 0.55;
    col += uEdgeColor * rim * 0.35;

    float alpha = uOpacity * ( 0.45 + mana * 0.55 ) + edge * 0.35;
    gl_FragColor = vec4( col, clamp( alpha, 0.0, 1.0 ) );
  }
`;

/**
 * Construye un planeta completo: esfera cel-shaded con contorno, parches de
 * terreno/hielo, árboles pino low-poly, anillos orbitales semitransparentes y
 * asteroides diamante/cubo rotando en órbita. `animTick` anima anillos y
 * asteroides (la esfera NO rota: el jugador camina sobre ella).
 */
export function buildPlanetModel(spec: PlanetSpec): {
  group: THREE.Group;
  animTick: (dt: number) => void;
} {
  const group = new THREE.Group();
  group.name = `planet-${spec.id}`;
  const center = new THREE.Vector3(...spec.center);
  const random = makeSeededRandom(hashString(spec.id));
  const outlineThickness = Math.max(spec.radius * 0.006, 0.03);

  // --- Esfera principal desplazada por el terreno (Hito 2) ---
  // 88x60 segmentos para que colinas, cráteres y valles se lean suaves.
  // Cada vértice se normaliza a su dirección radial, evalúa el heightfield
  // determinista y se desplaza a (radius + h). El color por vértice oscurece
  // las hondonadas y aclara las crestas manteniendo la respuesta toon.
  const sphereGeometry = new THREE.SphereGeometry(spec.radius, 88, 60);
  const positionAttr = sphereGeometry.getAttribute('position') as THREE.BufferAttribute;
  const vertexCount = positionAttr.count;
  const vertexColors = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    const px = positionAttr.getX(i);
    const py = positionAttr.getY(i);
    const pz = positionAttr.getZ(i);
    const len = Math.sqrt(px * px + py * py + pz * pz);
    const inv = len > 1e-9 ? 1 / len : 0;
    const nx = px * inv;
    const ny = py * inv;
    const nz = pz * inv;
    const h = getPlanetTerrainOffset(spec.id, nx, ny, nz);
    const r = spec.radius + h;
    positionAttr.setXYZ(i, nx * r, ny * r, nz * r);
    const shade = 1 + Math.max(-0.08, Math.min(0.08, h * 0.075));
    vertexColors[i * 3] = shade;
    vertexColors[i * 3 + 1] = shade;
    vertexColors[i * 3 + 2] = shade;
  }
  positionAttr.needsUpdate = true;
  sphereGeometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
  sphereGeometry.computeVertexNormals();
  const sphere = toonMesh(sphereGeometry, spec.surfaceColor, outlineThickness);
  (sphere.material as THREE.ShaderMaterial).vertexColors = true;
  sphere.position.copy(center);
  group.add(sphere);

  // --- Atmósfera: halo BackSide suave solo en el borde exterior del limbo ---
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(spec.radius * 1.12, 64, 48),
    new THREE.ShaderMaterial({
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      uniforms: { uColor: { value: new THREE.Color(spec.atmosphereColor) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      fog: false,
    })
  );
  atmosphere.position.copy(center);
  group.add(atmosphere);

  // --- Parches de terreno abrazando el relieve (Hito 2) ---
  const patchCount = 9;
  for (let i = 0; i < patchCount; i++) {
    const u = random();
    const phi = random() * Math.PI * 2;
    const cosTheta = 1 - 2 * u;
    const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
    const dirX = sinTheta * Math.cos(phi);
    const dirY = cosTheta;
    const dirZ = sinTheta * Math.sin(phi);
    const patchRadius = spec.radius * (0.12 + random() * 0.11);
    const isIce = spec.hasIcePatches === true && random() > 0.45;
    const patch = toonMesh(
      new THREE.SphereGeometry(patchRadius, 14, 10),
      isIce ? '#f0f9ff' : spec.patchColor,
      outlineThickness * 0.6
    );
    // Se apoyan sobre la altura exacta del terreno para no flotar ni hundirse.
    // El centro queda hundido 0.214 * patchRadius y el aplanado es 0.22: solo
    // asoma una lámina de terreno de ~0.5-0.8 m que se funde con el relieve,
    // sin cúpulas gigantes que se coman los árboles.
    placeOnSphere(
      patch,
      center,
      dirX,
      dirY,
      dirZ,
      spec.radius + getPlanetTerrainOffset(spec.id, dirX, dirY, dirZ) - patchRadius * 0.214
    );
    patch.scale.y = 0.22;
    group.add(patch);
  }

  // (Hito 2) La flora y rocas de superficie ya NO se generan aquí al azar:
  // viven como PropSpec estructurados en levelDefinitions con grounding exacto
  // y colisión física real. Se mantienen anillos orbitales y asteroides.

  // --- Anillos orbitales: maná animado (ShaderMaterial) ---
  let ringGroup: THREE.Group | null = null;
  const ringMaterials: THREE.ShaderMaterial[] = [];
  if (spec.hasOrbitalRings) {
    ringGroup = new THREE.Group();
    ringGroup.position.copy(center);
    const ringColor = new THREE.Color(spec.ringColor ?? '#c4b5fd');
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(spec.radius * 1.75, spec.radius * 0.14, 10, 72),
      new THREE.ShaderMaterial({
        vertexShader: ringVertexShader,
        fragmentShader: ringFragmentShader,
        uniforms: {
          uRingColor: { value: ringColor },
          uEdgeColor: { value: new THREE.Color('#67e8f9') },
          uTime: { value: 0 },
          uOpacity: { value: 0.42 },
        },
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        fog: false,
      })
    );
    ring.rotation.x = Math.PI / 2 - 0.35;
    ringGroup.add(ring);
    ringMaterials.push(ring.material as THREE.ShaderMaterial);
    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(spec.radius * 2.15, spec.radius * 0.05, 8, 72),
      new THREE.ShaderMaterial({
        vertexShader: ringVertexShader,
        fragmentShader: ringFragmentShader,
        uniforms: {
          uRingColor: { value: ringColor.clone().lerp(new THREE.Color('#a78bfa'), 0.5) },
          uEdgeColor: { value: new THREE.Color('#fde68a') },
          uTime: { value: 0 },
          uOpacity: { value: 0.3 },
        },
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      })
    );
    ring2.rotation.x = Math.PI / 2 - 0.35;
    ringGroup.add(ring2);
    ringMaterials.push(ring2.material as THREE.ShaderMaterial);
    group.add(ringGroup);
  }

  // --- Asteroides en órbita ---
  const asteroidGroup = new THREE.Group();
  asteroidGroup.position.copy(center);
  const asteroids: THREE.Mesh[] = [];
  const asteroidSpin: number[] = [];
  const asteroidCount = 10;
  for (let i = 0; i < asteroidCount; i++) {
    const isDiamond = random() > 0.5;
    const size = spec.radius * (0.03 + random() * 0.035);
    const asteroid = toonMesh(
      isDiamond
        ? new THREE.OctahedronGeometry(size, 0)
        : new THREE.BoxGeometry(size, size, size),
      isDiamond ? '#a5b4fc' : '#9ca3af',
      size * 0.25
    );
    const orbitRadius = spec.radius * (1.9 + random() * 0.6);
    const angle = random() * Math.PI * 2;
    const height = (random() - 0.5) * spec.radius * 0.5;
    asteroid.position.set(
      Math.cos(angle) * orbitRadius,
      height,
      Math.sin(angle) * orbitRadius
    );
    asteroid.rotation.set(random() * Math.PI, random() * Math.PI, 0);
    asteroids.push(asteroid);
    asteroidSpin.push((random() - 0.5) * 2.4);
    asteroidGroup.add(asteroid);
  }
  group.add(asteroidGroup);

  return {
    group,
    animTick(dt: number): void {
      if (ringGroup) {
        ringGroup.rotation.y += dt * 0.06;
        // Maná de los anillos: deriva continua de las ondas y del borde.
        for (let i = 0; i < ringMaterials.length; i++) {
          ringMaterials[i].uniforms.uTime.value += dt;
        }
      }
      asteroidGroup.rotation.y += dt * 0.11;
      for (let i = 0; i < asteroids.length; i++) {
        asteroids[i].rotation.y += dt * asteroidSpin[i];
        asteroids[i].rotation.x += dt * asteroidSpin[i] * 0.6;
      }
    },
  };
}

