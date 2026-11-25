import * as THREE from 'three';
import { createComicCelMaterial } from '@/game/render/toonMaterials';
import { raycastSlabs } from './DomeSlabs';
import type { SlabCollider, SlabRaycastHit } from './domeTypes';
import type { ActiveSkillId } from './DomeProgression';

// ============================================================================
// DomeSkills — Ejecutor 3D de las 7 habilidades activas de la Cúpula.
//
// Gestiona proyectiles, ondas expansivas, pozos de atracción y singularidades
// activas en la escena. La interfaz `SkillTargetEnemy` es estructuralmente
// compatible con `TestEnemySphere` y futuros enemigos (id, position, velocity,
// radius, mesh).
// ============================================================================

export interface SkillTargetEnemy {
  id: string;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  radius: number;
  mesh: THREE.Object3D;
}

/**
 * Daña a un enemigo con un impulso cinético. El vector `impulse` solo es
 * válido DURANTE la llamada (puede ser un scratch reutilizado): consumirlo
 * de forma síncrona, nunca almacenarlo.
 */
export type DamageEnemyFn = (
  enemy: SkillTargetEnemy,
  amount: number,
  impulse: THREE.Vector3,
  bypassFlesh?: boolean
) => void;

export type SkillAnimOverride =
  | 'stasis_cast'
  | 'stasis_throw'
  | 'counter_parry'
  | 'eden_absorb'
  | 'air_dash';

export interface SkillTriggerContext {
  playerPos: THREE.Vector3;
  forwardDir: THREE.Vector3;
  isGrounded: boolean;
  isStill: boolean;
  lockedEnemy: SkillTargetEnemy | null;
  enemies: SkillTargetEnemy[];
  slabs: SlabCollider[];
  onDamageEnemy: DamageEnemyFn;
  onHealPlayer: (hp: number, eden: number) => void;
  /**
   * Bolas de Doble Filo: captura las bolas de tinta ácida del Pulpo Espiral
   * (base o de las 15 de la Bola Gigante) dentro de `radius` de `center` —
   * el Campo Gravitacional las coge EN VEZ de rocas. Devuelve sus mallas
   * (ya fuera del pool de proyectiles enemigo, visibles en escena).
   */
  captureEnemyProjectiles?: (center: THREE.Vector3, radius: number) => THREE.Mesh[];
}

export interface SkillTriggerResult {
  triggered: boolean;
  animOverride?: SkillAnimOverride;
}

// --- Ajustes de gameplay ---
const IMPLOSION_RANGE = 35;
const IMPLOSION_DAMAGE = 9999;
const GRAVITY_FIELD_RELEASE_RANGE = 60;
const DOME_KEEP_RADIUS = 86;
const BLACK_HOLE_DURATION = 4.5;
const BLACK_HOLE_SPEED = 7;
const BLACK_HOLE_TICK = 0.5;
const ATTRACTION_DURATION = 1.8;
const CRUSH_CONTACT_DISTANCE = 2.4;

// --- Escombros de suelos rotos (Gólem Rompesuelos): agarrables por el
//     Campo Gravitacional, que los absorbe y los convierte en rocas orbitantes.
const MAX_LOOSE_DEBRIS = 12;
/** Radio de succión del Campo Gravitacional activo sobre los escombros (m). */
const DEBRIS_ABSORB_RADIUS = 9;
/** Distancia a la que el escombro se convierte en fragmento orbitante (m). */
const DEBRIS_ABSORB_DISTANCE = 0.7;
/** Fricción del vuelo a la deriva de los escombros (1/s). */
const DEBRIS_DRIFT_DAMPING = 0.8;
/**
 * Bolas de Doble Filo: radio de captura de las bolas de tinta del Pulpo
 * Espiral alrededor de Nyx al activar el Campo Gravitacional (m).
 */
const INK_BALL_CAPTURE_RADIUS = 9;
/**
 * Daño efectivo de una bola capturada: x3 una roca pequeña al impactar.
 * El pipeline de skills convierte el daño en fuerza cinética
 * (impactSpeed = max(12, damage*0.4)): una roca pequeña (15) fuerza 12
 * (10.8 HP reales), la bola capturada (90) fuerza 36 = 32.4 HP = x3 exacto.
 */
const CAPTURED_INK_BALL_DAMAGE = 90;
const CAPTURED_INK_BALL_HIT_RADIUS = 0.85;

// --- Scratch a nivel de módulo: sin allocations por frame ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
/** Impulso reutilizado en los callbacks de daño (ver contrato de DamageEnemyFn). */
const _impulse = new THREE.Vector3();
/** Impulso nulo de las habilidades sin empuje (implosión). */
const _zeroImpulse = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
/** Hit reutilizado por el raycast de proyección del anillo de suelo. */
const _groundHit: SlabRaycastHit = {
  slab: null as unknown as SlabCollider,
  point: new THREE.Vector3(),
  normal: new THREE.Vector3(),
  distance: 0,
};
/** Origen/dirección del raycast del anillo de suelo (no aliasan con _v1.._v3). */
const _ringOrigin = new THREE.Vector3();
const _ringDir = new THREE.Vector3();

function nearestEnemy(
  from: THREE.Vector3,
  enemies: SkillTargetEnemy[],
  maxDist: number
): SkillTargetEnemy | null {
  let best: SkillTargetEnemy | null = null;
  let bestDist = maxDist;
  for (const enemy of enemies) {
    const d = from.distanceTo(enemy.position);
    if (d <= bestDist) {
      best = enemy;
      bestDist = d;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Estados internos de los efectos activos
// ---------------------------------------------------------------------------

type GravityRockSize = 'small' | 'medium' | 'large';

interface OrbitFragment {
  mesh: THREE.Mesh;
  sizeKind: GravityRockSize;
  damage: number;
  hitRadius: number;
  angle: number;
  angularSpeed: number;
  dist: number;
  height: number;
  spinAxis: THREE.Vector3;
  /**
   * Bola de tinta ácida capturada del Pulpo Espiral: al dispararla NO tiene
   * full auto-aim (sale en la dirección de apuntado de Nyx, homing nulo) e
   * inflige x3 el daño de una roca pequeña.
   */
  capturedInkBall?: boolean;
}

interface GravityFieldState {
  anchor: THREE.Vector3;
  forwardDir: THREE.Vector3;
  fragments: OrbitFragment[];
  level: number;
}

/**
 * Escombro suelto de un suelo roto (Gólem Rompesuelos): flota a la deriva en
 * la escena hasta que el Campo Gravitacional lo absorbe y lo convierte en un
 * `OrbitFragment` lanzable.
 */
interface LooseDebris {
  mesh: THREE.Mesh;
  sizeKind: GravityRockSize;
  damage: number;
  hitRadius: number;
  velocity: THREE.Vector3;
  spinAxis: THREE.Vector3;
}

interface ProjectileState {
  mesh: THREE.Mesh;
  /** Material clonado a desechar al expirar (null si es compartido). */
  material: THREE.MeshBasicMaterial | null;
  velocity: THREE.Vector3;
  remainingLife: number;
  damage: number;
  hitRadius: number;
  homingTarget: SkillTargetEnemy | null;
  homingStrength: number;
  hitIds: Set<string>;
  pierce: boolean;
  orientToVelocity: boolean;
  /** Bola de tinta ácida capturada del pulpo: al morir se devuelve al pool. */
  capturedInkBall: boolean;
}

interface ExpandingWave {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  elapsed: number;
  duration: number;
  maxRadius: number;
  baseOpacity: number;
}

type AttractionWellState =
  | {
      mode: 'enemy_pair';
      level: number;
      timer: number;
      link: THREE.Mesh;
      linkMaterial: THREE.MeshBasicMaterial;
      enemyA: SkillTargetEnemy;
      enemyB: SkillTargetEnemy;
    }
  | {
      mode: 'slab_crush';
      level: number;
      timer: number;
      link: THREE.Mesh;
      linkMaterial: THREE.MeshBasicMaterial;
      crushTarget: SkillTargetEnemy;
      slabA: SlabCollider;
      slabB: SlabCollider;
      crushedA: boolean;
      crushedB: boolean;
    };

interface BlackHoleState {
  group: THREE.Group;
  core: THREE.Mesh;
  ring: THREE.Mesh;
  velocity: THREE.Vector3;
  timer: number;
  radius: number;
  level: number;
  damageTickTimer: number;
  elapsed: number;
}

interface FadingVfx {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  elapsed: number;
  duration: number;
}

/** Cúpula translúcida de área con borde iridiscente cian-magenta. */
interface AreaDomeVfx {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  elapsed: number;
  duration: number;
  radius: number;
}

const AREA_DOME_VERT = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  void main() {
    vec4 worldPos = modelMatrix * vec4( position, 1.0 );
    vNormalW = normalize( mat3( modelMatrix ) * normal );
    vViewDir = normalize( cameraPosition - worldPos.xyz );
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const AREA_DOME_FRAG = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uOpacity;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  void main() {
    float f = 1.0 - abs( dot( normalize( vNormalW ), normalize( vViewDir ) ) );
    float rim = smoothstep( 0.35, 1.0, f );
    vec3 col = mix( uColorA, uColorB, rim );
    gl_FragColor = vec4( col, uOpacity * ( 0.10 + rim * 0.90 ) );
  }
`;

function createAreaDomeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: AREA_DOME_VERT,
    fragmentShader: AREA_DOME_FRAG,
    uniforms: {
      uColorA: { value: new THREE.Color(0x22d3ee) },
      uColorB: { value: new THREE.Color(0xa855f7) },
      uOpacity: { value: 0.55 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

// ---------------------------------------------------------------------------
// DomeSkillExecutor
// ---------------------------------------------------------------------------

export class DomeSkillExecutor {
  private readonly scene: THREE.Scene;

  private readonly projectiles: ProjectileState[] = [];
  private readonly waves: ExpandingWave[] = [];
  private readonly wells: AttractionWellState[] = [];
  /** Ids vivos del frame actual (updateWells): Set persistente sin GC. */
  private readonly wellAliveIds = new Set<string>();
  private readonly blackHoles: BlackHoleState[] = [];
  private readonly implosions: FadingVfx[] = [];
  private readonly halos: FadingVfx[] = [];
  private readonly domes: AreaDomeVfx[] = [];
  private gravityField: GravityFieldState | null = null;
  /** Escombros de suelos rotos esperando a ser agarrados por el campo. */
  private readonly looseDebris: LooseDebris[] = [];
  /**
   * Devuelve al pool del DomeWaveManager una bola de tinta ácida capturada
   * que ya no es nuestra (impactada, expirada, campo cancelado o dispose):
   * el game loop lo conecta con `waveMgr.recycleInkBallMesh(mesh)`.
   */
  onCapturedInkBallFreed?: (mesh: THREE.Mesh) => void;

  // --- Geometrías compartidas ---
  private readonly fragGeometry = new THREE.DodecahedronGeometry(0.34, 0);
  private readonly waveGeometry = new THREE.SphereGeometry(1, 20, 14);
  private readonly sliceGeometry = new THREE.TorusGeometry(0.95, 0.07, 8, 36);
  private readonly coreGeometry = new THREE.SphereGeometry(1.05, 20, 16);
  private readonly ringGeometry = new THREE.TorusGeometry(2.1, 0.2, 8, 42);
  private readonly linkGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1, 6, 1, true);
  private readonly haloGeometry = new THREE.TorusGeometry(1.15, 0.06, 8, 42);
  private readonly flashGeometry = new THREE.SphereGeometry(1, 16, 12);
  private readonly domeGeometry = new THREE.SphereGeometry(1, 24, 16);
  private readonly groundRingGeometry = new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2);

  // --- Materiales compartidos (roca sólida limpia sin shader galáctico) ---
  private readonly rockMaterial = new THREE.MeshStandardMaterial({
    color: 0x5a6275,
    roughness: 0.85,
    metalness: 0.12,
    flatShading: true,
  });
  /**
   * Bolas de tinta ácida capturadas (Bolas de Doble Filo): al ser capturadas
   * por el Campo Gravitacional cambian su shader rojo ácido por esta nebulosa
   * cósmica similar a la de Nyx (mismo abismo #090314 y nebulosas cian/violeta,
   * con estrellas titilantes en espacio de pantalla).
   */
  private readonly capturedInkBallMaterial: THREE.ShaderMaterial;
  private readonly waveMaterial = new THREE.MeshBasicMaterial({
    color: 0x7ae8dc,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  private readonly sliceMaterial = new THREE.MeshBasicMaterial({
    color: 0xdf9fff,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  private readonly coreMaterial = new THREE.MeshBasicMaterial({ color: 0x05030f });
  private readonly accretionMaterial = new THREE.MeshBasicMaterial({
    color: 0xdf9fff,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  private readonly linkMaterial = new THREE.MeshBasicMaterial({
    color: 0x42bde8,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  private readonly haloMaterial = new THREE.MeshBasicMaterial({
    color: 0x7dffa8,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  private readonly flashMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd992,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  private readonly implosionMaterial = new THREE.MeshBasicMaterial({
    color: 0xdf9fff,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  private readonly groundRingMaterial = new THREE.MeshBasicMaterial({
    color: 0x67e8f9,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.capturedInkBallMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uDeepColor: { value: new THREE.Color(0x090314) },
        uNebulaA: { value: new THREE.Color(0x7e22ce) },
        uNebulaB: { value: new THREE.Color(0x06b6d4) },
        uRimColor: { value: new THREE.Color(0xf8fafc) },
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: true,
      vertexShader: /* glsl */ `
        varying vec3 vNormalW;
        varying vec3 vViewDir;
        void main() {
          vec4 worldPos = modelMatrix * vec4( position, 1.0 );
          vNormalW = normalize( mat3( modelMatrix ) * normal );
          vViewDir = normalize( cameraPosition - worldPos.xyz );
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uDeepColor;
        uniform vec3 uNebulaA;
        uniform vec3 uNebulaB;
        uniform vec3 uRimColor;
        uniform float uTime;
        varying vec3 vNormalW;
        varying vec3 vViewDir;
        float hash21( vec2 p ) {
          p = fract( p * vec2( 234.34, 435.345 ) );
          p += dot( p, p + 34.23 );
          return fract( p.x * p.y );
        }
        float noise2( vec2 p ) {
          vec2 i = floor( p );
          vec2 f = fract( p );
          f = f * f * ( 3.0 - 2.0 * f );
          return mix(
            mix( hash21( i ), hash21( i + vec2( 1.0, 0.0 ) ), f.x ),
            mix( hash21( i + vec2( 0.0, 1.0 ) ), hash21( i + vec2( 1.0, 1.0 ) ), f.x ),
            f.y
          );
        }
        float fbm( vec2 p ) {
          float v = 0.0; float a = 0.5;
          mat2 m = mat2( 0.8, 0.6, -0.6, 0.8 );
          for ( int i = 0; i < 4; i++ ) { v += a * noise2( p ); p = m * p * 2.02; a *= 0.5; }
          return v;
        }
        void main() {
          vec2 uv = gl_FragCoord.xy * 0.02;
          vec2 drift = vec2( uTime * 0.05, -uTime * 0.03 );
          float n = fbm( uv + drift );
          vec3 col = uDeepColor;
          col = mix( col, uNebulaA * 0.85, smoothstep( 0.42, 0.85, n ) );
          col = mix( col, uNebulaB * 0.9, smoothstep( 0.55, 0.95, fbm( uv * 1.7 - drift ) ) );
          // Estrellas titilantes de la nebulosa.
          vec2 gv = fract( uv * 9.0 ) - 0.5;
          vec2 id = floor( uv * 9.0 );
          float h = hash21( id );
          float star = 0.0;
          if ( h > 0.72 ) {
            float d = length( gv );
            float tw = 0.6 + 0.4 * sin( uTime * 3.0 + h * 40.0 );
            star = smoothstep( 0.12, 0.0, d ) * tw;
          }
          col += vec3( 1.0 ) * star * 1.4;
          // Borde rim brillante tipo nebulosa de Nyx.
          float fresnel = pow( 1.0 - max( dot( normalize( vNormalW ), normalize( vViewDir ) ), 0.0 ), 2.0 );
          col += uRimColor * smoothstep( 0.25, 0.9, fresnel ) * 0.85;
          gl_FragColor = vec4( col, 0.96 );
        }
      `,
    });
  }

  // ------------------------------------------------------------------
  // Disparo de habilidades
  // ------------------------------------------------------------------

  triggerSkill(skillId: ActiveSkillId, skillLevel: number, ctx: SkillTriggerContext): SkillTriggerResult {
    switch (skillId) {
      case 'gravity_field':
        return this.triggerGravityField(skillLevel, ctx);
      case 'repulse_push':
        return this.triggerRepulsePush(skillLevel, ctx);
      case 'eden_absorb':
        return this.triggerEdenAbsorb(skillLevel, ctx);
      case 'attraction_well':
        return this.triggerAttractionWell(skillLevel, ctx);
      case 'bounce_horizon':
        return this.triggerBounceHorizon(skillLevel, ctx);
      case 'black_hole':
        return this.triggerBlackHole(skillLevel, ctx);
      case 'implosion':
        return this.triggerImplosion(ctx);
    }
  }

  hasActiveGravityRocks(): boolean {
    return this.gravityField !== null && this.gravityField.fragments.length > 0;
  }

  /** Hay una singularidad viva en la cúpula (para el zumbido del motor de audio). */
  hasActiveBlackHole(): boolean {
    return this.blackHoles.length > 0;
  }

  cancelGravityField(): void {
    const gf = this.gravityField;
    if (gf === null) return;
    this.gravityField = null;
    for (const fragment of gf.fragments) {
      this.scene.remove(fragment.mesh);
      if (fragment.capturedInkBall) {
        this.onCapturedInkBallFreed?.(fragment.mesh);
      }
    }
  }

  /** Dispara 1 sola roca del Campo Gravitacional hacia `target` (o hacia la mira). */
  fireOneGravityRock(
    playerPos: THREE.Vector3,
    forwardDir: THREE.Vector3,
    target: SkillTargetEnemy | null,
  ): boolean {
    const gf = this.gravityField;
    if (gf === null || gf.fragments.length === 0) return false;
    const fragment = gf.fragments.shift()!;
    if (gf.fragments.length === 0) {
      this.gravityField = null;
    }

    // Bola de tinta capturada: SIN full auto-aim — sale en la dirección de
    // apuntado de Nyx (homing nulo), aunque haya enemigo lockeado en la mira.
    const directAim = fragment.capturedInkBall === true;
    const aimPoint =
      directAim || target === null
        ? _v1.copy(playerPos).addScaledVector(forwardDir, 45)
        : target.position;
    _v2.subVectors(aimPoint, fragment.mesh.position);
    if (_v2.lengthSq() < 1e-6) _v2.copy(forwardDir);
    _v2.normalize();

    const speed = 34 + gf.level * 6;
    this.projectiles.push({
      mesh: fragment.mesh,
      material: null,
      velocity: _v2.clone().multiplyScalar(speed),
      remainingLife: 3.2,
      damage: fragment.damage,
      hitRadius: fragment.hitRadius,
      homingTarget: directAim ? null : target,
      homingStrength: directAim ? 0 : target !== null ? 10.5 : 0,
      hitIds: new Set<string>(),
      pierce: false,
      orientToVelocity: false,
      capturedInkBall: fragment.capturedInkBall === true,
    });
    return true;
  }

  /**
   * Campo Gravitacional: captura rocas según nivel:
   * - Nv1: 2 pequeñas
   * - Nv2: aleatorio [3 pequeñas | 2 medianas | 1 mediana + 2 pequeñas]
   * - Nv3+: aleatorio [1 grande | 3 medianas | 4 pequeñas]
   *
   * Los escombros sueltos cercanos (suelos rotos por el Gólem) se convierten
   * en las primeras rocas del campo; el resto se genera nuevo.
   *
   * Bolas de Doble Filo: si hay bolas de tinta ácida del Pulpo Espiral (base
   * o de las 15 de la Bola Gigante) dentro del radio de captura, se cogen
   * EN VEZ de rocas — cambian su shader rojo por la nebulosa cósmica de Nyx,
   * cuentan como proyectiles pequeños (x3 de daño de una roca pequeña al
   * dispararlas, sin full auto-aim) y llenan los primeros slots del plan.
   */
  private triggerGravityField(level: number, ctx: SkillTriggerContext): SkillTriggerResult {
    if (this.gravityField !== null) {
      this.cancelGravityField();
      return { triggered: true };
    }

    let plan: GravityRockSize[];
    if (level <= 1) {
      plan = ['small', 'small'];
    } else if (level === 2) {
      const opts: GravityRockSize[][] = [
        ['small', 'small', 'small'],
        ['medium', 'medium'],
        ['medium', 'small', 'small'],
      ];
      plan = opts[Math.floor(Math.random() * opts.length)];
    } else {
      const opts: GravityRockSize[][] = [
        ['large'],
        ['medium', 'medium', 'medium'],
        ['small', 'small', 'small', 'small'],
      ];
      plan = opts[Math.floor(Math.random() * opts.length)];
    }

    const anchor = ctx.playerPos.clone().addScaledVector(ctx.forwardDir, 2.3);
    this.gravityField = {
      anchor,
      forwardDir: ctx.forwardDir.clone().normalize(),
      fragments: [],
      level,
    };
    // Capa 1 del trío de área: anillo en el suelo bajo el ancla del campo.
    this.spawnAreaGroundRing(anchor, 4 + level, 0.6, ctx.slabs);

    // Bolas de tinta ácida del pulpo dentro del radio de captura: EN VEZ de
    // coger rocas (cada bola ocupa un slot del plan; el resto con escombros
    // y rocas nuevas).
    const capturedBalls = ctx.captureEnemyProjectiles?.(ctx.playerPos, INK_BALL_CAPTURE_RADIUS) ?? [];
    const cappedBalls = capturedBalls.slice(0, plan.length);
    for (let i = 0; i < cappedBalls.length; i++) {
      const ballMesh = cappedBalls[i];
      ballMesh.material = this.capturedInkBallMaterial;
      const fragment = this.makeOrbitFragment(ballMesh, 'small', {
        damage: CAPTURED_INK_BALL_DAMAGE,
        hitRadius: CAPTURED_INK_BALL_HIT_RADIUS,
      }, i, plan.length);
      fragment.capturedInkBall = true;
      this.gravityField.fragments.push(fragment);
    }

    // Escombros agarrables: los más cercanos a Nyx se convierten en rocas
    // orbitantes antes de generar rocas nuevas.
    while (
      this.gravityField.fragments.length < plan.length &&
      this.looseDebris.length > 0
    ) {
      let nearestIdx = 0;
      let nearestDist = Infinity;
      for (let i = 0; i < this.looseDebris.length; i++) {
        const d = this.looseDebris[i].mesh.position.distanceTo(anchor);
        if (d < nearestDist) {
          nearestDist = d;
          nearestIdx = i;
        }
      }
      this.absorbDebrisIntoField(this.looseDebris.splice(nearestIdx, 1)[0]);
    }

    const fragments = this.gravityField.fragments;
    while (fragments.length < plan.length) {
      const sizeKind = plan[fragments.length];
      const stats = this.rockStats(sizeKind);
      const mesh = new THREE.Mesh(this.fragGeometry, this.rockMaterial);
      mesh.scale.setScalar(stats.scale);
      this.scene.add(mesh);
      fragments.push(this.makeOrbitFragment(mesh, sizeKind, stats, fragments.length, plan.length));
    }
    return { triggered: true, animOverride: 'stasis_cast' };
  }

  /** Stats de roca por tamaño (daño, radio de impacto y escala visual). */
  private rockStats(sizeKind: GravityRockSize): { scale: number; damage: number; hitRadius: number } {
    if (sizeKind === 'large') return { scale: 2.85, damage: 58, hitRadius: 1.85 };
    if (sizeKind === 'medium') return { scale: 1.7, damage: 28, hitRadius: 1.25 };
    return { scale: 0.95, damage: 15, hitRadius: 0.85 };
  }

  /** Fragmento orbitante a partir de una malla ya creada (roca o escombro). */
  private makeOrbitFragment(
    mesh: THREE.Mesh,
    sizeKind: GravityRockSize,
    stats: { damage: number; hitRadius: number },
    index: number,
    count: number,
  ): OrbitFragment {
    return {
      mesh,
      sizeKind,
      damage: stats.damage,
      hitRadius: stats.hitRadius,
      angle: (index / count) * Math.PI * 2,
      angularSpeed: 2.1 + Math.random() * 0.7,
      dist: sizeKind === 'large' ? 2.1 : 1.55 + Math.random() * 0.55,
      height: (Math.random() - 0.5) * 0.9,
      spinAxis: new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      ).normalize(),
    };
  }

  /**
   * Genera escombros agarrables de un suelo roto (Gólem Rompesuelos): rocas
   * pequeñas/medianas que quedan a la deriva hasta que el Campo Gravitacional
   * las absorbe (al lanzarlo o si ya está activo).
   */
  spawnSlabDebris(origin: THREE.Vector3, count: number): void {
    for (let i = 0; i < count; i++) {
      if (this.looseDebris.length >= MAX_LOOSE_DEBRIS) {
        const oldest = this.looseDebris.shift()!;
        this.scene.remove(oldest.mesh);
      }
      const sizeKind: GravityRockSize = i % 3 === 0 ? 'medium' : 'small';
      const stats = this.rockStats(sizeKind);
      const mesh = new THREE.Mesh(this.fragGeometry, this.rockMaterial);
      mesh.scale.setScalar(stats.scale);
      mesh.position.copy(origin);
      this.scene.add(mesh);
      this.looseDebris.push({
        mesh,
        sizeKind,
        damage: stats.damage,
        hitRadius: stats.hitRadius,
        velocity: new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() * 0.6,
          Math.random() - 0.5
        )
          .normalize()
          .multiplyScalar(2.5 + Math.random() * 3.5),
        spinAxis: new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5
        ).normalize(),
      });
    }
  }

  /** Convierte un escombro suelto en fragmento orbitante del campo activo. */
  private absorbDebrisIntoField(debris: LooseDebris): void {
    const gf = this.gravityField;
    if (gf === null) {
      return;
    }
    gf.fragments.push(
      this.makeOrbitFragment(debris.mesh, debris.sizeKind, debris, gf.fragments.length, gf.fragments.length + 1)
    );
  }

  /** Deriva de los escombros + succión del Campo Gravitacional activo. */
  private updateLooseDebris(dt: number): void {
    const gf = this.gravityField;
    for (let i = this.looseDebris.length - 1; i >= 0; i--) {
      const debris = this.looseDebris[i];
      debris.mesh.position.addScaledVector(debris.velocity, dt);
      debris.velocity.multiplyScalar(Math.exp(-DEBRIS_DRIFT_DAMPING * dt));
      debris.mesh.rotateOnAxis(debris.spinAxis, dt * 2);

      if (gf !== null) {
        _v1.subVectors(gf.anchor, debris.mesh.position);
        const dist = _v1.length();
        if (dist < DEBRIS_ABSORB_RADIUS) {
          if (dist < DEBRIS_ABSORB_DISTANCE) {
            this.looseDebris.splice(i, 1);
            this.absorbDebrisIntoField(debris);
            continue;
          }
          // Succión proporcional a la cercanía del ancla del campo.
          debris.velocity.addScaledVector(
            _v1.normalize(),
            (12 + (DEBRIS_ABSORB_RADIUS - dist) * 2.2) * dt
          );
        }
      }
    }
  }

  /** Lanza todos los fragmentos restantes contra `targetPos` (helper legacy). */
  releaseGravityField(targetPos?: THREE.Vector3): void {
    const gf = this.gravityField;
    if (gf === null) return;
    while (this.gravityField !== null && this.gravityField.fragments.length > 0) {
      const targetDummy = targetPos
        ? { id: '__pos__', position: targetPos, velocity: _v1, radius: 1, mesh: gf.fragments[0].mesh }
        : null;
      this.fireOneGravityRock(gf.anchor, gf.forwardDir, targetDummy);
    }
  }

  /** Empuje: pulso repulsor radial + onda esférica expansiva. */
  private triggerRepulsePush(level: number, ctx: SkillTriggerContext): SkillTriggerResult {
    const radius = 9 + level * 3;
    const force = 16 + level * 7;
    const damage = 4 + level * 3;

    for (const enemy of ctx.enemies) {
      _v1.subVectors(enemy.position, ctx.playerPos);
      const dist = _v1.length();
      if (dist > radius || dist < 1e-4) continue;
      _v1.divideScalar(dist);
      // Giro lento en 0G: componente tangencial al radio, además del empuje.
      _v2.crossVectors(_v1, UP);
      if (_v2.lengthSq() > 1e-6) _v2.normalize();
      _v1.multiplyScalar(force).addScaledVector(_v2, force * 0.35);
      _v1.y += force * 0.25;
      _impulse.copy(_v1);
      ctx.onDamageEnemy(enemy, damage, _impulse);
    }

    // El propio suelo flotante también se aleja... si no estás apoyada en él.
    if (!ctx.isGrounded) {
      for (const slab of ctx.slabs) {
        _v1.subVectors(slab.center, ctx.playerPos);
        const dist = _v1.length();
        if (dist > radius + 2 || dist < 1e-4) continue;
        _v1.divideScalar(dist).multiplyScalar(force * 0.12);
        slab.basePos.add(_v1);
        if (slab.basePos.length() > DOME_KEEP_RADIUS) {
          slab.basePos.setLength(DOME_KEEP_RADIUS);
        }
      }
    }

    this.spawnExpandingWave(ctx.playerPos, radius + 2.5, 0.55, this.waveMaterial);
    // Lectura de área en 3 capas: anillo pegado al suelo + cúpula iridiscente
    // con el radio exacto (el giro 0G va en el impulso tangencial de arriba).
    this.spawnAreaDome(ctx.playerPos, radius, 0.55);
    this.spawnAreaGroundRing(ctx.playerPos, radius, 0.55, ctx.slabs);
    return { triggered: true, animOverride: 'counter_parry' };
  }

  /** Absorción de Edén: canalización quieta que cura Vida y Edén. */
  private triggerEdenAbsorb(level: number, ctx: SkillTriggerContext): SkillTriggerResult {
    if (!ctx.isStill) return { triggered: false };
    const hp = 5 + level * 4;
    const eden = 8 + level * 5;
    ctx.onHealPlayer(hp, eden);
    this.spawnHalo(ctx.playerPos);
    return { triggered: true, animOverride: 'eden_absorb' };
  }

  /** Pozo de Atracción: enlaza 2 enemigos (o 2 slabs contra 1 enemigo). */
  private triggerAttractionWell(level: number, ctx: SkillTriggerContext): SkillTriggerResult {
    const range = 22 + level * 6;
    const candidates = ctx.enemies
      .filter((enemy) => enemy.position.distanceTo(ctx.playerPos) <= range)
      .sort(
        (a, b) => a.position.distanceTo(ctx.playerPos) - b.position.distanceTo(ctx.playerPos)
      );

    if (candidates.length >= 2) {
      const link = new THREE.Mesh(this.linkGeometry, this.linkMaterial.clone());
      this.scene.add(link);
      // Cúpula de área en el punto medio del enlace: marca el radio de acción.
      _v3.addVectors(candidates[0].position, candidates[1].position).multiplyScalar(0.5);
      this.spawnAreaDome(_v3, 6 + level, ATTRACTION_DURATION);
      this.spawnAreaGroundRing(_v3, 6 + level, ATTRACTION_DURATION, ctx.slabs);
      this.wells.push({
        mode: 'enemy_pair',
        level,
        timer: ATTRACTION_DURATION,
        link,
        linkMaterial: link.material as THREE.MeshBasicMaterial,
        enemyA: candidates[0],
        enemyB: candidates[1],
      });
      return { triggered: true, animOverride: 'stasis_cast' };
    }

    // Con 1 enemigo a rango: aplastamiento con los 2 slabs más cercanos.
    if (candidates.length === 1) {
      const slabs = ctx.slabs
        .filter((slab) => slab.center.distanceTo(ctx.playerPos) <= range + 10)
        .sort(
          (a, b) => a.center.distanceTo(ctx.playerPos) - b.center.distanceTo(ctx.playerPos)
        )
        .slice(0, 2);
      if (slabs.length === 2) {
        const link = new THREE.Mesh(this.linkGeometry, this.linkMaterial.clone());
        this.scene.add(link);
        this.spawnAreaDome(candidates[0].position, 5 + level, ATTRACTION_DURATION);
        this.spawnAreaGroundRing(
          candidates[0].position,
          5 + level,
          ATTRACTION_DURATION,
          ctx.slabs,
        );
        this.wells.push({
          mode: 'slab_crush',
          level,
          timer: ATTRACTION_DURATION,
          link,
          linkMaterial: link.material as THREE.MeshBasicMaterial,
          crushTarget: candidates[0],
          slabA: slabs[0],
          slabB: slabs[1],
          crushedA: false,
          crushedB: false,
        });
        return { triggered: true, animOverride: 'stasis_cast' };
      }
    }

    return { triggered: false };
  }

  /** Horizonte de Rebote: `skillLevel` ondas cortantes en arco (homing Nv2+). */
  private triggerBounceHorizon(level: number, ctx: SkillTriggerContext): SkillTriggerResult {
    const count = Math.max(1, level);
    const speed = 40;
    const damage = 7 + level * 3;
    const homingStrength = level >= 2 && ctx.lockedEnemy !== null ? 2.4 : 0;

    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * THREE.MathUtils.degToRad(14);
      _v1.copy(ctx.forwardDir).applyAxisAngle(UP, spread).normalize();
      const material = this.sliceMaterial.clone();
      const mesh = new THREE.Mesh(this.sliceGeometry, material);
      mesh.position.copy(ctx.playerPos).addScaledVector(_v1, 1.2);
      mesh.lookAt(_v2.copy(mesh.position).add(_v1));
      this.scene.add(mesh);
      this.projectiles.push({
        mesh,
        material,
        velocity: _v1.clone().multiplyScalar(speed),
        remainingLife: 2.2,
        damage,
        hitRadius: 1.1,
        homingTarget: homingStrength > 0 ? ctx.lockedEnemy : null,
        homingStrength,
        hitIds: new Set<string>(),
        pierce: true,
        orientToVelocity: true,
        capturedInkBall: false,
      });
    }
    return { triggered: true, animOverride: 'air_dash' };
  }

  /** Agujero Negro: singularidad lenta con disco de acreción (4.5 s). */
  private triggerBlackHole(level: number, ctx: SkillTriggerContext): SkillTriggerResult {
    const group = new THREE.Group();
    const core = new THREE.Mesh(this.coreGeometry, this.coreMaterial);
    const ring = new THREE.Mesh(this.ringGeometry, this.accretionMaterial);
    ring.rotation.x = Math.PI / 2.4;
    group.add(core);
    group.add(ring);
    group.position.copy(ctx.playerPos).addScaledVector(ctx.forwardDir, 1.5);
    this.scene.add(group);

    // Cúpula de área anclada al grupo: acompaña a la singularidad en su deriva.
    this.spawnAreaDome(group.position, 8 + level * 2.5, BLACK_HOLE_DURATION, group);
    this.spawnAreaGroundRing(group.position, 8 + level * 2.5, BLACK_HOLE_DURATION, ctx.slabs);

    this.blackHoles.push({
      group,
      core,
      ring,
      velocity: ctx.forwardDir.clone().normalize().multiplyScalar(BLACK_HOLE_SPEED),
      timer: BLACK_HOLE_DURATION,
      radius: 8 + level * 2.5,
      level,
      damageTickTimer: 0,
      elapsed: 0,
    });
    return { triggered: true, animOverride: 'stasis_throw' };
  }

  /** Implosión: colapso instantáneo y letal sobre el objetivo. */
  private triggerImplosion(ctx: SkillTriggerContext): SkillTriggerResult {
    const target =
      ctx.lockedEnemy ?? nearestEnemy(ctx.playerPos, ctx.enemies, IMPLOSION_RANGE);
    if (target === null) return { triggered: false };

    this.spawnImplosion(target.position);
    this.spawnAreaDome(target.position, 4, 0.5);
    this.spawnAreaGroundRing(target.position, 4, 0.5, ctx.slabs);
    ctx.onDamageEnemy(target, IMPLOSION_DAMAGE, _zeroImpulse, true);
    return { triggered: true, animOverride: 'eden_absorb' };
  }

  // ------------------------------------------------------------------
  // Actualización por frame
  // ------------------------------------------------------------------

  update(
    dt: number,
    enemies: SkillTargetEnemy[],
    onDamageEnemy: DamageEnemyFn,
    playerPos?: THREE.Vector3,
    forwardDir?: THREE.Vector3,
  ): void {
    // Reloj de la nebulosa cósmica de las bolas capturadas (en órbita y en vuelo,
    // mientras la Mesh viva en escena).
    this.capturedInkBallMaterial.uniforms.uTime.value += dt;
    this.updateGravityField(dt, playerPos, forwardDir);
    this.updateLooseDebris(dt);
    this.updateProjectiles(dt, enemies, onDamageEnemy);
    this.updateWaves(dt);
    this.updateWells(dt, enemies, onDamageEnemy);
    this.updateBlackHoles(dt, enemies, onDamageEnemy);
    this.updateDomes(dt);
    this.updateFadingVfx(this.implosions, dt);
    this.updateFadingVfx(this.halos, dt);
  }

  private updateGravityField(
    dt: number,
    playerPos?: THREE.Vector3,
    forwardDir?: THREE.Vector3,
  ): void {
    const gf = this.gravityField;
    if (gf === null) return;
    if (playerPos && forwardDir) {
      gf.forwardDir.copy(forwardDir).normalize();
      gf.anchor.copy(playerPos).addScaledVector(gf.forwardDir, 2.3);
    }
    for (const fragment of gf.fragments) {
      fragment.angle += fragment.angularSpeed * dt;
      fragment.mesh.position.set(
        gf.anchor.x + Math.cos(fragment.angle) * fragment.dist,
        gf.anchor.y + fragment.height + Math.sin(fragment.angle * 2) * 0.25,
        gf.anchor.z + Math.sin(fragment.angle) * fragment.dist
      );
      fragment.mesh.rotateOnAxis(fragment.spinAxis, dt * 2.5);
    }
  }

  private updateProjectiles(
    dt: number,
    enemies: SkillTargetEnemy[],
    onDamageEnemy: DamageEnemyFn
  ): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.remainingLife -= dt;

      // Homing suave hacia el objetivo bloqueado (Horizonte de Rebote Nv2+).
      if (p.homingTarget !== null && p.homingStrength > 0) {
        _v1.subVectors(p.homingTarget.position, p.mesh.position);
        if (_v1.lengthSq() > 1e-6) {
          const speed = p.velocity.length();
          _v1.normalize();
          p.velocity
            .addScaledVector(_v1, speed * p.homingStrength * dt)
            .normalize()
            .multiplyScalar(speed);
        }
      }

      p.mesh.position.addScaledVector(p.velocity, dt);
      if (p.orientToVelocity) {
        p.mesh.lookAt(_v2.copy(p.mesh.position).add(p.velocity));
      }

      let killed = false;
      for (const enemy of enemies) {
        if (p.hitIds.has(enemy.id)) continue;
        if (p.mesh.position.distanceTo(enemy.position) <= enemy.radius + p.hitRadius) {
          p.hitIds.add(enemy.id);
          _impulse.copy(p.velocity).normalize().multiplyScalar(9);
          onDamageEnemy(enemy, p.damage, _impulse);
          if (!p.pierce) {
            killed = true;
            break;
          }
        }
      }

      if (killed || p.remainingLife <= 0) {
        this.scene.remove(p.mesh);
        if (p.material !== null) p.material.dispose();
        if (p.capturedInkBall) {
          this.onCapturedInkBallFreed?.(p.mesh);
        }
        this.projectiles.splice(i, 1);
      }
    }
  }

  private updateWaves(dt: number): void {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const wave = this.waves[i];
      wave.elapsed += dt;
      const t = Math.min(1, wave.elapsed / wave.duration);
      // easeOutCubic para un frente expansivo que frena al final.
      const eased = 1 - Math.pow(1 - t, 3);
      wave.mesh.scale.setScalar(Math.max(0.01, wave.maxRadius * eased));
      wave.material.opacity = wave.baseOpacity * (1 - t);
      if (t >= 1) {
        this.scene.remove(wave.mesh);
        wave.material.dispose();
        this.waves.splice(i, 1);
      }
    }
  }

  private updateWells(
    dt: number,
    enemies: SkillTargetEnemy[],
    onDamageEnemy: DamageEnemyFn
  ): void {
    if (this.wells.length === 0) return;
    // Set persistente reutilizado cada frame (antes: new Set(map()) por frame).
    const aliveIds = this.wellAliveIds;
    aliveIds.clear();
    for (const enemy of enemies) {
      aliveIds.add(enemy.id);
    }

    for (let i = this.wells.length - 1; i >= 0; i--) {
      const well = this.wells[i];
      well.timer -= dt;
      let done = well.timer <= 0;

      if (well.mode === 'enemy_pair') {
        if (!aliveIds.has(well.enemyA.id) || !aliveIds.has(well.enemyB.id)) {
          done = true;
        } else {
          const pullAccel = 30 + well.level * 10;
          _v1.addVectors(well.enemyA.position, well.enemyB.position).multiplyScalar(0.5);
          this.pullEnemy(well.enemyA, _v1, pullAccel, dt);
          this.pullEnemy(well.enemyB, _v1, pullAccel, dt);
          this.orientLink(well.link, well.enemyA.position, well.enemyB.position);

          const dist = well.enemyA.position.distanceTo(well.enemyB.position);
          if (dist <= well.enemyA.radius + well.enemyB.radius + 0.6) {
            const damage = 10 + well.level * 5;
            onDamageEnemy(
              well.enemyA,
              damage,
              _impulse
                .subVectors(well.enemyB.position, well.enemyA.position)
                .normalize()
                .multiplyScalar(10)
            );
            onDamageEnemy(
              well.enemyB,
              damage,
              _impulse
                .subVectors(well.enemyA.position, well.enemyB.position)
                .normalize()
                .multiplyScalar(10)
            );
            _v3.addVectors(well.enemyA.position, well.enemyB.position).multiplyScalar(0.5);
            this.spawnExpandingWave(_v3, 3, 0.35, this.flashMaterial);
            done = true;
          }
        }
      } else {
        if (!aliveIds.has(well.crushTarget.id)) {
          done = true;
        } else {
          const crushSpeed = 5 + well.level * 1.5;
          this.moveSlabToward(well.slabA, well.crushTarget.position, crushSpeed, dt);
          this.moveSlabToward(well.slabB, well.crushTarget.position, crushSpeed, dt);
          this.orientLink(well.link, well.slabA.center, well.slabB.center);

          const damage = 12 + well.level * 6;
          if (
            !well.crushedA &&
            well.slabA.center.distanceTo(well.crushTarget.position) <=
              well.crushTarget.radius + CRUSH_CONTACT_DISTANCE
          ) {
            well.crushedA = true;
            onDamageEnemy(
              well.crushTarget,
              damage,
              _impulse
                .subVectors(well.slabA.center, well.crushTarget.position)
                .normalize()
                .multiplyScalar(8)
            );
            this.spawnExpandingWave(well.crushTarget.position, 2.5, 0.3, this.flashMaterial);
          }
          if (
            !well.crushedB &&
            well.slabB.center.distanceTo(well.crushTarget.position) <=
              well.crushTarget.radius + CRUSH_CONTACT_DISTANCE
          ) {
            well.crushedB = true;
            onDamageEnemy(
              well.crushTarget,
              damage,
              _impulse
                .subVectors(well.slabB.center, well.crushTarget.position)
                .normalize()
                .multiplyScalar(8)
            );
            this.spawnExpandingWave(well.crushTarget.position, 2.5, 0.3, this.flashMaterial);
          }
          if (well.crushedA && well.crushedB) done = true;
        }
      }

      if (done) {
        this.scene.remove(well.link);
        well.linkMaterial.dispose();
        this.wells.splice(i, 1);
      }
    }
  }

  private updateBlackHoles(
    dt: number,
    enemies: SkillTargetEnemy[],
    onDamageEnemy: DamageEnemyFn
  ): void {
    for (let i = this.blackHoles.length - 1; i >= 0; i--) {
      const bh = this.blackHoles[i];
      bh.timer -= dt;
      bh.elapsed += dt;
      bh.group.position.addScaledVector(bh.velocity, dt);

      // Disco de acreción: bamboleo + pulso de escala del horizonte.
      bh.ring.rotation.x = Math.PI / 2.4 + Math.sin(bh.elapsed * 3.0) * 0.18;
      bh.ring.rotation.z += dt * 2.4;
      const horizonPulse = 1 + Math.sin(bh.elapsed * 5.0) * 0.08;
      bh.core.scale.setScalar(horizonPulse);

      // Succión gravitatoria dentro del horizonte de sucesos.
      for (const enemy of enemies) {
        _v1.subVectors(bh.group.position, enemy.position);
        const dist = _v1.length();
        if (dist < bh.radius && dist > 1e-4) {
          const pull = (26 + bh.level * 9) * (1 - dist / bh.radius) + 6;
          enemy.velocity.addScaledVector(_v1.divideScalar(dist), pull * dt);
        }
      }

      // Daño periódico a todo lo que haya caído en el horizonte.
      bh.damageTickTimer -= dt;
      if (bh.damageTickTimer <= 0) {
        bh.damageTickTimer = BLACK_HOLE_TICK;
        for (const enemy of enemies) {
          if (enemy.position.distanceTo(bh.group.position) <= bh.radius) {
            onDamageEnemy(
              enemy,
              5 + bh.level * 2,
              _impulse
                .subVectors(bh.group.position, enemy.position)
                .normalize()
                .multiplyScalar(6)
            );
          }
        }
      }

      if (bh.timer <= 0) {
        this.spawnExpandingWave(bh.group.position, bh.radius * 0.8, 0.45, this.flashMaterial);
        this.scene.remove(bh.group);
        this.blackHoles.splice(i, 1);
      }
    }
  }

  private updateFadingVfx(list: FadingVfx[], dt: number): void {
    for (let i = list.length - 1; i >= 0; i--) {
      const vfx = list[i];
      vfx.elapsed += dt;
      const t = Math.min(1, vfx.elapsed / vfx.duration);
      if (list === this.halos) {
        // Halo ascendente de la Absorción de Edén.
        vfx.mesh.position.y += dt * 1.2;
        vfx.mesh.rotation.y += dt * 2.0;
        vfx.mesh.scale.setScalar(1 + t * 0.6);
      } else {
        // Implosión: esfera que se comprime hacia dentro.
        vfx.mesh.scale.setScalar(Math.max(0.05, 3.5 * (1 - t) + 0.2));
      }
      vfx.material.opacity = 0.85 * (1 - t);
      if (t >= 1) {
        this.scene.remove(vfx.mesh);
        vfx.material.dispose();
        list.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------------
  // Spawners de VFX
  // ------------------------------------------------------------------

  private spawnExpandingWave(
    position: THREE.Vector3,
    maxRadius: number,
    duration: number,
    baseMaterial: THREE.MeshBasicMaterial
  ): void {
    const material = baseMaterial.clone();
    const mesh = new THREE.Mesh(this.waveGeometry, material);
    mesh.position.copy(position);
    mesh.scale.setScalar(0.01);
    this.scene.add(mesh);
    this.waves.push({
      mesh,
      material,
      elapsed: 0,
      duration,
      maxRadius,
      baseOpacity: material.opacity,
    });
  }

  private spawnHalo(position: THREE.Vector3): void {
    const material = this.haloMaterial.clone();
    const mesh = new THREE.Mesh(this.haloGeometry, material);
    mesh.position.copy(position);
    mesh.rotation.x = Math.PI / 2;
    this.scene.add(mesh);
    this.halos.push({ mesh, material, elapsed: 0, duration: 1.2 });
  }

  private spawnImplosion(position: THREE.Vector3): void {
    const material = this.implosionMaterial.clone();
    const mesh = new THREE.Mesh(this.flashGeometry, material);
    mesh.position.copy(position);
    mesh.scale.setScalar(3.5);
    this.scene.add(mesh);
    this.implosions.push({ mesh, material, elapsed: 0, duration: 0.6 });
    // Destello dorado de colapso además de la compresión.
    this.spawnExpandingWave(position, 4, 0.35, this.flashMaterial);
  }

  /**
   * Capa 2 de lectura de área: cúpula translúcida con borde iridiscente
   * cian-magenta que marca el radio EXACTO de acción de la habilidad.
   */
  private spawnAreaDome(
    position: THREE.Vector3,
    radius: number,
    duration: number,
    parent?: THREE.Object3D,
  ): void {
    const material = createAreaDomeMaterial();
    const mesh = new THREE.Mesh(this.domeGeometry, material);
    if (parent) {
      mesh.position.set(0, 0, 0);
      parent.add(mesh);
    } else {
      mesh.position.copy(position);
      this.scene.add(mesh);
    }
    mesh.scale.setScalar(0.01);
    this.domes.push({ mesh, material, elapsed: 0, duration, radius });
  }

  /**
   * Capa 1 de lectura de área: anillo expansivo pegado al suelo más cercano,
   * orientado a su normal para que se lea como una onda de choque en 3D.
   */
  /**
   * Capa 1 del trío de área: anillo expansivo pegado al suelo más cercano.
   * Proyecta el centro con un raycast para que no quede flotando en el aire
   * cuando la habilidad se lanza en pleno vuelo.
   */
  private spawnAreaGroundRing(
    position: THREE.Vector3,
    radius: number,
    duration: number,
    slabs: SlabCollider[],
  ): void {
    const normal = this.nearestSlabNormal(position, slabs, 14);
    if (normal === null) return;
    _ringOrigin.copy(position).addScaledVector(normal, 3);
    _ringDir.copy(normal).multiplyScalar(-1);
    const hit = raycastSlabs(slabs, _ringOrigin, _ringDir, 8, _groundHit);
    this.spawnGroundRing(hit ? hit.point : position, normal, radius, duration);
  }

  private spawnGroundRing(
    position: THREE.Vector3,
    normal: THREE.Vector3,
    radius: number,
    duration: number,
  ): void {
    const material = this.groundRingMaterial.clone();
    const mesh = new THREE.Mesh(this.groundRingGeometry, material);
    mesh.position.copy(position).addScaledVector(normal, 0.05);
    mesh.quaternion.setFromUnitVectors(UP, normal);
    mesh.scale.setScalar(0.01);
    this.scene.add(mesh);
    this.waves.push({
      mesh,
      material,
      elapsed: 0,
      duration,
      maxRadius: radius,
      baseOpacity: material.opacity,
    });
  }

  /** Normal de la cara superior del slab más cercano (o null si no hay). */
  private nearestSlabNormal(
    position: THREE.Vector3,
    slabs: SlabCollider[],
    maxDistance: number,
  ): THREE.Vector3 | null {
    let best: SlabCollider | null = null;
    let bestDist = maxDistance;
    for (const slab of slabs) {
      const d = slab.center.distanceTo(position);
      if (d < bestDist) {
        bestDist = d;
        best = slab;
      }
    }
    if (best === null) return null;
    return _v1.set(0, 1, 0).applyQuaternion(best.quaternion);
  }

  private updateDomes(dt: number): void {
    for (let i = this.domes.length - 1; i >= 0; i--) {
      const dome = this.domes[i];
      dome.elapsed += dt;
      const t = Math.min(1, dome.elapsed / dome.duration);
      const eased = 1 - Math.pow(1 - t, 3);
      dome.mesh.scale.setScalar(Math.max(0.01, dome.radius * eased));
      dome.mesh.rotation.y += dt * 0.35;
      dome.material.uniforms.uOpacity.value = 0.55 * (1 - t);
      if (t >= 1) {
        dome.mesh.removeFromParent();
        dome.material.dispose();
        this.domes.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private pullEnemy(
    enemy: SkillTargetEnemy,
    toward: THREE.Vector3,
    accel: number,
    dt: number
  ): void {
    _v3.subVectors(toward, enemy.position);
    if (_v3.lengthSq() < 1e-6) return;
    enemy.velocity.addScaledVector(_v3.normalize(), accel * dt);
  }

  private moveSlabToward(
    slab: SlabCollider,
    toward: THREE.Vector3,
    speed: number,
    dt: number
  ): void {
    _v3.subVectors(toward, slab.center);
    const dist = _v3.length();
    if (dist < 1e-4) return;
    const step = Math.min(speed * dt, dist);
    slab.basePos.addScaledVector(_v3.normalize(), step);
    if (slab.basePos.length() > DOME_KEEP_RADIUS) {
      slab.basePos.setLength(DOME_KEEP_RADIUS);
    }
  }

  /** Orienta el cilindro de enlace entre dos puntos (geometría unitaria en Y). */
  private orientLink(link: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
    _v1.addVectors(a, b).multiplyScalar(0.5);
    link.position.copy(_v1);
    _v2.subVectors(b, a);
    const len = _v2.length();
    link.scale.set(1, Math.max(len, 0.001), 1);
    if (len > 1e-4) {
      _v2.divideScalar(len);
      link.quaternion.setFromUnitVectors(UP, _v2);
    }
  }

  // ------------------------------------------------------------------
  // Limpieza
  // ------------------------------------------------------------------

  dispose(): void {
    if (this.gravityField !== null) {
      for (const fragment of this.gravityField.fragments) {
        this.scene.remove(fragment.mesh);
        if (fragment.capturedInkBall) {
          this.onCapturedInkBallFreed?.(fragment.mesh);
        }
      }
      this.gravityField = null;
    }
    for (const debris of this.looseDebris) this.scene.remove(debris.mesh);
    this.looseDebris.length = 0;
    for (const p of this.projectiles) {
      this.scene.remove(p.mesh);
      if (p.material !== null) p.material.dispose();
      if (p.capturedInkBall) {
        this.onCapturedInkBallFreed?.(p.mesh);
      }
    }
    this.projectiles.length = 0;
    for (const wave of this.waves) {
      this.scene.remove(wave.mesh);
      wave.material.dispose();
    }
    this.waves.length = 0;
    for (const well of this.wells) {
      this.scene.remove(well.link);
      well.linkMaterial.dispose();
    }
    this.wells.length = 0;
    for (const bh of this.blackHoles) this.scene.remove(bh.group);
    this.blackHoles.length = 0;
    for (const dome of this.domes) {
      dome.mesh.removeFromParent();
      dome.material.dispose();
    }
    this.domes.length = 0;
    for (const list of [this.implosions, this.halos]) {
      for (const vfx of list) {
        this.scene.remove(vfx.mesh);
        vfx.material.dispose();
      }
      list.length = 0;
    }

    this.fragGeometry.dispose();
    this.waveGeometry.dispose();
    this.sliceGeometry.dispose();
    this.coreGeometry.dispose();
    this.ringGeometry.dispose();
    this.linkGeometry.dispose();
    this.haloGeometry.dispose();
    this.flashGeometry.dispose();
    this.domeGeometry.dispose();
    this.groundRingGeometry.dispose();
    this.rockMaterial.dispose();
    this.capturedInkBallMaterial.dispose();
    this.waveMaterial.dispose();
    this.sliceMaterial.dispose();
    this.coreMaterial.dispose();
    this.accretionMaterial.dispose();
    this.linkMaterial.dispose();
    this.haloMaterial.dispose();
    this.flashMaterial.dispose();
    this.implosionMaterial.dispose();
    this.groundRingMaterial.dispose();
  }
}
