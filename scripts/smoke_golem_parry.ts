// ============================================================================
// SMOKE TEST HEADLESS — Parry del Gólem por DISTANCIA (reglas 1-6 del rediseño)
// ============================================================================
// Ejecución:
//   npx esbuild scripts/smoke_golem_parry.ts --bundle --platform=node \
//     --format=esm --tsconfig=tsconfig.json --outfile=/tmp/smoke.mjs && node /tmp/smoke.mjs
//
// Ejercita el circuito REAL (sin mocks de lógica): DomeWaveManager con la
// oleada 2 (trae un ground_golem de basic_mix) y la FSM de comportamiento.
// Sin render ni DOM: solo matemática de three.js y assertivos duros.
//
// Reglas que valida:
//   1. Nyx se acerca desde lejos SIN atacar → el Gólem bloquea ANTES de que
//      cruce la banda del parry (α+GOLEM_PARRY_OPEN_DIST).
//   2. La ventana se abre al cruzar α+6 en guardia alzada (evento open con
//      estrella) y nunca antes.
//   3. Sin dash: muere al llegar a α+2 (evento close). Un reintento inmediato
//      (salió y volvió a cruzar) NO reabre: lockout de 5 s por gólem.
//   3b. Tras el lockout reabre al cruzar: NO hay cooldown de 18 s si el parry
//       no se ejecutó (solo se cobra con dash/remate).
//   4. Con dash (EJECUTADO): la ventana sobrevive DENTRO de α+2 ~1.2 s de mundo.
//   5. Remate descendente con parry ejecutado: −GOLEM_PARRY_CRIT_RATIO de la
//      vida TOTAL, ventana consumida y cooldown de 18 s activo hasta expirar.
//   6. Golpe frontal contra el gólem bloqueando = 0 daño (la puerta que usa
//      el game loop, isGolemGuardBlocking, da true) y SIN consumir la ventana.
// ============================================================================

import * as THREE from 'three';
import { DomeWaveManager } from '../src/game/dome/DomeWaveManager';
import {
  GOLEM_PARRY_CLOSE_DIST,
  GOLEM_PARRY_COOLDOWN_SEC,
  GOLEM_PARRY_CRIT_RATIO,
  GOLEM_PARRY_EXECUTE_SEC,
  GOLEM_PARRY_LOCKOUT_SEC,
  GOLEM_PARRY_OPEN_DIST,
} from '../src/game/dome/domeGolemBehavior';

const DT = 1 / 60;
const APPROACH_SPEED = 24.0;
const NOOP = () => {};

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

// --------------------------------------------------------------------------
// Montaje: manager real, oleada 2 (basic_mix de 5 → índice 4 = ground_golem).
// --------------------------------------------------------------------------
const scene = new THREE.Scene();
const mgr = new DomeWaveManager(scene);
mgr.startWave(2);
const golem: ReturnType<DomeWaveManager['getActiveEnemies'][number]> | null =
  mgr.getActiveEnemies().find((e) => e.entity.archetype === 'ground_golem') ?? null;
if (!golem) {
  console.error('FAIL  no se pudo spawnear el ground_golem (oleada 2)');
  process.exit(1);
}
const ALPHA = golem.radius;
const OPEN_BAND = ALPHA + GOLEM_PARRY_OPEN_DIST;
const CLOSE_BAND = ALPHA + GOLEM_PARRY_CLOSE_DIST;
console.log(
  `--- golem α=${ALPHA.toFixed(2)} m, banda parry = [${CLOSE_BAND.toFixed(2)}, ${OPEN_BAND.toFixed(2)}] m`,
);

const pos = new THREE.Vector3();
const vel = new THREE.Vector3();
const aim = new THREE.Vector3();
const prevPos = new THREE.Vector3();
let elapsed = 0;

/** Corre un frame del manager con la foto actual de Nyx. */
function frameUpdate(parryDashUsed = false): { opened: boolean; closedEvent: boolean } {
  const res = mgr.update(
    DT,
    elapsed,
    pos,
    null,
    0, // playerAttackTime = 0: Nyx NUNCA ataca (regla 1 en solitario).
    vel,
    aim,
    false,
    false,
    null,
    undefined,
    NOOP,
    NOOP,
    undefined, // onGolemSmash
    undefined, // onSlabSmash
    1, // playerHpRatio
    1, // playerEdenRatio (con Eden: el parry no es un bluff)
    parryDashUsed,
  );
  elapsed += DT;
  return {
    opened: res.golemParryTarget === golem && res.golemParryStarPos !== null,
    closedEvent: mgr.consumeGolemParryClose(),
  };
}

function currentDist(): number {
  return golem.position.distanceTo(pos);
}

/** Nyx QUIETA respecto al gólem a `dist` m (radial fijo): sigue su deriva. */
function holdAt(seconds: number, dist: number, parryDashUsed = false): number {
  const dir = new THREE.Vector3(1, 0, 0);
  let opened = 0;
  for (let t = 0; t < seconds; t += DT) {
    prevPos.copy(pos);
    pos.copy(golem.position).addScaledVector(dir, dist);
    vel.copy(pos).sub(prevPos).divideScalar(DT);
    aim.copy(golem.position).sub(pos).normalize();
    if (frameUpdate(parryDashUsed).opened) opened++;
  }
  return opened;
}

/**
 * PASADA de aproximación desde `from` m a 24 m/s de cierre directo al centro
 * del gólem. Devuelve: abrió la ventana, estaba el gólem bloqueando ALTO
 * antes de cruzar la banda, y la distancia de apertura (-1 si no abrió).
 */
function approachPass(from: number, parryDashUsed = false): {
  opened: boolean;
  blockBeforeBand: boolean;
  openAtDist: number;
} {
  const dir = new THREE.Vector3(1, 0, 0);
  pos.copy(golem.position).addScaledVector(dir, from);
  let blockBeforeBand = false;
  let openAtDist = -1;
  for (let i = 0; i < 400; i++) {
    prevPos.copy(pos);
    const toGolem = golem.position.clone().sub(pos);
    const d = toGolem.length();
    if (d > 1e-4) {
      toGolem.divideScalar(d);
      pos.addScaledVector(toGolem, APPROACH_SPEED * DT);
    }
    vel.copy(pos).sub(prevPos).divideScalar(DT);
    aim.copy(golem.position).sub(pos).normalize();
    const r = frameUpdate(parryDashUsed);
    const distNow = currentDist();
    if (mgr.isGolemGuardBlocking(golem) && distNow > OPEN_BAND && !blockBeforeBand) {
      blockBeforeBand = true;
    }
    if (r.opened) {
      openAtDist = distNow;
      return { opened: true, blockBeforeBand, openAtDist };
    }
    if (distNow <= CLOSE_BAND) break;
  }
  return { opened: false, blockBeforeBand, openAtDist };
}

/**
 * Reintenta aproximaciones (con settling en 26 m entre medias) hasta lograr
 * una pasada CONCLUSIVA (gólem bloqueando antes de cruzar) o agotar intentos.
 */
function conclusiveApproach(maxAttempts: number): {
  opened: boolean;
  blockBeforeBand: boolean;
  openAtDist: number;
} {
  let result = { opened: false, blockBeforeBand: false, openAtDist: -1 };
  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) holdAt(2.0, 26); // deja que la FSM ofensiva asiente.
    result = approachPass(26);
    if (result.opened || result.blockBeforeBand) return result;
  }
  return result;
}

// --------------------------------------------------------------------------
// 1) Guardar alzada ANTES de cruzar la banda, con Nyx a >20 m y sin atacar.
// --------------------------------------------------------------------------
{
  const r = conclusiveApproach(4);
  check(
    '1. Bloqueo anticipado: guarda alzada antes de la banda α+6 (sin ataque, d>20 m)',
    r.blockBeforeBand,
    `pasada conclusiva=${r.blockBeforeBand}, apertura=${r.opened}`,
  );
  if (!r.opened) {
    check('2. Ventana abierta al cruzar α+6', false, 'sin apertura en la pasada del test 1');
  } else {
    check(
      '2. Ventana abierta al cruzar α+6 (estrella + evento open)',
      r.openAtDist <= OPEN_BAND + 0.6,
      `apertura a d=${r.openAtDist.toFixed(2)} m`,
    );
    check('2b. Manager reporta la ventana abierta', mgr.isGolemParryWindowOpen() === true);
  }
}

// --------------------------------------------------------------------------
// 3) Sin ejecutar: la ventana muere en α+2 y un reintento inmediato NO reabre.
// --------------------------------------------------------------------------
{
  // Sigue volando hasta el cuerpo: cierre exacto al cruzar α+2.
  let closed = false;
  let closedAtDist = -1;
  for (let i = 0; i < 120; i++) {
    prevPos.copy(pos);
    const toGolem = golem.position.clone().sub(pos);
    const d = toGolem.length();
    if (d > 1e-4) {
      toGolem.divideScalar(d);
      pos.addScaledVector(toGolem, APPROACH_SPEED * DT);
    }
    vel.copy(pos).sub(prevPos).divideScalar(DT);
    aim.copy(golem.position).sub(pos).normalize();
    const r = frameUpdate();
    if (!mgr.isGolemParryWindowOpen()) {
      closed = true;
      closedAtDist = currentDist();
      break;
    }
    if (currentDist() <= ALPHA + 0.8) break;
  }
  check(
    '3. Sin dash: la ventana muere al llegar a α+2 (evento close)',
    closed && closedAtDist <= CLOSE_BAND + 0.4,
    `cierre a d=${closedAtDist.toFixed(2)} m`,
  );

  // Reintento inmediato (salió del cuerpo y volvió a cruzar en <5 s): el
  // lockout impide la reapertura pese a bloquear y cruzar en guardia.
  const retry = conclusiveApproach(3);
  check(
    '3b. Reintento inmediato: NO reabre pese a cruzar en guardia (lockout 5 s)',
    !retry.opened && retry.blockBeforeBand,
    `pasada conclusiva=${retry.blockBeforeBand}, reabrió=${retry.opened}`,
  );

  // Espera el lockout entero (+ margen) y vuelve a cruzar: reabre — NO hay
  // cooldown de 18 s porque el parry nunca se ejecutó.
  holdAt(GOLEM_PARRY_LOCKOUT_SEC + 1.0, 26);
  const afterLockout = conclusiveApproach(4);
  check(
    '3c. Tras el lockout reabre SIN cooldown de 18 s (no se ejecutó)',
    afterLockout.opened,
    `apertura a d=${afterLockout.openAtDist.toFixed(2)} m`,
  );
}

// --------------------------------------------------------------------------
// 4+5) Parry EJECUTADO: dash → la ventana vive dentro de α+2 → remate = −35%.
// --------------------------------------------------------------------------
{
  // Asegura ventana abierta (la de 3c, o una nueva pasada concluyente).
  if (!mgr.isGolemParryWindowOpen()) {
    const r = conclusiveApproach(4);
    check('4. Preparación: ventana abierta para el remate', r.opened, `openAt=${r.openAtDist}`);
  } else {
    check('4. Preparación: ventana abierta para el remate', true);
  }

  // DASH del remate (el manager ejecuta el cooldown largo AQUÍ y solo aquí).
  holdAt(DT * 1.01, Math.min(26, Math.max(CLOSE_BAND + 1, currentDist())), true);
  // Vuela hacia dentro: la ventana EJECUTADA sobrevive dentro de α+2 ~1.2 s.
  let survivedInside = 0;
  let timesOut = false;
  for (let i = 0; i < 240; i++) {
    prevPos.copy(pos);
    const toGolem = golem.position.clone().sub(pos);
    const d = toGolem.length();
    if (d > 1e-4) {
      toGolem.divideScalar(d);
      pos.addScaledVector(toGolem, APPROACH_SPEED * DT);
    }
    vel.copy(pos).sub(prevPos).divideScalar(DT);
    aim.copy(golem.position).sub(pos).normalize();
    const r = frameUpdate();
    if (!mgr.isGolemParryWindowOpen()) {
      timesOut = true;
      break;
    }
    if (currentDist() < CLOSE_BAND) survivedInside += DT;
    if (survivedInside > 2.0) break; // timeout de seguridad roto
  }
  const expectedUpper = GOLEM_PARRY_EXECUTE_SEC + 0.35;
  check(
    '4. Dash ejecutado: la ventana sobrevive dentro de α+2 ~1.2 s y luego caduca',
    survivedInside >= GOLEM_PARRY_EXECUTE_SEC - 0.45 &&
      survivedInside <= expectedUpper &&
      timesOut,
    `sobrevivió ${survivedInside.toFixed(2)} s dentro de la banda`,
  );

  // Reabre para el remate (el cierre por timeout NO dejó lockout; y el cd de
  // 18 s ya corre, así que este tramo consume el resto del cooldown).
  holdAt(GOLEM_PARRY_COOLDOWN_SEC + 1.0, 26);
  const secondChance = conclusiveApproach(4);
  check(
    '5. Tras los 18 s del parry ejecutado, el gólem vuelve a ofrecer el remate',
    secondChance.opened,
    `openAt=${secondChance.openAtDist.toFixed(2)} m`,
  );

  // Ejecuta dash + remate descendente: −35% TOTAL, ventana consumida.
  holdAt(DT * 1.01, Math.min(26, Math.max(CLOSE_BAND + 1, currentDist())), true);
  const hpBefore = golem.entity.hp;
  const drillDir = golem.position.clone().sub(pos).normalize();
  drillDir.y = -0.8; // descendente de verdad
  drillDir.normalize();
  mgr.onHitEnemy(golem, drillDir, true, 30);
  const lostRatio = (hpBefore - golem.entity.hp) / golem.entity.maxHp;
  check(
    '5b. Remate descendente con parry ejecutado: −35% de la vida TOTAL',
    Math.abs(lostRatio - GOLEM_PARRY_CRIT_RATIO) < 0.01,
    `${(lostRatio * 100).toFixed(1)}% perdido`,
  );
  check('5c. El remate CONSUME la ventana', !mgr.isGolemParryWindowOpen());
  mgr.consumeGolemParryClose();
}

// --------------------------------------------------------------------------
// 5d) Con el cooldown de 18 s activo: cruzar en guardia NO reabre.
// --------------------------------------------------------------------------
{
  let openedDuringCd = false;
  let conclusive = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = conclusiveApproach(1);
    if (r.opened) {
      openedDuringCd = true;
      break;
    }
    if (r.blockBeforeBand) conclusive = true;
    holdAt(2.0, 26);
  }
  check(
    '5d. Cooldown de 18 s tras EJECUTAR: cruzar en guardia no reabre',
    !openedDuringCd && conclusive,
    `pasada concluyente=${conclusive}, reabrió=${openedDuringCd}`,
  );

  // Espera el resto del cooldown y confirma la reapertura.
  holdAt(GOLEM_PARRY_COOLDOWN_SEC + 1.0, 26);
  const reopened = conclusiveApproach(4);
  check(
    '5e. Tras los 18 s completos reabre',
    reopened.opened,
    `openAt=${reopened.openAtDist.toFixed(2)} m`,
  );
}

// --------------------------------------------------------------------------
// 6) Golpe frontal contra el gólem bloqueando = 0 daño, ventana intacta.
// --------------------------------------------------------------------------
{
  if (!mgr.isGolemParryWindowOpen()) {
    const r = conclusiveApproach(4);
    check('6. Preparación: ventana abierta para el test frontal', r.opened);
  }
  const wasOpen = mgr.isGolemParryWindowOpen();
  const hpBefore = golem.entity.hp;
  // Frontal: Nyx clava en la cara del brazo (radial directa al centro).
  const dir = new THREE.Vector3(1, 0, 0);
  // Alínea la frontal con la dirección a la que el gólem encara (evita que
  // una deriva lateral previa falsee el cono): usa su +Z como rumbo.
  const gForward = new THREE.Vector3(0, 0, 1).applyQuaternion(golem.mesh.quaternion);
  dir.copy(gForward);
  pos.copy(golem.position).addScaledVector(dir, ALPHA + 3.2);
  prevPos.copy(pos);
  vel.set(0, 0, 0);
  aim.copy(gForward).negate();
  frameUpdate();

  const gated = mgr.isGolemGuardBlocking(golem); // la puerta del game loop
  const frontal = golem.position.clone().sub(pos).normalize();
  mgr.onHitEnemy(golem, frontal, false, 20); // patada frontal contra la pared
  check(
    '6. Golpe frontal al brazo en guardia: puerta true y HP intacta (0 daño)',
    gated && golem.entity.hp === hpBefore,
    gated ? 'isGolemGuardBlocking=true, HP intacta' : 'isGolemGuardBlocking=false',
  );
  check(
    '6b. El rebote frontal NO consume la ventana de parry',
    wasOpen ? mgr.isGolemParryWindowOpen() === true : true,
    wasOpen ? 'ventana sigue abierta' : 'sin ventana previa (skip)',
  );
  mgr.consumeGolemParryClose();
}

console.log(
  failures === 0
    ? '\nSMOKE OK: parry del gólem por distancia verificado'
    : `\nSMOKE FAIL: ${failures} comprobaciones fallidas`,
);
process.exit(failures === 0 ? 0 : 1);
