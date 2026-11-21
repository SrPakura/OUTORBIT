import * as THREE from 'three';
import { GAME_CONSTANTS, type CharacterId, type PlanetSpec, type PropKind, type StructureSpec } from '../types';
import { orientObjectOnSphere } from '../math/spherical';
import { addComicOutline, createComicCelMaterial, createToonMaterial, type ComicCelOptions } from './toonMaterials';

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
  /** Color del traje/mono de vuelo (Kitsune: azul/cian como en la referencia). */
  suit?: string;
}

const CHARACTER_PALETTES: Record<CharacterId, CharacterPalette> = {
  kitsune: {
    primary: '#f97316',
    secondary: '#fff7ed',
    belly: '#fff7ed',
    accent: '#dc2626',
    suit: '#38bdf8',
  },
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
  const muzzle = toonMesh(new THREE.SphereGeometry(0.3, 16, 12), palette.secondary, 0.015);
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
    THREE.MathUtils.clamp(radius * 0.16, 0.015, 0.022)
  );
  capsule.position.y = -(length / 2 + radius) * 0.6;
  limb.add(capsule);
  return limb;
}

function buildKitsuneHeadExtras(head: THREE.Group, palette: CharacterPalette): void {
  // Orejas grandes puntiagudas y nítidas (contorno limpio, sin masa de tinta).
  const earGeometry = new THREE.ConeGeometry(0.17, 0.42, 8);
  const innerGeometry = new THREE.ConeGeometry(0.09, 0.24, 8);
  for (const side of [-1, 1]) {
    const ear = toonMesh(earGeometry, palette.primary, 0.016);
    ear.position.set(0.28 * side, 0.54, -0.02);
    ear.rotation.z = -0.28 * side;
    head.add(ear);
    const inner = new THREE.Mesh(innerGeometry, createToonMaterial(palette.secondary));
    inner.position.set(0.28 * side, 0.52, 0.06);
    inner.rotation.z = -0.28 * side;
    head.add(inner);
  }

  // Mejillas crema a los lados del hocico (como buildKitsuneHero).
  const cheekGeometry = new THREE.SphereGeometry(0.15, 12, 10);
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(cheekGeometry, createToonMaterial(palette.secondary));
    cheek.position.set(0.3 * side, -0.08, 0.3);
    cheek.scale.set(0.85, 0.75, 0.8);
    head.add(cheek);
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
    0.015
  );
  brim.position.set(0, 0.08, 0);
  head.add(brim);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff3b0 })
  );
  lamp.position.set(0, 0.26, 0.5);
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
    // Cola esponjosa: cadena de esferas grandes con punta blanca nítida.
    const segments: Array<[number, number, number, number, string]> = [
      [0, 0.4, -0.44, 0.27, palette.primary],
      [0, 0.54, -0.74, 0.22, palette.primary],
      [0, 0.66, -0.97, 0.16, palette.secondary],
    ];
    for (const [x, y, z, r, color] of segments) {
      const ball = toonMesh(new THREE.SphereGeometry(r, 14, 10), color, 0.018);
      ball.position.set(x, y, z);
      tail.add(ball);
    }
  } else if (id === 'digger') {
    // Cola corta de topo
    const stub = toonMesh(new THREE.SphereGeometry(0.14, 12, 8), palette.secondary, 0.015);
    stub.position.set(0, 0.4, -0.4);
    tail.add(stub);
  } else {
    // Cola plana de nutria
    const paddle = toonMesh(new THREE.SphereGeometry(0.22, 14, 10), palette.primary, 0.015);
    paddle.position.set(0, 0.38, -0.55);
    paddle.scale.set(0.7, 0.28, 1.5);
    tail.add(paddle);
  }
  return tail;
}

function buildNeckwear(id: CharacterId, palette: CharacterPalette): THREE.Group {
  const neckwear = new THREE.Group();
  if (id === 'kitsune') {
    // Pañuelo dorado (como el scarf de buildKitsuneHero)
    const scarf = toonMesh(new THREE.TorusGeometry(0.3, 0.085, 10, 20), '#fbbf24', 0.016);
    scarf.rotation.x = Math.PI / 2;
    neckwear.add(scarf);
    // Detalle pequeño: sin contorno.
    const knot = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 10, 8),
      createToonMaterial('#d97706')
    );
    knot.position.set(0.22, -0.02, 0.2);
    neckwear.add(knot);
  } else if (id === 'axel') {
    // Bufanda cian con extremo colgante
    const scarf = toonMesh(new THREE.TorusGeometry(0.3, 0.08, 10, 20), '#22d3ee', 0.015);
    scarf.rotation.x = Math.PI / 2;
    neckwear.add(scarf);
    const tailCloth = toonMesh(new THREE.BoxGeometry(0.16, 0.42, 0.06), '#06b6d4', 0.015);
    tailCloth.position.set(0.16, -0.24, -0.18);
    tailCloth.rotation.x = -0.3;
    neckwear.add(tailCloth);
  }
  return neckwear;
}

// ============================================================================
// Skins temáticas estilo Persona 5 (antifaz, capa, taladro, jetpack)
// ============================================================================

/**
 * Extras temáticos P5 por personaje (subgrupos nombrados para animación):
 * - Kitsune (Ladrón Fantasma): antifaz rojo/negro sobre los ojos, capa larga
 *   trasera (`cape`) que ondea con la velocidad y kunai en la mano.
 * - Digger (Minero Mecha): visor luminoso cian/amarillo, mochila taladro con
 *   broca (`drill`) que gira al excavar y guanteletes pesados.
 * - Axel (Piloto Espacial): gafas de aviador en la frente, doble propulsor
 *   jetpack con llamas cian (`flameL`/`flameR`) y bufanda larga (`cape`).
 */
function buildCharacterSkinExtras(
  id: CharacterId,
  palette: CharacterPalette,
  group: THREE.Group,
  head: THREE.Group
): void {
  if (id === 'kitsune') {
    // Antifaz rojo/negro estilo Phantom Thief sobre los ojos: pegado delante
    // de la cara (z 0.45..0.50) sin enterrarse en el cráneo (frente z ~0.51).
    const maskBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.78, 0.24, 0.14),
      createToonMaterial('#0b0b12')
    );
    maskBase.position.set(0, 0.11, 0.47);
    head.add(maskBase);
    const maskRed = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.17, 0.12),
      createToonMaterial('#dc2626')
    );
    maskRed.position.set(0, 0.11, 0.55);
    head.add(maskRed);
    for (const side of [-1, 1]) {
      const slit = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.05, 0.04),
        new THREE.MeshBasicMaterial({ color: 0xfff7ed })
      );
      slit.position.set(0.2 * side, 0.13, 0.62);
      head.add(slit);
    }

    // Capa larga trasera dividida en dos paneles LATERALES que esquivan la
    // cola esponjosa (la cola ocupa el eje central x ±0.27 detrás del cuerpo).
    const cape = new THREE.Group();
    cape.name = 'cape';
    cape.position.set(0, 0.95, -0.3);
    const capeColors = ['#dc2626', '#b91c1c'];
    for (let i = 0; i < 3; i++) {
      for (const side of [-1, 1]) {
        const panel = toonMesh(
          new THREE.BoxGeometry(0.24, 0.34 - i * 0.02, 0.05),
          capeColors[i % 2],
          0.014
        );
        panel.position.set(side * (0.38 + i * 0.03), -0.16 - i * 0.28, -0.05 - i * 0.08);
        panel.rotation.z = side * (0.1 + i * 0.07);
        cape.add(panel);
      }
    }
    group.add(cape);

    // Kunai sujeto en la mano derecha + aura tenue.
    const rightArm = group.getObjectByName('rightArm');
    if (rightArm) {
      const kunai = new THREE.Group();
      kunai.name = 'kunai';
      const handle = toonMesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.22, 6),
        '#18181b',
        0.01
      );
      kunai.add(handle);
      const blade = toonMesh(new THREE.ConeGeometry(0.05, 0.2, 6), '#e2e8f0', 0.01);
      blade.position.y = 0.2;
      kunai.add(blade);
      kunai.position.set(0, -0.36, 0.1);
      kunai.rotation.x = 0.9;
      rightArm.add(kunai);
      const aura = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 8, 6),
        new THREE.MeshBasicMaterial({
          color: 0xf97316,
          transparent: true,
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      aura.position.set(0, -0.36, 0.1);
      rightArm.add(aura);
    }
  } else if (id === 'digger') {
    // Visor luminoso cian/amarillo sobre los ojos, apoyado en el ala del
    // casco (z 0.62): antes quedaba enterrado bajo el brim (radio 0.62) y
    // flotando en los laterales de la cabeza.
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.16, 0.14),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee })
    );
    visor.position.set(0, 0.1, 0.62);
    head.add(visor);
    for (const side of [-1, 1]) {
      const lens = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.06, 0.04),
        new THREE.MeshBasicMaterial({ color: 0xfde047 })
      );
      lens.position.set(0.2 * side, 0.1, 0.71);
      head.add(lens);
    }

    // Mochila taladro trasera con broca giratoria (`drill`).
    const pack = toonMesh(new THREE.BoxGeometry(0.5, 0.5, 0.26), '#3f3f46', 0.016);
    pack.position.set(0, 0.62, -0.44);
    group.add(pack);
    const drill = new THREE.Group();
    drill.name = 'drill';
    drill.position.set(0, 0.5, -0.62);
    drill.rotation.x = Math.PI / 2 + 0.35;
    const drillShaft = toonMesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.3, 8),
      '#71717a',
      0.012
    );
    drill.add(drillShaft);
    // Broca de 4 lados: el giro es visible al excavar.
    const drillBit = toonMesh(new THREE.ConeGeometry(0.13, 0.5, 4), '#facc15', 0.014);
    drillBit.position.y = 0.38;
    drill.add(drillBit);
    group.add(drill);

    // Guanteletes pesados en ambas manos.
    for (const armName of ['leftArm', 'rightArm']) {
      const arm = group.getObjectByName(armName);
      if (!arm) continue;
      const gauntlet = toonMesh(new THREE.SphereGeometry(0.15, 10, 8), '#52525b', 0.014);
      gauntlet.position.set(0, -0.34, 0.04);
      gauntlet.scale.set(1.1, 0.9, 1.2);
      arm.add(gauntlet);
    }
  } else {
    // Gafas de aviador reposando en la frente (pegadas al cráneo, z ~0.34:
    // la frente curva está en z ~0.31 y antes flotaban a 9 cm).
    for (const side of [-1, 1]) {
      const goggle = new THREE.Mesh(
        new THREE.TorusGeometry(0.11, 0.045, 8, 16),
        createToonMaterial('#78350f')
      );
      goggle.position.set(0.19 * side, 0.36, 0.34);
      head.add(goggle);
      const lens = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.75 })
      );
      lens.position.set(0.19 * side, 0.36, 0.36);
      head.add(lens);
    }

    // Doble propulsor jetpack trasero con llamas cian animables: los tubos
    // sobresalen por DEBAJO de la mochila (antes quedaban embebidos dentro).
    const pack = toonMesh(new THREE.BoxGeometry(0.46, 0.44, 0.22), '#0c4a6e', 0.016);
    pack.position.set(0, 0.66, -0.42);
    group.add(pack);
    for (const side of [-1, 1]) {
      const thruster = toonMesh(
        new THREE.CylinderGeometry(0.09, 0.11, 0.34, 8),
        '#e0f2fe',
        0.012
      );
      thruster.position.set(0.14 * side, 0.48, -0.5);
      group.add(thruster);
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.09, 0.5, 8),
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      flame.name = side < 0 ? 'flameL' : 'flameR';
      flame.rotation.x = Math.PI - 0.35;
      flame.position.set(0.14 * side, 0.3, -0.54);
      flame.visible = false;
      group.add(flame);
    }

    // Bufanda larga en dos cintas LATERALES que esquivan la cola plana de
    // nutria (x ±0.15 detrás del cuerpo).
    const cape = new THREE.Group();
    cape.name = 'cape';
    cape.position.set(0, 0.92, -0.28);
    for (let i = 0; i < 3; i++) {
      for (const side of [-1, 1]) {
        const panel = toonMesh(
          new THREE.BoxGeometry(0.14, 0.3, 0.05),
          i % 2 === 0 ? '#22d3ee' : '#0891b2',
          0.012
        );
        panel.position.set(side * (0.24 + i * 0.03), -0.14 - i * 0.26, -0.04 - i * 0.1);
        panel.rotation.z = side * (0.08 + i * 0.06);
        cape.add(panel);
      }
    }
    group.add(cape);
  }
}

/**
 * Construye el modelo modular de un personaje del escuadrón.
 * Subgrupos nombrados para animación: body, head, leftArm, rightArm,
 * leftLeg, rightLeg, tail (+ cape/drill/flames de la skin P5). Mira hacia +Z.
 */
export function buildCharacterModel(id: CharacterId): THREE.Group {
  const profile = GAME_CONSTANTS.CHARACTERS[id];
  const palette = CHARACTER_PALETTES[id];
  const group = new THREE.Group();
  group.name = `character-${id}`;

  // --- Cuerpo ---
  const body = new THREE.Group();
  body.name = 'body';
  // Kitsune luce el traje azul/cian de la referencia; el resto usa su color base.
  const torsoColor = palette.suit ?? palette.primary;
  const torso = toonMesh(new THREE.CapsuleGeometry(0.34, 0.34, 8, 14), torsoColor, 0.018);
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
  const skull = toonMesh(new THREE.SphereGeometry(0.52, 20, 16), palette.primary, 0.018);
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

  // --- Skin temática P5 (antifaz/capa, visor/taladro, goggles/jetpack) ---
  buildCharacterSkinExtras(id, palette, group, head);

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
// Props ambientales (Aldea Feudal de Verdant, Cryo-Drop, Iron Bastion)
// ============================================================================

/** Torii japonés: dos pilares rojos + dintel negro curvado hacia arriba. */
function buildToriiGate(): THREE.Group {
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
function buildVillageHouse(): THREE.Group {
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
function buildPagodaHouse(): THREE.Group {
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
function buildPaperLantern(): THREE.Group {
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
function buildBambooCluster(): THREE.Group {
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
function buildStonePath(): THREE.Group {
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
function buildWoodBridge(): THREE.Group {
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

/** Cristal de hielo gigante: prismas azul claro translúcidos brillantes. */
function buildIceCrystal(): THREE.Group {
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
function buildIgloo(): THREE.Group {
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
function buildPipe(): THREE.Group {
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
function buildAntenna(): THREE.Group {
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
function buildReactor(): THREE.Group {
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
function buildSpotlight(): THREE.Group {
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

/** Pino reutilizable como prop (el mismo builder de los planetas). */
function buildPineTreeProp(): THREE.Group {
  return buildPineTree();
}

/**
 * Construye el mesh de un prop ambiental por su tipo. Los props no tienen
 * colisión: son set dressing (aldea feudal, cristales, maquinaria).
 */
export function buildPropMesh(kind: PropKind): THREE.Group {
  switch (kind) {
    case 'torii_gate':
      return buildToriiGate();
    case 'pagoda_house':
      return buildPagodaHouse();
    case 'village_house':
      return buildVillageHouse();
    case 'paper_lantern':
      return buildPaperLantern();
    case 'bamboo_cluster':
      return buildBambooCluster();
    case 'pine_tree':
      return buildPineTreeProp();
    case 'stone_path':
      return buildStonePath();
    case 'wood_bridge':
      return buildWoodBridge();
    case 'ice_crystal':
      return buildIceCrystal();
    case 'igloo':
      return buildIgloo();
    case 'pipe':
      return buildPipe();
    case 'antenna':
      return buildAntenna();
    case 'reactor':
      return buildReactor();
    case 'spotlight':
      return buildSpotlight();
  }
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

  // --- Árboles y rocas en superficie (Verdant luce mucho más poblado) ---
  let propCount = 8;
  if (spec.biome === 'verdant') propCount = 16;
  else if (spec.biome === 'cryo') propCount = 8;
  else if (spec.biome === 'bastion' || spec.biome === 'kronos') propCount = 6;
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

// ============================================================================
// Red de IA intra-planeta (Hito 3B): oficial, dron, torreta y brute
// ============================================================================

const OFFICER_GOLD = '#fbbf24';

/**
 * Oficial detector de disfraces: uniforme azul oscuro con gorra y hombreras
 * doradas. Desenmascara a cualquier jugador disfrazado que se acerque mucho.
 */
export function buildOfficerModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'officer';

  const torso = toonMesh(new THREE.CapsuleGeometry(0.38, 0.38, 8, 14), GUARD_UNIFORM, 0.016);
  torso.position.y = 0.55;
  group.add(torso);

  const belt = toonMesh(new THREE.CylinderGeometry(0.4, 0.4, 0.14, 14), OFFICER_GOLD, 0.014);
  belt.position.y = 0.38;
  group.add(belt);

  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.34;
  const skull = toonMesh(new THREE.SphereGeometry(0.5, 18, 14), '#b8c0cc', 0.016);
  head.add(skull);
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.16, 0.18),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
  );
  visor.position.set(0, 0.06, 0.44);
  head.add(visor);
  // Gorra de oficial con visera dorada.
  const cap = toonMesh(
    new THREE.SphereGeometry(0.54, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2.4),
    GUARD_UNIFORM_DARK,
    0.016
  );
  cap.position.y = 0.14;
  head.add(cap);
  const capBrim = toonMesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 14), OFFICER_GOLD, 0.014);
  capBrim.scale.set(1, 1, 1.25);
  capBrim.position.set(0, 0.14, 0.22);
  head.add(capBrim);
  group.add(head);

  group.add(buildLimb('leftArm', 0.46, 0.74, 0.12, 0.28, GUARD_UNIFORM));
  group.add(buildLimb('rightArm', -0.46, 0.74, 0.12, 0.28, GUARD_UNIFORM));
  group.add(buildLimb('leftLeg', 0.18, 0.32, 0.14, 0.18, GUARD_UNIFORM_DARK));
  group.add(buildLimb('rightLeg', -0.18, 0.32, 0.14, 0.18, GUARD_UNIFORM_DARK));

  // Hombreras doradas: la marca del oficial.
  for (const side of [-1, 1]) {
    const pad = toonMesh(new THREE.SphereGeometry(0.18, 10, 8), OFFICER_GOLD, 0.014);
    pad.position.set(0.46 * side, 0.9, 0);
    pad.scale.set(1, 0.65, 1);
    group.add(pad);
  }

  return group;
}

/**
 * Dron rápido de reconocimiento: esfera flotante con anillo de rotor, ojo
 * rojo escáner y antena. Persigue al jugador deslizando sobre la superficie.
 */
export function buildDroneModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'drone';

  const body = toonMesh(new THREE.SphereGeometry(0.42, 16, 12), '#64748b', 0.016);
  group.add(body);

  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xf87171 })
  );
  eye.position.set(0, -0.02, 0.36);
  group.add(eye);

  const ring = toonMesh(new THREE.TorusGeometry(0.62, 0.07, 8, 24), '#334155', 0.014);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  const antenna = toonMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), '#94a3b8', 0.012);
  antenna.position.y = 0.55;
  group.add(antenna);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
  );
  beacon.position.y = 0.82;
  group.add(beacon);

  return group;
}

/**
 * Torreta antiaérea fija: base acorazada, cúpula giratoria y doble cañón que
 * dispara proyectiles luminosos (parreables con F/Q).
 */
export function buildTurretModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'turret';

  const base = toonMesh(new THREE.CylinderGeometry(0.85, 1.05, 0.6, 12), '#1f2937', 0.016);
  base.position.y = 0.3;
  group.add(base);

  const dome = toonMesh(new THREE.SphereGeometry(0.55, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), '#374151', 0.016);
  dome.position.y = 0.6;
  group.add(dome);

  const barrelGeometry = new THREE.CylinderGeometry(0.09, 0.11, 1.3, 8);
  for (const side of [-1, 1]) {
    const barrel = toonMesh(barrelGeometry, '#4b5563', 0.014);
    barrel.rotation.x = Math.PI / 2 - 0.5;
    barrel.position.set(0.2 * side, 0.95, 0.42);
    group.add(barrel);
    const muzzle = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xfb923c })
    );
    muzzle.position.set(0.2 * side, 1.22, 0.72);
    group.add(muzzle);
  }

  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xf97316 })
  );
  light.position.set(0, 0.72, 0.42);
  group.add(light);

  return group;
}

const BRUTE_RED = '#b91c1c';
const BRUTE_DARK = '#7f1d1d';

/**
 * Brute de élite: guardia pesado rojo con maza estilo Kronos. Resiste el
 * melee frontal y solo cae con explosivos, parry o estasis.
 */
export function buildBruteModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'brute';

  const torso = toonMesh(new THREE.CapsuleGeometry(0.52, 0.5, 8, 14), BRUTE_RED, 0.018);
  torso.position.y = 0.68;
  torso.scale.set(1.25, 1, 1.15);
  group.add(torso);

  const belt = toonMesh(new THREE.CylinderGeometry(0.56, 0.56, 0.18, 14), BRUTE_DARK, 0.016);
  belt.position.y = 0.42;
  group.add(belt);

  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.52;
  const skull = toonMesh(new THREE.SphereGeometry(0.46, 18, 14), '#9ca3af', 0.018);
  head.add(skull);
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.52, 0.14, 0.16),
    new THREE.MeshBasicMaterial({ color: 0xf97316 })
  );
  visor.position.set(0, 0.04, 0.4);
  head.add(visor);
  // Casco blindado con cresta.
  const helmet = toonMesh(
    new THREE.SphereGeometry(0.5, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    BRUTE_DARK,
    0.018
  );
  helmet.position.y = 0.08;
  head.add(helmet);
  const crest = toonMesh(new THREE.BoxGeometry(0.1, 0.28, 0.5), '#f97316', 0.014);
  crest.position.set(0, 0.42, -0.05);
  head.add(crest);
  group.add(head);

  group.add(buildLimb('leftArm', 0.62, 0.92, 0.16, 0.34, BRUTE_RED));
  group.add(buildLimb('rightArm', -0.62, 0.92, 0.16, 0.34, BRUTE_RED));
  group.add(buildLimb('leftLeg', 0.26, 0.4, 0.18, 0.2, BRUTE_DARK));
  group.add(buildLimb('rightLeg', -0.26, 0.4, 0.18, 0.2, BRUTE_DARK));

  // Maza pesada colgando del brazo derecho.
  const maceHandle = toonMesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), '#3f3f46', 0.014);
  maceHandle.position.set(-0.62, 0.35, 0.25);
  maceHandle.rotation.x = 0.4;
  group.add(maceHandle);
  const maceHead = toonMesh(new THREE.DodecahedronGeometry(0.26, 0), '#52525b', 0.016);
  maceHead.position.set(-0.62, -0.15, 0.48);
  group.add(maceHead);

  // Hombreras blindadas.
  for (const side of [-1, 1]) {
    const pad = toonMesh(new THREE.SphereGeometry(0.22, 10, 8), BRUTE_DARK, 0.016);
    pad.position.set(0.62 * side, 1.08, 0);
    pad.scale.set(1, 0.65, 1);
    group.add(pad);
  }

  return group;
}

// ============================================================================
// Comandante KRONOS (jefe final, Hito 4)
// ============================================================================

const KRONOS_RED = '#dc2626';
const KRONOS_DARK = '#18181b';
const KRONOS_HORN = '#facc15';
const KRONOS_WHITE = '#f8fafc';

/**
 * Comandante KRONOS: torreón rojo blindado con cuernos dorados, hombreras
 * oscuras con remaches, peto blanco y maza gigante con pinchos (portado de
 * `referencia_visual.html :: buildCommanderKronos`). Lo envuelve un anillo
 * de energía cuyo color cambia según la postura de su red MLP.
 *
 * Devuelve el grupo (mira hacia +Z), el material del anillo de energía y el
 * grupo de la maza para animar el windup del barrido.
 */
export function buildKronosModel(): {
  group: THREE.Group;
  ringMaterial: THREE.MeshBasicMaterial;
  maceGroup: THREE.Group;
} {
  const boss = new THREE.Group();
  boss.name = 'kronos';

  // Torso masivo blindado.
  const torso = toonMesh(
    new THREE.CylinderGeometry(0.48, 0.38, 0.85, 12),
    KRONOS_RED,
    0.036
  );
  torso.position.y = 0.62;
  boss.add(torso);

  // Peto blanco.
  const collar = toonMesh(new THREE.BoxGeometry(0.62, 0.25, 0.54), KRONOS_WHITE, 0.028);
  collar.position.set(0, 0.86, 0.08);
  boss.add(collar);

  // Cabeza con casco rojo.
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.24;
  const skull = toonMesh(new THREE.SphereGeometry(0.36, 16, 16), KRONOS_RED, 0.035);
  head.add(skull);
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.1, 0.12),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
  );
  visor.position.set(0, 0.02, 0.3);
  head.add(visor);
  boss.add(head);

  // Cuernos dorados afilados.
  const hornGeo = new THREE.ConeGeometry(0.09, 0.42, 8);
  for (const side of [-1, 1]) {
    const horn = toonMesh(hornGeo, KRONOS_HORN, 0.026);
    horn.position.set(0.28 * side, 1.48, 0.14);
    horn.rotation.set(0.45, 0, 0.48 * side);
    boss.add(horn);
  }

  // Hombreras negras con remaches dorados.
  const shoulderGeo = new THREE.SphereGeometry(0.26, 12, 12);
  const rivetGeo = new THREE.SphereGeometry(0.05, 8, 6);
  for (const side of [-1, 1]) {
    const pad = toonMesh(shoulderGeo, KRONOS_DARK, 0.03);
    pad.position.set(0.56 * side, 0.85, 0);
    boss.add(pad);
    const rivet = new THREE.Mesh(rivetGeo, createToonMaterial(KRONOS_HORN));
    rivet.position.set(0.56 * side, 0.98, 0.12);
    boss.add(rivet);
  }

  // Maza gigante con pinchos dorados (animable en el windup).
  const maceGroup = new THREE.Group();
  maceGroup.name = 'mace';
  maceGroup.position.set(0.68, 0.48, 0.35);
  maceGroup.rotation.set(1.25, 0.1, -0.25);
  boss.add(maceGroup);

  const club = toonMesh(new THREE.CylinderGeometry(0.18, 0.07, 1.35, 10), KRONOS_DARK, 0.032);
  maceGroup.add(club);
  const tip = toonMesh(new THREE.ConeGeometry(0.18, 0.28, 10), KRONOS_HORN, 0.026);
  tip.position.y = 0.8;
  maceGroup.add(tip);
  const spikeGeo = new THREE.ConeGeometry(0.05, 0.14, 6);
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const yOff = i % 2 === 0 ? 0.25 : 0.48;
    const spike = new THREE.Mesh(spikeGeo, createToonMaterial(KRONOS_HORN));
    spike.position.set(Math.cos(ang) * 0.18, yOff, Math.sin(ang) * 0.18);
    spike.rotation.z = -Math.cos(ang) * (Math.PI / 2);
    spike.rotation.x = Math.sin(ang) * (Math.PI / 2);
    maceGroup.add(spike);
  }

  // Piernas robustas.
  const legGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.32, 10);
  for (const side of [-1, 1]) {
    const leg = toonMesh(legGeo, KRONOS_DARK, 0.025);
    leg.position.set(0.22 * side, 0.16, 0);
    boss.add(leg);
  }

  // Anillo/escudo de energía: su color cambia según la postura de la red MLP.
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xf97316,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.07, 10, 40), ringMaterial);
  ring.name = 'energyRing';
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.9;
  boss.add(ring);

  // Escala de jefe: imponente frente a los personajes (~1.8 de alto).
  boss.scale.setScalar(2.3);

  return { group: boss, ringMaterial, maceGroup };
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

// ============================================================================
// Estructuras con colisión real (OUTORBIT 2.0): murallas, torres, búnkers,
// arcos, plataformas, pilares y puentes. Convención de `StructureSpec`:
// size = [halfX, heightY, halfZ], origen del grupo en la base (superficie +
// altitudeOffset), +Y = normal del planeta, yaw alrededor de la normal.
// ============================================================================

const _structDir = new THREE.Vector3();

/** Mesh cel de 3 bandas con contorno cómic fino (tinta limpia). */
function celMesh(
  geometry: THREE.BufferGeometry,
  color: string | number,
  outlineThickness: number,
  options?: ComicCelOptions
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, createComicCelMaterial(color, options));
  addComicOutline(mesh, outlineThickness);
  return mesh;
}

/** Color de acento: mismo tono, más luminoso (bandas, barandillas, remates). */
function lighten(color: string | number, amount = 0.18): number {
  return new THREE.Color(color).offsetHSL(0, 0.04, amount).getHex();
}

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
    new THREE.MeshBasicMaterial({
      color: glowColor,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  edge.rotation.x = Math.PI / 2;
  edge.position.y = heightY + 0.05;
  group.add(edge);

  // Emisor antigravitatorio colgante.
  const emitter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.55, 1.6, 8),
    new THREE.MeshBasicMaterial({
      color: glowColor,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
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
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  beam.name = 'beaconBeam';
  beam.position.y = height / 2;

  // Núcleo interior más brillante.
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.24, height, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  beam.add(core);

  // Halo en la base.
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(1.05, 0.16, 8, 28),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
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

// ============================================================================
// FASE B — Sistemas de puzle, sigilo y acción táctica: compuertas con llave,
// palancas, paredes rompibles y NPCs con diálogo.
// ============================================================================

export interface LockedGateMesh {
  group: THREE.Group;
  /** Barrera energética naranja-roja: baja al suelo al abrirse la compuerta. */
  barrier: THREE.Mesh;
  barrierMaterial: THREE.MeshBasicMaterial;
  /** Posición Y de reposo de la barrera (para animar el descenso). */
  barrierBaseY: number;
  /** Candado/visor luminoso del dintel: rojo cerrado, verde abierto. */
  lockMaterial: THREE.MeshBasicMaterial;
}

/**
 * Compuerta bloqueada con marco sólido (pilares + dintel), barrera energética
 * naranja-roja que baja al suelo al abrirse y candado/visor luminoso que
 * pasa de rojo a verde. Convención de `StructureSpec`: origen en la base,
 * size = [halfX, heightY, halfZ], +Y = normal del planeta.
 */
export function buildLockedGateMesh(
  halfX: number,
  heightY: number,
  halfZ: number
): LockedGateMesh {
  const group = new THREE.Group();
  group.name = 'lockedGate';

  const frameColor = '#3b4463';
  const accent = lighten(frameColor);

  // Pilares laterales sólidos (el collider cubre TODO el hueco mientras
  // está cerrada; los pilares son la parte que nunca se abre).
  const pillarWidth = Math.min(0.7, halfX * 0.35);
  const openingHalfX = Math.max(halfX - pillarWidth, halfX * 0.3);
  for (const side of [-1, 1]) {
    const pillar = celMesh(
      new THREE.BoxGeometry(pillarWidth, heightY, halfZ * 2),
      frameColor,
      0.026
    );
    pillar.position.set((halfX - pillarWidth / 2) * side, heightY / 2, 0);
    group.add(pillar);
    const cap = celMesh(
      new THREE.BoxGeometry(pillarWidth * 1.25, 0.3, halfZ * 2 * 1.1),
      accent,
      0.02
    );
    cap.position.set((halfX - pillarWidth / 2) * side, heightY + 0.15, 0);
    group.add(cap);
  }

  // Dintel superior con remate.
  const lintel = celMesh(
    new THREE.BoxGeometry(halfX * 2, 0.55, halfZ * 2),
    frameColor,
    0.024
  );
  lintel.position.y = heightY - 0.275;
  group.add(lintel);
  const crest = celMesh(
    new THREE.BoxGeometry(halfX * 0.8, 0.3, halfZ * 2 * 0.9),
    accent,
    0.02
  );
  crest.position.y = heightY + 0.15;
  group.add(crest);

  // Barrera energética naranja-roja: reja vertical que llena el hueco y baja
  // al suelo (o desaparece) al abrirse la compuerta.
  const barrierMaterial = new THREE.MeshBasicMaterial({
    color: 0xf97316,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const openingHeight = Math.max(heightY - 1.0, 0.6);
  const barrier = new THREE.Mesh(
    new THREE.BoxGeometry(openingHalfX * 2, openingHeight, 0.12),
    barrierMaterial
  );
  barrier.name = 'gateBarrier';
  const barrierBaseY = 0.35 + openingHeight / 2;
  barrier.position.y = barrierBaseY;
  group.add(barrier);

  // Barrotes verticales de la reja (mismo material, giran con la barrera).
  const barGeometry = new THREE.BoxGeometry(0.09, openingHeight, 0.16);
  const barCount = Math.max(2, Math.floor(openingHalfX * 2 / 0.55));
  for (let i = 1; i < barCount; i++) {
    const bar = new THREE.Mesh(barGeometry, barrierMaterial);
    bar.position.x = -openingHalfX + (i / barCount) * openingHalfX * 2;
    barrier.add(bar);
  }

  // Candado/visor luminoso en el centro del dintel.
  const lockMaterial = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const lock = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), lockMaterial);
  lock.position.set(0, heightY + 0.15, halfZ + 0.05);
  group.add(lock);
  const lockHalo = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.05, 8, 18),
    lockMaterial
  );
  lockHalo.position.copy(lock.position);
  group.add(lockHalo);

  return { group, barrier, barrierMaterial, barrierBaseY, lockMaterial };
}

export interface SwitchLeverMesh {
  group: THREE.Group;
  /** Pivote de la palanca: bascula al activarse. */
  leverPivot: THREE.Group;
  /** Cristal indicador: rojo desactivado, verde/cian activado. */
  crystalMaterial: THREE.MeshBasicMaterial;
}

/**
 * Pedestal con palanca basculante y cristal indicador que pasa de rojo a
 * verde/cian al activarse (con [E] o lanzándole una roca con Estasis).
 */
export function buildSwitchLeverMesh(): SwitchLeverMesh {
  const group = new THREE.Group();
  group.name = 'switchLever';

  // Pedestal metálico.
  const base = celMesh(new THREE.CylinderGeometry(0.55, 0.7, 0.5, 10), '#334155', 0.02);
  base.position.y = 0.25;
  group.add(base);
  const column = celMesh(new THREE.CylinderGeometry(0.28, 0.34, 0.9, 8), '#475569', 0.018);
  column.position.y = 0.9;
  group.add(column);

  // Palanca basculante sobre el pivote superior.
  const leverPivot = new THREE.Group();
  leverPivot.name = 'leverPivot';
  leverPivot.position.y = 1.35;
  leverPivot.rotation.x = -0.55;
  group.add(leverPivot);
  const stick = celMesh(new THREE.CylinderGeometry(0.06, 0.075, 0.85, 8), '#94a3b8', 0.014);
  stick.position.y = 0.42;
  leverPivot.add(stick);
  const knob = celMesh(new THREE.SphereGeometry(0.14, 12, 10), '#f87171', 0.014);
  knob.position.y = 0.85;
  leverPivot.add(knob);

  // Cristal indicador luminoso en el frente del pedestal.
  const crystalMaterial = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), crystalMaterial);
  crystal.position.set(0, 1.0, 0.36);
  crystal.scale.set(1, 1.3, 0.7);
  group.add(crystal);

  return { group, leverPivot, crystalMaterial };
}

export interface BreakableWallMesh {
  group: THREE.Group;
  /** Grietas naranjas/doradas brillantes: se apagan al recibir el 1er golpe. */
  crackMaterial: THREE.MeshBasicMaterial;
}

/**
 * Muro de piedra/metal reforzado con grietas naranjas/doradas brillantes:
 * el jugador reconoce al instante que puede volarlo con un barril, Estasis
 * (2 golpes) o una embestida de Digger. Convención de `StructureSpec`.
 */
export function buildBreakableWallMesh(
  halfX: number,
  heightY: number,
  halfZ: number
): BreakableWallMesh {
  const group = new THREE.Group();
  group.name = 'breakableWall';

  // Cuerpo del muro: piedra oscura con bandas de metal.
  const body = celMesh(
    new THREE.BoxGeometry(halfX * 2, heightY, halfZ * 2),
    '#57534e',
    0.028
  );
  body.position.y = heightY / 2;
  group.add(body);
  for (const y of [heightY * 0.3, heightY * 0.72]) {
    const band = celMesh(
      new THREE.BoxGeometry(halfX * 2 * 1.02, 0.28, halfZ * 2 * 1.04),
      '#7f1d1d',
      0.02
    );
    band.position.y = y;
    group.add(band);
  }

  // Grietas luminosas naranjas/doradas en ambas caras: patrón determinista
  // de segmentos finos que converge hacia el centro (punto de quiebre).
  const crackMaterial = new THREE.MeshBasicMaterial({
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const faceZ = halfZ + 0.03;
  const crackGeometry = new THREE.BoxGeometry(1, 0.075, 0.03);
  const random = makeSeededRandom(hashString('breakable-wall'));
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const crack = new THREE.Mesh(crackGeometry, crackMaterial);
      const angle = random() * Math.PI - Math.PI / 2;
      const dist = 0.35 + random() * (halfX * 0.8);
      crack.scale.x = 0.45 + random() * 0.75;
      crack.position.set(
        Math.sin(angle) * dist * (i % 2 === 0 ? 1 : -1),
        heightY * (0.25 + random() * 0.55),
        faceZ * side
      );
      crack.rotation.z = angle * 0.8;
      group.add(crack);
    }
    // Núcleo del quiebre: rombo dorado brillante en el centro de la cara.
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), crackMaterial);
    core.position.set(0, heightY * 0.5, faceZ * side);
    group.add(core);
  }

  return { group, crackMaterial };
}

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
