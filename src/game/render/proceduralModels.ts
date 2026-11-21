import * as THREE from 'three';
import {
  GAME_CONSTANTS,
  type CharacterId,
  type EnemyKind,
  type EnemySkin,
  type PlanetSpec,
  type PropKind,
  type StructureSpec,
} from '../types';
import { orientObjectOnSphere } from '../math/spherical';
import { getPlanetTerrainOffset } from '../math/terrain';
import { addComicOutline, createComicCelMaterial, createToonMaterial, type ComicCelOptions } from './toonMaterials';
import { buildCityPropMesh } from './cityModels';

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
    // Cola esponjosa de 2 segmentos: base + punta articulada (`tailTip`)
    // para un meneo expresivo de látigo.
    const base = toonMesh(new THREE.SphereGeometry(0.27, 14, 10), palette.primary, 0.018);
    base.position.set(0, 0.4, -0.44);
    tail.add(base);
    const tip = new THREE.Group();
    tip.name = 'tailTip';
    tip.position.set(0, 0.54, -0.74);
    const ball2 = toonMesh(new THREE.SphereGeometry(0.22, 14, 10), palette.primary, 0.018);
    tip.add(ball2);
    const ball3 = toonMesh(new THREE.SphereGeometry(0.16, 12, 10), palette.secondary, 0.016);
    ball3.position.set(0, 0.12, -0.23);
    tip.add(ball3);
    tail.add(tip);
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
    // Cintas doradas que fluyen a la espalda (ondean con la carrera).
    for (const side of [-1, 1]) {
      const ribbon = toonMesh(
        new THREE.BoxGeometry(0.09, 0.34, 0.04),
        side < 0 ? '#fbbf24' : '#d97706',
        0.012
      );
      ribbon.position.set(0.14 * side, -0.2, -0.24);
      ribbon.rotation.set(-0.35, 0, 0.22 * side);
      neckwear.add(ribbon);
    }
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
      // Filo brillante aditivo: destello de kunai al girar la mano.
      const sheen = new THREE.Mesh(
        new THREE.BoxGeometry(0.012, 0.2, 0.012),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      sheen.position.set(0.035, 0.2, 0.02);
      kunai.add(sheen);
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

    // Medidor de presión pectoral: anillo, esfera ámbar y aguja roja.
    const gaugeRing = toonMesh(new THREE.TorusGeometry(0.09, 0.025, 8, 14), '#3f3f46', 0.01);
    gaugeRing.position.set(0.17, 0.64, 0.35);
    group.add(gaugeRing);
    const gaugeFace = new THREE.Mesh(
      new THREE.CircleGeometry(0.08, 12),
      new THREE.MeshBasicMaterial({ color: 0xfde68a })
    );
    gaugeFace.position.set(0.17, 0.64, 0.36);
    group.add(gaugeFace);
    const needle = new THREE.Mesh(
      new THREE.BoxGeometry(0.015, 0.07, 0.012),
      new THREE.MeshBasicMaterial({ color: 0xdc2626 })
    );
    needle.position.set(0.17, 0.665, 0.37);
    needle.rotation.z = 0.6;
    group.add(needle);

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
    // Broca multi-cresta: 3 conos apilados girados 45° entre sí para que el
    // giro se lea incluso a distancia, con punta de acero.
    const ridgeGeometry = new THREE.ConeGeometry(0.13, 0.2, 4);
    for (let i = 0; i < 3; i++) {
      const ridge = toonMesh(ridgeGeometry, i % 2 === 0 ? '#facc15' : '#eab308', 0.014);
      ridge.position.y = 0.24 + i * 0.14;
      ridge.rotation.y = i * (Math.PI / 4);
      ridge.scale.setScalar(1 - i * 0.18);
      drill.add(ridge);
    }
    const drillTip = toonMesh(new THREE.ConeGeometry(0.05, 0.12, 4), '#e2e8f0', 0.012);
    drillTip.position.y = 0.62;
    drill.add(drillTip);
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

    // Aletas aero-jet gemelas a los lados del jetpack (se abren en vuelo).
    for (const side of [-1, 1]) {
      const fin = toonMesh(new THREE.BoxGeometry(0.05, 0.3, 0.22), '#0c4a6e', 0.012);
      fin.name = side < 0 ? 'finL' : 'finR';
      fin.position.set(0.3 * side, 0.72, -0.42);
      fin.rotation.z = 0.35 * side;
      group.add(fin);
      const finStripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.05, 0.23),
        new THREE.MeshBasicMaterial({ color: 0x22d3ee })
      );
      finStripe.position.y = 0.12;
      fin.add(finStripe);
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

    // Aura de planeo: esfera aditiva que envuelve al piloto en el aire
    // (visible solo durante el doble salto/natación).
    const glideAura = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    glideAura.name = 'glideAura';
    glideAura.position.y = 0.7;
    glideAura.visible = false;
    group.add(glideAura);
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

  // Acentos de caña/bota en ambas piernas: puño de tela + bota oscura.
  for (const legName of ['leftLeg', 'rightLeg']) {
    const leg = group.getObjectByName(legName);
    if (!leg) continue;
    const cuff = toonMesh(
      new THREE.CylinderGeometry(0.145, 0.145, 0.07, 10),
      palette.suit ?? palette.secondary,
      0.012
    );
    cuff.position.y = -0.16;
    leg.add(cuff);
    const boot = toonMesh(new THREE.BoxGeometry(0.2, 0.1, 0.26), '#1f2937', 0.012);
    boot.position.set(0, -0.28, 0.04);
    leg.add(boot);
  }

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

// ============================================================================
/**
 * Cerezo/pino invernal del Shogunato Nevado: tronco oscuro tortuoso (segmentos
 * girados), copa de flores de cerezo rosa suave y copos de nieve blancos
 * aposados sobre las ramas.
 */
function buildCherrySnowTree(): THREE.Group {
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
function buildPalmTree(): THREE.Group {
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
function buildFernCluster(): THREE.Group {
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
function buildGiantFlower(): THREE.Group {
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
function buildGlowMushroom(): THREE.Group {
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
    new THREE.MeshBasicMaterial({
      color: 0xa5f3fc,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
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
function buildAncientStatue(): THREE.Group {
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
function buildVineArch(): THREE.Group {
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

// ============================================================================
// Props cyberpunk (Neon Bastion · Metrópolis): carteles de neón, rascacielos
// futuristas y terminales holográficas del bulevar.
// ============================================================================

/**
 * Cartel publicitario de neón: poste metálico doble y panel luminoso oscuro
 * con barras de neón cian/magenta (glifos katakana estilizados), marco de
 * neón perimetral y antena superior con baliza roja.
 */
function buildNeonBillboard(): THREE.Group {
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
function buildCyberTower(): THREE.Group {
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
function buildHoloPillar(): THREE.Group {
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
    new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  beam.position.y = 1.6;
  pillar.add(beam);
  // Prisma holográfico flotante cian.
  const holo = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.34, 0),
    new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  holo.name = 'holoPrism';
  holo.position.y = 2.15;
  holo.scale.set(0.8, 1.3, 0.8);
  pillar.add(holo);
  // Anillo de luz magenta orbitando el prisma.
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.045, 8, 24),
    new THREE.MeshBasicMaterial({
      color: 0xe879f9,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  ring.name = 'holoRing';
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 2.15;
  pillar.add(ring);
  return pillar;
}

/** Pino reutilizable como prop (el mismo builder de los planetas). */
function buildPineTreeProp(): THREE.Group {
  return buildPineTree();
}

/**
 * Construye el mesh de un prop ambiental por su tipo. Desde el Hito 2 los
 * props tienen colisión física real (troncos, techos, trampolines, follaje).
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
    case 'palm_tree':
      return buildPalmTree();
    case 'fern_cluster':
      return buildFernCluster();
    case 'ancient_statue':
      return buildAncientStatue();
    case 'vine_arch':
      return buildVineArch();
    case 'cherry_snow_tree':
      return buildCherrySnowTree();
    case 'neon_billboard':
      return buildNeonBillboard();
    case 'cyber_tower':
      return buildCyberTower();
    case 'holo_pillar':
      return buildHoloPillar();
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
    case 'giant_flower':
      return buildGiantFlower();
    case 'glow_mushroom':
      return buildGlowMushroom();
    case 'rock':
      return buildRock();
    // --- Ciudad Sandbox (estilo Gravity Rush × OUTORBIT) ---
    case 'city_house':
    case 'city_shop':
    case 'street_lamp':
    case 'bench':
    case 'market_stall':
    case 'clock_tower':
    case 'crane':
    case 'awning_arch':
    case 'comic_billboard':
    case 'fountain':
      return buildCityPropMesh(kind);
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
 *
 * Hito 4 — rig articulado: `torso` (pivote de cadera que arrastra pecho,
 * cabeza y brazos al inclinarse), `head` (pivote de cuello), brazos con
 * hombreras articuladas que giran con el hombro, bastón táctico aturdidor
 * dentro de `rightArm` (la punta luminosa acompaña cada swing), radio
 * dorsal con antena, rodilleras y botas.
 */
export function buildGuardModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'guard';

  // Pivote del torso EN LA CADERA: sprint/windup articulan sin despegar nada.
  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.y = 0.42;
  group.add(torso);

  const chest = toonMesh(new THREE.CapsuleGeometry(0.36, 0.36, 8, 14), GUARD_UNIFORM, 0.016);
  chest.position.y = 0.13;
  torso.add(chest);

  // Peto blindado anguloso con filo luminoso.
  const plate = toonMesh(new THREE.BoxGeometry(0.56, 0.42, 0.3), GUARD_UNIFORM_DARK, 0.016);
  plate.position.set(0, 0.2, 0.18);
  plate.rotation.x = -0.14;
  torso.add(plate);
  const plateLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.05, 0.04),
    new THREE.MeshBasicMaterial({ color: 0xf87171 })
  );
  plateLine.position.set(0, 0.3, 0.34);
  torso.add(plateLine);

  const belt = toonMesh(new THREE.CylinderGeometry(0.38, 0.38, 0.14, 14), GUARD_UNIFORM_DARK, 0.014);
  belt.position.y = -0.04;
  torso.add(belt);

  // Radio dorsal con antena: la red de IA intra-planeta.
  const radioPack = toonMesh(new THREE.BoxGeometry(0.34, 0.3, 0.16), GUARD_UNIFORM_DARK, 0.014);
  radioPack.position.set(0, 0.22, -0.32);
  torso.add(radioPack);
  const antenna = toonMesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5), '#94a3b8', 0.01);
  antenna.position.set(0.12, 0.6, -0.34);
  antenna.rotation.z = -0.16;
  torso.add(antenna);
  const antennaTip = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xf87171 })
  );
  antennaTip.position.set(0.16, 0.85, -0.34);
  torso.add(antennaTip);

  // Cabeza sobre pivote de cuello.
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 0.92;
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
  torso.add(head);

  // Brazos con hombreras articuladas (giran con el hombro) y guantes.
  for (const side of [-1, 1]) {
    const arm = buildLimb(
      side > 0 ? 'leftArm' : 'rightArm',
      0.46 * side,
      0.32,
      0.12,
      0.28,
      GUARD_UNIFORM
    );
    const pad = toonMesh(new THREE.SphereGeometry(0.17, 10, 8), GUARD_UNIFORM_DARK, 0.014);
    pad.position.set(0, 0.12, 0);
    pad.scale.set(1, 0.7, 1);
    arm.add(pad);
    const glove = toonMesh(new THREE.SphereGeometry(0.13, 10, 8), GUARD_UNIFORM_DARK, 0.012);
    glove.position.set(0, -0.36, 0.02);
    glove.scale.set(1, 0.85, 1.1);
    arm.add(glove);
    torso.add(arm);
  }

  // Bastón táctico aturdidor en la mano derecha con punta luminosa.
  const rightArm = torso.getObjectByName('rightArm');
  if (rightArm) {
    const baton = new THREE.Group();
    baton.name = 'stunBaton';
    const handle = toonMesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 6), '#18181b', 0.01);
    baton.add(handle);
    const shaft = toonMesh(new THREE.CylinderGeometry(0.028, 0.028, 0.3, 6), '#3f3f46', 0.01);
    shaft.position.y = 0.24;
    baton.add(shaft);
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xf87171 })
    );
    tip.position.y = 0.4;
    baton.add(tip);
    const tipGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 6),
      new THREE.MeshBasicMaterial({
        color: 0xf87171,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    tipGlow.position.y = 0.4;
    baton.add(tipGlow);
    baton.position.set(0, -0.36, 0.08);
    baton.rotation.x = 1.15; // empuñado al frente
    rightArm.add(baton);
  }

  // Piernas hermanas del torso (no se inclinan con el sprint) con rodilleras
  // y botas articuladas.
  for (const side of [-1, 1]) {
    const leg = buildLimb(
      side > 0 ? 'leftLeg' : 'rightLeg',
      0.18 * side,
      0.32,
      0.14,
      0.18,
      GUARD_UNIFORM_DARK
    );
    const knee = toonMesh(new THREE.SphereGeometry(0.13, 8, 6), GUARD_UNIFORM_DARK, 0.012);
    knee.position.set(0, -0.17, 0.07);
    knee.scale.set(1, 0.8, 1);
    leg.add(knee);
    const boot = toonMesh(new THREE.BoxGeometry(0.17, 0.1, 0.26), '#18181b', 0.012);
    boot.position.set(0, -0.3, 0.05);
    leg.add(boot);
    group.add(leg);
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
 *
 * Hito 4 — mismo rig articulado que el guardia (`torso`/`head`/brazos con
 * hombreras doradas que giran con el hombro) + bastón de mando dorado en
 * `rightArm`, radio dorsal y botas articuladas.
 */
export function buildOfficerModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'officer';

  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.y = 0.42;
  group.add(torso);

  const chest = toonMesh(new THREE.CapsuleGeometry(0.38, 0.38, 8, 14), GUARD_UNIFORM, 0.016);
  chest.position.y = 0.13;
  torso.add(chest);

  // Peto blindado con filo dorado: la marca del mando.
  const plate = toonMesh(new THREE.BoxGeometry(0.58, 0.42, 0.3), GUARD_UNIFORM_DARK, 0.016);
  plate.position.set(0, 0.2, 0.18);
  plate.rotation.x = -0.14;
  torso.add(plate);
  const plateLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.05, 0.04),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
  );
  plateLine.position.set(0, 0.3, 0.34);
  torso.add(plateLine);

  const belt = toonMesh(new THREE.CylinderGeometry(0.4, 0.4, 0.14, 14), OFFICER_GOLD, 0.014);
  belt.position.y = -0.04;
  torso.add(belt);

  // Radio dorsal con antena dorada.
  const radioPack = toonMesh(new THREE.BoxGeometry(0.34, 0.3, 0.16), GUARD_UNIFORM_DARK, 0.014);
  radioPack.position.set(0, 0.22, -0.32);
  torso.add(radioPack);
  const antenna = toonMesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5), '#94a3b8', 0.01);
  antenna.position.set(0.12, 0.6, -0.34);
  antenna.rotation.z = -0.16;
  torso.add(antenna);
  const antennaTip = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
  );
  antennaTip.position.set(0.16, 0.85, -0.34);
  torso.add(antennaTip);

  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 0.92;
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
  torso.add(head);

  // Brazos con hombreras doradas articuladas y guantes.
  for (const side of [-1, 1]) {
    const arm = buildLimb(
      side > 0 ? 'leftArm' : 'rightArm',
      0.46 * side,
      0.32,
      0.12,
      0.28,
      GUARD_UNIFORM
    );
    const pad = toonMesh(new THREE.SphereGeometry(0.18, 10, 8), OFFICER_GOLD, 0.014);
    pad.position.set(0, 0.12, 0);
    pad.scale.set(1, 0.65, 1);
    arm.add(pad);
    const glove = toonMesh(new THREE.SphereGeometry(0.13, 10, 8), GUARD_UNIFORM_DARK, 0.012);
    glove.position.set(0, -0.36, 0.02);
    glove.scale.set(1, 0.85, 1.1);
    arm.add(glove);
    torso.add(arm);
  }

  // Bastón de mando dorado en la mano derecha con emisor luminoso.
  const rightArm = torso.getObjectByName('rightArm');
  if (rightArm) {
    const baton = new THREE.Group();
    baton.name = 'commandBaton';
    const handle = toonMesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 6), '#18181b', 0.01);
    baton.add(handle);
    const shaft = toonMesh(new THREE.CylinderGeometry(0.028, 0.028, 0.34, 6), OFFICER_GOLD, 0.01);
    shaft.position.y = 0.26;
    baton.add(shaft);
    const tip = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.07, 0),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
    );
    tip.position.y = 0.46;
    baton.add(tip);
    const tipGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 6),
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    tipGlow.position.y = 0.46;
    baton.add(tipGlow);
    baton.position.set(0, -0.36, 0.08);
    baton.rotation.x = 1.15;
    rightArm.add(baton);
  }

  // Piernas con rodilleras y botas articuladas.
  for (const side of [-1, 1]) {
    const leg = buildLimb(
      side > 0 ? 'leftLeg' : 'rightLeg',
      0.18 * side,
      0.32,
      0.14,
      0.18,
      GUARD_UNIFORM_DARK
    );
    const knee = toonMesh(new THREE.SphereGeometry(0.13, 8, 6), GUARD_UNIFORM_DARK, 0.012);
    knee.position.set(0, -0.17, 0.07);
    knee.scale.set(1, 0.8, 1);
    leg.add(knee);
    const boot = toonMesh(new THREE.BoxGeometry(0.17, 0.1, 0.26), '#18181b', 0.012);
    boot.position.set(0, -0.3, 0.05);
    leg.add(boot);
    group.add(leg);
  }

  return group;
}

/** Altura local del halo de sombra bajo los enemigos voladores (~hover). */
const FLYER_SHADOW_HALO_Y = -1.9;

/** Halo de sombra sutil pegado al suelo: el volador SE VE flotar. */
function buildShadowHalo(radius: number): THREE.Mesh {
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 20),
    new THREE.MeshBasicMaterial({
      color: 0x0b1220,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    })
  );
  halo.name = 'shadowHalo';
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = FLYER_SHADOW_HALO_Y;
  return halo;
}

/** Cono de propulsión antigravitatoria hacia abajo (plasma aditivo). */
function buildThrusterGlow(color: number, radius: number, length: number): THREE.Group {
  const thruster = new THREE.Group();
  thruster.name = 'thrusterGlow';
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(radius, length, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  cone.position.y = -length / 2 - 0.18;
  thruster.add(cone);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.55, 10, 8),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  core.position.y = -0.28;
  thruster.add(core);
  return thruster;
}

/**
 * Dron rápido de reconocimiento: esfera flotante con anillo giroscópico
 * nítido, 4 rotores que giran, ojo rojo escáner, antena y propulsor de
 * plasma cian hacia abajo. Persigue al jugador deslizando sobre la
 * superficie.
 *
 * Hito 4 — `hoverCore` es el pivote del fuselaje completo (cabeceo de caza +
 * alabeo lateral), `gyroRing`/`rotor0..3` giran de forma visible y
 * `thrusterGlow` pulsa: el dron flota VISIBLEMENTE sobre el terreno.
 */
export function buildDroneModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'drone';
  group.add(buildShadowHalo(0.55));

  const core = new THREE.Group();
  core.name = 'hoverCore';
  group.add(core);

  const body = toonMesh(new THREE.SphereGeometry(0.42, 16, 12), '#64748b', 0.016);
  core.add(body);

  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xf87171 })
  );
  eye.position.set(0, -0.02, 0.36);
  core.add(eye);

  // Anillo giroscópico crujiente con nudos luminosos: el giro se lee.
  const gyro = new THREE.Group();
  gyro.name = 'gyroRing';
  const ring = toonMesh(new THREE.TorusGeometry(0.62, 0.07, 8, 24), '#334155', 0.014);
  ring.rotation.x = Math.PI / 2;
  gyro.add(ring);
  const nubGeometry = new THREE.SphereGeometry(0.09, 8, 6);
  const nubMaterial = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const nub = new THREE.Mesh(nubGeometry, nubMaterial);
    nub.position.set(Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62);
    gyro.add(nub);
  }
  core.add(gyro);

  // 4 rotores con aspas cruzadas sobre el anillo (giran a tope).
  const bladeGeometry = new THREE.BoxGeometry(0.34, 0.02, 0.05);
  const bladeMaterial = createToonMaterial('#94a3b8');
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const rotor = new THREE.Group();
    rotor.name = `rotor${i}`;
    rotor.position.set(Math.cos(a) * 0.62, 0.1, Math.sin(a) * 0.62);
    const bladeA = new THREE.Mesh(bladeGeometry, bladeMaterial);
    rotor.add(bladeA);
    const bladeB = new THREE.Mesh(bladeGeometry, bladeMaterial);
    bladeB.rotation.y = Math.PI / 2;
    rotor.add(bladeB);
    const hub = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee })
    );
    rotor.add(hub);
    core.add(rotor);
  }

  const antenna = toonMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), '#94a3b8', 0.012);
  antenna.position.y = 0.55;
  core.add(antenna);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
  );
  beacon.position.y = 0.82;
  core.add(beacon);

  // Propulsor repulsor de plasma cian hacia abajo.
  core.add(buildThrusterGlow(0x22d3ee, 0.3, 0.75));

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
 * Brute de élite: guardia pesado rojo con maza eléctrica estilo Kronos.
 * Resiste el melee frontal y solo cae con explosivos, parry o estasis.
 *
 * Hito 4 — rig articulado (`torso`/`head`/brazos con hombreras que giran con
 * el hombro) y maza eléctrica DENTRO de `rightArm`: el windup la arma por
 * encima del hombro y el follow-through la descarga al frente.
 */
export function buildBruteModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'brute';

  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.y = 0.5;
  group.add(torso);

  const chest = toonMesh(new THREE.CapsuleGeometry(0.52, 0.5, 8, 14), BRUTE_RED, 0.018);
  chest.position.y = 0.18;
  chest.scale.set(1.25, 1, 1.15);
  torso.add(chest);

  // Peto blindado pesado con remaches.
  const plate = toonMesh(new THREE.BoxGeometry(0.92, 0.46, 0.5), BRUTE_DARK, 0.018);
  plate.position.set(0, 0.28, 0.2);
  torso.add(plate);
  const rivetGeometry = new THREE.SphereGeometry(0.05, 8, 6);
  const rivetMaterial = createToonMaterial('#f97316');
  for (const side of [-1, 1]) {
    const rivet = new THREE.Mesh(rivetGeometry, rivetMaterial);
    rivet.position.set(0.34 * side, 0.36, 0.46);
    torso.add(rivet);
  }

  const belt = toonMesh(new THREE.CylinderGeometry(0.56, 0.56, 0.18, 14), BRUTE_DARK, 0.016);
  belt.position.y = -0.08;
  torso.add(belt);

  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.02;
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
  torso.add(head);

  // Brazos robustos con hombreras blindadas articuladas.
  for (const side of [-1, 1]) {
    const arm = buildLimb(
      side > 0 ? 'leftArm' : 'rightArm',
      0.62 * side,
      0.42,
      0.16,
      0.34,
      BRUTE_RED
    );
    const pad = toonMesh(new THREE.SphereGeometry(0.22, 10, 8), BRUTE_DARK, 0.016);
    pad.position.set(0, 0.16, 0);
    pad.scale.set(1, 0.65, 1);
    arm.add(pad);
    const glove = toonMesh(new THREE.SphereGeometry(0.17, 10, 8), BRUTE_DARK, 0.014);
    glove.position.set(0, -0.44, 0.03);
    arm.add(glove);
    torso.add(arm);
  }

  // Maza eléctrica en la mano derecha: mango pesado + cabeza con arcos.
  const rightArm = torso.getObjectByName('rightArm');
  if (rightArm) {
    const mace = new THREE.Group();
    mace.name = 'electroMace';
    const handle = toonMesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), '#3f3f46', 0.014);
    handle.position.y = 0.3;
    mace.add(handle);
    const maceHead = toonMesh(new THREE.DodecahedronGeometry(0.26, 0), '#52525b', 0.016);
    maceHead.position.y = 0.95;
    mace.add(maceHead);
    // Arcos eléctricos aditivos sobre la cabeza de la maza.
    const arcMaterial = new THREE.MeshBasicMaterial({
      color: 0xf97316,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const arcGeometry = new THREE.TorusGeometry(0.3, 0.035, 6, 14, Math.PI * 1.2);
    for (let i = 0; i < 2; i++) {
      const arc = new THREE.Mesh(arcGeometry, arcMaterial);
      arc.position.y = 0.95;
      arc.rotation.x = Math.PI / 2 + i * 0.8;
      arc.rotation.y = i * 1.9;
      mace.add(arc);
    }
    const maceGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 6),
      new THREE.MeshBasicMaterial({
        color: 0xf97316,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    maceGlow.position.y = 0.95;
    mace.add(maceGlow);
    mace.position.set(0, -0.5, 0.12);
    mace.rotation.x = 0.35;
    rightArm.add(mace);
  }

  // Piernas tronadoras con rodilleras y botas pesadas.
  for (const side of [-1, 1]) {
    const leg = buildLimb(
      side > 0 ? 'leftLeg' : 'rightLeg',
      0.26 * side,
      0.4,
      0.18,
      0.2,
      BRUTE_DARK
    );
    const knee = toonMesh(new THREE.SphereGeometry(0.16, 8, 6), BRUTE_DARK, 0.014);
    knee.position.set(0, -0.2, 0.08);
    knee.scale.set(1, 0.8, 1);
    leg.add(knee);
    const boot = toonMesh(new THREE.BoxGeometry(0.22, 0.12, 0.32), '#18181b', 0.014);
    boot.position.set(0, -0.34, 0.06);
    leg.add(boot);
    group.add(leg);
  }

  return group;
}

// ============================================================================
// Enemigos animales salvajes de la Selva Tropical (Verdant · Paso 2).
// Sustituyen temáticamente a guardias/oficiales (pantera), vigías (mono),
// brutes (gorila) y drones (avispa). Cuerpos cel con contornos finos
// (0.015-0.022) y mirando hacia +Z, como el resto de enemigos.
// ============================================================================

const PANTHER_COAT = '#3b2d63'; // púrpura-índigo oscuro
const PANTHER_BELLY = '#5b4a8f';
const PANTHER_SPOT = '#f59e0b'; // manchas doradas

/**
 * Pantera/jaguar de la selva: cuadrúpedo ágil de pelaje púrpura-índigo con
 * manchas doradas, orejas felinas puntiagudas, ojos ámbar brillantes, colmillos
 * y cola curva alzada. Sustituye a guardias y oficiales en Verdant.
 *
 * Hito 4 — rig de cuadrúpedo completo: `torso` (pivote de columna: galope,
 * rebote y agachado de la embestida), `head` (pivote de cuello), `legFL`/
 * `legFR`/`legBL`/`legBR` (pivotes de hombro/cadera EN la articulación) y
 * `tail` (pivote de la base de la cola).
 */
export function buildPantherModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'panther';

  // Pivote de columna en el centro del cuerpo: el galope articula desde aquí.
  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.y = 0.72;
  group.add(torso);

  // Cuerpo cuadrúpedo ágil: cápsula tendida a lo largo del eje Z.
  const body = celMesh(new THREE.CapsuleGeometry(0.33, 0.72, 8, 14), PANTHER_COAT, 0.02);
  body.rotation.x = Math.PI / 2;
  torso.add(body);

  // Pecho y panza más claros.
  const belly = celMesh(new THREE.SphereGeometry(0.26, 12, 10), PANTHER_BELLY, 0.016);
  belly.scale.set(1, 0.7, 1.6);
  belly.position.set(0, -0.14, 0.1);
  torso.add(belly);

  // Manchas doradas deterministas sobre el lomo (sin contorno: detalle fino).
  const spotGeometry = new THREE.SphereGeometry(0.07, 8, 6);
  const spotMaterial = createToonMaterial(PANTHER_SPOT);
  for (let i = 0; i < 9; i++) {
    const spot = new THREE.Mesh(spotGeometry, spotMaterial);
    const ang = (i * 2.4) % (Math.PI * 2);
    spot.position.set(
      Math.sin(ang) * 0.28,
      0.1 + Math.cos(i * 1.7) * 0.14,
      -0.5 + (i % 5) * 0.26
    );
    spot.scale.set(1, 0.55, 1);
    torso.add(spot);
  }

  // Cabeza felina sobre pivote de cuello al frente de la columna.
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 0.28, 0.72);
  torso.add(head);
  const skull = celMesh(new THREE.SphereGeometry(0.3, 16, 12), PANTHER_COAT, 0.018);
  head.add(skull);
  const muzzle = celMesh(new THREE.SphereGeometry(0.16, 12, 10), PANTHER_BELLY, 0.015);
  muzzle.scale.set(1.15, 0.8, 1.0);
  muzzle.position.set(0, -0.1, 0.26);
  head.add(muzzle);
  const earGeometry = new THREE.ConeGeometry(0.1, 0.26, 6);
  for (const side of [-1, 1]) {
    const ear = celMesh(earGeometry, PANTHER_COAT, 0.015);
    ear.position.set(0.19 * side, 0.54, -0.1);
    ear.rotation.z = -0.3 * side;
    head.add(ear);
  }

  // Ojos ámbar brillantes depredadores (afilados, sin contorno).
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
  const eyeGeometry = new THREE.SphereGeometry(0.06, 8, 6);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(0.13 * side, 0.06, 0.23);
    eye.scale.set(1, 0.8, 0.7);
    head.add(eye);
  }

  // Colmillos blancos bajo el hocico.
  const fangGeometry = new THREE.ConeGeometry(0.035, 0.14, 6);
  const fangMaterial = createToonMaterial('#f8fafc');
  for (const side of [-1, 1]) {
    const fang = new THREE.Mesh(fangGeometry, fangMaterial);
    fang.position.set(0.07 * side, -0.2, 0.32);
    fang.rotation.x = Math.PI; // puntas hacia abajo
    head.add(fang);
  }

  // Patas: 4 pivotes de hombro/cadera EN la articulación (a la altura del
  // hombro/cadera), con la cápsula colgando del pivote.
  const legGeometry = new THREE.CapsuleGeometry(0.085, 0.42, 6, 10);
  const legPivots: Array<[string, number, number, number]> = [
    ['legFL', 0.2, -0.1, 0.42],
    ['legFR', -0.2, -0.1, 0.42],
    ['legBL', 0.2, -0.12, -0.42],
    ['legBR', -0.2, -0.12, -0.42],
  ];
  const pawGeometry = new THREE.SphereGeometry(0.09, 8, 6);
  for (const [name, x, y, z] of legPivots) {
    const leg = new THREE.Group();
    leg.name = name;
    leg.position.set(x, y, z);
    const capsule = celMesh(legGeometry, PANTHER_COAT, 0.015);
    capsule.position.y = -0.3;
    leg.add(capsule);
    const paw = celMesh(pawGeometry, PANTHER_BELLY, 0.012);
    paw.position.set(0, -0.56, 0.03);
    leg.add(paw);
    torso.add(leg);
  }

  // Cola curva sobre pivote en la base: cadena de esferas alzándose.
  const tail = new THREE.Group();
  tail.name = 'tail';
  tail.position.set(0, 0.14, -0.72);
  torso.add(tail);
  const tailBalls: Array<[number, number, number, number]> = [
    [0, 0, 0, 0.12],
    [0, 0.12, -0.2, 0.1],
    [0, 0.28, -0.32, 0.08],
    [0, 0.42, -0.38, 0.06],
  ];
  for (const [tx, ty, tz, tr] of tailBalls) {
    const ball = celMesh(new THREE.SphereGeometry(tr, 10, 8), PANTHER_COAT, 0.015);
    ball.position.set(tx, ty, tz);
    tail.add(ball);
  }

  return group;
}

const MONKEY_FUR = '#8b5e3c'; // marrón
const MONKEY_CREAM = '#e8d0a9'; // crema

/**
 * Mono vigía de las ruinas: marrón con hocico y orejas grandes crema, ojos
 * vivos y cola enroscada hacia arriba. Ideal para torres y puestos de
 * vigilancia estacionarios.
 *
 * Hito 4 — rig articulado (`torso`/`head`/brazos/piernas + `tail` en la base
 * de la cola) y garrote de bambú DENTRO de `rightArm`: los vigías alzan el
 * garrote al avisar y lo descargan al golpear.
 */
export function buildMonkeyModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'monkey';

  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.y = 0.42;
  group.add(torso);

  // Cuerpo compacto con pecho crema.
  const body = celMesh(new THREE.CapsuleGeometry(0.26, 0.3, 8, 12), MONKEY_FUR, 0.018);
  body.position.y = 0.1;
  torso.add(body);
  const belly = celMesh(new THREE.SphereGeometry(0.2, 12, 10), MONKEY_CREAM, 0.015);
  belly.scale.set(1, 1.2, 0.6);
  belly.position.set(0, 0.1, 0.16);
  torso.add(belly);

  // Cabeza con hocico claro y orejas grandes (pivote de cuello).
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 0.64;
  torso.add(head);
  const skull = celMesh(new THREE.SphereGeometry(0.32, 16, 12), MONKEY_FUR, 0.018);
  head.add(skull);
  const face = celMesh(new THREE.SphereGeometry(0.22, 12, 10), MONKEY_CREAM, 0.015);
  face.scale.set(1.05, 0.85, 0.7);
  face.position.set(0, -0.06, 0.22);
  head.add(face);
  const earGeometry = new THREE.SphereGeometry(0.13, 10, 8);
  for (const side of [-1, 1]) {
    const ear = celMesh(earGeometry, MONKEY_FUR, 0.015);
    ear.position.set(0.34 * side, 0.06, -0.02);
    ear.scale.set(0.5, 1, 1);
    head.add(ear);
    const inner = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 6),
      createToonMaterial(MONKEY_CREAM)
    );
    inner.position.set(0.36 * side, 0.06, 0.02);
    inner.scale.set(0.4, 0.9, 0.8);
    head.add(inner);
  }

  // Ojos vivos oscuros con brillo.
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x1c1917 });
  const eyeGeometry = new THREE.SphereGeometry(0.055, 8, 6);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(0.11 * side, 0.04, 0.36);
    head.add(eye);
  }

  // Brazos colgantes con manos crema.
  for (const side of [-1, 1]) {
    const arm = buildLimb(
      side > 0 ? 'leftArm' : 'rightArm',
      0.34 * side,
      0.26,
      0.09,
      0.24,
      MONKEY_FUR
    );
    const hand = celMesh(new THREE.SphereGeometry(0.1, 8, 6), MONKEY_CREAM, 0.012);
    hand.position.set(0, -0.32, 0.02);
    arm.add(hand);
    torso.add(arm);
  }

  // Garrote de bambú en la mano derecha.
  const rightArm = torso.getObjectByName('rightArm');
  if (rightArm) {
    const club = new THREE.Group();
    club.name = 'bambooClub';
    const stalk = celMesh(new THREE.CylinderGeometry(0.045, 0.06, 0.72, 6), '#4ade80', 0.014);
    stalk.position.y = 0.3;
    club.add(stalk);
    for (const ry of [0.12, 0.34, 0.56]) {
      const node = celMesh(new THREE.CylinderGeometry(0.065, 0.065, 0.05, 6), '#16a34a', 0.012);
      node.position.y = ry;
      club.add(node);
    }
    const knob = celMesh(new THREE.SphereGeometry(0.09, 8, 6), '#15803d', 0.014);
    knob.position.y = 0.68;
    club.add(knob);
    club.position.set(0, -0.32, 0.08);
    club.rotation.x = 1.05;
    rightArm.add(club);
  }

  // Piernas con pies prensiles (hermanas del torso).
  for (const side of [-1, 1]) {
    const leg = buildLimb(
      side > 0 ? 'leftLeg' : 'rightLeg',
      0.14 * side,
      0.3,
      0.1,
      0.14,
      MONKEY_FUR
    );
    const foot = celMesh(new THREE.SphereGeometry(0.1, 8, 6), MONKEY_CREAM, 0.012);
    foot.position.set(0, -0.26, 0.03);
    leg.add(foot);
    group.add(leg);
  }

  // Cola enroscada hacia arriba sobre pivote en la base.
  const tail = new THREE.Group();
  tail.name = 'tail';
  tail.position.set(0, 0.08, -0.3);
  torso.add(tail);
  const tailBalls: Array<[number, number, number, number]> = [
    [0, 0, 0, 0.09],
    [0, 0.18, -0.12, 0.08],
    [0, 0.38, -0.18, 0.07],
    [0, 0.56, -0.14, 0.06],
    [0, 0.66, -0.02, 0.05],
  ];
  for (const [tx, ty, tz, tr] of tailBalls) {
    const ball = celMesh(new THREE.SphereGeometry(tr, 10, 8), MONKEY_FUR, 0.015);
    ball.position.set(tx, ty, tz);
    tail.add(ball);
  }

  return group;
}

const GORILLA_FUR = '#3f3f46';
const GORILLA_SILVER = '#d4d4d8'; // lomo plateado
const GORILLA_SKIN = '#52525b'; // cara y pecho

/**
 * Gorila lomo plateado gigante: pecho robusto, hombros anchos, puños grandes
 * y musgo verde creciendo sobre los hombros. Sustituye al brute en la selva.
 *
 * Hito 4 — rig articulado: `torso` (pivote de pecho), `head` (cuello) y
 * brazos/piernas con pivotes de hombro/cadera EN la articulación: el bombeo
 * de nudillos del chase rebota con el paso real.
 */
export function buildGorillaModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'gorilla';

  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.y = 0.75;
  group.add(torso);

  // Torso masivo con pecho robusto.
  const body = celMesh(new THREE.CapsuleGeometry(0.52, 0.5, 8, 14), GORILLA_FUR, 0.022);
  body.position.y = 0.1;
  body.scale.set(1.3, 1, 1.1);
  torso.add(body);
  const chest = celMesh(new THREE.SphereGeometry(0.4, 14, 12), GORILLA_SKIN, 0.018);
  chest.scale.set(1.15, 1.1, 0.6);
  chest.position.set(0, 0.15, 0.42);
  torso.add(chest);

  // Lomo plateado (la marca del alfa).
  const silverback = celMesh(new THREE.SphereGeometry(0.46, 14, 12), GORILLA_SILVER, 0.018);
  silverback.scale.set(1.2, 1.05, 0.55);
  silverback.position.set(0, 0.17, -0.42);
  torso.add(silverback);

  // Cabeza con cresta sagital y cara oscura (pivote de cuello).
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 0.87;
  torso.add(head);
  const skull = celMesh(new THREE.SphereGeometry(0.38, 16, 12), GORILLA_FUR, 0.02);
  head.add(skull);
  const crest = celMesh(new THREE.BoxGeometry(0.16, 0.24, 0.5), GORILLA_FUR, 0.016);
  crest.position.set(0, 0.32, -0.02);
  head.add(crest);
  const face = celMesh(new THREE.SphereGeometry(0.26, 12, 10), GORILLA_SKIN, 0.016);
  face.scale.set(1.05, 0.85, 0.7);
  face.position.set(0, -0.06, 0.26);
  head.add(face);
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xf87171 });
  const eyeGeometry = new THREE.SphereGeometry(0.05, 8, 6);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(0.11 * side, 0.02, 0.44);
    head.add(eye);
  }

  // Brazos largos y gruesos con puños de nudillos: pivote EN el hombro,
  // hombrera con musgo que gira con él y puño al final del brazo.
  const armGeometry = new THREE.CapsuleGeometry(0.15, 0.72, 8, 12);
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.name = side > 0 ? 'leftArm' : 'rightArm';
    arm.position.set(0.66 * side, 0.53, 0.12);
    const pad = celMesh(new THREE.SphereGeometry(0.28, 12, 10), GORILLA_FUR, 0.018);
    pad.position.set(0, 0.05, 0);
    pad.scale.set(1, 0.75, 1);
    arm.add(pad);
    const moss = celMesh(new THREE.SphereGeometry(0.2, 10, 8), '#4ade80', 0.015);
    moss.position.set(0, 0.26, 0.02);
    moss.scale.set(1, 0.5, 0.9);
    arm.add(moss);
    const upper = celMesh(armGeometry, GORILLA_FUR, 0.018);
    upper.position.y = -0.51;
    arm.add(upper);
    const fist = celMesh(new THREE.SphereGeometry(0.21, 12, 10), GORILLA_SKIN, 0.016);
    fist.position.set(0.12 * side, -1.06, 0.04);
    arm.add(fist);
    torso.add(arm);
  }

  // Piernas cortas y fuertes con pivote de cadera y pies planos.
  const legGeometry = new THREE.CapsuleGeometry(0.16, 0.3, 8, 12);
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = side > 0 ? 'leftLeg' : 'rightLeg';
    leg.position.set(0.28 * side, 0.28, -0.12);
    const shin = celMesh(legGeometry, GORILLA_FUR, 0.018);
    shin.position.y = -0.16;
    leg.add(shin);
    const foot = celMesh(new THREE.SphereGeometry(0.15, 10, 8), GORILLA_SKIN, 0.014);
    foot.position.set(0, -0.27, 0.05);
    foot.scale.set(1.1, 0.6, 1.3);
    leg.add(foot);
    group.add(leg);
  }

  return group;
}

/**
 * Avispa gigante de la selva: tórax peludo oscuro, abdomen segmentado
 * amarillo/obsidiana con aguijón de plasma brillante, mandíbulas
 * depredadoras y 4 alas facetadas translúcidas que brillan (grupos
 * `wingL`/`wingR`/`wingBL`/`wingBR`). Sustituye al dron en la selva.
 *
 * Hito 4 — `hoverCore` es el pivote del cuerpo completo (cabeceo de caza +
 * alabeo con el giro; el aguijón se hunde al cargar el aguijonazo) y las 4
 * alas son pivotes de raíz independientes para el aleteo en 8.
 */
export function buildWaspModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'wasp';
  group.add(buildShadowHalo(0.6));

  const core = new THREE.Group();
  core.name = 'hoverCore';
  group.add(core);

  // Tórax peludo oscuro.
  const thorax = celMesh(new THREE.SphereGeometry(0.32, 14, 12), '#292524', 0.018);
  thorax.position.set(0, 0.02, 0.22);
  core.add(thorax);

  // Abdomen segmentado amarillo/obsidiana, alzado hacia el aguijón.
  const abdomen = new THREE.Group();
  abdomen.position.set(0, -0.02, -0.28);
  abdomen.rotation.x = 0.22;
  for (let i = 0; i < 4; i++) {
    const seg = celMesh(
      new THREE.CylinderGeometry(0.27 - i * 0.045, 0.3 - i * 0.045, 0.22, 12),
      i % 2 === 0 ? '#facc15' : '#292524',
      0.016
    );
    seg.rotation.x = Math.PI / 2;
    seg.position.z = -i * 0.21;
    abdomen.add(seg);
  }
  // Aguijón de plasma brillante.
  const stinger = celMesh(new THREE.ConeGeometry(0.08, 0.32, 8), '#18181b', 0.014);
  stinger.rotation.x = -Math.PI / 2;
  stinger.position.z = -0.86;
  abdomen.add(stinger);
  const stingerGlow = new THREE.Mesh(
    new THREE.ConeGeometry(0.1, 0.4, 8),
    new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  stingerGlow.rotation.x = -Math.PI / 2;
  stingerGlow.position.z = -0.9;
  abdomen.add(stingerGlow);
  core.add(abdomen);

  // Cabeza con ojos compuestos, antenas y mandíbulas depredadoras.
  const head = celMesh(new THREE.SphereGeometry(0.24, 14, 12), '#292524', 0.016);
  head.position.set(0, 0.08, 0.56);
  core.add(head);
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xf87171 });
  const eyeGeometry = new THREE.SphereGeometry(0.1, 10, 8);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(0.12 * side, 0.12, 0.72);
    eye.scale.set(0.8, 1, 0.7);
    core.add(eye);
  }
  const antennaGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.34, 5);
  for (const side of [-1, 1]) {
    const antenna = celMesh(antennaGeometry, '#18181b', 0.012);
    antenna.position.set(0.09 * side, 0.34, 0.6);
    antenna.rotation.z = 0.35 * side;
    antenna.rotation.x = -0.3;
    core.add(antenna);
  }
  const mandibleGeometry = new THREE.ConeGeometry(0.045, 0.22, 6);
  const mandibleMaterial = createToonMaterial('#18181b');
  for (const side of [-1, 1]) {
    const mandible = celMesh(mandibleGeometry, '#18181b', 0.012);
    mandible.position.set(0.09 * side, -0.02, 0.78);
    mandible.rotation.x = Math.PI / 2 + 0.25;
    mandible.rotation.z = -0.4 * side;
    core.add(mandible);
    const mandibleTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 6, 5),
      mandibleMaterial
    );
    mandibleTip.position.set(0.14 * side, -0.06, 0.86);
    core.add(mandibleTip);
  }

  // 4 alas facetadas translúcidas y brillantes: pivotes de raíz independientes
  // (par delantero largo + par trasero corto) para el aleteo en 8.
  const wingMaterial = new THREE.MeshBasicMaterial({
    color: 0x67e8f9,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const wingVeinMaterial = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const wingDefs: Array<[string, number, number, number, number]> = [
    // [nombre, lado, z de raíz, largo, ancho]
    ['wingL', -1, 0.18, 0.85, 0.3],
    ['wingR', 1, 0.18, 0.85, 0.3],
    ['wingBL', -1, -0.08, 0.62, 0.26],
    ['wingBR', 1, -0.08, 0.62, 0.26],
  ];
  for (const [name, side, zRoot, len, width] of wingDefs) {
    const wing = new THREE.Group();
    wing.name = name;
    wing.position.set(0.16 * side, 0.26, zRoot);
    // Ala facetada: esfera low-poly achatada (facetas nítidas al girar).
    const blade = new THREE.Mesh(new THREE.SphereGeometry(1, 4, 2), wingMaterial);
    blade.scale.set(len, 0.035, width);
    blade.position.set(side * len * 0.55, 0.06, 0);
    wing.add(blade);
    // Vena luminosa que atraviesa el ala (brillo aditivo).
    const vein = new THREE.Mesh(
      new THREE.BoxGeometry(len * 1.1, 0.015, 0.03),
      wingVeinMaterial
    );
    vein.position.set(side * len * 0.55, 0.07, 0);
    wing.add(vein);
    core.add(wing);
  }

  // Propulsor antigravitatorio sutil hacia abajo (la avispa flota visible).
  core.add(buildThrusterGlow(0x22d3ee, 0.22, 0.55));

  return group;
}

// ============================================================================
// Shogunato Feudal Nevado (Kurogane · Planeta 2): samuráis y oni. Sustituyen
// temáticamente a guardias/oficiales (samurái, capitán con sashimono) y al
// brute (oni acorazado con kanabo). Cuerpos cel con contornos finos y
// mirando hacia +Z, como el resto de enemigos.
// ============================================================================

const SAMURAI_CRIMSON = '#b91c1c'; // laca carmesí
const SAMURAI_INDIGO = '#1e1b4b'; // índigo oscuro
const SAMURAI_GOLD = '#fbbf24';
const SAMURAI_STEEL = '#e2e8f0';

/**
 * Samurái del Shogunato Nevado: armadura lacada rojo-carmesí sobre índigo
 * oscuro, casco kabuto con media luna dorada, máscara menpo oscura con ojos
 * brillantes, hombreras laminares y katana en la mano derecha. Con
 * `isOfficer` añade un estandarte sashimono dorado en la espalda: es el
 * Capitán del Dojo que porta la llave maestra del Castillo.
 */
export function buildSamuraiModel(isOfficer = false): THREE.Group {
  const group = new THREE.Group();
  group.name = 'samurai';

  // Hito 4: pivote del torso EN la cadera — el windup tuerce el cuerpo y el
  // sprint lo inclina sin despegar cabeza ni brazos.
  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.y = 0.42;
  group.add(torso);

  // Torso de índigo oscuro bajo la coraza carmesí.
  const body = celMesh(new THREE.CapsuleGeometry(0.36, 0.36, 8, 14), SAMURAI_INDIGO, 0.016);
  body.position.y = 0.13;
  torso.add(body);

  // Coraza lacada (do-maru) carmesí con cordones dorados.
  const cuirass = celMesh(new THREE.CylinderGeometry(0.4, 0.44, 0.52, 12), SAMURAI_CRIMSON, 0.016);
  cuirass.position.y = 0.2;
  torso.add(cuirass);
  const lace = celMesh(new THREE.CylinderGeometry(0.41, 0.45, 0.1, 12), SAMURAI_GOLD, 0.012);
  lace.position.y = 0.08;
  torso.add(lace);

  // Falda de placas (kusazuri): cono abierto carmesí sobre las caderas.
  const skirt = celMesh(
    new THREE.ConeGeometry(0.52, 0.42, 10, 1, true),
    SAMURAI_CRIMSON,
    0.016
  );
  skirt.position.y = 0;
  torso.add(skirt);

  // Cabeza: cráneo oscuro cubierto por la máscara menpo (pivote de cuello).
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 0.92;
  const skull = celMesh(new THREE.SphereGeometry(0.5, 18, 14), '#2a2432', 0.016);
  head.add(skull);
  // Menpo: máscara facial oscura que cubre el rostro bajo los ojos.
  const menpo = celMesh(new THREE.SphereGeometry(0.42, 14, 12), '#18181b', 0.016);
  menpo.scale.set(1.02, 0.9, 0.72);
  menpo.position.set(0, -0.06, 0.22);
  head.add(menpo);
  // Ojos brillantes tras la máscara (furia del Shogunato).
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xf87171 });
  const eyeGeometry = new THREE.SphereGeometry(0.07, 8, 6);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(0.17 * side, 0.12, 0.42);
    eye.scale.set(1, 0.8, 0.6);
    head.add(eye);
  }
  // Kabuto: casco abombado índigo con ala y protectores de mejilla.
  const helmet = celMesh(
    new THREE.SphereGeometry(0.54, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    SAMURAI_INDIGO,
    0.016
  );
  helmet.position.y = 0.1;
  head.add(helmet);
  const brim = celMesh(new THREE.CylinderGeometry(0.56, 0.56, 0.07, 16), SAMURAI_INDIGO, 0.014);
  brim.position.y = 0.1;
  head.add(brim);
  // Media luna dorada (maedate) al frente del kabuto.
  const crescent = celMesh(
    new THREE.TorusGeometry(0.24, 0.05, 8, 16, Math.PI),
    SAMURAI_GOLD,
    0.014
  );
  crescent.position.set(0, 0.42, 0.3);
  crescent.rotation.z = Math.PI; // cuernos de la luna hacia arriba
  head.add(crescent);
  torso.add(head);

  // Brazos de índigo con hombreras laminares (sode) que giran con el hombro.
  for (const side of [-1, 1]) {
    const arm = buildLimb(
      side > 0 ? 'leftArm' : 'rightArm',
      0.46 * side,
      0.32,
      0.12,
      0.28,
      SAMURAI_INDIGO
    );
    for (let i = 0; i < 3; i++) {
      const plate = celMesh(
        new THREE.SphereGeometry(0.19 - i * 0.03, 10, 8),
        i === 0 ? SAMURAI_GOLD : SAMURAI_CRIMSON,
        0.014
      );
      plate.position.set(0, 0.14 - i * 0.14, 0);
      plate.scale.set(1, 0.5, 1);
      arm.add(plate);
    }
    const gauntlet = celMesh(new THREE.SphereGeometry(0.12, 8, 6), SAMURAI_GOLD, 0.012);
    gauntlet.position.set(0, -0.34, 0.02);
    arm.add(gauntlet);
    torso.add(arm);
  }

  // Piernas de índigo con botas oscuras y espinilleras (hermanas del torso).
  for (const side of [-1, 1]) {
    const leg = buildLimb(
      side > 0 ? 'leftLeg' : 'rightLeg',
      0.18 * side,
      0.32,
      0.14,
      0.18,
      side > 0 ? SAMURAI_INDIGO : '#11111c'
    );
    const shinGuard = celMesh(new THREE.BoxGeometry(0.16, 0.2, 0.14), SAMURAI_CRIMSON, 0.012);
    shinGuard.position.set(0, -0.2, 0.06);
    leg.add(shinGuard);
    group.add(leg);
  }

  // Katana en la mano derecha: empuñadura lacada, tsuba dorada, hoja curva
  // y filo luminoso (el swing del brazo la arrastra automáticamente).
  const rightArm = torso.getObjectByName('rightArm');
  if (rightArm) {
    const katana = new THREE.Group();
    katana.name = 'katana';
    const handle = celMesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 6), '#7f1d1d', 0.012);
    katana.add(handle);
    const guard = celMesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 10), SAMURAI_GOLD, 0.012);
    guard.position.y = 0.16;
    katana.add(guard);
    const blade = celMesh(new THREE.BoxGeometry(0.045, 0.72, 0.02), SAMURAI_STEEL, 0.012);
    blade.position.set(0.03, 0.54, 0);
    blade.rotation.z = -0.08; // leve curvatura de la hoja
    katana.add(blade);
    // Filo luminoso: destello aditivo a lo largo del corte.
    const edgeGlow = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 0.72, 0.024),
      new THREE.MeshBasicMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    edgeGlow.position.set(0.055, 0.54, 0);
    edgeGlow.rotation.z = -0.08;
    katana.add(edgeGlow);
    const tip = celMesh(new THREE.ConeGeometry(0.032, 0.12, 6), SAMURAI_STEEL, 0.012);
    tip.position.set(0.075, 0.94, 0);
    tip.rotation.z = -0.08;
    katana.add(tip);
    katana.position.set(0, -0.36, 0.12);
    katana.rotation.x = -0.65; // en guardia, hoja alzada hacia el frente
    rightArm.add(katana);
  }

  // Capitán: estandarte sashimono dorado sobre pivote EN la base de la
  // espalda — ondea con el viento y destuerce con el windup del katana.
  if (isOfficer) {
    const bannerPivot = new THREE.Group();
    bannerPivot.name = 'banner';
    bannerPivot.position.set(0, -0.02, -0.4);
    const pole = celMesh(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 6), '#3f2a1a', 0.012);
    pole.position.y = 1.3;
    bannerPivot.add(pole);
    const banner = celMesh(new THREE.BoxGeometry(0.62, 1.3, 0.04), SAMURAI_GOLD, 0.016);
    banner.position.set(0, 1.95, -0.04);
    bannerPivot.add(banner);
    // Emblema carmesí del Shogunato sobre el estandarte.
    const emblem = celMesh(new THREE.OctahedronGeometry(0.18, 0), SAMURAI_CRIMSON, 0.014);
    emblem.position.set(0, 1.95, 0);
    bannerPivot.add(emblem);
    torso.add(bannerPivot);
  }

  return group;
}

const ONI_SKIN = '#60a5fa'; // piel azul hielo
const ONI_CRIMSON = '#b91c1c';
const ONI_GOLD = '#fbbf24';
const ONI_HORN = '#f8fafc';

/**
 * Oni acorazado gigante del Castillo del Shogún: demonio de piel azul hielo
 * con placas carmesí, taparrabos y armadura dorada, dos cuernos blancos
 * curvos y un kanabo (garrote pesado con pinchos) en la mano. Sustituye al
 * brute en el Shogunato Nevado.
 */
export function buildOniModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'oni';

  // Hito 4: pivote del torso EN la cadera (el kanabo va dentro del brazo).
  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.y = 0.55;
  group.add(torso);

  // Torso masivo de piel azul hielo.
  const body = celMesh(new THREE.CapsuleGeometry(0.52, 0.5, 8, 14), ONI_SKIN, 0.02);
  body.position.y = 0.13;
  body.scale.set(1.25, 1, 1.15);
  torso.add(body);

  // Peto de placas carmesí con remaches dorados.
  const chest = celMesh(new THREE.CylinderGeometry(0.56, 0.6, 0.5, 12), ONI_CRIMSON, 0.018);
  chest.position.y = 0.23;
  torso.add(chest);
  const rivetGeometry = new THREE.SphereGeometry(0.06, 8, 6);
  for (const side of [-1, 1]) {
    const rivet = new THREE.Mesh(rivetGeometry, createToonMaterial(ONI_GOLD));
    rivet.position.set(0.42 * side, 0.35, 0.42);
    torso.add(rivet);
  }

  // Taparrabos dorado: cinturón + faldón carmesí entre las piernas.
  const belt = celMesh(new THREE.CylinderGeometry(0.58, 0.58, 0.18, 14), ONI_GOLD, 0.016);
  belt.position.y = -0.13;
  torso.add(belt);
  const loincloth = celMesh(new THREE.BoxGeometry(0.5, 0.6, 0.14), ONI_CRIMSON, 0.016);
  loincloth.position.set(0, -0.27, 0.42);
  torso.add(loincloth);

  // Cabeza demoníaca: calavera azul hielo, boca con colmillos y ojos ardientes.
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 0.97;
  const skull = celMesh(new THREE.SphereGeometry(0.46, 18, 14), ONI_SKIN, 0.018);
  head.add(skull);
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xf87171 });
  const eyeGeometry = new THREE.SphereGeometry(0.08, 8, 6);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(0.16 * side, 0.1, 0.4);
    head.add(eye);
  }
  // Mandíbula con colmillos blancos.
  const jaw = celMesh(new THREE.SphereGeometry(0.3, 12, 10), ONI_SKIN, 0.016);
  jaw.scale.set(1.1, 0.6, 0.9);
  jaw.position.set(0, -0.26, 0.2);
  head.add(jaw);
  const fangGeometry = new THREE.ConeGeometry(0.05, 0.16, 6);
  for (const side of [-1, 1]) {
    const fang = new THREE.Mesh(fangGeometry, createToonMaterial(ONI_HORN));
    fang.position.set(0.14 * side, -0.14, 0.42);
    head.add(fang);
  }
  // Dos cuernos blancos curvos hacia fuera y arriba.
  const hornGeometry = new THREE.ConeGeometry(0.11, 0.55, 8);
  for (const side of [-1, 1]) {
    const horn = celMesh(hornGeometry, ONI_HORN, 0.016);
    horn.position.set(0.3 * side, 0.44, -0.02);
    horn.rotation.set(-0.25, 0, 0.75 * side);
    head.add(horn);
  }
  torso.add(head);

  // Brazos robustos de piel azul hielo con hombreras doradas articuladas.
  for (const side of [-1, 1]) {
    const arm = buildLimb(
      side > 0 ? 'leftArm' : 'rightArm',
      0.62 * side,
      0.37,
      0.16,
      0.34,
      ONI_SKIN
    );
    const pad = celMesh(new THREE.SphereGeometry(0.24, 12, 10), ONI_GOLD, 0.016);
    pad.position.set(0, 0.2, 0);
    pad.scale.set(1, 0.65, 1);
    arm.add(pad);
    const fist = celMesh(new THREE.SphereGeometry(0.16, 10, 8), ONI_SKIN, 0.014);
    fist.position.set(0, -0.46, 0.03);
    arm.add(fist);
    torso.add(arm);
  }

  // Piernas robustas con rodilleras (hermanas del torso).
  for (const side of [-1, 1]) {
    const leg = buildLimb(
      side > 0 ? 'leftLeg' : 'rightLeg',
      0.26 * side,
      0.4,
      0.18,
      0.2,
      ONI_SKIN
    );
    const knee = celMesh(new THREE.SphereGeometry(0.16, 8, 6), ONI_GOLD, 0.014);
    knee.position.set(0, -0.2, 0.08);
    knee.scale.set(1, 0.8, 1);
    leg.add(knee);
    group.add(leg);
  }

  // Kanabo: garrote pesado de hierro con anillos dorados y pinchos, DENTRO
  // de la mano derecha (apoyado al hombro; el swing lo acompaña).
  const rightArm = torso.getObjectByName('rightArm');
  if (rightArm) {
    const kanabo = new THREE.Group();
    kanabo.name = 'kanabo';
    const club = celMesh(new THREE.CylinderGeometry(0.13, 0.09, 1.5, 8), '#3f3f46', 0.018);
    club.position.y = 0.55;
    kanabo.add(club);
    for (const y of [0.25, 0.7, 1.15]) {
      const ring = celMesh(new THREE.CylinderGeometry(0.15, 0.15, 0.09, 8), ONI_GOLD, 0.014);
      ring.position.y = y;
      kanabo.add(ring);
    }
    const spikeGeometry = new THREE.ConeGeometry(0.05, 0.16, 6);
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const spike = new THREE.Mesh(spikeGeometry, createToonMaterial(ONI_HORN));
      spike.position.set(Math.cos(ang) * 0.15, 0.7 + (i % 2) * 0.45, Math.sin(ang) * 0.15);
      spike.rotation.z = -Math.cos(ang) * (Math.PI / 2);
      spike.rotation.x = Math.sin(ang) * (Math.PI / 2);
      kanabo.add(spike);
    }
    kanabo.position.set(0, -0.5, 0.3);
    kanabo.rotation.set(-0.5, 0, 0.12);
    rightArm.add(kanabo);
  }

  // Escala de gigante: impone frente a los samuráis (~1.9 de alto).
  group.scale.setScalar(1.3);

  return group;
}

// ============================================================================
// Metrópolis Cyberpunk (Neon Bastion · Planeta 3): guardias cibernéticos,
// drones de vigilancia y mechas pesados. Sustituyen temáticamente a
// guardias/oficiales (soldado cyber), drones (dron angular) y brutes
// (exoesqueleto mecha). Cuerpos cel con contornos finos y mirando hacia +Z,
// como el resto de enemigos.
// ============================================================================

const CYBER_ARMOR = '#1e1b4b'; // armadura índigo oscura
const CYBER_DARK = '#0f0f1e'; // negro azulado del casco/peto
const CYBER_STEEL = '#3f3f46';

/**
 * Soldado cyberpunk de Neon Bastion: armadura negra/índigo con líneas
 * luminosas cian neón, visor horizontal brillante y rifle energético. Con
 * `isOfficer` (Oficial del Ala Corporativa) las líneas pasan a magenta
 * brillante y añade antena dorsal y hombreras holográficas: es él quien
 * porta la Tarjeta Maestra.
 */
export function buildCyberGuardModel(isOfficer = false): THREE.Group {
  const group = new THREE.Group();
  group.name = 'cyberGuard';
  const lineHex = isOfficer ? 0xe879f9 : 0x22d3ee;
  const lineMaterial = new THREE.MeshBasicMaterial({ color: lineHex });

  // Hito 4: pivote del torso EN la cadera.
  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.y = 0.42;
  group.add(torso);

  // Torso de armadura índigo.
  const body = celMesh(new THREE.CapsuleGeometry(0.36, 0.36, 8, 14), CYBER_ARMOR, 0.016);
  body.position.y = 0.13;
  torso.add(body);

  // Peto angular oscuro con línea de neón vertical sobre el pecho.
  const chest = celMesh(new THREE.BoxGeometry(0.62, 0.5, 0.42), CYBER_DARK, 0.016);
  chest.position.set(0, 0.2, 0.14);
  torso.add(chest);
  const chestLine = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.4, 0.05), lineMaterial);
  chestLine.position.set(0, 0.2, 0.37);
  torso.add(chestLine);

  // Cinturón táctico con hebilla luminosa.
  const belt = celMesh(new THREE.CylinderGeometry(0.38, 0.38, 0.14, 14), CYBER_DARK, 0.014);
  belt.position.y = -0.04;
  torso.add(belt);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.06), lineMaterial);
  buckle.position.set(0, -0.04, 0.38);
  torso.add(buckle);

  // Cabeza: casco oscuro con visor horizontal de neón.
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 0.92;
  const skull = celMesh(new THREE.SphereGeometry(0.5, 18, 14), CYBER_DARK, 0.016);
  head.add(skull);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.14, 0.16), lineMaterial);
  visor.position.set(0, 0.05, 0.44);
  head.add(visor);
  const helmet = celMesh(
    new THREE.SphereGeometry(0.54, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    CYBER_ARMOR,
    0.016
  );
  helmet.position.y = 0.1;
  head.add(helmet);
  // Cristal de comunicación sobre la sien.
  const earJack = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.1), lineMaterial);
  earJack.position.set(0.5, 0.05, 0);
  head.add(earJack);
  if (isOfficer) {
    // Antena dorsal del oficial con punta magenta brillante.
    const antenna = celMesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.55, 6),
      '#94a3b8',
      0.012
    );
    antenna.position.set(0.24, 0.6, -0.08);
    antenna.rotation.z = -0.18;
    head.add(antenna);
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xe879f9 })
    );
    tip.position.set(0.29, 0.88, -0.08);
    head.add(tip);
  }
  torso.add(head);

  // Brazos de armadura con hombreras articuladas; el oficial añade placas
  // holográficas magenta que giran con el hombro.
  for (const side of [-1, 1]) {
    const arm = buildLimb(
      side > 0 ? 'leftArm' : 'rightArm',
      0.46 * side,
      0.32,
      0.12,
      0.28,
      CYBER_ARMOR
    );
    const pad = celMesh(new THREE.SphereGeometry(0.17, 10, 8), CYBER_DARK, 0.014);
    pad.position.set(0, 0.12, 0);
    pad.scale.set(1, 0.7, 1);
    arm.add(pad);
    if (isOfficer) {
      const holo = new THREE.Mesh(
        new THREE.BoxGeometry(0.36, 0.13, 0.32),
        new THREE.MeshBasicMaterial({
          color: 0xe879f9,
          transparent: true,
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      holo.position.set(0, 0.3, 0);
      arm.add(holo);
    }
    torso.add(arm);
  }

  // Piernas de armadura con botas oscuras (hermanas del torso).
  for (const side of [-1, 1]) {
    const leg = buildLimb(
      side > 0 ? 'leftLeg' : 'rightLeg',
      0.18 * side,
      0.32,
      0.14,
      0.18,
      CYBER_DARK
    );
    const boot = celMesh(new THREE.BoxGeometry(0.18, 0.1, 0.26), '#18181b', 0.012);
    boot.position.set(0, -0.3, 0.05);
    leg.add(boot);
    group.add(leg);
  }

  // Líneas de neón en las espinillas (detalle sin contorno).
  const shinGeometry = new THREE.BoxGeometry(0.05, 0.22, 0.04);
  for (const legName of ['leftLeg', 'rightLeg']) {
    const leg = group.getObjectByName(legName);
    if (!leg) continue;
    const shin = new THREE.Mesh(shinGeometry, lineMaterial);
    shin.position.set(0, -0.3, 0.1);
    leg.add(shin);
  }

  // Arma energética: rifle de pulso (guardia) o bastón de mando (oficial).
  const rightArm = torso.getObjectByName('rightArm');
  if (rightArm) {
    const weapon = new THREE.Group();
    weapon.name = 'energyWeapon';
    if (isOfficer) {
      // Bastón de mando: mástil oscuro con emisor magenta en la punta.
      const shaft = celMesh(new THREE.CylinderGeometry(0.035, 0.035, 1.15, 6), CYBER_STEEL, 0.012);
      weapon.add(shaft);
      const emitter = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.11, 0),
        new THREE.MeshBasicMaterial({ color: 0xe879f9 })
      );
      emitter.position.y = 0.62;
      weapon.add(emitter);
      const gripRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.07, 0.02, 8, 14),
        new THREE.MeshBasicMaterial({ color: 0xe879f9 })
      );
      gripRing.rotation.x = Math.PI / 2;
      gripRing.position.y = 0.1;
      weapon.add(gripRing);
      weapon.position.set(0, -0.3, 0.12);
      weapon.rotation.x = -0.15;
    } else {
      // Rifle de pulso: culata oscura, celda cian y cañón con boquilla.
      const body = celMesh(new THREE.BoxGeometry(0.09, 0.1, 0.8), CYBER_STEEL, 0.012);
      weapon.add(body);
      const cell = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.06, 0.18), lineMaterial);
      cell.position.set(0, 0.09, -0.08);
      weapon.add(cell);
      const muzzle = celMesh(
        new THREE.CylinderGeometry(0.045, 0.055, 0.16, 8),
        '#18181b',
        0.012
      );
      muzzle.rotation.x = Math.PI / 2;
      muzzle.position.z = 0.46;
      weapon.add(muzzle);
      const muzzleGlow = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 6),
        lineMaterial
      );
      muzzleGlow.position.z = 0.55;
      weapon.add(muzzleGlow);
      weapon.position.set(0, -0.34, 0.16);
      weapon.rotation.x = 0.08;
    }
    rightArm.add(weapon);
  }

  // Oficial del Ala Corporativa: penacho holográfico de mando y mini-dron
  // orbital flotando junto al hombro.
  if (isOfficer) {
    const bannerPivot = new THREE.Group();
    bannerPivot.name = 'banner';
    bannerPivot.position.set(0, 0.1, -0.34);
    const pole = celMesh(new THREE.CylinderGeometry(0.022, 0.022, 1.5, 5), CYBER_STEEL, 0.01);
    pole.position.y = 0.75;
    bannerPivot.add(pole);
    const pennant = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.3, 0.02),
      new THREE.MeshBasicMaterial({
        color: 0xe879f9,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    pennant.position.set(0.12, 1.28, 0);
    bannerPivot.add(pennant);
    torso.add(bannerPivot);

    // Mini-dron orbital: cuerpo esférico, ojo escáner y anillo luminoso.
    const pod = new THREE.Group();
    pod.name = 'hoverPod';
    pod.position.set(0.62, 0.93, -0.06);
    const podBody = celMesh(new THREE.SphereGeometry(0.14, 10, 8), CYBER_DARK, 0.012);
    pod.add(podBody);
    const podEye = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xe879f9 })
    );
    podEye.position.set(0, 0, 0.12);
    pod.add(podEye);
    const podRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.19, 0.02, 6, 16),
      new THREE.MeshBasicMaterial({
        color: 0xe879f9,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    podRing.rotation.x = Math.PI / 2;
    pod.add(podRing);
    torso.add(pod);
  }

  return group;
}

/**
 * Dron de vigilancia de Neon Bastion: fuselaje angular oscuro con núcleo
 * rojo escáner al frente y 4 rotores/anillos luminosos cian en las esquinas,
 * unidos por brazos de carbono. Sustituye al dron uniformado.
 */
export function buildCyberDroneModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'cyberDrone';
  group.add(buildShadowHalo(0.6));

  // Hito 4: núcleo de flotación; todo el fuselaje se inclina/banca con él.
  const core = new THREE.Group();
  core.name = 'hoverCore';
  group.add(core);

  // Fuselaje angular: octaedro achatado y alargado hacia el frente.
  const body = celMesh(new THREE.OctahedronGeometry(0.5, 0), '#1f2937', 0.016);
  body.scale.set(1.1, 0.68, 1.35);
  core.add(body);

  // Núcleo rojo escáner con anillo, mirando al frente (+Z).
  const scanner = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xef4444 })
  );
  scanner.position.set(0, 0, 0.42);
  core.add(scanner);
  const scannerRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.035, 8, 18),
    new THREE.MeshBasicMaterial({ color: 0xef4444 })
  );
  scannerRing.position.set(0, 0, 0.47);
  core.add(scannerRing);

  // Anillo giroscópico que rodea el fuselaje: el giro se lee de lejos.
  const gyro = new THREE.Group();
  gyro.name = 'gyroRing';
  const gyroRing = celMesh(new THREE.TorusGeometry(0.78, 0.05, 8, 24), '#334155', 0.014);
  gyroRing.rotation.x = Math.PI / 2;
  gyro.add(gyroRing);
  const gyroNubGeometry = new THREE.SphereGeometry(0.07, 8, 6);
  const gyroNubMaterial = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const nub = new THREE.Mesh(gyroNubGeometry, gyroNubMaterial);
    nub.position.set(Math.cos(a) * 0.78, 0, Math.sin(a) * 0.78);
    gyro.add(nub);
  }
  core.add(gyro);

  // 4 rotores en las esquinas: anillo cian + aspas cruzadas girando.
  const rotorGeometry = new THREE.TorusGeometry(0.22, 0.045, 8, 20);
  const rotorMaterial = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
  const bladeGeometry = new THREE.BoxGeometry(0.3, 0.02, 0.05);
  const bladeMaterial = createToonMaterial('#94a3b8');
  const armGeometry = new THREE.BoxGeometry(0.34, 0.05, 0.05);
  let rotorIndex = 0;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const arm = celMesh(armGeometry, '#374151', 0.012);
      arm.position.set(sx * 0.3, 0.12, sz * 0.3);
      arm.rotation.y = Math.atan2(-sz, sx);
      core.add(arm);
      const rotor = new THREE.Group();
      rotor.name = `rotor${rotorIndex++}`;
      rotor.position.set(sx * 0.48, 0.16, sz * 0.48);
      const ring = new THREE.Mesh(rotorGeometry, rotorMaterial);
      ring.rotation.x = Math.PI / 2;
      rotor.add(ring);
      const bladeA = new THREE.Mesh(bladeGeometry, bladeMaterial);
      rotor.add(bladeA);
      const bladeB = new THREE.Mesh(bladeGeometry, bladeMaterial);
      bladeB.rotation.y = Math.PI / 2;
      rotor.add(bladeB);
      core.add(rotor);
    }
  }

  // Antena dorsal con baliza ámbar.
  const antenna = celMesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 6), '#94a3b8', 0.012);
  antenna.position.y = 0.5;
  core.add(antenna);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
  );
  beacon.position.y = 0.72;
  core.add(beacon);

  // Propulsor repulsor de plasma ámbar hacia abajo.
  core.add(buildThrusterGlow(0xfbbf24, 0.28, 0.7));

  return group;
}

/**
 * Mech exoesqueleto pesado de Neon Bastion: chasis angular gris oscuro,
 * visor rojo brillante, reactor pectoral cian y brazo cañón pesado. Sustituye
 * al brute en la Ciudadela de Reactores (solo cae con explosivos, parry o
 * estasis, igual que el brute uniformado).
 */
export function buildCyberMechModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'cyberMech';
  const MECH_FRAME = '#374151';
  const MECH_DARK = '#1f2937';

  // Pelvis y cintura articulada (queda en la raíz: las piernas no se inclinan).
  const pelvis = celMesh(new THREE.BoxGeometry(0.6, 0.3, 0.45), MECH_DARK, 0.016);
  pelvis.position.y = 0.62;
  group.add(pelvis);

  // Hito 4: pivote del torso EN la cintura; cabeza/brazos/propulsores giran con él.
  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.y = 0.85;
  group.add(torso);

  // Chasis angular: torso caja masiva con placas.
  const chassis = celMesh(new THREE.BoxGeometry(0.95, 0.8, 0.6), MECH_FRAME, 0.02);
  chassis.position.y = 0.3;
  torso.add(chassis);
  // Placa pectoral con reactor cian brillante.
  const chest = celMesh(new THREE.BoxGeometry(0.7, 0.55, 0.2), MECH_DARK, 0.018);
  chest.position.set(0, 0.35, 0.36);
  torso.add(chest);
  const reactor = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0x22d3ee })
  );
  reactor.position.set(0, 0.37, 0.5);
  torso.add(reactor);
  const reactorRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.21, 0.04, 8, 18),
    new THREE.MeshBasicMaterial({ color: 0x22d3ee })
  );
  reactorRing.position.set(0, 0.37, 0.52);
  torso.add(reactorRing);
  // Rejillas de ventilación traseras con brillo cian.
  for (const dy of [-0.15, 0.05, 0.25]) {
    const vent = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.06, 0.05),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee })
    );
    vent.position.set(0, 0.35 + dy, -0.34);
    torso.add(vent);
  }

  // Cabeza pequeña con visor rojo brillante y cuernos de sensor.
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 0.93;
  const skull = celMesh(new THREE.BoxGeometry(0.4, 0.3, 0.38), MECH_DARK, 0.016);
  head.add(skull);
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.09, 0.06),
    new THREE.MeshBasicMaterial({ color: 0xef4444 })
  );
  visor.position.set(0, 0.02, 0.21);
  head.add(visor);
  const sensorGeometry = new THREE.ConeGeometry(0.05, 0.22, 5);
  for (const side of [-1, 1]) {
    const sensor = celMesh(sensorGeometry, MECH_FRAME, 0.012);
    sensor.position.set(0.2 * side, 0.24, 0);
    sensor.rotation.z = 0.3 * side;
    head.add(sensor);
  }
  torso.add(head);

  // Hombreras angulares voladizas ancladas al hombro.
  for (const side of [-1, 1]) {
    const pad = celMesh(new THREE.BoxGeometry(0.44, 0.2, 0.52), MECH_DARK, 0.018);
    pad.position.set(0.64 * side, 0.77, 0);
    pad.rotation.z = 0.1 * side;
    torso.add(pad);
  }

  // Brazo izquierdo con puño apoyado: pivote EN el hombro.
  const leftArm = new THREE.Group();
  leftArm.name = 'leftArm';
  leftArm.position.set(-0.66, 0.6, 0.04);
  const leftArmBox = celMesh(new THREE.BoxGeometry(0.26, 0.66, 0.26), MECH_FRAME, 0.018);
  leftArmBox.position.y = -0.33;
  leftArm.add(leftArmBox);
  const fist = celMesh(new THREE.SphereGeometry(0.17, 10, 8), MECH_DARK, 0.016);
  fist.position.set(0, -0.73, 0.04);
  leftArm.add(fist);
  torso.add(leftArm);

  // Brazo derecho: cañón pesado con boquilla roja y líneas de energía.
  const rightArm = new THREE.Group();
  rightArm.name = 'rightArm';
  rightArm.position.set(0.66, 0.6, 0);
  const shoulder = celMesh(new THREE.BoxGeometry(0.32, 0.36, 0.36), MECH_FRAME, 0.018);
  shoulder.position.y = -0.03;
  rightArm.add(shoulder);
  const barrel = celMesh(
    new THREE.CylinderGeometry(0.13, 0.16, 0.95, 10),
    MECH_DARK,
    0.018
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, -0.37, 0.5);
  rightArm.add(barrel);
  const barrelBand = celMesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.12, 10),
    MECH_FRAME,
    0.014
  );
  barrelBand.rotation.x = Math.PI / 2;
  barrelBand.position.set(0, -0.37, 0.32);
  rightArm.add(barrelBand);
  const muzzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.17, 0.1, 10),
    new THREE.MeshBasicMaterial({ color: 0xef4444 })
  );
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0, -0.37, 0.99);
  rightArm.add(muzzle);
  const energyLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.05, 0.6),
    new THREE.MeshBasicMaterial({ color: 0xef4444 })
  );
  energyLine.position.set(0, -0.17, 0.35);
  rightArm.add(energyLine);
  torso.add(rightArm);

  // Propulsores dorsales gemelos con brillo cian (siguen el torso).
  for (const side of [-1, 1]) {
    const thruster = celMesh(
      new THREE.CylinderGeometry(0.1, 0.13, 0.5, 8),
      MECH_DARK,
      0.014
    );
    thruster.position.set(0.3 * side, 0.4, -0.42);
    thruster.rotation.x = 0.35;
    torso.add(thruster);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee })
    );
    glow.position.set(0.3 * side, 0.17, -0.52);
    torso.add(glow);
  }

  // Piernas gruesas articuladas con pies pesados: pivotes EN la cadera.
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = side > 0 ? 'leftLeg' : 'rightLeg';
    leg.position.set(0.3 * side, 0.62, 0);
    const thigh = celMesh(new THREE.BoxGeometry(0.3, 0.42, 0.32), MECH_FRAME, 0.018);
    thigh.position.y = -0.2;
    leg.add(thigh);
    const shin = celMesh(new THREE.BoxGeometry(0.24, 0.34, 0.28), MECH_DARK, 0.016);
    shin.position.set(0, -0.5, 0.02);
    leg.add(shin);
    const foot = celMesh(new THREE.BoxGeometry(0.32, 0.14, 0.44), MECH_FRAME, 0.016);
    foot.position.set(0, -0.55, 0.08);
    leg.add(foot);
    group.add(leg);
  }

  // Escala de mecha pesado: imponente frente a los cyber guardias.
  group.scale.setScalar(1.2);

  return group;
}

/**
 * Instancia el modelo de un enemigo por su tipo y skin temática: los animales
 * de la selva (pantera, mono, gorila, avispa), los samuráis/onis del
 * Shogunato Nevado y los cibernéticos de Neon Bastion sustituyen al modelo
 * uniformado por defecto; cualquier skin sin builder propio cae al modelo de
 * su `kind`.
 */
export function buildEnemyModelBySkin(kind: EnemyKind, skin?: EnemySkin): THREE.Group {
  switch (skin) {
    case 'panther':
      return buildPantherModel();
    case 'monkey':
      return buildMonkeyModel();
    case 'gorilla':
      return buildGorillaModel();
    case 'wasp':
      return buildWaspModel();
    case 'samurai':
      return buildSamuraiModel(kind === 'officer');
    case 'oni':
      return buildOniModel();
    case 'cyber_guard':
      return buildCyberGuardModel(kind === 'officer');
    case 'cyber_officer':
      return buildCyberGuardModel(true);
    case 'cyber_drone':
      return buildCyberDroneModel();
    case 'cyber_mech':
      return buildCyberMechModel();
    default:
      break;
  }
  switch (kind) {
    case 'officer':
      return buildOfficerModel();
    case 'drone':
      return buildDroneModel();
    case 'turret':
      return buildTurretModel();
    case 'brute':
      return buildBruteModel();
    default:
      return buildGuardModel();
  }
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
  torso.name = 'torso';
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
