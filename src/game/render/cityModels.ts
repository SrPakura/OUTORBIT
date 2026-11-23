import * as THREE from 'three';
import type { PropKind } from '../types';
import { addComicOutline, createComicCelMaterial } from './toonMaterials';
import { celMesh, glowMesh, toonMesh } from './meshFactory';

// ============================================================================
// Ciudad Sandbox (estilo OUTORBIT)
// Props urbanos y objetos del modo Sandbox, todos con el look cómic cel-shaded:
// 3 bandas + halftone + sombra índigo (0x161b33) + contornos de tinta negra.
// ============================================================================

export type CityPropKind = Extract<
  PropKind,
  | 'city_house'
  | 'city_shop'
  | 'street_lamp'
  | 'bench'
  | 'market_stall'
  | 'clock_tower'
  | 'crane'
  | 'awning_arch'
  | 'comic_billboard'
  | 'fountain'
>;

// ============================================================================
// PROPS URBANOS
// ============================================================================

/**
 * Casa urbana de 2-3 plantas (~5.2 m): muros crema con bandas de acento
 * coral, ventanas luminosas amarillas/cian, puerta índigo y azotea plana
 * caminable con cornisa voladiza y pretil perimetral.
 */
function buildCityHouse(): THREE.Group {
  const house = new THREE.Group();
  const base = celMesh(new THREE.BoxGeometry(4.4, 0.3, 4.4), '#8d99ae', 0.022);
  base.position.y = 0.15;
  house.add(base);
  const walls = celMesh(new THREE.BoxGeometry(4.0, 4.4, 4.0), '#f7e8d0', 0.024);
  walls.position.y = 2.5;
  house.add(walls);
  // Bandas de forjado entre plantas (color de acento coral).
  const bandGeometry = new THREE.BoxGeometry(4.15, 0.18, 4.15);
  for (const bandY of [1.7, 3.4]) {
    const band = celMesh(bandGeometry, '#e07a5f', 0.016);
    band.position.y = bandY;
    house.add(band);
  }
  // Cornisa voladiza + losa de azotea caminable.
  const cornice = celMesh(new THREE.BoxGeometry(4.5, 0.35, 4.5), '#e07a5f', 0.02);
  cornice.position.y = 4.85;
  house.add(cornice);
  const roof = celMesh(new THREE.BoxGeometry(4.2, 0.22, 4.2), '#94a3b8', 0.018);
  roof.position.y = 5.12;
  house.add(roof);
  // Pretil perimetral de la azotea (4 tramos, geometría compartida).
  const parapetGeometry = new THREE.BoxGeometry(4.2, 0.35, 0.18);
  for (const side of [-1, 1]) {
    const parapetN = celMesh(parapetGeometry, '#e07a5f', 0.014);
    parapetN.position.set(0, 5.4, 2.0 * side);
    house.add(parapetN);
    const parapetS = celMesh(parapetGeometry, '#e07a5f', 0.014);
    parapetS.rotation.y = Math.PI / 2;
    parapetS.position.set(2.0 * side, 5.4, 0);
    house.add(parapetS);
  }
  // Puerta índigo en la fachada +z.
  const door = celMesh(new THREE.BoxGeometry(0.9, 1.5, 0.1), '#2f3e52', 0.014);
  door.position.set(-1.1, 1.05, 2.03);
  house.add(door);
  // Ventanas: marco índigo + cristal luminoso (amarillo y cian alternos).
  const frameGeometry = new THREE.BoxGeometry(0.72, 0.92, 0.08);
  const paneGeometry = new THREE.BoxGeometry(0.56, 0.74, 0.1);
  const yellowPane = new THREE.MeshBasicMaterial({ color: 0xffd166 });
  const cyanPane = new THREE.MeshBasicMaterial({ color: 0x7dd3fc });
  const windowRows = [1.15, 2.55, 3.95];
  for (let row = 0; row < windowRows.length; row++) {
    for (const wx of [-1.0, 1.0]) {
      const frame = celMesh(frameGeometry, '#2f3e52', 0.012);
      frame.position.set(wx, windowRows[row], 2.02);
      house.add(frame);
      const pane = new THREE.Mesh(paneGeometry, (row + (wx > 0 ? 1 : 0)) % 2 === 0 ? yellowPane : cyanPane);
      pane.position.set(wx, windowRows[row], 2.04);
      house.add(pane);
    }
  }
  return house;
}

/**
 * Comercio urbano (~4.5 m): cuerpo mostaza, escaparate cian luminoso, toldo
 * rayado rojo/crema voladizo, cartel cómic sobre la azotea y techo caminable.
 */
function buildCityShop(): THREE.Group {
  const shop = new THREE.Group();
  const base = celMesh(new THREE.BoxGeometry(4.2, 0.25, 3.6), '#8d99ae', 0.02);
  base.position.y = 0.12;
  shop.add(base);
  const body = celMesh(new THREE.BoxGeometry(4.0, 2.6, 3.4), '#ffd166', 0.024);
  body.position.y = 1.55;
  shop.add(body);
  // Escaparate luminoso cian con puerta índigo a la derecha.
  const glass = glowMesh(new THREE.BoxGeometry(2.4, 1.4, 0.1), 0x7dd3fc);
  glass.position.set(-0.6, 1.15, 1.72);
  shop.add(glass);
  const door = celMesh(new THREE.BoxGeometry(0.8, 1.5, 0.1), '#2f3e52', 0.014);
  door.position.set(1.4, 1.0, 1.72);
  shop.add(door);
  // Toldo rayado rojo/crema inclinado sobre el escaparate.
  const stripeGeometry = new THREE.BoxGeometry(0.62, 0.06, 1.15);
  const redStripe = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const creamStripe = new THREE.MeshBasicMaterial({ color: 0xfef3c7 });
  for (let i = 0; i < 6; i++) {
    const stripe = new THREE.Mesh(stripeGeometry, i % 2 === 0 ? redStripe : creamStripe);
    stripe.position.set(-1.55 + i * 0.62, 2.42, 2.15);
    stripe.rotation.x = -0.35;
    shop.add(stripe);
  }
  // Losa de techo caminable + cartel cómic elevado con letrero neón.
  const roof = celMesh(new THREE.BoxGeometry(4.2, 0.25, 3.6), '#e07a5f', 0.018);
  roof.position.y = 2.97;
  shop.add(roof);
  const sign = celMesh(new THREE.BoxGeometry(3.4, 1.2, 0.5), '#f4a261', 0.018);
  sign.position.set(0, 3.7, 1.1);
  shop.add(sign);
  const barGeometry = new THREE.BoxGeometry(1, 0.16, 0.06);
  const magentaBar = new THREE.MeshBasicMaterial({ color: 0xf472b6 });
  const cyanBar = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
  const barWidths = [2.6, 1.9, 2.3];
  for (let i = 0; i < barWidths.length; i++) {
    const bar = new THREE.Mesh(barGeometry, i % 2 === 0 ? magentaBar : cyanBar);
    bar.scale.x = barWidths[i];
    bar.position.set(0, 3.95 - i * 0.32, 1.38);
    shop.add(bar);
  }
  return shop;
}

/**
 * Farola curva estilizada (~4.3 m): poste índigo con brazo de cuarto de
 * círculo (TorusGeometry con arco) y foco esférico cálido autoiluminado.
 */
function buildStreetLamp(): THREE.Group {
  const lamp = new THREE.Group();
  const base = celMesh(new THREE.CylinderGeometry(0.16, 0.24, 0.35, 8), '#334155', 0.016);
  base.position.y = 0.17;
  lamp.add(base);
  const pole = celMesh(new THREE.CylinderGeometry(0.05, 0.08, 3.55, 6), '#2f3e52', 0.014);
  pole.position.y = 2.0;
  lamp.add(pole);
  // Brazo curvo: cuarto de torus en el plano XY, del remate hacia -x.
  const arm = celMesh(new THREE.TorusGeometry(0.55, 0.05, 6, 12, Math.PI / 2), '#2f3e52', 0.012);
  arm.rotation.z = Math.PI / 2;
  arm.position.y = 3.75;
  lamp.add(arm);
  // Foco esférico cálido con caperuza cónica.
  const bulb = glowMesh(new THREE.SphereGeometry(0.17, 10, 8), 0xffd166);
  bulb.position.set(-0.55, 3.66, 0);
  lamp.add(bulb);
  const cap = celMesh(new THREE.ConeGeometry(0.2, 0.18, 8), '#334155', 0.012);
  cap.position.set(-0.55, 3.9, 0);
  lamp.add(cap);
  return lamp;
}

/**
 * Banco de plaza (~2 m de ancho): tablones de madera cálida sobre patas
 * metálicas índigo, con respaldo ligeramente inclinado.
 */
function buildBench(): THREE.Group {
  const bench = new THREE.Group();
  const seatGeometry = new THREE.BoxGeometry(2.0, 0.08, 0.3);
  for (let i = 0; i < 3; i++) {
    const plank = celMesh(seatGeometry, '#b45309', 0.014);
    plank.position.set(0, 0.55, -0.3 + i * 0.3);
    bench.add(plank);
  }
  const backGeometry = new THREE.BoxGeometry(2.0, 0.12, 0.07);
  for (let i = 0; i < 2; i++) {
    const plank = celMesh(backGeometry, '#b45309', 0.012);
    plank.position.set(0, 0.82 + i * 0.22, -0.44);
    plank.rotation.x = -0.14;
    bench.add(plank);
  }
  const legGeometry = new THREE.BoxGeometry(0.09, 0.55, 0.55);
  for (const side of [-1, 1]) {
    const leg = celMesh(legGeometry, '#334155', 0.012);
    leg.position.set(0.85 * side, 0.28, 0);
    bench.add(leg);
  }
  return bench;
}

/**
 * Puesto callejero (~3 m de ancho): lona a rayas rosa/dorado vibrante sobre
 * cuatro postes de madera, mostrador y cajas de mercancía debajo.
 */
function buildMarketStall(): THREE.Group {
  const stall = new THREE.Group();
  const poleGeometry = new THREE.CylinderGeometry(0.05, 0.05, 2.25, 6);
  for (const px of [-1.4, 1.4]) {
    for (const pz of [-0.8, 0.8]) {
      const pole = celMesh(poleGeometry, '#7c4a21', 0.012);
      pole.position.set(px, 1.12, pz);
      stall.add(pole);
    }
  }
  // Lona a rayas vibrantes (rosa chicle y dorado).
  const stripeGeometry = new THREE.BoxGeometry(0.6, 0.05, 2.1);
  const pinkStripe = new THREE.MeshBasicMaterial({ color: 0xf472b6 });
  const goldStripe = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
  for (let i = 0; i < 5; i++) {
    const stripe = new THREE.Mesh(stripeGeometry, i % 2 === 0 ? pinkStripe : goldStripe);
    stripe.position.set(-1.2 + i * 0.6, 2.28, 0);
    stall.add(stripe);
  }
  // Mostrador de madera + cajas de mercancía (una abierta con fruta).
  const counter = celMesh(new THREE.BoxGeometry(2.6, 0.12, 0.7), '#92400e', 0.014);
  counter.position.set(0, 1.0, 0.45);
  stall.add(counter);
  const crateGeometry = new THREE.BoxGeometry(0.55, 0.5, 0.55);
  for (const cx of [-0.9, 0, 0.9]) {
    const crate = celMesh(crateGeometry, '#b45309', 0.014);
    crate.position.set(cx, 0.25, 0.45);
    stall.add(crate);
  }
  const fruitCrate = celMesh(crateGeometry, '#92400e', 0.014);
  fruitCrate.position.set(-0.6, 1.31, 0.45);
  stall.add(fruitCrate);
  const fruitGeometry = new THREE.SphereGeometry(0.11, 8, 6);
  const fruitMaterial = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  for (let i = 0; i < 3; i++) {
    const fruit = new THREE.Mesh(fruitGeometry, fruitMaterial);
    fruit.position.set(-0.78 + i * 0.18, 1.62, 0.45);
    stall.add(fruit);
  }
  return stall;
}

/**
 * Torre reloj/astral icónica (~27 m, base 6x6): plinto de piedra, fuste
 * crema con bandas coral, balcones en tres niveles, esfera de reloj
 * luminosa en las 4 caras con agujas cómic y aguja/estrella rematando.
 */
function buildClockTower(): THREE.Group {
  const tower = new THREE.Group();
  const plinth = celMesh(new THREE.BoxGeometry(6.4, 1.2, 6.4), '#8d99ae', 0.024);
  plinth.position.y = 0.6;
  tower.add(plinth);
  const shaft = celMesh(new THREE.BoxGeometry(5.0, 16.0, 5.0), '#e8d5b7', 0.024);
  shaft.position.y = 9.2;
  tower.add(shaft);
  // Bandas de acento entre tramos del fuste.
  const bandGeometry = new THREE.BoxGeometry(5.2, 0.3, 5.2);
  for (const bandY of [5.0, 9.5, 14.0]) {
    const band = celMesh(bandGeometry, '#e07a5f', 0.016);
    band.position.y = bandY;
    tower.add(band);
  }
  // Balcónes en tres niveles: losa voladiza + pretil de 4 tramos.
  const slabGeometry = new THREE.BoxGeometry(5.8, 0.25, 5.8);
  const postGeometry = new THREE.BoxGeometry(0.1, 0.7, 0.1);
  const railGeometry = new THREE.BoxGeometry(5.5, 0.08, 0.08);
  for (const balconyY of [6.5, 11.5, 16.5]) {
    const slab = celMesh(slabGeometry, '#e07a5f', 0.016);
    slab.position.y = balconyY;
    tower.add(slab);
    for (const side of [-1, 1]) {
      const railN = celMesh(railGeometry, '#2f3e52', 0.01);
      railN.position.set(0, balconyY + 0.4, 2.7 * side);
      tower.add(railN);
      const railS = celMesh(railGeometry, '#2f3e52', 0.01);
      railS.rotation.y = Math.PI / 2;
      railS.position.set(2.7 * side, balconyY + 0.4, 0);
      tower.add(railS);
    }
    for (const px of [-2.7, 2.7]) {
      for (const pz of [-2.7, 2.7]) {
        const post = celMesh(postGeometry, '#2f3e52', 0.01);
        post.position.set(px, balconyY + 0.35, pz);
        tower.add(post);
      }
    }
  }
  // Tramo del reloj: cuerpo superior con esfera luminosa en las 4 caras.
  const clockBody = celMesh(new THREE.BoxGeometry(5.6, 5.0, 5.6), '#e8d5b7', 0.022);
  clockBody.position.y = 19.7;
  tower.add(clockBody);
  const faceGeometry = new THREE.CylinderGeometry(1.3, 1.3, 0.15, 20);
  const ringGeometry = new THREE.TorusGeometry(1.3, 0.1, 6, 20);
  const handGeometry = new THREE.BoxGeometry(0.12, 0.9, 0.06);
  const faceMaterial = new THREE.MeshBasicMaterial({ color: 0xfef9c3 });
  const handMaterial = new THREE.MeshBasicMaterial({ color: 0x090b14 });
  const faces: Array<[number, number, number, number]> = [
    [0, 2.85, 0, 0],
    [0, -2.85, 0, Math.PI],
    [2.85, 0, 0, Math.PI / 2],
    [-2.85, 0, 0, -Math.PI / 2],
  ];
  for (const [fx, fz, , faceYaw] of faces) {
    const face = new THREE.Mesh(faceGeometry, faceMaterial);
    face.rotation.x = Math.PI / 2;
    face.rotation.z = faceYaw;
    face.position.set(fx, 19.7, fz);
    tower.add(face);
    const ring = celMesh(ringGeometry, '#e07a5f', 0.012);
    ring.position.set(fx, 19.7, fz);
    ring.rotation.y = faceYaw;
    tower.add(ring);
    // Agujas cómic: minutero vertical y horario girado (comparten material).
    const minuteHand = new THREE.Mesh(handGeometry, handMaterial);
    minuteHand.position.set(fx, 19.7, fz + Math.sign(fz || 1) * 0.1);
    minuteHand.rotation.z = faceYaw;
    tower.add(minuteHand);
    const hourHand = new THREE.Mesh(handGeometry, handMaterial);
    hourHand.scale.y = 0.62;
    hourHand.position.set(fx, 19.7, fz + Math.sign(fz || 1) * 0.1);
    hourHand.rotation.z = faceYaw + 2.1;
    tower.add(hourHand);
  }
  // Capitel piramidal + aguja astral con estrella dorada.
  const cap = celMesh(new THREE.ConeGeometry(4.2, 2.6, 4), '#e07a5f', 0.02);
  cap.rotation.y = Math.PI / 4;
  cap.position.y = 23.5;
  tower.add(cap);
  const spire = celMesh(new THREE.CylinderGeometry(0.07, 0.12, 2.4, 6), '#2f3e52', 0.012);
  spire.position.y = 25.9;
  tower.add(spire);
  const star = glowMesh(new THREE.OctahedronGeometry(0.35), 0xfde047);
  star.scale.set(1, 1.5, 1);
  star.position.y = 27.4;
  tower.add(star);
  return tower;
}

/**
 * Grúa industrial amarilla/naranja (~13.5 m): torre en celosía estilizada
 * (4 montantes + redadas + cruces), cabina, brazo horizontal plano con
 * celosía, contrapeso y gancho colgante de cable.
 */
function buildCrane(): THREE.Group {
  const crane = new THREE.Group();
  const base = celMesh(new THREE.BoxGeometry(2.2, 0.5, 2.2), '#334155', 0.018);
  base.position.y = 0.25;
  crane.add(base);
  // Torre: 4 montantes verticales + redadas horizontales cada 2.2 m.
  const postGeometry = new THREE.BoxGeometry(0.14, 11.0, 0.14);
  const rungGeometry = new THREE.BoxGeometry(1.4, 0.1, 0.1);
  const braceGeometry = new THREE.BoxGeometry(2.6, 0.09, 0.09);
  for (const px of [-0.7, 0.7]) {
    for (const pz of [-0.7, 0.7]) {
      const post = celMesh(postGeometry, '#f59e0b', 0.012);
      post.position.set(px, 6.0, pz);
      crane.add(post);
    }
  }
  for (let level = 0; level < 5; level++) {
    const rungY = 1.6 + level * 2.2;
    for (const axis of [0, 1]) {
      for (const side of [-1, 1]) {
        const rung = celMesh(rungGeometry, '#ea580c', 0.01);
        if (axis === 0) {
          rung.position.set(0, rungY, 0.7 * side);
        } else {
          rung.rotation.y = Math.PI / 2;
          rung.position.set(0.7 * side, rungY, 0);
        }
        crane.add(rung);
      }
    }
    // Cruces en las caras frontal y trasera (dirección alternada).
    for (const side of [-1, 1]) {
      const brace = celMesh(braceGeometry, '#ea580c', 0.01);
      brace.position.set(0, rungY + 1.1, 0.7 * side);
      brace.rotation.z = (level % 2 === 0 ? 1 : -1) * 1.0;
      crane.add(brace);
    }
  }
  // Cabina con ventana luminosa + plataforma giratoria.
  const cab = celMesh(new THREE.BoxGeometry(1.2, 1.1, 1.3), '#f59e0b', 0.014);
  cab.position.set(0, 11.85, 0.55);
  crane.add(cab);
  const cabGlass = glowMesh(new THREE.BoxGeometry(0.9, 0.5, 0.06), 0x7dd3fc);
  cabGlass.position.set(0, 11.95, 1.22);
  crane.add(cabGlass);
  const turret = celMesh(new THREE.BoxGeometry(1.5, 0.7, 1.5), '#ea580c', 0.014);
  turret.position.y = 12.35;
  crane.add(turret);
  // Brazo horizontal: celosía plana (cordones + montantes + diagonales).
  const chordGeometry = new THREE.BoxGeometry(9.5, 0.14, 0.14);
  for (const chordY of [12.1, 13.0]) {
    const chord = celMesh(chordGeometry, '#f59e0b', 0.012);
    chord.position.set(5.1, chordY, 0);
    crane.add(chord);
  }
  const webPostGeometry = new THREE.BoxGeometry(0.1, 0.9, 0.1);
  const webDiagGeometry = new THREE.BoxGeometry(1.55, 0.09, 0.09);
  for (let i = 0; i < 6; i++) {
    const webX = 1.2 + i * 1.55;
    const webPost = celMesh(webPostGeometry, '#ea580c', 0.01);
    webPost.position.set(webX, 12.55, 0);
    crane.add(webPost);
    const webDiag = celMesh(webDiagGeometry, '#ea580c', 0.01);
    webDiag.position.set(webX + 0.78, 12.55, 0);
    webDiag.rotation.z = i % 2 === 0 ? 0.55 : -0.55;
    crane.add(webDiag);
  }
  // Contrabrazo con contrapeso.
  const counterJib = celMesh(new THREE.BoxGeometry(3.0, 0.14, 0.14), '#f59e0b', 0.012);
  counterJib.position.set(-1.7, 12.6, 0);
  crane.add(counterJib);
  const counterweight = celMesh(new THREE.BoxGeometry(0.8, 0.9, 0.9), '#334155', 0.014);
  counterweight.position.set(-3.0, 12.15, 0);
  crane.add(counterweight);
  // Cable + gancho colgante bajo el brazo.
  const cable = celMesh(new THREE.CylinderGeometry(0.025, 0.025, 1.9, 5), '#334155', 0.008);
  cable.position.set(7.6, 11.15, 0);
  crane.add(cable);
  const hookBlock = celMesh(new THREE.BoxGeometry(0.2, 0.28, 0.2), '#0f172a', 0.01);
  hookBlock.position.set(7.6, 10.05, 0);
  crane.add(hookBlock);
  const hook = celMesh(new THREE.TorusGeometry(0.14, 0.045, 6, 10, Math.PI * 1.2), '#ea580c', 0.01);
  hook.rotation.z = -Math.PI * 0.6;
  hook.position.set(7.6, 9.78, 0);
  crane.add(hook);
  return crane;
}

/**
 * Arco callejero festivo (~5 m de ancho, 4.8 m libres por debajo): pilares
 * coral con remates índigo, viga superior, lona rosa/cian y banderines de
 * colores colgando del frente.
 */
function buildAwningArch(): THREE.Group {
  const arch = new THREE.Group();
  const pillarGeometry = new THREE.BoxGeometry(0.5, 4.8, 0.5);
  for (const side of [-1, 1]) {
    const pillar = celMesh(pillarGeometry, '#e07a5f', 0.018);
    pillar.position.set(2.5 * side, 2.4, 0);
    arch.add(pillar);
    const cap = celMesh(new THREE.BoxGeometry(0.72, 0.3, 0.72), '#2f3e52', 0.014);
    cap.position.set(2.5 * side, 4.95, 0);
    arch.add(cap);
  }
  const beam = celMesh(new THREE.BoxGeometry(5.6, 0.5, 0.7), '#e07a5f', 0.018);
  beam.position.y = 5.05;
  arch.add(beam);
  // Lona superior a dos aguas de colores vibrantes.
  const canvasMain = celMesh(new THREE.BoxGeometry(5.9, 0.14, 1.7), '#f472b6', 0.014);
  canvasMain.position.y = 5.4;
  arch.add(canvasMain);
  const canvasTrim = celMesh(new THREE.BoxGeometry(4.4, 0.12, 1.25), '#22d3ee', 0.012);
  canvasTrim.position.y = 5.55;
  arch.add(canvasTrim);
  // Banderines triangulares colgando del frente de la viga.
  const flagGeometry = new THREE.ConeGeometry(0.15, 0.38, 4);
  const flagColors = [0xfacc15, 0x22d3ee, 0xef4444, 0xa78bfa, 0x4ade80];
  const flagMaterials = flagColors.map((c) => new THREE.MeshBasicMaterial({ color: c }));
  for (let i = 0; i < 5; i++) {
    const flag = new THREE.Mesh(flagGeometry, flagMaterials[i]);
    flag.rotation.x = Math.PI;
    flag.position.set(-1.6 + i * 0.8, 4.62, 0.42);
    arch.add(flag);
  }
  return arch;
}

/**
 * Valla/cartel luminoso estilo cómic/neón (~5.5 m): poste metálico, panel
 * índigo profundo con marco de neón cian, estallido cómic octogonal
 * (dorado/magenta/crema) y remate esférico rosa.
 */
function buildComicBillboard(): THREE.Group {
  const billboard = new THREE.Group();
  const post = celMesh(new THREE.CylinderGeometry(0.12, 0.17, 3.2, 8), '#334155', 0.016);
  post.position.y = 1.6;
  billboard.add(post);
  const panel = celMesh(new THREE.BoxGeometry(3.2, 2.0, 0.25), '#1e1b4b', 0.02);
  panel.position.y = 4.2;
  billboard.add(panel);
  // Marco de neón cian perimetral.
  const neonMaterial = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
  const frameVGeometry = new THREE.BoxGeometry(0.08, 2.0, 0.08);
  const frameHGeometry = new THREE.BoxGeometry(3.2, 0.08, 0.08);
  for (const side of [-1, 1]) {
    const frameV = new THREE.Mesh(frameVGeometry, neonMaterial);
    frameV.position.set(1.52 * side, 4.2, 0.16);
    billboard.add(frameV);
  }
  for (const dy of [-0.96, 0.96]) {
    const frameH = new THREE.Mesh(frameHGeometry, neonMaterial);
    frameH.position.set(0, 4.2 + dy, 0.16);
    billboard.add(frameH);
  }
  // Estallido cómic: octógonos concéntricos dorado/magenta/crema.
  const burstGeometry = new THREE.CylinderGeometry(0.7, 0.7, 0.08, 8);
  const burstGold = new THREE.Mesh(burstGeometry, new THREE.MeshBasicMaterial({ color: 0xfde047 }));
  burstGold.rotation.x = Math.PI / 2;
  burstGold.position.set(-0.5, 4.35, 0.18);
  billboard.add(burstGold);
  const burstGeometryMid = new THREE.CylinderGeometry(0.48, 0.48, 0.09, 8);
  const burstMagenta = new THREE.Mesh(
    burstGeometryMid,
    new THREE.MeshBasicMaterial({ color: 0xf472b6 })
  );
  burstMagenta.rotation.x = Math.PI / 2;
  burstMagenta.position.set(-0.5, 4.35, 0.2);
  billboard.add(burstMagenta);
  const burstGeometryCore = new THREE.CylinderGeometry(0.26, 0.26, 0.1, 8);
  const burstCream = new THREE.Mesh(
    burstGeometryCore,
    new THREE.MeshBasicMaterial({ color: 0xfff7ed })
  );
  burstCream.rotation.x = Math.PI / 2;
  burstCream.position.set(-0.5, 4.35, 0.22);
  billboard.add(burstCream);
  // Barras de texto neón a la derecha del estallido.
  const barGeometry = new THREE.BoxGeometry(1, 0.18, 0.06);
  const barMagenta = new THREE.MeshBasicMaterial({ color: 0xf472b6 });
  const barCyan = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
  const barWidths = [1.4, 1.0, 1.25];
  for (let i = 0; i < barWidths.length; i++) {
    const bar = new THREE.Mesh(barGeometry, i % 2 === 0 ? barMagenta : barCyan);
    bar.scale.x = barWidths[i];
    bar.position.set(0.75, 4.55 - i * 0.36, 0.18);
    billboard.add(bar);
  }
  // Remate esférico rosa sobre el panel.
  const finial = glowMesh(new THREE.SphereGeometry(0.14, 8, 6), 0xf472b6);
  finial.position.set(0, 5.32, 0);
  billboard.add(finial);
  return billboard;
}

/**
 * Fuente circular de plaza (~5.5 m de diámetro): vasco de piedra con agua
 * cel-shaded brillante, pedestal central con taza, chorro luminoso y corona
 * de salpicaduras.
 */
function buildFountain(): THREE.Group {
  const fountain = new THREE.Group();
  const rim = celMesh(new THREE.CylinderGeometry(2.75, 2.9, 0.7, 18), '#d6d3d1', 0.02);
  rim.position.y = 0.35;
  fountain.add(rim);
  // Agua del vasco: cel-shaded cian con emisión suave (nunca negra).
  const pool = new THREE.Mesh(
    new THREE.CylinderGeometry(2.45, 2.45, 0.55, 18),
    createComicCelMaterial('#38bdf8', { emissiveBoost: 0.3, rimColor: 0x7dd3fc })
  );
  pool.position.y = 0.42;
  fountain.add(pool);
  const pedestal = celMesh(new THREE.CylinderGeometry(0.5, 0.72, 1.2, 10), '#e8d5b7', 0.016);
  pedestal.position.y = 1.1;
  fountain.add(pedestal);
  const bowl = celMesh(new THREE.CylinderGeometry(1.1, 0.68, 0.5, 12), '#d6d3d1', 0.016);
  bowl.position.y = 1.95;
  fountain.add(bowl);
  const bowlWater = new THREE.Mesh(
    new THREE.CylinderGeometry(0.92, 0.92, 0.1, 12),
    createComicCelMaterial('#7dd3fc', { emissiveBoost: 0.35, rimColor: 0x7dd3fc })
  );
  bowlWater.position.y = 2.16;
  fountain.add(bowlWater);
  // Chorro central + corona de gotas esféricas.
  const jet = glowMesh(new THREE.CylinderGeometry(0.09, 0.16, 1.0, 8), 0x7dd3fc);
  jet.position.y = 2.75;
  fountain.add(jet);
  const dropGeometry = new THREE.SphereGeometry(0.12, 8, 6);
  const dropMaterial = new THREE.MeshBasicMaterial({ color: 0xbae6fd });
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const drop = new THREE.Mesh(dropGeometry, dropMaterial);
    drop.position.set(Math.cos(angle) * 0.55, 3.15, Math.sin(angle) * 0.55);
    fountain.add(drop);
  }
  const crown = glowMesh(new THREE.SphereGeometry(0.18, 8, 6), 0xbae6fd);
  crown.position.y = 3.35;
  fountain.add(crown);
  return fountain;
}

/**
 * Construye el mesh de un prop urbano de la ciudad Sandbox por su tipo.
 */
export function buildCityPropMesh(kind: CityPropKind): THREE.Group {
  switch (kind) {
    case 'city_house':
      return buildCityHouse();
    case 'city_shop':
      return buildCityShop();
    case 'street_lamp':
      return buildStreetLamp();
    case 'bench':
      return buildBench();
    case 'market_stall':
      return buildMarketStall();
    case 'clock_tower':
      return buildClockTower();
    case 'crane':
      return buildCrane();
    case 'awning_arch':
      return buildAwningArch();
    case 'comic_billboard':
      return buildComicBillboard();
    case 'fountain':
      return buildFountain();
  }
}

// ============================================================================
// OBJETOS DEL MODO SANDBOX (monedas, orbes, anclas, retos y dianas)
// ============================================================================

/**
 * Moneda cósmica dorada: prisma hexagonal cel-shaded con emisión cálida,
 * emblema interior luminoso y destello octaédrico, con contorno de tinta.
 */
export function buildCosmicCoinMesh(): THREE.Group {
  const coin = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 0.12, 6),
    createComicCelMaterial('#fbbf24', { emissiveBoost: 0.25, rimColor: 0xfde68a })
  );
  addComicOutline(body, 0.02);
  body.rotation.x = Math.PI / 2;
  coin.add(body);
  const emblem = glowMesh(new THREE.CylinderGeometry(0.3, 0.3, 0.14, 6), 0xfde68a);
  emblem.rotation.x = Math.PI / 2;
  coin.add(emblem);
  const sparkle = glowMesh(new THREE.OctahedronGeometry(0.12), 0xfff7ed);
  sparkle.scale.set(1, 1.4, 0.6);
  sparkle.position.z = 0.1;
  coin.add(sparkle);
  return coin;
}

/**
 * Orbe Estrella dorado/cian: núcleo esférico cel-shaded con emisión, dos
 * picos de diamante cruzados y halo orbital cian inclinado con satélite.
 */
export function buildStarOrbMesh(): THREE.Group {
  const orb = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 12, 10),
    createComicCelMaterial('#fbbf24', { emissiveBoost: 0.3, rimColor: 0xfde68a })
  );
  addComicOutline(core, 0.02);
  orb.add(core);
  const spikeGeometry = new THREE.OctahedronGeometry(0.55);
  const spikeMaterial = new THREE.MeshBasicMaterial({ color: 0xfde68a });
  for (const rotationZ of [0, Math.PI / 2]) {
    const spike = new THREE.Mesh(spikeGeometry, spikeMaterial);
    spike.scale.set(0.32, 1.35, 0.32);
    spike.rotation.z = rotationZ;
    orb.add(spike);
  }
  const halo = glowMesh(new THREE.TorusGeometry(0.78, 0.05, 8, 24), 0x22d3ee);
  halo.rotation.x = 1.1;
  const satellite = glowMesh(new THREE.SphereGeometry(0.09, 8, 6), 0x7dd3fc);
  satellite.position.set(0.78, 0, 0);
  halo.add(satellite);
  orb.add(halo);
  return orb;
}

/**
 * Esfera de ancla gravitatoria flotante: núcleo brillante cian/violeta con
 * contorno de tinta y dos aros cruzados (uno horizontal, otro vertical).
 */
export function buildAnchorSphereMesh(color?: string): THREE.Group {
  const anchor = new THREE.Group();
  const coreColor = color ?? '#22d3ee';
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 14, 12),
    createComicCelMaterial(coreColor, {
      emissiveBoost: 0.35,
      rimColor: 0xa78bfa,
      rimStrength: 0.7,
    })
  );
  addComicOutline(core, 0.02);
  anchor.add(core);
  const ringGeometry = new THREE.TorusGeometry(0.68, 0.045, 8, 24);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xa78bfa });
  const ringH = new THREE.Mesh(ringGeometry, ringMaterial);
  ringH.rotation.x = Math.PI / 2;
  anchor.add(ringH);
  const ringV = new THREE.Mesh(ringGeometry, ringMaterial);
  anchor.add(ringV);
  return anchor;
}

/**
 * Aro gigante luminoso de carrera contrarreloj (radio ~2.8 m): toro cian
 * autoiluminado con contorno de tinta, halo aditivo y 4 balizas doradas
 * en los puntos cardinales.
 */
export function buildRaceRingMesh(): THREE.Group {
  const ring = new THREE.Group();
  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(2.8, 0.18, 10, 28),
    new THREE.MeshBasicMaterial({ color: 0x22d3ee })
  );
  addComicOutline(torus, 0.03);
  ring.add(torus);
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(2.8, 0.34, 8, 24),
    new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  ring.add(halo);
  const beaconGeometry = new THREE.SphereGeometry(0.22, 8, 6);
  const beaconMaterial = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
  for (const [bx, by] of [
    [2.8, 0],
    [-2.8, 0],
    [0, 2.8],
    [0, -2.8],
  ]) {
    const beacon = new THREE.Mesh(beaconGeometry, beaconMaterial);
    beacon.position.set(bx, by, 0);
    ring.add(beacon);
  }
  return ring;
}

/**
 * Pedestal/tótem de micro-reto del Sandbox: base metálica, columna coral con
 * remate índigo, haz vertical aditivo suave e icono flotante según el tipo
 * (aro cian para carreras, diana roja/blanca para objetivos).
 */
export function buildChallengeTotemMesh(kind: 'race' | 'targets'): THREE.Group {
  const totem = new THREE.Group();
  const base = celMesh(new THREE.CylinderGeometry(0.5, 0.65, 0.4, 10), '#334155', 0.016);
  base.position.y = 0.2;
  totem.add(base);
  const column = celMesh(new THREE.CylinderGeometry(0.18, 0.24, 1.6, 8), '#e07a5f', 0.014);
  column.position.y = 1.2;
  totem.add(column);
  const cap = celMesh(new THREE.CylinderGeometry(0.3, 0.3, 0.15, 8), '#2f3e52', 0.012);
  cap.position.y = 2.05;
  totem.add(cap);
  // Haz vertical suave (aditivo, sin escritura de profundidad).
  const beamColor = kind === 'race' ? 0x22d3ee : 0xf472b6;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.5, 5.0, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color: beamColor,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  beam.position.y = 4.6;
  totem.add(beam);
  // Icono flotante según el reto.
  if (kind === 'race') {
    const icon = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.09, 8, 20),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee })
    );
    addComicOutline(icon, 0.016);
    icon.position.y = 2.85;
    totem.add(icon);
  } else {
    const disc = glowMesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 16), 0xfff7ed);
    disc.rotation.x = Math.PI / 2;
    disc.position.y = 2.85;
    totem.add(disc);
    const ringIcon = new THREE.Mesh(
      new THREE.TorusGeometry(0.26, 0.08, 8, 16),
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    ringIcon.position.y = 2.85;
    totem.add(ringIcon);
    const center = glowMesh(new THREE.SphereGeometry(0.1, 8, 6), 0xef4444);
    center.position.y = 2.85;
    totem.add(center);
  }
  return totem;
}

/**
 * Diana cómic flotante para retos de Estasis: discos concéntricos crema y
 * rojo con contornos de tinta negra, orientada al eje Z.
 */
export function buildTargetDummyMesh(): THREE.Group {
  const target = new THREE.Group();
  const outer = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 0.95, 0.1, 20),
    createComicCelMaterial('#fef3c7', { rimColor: 0xffd166 })
  );
  addComicOutline(outer, 0.02);
  outer.rotation.x = Math.PI / 2;
  outer.position.y = 1.6;
  target.add(outer);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.66, 0.17, 8, 20),
    createComicCelMaterial('#ef4444', { rimColor: 0xfca5a5 })
  );
  addComicOutline(ring, 0.02);
  ring.position.y = 1.6;
  target.add(ring);
  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.38, 0.12, 16),
    createComicCelMaterial('#fef3c7', { rimColor: 0xffd166 })
  );
  addComicOutline(inner, 0.016);
  inner.rotation.x = Math.PI / 2;
  inner.position.y = 1.6;
  target.add(inner);
  const bullseye = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 0.14, 12),
    createComicCelMaterial('#ef4444', { emissiveBoost: 0.2, rimColor: 0xfca5a5 })
  );
  addComicOutline(bullseye, 0.014);
  bullseye.rotation.x = Math.PI / 2;
  bullseye.position.y = 1.6;
  target.add(bullseye);
  return target;
}
