import * as THREE from 'three';
import {
  DOME_ARENA_RADIUS,
  DOME_PLAYER_BOUND_RADIUS,
  type SlabCollider,
} from './domeTypes';
import { createComicCelMaterial } from '@/game/render/toonMaterials';

// ============================================================================
// Baldosas triangulares sobre la cúpula geodésica.
//
// `IcosahedronGeometry(90, 3)` genera exactamente 320 triángulos (20 caras del
// icosaedro x 16 sub-triángulos). Cada uno se convierte en un prisma triangular
// orientado con su cara `+Y` local apuntando al centro de la arena: la cara
// interior pisable se sitúa a `DOME_PLAYER_BOUND_RADIUS - 1.1` (~87.5 m), por
// delante de la barrera blanca de 88.6 m, para que NYX nunca aterrice contra
// la barrera al caer sobre una baldosa.
// ============================================================================

/** Cara interior pisable (radio): 88.6 - 1.1 = 87.5 m. */
const TILE_SURFACE_RADIUS = DOME_PLAYER_BOUND_RADIUS - 1.1;
/** Grosor del prisma hacia fuera: 87.5 + 2.2 = 89.7 m. */
const TILE_THICKNESS = 2.2;
/** Máximo de triángulos simultáneos (modo boss) = tamaño del pool. */
const TILE_POOL_SIZE = 120;
/** Período de rotación de triángulos en modo miniboss. */
const MINIBOSS_ROTATE_PERIOD = 10.0;
/** Ventana de advertencia (pulso rojo/ámbar) antes de rotar. */
const MINIBOSS_WARN_LEAD = 2.2;

/** Metros que cubre una repetición del damero (2 casillas de 2 m). */
const CHECKER_TILE_METERS = 4;

interface TileData {
  /** Triángulo proyectado en el plano XZ local [ax, az, bx, bz, cx, cz]. */
  triangle2D: readonly [number, number, number, number, number, number];
  quaternion: THREE.Quaternion;
  invQuaternion: THREE.Quaternion;
  /** Posición del centro del prisma (cuerpo del collider). */
  center: THREE.Vector3;
  /** Dirección mundial del +Y local (hacia el centro de la cúpula). */
  inward: THREE.Vector3;
  halfExtents: THREE.Vector3;
  geometry: THREE.BufferGeometry;
}

interface TileSlot {
  mesh: THREE.Mesh;
  collider: SlabCollider;
  topMaterial: THREE.MeshStandardMaterial;
  /** Dirección +Y local en mundo, para la vibración de advertencia. */
  inward: THREE.Vector3;
  /** True mientras el slot está mostrando la advertencia de rotación. */
  warning: boolean;
}

export type DomeSphereTileMode = 'none' | 'miniboss' | 'boss';

// ----------------------------------------------------------------------------
// Texturas del damero estilo Persona 3 Reload (cocina de la Torre):
// casillas blanco/nave alternas con juntas luminosas cian/verde.
// ----------------------------------------------------------------------------

function createCheckerTextures(): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const size = 256;
  const half = size / 2;
  const grout = 12;

  const albedo = document.createElement('canvas');
  albedo.width = albedo.height = size;
  const a = albedo.getContext('2d')!;
  a.fillStyle = '#f5f7ff';
  a.fillRect(0, 0, size, size);
  a.fillStyle = '#152a6e';
  a.fillRect(half, 0, half, half);
  a.fillRect(0, half, half, half);
  // Juntas: gris azulado tenue en albedo (el brillo lo pone el emissive).
  a.fillStyle = '#3b4a6b';
  a.fillRect(0, half - grout / 2, size, grout);
  a.fillRect(half - grout / 2, 0, grout, size);

  const glow = document.createElement('canvas');
  glow.width = glow.height = size;
  const g = glow.getContext('2d')!;
  g.fillStyle = '#000000';
  g.fillRect(0, 0, size, size);
  // Juntas luminosas: cian horizontal, verde vertical.
  g.fillStyle = '#22d3ee';
  g.fillRect(0, half - grout / 2, size, grout);
  g.fillStyle = '#34d399';
  g.fillRect(half - grout / 2, 0, grout, size);

  const map = new THREE.CanvasTexture(albedo);
  const emissive = new THREE.CanvasTexture(glow);
  for (const tex of [map, emissive]) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
  }
  return { map, emissive };
}

// ----------------------------------------------------------------------------
// Construcción del prisma triangular de una baldosa.
// ----------------------------------------------------------------------------

function buildTileGeometry(
  ax: number, az: number,
  bx: number, bz: number,
  cx: number, cz: number,
): THREE.BufferGeometry {
  const hy = TILE_THICKNESS / 2;

  // Vértices superiores (cara interior, +Y local). Se ordenan para que la
  // normal del triángulo apunte a +Y.
  const areaY = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  const top = areaY >= 0
    ? [[ax, az], [bx, bz], [cx, cz]]
    : [[ax, az], [cx, cz], [bx, bz]];

  // Vértices inferiores en orden inverso (normal -Y).
  const bottom = [top[2], top[1], top[0]];

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const uvScale = 1 / CHECKER_TILE_METERS;

  const pushTri = (
    p0: number[], p1: number[], p2: number[],
    nx: number, ny: number, nz: number,
    flat: boolean,
  ): void => {
    positions.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    if (flat) {
      uvs.push(p0[0] * uvScale, p0[2] * uvScale, p1[0] * uvScale, p1[2] * uvScale, p2[0] * uvScale, p2[2] * uvScale);
    } else {
      uvs.push(0, 0, 0, 0, 0, 0);
    }
  };

  const topVerts = top.map(([x, z]) => [x, hy, z]);
  const bottomVerts = bottom.map(([x, z]) => [x, -hy, z]);

  // Cara interior pisable (+Y): material 0.
  pushTri(topVerts[0], topVerts[1], topVerts[2], 0, 1, 0, true);

  // Volumen exterior (-Y): material 1.
  pushTri(bottomVerts[0], bottomVerts[1], bottomVerts[2], 0, -1, 0, false);

  // Caras laterales (2 triángulos por arista, normal hacia fuera).
  const sideNormal = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  for (let i = 0; i < 3; i++) {
    const t0 = topVerts[i];
    const t1 = topVerts[(i + 1) % 3];
    const b0 = bottomVerts[i];
    const b1 = bottomVerts[(i + 1) % 3];
    e1.set(t1[0] - t0[0], t1[1] - t0[1], t1[2] - t0[2]);
    e2.set(b1[0] - t0[0], b1[1] - t0[1], b1[2] - t0[2]);
    sideNormal.crossVectors(e1, e2).normalize();
    pushTri(t0, t1, b1, sideNormal.x, sideNormal.y, sideNormal.z, false);
    pushTri(t0, b1, b0, sideNormal.x, sideNormal.y, sideNormal.z, false);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  // Grupo 0: cara interior (1 triángulo). Grupo 1: resto del prisma (7).
  geo.addGroup(0, 3, 0);
  geo.addGroup(3, 21, 1);
  geo.computeBoundingSphere();
  return geo;
}

// ----------------------------------------------------------------------------
// Manager
// ----------------------------------------------------------------------------

export class DomeSphereTileManager {
  private readonly scene: THREE.Scene;
  private readonly tiles: TileData[] = [];
  private readonly slots: TileSlot[] = [];
  private readonly activeColliders: SlabCollider[] = [];
  private readonly baseColor = new THREE.Color(0xffffff);
  private readonly warnRed = new THREE.Color(0xff2a1a);
  private readonly warnAmber = new THREE.Color(0xffb020);

  private readonly checkerMap: THREE.CanvasTexture;
  private readonly checkerEmissive: THREE.CanvasTexture;
  private readonly darkMaterial: THREE.ShaderMaterial;
  private readonly placeholderGeometry: THREE.BufferGeometry;

  private mode: DomeSphereTileMode = 'none';
  private cycleTime = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const { map, emissive } = createCheckerTextures();
    this.checkerMap = map;
    this.checkerEmissive = emissive;

    this.darkMaterial = createComicCelMaterial('#141a2e', {
      rimColor: '#38bdf8',
      rimStrength: 0.5,
    });
    this.placeholderGeometry = new THREE.BufferGeometry();

    this.buildTiles();

    for (let i = 0; i < TILE_POOL_SIZE; i++) {
      const topMaterial = new THREE.MeshStandardMaterial({
        map: this.checkerMap,
        emissiveMap: this.checkerEmissive,
        emissive: 0xffffff,
        emissiveIntensity: 0.85,
        roughness: 0.55,
        metalness: 0.05,
      });
      const mesh = new THREE.Mesh(this.placeholderGeometry, [topMaterial, this.darkMaterial]);
      mesh.visible = false;
      mesh.matrixAutoUpdate = true;
      this.scene.add(mesh);

      this.slots.push({
        mesh,
        topMaterial,
        inward: new THREE.Vector3(),
        warning: false,
        collider: {
          id: '',
          mesh,
          basePos: new THREE.Vector3(),
          center: new THREE.Vector3(),
          halfExtents: new THREE.Vector3(),
          quaternion: new THREE.Quaternion(),
          invQuaternion: new THREE.Quaternion(),
          phase: 0,
          bobAmplitude: 0,
          oneSidedTop: true,
          localTriangle2D: [0, 0, 0, 0, 0, 0],
        },
      });
    }
  }

  /**
   * Extrae los 320 triángulos exactos de `IcosahedronGeometry(90, 3)` y
   * precalcula marco ortonormal, proyección 2D, collider y geometría.
   */
  private buildTiles(): void {
    const source = new THREE.IcosahedronGeometry(DOME_ARENA_RADIUS, 3);
    const geo = source.index ? source.toNonIndexed() : source;
    const pos = geo.getAttribute('position');
    const triangleCount = pos.count / 3;

    const v0 = new THREE.Vector3();
    const v1 = new THREE.Vector3();
    const v2 = new THREE.Vector3();
    const centroid = new THREE.Vector3();
    const inward = new THREE.Vector3();
    const tangentX = new THREE.Vector3();
    const tangentZ = new THREE.Vector3();
    const helper = new THREE.Vector3();
    const basis = new THREE.Matrix4();

    for (let t = 0; t < triangleCount; t++) {
      v0.fromBufferAttribute(pos, t * 3);
      v1.fromBufferAttribute(pos, t * 3 + 1);
      v2.fromBufferAttribute(pos, t * 3 + 2);

      centroid.copy(v0).add(v1).add(v2).multiplyScalar(1 / 3);
      // Normal interior: hacia el centro de la cúpula (0,0,0).
      inward.copy(centroid).negate().normalize();

      // Marco ortonormal local con +Y = inward (mano derecha: tX x n = tZ).
      helper.set(0, 1, 0);
      if (Math.abs(inward.y) > 0.99) helper.set(1, 0, 0);
      tangentX.crossVectors(helper, inward).normalize();
      tangentZ.crossVectors(tangentX, inward).normalize();

      const quaternion = new THREE.Quaternion();
      basis.makeBasis(tangentX, inward, tangentZ);
      quaternion.setFromRotationMatrix(basis);

      // Proyección de los vértices al plano XZ local (se aplana la altura).
      const ax = v0.clone().sub(centroid).dot(tangentX);
      const az = v0.clone().sub(centroid).dot(tangentZ);
      const bx = v1.clone().sub(centroid).dot(tangentX);
      const bz = v1.clone().sub(centroid).dot(tangentZ);
      const cx = v2.clone().sub(centroid).dot(tangentX);
      const cz = v2.clone().sub(centroid).dot(tangentZ);

      // Centro del prisma: la cara interior queda a TILE_SURFACE_RADIUS.
      const center = inward.clone().multiplyScalar(-(TILE_SURFACE_RADIUS + TILE_THICKNESS / 2));
      const hx = Math.max(Math.abs(ax), Math.abs(bx), Math.abs(cx)) + 0.05;
      const hz = Math.max(Math.abs(az), Math.abs(bz), Math.abs(cz)) + 0.05;

      this.tiles.push({
        triangle2D: [ax, az, bx, bz, cx, cz],
        quaternion,
        invQuaternion: quaternion.clone().invert(),
        center,
        inward: inward.clone(),
        halfExtents: new THREE.Vector3(hx, TILE_THICKNESS / 2, hz),
        geometry: buildTileGeometry(ax, az, bx, bz, cx, cz),
      });
    }

    source.dispose();
    if (geo !== source) geo.dispose();
  }

  // --------------------------------------------------------------------------
  // Modos
  // --------------------------------------------------------------------------

  setMode(mode: DomeSphereTileMode): void {
    this.mode = mode;
    this.cycleTime = 0;

    if (mode === 'none') {
      this.deactivateAll();
      return;
    }

    if (mode === 'boss') {
      // Fisher-Yates sin reemplazo sobre [0..319]: 120 triángulos fijos con
      // probabilidad matemática pura de coexistir.
      const indices = this.shuffledTileIndices(this.tiles.length);
      this.activateTiles(indices.slice(0, TILE_POOL_SIZE));
      return;
    }

    // 'miniboss': 10-20 triángulos aleatorios que rotan cada 10 s.
    this.pickMinibossSet();
  }

  update(dt: number, elapsed: number): void {
    if (this.mode === 'miniboss') {
      this.cycleTime += dt;
      if (this.cycleTime >= MINIBOSS_ROTATE_PERIOD) {
        this.cycleTime = 0;
        this.pickMinibossSet();
      }
    }

    const warning = this.mode === 'miniboss'
      && this.cycleTime >= MINIBOSS_ROTATE_PERIOD - MINIBOSS_WARN_LEAD;

    for (const slot of this.slots) {
      if (!slot.mesh.visible) continue;
      if (warning) {
        this.applyWarning(slot, elapsed);
      } else if (slot.warning) {
        this.clearWarning(slot);
      }
    }
  }

  getActiveColliders(): SlabCollider[] {
    return this.activeColliders;
  }

  dispose(): void {
    this.deactivateAll();
    for (const slot of this.slots) {
      this.scene.remove(slot.mesh);
      slot.topMaterial.dispose();
    }
    for (const tile of this.tiles) tile.geometry.dispose();
    this.placeholderGeometry.dispose();
    this.darkMaterial.dispose();
    this.checkerMap.dispose();
    this.checkerEmissive.dispose();
    this.tiles.length = 0;
    this.slots.length = 0;
  }

  // --------------------------------------------------------------------------
  // Internos
  // --------------------------------------------------------------------------

  /** Shuffle Fisher-Yates completo de [0..count-1]. */
  private shuffledTileIndices(count: number): number[] {
    const indices = Array.from({ length: count }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = indices[i];
      indices[i] = indices[j];
      indices[j] = tmp;
    }
    return indices;
  }

  /** Nuevo set de 10-20 triángulos distintos para el modo miniboss. */
  private pickMinibossSet(): void {
    const count = 10 + Math.floor(Math.random() * 11); // 10..20
    const indices = this.shuffledTileIndices(this.tiles.length);
    this.activateTiles(indices.slice(0, count));
  }

  private activateTiles(indices: number[]): void {
    this.deactivateAll();

    const n = Math.min(indices.length, this.slots.length);
    for (let s = 0; s < n; s++) {
      const tileIndex = indices[s];
      const tile = this.tiles[tileIndex];
      const slot = this.slots[s];

      slot.mesh.geometry = tile.geometry;
      slot.mesh.position.copy(tile.center);
      slot.mesh.quaternion.copy(tile.quaternion);
      slot.mesh.visible = true;
      slot.inward.copy(tile.inward);
      slot.warning = false;

      const collider = slot.collider;
      collider.id = `dome-tile-${tileIndex}`;
      collider.basePos.copy(tile.center);
      collider.center.copy(tile.center);
      collider.halfExtents.copy(tile.halfExtents);
      collider.quaternion.copy(tile.quaternion);
      collider.invQuaternion.copy(tile.invQuaternion);
      collider.phase = tileIndex * 0.37;
      collider.bobAmplitude = 0;
      collider.oneSidedTop = true;
      collider.localTriangle2D = tile.triangle2D;

      this.activeColliders.push(collider);
    }
  }

  private deactivateAll(): void {
    for (const slot of this.slots) {
      if (!slot.mesh.visible) continue;
      slot.mesh.visible = false;
      slot.mesh.geometry = this.placeholderGeometry;
      if (slot.warning) this.clearWarning(slot);
    }
    this.activeColliders.length = 0;
  }

  /**
   * Advertencia pre-rotación: pulso rojo/ámbar brillante con parpadeo del
   * emisivo y una ligera vibración a lo largo de la normal interior.
   */
  private applyWarning(slot: TileSlot, elapsed: number): void {
    slot.warning = true;
    const pulse = 0.5 + 0.5 * Math.sin(elapsed * 9.0);
    const flicker = Math.sin(elapsed * 47.0) > 0 ? 1 : 0.25;

    const tint = this.warnRed.clone().lerp(this.warnAmber, 0.5 + 0.5 * Math.sin(elapsed * 5.5));
    slot.topMaterial.color.copy(this.baseColor).lerp(tint, 0.35 + 0.55 * pulse);
    slot.topMaterial.emissive.setRGB(1, 1, 1).lerp(tint, 0.6 + 0.4 * pulse);
    slot.topMaterial.emissiveIntensity = 0.85 + (1.4 + pulse * 1.8) * flicker;

    const jitter = Math.sin(elapsed * 62.0) * 0.07 * (0.4 + 0.6 * pulse);
    slot.mesh.position.copy(slot.collider.center).addScaledVector(slot.inward, jitter);
  }

  private clearWarning(slot: TileSlot): void {
    slot.warning = false;
    slot.topMaterial.color.copy(this.baseColor);
    slot.topMaterial.emissive.setRGB(1, 1, 1);
    slot.topMaterial.emissiveIntensity = 0.85;
    slot.mesh.position.copy(slot.collider.center);
  }
}
