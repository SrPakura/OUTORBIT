import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {
  CityBoxCollider,
  CityCylinderCollider,
  CityDistrictId,
  NpcSpec,
  WaterBubbleSpec,
} from '../types';
import { createComicCelMaterial } from './toonMaterials';

// ============================================================================
// Hekseville Cósmica — Ciudad plana multinivel estilo Gravity Rush × OUTORBIT.
//
// Mapa único y continuo (SIN planetas esféricos): Pilar Central en el origen,
// Auldnoir al este, Pleajeune al sur, Endestria al norte y Vendecentre al
// oeste, unidos por 4 puentes/viaductos con escalones de <= 1.15 m por
// peldaño. Las posiciones y cotas siguen el blueprint real a escala 0.55x
// con ~5-10% de variación estilizada y edificios 100% originales.
//
// RENDIMIENTO MÓVIL: toda la geometría estática se fusiona por material con
// `mergeGeometries` en ~15 mallas cel + 4 glow + 1 agua + 5 contornos de
// tinta (BackSide inflado) + mar de nubes = ~28 draw calls en total.
// ============================================================================

export interface BuiltHeksevilleCity {
  group: THREE.Group;
  boxes: CityBoxCollider[];
  cylinders: CityCylinderCollider[];
  waterBubbles: WaterBubbleSpec[];
  npcs: NpcSpec[];
  spawnPos: [number, number, number];
  update: (dt: number) => void;
}

// ----------------------------------------------------------------------------
// Constantes de estilo
// ----------------------------------------------------------------------------

/** Inflado (m) de la geometría de contorno de tinta (Inverted Hull). */
const OUTLINE_INFLATE = 0.22;
const OUTLINE_COLOR = 0x090b14;
/** Salto máximo cómodo por peldaño (requisito: <= 1.2 m). */
const STEP_MAX_RISE = 1.15;

// Claves de bucket de material (1 malla fusionada por clave).
const CEL_STONE = 'stone'; // plataformas, puentes y escalinatas cálidas
const CEL_TERRA = 'terra'; // muros terracota de Auldnoir
const CEL_CREAM = 'cream'; // muros crema / cornisas
const CEL_ROOF = 'roof'; // tejados azul pizarra
const CEL_PLEA = 'plea'; // plataformas de Pleajeune
const CEL_MAGENTA = 'magenta';
const CEL_CYAN = 'cyan';
const CEL_STEEL = 'steel'; // acero industrial de Endestria
const CEL_RUST = 'rust'; // óxido / grúas
const CEL_VEN = 'ven'; // pizarra violeta de Vendecentre
const CEL_IVORY = 'ivory';
const CEL_PILLAR = 'pillarStone'; // piedra índigo del Pilar
const CEL_TRIM = 'trim'; // acentos oscuros (barandillas, farolas, vallas)
const CEL_CLOUD = 'cloud';
const CEL_CLOUD_WARM = 'cloudWarm';
const GLOW_WINDOW = 'glowWindow';
const GLOW_MAGENTA = 'glowMagenta';
const GLOW_CYAN = 'glowCyan';
const GLOW_VIOLET = 'glowViolet';
const WATER = 'water';

function createCityMaterials(): Map<string, THREE.Material> {
  const mats = new Map<string, THREE.Material>();
  mats.set(CEL_STONE, createComicCelMaterial('#c9a97c'));
  mats.set(CEL_TERRA, createComicCelMaterial('#c96f4a'));
  mats.set(CEL_CREAM, createComicCelMaterial('#f4e6cc'));
  mats.set(CEL_ROOF, createComicCelMaterial('#4f7396'));
  mats.set(CEL_PLEA, createComicCelMaterial('#e6d5f5'));
  mats.set(CEL_MAGENTA, createComicCelMaterial('#e34fa0', { rimColor: '#ff9ad8' }));
  mats.set(CEL_CYAN, createComicCelMaterial('#3ec9dd', { rimColor: '#a8f2ff' }));
  mats.set(CEL_STEEL, createComicCelMaterial('#8496ad'));
  mats.set(CEL_RUST, createComicCelMaterial('#c97a3f'));
  mats.set(CEL_VEN, createComicCelMaterial('#5c607e', { rimColor: '#b9b3ff' }));
  mats.set(CEL_IVORY, createComicCelMaterial('#efe9dc'));
  mats.set(CEL_PILLAR, createComicCelMaterial('#6f5fa8', { rimColor: '#9df3ff' }));
  mats.set(CEL_TRIM, createComicCelMaterial('#2c3049'));
  mats.set(CEL_CLOUD, createComicCelMaterial('#f3ecff', { rimStrength: 0.35 }));
  mats.set(CEL_CLOUD_WARM, createComicCelMaterial('#ffc7a1', { rimStrength: 0.3 }));
  mats.set(GLOW_WINDOW, new THREE.MeshBasicMaterial({ color: 0xffd76b }));
  mats.set(GLOW_MAGENTA, new THREE.MeshBasicMaterial({ color: 0xff59d0 }));
  mats.set(GLOW_CYAN, new THREE.MeshBasicMaterial({ color: 0x5df3ff }));
  mats.set(GLOW_VIOLET, new THREE.MeshBasicMaterial({ color: 0xa78bfa }));
  mats.set(
    WATER,
    createComicCelMaterial('#3fb9e8', {
      transparent: true,
      opacity: 0.72,
      emissiveBoost: 0.3,
      rimColor: '#bff4ff',
      rimStrength: 0.8,
    })
  );
  return mats;
}

// ----------------------------------------------------------------------------
// Builder: buckets de geometría por material + colliders exactos
// ----------------------------------------------------------------------------

class HeksevilleBuilder {
  readonly group = new THREE.Group();
  readonly boxes: CityBoxCollider[] = [];
  readonly cylinders: CityCylinderCollider[] = [];
  readonly waterBubbles: WaterBubbleSpec[] = [];

  private readonly solids = new Map<string, THREE.BufferGeometry[]>();
  private readonly outlines = new Map<CityDistrictId, THREE.BufferGeometry[]>();
  private colliderSeq = 0;

  constructor() {
    this.group.name = 'heksevilleCity';
  }

  // --- Buckets ------------------------------------------------------------

  private pushSolid(key: string, geo: THREE.BufferGeometry): void {
    let arr = this.solids.get(key);
    if (!arr) {
      arr = [];
      this.solids.set(key, arr);
    }
    arr.push(geo);
  }

  private pushOutline(district: CityDistrictId, geo: THREE.BufferGeometry): void {
    let arr = this.outlines.get(district);
    if (!arr) {
      arr = [];
      this.outlines.set(district, arr);
    }
    arr.push(geo);
  }

  // --- Primitivas (siempre con position/normal/uv, fusionables entre sí) ---

  /** Caja cel con contorno de tinta opcional (geometría inflada). */
  box(
    key: string,
    district: CityDistrictId,
    cx: number,
    cy: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    yaw = 0,
    withOutline = true
  ): void {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (yaw !== 0) geo.rotateY(yaw);
    geo.translate(cx, cy, cz);
    this.pushSolid(key, geo);
    if (withOutline) {
      const og = new THREE.BoxGeometry(
        w + OUTLINE_INFLATE * 2,
        h + OUTLINE_INFLATE * 2,
        d + OUTLINE_INFLATE * 2
      );
      if (yaw !== 0) og.rotateY(yaw);
      og.translate(cx, cy, cz);
      this.pushOutline(district, og);
    }
  }

  /** Cilindro vertical cel con contorno opcional. */
  cyl(
    key: string,
    district: CityDistrictId,
    cx: number,
    cy: number,
    cz: number,
    r: number,
    h: number,
    seg = 12,
    withOutline = true
  ): void {
    const geo = new THREE.CylinderGeometry(r, r, h, seg);
    geo.translate(cx, cy, cz);
    this.pushSolid(key, geo);
    if (withOutline) {
      const og = new THREE.CylinderGeometry(r + OUTLINE_INFLATE, r + OUTLINE_INFLATE, h + OUTLINE_INFLATE * 2, seg);
      og.translate(cx, cy, cz);
      this.pushOutline(district, og);
    }
  }

  /** Cono / tejado piramidal (4 lados) con contorno opcional. */
  cone(
    key: string,
    district: CityDistrictId,
    cx: number,
    cy: number,
    cz: number,
    r: number,
    h: number,
    yaw = 0,
    withOutline = true
  ): void {
    const geo = new THREE.ConeGeometry(r, h, 4, 1);
    geo.rotateY(yaw + Math.PI / 4);
    geo.translate(cx, cy, cz);
    this.pushSolid(key, geo);
    if (withOutline) {
      const og = new THREE.ConeGeometry(r + OUTLINE_INFLATE, h + OUTLINE_INFLATE * 2, 4, 1);
      og.rotateY(yaw + Math.PI / 4);
      og.translate(cx, cy, cz);
      this.pushOutline(district, og);
    }
  }

  /** Elipsoide de nube (esfera escalada, sin contorno: silueta suave). */
  blob(key: string, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number): void {
    const geo = new THREE.SphereGeometry(1, 10, 8);
    geo.scale(rx, ry, rz);
    geo.translate(cx, cy, cz);
    this.pushSolid(key, geo);
  }

  /**
   * Pieza con transformación compuesta (rotaciones no-Y) ya aplicada:
   * la geometría se recibe transformada y se fusiona tal cual. El contorno
   * opcional debe llegar ya inflado con la MISMA transformación.
   */
  pushPiece(
    key: string,
    district: CityDistrictId,
    geo: THREE.BufferGeometry,
    outlineGeo?: THREE.BufferGeometry
  ): void {
    this.pushSolid(key, geo);
    if (outlineGeo) this.pushOutline(district, outlineGeo);
  }

  /** Disco luminoso orientado (esferas de reloj, ojos de buey). */
  disc(
    key: string,
    district: CityDistrictId,
    cx: number,
    cy: number,
    cz: number,
    r: number,
    h: number,
    axis: 'x' | 'z'
  ): void {
    const geo = new THREE.CylinderGeometry(r, r, h, 16);
    if (axis === 'x') geo.rotateZ(Math.PI / 2);
    else geo.rotateX(Math.PI / 2);
    geo.translate(cx, cy, cz);
    this.pushSolid(key, geo);
  }

  // --- Colliders ----------------------------------------------------------

  /** Caja OBB sólida: la cara superior caminable queda en `cy + hy`. */
  collider(
    district: CityDistrictId,
    cx: number,
    cy: number,
    cz: number,
    hx: number,
    hy: number,
    hz: number,
    yaw = 0,
    passableUnderground = false
  ): void {
    const spec: CityBoxCollider = {
      id: `hek-box-${this.colliderSeq++}`,
      district,
      cx,
      cy,
      cz,
      hx,
      hy,
      hz,
      yaw,
    };
    if (passableUnderground) spec.passableUnderground = true;
    this.boxes.push(spec);
  }

  // --- Superficies compuestas ---------------------------------------------

  /**
   * Isla/terraza flotante: losa caminable (top = `topY`) + casco inferior en
   * dos niveles. También registra collider: la cara superior queda a `topY`.
   */
  platform(
    district: CityDistrictId,
    key: string,
    cx: number,
    cz: number,
    w: number,
    d: number,
    topY: number,
    thickness = 5,
    hull = true
  ): void {
    const cy = topY - thickness / 2;
    this.box(key, district, cx, cy, cz, w, thickness, d);
    this.collider(district, cx, cy, cz, w / 2, thickness / 2, d / 2);
    if (!hull) return;
    // Casco escalonado (caminable también desde abajo con Gravity Shift).
    const h1y = topY - thickness - 2;
    this.box(key, district, cx, h1y, cz, w - 3, 4, d - 3);
    this.collider(district, cx, h1y, cz, (w - 3) / 2, 2, (d - 3) / 2);
    const h2y = topY - thickness - 6.5;
    if (w > 14 && d > 14) {
      this.box(key, district, cx, h2y, cz, w - 9, 5, d - 9);
      this.collider(district, cx, h2y, cz, (w - 9) / 2, 2.5, (d - 9) / 2);
    }
  }

  /**
   * Escalera recta de peldaños solapados (salto <= 1.15 m por escalón).
   * `(x, z)` es el punto de arranque a cota `y0`; la escalera avanza por
   * `(dx, dz)` (un solo eje, colisiones alineadas a ejes) hasta `y1`.
   */
  stairs(
    district: CityDistrictId,
    key: string,
    x: number,
    z: number,
    dx: number,
    dz: number,
    width: number,
    y0: number,
    y1: number,
    length: number
  ): void {
    const rise = y1 - y0;
    const steps = Math.max(1, Math.ceil(Math.abs(rise) / STEP_MAX_RISE));
    const tread = length / steps;
    const stepRise = rise / steps;
    for (let i = 0; i < steps; i++) {
      const top = y0 + stepRise * (i + 1);
      const along = (i + 0.5) * tread;
      const cx = x + dx * along;
      const cz = z + dz * along;
      const h = 1.5;
      const cy = top - h / 2;
      const w = dx !== 0 ? tread + 0.15 : width;
      const d = dz !== 0 ? tread + 0.15 : width;
      this.box(key, district, cx, cy, cz, w, h, d);
      this.collider(district, cx, cy, cz, w / 2, h / 2, d / 2);
    }
  }

  /**
   * Torre-escalera de tramas en zigzag (vuelos a lo largo de X con rellanos).
   * Sube de `y0` a `y1` con peldaños de <= 1.15 m; los rellanos del lado
   * inicial apoyan sobre pilares hasta la base `y0`.
   */
  stairTower(
    district: CityDistrictId,
    key: string,
    cx: number,
    cz: number,
    y0: number,
    y1: number,
    flightLen: number,
    width: number
  ): void {
    const x0 = cx - flightLen / 2;
    const x1 = cx + flightLen / 2;
    let y = y0;
    let dir = 1;
    let guard = 0;
    while (y < y1 - 0.01 && guard++ < 24) {
      const target = Math.min(y + 16.8, y1);
      if (dir > 0) {
        this.stairs(district, key, x0, cz, 1, 0, width, y, target, flightLen);
      } else {
        this.stairs(district, key, x1, cz, -1, 0, width, y, target, flightLen);
      }
      const lx = dir > 0 ? x1 : x0;
      this.platform(district, key, lx, cz, width + 4, width + 4, target, 1.2, false);
      // Pilar de apoyo en el rellano del lado inicial (sobre la base y0).
      if (lx === x0 && target - y0 > 2) {
        const ph = target - 1.2 - y0;
        this.box(CEL_TRIM, district, x0, y0 + ph / 2, cz, 1.6, ph, 1.6);
        this.collider(district, x0, y0 + ph / 2, cz, 0.8, ph / 2, 0.8);
      }
      y = target;
      dir = -dir;
    }
  }

  /** Pilar de apoyo bajo un rellano flotante. */
  supportPillar(
    district: CityDistrictId,
    x: number,
    z: number,
    baseY: number,
    topY: number
  ): void {
    const h = topY - baseY;
    if (h <= 1) return;
    this.box(CEL_TRIM, district, x, baseY + h / 2, z, 1.6, h, 1.6);
    this.collider(district, x, baseY + h / 2, z, 0.8, h / 2, 0.8);
  }

  // --- Edificios -----------------------------------------------------------

  /** Rejilla de ventanas brillantes en las 4 caras (sin contorno). */
  private windows(
    district: CityDistrictId,
    x: number,
    z: number,
    groundY: number,
    w: number,
    d: number,
    h: number,
    key: string,
    rowsCap: number,
    colsCap: number
  ): void {
    const rows = Math.min(rowsCap, Math.max(1, Math.floor((h - 2.5) / 2.8)));
    const colsZ = Math.min(colsCap, Math.max(1, Math.floor(w / 2.6)));
    const colsX = Math.min(colsCap, Math.max(1, Math.floor(d / 2.6)));
    for (let r = 0; r < rows; r++) {
      const wy = groundY + 2.4 + r * 2.8;
      for (let c = 0; c < colsZ; c++) {
        const wx = x - (colsZ - 1) * 1.3 + c * 2.6;
        this.box(key, district, wx, wy, z + d / 2 + 0.09, 1.1, 1.5, 0.18, 0, false);
        this.box(key, district, wx, wy, z - d / 2 - 0.09, 1.1, 1.5, 0.18, 0, false);
      }
      for (let c = 0; c < colsX; c++) {
        const wz = z - (colsX - 1) * 1.3 + c * 2.6;
        this.box(key, district, x + w / 2 + 0.09, wy, wz, 0.18, 1.5, 1.1, 0, false);
        this.box(key, district, x - w / 2 - 0.09, wy, wz, 0.18, 1.5, 1.1, 0, false);
      }
    }
  }

  /**
   * Edificio original estilo cómic: muros + cornisa + azotea caminable
   * (collider con cara superior en `groundY + h`) + ventanas luminosas.
   */
  building(
    district: CityDistrictId,
    x: number,
    z: number,
    groundY: number,
    w: number,
    d: number,
    h: number,
    style: 'auldnoir' | 'pleajeune' | 'vendecentre' | 'endestria'
  ): void {
    const parity = (Math.round(x) + Math.round(z)) % 2 === 0;
    let wallKey: string;
    let trimKey: string;
    let winKey: string;
    let rowsCap: number;
    let colsCap: number;
    switch (style) {
      case 'auldnoir':
        wallKey = parity ? CEL_TERRA : CEL_CREAM;
        trimKey = CEL_CREAM;
        winKey = GLOW_WINDOW;
        rowsCap = 3;
        colsCap = 3;
        break;
      case 'pleajeune':
        wallKey = parity ? CEL_MAGENTA : CEL_CYAN;
        trimKey = CEL_TRIM;
        winKey = parity ? GLOW_MAGENTA : GLOW_CYAN;
        rowsCap = 6;
        colsCap = 3;
        break;
      case 'vendecentre':
        wallKey = parity ? CEL_VEN : CEL_IVORY;
        trimKey = CEL_IVORY;
        winKey = GLOW_WINDOW;
        rowsCap = 10;
        colsCap = 4;
        break;
      default:
        wallKey = parity ? CEL_STEEL : CEL_RUST;
        trimKey = CEL_STEEL;
        winKey = GLOW_WINDOW;
        rowsCap = 2;
        colsCap = 2;
        break;
    }
    // Muros (azotea caminable en groundY + h).
    this.box(wallKey, district, x, groundY + h / 2, z, w, h, d);
    this.collider(district, x, groundY + h / 2, z, w / 2, h / 2, d / 2);
    // Cornisa voladiza.
    this.box(trimKey, district, x, groundY + h - 0.4, z, w + 1, 0.8, d + 1);
    if (style === 'auldnoir') {
      // Tejado azul pizarra a 4 aguas.
      const roofH = Math.max(3, Math.min(6, h * 0.4));
      this.cone(CEL_ROOF, district, x, groundY + h + roofH / 2, z, Math.max(w, d) * 0.78, roofH);
      this.windows(district, x, z, groundY, w, d, h, winKey, rowsCap, colsCap);
    } else {
      // Pretil de azotea plana.
      this.box(CEL_TRIM, district, x, groundY + h + 0.3, z, w + 0.8, 0.6, d + 0.8);
      this.windows(district, x, z, groundY, w, d, h, winKey, rowsCap, colsCap);
      if (style === 'pleajeune') {
        // Ribete de neón en el borde superior.
        this.box(winKey, district, x, groundY + h + 0.75, z, w + 1.1, 0.35, 0.35, 0, false);
        this.box(winKey, district, x, groundY + h + 0.75, z, 0.35, 0.35, d + 1.1, 0, false);
      }
    }
  }

  // --- Props urbanos --------------------------------------------------------

  /** Farola: poste oscuro + cabeza luminosa (colisionable y delgada). */
  lamp(district: CityDistrictId, x: number, groundY: number, z: number, glowKey: string): void {
    this.cyl(CEL_TRIM, district, x, groundY + 2.2, z, 0.16, 4.4, 6);
    this.box(glowKey, district, x, groundY + 4.5, z, 0.6, 0.45, 0.6, 0, false);
    this.collider(district, x, groundY + 2.2, z, 0.35, 2.2, 0.35);
  }

  /** Banco de calle con respaldo. */
  bench(district: CityDistrictId, x: number, groundY: number, z: number, yaw = 0): void {
    this.box(CEL_TRIM, district, x, groundY + 0.45, z, 2.2, 0.35, 0.7, yaw);
    this.box(CEL_TRIM, district, x, groundY + 0.85, z, 2.2, 0.6, 0.18, yaw);
    this.collider(district, x, groundY + 0.45, z, 1.1, 0.45, 0.35, yaw);
  }

  /** Arco callejero: dos pilares + dintel elevado (se pasa por debajo). */
  arch(district: CityDistrictId, x: number, groundY: number, z: number, span: number, alongX: boolean): void {
    const px = alongX ? span / 2 : 0;
    const pz = alongX ? 0 : span / 2;
    this.box(CEL_TERRA, district, x - px, groundY + 3, z - pz, 1.3, 6, 1.3);
    this.box(CEL_TERRA, district, x + px, groundY + 3, z + pz, 1.3, 6, 1.3);
    this.box(CEL_CREAM, district, x, groundY + 6.6, z, alongX ? span + 2.6 : 1.6, 1.3, alongX ? 1.6 : span + 2.6);
    this.collider(district, x - px, groundY + 3, z - pz, 0.65, 3, 0.65);
    this.collider(district, x + px, groundY + 3, z + pz, 0.65, 3, 0.65);
    this.collider(
      district,
      x,
      groundY + 6.6,
      z,
      (alongX ? span + 2.6 : 1.6) / 2,
      0.65,
      (alongX ? 1.6 : span + 2.6) / 2
    );
  }

  /** Cartelón cómic: marco oscuro + panel luminoso sobre dos postes. */
  billboard(
    district: CityDistrictId,
    x: number,
    groundY: number,
    z: number,
    yaw: number,
    glowKey: string
  ): void {
    this.box(CEL_TRIM, district, x - 2.4, groundY + 3, z, 0.5, 6, 0.5, yaw);
    this.box(CEL_TRIM, district, x + 2.4, groundY + 3, z, 0.5, 6, 0.5, yaw);
    this.box(CEL_TRIM, district, x, groundY + 7, z, 7, 5, 0.6, yaw);
    this.box(glowKey, district, x, groundY + 7, z + 0.2, 6.2, 4.2, 0.75, yaw, false);
    this.collider(district, x, groundY + 7, z, 3.5, 2.5, 0.3, yaw);
  }

  /** Valla industrial: Digger puede excavar por debajo. */
  fence(district: CityDistrictId, x: number, groundY: number, z: number, len: number, alongX: boolean): void {
    this.box(
      CEL_TRIM,
      district,
      x,
      groundY + 0.65,
      z,
      alongX ? len : 0.35,
      1.3,
      alongX ? 0.35 : len
    );
    this.collider(
      district,
      x,
      groundY + 0.65,
      z,
      (alongX ? len : 0.35) / 2,
      0.65,
      (alongX ? 0.35 : len) / 2,
      0,
      true
    );
  }

  /** Chimenea industrial con anillo luminoso en la boca. */
  chimney(district: CityDistrictId, x: number, groundY: number, z: number, r: number, h: number): void {
    this.cyl(CEL_STEEL, district, x, groundY + h / 2, z, r, h, 10);
    this.cyl(GLOW_CYAN, district, x, groundY + h - 0.4, z, r + 0.35, 1.1, 10, false);
    this.collider(district, x, groundY + h / 2, z, r, h / 2, r);
  }

  /** Reactor: cilindro + cúpula + anillo de energía en la base. */
  reactor(district: CityDistrictId, x: number, groundY: number, z: number, r: number, h: number): void {
    this.cyl(CEL_STEEL, district, x, groundY + h / 2, z, r, h, 14);
    const dome = new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.scale(1, 0.7, 1);
    dome.translate(x, groundY + h, z);
    this.pushSolid(CEL_RUST, dome);
    const od = new THREE.SphereGeometry(r + OUTLINE_INFLATE, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    od.scale(1, 0.7, 1);
    od.translate(x, groundY + h, z);
    this.pushOutline(district, od);
    this.cyl(GLOW_MAGENTA, district, x, groundY + 0.6, z, r + 0.4, 1.2, 14, false);
    this.collider(district, x, groundY + h / 2, z, r, h / 2, r);
  }

  /** Tubería aérea caminable a lo largo del eje X (collider caja). */
  pipeX(district: CityDistrictId, x0: number, x1: number, y: number, z: number, r = 2.6): void {
    const len = Math.abs(x1 - x0);
    const cx = (x0 + x1) / 2;
    const geo = new THREE.CylinderGeometry(r, r, len, 12);
    geo.rotateZ(Math.PI / 2);
    geo.translate(cx, y, z);
    this.pushSolid(CEL_STEEL, geo);
    const og = new THREE.CylinderGeometry(r + OUTLINE_INFLATE, r + OUTLINE_INFLATE, len + OUTLINE_INFLATE * 2, 12);
    og.rotateZ(Math.PI / 2);
    og.translate(cx, y, z);
    this.pushOutline(district, og);
    this.collider(district, cx, y, z, len / 2, r, r);
  }

  /** Grúa estilizada: torre + brazo + contrapeso + punta luminosa. */
  crane(district: CityDistrictId, x: number, groundY: number, z: number, h: number, armLen: number): void {
    this.box(CEL_RUST, district, x, groundY + h / 2, z, 3.4, h, 3.4);
    this.collider(district, x, groundY + h / 2, z, 1.7, h / 2, 1.7);
    this.box(CEL_STEEL, district, x + armLen / 4, groundY + h + 0.9, z, armLen / 2 + 3, 1.8, 2.2);
    this.collider(district, x + armLen / 4, groundY + h + 0.9, z, (armLen / 2 + 3) / 2, 0.9, 1.1);
    this.box(CEL_TRIM, district, x - armLen / 4 - 1.5, groundY + h + 0.9, z, 3.4, 2.4, 2.4);
    this.box(GLOW_CYAN, district, x + armLen / 2 + 1.2, groundY + h + 2.2, z, 0.7, 0.7, 0.7, 0, false);
    this.box(CEL_TRIM, district, x + armLen / 2 + 1.2, groundY + h + 1.3, z, 0.25, 2, 0.25);
  }

  /** Nave carguera flotante bajo la isla (cubierta caminable). */
  ship(district: CityDistrictId, x: number, y: number, z: number, yaw: number): void {
    this.box(CEL_STEEL, district, x, y, z, 30, 5.5, 10, yaw);
    this.collider(district, x, y, z, 15, 2.75, 5, yaw);
    // Proa en cuña.
    const bow = new THREE.ConeGeometry(5, 9, 4);
    bow.rotateY(Math.PI / 4);
    bow.rotateZ(-Math.PI / 2);
    bow.rotateY(yaw);
    bow.translate(x + Math.cos(yaw) * 19.5, y, z - Math.sin(yaw) * 19.5);
    this.pushSolid(CEL_RUST, bow);
    const ob = new THREE.ConeGeometry(5 + OUTLINE_INFLATE, 9 + OUTLINE_INFLATE * 2, 4);
    ob.rotateY(Math.PI / 4);
    ob.rotateZ(-Math.PI / 2);
    ob.rotateY(yaw);
    ob.translate(x + Math.cos(yaw) * 19.5, y, z - Math.sin(yaw) * 19.5);
    this.pushOutline(district, ob);
    // Cabina + chimenea + luces de posición.
    this.box(CEL_IVORY, district, x - Math.cos(yaw) * 9, y + 4.5, z + Math.sin(yaw) * 9, 7, 4, 8, yaw);
    this.cyl(CEL_TRIM, district, x - Math.cos(yaw) * 9, y + 8, z + Math.sin(yaw) * 9, 1.4, 4, 8);
    this.box(GLOW_MAGENTA, district, x + Math.cos(yaw) * 14, y + 3.2, z - Math.sin(yaw) * 14, 0.8, 0.8, 0.8, yaw, false);
    this.box(GLOW_CYAN, district, x - Math.cos(yaw) * 14, y + 3.2, z + Math.sin(yaw) * 14, 0.8, 0.8, 0.8, yaw, false);
  }

  /** Puesto de mercado: mostrador + toldo en dos postes. */
  stall(district: CityDistrictId, x: number, groundY: number, z: number, awningKey: string): void {
    this.box(CEL_TRIM, district, x, groundY + 0.55, z, 3, 1.1, 1.7);
    this.collider(district, x, groundY + 0.55, z, 1.5, 0.55, 0.85);
    this.box(CEL_TRIM, district, x - 1.3, groundY + 1.9, z, 0.22, 2.6, 0.22);
    this.box(CEL_TRIM, district, x + 1.3, groundY + 1.9, z, 0.22, 2.6, 0.22);
    this.box(awningKey, district, x, groundY + 3.1, z, 3.8, 0.35, 2.6);
    this.box(GLOW_WINDOW, district, x, groundY + 1.25, z + 0.9, 1.2, 0.5, 0.5, 0, false);
  }

  // --- Fusión final ---------------------------------------------------------

  /**
   * Fusiona cada bucket por material en UNA malla (draw call) y añade un
   * único mesh de contorno de tinta por distrito. Verifica que
   * `mergeGeometries` devuelva geometría no nula y descarta buckets vacíos.
   */
  finish(materials: Map<string, THREE.Material>): void {
    for (const [key, geos] of this.solids) {
      if (geos.length === 0) continue;
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      const mat = materials.get(key);
      if (!mat) {
        merged.dispose();
        continue;
      }
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `hek-${key}`;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.group.add(mesh);
    }
    const outlineMat = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
    for (const [district, geos] of this.outlines) {
      if (geos.length === 0) continue;
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, outlineMat);
      mesh.name = `hek-outline-${district}`;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.group.add(mesh);
    }
  }
}

// ----------------------------------------------------------------------------
// Pilar Central del Mundo (0, 0, 0)
// ----------------------------------------------------------------------------

function buildPillar(b: HeksevilleBuilder): void {
  // Cilindro sólido: radius 44, cy 20, halfHeight 200.
  b.cylinders.push({
    id: 'hek-pillar-core',
    district: 'pillar',
    cx: 0,
    cy: 20,
    cz: 0,
    radius: 44,
    halfHeight: 200,
  });
  b.cyl(CEL_PILLAR, 'pillar', 0, 20, 0, 44, 400, 24);

  // Anillos luminosos cian/violeta que ascienden por el fuste.
  const ringYs = [-36, 14, 60, 106, 152, 198];
  ringYs.forEach((y, i) => {
    b.cyl(i % 2 === 0 ? GLOW_CYAN : GLOW_VIOLET, 'pillar', 0, y, 0, 45.6, 1.8, 28, false);
  });
  // Baliza de la cima.
  b.cyl(GLOW_VIOLET, 'pillar', 0, 219, 0, 12, 3, 12, false);

  // Collar navegable en y = 14: anillo poligonal de 12 tramos caja.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const cx = 54 * Math.sin(a);
    const cz = 54 * Math.cos(a);
    b.box(CEL_STONE, 'pillar', cx, 13, cz, 28.6, 2, 20, a);
    b.collider('pillar', cx, 13, cz, 14.3, 1, 10, a);
  }

  // --- Puente Este -> Auldnoir (collar 14 -> plaza d1 18) ---
  b.stairs('auldnoir', CEL_STONE, 64, 8, 1, 0, 12, 14, 17, 6);
  b.platform('auldnoir', CEL_STONE, 74, 8, 10, 12, 17, 2, false);
  b.box(CEL_TRIM, 'auldnoir', 74, 17.9, 2.6, 10, 0.7, 0.4);
  b.box(CEL_TRIM, 'auldnoir', 74, 17.9, 13.4, 10, 0.7, 0.4);

  // --- Puente Sur -> Pleajeune (collar 14 -> paseo bajo dt_under 26) ---
  b.stairs('pleajeune', CEL_STONE, 0, 64, 0, 1, 12, 14, 26, 16);
  b.box(CEL_TRIM, 'pleajeune', -5.6, 25.9, 72, 0.4, 0.7, 16);
  b.box(CEL_TRIM, 'pleajeune', 5.6, 25.9, 72, 0.4, 0.7, 16);

  // --- Puente Norte -> Endestria (collar 14 -> cubierta ed_under 3) ---
  b.stairs('endestria', CEL_STONE, 0, -64, 0, -1, 12, 14, 3, 12);
  b.box(CEL_TRIM, 'endestria', -5.6, 14.4, -70, 0.4, 0.7, 12);
  b.box(CEL_TRIM, 'endestria', 5.6, 14.4, -70, 0.4, 0.7, 12);

  // --- Gran Viaducto Oeste -> Vendecentre (id_under: X -220..-42, y 19) ---
  b.platform('vendecentre', CEL_STONE, -131, -12, 178, 14, 19, 2.5, false);
  for (let x = -210; x <= -60; x += 30) {
    b.box(CEL_TRIM, 'vendecentre', x, 10.9, -12, 3, 13.7, 3);
    b.collider('vendecentre', x, 10.9, -12, 1.5, 6.85, 1.5);
  }
  b.stairs('vendecentre', CEL_STONE, -56, -12, 1, 0, 14, 14, 19, 12);
  b.box(CEL_TRIM, 'vendecentre', -131, 19.6, -18.6, 178, 0.7, 0.4);
  b.box(CEL_TRIM, 'vendecentre', -131, 19.6, -5.4, 178, 0.7, 0.4);
}

// ----------------------------------------------------------------------------
// Auldnoir (Este · X +68..+260, Z -140..+85, Y -18..+18)
// ----------------------------------------------------------------------------

function buildAuldnoir(b: HeksevilleBuilder): void {
  // Terrazas escalonadas del blueprint (d1, a, b1, e1, c1, g, cc_under).
  b.platform('auldnoir', CEL_STONE, 116, 9.5, 88, 85, 18); // d1 · plaza principal (spawn)
  b.platform('auldnoir', CEL_STONE, 127, -25.5, 66, 57, 2); // a · terraza baja
  b.platform('auldnoir', CEL_STONE, 180.5, -22.5, 67, 83, 12); // b1
  b.platform('auldnoir', CEL_STONE, 187.5, 22.5, 83, 63, 14); // e1
  b.platform('auldnoir', CEL_STONE, 223.5, -32, 67, 60, 13); // c1
  b.platform('auldnoir', CEL_STONE, 181.5, -94, 101, 78, -18); // g · muelles
  b.platform('auldnoir', CEL_STONE, 144, -33.5, 168, 123, -26); // cc_under · casco

  // Rampas de enlace entre terrazas (peldaños <= 1.15 m).
  b.stairs('auldnoir', CEL_STONE, 110, -49, 0, 1, 10, 2, 18, 16); // a -> d1
  b.stairs('auldnoir', CEL_STONE, 137, -20, 1, 0, 8, 2, 12, 10); // a -> b1
  b.stairs('auldnoir', CEL_STONE, 160, 30, 1, 0, 8, 18, 14, 12); // d1 -> e1
  b.stairs('auldnoir', CEL_STONE, 170, -45, 0, -1, 8, -26, -18, 10); // cc_under -> g
  // Switchback cc_under -> a (con rellanos apoyados sobre el casco).
  b.stairs('auldnoir', CEL_STONE, 85, -66, 1, 0, 8, -26, -12, 35);
  b.platform('auldnoir', CEL_STONE, 122, -66, 14, 12, -12, 1.2, false);
  b.supportPillar('auldnoir', 122, -66, -26, -13.2);
  b.stairs('auldnoir', CEL_STONE, 115, -66, -1, 0, 8, -12, 2, 30);
  b.platform('auldnoir', CEL_STONE, 85, -60, 14, 12, 2, 1.2, false);
  b.supportPillar('auldnoir', 85, -60, -26, 1.4);
  // Switchback g -> b1 (sobre la cubierta de g).
  b.stairs('auldnoir', CEL_STONE, 150, -76, 1, 0, 8, -18, -4, 35);
  b.platform('auldnoir', CEL_STONE, 192, -76, 14, 12, -4, 1.2, false);
  b.supportPillar('auldnoir', 192, -76, -18, -5.2);
  b.stairs('auldnoir', CEL_STONE, 185, -76, -1, 0, 8, -4, 10, 35);
  b.stairs('auldnoir', CEL_STONE, 150, -76, 0, 1, 8, 10, 12, 12);

  // Torre-reloj icónica de Auldnoir (azotea caminable a y = 43.2).
  const towerX = 148;
  const towerZ = -24;
  b.box(CEL_STONE, 'auldnoir', towerX, 18.6, towerZ, 7, 1.2, 7);
  b.collider('auldnoir', towerX, 18.6, towerZ, 3.5, 0.6, 3.5);
  b.box(CEL_TERRA, 'auldnoir', towerX, 31.2, towerZ, 5.4, 24, 5.4);
  b.collider('auldnoir', towerX, 31.2, towerZ, 2.7, 12, 2.7);
  b.box(CEL_CREAM, 'auldnoir', towerX, 42.8, towerZ, 6.2, 0.9, 6.2);
  // Esferas del reloj en las 4 caras + agujas.
  b.disc(GLOW_WINDOW, 'auldnoir', towerX, 39, towerZ + 2.85, 2.1, 0.35, 'z');
  b.disc(GLOW_WINDOW, 'auldnoir', towerX, 39, towerZ - 2.85, 2.1, 0.35, 'z');
  b.disc(GLOW_WINDOW, 'auldnoir', towerX + 2.85, 39, towerZ, 2.1, 0.35, 'x');
  b.disc(GLOW_WINDOW, 'auldnoir', towerX - 2.85, 39, towerZ, 2.1, 0.35, 'x');
  b.box(CEL_TRIM, 'auldnoir', towerX, 39.9, towerZ + 3.1, 0.28, 1.7, 0.14, 0, false);
  b.box(CEL_TRIM, 'auldnoir', towerX + 0.6, 39.3, towerZ + 3.1, 1.1, 0.24, 0.14, 0, false);
  b.cone(CEL_ROOF, 'auldnoir', towerX, 46, towerZ, 4.6, 5.5);
  b.cyl(GLOW_WINDOW, 'auldnoir', towerX, 49.4, towerZ, 0.5, 1.4, 8, false);

  // Casco antiguo: edificios terracota/crema con tejado pizarra.
  // (Se respeta el claro de la zona de spawn: x 95..135, z -5..25.)
  const houses: Array<[number, number, number, number, number, number]> = [
    // [x, z, groundY, w, d, h]
    [80, 40, 18, 6, 6, 7],
    [80, 24, 18, 5, 5, 6],
    [95, 45, 18, 6, 6, 8],
    [115, 45, 18, 7, 6, 6],
    [140, 42, 18, 6, 7, 9],
    [152, 28, 18, 6, 6, 7],
    [155, 8, 18, 5, 6, 6],
    [152, -12, 18, 6, 5, 8],
    [128, -28, 18, 6, 5, 6],
    [108, -30, 18, 6, 5, 7],
    [88, -28, 18, 5, 5, 6],
    [80, -10, 18, 5, 6, 7],
    [110, -30, 2, 6, 6, 6],
    [130, -35, 2, 6, 6, 7],
    [150, -30, 2, 5, 6, 6],
    [120, -48, 2, 6, 5, 5],
    [145, -48, 2, 5, 5, 6],
    [160, -40, 12, 6, 6, 7],
    [175, -50, 12, 6, 6, 6],
    [195, -45, 12, 6, 5, 8],
    [205, -25, 12, 5, 6, 6],
    [185, -15, 12, 6, 5, 7],
    [165, -8, 12, 5, 5, 6],
    [160, 10, 14, 6, 6, 7],
    [180, 20, 14, 6, 5, 6],
    [200, 12, 14, 5, 6, 8],
    [215, 35, 14, 6, 6, 6],
    [190, 42, 14, 5, 5, 7],
    [165, 40, 14, 6, 5, 6],
    [200, -20, 13, 6, 6, 7],
    [220, -30, 13, 5, 6, 6],
    [240, -20, 13, 6, 5, 8],
    [230, -45, 13, 6, 6, 6],
    [210, -50, 13, 5, 5, 7],
    [150, -70, -18, 8, 7, 6],
    [170, -75, -18, 7, 7, 7],
    [195, -70, -18, 8, 6, 6],
    [215, -80, -18, 7, 7, 8],
    [180, -95, -18, 8, 7, 6],
    [150, -110, -18, 7, 8, 7],
    [210, -115, -18, 8, 7, 6],
  ];
  for (const [x, z, gy, w, d, h] of houses) {
    b.building('auldnoir', x, z, gy, w, d, h, 'auldnoir');
  }

  // Arcos callejeros sobre la plaza.
  b.arch('auldnoir', 105, 18, 34, 12, true);
  b.arch('auldnoir', 105, 18, -20, 12, true);

  // Farolas y bancos de la plaza (el spawn en [105, 18.2, 8] queda despejado).
  const lampSpots: Array<[number, number]> = [
    [95, 30],
    [120, 30],
    [95, -12],
    [120, -12],
    [105, 45],
    [140, 20],
    [88, 4],
    [130, -25],
  ];
  for (const [x, z] of lampSpots) b.lamp('auldnoir', x, 18, z, GLOW_WINDOW);
  const benchSpots: Array<[number, number, number]> = [
    [108, 18, 18],
    [112, 18, -2],
    [98, 18, 26],
    [122, 18, 8],
  ];
  for (const [x, , z] of benchSpots) b.bench('auldnoir', x, 18, z);
  // Puestos del casco inferior.
  b.stall('auldnoir', 100, -26, -10, CEL_TERRA);
  b.stall('auldnoir', 140, -26, 0, CEL_TERRA);
  b.stall('auldnoir', 120, -26, -40, CEL_TERRA);
}

// ----------------------------------------------------------------------------
// Pleajeune (Sur · X -140..+146, Z +75..+310, Y +65..+128)
// ----------------------------------------------------------------------------

/** Noria Gigante animada de la plaza alta h1 (malla cel + glow + contorno). */
function buildFerrisWheel(b: HeksevilleBuilder): THREE.Group {
  const R = 17;
  const solids: THREE.BufferGeometry[] = [];
  const outlines: THREE.BufferGeometry[] = [];
  const glows: THREE.BufferGeometry[] = [];

  // Aro: 16 tramos tangentes en el plano XY (eje de giro = Z local).
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const seg = new THREE.BoxGeometry(7.9, 1.7, 1.7);
    seg.rotateZ(a + Math.PI / 2);
    seg.translate(R * Math.cos(a), R * Math.sin(a), 0);
    solids.push(seg);
    const oseg = new THREE.BoxGeometry(
      7.9 + OUTLINE_INFLATE * 2,
      1.7 + OUTLINE_INFLATE * 2,
      1.7 + OUTLINE_INFLATE * 2
    );
    oseg.rotateZ(a + Math.PI / 2);
    oseg.translate(R * Math.cos(a), R * Math.sin(a), 0);
    outlines.push(oseg);
  }
  // Radios.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const sp = new THREE.BoxGeometry(0.9, R, 0.9);
    sp.rotateZ(a - Math.PI / 2);
    sp.translate((R / 2) * Math.cos(a), (R / 2) * Math.sin(a), 0);
    solids.push(sp);
    const osp = new THREE.BoxGeometry(
      0.9 + OUTLINE_INFLATE * 2,
      R + OUTLINE_INFLATE * 2,
      0.9 + OUTLINE_INFLATE * 2
    );
    osp.rotateZ(a - Math.PI / 2);
    osp.translate((R / 2) * Math.cos(a), (R / 2) * Math.sin(a), 0);
    outlines.push(osp);
  }
  // Buje.
  const hub = new THREE.CylinderGeometry(2.2, 2.2, 3.2, 12);
  hub.rotateX(Math.PI / 2);
  solids.push(hub);
  const ohub = new THREE.CylinderGeometry(
    2.2 + OUTLINE_INFLATE,
    2.2 + OUTLINE_INFLATE,
    3.2 + OUTLINE_INFLATE * 2,
    12
  );
  ohub.rotateX(Math.PI / 2);
  outlines.push(ohub);
  // Cabinas + banda de neón ecuatorial.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const px = (R + 1.2) * Math.cos(a);
    const py = (R + 1.2) * Math.sin(a);
    const cab = new THREE.BoxGeometry(2.6, 2.8, 2.6);
    cab.translate(px, py, 0);
    solids.push(cab);
    const ocab = new THREE.BoxGeometry(
      2.6 + OUTLINE_INFLATE * 2,
      2.8 + OUTLINE_INFLATE * 2,
      2.6 + OUTLINE_INFLATE * 2
    );
    ocab.translate(px, py, 0);
    outlines.push(ocab);
    const band = new THREE.BoxGeometry(2.9, 0.6, 2.9);
    band.translate(px, py, 0);
    glows.push(band);
  }

  const wheelGeo = mergeGeometries(solids, false);
  const outlineGeo = mergeGeometries(outlines, false);
  const glowGeo = mergeGeometries(glows, false);
  const spinner = new THREE.Group();
  spinner.name = 'ferrisSpinner';
  const wheelMat = createComicCelMaterial('#e34fa0', { rimColor: '#ff9ad8' });
  const outlineMat = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x5df3ff });
  if (wheelGeo) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.matrixAutoUpdate = false;
    wheel.updateMatrix();
    spinner.add(wheel);
  }
  if (outlineGeo) {
    const outline = new THREE.Mesh(outlineGeo, outlineMat);
    outline.matrixAutoUpdate = false;
    outline.updateMatrix();
    spinner.add(outline);
  }
  if (glowGeo) {
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.matrixAutoUpdate = false;
    glow.updateMatrix();
    spinner.add(glow);
  }

  // Patas en A (estáticas, con rotación Z compuesta) + taquilla.
  for (const side of [-1, 1]) {
    const x0 = 95 + side * 10;
    const z0 = 210;
    const x1 = 95;
    const y1 = 150;
    const dx = x1 - x0;
    const dy = y1 - 126;
    const len = Math.hypot(dx, dy);
    const theta = Math.atan2(-dx, dy);
    const mx = (x0 + x1) / 2;
    const my = (126 + y1) / 2;
    const leg = new THREE.BoxGeometry(1.8, len, 1.8);
    leg.rotateZ(theta);
    leg.translate(mx, my, z0);
    const oleg = new THREE.BoxGeometry(
      1.8 + OUTLINE_INFLATE * 2,
      len + OUTLINE_INFLATE * 2,
      1.8 + OUTLINE_INFLATE * 2
    );
    oleg.rotateZ(theta);
    oleg.translate(mx, my, z0);
    b.pushPiece(CEL_TRIM, 'pleajeune', leg, oleg);
    b.collider('pleajeune', mx, my, z0, 1, len / 2, 1);
  }
  b.building('pleajeune', 75, 195, 126, 5, 5, 4.5, 'pleajeune');

  return spinner;
}

function buildPleajeune(b: HeksevilleBuilder): THREE.Group {
  // Paseo inferior dt_under (y = 26) bajo todo el distrito.
  b.platform('pleajeune', CEL_PLEA, 15, 185, 150, 210, 26);
  // Avenida escalonada y alas.
  b.platform('pleajeune', CEL_PLEA, -28, 113.5, 64, 67, 93); // a1
  b.platform('pleajeune', CEL_PLEA, 27, 112, 62, 64, 93); // b1
  b.platform('pleajeune', CEL_PLEA, -29.5, 169, 67, 70, 104); // c1
  b.platform('pleajeune', CEL_PLEA, 35.5, 173, 79, 68, 110); // d1
  b.platform('pleajeune', CEL_PLEA, -21.5, 208, 87, 54, 104); // f1
  b.platform('pleajeune', CEL_PLEA, 40.5, 214.5, 71, 79, 104); // g1
  b.platform('pleajeune', CEL_PLEA, -48, 256, 108, 76, 108); // i1
  b.platform('pleajeune', CEL_PLEA, 12.5, 275.5, 75, 61, 108); // j1
  b.platform('pleajeune', CEL_PLEA, -104, 211, 72, 84, 92); // e1 · ala oeste
  b.platform('pleajeune', CEL_PLEA, 97.5, 209.5, 97, 87, 126); // h1 · plaza de la Noria

  // Gran escalinata del Pilar: dt_under (26) -> a1 (93) en dos tramos.
  b.stairs('pleajeune', CEL_PLEA, -20, 240, 0, -1, 12, 26, 59, 44);
  b.platform('pleajeune', CEL_PLEA, -20, 190, 12, 12, 59, 1.2, false);
  b.supportPillar('pleajeune', -20, 190, 26, 58.4);
  b.stairs('pleajeune', CEL_PLEA, -20, 184, 0, -1, 12, 59, 93, 38);

  // Torres-escalera del este: dt_under (26) -> puente a h1 (126).
  b.stairTower('pleajeune', CEL_PLEA, 100, 273, 26, 126, 50, 10);
  b.platform('pleajeune', CEL_PLEA, 75, 263, 12, 22, 126, 1.2, false);

  // Plataformas flotantes intermedias entre dt_under y las terrazas.
  b.platform('pleajeune', CEL_PLEA, 20, 160, 10, 10, 44, 1.5, false);
  b.platform('pleajeune', CEL_PLEA, 32, 168, 10, 10, 60, 1.5, false);
  b.platform('pleajeune', CEL_PLEA, 44, 176, 10, 10, 76, 1.5, false);

  // Rampas entre terrazas.
  b.stairs('pleajeune', CEL_PLEA, -30, 122, 0, 1, 10, 93, 104, 12); // a1 -> c1
  b.stairs('pleajeune', CEL_PLEA, -80, 200, 1, 0, 8, 92, 104, 17); // e1 -> c1
  b.stairs('pleajeune', CEL_PLEA, 10, 128, 1, 0, 8, 93, 103, 30); // b1 -> d1 (ida)
  b.platform('pleajeune', CEL_PLEA, 46, 128, 10, 10, 103, 1.2, false);
  b.supportPillar('pleajeune', 46, 128, 93, 102.4);
  b.stairs('pleajeune', CEL_PLEA, 40, 128, -1, 0, 8, 103, 110, 24); // b1 -> d1 (vuelta)
  b.platform('pleajeune', CEL_PLEA, 16, 134, 12, 10, 110, 1.2, false);
  b.stairs('pleajeune', CEL_PLEA, 40, 163, 0, 1, 10, 110, 104, 12); // d1 -> g1
  b.stairs('pleajeune', CEL_PLEA, -45, 206, 0, 1, 10, 104, 108, 12); // f1 -> i1
  b.stairs('pleajeune', CEL_PLEA, 28, 233, 0, 1, 10, 104, 108, 12); // g1 -> j1
  b.stairs('pleajeune', CEL_PLEA, 40, 185, 0, 1, 8, 104, 115, 30); // g1 -> h1 (ida)
  b.platform('pleajeune', CEL_PLEA, 40, 220, 10, 10, 115, 1.2, false);
  b.supportPillar('pleajeune', 40, 220, 104, 114.4);
  b.stairs('pleajeune', CEL_PLEA, 40, 215, 0, 1, 8, 115, 126, 30); // g1 -> h1 (vuelta)
  b.platform('pleajeune', CEL_PLEA, 45, 249, 10, 10, 126, 1.2, false);

  // Canal de la terraza j1 + 4 burbujas de agua flotantes.
  b.box(GLOW_CYAN, 'pleajeune', 12, 108.25, 300, 64, 0.5, 8, 0, false);
  const bubbleCenters: Array<[number, number, number]> = [
    [-12, 119, 300],
    [8, 122, 304],
    [28, 125, 300],
    [46, 128, 292],
  ];
  bubbleCenters.forEach(([x, y, z], i) => {
    b.waterBubbles.push({ id: `hek-bubble-${i}`, center: [x, y, z], radius: 8 });
  });

  // Edificios neón magenta/cyan del distrito alto.
  const towers: Array<[number, number, number, number, number, number]> = [
    [-45, 100, 93, 8, 8, 18],
    [-15, 95, 93, 8, 8, 24],
    [-40, 130, 93, 7, 7, 15],
    [-10, 135, 93, 8, 8, 20],
    [15, 95, 93, 8, 8, 22],
    [40, 100, 93, 7, 7, 16],
    [20, 130, 93, 8, 8, 28],
    [45, 130, 93, 7, 7, 14],
    [-45, 160, 104, 7, 7, 18],
    [-20, 190, 104, 8, 8, 24],
    [15, 160, 110, 8, 8, 20],
    [45, 165, 110, 8, 8, 30],
    [60, 190, 110, 7, 7, 16],
    [25, 195, 110, 8, 8, 22],
    [-45, 210, 104, 7, 7, 15],
    [-15, 220, 104, 8, 8, 20],
    [20, 190, 104, 7, 7, 18],
    [45, 225, 104, 8, 8, 26],
    [65, 200, 104, 7, 7, 14],
    [-80, 240, 108, 8, 8, 16],
    [-50, 260, 108, 8, 8, 22],
    [-25, 280, 108, 7, 7, 18],
    [-75, 280, 108, 7, 7, 14],
    [0, 265, 108, 8, 8, 20],
    [25, 270, 108, 7, 7, 16],
    [10, 290, 108, 8, 8, 24],
    [35, 285, 108, 7, 7, 14],
    [-120, 190, 92, 7, 7, 15],
    [-95, 200, 92, 8, 8, 20],
    [-125, 230, 92, 7, 7, 18],
    [-90, 235, 92, 7, 7, 14],
    [60, 175, 126, 7, 7, 16],
    [130, 180, 126, 8, 8, 20],
    [135, 240, 126, 7, 7, 15],
    [65, 245, 126, 8, 8, 18],
  ];
  for (const [x, z, gy, w, d, h] of towers) {
    b.building('pleajeune', x, z, gy, w, d, h, 'pleajeune');
  }

  // Cartelones cómic y farolas de neón.
  b.billboard('pleajeune', 30, 93, 85, 0, GLOW_MAGENTA);
  b.billboard('pleajeune', -30, 104, 140, 0.4, GLOW_CYAN);
  b.billboard('pleajeune', 50, 110, 150, -0.3, GLOW_MAGENTA);
  b.billboard('pleajeune', -60, 92, 180, 0, GLOW_CYAN);
  for (const [x, z] of [
    [-5, 105],
    [30, 110],
    [-5, 125],
    [30, 125],
    [10, 150],
    [55, 155],
  ] as const) {
    b.lamp('pleajeune', x, 93, z, GLOW_CYAN);
  }

  // Noria Gigante en la plaza alta h1 (centro 95, 150, 210).
  const holder = new THREE.Group();
  holder.name = 'ferrisHolder';
  holder.position.set(95, 150, 210);
  holder.rotation.y = 0.35;
  const spinner = buildFerrisWheel(b);
  holder.add(spinner);
  b.group.add(holder);
  return spinner;
}

// ----------------------------------------------------------------------------
// Endestria (Norte · X -100..+145, Z -260..-80, Y +25..+52)
// ----------------------------------------------------------------------------

function buildEndestria(b: HeksevilleBuilder): void {
  // Isla industrial multinivel.
  b.platform('endestria', CEL_STEEL, -2.5, -110, 51, 68, 3); // ed_under · cubierta baja
  b.platform('endestria', CEL_STEEL, -11, -116.5, 68, 35, 25); // d1
  b.platform('endestria', CEL_STEEL, -15, -139.5, 54, 47, 52); // b1
  b.platform('endestria', CEL_STEEL, 16.5, -119, 51, 58, 52); // c1
  b.platform('endestria', CEL_STEEL, -28, -173.5, 56, 57, 52); // a1
  b.platform('endestria', CEL_STEEL, -39, -216.5, 68, 79, 52); // e1
  b.platform('endestria', CEL_STEEL, 62.5, -170.5, 67, 101, 44); // f1_a
  b.platform('endestria', CEL_STEEL, 103, -174.5, 74, 65, 44); // f1_b
  b.platform('endestria', CEL_STEEL, 74, -206.5, 74, 79, 44); // f1_c
  b.platform('endestria', CEL_STEEL, 99, -207, 58, 60, 44); // f1_d

  // Escaleras de enlace (ed_under -> d1 -> b1; c1 -> f1_a).
  b.stairs('endestria', CEL_STEEL, 14, -92, -1, 0, 8, 3, 14, 30);
  b.platform('endestria', CEL_STEEL, -22, -92, 12, 10, 14, 1.2, false);
  b.supportPillar('endestria', -22, -92, 3, 13.4);
  b.stairs('endestria', CEL_STEEL, -16, -92, 1, 0, 8, 14, 25, 30);
  b.platform('endestria', CEL_STEEL, 14, -95, 10, 10, 25, 1.2, false);
  b.supportPillar('endestria', 14, -95, 3, 24.4);
  b.stairs('endestria', CEL_STEEL, -30, -108, 1, 0, 8, 25, 39, 30);
  b.platform('endestria', CEL_STEEL, 6, -108, 12, 10, 39, 1.2, false);
  b.supportPillar('endestria', 6, -108, 25, 38.4);
  b.stairs('endestria', CEL_STEEL, 0, -108, -1, 0, 8, 39, 52, 30);
  b.platform('endestria', CEL_STEEL, -30, -112, 12, 8, 52, 1.2, false);
  b.supportPillar('endestria', -30, -112, 25, 51.4);
  b.stairs('endestria', CEL_STEEL, 18, -110, 1, 0, 8, 52, 44, 11);

  // Naves y almacenes industriales.
  const sheds: Array<[number, number, number, number, number, number]> = [
    [-25, -130, 52, 14, 10, 12],
    [-5, -125, 52, 10, 12, 10],
    [30, -100, 52, 12, 8, 8],
    [-45, -155, 52, 12, 10, 9],
    [50, -200, 44, 16, 12, 10],
    [90, -150, 44, 12, 10, 9],
    [115, -195, 44, 14, 10, 10],
  ];
  for (const [x, z, gy, w, d, h] of sheds) {
    b.building('endestria', x, z, gy, w, d, h, 'endestria');
  }

  // Chimeneas, reactores y depósitos.
  b.chimney('endestria', -25, 52, -140, 3, 22);
  b.chimney('endestria', 5, 52, -135, 2.5, 18);
  b.chimney('endestria', -60, 52, -240, 3.5, 26);
  b.reactor('endestria', 20, 52, -115, 6, 10);
  b.reactor('endestria', -45, 52, -220, 7, 12);
  b.cyl(CEL_STEEL, 'endestria', -40, 57, -170, 4, 10, 12);
  b.collider('endestria', -40, 57, -170, 4, 5, 4);
  b.cyl(CEL_STEEL, 'endestria', -30, 57, -185, 4, 10, 12);
  b.collider('endestria', -30, 57, -185, 4, 5, 4);

  // Tuberías aéreas gigantes caminables.
  b.pipeX('endestria', 42, 60, 58, -125, 2.6);
  b.pipeX('endestria', 12, 29, 60, -130, 2.8);
  b.pipeX('endestria', -55, -15, 60, -190, 2.5);

  // Grúas estilizadas y vallas (Digger puede excavar bajo ellas).
  b.crane('endestria', 60, 44, -140, 24, 22);
  b.crane('endestria', 85, 44, -180, 20, 18);
  b.crane('endestria', 110, 44, -170, 26, 20);
  b.fence('endestria', 103, 44, -143, 60, true);
  b.fence('endestria', 70, 44, -120, 40, true);
  b.fence('endestria', -2.5, 3, -76, 44, true);
  b.fence('endestria', 16.5, 52, -90, 40, true);

  // Naves cargueras flotando bajo la isla.
  b.ship('endestria', -60, -16, -180, 0.3);
  b.ship('endestria', 100, -24, -240, -0.5);
}

// ----------------------------------------------------------------------------
// Vendecentre (Oeste · X -225..-110, Z -120..+15, Y +30..+66)
// ----------------------------------------------------------------------------

function buildVendecentre(b: HeksevilleBuilder): void {
  // Meseta moderna (sin casco en a1: el Viaducto Oeste pasa por debajo).
  b.platform('vendecentre', CEL_VEN, -160.5, -18, 71, 40, 30, 5, false); // a1
  b.platform('vendecentre', CEL_VEN, -131, -48.5, 40, 53, 40); // b1
  b.platform('vendecentre', CEL_VEN, -161.5, -70.5, 51, 43, 62); // c1
  b.platform('vendecentre', CEL_VEN, -198, -67.5, 52, 59, 62); // e1
  b.platform('vendecentre', CEL_VEN, -171.5, -97, 35, 40, 62); // d1

  // Escaleras: viaducto -> a1 -> b1 -> c1 (con rellanos apoyados).
  b.stairs('vendecentre', CEL_VEN, -113, -12, -1, 0, 10, 19, 30, 12);
  b.stairs('vendecentre', CEL_VEN, -138, -12, 0, -1, 8, 30, 40, 10);
  b.stairs('vendecentre', CEL_VEN, -118, -42, -1, 0, 8, 40, 52, 30);
  b.platform('vendecentre', CEL_VEN, -152, -42, 10, 10, 52, 1.2, false);
  b.supportPillar('vendecentre', -149, -42, 40, 51.4);
  b.stairs('vendecentre', CEL_VEN, -148, -42, 1, 0, 8, 52, 62, 30);
  b.platform('vendecentre', CEL_VEN, -118, -45, 10, 8, 62, 1.2, false);
  b.supportPillar('vendecentre', -118, -45, 40, 61.4);

  // Rascacielos de 22-50 m, pizarra violeta / marfil, ventanas luminosas:
  // paredes perfectas para subir con Gravity Shift.
  const skyscrapers: Array<[number, number, number, number, number, number]> = [
    [-180, -25, 30, 10, 10, 34],
    [-160, -12, 30, 9, 9, 45],
    [-140, -28, 30, 8, 8, 28],
    [-140, -60, 40, 8, 8, 30],
    [-125, -35, 40, 7, 7, 22],
    [-175, -80, 62, 9, 9, 40],
    [-155, -60, 62, 8, 8, 28],
    [-210, -85, 62, 10, 10, 50],
    [-185, -55, 62, 8, 8, 32],
    [-215, -50, 62, 9, 9, 26],
    [-172, -100, 62, 8, 8, 36],
  ];
  for (const [x, z, gy, w, d, h] of skyscrapers) {
    b.building('vendecentre', x, z, gy, w, d, h, 'vendecentre');
  }

  // Farolas de la meseta y cartel de bienvenida al viaducto.
  for (const [x, z] of [
    [-150, -8],
    [-170, -25],
    [-135, -10],
  ] as const) {
    b.lamp('vendecentre', x, 30, z, GLOW_VIOLET);
  }
  b.billboard('vendecentre', -100, 19, -12, 0.25, GLOW_VIOLET);
}

// ----------------------------------------------------------------------------
// Cielo atmosférico cómic: mar de nubes cel-shaded (y -95..-140, sin planetas)
// ----------------------------------------------------------------------------

function buildCloudSea(b: HeksevilleBuilder): void {
  // Disco base cálido del mar de nubes (y = -130).
  b.blob(CEL_CLOUD_WARM, 0, -130, 0, 620, 5, 620);

  // Nubes estilizadas repartidas con ángulo áureo (determinista).
  const GOLDEN = 2.39996;
  for (let i = 0; i < 34; i++) {
    const a = i * GOLDEN;
    const r = 90 + (i / 34) * 470;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = -98 - (i % 5) * 8;
    const rx = 26 + ((i * 37) % 43);
    const rz = 26 + ((i * 53) % 43);
    b.blob(CEL_CLOUD, x, y, z, rx, 7 + (i % 4) * 2.2, rz);
  }
}

// ----------------------------------------------------------------------------
// NPCs: 8 ciudadanos de Hekseville (diálogos de exploración)
// ----------------------------------------------------------------------------

const HEKSEVILLE_NPCS: NpcSpec[] = [
  {
    id: 'hek-npc-panadera',
    name: 'Brenda la Panadera',
    role: 'Vecina de Auldnoir',
    planetId: 'hekseville',
    sphericalDir: [0, 1, 0],
    worldPos: [112, 18, 20],
    yaw: 2.6,
    accentColor: '#f59e0b',
    dialogue: [
      '¡Bienvenido a Auldnoir! La plaza del reloj es el corazón del barrio y huele a pan recién hecho.',
      'Sube la Torre del Reloj si te gustan las vistas, o salta de tejado en tejado hacia las terrazas del sur.',
      'El Pilar Central se ve desde todas partes: cruza el puente este y no podrás perderte.',
    ],
  },
  {
    id: 'hek-npc-relojero',
    name: 'Aldo el Relojero',
    role: 'Guardián de la Torre',
    planetId: 'hekseville',
    sphericalDir: [0, 1, 0],
    worldPos: [140, 18, -12],
    yaw: -2.4,
    accentColor: '#fbbf24',
    dialogue: [
      'La Torre del Reloj lleva marcando la hora desde antes de que la ciudad empezara a flotar.',
      'Debajo del barrio está el casco inferior: ¡una terraza entera colgando boca abajo!',
      'Si bajas al muelle sur de Auldnoir, la terraza baja huele a sal y a aventura.',
    ],
  },
  {
    id: 'hek-npc-centinela',
    name: 'Nyx la Centinela',
    role: 'Guardiana del Collar',
    planetId: 'hekseville',
    sphericalDir: [0, 1, 0],
    worldPos: [0, 14, 54],
    yaw: Math.PI,
    accentColor: '#a78bfa',
    dialogue: [
      'Este collar de piedra rodea el Pilar Central: cuatro puentes, cuatro distritos.',
      'Al este Auldnoir, al sur Pleajeune, al norte Endestria y al oeste Vendecentre.',
      'Los anillos del Pilar brillan más fuerte al anochecer. Nadie recuerda quién los encendió.',
    ],
  },
  {
    id: 'hek-npc-artista',
    name: 'Vila la Artista',
    role: 'Muralista de Pleajeune',
    planetId: 'hekseville',
    sphericalDir: [0, 1, 0],
    worldPos: [-30, 93, 110],
    yaw: 0.8,
    accentColor: '#ff59d0',
    dialogue: [
      '¡Pleajeune! Neón, música y la avenida escalonada. Sube la gran escalinata desde el paseo inferior.',
      'El canal de burbujas flota sobre la terraza sur: nado gratuito si caes con estilo.',
      'La Noria Gigante gira sin parar en la plaza alta. Desde arriba se ve el Pilar entero.',
    ],
  },
  {
    id: 'hek-npc-operador',
    name: 'Roni el Operador',
    role: 'Encargado de la Noria',
    planetId: 'hekseville',
    sphericalDir: [0, 1, 0],
    worldPos: [70, 126, 200],
    yaw: 1.9,
    accentColor: '#5df3ff',
    dialogue: [
      'La Noria es el orgullo de Pleajeune. Sus cabinas giran despacio... casi dan sueño.',
      'Desde aquí arriba, Vendecentre parece un bosque de cristal violeta.',
      '¿Vienes andando? La escalera de caracol del este sube desde el paseo inferior, junto al Pilar.',
    ],
  },
  {
    id: 'hek-npc-ingeniera',
    name: 'Iris la Ingeniera',
    role: 'Jefa de planta de Endestria',
    planetId: 'hekseville',
    sphericalDir: [0, 1, 0],
    worldPos: [10, 52, -105],
    yaw: -1.2,
    accentColor: '#eab308',
    dialogue: [
      'Endestria nunca duerme: reactores, grúas y tuberías aéreas por las que se puede caminar.',
      'Prueba a subir por la tubería que une las plataformas. Digger puede pasar excavando bajo las vallas.',
      'Los cargueros flotan bajo la isla. No te caigas, que el vacío es largo.',
    ],
  },
  {
    id: 'hek-npc-arquitecta',
    name: 'Mara la Arquitecta',
    role: 'Urbanista de Vendecentre',
    planetId: 'hekseville',
    sphericalDir: [0, 1, 0],
    worldPos: [-170, 30, -8],
    yaw: 2.2,
    accentColor: '#b9b3ff',
    dialogue: [
      'Vendecentre es nuestra meseta moderna: rascacielos de pizarra violeta y marfil.',
      'Con Gravity Shift puedes correr por las paredes de las torres. ¡Yo las diseño todas para eso!',
      'El Viaducto Oeste une la meseta con el Pilar: es el puente más largo de Hekseville.',
    ],
  },
  {
    id: 'hek-npc-vigia',
    name: 'Oldo el Vigía',
    role: 'Observador de la Terraza',
    planetId: 'hekseville',
    sphericalDir: [0, 1, 0],
    worldPos: [-160, 62, -70],
    yaw: 2.9,
    accentColor: '#38bdf8',
    dialogue: [
      'Desde la terraza alta de Vendecentre se ven los cuatro distritos y el Pilar de un vistazo.',
      'Las torres de aquí miden hasta cincuenta metros: paredes perfectas para cambiar la gravedad.',
      'Al norte, las chimeneas de Endestria echan humo de colores. Al este, el reloj de Auldnoir.',
    ],
  },
];

// ----------------------------------------------------------------------------
// Contrato principal
// ----------------------------------------------------------------------------

export function buildHeksevilleCity(): BuiltHeksevilleCity {
  const b = new HeksevilleBuilder();
  const materials = createCityMaterials();

  buildPillar(b);
  buildAuldnoir(b);
  const ferrisSpinner = buildPleajeune(b);
  buildEndestria(b);
  buildVendecentre(b);
  buildCloudSea(b);

  // Burbujas de agua: esferas cel translúcidas fusionadas en 1 draw call.
  const bubbleGeos: THREE.BufferGeometry[] = [];
  for (const wb of b.waterBubbles) {
    const geo = new THREE.SphereGeometry(wb.radius, 18, 12);
    geo.translate(wb.center[0], wb.center[1], wb.center[2]);
    bubbleGeos.push(geo);
  }
  const mergedBubbles = mergeGeometries(bubbleGeos, false);
  for (const g of bubbleGeos) g.dispose();
  if (mergedBubbles) {
    const mesh = new THREE.Mesh(mergedBubbles, materials.get(WATER)!);
    mesh.name = 'hek-waterBubbles';
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    b.group.add(mesh);
  }

  b.finish(materials);

  const update = (dt: number): void => {
    ferrisSpinner.rotation.z += dt * 0.18;
  };

  return {
    group: b.group,
    boxes: b.boxes,
    cylinders: b.cylinders,
    waterBubbles: b.waterBubbles,
    npcs: HEKSEVILLE_NPCS,
    // Spawn sobre la plaza d1 de Auldnoir, zona central despejada de edificios.
    spawnPos: [105, 18.2, 8],
    update,
  };
}
