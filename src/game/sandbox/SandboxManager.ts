import * as THREE from 'three';
import type { GameSoundKind } from '../audio/SynthAudio';
import type {
  CollectibleKind,
  GalaxySpec,
  PlanetRuntime,
  SandboxChallengeKind,
  SandboxChallengeSpec,
} from '../types';
import {
  buildAnchorSphereMesh,
  buildChallengeTotemMesh,
  buildCosmicCoinMesh,
  buildRaceRingMesh,
  buildStarOrbMesh,
  buildTargetDummyMesh,
} from '../render/cityModels';

// ============================================================================
// Modo Sandbox (Hekseville Cósmica) — Monedas, orbes, anclas y micro-retos.
//
// Diseño de rendimiento: `update()` NO aloja memoria. Todos los vectores,
// cuaterniones, strings de popup y objetos de marcador/HUD se preasignan en
// el constructor o en pools, y cada frame solo se mutan sus campos.
// ============================================================================

const RECORDS_STORAGE_KEY = 'outorbit_sandbox_records_v1';

const COIN_PICKUP_DIST_SQ = 2.2 * 2.2;
const ORB_PICKUP_DIST_SQ = 2.5 * 2.5;
const CHALLENGE_START_DIST_SQ = 3.8 * 3.8;
const ORB_MARKER_RANGE_SQ = 90 * 90;
const POPUP_DURATION_SEC = 2.6;
const ANCHOR_AIM_MIN_DOT = 0.25;
const ANCHOR_PULSE_SCALE = 1.28;
const DEFAULT_RING_RADIUS = 3.6;
/** Altitud extra de las dianas para que floten sobre la superficie. */
const TARGET_HOVER_ALTITUDE = 0.8;
/** Altura local de los discos dentro de `buildTargetDummyMesh()`. */
const TARGET_DISC_LOCAL_Y = 1.6;

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);

// Scratch reutilizado cada frame (update es single-threaded, sin reentradas).
const _spinQuat = new THREE.Quaternion();
const _tmpVec = new THREE.Vector3();
const _tmpVec2 = new THREE.Vector3();

const POPUP_COIN = '+1 MONEDA CÓSMICA';
const POPUP_ORB = '¡ORBE ESTRELLA ENCONTRADO!';
const POPUP_TIMEOUT = '¡TIEMPO AGOTADO!';
const POPUP_START = '¡RETO INICIADO!';

const ACCENT_GOLD = '#fbbf24';
const ACCENT_CYAN = '#22d3ee';
const ACCENT_RED = '#ef4444';
const ACCENT_YELLOW = '#facc15';

const MARKER_RACE_COLOR = '#22d3ee';
const MARKER_RACE_LABEL = 'ARO';
const MARKER_TARGET_COLOR = '#ef4444';
const MARKER_TARGET_LABEL = 'DIANA';
const MARKER_ORB_COLOR = '#fbbf24';
const MARKER_ORB_LABEL = 'ORBE ESTRELLA';

/** Marcador de objetivo del Sandbox (siguiente aro, diana u orbe cercano). */
export interface SandboxMarker {
  id: string;
  label: string;
  pos: THREE.Vector3;
  color: string;
}

/** Reto activo tal y como lo consume el HUD (espejo de `HudSnapshot`). */
export interface SandboxActiveChallengeHud {
  id: string;
  title: string;
  kind: SandboxChallengeKind;
  progress: number;
  total: number;
  timeLeftSec: number;
  timeLimitSec: number;
}

/** Estado del modo Sandbox para el HUD de React. */
export interface SandboxHudState {
  coins: number;
  coinsTotal: number;
  orbs: number;
  orbsTotal: number;
  challengesCompleted: number;
  challengesTotal: number;
  activeChallenge: SandboxActiveChallengeHud | null;
  anchorTargetInRange: boolean;
  popup: { text: string; accent: string } | null;
}

interface CollectibleRuntime {
  id: string;
  kind: CollectibleKind;
  mesh: THREE.Group;
  basePos: THREE.Vector3;
  normal: THREE.Vector3;
  alignQuat: THREE.Quaternion;
  spinSpeed: number;
  bobAmplitude: number;
  phase: number;
  collected: boolean;
}

interface AnchorRuntime {
  id: string;
  mesh: THREE.Group;
  basePos: THREE.Vector3;
  normal: THREE.Vector3;
  alignQuat: THREE.Quaternion;
  spinSpeed: number;
  bobAmplitude: number;
  phase: number;
  pulseScale: number;
}

interface CheckpointRuntime {
  mesh: THREE.Group;
  /** Centro de cruce (aro) o centro de la diana para impactos/marcadores. */
  pos: THREE.Vector3;
  basePos: THREE.Vector3;
  normal: THREE.Vector3;
  baseQuat: THREE.Quaternion;
  radius: number;
  materials: THREE.Material[];
  markerId: string;
  phase: number;
  destroyed: boolean;
}

interface ChallengeRuntime {
  spec: SandboxChallengeSpec;
  totemMesh: THREE.Group;
  totemPos: THREE.Vector3;
  checkpoints: CheckpointRuntime[];
  ringLabels: string[];
  raceMarkerId: string;
  startPrompt: string;
  restartPrompt: string;
  completePopup: string;
  completed: boolean;
}

/** Recorre un objeto y recoge sus materiales (marcándolos translúcidos). */
function collectMaterials(root: THREE.Object3D, makeTransparent: boolean): THREE.Material[] {
  const materials: THREE.Material[] = [];
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (makeTransparent) mat.transparent = true;
      materials.push(mat);
    }
  });
  return materials;
}

function setCheckpointOpacity(cp: CheckpointRuntime, opacity: number): void {
  for (let i = 0; i < cp.materials.length; i++) {
    cp.materials[i].opacity = opacity;
  }
}

function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) {
      for (const m of mat) m.dispose();
    } else {
      mat.dispose();
    }
  });
}

export class SandboxManager {
  private readonly parent: THREE.Group;
  private readonly planetById = new Map<string, PlanetRuntime>();
  private readonly collectibles: CollectibleRuntime[] = [];
  private readonly anchors: AnchorRuntime[] = [];
  private readonly challenges: ChallengeRuntime[] = [];
  private readonly completedChallenges = new Set<string>();

  private coins = 0;
  private orbs = 0;
  private coinsTotal = 0;
  private orbsTotal = 0;
  private challengesCompleted = 0;
  private readonly challengesTotal: number;

  private activeChallengeIndex = -1;
  private progress = 0;
  private timeLeftSec = 0;

  private anchorTargetInRange = false;
  private readonly bestAnchorPos = new THREE.Vector3();
  private readonly lastPlayerPos = new THREE.Vector3();

  private animTime = 0;
  private popupTimeLeft = 0;
  private readonly popupState = { text: '', accent: '' };
  private readonly activeChallengeHud: SandboxActiveChallengeHud = {
    id: '',
    title: '',
    kind: 'race',
    progress: 0,
    total: 0,
    timeLeftSec: 0,
    timeLimitSec: 0,
  };
  private readonly hudState: SandboxHudState = {
    coins: 0,
    coinsTotal: 0,
    orbs: 0,
    orbsTotal: 0,
    challengesCompleted: 0,
    challengesTotal: 0,
    activeChallenge: null,
    anchorTargetInRange: false,
    popup: null,
  };

  private readonly markers: SandboxMarker[] = [];
  private readonly markerPool: SandboxMarker[] = [];

  constructor(parentGroup: THREE.Group, planets: PlanetRuntime[], galaxy: GalaxySpec) {
    this.parent = parentGroup;
    for (const planet of planets) {
      this.planetById.set(planet.spec.id, planet);
    }
    this.loadRecords();

    // --- Coleccionables (monedas y orbes estrella) ---
    for (const spec of galaxy.collectibles ?? []) {
      const planet = this.planetById.get(spec.planetId);
      if (!planet && !spec.worldPos) continue;
      const mesh = spec.kind === 'coin' ? buildCosmicCoinMesh() : buildStarOrbMesh();
      const basePos = new THREE.Vector3();
      const normal = new THREE.Vector3();
      this.resolvePlacement(
        planet,
        spec.sphericalDir,
        spec.altitudeOffset ?? 0,
        spec.worldPos,
        basePos,
        normal
      );
      mesh.position.copy(basePos);
      mesh.quaternion.setFromUnitVectors(UP, normal);
      this.parent.add(mesh);
      this.collectibles.push({
        id: spec.id,
        kind: spec.kind,
        mesh,
        basePos,
        normal,
        alignQuat: mesh.quaternion.clone(),
        spinSpeed: spec.kind === 'coin' ? 2.4 : 1.5,
        bobAmplitude: spec.kind === 'coin' ? 0.18 : 0.28,
        phase: (this.collectibles.length * 1.7) % (Math.PI * 2),
        collected: false,
      });
      if (spec.kind === 'coin') this.coinsTotal++;
      else this.orbsTotal++;
    }

    // --- Nodos de ancla gravitatoria ---
    for (const spec of galaxy.anchorNodes ?? []) {
      const planet = this.planetById.get(spec.planetId);
      if (!planet && !spec.worldPos) continue;
      const mesh = buildAnchorSphereMesh(spec.color);
      const basePos = new THREE.Vector3();
      const normal = new THREE.Vector3();
      this.resolvePlacement(
        planet,
        spec.sphericalDir,
        spec.altitudeOffset ?? 0,
        spec.worldPos,
        basePos,
        normal
      );
      mesh.position.copy(basePos);
      mesh.quaternion.setFromUnitVectors(UP, normal);
      this.parent.add(mesh);
      this.anchors.push({
        id: spec.id,
        mesh,
        basePos,
        normal,
        alignQuat: mesh.quaternion.clone(),
        spinSpeed: 1.1,
        bobAmplitude: 0.22,
        phase: (this.anchors.length * 2.3) % (Math.PI * 2),
        pulseScale: 1,
      });
    }

    // --- Micro-retos (tótems + checkpoints ocultos hasta iniciarse) ---
    const challengeSpecs = galaxy.challenges ?? [];
    this.challengesTotal = challengeSpecs.length;
    for (const spec of challengeSpecs) {
      const planet = this.planetById.get(spec.planetId);
      if (!planet) continue;
      this.buildChallenge(spec, planet);
      if (this.completedChallenges.has(spec.id)) this.challengesCompleted++;
    }
  }

  // ==========================================================================
  // Actualización por frame (sin allocations)
  // ==========================================================================

  update(
    dt: number,
    playerPos: THREE.Vector3,
    aimDir: THREE.Vector3,
    anchorRange: number,
    onSound?: (kind: GameSoundKind) => void
  ): void {
    this.animTime += dt;
    this.lastPlayerPos.copy(playerPos);
    if (this.popupTimeLeft > 0) this.popupTimeLeft -= dt;

    // Coleccionables: giro + flotación + recogida.
    for (let i = 0; i < this.collectibles.length; i++) {
      const c = this.collectibles[i];
      if (c.collected) continue;
      _spinQuat.setFromAxisAngle(UP, this.animTime * c.spinSpeed + c.phase);
      c.mesh.quaternion.copy(c.alignQuat).multiply(_spinQuat);
      c.mesh.position
        .copy(c.basePos)
        .addScaledVector(c.normal, Math.sin(this.animTime * 2.1 + c.phase) * c.bobAmplitude);
      const distSq = c.mesh.position.distanceToSquared(playerPos);
      if (c.kind === 'coin') {
        if (distSq < COIN_PICKUP_DIST_SQ) {
          c.collected = true;
          c.mesh.visible = false;
          this.coins++;
          this.showPopup(POPUP_COIN, ACCENT_GOLD);
          onSound?.('keycard');
        }
      } else if (distSq < ORB_PICKUP_DIST_SQ) {
        c.collected = true;
        c.mesh.visible = false;
        this.orbs++;
        this.showPopup(POPUP_ORB, ACCENT_CYAN);
        onSound?.('victory');
      }
    }

    // Anclas: giro + flotación + mejor nodo dentro de rango y apuntado.
    let bestAnchor: AnchorRuntime | null = null;
    let bestDot = ANCHOR_AIM_MIN_DOT;
    const anchorRangeSq = anchorRange * anchorRange;
    for (let i = 0; i < this.anchors.length; i++) {
      const a = this.anchors[i];
      _spinQuat.setFromAxisAngle(UP, this.animTime * a.spinSpeed + a.phase);
      a.mesh.quaternion.copy(a.alignQuat).multiply(_spinQuat);
      a.mesh.position
        .copy(a.basePos)
        .addScaledVector(a.normal, Math.sin(this.animTime * 1.8 + a.phase) * a.bobAmplitude);
      if (a.mesh.position.distanceToSquared(playerPos) >= anchorRangeSq) continue;
      _tmpVec.copy(a.mesh.position).sub(playerPos).normalize();
      const dot = _tmpVec.dot(aimDir);
      if (dot > bestDot) {
        bestDot = dot;
        bestAnchor = a;
      }
    }
    this.anchorTargetInRange = bestAnchor !== null;
    if (bestAnchor) this.bestAnchorPos.copy(bestAnchor.mesh.position);
    for (let i = 0; i < this.anchors.length; i++) {
      const a = this.anchors[i];
      const targetScale = a === bestAnchor ? ANCHOR_PULSE_SCALE : 1;
      a.pulseScale += (targetScale - a.pulseScale) * Math.min(1, dt * 10);
      a.mesh.scale.setScalar(a.pulseScale);
    }

    // Reto activo: cuenta atrás y lógica por tipo.
    if (this.activeChallengeIndex < 0) return;
    const challenge = this.challenges[this.activeChallengeIndex];
    this.timeLeftSec -= dt;
    if (this.timeLeftSec <= 0) {
      this.cancelActiveChallenge();
      this.showPopup(POPUP_TIMEOUT, ACCENT_RED);
      onSound?.('hurt');
    } else if (challenge.spec.kind === 'race') {
      this.updateRace(challenge, playerPos, onSound);
    } else {
      this.updateTargets(challenge);
    }
  }

  private updateRace(
    challenge: ChallengeRuntime,
    playerPos: THREE.Vector3,
    onSound?: (kind: GameSoundKind) => void
  ): void {
    const checkpoints = challenge.checkpoints;
    for (let i = 0; i < checkpoints.length; i++) {
      const cp = checkpoints[i];
      if (i < this.progress) {
        cp.mesh.visible = false;
      } else if (i === this.progress) {
        // Aro activo: visible a plena opacidad, girando y pulsando suavemente.
        cp.mesh.visible = true;
        setCheckpointOpacity(cp, 1);
        _spinQuat.setFromAxisAngle(FORWARD, this.animTime * 1.7);
        cp.mesh.quaternion.copy(cp.baseQuat).multiply(_spinQuat);
        cp.mesh.scale.setScalar(1 + Math.sin(this.animTime * 4.2) * 0.045);
      } else if (i === this.progress + 1) {
        // Siguiente aro: visible pero atenuado.
        cp.mesh.visible = true;
        setCheckpointOpacity(cp, 0.35);
        cp.mesh.scale.setScalar(1);
      } else {
        cp.mesh.visible = false;
      }
    }
    const active = checkpoints[this.progress];
    if (
      active &&
      playerPos.distanceToSquared(active.pos) < active.radius * active.radius
    ) {
      this.progress++;
      const finished = this.progress >= checkpoints.length;
      onSound?.(finished ? 'anchor' : 'bounce');
      if (finished) this.completeActiveChallenge(onSound);
    }
  }

  private updateTargets(challenge: ChallengeRuntime): void {
    const checkpoints = challenge.checkpoints;
    for (let i = 0; i < checkpoints.length; i++) {
      const cp = checkpoints[i];
      if (cp.destroyed) continue;
      cp.mesh.visible = true;
      _spinQuat.setFromAxisAngle(UP, this.animTime * 1.2 + cp.phase);
      cp.mesh.quaternion.copy(cp.baseQuat).multiply(_spinQuat);
      cp.mesh.position
        .copy(cp.basePos)
        .addScaledVector(cp.normal, Math.sin(this.animTime * 1.6 + cp.phase) * 0.25);
    }
  }

  // ==========================================================================
  // API pública
  // ==========================================================================

  /** Posición del nodo de ancla apuntado (false si no hay ninguno válido). */
  getBestAnchorTarget(outPos: THREE.Vector3): boolean {
    if (!this.anchorTargetInRange) return false;
    outPos.copy(this.bestAnchorPos);
    return true;
  }

  /** Prompt de interacción del tótem de reto cercano (null si no hay). */
  isNearChallengeStart(playerPos: THREE.Vector3): string | null {
    for (let i = 0; i < this.challenges.length; i++) {
      const challenge = this.challenges[i];
      if (playerPos.distanceToSquared(challenge.totemPos) >= CHALLENGE_START_DIST_SQ) continue;
      const isActive = i === this.activeChallengeIndex;
      return isActive || challenge.completed ? challenge.restartPrompt : challenge.startPrompt;
    }
    return null;
  }

  /** Inicia (o reinicia) el reto con tótem a < 3.8 m. */
  tryStartNearestChallenge(
    playerPos: THREE.Vector3,
    onSound?: (kind: GameSoundKind) => void
  ): boolean {
    let bestIndex = -1;
    let bestDistSq = CHALLENGE_START_DIST_SQ;
    for (let i = 0; i < this.challenges.length; i++) {
      const distSq = playerPos.distanceToSquared(this.challenges[i].totemPos);
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestIndex = i;
      }
    }
    if (bestIndex < 0) return false;
    const challenge = this.challenges[bestIndex];
    this.activeChallengeIndex = bestIndex;
    this.progress = 0;
    this.timeLeftSec = challenge.spec.timeLimitSec;
    const checkpoints = challenge.checkpoints;
    for (let i = 0; i < checkpoints.length; i++) {
      const cp = checkpoints[i];
      cp.destroyed = false;
      cp.mesh.visible = true;
      cp.mesh.scale.setScalar(1);
      setCheckpointOpacity(cp, 1);
    }
    this.showPopup(POPUP_START, ACCENT_CYAN);
    onSound?.('switchClick');
    return true;
  }

  /**
   * Impacto de Estasis (o ataque) contra las dianas activas del reto
   * `'targets'` en curso. Devuelve cuántas dianas ha destruido.
   */
  hitTargetsNear(
    pos: THREE.Vector3,
    radius: number,
    onSound?: (kind: GameSoundKind) => void
  ): number {
    if (this.activeChallengeIndex < 0) return 0;
    const challenge = this.challenges[this.activeChallengeIndex];
    if (challenge.spec.kind !== 'targets') return 0;
    const radiusSq = radius * radius;
    let destroyedCount = 0;
    const checkpoints = challenge.checkpoints;
    for (let i = 0; i < checkpoints.length; i++) {
      const cp = checkpoints[i];
      if (cp.destroyed) continue;
      if (pos.distanceToSquared(cp.pos) >= radiusSq) continue;
      cp.destroyed = true;
      cp.mesh.visible = false;
      destroyedCount++;
      this.progress++;
      onSound?.('bounce');
    }
    if (destroyedCount > 0 && this.progress >= checkpoints.length) {
      this.completeActiveChallenge(onSound);
    }
    return destroyedCount;
  }

  /**
   * Marcadores activos para el HUD: siguiente aro de carrera, dianas vivas
   * u orbes estrella a < 90 m del jugador. Reutiliza objetos preasignados.
   */
  getChallengeMarkers(): SandboxMarker[] {
    this.markers.length = 0;
    if (this.activeChallengeIndex >= 0) {
      const challenge = this.challenges[this.activeChallengeIndex];
      const checkpoints = challenge.checkpoints;
      if (challenge.spec.kind === 'race') {
        if (this.progress < checkpoints.length) {
          const marker = this.nextMarker();
          marker.id = challenge.raceMarkerId;
          marker.label = challenge.ringLabels[this.progress];
          marker.pos.copy(checkpoints[this.progress].pos);
          marker.color = MARKER_RACE_COLOR;
        }
      } else {
        for (let i = 0; i < checkpoints.length; i++) {
          const cp = checkpoints[i];
          if (cp.destroyed) continue;
          const marker = this.nextMarker();
          marker.id = cp.markerId;
          marker.label = MARKER_TARGET_LABEL;
          marker.pos.copy(cp.pos);
          marker.color = MARKER_TARGET_COLOR;
        }
      }
    }
    for (let i = 0; i < this.collectibles.length; i++) {
      const c = this.collectibles[i];
      if (c.kind !== 'star_orb' || c.collected) continue;
      if (this.lastPlayerPos.distanceToSquared(c.basePos) >= ORB_MARKER_RANGE_SQ) continue;
      const marker = this.nextMarker();
      marker.id = c.id;
      marker.label = MARKER_ORB_LABEL;
      marker.pos.copy(c.basePos);
      marker.color = MARKER_ORB_COLOR;
    }
    return this.markers;
  }

  /** Snapshot del estado Sandbox para el HUD (objeto reutilizado, sin allocs). */
  getHudState(): SandboxHudState {
    const state = this.hudState;
    state.coins = this.coins;
    state.coinsTotal = this.coinsTotal;
    state.orbs = this.orbs;
    state.orbsTotal = this.orbsTotal;
    state.challengesCompleted = this.challengesCompleted;
    state.challengesTotal = this.challengesTotal;
    if (this.activeChallengeIndex >= 0) {
      const challenge = this.challenges[this.activeChallengeIndex];
      const hud = this.activeChallengeHud;
      hud.id = challenge.spec.id;
      hud.title = challenge.spec.title;
      hud.kind = challenge.spec.kind;
      hud.progress = this.progress;
      hud.total = challenge.checkpoints.length;
      hud.timeLeftSec = Math.max(0, this.timeLeftSec);
      hud.timeLimitSec = challenge.spec.timeLimitSec;
      state.activeChallenge = hud;
    } else {
      state.activeChallenge = null;
    }
    state.anchorTargetInRange = this.anchorTargetInRange;
    state.popup = this.popupTimeLeft > 0 ? this.popupState : null;
    return state;
  }

  dispose(): void {
    for (let i = 0; i < this.collectibles.length; i++) {
      this.parent.remove(this.collectibles[i].mesh);
      disposeObject3D(this.collectibles[i].mesh);
    }
    for (let i = 0; i < this.anchors.length; i++) {
      this.parent.remove(this.anchors[i].mesh);
      disposeObject3D(this.anchors[i].mesh);
    }
    for (let i = 0; i < this.challenges.length; i++) {
      const challenge = this.challenges[i];
      this.parent.remove(challenge.totemMesh);
      disposeObject3D(challenge.totemMesh);
      for (let j = 0; j < challenge.checkpoints.length; j++) {
        this.parent.remove(challenge.checkpoints[j].mesh);
        disposeObject3D(challenge.checkpoints[j].mesh);
      }
    }
    this.collectibles.length = 0;
    this.anchors.length = 0;
    this.challenges.length = 0;
    this.markers.length = 0;
    this.markerPool.length = 0;
    this.activeChallengeIndex = -1;
  }

  // ==========================================================================
  // Internos
  // ==========================================================================

  /**
   * Resuelve la posición mundo y la normal ("up" local) de un spec: usa
   * `worldPos` si existe (normal +Y mundial) o la superficie del planeta.
   */
  private resolvePlacement(
    planet: PlanetRuntime | undefined,
    sphericalDir: [number, number, number],
    altitudeOffset: number,
    worldPos: [number, number, number] | undefined,
    outPos: THREE.Vector3,
    outNormal: THREE.Vector3
  ): void {
    if (worldPos) {
      outPos.set(worldPos[0], worldPos[1], worldPos[2]);
      outNormal.set(0, 1, 0);
      return;
    }
    if (!planet) return;
    outNormal.set(sphericalDir[0], sphericalDir[1], sphericalDir[2]).normalize();
    outPos.copy(planet.centerVec).addScaledVector(outNormal, planet.spec.radius + altitudeOffset);
  }

  private buildChallenge(spec: SandboxChallengeSpec, planet: PlanetRuntime): void {
    const totemMesh = buildChallengeTotemMesh(spec.kind);
    const totemPos = new THREE.Vector3();
    const totemNormal = new THREE.Vector3();
    this.resolvePlacement(
      planet,
      spec.startDir,
      spec.startAltitudeOffset ?? 0,
      undefined,
      totemPos,
      totemNormal
    );
    totemMesh.position.copy(totemPos);
    totemMesh.quaternion.setFromUnitVectors(UP, totemNormal);
    this.parent.add(totemMesh);

    // Posiciones de todos los checkpoints antes de orientar los aros.
    const positions: THREE.Vector3[] = [];
    const normals: THREE.Vector3[] = [];
    for (const cpSpec of spec.checkpoints) {
      const cpPlanet = this.planetById.get(cpSpec.planetId) ?? planet;
      const pos = new THREE.Vector3();
      const normal = new THREE.Vector3();
      this.resolvePlacement(
        cpPlanet,
        cpSpec.sphericalDir,
        cpSpec.altitudeOffset ?? 0,
        cpSpec.worldPos,
        pos,
        normal
      );
      positions.push(pos);
      normals.push(normal);
    }

    const checkpoints: CheckpointRuntime[] = [];
    for (let i = 0; i < spec.checkpoints.length; i++) {
      const cpSpec = spec.checkpoints[i];
      const isRace = spec.kind === 'race';
      const mesh = isRace ? buildRaceRingMesh() : buildTargetDummyMesh();
      const materials = collectMaterials(mesh, isRace);
      const pos = positions[i];
      const normal = normals[i];
      let hitPos: THREE.Vector3;
      if (isRace) {
        // Aro: centrado en el checkpoint y con su eje +Z hacia el siguiente
        // (o tangente a la superficie si no hay dirección válida).
        mesh.position.copy(pos);
        const next = positions[(i + 1) % positions.length];
        _tmpVec.copy(next).sub(pos);
        if (_tmpVec.lengthSq() < 1e-8) {
          _tmpVec2.set(0, 1, 0);
          if (Math.abs(_tmpVec2.dot(normal)) > 0.9) _tmpVec2.set(1, 0, 0);
          _tmpVec.crossVectors(normal, _tmpVec2).normalize();
        } else {
          _tmpVec.normalize();
        }
        mesh.quaternion.setFromUnitVectors(FORWARD, _tmpVec);
        hitPos = pos;
      } else {
        // Diana: flota ligeramente sobre su posición; el centro de impacto
        // es el disco (y local 1.6 dentro del mesh).
        mesh.position.copy(pos).addScaledVector(normal, TARGET_HOVER_ALTITUDE);
        mesh.quaternion.setFromUnitVectors(UP, normal);
        hitPos = new THREE.Vector3().copy(mesh.position).addScaledVector(normal, TARGET_DISC_LOCAL_Y);
      }
      mesh.visible = false;
      this.parent.add(mesh);
      checkpoints.push({
        mesh,
        pos: hitPos,
        basePos: mesh.position.clone(),
        normal,
        baseQuat: mesh.quaternion.clone(),
        radius: cpSpec.radius ?? DEFAULT_RING_RADIUS,
        materials,
        markerId: `${spec.id}_cp${i}`,
        phase: (i * 0.9) % (Math.PI * 2),
        destroyed: false,
      });
    }

    const ringLabels: string[] = [];
    for (let i = 0; i < spec.checkpoints.length; i++) {
      ringLabels.push(`${MARKER_RACE_LABEL} ${i + 1}/${spec.checkpoints.length}`);
    }
    this.challenges.push({
      spec,
      totemMesh,
      totemPos,
      checkpoints,
      ringLabels,
      raceMarkerId: `${spec.id}_race`,
      startPrompt: `[E] Iniciar: ${spec.title}`,
      restartPrompt: `[E] Reiniciar: ${spec.title}`,
      completePopup: `¡RETO COMPLETADO! +${spec.rewardCoins} MONEDAS`,
      completed: this.completedChallenges.has(spec.id),
    });
  }

  private completeActiveChallenge(onSound?: (kind: GameSoundKind) => void): void {
    const challenge = this.challenges[this.activeChallengeIndex];
    this.coins += challenge.spec.rewardCoins;
    if (!challenge.completed) {
      challenge.completed = true;
      this.completedChallenges.add(challenge.spec.id);
      this.challengesCompleted++;
      this.saveRecords();
    }
    this.hideCheckpoints(challenge);
    this.activeChallengeIndex = -1;
    this.showPopup(challenge.completePopup, ACCENT_YELLOW);
    onSound?.('victory');
  }

  private cancelActiveChallenge(): void {
    if (this.activeChallengeIndex < 0) return;
    this.hideCheckpoints(this.challenges[this.activeChallengeIndex]);
    this.activeChallengeIndex = -1;
  }

  private hideCheckpoints(challenge: ChallengeRuntime): void {
    const checkpoints = challenge.checkpoints;
    for (let i = 0; i < checkpoints.length; i++) {
      const cp = checkpoints[i];
      cp.mesh.visible = false;
      cp.mesh.scale.setScalar(1);
      setCheckpointOpacity(cp, 1);
    }
  }

  private showPopup(text: string, accent: string): void {
    this.popupState.text = text;
    this.popupState.accent = accent;
    this.popupTimeLeft = POPUP_DURATION_SEC;
  }

  private nextMarker(): SandboxMarker {
    while (this.markerPool.length <= this.markers.length) {
      this.markerPool.push({ id: '', label: '', pos: new THREE.Vector3(), color: '' });
    }
    const marker = this.markerPool[this.markers.length];
    this.markers.push(marker);
    return marker;
  }

  private loadRecords(): void {
    try {
      const raw = localStorage.getItem(RECORDS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { completedChallenges?: unknown };
      if (!Array.isArray(parsed.completedChallenges)) return;
      for (const id of parsed.completedChallenges) {
        if (typeof id === 'string') this.completedChallenges.add(id);
      }
    } catch {
      // localStorage no disponible o corrupto: los récords son opcionales.
    }
  }

  private saveRecords(): void {
    try {
      localStorage.setItem(
        RECORDS_STORAGE_KEY,
        JSON.stringify({ completedChallenges: [...this.completedChallenges] })
      );
    } catch {
      // Escritura no disponible: se ignora silenciosamente.
    }
  }
}
