// ============================================================================
// CHARACTER MODEL — escuadrón cabezón de proporciones chibi
// ============================================================================
// Paletas, cabezas con extras por personaje (orejas de kitsune, taladro de Digger, visera de Axel), colas, complementos de cuello, skins temáticas del escuadrón y buildCharacterModel. Extraído de proceduralModels.ts (P8).
// ============================================================================

import * as THREE from 'three';
import {
  GAME_CONSTANTS,
  type CharacterId,
} from '../../types';
import { createToonMaterial } from '../toonMaterials';
import {
  additiveGlowMaterial,
  toonMesh,
} from '../meshFactory';
import { buildEyes, buildLimb } from './modelParts';

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
// Skins temáticas del escuadrón (antifaz, capa, taladro, jetpack)
// ============================================================================

/**
 * Extras temáticos por personaje (subgrupos nombrados para animación):
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
        additiveGlowMaterial(0xffffff, 0.85, { depthWrite: false })
      );
      sheen.position.set(0.035, 0.2, 0.02);
      kunai.add(sheen);
      kunai.position.set(0, -0.36, 0.1);
      kunai.rotation.x = 0.9;
      rightArm.add(kunai);
      const aura = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 8, 6),
        additiveGlowMaterial(0xf97316, 0.5, { depthWrite: false })
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
        additiveGlowMaterial(0x22d3ee, 0.85, { depthWrite: false })
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
      additiveGlowMaterial(0x22d3ee, 0.16, { depthWrite: false })
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
 * leftLeg, rightLeg, tail (+ cape/drill/flames de la skin temática). Mira hacia +Z.
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
