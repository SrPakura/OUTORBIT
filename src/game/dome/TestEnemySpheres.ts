import * as THREE from 'three';
import { addComicOutline, createComicCelMaterial } from '@/game/render/toonMaterials';
import type { TestEnemySphere } from './domeTypes';

// ============================================================================
// TestEnemySpheres — esferas de prueba dentro de la cúpula de 50 m.
//
// 4 esferas cel-shaded flotando en 0G para probar:
//  - Lock-In básico de la mira (2 esferas normales, flotación suave).
//  - Patada Gravitatoria y Patada Taladro Espiral (impulso + flash al impactar).
//  - Dash evasivo del enemigo (2 esferas evasivas): al lockearlas con un
//    ataque en curso y acercarse o superar ~0.85 s de ataque, pegan un dash
//    lateral brusco perpendicular a la línea jugador->enemigo que rompe el
//    lock-in y obliga a reaccionar con Cámara Lenta + Dash propio.
// ============================================================================

export interface TestEnemyManager {
  enemies: TestEnemySphere[];
  /**
   * Actualiza movimiento/inercia de las esferas.
   * Si `lockedEnemy` es una esfera con `evasive === true` y el jugador lleva atacándola
   * (`playerAttackTime >= 0.85` o está a menos de `14 m`), y `evadeCooldown <= 0`,
   * la esfera ejecuta un DASH EVASIVO brusco perpendicular a la línea jugador->enemigo
   * (velocidad ~38 m/s) para salirse del radio de mira y devuelve `true` en `didEnemyEvadeDash`.
   */
  update: (
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
    lockedEnemy: TestEnemySphere | null,
    playerAttackTime: number
  ) => { didEnemyEvadeDash: boolean };
  /** Aplica un impacto de patada a la esfera (impulso de retroceso + flash). */
  onHitEnemy: (enemy: TestEnemySphere, hitDir: THREE.Vector3, isDrill: boolean) => void;
  dispose: () => void;
}

// --- Ajustes de física/comportamiento ---
const FLOAT_SPRING = 2.4;        // Aceleración de retorno suave hacia homePos
const FLOAT_DAMPING = 1.6;       // Fricción del flotador (por segundo, exponencial)
const FLOAT_BOB_AMPLITUDE = 0.9; // Amplitud del bob senoidal alrededor de homePos
const FLOAT_BOB_SPEED = 0.9;     // Velocidad del bob (rad/s)
const LEASH_RADIUS = 9.0;        // Distancia a homePos desde la que tira del correa
const HOME_PULL = 6.5;           // Aceleración extra al superar el correa
const DOME_KEEP_RADIUS = 44.0;   // R a partir del cual vuelve suavemente a homePos
const DOME_KEEP_PULL = 9.0;      // Aceleración de contención dentro de la cúpula

const EVASIVE_DASH_SPEED = 38.0; // Dash lateral brusco (m/s)
const EVASIVE_DASH_TIME = 0.38;  // Duración durante la que el dash no se frena
const EVASIVE_DASH_LIFT = 5.5;    // Componente vertical del dash (m/s)
const EVASIVE_COOLDOWN = 3.0;    // Segundos entre dashes evasivos
const EVADE_TRIGGER_ATTACK_TIME = 0.85;
const EVADE_TRIGGER_DISTANCE = 14.0;

const HIT_KNOCKBACK = 14.0;      // Impulso de la Patada Gravitatoria
const HIT_KNOCKBACK_DRILL = 26.0;// Impulso de la Patada Taladro Espiral
const HIT_FLASH_DECAY = 3.2;     // Velocidad de apagado del flash (1/s)
const HIT_FLASH_SCALE = 0.35;   // Escala extra en el pico del flash
const HIT_FLASH_EMISSIVE = 0.85; // uEmissiveBoost en el pico del flash

interface EnemyInternal {
  sphere: TestEnemySphere;
  material: THREE.ShaderMaterial;
  outlineMaterial: THREE.ShaderMaterial;
  phase: number;
  dashTimer: number;
  dashSign: 1 | -1;
}

// --- Scratch vectors a nivel de módulo: sin allocations por frame ---
const _toHome = new THREE.Vector3();
const _toEnemy = new THREE.Vector3();
const _perp = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _flat = new THREE.Vector3();

/**
 * Crea 4 esferas de prueba de enemigos dentro de la cúpula: 2 normales
 * (flotación suave, para Lock-In y Drill Kick) y 2 evasivas (dash lateral
 * cuando el jugador las lockea atacando). Todas comparten geometría y usan
 * `createComicCelMaterial` + `addComicOutline` para la estética cel-shading.
 */
export function createTestEnemySpheres(scene: THREE.Scene): TestEnemyManager {
  const geometry = new THREE.SphereGeometry(1.15, 24, 18);

  // [homePos, evasive, color, rimColor]
  const specs: ReadonlyArray<{
    home: readonly [number, number, number];
    evasive: boolean;
    color: number;
    rim: number;
  }> = [
    { home: [0, 4, -14], evasive: false, color: 0xffc46b, rim: 0xffe3a3 }, // melocotón dorado
    { home: [0, 16, 16], evasive: false, color: 0x7ae8dc, rim: 0xbafff2 },  // aqua-menta
    { home: [-14, 10, -18], evasive: true, color: 0xff5f9e, rim: 0xffb3d4 }, // cuarzo rosa
    { home: [15, 8, -15], evasive: true, color: 0xdf9fff, rim: 0xf0d4ff },  // lavanda-rosa
  ];

  const internals: EnemyInternal[] = [];
  const enemies: TestEnemySphere[] = [];

  specs.forEach((spec, index) => {
    const material = createComicCelMaterial(spec.color, {
      rimColor: spec.rim,
      rimStrength: 0.7,
      emissiveBoost: 0.0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `testEnemySphere_${index}`;
    const outline = addComicOutline(mesh, 0.05);
    const outlineMaterial = outline.material as THREE.ShaderMaterial;

    const homePos = new THREE.Vector3(...spec.home);
    mesh.position.copy(homePos);
    scene.add(mesh);

    const sphere: TestEnemySphere = {
      id: `test-enemy-${index}`,
      mesh,
      position: mesh.position,
      velocity: new THREE.Vector3(),
      homePos,
      radius: 1.15,
      evasive: spec.evasive,
      evadeCooldown: 0,
      hitFlash: 0,
    };

    enemies.push(sphere);
    internals.push({
      sphere,
      material,
      outlineMaterial,
      phase: index * 1.7 + 0.6,
      dashTimer: 0,
      dashSign: index % 2 === 0 ? 1 : -1,
    });
  });

  function update(
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
    lockedEnemy: TestEnemySphere | null,
    playerAttackTime: number
  ): { didEnemyEvadeDash: boolean } {
    let didEnemyEvadeDash = false;

    for (const internal of internals) {
      const enemy = internal.sphere;

      enemy.evadeCooldown = Math.max(0, enemy.evadeCooldown - dt);
      if (enemy.hitFlash > 0) {
        enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * HIT_FLASH_DECAY);
      }
      internal.dashTimer = Math.max(0, internal.dashTimer - dt);

      // --- Dash evasivo: rompe el lock-in cuando el jugador la tiene fija ---
      if (
        enemy.evasive &&
        enemy === lockedEnemy &&
        enemy.evadeCooldown <= 0 &&
        (playerAttackTime >= EVADE_TRIGGER_ATTACK_TIME ||
          enemy.position.distanceTo(playerPos) < EVADE_TRIGGER_DISTANCE)
      ) {
        _toEnemy.subVectors(enemy.position, playerPos);
        const dist = _toEnemy.length();
        if (dist > 1e-4) {
          _toEnemy.divideScalar(dist);
          // Perpendicular a la línea jugador->enemigo (lateral brusco).
          _perp.crossVectors(_toEnemy, _up);
          if (_perp.lengthSq() < 1e-4) {
            _perp.set(1, 0, 0);
          } else {
            _perp.normalize();
          }
          _perp.multiplyScalar(internal.dashSign);
          internal.dashSign = internal.dashSign === 1 ? -1 : 1;

          enemy.velocity
            .copy(_perp)
            .multiplyScalar(EVASIVE_DASH_SPEED)
            .addScaledVector(_up, EVASIVE_DASH_LIFT);
          internal.dashTimer = EVASIVE_DASH_TIME;
          enemy.evadeCooldown = EVASIVE_COOLDOWN;
          enemy.hitFlash = Math.max(enemy.hitFlash, 0.35);
          didEnemyEvadeDash = true;
        }
      }

      // --- Flotación: bob senoidal + muelle suave hacia homePos ---
      const bob = Math.sin(elapsed * FLOAT_BOB_SPEED + internal.phase) * FLOAT_BOB_AMPLITUDE;
      _toHome.subVectors(enemy.homePos, enemy.position);
      const homeDist = _toHome.length();
      _toHome.y += bob * 0.35;

      if (internal.dashTimer <= 0) {
        enemy.velocity.addScaledVector(_toHome, FLOAT_SPRING * dt);
        // Correa: si se aleja demasiado del home, tira más fuerte.
        if (homeDist > LEASH_RADIUS) {
          _toHome.normalize();
          enemy.velocity.addScaledVector(_toHome, HOME_PULL * dt);
        }
        // Contención dentro de la cúpula: vuelve suave al acercarse a R 44.
        _flat.set(enemy.position.x, 0, enemy.position.z);
        const flatDist = _flat.length();
        if (flatDist > DOME_KEEP_RADIUS) {
          _flat.normalize();
          enemy.velocity.addScaledVector(_flat, -DOME_KEEP_PULL * dt);
        }
        // Fricción del flotador.
        const damping = Math.exp(-FLOAT_DAMPING * dt);
        enemy.velocity.multiplyScalar(damping);
      } else {
        // Durante el dash evasivo apenas frena: el brusco se note.
        enemy.velocity.multiplyScalar(Math.exp(-0.25 * dt));
      }

      enemy.position.addScaledVector(enemy.velocity, dt);

      // --- Flash de impacto: escala + emissive interpolados ---
      const flash = enemy.hitFlash;
      const scale = 1 + flash * HIT_FLASH_SCALE;
      enemy.mesh.scale.setScalar(scale);
      internal.material.uniforms.uEmissiveBoost.value = flash * HIT_FLASH_EMISSIVE;
    }

    return { didEnemyEvadeDash };
  }

  function onHitEnemy(enemy: TestEnemySphere, hitDir: THREE.Vector3, isDrill: boolean): void {
    enemy.velocity.addScaledVector(hitDir, isDrill ? HIT_KNOCKBACK_DRILL : HIT_KNOCKBACK);
    enemy.hitFlash = 1;
  }

  function dispose(): void {
    for (const internal of internals) {
      scene.remove(internal.sphere.mesh);
      internal.material.dispose();
      internal.outlineMaterial.dispose();
    }
    geometry.dispose();
    internals.length = 0;
    enemies.length = 0;
  }

  return { enemies, update, onHitEnemy, dispose };
}
