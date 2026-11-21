import * as THREE from 'three';

// ============================================================================
// Hekseville 1:1 — Atlas de arquitectura de cómic (16 tiles 512×512 sin costuras)
//
// Los chunks `.glb` de Hekseville llegan sin texturas bitmap, así que la ciudad
// se viste con dieciséis tiles dibujados a mano en canvas 2D que reproducen el
// arte de `referencias y base/pleajeune_tex_concept.jpg`. Cada tile tiene una
// identidad propia y una escala natural pensada para el cuerpo de 1.8 m de
// Kitsune: adoquín fino de abanico, mármol de plaza, losa de bulevar, ladrillo
// de patio, sillería de contención, bóveda artesonada, viga remachada, tres
// fachadas de casa, dos escaparates, dos tejados y dos texturas de árbol.
//
// Por qué canvas y no `step( fract( worldPos ) )` en el shader: los patrones
// procedurales con escalones duros aliasean de forma brutal en ángulos
// rasantes y a distancia (el "papel cuadriculado" que parpadea). Una textura
// con `generateMipmaps` + `LinearMipmapLinearFilter` + anisotropía 8 deja que
// el hardware filtre correctamente: cero flicker, cero rejilla de 1 m.
//
// Cada tile es TESELABLE: toda figura que cruza un borde se dibuja también
// desplazada en `dx ∈ {-512, 0, +512}` y `dy ∈ {-512, 0, +512}`, así el
// `RepeatWrapping` no muestra costura ni en horizontal ni en vertical.
//
// Presupuesto de unidades de textura: WebGL garantiza 16 `sampler2D` por
// shader. Cada bucket de `heksevilleChunkMaterials.ts` enlaza SOLO las 1-7
// texturas que usa (suelo 5, muros 7, tejado 2, risco 2, metal 1, rótulos 1,
// follaje 2), así que ningún draw call pasa de 7 unidades: 100 % seguro en
// WebGL2 y en móvil.
//
// El bundle se libera con `dispose()` (una llamada, dieciséis texturas).
// ============================================================================

/** Lado en píxeles de cada tile del atlas de arquitectura. */
export const HEKSEVILLE_ARCH_TILE_SIZE = 512;

/**
 * Bundle de texturas de arquitectura de Hekseville. En navegador cada campo es
 * un `THREE.CanvasTexture` 512×512 con mipmaps; en entornos sin `document`
 * (SSR, tests) se sustituye por un `DataTexture` de 1×1 con el color base del
 * tile para que los shaders siempre tengan una textura válida.
 */
export interface HeksevilleArchTextures {
  /** 1 · Adoquín fino de abanico, arenisca beis y gris (~0.36 m por piedra). */
  cobbleFine: THREE.Texture;
  /** 2 · Travertino soleado con cenefa diagonal y rosetones de plaza. */
  plazaMarble: THREE.Texture;
  /** 3 · Losa de pizarra de bulevar con bandas de crema y juntas de drenaje. */
  avenueSlate: THREE.Texture;
  /** 4 · Ladrillo terracota de patio en damero, con musgo en las juntas. */
  parkBrick: THREE.Texture;
  /** 5 · Sillería tallada de muro de contención con musgo y enredadera. */
  cliffMasonry: THREE.Texture;
  /** 6 · Bóveda artesonada oscura con nervios de arco (techos vistos desde abajo). */
  underVault: THREE.Texture;
  /** 7 · Viga de hierro remachada con placas de arriostramiento y pernos de bronce. */
  metalGirder: THREE.Texture;
  /** 8 · Estuco marfil, ladrillo de esquina y ventanas arqueadas con contraventanas salvia. */
  houseStucco: THREE.Texture;
  /** 9 · Casa entramada: yeso crema y vigas de roble oscuro con ventanas doradas. */
  houseTimber: THREE.Texture;
  /** 10 · Fachada de ladrillo salmón con dinteles de piedra y contraventanas azul-teja. */
  houseBrick: THREE.Texture;
  /** 11 · Panadería: toldo a rayas coral y crema, roble y escaparate ámbar. */
  shopBakery: THREE.Texture;
  /** 12 · Boutique: toldo menta y crema, arcos con latón y cornisa tallada. */
  shopBoutique: THREE.Texture;
  /** 13 · Teja curva de barro terracota y ocre con desgaste. */
  roofTiles: THREE.Texture;
  /** 14 · Teja plana de pizarra teja y cobre verdigris. */
  roofSlate: THREE.Texture;
  /** 15 · Corteza de árbol: surcos verticales de cómic. */
  treeBark: THREE.Texture;
  /** 16 · Copa de hojas estilizadas (clara, para tintar en el shader). */
  treeLeaves: THREE.Texture;
  dispose: () => void;
}

type Ctx = CanvasRenderingContext2D;

const TILE = HEKSEVILLE_ARCH_TILE_SIZE;

// ----------------------------------------------------------------------------
// Utilidades de dibujo
// ----------------------------------------------------------------------------

/** PRNG determinista (mulberry32): cada tile se pinta idéntico en cada carga. */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Ejecuta `draw` nueve veces desplazado en la rejilla 3×3 de offsets
 * `{-512, 0, +512}`: cualquier figura que cruce un borde queda dibujada en el
 * lado opuesto y el tile tesela sin costura.
 */
function drawWrapped(ctx: Ctx, draw: () => void): void {
  for (let dx = -TILE; dx <= TILE; dx += TILE) {
    for (let dy = -TILE; dy <= TILE; dy += TILE) {
      ctx.save();
      ctx.translate(dx, dy);
      draw();
      ctx.restore();
    }
  }
}

/** Traza un polígono cerrado con curvas suaves (piedras y tejas orgánicas). */
function smoothClosedPath(ctx: Ctx, pts: ReadonlyArray<readonly [number, number]>): void {
  const n = pts.length;
  if (n < 3) return;
  const midX = (a: readonly [number, number], b: readonly [number, number]) => (a[0] + b[0]) * 0.5;
  const midY = (a: readonly [number, number], b: readonly [number, number]) => (a[1] + b[1]) * 0.5;
  ctx.beginPath();
  ctx.moveTo(midX(pts[n - 1], pts[0]), midY(pts[n - 1], pts[0]));
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const next = pts[(i + 1) % n];
    ctx.quadraticCurveTo(p[0], p[1], midX(p, next), midY(p, next));
  }
  ctx.closePath();
}

/** Línea con temblor de pincel: el trazo nunca es mecánicamente recto. */
function wobblyLine(
  ctx: Ctx,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  amp = 1.4,
  segments = 10
): void {
  const nx = -(y2 - y1);
  const ny = x2 - x1;
  const len = Math.hypot(nx, ny) || 1;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const off = Math.sin(t * Math.PI * 3.1 + x1 * 0.05 + y1 * 0.03) * amp;
    ctx.lineTo(
      x1 + (x2 - x1) * t + (nx / len) * off,
      y1 + (y2 - y1) * t + (ny / len) * off
    );
  }
  ctx.stroke();
}

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbCss(r: number, g: number, b: number, alpha = 1): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `rgba(${clamp(r)}, ${clamp(g)}, ${clamp(b)}, ${alpha})`;
}

/** Aclara u oscurece un hex manteniendo su temperatura de color. */
function shadeHex(hex: string, factor: number, alpha = 1): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbCss(r * factor, g * factor, b * factor, alpha);
}

/** Trama de puntos halftone (impresión cómic). `step` debe dividir 512. */
function drawHalftone(ctx: Ctx, color: string, step: number, radius: number, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let y = step * 0.5; y < TILE; y += step) {
    const offset = (Math.round(y / step) % 2) * step * 0.5;
    for (let x = step * 0.5 + offset; x < TILE; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Nube suave de pigmento (estuco, caliza, pátina) que tesela sin costura. */
function paintSoftBlotch(
  ctx: Ctx,
  x: number,
  y: number,
  radius: number,
  inner: string,
  outer: string
): void {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  drawWrapped(ctx, () => {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Contorno de arco de medio punto sobre un rectángulo (ventana/arco ciego). */
function archPath(ctx: Ctx, cx: number, top: number, w: number, h: number): void {
  const r = w * 0.5;
  ctx.beginPath();
  ctx.moveTo(cx - r, top + h);
  ctx.lineTo(cx - r, top + r);
  ctx.arc(cx, top + r, r, Math.PI, 0, false);
  ctx.lineTo(cx + r, top + h);
  ctx.closePath();
}

// ----------------------------------------------------------------------------
// 1. cobbleFine — adoquín fino de abanico (opus arcuatum), ~0.36 m por piedra
//
// El bug anterior: `paintCobble` dibujaba losas ovaladas de 1.5 m y el MISMO
// patrón aparecía en calles, plazas, vigas y techos. Aquí las piedras miden
// 44×38 px ≈ 0.36×0.31 m (a 122 px/m), se agrupan en abanicos concéntricos de
// 256×128 px (2.1×1.05 m) y alternan arenisca beis cálida con gris piedra.
// ----------------------------------------------------------------------------

const COBBLE_COLORS = [
  '#d9c8ab',
  '#cbb894',
  '#e2d3b8',
  '#c9b79b',
  '#bfae95',
  '#d3c3a6',
  '#c2b49c',
  '#dccdb2',
  '#b9a88f',
  '#cfc0a6',
  '#b6b1a4',
  '#a9a49a',
];

interface SmallStone {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rot: number;
  color: string;
  wobble: number[];
}

function paintSmallStone(ctx: Ctx, stone: SmallStone): void {
  const pts: Array<[number, number]> = [];
  const n = stone.wobble.length;
  const cos = Math.cos(stone.rot);
  const sin = Math.sin(stone.rot);
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    const k = 1 + (stone.wobble[i] - 0.5) * 0.16;
    const lx = Math.cos(angle) * stone.rx * k;
    const ly = Math.sin(angle) * stone.ry * k;
    pts.push([stone.cx + lx * cos - ly * sin, stone.cy + lx * sin + ly * cos]);
  }

  smoothClosedPath(ctx, pts);
  ctx.fillStyle = stone.color;
  ctx.fill();

  // Volumen pintado a mano: luz arriba-izquierda, sombra abajo-derecha.
  ctx.save();
  ctx.clip();
  const gradient = ctx.createLinearGradient(
    stone.cx - stone.rx,
    stone.cy - stone.ry,
    stone.cx + stone.rx,
    stone.cy + stone.ry
  );
  gradient.addColorStop(0, 'rgba(255, 250, 238, 0.34)');
  gradient.addColorStop(0.55, 'rgba(255, 250, 238, 0.03)');
  gradient.addColorStop(1, 'rgba(96, 68, 46, 0.24)');
  ctx.fillStyle = gradient;
  ctx.fillRect(
    stone.cx - stone.rx * 1.7,
    stone.cy - stone.ry * 1.7,
    stone.rx * 3.4,
    stone.ry * 3.4
  );
  ctx.restore();

  // Junta entintada a mano (marrón cálido, nunca negro).
  smoothClosedPath(ctx, pts);
  ctx.lineWidth = 1.9;
  ctx.strokeStyle = 'rgba(84, 60, 42, 0.62)';
  ctx.stroke();
}

/** Abanico concéntrico de adoquines: 3 anillos de piedras sobre media luna. */
function paintCobbleFan(ctx: Ctx, cx: number, cy: number, rng: () => number): void {
  const rings = 3;
  const maxR = 128;
  for (let k = 0; k < rings; k++) {
    const r = (maxR * (k + 1)) / rings;
    const count = Math.max(3, Math.round((Math.PI * r) / 44));
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const ang = Math.PI + t * Math.PI;
      const wobble: number[] = [];
      for (let w = 0; w < 8; w++) wobble.push(rng());
      paintSmallStone(ctx, {
        cx: cx + Math.cos(ang) * r,
        cy: cy + Math.sin(ang) * r,
        rx: 22 + rng() * 3,
        ry: 19 + rng() * 3,
        rot: ang + Math.PI * 0.5 + (rng() - 0.5) * 0.18,
        color: COBBLE_COLORS[Math.floor(rng() * COBBLE_COLORS.length)],
        wobble,
      });
    }
  }
}

function paintCobbleFine(ctx: Ctx): void {
  const rng = createRng(0x0c0bb1e5);

  // Lecho de mortero cálido: solo se ve como junta fina entre piedras.
  ctx.fillStyle = '#8a7159';
  ctx.fillRect(0, 0, TILE, TILE);
  for (let i = 0; i < 18; i++) {
    paintSoftBlotch(
      ctx,
      rng() * TILE,
      rng() * TILE,
      50 + rng() * 110,
      'rgba(150, 122, 92, 0.45)',
      'rgba(150, 122, 92, 0)'
    );
  }

  // Rejilla de abanicos 256×128: ambos lados dividen 512, así el patrón tesela
  // exacto y las filas impares se escalonan media anchura (opus arcuatum).
  const FAN_W = 256;
  const FAN_H = 128;
  for (let ry = -1; ry <= 5; ry++) {
    const cy = ry * FAN_H;
    const offset = (((ry % 2) + 2) % 2) * FAN_W * 0.5;
    for (let rx = -1; rx <= 3; rx++) {
      paintCobbleFan(ctx, rx * FAN_W + offset, cy, rng);
    }
  }

  // Grano de impresión cómic muy tenue sobre toda la calzada.
  drawHalftone(ctx, '#6b4f38', 16, 1.5, 0.05);
}

// ----------------------------------------------------------------------------
// 2. plazaMarble — travertino soleado, cenefa diagonal y rosetones de plaza
// ----------------------------------------------------------------------------

/** Veta horizontal de travertino: línea ondulada muy tenue dentro de la losa. */
function paintTravertineVein(ctx: Ctx, x: number, y: number, w: number, rng: () => number): void {
  ctx.strokeStyle = `rgba(196, 176, 146, ${0.16 + rng() * 0.14})`;
  ctx.lineWidth = 1 + rng() * 1.4;
  wobblyLine(ctx, x + 4, y, x + w - 4, y, 1.6, 12);
}

function paintRosette(ctx: Ctx, cx: number, cy: number, r: number): void {
  // Disco de piedra clara.
  const disc = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
  disc.addColorStop(0, '#fbf3e2');
  disc.addColorStop(1, '#e2d2b4');
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Pétalos radiales en terracota y ocre.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.fillStyle = i % 2 === 0 ? '#c98a5e' : '#d9a86e';
    ctx.beginPath();
    ctx.ellipse(
      cx + Math.cos(a) * r * 0.52,
      cy + Math.sin(a) * r * 0.52,
      r * 0.3,
      r * 0.17,
      a,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  // Corazón y aro de tinta.
  ctx.fillStyle = '#b06a44';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120, 92, 62, 0.8)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
  ctx.stroke();
}

function paintPlazaMarble(ctx: Ctx): void {
  const rng = createRng(0x91a2b3c4);

  // Losa base de travertino cálido.
  ctx.fillStyle = '#efe3cd';
  ctx.fillRect(0, 0, TILE, TILE);

  // 4×4 losas de 128 px (1.05 m) con veta horizontal y junta fina.
  const slab = 128;
  for (let r = 0; r < TILE / slab; r++) {
    for (let c = 0; c < TILE / slab; c++) {
      const x = c * slab;
      const y = r * slab;
      ctx.fillStyle = shadeHex('#efe3cd', 0.95 + rng() * 0.1);
      ctx.fillRect(x + 1, y + 1, slab - 2, slab - 2);
      for (let v = 0; v < 5; v++) {
        paintTravertineVein(ctx, x + 6, y + 14 + v * 24 + rng() * 8, slab - 12, rng);
      }
      ctx.strokeStyle = 'rgba(178, 156, 124, 0.55)';
      ctx.lineWidth = 1.8;
      ctx.strokeRect(x + 1, y + 1, slab - 2, slab - 2);
    }
  }

  // Cenefa diagonal de incrustación: banda de terracota con rombos de crema.
  drawWrapped(ctx, () => {
    ctx.save();
    ctx.rotate(Math.PI * 0.25);
    const bandW = 46;
    const grad = ctx.createLinearGradient(0, -bandW * 0.5, 0, bandW * 0.5);
    grad.addColorStop(0, '#c98a5e');
    grad.addColorStop(0.5, '#d9a86e');
    grad.addColorStop(1, '#b06a44');
    ctx.fillStyle = grad;
    ctx.fillRect(-TILE, -bandW * 0.5, TILE * 3, bandW);
    // Rombos de crema incrustados a lo largo de la banda.
    ctx.fillStyle = '#f7ecd6';
    for (let x = -TILE; x < TILE * 2; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 22, 0);
      ctx.lineTo(x + 11, -bandW * 0.34);
      ctx.lineTo(x + 11, bandW * 0.34);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(120, 88, 58, 0.7)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-TILE, -bandW * 0.5);
    ctx.lineTo(TILE * 2, -bandW * 0.5);
    ctx.moveTo(-TILE, bandW * 0.5);
    ctx.lineTo(TILE * 2, bandW * 0.5);
    ctx.stroke();
    ctx.restore();
  });

  // Rosetones en las cuatro esquinas (al teselar forman uno por cruce).
  for (const [rx, ry] of [
    [0, 0],
    [TILE, 0],
    [0, TILE],
    [TILE, TILE],
  ] as const) {
    drawWrapped(ctx, () => paintRosette(ctx, rx, ry, 46));
  }

  drawHalftone(ctx, '#a08a68', 8, 1.2, 0.05);
}

// ----------------------------------------------------------------------------
// 3. avenueSlate — losa de pizarra de bulevar con bandas de crema y drenajes
// ----------------------------------------------------------------------------

function paintAvenueSlate(ctx: Ctx): void {
  const rng = createRng(0x51a7e001);

  // Lecho de arena fría.
  ctx.fillStyle = '#3f4854';
  ctx.fillRect(0, 0, TILE, TILE);

  const rowH = 64;
  const colW = 128;
  for (let r = 0; r < TILE / rowH; r++) {
    const y = r * rowH;
    // Cada cuatro hiladas, una banda de piedra crema: la cenefa del bulevar.
    const isBand = r % 4 === 3;
    const offset = (r % 2) * colW * 0.5;
    for (let c = -1; c <= TILE / colW; c++) {
      const x = c * colW + offset;
      const base = isBand ? '#cfc3a8' : '#5a6472';
      ctx.fillStyle = shadeHex(base, 0.92 + rng() * 0.16);
      ctx.fillRect(x + 2, y + 2, colW - 4, rowH - 4);

      // Veta de pizarra: estrías horizontales finísimas.
      ctx.strokeStyle = isBand ? 'rgba(150, 136, 108, 0.35)' : 'rgba(30, 36, 46, 0.35)';
      ctx.lineWidth = 1.2;
      for (let v = 0; v < 3; v++) {
        wobblyLine(ctx, x + 8, y + 12 + v * 16 + rng() * 6, x + colW - 8, y + 12 + v * 16 + rng() * 6, 1.2, 10);
      }

      // Canto biselado: luz arriba, sombra abajo.
      ctx.strokeStyle = isBand ? 'rgba(255, 250, 236, 0.5)' : 'rgba(150, 168, 190, 0.32)';
      ctx.lineWidth = 1.6;
      wobblyLine(ctx, x + 3, y + 3, x + colW - 3, y + 3, 0.8, 12);
      ctx.strokeStyle = 'rgba(18, 22, 30, 0.55)';
      wobblyLine(ctx, x + 3, y + rowH - 3, x + colW - 3, y + rowH - 3, 0.8, 12);

      ctx.strokeStyle = 'rgba(24, 30, 40, 0.7)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, colW - 4, rowH - 4);
    }
  }

  // Juntas de drenaje: rejillas circulares en los cruces de la banda crema.
  for (let r = 3; r < TILE / rowH; r += 4) {
    const y = r * rowH + rowH * 0.5;
    for (let x = 32; x < TILE; x += 128) {
      drawWrapped(ctx, () => {
        ctx.fillStyle = '#2b323c';
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(190, 200, 214, 0.55)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(150, 162, 178, 0.5)';
        ctx.lineWidth = 1.2;
        for (let s = -1; s <= 1; s++) {
          ctx.beginPath();
          ctx.moveTo(x - 6, y + s * 3.4);
          ctx.lineTo(x + 6, y + s * 3.4);
          ctx.stroke();
        }
      });
    }
  }

  drawHalftone(ctx, '#1c222c', 8, 1.3, 0.07);
}

// ----------------------------------------------------------------------------
// 4. parkBrick — ladrillo terracota de patio en damero (basket weave) con musgo
//
// Nota de tessellation: el damero 2×2 de ladrillos horizontales alternado con
// bloques 2×2 de ladrillos verticales tiene periodo 4W × 4W. Con W = 32 px el
// periodo es 128 px, que divide 512 exacto: tesela sin costura y sin el
// "ladrillo imposible" que dejaría huecos.
// ----------------------------------------------------------------------------

const PARK_BRICK_COLORS = ['#b5613f', '#c47048', '#a85636', '#bd6b45', '#9e5030', '#c97a52'];

function paintParkBrick(ctx: Ctx): void {
  const rng = createRng(0x7b21c0de);

  // Junta de mortero con musgo.
  ctx.fillStyle = '#6d6a4e';
  ctx.fillRect(0, 0, TILE, TILE);
  for (let i = 0; i < 22; i++) {
    paintSoftBlotch(
      ctx,
      rng() * TILE,
      rng() * TILE,
      30 + rng() * 70,
      'rgba(104, 122, 74, 0.5)',
      'rgba(104, 122, 74, 0)'
    );
  }

  const W = 32;
  const block = W * 2; // 64 px: bloque 2×2 de ladrillos
  const brick = (x: number, y: number, w: number, h: number) => {
    const color = PARK_BRICK_COLORS[Math.floor(rng() * PARK_BRICK_COLORS.length)];
    ctx.fillStyle = shadeHex(color, 0.92 + rng() * 0.16);
    ctx.fillRect(x + 1.5, y + 1.5, w - 3, h - 3);

    // Volumen: canto superior iluminado, inferior en sombra.
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, 'rgba(255, 236, 214, 0.26)');
    grad.addColorStop(0.6, 'rgba(255, 236, 214, 0.02)');
    grad.addColorStop(1, 'rgba(58, 30, 18, 0.3)');
    ctx.fillStyle = grad;
    ctx.fillRect(x + 1.5, y + 1.5, w - 3, h - 3);

    // Grano y desgaste del barro cocido.
    ctx.strokeStyle = 'rgba(96, 48, 28, 0.28)';
    ctx.lineWidth = 1;
    for (let g = 0; g < 2; g++) {
      const gy = y + 6 + rng() * (h - 12);
      wobblyLine(ctx, x + 4, gy, x + w - 4, gy, 0.9, 5);
    }

    ctx.strokeStyle = 'rgba(58, 30, 18, 0.72)';
    ctx.lineWidth = 1.8;
    ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  };

  for (let by = 0; by < TILE; by += block) {
    for (let bx = 0; bx < TILE; bx += block) {
      const horizontal = ((bx / block + by / block) % 2) === 0;
      if (horizontal) {
        // Dos ladrillos horizontales apilados.
        brick(bx, by, block, W);
        brick(bx, by + W, block, W);
      } else {
        // Dos ladrillos verticales en paralelo.
        brick(bx, by, W, block);
        brick(bx + W, by, W, block);
      }
    }
  }

  // Musgo en las juntas: manchas verdes que trepan por los cantos.
  for (let i = 0; i < 26; i++) {
    const x = rng() * TILE;
    const y = rng() * TILE;
    ctx.fillStyle = `rgba(96, 122, 66, ${0.16 + rng() * 0.22})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 6 + rng() * 16, 3 + rng() * 7, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  drawHalftone(ctx, '#4a2a18', 8, 1.3, 0.06);
}

// ----------------------------------------------------------------------------
// 5. cliffMasonry — sillería tallada de muro de contención con musgo
// ----------------------------------------------------------------------------

function paintCliffMasonry(ctx: Ctx): void {
  const rng = createRng(0xc11ff00d);

  // Mortero de cal gris.
  ctx.fillStyle = '#6f6555';
  ctx.fillRect(0, 0, TILE, TILE);

  const courseH = 128;
  const blockW = 128;
  for (let r = 0; r < TILE / courseH; r++) {
    const offset = (r % 2) * blockW * 0.5;
    for (let c = -1; c <= TILE / blockW; c++) {
      const x = c * blockW + offset;
      const y = r * courseH;
      const tone = 0.9 + rng() * 0.2;
      const base = rng() > 0.55 ? '#a89a86' : '#9b8d79';

      // Sillar con esquinas ligeramente irregulares (piedra tallada a mano).
      const inset = 3;
      ctx.fillStyle = shadeHex(base, tone);
      ctx.beginPath();
      ctx.moveTo(x + inset + rng() * 3, y + inset + rng() * 3);
      ctx.lineTo(x + blockW - inset - rng() * 3, y + inset + rng() * 3);
      ctx.lineTo(x + blockW - inset - rng() * 3, y + courseH - inset - rng() * 3);
      ctx.lineTo(x + inset + rng() * 3, y + courseH - inset - rng() * 3);
      ctx.closePath();
      ctx.fill();

      // Bisel cincelado: filo claro arriba-izquierda, sombra abajo-derecha.
      ctx.strokeStyle = 'rgba(255, 248, 232, 0.42)';
      ctx.lineWidth = 3;
      wobblyLine(ctx, x + inset + 2, y + inset + 2, x + blockW - inset - 2, y + inset + 2, 1.2, 14);
      wobblyLine(ctx, x + inset + 2, y + inset + 2, x + inset + 2, y + courseH - inset - 2, 1.2, 14);
      ctx.strokeStyle = 'rgba(52, 44, 34, 0.5)';
      wobblyLine(ctx, x + inset + 2, y + courseH - inset - 2, x + blockW - inset - 2, y + courseH - inset - 2, 1.2, 14);
      wobblyLine(ctx, x + blockW - inset - 2, y + inset + 2, x + blockW - inset - 2, y + courseH - inset - 2, 1.2, 14);

      // Picado de la piedra: pequeños golpes de cincel.
      ctx.fillStyle = 'rgba(120, 108, 90, 0.28)';
      for (let p = 0; p < 14; p++) {
        ctx.beginPath();
        ctx.arc(x + 12 + rng() * (blockW - 24), y + 12 + rng() * (courseH - 24), 1.4 + rng() * 2.4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = 'rgba(58, 50, 38, 0.6)';
      ctx.lineWidth = 2.2;
      ctx.strokeRect(x + inset, y + inset, blockW - inset * 2, courseH - inset * 2);
    }
  }

  // Enredadera y musgo que trepa por las juntas.
  for (let i = 0; i < 20; i++) {
    paintSoftBlotch(
      ctx,
      rng() * TILE,
      rng() * TILE,
      26 + rng() * 54,
      'rgba(92, 122, 70, 0.42)',
      'rgba(92, 122, 70, 0)'
    );
  }
  ctx.strokeStyle = 'rgba(74, 104, 58, 0.75)';
  ctx.lineWidth = 2.4;
  for (let i = 0; i < 7; i++) {
    const x = rng() * TILE;
    const y = rng() * TILE;
    ctx.beginPath();
    ctx.moveTo(x, y);
    let cx = x;
    let cy = y;
    for (let s = 0; s < 5; s++) {
      cx += (rng() - 0.5) * 34;
      cy += 14 + rng() * 22;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
    // Hojas de la enredadera.
    ctx.fillStyle = 'rgba(96, 138, 72, 0.8)';
    for (let l = 0; l < 6; l++) {
      ctx.beginPath();
      ctx.ellipse(x + (rng() - 0.5) * 60, y + rng() * 90, 5, 3, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawHalftone(ctx, '#3e3628', 8, 1.4, 0.07);
}

// ----------------------------------------------------------------------------
// 6. underVault — bóveda artesonada oscura con nervios de arco
//
// Este tile es el que arregla el techo de `media_1795274815493_1a5abb9c.jpg`:
// el shader lo elige en cuanto la cara mira hacia abajo (`N.y < -0.35`) o se ve
// por detrás (`!gl_FrontFacing`), así un techo NUNCA muestra adoquines
// boca abajo.
// ----------------------------------------------------------------------------

function paintCoffer(ctx: Ctx, x: number, y: number, size: number): void {
  const inset = 12;
  const inner = size - inset * 2;

  // Marco de piedra con bisel.
  const frame = ctx.createLinearGradient(x, y, x + size, y + size);
  frame.addColorStop(0, '#4a5265');
  frame.addColorStop(0.5, '#3a4152');
  frame.addColorStop(1, '#2b3140');
  ctx.fillStyle = frame;
  ctx.fillRect(x, y, size, size);

  // Artesa rehundida: degradado radial oscuro hacia el centro.
  const well = ctx.createRadialGradient(
    x + size * 0.5,
    y + size * 0.5,
    inner * 0.1,
    x + size * 0.5,
    y + size * 0.5,
    inner * 0.78
  );
  well.addColorStop(0, '#1b2030');
  well.addColorStop(0.7, '#252b3a');
  well.addColorStop(1, '#333a4b');
  ctx.fillStyle = well;
  ctx.fillRect(x + inset, y + inset, inner, inner);

  // Bisel: filo claro arriba-izquierda, sombra abajo-derecha.
  ctx.strokeStyle = 'rgba(150, 168, 196, 0.4)';
  ctx.lineWidth = 2.6;
  wobblyLine(ctx, x + inset, y + inset, x + size - inset, y + inset, 1, 10);
  wobblyLine(ctx, x + inset, y + inset, x + inset, y + size - inset, 1, 10);
  ctx.strokeStyle = 'rgba(10, 14, 22, 0.75)';
  wobblyLine(ctx, x + inset, y + size - inset, x + size - inset, y + size - inset, 1, 10);
  wobblyLine(ctx, x + size - inset, y + inset, x + size - inset, y + size - inset, 1, 10);

  // Rosetón tallado en el centro del artesón.
  ctx.strokeStyle = 'rgba(120, 138, 168, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + size * 0.5, y + size * 0.5, inner * 0.26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(96, 112, 142, 0.4)';
  ctx.beginPath();
  ctx.arc(x + size * 0.5, y + size * 0.5, inner * 0.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(8, 12, 20, 0.8)';
  ctx.lineWidth = 2.4;
  ctx.strokeRect(x, y, size, size);
}

function paintUnderVault(ctx: Ctx): void {
  const rng = createRng(0x0de2a7b1);

  // Piedra de bóveda: azul-grafito profundo.
  ctx.fillStyle = '#2b3140';
  ctx.fillRect(0, 0, TILE, TILE);

  // 4×4 artesones de 128 px.
  const size = 128;
  for (let r = 0; r < TILE / size; r++) {
    for (let c = 0; c < TILE / size; c++) {
      paintCoffer(ctx, c * size, r * size, size);
    }
  }

  // Nervio de arco horizontal: dovelas en abanico que cruzan el tile.
  const ribY = 256;
  const ribH = 56;
  for (let i = 0; i < 16; i++) {
    const x = i * 32;
    const tone = 0.86 + rng() * 0.24;
    ctx.fillStyle = shadeHex('#4d566c', tone);
    ctx.beginPath();
    ctx.moveTo(x + 1, ribY);
    ctx.lineTo(x + 31, ribY);
    ctx.lineTo(x + 31, ribY + ribH);
    ctx.lineTo(x + 1, ribY + ribH);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(12, 16, 26, 0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Bisel de la dovela.
    ctx.strokeStyle = 'rgba(160, 178, 206, 0.32)';
    ctx.lineWidth = 1.8;
    wobblyLine(ctx, x + 3, ribY + 3, x + 29, ribY + 3, 0.8, 4);
  }
  // Sombra proyectada bajo el nervio.
  const shade = ctx.createLinearGradient(0, ribY + ribH, 0, ribY + ribH + 40);
  shade.addColorStop(0, 'rgba(6, 10, 18, 0.6)');
  shade.addColorStop(1, 'rgba(6, 10, 18, 0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, ribY + ribH, TILE, 40);

  // Nervio vertical: cinta de piedra en el borde (una por junta al teselar).
  const ribX = 0;
  const ribW = 40;
  const vgrad = ctx.createLinearGradient(ribX, 0, ribX + ribW, 0);
  vgrad.addColorStop(0, '#3d4557');
  vgrad.addColorStop(0.4, '#525b72');
  vgrad.addColorStop(1, '#2f3545');
  ctx.fillStyle = vgrad;
  ctx.fillRect(ribX, 0, ribW, TILE);
  ctx.strokeStyle = 'rgba(10, 14, 22, 0.85)';
  ctx.lineWidth = 2.4;
  wobblyLine(ctx, ribX + ribW, 0, ribX + ribW, TILE, 1.2, 22);
  ctx.strokeStyle = 'rgba(160, 178, 206, 0.28)';
  ctx.lineWidth = 1.8;
  wobblyLine(ctx, ribX + 3, 0, ribX + 3, TILE, 1.2, 22);

  drawHalftone(ctx, '#0a0e18', 8, 1.6, 0.12);
}

// ----------------------------------------------------------------------------
// 7. metalGirder — viga de hierro remachada con placas y pernos de bronce
// ----------------------------------------------------------------------------

function paintRivet(ctx: Ctx, x: number, y: number, r: number): void {
  const gradient = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r);
  gradient.addColorStop(0, '#e0c08e');
  gradient.addColorStop(0.55, '#b08a5c');
  gradient.addColorStop(1, '#5e4630');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(28, 20, 12, 0.9)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function paintMetalGirder(ctx: Ctx): void {
  const rng = createRng(0x9e1d3a77);

  // Alma del hierro: gris acero con pátina.
  const web = ctx.createLinearGradient(0, 0, 0, TILE);
  web.addColorStop(0, '#5b6270');
  web.addColorStop(0.5, '#4a505c');
  web.addColorStop(1, '#3a3f4a');
  ctx.fillStyle = web;
  ctx.fillRect(0, 0, TILE, TILE);

  // Vetas de laminado y manchas de óxido.
  for (let i = 0; i < 26; i++) {
    paintSoftBlotch(
      ctx,
      rng() * TILE,
      rng() * TILE,
      20 + rng() * 60,
      rng() > 0.5 ? 'rgba(120, 78, 44, 0.3)' : 'rgba(30, 34, 42, 0.32)',
      'rgba(30, 34, 42, 0)'
    );
  }
  ctx.strokeStyle = 'rgba(28, 32, 40, 0.35)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 18; i++) {
    const y = rng() * TILE;
    wobblyLine(ctx, 0, y, TILE, y + (rng() - 0.5) * 6, 1, 16);
  }

  // Alas del perfil I: bandas horizontales arriba y abajo (una por junta).
  const flangeH = 64;
  for (const fy of [0, TILE - flangeH]) {
    const grad = ctx.createLinearGradient(0, fy, 0, fy + flangeH);
    grad.addColorStop(0, '#7a8290');
    grad.addColorStop(0.35, '#5f6774');
    grad.addColorStop(1, '#3d434e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, fy, TILE, flangeH);
    ctx.strokeStyle = 'rgba(18, 22, 28, 0.9)';
    ctx.lineWidth = 3;
    wobblyLine(ctx, 0, fy + 1, TILE, fy + 1, 1, 24);
    wobblyLine(ctx, 0, fy + flangeH - 1, TILE, fy + flangeH - 1, 1, 24);
    ctx.strokeStyle = 'rgba(190, 202, 218, 0.35)';
    ctx.lineWidth = 2;
    wobblyLine(ctx, 0, fy + 6, TILE, fy + 6, 1, 24);
    // Doble fila de remaches de bronce.
    for (let x = 24; x < TILE; x += 48) {
      paintRivet(ctx, x, fy + 20, 6.4);
      paintRivet(ctx, x, fy + 44, 6.4);
    }
  }

  // Placas de arriostramiento en cruz sobre el alma.
  ctx.save();
  ctx.strokeStyle = 'rgba(96, 104, 118, 0.9)';
  ctx.lineWidth = 26;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(0, flangeH);
  ctx.lineTo(TILE, TILE - flangeH);
  ctx.moveTo(TILE, flangeH);
  ctx.lineTo(0, TILE - flangeH);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(24, 28, 36, 0.85)';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(0, flangeH);
  ctx.lineTo(TILE, TILE - flangeH);
  ctx.moveTo(TILE, flangeH);
  ctx.lineTo(0, TILE - flangeH);
  ctx.stroke();
  ctx.restore();

  // Cartela central remachada.
  ctx.fillStyle = '#565e6c';
  ctx.fillRect(TILE * 0.5 - 56, TILE * 0.5 - 56, 112, 112);
  ctx.strokeStyle = 'rgba(18, 22, 28, 0.9)';
  ctx.lineWidth = 3;
  ctx.strokeRect(TILE * 0.5 - 56, TILE * 0.5 - 56, 112, 112);
  for (const [dx, dy] of [
    [-40, -40],
    [40, -40],
    [-40, 40],
    [40, 40],
  ] as const) {
    paintRivet(ctx, TILE * 0.5 + dx, TILE * 0.5 + dy, 7);
  }

  drawHalftone(ctx, '#1a1e26', 8, 1.4, 0.09);
}

// ----------------------------------------------------------------------------
// 8. houseStucco — estuco marfil, ladrillo de esquina, ventanas salvia
// ----------------------------------------------------------------------------

function paintBrickBand(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  const rng = createRng(0x8b12c4);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  ctx.fillStyle = '#e6d3b4';
  ctx.fillRect(x, y, w, h);

  const courseH = 26;
  const brickW = 30;
  const rows = Math.ceil(h / courseH);
  const cols = Math.ceil(w / brickW) + 2;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * brickW * 0.5;
    for (let c = -1; c < cols; c++) {
      const bx = x + c * brickW + offset + 2;
      const by = y + r * courseH + 2;
      const tone = rng();
      ctx.fillStyle = tone > 0.66 ? '#c97a52' : tone > 0.33 ? '#b96a45' : '#d18a5f';
      ctx.beginPath();
      ctx.rect(bx, by, brickW - 4, courseH - 4);
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgba(96, 58, 38, 0.55)';
      ctx.stroke();
    }
  }
  ctx.restore();
}

function paintTimberBeam(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  const gradient = ctx.createLinearGradient(0, y, 0, y + h);
  gradient.addColorStop(0, '#b98a55');
  gradient.addColorStop(0.5, '#a3743f');
  gradient.addColorStop(1, '#7d5528');
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = 'rgba(88, 58, 30, 0.45)';
  ctx.lineWidth = 1.4;
  for (let i = 1; i < 4; i++) {
    wobblyLine(ctx, x, y + (h * i) / 4, x + w, y + (h * i) / 4, 0.8, 14);
  }

  ctx.strokeStyle = 'rgba(62, 40, 20, 0.85)';
  ctx.lineWidth = 2.4;
  wobblyLine(ctx, x, y + 1, x + w, y + 1, 1, 16);
  wobblyLine(ctx, x, y + h - 1, x + w, y + h - 1, 1, 16);
}

function paintShutter(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  body = '#8fae9b',
  ink = 'rgba(58, 84, 72, 0.5)'
): void {
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.fill();

  // Listones horizontales de la contraventana.
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  for (let sy = y + 9; sy < y + h - 6; sy += 12) {
    wobblyLine(ctx, x + 4, sy, x + w - 4, sy, 0.6, 4);
  }

  ctx.strokeStyle = 'rgba(48, 66, 58, 0.85)';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.stroke();

  // Bisagras cálidas.
  ctx.fillStyle = '#c9a06a';
  for (const t of [0.18, 0.82]) {
    ctx.beginPath();
    ctx.arc(x + w * 0.5, y + h * t, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintFlowerBox(ctx: Ctx, cx: number, y: number, w: number, rng: () => number): void {
  const h = 26;
  const left = cx - w * 0.5;

  // Flores y hojas primero: asoman por detrás del borde de la caja.
  for (let i = 0; i < 16; i++) {
    const fx = left + 6 + rng() * (w - 12);
    const fy = y - 3 - rng() * 15;
    ctx.fillStyle = '#4f8a5e';
    ctx.beginPath();
    ctx.ellipse(fx + 4, fy + 7, 5.5, 3, 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ['#e8798a', '#f2a65a', '#f6e2b3', '#d96b7a'][Math.floor(rng() * 4)];
    ctx.beginPath();
    ctx.arc(fx, fy, 3.6 + rng() * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Caja de madera.
  const gradient = ctx.createLinearGradient(0, y, 0, y + h);
  gradient.addColorStop(0, '#b8814a');
  gradient.addColorStop(1, '#8a5a30');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.rect(left, y, w, h);
  ctx.fill();
  ctx.strokeStyle = 'rgba(74, 46, 26, 0.85)';
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(74, 46, 26, 0.4)';
  ctx.lineWidth = 1.4;
  wobblyLine(ctx, left + 3, y + h * 0.55, left + w - 3, y + h * 0.55, 0.8, 8);
}

function paintArchedWindow(
  ctx: Ctx,
  cx: number,
  top: number,
  width: number,
  height: number,
  rng: () => number
): void {
  const openW = width * 0.54;
  const openH = height * 0.7;
  const openTop = top + height * 0.16;
  const archR = openW * 0.5;

  // Arco de ladrillo (dovelas) sobre la ventana.
  ctx.save();
  ctx.lineWidth = 13;
  ctx.strokeStyle = '#c07a52';
  ctx.beginPath();
  ctx.arc(cx, openTop + archR, archR + 7, Math.PI, 0, false);
  ctx.stroke();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = 'rgba(96, 58, 38, 0.75)';
  ctx.beginPath();
  ctx.arc(cx, openTop + archR, archR + 13.5, Math.PI, 0, false);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, openTop + archR, archR + 0.5, Math.PI, 0, false);
  ctx.stroke();
  // Juntas radiales de las dovelas.
  ctx.lineWidth = 1.8;
  for (let i = 0; i <= 8; i++) {
    const angle = Math.PI + (i / 8) * Math.PI;
    const r0 = archR + 1;
    const r1 = archR + 13;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * r0, openTop + archR + Math.sin(angle) * r0);
    ctx.lineTo(cx + Math.cos(angle) * r1, openTop + archR + Math.sin(angle) * r1);
    ctx.stroke();
  }
  ctx.restore();

  // Hueco de la ventana: cristal verde-teja en penumbra.
  archPath(ctx, cx, openTop, openW, openH);
  const glass = ctx.createLinearGradient(0, openTop, 0, openTop + openH);
  glass.addColorStop(0, '#5d7d78');
  glass.addColorStop(0.55, '#3f5a5a');
  glass.addColorStop(1, '#2f4448');
  ctx.fillStyle = glass;
  ctx.fill();

  // Reflejo cálido del cielo en el cristal.
  ctx.save();
  archPath(ctx, cx, openTop, openW, openH);
  ctx.clip();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#ffe9bd';
  ctx.beginPath();
  ctx.moveTo(cx - openW * 0.5, openTop + openH * 0.62);
  ctx.lineTo(cx + openW * 0.5, openTop + openH * 0.18);
  ctx.lineTo(cx + openW * 0.5, openTop + openH * 0.34);
  ctx.lineTo(cx - openW * 0.5, openTop + openH * 0.78);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Cruceta de madera.
  ctx.fillStyle = '#8a5a34';
  ctx.fillRect(cx - 3, openTop + archR * 0.4, 6, openH - archR * 0.4);
  ctx.fillRect(cx - openW * 0.5, openTop + openH * 0.52, openW, 6);

  // Marco entintado.
  archPath(ctx, cx, openTop, openW, openH);
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = 'rgba(58, 38, 24, 0.9)';
  ctx.stroke();

  // Contraventanas salvia a ambos lados.
  const shutterW = (width - openW) * 0.5 - 3;
  paintShutter(ctx, cx - openW * 0.5 - shutterW - 2, openTop + archR * 0.5, shutterW, openH - archR * 0.5);
  paintShutter(ctx, cx + openW * 0.5 + 2, openTop + archR * 0.5, shutterW, openH - archR * 0.5);

  // Jardinera de madera con flores.
  paintFlowerBox(ctx, cx, openTop + openH + 6, openW + 14, rng);
}

function paintHouseStucco(ctx: Ctx): void {
  const rng = createRng(0x4a05e11);

  // Revoco de estuco marfil cálido.
  ctx.fillStyle = '#f2e4cc';
  ctx.fillRect(0, 0, TILE, TILE);

  // Nubes de estuco: cal clara y sombra ocre, nunca ruido de lunares.
  for (let i = 0; i < 30; i++) {
    const light = rng() > 0.45;
    paintSoftBlotch(
      ctx,
      rng() * TILE,
      rng() * TILE,
      40 + rng() * 110,
      light ? 'rgba(255, 249, 234, 0.42)' : 'rgba(222, 199, 164, 0.3)',
      light ? 'rgba(255, 249, 234, 0)' : 'rgba(222, 199, 164, 0)'
    );
  }

  // Ladrillo de esquina (tesela: una banda en cada borde del tile).
  drawWrapped(ctx, () => paintBrickBand(ctx, 0, 0, 58, TILE));

  // Vigas de madera horizontales (separación de plantas al teselar).
  paintTimberBeam(ctx, 0, 0, TILE, 26);
  paintTimberBeam(ctx, 0, TILE - 26, TILE, 26);

  // Dos ventanas arqueadas con contraventanas y jardinera.
  paintArchedWindow(ctx, 168, 74, 150, 300, rng);
  paintArchedWindow(ctx, 352, 74, 150, 300, rng);

  // Zócalo de piedra: cierra la planta con un canto cálido.
  const plinth = ctx.createLinearGradient(0, 424, 0, 470);
  plinth.addColorStop(0, '#e0d0b4');
  plinth.addColorStop(1, '#c9b492');
  ctx.fillStyle = plinth;
  ctx.fillRect(0, 424, TILE, 46);
  ctx.strokeStyle = 'rgba(120, 96, 68, 0.7)';
  ctx.lineWidth = 2.4;
  wobblyLine(ctx, 0, 424, TILE, 424, 1.2, 18);
  wobblyLine(ctx, 0, 470, TILE, 470, 1.2, 18);

  // Grietas finas de estuco viejo.
  ctx.strokeStyle = 'rgba(176, 148, 112, 0.35)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 5; i++) {
    const x = 70 + rng() * 380;
    const y = 300 + rng() * 150;
    wobblyLine(ctx, x, y, x + 14 + rng() * 26, y + 18 + rng() * 30, 1.6, 5);
  }

  drawHalftone(ctx, '#8a6a48', 8, 1.3, 0.07);
}

// ----------------------------------------------------------------------------
// 9. houseTimber — casa entramada: yeso crema y vigas de roble oscuro
// ----------------------------------------------------------------------------

/** Ventana con parteluces dorados y vidrio emplomado en rombos. */
function paintMullionedWindow(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  // Rehundido de roble.
  ctx.fillStyle = '#4a3018';
  ctx.fillRect(x - 7, y - 7, w + 14, h + 14);

  // Vidrio cálido encendido.
  const glass = ctx.createLinearGradient(0, y, 0, y + h);
  glass.addColorStop(0, '#ffe9b0');
  glass.addColorStop(0.5, '#ffd27a');
  glass.addColorStop(1, '#e8a24a');
  ctx.fillStyle = glass;
  ctx.fillRect(x, y, w, h);

  // Emplomado en rombos.
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = 'rgba(96, 62, 28, 0.5)';
  ctx.lineWidth = 1.6;
  const d = 22;
  for (let i = -h; i < w + h; i += d) {
    ctx.beginPath();
    ctx.moveTo(x + i, y);
    ctx.lineTo(x + i + h, y + h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + h, y);
    ctx.stroke();
  }
  // Reflejo diagonal.
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#fffbe8';
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + w * 0.5, y);
  ctx.lineTo(x + w * 0.8, y);
  ctx.lineTo(x + w * 0.3, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Parteluces de roble.
  ctx.fillStyle = '#4a3018';
  ctx.fillRect(x + w * 0.5 - 3, y, 6, h);
  ctx.fillRect(x, y + h * 0.5 - 3, w, 6);
  ctx.strokeStyle = 'rgba(38, 24, 12, 0.95)';
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
}

function paintHouseTimber(ctx: Ctx): void {
  const rng = createRng(0x7ea5b00d);

  // Yeso crema cálido.
  ctx.fillStyle = '#f0e2c8';
  ctx.fillRect(0, 0, TILE, TILE);
  for (let i = 0; i < 26; i++) {
    const light = rng() > 0.5;
    paintSoftBlotch(
      ctx,
      rng() * TILE,
      rng() * TILE,
      36 + rng() * 96,
      light ? 'rgba(255, 250, 236, 0.4)' : 'rgba(214, 190, 152, 0.28)',
      light ? 'rgba(255, 250, 236, 0)' : 'rgba(214, 190, 152, 0)'
    );
  }

  // Entramado de roble oscuro: soleras, pies derechos y riostras en aspa.
  const beam = (x: number, y: number, w: number, h: number) => {
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, '#5a3d22');
    grad.addColorStop(0.5, '#4a3018');
    grad.addColorStop(1, '#33200e');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(24, 14, 6, 0.9)';
    ctx.lineWidth = 2.4;
    ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(150, 112, 70, 0.35)';
    ctx.lineWidth = 1.4;
    wobblyLine(ctx, x + 3, y + h * 0.35, x + w - 3, y + h * 0.35, 0.8, 10);
  };

  // Soleras superior e inferior (una por junta al teselar).
  beam(0, 0, TILE, 30);
  beam(0, TILE - 30, TILE, 30);
  // Solera intermedia.
  beam(0, 240, TILE, 26);
  // Pies derechos.
  beam(0, 0, 30, TILE);
  beam(TILE - 30, 0, 30, TILE);
  beam(240, 0, 26, TILE);

  // Riostras en aspa dentro de los paños.
  const brace = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.save();
    ctx.strokeStyle = '#4a3018';
    ctx.lineWidth = 20;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(24, 14, 6, 0.9)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  };
  brace(30, 266, 240, 30);
  brace(266, 30, 482, 266);
  brace(30, 482, 240, 266);
  brace(266, 266, 482, 482);

  // Ventanas con parteluces dorados.
  paintMullionedWindow(ctx, 74, 74, 128, 132);
  paintMullionedWindow(ctx, 310, 74, 128, 132);
  paintMullionedWindow(ctx, 74, 320, 128, 132);
  paintMullionedWindow(ctx, 310, 320, 128, 132);

  // Zócalo de piedra.
  ctx.fillStyle = '#c9b492';
  ctx.fillRect(0, 470, TILE, 42);
  ctx.strokeStyle = 'rgba(96, 74, 50, 0.8)';
  ctx.lineWidth = 2.4;
  wobblyLine(ctx, 0, 470, TILE, 470, 1.2, 18);

  drawHalftone(ctx, '#6a4a28', 8, 1.3, 0.07);
}

// ----------------------------------------------------------------------------
// 10. houseBrick — ladrillo salmón, dinteles de piedra y contraventanas teja
// ----------------------------------------------------------------------------

function paintHouseBrick(ctx: Ctx): void {
  const rng = createRng(0xb21c4e77);

  // Mortero de cal.
  ctx.fillStyle = '#e0cdb0';
  ctx.fillRect(0, 0, TILE, TILE);

  // Hiladas de ladrillo salmón-terracota.
  const courseH = 26;
  const brickW = 30;
  for (let r = 0; r < TILE / courseH; r++) {
    const offset = (r % 2) * brickW * 0.5;
    for (let c = -1; c <= TILE / brickW; c++) {
      const bx = c * brickW + offset + 2;
      const by = r * courseH + 2;
      const tone = rng();
      ctx.fillStyle = tone > 0.66 ? '#c97a52' : tone > 0.33 ? '#b96a45' : '#d18a5f';
      ctx.fillRect(bx, by, brickW - 4, courseH - 4);
      // Volumen del ladrillo.
      const grad = ctx.createLinearGradient(0, by, 0, by + courseH - 4);
      grad.addColorStop(0, 'rgba(255, 232, 208, 0.24)');
      grad.addColorStop(1, 'rgba(70, 36, 20, 0.24)');
      ctx.fillStyle = grad;
      ctx.fillRect(bx, by, brickW - 4, courseH - 4);
      ctx.strokeStyle = 'rgba(96, 58, 38, 0.5)';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(bx, by, brickW - 4, courseH - 4);
    }
  }

  // Ventanas con dintel de piedra crema y contraventanas azul-teja.
  const windowAt = (cx: number, top: number, w: number, h: number) => {
    // Dintel de piedra crema.
    ctx.fillStyle = '#efe2c6';
    ctx.fillRect(cx - w * 0.5 - 12, top - 22, w + 24, 22);
    ctx.strokeStyle = 'rgba(140, 116, 84, 0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - w * 0.5 - 12, top - 22, w + 24, 22);
    // Alféizar.
    ctx.fillStyle = '#e6d7b8';
    ctx.fillRect(cx - w * 0.5 - 12, top + h, w + 24, 16);
    ctx.strokeRect(cx - w * 0.5 - 12, top + h, w + 24, 16);

    // Hueco de cristal.
    const glass = ctx.createLinearGradient(0, top, 0, top + h);
    glass.addColorStop(0, '#7d9aa0');
    glass.addColorStop(0.6, '#4f6a72');
    glass.addColorStop(1, '#33474f');
    ctx.fillStyle = glass;
    ctx.fillRect(cx - w * 0.5, top, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - w * 0.5, top, w, h);
    ctx.clip();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#ffeec8';
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.5, top + h * 0.7);
    ctx.lineTo(cx + w * 0.5, top + h * 0.2);
    ctx.lineTo(cx + w * 0.5, top + h * 0.4);
    ctx.lineTo(cx - w * 0.5, top + h * 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(48, 30, 18, 0.9)';
    ctx.lineWidth = 3;
    ctx.strokeRect(cx - w * 0.5, top, w, h);
    // Cruceta.
    ctx.fillStyle = '#efe2c6';
    ctx.fillRect(cx - 3, top, 6, h);
    ctx.fillRect(cx - w * 0.5, top + h * 0.5 - 3, w, 6);

    // Contraventanas azul-teja.
    const sw = w * 0.42;
    paintShutter(ctx, cx - w * 0.5 - sw - 4, top, sw, h, '#2f4a5c', 'rgba(18, 34, 44, 0.55)');
    paintShutter(ctx, cx + w * 0.5 + 4, top, sw, h, '#2f4a5c', 'rgba(18, 34, 44, 0.55)');
  };

  windowAt(140, 96, 120, 150);
  windowAt(372, 96, 120, 150);
  windowAt(140, 300, 120, 150);
  windowAt(372, 300, 120, 150);

  // Zócalo de piedra.
  ctx.fillStyle = '#d8c8a8';
  ctx.fillRect(0, 470, TILE, 42);
  ctx.strokeStyle = 'rgba(120, 96, 68, 0.8)';
  ctx.lineWidth = 2.4;
  wobblyLine(ctx, 0, 470, TILE, 470, 1.2, 18);

  drawHalftone(ctx, '#7a4a2c', 8, 1.3, 0.07);
}

// ----------------------------------------------------------------------------
// 11. shopBakery — toldo coral y crema, roble y escaparate ámbar
// ----------------------------------------------------------------------------

function paintSignboard(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  const gradient = ctx.createLinearGradient(0, y, 0, y + h);
  gradient.addColorStop(0, '#a9743f');
  gradient.addColorStop(0.55, '#8f5f33');
  gradient.addColorStop(1, '#6f4726');
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = 'rgba(74, 46, 24, 0.35)';
  ctx.lineWidth = 1.4;
  for (let i = 1; i < 6; i++) {
    wobblyLine(ctx, x, y + (h * i) / 6, x + w, y + (h * i) / 6, 1, 18);
  }

  // Marco tallado doble.
  ctx.strokeStyle = 'rgba(58, 34, 18, 0.9)';
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 6, y + 6, w - 12, h - 12);
  ctx.strokeStyle = 'rgba(214, 178, 122, 0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 12, y + 12, w - 24, h - 24);

  // Panel central de crema: el texto lo aporta el atlas de carteles en `vis_glow`.
  ctx.fillStyle = '#f4e6cc';
  ctx.fillRect(x + 18, y + 18, w - 36, h - 36);
  ctx.strokeStyle = 'rgba(58, 34, 18, 0.75)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 18, y + 18, w - 36, h - 36);
}

function paintAwning(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  stripeA: string,
  stripeB: string
): void {
  const stripeW = 32;
  const scallopR = stripeW * 0.5;
  const bodyH = h - scallopR;
  const count = Math.round(w / stripeW);

  for (let i = 0; i < count; i++) {
    const sx = x + i * stripeW;
    ctx.fillStyle = i % 2 === 0 ? stripeA : stripeB;
    ctx.fillRect(sx, y, stripeW, bodyH);
    ctx.beginPath();
    ctx.arc(sx + scallopR, y + bodyH, scallopR, 0, Math.PI, false);
    ctx.fill();
  }

  // Sombra cálida proyectada bajo el toldo.
  const shadow = ctx.createLinearGradient(0, y + bodyH, 0, y + h + 12);
  shadow.addColorStop(0, 'rgba(90, 52, 30, 0.35)');
  shadow.addColorStop(1, 'rgba(90, 52, 30, 0)');
  ctx.fillStyle = shadow;
  ctx.fillRect(x, y + bodyH, w, h - bodyH + 12);

  // Tinta del festón y del borde superior.
  ctx.strokeStyle = 'rgba(70, 40, 24, 0.8)';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const sx = x + i * stripeW;
    ctx.moveTo(sx, y + bodyH);
    ctx.arc(sx + scallopR, y + bodyH, scallopR, Math.PI, 0, true);
  }
  ctx.stroke();
  wobblyLine(ctx, x, y + 1, x + w, y + 1, 1.2, 12);
}

function paintDisplayWindow(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  // Rehundido de roble.
  ctx.fillStyle = '#6b4326';
  ctx.fillRect(x - 8, y - 8, w + 16, h + 16);

  // Cristal cálido encendido.
  const glass = ctx.createLinearGradient(0, y, 0, y + h);
  glass.addColorStop(0, '#ffe6a8');
  glass.addColorStop(0.45, '#ffcf7a');
  glass.addColorStop(1, '#e79a45');
  ctx.fillStyle = glass;
  ctx.fillRect(x, y, w, h);

  // Reflejos diagonales de escaparate.
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.globalAlpha = 0.32;
  ctx.fillStyle = '#fff6dc';
  for (let i = -1; i < 4; i++) {
    const base = x + i * 46;
    ctx.beginPath();
    ctx.moveTo(base, y + h);
    ctx.lineTo(base + 26, y + h);
    ctx.lineTo(base + 26 + h * 0.5, y);
    ctx.lineTo(base + h * 0.5, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Cruceta de roble.
  ctx.fillStyle = '#7d4f2c';
  ctx.fillRect(x + w * 0.5 - 4, y, 8, h);
  ctx.fillRect(x, y + h * 0.42 - 4, w, 8);

  ctx.strokeStyle = 'rgba(58, 34, 18, 0.9)';
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
}

function paintShopDoor(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#7d4f2c';
  ctx.fillRect(x, y, w, h);

  const glass = ctx.createLinearGradient(0, y + 12, 0, y + h * 0.45);
  glass.addColorStop(0, '#ffe6a8');
  glass.addColorStop(1, '#e79a45');
  ctx.fillStyle = glass;
  ctx.fillRect(x + 8, y + 12, w - 16, h * 0.34);
  ctx.strokeStyle = 'rgba(58, 34, 18, 0.9)';
  ctx.lineWidth = 2.4;
  ctx.strokeRect(x + 8, y + 12, w - 16, h * 0.34);

  ctx.strokeStyle = 'rgba(58, 34, 18, 0.7)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 8, y + h * 0.52, w - 16, h * 0.18);
  ctx.strokeRect(x + 8, y + h * 0.74, w - 16, h * 0.18);

  ctx.strokeStyle = 'rgba(48, 28, 14, 0.95)';
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);

  ctx.fillStyle = '#e8c07a';
  ctx.beginPath();
  ctx.arc(x + w - 12, y + h * 0.5, 3.4, 0, Math.PI * 2);
  ctx.fill();
}

function paintShopBakery(ctx: Ctx): void {
  const rng = createRng(0x5b0b5b11);

  // Panel de roble de fondo.
  ctx.fillStyle = '#8a5a34';
  ctx.fillRect(0, 0, TILE, TILE);
  ctx.strokeStyle = 'rgba(74, 46, 24, 0.3)';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 26; i++) {
    const x = rng() * TILE;
    wobblyLine(ctx, x, 0, x + (rng() - 0.5) * 8, TILE, 1.2, 12);
  }

  // Rótulo superior, toldo a rayas y escaparate.
  paintSignboard(ctx, 0, 0, TILE, 74);
  paintAwning(ctx, 0, 74, TILE, 104, '#e2705a', '#f8ecd8');

  paintDisplayWindow(ctx, 34, 214, 176, 210);
  paintDisplayWindow(ctx, 302, 214, 176, 210);
  paintShopDoor(ctx, 226, 226, 60, 236);

  // Zócalo oscuro de la fachada.
  ctx.fillStyle = '#5f3c22';
  ctx.fillRect(0, 470, TILE, 42);
  ctx.strokeStyle = 'rgba(40, 24, 12, 0.9)';
  ctx.lineWidth = 2.6;
  wobblyLine(ctx, 0, 470, TILE, 470, 1.2, 16);

  drawHalftone(ctx, '#5a3a20', 8, 1.3, 0.06);
}

// ----------------------------------------------------------------------------
// 12. shopBoutique — toldo menta y crema, arcos con latón y cornisa tallada
// ----------------------------------------------------------------------------

function paintBoutiqueArch(ctx: Ctx, cx: number, top: number, w: number, h: number): void {
  const r = w * 0.5;

  // Marco de latón.
  ctx.save();
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#c9a227';
  ctx.beginPath();
  ctx.moveTo(cx - r, top + h);
  ctx.lineTo(cx - r, top + r);
  ctx.arc(cx, top + r, r, Math.PI, 0, false);
  ctx.lineTo(cx + r, top + h);
  ctx.stroke();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = 'rgba(120, 88, 20, 0.85)';
  ctx.stroke();
  ctx.restore();

  // Escaparate pastel iluminado.
  archPath(ctx, cx, top, w, h);
  const glass = ctx.createLinearGradient(0, top, 0, top + h);
  glass.addColorStop(0, '#fdf3e2');
  glass.addColorStop(0.5, '#f6e2c8');
  glass.addColorStop(1, '#e8c9a8');
  ctx.fillStyle = glass;
  ctx.fill();

  // Objetos expuestos: pequeños maniquíes y cajas de color.
  ctx.save();
  archPath(ctx, cx, top, w, h);
  ctx.clip();
  const goods = ['#a8d5c0', '#f2b8c6', '#f7d98a', '#b8c8f0'];
  for (let i = 0; i < 5; i++) {
    const gx = cx - r + 14 + (i * (w - 28)) / 4;
    const gh = 26 + (i % 3) * 12;
    ctx.fillStyle = goods[i % goods.length];
    ctx.fillRect(gx - 9, top + h - 24 - gh, 18, gh);
    ctx.strokeStyle = 'rgba(96, 72, 48, 0.5)';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(gx - 9, top + h - 24 - gh, 18, gh);
  }
  // Estante inferior.
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(cx - r, top + h - 24, w, 8);
  // Reflejo diagonal.
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(cx - r, top + h);
  ctx.lineTo(cx + r * 0.2, top);
  ctx.lineTo(cx + r * 0.7, top);
  ctx.lineTo(cx - r * 0.4, top + h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Parteluz de latón.
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(cx - 3, top + r * 0.6, 6, h - r * 0.6);

  archPath(ctx, cx, top, w, h);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(96, 72, 40, 0.9)';
  ctx.stroke();
}

function paintShopBoutique(ctx: Ctx): void {
  const rng = createRng(0xb0071a11);

  // Estuco pastel de fondo.
  ctx.fillStyle = '#f6efe2';
  ctx.fillRect(0, 0, TILE, TILE);
  for (let i = 0; i < 22; i++) {
    paintSoftBlotch(
      ctx,
      rng() * TILE,
      rng() * TILE,
      40 + rng() * 90,
      'rgba(255, 252, 244, 0.45)',
      'rgba(255, 252, 244, 0)'
    );
  }

  // Cornisa tallada superior con dentículos.
  ctx.fillStyle = '#e8dcc6';
  ctx.fillRect(0, 0, TILE, 46);
  ctx.strokeStyle = 'rgba(150, 128, 96, 0.8)';
  ctx.lineWidth = 2.4;
  wobblyLine(ctx, 0, 46, TILE, 46, 1.2, 18);
  ctx.fillStyle = '#d8c9ae';
  for (let x = 8; x < TILE; x += 32) {
    ctx.fillRect(x, 30, 18, 14);
    ctx.strokeRect(x, 30, 18, 14);
  }

  // Toldo menta y crema.
  paintAwning(ctx, 0, 46, TILE, 96, '#a8d5c0', '#fbf4e6');

  // Arcos de escaparate con latón.
  paintBoutiqueArch(ctx, 132, 190, 168, 250);
  paintBoutiqueArch(ctx, 380, 190, 168, 250);

  // Puerta central de latón y cristal.
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(238, 214, 36, 226);
  ctx.fillStyle = '#f6e2c8';
  ctx.fillRect(244, 222, 24, 150);
  ctx.strokeStyle = 'rgba(96, 72, 40, 0.9)';
  ctx.lineWidth = 2.4;
  ctx.strokeRect(244, 222, 24, 150);
  ctx.strokeRect(238, 214, 36, 226);

  // Zócalo de piedra clara.
  ctx.fillStyle = '#ded0b6';
  ctx.fillRect(0, 470, TILE, 42);
  ctx.strokeStyle = 'rgba(140, 118, 88, 0.8)';
  ctx.lineWidth = 2.4;
  wobblyLine(ctx, 0, 470, TILE, 470, 1.2, 18);

  drawHalftone(ctx, '#a08a68', 8, 1.2, 0.05);
}

// ----------------------------------------------------------------------------
// 13-14. Tejados: teja curva de barro y teja plana de pizarra
// ----------------------------------------------------------------------------

function paintBarrelTile(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  tone: number
): void {
  const r = w * 0.5;
  const bodyH = h * 0.62;

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + bodyH);
  ctx.arc(x + r, y + bodyH, r, 0, Math.PI, false);
  ctx.lineTo(x, y);
  ctx.closePath();

  ctx.fillStyle = shadeHex(color, tone);
  ctx.fill();

  // Volumen: luz en la panza alta, sombra en el borde inferior.
  ctx.save();
  ctx.clip();
  const gradient = ctx.createLinearGradient(0, y, 0, y + bodyH + r);
  gradient.addColorStop(0, 'rgba(255, 246, 226, 0.32)');
  gradient.addColorStop(0.45, 'rgba(255, 246, 226, 0.02)');
  gradient.addColorStop(1, 'rgba(40, 24, 18, 0.42)');
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, w, bodyH + r);
  ctx.restore();

  // Cresta central de la teja.
  ctx.strokeStyle = 'rgba(48, 30, 24, 0.22)';
  ctx.lineWidth = 1.6;
  wobblyLine(ctx, x + r, y + 4, x + r, y + bodyH + r * 0.7, 0.8, 5);

  // Tinta cómic del contorno.
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + bodyH);
  ctx.arc(x + r, y + bodyH, r, 0, Math.PI, false);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(52, 32, 26, 0.85)';
  ctx.stroke();
}

function paintFlatShingle(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  tone: number
): void {
  const inset = 2;
  ctx.fillStyle = shadeHex(color, tone);
  ctx.fillRect(x + inset, y + inset, w - inset * 2, h - inset * 2);

  // Bisel: filo claro arriba, sombra abajo (solape de pizarra).
  const gradient = ctx.createLinearGradient(0, y, 0, y + h);
  gradient.addColorStop(0, 'rgba(226, 244, 240, 0.3)');
  gradient.addColorStop(0.5, 'rgba(226, 244, 240, 0.02)');
  gradient.addColorStop(1, 'rgba(14, 26, 30, 0.45)');
  ctx.fillStyle = gradient;
  ctx.fillRect(x + inset, y + inset, w - inset * 2, h - inset * 2);

  // Veta de la pizarra.
  ctx.strokeStyle = 'rgba(20, 34, 38, 0.28)';
  ctx.lineWidth = 1.2;
  wobblyLine(ctx, x + 5, y + h * 0.45, x + w - 5, y + h * 0.45, 0.9, 6);

  ctx.strokeStyle = 'rgba(16, 28, 32, 0.85)';
  ctx.lineWidth = 2.4;
  ctx.strokeRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
}

function paintRoof(ctx: Ctx, colors: readonly string[], barrel: boolean): void {
  const rng = createRng(barrel ? 0x0f00d5 : 0x51a7e0ff);

  ctx.fillStyle = barrel ? '#4a3a34' : '#22343a';
  ctx.fillRect(0, 0, TILE, TILE);

  const rows = 8;
  const cols = 8;
  const tw = TILE / cols;
  const th = TILE / rows;

  // De arriba abajo: cada hilada tapa el borde de la anterior (solape real).
  // El color se agrupa por hilada (rachas de terracota, pizarra u ocre) con
  // alguna teja suelta distinta: nunca un tablero de ajedrez.
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * tw * 0.5;
    const rowColor = colors[Math.floor(rng() * colors.length)];
    for (let c = 0; c < cols; c++) {
      const x = c * tw + offset;
      const y = r * th;
      const color = rng() > 0.78 ? colors[Math.floor(rng() * colors.length)] : rowColor;
      const tone = 0.9 + rng() * 0.2;
      drawWrapped(ctx, () =>
        barrel
          ? paintBarrelTile(ctx, x, y, tw, th, color, tone)
          : paintFlatShingle(ctx, x, y, tw, th, color, tone)
      );
    }
  }

  // Desgaste: manchas de musgo/verdín y polvo.
  for (let i = 0; i < 14; i++) {
    paintSoftBlotch(
      ctx,
      rng() * TILE,
      rng() * TILE,
      24 + rng() * 60,
      barrel ? 'rgba(120, 96, 60, 0.22)' : 'rgba(110, 150, 130, 0.24)',
      'rgba(0, 0, 0, 0)'
    );
  }

  drawHalftone(ctx, barrel ? '#3a2a24' : '#16262a', 8, 1.4, 0.08);
}

const ROOF_TILE_COLORS = ['#c76b4c', '#d68c59', '#b85f42', '#e0a06a', '#cf7a4e', '#d99a5e'];
const ROOF_SLATE_COLORS = ['#4a6b6b', '#5c797a', '#3f5c5e', '#6b9a8a', '#547a78', '#7aa89a'];

// ----------------------------------------------------------------------------
// 15. treeBark — corteza de cómic con surcos verticales y nudos
// ----------------------------------------------------------------------------

function paintTreeBark(ctx: Ctx): void {
  const rng = createRng(0xba12c0de);

  // Corteza base cálida.
  const base = ctx.createLinearGradient(0, 0, TILE, 0);
  base.addColorStop(0, '#8a6242');
  base.addColorStop(0.5, '#7a5537');
  base.addColorStop(1, '#8a6242');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, TILE, TILE);

  // Surcos verticales: la corteza de un árbol crece hacia arriba, nunca en
  // anillos horizontales.
  for (let i = 0; i < 34; i++) {
    const x = rng() * TILE;
    const w = 4 + rng() * 16;
    const dark = rng() > 0.45;
    ctx.strokeStyle = dark
      ? `rgba(58, 36, 20, ${0.4 + rng() * 0.35})`
      : `rgba(196, 158, 112, ${0.24 + rng() * 0.24})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    let cx = x;
    ctx.moveTo(cx, -20);
    for (let y = 0; y <= TILE + 20; y += 32) {
      cx += (rng() - 0.5) * 10;
      ctx.lineTo(cx, y);
    }
    ctx.stroke();
  }

  // Fibras finas entre los surcos.
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 60; i++) {
    const x = rng() * TILE;
    ctx.strokeStyle = `rgba(52, 32, 18, ${0.14 + rng() * 0.2})`;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (rng() - 0.5) * 8, TILE);
    ctx.stroke();
  }

  // Nudos: óvalos con anillos concéntricos.
  for (let i = 0; i < 4; i++) {
    const kx = rng() * TILE;
    const ky = rng() * TILE;
    const kr = 12 + rng() * 12;
    drawWrapped(ctx, () => {
      for (let ring = 3; ring >= 0; ring--) {
        ctx.strokeStyle = `rgba(48, 28, 14, ${0.35 + ring * 0.12})`;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.ellipse(kx, ky, kr * (0.35 + ring * 0.22), kr * (0.5 + ring * 0.3), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(40, 24, 12, 0.7)';
      ctx.beginPath();
      ctx.ellipse(kx, ky, kr * 0.3, kr * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawHalftone(ctx, '#3a2412', 8, 1.4, 0.08);
}

// ----------------------------------------------------------------------------
// 16. treeLeaves — copa de hojas estilizadas, clara para tintar en el shader
//
// La textura se dibuja en tonos claros (luminancia 0.65-1.0) con tinta oscura
// en los contornos: el shader la multiplica por la paleta del árbol (esmeralda,
// lima, cerezo rosa o ámbar dorado) y el tinte sale limpio en los cuatro casos.
// ----------------------------------------------------------------------------

function paintLeaf(ctx: Ctx, x: number, y: number, r: number, rot: number, tone: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  // Hoja redondeada con punta: dos arcos y un vértice.
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.quadraticCurveTo(-r * 0.4, -r * 0.85, r * 0.9, 0);
  ctx.quadraticCurveTo(-r * 0.4, r * 0.85, -r, 0);
  ctx.closePath();
  ctx.fillStyle = shadeHex('#eef4e2', tone);
  ctx.fill();
  ctx.strokeStyle = 'rgba(74, 92, 62, 0.55)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  // Nervio central y brillo de cómic.
  ctx.strokeStyle = 'rgba(120, 140, 100, 0.5)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-r * 0.8, 0);
  ctx.lineTo(r * 0.7, 0);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 248, 0.5)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.1, -r * 0.22, r * 0.34, r * 0.16, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function paintTreeLeaves(ctx: Ctx): void {
  const rng = createRng(0x1eaf5eed);

  // Fondo de sombra entre hojas.
  ctx.fillStyle = '#b8c9a8';
  ctx.fillRect(0, 0, TILE, TILE);
  for (let i = 0; i < 20; i++) {
    paintSoftBlotch(
      ctx,
      rng() * TILE,
      rng() * TILE,
      40 + rng() * 90,
      'rgba(150, 172, 132, 0.5)',
      'rgba(150, 172, 132, 0)'
    );
  }

  // Tres capas de hojas: la de atrás oscura, la media clara y la delantera
  // brillante. Cada capa usa una rejilla jitterada para que la copa se lea
  // como racimos y no como una alfombra uniforme.
  const layers = [
    { step: 46, r: 30, tone: 0.82 },
    { step: 40, r: 26, tone: 0.96 },
    { step: 34, r: 20, tone: 1.06 },
  ];
  for (const layer of layers) {
    for (let y = -layer.step; y < TILE + layer.step; y += layer.step) {
      for (let x = -layer.step; x < TILE + layer.step; x += layer.step) {
        const lx = x + (rng() - 0.5) * layer.step * 0.8;
        const ly = y + (rng() - 0.5) * layer.step * 0.8;
        const r = layer.r * (0.75 + rng() * 0.5);
        const rot = rng() * Math.PI * 2;
        const tone = layer.tone * (0.94 + rng() * 0.12);
        drawWrapped(ctx, () => paintLeaf(ctx, lx, ly, r, rot, tone));
      }
    }
  }

  // Racimos de bayas/flores muy tenues: chispa de color en la copa.
  for (let i = 0; i < 26; i++) {
    const x = rng() * TILE;
    const y = rng() * TILE;
    ctx.fillStyle = `rgba(255, 252, 236, ${0.3 + rng() * 0.3})`;
    ctx.beginPath();
    ctx.arc(x, y, 2.4 + rng() * 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  drawHalftone(ctx, '#5a6b4a', 8, 1.2, 0.05);
}

// ----------------------------------------------------------------------------
// Fábrica de texturas
// ----------------------------------------------------------------------------

/** Ajustes comunes: teselado, mipmaps de hardware, anisotropía y sRGB. */
function configureTexture(texture: THREE.Texture, name: string): void {
  texture.name = `heksevilleArch:${name}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
}

function createTileTexture(name: string, painter: (ctx: Ctx) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    painter(ctx);
  }

  const texture = new THREE.CanvasTexture(canvas);
  configureTexture(texture, name);
  return texture;
}

/** Textura de 1×1 para entornos sin `document` (SSR, tests). */
function createFallbackTexture(name: string, hex: string): THREE.DataTexture {
  // `LinearSRGBColorSpace` guarda los bytes tal cual se declararon (sRGB).
  const color = new THREE.Color().setStyle(hex, THREE.LinearSRGBColorSpace);
  const data = new Uint8Array([
    Math.round(color.r * 255),
    Math.round(color.g * 255),
    Math.round(color.b * 255),
    255,
  ]);
  const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  configureTexture(texture, name);
  return texture;
}

/** Nombre de tile → color base del fallback sin canvas. */
const FALLBACK_COLORS: Record<string, string> = {
  cobbleFine: '#d9c8ab',
  plazaMarble: '#efe3cd',
  avenueSlate: '#5a6472',
  parkBrick: '#b5613f',
  cliffMasonry: '#a89a86',
  underVault: '#3a4152',
  metalGirder: '#5b6270',
  houseStucco: '#f2e4cc',
  houseTimber: '#f0e2c8',
  houseBrick: '#c97a52',
  shopBakery: '#e2705a',
  shopBoutique: '#a8d5c0',
  roofTiles: '#c76b4c',
  roofSlate: '#4a6b6b',
  treeBark: '#8a6242',
  treeLeaves: '#d8e4cc',
};

/** Pintores de los dieciséis tiles, en el orden del bundle. */
const TILE_PAINTERS: ReadonlyArray<readonly [string, (ctx: Ctx) => void]> = [
  ['cobbleFine', paintCobbleFine],
  ['plazaMarble', paintPlazaMarble],
  ['avenueSlate', paintAvenueSlate],
  ['parkBrick', paintParkBrick],
  ['cliffMasonry', paintCliffMasonry],
  ['underVault', paintUnderVault],
  ['metalGirder', paintMetalGirder],
  ['houseStucco', paintHouseStucco],
  ['houseTimber', paintHouseTimber],
  ['houseBrick', paintHouseBrick],
  ['shopBakery', paintShopBakery],
  ['shopBoutique', paintShopBoutique],
  ['roofTiles', (ctx) => paintRoof(ctx, ROOF_TILE_COLORS, true)],
  ['roofSlate', (ctx) => paintRoof(ctx, ROOF_SLATE_COLORS, false)],
  ['treeBark', paintTreeBark],
  ['treeLeaves', paintTreeLeaves],
];

/**
 * Construye las dieciséis texturas de arquitectura de Hekseville (512×512, sin
 * costuras, con mipmaps de hardware y anisotropía 8) que visten los buckets
 * `col_*` y `vis_*` de los chunks: cuatro suelos distintos, sillería de
 * contención, bóveda artesonada, viga remachada, tres fachadas de casa, dos
 * escaparates, dos tejados y dos texturas de árbol.
 *
 * Cada tile se dibuja una sola vez con canvas 2D y se libera con el
 * `dispose()` del bundle devuelto.
 */
export function createHeksevilleArchTextures(): HeksevilleArchTextures {
  if (typeof document === 'undefined') {
    const fallback: Record<string, THREE.Texture> = {};
    for (const [name] of TILE_PAINTERS) {
      fallback[name] = createFallbackTexture(name, FALLBACK_COLORS[name]);
    }
    return {
      ...(fallback as unknown as Omit<HeksevilleArchTextures, 'dispose'>),
      dispose: () => {
        for (const texture of Object.values(fallback)) texture.dispose();
      },
    };
  }

  const textures: Record<string, THREE.Texture> = {};
  for (const [name, painter] of TILE_PAINTERS) {
    textures[name] = createTileTexture(name, painter);
  }

  return {
    ...(textures as unknown as Omit<HeksevilleArchTextures, 'dispose'>),
    dispose: () => {
      for (const texture of Object.values(textures)) texture.dispose();
    },
  };
}
