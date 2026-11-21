import * as THREE from 'three';

// ============================================================================
// Hekseville 1:1 — Atlas de arquitectura de cómic (6 tiles 512×512 sin costuras)
//
// Los chunks `.glb` de Hekseville llegan sin texturas bitmap, así que la ciudad
// se viste con seis tiles dibujados a mano en canvas 2D que reproducen el arte
// de `referencias y base/pleajeune_tex_concept.jpg`: adoquín de arenisca
// europea, estuco marfil con contraventanas salvia, escaparate de café con
// toldo a rayas, teja terracota/pizarra, caliza tallada con vidriera y
// sillería de bajos con viga de bronce remachada.
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
// El bundle se libera con `dispose()` (una llamada, seis texturas).
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
  /** Adoquín orgánico de arenisca cálida (calles y plazas). */
  cobble: THREE.Texture;
  /** Estuco marfil con ladrillo de esquina y ventanas arqueadas con contraventanas. */
  house: THREE.Texture;
  /** Escaparate de café: toldo a rayas, roble y ventanas ámbar. */
  shop: THREE.Texture;
  /** Teja terracota/ocre/pizarra-salvia escalonada. */
  roof: THREE.Texture;
  /** Caliza tallada con pilastras y vidriera emplomada. */
  civic: THREE.Texture;
  /** Sillería de bajos con viga de bronce remachada. */
  under: THREE.Texture;
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

// ----------------------------------------------------------------------------
// 1. Adoquín: arenisca europea irregular, junta de mortero cálido entintada
// ----------------------------------------------------------------------------

const COBBLE_COLORS = ['#d7c3a3', '#c8ad89', '#dfcfb7', '#cfa691', '#d2bb98', '#c9b393', '#dcc9ab', '#c19a76'];

interface CobbleStone {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rot: number;
  color: string;
  wobble: number[];
}

function paintCobbleStone(ctx: Ctx, stone: CobbleStone): void {
  const pts: Array<[number, number]> = [];
  const n = stone.wobble.length;
  const cos = Math.cos(stone.rot);
  const sin = Math.sin(stone.rot);
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    const k = 1 + (stone.wobble[i] - 0.5) * 0.2;
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
  gradient.addColorStop(0, 'rgba(255, 250, 238, 0.3)');
  gradient.addColorStop(0.55, 'rgba(255, 250, 238, 0.03)');
  gradient.addColorStop(1, 'rgba(96, 68, 46, 0.22)');
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
  ctx.lineWidth = 2.8;
  ctx.strokeStyle = 'rgba(84, 60, 42, 0.7)';
  ctx.stroke();
}

function paintCobble(ctx: Ctx): void {
  const rng = createRng(0x0c0bb1e5);

  // Lecho de mortero cálido: solo se ve como junta fina entre losas.
  ctx.fillStyle = '#8a6f56';
  ctx.fillRect(0, 0, TILE, TILE);
  for (let i = 0; i < 16; i++) {
    paintSoftBlotch(
      ctx,
      rng() * TILE,
      rng() * TILE,
      50 + rng() * 110,
      'rgba(150, 122, 92, 0.5)',
      'rgba(150, 122, 92, 0)'
    );
  }

  // Losas de arenisca en hiladas escalonadas de tamaño orgánico: losas
  // grandes y planas con junta fina, nunca una rejilla de 1 m.
  const rows = 6;
  const cols = 5;
  const rowH = TILE / rows;
  const colW = TILE / cols;
  const stones: CobbleStone[] = [];
  for (let r = 0; r < rows; r++) {
    const stagger = (r % 2) * 0.5;
    for (let c = 0; c < cols; c++) {
      const wobble: number[] = [];
      for (let i = 0; i < 9; i++) wobble.push(rng());
      stones.push({
        cx: (c + stagger + 0.5) * colW + (rng() - 0.5) * colW * 0.1,
        cy: (r + 0.5) * rowH + (rng() - 0.5) * rowH * 0.1,
        rx: colW * (0.48 + rng() * 0.06),
        ry: rowH * (0.47 + rng() * 0.06),
        rot: (rng() - 0.5) * 0.4,
        color: COBBLE_COLORS[Math.floor(rng() * COBBLE_COLORS.length)],
        wobble,
      });
    }
  }
  for (const stone of stones) {
    drawWrapped(ctx, () => paintCobbleStone(ctx, stone));
  }

  // Grano de impresión cómic muy tenue sobre toda la calzada.
  drawHalftone(ctx, '#6b4f38', 16, 1.6, 0.06);
}

// ----------------------------------------------------------------------------
// 2. Casa: estuco marfil, ladrillo de esquina, ventanas arqueadas con
//    contraventanas salvia y jardinera de madera
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

function paintShutter(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#8fae9b';
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.fill();

  // Listones horizontales de la contraventana.
  ctx.strokeStyle = 'rgba(58, 84, 72, 0.5)';
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

function paintHouse(ctx: Ctx): void {
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
// 3. Tienda: rótulo de roble, toldo a rayas coral y crema, escaparate ámbar
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

function paintAwning(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  const stripeW = 32;
  const scallopR = stripeW * 0.5;
  const bodyH = h - scallopR;
  const coral = '#e2705a';
  const cream = '#f8ecd8';
  const count = Math.round(w / stripeW);

  for (let i = 0; i < count; i++) {
    const sx = x + i * stripeW;
    ctx.fillStyle = i % 2 === 0 ? coral : cream;
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

function paintShop(ctx: Ctx): void {
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
  paintAwning(ctx, 0, 74, TILE, 104);

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
// 4. Tejado: teja escalonada terracota, ocre y pizarra-salvia
// ----------------------------------------------------------------------------

const ROOF_COLORS = ['#c76b4c', '#d68c59', '#5c797a', '#b85f42', '#e0a06a', '#6b8a8a'];

function paintRoofTile(
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

function paintRoof(ctx: Ctx): void {
  const rng = createRng(0x0f00d5);

  ctx.fillStyle = '#4a3a34';
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
    const rowColor = ROOF_COLORS[Math.floor(rng() * ROOF_COLORS.length)];
    for (let c = 0; c < cols; c++) {
      const x = c * tw + offset;
      const y = r * th;
      const color = rng() > 0.78 ? ROOF_COLORS[Math.floor(rng() * ROOF_COLORS.length)] : rowColor;
      const tone = 0.9 + rng() * 0.2;
      drawWrapped(ctx, () => paintRoofTile(ctx, x, y, tw, th, color, tone));
    }
  }

  drawHalftone(ctx, '#3a2a24', 8, 1.4, 0.08);
}

// ----------------------------------------------------------------------------
// 5. Cívico: caliza tallada, pilastras y vidriera emplomada
// ----------------------------------------------------------------------------

function paintPilaster(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  const gradient = ctx.createLinearGradient(x, 0, x + w, 0);
  gradient.addColorStop(0, '#d8c9ae');
  gradient.addColorStop(0.45, '#f0e6d2');
  gradient.addColorStop(1, '#cdbda0');
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, w, h);

  // Estrías verticales de la pilastra.
  ctx.strokeStyle = 'rgba(150, 128, 100, 0.4)';
  ctx.lineWidth = 1.6;
  for (let i = 1; i < 4; i++) {
    wobblyLine(ctx, x + (w * i) / 4, y, x + (w * i) / 4, y + h, 0.8, 18);
  }

  // Capitel y basa.
  ctx.fillStyle = '#e2d4b8';
  ctx.fillRect(x - 4, y + 8, w + 8, 22);
  ctx.fillRect(x - 4, y + h - 30, w + 8, 22);
  ctx.strokeStyle = 'rgba(120, 100, 76, 0.7)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 4, y + 8, w + 8, 22);
  ctx.strokeRect(x - 4, y + h - 30, w + 8, 22);

  // Tinta de los cantos.
  ctx.strokeStyle = 'rgba(96, 78, 58, 0.85)';
  ctx.lineWidth = 2.6;
  wobblyLine(ctx, x + 1, y, x + 1, y + h, 1, 20);
  wobblyLine(ctx, x + w - 1, y, x + w - 1, y + h, 1, 20);
}

function paintStainedGlass(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  ctx.fillStyle = '#f0b45a';
  ctx.fillRect(x, y, w, h);

  // Rombos alternos ámbar / verde teja con plomo oscuro.
  const d = 30;
  for (let row = -1; row * d * 0.5 < h + d; row++) {
    for (let col = -1; col * d < w + d; col++) {
      const cx = x + col * d + (row % 2 ? d * 0.5 : 0);
      const cy = y + row * d * 0.5;
      const kind = ((row + col) % 3 + 3) % 3;
      ctx.fillStyle = kind === 0 ? '#6fa8a0' : kind === 1 ? '#f0b45a' : '#e8c98a';
      ctx.beginPath();
      ctx.moveTo(cx, cy - d * 0.5);
      ctx.lineTo(cx + d * 0.5, cy);
      ctx.lineTo(cx, cy + d * 0.5);
      ctx.lineTo(cx - d * 0.5, cy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(52, 40, 30, 0.55)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function paintStainedWindow(
  ctx: Ctx,
  cx: number,
  top: number,
  width: number,
  height: number
): void {
  const r = width * 0.5;

  // Arco de piedra tallada.
  ctx.save();
  ctx.lineWidth = 16;
  ctx.strokeStyle = '#e2d4b8';
  ctx.beginPath();
  ctx.arc(cx, top + r, r + 8, Math.PI, 0, false);
  ctx.stroke();
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = 'rgba(120, 100, 76, 0.8)';
  ctx.beginPath();
  ctx.arc(cx, top + r, r + 16, Math.PI, 0, false);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, top + r, r + 0.5, Math.PI, 0, false);
  ctx.stroke();
  ctx.restore();

  // Vidriera emplomada.
  archPath(ctx, cx, top, width, height);
  ctx.save();
  ctx.clip();
  paintStainedGlass(ctx, cx - r, top, width, height);
  ctx.restore();

  // Parteluz y tracería.
  ctx.fillStyle = '#d8c9ae';
  ctx.fillRect(cx - 3, top + r * 0.5, 6, height - r * 0.5);
  ctx.fillRect(cx - r, top + height * 0.55, width, 6);
  ctx.beginPath();
  ctx.arc(cx, top + r * 0.62, r * 0.34, 0, Math.PI * 2);
  ctx.fillStyle = '#e8dcc6';
  ctx.fill();
  ctx.strokeStyle = 'rgba(120, 100, 76, 0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();

  archPath(ctx, cx, top, width, height);
  ctx.lineWidth = 3.4;
  ctx.strokeStyle = 'rgba(96, 78, 58, 0.9)';
  ctx.stroke();
}

function paintCarvedArch(ctx: Ctx, cx: number, top: number, w: number, h: number): void {
  archPath(ctx, cx, top, w, h);
  const gradient = ctx.createLinearGradient(0, top, 0, top + h);
  gradient.addColorStop(0, '#efe4cd');
  gradient.addColorStop(1, '#d6c6a8');
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(120, 100, 76, 0.8)';
  ctx.stroke();

  // Roleo tallado en el centro del arco ciego.
  ctx.beginPath();
  ctx.arc(cx, top + h * 0.42, w * 0.16, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(150, 126, 96, 0.75)';
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, top + h * 0.42, w * 0.07, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(150, 126, 96, 0.5)';
  ctx.fill();
}

function paintCivic(ctx: Ctx): void {
  const rng = createRng(0xc1f1c0);

  // Sillería de caliza cálida.
  ctx.fillStyle = '#e8dcc6';
  ctx.fillRect(0, 0, TILE, TILE);

  const courseH = 64;
  const blockW = 128;
  for (let r = 0; r < TILE / courseH; r++) {
    const offset = (r % 2) * blockW * 0.5;
    for (let c = -1; c <= TILE / blockW; c++) {
      const x = c * blockW + offset;
      const y = r * courseH;
      ctx.fillStyle = shadeHex('#e8dcc6', 0.94 + rng() * 0.12);
      ctx.fillRect(x + 1.5, y + 1.5, blockW - 3, courseH - 3);
      ctx.strokeStyle = 'rgba(150, 128, 100, 0.45)';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(x + 1.5, y + 1.5, blockW - 3, courseH - 3);
    }
  }

  // Pilastras verticales en los bordes (una por junta al teselar).
  paintPilaster(ctx, 0, 0, 56, TILE);
  paintPilaster(ctx, TILE - 56, 0, 56, TILE);

  // Vidrieras arqueadas.
  paintStainedWindow(ctx, 150, 76, 152, 250);
  paintStainedWindow(ctx, 362, 76, 152, 250);

  // Friso tallado con arquería ciega.
  for (let i = 0; i < 4; i++) {
    paintCarvedArch(ctx, 64 + i * 128, 372, 108, 128);
  }

  drawHalftone(ctx, '#a08a68', 8, 1.3, 0.06);
}

// ----------------------------------------------------------------------------
// 6. Bajos: sillería de pizarra mojada + viga de bronce remachada
// ----------------------------------------------------------------------------

function paintRivet(ctx: Ctx, x: number, y: number, r: number): void {
  const gradient = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r);
  gradient.addColorStop(0, '#d8b98a');
  gradient.addColorStop(0.6, '#a98a63');
  gradient.addColorStop(1, '#5e4630');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(38, 26, 16, 0.85)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

function paintBronzeGirder(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  vertical = false
): void {
  const gradient = vertical
    ? ctx.createLinearGradient(x, 0, x + w, 0)
    : ctx.createLinearGradient(0, y, 0, y + h);
  gradient.addColorStop(0, '#9a7d5c');
  gradient.addColorStop(0.35, '#7a6148');
  gradient.addColorStop(0.75, '#6a523c');
  gradient.addColorStop(1, '#4e3c2c');
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, w, h);

  // Pátina y manchas de óxido.
  const rng = createRng(0xb20e2e);
  for (let i = 0; i < 10; i++) {
    paintSoftBlotch(
      ctx,
      x + rng() * w,
      y + rng() * h,
      18 + rng() * 46,
      'rgba(58, 44, 30, 0.35)',
      'rgba(58, 44, 30, 0)'
    );
  }

  // Costura central de la viga.
  ctx.strokeStyle = 'rgba(40, 28, 18, 0.7)';
  ctx.lineWidth = 2;
  if (vertical) {
    wobblyLine(ctx, x + w * 0.5, y, x + w * 0.5, y + h, 1, 20);
  } else {
    wobblyLine(ctx, x, y + h * 0.5, x + w, y + h * 0.5, 1, 20);
  }

  // Remaches a lo largo de los dos cantos largos.
  const step = 32;
  if (vertical) {
    for (let ry = y + step * 0.5; ry < y + h; ry += step) {
      paintRivet(ctx, x + 12, ry, 5.4);
      paintRivet(ctx, x + w - 12, ry, 5.4);
    }
  } else {
    for (let rx = x + step * 0.5; rx < x + w; rx += step) {
      paintRivet(ctx, rx, y + 13, 5.4);
      paintRivet(ctx, rx, y + h - 13, 5.4);
    }
  }

  // Tinta de los cantos.
  ctx.strokeStyle = 'rgba(32, 22, 14, 0.9)';
  ctx.lineWidth = 3;
  if (vertical) {
    wobblyLine(ctx, x + 1, y, x + 1, y + h, 1, 22);
    wobblyLine(ctx, x + w - 1, y, x + w - 1, y + h, 1, 22);
  } else {
    wobblyLine(ctx, x, y + 1, x + w, y + 1, 1, 22);
    wobblyLine(ctx, x, y + h - 1, x + w, y + h - 1, 1, 22);
  }
}

function paintUnder(ctx: Ctx): void {
  const rng = createRng(0x0de2a7);

  // Mortero de pizarra.
  ctx.fillStyle = '#2f3542';
  ctx.fillRect(0, 0, TILE, TILE);

  // Sillería: 128×64 divide 512 exacto, así el teselado no deja costura.
  const courseH = 64;
  const blockW = 128;
  for (let r = 0; r < TILE / courseH; r++) {
    const offset = (r % 2) * blockW * 0.5;
    for (let c = -1; c <= TILE / blockW; c++) {
      const x = c * blockW + offset;
      const y = r * courseH;
      const tone = 0.82 + rng() * 0.24;
      ctx.fillStyle = shadeHex('#5e6678', tone);
      ctx.beginPath();
      ctx.rect(x + 2, y + 2, blockW - 4, courseH - 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(24, 28, 38, 0.8)';
      ctx.lineWidth = 2.4;
      ctx.stroke();

      // Grietas finas del sillar.
      if (rng() > 0.5) {
        ctx.strokeStyle = 'rgba(26, 30, 40, 0.55)';
        ctx.lineWidth = 1.2;
        const gx = x + 12 + rng() * (blockW - 40);
        const gy = y + 8 + rng() * (courseH - 24);
        wobblyLine(ctx, gx, gy, gx + 10 + rng() * 18, gy + 8 + rng() * 14, 1.4, 4);
      }
    }
  }

  // Viga de bronce horizontal y cinta vertical (una por junta al teselar).
  paintBronzeGirder(ctx, 0, 180, TILE, 140);
  paintBronzeGirder(ctx, 0, 0, 56, TILE, true);

  // Sombra húmeda en las juntas inferiores de la viga.
  const damp = ctx.createLinearGradient(0, 320, 0, 392);
  damp.addColorStop(0, 'rgba(16, 20, 28, 0.45)');
  damp.addColorStop(1, 'rgba(16, 20, 28, 0)');
  ctx.fillStyle = damp;
  ctx.fillRect(0, 320, TILE, 72);

  drawHalftone(ctx, '#161a22', 8, 1.5, 0.1);
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

/**
 * Construye las seis texturas de arquitectura de Hekseville (512×512, sin
 * costuras, con mipmaps de hardware y anisotropía 8) que visten los buckets
 * `col_*` de los chunks: adoquín, casa, tienda, tejado, cívico y bajos.
 *
 * Cada tile se dibuja una sola vez con canvas 2D y se libera con el
 * `dispose()` del bundle devuelto.
 */
export function createHeksevilleArchTextures(): HeksevilleArchTextures {
  if (typeof document === 'undefined') {
    const fallback = {
      cobble: createFallbackTexture('cobble', '#d7c3a3'),
      house: createFallbackTexture('house', '#f2e4cc'),
      shop: createFallbackTexture('shop', '#e8836b'),
      roof: createFallbackTexture('roof', '#c76b4c'),
      civic: createFallbackTexture('civic', '#e8dcc6'),
      under: createFallbackTexture('under', '#5e6678'),
    };
    return {
      ...fallback,
      dispose: () => {
        for (const texture of Object.values(fallback)) texture.dispose();
      },
    };
  }

  const textures = {
    cobble: createTileTexture('cobble', paintCobble),
    house: createTileTexture('house', paintHouse),
    shop: createTileTexture('shop', paintShop),
    roof: createTileTexture('roof', paintRoof),
    civic: createTileTexture('civic', paintCivic),
    under: createTileTexture('under', paintUnder),
  };

  return {
    ...textures,
    dispose: () => {
      for (const texture of Object.values(textures)) texture.dispose();
    },
  };
}
