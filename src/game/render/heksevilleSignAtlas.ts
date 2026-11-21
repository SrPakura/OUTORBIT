import * as THREE from 'three';

// ============================================================================
// Hekseville 1:1 — Atlas procedural de carteles, rótulos y posters de cómic.
//
// Un único `CanvasTexture` de 1024×1024 dividido en una rejilla 4×4 de 16
// tiles de 256×256. Cada tile es un rótulo dibujado a mano con canvas 2D
// (tipografía gruesa, marcos de neón, flechas direccionales y motivos de
// OUTORBIT / Gravity Rush). Los materiales procedurales de la ciudad
// (`heksevilleChunkMaterials.ts`) muestrean este atlas en los buckets de
// carteles y en los escaparates de las tiendas, así que todos los rótulos de
// Pleajeune y Vendecentre salen de una sola textura: cero descargas, cero
// fugas y un solo `texture2D` por fragmento.
//
// El atlas se dibuja una sola vez (al crear la librería de materiales) y se
// libera con `texture.dispose()`.
// ============================================================================

/** Lado de la rejilla del atlas (4×4 tiles). */
export const SIGN_ATLAS_GRID = 4;
/** Lado en píxeles de cada tile. */
export const SIGN_ATLAS_TILE_SIZE = 256;
/** Número total de rótulos distintos. */
export const SIGN_ATLAS_TILE_COUNT = SIGN_ATLAS_GRID * SIGN_ATLAS_GRID;
/** Lado total en píxeles del canvas del atlas. */
export const SIGN_ATLAS_SIZE = SIGN_ATLAS_GRID * SIGN_ATLAS_TILE_SIZE;

const TILE = SIGN_ATLAS_TILE_SIZE;

// ----------------------------------------------------------------------------
// Utilidades de dibujo (canvas 2D)
// ----------------------------------------------------------------------------

type Ctx = CanvasRenderingContext2D;

/** Paleta de un tile: fondo, tinta principal, acento y brillo de neón. */
interface TilePalette {
  bg: string;
  ink: string;
  accent: string;
  glow: string;
}

function fillTile(ctx: Ctx, palette: TilePalette): void {
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, TILE, TILE);
}

/** Degradado vertical suave dentro del tile (da volumen de poster impreso). */
function fillTileGradient(ctx: Ctx, from: string, to: string): void {
  const grad = ctx.createLinearGradient(0, 0, 0, TILE);
  grad.addColorStop(0, from);
  grad.addColorStop(1, to);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, TILE, TILE);
}

/** Trama de puntos halftone (impresión cómic) sobre todo el tile. */
function drawHalftone(
  ctx: Ctx,
  color: string,
  step = 14,
  radius = 3.2,
  alpha = 0.35
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let y = step * 0.5; y < TILE; y += step) {
    const offset = (Math.floor(y / step) % 2) * step * 0.5;
    for (let x = step * 0.5 + offset; x < TILE; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Marco de neón: doble trazo con halo exterior. */
function drawNeonFrame(
  ctx: Ctx,
  color: string,
  glow: string,
  inset = 10,
  thickness = 5
): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.shadowColor = glow;
  ctx.shadowBlur = 16;
  ctx.strokeStyle = color;
  ctx.lineWidth = thickness;
  ctx.strokeRect(inset, inset, TILE - inset * 2, TILE - inset * 2);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = glow;
  ctx.lineWidth = Math.max(1, thickness * 0.35);
  ctx.strokeRect(inset + thickness, inset + thickness, TILE - (inset + thickness) * 2, TILE - (inset + thickness) * 2);
  ctx.restore();
}

/** Marco de comic: borde grueso de tinta + filete interior. */
function drawComicFrame(ctx: Ctx, ink: string, accent: string, inset = 8): void {
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 8;
  ctx.strokeRect(inset, inset, TILE - inset * 2, TILE - inset * 2);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.strokeRect(inset + 9, inset + 9, TILE - (inset + 9) * 2, TILE - (inset + 9) * 2);
  ctx.restore();
}

/**
 * Texto grueso centrado que se encoge hasta caber en `maxWidth`. Devuelve la
 * altura final usada para poder apilar varias líneas.
 */
function drawBoldText(
  ctx: Ctx,
  text: string,
  cx: number,
  cy: number,
  size: number,
  fill: string,
  options: {
    stroke?: string;
    strokeWidth?: number;
    maxWidth?: number;
    font?: string;
    letterSpacing?: number;
  } = {}
): number {
  const {
    stroke,
    strokeWidth = 0,
    maxWidth = TILE - 44,
    font = '"Arial Black", "Helvetica Neue", Impact, sans-serif',
    letterSpacing = 0,
  } = options;

  let fontSize = size;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${fontSize}px ${font}`;
  let width = ctx.measureText(text).width + letterSpacing * Math.max(0, text.length - 1);
  if (width > maxWidth) {
    fontSize = Math.max(10, Math.floor((fontSize * maxWidth) / width));
    ctx.font = `900 ${fontSize}px ${font}`;
    width = ctx.measureText(text).width + letterSpacing * Math.max(0, text.length - 1);
  }

  if (letterSpacing !== 0) {
    // Espaciado manual: canvas 2D no expone `letterSpacing` en todos los motores.
    let x = cx - width * 0.5;
    ctx.textAlign = 'left';
    for (const ch of text) {
      if (stroke && strokeWidth > 0) {
        ctx.lineWidth = strokeWidth;
        ctx.strokeStyle = stroke;
        ctx.lineJoin = 'round';
        ctx.strokeText(ch, x, cy);
      }
      ctx.fillStyle = fill;
      ctx.fillText(ch, x, cy);
      x += ctx.measureText(ch).width + letterSpacing;
    }
  } else {
    if (stroke && strokeWidth > 0) {
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = stroke;
      ctx.lineJoin = 'round';
      ctx.strokeText(text, cx, cy);
    }
    ctx.fillStyle = fill;
    ctx.fillText(text, cx, cy);
  }
  ctx.restore();
  return fontSize;
}

/** Estrella de `points` puntas (motivo Gravity Rush / OUTORBIT). */
function drawStar(
  ctx: Ctx,
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  points: number,
  fill: string,
  stroke?: string
): void {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI * i) / points - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
  ctx.restore();
}

/** Planeta con anillo orbital (logo de OUTORBIT). */
function drawPlanetIcon(ctx: Ctx, cx: number, cy: number, radius: number, body: string, ring: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx, cy, radius * 1.75, radius * 0.55, -0.42, 0, Math.PI * 2);
  ctx.strokeStyle = ring;
  ctx.lineWidth = Math.max(2, radius * 0.22);
  ctx.stroke();
  ctx.restore();
}

/** Taza de café humeante. */
function drawCoffeeCup(ctx: Ctx, cx: number, cy: number, size: number, cup: string, steam: string): void {
  ctx.save();
  ctx.strokeStyle = cup;
  ctx.fillStyle = cup;
  ctx.lineWidth = Math.max(2, size * 0.09);
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.5, cy - size * 0.2);
  ctx.lineTo(cx + size * 0.42, cy - size * 0.2);
  ctx.lineTo(cx + size * 0.3, cy + size * 0.55);
  ctx.lineTo(cx - size * 0.38, cy + size * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + size * 0.5, cy + size * 0.1, size * 0.22, -Math.PI * 0.5, Math.PI * 0.5);
  ctx.stroke();
  ctx.strokeStyle = steam;
  ctx.lineWidth = Math.max(2, size * 0.07);
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * size * 0.26, cy - size * 0.34);
    ctx.quadraticCurveTo(
      cx + i * size * 0.26 + size * 0.16,
      cy - size * 0.62,
      cx + i * size * 0.26,
      cy - size * 0.9
    );
    ctx.stroke();
  }
  ctx.restore();
}

/** Flecha direccional gruesa (transporte / zona). */
function drawArrow(
  ctx: Ctx,
  cx: number,
  cy: number,
  size: number,
  direction: 'up' | 'down' | 'left' | 'right',
  fill: string,
  stroke?: string
): void {
  ctx.save();
  ctx.translate(cx, cy);
  const angle =
    direction === 'up'
      ? 0
      : direction === 'right'
        ? Math.PI * 0.5
        : direction === 'down'
          ? Math.PI
          : -Math.PI * 0.5;
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.55);
  ctx.lineTo(size * 0.5, size * 0.05);
  ctx.lineTo(size * 0.2, size * 0.05);
  ctx.lineTo(size * 0.2, size * 0.55);
  ctx.lineTo(-size * 0.2, size * 0.55);
  ctx.lineTo(-size * 0.2, size * 0.05);
  ctx.lineTo(-size * 0.5, size * 0.05);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
  ctx.restore();
}

/** Rayo / chispa eléctrica. */
function drawBolt(ctx: Ctx, cx: number, cy: number, size: number, fill: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx + size * 0.12, cy - size * 0.6);
  ctx.lineTo(cx - size * 0.34, cy + size * 0.08);
  ctx.lineTo(cx - size * 0.02, cy + size * 0.08);
  ctx.lineTo(cx - size * 0.14, cy + size * 0.62);
  ctx.lineTo(cx + size * 0.36, cy - size * 0.1);
  ctx.lineTo(cx + size * 0.04, cy - size * 0.1);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

/** Luna creciente: disco lleno menos un círculo desplazado del color de fondo. */
function drawCrescent(
  ctx: Ctx,
  cx: number,
  cy: number,
  radius: number,
  fill: string,
  bg: string
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + radius * 0.55, cy - radius * 0.35, radius * 0.92, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.restore();
}

/** Farolillo / linterna colgante. */
function drawLantern(ctx: Ctx, cx: number, cy: number, size: number, body: string, glow: string): void {
  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur = 18;
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 0.55, size * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = glow;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy - size * 0.95);
  ctx.lineTo(cx, cy - size * 0.72);
  ctx.stroke();
  ctx.restore();
}

/** Franjas horizontales de toldo (tiendas y marquesinas). */
function drawAwningStripes(ctx: Ctx, y: number, height: number, a: string, b: string, stripeWidth = 26): void {
  ctx.save();
  for (let x = 0, i = 0; x < TILE; x += stripeWidth, i++) {
    ctx.fillStyle = i % 2 === 0 ? a : b;
    ctx.fillRect(x, y, stripeWidth, height);
  }
  ctx.restore();
}

/** Líneas de velocidad cinéticas (banner de calle). */
function drawSpeedLines(ctx: Ctx, color: string, count = 9): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const y = 26 + (i * (TILE - 52)) / (count - 1);
    const len = 40 + ((i * 37) % 90);
    ctx.globalAlpha = 0.18 + ((i * 13) % 40) / 100;
    ctx.lineWidth = 2 + (i % 3);
    ctx.beginPath();
    ctx.moveTo(18, y);
    ctx.lineTo(18 + len, y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Rejilla de píxeles tipo arcade. */
function drawPixelGrid(ctx: Ctx, color: string, step = 22, alpha = 0.22): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  for (let x = 0; x <= TILE; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, TILE);
    ctx.stroke();
  }
  for (let y = 0; y <= TILE; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(TILE, y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Scanlines de pantalla de estudio (LIVE TV). */
function drawScanlines(ctx: Ctx, color: string, step = 6, alpha = 0.16): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let y = 0; y < TILE; y += step) ctx.fillRect(0, y, TILE, 2);
  ctx.restore();
}

/** Insignia circular con texto (BISTRO 77). */
function drawBadge(ctx: Ctx, cx: number, cy: number, radius: number, fill: string, ring: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = ring;
  ctx.stroke();
  ctx.restore();
}

// ----------------------------------------------------------------------------
// Los 16 tiles
// ----------------------------------------------------------------------------

type TilePainter = (ctx: Ctx) => void;

const TILE_PAINTERS: readonly TilePainter[] = [
  // 1 — OUTORBIT 24H: neón cian/oro con icono de planeta.
  (ctx) => {
    fillTileGradient(ctx, '#0b1230', '#182a5c');
    drawHalftone(ctx, '#2f6bd8', 16, 2.6, 0.22);
    drawNeonFrame(ctx, '#5df3ff', '#2ad4ff', 10, 5);
    drawPlanetIcon(ctx, 128, 66, 26, '#ffd166', '#5df3ff');
    drawBoldText(ctx, 'OUTORBIT', 128, 132, 40, '#5df3ff', {
      stroke: '#062033',
      strokeWidth: 6,
      maxWidth: 210,
    });
    drawBoldText(ctx, '24H', 128, 190, 44, '#ffd166', {
      stroke: '#062033',
      strokeWidth: 6,
      maxWidth: 150,
    });
  },

  // 2 — KITSUNE CAFÉ: toldo coral/crema y taza humeante.
  (ctx) => {
    fillTile(ctx, { bg: '#fff4e2', ink: '#7a2f1d', accent: '#ff7a59', glow: '#ffb38a' });
    drawAwningStripes(ctx, 0, 46, '#ff7a59', '#fff4e2', 32);
    drawCoffeeCup(ctx, 128, 118, 62, '#7a2f1d', '#ff9d7a');
    drawBoldText(ctx, 'KITSUNE', 128, 178, 34, '#c2410c', {
      stroke: '#fff4e2',
      strokeWidth: 5,
      maxWidth: 214,
    });
    drawBoldText(ctx, 'CAFÉ', 128, 216, 30, '#7a2f1d', { maxWidth: 150 });
    drawComicFrame(ctx, '#7a2f1d', '#ff7a59', 8);
  },

  // 3 — GRAVITY TEA: menta/lavanda con destellos de estrella.
  (ctx) => {
    fillTileGradient(ctx, '#d9f7ea', '#c9c2ff');
    drawHalftone(ctx, '#8a6de8', 18, 2.2, 0.18);
    drawStar(ctx, 44, 46, 16, 6, 5, '#8a6de8');
    drawStar(ctx, 208, 58, 12, 5, 5, '#2fbf9b');
    drawStar(ctx, 196, 196, 14, 5, 5, '#8a6de8');
    drawBoldText(ctx, 'GRAVITY', 128, 104, 38, '#0f766e', {
      stroke: '#ffffff',
      strokeWidth: 6,
      maxWidth: 212,
    });
    drawBoldText(ctx, 'TEA', 128, 164, 52, '#6d28d9', {
      stroke: '#ffffff',
      strokeWidth: 6,
      maxWidth: 160,
    });
    drawBoldText(ctx, '· EST. 24 ·', 128, 212, 18, '#0f766e', { maxWidth: 190 });
    drawComicFrame(ctx, '#0f766e', '#8a6de8', 8);
  },

  // 4 — PLEAJEUNE ★: marquesina magenta eléctrica sobre halftone.
  (ctx) => {
    fillTile(ctx, { bg: '#ff2fa0', ink: '#3b0a2a', accent: '#ffe066', glow: '#ff8ad0' });
    drawHalftone(ctx, '#c2185b', 15, 3.4, 0.4);
    drawNeonFrame(ctx, '#ffe066', '#fff3a8', 12, 5);
    drawBoldText(ctx, 'PLEAJEUNE', 128, 112, 34, '#ffffff', {
      stroke: '#3b0a2a',
      strokeWidth: 7,
      maxWidth: 208,
    });
    drawStar(ctx, 128, 172, 34, 14, 5, '#ffe066', '#3b0a2a');
    drawBoldText(ctx, '★ FERIA ★', 128, 222, 20, '#ffe066', { maxWidth: 190 });
  },

  // 5 — METRO ►: flecha de tránsito amarilla sobre índigo.
  (ctx) => {
    fillTileGradient(ctx, '#1b2a6b', '#0f1a45');
    drawHalftone(ctx, '#3b5bdb', 17, 2.4, 0.2);
    drawArrow(ctx, 196, 128, 96, 'right', '#ffd60a', '#0f1a45');
    drawBoldText(ctx, 'METRO', 96, 112, 44, '#ffd60a', {
      stroke: '#0f1a45',
      strokeWidth: 6,
      maxWidth: 150,
    });
    drawBoldText(ctx, 'LÍNEA 7', 96, 168, 22, '#ffffff', { maxWidth: 140 });
    drawComicFrame(ctx, '#ffd60a', '#3b5bdb', 8);
  },

  // 6 — ASTRO RAMEN: farolillo ámbar/rojo.
  (ctx) => {
    fillTileGradient(ctx, '#3a0f14', '#6b1420');
    drawHalftone(ctx, '#ff9a3c', 16, 2.6, 0.2);
    drawLantern(ctx, 128, 74, 40, '#ff9a3c', '#ffd166');
    drawBoldText(ctx, 'ASTRO', 128, 148, 40, '#ffd166', {
      stroke: '#2a0a0e',
      strokeWidth: 6,
      maxWidth: 200,
    });
    drawBoldText(ctx, 'RAMEN', 128, 196, 38, '#ff6b6b', {
      stroke: '#2a0a0e',
      strokeWidth: 6,
      maxWidth: 200,
    });
    drawComicFrame(ctx, '#ffd166', '#ff6b6b', 8);
  },

  // 7 — NEON ARCADE: rejilla de píxeles violeta/cian y rayo.
  (ctx) => {
    fillTileGradient(ctx, '#2a0f4a', '#120a2e');
    drawPixelGrid(ctx, '#5df3ff', 22, 0.2);
    drawBolt(ctx, 128, 74, 62, '#5df3ff');
    drawBoldText(ctx, 'NEON', 128, 148, 42, '#c084fc', {
      stroke: '#120a2e',
      strokeWidth: 6,
      maxWidth: 190,
    });
    drawBoldText(ctx, 'ARCADE', 128, 196, 34, '#5df3ff', {
      stroke: '#120a2e',
      strokeWidth: 6,
      maxWidth: 200,
    });
    drawNeonFrame(ctx, '#c084fc', '#5df3ff', 10, 4);
  },

  // 8 — MODA SKY: rayas melocotón/rosa de boutique.
  (ctx) => {
    fillTile(ctx, { bg: '#ffd9c0', ink: '#8a2f4a', accent: '#ff8fa3', glow: '#ffc2cf' });
    drawAwningStripes(ctx, 0, 34, '#ff8fa3', '#ffd9c0', 28);
    drawAwningStripes(ctx, TILE - 34, 34, '#ff8fa3', '#ffd9c0', 28);
    drawBoldText(ctx, 'MODA', 128, 104, 46, '#8a2f4a', {
      stroke: '#fff1e6',
      strokeWidth: 6,
      maxWidth: 200,
    });
    drawBoldText(ctx, 'SKY', 128, 160, 46, '#c2185b', {
      stroke: '#fff1e6',
      strokeWidth: 6,
      maxWidth: 170,
    });
    drawBoldText(ctx, 'ALTA COSTURA', 128, 208, 18, '#8a2f4a', { maxWidth: 200 });
    drawComicFrame(ctx, '#8a2f4a', '#ff8fa3', 8);
  },

  // 9 — ▲ ZONA ALTA: panel direccional azul cielo.
  (ctx) => {
    fillTileGradient(ctx, '#2f8fe0', '#1b5fa8');
    drawHalftone(ctx, '#ffffff', 18, 2.2, 0.16);
    drawArrow(ctx, 128, 78, 84, 'up', '#ffffff', '#0f3f70');
    drawBoldText(ctx, 'ZONA', 128, 152, 40, '#ffffff', {
      stroke: '#0f3f70',
      strokeWidth: 6,
      maxWidth: 190,
    });
    drawBoldText(ctx, 'ALTA', 128, 198, 40, '#ffe066', {
      stroke: '#0f3f70',
      strokeWidth: 6,
      maxWidth: 190,
    });
    drawComicFrame(ctx, '#ffffff', '#0f3f70', 8);
  },

  // 10 — ▼ SUBURBIOS: panel industrial naranja/pizarra.
  (ctx) => {
    fillTileGradient(ctx, '#3b4450', '#22282f');
    drawAwningStripes(ctx, 0, 26, '#ff9a3c', '#22282f', 30);
    drawAwningStripes(ctx, TILE - 26, 26, '#ff9a3c', '#22282f', 30);
    drawArrow(ctx, 128, 84, 76, 'down', '#ff9a3c', '#14181d');
    drawBoldText(ctx, 'SUBURBIOS', 128, 158, 30, '#ffb066', {
      stroke: '#14181d',
      strokeWidth: 6,
      maxWidth: 214,
    });
    drawBoldText(ctx, 'ZONA INDUSTRIAL', 128, 202, 17, '#cfd8e3', { maxWidth: 210 });
    drawComicFrame(ctx, '#ff9a3c', '#cfd8e3', 8);
  },

  // 11 — BISTRO 77: insignia europea cobalto/marfil.
  (ctx) => {
    fillTileGradient(ctx, '#1e3a8a', '#122457');
    drawHalftone(ctx, '#93c5fd', 17, 2.2, 0.16);
    drawBadge(ctx, 128, 128, 92, '#f8f5ec', '#c9a227');
    drawBoldText(ctx, 'BISTRO', 128, 104, 30, '#1e3a8a', { maxWidth: 150 });
    drawBoldText(ctx, '77', 128, 158, 52, '#c9a227', { maxWidth: 120 });
    drawBoldText(ctx, '· DESDE 1977 ·', 128, 214, 15, '#f8f5ec', { maxWidth: 200 });
    drawComicFrame(ctx, '#c9a227', '#f8f5ec', 8);
  },

  // 12 — STAR BOOKS: insignia verde azulado con luna creciente dorada.
  (ctx) => {
    fillTileGradient(ctx, '#0f5f5c', '#083c3a');
    drawHalftone(ctx, '#ffd166', 18, 2.2, 0.16);
    drawCrescent(ctx, 128, 74, 34, '#ffd166', '#0b4a48');
    drawBoldText(ctx, 'STAR', 128, 146, 40, '#ffd166', {
      stroke: '#04211f',
      strokeWidth: 6,
      maxWidth: 190,
    });
    drawBoldText(ctx, 'BOOKS', 128, 192, 34, '#e6fffb', {
      stroke: '#04211f',
      strokeWidth: 6,
      maxWidth: 200,
    });
    drawComicFrame(ctx, '#ffd166', '#e6fffb', 8);
  },

  // 13 — LIVE TV · ON AIR: pantalla de estudio con scanlines.
  (ctx) => {
    fillTileGradient(ctx, '#14161f', '#232838');
    drawScanlines(ctx, '#5df3ff', 6, 0.12);
    ctx.save();
    ctx.fillStyle = '#e11d48';
    ctx.beginPath();
    ctx.moveTo(78, 26);
    ctx.lineTo(178, 26);
    ctx.quadraticCurveTo(198, 26, 198, 46);
    ctx.quadraticCurveTo(198, 66, 178, 66);
    ctx.lineTo(78, 66);
    ctx.quadraticCurveTo(58, 66, 58, 46);
    ctx.quadraticCurveTo(58, 26, 78, 26);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    drawBoldText(ctx, 'ON AIR', 128, 47, 24, '#ffffff', { maxWidth: 120 });
    drawBoldText(ctx, 'LIVE TV', 128, 116, 44, '#5df3ff', {
      stroke: '#0a0c12',
      strokeWidth: 6,
      maxWidth: 210,
    });
    drawBoldText(ctx, 'CANAL 24 · OUTORBIT', 128, 172, 18, '#ffd166', { maxWidth: 214 });
    drawBoldText(ctx, '● REC', 128, 210, 20, '#e11d48', { maxWidth: 120 });
    drawNeonFrame(ctx, '#5df3ff', '#2ad4ff', 10, 4);
  },

  // 14 — FLY ZONE ◄►: banner cinético con líneas de velocidad.
  (ctx) => {
    fillTileGradient(ctx, '#ff7a18', '#c2185b');
    drawSpeedLines(ctx, '#ffffff', 11);
    drawArrow(ctx, 44, 128, 62, 'left', '#ffffff', '#7a1030');
    drawArrow(ctx, 212, 128, 62, 'right', '#ffffff', '#7a1030');
    drawBoldText(ctx, 'FLY', 128, 96, 46, '#ffffff', {
      stroke: '#7a1030',
      strokeWidth: 7,
      maxWidth: 150,
    });
    drawBoldText(ctx, 'ZONE', 128, 152, 46, '#ffe066', {
      stroke: '#7a1030',
      strokeWidth: 7,
      maxWidth: 160,
    });
    drawBoldText(ctx, '◄►', 128, 200, 26, '#ffffff', { maxWidth: 120 });
    drawComicFrame(ctx, '#ffffff', '#7a1030', 8);
  },

  // 15 — OPEN · ABIERTO: marquesina a rayas de tienda.
  (ctx) => {
    fillTile(ctx, { bg: '#fff8e7', ink: '#b91c1c', accent: '#1d4ed8', glow: '#fca5a5' });
    drawAwningStripes(ctx, 0, 40, '#b91c1c', '#fff8e7', 30);
    drawAwningStripes(ctx, TILE - 40, 40, '#b91c1c', '#fff8e7', 30);
    drawBoldText(ctx, 'OPEN', 128, 106, 48, '#b91c1c', {
      stroke: '#fff8e7',
      strokeWidth: 6,
      maxWidth: 200,
    });
    drawBoldText(ctx, '· ABIERTO ·', 128, 160, 30, '#1d4ed8', { maxWidth: 210 });
    drawBoldText(ctx, '09:00 — 23:00', 128, 204, 20, '#7f1d1d', { maxWidth: 200 });
    drawComicFrame(ctx, '#b91c1c', '#1d4ed8', 8);
  },

  // 16 — ★ GRAV-CAR ★: poster retro con marco de cómic.
  (ctx) => {
    fillTileGradient(ctx, '#ffd166', '#ff9f1c');
    drawHalftone(ctx, '#c2410c', 14, 3.2, 0.28);
    drawStar(ctx, 40, 40, 18, 7, 5, '#c2410c');
    drawStar(ctx, 216, 40, 18, 7, 5, '#c2410c');
    drawBoldText(ctx, 'GRAV-CAR', 128, 108, 36, '#7c2d12', {
      stroke: '#fff3c4',
      strokeWidth: 7,
      maxWidth: 208,
    });
    drawBoldText(ctx, '★', 128, 158, 40, '#c2410c', { maxWidth: 80 });
    drawBoldText(ctx, 'TALLER 24H', 128, 200, 22, '#7c2d12', { maxWidth: 200 });
    drawComicFrame(ctx, '#7c2d12', '#fff3c4', 8);
  },
];

// ----------------------------------------------------------------------------
// API pública
// ----------------------------------------------------------------------------

/**
 * Construye el atlas procedural de rótulos de Hekseville: un `CanvasTexture`
 * de 1024×1024 con 16 tiles de 256×256 (rejilla 4×4) dibujados con canvas 2D.
 *
 * El muestreo esperado es `uv = ( tile + fract( uvLocal ) ) / 4.0`, con
 * `tile = vec2( mod( idx, 4.0 ), floor( idx / 4.0 ) )`. Los tiles se dibujan
 * con un margen interior para que el filtrado bilineal y los mipmaps no
 * sangren el color del vecino.
 *
 * La textura se libera con `texture.dispose()` (no hay recursos extra).
 */
export function createHeksevilleSignAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = SIGN_ATLAS_SIZE;
  canvas.height = SIGN_ATLAS_SIZE;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // Sin contexto 2D (entorno sin canvas): textura de un píxel para que el
    // shader siga compilando y muestreando un color plano.
    const fallback = new THREE.CanvasTexture(canvas);
    fallback.colorSpace = THREE.SRGBColorSpace;
    fallback.generateMipmaps = true;
    fallback.minFilter = THREE.LinearMipmapLinearFilter;
    fallback.magFilter = THREE.LinearFilter;
    fallback.anisotropy = 8;
    fallback.needsUpdate = true;
    return fallback;
  }

  ctx.imageSmoothingEnabled = true;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (let i = 0; i < SIGN_ATLAS_TILE_COUNT; i++) {
    const col = i % SIGN_ATLAS_GRID;
    const row = Math.floor(i / SIGN_ATLAS_GRID);
    ctx.save();
    ctx.translate(col * TILE, row * TILE);
    ctx.beginPath();
    ctx.rect(0, 0, TILE, TILE);
    ctx.clip();
    TILE_PAINTERS[i](ctx);
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'heksevilleSignAtlas';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  // Mipmaps de hardware + anisotropía 8: los rótulos vistos en ángulo rasante
  // (los carteles en A de Pleajeune) se filtran en el hardware en vez de
  // convertirse en estática rosa de televisor.
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}
