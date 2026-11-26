# NYX — Movimiento, físicas, combate, cámara, slow-mo y animaciones

Documento de extracción técnica. Todos los valores provienen del código fuente real
(`/home/pakura/Proyectos/OUTORBIT`) y fueron leídos dos veces: una lectura completa del
archivo y una segunda pasada de verificación por `grep` sobre la definición exacta.
Se indica `archivo:línea` de la definición. No hay estimaciones ni redondeos: cuando el
comentario del código y la constante discrepan, se anota el valor real de la constante.

---

## 0. Fuentes

| Archivo | Líneas | Rol |
|---|---|---|
| `src/game/dome/NyxDomeController.ts` | 4298 | Movimiento, física espacial, cámara, ataques, Edén, HUD de Nyx |
| `src/game/dome/nyxKineticBounce.ts` | 229 | Sentadilla Cinética (rebote en pared): parámetros y máquina de fases |
| `src/game/dome/DomeCombatSystem.ts` | 459 | `computeKineticImpact`, carne/estrella, daño a Nyx, tinta |
| `src/game/dome/domeTypes.ts` | — | `NyxMovementMode`, `SpeedAttackKind`, radios de la cúpula |
| `src/game/render/nyxAnimator.ts` | 1104 | Animador procedural (28 huesos), tabla de duraciones, pelo, mangas, aro |
| `src/game/render/nyxAnimsCombat.ts` | 347 | Poses: `gravity_slide`, `spiral_drill_kick`, `counter_parry`, `gravity_kick`, `kick_flip` |
| `src/game/render/nyxAnimsGrounded.ts` | 320 | Poses: `idle`, `run`, `jump_land`, `land_recover`, `air_dash` |
| `src/game/render/nyxAnimsSkills.ts` | 236 | Poses: `stasis_cast`, `stasis_throw`, `hit_stagger`, `eden_absorb` |
| `src/game/render/nyxAnimsTraversal.ts` | 250 | Poses: `zero_g_float`, `gravity_fall`, `wall_shift_flip`, `dome_bounce`, `victory_float` |
| `src/game/render/nyxBakedClips.ts` | 826 | Keyframes horneados de Blender (7 clips) |
| `src/game/render/nyxModelLoader.ts` | — | `NyxClips` (walk/run/floatIdle/float) |
| `src/game/render/nyxWalkPlayer.ts`, `nyxRunPlayer.ts`, `nyxFloatPlayer.ts`, `nyxLoopPlayer.ts` | — | Reproductores de clips GLB |
| `src/ui/domeGameLoop.ts` | 1497 | `timeScale`, pausas, `punchCamera`, cinemáticas, wiring de entrada |
| `src/game/settings.ts` | — | `baseFov` (70 por defecto, 55–85), bindings |

Modelos usados por Nyx (`public/models/`): `nyx_rigged.glb`, `nyx_walk_start/loop/end.glb`,
`nyx_run_start/loop/end.glb`, `nyx_float_fwd.glb`, `nyx_float_fwd_mir.glb`,
`nyx_float_fwd_mid.glb`, `nyx_float_back.glb`, `nyx_zero_g_float.glb`,
`nyx_gravity_fall.glb`, `nyx_gravity_kick.glb`, `nyx_spiral_drill_kick.glb`,
`nyx_kick_flip.glb`, `nyx_kick_flip_drill.glb`, `nyx_kinetic_squat.glb`.

---

## 1. Modos de movimiento

`NyxMovementMode` (`src/game/dome/domeTypes.ts:4-10`):

| Modo | Significado |
|---|---|
| `grounded` | Adherida a cualquier `SlabCollider` (suelo, pared o techo). Cámara libre 360° con ángulos escalares `camYaw`/`camPitch` |
| `floating` | Flotación 0G sin gravedad, inercia espacial, cámara pegada a la espalda |
| `dashing` | Clic Derecho: 0.36 s a 31 m/s, redirigible con ratón |
| `speed_attack` | Clic Izquierdo: patada con lock-in (`gravity_kick` / `spiral_drill_kick`) o `void_fall` |
| `kick_recover` | Frenado encadenando `kick_flip` |
| `kinetic_bounce` | Sentadilla Cinética (rebote en pared), estado cerrado de 0.28 s |

`SpeedAttackKind` (`domeTypes.ts:12`): `'gravity_kick' | 'spiral_drill_kick' | 'void_fall'`.

Bucle de física por modo (`NyxDomeController.update`, `switch (this.mode)`,
`NyxDomeController.ts:1518-1542`): `updateGrounded` / `updateFloating` / `updateDashing` /
`updateSpeedAttack` / `updateKickRecover` / `updateKineticBounceMode`.

---

## 2. Constantes globales de cuerpo y física

| Constante | Valor | Línea |
|---|---|---|
| `PLAYER_RADIUS` | `0.45` m | `NyxDomeController.ts:86` |
| `GRAVITY` | `22` (solo como fuerza de adherencia al suelo) | `:87` |
| `SUBSTEP_MAX_DIST` | `PLAYER_RADIUS * 0.5` = `0.225` m | `:104` |
| `SUBSTEP_MAX_COUNT` | `6` | `:105` |
| `WALL_FLIP_ANGLE` | `45 * DEG` = 0.785398 rad | `:106` |
| `WALL_BOUNCE_KEEP` | `0.45` | `:122` |
| `CORNER_FRAME_DOT` | `0.25` | `:142` |
| `CORNER_GRAZE_MAX_SPEED` | `5.0` m/s | `:146` |
| `DOME_BOUNCE_DAMAGE` | `10` HP | `:306` |
| `GAMEPAD_LOOK_RATE` | `2.6` rad/s (stick derecho a tope, × `gamepadSensitivity`) | `:310` |
| Sensibilidad de ratón | `0.0023 * settings.mouseSensitivity` rad/px | `:908` |
| `CAM_PITCH_LIMIT` | `1.15` rad | `:232` |
| `AIM_PITCH_MAX_DOT` | `0.985` | `:233` |

Anti-tunneling (`NyxDomeController.ts:1553-1560`): `stepDist = |v| * simDt`; si
`stepDist > 0.225` se parte en `min(6, ceil(stepDist / 0.225))` sub-pasos y se resuelve
colisión en cada uno. El comentario cita que a 31 m/s (Dash) y 34 m/s (Taladro) un frame
de 60 Hz avanza ~0.55 m, más que el radio.

Cúpula (`domeTypes.ts:203-204`): `DOME_ARENA_RADIUS = 90`, `DOME_PLAYER_BOUND_RADIUS = 88.6`.

---

## 3. Suelo (`grounded`)

### 3.1 Velocidades

| Constante | Valor | Línea |
|---|---|---|
| `WALK_SPEED` | `2.0` m/s | `NyxDomeController.ts:90` |
| `RUN_SPEED` | `7.4` m/s (sprint) | `:91` |
| `SLIDE_SPEED` | `10.0` m/s (derrape) | `:92` |
| `WALK_ANIM_MIN_SPEED` | `0.9` m/s | `:96` |
| `WALK_ANIM_MAX_SPEED` | `5.6` m/s | `:97` |
| `GROUND_ACCEL_LAMBDA` | `10` | `:98` |
| `GROUND_STICK_RANGE` | `0.35` m | `:99` |

`targetSpeed = isSliding ? 10.0 : sprintHeld ? 7.4 : 2.0` (`:2708`), escalado por la
magnitud analógica del input `inputMag = min(1, hypot(f, r))` (`:2712`).

Aceleración (`:2725`): `velocity.lerp(move * targetSpeed * inputMag, 1 - exp(-10 * dt))`.
Durante derrape (`:2722`): `velocity.lerp(slideDir * max(SLIDE_SPEED, speed), 1 - exp(-2.2 * dt))`.

`isSliding` (`:2702-2707`): `sprintHeld && hasMoveInput && speed > RUN_SPEED + 0.5`
(es decir, `> 7.9` m/s) o `slideTimer > 0`.

### 3.2 Adherencia y resbalón

- Componente normal entrante anulada antes de mover (`:2696-2698`): si `vn < 0`, se suma `n * -vn`.
- Adherencia: `velocity.addScaledVector(n, -GRAVITY * dt)` = `-22 * dt` (`:2751`).
- Sondeo de suelo (`:3478-3508`): raycast a `-up` con alcance `PLAYER_RADIUS + GROUND_STICK_RANGE`
  = `0.8` m; si no hay contacto, pasa a `floating`.
- Resbalón en pendientes (`:2729-2744`): sin input y `slideTimer <= 0`, con
  `steepness = 1 - |n · radial|`; si `steepness > STEEP_SLIDE_THRESHOLD` (`0.72`),
  acelera cuesta abajo `STEEP_SLIDE_ACCEL * steepness * dt` (`7.5` m/s² × steepness)
  y emite polvo con probabilidad `dt * 7`.

### 3.3 Despegue (Espacio)

`handleJump` (`:2067-2108`):
- En `grounded`: posición `+ groundNormal * FLOAT_ENTRY_OFFSET` (`0.65` m), velocidad
  `groundNormal * FLOAT_ENTRY_SPEED` (`3.0` m/s), pasa a `floating`, `animator.setState('zero_g_float')`,
  cancela `transitionCamUpTimer` y `slideTimer`, VFX `spawnDustBurst(..., 'takeoff')` + `spawnGravityWake`, `audio.playAnchor()`.
- En `speed_attack`: `velocity *= 0.30` y `startKickRecover(2 | 1)` según
  `speedAttackKind === 'spiral_drill_kick'` (2 flips) o no (1 flip).
- En `floating`/`dashing` con `|v| >= 12.0`: `velocity *= 0.30`, `dashTimer = 0`,
  `startKickRecover(1, false)` (no cuenta como ataque).
- En `kick_recover` o vuelo `< 12 m/s`: no hace nada.

### 3.4 Aterrizaje

`landOn(normal, impact)` (`:3511-3628`):
- `transitionCamUpTimer = CAM_HORIZON_SLERP_TIME` (`0.45` s), `mode = 'grounded'`, `up = normal`,
  `camYaw = 0`, `camPitch = 0`.
- `landingDip = -min(LANDING_DIP_MAX, impact * LANDING_DIP_K)` = `-min(0.48, impact * 0.045)`.
- Landing Slide: si `angle <= 45°` y `tangentialSpeed > LANDING_SLIDE_MIN_SPEED` (`9` m/s)
  → `slideTimer = clamp(0.35 + tangentialSpeed * 0.012, 0.35, 0.55)`,
  `velocity = tangential * LANDING_SLIDE_KEEP` (`0.75`), `animator.setState('gravity_slide')`.
- Si no hay slide, elección de animación (`:3577-3590`):
  `angle > 45°` → `wall_shift_flip`; si no, `impact > LAND_RECOVER_SPEED` (`7`) → `land_recover`;
  si no, `impact > JUMP_LAND_SPEED` (`2`) → `jump_land`.
  Y frena tangencial: `velocity *= exp(-min(impact, 20) * 0.06)`.
- Touch-and-Go (`:3595-3604`): si `impact > TOUCH_GO_MIN_IMPACT` (`3`) y el slab no se tocó
  en `TOUCH_GO_COOLDOWN` (`2.5` s) → `eden += maxEden * TOUCH_GO_EDEN_FRAC` (`+12%`), `edenFlash = 1`.
- Onda de Caída al Vacío si venía de `void_fall` → `voidFallImpact()`.

`voidFallImpact(normal)` (`:3630-3636`): `impactWobbleImpulse = max(actual, 1.0)`,
`fovPunch = min(actual, -10)`, `landingDip = -0.48`, `spawnVoidImpactRing`, `spawnDustBurst(..., 'land')`.

Early cancel (`:1478-1488`): tras `LAND_CANCEL_WINDOW` (`0.12` s) de `land_recover`/`jump_land`,
cualquier WASD, salto o dash corta el `animLock`.

---

## 4. Flotación 0G (`floating`)

| Constante | Valor | Línea |
|---|---|---|
| `FLOAT_ACCEL` | `13.5` m/s² | `NyxDomeController.ts:159` |
| `FLOAT_MAX_SPEED` | `28.0` m/s (exportada; también `getBaseMaxSpeed()`) | `:161` |
| `KRONOS_DEFORM_SPEED_SCALE` | `1 / 3` | `:163` |
| `FLOAT_DRAG` | `0.06` (`exp(-0.06*dt)` ≈ 95 % de velocidad por segundo) | `:164` |
| `FLOAT_IDLE_SPEED` | `2.0` m/s (por debajo → pose `zero_g_float`) | `:168` |
| `CENTRIPETAL_SPEED_K` | `0.11` (`centripetal = 1/(1 + speed*0.11)`) | `:169` |
| `BODY_TURN_RATE` | `10` | `:170` |
| `VEL_ALIGN_RATE` | `4.0` | `:171` |

Aceleración (`:2759-2776`), solo si hay input y `eden > 0.01`:
`velocity += dir * (13.5 * mag * speedMultiplier * kronosSpeedScale * dt)`, y
`eden -= 1.0 * dt`. `mag = min(1, hypot(f, r))`.

Rozamiento (`:2773`): `velocity *= exp(-0.06 * dt)`.

Tope suave (`:2804-2809`): `floatMax = 28.0 * speedMultiplier * kronosSpeedScale`; si `sp > floatMax`,
`velocity.setLength(lerp(sp, floatMax, 1 - exp(-1.6 * dt)))`.

Curva centrípeta (`:2812-2820`): con `f > 0` y `sp > 0.5`, la dirección de la velocidad gira
hacia `facing` a `VEL_ALIGN_RATE * centripetal * dt` = `4.0 / (1 + speed*0.11) * dt` rad.

Derrape aéreo (`startAirDrift`, `:4290-4297`): solo si `speed >= 6`; `airDriftTimer = 0.25`,
`airDriftDir = normalize(velocity)`, `airDriftSpeed = speed`. Durante el derrape
(`:2778-2804`): giro `AIR_DRIFT_TURN_RATE * (1 - k*0.7) * dt` con `k = 1 - timer/0.25`
(`9.0` rad/s inicial), `airDriftSpeed *= exp(-1.1 * dt)`, tope `28.0 * speedMultiplier * kronosSpeedScale`,
y `velocity = airDriftDir * airDriftSpeed` (la aceleración normal no aplica ese frame).

Rotación del cuerpo en vuelo (`updateOrientation`, `:3766-3775`):
`facing.lerp(aimForward, 1 - exp(-10 * centripetal * dt))`,
`up.lerp(aimUp, 1 - exp(-8 * centripetal * dt))`, `turnRate` clamp ±12.
La base ortonormal final se aplica con `quaternion.slerp(1 - exp(-14 * dt))` (`:3802`).

Mira (`rotateLook`, `:917-950`): en vuelo rota `aimForward` alrededor de `aimUp` (transporte
paralelo); límite de pitch `aimForward · aimUp <= 0.985`. En `void_fall` el delta se multiplica
por `VOID_FALL_STEER_DAMP` (`0.16`).

Gravedad del pelo según modo (`:1688`): `hairG = mode === 'grounded' ? -1 : -0.25`.
`speed01` del animador (`:1692`): `clamp01(speed / RUN_SPEED)` = `clamp01(speed / 7.4)`.

---

## 5. Dash (`dashing`, Clic Derecho)

| Constante | Valor | Línea |
|---|---|---|
| `DASH_SPEED` | `31.0` m/s | `NyxDomeController.ts:174` |
| `DASH_DURATION` | `0.36` s | `:175` |
| `DASH_TURN_RATE` | `5.0` rad/s | `:176` |
| `DASH_SIDE_SPEED` | `30` m/s (dash lateral/redirección) | `:177` |
| `DASH_BACK_IMPULSE` | `14` m/s (frenazo trasero) | `:178` |
| `EDEN_DASH_COST` | `3.0` | `:194` |

`handleDash` (`:2110-2283`). Orden de prioridad:

1. **Parry del Gólem** (`parryWindowActive && parryPhase === 'parry_decide'` y `eden >= 3.0`)
   → `parryDashUp()`: velocidad `DASH_SPEED * speedMultiplier` hacia la estrella,
   `dashTimer = PARRY_DASH_MAX_REAL_SEC` (`0.42`), `dashWobbleImpulse = 1.2`, slow-mo a `1.0`,
   `animator.setState('air_dash')`.
2. **Sentadilla Cinética adjudicada** (`mode floating|dashing` + `kinetic.phase === 'idle'` +
   `kinetic.aimReady`) → `kinetic.beginCommit(...)`; coste 0 de Edén (ver §7).
3. **En `speed_attack`**: si apunta a un objetivo válido → `redirectDash(target)`; si no:
   - lateral (`r !== 0`): `velocity *= 0.35` y `+= camRight * sign(r) * 30`;
   - atrás (`f < 0`): `velocity *= 0.18` y `+= camFwd * -14`, `mode = 'floating'`,
     `playOneShot('air_dash')`;
   - resto: no hace nada.
   Coste `3.0`; `hadLockedEnemy` → `bulletTimeTimer = 1.6`; `dashSideRoll = -sign(r) * CAM_ROLL_DASH_SIDE`.
4. **En `dashing` con slow-mo activo**: re-captura con `redirectDash(target)` si hay candidato.
5. **En `floating`**: atrás (`f < 0 && r === 0`) → `velocity *= 0.18`, `+= camFwd * -14`, `air_dash`.
   Si no: `dir = normalize(camFwd*f + camRight*r)` (sin teclas = `camFwd`),
   `velocity = dir * (31.0 * speedMultiplier)`, `dashTimer = 0.36`,
   `dashIsForward = (r === 0 && f >= 0)`, `dashSideRoll = -r * 0.22`.

Durante el dash (`updateDashing`, `:2822-2846`): `velocity = dashDir * dashSpeed` cada frame;
si `dashIsForward`, `dashDir` gira hacia `aimForward` a `5.0 * dt` rad; al agotar `dashTimer`
vuelve a `floating` y arranca `startAirDrift()`. En `parry_dash` corrige rumbo hacia la
estrella viva y no dispara derrape al terminar.

Ambos dash (libre y lateral) lanzan `startCamTug()`, `spawnSonicBoomRing`, `spawnGravityWake`,
`dashWobbleImpulse = 1.0`.

---

## 6. Ataque de Velocidad (`speed_attack`, Clic Izquierdo)

| Constante | Valor | Línea |
|---|---|---|
| `ATTACK_ACCEL` | `15` m/s² | `NyxDomeController.ts:181` |
| `DRILL_SPEED_THRESHOLD` | `18.0` m/s | `:182` |
| `GRAVITY_KICK_SPEED` | `23.5` m/s (tope `gravity_kick`) | `:183` |
| `SPIRAL_DRILL_SPEED` | `34.0` m/s (tope `spiral_drill_kick`) | `:184` |
| `VOID_FALL_START_SPEED` | `8.0` m/s | `:185` |
| `VOID_FALL_MAX_SPEED` | `33.0` m/s | `:186` |
| `VOID_FALL_ACCEL` | `42.0` m/s² | `:187` |
| `VOID_FALL_RAMP_TIME` | `0.35` s | `:188` |
| `ATTACK_RAMP_TIME` | `0.28` s | `:282` |
| `EDEN_ATTACK_DRAIN` | `2.0` /s | `:195` |
| `KICK_RECOVER_BRAKE` | `4.2` (`exp(-4.2*dt)`) | `:189` |
| `KICK_RECOVER_MAX_TIME_PER_FLIP` | `0.9` s | `:190` |

### 6.1 Disparo

`handleAttack` (`:2448-2574`). Bloqueos previos: `kronosDeformed`, override
`onLeftClickAttackOverride`, `mode === 'kinetic_bounce'`, `eden <= 0.01`.
En `kick_recover` retorna salvo que haya slow-mo (`bulletTimeTimer > 0`) o ventana de parry.
En `speed_attack` solo re-lockea (no reinicia el ataque).

- **En `grounded`**: despega con `groundNormal * 0.65` y usa `camFwd` como `aimForward`.
- **Con candidato en el visor** (`reticleLockState === 'can_lock'`):
  `speedAttackKind = speed >= 18.0 ? 'spiral_drill_kick' : 'gravity_kick'`.
- **Sin enemigo**: `speedAttackKind = 'void_fall'`, `animator.setState('gravity_fall')`.
- Velocidad inicial: `void_fall → max(speed, 8.0)`, patadas → `speed` actual.
- Remate de parry: `spiral_drill_kick` forzado, `parrySpeed = max(speed, (18.0 + 6.0) * speedMultiplier)`.
- Firma sonora: `spiral_drill_kick → playSpinKick()`, `void_fall → playVoidFall()`, resto `playMelee()`.

### 6.2 Vuelo del ataque

`updateSpeedAttack` (`:2848-2970`):
- `eden -= 2.0 * dt`.
- Evolución en vuelo (`:2859-2862`): `gravity_kick` → `spiral_drill_kick` al cruzar `18.0` m/s.
- Auto-aim (`:2880`): `trackRate = clamp(1.8 + speed * 0.14, 2.2, 5.5)` rad/s sobre `aimForward` y `facing`.
- Impacto cuando `dist <= PLAYER_RADIUS + enemy.radius + 0.45` (`:2885`).
- Aceleración (`:2946-2953`): `ramp = clamp01(attackElapsed / rampTime)`;
  `accel = baseAccel * (0.2 + 0.8 * ramp²)`; `baseAccel` = `42.0` (`void_fall`) o `15.0`;
  `rampTime` = `0.35` (`void_fall`) o `0.28`.
  Si `speed < maxSpeed`: `speed + accel*dt` acotado; si no, `speed - baseAccel*dt` acotado al tope.
- Dirección: gira hacia `facing` a `4.0 / (1 + speed*0.11) * dt` rad.
- `void_fall`: añade vibración `sin(time * 9.7) * 0.9 * dt` alrededor del eje `dir × aimUp`.

### 6.3 Recuperación (`kick_recover`)

`startKickRecover(flips, fromAttack)` (`:2576-2593`): `mode = 'kick_recover'`, clip
`flips === 2 ? 'kick_flip_drill' : 'kick_flip'`, `lockedEnemy = null`.
`updateKickRecover` (`:2973-2996`): `velocity *= exp(-4.2 * dt)`; termina cuando el animador
acaba el clip o `recoverElapsed >= 0.9 * flipsTotal`; entonces pasa a `floating`,
`zero_g_float` y `startAirDrift()`.

### 6.4 Cámara Lenta de Redirección

| Constante | Valor | Línea |
|---|---|---|
| `REDIRECT_TIME_SCALE` | `0.25` | `NyxDomeController.ts:203` |
| `REDIRECT_WINDOW_MIN` | `1.25` s (reales) | `:226` |
| `REDIRECT_WINDOW_MAX` | `2.6` s (reales) | `:227` |
| `REDIRECT_REARM_COOLDOWN` | `0.9` s | `:228` |
| `REDIRECT_SPEED_RETENTION` | `0.80` | `:229` |

`computeRedirectWindowSec(target)` (`:780-787`):
`speed = max(|v| * 0.80, 10)`; `worldTime = dist / speed`;
`realTime = worldTime / 0.25`; `clamp(realTime, 1.25, 2.6)`.

Se abre en tres sitios:
- `notifyEnemyEvaded()` (dash evasivo del enemigo lockeado, `:794-814`).
- `breakLock(true)` si había enemigo previo y no es `spiral_octopus` (`:2047-2060`).
- Auto (`:2897-2922`) solo si `dist >= 4.0`, `missAngle >= 0.42`,
  `!lockedEnemyInReticle` y `requiredTurnRate > 4.0 / (1 + speed*0.11)`.

`redirectDash(target)` (`:2407-2446`): `eden -= 3.0`; re-lockea; gira mira/cuerpo/velocidad al
enemigo; `newSpeed = max(|v| * 0.80, 31.0 * 0.85 * speedMultiplier)`; mantiene
`speed_attack` (si era `void_fall`/null pasa a `spiral_drill_kick` o `gravity_kick` según
`>= 18.0`); corta `bulletTimeTimer` y `redirectWindowTimer`; `dashWobbleImpulse = 1.3`,
`shake = max(0.2)`, `startCamTug()`.

### 6.5 Parry del Gólem (integración)

| Constante | Valor | Línea |
|---|---|---|
| `PARRY_TIME_SCALE` | `0.10` | `NyxDomeController.ts:206` |
| `PARRY_WINDOW_SAFETY_REAL_SEC` | `16.0` s (solo tope de seguridad) | `:214` |
| `PARRY_STAR_ARRIVE_DIST` | `1.85` m | `:216` |
| `PARRY_DASH_MAX_REAL_SEC` | `0.42` s | `:218` |
| `GOLEM_GUARD_BOUNCE_MIN_EXIT` | `24.0` m/s | `:225` |

Fases (`parryPhase`): `'parry_decide'` → `'parry_dash'` → `'parry_strike'`.
`openParryWindow()` (`:820-863`): `redirectWindowTimer = 16.0`, `parryWindowActive = true`,
`parryPhase = 'parry_decide'`, giro automático de mira hacia la estrella, `startCamTug()`.
Guía de cámara en `update` (`:1369-1385`): `steerRate = 5.0` (strike) / `3.2` (decide) rad/s
hacia la cabeza o la estrella.
`enterParryStrikePhase()` (`:2332-2389`): vuelve a `floating`, `velocity = toHead * 5.5`,
`fovPunch <= -5`, `shake >= 0.18`.
El cierre de la ventana lo decide **exclusivamente** `DomeWaveManager` vía
`domeGameLoop → controller.closeParryWindow()` (`:879-892`).

Rebote contra el brazo en bloqueo: `bounceOffGolemGuard(golemPos, golemRadius)` (`:1199-1224`)
usa la MISMA Sentadilla Cinética (`beginKineticSquat`) con `kineticExitFloor = 24.0` m/s.

---

## 7. Sentadilla Cinética (rebote en pared) — `kinetic_bounce`

Fuente de verdad: `src/game/dome/nyxKineticBounce.ts` (`KINETIC_BOUNCE`, líneas 107-144).

| Constante | Valor | Línea |
|---|---|---|
| `TRIGGER_SPEED` | `12.0` m/s | `nyxKineticBounce.ts:107` |
| `AIM_RANGE` | `42.0` m | `:109` |
| `MIN_APPROACH_TIME` | `0.22` s | `:115` |
| `COMMIT_TIMEOUT` | `2.6` s | `:117` |
| `HOMING_TURN_RATE` | `10.0` rad/s | `:119` |
| `HOMING_FINAL_DIST` | `4.0` m | `:125` |
| `BOUNCE_CAM_RADIUS` | `5.0` m | `:131` |
| `SQUAT_DURATION` | `0.16` s | `:133` |
| `LAUNCH_DURATION` | `0.12` s | `:135` |
| `SPEED_KEEP` | `1.0` (100 % del impulso) | `:137` |
| `ABSORB_LAMBDA` | `16.0` | `:139` |
| `ORIENT_RATE` | `14.0` rad/s | `:141` |
| `COOLDOWN` | `0.30` s (antirrebote físico, no cooldown de habilidad) | `:143` |

Coste de Edén: **0** (no consume nunca). No ocupa ranura de habilidad.

### 7.1 Máquina de fases

`KineticBouncePhase = 'idle' | 'committed' | 'squat' | 'launch'` (`nyxKineticBounce.ts:148`).
`KineticBounceUiState = 'none' | 'available' | 'committed'` (`:151`).

- **idle**: `updateKineticBounce` (`NyxDomeController.ts:3014-3081`) refresca `aimReady` por
  frame. Requisitos: `mode` es `floating` o `dashing`, `bounceCooldown <= 0`,
  `speed >= 12.0`, raycast desde `nyxRoot.position` en `camFwd` con alcance `42.0`,
  `hit.normal · camFwd <= -0.2` y `hit.distance / speed >= 0.22`.
- **committed** (Clic Derecho): `beginCommit(point, normal, speed)`; `timer += dt`;
  cancela si `timer >= 2.6`, si aterriza (`mode === 'grounded'`) o si
  `speed < 12.0 * 0.5 = 6.0`. Curvado del vector (`:3043-3057`):
  a `dist > 4.0` apunta al punto de impacto; a `<= 4.0` gira a `-wallNormal`;
  `rotateToward(dir, desired, 10.0 * dt)` conservando el módulo.
- **squat** (contacto real): `beginKineticSquat` (`:3083-3138`) clava la esfera en
  `contact.point + normal * (PLAYER_RADIUS + 0.02)` = radio 0.47 m de la superficie,
  `playOneShot('kinetic_squat')`, `hitStopTimer = 0.05`, `shake = 0.42`, `fovPunch = -8`,
  `impactWobbleImpulse = 0.95`, `rollImpulse += random(-1..1) * 0.12`, `bounceCamHold = true`.
  Cada frame: `velocity *= exp(-16.0 * dt)`; a los `0.16` s → `launchKineticBounce()`.
- **launch**: `beginLaunch()` (`nyxKineticBounce.ts:220-228`):
  `exitDir = entryDir + wallNormal * (-2 * (entryDir · wallNormal))`, normalizado;
  si degenera (`|exitDir|² < 1e-6`) sale por `wallNormal`.
  `exitSpeed = entrySpeed * 1.0`. Piso opcional del Gólem: `exitSpeed = max(exitSpeed, 24.0)`.
  `fovPunch = max(fovPunch, 7)`, `dashWobbleImpulse = max(actual, 1.2)`,
  `rollImpulse += random(-1..1) * 0.16`, `startCamTug()`, sonic boom + estela.
  A los `0.12` s → `kinetic.reset()`, `mode = 'floating'`, `bounceCooldown = 0.30`.

Duración total del estado: `0.16 + 0.12 = 0.28` s (coincide con
`KINETIC_SQUAT_CLIP.duration` y con el `animLock` del clip).

### 7.2 Orientación durante el rebote

`squat` (`updateOrientation`, `:3743-3753`): `up.lerp(wallNormal, 1 - exp(-14.0 * dt))`,
`facing` proyectado tangente a la pared. En `committed` se aplica el mismo lerp (`:3774-3784`).

---

## 8. Colisiones, rebotes y cúpula

`resolveGround(slabs)` (`NyxDomeController.ts:3203-3509`). Orden de decisión con contacto:

1. **KRONOS deformado**: solo expulsa (`+n * depth`) y anula `approach * 0.45`. Sin rebote.
2. **`kinetic_bounce`**: reposiciona en `contact.point + n * 0.47`, no toca velocidad.
3. **Adjudicación `committed` con `bounceCooldown <= 0`** → `beginKineticSquat` (el rebote gana al aterrizaje).
4. **Aterrizaje** si `canLand` (`:3283-3292`):
   `isTopFace && ((modo floating && |v| < FLOAT_LAND_MAX_SPEED (14) && footAlign > FLOAT_LAND_MIN_ALIGN (-0.25)) || footAlign > LAND_ALIGN_MIN (0.35))`.
5. **Roce a baja velocidad** (`|v| < 5.0`): reposición `+n * 0.47` y anula componente normal.
6. **Ledge Glance** (`sideHit = |n · up| < 0.55`, `depth < 0.35`, `|v| > 6`, `bounceCooldown <= 0`):
   deslizamiento `n (+ up * 0.85 si n·up > -0.2)` normalizado; reposición
   `+ slide * (0.45 + 0.6)`; anula `vn * 1.15`; `+= slide * 2.0`; `velocity *= 0.8`;
   `bounceCooldown = 0.18`.
7. **Rebote duro** (pared/canto/iceberg): reposición `+n * (0.45 + 0.08)`; reflexión
   `vn * -2`; si `icebergHit` (`oneSidedTop && !isTopFace && up·n < -0.35`):
   `velocity *= 0.55` y `+= n * 3.5`; si no, `velocity *= 0.45` y `+= up * 1.5`.
   Pasa a `floating`, `playOneShot('hit_stagger')`, `shake = max(0.3 / 0.22)`,
   `hitStopTimer = max(HIT_STOP_KICK = 0.042)`, `fovPunch = min(-7)`, `impactFlash = max(0.75)`,
   `rollImpulse` (±0.24 iceberg / `n·camRight * 0.26` pared), `impactWobbleImpulse`
   (`0.85` iceberg / `0.75` pared), `landingDip = ±0.48 * 0.9` (iceberg), `bounceCooldown = 0.4`.

Sin contacto (`:3469-3508`): sondeo `-up` con alcance `0.8` m; si no engancha, pasa a
`floating` y resetea `transitionCamUpTimer`, `slideTimer`.

Rebote contra enemigo (impacto de patada, `impactEnemy` `:2655-2668`):
`velocity *= -ENEMY_BOUNCE_KEEP` (`-0.32`) y
`velocity += up * min(7, impactSpeed * 0.25)`. `rollImpulse += 0.2 * impactRollSign`
(alterna signo cada golpe, clamp ±0.38).

### 8.1 Barrera Blanca de la cúpula

`resolveDomeBound()` (`:3638-3696`). Si `|position| > DOME_PLAYER_BOUND_RADIUS (88.6)` y
`bounceCooldown <= 0`:
- Reposiciona a radio `88.6`.
- `vn > 0` → `velocity += n * (-1.6 * vn)`; luego garantiza salida hacia dentro:
  si `inward > -3`, `velocity += n * (-3 - inward)`.
- `hp -= DOME_BOUNCE_DAMAGE (10)`; dispara `onDomeBounceDamage(10)`.
- Sale de `speed_attack`; si no está en `grounded`, pasa a `floating`.
- `playOneShot('dome_bounce')`, `spawnDomeBounceRing`, `domeBounceFlash = 1`,
  `shake = max(0.35)`, `hitStopTimer = max(0.065)`, `fovPunch = min(-14)`,
  `impactWobbleImpulse = max(1.25)`, `impactFlash = 1.0`,
  `rollImpulse += n·camRight * 0.3`, `bounceCooldown = 0.6`, `audio.playBounce() + playHurt()`.

Enemigos: `checkDomeBarrierKill` mata instantáneamente a todo enemigo no élite/no boss cuyo
`|position| + radius >= 88.6` (`DomeCombatSystem.ts:355-368`).

---

## 9. Economía de Edén (recursos de movimiento/combate)

| Constante | Valor | Línea |
|---|---|---|
| `EDEN_MOVE_DRAIN` | `1.0` /s (WASD en flotación) | `NyxDomeController.ts:193` |
| `EDEN_DASH_COST` | `3.0` por dash | `:194` |
| `EDEN_ATTACK_DRAIN` | `2.0` /s durante `speed_attack` | `:195` |
| `EDEN_IDLE_REGEN_FRAC` | `0.01` = 1 % de `maxEden` por segundo | `:196` |

`updateEden` (`:3941-3959`): regenera si `mode === 'grounded'` **o** (`floating` y sin
WASD/ataque/dash, incluidos los del mando). Base `edenRegenFrac` (por defecto 0.01, ajustable
por pasivas vía `syncProgression`). HP: regeneración pasiva `maxHp * hpRegenFrac * dt`.

Base de recursos (`:489-492`): `hp = maxHp = 100`, `eden = maxEden = 100`.

`spendEden(amount)` (`:1147-1152`) devuelve `false` si no alcanza.
`restoreResources(hpDelta, edenDelta)` (`:1153-1161`); si `edenDelta > 0.5` enciende
`edenFlash >= 0.6`.

HUD (`getHudState`, `:1279-1340`): `drillThreshold = 18.0`, `isDrillReady = speed >= 18.0`,
`speedLinesIntensity = clamp01((speed - 10) / 16)`, `bulletTimeActive`,
`bulletTimeRemaining = max(bulletTimeTimer, redirectWindowTimer)` (0 durante `parry_dash`),
`cameraRollDeg = cameraRollRad * 180/π`.

---

## 10. Combate: `computeKineticImpact`

`src/game/dome/DomeCombatSystem.ts:273-353`. Firma:

```ts
computeKineticImpact(
  enemy: DomeEnemyEntity,
  impactSpeed: number,
  speedForceMultiplier: number,
  isDrill: boolean,
  bypassFlesh = false,
): KineticImpactResult
```

No usa masa: la fuerza es **velocidad × multiplicador de fuerza × multiplicador de taladro**.

```
kineticForce = impactSpeed * speedForceMultiplier * (isDrill ? 1.55 : 1.0)
```

Constantes (`DomeCombatSystem.ts`):

| Constante | Valor | Línea |
|---|---|---|
| `DRILL_FORCE_MULTIPLIER` | `1.55` | `:96` |
| `FLESH_WEAR_PER_FORCE` | `0.18` | `:98` |
| `FLESH_DAMAGE_PER_FORCE` | `0.9` | `:100` |
| `STAR_DAMAGE_PER_FORCE` | `2.2` | `:102` |
| `STAR_DAMAGE_MIN_FRACTION` | `0.34` | `:104` |
| `KNOCKBACK_PER_FORCE` | `0.35` | `:106` |
| `KNOCKBACK_PENETRATED_SCALE` | `0.35` | `:107` |
| `HITSTOP_BASE` | `0.045` s | `:108` |
| `HITSTOP_PENETRATE` | `0.09` s | `:109` |
| `HITSTOP_KILL` | `0.12` s | `:110` |

### 10.1 Resolución

1. Si `!enemy.alive` → resultado vacío (todos los campos 0, `reason: 'normal'`).
2. **Pinchos activos** (`spikesActive`, Prisma Necroz de frente) → `damage: 0`,
   `knockbackSpeed: kineticForce * 0.35`, `recoilBounce: true`, `hitStopSec: 0.045`,
   `reason: 'thorns_repel'` (además el game loop aplica `THORNS_DAMAGE_TO_NYX = 8`).
3. **Penetración** si `bypassFlesh || mouthExposed || vulnerable || kineticForce >= enemy.fleshThickness`:
   - `mouthExposed = archetype === 'giant_sparrow' && mouthOpen`
   - `vulnerable = (vulnerableTimer ?? 0) > 0`
   - `penetratedStar = true`; `weakPointsRemaining = max(0, weakPointsRemaining - 1)`
   - `starFloor = (isElite && !isDrill && impactSpeed < 16) ? 0 : maxHp * 0.34`
   - `damage = max(kineticForce * 2.2, starFloor)`
   - `reason = bypassFlesh ? 'skill' : (isDrill ? 'drill' : 'normal')`
4. **Solo carne**: `wear = min(fleshThickness, kineticForce * 0.18)`;
   `fleshThickness -= wear`; `damage = kineticForce * 0.9`.
5. `enemy.hp = max(0, hp - damage)`; `hitFlash = 1`; si `hp <= 0` → `alive = false`.
6. Retorno:
   - `knockbackSpeed = kineticForce * 0.35 * (penetratedStar ? 0.35 : 1.0)`
   - `recoilBounce = !penetratedStar` (sin penetrar Nyx rebota con 1 `kick_flip`)
   - `hitStopSec = killed ? 0.12 : penetratedStar ? 0.09 : 0.045`

### 10.2 Entrada desde el golpe de Nyx

`domeGameLoop.ts` `onControllerHitEnemy` (`:489-600`): llama
`combat.computeKineticImpact(entity, impactSpeed ?? 14, progression.getModifiers().forceMultiplier, isDrill)`.
Casos especiales previos: contra-parry del Pulpo (`tryOctopusCounterParry`), remate del parry
del Gólem (`parryCritDamage` = 35 % del maxHp), KRONOS (`tryBreakKronosStar`), escudo del
Prisma Necroz (`checkNecrozShieldBlock` → `punchCamera(0.25)` + `applySmashKnockback(dir, 26)`),
bloqueo del Gólem (`bounceOffGolemGuard`).

Escala de "game feel" del impacto en el controller (`impactEnemy`, `:2595-2677`):

```
impactSpeed  = |velocity|  (velocidad real en el instante del golpe)
kineticMult  = max(0.6, (impactSpeed / 14) ^ 1.35)
shake        = max(shake, 0.34 * kineticMult)
hitStopTimer = max(hitStopTimer, (isDrill ? 0.068 : 0.042) * kineticMult)
fovPunch     = min(fovPunch, max(-30, (isDrill ? -11 : -7) * kineticMult))
impactFlash  = max(impactFlash, min(1, (isDrill ? 1.0 : 0.75) * kineticMult))
impactWobbleImpulse = max(actual, min(1.3, kineticMult))
```

### 10.3 Stats por arquetipo (carne / HP)

`DOME_ENEMY_ARCHETYPES` (`DomeCombatSystem.ts:169-196`):

| Arquetipo | maxHp | radius | fleshThickness | weakPoints |
|---|---|---|---|---|
| `abyssal_cell` | 40 | 1.6 | 15 | 1 |
| `spiral_octopus` | 70 | 2.2 | 55 | 1 |
| `crab_gunner` | 60 | 1.8 | 35 | 1 |
| `ground_golem` | 140 | 3.2 | 80 | 1 |
| `lightning_butterfly` | 31 | 1.2 | 8 | 1 |
| `giant_sparrow` | 520 | 4.5 | 85 | 2 |
| `prisma_necroz` | 300 | 3.8 | 65 | 1 |
| `kronos_leviathan` | 4 | 3.2 | 90 | 4 |

Umbral de penetración = `fleshThickness`. Con `speedForceMultiplier = 1` y sin taladro,
la velocidad mínima para penetrar la carne es exactamente `fleshThickness` m/s
(p. ej. Gólem 80 m/s, imposible; Célula 15 m/s; Mariposa 8 m/s).

### 10.4 Daño recibido por Nyx

| Fuente | Valor | Archivo:línea |
|---|---|---|
| Barrera Blanca (choque propio) | `-10` HP, `invulnTimer = 0.8` s, `staggerTimer = 0.5` s | `DomeCombatSystem.ts:113-115, 397-400` |
| Pinchos del Prisma Necroz | `THORNS_DAMAGE_TO_NYX = 8` | `DomeCombatSystem.ts:137`, aplicado en `domeGameLoop.ts:575` |
| Tinta ácida (DoT) | `INK_DOT_PER_SEC = 4.0` HP/s durante toda la mancha | `DomeCombatSystem.ts:122, 432-439` |
| Mancha base | `INK_STAIN_SEC = 3.0` s, opacidad `0.55` | `:124-125` |
| Contra-parry de tinta | opacidad `0.65`, duración aleatoria `5.0..10.0` s | `:127-129` |
| Fundidos de la mancha | entrada `0.12` s, salida `0.45` s | `:131-132` |
| Manotazo del Gólem | daño variable + `applySmashKnockback(pushDir, pushSpeed ?? 22)` | `domeGameLoop.ts:474-477` |

`applyDomeBarrierDamageToNyx()` (`:390-401`) no hace daño si `invulnTimer > 0` o `isNyxDown`.
`invulnTimer` y `staggerTimer` decaen en `updatePlayerStatus(dt)` (`:425-455`).

`applyDamage(amount)` (`NyxDomeController.ts:1162-1172`): `hp -= amount`,
`impactFlash >= 0.85`, `shake >= 0.25`.
`applySmashKnockback(pushDir, speed)` (`:1173-1198`): corta `speed_attack`/`dashing`/`kick_recover`
a `floating`, fija `velocity = pushDir * speed`, `playOneShot('hit_stagger')`,
`shake >= 0.32`, `impactFlash >= 0.85`.

Escudo/anti-spam físico del controller (no son i-frames):
`counterParryIgnoreTimer = 0.5` s (`:2613`), `bounceCooldown` 0.18 / 0.4 / 0.6 s,
`kinetic.COOLDOWN = 0.30` s.

---

## 11. Cámara

Todo en `NyxDomeController.updateCamera` (`:3962-4234`) y `computeCameraBasis` (`:1716-1740`).

### 11.1 FOV

| Constante | Valor | Línea |
|---|---|---|
| `settings.baseFov` | `70` por defecto; límites `55..85` | `src/game/settings.ts:174, 126` |
| `FOV_SPEED_REF` | `32` | `NyxDomeController.ts:239` |
| `FOV_BOOST` | `22` | `:240` |
| `FOV_MAX` | `100` | `:241` |
| `FOV_TUG_MAX` | `18` | `:249` |
| `FOV_PUNCH_KICK` | `-7` | `:274` |
| `FOV_PUNCH_DRILL` | `-11` | `:275` |
| `FOV_PUNCH_CAP` | `-30` | `:276` |

Fórmula exacta (`:4219-4231`):

```
speed01  = clamp01(speed / 32)
tugBlend = fovTug / 18
targetFov = min(100,
                settings.baseFov
              + 22 * speed01 * (1 - 0.5 * tugBlend)
              + fovTug
              + fovPunch)
```

Se aplica a `camera.fov` y `updateProjectionMatrix()` solo si el delta `> 0.05`.
La cámara de `domeGameLoop` se crea con `settingsRef.current.baseFov` y near `0.1`, far `2500`
(`domeGameLoop.ts:132-137`).

### 11.2 Distancia del spring-arm y tirachinas

| Constante | Valor | Línea |
|---|---|---|
| `CAM_DISTANCE` | `6.2` (suelo) | `:234` |
| `CAM_VOID_FALL_DISTANCE` | `8.4` (Caída al Vacío) | `:235` |
| `CAM_SETTLE_DISTANCE` | `6.1` (vuelo estabilizado) | `:236` |
| `CAM_HOVER_DISTANCE` | `4.8` (flotación `< 1.5` m/s) | `:237` |
| `CAM_LOOK_HEIGHT` | `1.35` | `:238` |
| `CAM_TUG_CONTRACT` | `4.4` m | `:244` |
| `CAM_TUG_STRETCH` | `7.4` m | `:245` |
| `CAM_TUG_CONTRACT_TIME` | `0.07` s | `:246` |
| `CAM_TUG_STRETCH_TIME` | `0.45` s | `:247` |
| `CAM_TUG_TOTAL` | `0.52` s | `:248` |

Distancia objetivo (`:4018-4031`): en `grounded`
`6.2 - clamp01(camPitch / 1.15) * 1.1`; en `floating` con `speed < 1.5` → `4.8`;
en `void_fall` → `8.4`; resto → `6.1`.

Tirachinas (`:4038-4058`): durante `[0, 0.07)` interpola lineal a `4.4`; durante
`[0.07, 0.52)` `distTarget = lerp(4.4, 7.4, 1-(1-k)³)` y `fovTug = 18 * eased`;
al terminar fija `6.1`. Fuera del tirachinas `fovTug *= exp(-6 * dt)`.

Muelle subamortiguado (`:4064-4071`):
`springDt = min(dt, 1/60)`; `stiffness = 130` (con tirachinas) o `30`;
`damping = 15` o `13`; `camDistVel += (target - camDist) * stiffness * springDt`;
`camDistVel *= exp(-damping * springDt)`; `camDist += camDistVel * springDt`;
`camDist = clamp(camDist, 1.1, 9.5)`.

Oclusión (`:4161-4165`): raycast desde el punto de mira hacia atrás con alcance `camDist`;
si impacta, `camDist = max(1.1, hit.distance - 0.25)`.

### 11.3 Offsets over-the-shoulder y encuadre

| Constante | Valor | Línea |
|---|---|---|
| `CAM_OFFSET_RIGHT_AIM` | `1.05` | `:252` |
| `CAM_OFFSET_UP_AIM` | `0.36` | `:253` |
| `CAM_OFFSET_RIGHT_ATTACK` | `0.65` | `:254` |
| `CAM_ATTACK_LOOK_LIFT` | `0.42` | `:256` |
| `CAM_ATTACK_LOOK_LIFT_FAST` | `0.62` | `:257` |
| `CAM_LOOK_LAG_LAMBDA_AIR` | `16` | `:266` |
| `CAM_LOOK_LAG_LAMBDA_GROUND` | `40` | `:267` |
| `CAM_HORIZON_SLERP_TIME` | `0.45` s | `:259` |

`fastAttack = isAttack && speed >= 14` (`:3997`). Suavizados: `lookLift` y offsets con
`1 - exp(-6|7 * dt)` (`:4031-4033`). Lag del rig: `camLookSmooth.lerp(target, 1 - exp(-lambda*dt))`
con lambda 40 en suelo, 16 en vuelo (`:4152-4154`).

Punto de mira (`:4140-4148`): `nyxRoot.position + up*(1.35 + landingDip) + camUp*lookLift +
camRight*camOffsetRight + camUp*camOffsetUp`.

### 11.4 Dutch roll

| Constante | Valor | Línea |
|---|---|---|
| `CAM_ROLL_MAX` | `0.38` rad (≈ ±21.8°) | `:261` |
| `CAM_ROLL_TURN_K` | `0.032` | `:262` |
| `CAM_ROLL_DASH_SIDE` | `0.22` | `:263` |

`rollTarget = clamp(turnRate * 0.032 + dashSideRoll, ±0.38) + rollImpulse`;
`cameraRollRad += (rollTarget - cameraRollRad) * (1 - exp(-8 * dt))`, clamp ±0.38;
`rollImpulse *= exp(-5 * dt)`; `dashSideRoll *= exp(-2.5 * dt)` (`:4078-4092`).
El roll total se aplica como `camera.up.applyQuaternion(axis = camFwd, totalRoll)` (`:4210-4215`).

### 11.5 Tambaleo orgánico (wobble)

`wobbleTime += dt`; `hoverBase = mode === 'floating' ? 0.3 : 0` (`:4099`).
`voidFallIntensity = isVoidFall ? clamp01(speed / 33.0) : 0`.
`voidBoost = VOID_WOBBLE_BONUS (0.95) * (0.4 + 0.6 * voidFallIntensity)`.
`g = max(hoverBase, clamp01((speed - 4) / 14) + voidBoost)`.
`dashOsc = sin(wt * 34) * dashWobbleImpulse`; `impactOsc = sin(wt * 26 + 0.6) * impactWobbleImpulse`.
Decaimientos: `dashWobbleImpulse *= exp(-7*dt)`; `impactWobbleImpulse *= exp(-6*dt)`.

```
wobblePitch = g*0.065*(sin(wt*6.7)*0.6 + sin(wt*12.9+1.3)*0.4) + dashOsc*0.09  + impactOsc*0.099
wobbleYaw   = g*0.085*(sin(wt*5.1+2.1)*0.6 + sin(wt*10.7+0.4)*0.4) + dashOsc*0.072 + impactOsc*0.081
wobbleRoll  = g*0.11 *sin(wt*4.3+0.9)                              + dashOsc*0.153 + impactOsc*0.126
```

`void_fall` añade (`:4113-4118`), con `f = 0.45 + 0.55*voidFallIntensity`:
`+ f*0.068*(sin(wt*24.3)*0.6 + sin(wt*38.7+0.8)*0.4)` a pitch,
`+ f*0.078*(sin(wt*19.7+1.4)*0.6 + sin(wt*33.1+2.1)*0.4)` a yaw,
`+ f*0.16*(sin(wt*14.5+0.5)*0.6 + sin(wt*27.9+1.7)*0.4)` a roll.

KRONOS (`:4130-4138`): con `ks/kp/ky` de dos senos a 23.9–53.1 Hz, suma
`kp*0.24*shake` a pitch, `ky*0.2*shake` a yaw, `ks*0.34*shake` a roll.

Aplicación (`:4154-4158`): el punto de mira se desplaza
`+ camRight * (wobbleYaw * camDist) + camUp * (wobblePitch * camDist)`.

### 11.6 Shake, jitter y `punchCamera`

`punchCamera(strength)` (`:2022-2029`):

```
s = clamp(strength, 0, 1.3); si s <= 0 → return
shake       = max(shake, 0.2 * s)
fovPunch    = min(fovPunch, max(-30, -5 * s))
impactFlash = max(impactFlash, min(0.6, 0.45 * s))
```

Jitter de posición por frame (`:4168-4179`):

```
jitter = shake
       + (hitStopTimer > 0 ? 0.05 : 0)
       + kronosCameraShake * 0.14
       + (isVoidFall ? 0.085 * voidFallIntensity : 0)
// si jitter > 0.001: camPos.x/y/z += random(-1..1) * jitter
```

Decaimientos: `shake *= exp(-6 * sdt)` (`:1450`), `fovPunch *= exp(-14 * rawDt)` (`:1455`),
`impactFlash -= rawDt * 3.8` (`:1454`), `domeBounceFlash -= sdt * 2.2` (`:1449`),
`edenFlash -= rawDt * 2.6` (`:1456`).

Llamadas a `punchCamera` desde `domeGameLoop.ts`:

| Situación | Valor | Línea |
|---|---|---|
| Muerte interna de enemigo (`onInternalKill`) | `0.75` | `:187` |
| Daño de habilidad (con throttle `0.12` s) | `min(1.3, 0.35 + impulseLen/26 + amount*0.003)` | `:408-419` |
| Contra-parry del Pulpo | `0.55` | `:505` |
| Escudo del Prisma Necroz bloquea | `0.25` | `:548` |
| Bloqueo del Gólem | `0.3` | `:562` |
| Pulso de rugido/portal KRONOS | `min(1.3, kronosFx.shakePulse)` | `:1240` |
| Destello void de KRONOS | `1.2` | `:1246` |

### 11.7 Muelle de aterrizaje y nivelación del horizonte

- `landingDip` (`:4074`): `+= -landingDip * (1 - exp(-7 * dt))` (recuperación ~0.35 s).
- Al aterrizar (`:3516-3520`): `transitionFromUp = camUpSmooth`, `transitionToUp = normal`,
  `transitionCamUpTimer = 0.45`. En `updateCamera` (`:3973-3983`):
  `t = 1 - timer/0.45`, `eased = 1 - (1-t)³`, `quat.slerp(identity, 1 - eased)`.

### 11.8 Cámara del rebote cinético

`bounceCamHold`/`bounceCamBlend` (`:4186-4211`). Al contactar se guarda `camera.position` en
`bounceCamPos` y `bounceCamImpact = point`. Mientras
`|nyxRoot.position - bounceCamImpact| < 5.0` (BOUNCE_CAM_RADIUS) el blend sube a 1 con
lambda 16; al salir del radio baja a 0 con lambda 5. Con blend `b`, `camPos.lerp(bounceCamPos, b)`
y el look apunta a `nyxRoot.position + up * 0.9`. Se apaga al `blend < 0.01` fuera de radio.

### 11.9 Cámara especial en `domeGameLoop`

- Pausa total: `isPaused = menuPaused || implosionCinematic !== null`;
  `effRawDt = isPaused ? 0 : rawDt` (`:1005-1007`). `menuPaused` incluye level-up, battle
  report, pausa y tutorial.
- Cinemática de Implosión (`:1315-1453`): órbita `angle = orbitBaseAngle + 0.55*t`,
  `targetDist = max(4.6, enemy.radius * 2.45)`, `zoomEase = 1-(1-min(1, t*1.35))^2.5`,
  `camera.rotateZ(0.055 * sin(t * π))`, `fovTarget = savedFov - 11 * sin(min(1, t*1.2) * π * 0.85)`,
  shakes de 0.28 / 0.35 / 0.4 con frecuencias 95/83, 90/78 y 92/80 al comprimir, repeler y romper.

---

## 12. Cámara lenta, hit-stop y escalas de tiempo

### 12.1 Escala de tiempo

`getTimeScale()` (`NyxDomeController.ts:761-777`):

```
si (parryWindowActive && parryPhase === 'parry_dash')  → 1.0 * kronosSlowMo
si no, scale = 1.0
si (redirectWindowTimer > 0)  scale = parryWindowActive ? 0.10 : 0.25
si no (bulletTimeTimer > 0)   scale = 0.25
return scale * kronosSlowMo
```

| Fuente | `timeScale` | Duración | Activación |
|---|---|---|---|
| Bullet-time (Cámara Lenta) | `0.25` (`BULLET_TIME_SCALE`) | `1.6` s reales (`BULLET_TIME_DURATION`) | `breakLock(true)` sin enemigo previo, o dash lateral/trasero en `speed_attack` con enemigo marcado |
| Cámara Lenta de Redirección | `0.25` (`REDIRECT_TIME_SCALE`) | calculada, `1.25..2.6` s reales | dash evasivo del enemigo, `breakLock` con enemigo previo, o giro imposible del auto-aim |
| Parry del Gólem (decide/strike) | `0.10` (`PARRY_TIME_SCALE`) | ventana espacial; tope 16 s | `openParryWindow()` |
| Parry del Gólem (dash a la estrella) | `1.0` | `<= 0.42` s | `parryDashUp()` |
| KRONOS Fase 4 | `0.75` | mientras dure la fase | `setKronosSlowMoScale(min(phase4 ? 0.75 : 1, sparrowSlowMoScale))` |
| Pausa de menú / cinemática | `effRawDt = 0` (congela todo) | — | `domeGameLoop.ts:1006` |

`setKronosSlowMoScale(scale)` (`:703-705`): `clamp(scale, 0.05, 1)`; se **multiplica** con
las cámaras lentas de Nyx.
Los timers de slow-mo descuentan **tiempo real** (`rawDt`) (`:1350-1371`), y durante
`parry_dash` el `redirectWindowTimer` no decae.
`update()` recibe `dt`, calcula `rawDt = min(dt, 0.05)` y `sdt = rawDt * getTimeScale()`.

### 12.2 Hit-stop

`hitStopTimer` se descuenta con `rawDt`; mientras `> 0`, `simDt = 0` y **toda la simulación de
Nyx queda congelada** (física, animador, VFX), pero la cámara sigue en tiempo real y vibra
(`+0.05` de jitter) (`:1395-1403`, `:1553`).

| Evento | Duración | Línea |
|---|---|---|
| Patada (cualquier impacto) | `HIT_STOP_KICK (0.042) * kineticMult` | `:2625-2628` |
| Taladro espiral | `HIT_STOP_DRILL (0.068) * kineticMult` | `:2625-2628` |
| Choque lateral duro pared/iceberg | `HIT_STOP_KICK (0.042)` | `:3381` |
| Sentadilla Cinética (contacto) | `0.05` | `:3122` |
| Barrera Blanca | `0.065` (`DOME_BOUNCE_HIT_STOP`) | `:3674` |
| Hit-stop sugerido por `computeKineticImpact` | `0.045` / `0.09` / `0.12` | `DomeCombatSystem.ts:108-110, 351` |

---

## 13. Animaciones

### 13.1 Estados (`NyxAnimState`, `nyxAnimator.ts:60-82`)

21 estados: `idle`, `run`, `jump_land`, `land_recover`, `zero_g_float`, `gravity_fall`,
`air_dash`, `gravity_kick`, `kick_flip`, `kick_flip_drill`, `spiral_drill_kick`,
`gravity_slide`, `counter_parry`, `wall_shift_flip`, `dome_bounce`, `kinetic_squat`,
`victory_float`, `stasis_cast`, `stasis_throw`, `hit_stagger`, `eden_absorb`.

Rig: 28 huesos indexados (`BONE_COUNT = 28`, `:107`), con `BONE_NAMES` en `:110-117`:
hips, spine, chest, neck, head, upperArm/forearm/hand L y R, thigh/shin L y R,
hair_1..hair_4, clavicle L/R, foot/toe L/R, sleeve_L/R, halo_ring.

### 13.2 Duración por estado y pose de caída

`DURATION` (`nyxAnimator.ts:136-145`) y `FALLBACK` (`:147-155`):

| Estado | Duración (s) | Fallback | Implementación |
|---|---|---|---|
| `idle` | `INF` (sostenido) | `idle` | `poseIdle(w, g)` procedural |
| `run` | `INF` | `run` | `poseRun(w, g, runPhase, speed, turn)` procedural |
| `jump_land` | `1.15` | `idle` | `poseJumpLand(w, t)` |
| `land_recover` | `1.1` | `idle` | `poseLandRecover(w, t)` |
| `zero_g_float` | `INF` | `zero_g_float` | clip `ZERO_G_FLOAT_LOOP` (2.6333 s) |
| `gravity_fall` | `INF` | `gravity_fall` | clip `GRAVITY_FALL_LOOP` (1.2 s) + `applyGravityFallReactivity(g)` |
| `air_dash` | `0.6` | `zero_g_float` | `poseAirDash(w, t, g, dashDir)` |
| `gravity_kick` | `INF` | `gravity_kick` | clip `GRAVITY_KICK_LOOP` (0.8 s) |
| `kick_flip` | `0.77` (`KICK_FLIP_PLAY`) | `zero_g_float` | clip `KICK_FLIP_CLIP` (0.8667 s) |
| `kick_flip_drill` | `1.18` (`KICK_FLIP_DRILL_PLAY`) | `zero_g_float` | clip `KICK_FLIP_DRILL_CLIP` (1.3333 s) |
| `spiral_drill_kick` | `INF` | `spiral_drill_kick` | clip `SPIRAL_DRILL_KICK_LOOP` (0.5 s) |
| `gravity_slide` | `INF` | `gravity_slide` | `poseGravitySlide(w, g, speed01, turnRate)` |
| `counter_parry` | `0.75` | `zero_g_float` | `poseCounterParry(w, t)` |
| `wall_shift_flip` | `0.75` | `gravity_fall` | `poseWallShiftFlip(w, t)` |
| `dome_bounce` | `0.85` | `zero_g_float` | `poseDomeBounce(w, t)` |
| `kinetic_squat` | `0.28` (`KINETIC_SQUAT_CLIP.duration`) | `zero_g_float` | clip `KINETIC_SQUAT_CLIP` (0.28 s) |
| `victory_float` | `INF` | `victory_float` | `poseVictoryFloat(w, g)` |
| `stasis_cast` | `INF` | `stasis_cast` | `poseStasisCast(w, t, g)` |
| `stasis_throw` | `1.30` | `idle` | `poseStasisThrow(w, t, g)` |
| `hit_stagger` | `0.95` | `idle` | `poseHitStagger(w, t)` |
| `eden_absorb` | `INF` | `eden_absorb` | `poseEdenAbsorb(w, t, g)` |

`KICK_FLIP_PLAY = 0.77` (giro completo a ~0.76 s; clip 0.8667 s) y
`KICK_FLIP_DRILL_PLAY = 1.18` (2.º giro a ~1.17 s; clip 1.3333 s) recortan el asentado final.

Estados sostenidos (`isSustained(state)` = `DURATION[state] === INF`, `:288`) que se usan como
`animLock` reciben un tope de `SUSTAINED_ONESHOT_HOLD = 0.9` s (`NyxDomeController.ts:116`,
`playOneShot` `:4263-4276`).

### 13.3 Clips horneados (`nyxBakedClips.ts`)

| Clip | Duración (s) | keyframes | Línea |
|---|---|---|---|
| `KICK_FLIP_CLIP` | `0.8667` | 27 | `:35-36` |
| `KICK_FLIP_DRILL_CLIP` | `1.3333` | — | `:126-127` |
| `GRAVITY_KICK_LOOP` | `0.8` | — | `:259-260` |
| `SPIRAL_DRILL_KICK_LOOP` | `0.5` | — | `:344-345` |
| `ZERO_G_FLOAT_LOOP` | `2.6333` | — | `:402-403` |
| `GRAVITY_FALL_LOOP` | `1.2` | — | `:652-653` |
| `KINETIC_SQUAT_CLIP` | `0.28` | 15 (0.02 s por frame) | `:773-774` |

Estructura `NyxBakedClip` (`:19-33`): `duration`, `frameCount`, `times[]`,
`rotations[]` (Euler XYZ rad, unwrapped, frame-major `(frame * 28 + bone) * 3`) e
`hipsOffset[]` (posición local de hips respecto al rest de `nyx_rigged.glb`).
Generados por `scripts/bake_nyx_clips.mjs` desde los GLB de `public/models/`.
Pistas unwrapped: `kick_flip` hips.x de 0 a -2π; drill de 0 a -4π; `spiral_drill_kick`
hips.y +2π por vuelta de barrena.

`spiral_drill_kick` (pose `poseSpiralDrillKick`, `nyxAnimsCombat.ts:170-227`) fase a fase:
0–0.16 compresión (bola, torsión anticipada -0.35 rad), 0.16–1.02 barrena (2 vueltas exactas
= 4π en `hips.y`), 1.02–1.25 apertura. Constante exportada
`SPIRAL_DRILL_KICK_DURATION = 1.25` (`:60`).

`kick_flip` (`poseKickFlip`, `:320-346`): `p = clamp(t / 0.85, 0, 1)`,
`flip = -2π * smooth(0.02, 0.78, t)` envuelto a (-π, π] para que el lerp gire por el camino corto.

### 13.4 Clips GLB reproducidos con AnimationMixer

`NyxClips` (`nyxModelLoader.ts:162-171`): `walk`, `run`, `floatIdle`, `float` (todos `| null`).

| Reproductor | GLB | Parámetros |
|---|---|---|
| `NyxWalkPlayer` | `nyx_walk_start/loop/end.glb` | `CLIP_GROUND_SPEED = 0.98`, `MIN_RATE = 1.0`, `MAX_RATE = 2.6`, `CADENCE_SCALE = 0.75`, `ENTER_BLEND = 0.18`, `SWITCH_BLEND = 0.14`, `END_RESUME_FRACTION = 0.5`, `CLIP_FPS = 30`, `START_TRIM_FRAME = 12`, `END_TRIM_FRAME = 33` |
| `NyxRunPlayer` | `nyx_run_start/loop/end.glb` | `CLIP_GROUND_SPEED = 7.4`, `MIN_RATE = 0.7`, `MAX_RATE = 1.3`, `CADENCE_SCALE = 1.0`, `ENTER_BLEND = 0.14`, `SWITCH_BLEND = 0.12`, `LOOP_ENTRY_SPEED = 6.6` |
| `NyxFloatPlayer` | `nyx_float_fwd`, `nyx_float_fwd_mir`, `nyx_float_fwd_mid`, `nyx_float_back` | `WEIGHT_RATE = 5`, `BLEND = 0.3`; mezcla 4 clips según `forward`/`lateral` en el marco del cuerpo |
| `NyxLoopPlayer` | `nyx_zero_g_float.glb` | `blend: 0.3` |

Selección por modo en `updateAnimState` (`NyxDomeController.ts:3805-3939`):
- `grounded`: marcha GLB si `!isSliding && hasMoveInput && 0.9 < speed <= 5.6`;
  carrera GLB si `!isSliding && hasMoveInput && speed > 5.6`; si no, procedural
  (`gravity_slide` si `isSliding`, `run` si `speed > 0.7 && hasMoveInput`, si no `idle`).
- `floating`: `clips.float` mientras haya input o `speed >= 2.0` (`FLOAT_IDLE_SPEED`);
  `clips.floatIdle` si está quieta; si los GLB faltan, `zero_g_float`.
- `dashing`: `air_dash`; `speed_attack`: `spiral_drill_kick` / `gravity_kick` / `gravity_fall`;
  `kinetic_bounce`: `kinetic_squat` (red de seguridad).

### 13.5 Motor de mezcla

- Persecución exponencial `1 - exp(-lambda * dt)` sobre la pose objetivo, hueso a hueso
  (`:426`). `setState(state, options)` (`:347-357`): `lambda = 4 / max(blendDuration, 0.01)`,
  `blendDuration` por defecto `0.2` → `lambda = 20`.
- `update(dt)` acota `dt` a `0.1`; `stateTime += dt`; `runPhase += dt * (7 + 6 * speed)`;
  si `stateTime > DURATION[st]` aplica `FALLBACK` y `lambda = min(lambda, 6)`.
- Wrap angular: `cur[HIPS].x` envuelto a (-π, π] salvo en `kick_flip`/`kick_flip_drill`
  (que lo gestionan en su `case`); `hips.y`/`hips.z` se envuelven hacia `tgt` para la barrena.
- `suspended` bloquea la escritura mientras manda un clip GLB; `adoptCurrentPose()` (`:303-340`)
  recupera el esqueleto leyendo la pose real.

### 13.6 Pelo, mangas y aro (física procedural sobre los clips)

| Sistema | Constantes | Línea |
|---|---|---|
| Pelo (hair_1..4, 2 ejes) | `HAIR_W = [0.28, 0.34, 0.40, 0.44]`, `HAIR_K = [140, 100, 75, 58]`, `HAIR_ZETA = [0.32, 0.28, 0.25, 0.22]`, `HAIR_C = 2*ζ*√K` | `nyxAnimator.ts:164-172` |
| Mangas (sleeve_L/R) | `SLEEVE_W = 0.55`, `SLEEVE_K = 85`, `SLEEVE_ZETA = 0.26` | `:175-178` |
| Escala de gravedad por estado | `HAIR_GRAVITY_SCALE`: `eden_absorb = -0.25`, `victory_float = 0.08`, `zero_g_float = 0.12`, `idle = 1`, `run = 0.7`, ... | `:157-161` |

El aro `halo_ring` gira sobre su eje con `t * (zeroG ? 0.9 : 0.45)` rad/s (`:531-542`).

---

## 14. Entrada y wiring (control de Nyx)

`domeGameLoop.ts` registra los listeners en `:939-947` y los retira en `:1470-1473`:
`click`, `contextmenu`, `pointerlockchange`, `mousemove`, `mousedown`, `mouseup`, `keydown`,
`keyup`, `resize`. Todos delegan en `controller.onMouseMove/onMouseDown/onMouseUp/onKeyDown/onKeyUp`.

`NyxDomeController`:
- `onMouseDown(button)` (`:952-961`): `0` → `wantAttack = true`, `attackHeld = true`;
  `2` → `wantDash = true`, `dashHeld = true`. Solo con `pointerLocked`.
- `onKeyDown(code)` (`:968-977`): acciones `jump` → `wantJump`, `slot1/2/3` → `wantSlot`,
  `radar` → `radarEnabled = !radarEnabled` (toggle). Ignora auto-repeat.
- Mando (`applyGamepadInput`, `:1011-1045`): stick derecho rota cámara con
  `GAMEPAD_LOOK_RATE * gamepadSensitivity * rawDt`; stick izquierdo se fusiona con WASD;
  botones con flanco (`justPressedAction`) y mantenido (`heldAction`).

Bindings por defecto (`src/game/settings.ts:134-149`): `KeyW/KeyS/KeyA/KeyD`,
`Space` (jump), `ShiftLeft` (sprint, alias `ShiftRight`), `KeyE`, `KeyF`, `KeyR`
(alias `KeyC`), `KeyQ` (alias `Tab`/`KeyV`), `Tab` (radar), `Digit1/2/3`.
Mando por defecto (`:158-167`): attack `7`/`5`, dash `4`/`6`, jump `0`, slots `2`/`3`/`1`, pause `9`.

Clic Izquierdo/Derecho sostenidos se usan para la regeneración de Edén (`handsOff`, `:3945-3949`)
y para `isPlayerStill()` (`:1136-1145`: `|v| < 1.25` sin botones).

---

## 15. Discrepancias entre comentarios y constantes (verificado)

Estos comentarios del código no coinciden con las constantes reales. Se documenta el valor
que ejecuta el juego.

| Comentario | Valor real en código |
|---|---|
| «taladro si la velocidad ya es >= 14.5 m/s» (`NyxDomeController.ts:2539`, también `:2858`) | `DRILL_SPEED_THRESHOLD = 18.0` (`:182`) |
| «la Caída al Vacío arranca a 17 m/s» (`:2552`) | `VOID_FALL_START_SPEED = 8.0` (`:185`) |
| «tope del tipo de ataque (18/26/25 m/s)» (`:2935`) | `GRAVITY_KICK_SPEED = 23.5`, `SPIRAL_DRILL_SPEED = 34.0`, `VOID_FALL_MAX_SPEED = 33.0` (`:183-186`) |
| «timeScale 0.20» en redirección (`:62`, `:760`, `:2891`) | `REDIRECT_TIME_SCALE = 0.25` (`:203`) |
| «Cámara Lenta real de 1.25 s (timeScale 0.22)» (`:79`, también `:1351`) | `BULLET_TIME_DURATION = 1.6` s (`:200`) |
| «Máx ±0.22 rad (~12.5°)» del Dutch roll (`:4077`) | `CAM_ROLL_MAX = 0.38` rad (`:261`); `0.22` es `CAM_ROLL_DASH_SIDE` |
| «marcha a 2,0 m/s rate 2,04» (`:88-89`) | `rate = (speed / 0.98) * 0.75`, acotado `[1.0, 2.6]` (`nyxWalkPlayer.ts:157`) → 2.0 m/s da `1.53` |
| «Esfera de Cristal de 50 m» (`nyxAnimsTraversal.ts:169`) | `DOME_ARENA_RADIUS = 90`, `DOME_PLAYER_BOUND_RADIUS = 88.6` (`domeTypes.ts:203-204`) |
| «rig de 27 huesos» (`nyxAnimsTraversal.ts:3`, `nyxAnimsSkills.ts:6`, `:29`) | `BONE_COUNT = 28` (`nyxAnimator.ts:107`) |
| `nyxKineticBounce.ts` no contiene `computeKineticImpact` | Vive en `DomeCombatSystem.ts:273`; el rebote cinético no hace daño por sí mismo |

---

## 16. Resumen numérico de referencia rápida

| Magnitud | Valor exacto |
|---|---|
| Radio de Nyx | `0.45` m |
| Velocidad de caminar | `2.0` m/s |
| Velocidad de correr (Shift) | `7.4` m/s |
| Velocidad de derrape en suelo | `10.0` m/s |
| Tope de flotación 0G | `28.0` m/s (× `speedMultiplier` × escala KRONOS) |
| Aceleración en flotación | `13.5` m/s² (× magnitud del stick) |
| Rozamiento en 0G | `exp(-0.06 * dt)` |
| Dash | `31.0` m/s × `speedMultiplier`, `0.36` s, `5.0` rad/s de giro, coste `3.0` Edén |
| Dash lateral (en ataque) | `30` m/s tras `velocity *= 0.35`, coste `3.0` Edén |
| Frenazo trasero | `14` m/s tras `velocity *= 0.18` |
| Patada gravitatoria | tope `23.5` m/s, accel `15` m/s², rampa `0.28` s |
| Taladro espiral | tope `34.0` m/s, umbral `18.0` m/s, fuerza × `1.55` |
| Caída al Vacío | inicio `max(speed, 8.0)`, tope `33.0` m/s, accel `42` m/s², rampa `0.35` s |
| Frenado `kick_recover` | `exp(-4.2 * dt)`, tope `0.9` s por flip |
| Sentadilla Cinética | umbral `12.0` m/s, alcance `42` m, squat `0.16` s, launch `0.12` s, `100 %` del impulso, coste `0` |
| Barrera Blanca | radio `88.6` m, `-10` HP, rebote con pérdida `×1.6`, cooldown `0.6` s |
| Slow-mo | `0.25` bullet-time/redirección, `0.10` parry, `1.0` dash de parry, `0.75` KRONOS |
| Hit-stop | `0.042` patada, `0.068` taladro, `0.05` sentadilla, `0.065` barrera |
| FOV | base `70` (`55..85`), `+22 * speed/32`, `+18` tirachinas, punch `-7/-11`, tope `100` |
| Distancia de cámara | `6.2` suelo, `6.1` vuelo, `4.8` hover, `8.4` caída, muelle `1.1..9.5` |
| Cúpula | radio de arena `90` m, límite jugador `88.6` m |
