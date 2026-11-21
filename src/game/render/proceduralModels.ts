import * as THREE from 'three';
import { GAME_CONSTANTS, type CharacterId, type PlanetSpec } from '../types';
import { addComicOutline, createToonMaterial } from './toonMaterials';

// ============================================================================
// Utilidades
// ============================================================================

/** PRNG determinista (LCG) para que cada planeta/objeto sea siempre igual. */
function makeSeededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

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

/** Mesh toon con contorno cómic en un solo paso. */
function toonMesh(
  geometry: THREE.BufferGeometry,
  color: string | number,
  outlineThickness: number,
  emissive?: string | number
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, createToonMaterial(color, emissive));
  addComicOutline(mesh, outlineThickness);
  return mesh;
}

// ============================================================================
// Personajes modulares cabezones (estilo Animal Crossing)
// ============================================================================

interface CharacterPalette {
  primary: string;
  secondary: string;
  belly: string;
  accent: string;
}

const CHARACTER_PALETTES: Record<CharacterId, CharacterPalette> = {
  kitsune: { primary: '#f97316', secondary: '#fff7ed', belly: '#fff7ed', accent: '#dc2626' },
  digger: { primary: '#92400e', secondary: '#d6a15c', belly: '#eab308', accent: '#f472b6' },
  axel: { primary: '#0ea5e9', secondary: '#a5f3fc', belly: '#67e8f9', accent: '#0891b2' },
};

function buildEyes(head: THREE.Group): void {
  const eyeGeometry = new THREE.SphereGeometry(0.075, 10, 8);
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x111122 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(0.2 * side, 0.1, 0.46);
    head.add(eye);
  }
}

function buildMuzzle(head: THREE.Group, palette: CharacterPalette): void {
  const muzzle = toonMesh(new THREE.SphereGeometry(0.3, 16, 12), palette.secondary, 0.014);
  muzzle.position.set(0, -0.12, 0.36);
  muzzle.scale.set(1.1, 0.85, 0.9);
  head.add(muzzle);

  // Detalle pequeño: sin contorno para evitar manchas de tinta.
  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 10, 8),
    createToonMaterial(palette.accent)
  );
  nose.position.set(0, -0.05, 0.62);
  head.add(nose);
}

function buildLimb(
  name: string,
  x: number,
  y: number,
  radius: number,
  length: number,
  color: string
): THREE.Group {
  const limb = new THREE.Group();
  limb.name = name;
  limb.position.set(x, y, 0);
  const capsule = toonMesh(
    new THREE.CapsuleGeometry(radius, length, 6, 10),
    color,
    THREE.MathUtils.clamp(radius * 0.14, 0.012, 0.018)
  );
  capsule.position.y = -(length / 2 + radius) * 0.6;
  limb.add(capsule);
  return limb;
}

function buildKitsuneHeadExtras(head: THREE.Group, palette: CharacterPalette): void {
  // Orejas puntiagudas naranjas con interior claro
  const earGeometry = new THREE.ConeGeometry(0.16, 0.38, 8);
  const innerGeometry = new THREE.ConeGeometry(0.09, 0.22, 8);
  for (const side of [-1, 1]) {
    const ear = toonMesh(earGeometry, palette.primary, 0.014);
    ear.position.set(0.28 * side, 0.52, 0);
    ear.rotation.z = -0.28 * side;
    head.add(ear);
    const inner = new THREE.Mesh(innerGeometry, createToonMaterial(palette.secondary));
    inner.position.set(0.28 * side, 0.5, 0.06);
    inner.rotation.z = -0.28 * side;
    head.add(inner);
  }
}

function buildDiggerHeadExtras(head: THREE.Group): void {
  // Casco minero amarillo: media esfera + ala
  const helmet = toonMesh(
    new THREE.SphereGeometry(0.56, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    '#facc15',
    0.016
  );
  helmet.position.y = 0.06;
  head.add(helmet);
  const brim = toonMesh(
    new THREE.CylinderGeometry(0.62, 0.62, 0.05, 18),
    '#eab308',
    0.014
  );
  brim.position.set(0, 0.08, 0);
  head.add(brim);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff3b0 })
  );
  lamp.position.set(0, 0.22, 0.5);
  head.add(lamp);
}

function buildAxelHeadExtras(head: THREE.Group): void {
  // Bigotes finos a los lados del hocico
  const whiskerGeometry = new THREE.CylinderGeometry(0.012, 0.012, 0.42, 5);
  const whiskerMaterial = createToonMaterial('#e0f2fe');
  for (const side of [-1, 1]) {
    for (const dy of [0.04, -0.04]) {
      const whisker = new THREE.Mesh(whiskerGeometry, whiskerMaterial);
      whisker.position.set(0.34 * side, -0.1 + dy, 0.42);
      whisker.rotation.z = Math.PI / 2 + dy * 4 * side;
      head.add(whisker);
    }
  }
}

function buildTail(id: CharacterId, palette: CharacterPalette): THREE.Group {
  const tail = new THREE.Group();
  tail.name = 'tail';
  if (id === 'kitsune') {
    // Cola esponjosa: cadena de esferas con punta blanca
    const segments: Array<[number, number, number, number, string]> = [
      [0, 0.42, -0.42, 0.24, palette.primary],
      [0, 0.52, -0.68, 0.2, palette.primary],
      [0, 0.62, -0.88, 0.15, palette.secondary],
    ];
    for (const [x, y, z, r, color] of segments) {
      const ball = toonMesh(new THREE.SphereGeometry(r, 14, 10), color, 0.014);
      ball.position.set(x, y, z);
      tail.add(ball);
    }
  } else if (id === 'digger') {
    // Cola corta de topo
    const stub = toonMesh(new THREE.SphereGeometry(0.14, 12, 8), palette.secondary, 0.014);
    stub.position.set(0, 0.4, -0.4);
    tail.add(stub);
  } else {
    // Cola plana de nutria
    const paddle = toonMesh(new THREE.SphereGeometry(0.22, 14, 10), palette.primary, 0.014);
    paddle.position.set(0, 0.38, -0.55);
    paddle.scale.set(0.7, 0.28, 1.5);
    tail.add(paddle);
  }
  return tail;
}

function buildNeckwear(id: CharacterId, palette: CharacterPalette): THREE.Group {
  const neckwear = new THREE.Group();
  if (id === 'kitsune') {
    // Pañuelo rojo
    const scarf = toonMesh(new THREE.TorusGeometry(0.3, 0.08, 10, 20), '#dc2626', 0.014);
    scarf.rotation.x = Math.PI / 2;
    neckwear.add(scarf);
    // Detalle pequeño: sin contorno.
    const knot = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 10, 8),
      createToonMaterial('#b91c1c')
    );
    knot.position.set(0.22, -0.02, 0.2);
    neckwear.add(knot);
  } else if (id === 'axel') {
    // Bufanda cian con extremo colgante
    const scarf = toonMesh(new THREE.TorusGeometry(0.3, 0.08, 10, 20), '#22d3ee', 0.014);
    scarf.rotation.x = Math.PI / 2;
    neckwear.add(scarf);
    const tailCloth = toonMesh(new THREE.BoxGeometry(0.16, 0.42, 0.06), '#06b6d4', 0.014);
    tailCloth.position.set(0.16, -0.24, -0.18);
    tailCloth.rotation.x = -0.3;
    neckwear.add(tailCloth);
  }
  return neckwear;
}

/**
 * Construye el modelo modular de un personaje del escuadrón.
 * Subgrupos nombrados para animación: body, head, leftArm, rightArm,
 * leftLeg, rightLeg, tail. El modelo mira hacia +Z.
 */
export function buildCharacterModel(id: CharacterId): THREE.Group {
  const profile = GAME_CONSTANTS.CHARACTERS[id];
  const palette = CHARACTER_PALETTES[id];
  const group = new THREE.Group();
  group.name = `character-${id}`;

  // --- Cuerpo ---
  const body = new THREE.Group();
  body.name = 'body';
  const torso = toonMesh(new THREE.CapsuleGeometry(0.34, 0.34, 8, 14), palette.primary, 0.016);
  torso.position.y = 0.52;
  body.add(torso);
  const belly = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 14, 10),
    createToonMaterial(palette.belly)
  );
  belly.position.set(0, 0.5, 0.16);
  belly.scale.set(1, 1.25, 0.6);
  body.add(belly);
  body.add(buildNeckwear(id, palette).translateY(0.92));
  group.add(body);

  // --- Cabeza grande ---
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.32;
  const skull = toonMesh(new THREE.SphereGeometry(0.52, 20, 16), palette.primary, 0.016);
  skull.scale.set(1.06, 0.96, 1);
  head.add(skull);
  buildMuzzle(head, palette);
  buildEyes(head);
  if (id === 'kitsune') buildKitsuneHeadExtras(head, palette);
  else if (id === 'digger') buildDiggerHeadExtras(head);
  else buildAxelHeadExtras(head);
  group.add(head);

  // --- Brazos y piernas ---
  group.add(buildLimb('leftArm', 0.42, 0.72, 0.11, 0.26, palette.primary));
  group.add(buildLimb('rightArm', -0.42, 0.72, 0.11, 0.26, palette.primary));
  group.add(buildLimb('leftLeg', 0.17, 0.3, 0.13, 0.16, palette.primary));
  group.add(buildLimb('rightLeg', -0.17, 0.3, 0.13, 0.16, palette.primary));

  // --- Garras (Digger) ---
  if (id === 'digger') {
    const clawGeometry = new THREE.ConeGeometry(0.05, 0.14, 6);
    for (const armName of ['leftArm', 'rightArm']) {
      const arm = group.getObjectByName(armName);
      if (arm) {
        for (const side of [-1, 0, 1]) {
          const claw = new THREE.Mesh(clawGeometry, createToonMaterial('#fde68a'));
          claw.position.set(side * 0.07, -0.34, 0.06);
          claw.rotation.x = 0.5;
          arm.add(claw);
        }
      }
    }
  }

  // --- Cola ---
  group.add(buildTail(id, palette));

  return group;
}

// ============================================================================
// Planetas procedurales
// ============================================================================

function buildPineTree(): THREE.Group {
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

function buildRock(): THREE.Group {
  const rock = new THREE.Group();
  const mesh = toonMesh(new THREE.DodecahedronGeometry(0.4, 0), '#94a3b8', 0.03);
  mesh.scale.set(1, 0.7, 1.15);
  mesh.rotation.y = 0.6;
  mesh.position.y = 0.18;
  rock.add(mesh);
  return rock;
}

// ============================================================================
// Atmósfera con degradado suave (sin cortes poligonales en el horizonte)
// ============================================================================

const atmosphereVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vNormal = normalize( normalMatrix * normal );
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    vViewDir = normalize( -mvPosition.xyz );
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const atmosphereFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    float rim = pow( 1.0 - abs( dot( vNormal, vViewDir ) ), 1.5 );
    float alpha = 0.03 + rim * 0.12;
    gl_FragColor = vec4( uColor, alpha );
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

  // --- Esfera principal ---
  const sphere = toonMesh(
    new THREE.SphereGeometry(spec.radius, 48, 32),
    spec.surfaceColor,
    outlineThickness
  );
  sphere.position.copy(center);
  group.add(sphere);

  // --- Atmósfera sutil: 64x48 segmentos + degradado fresnel de baja opacidad ---
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(spec.radius * 1.06, 64, 48),
    new THREE.ShaderMaterial({
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      uniforms: { uColor: { value: new THREE.Color(spec.atmosphereColor) } },
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      fog: false,
    })
  );
  atmosphere.position.copy(center);
  group.add(atmosphere);

  // --- Parches de terreno ---
  const patchCount = 9;
  for (let i = 0; i < patchCount; i++) {
    const u = random();
    const phi = random() * Math.PI * 2;
    const cosTheta = 1 - 2 * u;
    const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
    const patchRadius = spec.radius * (0.16 + random() * 0.16);
    const isIce = spec.hasIcePatches === true && random() > 0.45;
    const patch = toonMesh(
      new THREE.SphereGeometry(patchRadius, 14, 10),
      isIce ? '#f0f9ff' : spec.patchColor,
      outlineThickness * 0.6
    );
    placeOnSphere(
      patch,
      center,
      sinTheta * Math.cos(phi),
      cosTheta,
      sinTheta * Math.sin(phi),
      spec.radius * 0.9
    );
    patch.scale.y = 0.32;
    group.add(patch);
  }

  // --- Árboles y rocas en superficie ---
  const propCount = spec.biome === 'cryo' ? 5 : 8;
  for (let i = 0; i < propCount; i++) {
    const u = random();
    const phi = random() * Math.PI * 2;
    const cosTheta = 1 - 2 * u;
    const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
    const prop = random() > 0.35 ? buildPineTree() : buildRock();
    const scale = spec.radius * 0.045;
    prop.scale.setScalar(scale);
    placeOnSphere(
      prop,
      center,
      sinTheta * Math.cos(phi),
      cosTheta,
      sinTheta * Math.sin(phi),
      spec.radius - scale * 0.15
    );
    group.add(prop);
  }

  // --- Anillos orbitales ---
  let ringGroup: THREE.Group | null = null;
  if (spec.hasOrbitalRings) {
    ringGroup = new THREE.Group();
    ringGroup.position.copy(center);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(spec.radius * 1.75, spec.radius * 0.14, 10, 72),
      new THREE.MeshBasicMaterial({
        color: spec.ringColor ?? '#c4b5fd',
        transparent: true,
        opacity: 0.38,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ring.rotation.x = Math.PI / 2 - 0.35;
    ringGroup.add(ring);
    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(spec.radius * 2.15, spec.radius * 0.05, 8, 72),
      new THREE.MeshBasicMaterial({
        color: spec.ringColor ?? '#a78bfa',
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ring2.rotation.x = Math.PI / 2 - 0.35;
    ringGroup.add(ring2);
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
      if (ringGroup) ringGroup.rotation.y += dt * 0.06;
      asteroidGroup.rotation.y += dt * 0.11;
      for (let i = 0; i < asteroids.length; i++) {
        asteroids[i].rotation.y += dt * asteroidSpin[i];
        asteroids[i].rotation.x += dt * asteroidSpin[i] * 0.6;
      }
    },
  };
}

// ============================================================================
// Portal Warp (baliza de fin de nivel)
// ============================================================================

/**
 * Baliza/portal brillante que marca el final del nivel. Dos anillos
 * contrarrotando, núcleo pulsante y columna de luz semitransparente.
 */
export function buildWarpPortal(): { group: THREE.Group; animTick: (dt: number) => void } {
  const group = new THREE.Group();
  group.name = 'warpPortal';

  const base = toonMesh(new THREE.CylinderGeometry(0.9, 1.2, 0.4, 12), '#475569', 0.04);
  base.position.y = -1.6;
  group.add(base);

  const ringA = toonMesh(new THREE.TorusGeometry(1.5, 0.14, 10, 40), '#67e8f9', 0.04, '#22d3ee');
  group.add(ringA);

  const ringB = toonMesh(new THREE.TorusGeometry(1.05, 0.11, 10, 32), '#c4b5fd', 0.035, '#a78bfa');
  ringB.rotation.x = Math.PI / 2;
  group.add(ringB);

  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.55, 1),
    new THREE.MeshBasicMaterial({ color: 0x99f6e4 })
  );
  group.add(core);

  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.75, 9, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  column.position.y = 3.4;
  group.add(column);

  const light = new THREE.PointLight(0x67e8f9, 60, 30, 1.8);
  group.add(light);

  let clock = 0;
  return {
    group,
    animTick(dt: number): void {
      clock += dt;
      ringA.rotation.y += dt * 1.4;
      ringA.rotation.x = Math.sin(clock * 0.8) * 0.3;
      ringB.rotation.z += dt * -2.1;
      const pulse = 1 + Math.sin(clock * 3.2) * 0.18;
      core.scale.setScalar(pulse);
      core.rotation.y += dt * 1.1;
      light.intensity = 45 + Math.sin(clock * 3.2) * 20;
    },
  };
}

// ============================================================================
// Guardias (centinelas de prueba del Hito 2) y disfraz robado
// ============================================================================

const GUARD_UNIFORM = '#3b4463';
const GUARD_UNIFORM_DARK = '#232a3d';

/**
 * Centinela de prueba: uniforme azul oscuro con casco, visor rojo y hombreras.
 * Contornos finos (0.012-0.018) coherentes con los personajes del escuadrón.
 */
export function buildGuardModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'guard';

  const torso = toonMesh(new THREE.CapsuleGeometry(0.36, 0.36, 8, 14), GUARD_UNIFORM, 0.016);
  torso.position.y = 0.55;
  group.add(torso);

  const belt = toonMesh(new THREE.CylinderGeometry(0.38, 0.38, 0.14, 14), GUARD_UNIFORM_DARK, 0.014);
  belt.position.y = 0.38;
  group.add(belt);

  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.34;
  const skull = toonMesh(new THREE.SphereGeometry(0.5, 18, 14), '#b8c0cc', 0.016);
  head.add(skull);
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.16, 0.18),
    new THREE.MeshBasicMaterial({ color: 0xf87171 })
  );
  visor.position.set(0, 0.06, 0.44);
  head.add(visor);
  const helmet = toonMesh(
    new THREE.SphereGeometry(0.54, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    GUARD_UNIFORM_DARK,
    0.016
  );
  helmet.position.y = 0.08;
  head.add(helmet);
  group.add(head);

  group.add(buildLimb('leftArm', 0.46, 0.74, 0.12, 0.28, GUARD_UNIFORM));
  group.add(buildLimb('rightArm', -0.46, 0.74, 0.12, 0.28, GUARD_UNIFORM));
  group.add(buildLimb('leftLeg', 0.18, 0.32, 0.14, 0.18, GUARD_UNIFORM_DARK));
  group.add(buildLimb('rightLeg', -0.18, 0.32, 0.14, 0.18, GUARD_UNIFORM_DARK));

  for (const side of [-1, 1]) {
    const pad = toonMesh(new THREE.SphereGeometry(0.16, 10, 8), GUARD_UNIFORM_DARK, 0.014);
    pad.position.set(0.46 * side, 0.86, 0);
    pad.scale.set(1, 0.7, 1);
    group.add(pad);
  }

  return group;
}

/**
 * Casco y chaleco de guardia que se superponen al personaje activo cuando
 * `isDisguised = true` (uniforme robado con el noqueo por la espalda).
 * Invisible por defecto.
 */
export function buildDisguiseOverlay(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'disguiseOverlay';

  const helmet = toonMesh(
    new THREE.SphereGeometry(0.56, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    GUARD_UNIFORM_DARK,
    0.014
  );
  helmet.position.y = 1.62;
  group.add(helmet);

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.14, 0.16),
    new THREE.MeshBasicMaterial({ color: 0xf87171 })
  );
  visor.position.set(0, 1.42, 0.46);
  group.add(visor);

  const vest = toonMesh(new THREE.BoxGeometry(0.8, 0.58, 0.62), GUARD_UNIFORM, 0.014);
  vest.position.y = 0.6;
  group.add(vest);

  group.visible = false;
  return group;
}
