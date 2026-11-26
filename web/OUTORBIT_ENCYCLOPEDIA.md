# OUTORBIT — Enciclopedia Técnica, Mecánica y de UI/UX Completa
> Documento recopilatorio exhaustivo extraído directamente del código fuente y assets de OUTORBIT, verificado doblemente sin extrapolaciones.

## Índice de Bloques
1. 1. Nyx: Movimiento, Físicas, Combate, Cámara, Slow-Mo y Animaciones ()
2. 2. Habilidades, Progresión, Pickups, Edén/HP y Modo Fácil ()
3. 3. Enemigos Básicos (5 Arquetipos) ()
4. 4. Élites, Boss Final KRONOS, IA Adaptativa, Oleadas y Entrenamiento ()
5. 5. Escenario del Domo, Suelos Flotantes, Shaders GLSL, Iluminación y VFX ()
6. 6. Audio Procedural, Música, Controles, UI/HUD, Ajustes, i18n y Leaderboard ()
7. 7. Arquitectura Técnica, Stack, Pipeline, Assets 3D/Audio y Tutoriales ()
8. 8. Estilo Visual, Paletas, Tipografía y Usabilidad (UI/UX) de Todas las Pantallas ()

---

## 1. Nyx: Movimiento, Físicas, Combate, Cámara, Slow-Mo y Animaciones

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

---

## 2. Habilidades, Progresión, Pickups, Edén/HP y Modo Fácil

# 02 — Habilidades de Nyx, progresión, niveles, pickups, Edén/HP y Modo Fácil

Documento de datos puros extraídos del código fuente de OUTORBIT (dome / cúpula).
Cada cifra está tomada del archivo indicado y verificada dos veces sobre el propio código.
No contiene propuestas de diseño.

## 0. Fuentes auditadas

| Archivo | Qué aporta |
| --- | --- |
| `src/game/dome/DomeSkills.ts` | Ejecutor 3D de las 7 habilidades activas (`DomeSkillExecutor`), daños, radios, duraciones, rocas, capturas, homing |
| `src/game/dome/DomeProgression.ts` | Catálogo de habilidades y pasivas, XP, slots, cartas de subida, modificadores |
| `src/game/dome/DomePickups.ts` | Orbes de EXP/Edén/Vida, magnetismo, vida útil |
| `src/game/dome/DomeRunStats.ts` | `DomeRunTracker`, fórmula de score, resumen y envío al leaderboard |
| `src/ui/DomeLevelUpSequence.tsx` | Secuencia de subida de nivel (planeta → cartas → iris) |
| `src/ui/DomeSkillSlotsHud.tsx` | HUD de las 3 ranuras de habilidad |
| `src/ui/DomeYinYangHud.tsx` | HUD Yin-Yang (Vida/Edén/EXP/nivel/oleada) |
| `src/game/settings.ts` | Flag `easyMode` y su saneado/persistencia |
| `src/ui/domeGameLoop.ts` | Aplicación real de `easyMode`, disparo de slots, coste de Edén, cooldown, cinemática de Implosión |
| `src/game/dome/NyxDomeController.ts` | HP/Edén reales, regeneración, drenajes, `syncProgression` |
| `src/game/dome/DomeCombatSystem.ts` | Conversión de "daño de habilidad" a impacto cinético y stats de enemigos |
| `src/game/dome/DomeWaveManager.ts` | `setDifficultyScaling`, captura/reflexión de proyectiles, escalado de oleadas |
| `src/i18n/es.json`, `src/i18n/index.ts` | Textos en español de habilidades, pasivas y `settings.easyMode` |

---

## 1. Las 7 habilidades activas — tabla maestra

Definidas en `ACTIVE_SKILLS_CATALOG` (`src/game/dome/DomeProgression.ts`). Orden canónico en `ACTIVE_SKILL_IDS`.

| # | ID (`ActiveSkillId`) | Nombre | Rareza | Coste Edén | Cooldown (s) | Nivel máx. | `accentColor` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `gravity_field` | Campo Gravitacional | `base` (BASE) | 8 | 5 | 5 | `#7ae8dc` |
| 2 | `repulse_push` | Empuje | `common` (COMÚN) | 12 | 7 | 5 | `#42bde8` |
| 3 | `eden_absorb` | Absorción de Edén | `common` (COMÚN) | 0 | 6 | 3 | `#7dffa8` |
| 4 | `attraction_well` | Pozo de Atracción | `common` (COMÚN) | 18 | 10 | 3 | `#42bde8` |
| 5 | `bounce_horizon` | Horizonte de Rebote | `epic` (ÉPICA) | 22 | 8 | 3 | `#df9fff` |
| 6 | `black_hole` | Agujero Negro | `epic` (ÉPICA) | 30 | 16 | 3 | `#df9fff` |
| 7 | `implosion` | Implosión | `legendary` (LEGENDARIA) | 45 | 25 | 1 | `#ffd992` |

Reparto por rareza declarado en el comentario del catálogo: **1 Base + 3 Comunes + 2 Épicas + 1 Legendaria**.

Hechos verificados sobre coste/cooldown (no hay progresión de estos valores):

- El coste de Edén **no** baja con el nivel: `def.edenCost` se cobra siempre igual (`domeGameLoop.ts`, `controller.spendEden(def.edenCost)`).
- El cooldown **no** baja con el nivel: al disparar se asigna `slot.cooldownRemaining = def.cooldown` (valor base del catálogo) y `slot.maxCooldown = ACTIVE_SKILLS_CATALOG[id].cooldown` al equipar/mejorar (`DomeProgression.applyChoice`).
- Un disparo solo ocurre si `slot.cooldownRemaining === 0` y `controller.getEden() >= def.edenCost`.
- Los niveles solo escalan **efecto** (daño, radio, cantidad, curación), nunca coste ni recarga.

Textos en español mostrados en la UI (`src/i18n/es.json` → `skills` / `skillDescriptions`), mapeados por `SKILL_I18N_KEYS` en `src/i18n/index.ts`:

| ID | `skills.*` | Clave i18n |
| --- | --- | --- |
| `gravity_field` | Campo Gravitacional | `gravityField` |
| `repulse_push` | Empuje | `push` |
| `eden_absorb` | Absorción de Edén | `edenAbsorption` |
| `attraction_well` | Pozo de Atracción | `attractionWell` |
| `bounce_horizon` | Horizonte de Rebote | `bounceHorizon` |
| `black_hole` | Agujero Negro | `blackHole` |
| `implosion` | Implosión | `implosion` |

---

## 2. Ficha por habilidad

### 2.1 `gravity_field` — Campo Gravitacional (BASE, Edén 8, CD 5 s, máx. Nv 5)

Ejecutor: `DomeSkillExecutor.triggerGravityField()` / `fireOneGravityRock()` / `updateGravityField()`.

**Plan de rocas por nivel** (`plan: GravityRockSize[]`):

| Nivel | Composición | Total objetos |
| --- | --- | --- |
| Nv 1 | `['small','small']` (fijo) | 2 |
| Nv 2 | aleatorio 1 de 3: `['small','small','small']` \| `['medium','medium']` \| `['medium','small','small']` | 2–3 |
| Nv 3, 4, 5 | aleatorio 1 de 3: `['large']` \| `['medium','medium','medium']` \| `['small','small','small','small']` | 1 / 3 / 4 |

El nivel no cambia la tabla a partir de Nv 3: Nv 3, 4 y 5 usan exactamente el mismo conjunto de planes.

**Stats por tamaño de roca** (`rockStats()` — `GravityRockSize = 'small' | 'medium' | 'large'`):

| Tamaño | `scale` visual | `damage` (amount) | `hitRadius` (m) |
| --- | --- | --- | --- |
| `small` | 0.95 | 15 | 0.85 |
| `medium` | 1.7 | 32 | 1.25 |
| `large` | 2.85 | 58 | 1.85 |

**Órbita y anclaje:**

- Ancla del campo: `anchor = playerPos + forwardDir * 2.3`; se recalcula cada frame con la posición y la mira actuales (`updateGravityField`).
- Distancia orbital: `2.1` para `large`; `1.55 + random*0.55` para el resto.
- `angularSpeed = 2.1 + random*0.7` rad/s; `height = (random - 0.5) * 0.9`.
- Anillo de suelo del área al castear: radio `4 + level`, duración 0.6 s (`spawnAreaGroundRing`).

**Disparo** (`fireOneGravityRock`): vuelve a pulsar el slot con rocas activas **cancela** el campo (`cancelGravityField`, sin coste ni cooldown nuevo); el clic izquierdo (`onLeftClickAttackOverride`) lanza **1 roca** al enemigo lockeado/candidato, o hacia la mira si no hay objetivo.

| Parámetro del proyectil | Valor |
| --- | --- |
| Velocidad | `34 + level * 6` → Nv1 **40**, Nv2 **46**, Nv3 **52**, Nv4 **58**, Nv5 **64** m/s |
| Vida | 3.2 s |
| Daño | el de la roca (`15` / `32` / `58`) |
| `hitRadius` | el de la roca (`0.85` / `1.25` / `1.85`) |
| Homing | `homingStrength = 10.5` si hay objetivo; `0` sin objetivo |
| Pierce | `false` (muere al impactar) |

El cooldown del Campo Gravitacional **empieza al disparar la última roca** (`domeGameLoop.ts`: si tras el disparo `!hasActiveGravityRocks()` → `gSlot.cooldownRemaining = 5`). Al cancelar con el slot no se aplica cooldown.

**Escombros sueltos (Gólem Rompesuelos) absorbibles** — `spawnSlabDebris()` / `updateLooseDebris()`:

- `MAX_LOOSE_DEBRIS = 12` (si se supera, se descarta el más antiguo).
- Tamaños generados: `i % 3 === 0 ? 'medium' : 'small'`.
- `DEBRIS_ABSORB_RADIUS = 9` m (radio de succión del campo activo).
- `DEBRIS_ABSORB_DISTANCE = 0.7` m (dentro de esa distancia el escombro pasa a fragmento orbitante).
- `DEBRIS_DRIFT_DAMPING = 0.8` (fricción del vuelo a la deriva).
- Succión: `velocity += dir * (12 + (9 - dist) * 2.2) * dt`.
- El reparto es: primero bolas capturadas, luego escombros cercanos, y solo si quedan huecos se generan rocas nuevas.

**Bolas de Doble Filo — captura de bolas de tinta ácida del Pulpo Espiral:**

- Radio de captura alrededor de Nyx: `captureRadius = NYX_HITBOX_RADIUS_M (0.85) + INK_BALL_CAPTURE_RADIUS_BY_LEVEL[level - 1]`.
- `INK_BALL_CAPTURE_RADIUS_BY_LEVEL = [2.0, 2.5, 3.0, 4.0, 5.0]` (Nv 1..5) ⇒ radio total **2.85 / 3.35 / 3.85 / 4.85 / 5.85 m**.
- Se capturan **en vez de** rocas y ocupan los primeros huecos del plan (`capturedBalls.slice(0, plan.length)`).
- Cambian de material a `capturedInkBallMaterial` (nebulosa cósmica de Nyx).
- Daño: `CAPTURED_INK_BALL_DAMAGE = 90`; `CAPTURED_INK_BALL_HIT_RADIUS = 0.85`.
- Al dispararlas: **sin auto-aim** (`directAim`, `homingStrength = 0`), salen hacia `playerPos + forwardDir * 45`, con la misma velocidad `34 + level * 6`.
- El comentario del código documenta la intención "x3 una roca pequeña al impactar" (roca pequeña 15 → fuerza 12; bola 90 → fuerza 36).
- La captura la ejecuta `DomeWaveManager.captureInkBallsInRadius(center, radius)` sobre proyectiles `kind === 'ink_ball'`; al liberarse la malla, `recycleInkBallMesh()` la devuelve al pool.
- Las rocas y ondas en vuelo pueden ser destruidas por el Gorrión Gigante vía `destroyProjectilesInSphere(center, radius)` (Aleteo Salvaje, Garrido, Taladro); si el proyectil destruido era una bola capturada, se devuelve al pool con `onCapturedInkBallFreed`.

**Bolas Eléctricas de la Mariposa Relámpago capturadas:**

- Mismo `captureRadius` que las bolas de tinta; entran solo en los huecos que queden libres (`electricSlotsLeft = plan.length - fragments.length`).
- Material híbrido `capturedElectricBallMaterial` (nebulosa + arcos voltaicos).
- En órbita: `damage 140`, `hitRadius 1.1`.
- Al dispararlas: velocidad **52**, vida **5.0 s**, daño **140**, `hitRadius 1.15`, `isButterflyMagnet = true`.
- Imán 100 %: se re-apunta cada frame al enemigo cuyo id contiene `lightning_butterfly` y recalcula velocidad `magnetSpeed = min(220, 48 + 380 / max(1.2, dist))`, forzando `remainingLife >= 0.5`. Este proyectil es el único que `clearProjectileHoming()` no puede romper (`if (p.isButterflyMagnet) continue`).
- Impacta con `bypassFlesh = true` (`onDamageEnemy(..., p.isButterflyMagnet === true)`), es decir, ignora la carne y va directo a la estrella.

**Conversión de "amount" a daño real** (`DomeCombatSystem.computeKineticImpact`, usada por `handleSkillDamageEnemy` en `domeGameLoop.ts`):

- `impactSpeed = max(12, amount * 0.4)`; `kineticForce = impactSpeed * speedForceMultiplier` (la pasiva de velocidad multiplica la fuerza).
- Si `bypassFlesh` o `kineticForce >= fleshThickness`: daño a estrella `max(kineticForce * 2.2, maxHp * 0.34)` (el suelo del 34 % no aplica a élites con `impactSpeed < 16` salvo taladro).
- Si no: desgaste `kineticForce * 0.18` de `fleshThickness` y daño `kineticForce * 0.9`.
- Constantes: `STAR_DAMAGE_PER_FORCE = 2.2`, `FLESH_DAMAGE_PER_FORCE = 0.9`, `FLESH_WEAR_PER_FORCE = 0.18`, `STAR_DAMAGE_MIN_FRACTION = 0.34`, `KNOCKBACK_PER_FORCE = 0.35`, `DRILL_FORCE_MULTIPLIER = 1.55`.

### 2.2 `repulse_push` — Empuje (COMÚN, Edén 12, CD 7 s, máx. Nv 5)

| Nivel | Radio (m) `9 + 3L` | Fuerza `16 + 7L` | Daño `4 + 3L` |
| --- | --- | --- | --- |
| Nv 1 | 12 | 23 | 7 |
| Nv 2 | 15 | 30 | 10 |
| Nv 3 | 18 | 37 | 13 |
| Nv 4 | 21 | 44 | 16 |
| Nv 5 | 24 | 51 | 19 |

Mecánica:

- Impulso radial por enemigo dentro del radio: `dir * force`, más componente tangencial `cross(dir, UP) * force * 0.35` (giro 0G) y `y += force * 0.25`.
- Suelo flotante: si Nyx **no** está apoyada, cada slab a `<= radius + 2` recibe `force * 0.12` y se recorta a `DOME_KEEP_RADIUS = 86`.
- VFX: onda esférica de radio `radius + 2.5` (0.55 s), cúpula de área al radio exacto (0.55 s) y anillo de suelo al radio exacto.
- Animación: `counter_parry`.
- **Reflexión de Bolas Eléctricas** (`onReflectEnemyProjectiles` → `DomeWaveManager.reflectElectricBallsInRadius`): toda bola `kind === 'electric_ball'` dentro del radio cambia a `kind = 'electric_ball_reflected'` y pasa a: **daño 38**, vida **3.5 s**, `decel = 0`, `autoAimRate = 4.5`, velocidad **46**, escala **1.2**, material `reflectedElectricMaterial`, objetivo = enemigo vivo más cercano (buscando hasta 75) o, si no hay, dirección `projectilePos - playerPos`.
- Un enemigo empujado contra la Barrera Blanca muere al instante (`checkDomeBarrierKill`: cualquier enemigo no élite y no boss a `<= DOME_PLAYER_BOUND_RADIUS`).

### 2.3 `eden_absorb` — Absorción de Edén (COMÚN, Edén 0, CD 6 s, máx. Nv 3)

| Nivel | Vida recuperada `5 + 4L` | Edén recuperado `8 + 5L` |
| --- | --- | --- |
| Nv 1 | 9 | 13 |
| Nv 2 | 13 | 18 |
| Nv 3 | 17 | 23 |

- Requisito: `ctx.isStill` (`NyxDomeController.isPlayerStill()`: modo `grounded` o `floating`, velocidad < 1.25 y sin ataque/dash pulsado). Si no está quieta, `triggered: false` → no hay coste ni cooldown.
- Coste 0 de Edén: la habilidad solo está limitada por el cooldown de 6 s.
- Se aplica vía `ctx.onHealPlayer(hp, eden)` → `controller.restoreResources(hp, eden)` (recorta a `maxHp`/`maxEden`).
- VFX: halo ascendente (`spawnHalo`, duración 1.2 s, sube `1.2 m/s`, rota y escala a `1 + t*0.6`, opacidad `0.85 * (1 - t)`). Animación: `eden_absorb`.
- Si el `edenDelta` de un restore es `> 0.5`, el HUD lanza un `edenFlash` de 0.6.

### 2.4 `attraction_well` — Pozo de Atracción (COMÚN, Edén 18, CD 10 s, máx. Nv 3)

| Nivel | Rango de búsqueda `40 + 12L` (m) | Daño choque 2 enemigos `15 + 7L` (a cada uno) | Daño aplastamiento por slab `18 + 8L` |
| --- | --- | --- | --- |
| Nv 1 | 52 | 22 | 26 |
| Nv 2 | 64 | 29 | 34 |
| Nv 3 | 76 | 36 | 42 |

Modo `enemy_pair` (2+ enemigos en rango):

- Duración `ATTRACTION_DURATION = 1.8 s`.
- Aceleración de atracción `pullAccel = 70 + level * 20` → 90 / 110 / 130.
- Arrastre directo `directSpeed = 14 + level * 4` → 18 / 22 / 26 `m/s`.
- Colisión cuando `dist <= radiusA + radiusB + 0.8`: daño a **ambos** y onda de impacto de radio 3.5 (0.35 s).
- VFX: cúpula y anillo al punto medio con radio `6 + level` (7 / 8 / 9), duración 1.8 s.

Modo `slab_crush` (1 enemigo en rango):

- Se eligen los **2 slabs más cercanos** al enemigo; si no hay 2, la habilidad **no** se activa (`triggered: false`).
- Velocidad de cada slab: `max(16 + level * 4, dist / 0.9)` → base 20 / 24 / 28 `m/s`; los slabs se recortan a `DOME_KEEP_RADIUS = 86`.
- El enemigo queda retenido: `pullEnemy(target, puntoMedio, 32 + level * 8, dt, 6)` (aceleración 40 / 48 / 56, arrastre directo 6).
- Contacto de aplastamiento: `dist <= radius + CRUSH_CONTACT_DISTANCE (2.4)`, **una vez por slab** (`crushedA`/`crushedB`), con onda de impacto de 2.5 (0.3 s). Daño máximo del casteo: 2 × `18 + 8L`.
- VFX: cúpula y anillo sobre el enemigo con radio `5 + level` (6 / 7 / 8).

Selección de objetivos: el enemigo lockeado si está en rango; si no, `findAutoAimTarget()`; si tampoco, el más cercano. El segundo objetivo es el enemigo más cercano al principal.

### 2.5 `bounce_horizon` — Horizonte de Rebote (ÉPICA, Edén 22, CD 8 s, máx. Nv 3)

| Nivel | Ondas `max(1, level)` | Daño por onda `7 + 3L` | `homingStrength` |
| --- | --- | --- | --- |
| Nv 1 | 1 | 10 | 0 (sin auto-aim) |
| Nv 2 | 2 | 13 | 4.5 |
| Nv 3 | 3 | 16 | 6.5 |

- Velocidad fija **42** m/s; vida **2.2 s**; `hitRadius` **1.35**; `pierce = true` (atraviesa y solo golpea 1 vez por enemigo vía `hitIds`); `orientToVelocity = true`.
- Ráfaga secuencial: la primera onda sale con `rollRad = (count === 1 ? 0 : -0.42)`; las siguientes, cada `0.14 s`, usan `SLASH_ROLLS = [-0.42, 0.42, 0]` indexado por `slashIndex % 3` empezando en `slashIndex = 1`. La inclinación se aplica con `mesh.rotateZ(rollRad)` sin alterar la orientación hacia el objetivo.
- Auto-aim (Nv 2+): objetivo = enemigo lockeado o `findAutoAimTarget()`. Ese buscador filtra enemigos a `<= 75 m`, puntúa el cono frontal con `score = dot * 2.2 - dist / 75` cuando `dot > 0.25`, y si no hay cono usa el más cercano dentro de 35 m. Si el objetivo muere, se re-apunta en caliente (`updateSlashBursts` → `findAutoAimTarget`).
- Alineación inicial: si el objetivo está en el hemisferio frontal (`dot > 0.25`), el corte se orienta hacia él antes de salir.
- Geometría: media luna (`createCrescentSlashGeometry`, `halfWidth 1.45`, `frontCurve 1.05`, `backCurve 0.42`, espesor máx. 0.05), material `#df9fff` aditivo.
- Animación: `air_dash`.
- Alcance práctico: `42 m/s × 2.2 s ≈ 92 m` de recorrido.
- **Sinergia documentada en `DomeRunStats`**: cuenta como "redirección perfecta" (`perfectRedirections`, peso 150) junto al `kick_flip` cancelado a tiempo.

### 2.6 `black_hole` — Agujero Negro (ÉPICA, Edén 30, CD 16 s, máx. Nv 3)

| Nivel | Radio del horizonte `8 + 2.5L` (m) | Daño por tick `5 + 2L` |
| --- | --- | --- |
| Nv 1 | 10.5 | 7 |
| Nv 2 | 13 | 9 |
| Nv 3 | 15.5 | 11 |

- Constantes: `BLACK_HOLE_DURATION = 4.5`, `BLACK_HOLE_SPEED = 7`, `BLACK_HOLE_TICK = 0.5`.
- Se lanza en `playerPos + forwardDir * 1.5` y avanza en línea recta a 7 m/s durante 4.5 s (≈ 31.5 m de deriva).
- Daño por tick cada 0.5 s a todo enemigo dentro del radio: hasta **9 ticks** ⇒ máximo teórico 63 / 81 / 99 si el enemigo permanece dentro.
- Succión: `pull = (26 + level * 9) * (1 - dist / radius) + 6` aplicado como aceleración a la velocidad del enemigo.
- Knockback de cada tick: `dir * 6`.
- Al expirar: onda de radio `radius * 0.8` (0.45 s).
- Cúpula de área **anclada al grupo** (acompaña la deriva) con radio `8 + level * 2.5` y duración 4.5 s; anillo de suelo del mismo radio.
- Núcleo `#05030f` (esfera 1.05) + toro de acreción `#df9fff` (`TorusGeometry(2.1, 0.2, 8, 42)`, inclinación base `PI/2.4` con bamboleo `sin(elapsed*3)*0.18` y giro `z += dt*2.4`); el horizonte pulsa `1 + sin(elapsed*5)*0.08`.
- Animación: `stasis_throw`. Expone `hasActiveBlackHole()` para el zumbido del motor de audio.

### 2.7 `implosion` — Implosión (LEGENDARIA, Edén 45, CD 25 s, máx. Nv 1, sin niveles)

- `IMPLOSION_RANGE = Infinity` (sin límite de distancia para elegir objetivo).
- Selección: lockeado → `findAutoAimTarget` → `nearestEnemy(..., Infinity)`.
- `IMPLOSION_DAMAGE = 9999` con `bypassFlesh = true` **solo** en la ruta de reserva (cuando `ctx.onStartImplosion` no existe). En partida real el game loop **siempre** aporta `onStartImplosion`, así que esa rama no se ejecuta.
- Ruta real (cinemática, `implosionCinematic` en `domeGameLoop.ts`), con `mode` y `duration`:

| `mode` | Condición | Duración | Resolución |
| --- | --- | --- | --- |
| `one_hit` | enemigo normal | 1.15 s (`crushAt = 0.88`) | escala a 0.0001 y `killWaveEnemy()` → muerte instantánea |
| `miniboss_repel` | élite con `hp / maxHp >= 0.5` | 1.25 s (`repelAt = 0.65`) | daño `maxHp * 0.2`, dejando **mínimo 1 HP**; rebote visual |
| `kronos_crystal` | KRONOS | 1.2 s (`breakAt = 0.68`) | `waveMgr.tryBreakKronosStarFromSkill()` → rompe 1 Estrella Dorsal |

- Restricciones de KRONOS: una sola Implosión por Leviatán (`kronosImplosionUsedOnId`) y **prohibida en fase 4** (`waveMgr.isKronosPhase4Active()`).
- Durante la cinemática: pausa de gameplay (`isPaused = menuPaused || implosionCinematic !== null`), zoom orbital con `targetDist = max(4.6, radius * 2.45)`, órbita `0.55 * t`, `FOV = savedFov - 11 * sin(...)`, roll `0.055 * sin(t*PI)`, sacudidas de cámara en el instante de resolución, y restauración exacta de cámara/FOV al terminar.
- VFX `spawnImplosion`: esfera que se comprime de escala 3.5 a 0.2 en 0.6 s + onda dorada de radio 4 (0.35 s). Cúpula y anillo de radio 4 con 0.7 s (ruta cinemática) o 0.5 s (reserva).
- Animación: `eden_absorb`.
- Estado `isActive` en el HUD: `implosionCinematic !== null || skillExecutor.isSkillActive('implosion')`.

### 2.8 Auto-aim / homing — resumen de implementación

| Mecánica | Dónde | Datos |
| --- | --- | --- |
| `findAutoAimTarget()` | `DomeSkills.ts` | descarta `< 0.01 m` y `> 75 m`; cono `dot > 0.25`; `score = dot*2.2 - dist/75`; fallback más cercano `<= 35 m` |
| Homing de proyectiles | `updateProjectiles()` | `velocity += dir * speed * homingStrength * dt`, normalizada y reescalada a la misma velocidad (giro sin pérdida) |
| Homing de Horizonte (Nv2+) | `spawnBounceSlash` + `updateSlashBursts` | `4.5` (Nv2) / `6.5` (Nv3); re-apunta si el objetivo muere |
| Imán eléctrico | `updateProjectiles()` (`isButterflyMagnet`) | `min(220, 48 + 380 / max(1.2, dist))`; ignora `clearProjectileHoming` |
| Rotura de homing | `clearProjectileHoming(targetId, center, radius)` | el Gorrión Gigante lo usa al esquivar o hacer Dispersión; **no** afecta a `isButterflyMagnet` |
| Destrucción de proyectiles | `destroyProjectilesInSphere(center, radius)` | elimina proyectiles/rocas (Aleteo Salvaje, Garrido, Taladro del Gorrión) |

---

## 3. Sistema de Edén y Vida (Nyx)

### 3.1 Valores base

| Magnitud | Valor | Origen |
| --- | --- | --- |
| `hp` inicial | 100 | `NyxDomeController`: `private hp = 100` |
| `maxHp` inicial | 100 | `NyxDomeController`: `private maxHp = 100` |
| `eden` inicial | 100 | `NyxDomeController`: `private eden = 100` |
| `maxEden` inicial | 100 | `NyxDomeController`: `private maxEden = 100` |
| `DomeProgressionManager.maxHp` / `.hp` | 100 / 100 | `DomeProgression.ts` |
| `DomeProgressionManager.maxEden` / `.eden` | 100 / 100 | `DomeProgression.ts` |
| Escalado por nivel | `maxHp *= 1.05`, `maxEden *= 1.05` y **curación completa** (`hp = maxHp`, `eden = maxEden`) | `DomeProgression.addExp` |
| Modo Fácil | `maxHp * 2`, `maxEden * 2` | `domeGameLoop.ts`: `easyMult = easyMode ? 2 : 1` |

`syncProgression()` sube HP/Edén actuales para igualar el nuevo máximo cuando este crece (`hp += maxHpNuevo - maxHpViejo`, recortado al tope): por eso el primer frame en Modo Fácil arranca ya con 200/200.

### 3.2 Consumo de Edén

| Concepto | Coste | Constante / origen |
| --- | --- | --- |
| Movimiento de flotación (WASD/stick con `eden > 0.01`) | 1.0 /s | `EDEN_MOVE_DRAIN = 1.0` |
| Dash | 3.0 por dash | `EDEN_DASH_COST = 3.0` |
| Ataque de velocidad en curso | 2.0 /s | `EDEN_ATTACK_DRAIN = 2.0` |
| Habilidad activa | `edenCost` del catálogo (8/12/0/18/22/30/45) | `ACTIVE_SKILLS_CATALOG[...].edenCost` |
| Lanzar roca de Campo Gravitacional | 0 (ya pagado al castear) | `fireOneGravityRock` |

`spendEden(amount)` devuelve `false` y no gasta si `eden < amount`; el disparo de slot comprueba antes `controller.getEden() >= def.edenCost`.

### 3.3 Regeneración

- **Edén**, base: `EDEN_IDLE_REGEN_FRAC = 0.01` ⇒ **1 % de `maxEden` por segundo**. Solo se aplica si el modo es `grounded`, o `floating` con las manos quietas (sin WASD, sin clic de ataque, sin dash — teclado o mando).
- **Edén**, pasiva `eden_regen`: sustituye la base por 2 % / 3 % / 5 % por segundo (misma condición de "quieta").
- **Vida**, base: `hpRegenFrac = 0` ⇒ **no hay regeneración pasiva** sin la pasiva `hp_regen`.
- **Vida**, pasiva `hp_regen`: 1 % / 1.5 % / 2 % de `maxHp` por segundo, constante (`hp > 0 && hp < maxHp`).
- Recuperación instantánea: orbes de Edén/Vida (`restoreResources`) y Absorción de Edén.
- Daño de barrera: `DOME_BOUNCE_DAMAGE = 10` HP al rebotar contra el límite de la cúpula (con reflejo de velocidad); `DomeCombatSystem` documenta además `NYX_BARRIER_DAMAGE = 10`, `NYX_BARRIER_INVULN_SEC = 0.8`, `NYX_BARRIER_STAGGER_SEC = 0.5`.
- Tinta ácida del Pulpo: `INK_DOT_PER_SEC = 4.0` HP/s durante la mancha (`INK_STAIN_SEC = 3.0` base).

---

## 4. Modo Fácil (`easyMode`)

Declarado en `src/game/settings.ts`:

```ts
/** Modo fácil: duplica Vida/Edén máximos (x2) y desactiva la escalada de dificultad. */
easyMode: boolean;
```

- Valor por defecto: `easyMode: false` (`DEFAULT_SETTINGS`).
- Saneado: `typeof source.easyMode === 'boolean' ? source.easyMode : DEFAULT_SETTINGS.easyMode`.
- Persistencia: clave `outorbit.settings.v1` (`STORAGE_KEY` en `settings.ts`) y entrada `easyMode` dentro de `OTHER_SETTING_KEYS` / tipo `OtherSettingKey`, serializada en `STORAGE_KEYS.otherSettings` (`localStorageState.ts`).
- UI: `SettingsScreen.tsx` → `ToggleRow` dentro de `settings.sectionVisual`, con la etiqueta `t('settings.easyMode')`.
- Traducciones exactas: ES "Modo fácil (Vida y Edén x2, sin escalada)"; EN "Easy mode (2x HP & Eden, no wave scaling)"; JA "イージーモード（HP・エデン2倍、難易度上昇なし）".

Efectos reales en el bucle (`src/ui/domeGameLoop.ts`), exactamente dos:

1. `const easyMult = easyMode ? 2 : 1` → `syncPayload.maxHp = progression.maxHp * easyMult` y `syncPayload.maxEden = progression.maxEden * easyMult` (Vida y Edén máximos ×2, con relleno inmediato vía `syncProgression`).
2. `waveMgr.setDifficultyScaling(!easyMode)` (también en la inicialización del bucle, línea ~241).

Qué desactiva `setDifficultyScaling(false)` en `getWavePlan(waveNumber, difficultyScaling)` (`DomeWaveManager.ts`):

| Factor | Con escalado | Modo Fácil |
| --- | --- | --- |
| `speedMult` (velocidad/agresividad enemiga) | `1 + cycle * 0.2` | `1.0` fijo |
| `minibossesPassed` (enemigos extra en oleadas básicas) | `cycle * 2 + (...)` | `0` |
| `bossesPassed` (enemigos extra en oleadas de miniboss) | `cycle` | `0` |

`setDifficultyScaling` recalcula `speedMult` de la oleada en curso si `currentWave > 0`. No toca el HP de los enemigos, ni el daño recibido, ni los costes de habilidad, ni la curva de XP: el multiplicador ×2 es solo sobre los **máximos** del jugador.

---

## 5. Progresión y subida de nivel (`DomeProgression.ts`)

### 5.1 Curva de XP

- Estado inicial: `level = 1`, `exp = 0`, `expToNext = 1.0`.
- `addExp(amount)`: suma y encadena niveles; por cada nivel: `exp -= expToNext`, `level += 1`, `maxHp *= 1.05`, `maxEden *= 1.05`, `hp = maxHp`, `eden = maxEden`, `expToNext = 0.5 * level`.
- Regla documentada en el encabezado del archivo: "Nv N → N+1 requiere 0.5 × N enemigos" (1.0 = un enemigo básico).
- Devuelve la lista de niveles alcanzados en orden (permite encadenar 1 → 2 → 2 → 3 en la misma secuencia de UI).

| Transición | XP necesaria (`expToNext`) | XP acumulada desde Nv 1 |
| --- | --- | --- |
| Nv 1 → 2 | 1.0 | 1.0 |
| Nv 2 → 3 | 1.0 | 2.0 |
| Nv 3 → 4 | 1.5 | 3.5 |
| Nv 4 → 5 | 2.0 | 5.5 |
| Nv 5 → 6 | 2.5 | 8.0 |
| Nv 6 → 7 | 3.0 | 11.0 |
| Nv 7 → 8 | 3.5 | 14.5 |
| Nv 8 → 9 | 4.0 | 18.5 |
| Nv 9 → 10 | 4.5 | 23.0 |

### 5.2 Ranuras y pasivas

- Exactamente **3 ranuras** (`slots: [SkillSlotState, SkillSlotState, SkillSlotState]`), cada una `{ skillId, level, cooldownRemaining, maxCooldown }`. El cuarto o posterior hueco no existe.
- Exactamente **3 pasivas** (`PASSIVE_IDS = ['speed_force', 'eden_regen', 'hp_regen']`), cada una con `maxLevel: 3`.

| Pasiva | Nombre | Etiquetas por nivel | `value` |
| --- | --- | --- | --- |
| `speed_force` | Velocidad (+Fuerza física) | +20 % / +50 % / +75 % | 0.2 / 0.5 / 0.75 |
| `eden_regen` | Regeneración de Edén | 2 % /s / 3 % /s / 5 % /s | 0.02 / 0.03 / 0.05 |
| `hp_regen` | Regeneración de Vida | 1 % /s / 1.5 % /s / 2 % /s | 0.01 / 0.015 / 0.02 |

Colores: `speed_force` `#ffd992`, `eden_regen` `#df9fff`, `hp_regen` `#7dffa8`. Las cartas de pasiva siempre se emiten con `rarity: 'common'`.

### 5.3 Generación de cartas (`generateLevelUpChoices(forLevel)`)

| Nivel | Cartas generadas |
| --- | --- |
| Nv 1 | **Carta 1 fija**: Campo Gravitacional (BASE) como `active_new` + **Carta 2**: una habilidad aleatoria distinta de `gravity_field` |
| Impares (3, 5, 7…) | 2 cartas distintas del pool activo: mejoras `+1` de habilidades equipadas que no estén al máximo (Implosión queda excluida por `maxLevel 1`) y habilidades nuevas/no poseídas (sirven como reemplazo). Si el pool activo tiene < 2, se combina con el pool de pasivas |
| Pares (2, 4, 6…) | **Todas** las pasivas que no estén al Nv 3 (1–3 cartas, no siempre 2). Si las 3 están al Nv 3, fallback a mejoras/activas |
| Degenerado (todo al máximo) | Se duplica la carta de pasiva `eden_regen` con id `passive:eden_regen:...:dup` |

Contenido de cada carta (`LevelUpCardOption`): `id` (`active_new:<id>` / `active_upgrade:<id>:<nv>` / `passive:<id>:<nv>`), `kind`, `skillId`/`passiveId`, `title`, `subtitle`, `rarity`, `currentLevel`, `nextLevel`, `description`, `accentColor` y `edenCost` (solo activas).

Subtipos generados por el manager (ES): `'BASE · Nueva habilidad'`, `'COMÚN · Nueva habilidad'`, `'Mejora Nv X → Nv Y'`, `'Pasiva · Nv X → Nv Y (etiqueta)'`, `'Pasiva · Ya dominada (Nv 3)'`.

### 5.4 Aplicación de la elección (`applyChoice`)

- `kind === 'passive'`: fija `passives[id] = min(maxLevel, nextLevel)` e invalida el cache de modificadores.
- `kind === 'active_upgrade'`: busca la ranura con ese `skillId`, sube `level = nextLevel` y refresca `maxCooldown` al cooldown base.
- `kind === 'active_new'`: usa `targetSlotIndex` si se indica; si no, la **primera ranura libre**; si no hay ninguna, la ranura `0`. Escribe `{ skillId, level: nextLevel, cooldownRemaining: 0, maxCooldown: def.cooldown }`.
- Limpia `pendingInitialPick` en la primera elección.

### 5.5 Requisito de reemplazo y encadenado (game loop / vista)

- `requiresSlotReplacement = progression.slots.every(s => s.skillId !== null)`: con las 3 ranuras llenas, una carta `active_new` obliga a elegir ranura a reemplazar antes de cerrar.
- `openLevelUpModal(levels, skipPlanetAnimation)`: abre con `newLevel = levels[0]` y `pendingLevels = levels.slice(1)`.
- Al elegir, `handleSelectCard` aplica la carta y, si quedan `pendingLevels`, regenera cartas para el siguiente nivel con `skipPlanetAnimation: true`; al agotarse, cierra y devuelve el pointer lock al canvas.
- Elección inicial de la partida: si `progression.pendingInitialPick`, se abre en el nivel 1 con `skipPlanetAnimation = true` (sin animación de planeta).
- En Modo Entrenamiento: `progression.pendingInitialPick = false` (sin elección inicial) y el panel de entrenamiento permite equipar (`equipSkill`, nivel 1), vaciar (`clearSlot`), subir (`upgradeSlot`, recortado a `maxLevel`), fijar pasivas (`setPassiveLevel`) y rellenar recursos (`refillResources`).
- Encadenado de EXP al subir: si al subir hay EXP sin contabilizar en 30 m, se marca por adelantado (`pickups.peekExpInRadius` / `markExpCountedInRadius`) para que la UI abra 1 → 2 → 2 → 3 aunque los orbes sigan volando.

### 5.6 Modificadores derivados (`DomeModifiers`)

Objeto único recomputado solo cuando `modifiersDirty` (nivel nuevo o cambio de pasiva):

| Campo | Fórmula | Valor Nv 1 sin pasivas |
| --- | --- | --- |
| `speedMultiplier` | `1 + bonus speed_force` | 1 |
| `forceMultiplier` | `1 + bonus speed_force` (misma bonificación: "más velocidad = más fuerza/penetración") | 1 |
| `edenRegenPctPerSec` | nivel de `eden_regen` (0.02/0.03/0.05) o `BASE_EDEN_REGEN_PCT_PER_SEC = 0.01` | 0.01 |
| `hpRegenPctPerSec` | nivel de `hp_regen` (0.01/0.015/0.02) o `0` | 0 |
| `magnetRadius` | `4 + level * 2.5` | 6.5 |
| `magnetSpeed` | `10 + level * 7` | 17 |

---

## 6. Pickups (`DomePickups.ts`)

### 6.1 Tipos y colores

| `DomePickupKind` | Color (`KIND_COLORS`) | Uso |
| --- | --- | --- |
| `exp` | `0x8cff3a` (verde lima) | Experiencia |
| `eden` | `0xc77dff` (lavanda) | Reserva de Edén |
| `hp` | `0x5cff8a` (verde vida) | Vida |

Geometría del orbe: `SphereGeometry(PICKUP_RADIUS = 0.2, 10, 8)` con `MeshBasicMaterial` opaco (sin blending, para que el color no se lave) + halo `Sprite` aditivo (`GLOW_SCALE = 0.62`, opacidad 0.45) generado proceduralmente en canvas de 64×64.

### 6.2 Cantidades al morir un enemigo (`spawnFromEnemy`)

- Llamado con `pickups.spawnFromEnemy(enemy.position, enemy.entity.expValue, 6)`: **`edenValue = 6` por kill** (constante en el call site del game loop, tanto en `killWaveEnemy` como en `onInternalKill`).
- Orbes de EXP: `expOrbCount = clamp(round(expValue * 4), 3, 8)`; cada orbe lleva `expValue / expOrbCount`.
- Orbes de Edén: **4** orbes de `edenValue / 4` = **1.5 Edén cada uno** (6 en total).
- Orbes de Vida: con probabilidad `0.35` se añaden **2** orbes de valor fijo **5** (5 HP cada uno → 10 HP).
- `expValue` por arquetipo (`DOME_ENEMY_ARCHETYPES` en `DomeCombatSystem.ts`):

| Arquetipo | `expValue` | Orbes de EXP (`clamp(round(v*4),3,8)`) | HP | `fleshThickness` |
| --- | --- | --- | --- | --- |
| `abyssal_cell` | 1.0 | 4 | 40 | 15 |
| `spiral_octopus` | 1.5 | 6 | 70 | 55 |
| `crab_gunner` | 1.25 | 5 | 60 | 35 |
| `ground_golem` | 2.0 | 8 | 140 | 80 |
| `lightning_butterfly` | 1.5 | 6 | 31 | 8 |
| `giant_sparrow` (élite) | 3.0 | 8 (12 → tope 8) | 520 | 85 |
| `prisma_necroz` (élite) | 3.0 | 8 (12 → tope 8) | 300 | 65 |
| `kronos_leviathan` (boss) | 10.0 | 8 (40 → tope 8) | 4 (4 Estrellas Dorsales) | 90 |

### 6.3 Física, atracción y vida útil

| Constante | Valor | Efecto |
| --- | --- | --- |
| `MAX_PICKUPS` | 160 | tamaño del pool; si está lleno se recicla el orbe con menos `life` (el más antiguo) |
| `COLLECT_DISTANCE` | 1.5 m | radio de recogida (recalculado tras mover el orbe, por el hueco de un frame a 60 m/s) |
| `BASE_LIFETIME` | 30 s | vida de cada orbe |
| `FADE_TIME` | 4 s | últimos 4 s se desvanece (`fade = min(1, life / 4)`) |
| `MAGNET_LERP` | 3.2 | suavizado `velocity.lerp(magnetVelocity, 1 - exp(-3.2*dt))` |
| `DRIFT_DAMPING` | 0.8 | fricción fuera del radio magnético |
| `HOMING_DELAY` | 0.35 s | a partir de ese tiempo persigue a Nyx **desde cualquier distancia** |
| `HOMING_CATCHUP` | 6 | velocidad extra por unidad de distancia |
| `HOMING_MAX_SPEED` | 60 m/s | tope de velocidad |

Velocidad magnética exacta: `min(60, magnetSpeed * (0.6 + 0.9 * proximity) + dist * 6)` con `proximity = 1 - min(1, dist / magnetRadius)`; `magnetRadius`/`magnetSpeed` vienen de `DomeModifiers` (escalan con el nivel).

Spawn: posición del enemigo ± 1.1 m por eje (`(random - 0.5) * 2.2`), velocidad inicial `(±3, ±2.5 + 1.5, ±3)`, `phase` aleatoria.

Animación: `phase += dt * 3.0`; `y += sin(phase) * 0.25 * dt`; `rotation.x += dt*2.2`, `rotation.y += dt*3.1`; escala `pulse * (0.35 + 0.65 * fade)` con `pulse = 1 + sin(phase*1.7) * 0.18`.

Contabilización adelantada (`counted`): los orbes pueden marcarse como contados y seguir volando hasta Nyx; al llegar disparan el VFX pero **no** suman EXP otra vez.

Al recoger: `pickups.onCollect` → `vfx.spawnAbsorbFlare(position, kind)` (llamarada espiral de absorción en el torso de Nyx). Los orbes se entregan al controlador con `controller.restoreResources(hpGained, edenGained)`; la EXP va a `progression.addExp(expGained)`.

Búsqueda de EXP cercana: `peekExpInRadius(playerPos, 30)` (no consume) y `markExpCountedInRadius(playerPos, 30)` (consume y marca).

---

## 7. Estadísticas de partida (`DomeRunStats.ts`)

### 7.1 `DomeRunTracker` — contadores

`wave` (inicial 1), `kills`, `elitesKilled`, `bossesKilled`, `barrierKills`, `maxSpeedReached`, `maxLevelReached` (inicial 1), `survivalTimeSec`, `damageDealt`, `perfectRedirections`.

Métodos: `recordWave` (se queda con el máximo), `recordKill({isElite,isBoss})` (suma 1 a `kills` y además 1 a `bossesKilled` si `isBoss`, o a `elitesKilled` si `isElite`), `recordBarrierKill()` (suma 1 a `kills` **y** 1 a `barrierKills`), `recordSpeed`, `recordDamage` (ignora negativos), `recordRedirection`, `recordLevel`, `tick(dt)`, `reset()`.

### 7.2 Pesos y fórmula de score (`DOME_SCORE_WEIGHTS`)

| Concepto | Peso |
| --- | --- |
| `wave` (oleada) | 500 |
| `kill` | 100 |
| `elite` | 750 |
| `boss` | 2500 |
| `barrierKill` (empujar a la Barrera Blanca) | 125 |
| `redirection` (kick_flip cancelado a tiempo / Horizonte de Rebote) | 150 |
| `speed` (por punto de velocidad máxima) | 10 |
| `survival` (por segundo sobrevivido) | 5 |
| `damage` (por punto de daño infligido) | 0.1 |
| `level` (por nivel alcanzado) | 250 |

```
score = wave*500 + kills*100 + elites*750 + bosses*2500 + barrierKills*125
      + perfectRedirections*150 + floor(maxSpeedReached)*10
      + floor(survivalTimeSec)*5 + damageDealt*0.1 + maxLevelReached*250
score = max(0, round(score))
```

### 7.3 `DomeRunSummary` (congelado por `getSummary(equippedSkills, passives)`)

`score`, `wave`, `kills`, `elitesKilled`, `bossesKilled`, `barrierKills`, `maxSpeedReached`, `maxLevelReached`, `survivalTimeSec`, `damageDealt`, `perfectRedirections`, `equippedSkills: Array<{id, level}>` (copia), `passives: Record<string, number>` (copia).

### 7.4 Envío al leaderboard (`submitDomeRunToLeaderboard`)

`AERIAL_SPEED_REFERENCE = 80`; `clampPercent` redondea y limita 0..100.

| Campo `LeaderboardEntryRecord` | Origen |
| --- | --- |
| `player_name` | parámetro |
| `clear_time_sec` | `round(survivalTimeSec)` |
| `score` | `round(score)` |
| `dominant_style` | ver tabla siguiente |
| `stealth_pct` | 0 |
| `aggression_pct` | `100 * (1 - barrierKills / kills)`, 0 si no hay kills |
| `aerial_pct` | `100 * maxSpeedReached / 80` |
| `subterranean_pct` | 0 |
| `stasis_pct` | 0 |
| `alarms_triggered` | `wave` |

`dominant_style` por prioridad: `boss_slayer` si `bossesKilled > 0`; `barrier_trickster` si `barrierKills * 3 >= kills && kills > 0`; `redirector` si `perfectRedirections * 2 >= kills && kills > 0`; en cualquier otro caso `kinetic_duelist`.

---

## 8. UI de subida de nivel (`DomeLevelUpSequence.tsx`)

Secuencia a pantalla completa en 3 fases:

1. **`planet`** — canvas Three.js transparente sobre la partida viva: punto blanco con pulso (`PHASE1_END = 0.3`) → zoom-in continuo del planeta anillado hasta cubrir el viewport (`PHASE2_END = 1.55`) y blanquear al papel `#f1f1ed`. Rig: `ROLL_ANGLE = -27°`, `PITCH_ANGLE = 25°`, `PLANET_RADIUS = 1.0`, `RING_INNER = 1.42`, `RING_OUTER = 3.25`, `RING_THICKNESS = 0.11`, 48 partículas orbitales doradas. FOV responsivo: 68 (< 0.72 de aspecto), 60 (< 1.0), 54.
2. **`cards`** — papel con título `¡SUBIDA DE NIVEL!` y número de nivel, slams con `playCardSlam()` + shake (a 340 ms y a `480 + i*130 + 430` ms por carta).
3. **`closing`** — iris de papel que colapsa en un punto que parpadea; la selección se aplica a los **1180 ms**.

Anatomía de cada carta (`.lu-card`): `--accent` con `option.accentColor`, número fantasma `[i+1]`, etiqueta de rareza `t('levelUp.rarity.<rarity>')` (BASE / COMÚN / ÉPICA / LEGENDARIA), icono `SkillIcon`, nombre traducido (`skills.*` si hay `skillId`/`passiveId`), línea `Nv. X → Nv. Y`, coste `COSTE: N EDÉN` si `edenCost != null`, descripción traducida (`skillDescriptions.*`, con sufijo de nivel en pasivas) y tecla `[i]`.

Interacción:

- Teclado: `[1..N]` elige carta; con carta en vuelo `[1..3]` elige ranura; `ESC` vuelve atrás. También `Enter`/`Espacio` sobre la carta enfocada.
- Mando (`useGamepadListNav`): D-Pad/stick izquierdo-derecho mueve, **Cruz (A)** confirma, **Círculo (B)** vuelve en el panel de reemplazo.
- Panel de reemplazo (`showReplace`): banner "¿POR CUÁL LA CAMBIAS?", botón "[ESC] VOLVER" y 3 botones `R1`/`R2`/`R3` con nombre y nivel de cada ranura.
- Si `requiresSlotReplacement && option.kind === 'active_new'`, la carta vuela al centro (`flyToCenter`) y se abre el panel; si no, se sella directamente (`finish`).
- `hasNextLevel` omite el iris y encadena la siguiente subida con `onSelect` a los 520 ms.
- `skipPlanetAnimation` arranca directamente en la fase `cards` (elección inicial y encadenados).
- Limpieza por nivel: al cambiar `newLevel` se resetean `lockedRef`, `flyingRef`, `returningRef`, `showReplace` y los focos de mando.

---

## 9. HUD de ranuras (`DomeSkillSlotsHud.tsx`)

- Tres ranuras circulares apiladas bajo el Yin-Yang, cada una con `width/height: clamp(68px, 5.8vw, 86px)`, `opacity: 0.3` si está vacía.
- Bisel: 12 muescas radiales (`BEZEL_TICKS`, mayores cada 3), retícula heptagonal interior (`HEPTAGON_POINTS`, radio 34) y fondo abisal (`#1b1138 → #090418 → #040408`).
- Aro de cooldown: `RING_RADIUS = 46`, `strokeWidth 6.5`, gradiente `#00e5ff → #818cf8 → #e879f9`; en curso se dibuja como arco horario con `strokeDashoffset = circunferencia * (1 - progress)` y `progress = 1 - cooldownRemaining / maxCooldown` (activo si `cooldownRemaining > 0.05` y `maxCooldown > 0`).
- Habilidad activa en escena (`slot.isActive`): aro y etiqueta en `#00e5ff` con `drop-shadow`.
- Icono: `/icons/skills/<skillId>.webp` al 46 % del contenedor, `invert(1)`; opacidad 0.42 en cooldown.
- Etiqueta de tecla biselada a 45° con `slot.keyLabel` (por defecto `1`/`2`/`3`; mando: Cuadrado = ranura 1, Triángulo = ranura 2, Círculo = ranura 3 según `DEFAULT_GAMEPAD_BINDINGS`).
- Pips de nivel: un rombo de 5×5 px por nivel (`Array.from({length: slot.level})`), centrados bajo el círculo.

---

## 10. HUD Yin-Yang (`DomeYinYangHud.tsx`)

Lienzo lógico `420 × 200`, centrado en `(100, 100)`, `R_OUTER = 76.5`, `R_INNER = 65.5`, `TICK_COUNT = 96`. Acento `ACCENT = '#3be8ff'`.

- **Vida** (mitad derecha del símbolo) y **Edén** (mitad izquierda) se rellenan de abajo arriba con un menisco ondulado; si el Edén baja, el símbolo se oscurece (`mix(0.5, 1.0, smoothstep(0, 0.7, eden))`).
- Bandas de color de Vida (`vidaShader`): `green` con transición a `orange` en `1 - smoothstep(0.55, 0.65, hp)` y a `red` en `1 - smoothstep(0.35, 0.45, hp)` — verde por encima de ~65 %, naranja ~55–65 %, rojo por debajo de ~35 %.
- Puntos críticos y halos: `hp <= 0.25` y `eden <= 0.25` activan blink/halo; el latido de audio de vida se acelera por debajo de **0.12**.
- Alerta sonora de Edén crítico: `playLowEdenPulse()` cada 1.15 s mientras `eden <= 0.25`.
- Onda de choque al subir de nivel (`levelPulse`), arrancada al detectar `level > lastLevel` junto con `playLevelUp()`.
- Anillo de EXP: 96 marcas radiales (mayores cada 12) y cuña horaria desde las 12 (`expWedgePath`), con `expPct = exp / expToNext * 100`.
- Barra superior: `NV. <nivel>` (relleno blanco) y `OLEADA <n>` (o "ENTRENAMIENTO" cuando no hay oleada); color de la oleada: blanco normal, `#ffc857` MINIBOSS, `#ff4d6d` BOSS.
- `alertsEnabled` se pone a `false` con pausa, level-up o battle report abiertos (los one-shots de nivel/oleada suenan igualmente).

---

## 11. Notas de verificación

- `IMPLOSION_DAMAGE = 9999` solo se usa si no hay `onStartImplosion`; el game loop siempre lo aporta, por lo que el daño real es la cinemática (kill instantáneo, −20 % de vida máxima a élites, o rotura de 1 Estrella Dorsal a KRONOS).
- `GRAVITY_FIELD_RELEASE_RANGE = 60` está declarada en `DomeSkills.ts` y **no se referencia** en ninguna otra parte del código (aparece una única vez).
- `releaseGravityField(targetPos?)` existe como helper legacy y no se llama desde el bucle de juego.
- Ni el coste de Edén ni el cooldown de ninguna habilidad escalan con el nivel; solo escalan daño/radio/cantidad/curación.
- Los niveles pares pueden ofrecer **más o menos de 2 cartas** (todas las pasivas disponibles), a diferencia de los impares y del nivel 1, que ofrecen exactamente 2.
- El ×2 del Modo Fácil se aplica sobre `progression.maxHp` / `progression.maxEden` en el payload del HUD, no sobre el escalado interno de `DomeProgression` (que sigue siendo ×1.05 por nivel).

---

## 3. Enemigos Básicos (5 Arquetipos)

# 03 — Enemigos básicos (Cúpula): datos verificados del código

Alcance: `abyssal_cell`, `crab_gunner`, `ground_golem`, `spiral_octopus`, `lightning_butterfly`.
Todo lo que sigue está extraído del código fuente real de `src/game/dome/` y confirmado dos veces
(lectura completa del fichero + `grep` de cada constante). Los nombres y duraciones de clips se
verificaron además leyendo el JSON interno de los `.glb` de `public/models/enemies/`.

Ficheros fuente:

| Dato | Fichero |
|---|---|
| Stats por arquetipo, reglas de impacto, tinta, barrera | `src/game/dome/DomeCombatSystem.ts` |
| Célula Abisal (FSM + enjambre) | `src/game/dome/domeCellBehavior.ts` |
| Cangrejo Artillero (suelos + 3 ataques) | `src/game/dome/domeCrabBehavior.ts` |
| Gólem Rompesuelos (FSM §7.4) | `src/game/dome/domeGolemBehavior.ts` |
| Mariposa Relámpago | `src/game/dome/domeButterflyBehavior.ts` |
| Pulpo Espiral, proyectiles, contra-parry, poses, clips | `src/game/dome/DomeWaveManager.ts` |
| Shaders, materiales, rigs, precarga GLB | `src/game/dome/DomeEnemyModels.ts` |

---

## 0. Sistemas compartidos por los 5

### 0.1 Stats base exactos

`DOME_ENEMY_ARCHETYPES` (`DomeCombatSystem.ts:156-166`):

| Arquetipo | `maxHp` | `radius` | `fleshThickness` | `expValue` | `weakPoints` | `evasive` | `isElite` | `isBoss` |
|---|---|---|---|---|---|---|---|---|
| `abyssal_cell` | 40 | 1.6 | 15 | 1.0 | 1 | `false` | `false` | `false` |
| `spiral_octopus` | 70 | 2.2 | 55 | 1.5 | 1 | `false` | `false` | `false` |
| `crab_gunner` | 60 | 1.8 | 35 | 1.25 | 1 | `false` | `false` | `false` |
| `ground_golem` | 140 | 3.2 | 80 | 2.0 | 1 | `false` | `false` | `false` |
| `lightning_butterfly` | 31 | 1.2 | 8 | 1.5 | 1 | `false` | `false` | `false` |

- Todos tienen `hasInnerStar = true` (estrella 3D de 6 puntas interior alcanzable).
- `EVASIVE_ARCHETYPES` (`DomeWaveManager.ts:222`) es un `Set` **vacío**: ninguno de los 5 usa el dash
  evasivo genérico (28 m/s · 0.38 s · lift 5.5 · cooldown 3.0 s). Cada uno gobierna su propia evasión.
- `evasive` se fuerza desde el set en `spawnEnemy` (`DomeWaveManager.ts:1609`), por eso es `false` en los 5.

### 0.2 Anatomía carne / estrella (reglas cinéticas)

`DomeCombatSystem.computeKineticImpact` (`DomeCombatSystem.ts:284-378`) con estas constantes
(`:99-110`):

| Constante | Valor |
|---|---|
| `DRILL_FORCE_MULTIPLIER` | 1.55 |
| `FLESH_WEAR_PER_FORCE` | 0.18 |
| `FLESH_DAMAGE_PER_FORCE` | 0.9 |
| `STAR_DAMAGE_PER_FORCE` | 2.2 |
| `STAR_DAMAGE_MIN_FRACTION` | 0.34 |
| `KNOCKBACK_PER_FORCE` | 0.35 |
| `KNOCKBACK_PENETRATED_SCALE` | 0.35 |
| `HITSTOP_BASE` / `HITSTOP_PENETRATE` / `HITSTOP_KILL` | 0.045 / 0.09 / 0.12 s |

- `kineticForce = impactSpeed * speedForceMultiplier * (isDrill ? 1.55 : 1)`.
- Si `bypassFlesh` **o** `kineticForce >= fleshThickness` **o** ventana vulnerable: penetra la estrella,
  resta 1 punto débil y hace `max(kineticForce * 2.2, maxHp * 0.34)` de daño. En básicos el suelo del
  34 % sí aplica (la excepción de élites no les afecta).
- Si no penetra: desgasta carne `min(fleshThickness, kineticForce * 0.18)` y daña `kineticForce * 0.9`.
- Knockback = `kineticForce * 0.35`, reducido a ×0.35 si penetró. Sin penetrar, Nyx rebota (`recoilBounce`).
- Umbral práctico de penetración por fuerza cinética (sin taladro ni habilidades):
  Célula 15 · Mariposa 8 · Cangrejo 35 · Pulpo 55 · Gólem 80.

### 0.3 Barrera Blanca

- `DOME_PLAYER_BOUND_RADIUS = 88.6` (`src/game/dome/domeTypes.ts:204`).
- `checkDomeBarrierKill` (`DomeCombatSystem.ts:383-393`): cualquier enemigo no-élite y no-boss muere
  al instante cuando `position.length() + radius >= 88.6`. Aplica a los 5.

### 0.4 Escalado de oleada

`getWavePlan` (`DomeWaveManager.ts:424`): `speedMult = 1 + floor((oleada - 1) / 15) * 0.2` con
`difficultyScaling` activo; si no, `1.0`. `CYCLE_LENGTH = 15`.
Las oleadas básicas spawnean `4 + minibossesPassed` enemigos `basic_mix`
(`:453`), y el `basic_mix` rota en este orden por índice (`BASIC_ARCHETYPES`, `:223-229`):
`abyssal_cell`, `crab_gunner`, `spiral_octopus`, `lightning_butterfly`, `ground_golem`.

Posición de spawn (`:1596-1605`): `angle = (index / (enemies.length + 6)) * 2π + rng * 1.2`,
`dist = 26 + rng * 30` (26–56 m), altura `y = 6 + rng * 30` (6–36 m).
`attackTimer` inicial: cangrejo `1.0 + rng * 2.5`; el resto `1.2 + rng * 1.8`.

### 0.5 Feedback visual común de daño

`HIT_KNOCKBACK = 14.0`, `HIT_KNOCKBACK_DRILL = 26.0`, `HIT_FLASH_DECAY = 3.2`,
`HIT_FLASH_SCALE = 0.35`, `HIT_FLASH_EMISSIVE = 0.85` (`DomeWaveManager.ts:212-215`).
`kineticMult = max(0.6, (impactSpeed / 14)^1.35)`; el flash del material es `hitFlash * 0.85`.
Escala de la malla: `1 + flash * 0.35` (más `crabSwell` del cangrejo) con wobble
`sin(elapsed*27 + phase) * 0.026`, `cos(*31) * 0.026`, `sin(*24 + phase*1.7) * 0.026`.

### 0.6 Materiales y shaders (los 5)

`DomeEnemyModels.ts`:

- **Carne nebulosa** `createEnemyNebulaMaterial(archetype, rimColor)` (`:322-368`): `ShaderMaterial`
  con FBM en espacio de pantalla (`uv = gl_FragCoord.xy * 0.0048`), dos capas de estrellas
  (`starLayer` a escala 14.0 y 24.0), Fresnel `pow(1 - dot(N,V), 2.2)`, `alpha` entre
  `uOpacity * 0.45` (centro) y `min(0.92, uOpacity * 1.15)` (borde). `depthWrite: true`,
  `transparent: true`. Uniforms: `uColorA`, `uColorB`, `uRimColor`, `uTime`, `uOpacity`,
  `uEmissiveBoost`. `uOpacity = 0.62` para `abyssal_cell`, `0.76` para el resto.
  Vibración de energía en vértice: `energyWobble(pos, t) = sin(pos.x*9 + t*22) * cos(pos.y*7 - t*19)`
  aplicada como `objectNormal * wobble * 0.045`.
- **Paletas de carne por arquetipo** (`:326-336`): célula → `FLESH_SLIME_STOPS`
  (`0x7f1d1d`, `0x9a3412`, `0x854d0e`) + `FLESH_SLIME_NEBULA` (`0xb91c1c`, `0xd97706`, `0xca8a04`);
  pulpo → `0x2e1065`-`0x581c87` y `0x6b21a8`-`0x9333ea`; resto → `0x7f152e`-`0x3b0d63` y
  `0xa12045`-`0x5b21b6`. Todos con `Math.random()` por instancia.
- **Rim por arquetipo** en `instantiateEnemyVisual` (`:756-762`): `abyssal_cell 0xf59e0b`,
  `spiral_octopus 0xc084fc`, `lightning_butterfly 0x38bdf8`, resto (`crab`, `golem`) `0xff2a9d`.
- **Estrella dorada** (`mat_star_core`): `STAR_CORE_COLOR 0xffcc33`, `STAR_CORE_RIM 0xfff3b0`,
  `STAR_CORE_EMISSIVE 1.45`, contorno `0.035 * enemyInkScale` con tinta `0xffe58f`.
- **Contorno de tinta de la carne**: `FLESH_OUTLINE_THICKNESS = 0.05`, tinta blanca `0xffffff`,
  `uNoiseAmp 0.35`, `INK_DISTANCE_SCALE = 2.6`, `renderOrder 2`, back-side hull vibrante
  (misma `energyWobble`). `createButterflyQuartzMaterial` y el resto de detalles usan
  `DETAIL_OUTLINE_THICKNESS = 0.04`.
- **Piezas secundarias** (`detail_*`): cel `DETAIL_COLOR 0x241d38`, `DETAIL_RIM 0x6b5f8a`,
  `rimStrength 0.4`.
- Grosor de tinta por oleada: `enemyInkScaleForWave(w) = 1 + 0.25 * floor((max(1,w) - 1) / 10)`
  (`:171`). `GLB_CACHE_VERSION = 10` (`:552`).
- Paleta de referencia por arquetipo `ENEMY_MODEL_COLORS` (`:35-44`): célula `0x6b143b`/`0xff2a9d`,
  pulpo `0x4b1369`/`0x2563eb`, cangrejo `0x7c192d`/`0xff2a9d`, gólem `0x3b0f54`/`0x1e40af`,
  mariposa `0x164e63`/`0x38bdf8`.
- Formas provisionales (si el `.glb` no está cargado), `buildArchetypeVisuals` (`:489-556`):
  célula `IcosahedronGeometry(1.5, 1)` `0x7ae8dc`/`0xbafff2` estrella `0xfff6c8` escala `0.45`;
  pulpo `TorusKnotGeometry(1.5, 0.42, 64, 8)` `0xff5f9e`/`0xffb3d4` `0.5`;
  cangrejo `BoxGeometry(2.6, 1.2, 1.9)` `0xff8c42`/`0xffd0a3` `0.4`;
  gólem `DodecahedronGeometry(2.9)` `0x9c8f7a`/`0xd8c9a8` `0.42`;
  mariposa `TetrahedronGeometry(1.3)` `0xfff45f`/`0xffffffa8` `0.5`.
- Clasificación de clips (`:800-812`): se marcan `LoopRepeat` los nombres que casan con
  `/loop|idle|float|observe|ready|duplicate|spiral|guard|fresh|lazy|build|summon|chase_fly|air_drill|fast_flap|lightning_beam/`;
  el resto son `LoopOnce` con `clampWhenFinished = true`.
- Clip de reposo inicial (`:814-823`), en orden de preferencia: `kronos_swim_idle`,
  `necroz_idle_fresh`, `sparrow_chase_fly`, `butterfly_fast_flap`, `cell_idle_float`,
  `crab_idle_breathe`, `golem_helicopter_loop`, `octopus_idle_observe`.

---

## 1. `abyssal_cell` — Célula Abisal

Fuente: `domeCellBehavior.ts` (todas las constantes en `:36-155`) +
`DomeWaveManager.updateCellPose` (`:4176-4238`) + `DomeWaveManager.spawnCellChild` (`:2040-2056`).

### 1.1 Stats

`maxHp 40`, `radius 1.6`, `fleshThickness 15`, `expValue 1.0`, `weakPoints 1`, `evasive false`,
sin élite ni boss. Es la que menos fuerza necesita para penetrar (15).

### 1.2 Comportamiento espacial y enjambre

| Constante | Valor | Efecto |
|---|---|---|
| `CELL_SNEAK_SPEED` | 14.0 m/s | reptado/acecho |
| `CELL_FLEE_SPEED` | 26.0 m/s | huida en pánico |
| `CELL_LUNGE_SPEED` | 30.0 m/s | salto |
| `CELL_LUNGE_MAX_DIST` | 6.0 m | alcance de compromiso del salto |
| `CELL_WINDUP_SEC` | 0.45 s | telegraph (se echa atrás a `CELL_WINDUP_BACKSTEP 8.0` m/s) |
| `CELL_RECOVER_SEC` | 0.8 s | aterrizaje expuesta |
| `CELL_RING_START` / `CELL_RING_MIN` | 7.0 / 5.0 m | anillo de acecho que se cierra |
| `CELL_RING_TIGHTEN` | 0.2 m/s | cierre si Nyx no la ve (7→5 en ~10 s) |
| `CELL_RING_TIGHTEN_STILL` | 0.6 m/s | cierre acelerado si Nyx está quieta |
| `CELL_SEEK_RING` | 11.0 m | anillo de aproximación inicial |
| `CELL_SEEK_TO_STALK_DIST` | 14.0 m | umbral seek→stalk |
| `CELL_SEEN_DOT` | 0.45 | semiancho del cono de visión (dot con `aimForward`) |
| `CELL_SEEN_MAX_DIST` | 42.0 m | distancia máxima de visión efectiva |
| `CELL_FLEE_TRIGGER_DIST` | 6.5 m | susto a bocajarro (huye) |
| `CELL_FLEE_SAFE_DIST` | 16.0 m | deja de huir |
| `CELL_SCATTER_BASE_RAD` | 1.13 rad (~65°) | desvío base de la dispersión |
| `CELL_SCATTER_STEP_RAD` | 0.96 rad (+55° por par de slots) | abanico divergente |
| `CELL_SCATTER_MAX_SEC` | 2.5 s | duración máxima de la dispersión |
| `CELL_SCATTER_UNSEEN_SEC` | 0.35 s | fuera de vista que la corta |
| `CELL_LUNGE_DAMAGE` | 8 HP | daño del lunge al contacto |
| `CELL_PLAYER_CONTACT` | 1.6 m | radio de contacto sumado a `radius` |
| `CELL_LUNGE_TOKEN_CD` | 2.5 s | token del enjambre (`2.5 / speedMult`) |
| `CELL_STILL_SPEED` | `FLOAT_MAX_SPEED / 3` ≈ 9.333 m/s | umbral de "quietud" |
| `CELL_STILL_SEC` | 0.6 s | quietud que la abre |
| `CELL_LEAD_MAX` | 0.5 s | lead de predicción del lunge |
| `CELL_COVER_MIN_RADIUS` | 3.0 m | radio mínimo de enemigo que sirve de cobertura |
| `CELL_SEPARATION_DIST` / `_STRENGTH` | 2.4 m / 8.0 | separación entre células |
| `CELL_ARENA_KEEP_RADIUS` / `_PULL` | 70.0 m / 9.0 | contención suave XZ |
| `CELL_ARENA_HARD_R` | 80.0 m | tope duro 3D (nunca roza la barrera) |
| `CELL_COVER_MAX_ARENA_R` | 66.0 m | escondites válidos |
| `CELL_ORBIT_DRIFT` | 0.16 rad/s | deriva del ángulo de órbita |
| `CELL_ORBIT_SPREAD` | 0.9 rad | separación angular entre slots |
| `CELL_REAR_SMOOTH_RATE` | 1.5 /s | inercia de la retaguardia suavizada |
| `CELL_ORBIT_ARRIVE_DIST` | 4.0 m | frenado de llegada al slot |
| `CELL_HIDE_MIN_PLAYER_DIST` | 10.0 m | escondite mínimo respecto a Nyx |
| `CELL_COVER_MARGIN` | 2.0 m | margen tras el slab/enemigo |

`FLOAT_MAX_SPEED = 28.0` (`NyxDomeController.ts:161`).

`CellSwarmDirector` (`:170-290`):
- `focus` de Nyx refrescado por frame (posición, velocidad, aim, dashing, `attackTime`, `lockedId`, `lockedPos`).
- `stillFor` acumula si `playerVel.lengthSq() < (28/3)²`; `isPlayerStill()` a partir de 0.6 s.
- `lungeTokenCd`: un salto por ventana de 2.5 s entre células distintas.
- Retaguardia suavizada: ángulo XZ de `-aimForward` con `1 - exp(-1.5 * dt)` por el camino angular más corto.
- Slots de órbita: `cellSlot` = índice dentro del enjambre; `cellOrbitSign` alterna por índice.
- `isPlayerDistracted(cellId)`: verdadero si Nyx está quieta, o dashando, o lockeada atacando
  (`attackTime > 0.1`) o con `lockedPos.distanceTo(position) < 12.0` sobre **otro** enemigo.

Oclusión real (`isCellOccluded`, `:311-368`): raycast contra slabs (`raycastSlabs`) **o** intersección
del segmento Nyx→célula con la esfera de cualquier enemigo de `radius >= 3.0` (gólem, élites, Kronos).

### 1.3 FSM (`CellState`)

`'seek' | 'stalk' | 'windup' | 'lunge' | 'recover' | 'flee' | 'scatter' | 'duplicate'`.

1. **Modo Entrenamiento** (`isEnemiesPassive()`): `velocity *= exp(-3.5*dt)`, estado `stalk`, sin IA.
2. **`seek` / `stalk`** (núcleo):
   - Si `seen && distToPlayer < 6.5` → `flee`.
   - Si `seen` → `scatter`, con dirección divergente
     `sign = slot % 2 === 0 ? 1 : -1`,
     `spreadRad = sign * (1.13 + floor(slot / 2) * 0.96)`, `cellTimer = 2.5`.
   - Si puede duplicar (ver 1.4) → `duplicate`, `cellTimer = 5.0`.
   - Solitaria sin combate ajeno (`cellCount <= 1 && !playerEngaged`) → busca cobertura (`findCoverPoint`).
   - Si no, anillo: en `seek` fija `cellRing = 11.0` y pasa a `stalk` al bajar de 14.0 m; en `stalk`
     cierra el anillo a 0.2 m/s (0.6 m/s si Nyx está quieta) **solo** si está ocluida o a la espalda
     (`facingDot < -0.1`), con mínimo 5.0 m.
   - Slot de órbita: `slotAngle = behindAngleSmooth + (slot - (count-1)/2) * 0.9 + elapsed * 0.16 * sign`;
     objetivo `cos/sin(slotAngle) * cellRing + playerPos`.
   - Dirección a `14.0 * speedMult` con arrive lineal en los últimos 4.0 m; + separación entre células;
     + bob `sin(elapsed * 2.2 + phase) * 0.35` en Y; `velocity.lerp(steer, 1 - exp(-3.2*dt))`;
     `keepInsideArena` (tirón a 9 m/s si `> 70 m`, tope duro 80 m sin velocidad radial saliente).
   - Disparo del ataque: `state === 'stalk' && distToPlayer <= 6.0 && lungeTokenCd <= 0 && isPlayerDistracted`.
     Consume `lungeTokenCd = 2.5 / speedMult`, calcula
     `lead = min(0.5, distToPlayer / (30 * speedMult))`, apunta a `playerPos + focus.velocity * lead`,
     aplica el retroceso de 8 m/s y pasa a `windup`.
3. **`windup`** (0.45 s): `hitFlash` forzado a ≥0.55, `velocity *= exp(-8*dt)`. La dirección
   **queda fijada aquí** (sin corrección en vuelo); al acabar fija `cellLungeLeft = 6.0` → `lunge`.
4. **`lunge`**: `velocity = cellLungeDir * 30 * speedMult`; consume `cellLungeLeft`.
   Si `distanceTo(player) < radius + 1.6` → `onPlayerHit(8)` + `recover(0.8 s)` + `velocity *= -0.35`.
   Si se acaba el recorrido → `recover` con `velocity *= 0.2`.
5. **`recover`** (0.8 s): `velocity *= exp(-6*dt)`; al acabar `cellRing = 7.0` y vuelve a `stalk`.
6. **`flee`**: dirección `normalize(pos - player)` sesgada a cobertura (`biasTowardCover`: lerp 0.55
   hacia el punto tras un enemigo de radio ≥3 a <25 m, lerp 0.35 hacia el slab más cercano a <20 m);
   `velocity.lerp(steer(26 * speedMult), 1 - exp(-4.5*dt))`; sale a `stalk` si
   `(occluded && hiddenFor > 0.4) || distToPlayer > 16.0`.
7. **`scatter`**: `steer = cellScatterDir * 26 * speedMult`, misma inercia; termina si
   `cellUnseenFor >= 0.35` o `cellTimer <= 0` → `stalk`.
8. **`duplicate`** (5.0 s): canal quieta con pulso `hitFlash = max(hitFlash, 0.3 + 0.3*sin(elapsed*18))`,
   `velocity *= exp(-6*dt)`. Se interrumpe si `hitFlash > 0.85` (daño real) o
   `(!occluded && distToPlayer < 8.0)` → `flee`. Al completar: hija en
   `perpendicular al vector Nyx→madre * radius * 1.7` (rotado 90° sobre +Y).

### 1.4 Duplicación (datos exactos)

| Constante | Valor |
|---|---|
| `CELL_DUP_CHANNEL` | 5.0 s de canal |
| `CELL_DUP_HIDDEN_SEC` | 2.0 s oculta |
| `CELL_DUP_CAP_BASE` | 3 células vivas |
| `CELL_DUP_CAP_PER_WAVES` | +1 cada 5 oleadas |
| `CELL_DUP_CAP_MAX` | 6 |
| `CELL_DUP_LONE_DIST` | 15.0 m (sin pack cerca) |
| `CELL_DUP_SPOTTED_DIST` | 8.0 m (no duplica con Nyx más cerca) |
| `CELL_DUP_MOTHER_HP` | 0.6 |
| `CELL_CHILD_EXP` | 0.5 |
| `CELL_DAMAGED_FLASH` | 0.85 |

Condición completa: `duplicateOwnerId === null` (solo una a la vez) **y** `hiddenFor >= 2.0` **y**
`distToPlayer > 8.0` **y** `cellCount < min(6, 3 + floor(oleada / 5))` **y** sin otra célula a <15 m.
`spawnCellChild` (`DomeWaveManager.ts:2040-2056`): la hija nace con la vida completa, `expValue = 0.5`,
`attackTimer = 1.5`; la madre queda con `max(1, hp * 0.6)`.

### 1.5 Ataques, daños y contadores

- **Único ataque: lunge por contacto.** 8 HP, 30 m/s, 6 m, 0.45 s de telegraph, 0.8 s de castigo.
- No tiene ataques a distancia, ni proyectiles, ni energía interna.
- **Cómo se contrarresta (mecánicas reales del código):**
  - La dirección se **sella al entrar en `windup`**: cualquier desplazamiento durante esos 0.45 s
    rompe la predicción.
  - El `lead` máximo es 0.5 s: dashar a alta velocidad la deja clavada (el dash a 24–28 m/s es cebo).
  - Mirarla de frente a <6.5 m la pone en `flee` (no ataca).
  - El token de enjambre limita el acoso a un lunge por ventana de 2.5 s.
  - Cualquier golpe con `hitFlash > 0.85` corta la duplicación; también acercarse a <8 m sin oclusión.
  - 15 de carne: penetra cualquier patada con fuerza ≥15 (o el taladro, ×1.55).

### 1.6 Animación, rig y shader

Modelo: `public/models/enemies/abyssal_cell.glb`, skin de **4 joints**:
`cell_root`, `cell_core`, `cell_flesh_bottom`, `cell_flesh_top` (+ mallas `flesh`, `star_core`).

Clips reales del GLB y quién los pide (`updateCellPose`, `:4210-4237`):

| Clip | Duración real | Bucle | Estado que lo pide |
|---|---|---|---|
| `cell_idle_float` | 2.40 s | sí (`float`) | Modo Entrenamiento / reposo |
| `cell_sneak_loop` | 1.60 s | sí (`loop`) | `seek`, `stalk` |
| `cell_flee_loop` | 0.70 s | sí (`loop`) | `flee`, `scatter` |
| `cell_windup` | 0.47 s | one-shot | `windup` |
| `cell_lunge` | 0.70 s | one-shot | `lunge` |
| `cell_recover` | 0.80 s | one-shot | `recover` |
| `cell_duplicate` | 5.00 s | sí (`duplicate`) | `duplicate` |
| `cell_hit` | 0.20 s | one-shot | flinch (`cellHitTimer = 0.2` al recibir golpe) |

Crossfade de `0.12 s` (`crossfadeEnemyAction`). Orientación (`faceTowards`): en `windup`/`lunge` mira
`cellLungeDir` a 5.0 rad/s; si no, mira su velocidad a 3.0 rad/s cuando `velocity.lengthSq() > 0.3`.
Sin clips, cae al wobble global de malla. Material: carne nebulosa con `uOpacity 0.62` y rim `0xf59e0b`;
estrella dorada cel; contorno de tinta blanca vibrante.

---

## 2. `crab_gunner` — Cangrejo Artillero

Fuente: `domeCrabBehavior.ts` (constantes `:27-101`, `:764-765`) +
`DomeWaveManager` (láser pool, kamikaze, pose, `:3582-3822`).

### 2.1 Stats

`maxHp 60`, `radius 1.8`, `fleshThickness 35`, `expValue 1.25`, `weakPoints 1`, `evasive false`.

### 2.2 Movimiento: pegado a suelos flotantes

| Constante | Valor |
|---|---|
| `CRAB_TURN_RATE` | 4.0 (slerp/s del cuerpo sobre el slab) |
| `CRAB_TURRET_TURN_RATE` | 6.0 (giro del cañón en la ráfaga) |
| `CRAB_TURRET_IDLE_TURN_RATE` | 3.0 rad/s (apuntado continuo en reposo) |
| `CANNON_MUZZLE_DISTANCE` | 1.4 m desde el hueso `turret` |
| `CRAB_SLAB_MARGIN` | 1.1 m |
| `CRAB_ATTACH_BLEND_TIME` | 0.45 s (aterrizaje suave) |
| `CRAB_SPAWN_MAX_R` | 70.0 m (slab preferido de spawn) |
| `CRAB_LEAVE_R` | 72.0 m (el slab se va: salta) |
| `CRAB_JUMP_RETARGET_R` | 76.0 m (re-objetiva en vuelo) |
| `CRAB_JUMP_R_WEIGHT` | 1.2 |
| `CRAB_JUMP_DURATION` / `_MAX` | 0.75 / 2.4 s |
| `CRAB_JUMP_H_SPEED` | 22.0 m/s |
| `CRAB_JUMP_ARC_MIN` / `_MAX` | 2.5 / 9.0 m (`arc = min(9, 2.5 + dist * 0.22)`) |
| `CRAB_GRAB_RANGE` | 55.0 m (agarre desde el aire) |
| `CRAB_SKID_DAMPING` / `CRAB_AIR_DAMPING` | 6.0 / 3.0 |
| `CRAB_LEG_WAVE_SPEED` / `CRAB_LEG_WAVE_AMPLITUDE` | 14.0 / 0.3 rad |
| `CRAB_FLIGHT_WOBBLE` / `_SPEED` | 0.12 rad / 2.7 rad/s |
| `CRAB_HIT_CLIP_SEC` / `CRAB_JUMP_LAND_CLIP_SEC` | 0.2 / 0.35 s |

- Spawn (`spawnEnemy`, `:1607-1616`): sobre un slab con `center < 70 m` (`pickCrabSpawnSlab`),
  `pickSlabLocalPoint` con RNG determinista de oleada, y `homePos = slabTop + standHeight`.
- Anclaje (`updateCrabOnSlab`): offset local deslizado por knockback y recortado al polígono real de la
  tapa (`clampSlabLocalPoint`, margen 1.1 m); `attachBlend` suaviza con `t²(3-2t)`.
- Salto (`startCrabJump`/`updateCrabJump`): parábola `lerp(from, target, t) + arcHeight * 4t(1-t)`, con
  desvío por knockback (`jump.offset`) y freno `exp(-3.0*dt)`. Re-objetiva si el slab destino supera
  76 m y hay otro `> 4 m` mejor.
- Sin slab: flotación genérica + `orientCrabInFlight` (mira a Nyx + roll `sin(elapsed*2.7 + phase) * 0.12`)
  + aleteo procedural de patas.

### 2.3 FSM de combate (`CrabAttackState`)

`'idle' | 'laser_aim' | 'laser_fire' | 'burst' | 'kamikaze_prime'`.
En pleno salto el ataque se cancela (`resetCrabAttack`, `attackTimer >= 0.35`).

**`idle`** (decisión por frame):
- Acumula `crabProxTimer` si `dist <= 5.0`, decae a `dist * 4` fuera.
- Si `dist <= 5.0`: con `crabProxTimer >= 0.25` y sin `kickLock`
  (`crabPostKickGrace > 0 || playerKickAnim`) → `kamikaze_prime`; si hay `kickLock` → `attackTimer = 0.15`.
- Si no, `sameFloor` (`playerSlab.id === attachedSlabId`) → `burst` (requiere `turretNode`, si no `attackTimer = 1.0`).
- Si no, `dist <= 500` → `laser_aim` (requiere `turretNode`, si no `attackTimer = 1.0`).
- En `idle` el cañón persigue a Nyx a 3.0 rad/s.

### 2.4 Ataque 1 — Rayo Láser Continuo

| Constante | Valor |
|---|---|
| `CRAB_LASER_DPS` | 20.0 HP/s (daño continuo `20 * dt`) |
| `CRAB_LASER_MAX_DIST` / `CRAB_LASER_RANGE` | 500.0 m |
| `CRAB_LASER_AIM_SEC` | 2.0 s de telegraph |
| `CRAB_LASER_AIM_TRACK_SEC` | 1.65 s de rastreo |
| `CRAB_LASER_AIM_TURN_RATE` | 3.5 rad/s |
| `CRAB_LASER_LEAD_SEC` | 0.5 s de predicción |
| `CRAB_LASER_AIM_BLINK_HZ` | 14.0 Hz (parpadeo blanco/rojo del sellado) |
| `CRAB_LASER_FIRE_SEC` | 2.0 s de haz |
| `CRAB_LASER_FIRE_TURN_RATE` | 1.2 rad/s (declarada; **no se aplica**: en `laser_fire` el haz queda fijo en la última dirección) |
| `CRAB_LASER_COOLDOWN` | 6.0 s (`6.0 / speedMult`) |
| `CRAB_LASER_HIT_RADIUS` | 1.7 m (cuerpo de Nyx contra el haz) |
| `CRAB_LASER_BEAM_FF_MARGIN` | 0.45 m (margen contra enemigos) |

- Alcance real (`raycastCrabLaser`, `:3479-3518`): cortado por el primer slab (`raycastSlabs`) y por la
  salida de la esfera de la barrera (`DOME_PLAYER_BOUND_RADIUS²`); mínimo `0.5 m`.
- Fuego amigo (`applyCrabLaserFF`, `:3582-3616`): a todo enemigo vivo que cruce el haz,
  `20 * dt` de HP y `fleshThickness -= damage * 0.25`; contra KRONOS rompe como máximo 1 Estrella Dorsal.
- Visual: hilo fino `CRAB_LASER_AIM_RADIUS 0.06` rojo `0xff1622` (opacidad 0.55, 0.95 en blanco),
  haz grueso `CRAB_LASER_FIRE_RADIUS 0.42` naranja `0xff5a2a` (opacidad 0.85), aditivo, pool de 8.
- Material de la boca del cañón en `laser_fire`: `uEmissiveBoost = 1.35`; en `laser_aim` con
  `crabTimer > 1.65`: `0.6 + sin(crabTimer*40)*0.45`; en `burst` con `crabTimer < 0.25`:
  `0.4 + |sin(crabTimer*30)|*1.1`.

### 2.5 Ataque 2 — Ráfaga Láser (Nyx en el MISMO slab)

| Constante | Valor |
|---|---|
| `CRAB_BURST_TELEGRAPH_SEC` | 0.25 s |
| `CRAB_BURST_SHOT_INTERVAL` | 0.10 s |
| `CRAB_BURST_TOTAL_SEC` | 0.25 + 2·0.10 = 0.45 s |
| `CRAB_BURST_SHOTS` | 3 |
| `CRAB_BURST_SHOT_SPEED` | 36.0 m/s |
| `CRAB_BURST_SHOT_DAMAGE` | 2 HP (6 HP máximo por ráfaga), parryables |
| `CRAB_BURST_COOLDOWN` | 3.0 s (`3.0 / speedMult`) |

- Proyectil `kind = 'laser'`: sin homing, dirección = orientación actual del cañón; vida
  `PROJECTILE_LIFE_SEC = 9.0`; escala `0.55`; material `0xff2233` con rim `0xffd9d9`,
  `emissiveBoost 1.3`; nace a `0.35 m` de la boca.
- La torreta rota a 6 rad/s entre disparos.
- Dispara **sin importar la distancia** dentro de la misma plataforma (defensa perimetral).

### 2.6 Ataque 3 — Protocolo Kamikaze

| Constante | Valor |
|---|---|
| `CRAB_KAMIKAZE_RADIUS` | 10.0 m |
| `CRAB_KAMIKAZE_TRIGGER_DIST` | 5.0 m |
| `CRAB_KAMIKAZE_ARM_SEC` | 0.25 s dentro de 5 m |
| `CRAB_KAMIKAZE_PRIME_SEC` | 1.1 s (punto de no retorno) |
| `CRAB_KAMIKAZE_RUN_SPEED` | 6.5 m/s (`* speedMult`) por su slab |
| `CRAB_KAMIKAZE_SWELL` | 0.35 (hinchado de `mesh.scale`) |
| `CRAB_POST_KICK_GRACE` | 0.75 s de guardia anti-patada tras impacto melee |
| `CRAB_KAMIKAZE_RETRY_SEC` | 0.15 s |

Bandas de daño/empuje (`CRAB_KAMIKAZE_BANDS`, `:335-339`; `kamikazeBand`, `:3626-3633`):

| Distancia | Daño a Nyx | Empuje (m/s) |
|---|---|---|
| `<= 3.0 m` | 50 | 32 |
| `<= 5.0 m` | 35 | 24 |
| `<= 10.0 m` | 20 | 16 |

- El daño/empuje a Nyx se aplica vía `onGolemSmash(damage, dir, push)` (incluye stagger de Nyx).
- **Fuego amigo**: a enemigos vivos a `<= 10 m`, mismas bandas, `fleshThickness -= damage * 0.5`,
  empuje y muerte si `hp <= 0`.
- **Rompesuelos**: destruye el slab al que está pegado o el más cercano a `< 10 m` (`onSlabSmash`).
- **Autoinmolación**: `expValue *= 0.25` y `alive = false` (solo 25 % de la EXP).
- Visual: aro de peligro rojo sobre la tapa con `pulse = 0.5 + 0.5*sin(crabTimer*(16 + 44*t01))`,
  opacidad `0.25 + 0.45*pulse²`; `star_core` en rojo incandescente
  (`uColor 0xff2214`, `uRimColor 0xff5533`, `uEmissiveBoost = 0.8 + |sin(elapsed*(26 + 62*t01))| * (0.9 + 2.4*t01)`);
  estallido `0xff5a2a` de radio 10 m.

### 2.7 Contadores / debilidades

- 35 de carne: penetra patadas con fuerza ≥35 (o taladro).
- El láser tiene telegraph de 2.0 s con rastreo a 3.5 rad/s: solo persigue los primeros 1.65 s y luego
  sella (parpadeo a 14 Hz) → moverse en el último tramo sale gratis.
- El haz se corta en el primer slab: cubrirse con un slab funciona de verdad.
- La ráfaga (2 HP × 3) es **parryable** (proyectiles rectos de 36 m/s).
- Guardia anti-patada de 0.75 s impide el kamikaze justo después de un golpe melee de Nyx.
- Hit → `crabPostKickGrace = 0.75` + clip `crab_hit` (0.2 s).

### 2.8 Animación, rig y shader

Modelo: `crab_gunner.glb`, skin de **12 joints**: `root`, `turret` y las 10 patas
`leg_{FL,FR,RL,RR,B}_{upper,lower}`. Mallas: `flesh.001`, `star_core`, `detail_cannon.004`.
`findTurretRig` (`:616-631`) usa el hueso `turret` con eje local **+Y** (o `detail_cannon` con **+Z**).

| Clip | Duración real | Bucle | Uso |
|---|---|---|---|
| `crab_idle_breathe` | 1.80 s | sí (`idle`) | reposo |
| `crab_scuttle_loop` | 0.60 s | sí (`loop`) | `velocity.lengthSq() > 9` |
| `crab_jump_launch` | 0.27 s | one-shot | primeros 0.25 s del salto |
| `crab_jump_air_loop` | 0.50 s | sí (`loop`) | salto en vuelo |
| `crab_jump_land` | 0.33 s | one-shot | aterrizaje (`crabLandTimer`) |
| `crab_laser_charge` | 2.00 s | one-shot | `laser_aim` |
| `crab_laser_fire_loop` | 0.40 s | sí (`loop`) | `laser_fire` |
| `crab_burst_shoot` | 0.43 s | one-shot | `burst` |
| `crab_kamikaze_prime` | 1.10 s | one-shot | `kamikaze_prime` |
| `crab_hit` | 0.20 s | one-shot | flinch |

Crossfade `0.12 s`. Sin mixer: aleteo procedural de `leg_*` con
`sin(elapsed*14 + phase + i*0.8) * amplitude(0.3)` compuesto sobre la pose de reposo, y guiñeo de vuelo.
Materiales: carne nebulosa con rim `0xff2a9d`; estrella cel dorada (recoloreada en kamikaze);
`detail_cannon` con cel de detalle (`0x241d38`/`0x6b5f8a`) y contorno blanco de 0.04.

---

## 3. `ground_golem` — Gólem Rompesuelos

Fuente: `domeGolemBehavior.ts` (constantes `:49-270`) + `DomeWaveManager` (pose `:4659-4928`,
ventana de parry `:4463-4657`, `onHitEnemy` `:2110-2160`).

### 3.1 Stats

`maxHp 140`, `radius 3.2`, `fleshThickness 80`, `expValue 2.0`, `weakPoints 1`, `evasive false`.
Es el tanque del quinteto: 80 de carne (el mayor umbral de penetración de los básicos).

### 3.2 Movimiento por estado (`updateGolemEnemy`)

| Constante | Valor |
|---|---|
| `GOLEM_HELI_SPEED` | 15.0 m/s |
| `GOLEM_HELI_ACCEL_LAMBDA` | 2.2 (`velocity.lerp(target, 1 - exp(-2.2*dt))`) |
| `GOLEM_HELI_VERTICAL_SCALE` | 0.75 (componente Y al 75 %) |
| `GOLEM_KEEP_RADIUS` / `_PULL` | 78.0 m / 9.0 (también a `+6 m` fuera de persecución) |
| `GOLEM_OBSERVE_SEC` | 0.45 s |
| `GOLEM_PRESS_RING` | 7.0 m |
| `GOLEM_OBSERVE_ORBIT_SPEED` | 6.0 m/s |
| `GOLEM_RETREAT_SPEED` | 9.5 m/s |
| `GOLEM_REST_DISTANCE` | 26.0 m |
| `GOLEM_EXHAUSTED_SPEED` | 3.0 m/s |
| `GOLEM_EXHAUSTED_TURN_RATE` | `10.0 * π/180` = 0.1745 rad/s |
| `GOLEM_TURN_RATE` | 2.6 (slerp/s) |
| `GOLEM_BLOCK_MOVE_SPEED` | 1.5 m/s |

- `helicopter`: persecución con aceleración pesada + vibración `sin(elapsed*24 + phase) * 0.35 * dt` en Y.
- `observe`: anillo de lectura a 7.0 m (`radial = clamp((dist - 7) * 0.55, ±6)`) + cruceta tangencial a
  6 m/s (signo fijo por instancia, `phase > π ? 1 : -1`), `targetVel.y *= 0.5`.
- `retreat`: se aleja a 9.5 m/s hasta 26 m (más lejos: `speed = 0`, flota vigilando) y regenera.
- Cargas: velocidad constante sobre `chargeDir`.
- `punch_smash`: latigazo a `velocity *= exp(-4*dt)`; resto de telegraphs/castigo: `exp(-2.5*dt)`.
- `exhausted`: `velocity = golemDriftDir * 3.0`.
- `parried`: `velocity *= exp(-2.5*dt)` y `velocity.y -= 3.0*dt` con suelo `-2.0`.
- Anti-empotramiento: fuera de `thin_spiral`, `thick_spiral`, `block_guard`, `punch_smash` y `parried`,
  se mantiene a `radius + 0.5` de Nyx sin velocidad entrante.

### 3.3 FSM (`GolemState`)

`'helicopter' | 'observe' | 'retreat' | 'punch_windup' | 'punch_smash' | 'punch_recover' |
'thin_windup' | 'thin_spiral' | 'thick_windup' | 'thick_spiral' | 'charge_end' | 'block_guard' |
'exhausted' | 'parried'`.

Decisión (sin cooldowns artificiales, cada frame):

| Distancia | Acción |
|---|---|
| `< 5.0 m` (`GOLEM_PUNCH_TRIGGER_DISTANCE`) | puñetazo **siempre** |
| `<= 20.0 m` (`GOLEM_CHARGE_MAX_DIST`) | carga inmediata si `golemChargeIsSafe`; si no, `observe` (0.45 s) |
| `20–30 m` (`GOLEM_GAMBLE_MAX_DIST`) | banda de apuesta: `allIn` si herido y (Nyx baja o sin Eden) y `stamina >= 18` → carga `thin` ignorando el aborto anti-barrera |
| `> 30 m` | persigue con el rotor a 15 m/s |

`GOLEM_ENGAGE_MAX_DIST = 30.0`, `GOLEM_GAMBLE_MIN_DIST = 20.0` y `GOLEM_CHARGE_MIN_DIST = 4.5`
están exportadas pero **la FSM no las consulta** (usa 5.0 / 20.0 / 30.0).

### 3.4 Puñetazo Bruto

| Constante | Valor |
|---|---|
| `GOLEM_PUNCH_WINDUP_SEC` | 0.95 s |
| `GOLEM_PUNCH_SWING_SEC` | 0.2 s |
| `GOLEM_PUNCH_RECOVER_SEC` | 1.0 s |
| `GOLEM_PUNCH_REACH` | 4.6 m |
| `GOLEM_PUNCH_HIT_RADIUS` | 3.8 m |
| `GOLEM_PUNCH_DAMAGE` | 16 HP |
| `GOLEM_PUNCH_PUSH` | 24.0 m/s |
| `GOLEM_SLAB_BREAK_RADIUS` | 8.0 m |
| `GOLEM_PUNCH_POINT_BLANK` | 1.2 m |
| `GOLEM_PUNCH_LUNGE_SPEED` | 4.0 m/s |
| `GOLEM_COST_PUNCH` | 10.0 de stamina |

- El windup rastrea; al terminar, `impactDist = clamp(dist, radius*0.8, radius + 4.6)` y se **sella** el
  punto `golemImpact` (sin re-lock durante el golpe). El cuerpo se arrastra a 4 m/s hacia ese punto.
- Impacto si `playerPos` está a `< 3.8 m` del punto **o** a `radius + 1.2` del centro (aplastamiento a
  bocajarro). Aplica `onGolemSmash(16, dir, 24)`.
- Rompe el slab con centro a `< 8 m` del punto de impacto (`smashSlabsNearPoint`).
- Si en pleno windup (con `golemTimer > 0.08`) detecta amenaza, **cancela** y levanta la pared.

### 3.5 Cargas en espiral

| Constante | Fina (`thin`) | Gruesa (`thick`) |
|---|---|---|
| `GOLEM_*_SPEED` | 28.0 m/s | 20.0 m/s |
| `GOLEM_*_WINDUP_SEC` | 0.45 s | 0.6 s |
| `GOLEM_*_AIM_TURN_RATE` | 2.2 rad/s | 0.9 rad/s |
| `GOLEM_*_MAX_SEC` | 2.2 s | 2.6 s |
| `GOLEM_*_DAMAGE` | 12 HP | 18 HP |
| `GOLEM_*_PUSH` | 20.0 m/s | 26.0 m/s |
| `GOLEM_*_TURN_IN_FLIGHT` | 0.45 rad/s | 0.22 rad/s |
| `GOLEM_COST_*` | 18.0 stamina | 24.0 stamina |

(El comentario de cabecera del fichero dice 0.35/0.18 rad/s; los valores efectivos son 0.45/0.22.)

- `GOLEM_LEAD_MAX_SEC = 0.75`: objetivo `playerPos + vel * lead`, con
  `lead = min(0.75, (rawDist / speed) * 0.5)`.
- Duración del trayecto: `min(maxSec, (rawDist / speed) * 1.35 + 0.4)`; se guarda en `golemTimer`.
- El rumbo se corrige en vuelo con tope angular real y la velocidad se renormaliza desde el rumbo.
- Contacto con Nyx a `radius + GOLEM_CHARGE_CONTACT_PADDING (1.5)` → daño + empuje y `charge_end`.
- Slabs: `resolveSphereSlabCollision`; la broca (`thin`) se clava y rebota a `-6.0` m/s; el ariete
  (`thick`) rompe el slab tocado y además rompe por roce dentro de `radius + GOLEM_THICK_GRAZE_RADIUS (2.6)`
  (y a `2.6` desde un impacto puntual).
- Anti-suicidio (`golemChargeIsSafe`): solo arranca si el punto final previsible queda dentro de
  `DOME_PLAYER_BOUND_RADIUS - radius - GOLEM_CHARGE_SAFE_MARGIN (2.5)`.
- Aborto en vuelo: `enemy.position.length() > 88.6 - radius - GOLEM_BARRIER_STOP_MARGIN (2.5)` (salvo apuesta).
- `GOLEM_CHARGE_END_SEC = 0.5` de frenado antes de decidir de nuevo.
- Alterna `thin`/`thick` tras cada windup lanzado (`golemChargeKind`).

### 3.6 Energía interna (stamina) y fatiga

| Constante | Valor |
|---|---|
| `GOLEM_STAMINA_MAX` | 100.0 |
| `GOLEM_STAMINA_DRAIN_HELI` | 3.5 /s (persecución) |
| `GOLEM_STAMINA_DRAIN_OBSERVE` | 1.5 /s |
| `GOLEM_STAMINA_DRAIN_BLOCK` | 4.0 /s (0 si está herido: `hp/maxHp < 0.35`) |
| `GOLEM_COST_THIN` / `_THICK` / `_PUNCH` | 18.0 / 24.0 / 10.0 |
| `GOLEM_EXHAUSTED_SEC` | 5.0 s (recarga completa dentro de la ventana) |
| `GOLEM_REST_STAMINA` | 25.0 (se retira a descansar bajo esto, con Nyx pasiva) |
| `GOLEM_REST_TARGET_STAMINA` | 62.0 |
| `GOLEM_REST_REGEN` | 11.0 /s |
| `GOLEM_PASSIVE_SPEED` | 9.5 m/s (Nyx "pasiva" por debajo, sin atacar) |

A 0 de stamina → `exhausted`: 5.0 s avanzando a 3 m/s en la dirección sellada al entrar y girando a
10°/s exactos (ventana real de castigo). Al salir, `stamina = 100`.

### 3.7 Pared reactiva (`block_guard`)

| Constante | Valor |
|---|---|
| `GOLEM_BLOCK_FLOOR_SEC` | 5.0 s de piso mínimo |
| `GOLEM_BLOCK_HOLD_SEC` | 0.9 s tras perder el interés |
| `GOLEM_BLOCK_RAISE_CLIP_SEC` | 0.3 s (guardia "alzada" tras `golem_block_start`) |
| `GOLEM_BLOCK_GRACE_SEC` | 0.3 s de gracia al bajar (`golem_block_end`) en la que **sigue bloqueando** |
| `GOLEM_BLOCK_LATE_DIST` | 2.0 m (no levanta la pared si Nyx ya está a `radius + 2`) |
| `GOLEM_GUARD_FACE_DOT` | 0.25 |
| `GOLEM_COWARD_HP_RATIO` | 0.35 |
| `GOLEM_PLAYER_LOW_RATIO` | 0.30 |
| `GOLEM_THREAT_RANGE` | 32.0 m |
| `GOLEM_THREAT_ATTACK_DOT` / `_WOUNDED_DOT` | 0.42 / 0.25 |
| `GOLEM_THREAT_CLOSING_SPEED` | 8.0 m/s |
| `GOLEM_THREAT_APPROACH_DOT` | 0.6 |
| stamina mínima para bloquear | 6.0 (solo si no está herido) |

- Amenaza real (`isThreatToGolem`): Nyx atacando con el cono frontal (`aimForward.dot(dir) > 0.42`, o
  `0.25` si el gólem está herido) **o** velocidad de cierre `> 8 m/s` con `dot > 0.6`, ambas dentro de 32 m.
- Bloqueo (`isGolemGuardBlocking`, `DomeWaveManager.ts:2192-2208`): exige `block_guard` o gracia, y que la
  cara real gólem→Nyx tenga `dot(facing, radial) > 0.25`. Bloquear = 0 daño cinético y rebote de Nyx.
- Rearma `golemTimer = max(timer, 5.0)` mientras haya amenaza o `dist <= radius + 9.0`; si no,
  `timer = min(timer, 0.9)`.

### 3.8 Parry por distancia (remate en cabeza)

| Constante | Valor |
|---|---|
| `GOLEM_PARRY_OPEN_DIST` | 9.0 m (`α + 9`) |
| `GOLEM_PARRY_CLOSE_DIST` | 2.0 m (`α + 2`) |
| `GOLEM_PARRY_WINDOW_SEC` | 1.5 s (tope de seguridad de mundo) |
| `GOLEM_PARRY_EXECUTE_SEC` | 1.2 s (margen del remate) |
| `GOLEM_PARRY_COOLDOWN_SEC` | 18.0 s (solo con parry ejecutado) |
| `GOLEM_PARRY_LOCKOUT_SEC` | 5.0 s (dejó pasar la oportunidad) |
| `GOLEM_PARRY_EDEN_RATIO` | 0.06 (Eden mínimo de Nyx) |
| `GOLEM_PARRY_CRIT_RATIO` | 0.35 (fracción del `maxHp` TOTAL) |
| `GOLEM_PARRY_STAR_OUT` | 2.8 m (estrella sobresaliendo del cuerpo) |
| `GOLEM_PARRY_STAR_UP` | 4.0 m sobre el hombro del brazo gigante |
| `GOLEM_PARRY_VULN_SEC` | 1.8 s de ventana vulnerable (penetración) |
| `GOLEM_PARRIED_SEC` | 1.6 s |
| `GOLEM_PARRY_MAX_Y_HIT_DIR` | `-0.45` (taladro descendente) |
| `GOLEM_PARRY_STRIKE_MAX_Y_HIT_DIR` | `-0.22` (remate de Fase 2) |
| `GOLEM_HIT_CLIP_SEC` | 0.3 s |

Flujo real:
- **Fase 1 `parry_decide`**: se abre al cruzar hacia dentro `α + 9` con la guardia alzada
  (`golemBlockGuardElapsed >= 0.3`), sin cooldown ni lockout, y con `aimDir·playerVel > 0`.
  Si Nyx llega a `α + 2` sin dash → cierra con lockout de 5 s (sin cooldown largo).
  Si se aleja a `> α + 9`, baja la guardia o caduca el 1.5 s → cierra.
- **Fase 2 `parry_strike`**: arranca al ejecutar el dash al punto de la estrella
  (`parryTimer = 1.2 s`, `golemParryCd = 18 s`); el reloj se mantiene mientras Nyx vuela.
- **Remate conectado**: `isDrill && strikePhase && hitDir.y <= -0.22` → `35 % del maxHp` = **49 HP**, se
  cierra la ventana en el mismo frame y se llama a `parryGolemHead`.
- **Taladro descendente fuera de fase**: `hitDir.y <= -0.45` → `parryGolemHead` (sin crítico del 35 %).
- `parryGolemHead` pone `golemState = 'parried'` (1.6 s) y `vulnerableTimer = 1.8`; si está en
  `punch_smash` o `exhausted` solo añade la ventana vulnerable (el latigazo no es interrumpible).
- La estrella se ancla al hueso `arm_L_upper`: `pos = center + radial(radius + 2.8)`, `y = y_armL + 4.0`.
  El punto de cabeza es `head` + `0.65`.

### 3.9 Contadores / debilidades

- Bloqueo/ataque mutuamente excluyentes: el windup cancela y levanta pared si ve venir a Nyx
  (excepto en los últimos `0.08 s` del puñetazo y `0.12 s` de las cargas, ya sellados).
- La broca se clava contra los slabs; el ariete los rompe (deja escombros agarrables).
- Ventanas de castigo reales: `parried` 1.6 s + vulnerabilidad 1.8 s, y `exhausted` 5.0 s.
- 80 de carne y `radius 3.2`: sin habilidad/taladro hace falta fuerza ≥80.
- La pared no cubre la espalda (solo la cara con `dot > 0.25` respecto a la radial gólem→Nyx).
- No puede cargar contra la barrera (aborto a `88.6 - radius - 2.5`), salvo en la banda de apuesta.

### 3.10 Animación, rig y shader

Modelo: `ground_golem.glb`, skin de **9 joints**: `root` (falda-rotor), `spine`, `chest`, `head`,
`giant_shoulder_R`, `giant_arm_R`, `giant_fist_R`, `arm_L_upper`, `arm_L_lower`, más `star_core`,
`flesh` y la malla `detail_fist` (material `mat_detail`).

| Clip | Duración real | Bucle | Uso |
|---|---|---|---|
| `golem_helicopter_loop` | 1.20 s | sí (`loop`) | reposo/persecución/`observe` (fade 0.3 s) |
| `golem_block_start` | 0.30 s | one-shot | subida de la pared (fade 0.08 s, reset forzado) |
| `golem_block_loop` | 1.40 s | sí (`loop`) | pared sostenida |
| `golem_block_end` | 0.27 s | one-shot | bajada (fade 0.06 s; no se pisa hasta `duration - 1/30`) |
| `golem_brute_punch` | 2.40 s | one-shot | `punch_windup`/`punch_smash`/`punch_recover` (reinicio forzado) |
| `golem_thin_spiral` | 0.40 s | sí (`spiral`) | `thin_windup`/`thin_spiral` |
| `golem_thick_spiral` | 0.60 s | sí (`spiral`) | `thick_windup`/`thick_spiral` |
| `golem_exhausted_loop` | 2.00 s | sí (`loop`) | `exhausted` (fade 0.3 s) |
| `golem_hit` | 0.30 s | one-shot | flinch (fade 0.06 s) |
| `golem_parried_head_hit` | 1.50 s | one-shot | `parried` (fade 0.04 s) |

Orientación del grupo raíz (los clips nunca la tocan, `updateGolemPose`):
- `parried`: congelada.
- cargas y windups: el eje corporal (+Y local) se alinea con la dirección sellada
  (`setFromUnitVectors(modelUp, aimDir)`, slerp `1 - exp(-8*dt)`).
- `exhausted`: giro honesto a 10°/s.
- `block_guard`: `faceTowards` a 1.0 rad/s.
- resto: `faceTowards` a `GOLEM_TURN_RATE 2.6`.

`detail_fist` (material `mat_detail`, `uEmissiveBoost`, rim `GOLEM_FIST_NEON_RIM 0x39ffb0`):

| Estado | `uEmissiveBoost` | Escala (`restScale * pulse`) |
|---|---|---|
| reposo | 0.05 | 1 |
| `punch_windup` | `0.35 + w*(1.15 + sin(elapsed*20)*0.45)` | `1 + w*0.15` |
| `punch_smash` | 1.6 | 1 |
| `thick_windup` | `0.9 + w*0.5` | `1 + w*0.12` |
| `thick_spiral` | `1.45 + sin(elapsed*18)*0.15` | `1 + sin(elapsed*18)*0.08` |
| `parried` | 1.2 | 1 |
| `block_guard` | 0.35 | 1 |

Fallback procedural sin clips: `skirtSpin` de `root` a `5.24 rad/s` en helicóptero, `31.4` en broca,
`12.6` en ariete, parado en exhausto; brazos `giant_shoulder_R`/`giant_arm_R`/`giant_fist_R` con
`armTarget` por estado (-1.15 punch_windup, 0.62 punch_smash, -0.35 block, -0.9 parried, 0.25 exhausted)
y `arm_L_upper -1.35` estirado en las cargas finas.
Materiales: carne nebulosa con rim `0xff2a9d`, estrella dorada, `detail_fist` cel `0x241d38`/`0x6b5f8a`.

---

## 4. `spiral_octopus` — Pulpo Espiral

Fuente: `DomeWaveManager.ts:274-315` (constantes), `:3047-3340` (ciclo, bolas, dispersión),
`:3395-3460` (contra-parry), `:4282-4365` (pose/clips), `:3342-3380` (captura de bolas) +
`DomeCombatSystem.ts` (tinta).

### 4.1 Stats

`maxHp 70`, `radius 2.2`, `fleshThickness 55`, `expValue 1.5`, `weakPoints 1`, `evasive false`.
Comentario de diseño en el código: "toda su evasión y el Contra-Parry los gobierna su propio ciclo de
5.0 s — el dash evasivo genérico de 3 s NO aplica".

### 4.2 Ciclo de dash y banda espacial

| Constante | Valor |
|---|---|
| `OCTOPUS_DASH_COOLDOWN_SEC` | 5.0 s (ciclo completo) |
| `OCTOPUS_DASH_ALERT_SEC` | 1.5 s (ventana de alerta / contra-parry al final del ciclo) |
| `OCTOPUS_DASH_SPEED` | 30.0 m/s |
| `OCTOPUS_DASH_TIME` | 0.55 s de impulso |
| `OCTOPUS_DRIFT_DAMPING` / `_DASH_DAMPING` | 0.55 / 1.1 |
| `OCTOPUS_KEEP_RADIUS` / `_PULL` | 80.0 m / 26.0 |
| `OCTOPUS_MIN_NYX_DIST` / `_PUSH` | 2.0 m / 9.0 |
| `OCTOPUS_PREF_MIN_DIST` | 9.0 m (los dashes no acaban encima de Nyx) |
| `OCTOPUS_MIN_Y` / `MAX_Y` | 2.0 / 42.0 m |
| `OCTOPUS_TURN_RATE` | 3.2 (slerp/s) — 40.0 durante el contra-parry |
| `OCTOPUS_SPIRAL_TILT` / `_SPEED` | 0.38 rad / 2.6 |
| `TENTACLE_WAVE_SPEED` | 4.5 |
| `TENTACLE_BASE_AMPLITUDE` / `_TIP_AMPLITUDE` | 0.32 / 0.45 |
| `OCTOPUS_INK_FORWARD` / `OCTOPUS_INK_UP` | 0.55 / 0.35 (boca del manto: `radius*0.55` al frente + `radius*0.35` arriba) |

- Sin `homePos` estático (movimiento libre por la cúpula) y sin dash evasivo genérico.
- `updateOctopusEnemy`: si `dashTimer <= 0 && dashActive <= 0` → `startOctopusDash`; luego fricción
  (`exp(-damping*dt)`), integración, contención dura a `80 - radius` (anulando la velocidad saliente),
  banda Y `[2, 42]` y repulsión suave si `dist < radius + 2.0`.
- `startOctopusDash`: dirección aleatoria
  `(cos(ang), (rng - 0.5)*0.9, sin(ang))` normalizada; si `dist < 9.0` mezcla `lerp(0.55)` con la huida;
  si `|pos_xz| > 0.66 * 80` mezcla `lerp(0.5)` hacia dentro. `velocity = dir * 30`,
  `dashActive = 0.55`, `dashTimer = 5.0`.
- Desfase inicial de spawn (`:1738-1741`): `dashTimer = 5.0 * 0.5 + rng * 5.0 * 0.5` (2.5–5.0 s) para que
  varios pulpos no entren en alerta a la vez.
- Pose (`updateOctopusPose`): mira a Nyx con `lookAtQuat` + roll `sin(elapsed*2.6 + phase) * 0.38`;
  `star_core` en rojo de aviso durante la alerta (`uColor 0xff2214`, `uRimColor 0xff5533`,
  `uEmissiveBoost = 0.9 + |sin(elapsed*(14 + 26*(1 - dashTimer)))| * 1.6`); sin clips, oscilación
  procedural de `tentacle_*` sobre su pose de reposo.

### 4.3 Ataque 1 — Bola Roja de Tinta Ácida

| Constante | Valor |
|---|---|
| `OCTOPUS_SHOOT_INTERVAL` | 3.0 s (`3.0 / speedMult`) = 0.333 disparos/s |
| `OCTOPUS_BALL_INIT_SPEED` | 30.0 m/s |
| `OCTOPUS_BALL_DECEL` | 1.0 m/s² (constante) |
| `OCTOPUS_BALL_DAMAGE` | 8 HP (`8 * speedMult`) |
| Vida del proyectil | `PROJECTILE_LIFE_SEC = 9.0` s |
| Regla de cercanía | no dispara si `dist <= radius + 2.0` |

- Impacto en Nyx: `onPlayerHit(8*mult)` **+** `onOctopusInk(INK_STAIN_SEC, INK_STAIN_OPACITY)`
  = mancha 3.0 s al 55 % de opacidad con DoT ácido.
- Si choca con un slab: explota (VFX radio 1.3, color `0xff2a3a`) y se desactiva.
- `kind = 'ink_ball'`, shader de plasma rojo carmesí (`inkProjectileMaterial`: wobble de vértices 0.085,
  Fresnel ×1.65, motas estelares), escala `1`, nace 1.2 m delante del manto.

### 4.4 Ataque 2 — Bola Gigante de Dispersión

| Constante | Valor |
|---|---|
| `OCTOPUS_GIANT_CHARGE_SEC` | 20.0 s (barra interna de energía) |
| `OCTOPUS_GIANT_WINDUP_SEC` | 0.8 s (fallback; con GLB manda la duración real de `octopus_giant_charge` = **1.20 s**) |
| `OCTOPUS_GIANT_SCALE` | 2.6 |
| `OCTOPUS_GIANT_DETONATE_DIST` | 12.0 m (+ `PROJECTILE_PLAYER_RADIUS 1.6` → detona a **13.6 m**) |
| `OCTOPUS_SPLIT_TOTAL` | 15 bolas |
| `OCTOPUS_SPLIT_BURST` | 3 por ráfaga (5 ráfagas) |
| `OCTOPUS_SPLIT_GAP` | 0.16 s entre ráfagas |
| `OCTOPUS_SPLIT_SPREAD` | 0.12 rad dentro de cada ráfaga |
| `OCTOPUS_SPLIT_AUTOAIM` | 0.35 rad/s de corrección leve |
| `OCTOPUS_GIANT_EXPLODE_COLOR` | `0xff2a3a` |

- La Bola Gigante viaja a 30 m/s con `decel 1.0`, escala `2.6`, vida 9.0 s y **daño directo 0**: su
  función es detonar por proximidad. Si toca un slab, explota sin dividirse (VFX 2.8).
- Al detonar: `enqueueOctopusSplit` con 15 bolas en 5 tandas de 3, cada bola con daño `8 * speedMult` y
  `autoAimRate 0.35`. Sin slot de dispersión libre, las 15 salen en un único abanico con separación
  `(i - 7) * 0.055` rad.
- En windup no hay bolas base (`return` explícito) y tampoco dispara si Nyx está a `radius + 2.0`.

### 4.5 Contra-Parry (ventana de alerta)

Se ejecuta en dos rutas equivalentes:

1. **Proactiva** en `updateOctopusOffense`: `playerKickAnim && distToNyx <= radius + 3.0` **y**
   `dashTimer <= 1.5` **y** `dashTimer >= 0.1` **y** `counterTimer <= 0`.
2. **API** `tryOctopusCounterParry` (mismo rango de `dashTimer`, sin exigir patada; devuelve 0 si no).

Efectos de `executeOctopusCounterParry` (`:3395-3441`):
- Giro instantáneo a la cara de Nyx (`lookAtQuat` aplicado directo, sin slerp).
- Clip `octopus_counter_parry` (real **0.50 s**; fallback `OCTOPUS_COUNTER_CLIP_SEC = 0.8`).
- Chorro de tinta negra (`onEnemyExplode`) en `pos + dir * radius*0.9`, radio `radius*1.4`, color
  `0x080310` (sin bola roja).
- Dash de escape lateral: `dir = perp(side, signo aleatorio) + up*0.22`, a
  `30 * 1.6 = 48.0 m/s` durante `0.55 s`; resetea `dashTimer = 5.0`.
- Devuelve la duración de mancha `5.0 + rng * (10.0 - 5.0)` s (aleatorio 5–10 s), aplicada por el loop
  con `INK_COUNTER_OPACITY = 0.65`.

Tinta ácida (HUD + DoT, `DomeCombatSystem.ts:113-130`, `:409-448`):

| Constante | Valor |
|---|---|
| `INK_DOT_PER_SEC` | 4.0 HP/s |
| `INK_STAIN_SEC` | 3.0 s (bola base) |
| `INK_STAIN_OPACITY` | 0.55 |
| `INK_COUNTER_OPACITY` | 0.65 |
| `INK_COUNTER_MIN_SEC` / `MAX_SEC` | 5.0 / 10.0 s |
| `INK_FADE_IN_SEC` / `INK_FADE_OUT_SEC` | 0.12 / 0.45 s |

- `applyOctopusInkAttack(duration, opacity)` fija `inkBlindTimer` y devuelve
  `round(4 * duration)` como daño pendiente (12 HP por bola base, 20–40 HP por contra-parry).
- `updatePlayerStatus`: acumulador fraccionario del DoT (4 HP/s durante toda la mancha, sin cortar el
  movimiento de Nyx) e intensidad de mancha `opacity * fadeIn * fadeOut`.
- El HUD recibe la intensidad (`syncPayload.inkOverlayIntensity`, `domeGameLoop.ts:1201`) y hay un
  "flash" de impacto en `DomeHudSketch.tsx:282-288` cuando sube más de 0.12.

### 4.6 Contadores / debilidades

- **Ventana vulnerable real**: los primeros 4.0 s del ciclo de 5.0 s. Un golpe conectado ahí (sin esquive
  ni contra-parry) recibe el impacto completo y reproduce `octopus_hit` (real **0.27 s**, fallback 0.45).
- **Contra-parry del pulpo** (últimos 1.5 s del ciclo, `dashTimer` en `[0.1, 1.5]`): anula el impacto
  (0 daño, 0 knockback), se gira al instante, escupe tinta a bocajarro (5–10 s al 65 %, DoT 4 HP/s) y
  huye a 48 m/s. Atacar con patada a `<= radius + 3.0` dentro de esa ventana es el error.
- **Bolas de tinta capturables**: `captureInkBallsInRadius` (`:3342-3364`) captura `kind === 'ink_ball'`
  (no las gigantes) dentro del radio del Campo Gravitacional de Nyx
  (`NYX_HITBOX_RADIUS_M 0.85 + [2.0, 2.5, 3.0, 4.0, 5.0]` por nivel, `DomeSkills.ts:107-108`),
  ocupando los primeros slots del plan en vez de rocas: 90 de daño y `hitRadius 0.85` al dispararlas,
  **sin** full auto-aim (`DomeSkills.ts:115-116`, `:923-927`, `:830-834`).
- 55 de carne: penetración por fuerza ≥55 (o taladro).
- No hay ataque a bocajarro a propósito (regla `radius + 2.0` sin bolas) y el dash de 30 m/s no corrige
  en vuelo.

### 4.7 Animación, rig y shader

Modelo: `spiral_octopus.glb`, skin de **15 joints**: `root`, `mantle`, `neutral_bone` y los tentáculos
`tentacle_{0..3}_{1..3}` (4 tentáculos × 3 segmentos = 12). Mallas: `flesh`, `star_core`.
`collectTentacleBones` (`DomeWaveManager.ts:587-606`) ordena por nombre y asigna amplitud
`segment <= 1 ? 0.32 : 0.45`.

| Clip | Duración real | Bucle | Uso |
|---|---|---|---|
| `octopus_idle_observe` | 2.00 s | sí (`idle`/`observe`) | reposo vigilando |
| `octopus_pre_dash_ready` | 0.80 s | sí (`ready`) | ventana de alerta (últimos 1.5 s) |
| `octopus_dash_propel` | 0.67 s | one-shot | `dashActive > 0` |
| `octopus_shoot_ball` | 0.47 s | one-shot | disparo base (fallback 0.5 s) |
| `octopus_giant_charge` | 1.20 s | one-shot | windup de la Bola Gigante (fallback 0.8 s) |
| `octopus_counter_parry` | 0.50 s | one-shot | contra-parry (fallback 0.8 s) |
| `octopus_hit` | 0.27 s | one-shot | flinch (fallback 0.45 s) |

Prioridad de selección (`:4346-4363`): flinch > contra-parry > carga gigante > disparo > dash > alerta >
reposo, con crossfade `0.12 s` y reinicio forzado cuando la FSM re-dispara.
`octopusClipSec` (`:3382-3385`) devuelve `max(1/30, duración real del clip)` si el GLB lo tiene.
Materiales: carne nebulosa morada (`0x2e1065`-`0x581c87`, nebular `0x6b21a8`-`0x9333ea`) con rim
`0xc084fc`, estrella dorada cel.

---

## 5. `lightning_butterfly` — Mariposa Relámpago

Fuente: `domeButterflyBehavior.ts` (constantes `:75-101`) + `DomeWaveManager` (bola eléctrica,
captura/reflejo, shader) + `DomeSkills.ts` (imán 100 %).

### 5.1 Stats

`maxHp 31`, `radius 1.2`, `fleshThickness 8`, `expValue 1.5`, `weakPoints 1`, `evasive false`.
31 HP calibrado contra el daño de rocas (`DomeSkills.rockStats`): pequeña 15, mediana 32, grande 58 →
aguanta 2 pequeñas (30) y muere con 1 mediana (32) o con una bola eléctrica devuelta.

### 5.2 Movimiento, energía y FSM

Estados (`ButterflyState`): `'hover' | 'dash' | 'dash_pivot' | 'shoot_ball' | 'beam' | 'hit'`.

| Constante | Valor |
|---|---|
| `BUTTERFLY_BOUND` | `88.6 - 10.0` = **78.6 m** (contención en la cúpula) |
| `BUTTERFLY_BASE_SPEED` | 10.0 m/s |
| `BUTTERFLY_ENERGY_MAX` | 100.0 |
| `BUTTERFLY_RECHARGE_PER_SEC` | 28.0 (solo en `hover`) |
| energía inicial | 65 (también tras `resetButterflyState`) |
| `BUTTERFLY_DASH_SEC` | 0.8 s |
| `BUTTERFLY_DASH_SPEED` | 35.7 m/s (`min(35.7, 35.7 * speedMult)`) |
| `BUTTERFLY_EVADE_DASH_SPEED` | 45.0 m/s (dash de evasión sin auto-aim) |
| `BUTTERFLY_PIVOT_SEC` | 0.2 s |
| `BUTTERFLY_BURST_CD_MIN` / `MAX` | 1.5 / 2.0 s |
| `BUTTERFLY_BALL_COST` | 14.0 |
| `BUTTERFLY_BALL_DURATION` | 0.45 s |
| `BUTTERFLY_BALL_FIRE_AT` | 0.16 s |
| `BUTTERFLY_BALL_CD_MIN` / `MAX` | 2.2 / 3.1 s |
| `BUTTERFLY_BALL_MIN_RANGE` | 13.5 m |
| `BUTTERFLY_BEAM_RANGE` | 14.5 m (sale a `> range + 2.5` = 17.0 m) |
| `BUTTERFLY_BEAM_START_COST` | 14.0 |
| `BUTTERFLY_BEAM_DRAIN_PER_SEC` | 42.0 /s |
| `BUTTERFLY_BEAM_TICK_SEC` | 0.42 s |
| `BUTTERFLY_BEAM_TICK_DAMAGE` | 7 HP |
| `BUTTERFLY_CLIP_FADE_SEC` | 0.08 s |
| `BEAM_SEGMENTS` | 9 |
| `hoverStrafePhase` | `+= dt * 1.9` |

**`hover`** (estado por defecto), orden de decisión:
1. Recarga `energy += 28 * dt` (tope 100).
2. Si `burstCooldown <= 0` y `detectsIncomingThreat(...)` → `burstDashesLeft = floor(random * 5)`
   (0–4) y arranca dash: **ráfaga total 1–5 dashes**.
3. Si `distToPlayer <= 14.5` y `energy >= 14` → `beam` con `beamDamageTimer = 0.08` (primer tick casi inmediato).
4. Si `distToPlayer >= 13.5` y `ballCooldown <= 0` y `energy >= 14` → `shoot_ball`
   (`energy -= 14`, `stateTimer = 0.45`, `ballFired = false`).
5. Hostigamiento frontal: objetivo
   `playerPos + aimForward*20 + side*sin(phase)*8 + up*cos(phase*0.8)*3.5`, recortado a 78.6 m de radio;
   `velocity.lerp(targetVel, 1 - exp(-5*dt))` con `targetVel` de módulo `10 * speedMult`;
   `faceTowards(9.0 rad/s)`; clip `butterfly_fast_flap`.

**`dash`** (0.8 s): perfil de velocidad `progress = 1 - stateTimer/0.8`;
`speedProfile = progress > 0.78 ? max(0.18, (1 - progress)/0.22) : 1.0` (freno seco en el 78–100 %);
`faceTowards(18 rad/s)`; clip `butterfly_electric_dash` (reinicio forzado al entrar).
Al terminar: `velocity = dirToPlayer * 10` y `finishBurstOrCooldown`:
si quedan dashes → `dash_pivot` (0.2 s, `velocity *= exp(-9*dt)`, `faceTowards 20 rad/s`,
clip `butterfly_dash_pivot`); si no → `burstCooldown = 1.5 + random * 0.5`.

**`shoot_ball`**: si hay amenaza y sin cooldown de ráfaga → evasión
(`burstDashesLeft = floor(random*4) + 1`, es decir **2–5 dashes totales**). Si no: deriva frontal a
`4 m/s` (`lerp` con `1 - exp(-4*dt)`), `faceTowards 12 rad/s`, clip `butterfly_shoot_ball`
(reinicio forzado al entrar); a los 0.16 s dispara la bola eléctrica desde el hueso `head` y al acabar
`ballCooldown = (2.2 + random*0.9) / max(1, speedMult * 0.9)`.

**`beam`**: drena `42/s`, deriva frontal a `3.5 m/s` (`1 - exp(-5*dt)`), `faceTowards 12 rad/s`,
clip `butterfly_lightning_beam`; el arco se dibuja desde `head` a Nyx con `BEAM_SEGMENTS = 9` puntos y
jitter `0.55` en senos de 55/49/61 rad/s; daño `7` cada `0.42 s` (`beamDamageTimer`).
Rompe el rayo y evade si hay amenaza con la ráfaga disponible; sale a `hover` si `energy <= 1.0` o
`distToPlayer > 17.0`.

**`hit`** (`hitTimer = 0.2` al recibir golpe, `notifyButterflyHit`): si `state !== 'dash'`,
`velocity *= exp(-5*dt)`, `faceTowards(10 rad/s)` y clip `butterfly_hit`.

**Modo pasivo** (entrenamiento): `velocity *= exp(-4*dt)`, mira a Nyx a 7 rad/s, `butterfly_fast_flap`,
rayo oculto.

Contención y colisión: fuera de 78.6 m se recoloca en el borde con `velocity -= radial * out * 1.25`;
`resolveSphereSlabCollision` con empuje por `normal * depth` y reflexión `-into * 1.2`.

### 5.3 Ataques

| Ataque | Daño | Cadencia / rango | Velocidad |
|---|---|---|---|
| Rayo Eléctrico (corto alcance) | 7 HP por tick | tick 0.42 s, rango 14.5 m, coste 14 + 42/s | continuo (arco) |
| Bola Eléctrica (largo alcance) | 10 HP | cooldown 2.2–3.1 s escalado, rango ≥13.5 m, coste 14 | `min(22.95, 22.95*speedMult)` = 22.95 m/s |
| Dash eléctrico | 0 (es movilidad) | ráfaga 1–5 dashes, cooldown 1.5–2.0 s | 35.7 m/s (45.0 en evasión) |

- Bola Eléctrica (`fireProjectile` con `kind = 'electric_ball'`, `damage 10`): vida **5.0 s**, escala
  `1.05`, material `electricProjectileMaterial` (core `0x091a45`, arco `0x38bdf8`, halo `0x7dd3fc`).
- **Auto-aim "energía llamando a energía"** (`updateProjectiles`, `:3951-3968`): con
  `nyxSpeed = |playerVelocity|`,
  `energyPull = clamp((nyxSpeed - 4.0) / 28.0, 0.04, 1.0)` y `aimRate = 0.25 + energyPull * 5.2` rad/s
  (0.25 a 5.45). Cuanto más rápido va Nyx, mejor la persigue.
- Al expirar su vida: VFX `onEnemyExplode(pos, 1.6, 0x38bdf8)`.
- El rayo se corta al morir, al entrar en `hit`/`dash` o al salir de rango.

### 5.4 Evasión: qué esquiva y qué no

`detectsIncomingThreat(pos, radius, playerPos, playerVel, playerAimForward, playerAttacking, incoming)`
(`:305-352`) devuelve verdadero si:

1. **Proyectiles/rocas lanzados por Nyx** (`incoming`, p. ej. rocas del Campo Gravitacional): con
   `speed >= 1.0`, distancia `<= 58.0 m`, `along > 0` (vienen hacia ella) y distancia perpendicular
   `<= radius + 8.5`.
2. `distToPlayer <= 11.5` (aproximación directa / melé / mira encima).
3. `playerAttacking && distToPlayer <= 32.0` con `aimForward.dot(dirToButterfly) >= 0.72`.
4. `playerVel.length() >= 15.0 && distToPlayer <= 26.0` con
   `playerVel.dot(dirToButterfly) / speed >= 0.76`.

Al arrancar el dash (`startElectricDash`, `:365-401`):
- `dashSpeed = esquivandoProyectil ? 45.0 : min(35.7, 35.7 * speedMult)`.
- Dirección: si hay proyectil, evasión perpendicular amplia
  (`side * 0.9 * signoAlterno + upLocal * (±0.38/0.42) + projDir * 0.18`); si no, patrón de 5:
  derecha limpia, izquierda agresiva, picado, diagonal superior, flanco frontal sobre `aimForward`.
  Cerca del borde (`|pos| > 0.82 * 78.6`) añade `0.65` hacia dentro.
- **Rompe el auto-aim de los proyectiles de Nyx**: `onBreakProjectileHoming(entityId, pos, 65)` →
  `DomeSkills.clearProjectileHoming(id, centro, 65)` pone `homingTarget = null` y `homingStrength = 0`
  a los proyectiles de Nyx que apuntaban a esa mariposa dentro de 65 m — **salvo** los marcados con
  `isButterflyMagnet` (`DomeSkills.ts:466-474`).
- No esquiva su propia Bola Eléctrica: los proyectiles del pool del manager no viajan en
  `incomingSkillProjectiles` (solo los de `DomeSkills`), así que su bola no dispara la evasión.

### 5.5 Contadores / debilidades

- **8 de carne**: cualquier patada con fuerza ≥8 penetra. Es el enemigo más frágil del quinteto.
- **31 HP**: 2 rocas pequeñas (15 + 15) o 1 mediana (32) la matan; el dash evasivo no protege de un
  golpe ya conectado.
- **Bola Eléctrica capturada (Campo Gravitacional) = contra letal**:
  `captureElectricBallsInRadius` (`DomeWaveManager.ts:1958-1980`) captura `kind === 'electric_ball'`;
  `DomeSkills.triggerGravityField` las adopta con shader híbrido, `damage 140` y `hitRadius 1.1`.
  Al dispararlas (`fireOneGravityRock`, `DomeSkills.ts:815-858`): `speed 52`, vida `5.0`,
  `damage 140`, `hitRadius 1.15`, `isButterflyMagnet = true`.
  El imán (`:1470-1488`) ignora toda física: persigue a la mariposa con
  `magnetSpeed = min(220, 48 + 380 / max(1.2, dist))` y mantiene `remainingLife >= 0.5`. No hay
  `clearProjectileHoming` que lo rompa.
- **Reflejo con Empuje** (`reflectElectricBallsInRadius`, `:1982-2026`): las bolas eléctricas activas en
  el radio pasan a `kind = 'electric_ball_reflected'`, `damage 38`, vida `3.5`, velocidad `46`,
  `autoAimRate 4.5`, escala `1.2`, material `reflectedElectricMaterial` (verde: `0x064e3b` / `0x34d399`
  / `0x67e8f9`) y persiguen al enemigo vivo más cercano a <75 m; al impactar, 38 HP directos
  (`fleshThickness` intacta) y VFX `0x34d399`.
- El rayo exige `energy >= 14` y drena 42/s: tras ~2.4 s de rayo se queda seca y vuelve a `hover`
  (recarga 28/s).
- Fuera de la ventana de ráfaga (`burstCooldown > 0`) es completamente vulnerable: no puede esquivar.
- No puede atravesar slabs (rebote) y se queda dentro de 78.6 m: es acorralable contra el borde.

### 5.6 Animación, rig y shader

Modelo: `lightning_butterfly.glb`, skin de **9 joints**: `root`, `body`, `head`,
`wing_top_L_inner`, `wing_top_L_outer`, `wing_top_R_inner`, `wing_top_R_outer`, `wing_bot_L`,
`wing_bot_R`. Mallas: `flesh.001`, `star_core` y los detalles `detail_body`, `detail_head`,
`detail_wing_top_L`, `detail_wing_top_R`, `detail_wing_bot_L`, `detail_wing_bot_R` (material `mat_detail`).

| Clip | Duración real | Bucle | Uso |
|---|---|---|---|
| `butterfly_fast_flap` | 0.40 s | sí (`fast_flap`) | `hover` y modo pasivo (clip de reposo por defecto) |
| `butterfly_electric_dash` | 0.80 s | one-shot | `dash` |
| `butterfly_dash_pivot` | 0.20 s | one-shot | `dash_pivot` |
| `butterfly_shoot_ball` | 0.47 s | one-shot | `shoot_ball` |
| `butterfly_lightning_beam` | 0.60 s | sí (`lightning_beam`) | `beam` |
| `butterfly_hit` | 0.20 s | one-shot | flinch (`hitTimer = 0.2`) |

`playButterflyClip` (`:216-239`) hace `fadeOut/fadeIn` de `0.08 s` y `reset()`; sin `actions`, la mariposa
se anima solo por código.

**Rig** `ButterflyRig` (`collectButterflyRig`, `:1101-1131`): `root`, `body`, `head`, `wingTopLInner`,
`wingTopLOuter`, `wingTopRInner`, `wingTopROuter`, `wingBotL`, `wingBotR` + `quartzMaterials` (todo
material con uniform `uCharge`).

**Shader de Cuarzo Eléctrico** `createButterflyQuartzMaterial` (`:371-459`), aplicado a **todas** las
mallas `detail_*` de la mariposa (no a `flesh` ni a `star_core`):
- Uniforms: `uTime`, `uCharge`, `uEmissiveBoost`.
- Facetado por `floor(|dot(N, (0.42, 0.78, 0.46))| * 4.5) / 4.5`, con
  `quartzDeep (0.08, 0.22, 0.48)`, `quartzMid (0.16, 0.62, 0.88)`, `quartzSpec (0.76, 0.96, 1.0)`.
- Ranuras con arcos piezoeléctricos: dos `qNoise` desplazados en el tiempo (`7.0/-5.2/3.8`,
  `11.5/8.4/-6.0`), `ridge = 1 - |n1*2 - 1|`, `groove = smoothstep(0.82, 0.985, ...)`,
  `pulse = 0.55 + 0.45*sin(uTime*28 + x*9 + y*11)`,
  `arcIntensity = groove * pulse * (0.65 + uCharge*1.45)`.
- `alpha` entre 0.74 y 0.96 (más alto con Fresnel/arcos); contorno de tinta `0x7dd3fc` de grosor
  `0.04 * enemyInkScale`.
- `uCharge` alimentado en `updateButterflyEnemy` con `chargeVisual`: `energy/100` en `hover`,
  `1.4` en `dash`, `1.15` en `dash_pivot`, `1.1` en `shoot_ball`, `1.5` en `beam`.

**VFX de líneas** (`ensureButterflyVfx`, `:157-207`):
- Rayo `head → Nyx`: `THREE.Line` con `LineBasicMaterial` `0x7dd3fc`, opacidad 0.95, aditivo,
  `depthWrite: false`, `(9+1)*3` posiciones con jitter 0.55.
- Estela del dash: `12 * 3` puntos de `trailOrigin → pos`, color `0xa5f3fc`, opacidad
  `trailAlpha * 0.92`, jitter `sin(elapsed*45 + i*2.1) * 0.35`, decae `trailAlpha -= dt * 3.1`.

**Materiales de cuerpo**: carne nebulosa con rim `0x38bdf8` (paleta base `0x164e63`), estrella dorada cel.

---

## 6. Tabla comparativa final (solo datos del código)

| | `abyssal_cell` | `crab_gunner` | `ground_golem` | `spiral_octopus` | `lightning_butterfly` |
|---|---|---|---|---|---|
| HP | 40 | 60 | 140 | 70 | 31 |
| Radio | 1.6 | 1.8 | 3.2 | 2.2 | 1.2 |
| Carne | 15 | 35 | 80 | 55 | 8 |
| EXP | 1.0 | 1.25 | 2.0 | 1.5 | 1.5 |
| Puntos débiles | 1 | 1 | 1 | 1 | 1 |
| Evasivo genérico | no | no | no | no | no |
| Movilidad | reptado 14 / huida 26 / lunge 30 m/s | slab + salto (0.75–2.4 s, arco 2.5–9 m) | rotor 15 / cargas 28-20 m/s | dashes libres 30 m/s cada 5 s | 10 m/s + dashes 35.7 (45 evasión) |
| Energía interna | — | — | stamina 100 | barra Bola Gigante 20 s | 100 (recarga 28/s) |
| Ataque principal | lunge 8 HP | láser 20 HP/s + ráfaga 2×3 + kamikaze 50/35/20 | puñetazo 16 + cargas 12/18 | bola 8 + tinta 3 s/55 % + Bola Gigante 15×8 | rayo 7/0.42 s + bola 10 |
| Estado aplicado a Nyx | — | — | — | tinta ácida (DoT 4 HP/s) | — |
| Counter clave | dirección fijada en windup + token 2.5 s | telegraph sellado a los 1.65 s; ráfaga parryable | pared solo frontal (dot 0.25) + parry 35 % | contra-parry 48 m/s + ventana 4.0 s | roca mediana 32 / bola capturada 140 |
| Clips GLB | 8 | 10 | 10 | 7 | 6 |
| Joints del skin | 4 | 12 | 9 | 15 | 9 |
| Shader distintivo | nebulosa `uOpacity 0.62`, rim `0xf59e0b` | nebulosa rim `0xff2a9d` + cel de cañón | nebulosa rim `0xff2a9d` + puño neón `0x39ffb0` | nebulosa morada rim `0xc084fc` + tentáculos | Cuarzo Eléctrico `uCharge` + rayos aditivos |

---

## 7. Notas de verificación y discrepancias encontradas

Datos comprobados dos veces (lectura completa + `grep` de constantes) y, para animación/rig, contra el
JSON de los `.glb` reales. Discrepancias o matices honestos:

1. `CRAB_LASER_FIRE_TURN_RATE = 1.2` está declarada en `domeCrabBehavior.ts:73` pero **no se usa**: en
   `laser_fire` el haz queda fijo en la última dirección apuntada (no hay barrido).
2. `GOLEM_ENGAGE_MAX_DIST (30.0)`, `GOLEM_GAMBLE_MIN_DIST (20.0)` y `GOLEM_CHARGE_MIN_DIST (4.5)` están
   exportadas pero la FSM no las consulta; los cortes reales son 5.0 / 20.0 / 30.0.
3. El comentario de cabecera del gólem dice corrección en vuelo de "0.35/0.18 rad/s", pero las constantes
   efectivas son `GOLEM_THIN_TURN_IN_FLIGHT = 0.45` y `GOLEM_THICK_TURN_IN_FLIGHT = 0.22`.
4. `OCTOPUS_DASH_ALERT_SEC = 1.5` s (algunos comentarios dicen "el último segundo"); la ventana real de
   contra-parry es `dashTimer ∈ [0.1, 1.5]` y `<= 1.5` para el clip de alerta.
5. Las duraciones de los one-shot del pulpo salen del clip real (`octopusClipSec`): 1.20 s de carga,
   0.47 s de disparo, 0.50 s de contra-parry, 0.27 s de flinch. Los `OCTOPUS_*_CLIP_SEC` son solo
   fallback si el GLB no trae el clip.
6. La Bola Gigante del pulpo se lanza con daño 0: nunca daña al impactar, siempre detona a 13.6 m
   (12.0 + radio de Nyx 1.6) y reparte 15 bolas de 8 HP.
7. La velocidad de la Bola Eléctrica es `min(22.95, 22.95 * speedMult)` → **siempre 22.95 m/s**.
8. El recuento de dashes de la mariposa difiere por origen: desde `hover` son 1–5
   (`burstDashesLeft = floor(random*5)`), desde `shoot_ball`/`beam` son 2–5 (`floor(random*4) + 1`).
9. Cooldown de la bola eléctrica: `(2.2 + random*0.9) / max(1, speedMult*0.9)`; con `speedMult = 1` son
   2.2–3.1 s.
10. La Célula no tiene ataque a distancia ni energía: su única fuente de daño es el lunge por contacto.
11. El gólem no tiene clip propio de `observe`: ese estado reutiliza `golem_helicopter_loop`.

---

## 4. Élites, Boss Final KRONOS, IA Adaptativa, Oleadas y Entrenamiento

# 04 — Enemigos de élite, Boss Final, IA adaptativa, oleadas y entrenamiento

Documento de extracción técnica verificada sobre el código de la Cúpula (modo
Arcade Roguelike de OUTORBIT). Solo datos del juego: constantes, fórmulas,
estados y valores exactos tal como están escritos en el código fuente, con
referencia `archivo:línea`.

Método: cada archivo obligatorio se leyó completo y después se hizo una
segunda pasada de verificación (grep/sed dirigido) sobre cada bloque de
constantes citado. Los nombres de clips y de nodos de los GLB se verificaron
además leyendo el JSON interno de los `.glb` en `public/models/enemies/`.

---

## 0. Tabla de arquetipos élite/boss (fuente única de stats)

`src/game/dome/DomeCombatSystem.ts:157-177` — `DOME_ENEMY_ARCHETYPES`.

| arquetipo | maxHp | radius | fleshThickness | expValue | isElite | isBoss | weakPoints | evasive |
|---|---|---|---|---|---|---|---|---|
| `giant_sparrow` | 520 | 4.5 | 85 | 3.0 | true | false | 2 | false |
| `prisma_necroz` | 300 | 3.8 | 65 | 3.0 | true | false | 1 | false |
| `kronos_leviathan` | 4 | 3.2 | 90 | 10.0 | false | true | 4 | false |

Notas de código sobre estos valores:

- `kronos_leviathan.maxHp = 4`: "la barra genérica de HP NO existe — su vida
  son 4 Estrellas Dorsales (hp 4 = 1 punto por estrella; se rompen en el
  manager con las reglas anti-skip, jamás vía `computeKineticImpact`). El radio
  de su esfera es el de la CABEZA" (`DomeCombatSystem.ts:171-175`).
- `createDomeEnemyEntity` copia `weakPointsRemaining: stats.weakPoints` y
  `evasive: stats.evasive` (`DomeCombatSystem.ts:201-206`), y el manager
  sobreescribe `entity.evasive = EVASIVE_ARCHETYPES.has(archetype)`
  (`DomeWaveManager.ts:1636`), con `EVASIVE_ARCHETYPES` vacío
  (`DomeWaveManager.ts:221`): `evasive` es `false` para todos.
- Élites y Boss son inmunes a la Regla de la Barrera Blanca:
  `checkDomeBarrierKill` devuelve `false` si `enemy.isBoss || enemy.isElite`
  (`DomeCombatSystem.ts:360-370`).

### 0.1 Penetración de carne y estrella (aplica a los tres)

`src/game/dome/DomeCombatSystem.ts:96-110`

| constante | valor | efecto |
|---|---|---|
| `DRILL_FORCE_MULTIPLIER` | 1.55 | fuerza ×1.55 si el golpe es Patada Taladro |
| `FLESH_WEAR_PER_FORCE` | 0.18 | carne desgastada por punto de fuerza sin penetrar |
| `FLESH_DAMAGE_PER_FORCE` | 0.9 | daño parcial por punto de fuerza contra la carne |
| `STAR_DAMAGE_PER_FORCE` | 2.2 | daño por punto de fuerza al penetrar la estrella |
| `STAR_DAMAGE_MIN_FRACTION` | 0.34 | suelo de daño = `maxHp * 0.34` al penetrar |
| `KNOCKBACK_PER_FORCE` | 0.35 | knockback por punto de fuerza |
| `KNOCKBACK_PENETRATED_SCALE` | 0.35 | reducción del knockback si Nyx atraviesa |
| `HITSTOP_BASE / PENETRATE / KILL` | 0.045 / 0.09 / 0.12 s | hit-stop |
| `THORNS_DAMAGE_TO_NYX` | 8 | daño a Nyx al golpear pinchos de Necroz (`:137`) |

Reglas de penetración (`DomeCombatSystem.ts:292-330`):

- `kineticForce = impactSpeed * speedForceMultiplier * (isDrill ? 1.55 : 1.0)`.
- Si `bypassFlesh || mouthExposed || vulnerable || kineticForce >= fleshThickness`
  → penetración directa: `weakPointsRemaining--` y
  `damage = Math.max(kineticForce * 2.2, starFloor)`.
  - `starFloor = (isElite && !isDrill && impactSpeed < 16) ? 0 : maxHp * 0.34`.
- Si no penetra: `wear = min(fleshThickness, kineticForce * 0.18)` (la carne se
  desgasta de forma permanente) y `damage = kineticForce * 0.9`.
- `mouthExposed = archetype === 'giant_sparrow' && mouthOpen === true`
  (`:314`), `vulnerable = (vulnerableTimer ?? 0) > 0` (`:315`).
- Con `enemy.spikesActive` el impacto devuelve `damage: 0`,
  `reason: 'thorns_repel'` y `recoilBounce: true` (`:295-303`).

---

## 1. `prisma_necroz` — Prisma Necroz (élite 2, ronda 10)

Archivo: `src/game/dome/domeNecrozBehavior.ts` (940 líneas).
Cabecera: "Fortaleza estacionaria de IA Perfecta & Pereza extrema" (`:5-7`).

### 1.1 Stats y anclaje

| dato | valor | ref |
|---|---|---|
| HP | 300 | `DomeCombatSystem.ts:170` |
| radio | 3.8 | idem |
| carne | 65 | idem |
| EXP | 3.0 | idem |
| puntos débiles | 1 (`star_core` en el pecho) | idem + GLB |
| posición | fija en `(0, 0, 0)` | `domeNecrozBehavior.ts:710-713` |
| spawn home | `new THREE.Vector3(0, 0, 0)` | `DomeWaveManager.ts:1611-1613` |

`updateNecrozEnemy` fuerza cada frame
`enemyPos.set(0,0,0); enemyVel.set(0,0,0); mesh.position.set(0,0,0)`
(`:710-713`). **No hay teletransporte ni desplazamiento**: la "movilidad" del
élite es rotación de la malla y del escudo.

### 1.2 Rotación y "pereza" visual

- `NECROZ_ROT_SPEED_RAD = degToRad(25)` → 25 °/s (`:9`).
- `yawRad = (yawRad + 0.4363 * dt) % 2π`; la malla se orienta con
  `mesh.rotation.set(pitchRad, yawRad, rollRad)` donde
  `pitchRad = sin(yawRad * 0.6) * 0.28` y `rollRad = cos(yawRad * 0.45) * 0.22`
  (`:730-733`). Es rotación en los 3 ejes, no giro plano.
- En Pasotismo Total (`slothTimer > 0`) la rotación se congela por completo
  (`:718-727`).
- `notifyNecrozHit` añade `yawRad += 0.95 rad` (≈54.4°) para que Nyx no pueda
  repetir el mismo hueco (`DomeWaveManager.ts:2886-2895`).

### 1.3 Escudo triangulado (mecánica central)

Construcción (`:128-226`):

- `NECROZ_SHIELD_PAD = 1.1` → `shieldRadius = enemy.radius (3.8) + 1.1 = 4.9 m`
  (`:10`, `:135`).
- Geometría: `IcosahedronGeometry(shieldRadius, 0)` sin indexar → 20 triángulos
  (`:136-140`). Cada triángulo guarda `v0/v1/v2`, `center`, `normal`,
  `buildOrder`, `intact`, `spikeH` (`:52-63`).
- `buildOrder` se ordena de +Z (frontal) a −Z (trasera): "propagación triángulo
  a triángulo" (`:171-178`).
- Malla: 3 sub-triángulos por triángulo (9 vértices) para poder extruir el
  4.º vértice; colores por cara de `PALETTE = [0x6d28d9, 0x9333ea, 0xc026d3,
  0x4338ca, 0xa855f7]` (`:180-198`).
- Material del escudo: `MeshBasicMaterial` con `vertexColors: true`,
  `transparent: true`, `opacity: 0.72`, `depthWrite: false`; nombre
  `necroz_crystal_shield`; hijo de `mesh` para rotar solidariamente a 25 °/s
  (`:200-215`).
- Tinta de bordes: `LineBasicMaterial` `0xf5d0fe`, `opacity 0.92`, 12 vértices
  por triángulo (`:217-230`).

Tiempos y reconstrucción:

| constante | valor | ref |
|---|---|---|
| `NECROZ_INITIAL_BUILD_SEC` | 1.0 s | `:11` |
| `NECROZ_REBUILD_SEC` | 4.0 s | `:12` |
| `NECROZ_REBUILD_MIN_BROKEN_FRAC` | 0.45 | `:13` |

- La construcción avanza `buildProgress += dt / buildDuration` y va marcando
  `intact = true` en los triángulos con `buildOrder <= buildProgress`
  (`:736-748`).
- Con `buildDuration > 1.5` (es decir, reconstrucción) y `laziness > 80`,
  aborta a medias (`:743-745`).
- Si le rompen triángulos mientras reconstruye (`n.building && buildDuration >
  1.5`) también aborta (`:459-462`).

Rotura e interacción:

- `tryBreakNecrozShieldTriangle(...)`: 1 roca pequeña / 1 habilidad a distancia
  destruye **1** triángulo intacto en la dirección del impacto; abre hueco
  físico real que rota con Necroz. Devuelve `true` si absorbió el golpe
  (`:440-470`).
- `findTriangleInDirection` busca el triángulo con mayor `dot` contra la
  dirección mundial transformada al espacio local del escudo (`:405-424`).
- `checkNecrozShieldBlock(...)` → `'blocked'` si el triángulo de esa dirección
  está intacto; `'passed_hole'` si no hay triángulo o está roto (`:427-442`).
- `getBrokenFraction` = triángulos destruidos / total (`:394-402`).

Respuestas en el bucle de juego (`src/ui/domeGameLoop.ts`):

- Habilidad/roca contra Necroz: si rompe un triángulo, **no** aplica daño y
  retorna; si la cara ya tenía hueco, el impacto entra a Necroz
  (`:431-441`).
- Golpe cuerpo a cuerpo con triángulo intacto en la dirección de Nyx →
  `punchCamera(0.25)` + `applySmashKnockback(dir, 26)` y **0 daño** (`:543-557`).
- Golpe que entra por el hueco → `notifyNecrozHit`, empuje de salida
  `applySmashKnockback(dir, 34)` con `dir.y += 0.25` normalizado (`:580-596`).
- Ruptura de triángulo suelta VFX: `onEnemyExplode(_aimDir, 2.2, 0xc084fc)`
  (`DomeWaveManager.ts:2869-2884`).

### 1.4 Pinchos frontales defensivos (`detail_spikes`)

Constantes (`:15-22`):

| constante | valor |
|---|---|
| `NECROZ_DEF_SPIKE_HEIGHT` | 1.5 m |
| `NECROZ_DEF_SPIKE_GROW_RATE` | 10.0 |
| `NECROZ_DEF_SPIKE_RANGE` | 22.0 m |
| `NECROZ_DEF_RUSH_RANGE` | 34.0 m |
| `NECROZ_DEF_IMPATIENCE_SEC` | 10.0 s |
| `NECROZ_DEF_RELUCTANCE_DELAY_SEC` | 0.25 s |
| `NECROZ_DEF_SPIKE_DAMAGE` | 12 HP a Nyx |
| `NECROZ_DEF_SPIKE_PUSH` | 24 m/s de empuje |

Lógica (`:757-800`):

- `approaching = normalize(-playerPos) · playerVelocity > 2.0`.
- `nyxNear = distToNyx <= 22.0 || (approaching && distToNyx <= 34.0)`.
- Si `nyxNear` y no están fuera: salen los pinchos, `defClipTimer = 0.4` y
  `+12` de Pereza.
- Con `laziness > 75` y sin acercamiento, primero espera
  `NECROZ_DEF_RELUCTANCE_DELAY_SEC` (0.25 s) de reticencia.
- Si ya están fuera: `+10/s` de Pereza y se retraen cuando Nyx se aleja o tras
  10 s de impaciencia.
- Altura de púa por triángulo: `spikeH += (1.5 − spikeH) * min(1, dt * 10)`
  (`:352-353`); se extruye el vértice `center + normal * spikeH` (`:354`).
- Colisión exacta por triángulo: solo si el triángulo apuntado está `intact`,
  `spikeH > 0.35` y `distToNyx <= shieldRadius + spikeH + 0.65`; entonces
  `onGolemSmash(12, dirNormalizadaDeNyx, 24)` con `defensiveHitCd = 0.65`
  (`:773-783`).

### 1.5 Púas ofensivas de la Esfera Blanca (pirámides de 75 m)

Constantes (`:25-35`):

| constante | valor |
|---|---|
| `DOME_SPIKE_BASE_RADIUS` | `DOME_PLAYER_BOUND_RADIUS − 3.6` = 88.6 − 3.6 = **85.0 m** |
| `DOME_SPIKE_HEIGHT` | 75.0 m |
| `DOME_SPIKE_GROW_SEC` | 2.3 s |
| `DOME_SPIKE_HOLD_SEC` | 2.0 s |
| `DOME_SPIKE_RETRACT_SEC` | 0.5 s |
| `DOME_SPIKE_POOL_SIZE` | 32 |
| `DOME_SPIKE_BASE_HALF` | 5.4 m |
| `DOME_SPIKE_PAIR_DELAY_SEC` | 0.9 s |
| `DOME_SPIKE_WAVE_INTERVAL_SEC` | 2.8 s |
| `DOME_SPIKE_DAMAGE` | 10 HP |
| `DOME_SPIKE_PUSH` | 22 m/s |

Comportamiento (`:511-706`):

- Base triangular equilátera inscrita en la esfera exterior (`b0/b1/b2` con
  radio 5.4, offsets −0.5/±0.866) (`:571-576`).
- La punta se orienta hacia Nyx pero queda **clampada** al área del triángulo
  base: `maxLateral = DOME_SPIKE_BASE_HALF * 0.48` (`:592-608`).
- Fases: `grow` (altura lerp 0.5 → 75 en 2.3 s) → `hold` (2.0 s) → `retract`
  (0.5 s) (`:611-631`).
- Si un suelo de la esfera (radio > 72.0 m) está a menos de
  `SPHERE_TILE_EXCLUDE_DIST = 15.5 m` de la base, la púa se retrae
  (`:474-475`, `:520-528`). Se buscan direcciones libres en 4 anillos de 8
  candidatas con paso `ring * 0.24` (`:493-511`).
- Colisión por **cualquier** parte de la pirámide: distancia mínima a eje y a
  las 3 aristas (`base→apex`) < 2.2 m → `onGolemSmash(10, dir, 22)` con
  `hitCooldown = 0.75` (`:674-693`).

### 1.6 Púas teledirigidas

`HOMING_SPIKE_SPEED = 5.0`, `HOMING_SPIKE_MIN_SEP = 1.0`,
`HOMING_SPIKE_INTERVAL = 0.45` (`:38-40`).

- Se invocan `playerPos + (0,-4,0)` normalizado, es decir **por debajo de Nyx**,
  como punto base sobre la esfera (`:862`).
- Se deslizan sobre la superficie a 5 m/s persiguiendo la proyección tangencial
  de Nyx (`:530-552`).
- No se emite otra si la base dista menos de 1.0 m de la anterior (`:864`).

### 1.7 Sistema de Pereza (0 → 100) y Pasotismo Total

Constantes (`:43-49`):

| constante | valor |
|---|---|
| `LAZINESS_DRAIN_PER_SEC` | 8.0 (solo cuando no hay acción en curso) |
| `LAZINESS_DEF_ACTIVATE` | 12.0 (coste de sacar pinchos defensivos) |
| `LAZINESS_DEF_HOLD_PER_SEC` | 10.0 (coste por segundo mantenidos) |
| `LAZINESS_HOMING_COST` | 4.0 (por púa teledirigida) |
| `LAZINESS_OFFENSIVE_PAIR_COST` | 6.0 (por pareja de púas ofensivas) |
| `LAZINESS_REBUILD_COST` | 45.0 (por reconstruir escudo) |
| `LAZINESS_SLOTH_DURATION_SEC` | 5.0 s |

Pasotismo Total: al llegar a 100 (`addLaziness`, `:698-710`)

- `slothTimer = 5.0`; deja de girar (0 °/s), `defensiveSpikesOut = false`,
  `building = false`, cancela `offensiveWavesLeft` y `homingLeft`.
- Durante el colapso: `laziness = (slothTimer / 5.0) * 100`, de modo que la
  barra baja a 0 durante los 5 s (`:719-723`).

Toma de decisiones ("IA Perfecta", `:869-905`), solo si no está ocupado
(`building || defensiveSpikesOut || offensiveWavesLeft > 0 || homingLeft > 0`):

1. Drena 8/s de Pereza.
2. Si `aiPauseTimer > 0`, espera.
3. Si `brokenFrac >= 0.45` y `laziness <= 55` → reconstruye escudo 4.0 s,
   `+45` Pereza y `aiPauseTimer = 1.6`.
4. Si no, y `laziness < 75`:
   - `nyxSpeed < 14.0 || !lastAttackWasHoming` → **Púas Teledirigidas**:
     `homingLeft = 4 + floor(random * 3)` (4–6), `aiPauseTimer = 2.4`.
   - En caso contrario (Nyx rápida) → **ráfaga de Púas Ofensivas**:
     `offensiveWavesLeft = 6 + floor(random * 5)` (6–10 oleadas de 2 en 2),
     `aiPauseTimer = 2.8`.
5. Con `laziness > 80` la ráfaga ofensiva en curso se cancela
   (`offensiveWavesLeft = 0`, `:812-814`).

Predicción de las púas ofensivas: `dir = playerPos + playerVelocity * 0.85`,
con desvío de la pareja `jitter = ±0.14` aplicado como
`x += jitter * 14; z -= jitter * 14` (`:819-829`).

### 1.8 Rig, clips y shaders

Rig `collectPrismaNecrozRig` (`DomeEnemyModels.ts:934-973`), GLB
`public/models/enemies/prisma_necroz.glb` (15 nodos, comentario: "11 joints +
detail_spikes"):

- huesos: `torso`, `head`, `tail`, `shoulder_L`, `shoulder_R`, `arm_L`,
  `arm_R`, `claw_L`, `claw_R`.
- malla secundaria: `detail_spikes` (`EnemyDetailMesh` con `restScale`).
- Nodos verificados en el GLB: `head`, `star_core`, `star_core_bone` (+ resto
  de la jerarquía). Color por arquetipo en el modelo: `color 0x4c1d95`,
  `rim 0xff2a9d` (`DomeEnemyModels.ts:36`).

Clips del GLB (verificados dentro del `.glb`):
`necroz_idle_fresh`, `necroz_idle_lazy`, `necroz_sloth_collapse`,
`necroz_shield_build`, `necroz_defensive_spikes`,
`necroz_summon_dome_spikes`, `necroz_hit`.

Selección de clip (`:904-935`):

| condición | clip |
|---|---|
| `slothTimer > 0` | `necroz_sloth_collapse` |
| `hitTimer > 0` | `necroz_hit` |
| `defClipTimer > 0` | `necroz_defensive_spikes` |
| `building` | `necroz_shield_build` |
| `offensiveWavesLeft > 0 \|\| homingLeft > 0` | `necroz_summon_dome_spikes` |
| reposo, `laziness >= 50` | `necroz_idle_lazy` |
| reposo, `laziness < 50` | `necroz_idle_fresh` |

Crossfade de 0.15 s; `sloth_collapse`, `hit` y `defensive_spikes` hacen
`reset()` antes de reproducir (`:922-934`).

Materiales del escudo: `MeshBasicMaterial` vertexColors (paleta violeta
arriba) y líneas `0xf5d0fe`. Rim del cuerpo: `PRISMA_NECROZ_BASE_RIM =
0xd9baff`; rim de pinchos activos `PRISMA_NECROZ_SPIKES_RIM = 0xff3b3b`
(`DomeWaveManager.ts:239-242`).

### 1.9 Discrepancias verificadas (código ejecutable vs. intención)

Datos comprobados con `grep` sobre todo `src/`:

1. `updateEnemyBehavior` **excluye** `prisma_necroz` del despacho ofensivo
   (`DomeWaveManager.ts:2649-2653`), y ese método tiene un solo call-site
   (`:2657`). Consecuencias reales:
   - el `case 'prisma_necroz'` que dispararía 2 esferas oscuras
     (`damage 10`, `speed 11 * speedMult`, abanico ±0.14 rad,
     `attackTimer = 2.4 / speedMult`) y abriría `vulnerableTimer = 1.8 s`
     (`:3011-3021`) es **inalcanzable**;
   - el setter `enemy.entity.spikesActive = near && !vulnerable`
     (`:2918-2922`) es el **único** escritor de `spikesActive`, por lo que en
     partida `spikesActive` permanece `false` y la rama genérica
     `thorns_repel` de `computeKineticImpact` (`DomeCombatSystem.ts:295-303`)
     no llega a ejecutarse;
   - `PRISMA_NECROZ_VULN_SEC = 1.8` (`:236`) solo se escribe en dos sitios
     (`:2513`, `:3018`), ambos inalcanzables → la ventana vulnerable del élite
     nunca se abre.
2. La ventana vulnerable tras "dash evasivo" depende de `enemy.evasive`, que es
   siempre `false` porque `EVASIVE_ARCHETYPES` es un `Set` vacío
   (`:221`, `:1636`, `:2480-2516`).
3. `updatePrismaNecrozPose` (`DomeWaveManager.ts:4382-4436`) **no tiene
   call-site** (el despacho de pose dice "Pose y clips gobernados por
   `updateNecrozEnemy`", `:2735-2736`). Por tanto no se aplican: el escalado
   procedural de `detail_spikes` (`~1.35` fuera / `~0.15` retraídos), ni el
   ondeo de brazos/garras/cabeza/cola/torso. Lo que sí corre cada frame es el
   bloque compartido: wobble de escala + `uEmissiveBoost`/`uRimColor` según
   `spikesActive` (`:2755-2790`).
4. Lo que **sí** constituye la ofensa y la defensa reales de Necroz es lo de
   `domeNecrozBehavior.ts`: escudo triangulado, pinchos defensivos (12 HP / 24
   m/s), pirámides de 75 m (10 HP / 22 m/s) y púas teledirigidas.

---

## 2. `giant_sparrow` — Gorrión Gigante (élite 1, ronda 5)

Archivo: `src/game/dome/domeSparrowBehavior.ts` (1113 líneas).
Cabecera: "Perseguidor de alta velocidad con IA perfecta en el presente
(lead = 0)" (`:12-32`).

### 2.1 Stats y 2 puntos débiles

| dato | valor | ref |
|---|---|---|
| HP | 520 | `DomeCombatSystem.ts:168` |
| radio | 4.5 | idem |
| carne | 85 | idem |
| EXP | 3.0 | idem |
| puntos débiles | 2 (pecho + boca) | idem |
| inmunidad a Barrera Blanca | sí (élite) | `DomeCombatSystem.ts:360-370` |

Los dos cristales existen también en el modelo: nodos `star_core_chest` y
`star_core_mouth` (`public/models/enemies/giant_sparrow.glb`, 20 nodos).
`star_core_mouth` solo es alcanzable con `mouthOpen === true`
(`DomeCombatSystem.ts:314`).

`mouthOpen` se enciende en estos estados (`domeSparrowBehavior.ts`):

| caso | valor | ref |
|---|---|---|
| `shriek` | `true` durante todo el chillido | `:655` |
| `drill_windup` / `drill_dive` | `true` | `:683`, `:700` |
| `crash_stun` | `true` | `:616` |
| disparo de `air_ball` | `airBallMouthTimer = 0.4 s` | `:1045`, `:1055` |
| resto (persecución, frenado, aleteo, dispersión, pasivo) | `false` | `:578`, `:639`, `:646`, `:724`, `:1060` |

### 2.2 Vuelo aerodinámico (constantes exactas, `:112-126`)

| constante | valor |
|---|---|
| `SPARROW_FLIGHT_BOUND` | `DOME_PLAYER_BOUND_RADIUS − 11.0` = **77.6 m** |
| `SPARROW_REAR_RING_DIST` | 14.0 m (centro del anillo trasero 10–18 m) |
| `SPARROW_CRUISE_SPEED` | 27.5 m/s |
| `SPARROW_BURST_CHASE_SPEED` | 35.1 m/s |
| `SPARROW_ACCEL` | 34.2 m/s² |
| `SPARROW_TURN_RATE_LOW` | 4.2 rad/s a baja velocidad |
| `SPARROW_TURN_RATE_HIGH` | 1.45 rad/s a alta velocidad |
| `SPARROW_DODGE_SCAN_RANGE` | 50.0 m |
| `SPARROW_DODGE_MIN_REACT_SEC` | 0.06 s |
| `SPARROW_DODGE_MAX_REACT_SEC` | 1.8 s |
| `SPARROW_DODGE_ACCEL` | 62.0 |
| `SPARROW_MELEE_EVADE_SEC` | 0.36 s |
| `SPARROW_MELEE_EVADE_CD` | 3.2 s |

Modelo de giro (`steerBirdVelocity`, `:305-360`):

- `speedRatio = clamp(curSpeed / 36.0, 0, 1)`;
  `effectiveTurn = lerp(maxTurnRate, 1.45, speedRatio²)`.
- Acelera a `accel * dt`; **frena** a `accel * 0.72 * dt` (la frenada es más
  suave que la aceleración).
- Banco visual: `bankRad += (targetBank − bankRad) * min(1, dt * 8)` (`:1082`).

Objetivo de persecución (`pursue`, `:861-890`):

- Anillo trasero: `playerPos − playerAimForward * 14.0 + side * weaveLateral +
  up * (weaveVert + 1.5)`, con
  `weaveLateral = sin(weavePhase) * 4.5` y
  `weaveVert = cos(weavePhase * 0.7) * 2.4`; `weavePhase += dt * 2.1`.
- Se clampea dentro de la esfera a 77.6 m.
- Velocidad objetivo: `35.1` si el offset > 20 m, `27.5` si no (× `speedMult`).

### 2.3 `air_ball` — Bola de Aire (0 daño, solo empuje)

| dato | valor | ref |
|---|---|---|
| cooldown | `1.45 + random*(2.05−1.45)` dividido por `max(1, mult*0.9)` | `:128-129`, `:1049-1052` |
| velocidad | 32.3 m/s × `speedMult` | `:130` |
| origen | hueso `jaw` (`rig.jaw.bone.getWorldPosition`) o centro del cuerpo | `:1035-1041` |
| condiciones | `airBallCooldown <= 0` y `distToPlayer` entre 8.5 y 65.0 m | `:1034` |
| pico abierto | `airBallMouthTimer = 0.4 s` | `:131`, `:1045` |
| daño al impactar | **0**; `onGolemSmash(0, dir, 24.0)` | `DomeWaveManager.ts:2602`, `:4067-4075` |

El proyectil se crea con `fireProjectile(enemy, targetPos, 'air_ball', 0,
speed, 0, origin)` (`DomeWaveManager.ts:2601-2603`); constante de empuje
`SPARROW_AIR_BALL_PUSH_SPEED = 24.0` (`:246`).

### 2.4 `wild_flap` — Aleteo Salvaje

| constante | valor |
|---|---|
| `SPARROW_WILD_FLAP_RANGE` | 11.5 m (dispara el estado) |
| `SPARROW_WILD_FLAP_PUSH_RANGE` | 13.8 m |
| `SPARROW_WILD_FLAP_DURATION` | 0.67 s |
| `SPARROW_WILD_FLAP_PEAK_AT` | 0.16 s (pico del empuje) |
| `SPARROW_WILD_FLAP_PUSH_SPEED` | 32.0 m/s |
| `SPARROW_WILD_FLAP_CD` | 2.5 s |

`src/game/dome/domeSparrowBehavior.ts:133-138`, estado `:631-657`:

- Frena con `exp(−4.8·dt)`.
- A los 0.16 s: si `distToPlayer <= 13.8` → `onGolemSmash(0, dirToPlayer, 32)`
  (0 daño, empuje de 32 m/s).
- Barrera de proyectiles: mientras `wildFlapWindupTimer <= 0.48 s` llama a
  `onDestroySkillProjectiles(pos + dirToPlayer * 3.5, 13.5)` (`:648-652`).

### 2.5 `shriek` — Garrido (chillido + sacudida de cámara)

| constante | valor |
|---|---|
| `SPARROW_SHRIEK_DURATION` | 0.9 s |
| `SPARROW_SHRIEK_SHAKE_SEC` | 2.5 s |
| `SPARROW_SHRIEK_CD` | 8.5 s |

`src/game/dome/domeSparrowBehavior.ts:140-142`, estado `:659-676`:

- `mouthOpen = true` (expone `star_core_mouth`).
- Onda sónica: durante los primeros 0.75 s
  `onDestroySkillProjectiles(pos, 14.5)`.
- `onSparrowShriek()` → `sparrowShriekPulse` → el game loop llama
  `audio.playSparrowShriek()` (`DomeWaveManager.ts:1926-1930`,
  `src/ui/domeGameLoop.ts:1227-1229`).
- Sacudida de cámara: `fade = min(1, shriekShakeTimer / 1.2)` y
  `sparrowCameraShake = max(sparrowCameraShake, 0.56 * fade)`
  (`DomeWaveManager.ts:2609-2612`), enviada al controller con
  `setKronosCameraShake(max(kronosFx.cameraShake, getSparrowCameraShake()))`
  (`domeGameLoop.ts:1226`).
- Se dispara de forma periódica solo si `distToPlayer` está entre 11.0 y 44.0 m
  y el cooldown está listo (`:838-848`).

### 2.6 `clone_split` — Dispersión (clon espejismo)

| constante | valor |
|---|---|
| `SPARROW_SPLIT_FACING_DOT` | 0.72 |
| `SPARROW_SPLIT_FACING_REACT_SEC` | 0.16 s |
| `SPARROW_SPLIT_MAX_RANGE` | 44.0 m |
| `SPARROW_SPLIT_DURATION` | 1.15 s |
| `SPARROW_SPLIT_CD` | 6.2 s |

`src/game/dome/domeSparrowBehavior.ts:144-148`, `beginCloneSplit` `:437-495`,
estado `:678-737`:

- Disparador: Nyx encara al Gorrión (`playerAimForward · toSparrow >= 0.72`)
  durante 0.16 s y el cooldown está listo (`:735-741`).
- `cloneRadius = clamp(dist, 11.5, 19.0)`.
- Arco de π radianes con suavizado `smoothT = t²(3−2t)`; posición real
  `playerPos + U*cos(angle)*r + V*sin(angle)*r*sign + N*sin(angle)*r*0.22`.
- El clon recorre el lado opuesto (`−sinA`, `−sin` en N) y encara a Nyx con
  banco `−targetBank`.
- Al entrar: `onBreakProjectileHoming(entity.id, pos, 32)` (`:742`).
- Al terminar: `velocity.clampLength(0, 27.5)` y el clon se oculta.
- Clon: `createSparrowMirageClone()` clona el GLB cacheado y le aplica
  `createComicCelMaterial(0x991b1b, { rimColor: 0x60a5fa, rimStrength: 1.15,
  emissiveBoost: 0.45 })` (`DomeEnemyModels.ts:757-782`).

### 2.7 `air_drill` — Taladro de Aire + `crash_stun`

| constante | valor |
|---|---|
| `SPARROW_DRILL_TRIGGER_SEC` | 25.0 s persiguiendo sin golpe ni taladro |
| `SPARROW_DRILL_WINDUP_SEC` | 0.45 s |
| `SPARROW_DRILL_DIVE_SEC` | 1.65 s |
| `SPARROW_DRILL_SPEED` | 49.4 m/s |
| `SPARROW_DRILL_ACCEL` | 115.0 |
| `SPARROW_DRILL_STEER_RATE` | 0.48 rad/s (giro muy limitado) |
| `SPARROW_DRILL_DAMAGE` | 25 HP |
| `SPARROW_DRILL_KNOCKBACK` | 65.0 m/s |

`:150-157`, estados `:739-800`:

- El acumulador `chaseTimer` crece solo fuera de `crash_stun`, `drill_windup`
  y `drill_dive` (`:592-596`); cualquier golpe lo pone a 0
  (`notifySparrowHit`, `:299-305`).
- En `drill_windup` fija `drillDir = dirToPlayer` y al terminar sale a
  `49.4 * 0.72 * speedMult`.
- En `drill_dive` persigue en el presente (`lead = 0`), tritura proyectiles en
  `entity.radius + 2.4` (`:762-764`) e impacta a Nyx si
  `dist < entity.radius + 1.85` → `onGolemSmash(25, dir, 65)` y rebote
  `velocity *= −0.25` (`:766-775`).
- Sin frenado posible: colisión con slab
  (`resolveSphereSlabCollision(..., entity.radius * 0.9, ...)`) →
  `enterCrashStun`. También `onSlabSmash(slab)` (`:777-788`).

`crash_stun` (`enterCrashStun`, `:420-437`; estado `:605-626`):

| constante | valor |
|---|---|
| `SPARROW_CRASH_STUN_SEC` | 2.5 s |
| `SPARROW_CRASH_DAMAGE` | 55 HP de daño propio |

- Refleja la velocidad contra la normal (`* 1.25`), `clampLength(0, 12)`.
- `vulnerableTimer = 2.5`, `mouthOpen = true` (los dos puntos débiles quedan
  expuestos).
- Al salir: `hardBrakeCooldown = 0.6` y `mouthOpen = false`.
- El daño se aplica a sí mismo en `DomeWaveManager.ts:2617-2625` (y si llega a
  0 muere por vía interna `onInternalKill`).

### 2.8 Frenado Rompesuelos vs. Estrellarse

| constante | valor |
|---|---|
| `SPARROW_HARD_BRAKE_MIN_SPEED` | 19.5 m/s |
| `SPARROW_HARD_BRAKE_SEC` | 0.56 s |
| `SPARROW_HARD_BRAKE_SMASH_AT` | 0.22 s |
| `SPARROW_HARD_BRAKE_CD` | 1.3 s |

`:159-162`, estado `:628-659`, detección `:923-950`:

- Solo con `curSpeed >= 19.5` y slabs activos. Raycast frontal con
  `brakeDist = curSpeed * 0.56 + radius`.
- `emergencyDist = curSpeed * 0.25 + radius`: si el slab está dentro de esa
  distancia → `enterCrashStun` inmediato ("se estrella sin poder frenar").
- Si hay margen y `hardBrakeCooldown <= 0` → entra en `hard_brake` y guarda el
  slab objetivo.
- A los 0.22 s del frenazo: `onSlabSmash(brakeTargetSlab)` (parte el suelo).
- Colisión física a alta velocidad en persecución (`intoSpeed >= 19.5`) →
  también `crash_stun`; impacto lento → empuje suave fuera del slab
  (`:952-968`).

### 2.9 Esquiva y destrucción de proyectiles (IA en el presente)

`computeProjectileDodge` (`:362-425`):

- Escanea proyectiles a ≤ 50 m; ignora los que ya pasaron (`along <= −radius`)
  y los que llegan con menos de 0.06 s o más de 1.8 s de margen.
- Solo considera los que pasarán a ≤ `radius + 5.5` m.
- Devuelve la distancia al proyectil más urgente (`urgency = 1/max(0.12,
  closingSec)`).

Respuestas en `pursue` (`:744-790`):

| condición | respuesta |
|---|---|
| `projDist <= 16.5` y `wildFlapCooldown <= 0` | `wild_flap` + destrucción en radio 13.5 |
| `projDist <= 15.5` y `shriekCooldown <= 0` | `shriek` + destrucción en radio 14.5 |
| `projDodgeBurstCd <= 0` | quiebro lateral `velocity += dodgeVec * 28 * mult`, `cd = 1.45` y `onBreakProjectileHoming(id, pos, 28)` |

Esquiva de ataque cuerpo a cuerpo (`:894-920`), exige
`playerAttacking && meleeDodgeCooldown <= 0 && 9.5 <= dist <= 25.0`, con
`13.5 <= playerSpeed <= 42.0`, `0.24 <= closingSec <= 0.85` y
`dot(velDir, toSparrow) >= 0.86`: salto lateral `velocity += evadeDir * 22 *
mult`, `meleeEvadeTimer = 0.36`, `meleeDodgeCooldown = 3.2`.

Destrucción de proyectiles (resumen):

| estado | radio / condición | ref |
|---|---|---|
| `wild_flap` | 13.5 m desde `pos + dir*3.5`, primeros 0.48 s | `:648-652` |
| `shriek` | 14.5 m desde el cuerpo, primeros 0.75 s | `:665-668` |
| `drill_dive` | `entity.radius + 2.4` cada frame | `:762-764` |
| dispersión / quiebro | `onBreakProjectileHoming` 32 m / 28 m | `:742`, `:786` |

### 2.10 Cámara lenta táctica (slow-mo)

`src/game/dome/domeSparrowBehavior.ts:1084-1101`:

- Se activa con `clone_split`, `hard_brake`, `wild_flap`, `drill_windup`,
  `meleeEvadeTimer > 0`, `drill_dive && dist <= 34.0` o
  `crash_stun && stateTimer >= 2.5 − 0.85`.
- `slowMoHoldTimer = max(slowMoHoldTimer, 0.72)` (hold mínimo 0.72 s).
- `targetSlowMo = 0.75` si hay trigger u hold, si no `1.0`.
- `slowRate = 38` al bajar (entrada rápida) y `10` al recuperar.
- Se expone con `getSparrowSlowMoScale()` y el game loop aplica
  `setKronosSlowMoScale(min(phase4 ? 0.75 : 1, sparrowScale))`
  (`domeGameLoop.ts:1235-1237`).

### 2.11 Rig y clips

`collectSparrowRig` (`DomeEnemyModels.ts:853-885`), GLB
`public/models/enemies/giant_sparrow.glb` (20 nodos; comentario "12 joints"):

- huesos: `wing_top_L_inner`, `wing_top_L_outer`, `wing_top_R_inner`,
  `wing_top_R_outer`, `wing_bot_L`, `wing_bot_R`, `tail`, `neck`, `head`,
  `jaw`.
- `mouthStar` = nodo `star_core_mouth` y su `ShaderMaterial`
  (`mouthStarMaterial`).
- Brillo del cristal de la boca (`:1103-1111`): `crash_stun` →
  `1.55 + sin(elapsed*14)*0.45`; taladro → `1.3`; `mouthOpen` → `1.4`;
  reposo → `0.25`; se escribe en `uniforms.uEmissiveBoost`.
- Color por arquetipo en el modelo: `color 0x7f1d1d`, `rim 0x2563eb`
  (`DomeEnemyModels.ts:35`).

Clips del GLB (verificados en el archivo):
`sparrow_chase_fly`, `sparrow_wild_flap`, `sparrow_hard_brake`,
`sparrow_shriek`, `sparrow_air_ball`, `sparrow_air_drill`, `sparrow_crash_stun`,
`sparrow_hit`.

Reproducción con `fadeIn/fadeOut` de 0.1 s (`SPARROW_CLIP_FADE_SEC`);
`sparrow_hit` dura 0.27 s (`SPARROW_HIT_CLIP_SEC`) (`:166-167`, `:505-524`).

### 2.12 Estados (FSM completa)

`SparrowState = 'pursue' | 'wild_flap' | 'shriek' | 'clone_split' |
'hard_brake' | 'drill_windup' | 'drill_dive' | 'crash_stun'`
(`domeSparrowBehavior.ts:34-42`). Estado inicial y valores de arranque
(`createSparrowState`, `:196-241`): `airBallCooldown 1.4`,
`wildFlapCooldown 0.8`, `shriekCooldown 5.5`, `cloneSplitCooldown 2.0`,
`meleeDodgeCooldown 1.0`, `slowMoScale 1`, `cloneRadius 15`.

En modo pasivo (`passive`): oculta el clon, `slowMoScale = 1`, frena con
`exp(−4·dt)`, `mouthOpen = false` y reproduce `sparrow_chase_fly`
(`:566-583`).

---

## 3. `kronos_leviathan` — Leviatán KRONOS (Boss de la ronda 15)

Archivo: `src/game/dome/domeKronosBehavior.ts` (1729 líneas).
Cabecera (`:1-22`): 4 Estrellas Dorsales como vida, cuatro fases y anti-skip.

### 3.1 Stats y anti-skip

| dato | valor | ref |
|---|---|---|
| HP | 4 (= 1 por estrella) | `DomeCombatSystem.ts:176` |
| radio (cabeza) | 3.2 | idem |
| carne | 90 | idem |
| EXP | 10.0 | idem |
| puntos débiles | 4 | idem |
| `isBoss` | true (inmune a Barrera Blanca) | `DomeCombatSystem.ts:360-370` |
| spawn | sin home especial (anillo normal, `26 + rng*30` de distancia) | `DomeWaveManager.ts:1607-1620` |

Puertas anti-skip (`DomeWaveManager.ts:5002-5045`):

- `tryBreakKronosStar(enemy, impactSpeed, isDrill)`:
  - `false` si `k.phase4` (Fase 4 invulnerable);
  - `false` si `k.starInvulnSec > 0` (invulnerabilidad de transición);
  - `false` si `!isDrill && impactSpeed < 18`;
  - si pasa: `applyKronosStarBreak(...)` (máximo 1 estrella por uso).
- `tryBreakKronosStarFromSkill(enemy)`: sin umbral de velocidad, con las mismas
  puertas (`phase4` o `starInvulnSec`).
- `tryBreakKronosStarFromEnv(enemy)`: alias exacto del anterior (proyectiles de
  entorno: láser del cangrejo, kamikaze).
- El daño cinético clásico **no** se aplica: en `onHitEnemy` el juego llama
  `tryBreakKronosStar(...)` y retorna (`src/ui/domeGameLoop.ts:533-540`); las
  habilidades llaman `tryBreakKronosStarFromSkill` y retornan
  (`domeGameLoop.ts:423-427`).

Barrido automático por hitboxes segmentadas (`domeKronosBehavior.ts:537-556`):
si `stars > 1 && starInvulnSec <= 0` y `playerVelocity.length() >= 14.5`
(`KRONOS_STAR_SWEEP_SPEED`), cualquier punto de la cadena a menos de
`KRONOS_SEGMENT_HIT_RADIUS + 0.9 = 3.9 m` rompe una estrella, marcando
`isDrill = nyxSpeed >= 18.0` (`KRONOS_STAR_BREAK_SPEED`).

`applyKronosStarBreak` (`:1454-1500`):

- `stars--`, `starInvulnSec = 0.5`, `entity.hp = stars`,
  `entity.weakPointsRemaining = stars`.
- `hitFlash = min(1.8, 0.8 + hitFlash)`.
- Oculta `rig.starCoreMeshes[stars]` (orden `star_core_4 → 3 → 2`).
- Corta el ataque en curso: `state = 'roam'`, `ringsLeft = 0`,
  `jawTarget01 = 0`, `attackCd = 0.5`, `submerged.fill(false)`.
- `stars === 2` → `portalCd = 2.0` (los portales llegan casi de inmediato).
- `stars === 1` → `enterKronosPhase4(...)`.

### 3.2 Cadena segmentada: 13 puntos y estrellas dorsales

Constantes (`:37-50`):

| constante | valor |
|---|---|
| `KRONOS_CHAIN_POINTS` | 13 (head + seg_01..seg_12) |
| `KRONOS_SEGMENT_HIT_RADIUS` | 3.0 m |
| `KRONOS_STAR_SEGMENTS` | `[3, 6, 9, 12]` |
| `KRONOS_MAX_BEND_RAD` | 0.28 rad (≈16°, "15-18° por eslabón") |
| `KRONOS_WAVE_FREQ` | 3.2 rad/s |
| `KRONOS_WAVE_PHASE_STEP` | 0.55 |
| `KRONOS_WAVE_YAW_AMP` | 0.085 |
| `KRONOS_TURN_RATE` | 1.7 |
| `KRONOS_FIN_FLAP_SPEED` / `AMP` | 3.1 / 0.3 |

Qué hace el código realmente (verificado, ver §3.11):

- `initKronosChain` (`:350-440`) mide el bind pose: posiciones de mundo de los
  13 huesos, `segLen[0..11]` (`max(0.05, len)`), `restDir`, `restUp`,
  `restWorldQuat`, `headingRest` (de `pos[2]` a `pos[0]`), `upRest`, y clasifica
  las mallas `detail_*` en `headDetails` (regex `eyes|horns|jaw|teeth`) y
  `bodyDetails`. Exige `rig.head` y `rig.segments.length >= 12`, si no devuelve
  `false` y se usa la cadena provisional.
- `initFallbackChainPositions` (`:1510-1531`): sin GLB, cadena recta tras la
  cabeza con longitudes `j === 1 ? 0.08 : 1.15`.
- `updateKronosPose` (`:1269-1313`): calcula el rumbo de la cabeza (velocidad si
  `speed > 2.5`, si no hacia Nyx), transporta en paralelo el `up` de la cabeza,
  slerpea `meshQuat` con `1 − exp(−1.7 · speedMult · dt)`, aplica el clip,
  `updateMatrixWorld(true)` y **lee las posiciones de mundo reales** de los 13
  huesos animados (`chain.pos[0..12]`) — esas son las hitboxes segmentadas.
- Las 4 estrellas: mallas `star_core_1..4` recogidas por nombre
  (`DomeEnemyModels.ts:1038-1047`). En el GLB cada `star_core_N` cuelga de un
  `star_core_N_pivot` situado junto a `seg_03`, `seg_06`, `seg_09` y `seg_12`
  (verificado en el JSON del `.glb`), lo que corresponde a
  `KRONOS_STAR_SEGMENTS = [3, 6, 9, 12]`.
- Brillo de estrellas: `STAR_CORE_EMISSIVE = 1.45` (`DomeEnemyModels.ts:43`) más
  `hitFlash * 1.5` y, en `whip_windup`, `0.5 + sin(elapsed * 9) * 0.3`
  (`domeKronosBehavior.ts:1305-1311`).

### 3.3 Cuatro fases: velocidades e IA de movimiento

| fase | estrellas | multiplicador de velocidad | cadencia (`cooldownForPhase`) |
|---|---|---|---|
| 1 Exploración | 4 | 0.5 × V_base | 5.0 s |
| 2 Ataque | 3 | 1.0 × V_base | 3.8 s |
| 3 Cabdeo | 2 | 1.35 × V_base | 2.9 s |
| 4 Destrucción | 1 | 1.35 × V_base | 1.1 s |

`KRONOS_PHASE_SPEED = [0.5, 1.0, 1.35, 1.35]` (`:53`); `phaseIdx =
clamp(4 − stars, 0, 3)`, `phaseSpeed = vBase * KRONOS_PHASE_SPEED[phaseIdx]`;
`vBase = kronosBaseMaxSpeed * speedMult` (`:1080-1084`).
`kronosBaseMaxSpeed` lo fija el game loop con
`controller.getBaseMaxSpeed()` = `FLOAT_MAX_SPEED` = 28 m/s
(`NyxDomeController.ts:161`, `domeGameLoop.ts:658-660`).

Otras constantes de movimiento (`:55-61`): patrulla en anillo
`28–45 m` a altura `16 m ± 4`, `KRONOS_DOME_KEEP_RADIUS = 72`,
`KRONOS_DOME_KEEP_PULL = 16.0`, `KRONOS_DODGE_RANGE = 18`,
`KRONOS_DODGE_COOLDOWN = 1.9`.

Comportamiento por fase en `roam` (`updateKronosMovement`, `:1119-1215`):

- Fase 1: orbita con `orbitAngle += 0.42 * dt`, radio oscilante
  `28 + 17 * (0.5 + 0.5 * sin(elapsed * 0.13 + phase))`, altura
  `16 + sin(elapsed * 0.3 + phase) * 4`. Si Nyx se acerca a < 22 m yendo lenta
  (`playerVelocity.length() < 12`), deriva tangencialmente
  (`+ side*18 + away*10`).
- Fase 2: `orbitAngle += 0.55 * dt`, órbita de 26 m alrededor de Nyx con vaivén
  vertical `sin(elapsed*0.4 + phase) * 6`, `accel = 2.4`.
- Fase 3/4: persecución con **predicción honesta** (`predictIntercept`) y
  `accel = 3.0` (fase 4) o `2.6` (fase 3).
- Esquiva en fases 2+: si `stars <= 3`, `dodgeCd <= 0`, `dist < 18` y
  `playerVelocity.length() >= 14.5` → dash lateral
  (`velocity.lerp(perp * phaseSpeed * sign + away * phaseSpeed * 0.4, 0.55)`),
  alterna signo, `dodgeCd = 1.9`.
- Amortiguación global `exp(−0.35·dt)`; tope `phaseSpeed * 1.25`.
- Contención: si `flatDist > 72` aplica `−16 * dt` radial (excepto en
  `portals`/`portal_bite`); techo `y > 48` → `velocity.y -= 9*dt`; suelo
  `y < −6` → `velocity.y += 9*dt`.
- `steerKronos`: `velocity.lerp(dir * speed, 1 − exp(−accel·dt))`.

`predictIntercept` (`:512-534`): 3 iteraciones de
`out = playerPos + playerVel * (flyTime * 0.85)` con
`flyTime = distance / projSpeed` ("predicción honesta", sin homing posterior).

En `rings` el boss frena con `exp(−1.8·dt)`; `whip_windup` con
`exp(−4.5·dt)`; `whip_strike` con `exp(−0.8·dt)`; `whip_settle` con
`exp(−1.2·dt)`; `whip_recover` con `exp(−2.6·dt)`; `portals` va recto al
Portal 1 a `phaseSpeed * 1.25`; `cosmos_fusion` con `exp(−0.7·dt)`;
`supernova` con `exp(−5·dt)` (`:1086-1117`).

### 3.4 Selección de ataque por fase (`:735-800`)

`roam` con `attackCd > 0` solo descuenta. Cuando puede atacar:

1. Latigazo inmediato por cercanía: `stars <= 3 && stars > 1 && dist <= 12 &&
   whipCd <= 0`.
2. Fase 1 (`stars === 4`): solo Anillos de Contención (`slot 0`).
3. Fase 2 (`stars === 3`): latigazo si `dist <= 15`; si no, anillos con
   `slot = attackIndex % 2`.
4. Fase 3 (`stars === 2`): si `portalCd <= 0 && attackIndex % 3 === 1` →
   portales; si no, latigazo si `dist <= 12 && whipCd <= 0`; si no, anillos con
   `slot = attackIndex % 3`.
5. Fase 4 (`stars === 1`): `slot = attackIndex % 4` →
   `0` `cosmos_fusion`; `1` latigazo si `dist <= 15 && whipCd <= 0`; `2`
   anillos; `3` portales.

Tras `rings`/`whip_*` se fija `attackCd = cooldownForPhase(k) / speedMult`
(`:571`, `:623`, `:788`). `whipCd = 2.6` al terminar el latigazo
(`:620-624`).

### 3.5 Anillos de Contención (0 daño directo, empuje radial)

Constantes (`:64-74`):

| constante | valor |
|---|---|
| `KRONOS_RING_TELEGRAPH_SEC` | 0.8 s |
| `KRONOS_RING_TELEGRAPH_JAW_RAD` | 0.5 rad |
| `KRONOS_RING_COUNT` | `[3, 2, 1]` |
| `KRONOS_RING_INTERVAL_SEC` | 0.45 s |
| `KRONOS_RING_RECOVER_SEC` | 0.5 s |
| `KRONOS_RING_TRAVEL_SPEED` | 9.0 m/s |
| `KRONOS_RING_EXPAND_SPEED` | 16.0 m/s |
| `KRONOS_RING_MAX_RADIUS` | 55.0 m |
| `KRONOS_RING_HIT_BAND` | 1.7 m |
| `KRONOS_RING_PUSH_SPEED` | 30.0 m/s |
| `KRONOS_RING_POOL_SIZE` | 8 |

- Se emiten desde el hueso `jaw` (`emitKronosRing`, `:935-980`); radio inicial
  1.5 m.
- Avance (`updateKronosRings`, `:990-1030`): `travel += 9·dt`,
  `radius += 16·dt`, y cuando `|dist − radius| < 1.7` con `pushed` a `false`
  aplica una única vez `onGolemSmash(0, radial, 30)`.
- El daño real lo pone la Barrera Blanca al empujar a Nyx contra ella
  (−10 HP, `NYX_BARRIER_DAMAGE` `DomeCombatSystem.ts:114`).

### 3.6 Latigazo de Cola (fase 2+)

| constante | valor |
|---|---|
| `KRONOS_WHIP_RANGE` | 12.0 m |
| `KRONOS_WHIP_WINDUP_SEC` | 0.35 s |
| `KRONOS_WHIP_STRIKE_SEC` | 0.26 s |
| `KRONOS_WHIP_SETTLE_SEC` | 0.32 s |
| `KRONOS_WHIP_RECOVER_SEC` | 2.0 s (fallo) |
| `KRONOS_WHIP_DAMAGE` | 18 HP |
| `KRONOS_WHIP_PUSH_SPEED` | 50.0 m/s |
| `KRONOS_WHIP_HIT_RADIUS` | 4.6 m |
| `KRONOS_WHIP_FAN_RAD` | 0.85 rad (declarada; sin uso) |

`:77-85`, FSM `:573-628`:

- `whipSide` se decide por el flanco de Nyx respecto a `headingPrev × up`
  (`startKronosWhip`, `:815-834`).
- Zona de golpe: puntos `7..12` de la cadena a menos de 4.6 m
  (`:592-611`); `onGolemSmash(18, dir, 50)`.
- Acierto → `whip_settle` (0.32 s); fallo → `whip_recover` (2.0 s) con
  `hitFlash >= 0.22` como ventana de castigo.

### 3.7 Portales Cósmicos (`SOLAR RIFT`) y Mordisco (fase 3+)

| constante | valor |
|---|---|
| `KRONOS_PORTAL_DIAMETER` | 14.0 m |
| `KRONOS_PORTAL1_AHEAD` | 18.0 m delante de la trayectoria del boss |
| `KRONOS_PORTAL2_BEHIND` | 22.0 m detrás de Nyx |
| `KRONOS_PORTAL_T_OPEN_P2` | 0.5 s |
| `KRONOS_PORTAL_T_EXIT` | 0.7 s |
| `KRONOS_BITE_DAMAGE` | 24 HP |
| `KRONOS_BITE_PUSH_SPEED` | 32.0 m/s |
| `KRONOS_BITE_JAW_OPEN_RAD` | 0.95 rad |
| `KRONOS_BITE_JAW_SNAP_SEC` | 0.08 s |
| `KRONOS_BITE_FLIGHT_SEC` | 0.8 s |
| `KRONOS_PORTAL_LIFE_SEC` | 3.2 s |
| `KRONOS_PORTAL_COOLDOWN` | 8.0 s |
| `KRONOS_BITE_EXIT_SPEED_MULT` | 1.5 × V_base |

`:88-99`, `:53`, FSM `:630-720`:

1. `startKronosPortals` (`:842-865`): Portal 1 en `pos + dir * 18`, `dir` =
   velocidad normalizada (o `headingPrev` si va lento), y
   `shakePulse = max(..., 1.0)`.
2. A los 0.5 s se abre el Portal 2 en
   `playerPos − playerAimForward * 22` (recortado a longitud
   `72 + 12 = 84` si se sale de la cúpula), con dirección de cruce
   `predictIntercept(portal2.pos, playerPos, playerVelocity, 70)` y
   `shakePulse = max(..., 0.5)` (`:864-882`, `:698-704`).
3. Entrada segmento a segmento: cada punto con
   `(pos[j] − portal1.pos) · portal1.dir > 0.5` se marca `submerged`
   (se oculta la carne del eslabón, `applyKronosVisibility`, `:1480-1508`).
4. A los 0.7 s: la cadena entera se teletransporta detrás del plano del Portal 2
   (`pos[j] = portal2.pos + portal2.dir * (1.2 − cum)`) y sale a
   `kronosBaseMaxSpeed * 1.5 * speedMult` en la dirección de intercepción
   (`:706-727`). `shakePulse = max(..., 0.8)`.
5. `portal_bite` (0.8 s): impacto si `dist < 3.0 + 1.4` →
   `onGolemSmash(24, exitDir, 32)` y cierre de golpe; los segmentos reemergen al
   cruzar `dot > −0.6` del Portal 2 (`:729-760`).
6. Los portales viven 3.2 s con apertura elástica
   (`openVel += (target − open) * 90 * dt; openVel *= exp(−6.5·dt)`,
   `open` clampeado a 1.15), rotación de vórtice `dt * 6.0`, aro respirando
   `0.55 + 0.4 * sin(elapsed * 9) * min(1, open)` y cierre con desvanecimiento
   (`updateKronosPortals`, `:902-940`).
7. Visual: disco `CircleGeometry(1, 64)` con shader SOLAR RIFT
   (paleta `deep 0x120614`, `nebulaA 0xbe123c`, `nebulaB 0xf59e0b`,
   `rim 0xfde68a`) + aro `TorusGeometry(1, 0.045, 10, 72)` `0xffd27a`
   aditivo (`DomeEnemyModels.ts:1083-1094`, `:1273-1315`).

### 3.8 `cosmos_fusion` (habilidad definitiva de fase 4)

| constante | valor |
|---|---|
| `KRONOS_COSMOS_DAMAGE` | 16 HP |
| `KRONOS_COSMOS_WINDUP_SEC` | 0.3 s |

`:102-104`, caso `:762-776`: al terminar el windup aplica
`onPlayerHit(16)` **automático, inesquivable**, dispara `voidFlashPulse = 1` y
`shakePulse = max(..., 1.2)`, y deja `attackCd = max(0.9, cooldownForPhase) /
speedMult`. El game loop lo traduce a `punchCamera(1.2)` +
`audio.playBossHit()` (`domeGameLoop.ts:1240-1247`).

### 3.9 Fase 4 — Destrucción (supervivencia de 60 s)

`enterKronosPhase4` (`:1560-1632`):

- `phase4 = true`, `phase4Timer = 60.0` (`KRONOS_PHASE4_TOTAL_SEC`),
  `effects.phase4 = true`, `entity.fleshThickness = 100` ("invulnerable: la
  carne nunca cede").
- Cuerpo al shader `VOID COSMOS`:
  `swapKronosFleshToVoidCosmos(mesh, animatedMaterials)` sustituye los
  materiales con `uniforms.uColorA` por el material de nebulosa FBM
  (paleta `deep 0x070518`, `nebulaA 0x4c1d95`, `nebulaB 0xe11d48`,
  `rim 0xa5f3fc`) y actualiza la lista de materiales animados
  (`DomeEnemyModels.ts:1233-1258`, `:1095-1100`).

Agenda de efectos sobre Nyx (22 eventos, `k.agenda`, `:1607-1630`), con
`agendaTime = 60 − phase4Timer` (`:1650-1665`):

| t (s) | efecto | on/off |
|---|---|---|
| 3.0 | temblor de cámara | on |
| 8.0 | temblor | off |
| 10.0 | ejes invertidos | on |
| 13.0 | deformación | on |
| 15.0 | ejes invertidos | off |
| 19.0 | temblor | on |
| 20.0 | deformación | off |
| 24.0 | temblor | off |
| 26.0 | ejes invertidos | on |
| 30.0 | deformación | on |
| 31.0 | ejes invertidos | off |
| 35.0 | temblor | on |
| 38.0 | deformación | off |
| 40.0 | temblor | off |
| 41.0 | ejes invertidos | on |
| 46.0 | ejes invertidos | off |
| 47.5 | ejes invertidos | on |
| 50.0 | temblor | on |
| 52.5 | ejes invertidos | off |
| 55.0 | temblor | off |
| 55.5 | ejes invertidos | on |
| 60.0 | ejes invertidos | off |

Totales derivados del propio listado: temblor de cámara 20 s (3–8, 19–24,
35–40, 50–55); deformación 15 s (13–20, 30–38); ejes invertidos 25 s
(10–15, 26–31, 41–46, 47.5–52.5, 55.5–60) — coincide con el comentario del
código (`:1598-1605`).

Al agotarse los 60 s (`updateKronosPhase4`, `:1636-1668`):

- `state = 'supernova'`, `timer = 1.2` (`KRONOS_SUPERNOVA_SEC`),
  `uEmissiveBoost = 1.45 * 2.5` en las 4 estrellas, todos los efectos a off y
  `shakePulse = 1.3`.
- `supernova` (`:778-786`): al terminar llama
  `finalizeKronosSupernova(enemy)` → `resetKronosNyxEffects()`,
  `deactivateKronosPortals()`, `entity.hp = 0`, `entity.alive = false`
  (`DomeWaveManager.ts:5051-5059`). La EXP 10 sale por `onInternalKill`.

Slow-mo global de fase 4: `isKronosPhase4Active()` → el game loop aplica
`setKronosSlowMoScale(min(0.75, sparrowScale))` (`domeGameLoop.ts:1235-1237`,
`DomeWaveManager.ts:4980-4983`).

### 3.10 Clips del boss

Selección (`updateKronosAnimationClip`, `:1414-1462`), crossfade 0.12 s:

| estado | clip |
|---|---|
| `supernova` | `kronos_supernova` |
| `portal_bite` | `kronos_portal_bite` |
| `whip_windup` / `whip_strike` | `kronos_tail_whip` |
| `rings` | `kronos_rings_telegraph` |
| resto | `kronos_swim_idle` |

`kronos_swim_idle` ajusta `timeScale = 0.75 + clamp(speed / vBase, 0.4, 1.6) *
0.55`; el resto a `1.0`. Los clips del GLB (verificados dentro del archivo) son
exactamente: `kronos_swim_idle`, `kronos_rings_telegraph`, `kronos_tail_whip`,
`kronos_portal_bite`, `kronos_supernova`.

### 3.11 Notas verificadas sobre la cadena (código ejecutable)

1. La pose de la cadena la producen **los clips de Blender** sobre los huesos;
   `updateKronosPose` solo orienta la raíz y lee posiciones de mundo
   (`:1269-1313`). El comentario de cabecera "CERO clips de Blender
   (`kronos_tail_idle` desactivado en el mixer)" (`:13`) no corresponde al
   código actual: `updateKronosAnimationClip` reproduce clips y
   `kronos_tail_idle` no aparece en ningún sitio salvo ese comentario.
2. Las utilidades de física follow-the-leader (`clampDirToRef`,
   `signedHeadingTurn`, `updateKronosHeadBends`, `applyHeadScrutiny`,
   `updateKronosJaw`) solo se referencian dentro de
   `unusedKronosLegacyGuard()` bajo `if (false)` (`:1464-1472`): no se ejecutan.
   En consecuencia `chain.bendExtra`, `chain.tailSwing`, `chain.wavePhase` y
   `chain.dirNew`/`restUp` no se aplican a los huesos (solo se inicializan,
   se ponen a 0 y, en `bendExtra`, se resetea al iniciar el latigazo).
3. Consecuencias prácticas: no hay ondulación procedural ni flexión por
   eslabón en runtime; el límite de 0.28 rad y la onda de 3.2 rad/s son valores
   declarados sin consumidor. `KRONOS_STAR_SEGMENTS` también está exportado sin
   consumidores: el vínculo estrella→segmento vive en el GLB.
4. El boss **no rompe suelos**: está excluido del bloque de colisión con slabs
   (`DomeWaveManager.ts:2679-2695`) y no llama `onSlabSmash`.

### 3.12 Efectos que KRONOS envía a Nyx (`KronosNyxEffects`)

`domeKronosBehavior.ts:174-193`: `deformActive`, `cameraShake`,
`controlsInverted`, `phase4`, `shakePulse` (one-shot 0..1.3), `voidFlashPulse`
(one-shot). Consumo en `src/ui/domeGameLoop.ts:1222-1247`:

- `controller.setKronosDeformed(deformActive)`
- `controller.setKronosCameraShake(max(cameraShake, sparrowCameraShake))`
- `controller.setKronosControlsInverted(controlsInverted)`
- `controller.setKronosSlowMoScale(min(phase4 ? 0.75 : 1, sparrowSlowMoScale))`
- `shakePulse > 0` → `punchCamera(min(1.3, shakePulse))` + `audio.playWarning()`
  y se pone a 0.
- `voidFlashPulse > 0` → `punchCamera(1.2)` + `audio.playBossHit()` y se pone a 0.

`resetKronosNyxEffects` deja todos los campos a 0/false
(`DomeWaveManager.ts:4955-4966`).

---

## 4. IA adaptativa

Hay **dos** sistemas distintos. Es importante no confundirlos:

- el KRONOS de la **cúpula** (modo arcade de este documento) es una FSM
  determinista por fases, **sin** red neuronal ni director de adaptación;
- la **red MLP + director estadístico** pertenece al modo campaña
  (`GameEngine` / `WorldObjects` / `BattleReportScreen`).

Verificación: `KronosNeuralNet`, `computePlanetAdaptation` y `BehaviorTracker`
solo se importan en `src/game/GameEngine.ts`, `src/game/entities/WorldObjects.ts`
y `src/ui/BattleReportScreen.tsx`; ningún archivo de `src/game/dome/` los usa.

### 4.1 `BehaviorTracker` — registro estadístico

`src/game/ai/BehaviorTracker.ts`.

Vector de comportamiento (`:8-22`), 11 campos:
`stealthKnockouts`, `disguiseTimeSec`, `alarmsTriggered`, `bruteKills`,
`aerialAttacks`, `burrowDistance`, `burrowTimeSec`, `stasisThrows`,
`parriesLanded`, `damageTaken`, `totalTimeSec`.

Puntuaciones brutas (`rawStyleScores`, `:29-37`):

```
stealth      = stealthKnockouts * 12 + disguiseTimeSec * 0.35
aggression   = alarmsTriggered * 14 + bruteKills * 7 + damageTaken * 1.5
aerial       = aerialAttacks * 5
subterranean = burrowDistance * 0.6 + burrowTimeSec * 0.5
stasis       = stasisThrows * 4 + parriesLanded * 3
```

Normalización (`computeBehaviorPercentagesInto`, `:57-78`): cada eje →
`clamp(0..100, raw / suma * 100)`; si `suma <= 1e-6` todos quedan a 0.

Etiqueta dominante (`getDominantStyleLabel`, `:81-99`): máximo de
`Sigilo y disfraces`, `Fuerza bruta`, `Ataques aéreos`, `Subsuelo`,
`Estasis y parry`; si el máximo es `< 20` devuelve `'Equilibrado'`.

Clase `BehaviorTracker` (`:106-152`): `accumulate(levelVector)` suma campo a
campo; `getAccumulated()` devuelve copia; `getAccumulatedInto(out)` sin
allocations; `reset()` a ceros.

Uso en campaña: al cruzar cada portal se cierra la ficha del planeta
(`player.behavior.totalTimeSec = elapsed`, `accumulate`, y se reinicia el vector
vivo) (`GameEngine.ts:853-862`); al derrotar a KRONOS se acumula la última ficha
(`GameEngine.ts:884-893`). Cada frame se compone el vector
"acumulado + planeta actual" en `kronosBehavior` para la red
(`GameEngine.ts:535-548`).

### 4.2 `AdaptationDirector` — contramedidas del siguiente planeta

`src/game/ai/AdaptationDirector.ts`.

Umbrales (`:14-21`): `AGGRESSION_THRESHOLD = 28`, `STEALTH_THRESHOLD = 32`,
`SUBTERRANEAN_THRESHOLD = 22`, `AERIAL_THRESHOLD = 28`.

`computePlanetAdaptation(accumulated, targetOrder)` (`:28-103`):

- `baseAlertLevel = min(0.45, 0.12 * max(0, targetOrder − 1))` (0 en prólogo y
  Verdant).
- Agresión (`pct.aggression >= 28 || alarmsTriggered >= 2`):
  `baseAlertLevel = min(1, baseAlertLevel + 0.3)`,
  `extraPatrolCount = targetOrder >= 3 ? 3 : 2`, `armoredHelmets = true`
  (+ razones de drones rápidos).
- Sigilo (`pct.stealth >= 32 || stealthKnockouts >= 2`):
  `pairGuardPatrols = true`, `doorScanners = true`.
- Subsuelo (`pct.subterranean >= 22 || burrowDistance >= 40`):
  `seismicMines = true`.
- Aéreo (`pct.aerial >= 28 || aerialAttacks >= 4`): `antiAirTurrets = true`,
  `predictiveShields = true`.
- Si no hay patrones, `summaryReasons = ['Sin patrones claros en tu ficha: la
  guarnición mantiene el despliegue estándar.']`.
- Devuelve `PlanetAdaptationConfig` con esos 8 campos + `summaryReasons`.

Integración: `GameEngine.onPlanetUnlocked` calcula la adaptación con el vector
acumulado y el `order` del planeta recién desbloqueado, la inyecta
(`world.applyPlanetAdaptation`) salvo que el planeta sea biome `kronos`
("la arena de KRONOS no despliega guarnición") y la muestra como banner de
radio (`GameEngine.ts:853-882`).

### 4.3 `KronosNeuralNet` — MLP 8 → 10 → 4

`src/game/ai/KronosNeuralNet.ts`.

Arquitectura y parámetros (`:31-39`):

- `INPUT_SIZE = 8`, `HIDDEN_SIZE = 10`, `OUTPUT_SIZE = 4`.
- `KRONOS_PARAM_COUNT = 134` = `8*10 + 10 + 10*4 + 4`.
- Activaciones: oculta `Math.tanh`, salidas `sigmoid`.
- Pesos iniciales de entrenamiento offline declarados con
  "MSE 0.00185 sobre 2000 partidas sintéticas" (`:16-19`, `:41-69`:
  `OFFLINE_W1` 80 valores, `OFFLINE_B1` 10, `OFFLINE_W2` 40, `OFFLINE_B2` 4).
- `ONLINE_LR = 0.14` para el refino en combate.

Entrada (`buildKronosInput`, `:113-126`):

```
out[0] = pct.stealth / 100
out[1] = pct.aggression / 100
out[2] = pct.aerial / 100
out[3] = pct.subterranean / 100
out[4] = pct.stasis / 100
out[5] = (activeCharacter === 'kitsune') ? 1 : 0
out[6] = (activeCharacter === 'digger')  ? 1 : 0
out[7] = (activeCharacter === 'axel')    ? 1 : 0
```

Posturas (`KRONOS_POSTURES`, `:24-29`):
`['anti_kitsune', 'anti_digger', 'anti_axel', 'anti_stasis']`;
`ANTI_STASIS_INDEX = 3`. Mapeos (`:76-99`):
`anti_kitsune → kitsune`, `anti_digger → digger`, `anti_axel → axel`,
`anti_stasis → null`; y `counterCharacterToPostureIndex`:
`kitsune → 0`, `digger → 1`, resto → `2` (axel).

Clase `KronosNeuralNet` (`:137-247`):

- Buffers `Float64Array`: `w1 (80)`, `b1 (10)`, `w2 (40)`, `b2 (4)` copiados
  del offline en el constructor; scratch `hidden`, `outputs`, `deltaOut`,
  `deltaHidden`. Cero allocations en `predict`/`trainOnline`.
- `predict(input)` → índice del argmax de las 4 salidas.
- `trainOnline(input, targetIdx)`: `deltaOut[k] = outputs[k] − (k === target ?
  1 : 0)`; backprop a la oculta con `tanh' = 1 − h²`; SGD con `lr = 0.14`;
  incrementa `onlineUpdates`.

Comportamiento en combate (`src/game/entities/WorldObjects.ts`):

- KRONOS de campaña: `KRONOS_MAX_HP = 12` (`:153`), `KRONOS_MELEE_RANGE = 5.4`
  (`:155`), `KRONOS_SWING_CD = 2.4` (`:157`), `KRONOS_STUN_DAMAGE_MUL = 2`
  (`:159`), `KRONOS_ORB_SPEED = 17` / `KRONOS_ORB_LIFE = 4.0` (`:162-163`),
  `KRONOS_PULSE_RADIUS = 12` (`:167`), `KRONOS_SEISMIC_RADIUS = 15` (`:168`),
  `KRONOS_AIR_BURST_RANGE = 24` (`:169`), `KRONOS_POSTURE_REEVAL = 2.5`
  (`:170`), `KRONOS_FRONT_SHIELD_DOT = 0.35` y `KRONOS_FRONT_SHIELD_MUL = 0.25`
  (`:171-172`), colores de anillo por postura
  `[0xf97316, 0xfacc15, 0x22d3ee, 0xa78bfa]` (`:175`).
- Repredicción de postura cada 2.5 s: `computeBehaviorPercentagesInto` →
  `buildKronosInput(pct, characterId)` → `net.predict` → si cambia, se aplica
  color de anillo (`:2286-2295`).
- Aprendizaje online: cada golpe recibido llama `net.trainOnline` con objetivo
  `anti_stasis` si la fuente es `stasis`/`parry`, si no
  `counterCharacterToPostureIndex(characterId)` (`:2154-2163`); también se
  refuerza la postura cuando bloquea o acierta
  (`reinforceKronosPosture`, `:2116-2125`).
- Efecto de postura `anti_stasis`: multiplica el daño frontal por 0.25 cuando
  `forward · dir > 0.35` (flanquear lo evita) (`:2137-2147`).
- Poderes por postura (`kronosPosturePower`, `:2202-2260`):
  `anti_kitsune` pulso anti-sigilo (radio 12, solo daña si `disguised ||
  inGrass`), `anti_digger` onda sísmica (radio 15, eyección si `burrowing`),
  `anti_axel` ráfaga antiaérea (orbe si `airborne` y a < 24 m),
  `anti_stasis` destello del escudo frontal (sin daño propio).

### 4.4 Reporte de batalla de campaña

`src/ui/BattleReportScreen.tsx`: radar de 5 ejes con
`computeBehaviorPercentages(snapshot.behaviorVector)` (`:71-74`), etiqueta
dominante de `getDominantStyleLabel` (`:75`), muestra
`${KRONOS_PARAM_COUNT} parámetros` (`:231`) y el número de pasos online
(`snapshot.kronosUpdates`, `:76`). Score de campaña (`:79-93`):

```
score = max(0, round(12000 − elapsedRunSec*4 − alarmsTriggered*300
            − damageTaken*120 + parriesLanded*60 + stealthKnockouts*80
            + bruteKills*40))
```

---

## 5. Sistema de oleadas

Archivo: `src/game/dome/DomeWaveManager.ts` (5060 líneas).

### 5.1 Estructura del ciclo (15 rondas, repetición infinita)

Cabecera `:155-169`:

```
1–4   Básicos (4 → 8 enemigos)            suelos 'basic'
5     Miniboss/Épico 1: giant_sparrow     suelos 'miniboss'
6–9   Básicos (7 → 11)                    suelos 'basic'
10    Miniboss/Épico 2: prisma_necroz     suelos 'miniboss'
11–14 Básicos (9 → 13)                    suelos 'basic'
15    Boss: kronos_leviathan              suelos 'boss'
16+   Repite el ciclo con +2*cycle enemigos y velocidad 1 + cycle*0.2
```

`CYCLE_LENGTH = 15` (`:231`).

### 5.2 Plan de oleada (fórmulas exactas)

`getWavePlan(waveNumber, difficultyScaling = true)` (`:424-462`):

```ts
cycle   = floor((waveNumber − 1) / 15)
inCycle = ((waveNumber − 1) % 15) + 1
speedMult = difficultyScaling ? 1 + cycle * 0.2 : 1.0
minibossesPassed = difficultyScaling
  ? cycle * 2 + (inCycle > 10 ? 2 : inCycle > 5 ? 1 : 0)
  : 0
bossesPassed = difficultyScaling ? cycle : 0
```

Composición:

- `inCycle === 5` → label `MINIBOSS`, floor `miniboss`,
  `[{ archetype: 'giant_sparrow', count: 1 }]`.
- `inCycle === 10` → label `MINIBOSS`, floor `miniboss`,
  `[{ archetype: 'prisma_necroz', count: 1 }]`.
- `inCycle === 15` → label `BOSS`, floor `boss`,
  `[{ archetype: 'kronos_leviathan', count: 1 }]`.
- Resto → label `BÁSICOS`, floor `basic`,
  `[{ archetype: 'basic_mix', count: 4 + minibossesPassed }]`.
- **Tras cada boss**: si `bossesPassed > 0` y la oleada es de miniboss, se añade
  `[{ archetype: 'basic_mix', count: bossesPassed }]` (`:458-460`).

`BASIC_ARCHETYPES = ['abyssal_cell', 'crab_gunner', 'spiral_octopus',
'lightning_butterfly', 'ground_golem']` (`:223-229`); `basic_mix` rota
`BASIC_ARCHETYPES[spawnIndex % 5]` (`:1459-1462`).

Ejemplos calculados con la fórmula (verificación aritmética):

| oleada | cycle | inCycle | minibossesPassed | bossesPassed | básicos | speedMult |
|---|---|---|---|---|---|---|
| 1 | 0 | 1 | 0 | 0 | 4 | 1.0 |
| 4 | 0 | 4 | 0 | 0 | 4 | 1.0 |
| 6 | 0 | 6 | 1 | 0 | 5 | 1.0 |
| 9 | 0 | 9 | 1 | 0 | 5 | 1.0 |
| 11 | 0 | 11 | 2 | 0 | 6 | 1.0 |
| 14 | 0 | 14 | 2 | 0 | 6 | 1.0 |
| 16 | 1 | 1 | 2 | 1 | 6 | 1.2 |
| 20 | 1 | 5 | 2 | 1 | miniboss + 1 básico | 1.2 |
| 25 | 1 | 10 | 3 | 1 | miniboss + 1 básico | 1.2 |
| 31 | 2 | 1 | 4 | 2 | 8 | 1.4 |

El `basic_mix` añadido por `bossesPassed` solo aparece en las oleadas de
miniboss (rondas 5 y 10 de cada ciclo), nunca en las básicas.

### 5.3 Escalado de enemigos / velocidad / daño

- **Cantidad**: `4 + minibossesPassed` en las básicas (+2 por ciclo) y
  `+bossesPassed` básicos en las oleadas de miniboss tras cada ciclo completo
  (§5.2).
- **Velocidad**: `speedMult = 1 + cycle * 0.2` (+20 % por ciclo). Se propaga a
  `this.speedMult` (`:1456`) y de ahí a:
  - `necrozCtx.speedMult`, `sparrowCtx.speedMult`, `butterflyCtx.speedMult`,
    `crab`/`octopus` (`:2565`, `:2580`, `:2621`, `:3228`, `:3824`);
  - cadencia de ataques: `attackTimer = X / speedMult` (p. ej. `3.2 /
    speedMult` tras una embestida `:2997`, `OCTOPUS_SHOOT_INTERVAL / speedMult`
    `:3235`, `cooldownForPhase(k) / speedMult` en KRONOS);
  - velocidades de proyectil: `air_ball` (32.3 × mult), bola eléctrica
    `min(22.95, 22.95 * speedMult)` (`:2641`);
  - física del Gorrión (crucero, burst, aceleración, empujes, taladro) y de
    KRONOS (`vBase = kronosBaseMaxSpeed * speedMult`).
- **Daño**: no hay escalado global. El único daño escalado es la bola de tinta
  del pulpo: `OCTOPUS_BALL_DAMAGE * speedMult` (`:3228`, `:3290`, `:3322`).
  El resto de daños son constantes: pinchos de Necroz 12, pirámides 10, aleteo
  0, garrido 0, taladro 25, choque 55, anillos 0 (empuje 30), latigazo 18,
  mordisco 24, `cosmos_fusion` 16, láser del cangrejo
  `CRAB_LASER_DPS = 20.0 * dt` (`domeCrabBehavior.ts:59`).
- **HP**: no se escala por oleada; cada spawn usa `DOME_ENEMY_ARCHETYPES`
  (`spawnEnemy` → `createDomeEnemyEntity`, `:1634`).
- **Escala de tinta**: `enemyInkScaleForWave(currentWave)` (1–10 normal, 11–20
  ×1.25, 21–30 ×1.5...), aplicado en `spawnEnemy` (`:1548-1552`).

### 5.4 `easyMode` (modo fácil)

- Se activa desde Ajustes: `settings.easyMode` (`src/game/settings.ts:112`,
  por defecto `false` en `:179`). Etiqueta ES: "Modo fácil (Vida y Edén x2, sin
  escalada)" (`src/i18n/es.json:124`).
- `waveMgr.setDifficultyScaling(!easyMode)` en el arranque del bucle
  (`domeGameLoop.ts:241`) y **cada frame** (`:1187-1188`).
- `setDifficultyScaling(enabled)` (`DomeWaveManager.ts:1760-1765`) fija el flag
  y recalcula `speedMult` de la oleada actual.
- Con `difficultyScaling = false`: `speedMult = 1.0`, `minibossesPassed = 0`,
  `bossesPassed = 0` → básicas siempre con 4 enemigos, sin básicos extra en las
  oleadas de miniboss y sin aceleración.
- Vida y Edén ×2: `syncPayload.maxHp = progression.maxHp * easyMult` y
  `syncPayload.maxEden = progression.maxEden * easyMult` con
  `easyMult = easyMode ? 2 : 1` (`domeGameLoop.ts:1186-1199`).

### 5.5 Arranque, avance y suelos

- Arranque (sin entrenamiento): `applyFloorMode(getFloorModeForWave(1))`,
  `waveMgr.startWave(1, activeSlabs)`, `runTracker.recordWave(1)`,
  `syncWaveMusic(label)` (`domeGameLoop.ts:249-257`).
- `startWave(waveNumber, activeSlabs)` (`DomeWaveManager.ts:1447-1470`):
  `clearEnemies()`, `deactivateAllProjectiles()`, `deactivateKronosRings()`,
  fija `currentWave`/`waveTime`, lee el plan y hace `spawnEnemy` por cada spawn
  con RNG determinista `makeRng(waveNumber * 7919 + 13)`.
- Posición de spawn (no-entrenamiento): `angle = (index / (enemies.length + 6))
  * 2π + rng * 1.2`, `dist = 26 + rng * 30`, altura `6 + rng * 30`
  (`:1607-1620`). `prisma_necroz` siempre en `(0,0,0)`; el cangrejo se pega a
  un slab (`pickCrabSpawnSlab` + `pickSlabLocalPoint`).
- Avance: cuando `getActiveEnemyCount() === 0` arranca una espera de **1.6 s**
  y luego `startWave(wave + 1)` con `applyFloorMode`, materialización de suelos,
  `refillActiveSlabs()`, `recordWave` y cambio de música
  (`domeGameLoop.ts:1112-1134`). La espera se resetea a 0 si vuelve a haber
  enemigos (`:1132`).
- Suelos por modo (`applyFloorMode`, `domeGameLoop.ts:219-231`):
  - `basic`: `floatingSlabs.setTargetCount(4 + floor(random * 4))` (4–7) y
    `sphereTiles.setMode('none')`.
  - `miniboss`: 0 slabs flotantes y `sphereTiles.setMode('miniboss')` =
    10–20 triángulos que rotan cada 10 s con aviso previo de 2.2 s
    (`DomeSphereTiles.ts:322-361`, `:26-30`, `:400-405`).
  - `boss`: 0 slabs flotantes y `sphereTiles.setMode('boss')` = 120 triángulos
    fijos (pool completo) (`:332-338`).
- Música (`domeGameLoop.ts:204-215`): `label === 'BOSS'` → pista `boss`; el
  resto alterna `waveA`/`waveB`.

---

## 6. Modo Entrenamiento

### 6.1 Entrada y arranque

- Botón `menu.training` en la pantalla de título → `handlePlayTraining`
  (`src/App.tsx:98-104`) pasa `trainingMode` a `DomeGameView`
  (`App.tsx:165`), que crea el bucle con `training: true`
  (`DomeGameView.tsx:301`).
- En el bucle (`domeGameLoop.ts:242-254`): `progression.pendingInitialPick =
  false`, `applyFloorMode('basic')`, materializa suelos, `refillActiveSlabs()`
  y `musicPlayer.play('waveA')`. **No** llama `startWave` ni `recordWave`: no
  hay oleadas automáticas.
- `waveMgr.setDifficultyScaling(!settings.easyMode)` (`:241`).

### 6.2 Enemigo único y reinicio

- `spawnSingleEnemy(archetype, homePos, activeSlabs)`
  (`DomeWaveManager.ts:1826-1835`): `clearEnemies()`,
  `deactivateAllProjectiles()`, `deactivateKronosRings()` y un solo
  `spawnEnemy` con RNG aleatorio (`makeRng(floor(random * 0x7fffffff) || 1)`).
- Posición de spawn (`domeGameLoop.ts:306-318`):
  `controller.getPosition() + aimForward * 18`, con `y = clamp(y, 2, 30)`; sin
  controller, `(0, 5, -18)`.
- Respawn instantáneo: cada frame, si `training && getActiveEnemyCount() === 0`
  → `spawnTrainingEnemy()` (`:1112-1116`).

### 6.3 Reglas de inmortalidad y recursos

- Nyx inmortal: `applyDamageToNyx` restaura recursos si `training &&
  controller.getHp() < 1` (`domeGameLoop.ts:322-330`); también tras el DoT de
  tinta (`:1029-1032`).
- Edén +25/s: `controller.restoreResources(0, 25 * effRawDt)` (`:1018-1021`).
- Tecla `T`: `trainingBridgeRef.current?.refillResources()` (Vida + Edén)
  (`:894-896`).
- Etiqueta del pie del panel: "Nyx inmortal · Edén +25/s · sin oleadas
  automáticas" (`src/i18n/es.json` → `trainingPanel.footerNote`).
- HUD sin oleada: `syncPayload.waveNumber/waveLabel = undefined` si
  `training` (`domeGameLoop.ts:1202-1203`).

### 6.4 Enemigo pasivo / IA activa

`setEnemiesPassive(passive)` (`DomeWaveManager.ts:1841-1853`): al activarlo
desactiva proyectiles y anillos y llama `resetEnemyOffense` para cada enemigo
(anula `attackTimer`, `mouthOpen`, `spikesActive`, cargas,
`golemState = 'helicopter'`, `resetKronosOffense`, `resetNecrozState`,
`resetSparrowState`, `resetButterflyState`, célula en `'stalk'`) (`:1856-1900`).

Con `enemiesPassive`:

- no se descuenta `attackTimer` (`:2442-2445`);
- no hay dash evasivo (`:2479-2481`);
- no se llama `updateEnemyBehavior` (`:2648-2654`);
- KRONOS se resetea a `roam` sin ataques (`resetKronosOffense`,
  `:1857-1862`, `domeKronosBehavior.ts:1720-1740`);
- el pulpo solo frena (`:3054-3058`), el gorrión frena y mira a Nyx
  (`domeSparrowBehavior.ts:566-583`), Necroz solo sincroniza escudo y
  animación (`domeNecrozBehavior.ts:750-755`).

### 6.5 Panel de entrenamiento (`src/ui/DomeTrainingPanel.tsx`)

- Orden de los 8 enemigos (`TRAINING_ENEMY_ORDER`, `:26-35`): `abyssal_cell`,
  `spiral_octopus`, `crab_gunner`, `ground_golem`, `lightning_butterfly`,
  `giant_sparrow`, `prisma_necroz`, `kronos_leviathan`.
- Etiquetas ES (`ENEMY_LABELS`, `:37-46`): Célula Abisal, Pulpo Espiral,
  Cangrejo Artillero, Gólem Rompesuelos, Mariposa Relámpago, Gorrión Gigante,
  **Prisma Necroz**, **Leviatán KRONOS**.
- Secciones: `Enemigo (8/8)` con 8 botones + `Reiniciar enemigo` + alternancia
  `Quieto (pasivo)` / `IA activa`; `Ranuras 1 / 2 / 3` con `+Nv` y `Vaciar`;
  `Habilidades activas (7)` con `→1/→2/→3`; `Pasivas (3)` con niveles 0..3;
  `Extras` con `Recargar Vida + Edén (T)`.
- Visibilidad: `F2` o `Tab` (con `preventDefault`, sale de pointer lock al
  abrir y lo recupera al cerrar) (`domeGameLoop.ts:874-892`); también queda
  visible con la pausa abierta (`:828`).
- Puente al bucle (`DomeTrainingBridge`): `setEnemyArchetype`, `respawnEnemy`,
  `setEnemyPassive`, `equipSkill(slot, skillId)` (nivel 1 con su cooldown),
  `clearSlot`, `upgradeSlot`, `setPassiveLevel`, `refillResources`
  (`domeGameLoop.ts:332-360`).

---

## 7. Reporte de batalla de la Cúpula

### 7.1 Datos de entrada

`DomeBattleReportData` (`src/ui/DomeBattleReport.tsx:29-40`):
`score`, `wave`, `level`, `kills`, `barrierKills`, `maxSpeed`,
`survivalTimeSec`, `perfectRedirections`, `equippedSkills[{ id?, name, level }]`.

### 7.2 Métricas de la run (`src/game/dome/DomeRunStats.ts`)

`DomeRunTracker` (`:56-165`) acumula: `wave` (máximo), `kills`,
`elitesKilled`, `bossesKilled`, `barrierKills`, `maxSpeedReached`,
`maxLevelReached`, `survivalTimeSec`, `damageDealt`, `perfectRedirections`.
`recordKill({ isBoss, isElite })` cuenta el boss **o** el élite, no ambos
(`:74-81`); `recordBarrierKill()` suma kill + barrierKill (`:84-87`).

Pesos del score (`DOME_SCORE_WEIGHTS`, `:36-54`):

| clave | valor |
|---|---|
| `wave` | 500 |
| `kill` | 100 |
| `elite` | 750 |
| `boss` | 2500 |
| `barrierKill` | 125 |
| `redirection` | 150 |
| `speed` | 10 (por m/s entero) |
| `survival` | 5 (por segundo entero) |
| `damage` | 0.1 (por punto de daño) |
| `level` | 250 |

Fórmula (`getScore`, `:115-129`):

```
raw = wave*500 + kills*100 + elites*750 + bosses*2500 + barrierKills*125
    + redirections*150 + floor(maxSpeed)*10 + floor(survivalSec)*5
    + damageDealt*0.1 + maxLevel*250
score = max(0, round(raw))
```

### 7.3 Estilo dominante y envío al leaderboard

`computeDominantStyle` (`:179-190`):

- `bossesKilled > 0` → `'boss_slayer'`
- si no, `barrierKills * 3 >= kills && kills > 0` → `'barrier_trickster'`
- si no, `perfectRedirections * 2 >= kills && kills > 0` → `'redirector'`
- si no → `'kinetic_duelist'`

Mapeo a `LeaderboardEntryRecord` (`:205-222`):
`clear_time_sec = round(survivalTimeSec)`, `score = round(score)`,
`dominant_style` (arriba), `stealth_pct = 0`, `subterranean_pct = 0`,
`stasis_pct = 0`, `aggression_pct = round(100 * (1 − barrierKills / kills))` si
`kills > 0` (si no 0), `aerial_pct = round(100 * maxSpeedReached / 80)`
(`AERIAL_SPEED_REFERENCE = 80`), `alarms_triggered = wave`.

### 7.4 Pantalla

`DomeBattleReport` (`src/ui/DomeBattleReport.tsx`):

- Cabecera: subtítulo `CÚPULA PERDIDA · INFORME DE COMBATE`, título `GAME OVER`
  y `PUNTUACIÓN FINAL` con la cifra formateada por locale (`es-ES`, `en-US`,
  `ja-JP`) (`:250-262`, `i18n/es.json`).
- `ESTADÍSTICAS`: 4 tiles — `OLEADA`, `KILLS`, `TIEMPO SOBREVIVIDO`
  (`m:ss`), `VELOCIDAD MÁX.` (`x.x m/s`) (`:262-280`).
- Chips: `NIVEL`, `BARRERA`, `REDIRECCIONES` (`:281-291`).
- `CARGA FINAL`: ranura `R1..R3` con nombre y `Nv.` o
  `SIN HABILIDADES EQUIPADAS` (`:295-315`).
- Columna derecha: `FIRMA DEL PILOTO` (alta sin login, récord personal) o
  `MEJORES PILOTOS` con Top 5 (`BOARD_PREVIEW_LIMIT = 5`, `:49`), recarga
  manual y resaltado de la fila propia.
- Subida automática si hay apodo guardado y se supera el récord personal
  (`beatRecordOnMount`, `:221-241`).
- Acciones `JUGAR DE NUEVO` / `MENÚ PRINCIPAL` con atajos `[1]`/`[2]`
  (cabecera del archivo `:18-24`).

---

## 8. Resumen de daño/empuje de los tres enemigos

| arquetipo | fuente | daño a Nyx | empuje | cadencia / duración |
|---|---|---|---|---|
| `prisma_necroz` | pinchos defensivos | 12 | 24 m/s | se retraen al alejarse o a los 10 s |
| `prisma_necroz` | pirámides (esfera 85 m) | 10 | 22 m/s | 2.3 s crecer + 2.0 s mantener + 0.5 s |
| `prisma_necroz` | pareja de púas ofensivas | (las pirámides) | — | 0.9 s entre pareja, 2.8 s entre oleadas |
| `prisma_necroz` | púas teledirigidas | (las pirámides) | — | 1 por 0.45 s, 5 m/s, sep ≥ 1.0 m |
| `prisma_necroz` | escudo (cuerpo a cuerpo) | 0 | 26 m/s a Nyx | bloqueo si el triángulo está intacto |
| `giant_sparrow` | `air_ball` | 0 | 24 m/s | cd 1.45–2.05 s / (mult·0.9) |
| `giant_sparrow` | `wild_flap` | 0 | 32 m/s | 0.67 s de animación, cd 2.5 s |
| `giant_sparrow` | `shriek` | 0 (solo cámara) | — | 0.9 s, cd 8.5 s, shake 2.5 s |
| `giant_sparrow` | `drill_dive` | 25 | 65 m/s | windup 0.45 s + 1.65 s, speed 49.4 |
| `giant_sparrow` | `crash_stun` (autodaño) | 55 a sí mismo | — | 2.5 s |
| `giant_sparrow` | `clone_split` | 0 | — | 1.15 s, cd 6.2 s |
| `kronos_leviathan` | Anillos de Contención | 0 | 30 m/s | 3/2/1 anillos, 0.45 s entre ellos |
| `kronos_leviathan` | Latigazo de Cola | 18 | 50 m/s | 0.35 + 0.26 + 0.32 s; fallo 2.0 s |
| `kronos_leviathan` | Mordisco por portales | 24 | 32 m/s | 0.5/0.7 s de secuencia, 0.8 s de vuelo |
| `kronos_leviathan` | `cosmos_fusion` | 16 (inesquivable) | — | 0.3 s de windup, fase 4 |

---

## 9. Índice de archivos citados

| archivo | contenido extraído |
|---|---|
| `src/game/dome/domeNecrozBehavior.ts` | escudo triangulado, pereza, pinchos, púas de esfera, rig/clips |
| `src/game/dome/domeSparrowBehavior.ts` | FSM del Gorrión, `air_ball`, `wild_flap`, `shriek`, dispersión, taladro, frenado/choque, slow-mo |
| `src/game/dome/domeKronosBehavior.ts` | 4 estrellas, cadena, 4 fases, anillos, latigazo, portales, `cosmos_fusion`, supernova, efectos |
| `src/game/dome/DomeWaveManager.ts` | plan de oleadas, spawn, passive/training, APIs de escudo/estrellas, proyectiles |
| `src/game/dome/DomeCombatSystem.ts` | stats por arquetipo, penetración de carne, `thorns_repel`, barrera |
| `src/game/dome/DomeEnemyModels.ts` | rigs, clips, shaders SOLAR RIFT / VOID COSMOS, clon espejismo |
| `src/game/dome/DomeSphereTiles.ts` | modos de suelos `miniboss` / `boss` |
| `src/game/dome/DomeRunStats.ts` | score y mapeo al leaderboard |
| `src/game/ai/BehaviorTracker.ts` | vector de comportamiento, pesos, normalización |
| `src/game/ai/AdaptationDirector.ts` | umbrales y contramedidas por planeta |
| `src/game/ai/KronosNeuralNet.ts` | MLP 8-10-4, pesos offline, backprop online, posturas |
| `src/game/entities/WorldObjects.ts` | KRONOS de campaña: posturas, escudo frontal, poderes |
| `src/game/GameEngine.ts` | acumulación por planeta y llamada al director |
| `src/ui/domeGameLoop.ts` | floors, entrenamiento, avance de oleada, easyMode, efectos de KRONOS |
| `src/ui/DomeTrainingPanel.tsx` | panel debug de entrenamiento |
| `src/ui/DomeBattleReport.tsx` | informe de combate de la Cúpula |
| `src/ui/BattleReportScreen.tsx` | informe de campaña con la red MLP |
| `public/models/enemies/{prisma_necroz,giant_sparrow,kronos_leviathan}.glb` | nodos y clips verificados |

## 10. Constantes declaradas sin consumidor (comprobado con grep)

- `domeKronosBehavior.ts`: `KRONOS_MAX_BEND_RAD`, `KRONOS_WAVE_FREQ`,
  `KRONOS_WAVE_PHASE_STEP`, `KRONOS_WAVE_YAW_AMP`, `KRONOS_FIN_FLAP_SPEED`,
  `KRONOS_FIN_FLAP_AMP`, `KRONOS_WHIP_FAN_RAD`, `KRONOS_STAR_SEGMENTS`.
- `domeKronosBehavior.ts`: funciones `clampDirToRef`, `signedHeadingTurn`,
  `updateKronosHeadBends`, `applyHeadScrutiny`, `updateKronosJaw` (solo
  referenciadas en `unusedKronosLegacyGuard` bajo `if (false)`).
- `DomeWaveManager.ts`: `updatePrismaNecrozPose` (sin call-site),
  `PRISMA_NECROZ_SPIKES_OUT_SCALE`, `PRISMA_NECROZ_SPIKES_IN_SCALE`,
  `PRISMA_NECROZ_DETAIL_RIM` (usados solo dentro de la función sin call-site),
  `EVASIVE_ARCHETYPES` (vacío) y `PRISMA_NECROZ_VULN_SEC` (escrituras
  inalcanzables).

---

## 5. Escenario del Domo, Suelos Flotantes, Shaders GLSL, Iluminación y VFX

# OUTORBIT — Arena de la cúpula: escenario, shaders GLSL, iluminación, materiales toon/cómic y VFX

Extracción pura de datos del código fuente en `/home/pakura/Proyectos/OUTORBIT`.
Cada valor de este documento se leyó íntegro en el archivo indicado y se volvió a confirmar con
búsqueda literal sobre el árbol de trabajo (dos pasadas). No hay valores inferidos ni estimados:
donde el código contradice un comentario del propio archivo, se indica expresamente.

Fecha de extracción: sesión de análisis sobre el commit `fb610ec`.

---

## 0. Archivos fuente obligatorios (leídos íntegros)

| Archivo | Líneas | Contenido extraído |
|---|---|---|
| `src/game/render/domeArenaScene.ts` | 1804 | Cúpula, bóveda espacial, abismo, singularidad, agujeros negros, pilar, monolitos, arcos, fragmentos, asteroides, prismas, 10 shaders GLSL |
| `src/game/dome/DomeSlabs.ts` | 665 | Colisión esfera/OBB/malla exacta, `updateSlabMotion`, `SLAB_SPECS`, `createDomeSlabs` |
| `src/game/dome/DomeFloatingSlabs.ts` | 463 | Pool de 10 suelos flotantes, cuerdas orbitales, transiciones, rotura, separación |
| `src/game/dome/DomeSlabGeometry.ts` | 467 | Geometría de trozo arrancado + shader del damero de baldosas |
| `src/game/dome/DomeSphereTiles.ts` | 475 | 320 baldosas triangulares de la cúpula geodésica, modos miniboss/boss |
| `src/game/render/toonMaterials.ts` | 657 | Estado global de shaders, cel-shading de 3 bandas, Inverted Hull, cielo dreamscape |
| `src/game/render/menuShaders.ts` | 176 | Divisor líquido del menú |
| `src/game/dome/ComicImpactVfx.ts` | 506 | VFX de impacto cómic (picos rombo + estrellas) |
| `src/game/dome/MotionVfx.ts` | 969 | Partículas, anillos, estelas, destellos, telémetro |
| `src/ui/DomeDarkMatterRings.tsx` | 236 | Overlay 2D de aros de materia oscura |
| `src/ui/TitleDioramaSandbox.ts` | 483 | Portada: fondo crepuscular, shader Cosmic Nebula, contornos blancos |
| `src/game/dome/DomeEnemyModels.ts` | 1310 | Shaders de carne nebular, Cuarzo Eléctrico, contornos vibrantes, SOLAR RIFT / VOID COSMOS |

Archivos auxiliares consultados para completar datos citados en la tarea:
`src/ui/domeGameLoop.ts` (luces, renderer, cámara, wiring de VFX), `src/game/dome/domeTypes.ts`
(radios), `src/game/dome/DomeSkills.ts` (shaders de bolas capturadas y cúpula de área, escombros),
`src/game/dome/DomeWaveManager.ts` (shaders de bolas de tinta y bolas eléctricas),
`src/game/render/nyxModelLoader.ts` (material Cosmic Nebula de NYX), `src/game/GameEngine.ts`
(luces del nivel de ciudad, para contraste).

---

## 1. Escenario: la cúpula esférica

### 1.1 Dimensiones exactas

| Constante | Valor | Archivo:línea |
|---|---|---|
| `DOME_RADIUS` (malla de cristal del backdrop) | `90` | `domeArenaScene.ts:36` |
| `DOME_ARENA_RADIUS` | `90` | `domeTypes.ts:203` |
| `DOME_PLAYER_BOUND_RADIUS` (barrera de gameplay) | `88.6` | `domeTypes.ts:204` |
| `TILE_SURFACE_RADIUS` (cara pisable de las baldosas) | `DOME_PLAYER_BOUND_RADIUS - 1.1` = **87.5** | `DomeSphereTiles.ts:21` |
| `TILE_THICKNESS` (prisma hacia fuera) | `2.2` → cara exterior a **89.7** | `DomeSphereTiles.ts:23` |
| `ABYSS_Y` (plano del vórtice abisal) | `-125` | `domeArenaScene.ts:47` |

Nota verificada: el comentario de cabecera de `domeArenaScene.ts` habla de «cúpula de cristal de
50 m» y el de `DomeSlabs.ts` de «cúpula de 50 m», pero el valor real en código es `DOME_RADIUS = 90`
en ambos módulos (`domeArenaScene.ts:36`, `DomeFloatingSlabs.ts:28`). El dato válido es 90 m de radio.

### 1.2 Iluminación y estado del renderer (modo cúpula)

Todo el modo cúpula se monta en `startDomeGameLoop` (`src/ui/domeGameLoop.ts`).

| Elemento | Valor verificado | Línea |
|---|---|---|
| Renderer | `new THREE.WebGLRenderer({ canvas, antialias: true })` | `domeGameLoop.ts:128` |
| Pixel ratio | `Math.min(window.devicePixelRatio, 2)` | `:129` |
| Escena | `new THREE.Scene()` — **sin** `scene.fog` | `:132` |
| Cámara | `PerspectiveCamera(settingsRef.current.baseFov, aspect, 0.1, 2500)` | `:133-138` |
| FOV por defecto / límites | `baseFov: 70`, límites `min 55`, `max 85` | `settings.ts:174`, `:126` |
| Luz principal | `DirectionalLight(0xdbeafe, 1.5)`, `position.set(60, 120, 40)` | `:141-143` |
| Luz ambiente | `AmbientLight(0x818cf8, 0.65)` | `:144` |

Estado global de iluminación de los materiales cel (`src/game/render/toonMaterials.ts:7-21`):

```ts
const globalShaderState = {
  uSunDir: { value: new THREE.Vector3(0.48, 0.42, -0.78).normalize() },
  uHalftoneEnabled: { value: 1.0 },
  uTime: { value: 0.0 },
};
export const sharedShaderState = globalShaderState;
```

Es decir: el «sol» de los shaders cel apunta a **norte (-Z)** con elevación positiva
(`0.48, 0.42, -0.78` normalizado) y **no coincide** con la `DirectionalLight` de la escena
(`60, 120, 40`): los materiales cel son shaders propios que no leen luces de Three.js.

Para contraste, el nivel de ciudad (`GameEngine.ts:275-285`) usa otra iluminación:
`DirectionalLight(0xfff2d8, 2.4)` en `(320, 420, 220)`, `DirectionalLight(0x8b5cf6, 0.7)` en
`(-260, -120, -300)`, `HemisphereLight(0x9d7bff, 0x0b0618, 0.55)` y `AmbientLight(0xffffff, 0.32)`.

### 1.3 Niebla: inexistente

Verificado con búsqueda literal: no existe ninguna aparición de `new THREE.Fog`, `FogExp2`,
`scene.fog` ni `.fog =` en `src/`. Todos los materiales que podrían verse afectados declaran
explícitamente `fog: false` (cielo, discos de acreción, anillos de guía, divisor del menú, backdrop
de ciudad). La profundidad atmosférica se resuelve **solo** con shaders (rim Fresnel, gradientes y
halftone), no con niebla de escena.

Tampoco hay sombras ni post-proceso: cero apariciones de `castShadow`, `receiveShadow`, `shadowMap`,
`EffectComposer`, `UnrealBloom`, `renderer.toneMapping` u `outputColorSpace` en `src/`.

### 1.4 Cúpula de cristal (`domeArenaScene.ts:1023-1064`)

| Pieza | Definición exacta |
|---|---|
| Geometría | `new THREE.IcosahedronGeometry(90, 3)` |
| Material | `MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, fog: false })` |
| Nombre | `'dome-crystal'` |
| Retícula | `new THREE.EdgesGeometry(domeGeo, 6)` (umbral 6°) sobre la misma geometría |
| Material de retícula | `LineBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.22, fog: false })` |
| Nombre de la retícula | `'dome-geodesic'` |
| Pulse por frame | `domeLineMat.opacity = 0.22 + 0.035 * (0.5 + 0.5 * Math.sin(elapsed * 0.8))` |
| Anillos guía | `TorusGeometry(90.1, 0.08, 6, 96)`, `MeshBasicMaterial({ color: 0x22d3ee, opacity: 0.25, depthWrite: false, fog: false })` |
| Guías | anillo ecuatorial (`rotation.x = π/2`), meridiano A (sin rotar), meridiano B (`rotation.y = π/2`) |

### 1.5 Barrera de juego (88.6 m)

No existe malla de barrera. El límite es puramente numérico: `DOME_PLAYER_BOUND_RADIUS = 88.6`
(`domeTypes.ts:204`) usado por `NyxDomeController.ts:3640-3643` (rebote del jugador),
`DomeCombatSystem.checkDomeBarrierKill` / `computeBarrierImpact`, y `DomeWaveManager.ts:341`
(`DOME_BARRIER_RADIUS_SQ`). El único indicador visual del rebote es el VFX
`MotionVfxSystem.spawnDomeBounceRing` (§9.3).

---

## 2. Cuerpos celestes y arquitectura orbital del backdrop

`createDomeArenaBackdrop(scene)` (`domeArenaScene.ts:995`) monta todo en un único `THREE.Group`
llamado `'dome-arena-backdrop'`, con PRNG determinista `mulberry32(20250601)`.

| Constante | Valor | Línea |
|---|---|---|
| `MONOLITH_COUNT` | 14 | `:39` |
| `ARC_COUNT` | 8 | `:40` |
| `FRAGMENT_COUNT` | 36 | `:41` |
| `ASTEROID_COUNT` | 11 | `:42` |
| `STAR_COUNT` (estrellas de 4 puntas) | 260 | `:43` |
| `PRISM_COUNT` | 16 | `:44` |
| `ABYSS_Y` | -125 | `:47` |

### 2.1 Bóveda espacial — shader `SKY_*` (`:189-248`)

- Malla: `SphereGeometry(800, 48, 32)`, `ShaderMaterial` con `side: BackSide`, `depthWrite: false`,
  nombre `'space-vault'`.
- Uniforms: `uTime`.
- Gradiente de altura `h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0)`:
  - `deep  = vec3(0.0157, 0.0196, 0.0627)` → **#040510**
  - `mid   = vec3(0.0471, 0.0784, 0.1882)` → **#0c1430**
  - `top   = vec3(0.1176, 0.0627, 0.2196)` → **#1e1038**
  - Mezclas: `mix(deep, mid, smoothstep(0.0, 0.55, h))`, luego `mix(col, top, smoothstep(0.52, 1.0, h))`.
- Nebulosa: dos campos `fbm` derivando (`dir * 2.6` con `uTime * 0.006 / 0.004`; `dir * 4.2` con
  `uTime * 0.005`); `nebA = vec3(0.10, 0.05, 0.22)`, `nebB = vec3(0.02, 0.14, 0.18)`;
  aporte `mix(nebA, nebB, n2) * pow(n1, 2.0) * 0.6`.
- Estrellas nítidas en dos capas de rejilla:
  - Capa densa: `dir * 55.0`, umbral `step(0.86, rnd)`, radio `smoothstep(0.10, 0.015, d)`,
    titileo `0.7 + 0.3 * sin(uTime * 1.7 + rnd * 90.0)`, color `vec3(0.85, 0.92, 1.0)`,
    ganancia `(0.35 + rnd * 0.8)`.
  - Capa escasa brillante: `dir * 26.0`, umbral `step(0.965, rnd2)`, radio
    `smoothstep(0.16, 0.03, d2)`, titileo `0.75 + 0.25 * sin(uTime * 2.3 + rnd2 * 130.0)`,
    tinte `mix(vec3(1.0, 0.85, 0.7), vec3(0.7, 0.85, 1.0), hash13(cell2 + 21.1))`, ganancia `1.4`.

### 2.2 Estrellas de 4 puntas — shaders `STAR_*` (`:316-361`)

- `THREE.Points` con atributos `aSize`, `aColor`, `aPhase`, `aSpeed`; material
  `ShaderMaterial({ uniforms: { uTime, uPixelScale: { value: 520 } }, transparent: true,
  depthWrite: false, blending: AdditiveBlending })`; nombre `'four-point-stars'`,
  `frustumCulled = false`.
- Distribución: `shellPoint(rng, 105, 250, ...)` (corona esférica de 105 a 250 m).
  `aSize = 1.1 + rng()*1.9`; `aSpeed = 0.6 + rng()*2.2`; `aPhase = rng()*2π`.
- Paleta: `[0x22d3ee, 0xf8fafc, 0xfbbf24, 0xf43f5e]`.
- Vertex: `vTwinkle = 0.55 + 0.45 * sin(uTime * aSpeed + aPhase)`;
  `gl_PointSize = aSize * uPixelScale / max(1.0, -mv.z)`.
- Fragment (cruz de 4 puntas):
  `vSpike = smoothstep(0.075, 0.0, ax) * pow(max(0.0, 1.0 - ay * 2.0), 1.5)` (y su simétrico
  `hSpike` en X), `core = smoothstep(0.20, 0.0, d)`, `glow = smoothstep(0.5, 0.0, d) * 0.22`;
  `a = clamp(vSpike + hSpike + core + glow, 0.0, 1.0) * vTwinkle`; `discard` si `a < 0.004`;
  color final `vColor * (0.85 + 0.6 * core)`.

### 2.3 Agujero negro abisal — shaders `ABYSS_*` (`:251-313`)

- Grupo `'abyss-singularity'` en `y = -125`; malla `PlaneGeometry(850, 850)` rotada `-π/2`,
  nombre `'abyss-vortex'`; `ShaderMaterial` transparente, `depthWrite: false`, `DoubleSide`,
  uniform `uTime`.
- Espiral polar: `spiral = ang * 2.0 + lr * 3.2 - uTime * 0.055` con `lr = log(max(r, 0.0008))`.
- Dos `fbm2` (`sp * 1.6 + vec2(0.0, uTime * 0.011)` y `sp * 3.2 - vec2(uTime * 0.008, 0.0)`);
  `mist = pow(clamp(n1 * 0.8 + n2 * 0.45, 0.0, 1.0), 1.6)`.
- Rampa morada documentada en el shader `#090218 -> #2e1065 -> #6b21a8 -> #c026d3`:
  - `c0 = vec3(0.0353, 0.0078, 0.0941)`
  - `c1 = vec3(0.1804, 0.0627, 0.3961)`
  - `c2 = vec3(0.4196, 0.1294, 0.6588)`
  - `c3 = vec3(0.7529, 0.1490, 0.8275)`
- Hebras: `threadA = pow(max(0.0, sin(spiral * 3.0 + n1 * 4.5)), 16.0)` teñida
  `vec3(0.55, 0.28, 1.0) * 0.7`; `threadB = pow(max(0.0, sin(spiral * 5.0 - n2 * 5.5 + 1.7)), 24.0)`
  teñida `vec3(1.0, 0.22, 0.55) * 0.55`.
- Pozo: `throat = smoothstep(0.30, 0.06, r)`, mezcla a negro absoluto `vec3(0.0)`.
- Aro de horizonte: `rim = smoothstep(0.28, 0.33, r) * smoothstep(0.46, 0.34, r)`,
  color `vec3(0.62, 0.35, 1.0) * rim * 0.55`.
- Alpha: `smoothstep(1.0, 0.30, r)` modulado por `mist`; `discard` si `alpha < 0.004`.
- Anillos del abismo (3 `TorusGeometry(1, 0.016, 4, 128)` con `MeshBasicMaterial` aditivo):

| Radio | Color | Opacidad | `y` | Tilt | Velocidad de giro |
|---|---|---|---|---|---|
| 58 | `0x8b5cf6` | 0.55 | 1.4 | 0.05 | 0.09 |
| 96 | `0xc026d3` | 0.40 | 3.2 | -0.07 | -0.06 |
| 148 | `0x6d28d9` | 0.30 | 5.6 | 0.04 | 0.04 |

El grupo rota `abyssGroup.rotation.y += dt * 0.008` y cada anillo `rotation.z = elapsed * speed`.

### 2.4 Pilar del Mundo (`world-pillar`, posición `110, -40, -140`)

- Material `GALAXY_CEL` con `baseColor 0x1a1236`, `shadowTint 0x0a0718`, `veinA 0x22d3ee`,
  `veinB 0xa855f7`, `rimColor 0x7dd3fc`, `veinStrength 1.15`, `rimStrength 0.95`.
- 5 segmentos `CylinderGeometry(6.2, 7.4, 40, 8, 1)` fracturados (`fractureGeometry(geo, 0.35, 7)`),
  en `y = 20 + i * 50` (de y=-40 a y=200), jitter XZ `±1.5`, rotación aleatoria pequeña,
  `taper = 1 - (i / 4) * 0.22`, contorno `addComicOutline(seg, 0.4, 0xa5f3fc)`.
- Anillos de energía: `TorusGeometry(11.5, 0.45, 6, 48)` en alturas `[5, 55, 105, 155]`,
  alternando `createEnergyRingMaterial(0xfbbf24, 0xfff7d6, 2.4)` (oro) y
  `createEnergyRingMaterial(0x22d3ee, 0xe0fbff, 3.1)` (cian); inclinación
  `π/2 + (i - 1.5) * 0.16`, `rotation.y = i * 0.5`, precesión
  `speed = (i % 2 === 0 ? 1 : -1) * (0.05 + i * 0.018)`.

### 2.5 Singularidad / Eclipse Cenital (`singularity`, posición `0, 175, -60`)

- Núcleo: `SphereGeometry(13, 48, 32)` con `createGravityLensMaterial(0x22d3ee, 0xa855f7, 0xffffff, 1.15)`,
  nombre `'singularity-lens'`.
- Disco interior: `RingGeometry(15, 34, 128, 4)`, `spin 0.55`, `opacity 1.0`,
  `colA 0x3b0764`, `colB 0x22d3ee`, `colC 0xf43f5e`, `colD 0xfbbf24`;
  `diskA.rotation.x = π/2`, wrapper `rotation.x = 0.42`, precesión `rotation.y = elapsed * 0.32`.
- Disco exterior: `RingGeometry(20, 46, 128, 4)`, `spin -0.34`, `opacity 0.55`,
  `colA 0x1e1b4b`, `colB 0x6d28d9`, `colC 0x22d3ee`, `colD 0xc4b5fd`;
  wrapper `rotation.set(-0.75, 0.6, 0)`, precesión `rotation.y = -elapsed * 0.21`.

### 2.6 Agujeros negros del horizonte (`horizon-black-hole-0/1`)

| # | Posición | Núcleo | Anillo | Tilt | Velocidad | `rimA`/`rimB` | `colA..colD` |
|---|---|---|---|---|---|---|---|
| 0 | `-185, 45, -150` | r 9.5 (esfera 40×28) | 13 → 30 | 0.55 | 0.24 | `0xa855f7` / `0x22d3ee` | `0x2e1065`, `0xa855f7`, `0xf0abfc`, `0xfbbf24` |
| 1 | `195, -20, 130` | r 7.5 (esfera 40×28) | 10.5 → 24 | -0.42 | -0.19 | `0x22d3ee` / `0x6366f1` | `0x0e7490`, `0x22d3ee`, `0x818cf8`, `0xffffff` |

Materiales: núcleo `createGravityLensMaterial(rimA, rimB, 0xffffff, 1.0)`; disco
`createAccretionMaterial({ inner, outer, spin: 0.48, opacity: 0.9, ... })` con
`RingGeometry(inner, outer, 96, 4)` y `rotation.x = π/2`.

### 2.7 Archipiélago de ruinas en órbita

**14 monolitos** (`InstancedMesh`, nombre `'monoliths'`): `CylinderGeometry(0.75, 1.6, 11, 5, 1)`
fracturado (`fractureGeometry(geo, 0.55, 3)`); material `GALAXY_CEL` con `baseColor 0x2b2150`,
`shadowTint 0x0d0a1e`, `veinA 0x22d3ee`, `veinB 0xa855f7`, `rimColor 0x9df3ff`, `veinStrength 1.0`,
`rimStrength 0.85`. Distribución en espiral de Fibonacci con ángulo dorado
`Math.PI * (3 - Math.sqrt(5))`, radio `120 + rng()*140`, escala `x/z = 2.4 + rng()*2.2`,
`y = 3.0 + rng()*3.0`, cuaternión uniforme (Shoemake). Paleta de instancia
`[0x231b45, 0x1a1533, 0x2b2150, 0x151d38]` multiplicada por `0.85 + rng()*0.35`.
Contorno: `createInkOutlineMaterial(makeTime(), 0.5, 0x9df3ff)`.

**8 arcos rúnicos**: `TorusGeometry(7, 0.55, 5, 26, π * 1.3)` + núcleo
`TorusGeometry(7, 0.13, 4, 40, π * 1.3)`. Material arco `GALAXY_CEL` (`baseColor 0x332a5e`,
`shadowTint 0x0d0a1e`, `veinA 0x22d3ee`, `veinB 0xf0abfc`, `rimColor 0x7dd3fc`, `veinStrength 1.1`,
`rimStrength 0.9`); material núcleo (`baseColor 0x86efff`, `shadowTint 0x0e7490`, `veinA 0xffffff`,
`veinB 0x22d3ee`, `rimColor 0xffffff`, `veinStrength 2.2`, `rimStrength 1.3`).
Azimut `(i / 8) * 2π + (rng() - 0.5) * 0.3`; elevación `-0.5 + (i % 4) * 0.42 + (rng() - 0.5) * 0.18`;
radio `120 + rng()*95`; escala `1.8 + rng()*1.2`; paleta `[0x2a2350, 0x332a5e, 0x1e2a4d]`;
contorno `0.3, 0x7dd3fc`.

**36 fragmentos**: `IcosahedronGeometry(1.15, 0)` fracturado `0.45`; material `COSMIC_ROCK`
(`rockColor 0x3b3266`, `shadowTint 0x0b0a14`, `crackA 0xa855f7`, `crackB 0x22d3ee`,
`rimColor 0xd8fbff`, `crackStrength 1.2`); órbitas planas con base ortonormal (`u`,`v` ⊥ normal),
radio `85 + rng()*135`, velocidad `(0.008 + rng()*0.04) * ±1`, escala `1.4 + rng()*2.4`,
giro `0.1 + rng()*0.4`; paleta `[0x3b3266, 0x2a2350, 0x1e2f4a, 0x4b3f7a]`;
contorno `0.12, 0xd8fbff`. Las matrices se recalculan por frame (`applyFragmentMatrices`).

**11 asteroides** (`'asteroid-current'`): `DodecahedronGeometry(1, 0)` fracturado `0.22`;
material `COSMIC_ROCK` (`rockColor 0x1b1533`, `shadowTint 0x07060f`, `crackA 0xa855f7`,
`crackB 0x22d3ee`, `rimColor 0xd8fbff`, `crackStrength 1.7`); radio `68 + rng()*107`,
velocidad `(0.012 + rng()*0.05) * ±1`, escala base `2.2 + rng()*4.0` con variación por eje,
giro `0.12 + rng()*0.55`; paleta `[0x0b0a14, 0x141026, 0x1b1533, 0x241a3d]`;
contorno `0.18, 0xd8fbff`.

**16 prismas de cristal galáctico** (`'floating-prisms'`): `OctahedronGeometry(1, 0)` escalado
`(1, 2.3, 1)`; material `CRYSTAL_PRISM` (`uCrystalTint 0x22d3ee`, `uRimColor 0xffffff`,
`uPulse 1.0`); radio `105 + rng()*150`, velocidad `(0.01 + rng()*0.035) * ±1`, escala
`1.4 + rng()*2.2`, giro `0.15 + rng()*0.5`, bob vertical `amp 1.5 + rng()*4.5` con
`speed 0.25 + rng()*0.7`; paleta `[0x22d3ee, 0xf8fafc, 0xfbbf24, 0xf43f5e]`;
atributo instanciado `aPhase` aleatorio; contorno `0.1, 0xffffff`.

---

## 3. Anillos de materia oscura (overlay 2D) — `src/ui/DomeDarkMatterRings.tsx`

Canvas 2D a pantalla completa con bucle `requestAnimationFrame` propio (sin estado de React),
montado junto al canvas de juego; lee `controllerRef.current.getDarkMatterRings()` por frame.

| Constante / parámetro | Valor | Línea |
|---|---|---|
| `RING_VERTICES` | 72 | `:21` |
| `REF_RADIUS` | 133 (unidades de referencia) | `:23` |
| `TIME_SPEED` | 0.9 (referencia +0.015/frame ≈ 0.9/s) | `:25` |
| `ROT_SPEED` | 0.85 (referencia +0.014/frame ≈ 0.84/s) | `:26` |
| DPR | `Math.min(window.devicePixelRatio \|\| 1, 2)` | `:131` |
| `dt` máximo por frame | `0.05` | `:153` |

Ruido angular `darkNoise(angle, t, freq, instability)` (`:35-56`): armónicos
`f1..f4 = round(3,7,13,29 * freq)` con pesos `0.4, 0.3, 0.2, 0.1` y espina
`pow(max(0, sin(angle*(f2+2) + t*3.5) * cos(angle*f3 - t*2.1)), 3) * instability * 1.4`.

Forma del polígono (`traceRingPath`, `:79-125`): `scale = ring.radius / 133`;
magnitud `pow(abs(raw), sign > 0 ? 3.1 * 0.75 : 3.1 * 1.2)`; `dirMult = 1.25 / 0.65`;
jitter por vértice `sin(i * 19.3 + t * 15 + ring.phase) * instability * 4` (solo si
`instability > 0.2`); radio mínimo `15` unidades de referencia; clamp en píxeles
**72 %..135 %** del radio del aro.

Estilo de dibujo:

- Aro principal: `spike = 0.85 + 0.4 * ring.t`, `freq 1.6`, `instability 0.55`, `radiusScale 1`.
  Halo `strokeStyle 'rgba(255, 255, 255, 0.16)'`, `lineWidth = 2.5 * strokeScale * 3.2`;
  trazo `'#ffffff'` con `lineWidth = 2.5 * strokeScale`; `lineJoin 'miter'`, `miterLimit 10`.
- Eco: 75 % de vértices (`Math.max(12, floor(72 * 0.75))` = 54), `radiusScale 0.88`,
  contrarrotación `-rotation * 1.3`, `freq * 1.15`, `instability * 1.1`, `tOffset 10.5`,
  `lineWidth = max(1, 1.125 * strokeScale)`, opacidad `baseAlpha * 0.45`.
- `strokeScale = clamp(radius / 133, 0.8, 1.2)`.
- Opacidad en estado pasivo (`ring.pulse === true`):
  `0.35 + 0.05 * sin(pulseTime * 9.4 + ring.phase)` → flujo **30 %..40 %**;
  con radar de Tab (`pulse === false`) alpha = 1.
- Los aros con `alpha <= 0.01` se saltan; si no hay aros, se limpia el canvas una sola vez.

---

## 4. Suelos: losas, suelos flotantes y baldosas de la cúpula

### 4.1 `DomeSlabs.ts` — colisión y losas estáticas

Modelo de colisión compartido por todos los suelos (`SlabCollider`, `domeTypes.ts`):

1. **OBB con triángulo 2D opcional** (`localTriangle2D`): punto más cercano en el plano XZ local
   (`closestPointOnTriangle2D`, Ericson) con clamp en Y por `halfExtents.y`; si el centro queda
   dentro, se expulsa por la cara de menor penetración.
2. **Malla exacta** (`exactMesh`): colisión contra los triángulos reales de la malla visible
   (tapa + raíz iceberg) escalados por `mesh.scale`; culling por esfera envolvente
   `exact.boundRadius`; margen de expulsión `ICEBERG_EXPEL_MARGIN = 0.06` (m de mundo).
3. **Raycast**: Möller–Trumbore para `exactMesh`; slab test por ejes para OBB
   (`raycastSlabs`, con `out` reutilizable y `t` en distancia de mundo).

`updateSlabMotion(slabs, time)` (`:135-144`): bob senoidal
`center = basePos + (0,1,0 rotado por quaternion) * sin(time * 0.9 + phase) * bobAmplitude`;
salta los slabs con `exactMesh` (los gestiona `DomeFloatingSlabManager.update`) y los de
`bobAmplitude <= 0`. Consumido por `NyxDomeController.ts:1402`.

`SLAB_SPECS` (`:593-613`), 10 losas, formato `pos / size / rot / bob / rim`:

| # | pos | size | rot | bob | rim |
|---|---|---|---|---|---|
| 0 | `0, -3.0, 0` | `22, 1.4, 22` | `0, 0.15, 0` | 0.18 | `#22d3ee` |
| 1 | `-30, 9.0, -20` | `15, 1.2, 15` | `0.35, 0.4, 1.15` | 0.35 | `#a855f7` |
| 2 | `32, 15.0, -16` | `16, 1.2, 12` | `-0.25, -0.5, -0.95` | 0.32 | `#22d3ee` |
| 3 | `0, 18.0, -42` | `18, 1.2, 14` | `π*0.48, 0.1, 0` | 0.28 | `#f43f5e` |
| 4 | `-38, -4.0, 28` | `14, 1.2, 16` | `0.2, -0.3, 1.35` | 0.38 | `#a855f7` |
| 5 | `6, 36.0, -24` | `20, 1.3, 15` | `π, 0.3, 0.12` (techo, boca abajo) | 0.25 | `#22d3ee` |
| 6 | `-20, -22.0, 24` | `14, 1.2, 14` | `0.42, -0.25, 0.35` | 0.40 | `#22d3ee` |
| 7 | `28, -16.0, 30` | `15, 1.2, 15` | `-0.65, 0.2, 0.48` | 0.36 | `#a855f7` |
| 8 | `42, 4.0, 30` | `13, 1.2, 13` | `0.55, 0.8, -0.45` | 0.42 | `#22d3ee` |
| 9 | `-24, 28.0, 26` | `15, 1.2, 14` | `-2.6, 0.4, 0.25` | 0.30 | `#a855f7` |

Materiales: `createComicCelMaterial('#1e1b4b', { rimColor: '#22d3ee', rimStrength: 0.78 })` y
`createComicCelMaterial('#17153b', { rimColor: '#a855f7', rimStrength: 0.78 })`; contorno
`addComicOutline(mesh, 0.055, color)` con color `0xa855f7` / `0xf43f5e` / `0x22d3ee` según spec;
`phase = idx * 1.15`; `halfExtents = size * 0.5`.
`createDomeSlabs` (línea 620) está exportado pero **no tiene ningún call site en `src/`**
(verificado por búsqueda); el sistema activo en el bucle de juego es `DomeFloatingSlabManager`
+ `DomeSphereTileManager` (`domeGameLoop.ts:146-148`).

### 4.2 `DomeFloatingSlabs.ts` — suelos arrancados que cruzan la cúpula

Bucle descrito en la cabecera del módulo: cada suelo activo recorre una **cuerda** que cruza la
esfera de parte a parte, nace fuera de la cúpula donde la cámara no mira, la atraviesa a
2.2..4.2 m/s con bob y rotación suaves, y al salir se desvanece y re-entra desde el borde.

| Constante | Valor | Línea |
|---|---|---|
| `POOL_SIZE` | 10 | `:17` |
| `ENTER_SPEED` | 1.5 (0→1 en ~0.7 s) | `:19` |
| `EXIT_SPEED` | 2.2 (0→1 en ~0.45 s) | `:21` |
| `SHATTER_SPEED` | 6.0 (0→1 en ~0.17 s) | `:23` |
| `ACTIVE_THRESHOLD` | 0.5 | `:25` |
| `DOME_RADIUS` | 90 | `:28` |
| `CHORD_SPAWN_R_MIN` / `MAX` | 96 / 102 | `:30-31` |
| `REENTRY_SPAWN_R` | 98 | `:33` |
| `CHORD_END_R` | 96 | `:35` |
| `EXIT_RADIUS` | 93 | `:37` |
| `CHORD_SPEED_MIN` / `MAX` | 2.2 / 4.2 m/s | `:39-40` |
| `MIN_GAP` | 5 m | `:42` |
| `ENTRY_CHECK_DIST` | 15 m | `:44` |
| `SPAWN_ATTEMPTS` | 12 | `:46` |
| `OFFSCREEN_DOT` | 0.2 | `:48` |
| `SEPARATION_RATE` | 5 (1/s) | `:50` |

Generación por instancia (`constructor`, `:99-160`), con PRNG `mulberry32(0x9e3779b9)`:
`seed = 1000 + i * 137`; `radiusX = 7 + rand()*6`; `radiusZ = 6 + rand()*6`;
`thickness = 1.6 + rand()*1.0`; orientación inicial
`rotation.set(±π*0.9, rand()*2π, ±1.2)`; `bobAmplitude = 0.22 + rand()*0.3`;
`spinSpeed = (rand()*2 - 1) * 0.12` rad/s; `phase = rand() * 2π`;
contorno `addComicOutline(mesh, 0.05, 0x090b14)`; material `createDameroTileMaterial()` propio
por instancia; `mesh.visible = false`, `mesh.scale.setScalar(0.0001)`.

Asignación de cuerda (`assignChord`, `:183-239`): dirección de nacimiento aleatoria en la esfera
exterior, radio `96..102` (o `18..56` en materialización inmediata, `98..98` al reciclar);
punto final con desviación aleatoria ×0.35 + opuesto ×96; valida separación
`sepRadiusA + sepRadiusB + 5` en el nacimiento **y** a 15 m del tramo de entrada; exige
`dot(normalize(spawnPos - camPos), camFwd) < 0.2` (fuera de vista) y corta en cuanto ambas
condiciones se cumplen.

Ciclo por frame (`update`, `:322-403`):

1. Activación: si `active && !hasChord` → `assignChord`.
2. Avance: `basePos += chordDir * speed * dt`.
3. Reciclaje: marca `enteredInside` al pasar `r < 90`; `exiting = true` cuando
   `enteredInside && r > 93`.
4. Transición: `target = active && !exiting ? 1 : 0`;
   `speed = target === 1 ? 1.5 : (shattered ? 6.0 : 2.2)`; `moveTowards`.
5. Al llegar a 0 con `exiting` → nueva cuerda desde `R = 98` (y `shattered = false`).
6. Escala con easing `eased = t*t*(3-2t)`, mínimo `0.0001`; `halfExtents` escalados igual.
7. `mesh.rotateY(spinSpeed * dt)`; quaternion e inverso del collider sincronizados.
8. Bob sobre el eje local `+Y`: `sin(elapsed * 0.9 + phase) * bobAmplitude`.
9. Uniforms: `uOpacity = transition`, `uTime = elapsed`, `uWarning = warningLevel`.

Rotura (`shatterSlab(slabId)`, `:304-315`): solo si `active && !exiting`; pone
`exiting = true` y `shattered = true` (fade a `SHATTER_SPEED`) y devuelve el collider para que el
llamador genere escombros. Uso real: `domeGameLoop.ts:480-486` (`onSlabSmash` →
`shatterSlab` + `skillExecutor.spawnSlabDebris(shattered.center, 4)`).

Separación mutua (`resolveSeparation`, `:405-440`): si dos suelos visibles están a menos de
`sepRadiusA + sepRadiusB + 5`, se empujan a lo largo de la línea que los une con
`push = (minDist - dist) * min(1, 5 * dt) * 0.5` (mitad cada uno, vía `shiftSlab`).

`setTargetCount(count)` (0..10): oleadas básicas piden 4..7
(`domeGameLoop.ts:206-208`: `4 + floor(random()*4)`), miniboss y boss ponen 0.
`materializeActiveImmediate` materializa al instante (transition = 1) para que el Cangrejo
Artillero nazca anclado a un suelo.
`getActiveColliders()` devuelve los colliders con `transition >= 0.5` en un array reutilizado.

### 4.3 `DomeSlabGeometry.ts` — geometría del trozo y shader del damero

**Geometría** (`createTornSlabGeometry(seed, radiusX, radiusZ, thickness)`):

| Parámetro | Valor |
|---|---|
| `CONTOUR_VERTS` | 20 (contorno irregular, jitter angular acotado a `0.55` de medio paso) |
| `ICEBERG_RINGS` | 5 anillos de raíz (el 0 es el borde de la tapa) |
| Jitter radial del contorno | `0.78 + rand()*0.42 + 0.12 * sin(i * 2.399 + seed * 0.71)` |
| Profundidad de raíz | `(radiusX + radiusZ) * (0.26 + rand()*0.16)` (≈4-7.5 m) |
| Desplazamiento del ápice | `±radiusX * 0.38`, `±radiusZ * 0.38` |
| Taper de anillos | `1 - 0.5 * pow(t, 1.25)`; deriva `pow(t, 1.6)` |
| Ruido radial | `fbm3` con `radialAmp = 0.36 * pow(t, 1.3)` |
| Espolones | `spur > 0.4 ? (spur - 0.4) * 0.85 * t : 0` |
| Ruido vertical | `yBase - yNoise * depth * 0.09 * pow(t, 1.4)` |
| Tapa | abanico desde el centro en `Y = +thickness/2`, normal exacta `(0, 1, 0)`, `aIsTop = 1` |
| UVs de la tapa | `(x * 0.35, z * 0.35)` |
| Roca | triángulos **no indexados**, normal por cara (flat shading), `aIsTop = 0` |

Salida: `{ geometry, halfExtents: Vector3(maxX, thickness/2, maxZ), boundRadius, capContour }`.
La cara superior del collider coincide con la tapa (`Y = +halfExtents.y`), de modo que la raíz
colgante es solo visual salvo en la colisión exacta por malla.

**Shader del damero** (`tileVertexShader` / `tileFragmentShader`, `:75-206`):

- Uniforms: `uWarning`, `uOpacity`, `uTime`, `uSunDir` (propio, **no** compartido:
  `new THREE.Vector3(0.35, 0.8, 0.45).normalize()`, `:235`).
- Atributo de vértice: `aIsTop` (**solo** este atributo decide si una cara es baldosa; con flat
  shading, crestas que miran arriba no se pintan como baldosas).
- Paleta literal del shader: `TILE_LIGHT vec3(0.910, 0.933, 0.969)` (**#e8eef7** marfil),
  `TILE_DARK vec3(0.106, 0.145, 0.220)` (**#1b2538** azul-gris),
  `GROUT vec3(0.043, 0.078, 0.125)`, `ACCENT_A vec3(0.204, 0.827, 0.600)` (**#34d399**),
  `ACCENT_B vec3(0.133, 0.827, 0.933)` (**#22d3ee**), `ROCK_DARK vec3(0.094, 0.067, 0.149)`
  (**#181126**), `ROCK_LIT vec3(0.169, 0.114, 0.239)` (**#2b1d3d**),
  `WARN_RED vec3(1.0, 0.145, 0.106)`, `WARN_AMBER vec3(1.0, 0.522, 0.106)`,
  `RIM_INK vec3(0.490, 0.408, 0.839)`.
- Cel de 3 bandas: `celBands(ndl)`: `> 0.62 → 1.0`, `> 0.18 → 0.66`, resto `0.38`.
- Damero: `cell = vUv * 2.0`, `check = mod(id.x + id.y, 2.0)`, juntas
  `smoothstep(0.028, 0.05, g)`; franjas de acento cada 4 baldosas
  (`mod(id.x, 4.0) < 0.5`) con pulso `0.72 + 0.28 * sin(uTime * 1.8 + (id.x + id.y) * 0.6)`;
  color de acento `mix(ACCENT_A, ACCENT_B, 0.5 + 0.5 * sin(id.x*1.7 + id.y*2.3))`.
- Rim de baldosa `pow(1 - abs(dot(normalW, vViewDir)), 3.0) * 0.16`.
- Roca: `mix(ROCK_DARK, ROCK_LIT, band)` con grietas
  `crackNoise(vLocalPos * 1.35)` (`1 - smoothstep(0.0, 0.055, abs(n))`, oscurece 32 %),
  labio rasgado `smoothstep(0.12, 0.6, vLocalNormal.y) * 0.22` y rim violeta
  `pow(1 - abs(dot(normalW, vViewDir)), 2.6) * 0.30`.
- Aviso: `pulse = 0.5 + 0.5 * sin(uTime * 7.0)`, `warnAmt = uWarning * (0.42 + 0.38 * pulse)`,
  mezcla a `mix(WARN_RED, WARN_AMBER, pulse) * (0.95 + 0.5 * pulse)`.
- Material `transparent: true`, sale con `alpha = uOpacity`.

### 4.4 `DomeSphereTiles.ts` — baldosas triangulares de la cúpula geodésica

- Fuente: `new THREE.IcosahedronGeometry(DOME_ARENA_RADIUS = 90, 3)` convertida a no indexada.
  El comentario del módulo fija **320 triángulos** (20 caras × 16 sub-triángulos); el código
  deriva `triangleCount = pos.count / 3` de la geometría real.
- Cada triángulo se convierte en un prisma triangular: marco ortonormal con `+Y = inward` (normal
  hacia el centro), centro a `-(TILE_SURFACE_RADIUS + TILE_THICKNESS/2)` → cara interior pisable a
  **87.5 m**, espesor `2.2`.
- Geometría (`buildTileGeometry`): 9 triángulos, `addGroup(0, 3, 0)` (cara interior, material 0) y
  `addGroup(3, 21, 1)` (resto del prisma, material 1); UVs de la cara superior
  `1 / CHECKER_TILE_METERS = 1/4`.
- Material 0: `MeshStandardMaterial` con texturas canvas 256×256
  (`map`: `#f5f7ff` / `#152a6e` / juntas `#3b4a6b`; `emissiveMap`: junta horizontal `#22d3ee`,
  vertical `#34d399`), `emissive 0xffffff`, `emissiveIntensity 0.85`, `roughness 0.55`,
  `metalness 0.05`, `RepeatWrapping`, `SRGBColorSpace`, `anisotropy 4`.
- Material 1: `createComicCelMaterial('#141a2e', { rimColor: '#38bdf8', rimStrength: 0.5 })`.
- `TILE_POOL_SIZE = 120` mallas reutilizadas.

Modos (`setMode`):

| Modo | Comportamiento | Constantes |
|---|---|---|
| `'none'` | todo desactivado | — |
| `'miniboss'` | 10..20 triángulos aleatorios; rotan cada 10 s; aviso 2,2 s antes | `MINIBOSS_ROTATE_PERIOD = 10.0`, `MINIBOSS_WARN_LEAD = 2.2` |
| `'boss'` | 120 triángulos fijos elegidos con Fisher-Yates sin reemplazo sobre los 320 | `TILE_POOL_SIZE = 120` |

Aviso pre-rotación (`applyWarning`, `:454-467`): `pulse = 0.5 + 0.5 * sin(elapsed * 9.0)`,
`flicker = sin(elapsed * 47.0) > 0 ? 1 : 0.25`, tinte `warnRed (0xff2a1a) ↔ warnAmber (0xffb020)`
con `0.5 + 0.5 * sin(elapsed * 5.5)`, `emissiveIntensity = 0.85 + (1.4 + pulse * 1.8) * flicker`,
vibración a lo largo de la normal interior `sin(elapsed * 62.0) * 0.07 * (0.4 + 0.6 * pulse)`.
Colliders: `oneSidedTop: true`, `localTriangle2D` = proyección XZ del triángulo,
`phase = tileIndex * 0.37`, `bobAmplitude = 0`, `id = 'dome-tile-<n>'`.

### 4.5 Escombros y regeneración

- `DomeFloatingSlabManager.shatterSlab` saca el suelo de la colisión de inmediato (fade a 6.0) y
  luego lo recicla con una cuerda **nueva** desde `R = 98` — no reaparece en el mismo sitio.
- `domeGameLoop.ts:480-486`: `onSlabSmash` → `shatterSlab` + `spawnSlabDebris(center, 4)`.
- `DomeSkillExecutor.spawnSlabDebris(origin, count)` (`DomeSkills.ts:1020-1053`): crea rocas
  `small`/`medium` (`sizeKind = i % 3 === 0 ? 'medium' : 'small'`) con `velocity` aleatoria
  normalizada × `2.5 + random()*3.5` y `spinAxis` aleatorio.
- Límites y succión (`DomeSkills.ts:96-102`): `MAX_LOOSE_DEBRIS = 12` (se descarta el más antiguo),
  `DEBRIS_ABSORB_RADIUS = 9` m, `DEBRIS_ABSORB_DISTANCE = 0.7` m,
  `DEBRIS_DRIFT_DAMPING = 0.8` (1/s). Los escombros absorbidos pasan a fragmentos orbitantes del
  Campo Gravitacional (`absorbDebrisIntoField`).
- Las baldosas de la cúpula (`DomeSphereTiles`) no generan escombros: solo rotan de set.

---

## 5. Inventario completo de shaders GLSL personalizados

| # | Shader (constantes / función) | Archivo | Uniforms principales | Técnica |
|---|---|---|---|---|
| 1 | `GLSL_NOISE` (librería) | `domeArenaScene.ts:110` | — | `hash13`, `vnoise`, `fbm` (4 octavas), `hash12`, `vnoise2`, `fbm2` (5 octavas), `halftoneDots` (30°) |
| 2 | `SKY_VERTEX` / `SKY_FRAGMENT` | `:189` / `:197` | `uTime` | Gradiente vertical de 3 colores + nebulosa fbm doble + 2 capas de estrellas de rejilla |
| 3 | `ABYSS_VERTEX` / `ABYSS_FRAGMENT` | `:251` / `:259` | `uTime` | Espiral polar `log(r)`, rampa morada de 4 pasos, hebras, pozo negro, aro de horizonte |
| 4 | `STAR_VERTEX` / `STAR_FRAGMENT` | `:316` / `:337` | `uTime`, `uPixelScale` (520) | Puntos procedurales con cruz de 4 puntas, núcleo y glow |
| 5 | `GALAXY_CEL_VERTEX` / `GALAXY_CEL_FRAGMENT` | `:364` / `:394` | `uBaseColor`, `uShadowTint`, `uVeinA`, `uVeinB`, `uRimColor`, `uSunDir`, `uTime`, `uVeinStrength`, `uRimStrength`, `uHalftoneEnabled` | Cel 3 bandas + halftone + vetas fbm de galaxia + rim Fresnel; soporta `USE_INSTANCING` / `USE_INSTANCING_COLOR` |
| 6 | `INK_OUTLINE_VERTEX` / `INK_OUTLINE_FRAGMENT` | `:461` / `:487` | `uThickness`, `uTime`, `uInkColor` | Inverted Hull BackSide con grosor tipo pincel |
| 7 | `COSMIC_ROCK_FRAGMENT` (vertex reutiliza `GALAXY_CEL_VERTEX`) | `:498` | `uRockColor`, `uShadowTint`, `uCrackA`, `uCrackB`, `uRimColor`, `uSunDir`, `uTime`, `uCrackStrength`, `uHalftoneEnabled` | Cel 3 bandas + halftone + crestas de grieta (`1 - abs(2n-1)`) con pulso |
| 8 | `CRYSTAL_PRISM_VERTEX` / `CRYSTAL_PRISM_FRAGMENT` | `:564` / `:598` | `uCrystalTint`, `uRimColor`, `uSunDir`, `uTime`, `uPulse`, atributo `aPhase` | Arcoíris iridiscente por `dot(N,V)` + facetas cel + pulso por instancia |
| 9 | `GRAVITY_LENS_VERTEX` / `GRAVITY_LENS_FRAGMENT` | `:648` / `:662` | `uTime`, `uRimA`, `uRimB`, `uRimC`, `uIntensity` | Interior negro absoluto, horizonte de sucesos ardiente, photon ring, filo `pow(fres, 18)` |
| 10 | `ACCRETION_VERTEX` / `ACCRETION_FRAGMENT` | `:704` / `:712` | `uTime`, `uInner`, `uSpin`, `uOpacity`, `uColA..uColD` | Ring UV polar, espiral `fbm2` doble, hebras `pow(..., 14)`, aditivo |
| 11 | `ENERGY_RING_VERTEX` / `ENERGY_RING_FRAGMENT` | `:761` / `:775` | `uColorA`, `uColorB`, `uSunDir`, `uTime`, `uFlowSpeed` | Flujo circunferencial `uv.x * 2π * 3`, doble pulso, cel 3 bandas, rim mágico |
| 12 | `tileVertexShader` / `tileFragmentShader` | `DomeSlabGeometry.ts:75` / `:99` | `uWarning`, `uOpacity`, `uTime`, `uSunDir` | Damero de baldosas + roca iceberg, cel 3 bandas, grietas, rim, aviso rojo/ámbar |
| 13 | `celVertexShader` / `celFragmentShader` | `toonMaterials.ts:40` / `:67` | `uColor`, `uShadowTint`, `uRimColor`, `uRimPower`, `uRimStrength`, `uEmissiveBoost`, `uOpacity`, `uSunDir`, `uHalftoneEnabled` | Cel-shading estándar del juego + halftone + rim + rebote de cielo |
| 14 | Inline de `addComicOutline` | `toonMaterials.ts:229` | `uThickness`, `uNoiseAmp`, `uInkColor`, `uDistanceScale` | Inverted Hull con skinning y engorde por distancia |
| 15 | `skyVertexShader` / `skyFragmentShader` | `toonMaterials.ts:302` / `:310` | `uSunDir`, `uTime`, `uHalftoneEnabled` | Cosmic Dreamscape: 5 colores, sol de cómic, planeta anillado, nubes cel-stepped, auroras, estrellas |
| 16 | `starVertexShader` / `starFragmentShader` | `toonMaterials.ts:513` / `:534` | `uTime`, atributos `aPhase`, `aTint` | Titileo + sparkle `pow(..., 6)` en octaedros instanciados |
| 17 | `dividerVertexShader` / `dividerFragmentShader` | `menuShaders.ts:30` / `:38` | `uTime`, `uAspect` | Blade diagonal líquido + papel + filo de tinta + estela carmesí/violeta/cian + halftone |
| 18 | `SHARD_VERT` / `SHARD_FRAG` + `NOISE_GLSL` | `ComicImpactVfx.ts:46` / `:94` / `:60` | `uTime`, `uColorA` (0x8b5cf6), `uColorB` (0x4c1d95), atributos `color`, `aVoid` | Picos planos o nebulosa de pantalla según `aVoid` |
| 19 | `particleVertexShader` / `particleFragmentShader` | `MotionVfx.ts:37` / `:52` | atributos `aColor`, `aAlpha`, `aSize` | Puntos suaves con tamaño `aSize * 320 / -mv.z` |
| 20 | `enemyNebulaVert` / `enemyNebulaFrag` | `DomeEnemyModels.ts:120` / `:145` | `uColorA`, `uColorB`, `uRimColor`, `uTime`, `uOpacity`, `uEmissiveBoost` | Universo interior fbm + `starLayer` + wobble de energía + alpha Fresnel |
| 21 | `createButterflyQuartzMaterial` (vertex+frag inline) | `DomeEnemyModels.ts:262` | `uTime`, `uCharge` (0.45), `uEmissiveBoost` | Cuarzo facetado + arcos piezoeléctricos en ranuras + fresnel cristalino |
| 22 | `addVibratingInkOutline` (vertex+frag inline) | `DomeEnemyModels.ts:362` | `uThickness`, `uNoiseAmp`, `uInkColor`, `uTime`, `uDistanceScale` | Inverted Hull que vibra con `energyWobble` igual que la carne |
| 23 | `kronosCosmosVert` / `kronosCosmosFrag` | `DomeEnemyModels.ts:1102 / :1121` | `uDeepColor`, `uNebulaA`, `uNebulaB`, `uRimColor`, `uTime`, `uOpacity`, `uEmissiveBoost` | Cosmos de pantalla (portado de `character-sheet.html`) para SOLAR RIFT / VOID COSMOS |
| 24 | `capturedInkBallMaterial` (inline) | `DomeSkills.ts:594` | `uDeepColor`, `uNebulaA`, `uNebulaB`, `uRimColor`, `uTime` | Nebulosa cósmica de bola de tinta capturada |
| 25 | `capturedElectricBallMaterial` (inline) | `DomeSkills.ts:669` | `uDeepColor`, `uNebulaA`, `uElectricCyan`, `uRimColor`, `uTime` | Cosmos + arcos voltaicos (híbrido Nyx/Mariposa) |
| 26 | `AREA_DOME_VERT` / `AREA_DOME_FRAG` → `createAreaDomeMaterial` | `DomeSkills.ts:409` | `uColorA` (0x22d3ee), `uColorB` (0xa855f7), `uOpacity` (0.55) | Cúpula de área con rim `smoothstep(0.35, 1.0, f)` y alpha `uOpacity * (0.10 + rim * 0.90)` |
| 27 | `inkProjectileMaterial` (inline) | `DomeWaveManager.ts:1173` | `uTime` | Galaxia/plasma carmesí con pulso de vértices (`wobble * 0.085`) y motas estelares |
| 28 | `makeElectricBallShader` | `DomeWaveManager.ts:1259` | `uTime`, `uCoreCol`, `uArcCol`, `uHaloCol` | Plasma de alto voltaje con dos bolts ortogonales y halo Fresnel |
| 29 | `nyxVert` / `nyxFrag` (Cosmic Nebula de NYX) | `nyxModelLoader.ts:13` / `:31` | `uDeepColor` `#090314`, `uNebulaA` `#7e22ce`, `uNebulaB` `#06b6d4`, `uRimColor` `#f8fafc`, `uTime`, `uGravityShift`, `uSpeed01` | Nebulosa + estrellas interiores; rim cian-violeta al activar Gravity Shift |
| 30 | `backdropVertexShader` / `backdropFragmentShader` | `TitleDioramaSandbox.ts:38` / `:47` | `uTime`, `uAspect` | Fondo líquido con domain warping y estrellas finas |
| 31 | `nyxVertexShader` / `nyxUniverseFragmentShader` | `TitleDioramaSandbox.ts:171` / `:186` | `uDeepColor`, `uNebulaA`, `uNebulaB`, `uRimColor`, `uTime`, `uOpacity` (0.90) | Copia literal del Cosmic Nebula de portada con skinning |
| 32 | `addSkinnedWhiteOutline` (inline) | `TitleDioramaSandbox.ts:289` | `uThickness`, `uNoiseAmp` (0.2) | Inverted Hull blanco puro con skinning |

---

## 6. Ficha por shader: constantes exactas

### 6.1 Cel-shading de galaxia — `GALAXY_CEL_FRAGMENT` (`domeArenaScene.ts:394-458`)

```
lit  = base * 1.18
mid  = mix(base, uShadowTint, 0.30)
dark = mix(base, uShadowTint, 0.66)
NdotL < 0.10 -> dark ; NdotL < 0.46 -> mid ; resto -> lit
```

- Halftone solo en el terminador: activo si `uHalftoneEnabled > 0.5 && NdotL > -0.30 && NdotL < 0.36`;
  `halftoneDots(gl_FragCoord.xy, 6.0)`; `threshold = (1.0 - smoothstep(-0.22, 0.36, NdotL)) * 0.45`;
  si `dots < threshold` → `mix(col, uShadowTint * 0.9, 0.5)`.
- Vetas: `q = vWorldPos * 0.055 + vec3(0.0, -uTime * 0.14, uTime * 0.05)`;
  `n1 = fbm(q)`, `n2 = fbm(q * 2.35 + vec3(uTime * 0.08, 0.0, 0.0))`;
  `vein = smoothstep(0.50, 0.80, n1*0.62 + n2*0.58)`;
  `veinCol = mix(uVeinA, uVeinB, smoothstep(0.30, 0.85, n2))`;
  aporte `veinCol * vein * uVeinStrength * (0.40 + 0.60 * smoothstep(-0.25, 0.70, NdotL))`.
- Rim: `fres = pow(1 - max(dot(N,V),0), 2.6)` → `smoothstep(0.08, 0.85, fres)`.
- Defaults del factory (`:829-848`): `uShadowTint 0x161b33`, `uVeinA 0x22d3ee`,
  `uVeinB 0xa855f7`, `uRimColor 0x7dd3fc`, `uVeinStrength 0.85`, `uRimStrength 0.7`.

### 6.2 Roca cósmica — `COSMIC_ROCK_FRAGMENT` (`:498-561`)

```
lit  = base * 1.25 ; mid = mix(base, uShadowTint, 0.32) ; dark = mix(base, uShadowTint, 0.70)
NdotL < 0.08 -> dark ; NdotL < 0.44 -> mid
halftone: escala 5.5, rango -0.30..0.34, threshold (1 - smoothstep(-0.20, 0.34, NdotL)) * 0.40
```

- Grietas de maná: `q = vWorldPos * 0.17 + vec3(0.0, uTime * 0.03, 0.0)`;
  `n2 = fbm(q * 2.7 + vec3(3.1, uTime * 0.05, 0.0))`; `ridge = 1 - abs(n1*2 - 1)`;
  `crack = smoothstep(0.80, 0.99, ridge*0.65 + n2*0.45)`;
  `pulse = 0.65 + 0.35 * sin(uTime * 1.7 + n1 * 14.0)`;
  `crackCol = mix(uCrackA, uCrackB, smoothstep(0.30, 0.80, n2))`.
- Rim: `pow(1 - max(dot(N,V),0), 3.0)`, `smoothstep(0.10, 0.90, fres) * 0.55`.
- Defaults (`:877-895`): `uShadowTint 0x0b0a14`, `uCrackA 0xa855f7`, `uCrackB 0x22d3ee`,
  `uRimColor 0xd8fbff`, `uCrackStrength 1.5`.

### 6.3 Contorno de tinta del backdrop — `INK_OUTLINE_*` (`:461-495`)

- `trazo = sin(position.x * 7.3 + position.y * 5.1) * cos(position.z * 6.7 - position.y * 4.2)`;
  `width = max(0.008, uThickness * (1.0 + trazo * 0.35))`; extrusión por normal en espacio local;
  `vInk = uInkColor * (0.82 + 0.18 * sin(uTime * 2.1 + position.y * 0.7))`.
- Soporta `USE_INSTANCING` (aplica `instanceMatrix` a posición y normal).
- Grosores usados: pilar `0.4` (`0xa5f3fc`), monolitos `0.5` (`0x9df3ff`), arcos `0.3`
  (`0x7dd3fc`), fragmentos `0.12` (`0xd8fbff`), asteroides `0.18` (`0xd8fbff`), prismas `0.1`
  (`0xffffff`).

### 6.4 Prisma de cristal — `CRYSTAL_PRISM_FRAGMENT` (`:598-645`)

```
rainbow = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + ndv * 1.45 + uTime * 0.05 + vPhase * 0.12))
irid    = mix(rainbow, uCrystalTint * vTint, 0.42)
band    = 0.55 ; NdotL > 0.46 -> 1.15 ; NdotL > 0.10 -> 0.85
pulse   = 0.72 + 0.28 * sin(uTime * 1.9 + vPhase * 6.28318) ; col *= pulse * uPulse
rim     = pow(1.0 - ndv, 2.2) -> + uRimColor * smoothstep(0.10, 0.95, fres) * 1.15
```

### 6.5 Lente gravitacional — `GRAVITY_LENS_FRAGMENT` (`:662-701`)

```
col = vec3(0.0)                                  // interior negro absoluto
swirl    = 0.5 + 0.5 * sin(atan(N.z, N.x) * 3.0 + uTime * 0.85 + fres * 9.0)
ring     = smoothstep(0.42, 0.92, fres)
col     += mix(uRimA, uRimB, swirl) * ring * (0.85 + 0.75 * swirl) * uIntensity
photon   = smoothstep(0.30, 0.42, fres) * (1.0 - smoothstep(0.42, 0.55, fres))
col     += uRimC * photon * 0.35
filo     = pow(fres, 18.0) * 2.2 * uIntensity
```

### 6.6 Disco de acreción — `ACCRETION_FRAGMENT` (`:712-758`)

- `spiral = ang * 2.0 + log(max(r, 0.0015)) * 4.2 - uTime * uSpin`; muestreo
  `(cos, sin) * (0.55 + r * 2.6)`.
- `n1 = fbm2(sp * 1.7 + vec2(0.0, uTime * 0.02))`, `n2 = fbm2(sp * 3.4 - vec2(uTime * 0.015, 0.0))`,
  `plasma = clamp(n1 * 0.72 + n2 * 0.52, 0.0, 1.0)`.
- Rampa de 4 colores con `smoothstep` en `0.12..0.52`, `0.48..0.78`, `0.76..1.0`.
- Hebra: `pow(max(0.0, sin(spiral * 3.0 + n1 * 5.0)), 14.0) * 0.9` teñida `uColD`.
- Borde: `smoothstep(uInner, uInner + 0.14, r) * (1.0 - smoothstep(0.70, 1.0, r))`;
  `alpha = edge * (0.30 + 0.70 * plasma) * uOpacity`; `discard` si `< 0.004`.
  `uInner` se normaliza como `inner / outer` en el factory (`:947-970`).
- Material: `transparent`, `depthWrite: false`, `DoubleSide`, `AdditiveBlending`, `fog: false`.

### 6.7 Anillos de energía — `ENERGY_RING_FRAGMENT` (`:775-816`)

```
flow   = vUv.x * 6.28318 * 3.0 - uTime * uFlowSpeed
pulse  = pow(0.5 + 0.5 * sin(flow), 3.0)
pulse2 = pow(0.5 + 0.5 * sin(flow * 2.0 + 1.7), 6.0)
col    = mix(uColorA, uColorB, pulse) * (0.55 + 0.85 * pulse + 0.60 * pulse2)
band   = 0.62 ; NdotL > 0.46 -> 1.15 ; NdotL > 0.10 -> 0.88
rim    = pow(1 - max(dot(N,V),0), 2.4) -> + uColorB * smoothstep(0.10, 0.90, fres) * 0.9
```

### 6.8 Cel-shading estándar del juego — `celFragmentShader` (`toonMaterials.ts:67-147`)

```
litColor = baseColor * 1.12 ; midColor = mix(baseColor, uShadowTint, 0.28) ; darkColor = mix(baseColor, uShadowTint, 0.62)
NdotL < 0.12 -> darkColor ; NdotL < 0.48 -> midColor
halftone: uHalftoneEnabled > 0.5 && NdotL > -0.25 && NdotL < 0.34
          halftonePattern(gl_FragCoord.xy, 6.5)
          threshold = smoothstep(0.34, -0.20, NdotL) * 0.42
          dots < threshold -> mix(finalColor, uShadowTint * 0.85, 0.55)
fresnelRaw = 1 - max(dot(N,V),0) ; fresnel = pow(fresnelRaw, uRimPower)
fresnel = smoothstep(0.10, 0.82, fresnel) * (0.72 + 0.28 * fresnel)
finalColor += uRimColor * fresnel * uRimStrength
skyBounce = max(-NdotL, 0.0) ; finalColor += uRimColor * skyBounce * 0.08
finalColor += baseColor * uEmissiveBoost
```

Defaults de `createComicCelMaterial` (`:150-186`): `rimColor 0x7dd3fc`, `rimPower 3.2`,
`rimStrength 0.55`, `emissiveBoost 0.0`, `shadowTint 0x161b33`, `transparent false`,
`opacity 1`, `side FrontSide`; `uSunDir` y `uHalftoneEnabled` **compartidos**.
`setHalftonesEnabled(enabled)` escribe `globalShaderState.uHalftoneEnabled.value` (afecta a todos
los materiales cel y al cielo cómic). `createToonMaterial(color, emissive)` delega en el cel y mapea
`emissive` a `rimColor` + `emissiveBoost 0.32`.

### 6.9 Inverted Hull del juego — `addComicOutline(mesh, thickness = 0.045, color = 0x090b14, distanceScale = 0)`

- Uniforms: `uThickness`, `uNoiseAmp` (0.35), `uInkColor`, `uDistanceScale`.
- `brushVar = sin(x*7.3 + y*5.1) * cos(z*6.7 - y*4.2)`;
  `width = max(0.008, uThickness * (1.0 + brushVar * uNoiseAmp))`;
  `distScale = 1.0 + clamp(-modelViewMatrix[3].z / 18.0, 0.0, 1.0) * uDistanceScale`.
- Si la malla es `SkinnedMesh`, el contorno se crea como `SkinnedMesh` con el mismo
  `skeleton`/`bindMatrix` (si no, el trazo queda congelado en bind pose).
- Grosores usados: suelos estáticos `0.055`; suelos flotantes `0.05` (`0x090b14`);
  enemigos carne `0.05` (`0xffffff`), `detail_*` `0.04` (tinta blanca), `star_core` `0.035`
  (`0xffe58f`), mariposa/cuarzo `0.04` (`0x7dd3fc`); todos con `INK_DISTANCE_SCALE = 2.6`.
- Multiplicador por oleada (`DomeEnemyModels.ts:102-112`):
  `enemyInkScaleForWave(wave) = 1 + 0.25 * floor((max(1, wave) - 1) / 10)` →
  oleadas 1-10 x1, 11-20 x1.25, 21-30 x1.5, 31-40 x1.75.

### 6.10 Cielo cómic del nivel de ciudad — `skyFragmentShader` (`toonMaterials.ts:310-511`)

Aunque pertenece al modo ciudad, es el otro cielo del juego y comparte `uSunDir`/`uHalftoneEnabled`:
`SKY_RADIUS = 1800`, `STAR_COUNT = 900`, `STAR_SHELL_RADIUS = 1650`.
Paleta documentada y fijada en shader: zafiro `#2258cc`, turquesa `#42bde8`, aqua-menta `#7ae8dc`,
lavanda-rosa `#df9fff`, melocotón dorado `#ffd992`; abismo bajo `h < 0.36` en
`vec3(0.08, 0.05, 0.22)`. Sol: disco `smoothstep(0.9955, 0.9985, sd)`, halo `pow(sd, 220.0)`,
anillos cel `fract(ang * 7.0)`. Planeta: dirección `normalize(vec3(-0.36, 0.24, -0.90))`,
`pUV = (dot(offset, right), dot(offset, up)) / 0.30`, bandas
`sin(pUV.y * 9.0 + sin(pUV.x * 2.0) * 0.6)`, anillos perla-oro/cian con `sin(ringR * 30.0)`.
Estrellas de 4 puntas por rejilla `vec2(az * 22.0, el * 44.0)`, umbral `step(0.86, sHash)`.
Halftone solo en las transiciones de banda (`h 0.40-0.52` y `0.62-0.74`), escala `7.0`.
Tintes de estrellas (`STAR_TINTS`): `[1.0, 0.88, 0.62]`, `[0.62, 0.92, 1.0]`, `[1.0, 0.72, 0.85]`,
`[1.0, 0.98, 0.95]`. El grupo sigue la posición de la cámara cada frame y las estrellas rotan
`y += dt * 0.004`, `x += dt * 0.0015`.

---

## 7. Menú: divisor líquido y portada

### 7.1 `menuShaders.ts` — divisor líquido «Cosmic Nebula»

- Quad a pantalla completa (`PlaneGeometry(2, 2)`), `renderOrder = 10`, `depthTest/depthWrite false`,
  `fog: false`, cámara `OrthographicCamera(-1, 1, 1, -1, 0.1, 10)` en `z = 1`.
- Uniforms: `uTime`, `uAspect`.
- Silueta: `baseEdgeX = mix(0.40, 0.24, 1.0 - uv.y)` (arriba ~42 % del ancho, abajo ~25 %);
  onda `sin(uv.y * 9.0 + t * 1.2) * 0.40 + (n1 - 0.5) * 1.25 + (n2 - 0.5) * 0.55`,
  amplitud final `(wave / 1.5) * 0.022`.
- Bandas por `d = uv.x - fluidEdgeX`:
  - `d < 0` → papel `vec3(0.945, 0.945, 0.929)` (**#f1f1ed**) con rejilla de 96 px al 55 %.
  - `0 <= d < 0.003` → filo de tinta `vec3(0.043, 0.051, 0.071)`, alpha `0.92`.
  - `0.003 <= d < 0.055` → estela líquida: tinta → `crimson vec3(0.88, 0.11, 0.28)` /
    `plum vec3(0.42, 0.19, 0.90)` / `cian vec3(0.13, 0.83, 0.93)`, halftone `6.5` con
    `dotMask = smoothstep(0.7, 0.1, f) * 0.45`, alpha `0.42` en punto / `0.2` fuera.
  - resto → transparente.

### 7.2 `TitleDioramaSandbox.ts` — portada

| Dato | Valor |
|---|---|
| Renderer | `antialias: true`, `alpha: false`, `setPixelRatio(min(dpr, 2))`, `setClearColor(0x0a0e25, 1)`, `autoClear = false` |
| Cámara | `PerspectiveCamera(30, 1, 0.1, 100)` a **3.85 m** del centro `(0, 0.92, 0)` |
| Dirección de cámara | `TITLE_CAM_DIR = normalize(0.30, 0.14, 1.0)` |
| Desplazamiento de proyección | `setViewOffset(w, h, -shift * w, 0, w, h)` con `shift = clamp((w - 640) / 900, 0, 1) * 0.17` |
| Fondo | shader `backdrop*`, `depthTest/Write false`, `renderOrder = -10`; `t = uTime * 0.16` |
| Paleta del fondo | `abyss (0.020, 0.024, 0.062)`, `deepTeal (0.045, 0.240, 0.360)`, `elecCyan (0.080, 0.520, 0.680)`, `warmSilk (0.520, 0.140, 0.340)`; vena `vec3(0.22, 0.75, 0.92) * 0.25`; estrellas con `h > 0.88`, rejilla `24.0` |
| Material de NYX | Cosmic Nebula: `uDeepColor #090314`, `uNebulaA #7e22ce`, `uNebulaB #06b6d4`, `uRimColor #f8fafc`, `uOpacity 0.90`, `transparent`, `depthWrite: true`, `FrontSide` |
| Ojos | `MeshBasicMaterial({ color: 0x0f172a, toneMapped: false })` |
| Contornos blancos | cuerpo `0.015`, pelo `0.011`, cara `0.008`; `uNoiseAmp 0.2`; `width = max(0.002, ...)`; fragment blanco puro |
| Giro | `180°/min` en X e Y (`radPerSec = degToRad(180) / 60`), `rotY` inicial `-0.34`, `rotZ = -0.10 + sin(t * 0.13) * 0.06` |
| Pase del divisor | `renderer.clear()` → escena → `clearDepth()` → `dividerScene` con su cámara ortográfica |

---

## 8. VFX de impacto estilo cómic — `ComicImpactVfx`

### 8.1 Estructura y paletas

| Constante | Valor | Línea |
|---|---|---|
| `MAX_SHARDS` | 128 (rombos) | `:30` |
| `MAX_STARS` | 6 (sprites) | `:31` |
| `COLOR_RED` | `0xff1e42` | `:33` |
| `COLOR_WHITE` | `0xf8fafc` | `:34` |
| `COLOR_INK` | `0x09070d` | `:35` |
| `COLOR_VOID` | `0x7c3aed` | `:37` |
| `COLOR_GLOW` | `0x8ff5ff` | `:38` |

- **Picos**: un único `BufferGeometry` de 128 quads (4 vértices, 6 índices) = **una draw call**;
  atributos `position`, `color`, `aVoid`; material `ShaderMaterial({ side: DoubleSide })` con
  `uTime`, `uColorA 0x8b5cf6`, `uColorB 0x4c1d95`. Material **opaco**: los picos desaparecen por
  estrechamiento, sin blending.
- **Estrellas**: pool de 6 `Sprite` con 2 texturas canvas de 128 px (7 y 10 puntas; relleno
  `#ffffff`, contorno `#09070d` con `lineWidth 6`, `miterLimit 10`, `rExt = size * 0.46`,
  `rInt = rExt * 0.28`), `SpriteMaterial` transparente, `depthWrite: false`.

### 8.2 API y escalados

`spawnComicHit(position, normal, intensity, enemyRadius = 1.6)`:

```
clamped    = clamp(intensity, 0.35, 1.3)
sizeScale  = 0.8 + enemyRadius * 0.38
estrella   = textura 0 (7 puntas), maxScale (2.3 + clamped * 2.0) * sizeScale, vida 0.1
picos      = 12 + round(clamped * 10 + enemyRadius * 2), factor 1.3 * sizeScale, paleta cómic
```

`spawnComicExplosion(position, radius)`:

```
estrella = textura 1 (10 puntas), maxScale 2.6 + radius * 1.9, vida 0.18, color final COLOR_VOID
picos    = 18 + floor(radius * 5 + random() * 8), intensity 1.3, factor 1.55, voidPalette, lifeScale 2.2
```

Por pico (`spawnShard`): `dist 0.1..0.35`, `speed (9 + rand*9) * (0.7 + intensity*0.5) * factor`,
`lenMax (0.9 + rand*1.6) * (0.75 + intensity*0.55) * factor`,
`widthMax (0.12 + rand*0.16) * factor`,
`life (0.16 + rand*0.14) * (factor > 1.2 ? 1.25 : 1) * lifeScale`.
Dirección sesgada a la normal: `d = normalize(d * 0.55 + normal * 0.75)`.
Paleta: golpes `roll > 0.25 -> RED`, `> 0.12 -> WHITE`, resto `INK`;
explosiones `roll > 0.42 -> VOID`, `> 0.2 -> GLOW`, resto `INK`.

### 8.3 Envolventes por frame (`updateShards`)

```
p        = 1 - life / maxLife
dist    += speed * pow(1 - p, 1.6) * dt
len      = lenMax * sin(min(1, p * 2.8) * (PI / 2)) * (1 - pow(p, 2.2))
width    = widthMax * (1 - pow(p, 1.3))
colapso  -> 12 ceros si len <= 0.02 o width <= 0.015
rombo    -> vértices: arranque (dist), costado+ (dist + len*0.2), punta (dist + len), costado-
billboard-> right = normalize(dir x (origin - cameraPos)), escalado por width
```

Estrellas: `scale = max(0.01, maxScale * sin(p * PI))`; color `COLOR_WHITE` mientras `p < 0.5`,
después `starEndColor` (`COLOR_RED` en golpes, `COLOR_VOID` en explosiones).
Shader de picos de vacío: `uv = gl_FragCoord.xy * 0.0048`, `drift = (uTime*0.045, -uTime*0.03)`,
`fbm(uv * 1.6 + drift)` y `fbm(uv * 2.5 - drift * 1.3 + n1 * 0.9)`, base
`vec3(0.02, 0.008, 0.035)`, estrellas
`starLayer(...14.0, 2.6) * 1.3 + starLayer(...24.0, 3.8) * 1.6` (umbral `h < 0.70` descarta).

---

## 9. VFX de movimiento — `MotionVfx`

### 9.1 Pools y shader de partículas

| Pool | Capacidad | Blending | Línea |
|---|---|---|---|
| `sparks` | `MAX_SPARKS = 360` | `AdditiveBlending` | `:23` |
| `dust` | `MAX_DUST = 240` | `NormalBlending` | `:24` |
| `rings` | `MAX_RINGS = 10` | `AdditiveBlending` | `:25` |
| `streaks` | `MAX_STREAKS = 64` | `AdditiveBlending` | `:26` |
| `flashes` | `MAX_FLASHES = 8` | `AdditiveBlending` | `:27` |

Vertex de partículas: `gl_PointSize = aSize * (320.0 / max(-mv.z, 0.1))`.
Fragment: `soft = smoothstep(0.5, 0.16, r)`, `discard` si `r > 0.5`, salida
`vec4(vColor, vAlpha * soft)`.
Integración: `pos += v * dt`; `v *= exp(-drag * dt)`; `v.y = v.y * drag + gravity * dt`;
`alpha = baseAlpha * fade²`; `size = baseSize * (0.6 + 0.4 * fade)`.

### 9.2 Estilos de ráfaga (valores exactos)

| Estilo | Color | Count | speed min/max | life min/max | drag | gravity | size | alpha |
|---|---|---|---|---|---|---|---|---|
| `STYLE_SPARK` | `0xffc24d` | 22 | 2 / 6.5 | 0.35 / 0.8 | 3 | 0 | 0.25 | 1 |
| `STYLE_DUST_LAND` | `0xf6efe0` | 16 | 1.6 / 4.2 | 0.45 / 0.95 | 4.2 | -1.2 | 0.62 | 0.85 |
| `STYLE_DUST_TAKEOFF` | `0xf3ead6` | 12 | 1.2 / 3.4 | 0.35 / 0.7 | 5 | -0.6 | 0.5 | 0.7 |
| `STYLE_DUST_SLIDE` | `0xfff6e6` | 10 | 2.4 / 5.6 | 0.3 / 0.65 | 3.4 | -0.8 | 0.55 | 0.8 |
| `STYLE_DUST_ROCK` | `0x8d99ae` | 14 | 2.2 / 5.4 | 0.4 / 0.85 | 3.6 | -1.6 | 0.5 | 0.9 |
| `STYLE_WAKE` | `0xd9e6ff` | 8 | 0.4 / 1.8 | 0.55 / 0.85 | 1.1 | 0 | 0.34 | 0.55 |
| `STYLE_ABSORB` | `0xc084fc` | 14 | 1.4 / 3.6 | 0.2 / 0.4 | 6 | 0 | 0.3 | 0.95 |

Todos comparten `spread: 1`; el tinte por partícula se multiplica por `0.78 + random()*0.22` y el
tamaño por `0.7 + random()*0.6`.

### 9.3 Eventos y anillos

| Método | Composición exacta |
|---|---|
| `spawnBurst(pos, normal?, color = 0xffc24d, count = 22)` | `STYLE_SPARK` con color/count sobreescritos |
| `spawnDomeBounceRing(pos, normal)` | anillo `0xffffff` max 8 / vida 0.7 / op 0.9 + anillo `0xff4d6d` max 4.5 / 0.32 / 0.95 + 26 chispas `0x9be8ff` |
| `spawnEnemyExplosion(pos, radius, color)` | color aclarado `lerp(WHITE, 0.6)`; flash del color (escala `1.4 + radius`, vida 0.3) + flash blanco (`0.9 + radius*0.6`, 0.2); 46 chispas (speed 3..10, size 0.34) + 18 chispas blancas (speed 6..14, size 0.22); `STYLE_DUST_LAND`; anillo color `radius * 1.5` / 0.5 / 0.95 + anillo blanco `radius * 0.95` / 0.34 / 0.9 |
| `spawnFlash(pos, color, maxScale, lifetime)` | sprite billboard; escala `maxScale * (0.35 + 0.65 * sqrt(k))`; opacidad `(1-k)²` |
| `spawnImpactRing(pos, normal)` | `0xffc24d` 4.2 / 0.42 / 0.95 + `0xffffff` 2.4 / 0.3 / 0.8 |
| `spawnIcebergImpact(pos, normal)` | `STYLE_DUST_ROCK` + `STYLE_DUST_LAND` + 16 chispas `0xdbeafe` |
| `spawnVoidImpactRing(pos, normal)` | `0xa855f7` 7.5 / 0.6 / 0.9 + `0x22d3ee` 4.6 / 0.42 / 0.85 |
| `spawnSonicBoomRing(pos, direction)` | `0x9be8ff` 5.5 / 0.55 / 0.85 + `0xffffff` 3.2 / 0.4 / 0.7 |
| `spawnDustBurst(pos, normal, kind)` | `land`: dust LAND + 8 chispas `0x67e8f9`; `takeoff`: dust TAKEOFF + 6 `0xfbbf24`; `slide`: dust SLIDE + 10 `0xfde68a`; `glance`: dust TAKEOFF + 6 `0xe2e8f0` |
| `spawnGravityWake(pos, direction)` | `STYLE_WAKE` + anillo `0xbfe9ff` 2.6 / 0.45 / 0.45 |
| `spawnAbsorbFlare(pos, kind)` | color dust: `exp 0x7ae8dc`, `eden 0xdf9fff`, `hp 0x7dffa8`; chispas: `exp 0x22d3ee`, `eden 0xa855f7`, `hp 0x4ade80` (10); anillo del color del dust, 1.7 / 0.28 / 0.8 |
| `spawnEdenPulse(pos, normal)` | anillo `0x22d3ee` 3.4 / 0.5 / 0.75 + 12 chispas `0x67e8f9` |

Geometría de anillos: `RingGeometry(0.8, 1, 48)`, `MeshBasicMaterial` blanco, `DoubleSide`,
aditivo, `depthWrite: false`. Animación: `scale = 0.8 + t * maxScale`,
`opacity = (1 - t)² * opacity0`; orientación `quaternion.setFromUnitVectors(RING_FORWARD, normal)`
con `RING_FORWARD = (0,0,1)` y normal normalizada (fallback `WORLD_UP`).
Textura de flash: canvas 64 px con gradiente radial y paradas `1`, `0.85` (0.3), `0.22` (0.62), `0`.

### 9.4 Estelas de viento y telémetro

**Estelas** (`LineSegments` con `vertexColors`, aditivo, `depthWrite: false`):

- Umbral y ritmo: solo si `speed > STREAK_MIN_SPEED = 10`;
  `accum += dt * (speed - 10) * 1.9`, máximo **6 estelas por frame**; si no, `accum = 0`.
- Reparto en cilindro: base `(_sRight, _sUp)` perpendicular a la velocidad (con fallback si
  `|velDir·up| > 0.95`); `radius = 1.2 + random()*4.2`; `angle = random() * 2π`;
  `ahead = 2 + random()*9`.
- Dirección **opuesta** a la velocidad; `streakSpeed = speed * 0.85 + 5`;
  `len = 1.2 + speed * 0.11`; `life = 0.32 + random()*0.26`.
- Color por vértice: cabeza `(0.82, 0.95, 1.0) * fade`, cola x `0.15`.
- Las estelas muertas se colapsan a 6 ceros (no dibujan).

**Telémetro de aterrizaje** (grupo `telemetry`, `visible = false` por defecto):

- Se activa solo si `mode !== 'grounded'`, hay slabs y `speed >= 2.5`.
- Dirección: en `speed_attack` con `speed > 6` usa la velocidad; si no, `-up` del cuerpo.
- `raycastSlabs(slabs, playerPos, dir, TELEMETRY_RANGE = 14, _telemetryHit)`.
- `near = 1 - clamp((dist - 1.5) / (14 - 1.5), 0, 1)`; `target = near²`;
  `opacity += (target - opacity) * (1 - exp(-12 * dt))`.
- Posición `hit.point + hit.normal * 0.03`; orientación `WORLD_UP -> hit.normal`;
  `radius = 0.55 + (1 - near) * 1.15`; disco escala `radius`, anillo `radius * (0.55 + near * 0.45)`.
- Disco: `CircleGeometry(1, 32).rotateX(-π/2)`, color `0x05030f`, `polygonOffset` factor/unidades
  `-2`; opacidad `0.34 * opacity`.
- Anillo: `RingGeometry(0.82, 1, 40).rotateX(-π/2)`, color `0x67e8f9`, aditivo;
  opacidad `0.85 * opacity`.

---

## 10. Shaders de enemigos y proyectiles

### 10.1 Carne nebular — `enemyNebulaVert` / `enemyNebulaFrag` (`DomeEnemyModels.ts:120-218`)

- Wobble compartido (`ENERGY_WOBBLE_GLSL`, `:77`):
  `energyWobble(pos, uTime) = sin(pos.x * 9.0 + uTime * 22.0) * cos(pos.y * 7.0 - uTime * 19.0)`;
  aplicado como `transformed + objectNormal * wobble * 0.045`.
- Fragment: `uv = gl_FragCoord.xy * 0.0048`, `drift = (uTime*0.045, -uTime*0.03)`,
  `n1 = fbm(uv * 1.6 + drift)`, `n2 = fbm(uv * 2.5 - drift * 1.3 + n1 * 0.9)`;
  base `vec3(0.02, 0.008, 0.035)`;
  `col = mix(col, uColorA * 0.48, smoothstep(0.36, 0.80, n1))`;
  `col = mix(col, uColorB * 0.62, smoothstep(0.48, 0.88, n2))`;
  estrellas `starLayer(+drift*0.35, 14.0, 2.6) * 1.3 + starLayer(-drift*0.22, 24.0, 3.8) * 1.6`
  (`starLayer` descarta `h < 0.70`);
  rim `pow(1 - max(dot(N,V),0), 2.2) -> smoothstep(0.25, 0.9, fresnel) * 0.65`;
  `alpha = mix(uOpacity * 0.45, min(0.92, uOpacity * 1.15), fresnel)`.
- Paletas por arquetipo (`:224-260`):
  - `abyssal_cell`: `FLESH_SLIME_STOPS [0x7f1d1d, 0x9a3412, 0x854d0e]` y
    `FLESH_SLIME_NEBULA [0xb91c1c, 0xd97706, 0xca8a04]` con muestreo aleatorio y desplazamiento
    `(t + 0.25) % 1`; `uOpacity 0.62`.
  - `spiral_octopus`: `0x2e1065 -> 0x581c87` y `0x6b21a8 -> 0x9333ea`; `uOpacity 0.76`.
  - resto: `0x7f152e -> 0x3b0d63` (carmesí oscuro a morado abisal) y
    `0xa12045 -> 0x5b21b6`; `uOpacity 0.76`.
- `rimColor` por arquetipo: `abyssal_cell 0xf59e0b`, `spiral_octopus 0xc084fc`,
  `lightning_butterfly 0x38bdf8`, resto `0xff2a9d`.

### 10.2 Cuarzo Eléctrico — `createButterflyQuartzMaterial` (`:262-428`)

Material de las placas de la Mariposa Relámpago: cristal facetado translúcido con arcos
piezoeléctricos que saltan entre las ranuras de las placas al vibrar.

- Uniforms: `uTime`, `uCharge` (**0.45** inicial), `uEmissiveBoost`. `transparent: true`,
  `depthWrite: true`. La lista de materiales con `uCharge` se recoge en `collectButterflyRig`
  (`:910-931`) como `quartzMaterials`.
- Facetado: `facet = floor(abs(dot(N, vec3(0.42, 0.78, 0.46))) * 4.5) / 4.5`.
- Colores: `quartzDeep vec3(0.08, 0.22, 0.48)`, `quartzMid vec3(0.16, 0.62, 0.88)`,
  `quartzSpec vec3(0.76, 0.96, 1.0)`; `col = mix(quartzDeep, quartzMid, 0.35 + facet * 0.65)`.
- Ranuras: `p = vLocalPos * 7.5`;
  `n1 = qNoise(p + vec3(uTime*7.0, -uTime*5.2, uTime*3.8))`;
  `n2 = qNoise(p*2.3 - vec3(uTime*11.5, uTime*8.4, -uTime*6.0))`;
  `ridge = 1 - abs(n1*2 - 1)`; `groove = smoothstep(0.82, 0.985, ridge * (0.6 + 0.4 * n2))`;
  `pulse = 0.55 + 0.45 * sin(uTime * 28.0 + vLocalPos.x * 9.0 + vLocalPos.y * 11.0)`;
  `arcIntensity = groove * pulse * (0.65 + uCharge * 1.45)`.
- Aportes: `vec3(0.32, 0.86, 1.0) * arcIntensity * 1.35`;
  `quartzSpec * pow(groove, 3.0) * (0.5 + uCharge)`.
- Fresnel cristalino: `pow(1 - max(dot(N,V),0), 2.0)`;
  `mix(vec3(0.25, 0.88, 1.0), vec3(0.68, 0.48, 1.0), fresnel * 0.45) * (0.65 + uCharge * 0.6) * fresnel`;
  `+ vec3(0.4, 0.9, 1.0) * uEmissiveBoost`.
- Alpha `mix(0.74, 0.96, clamp(fresnel + arcIntensity * 0.4, 0.0, 1.0))`.

### 10.3 Contorno vibrante de enemigos — `addVibratingInkOutline` (`:362-431`)

Idéntico al Inverted Hull global pero con `uTime` y `energyWobble` aplicados a la posición antes de
extruir: la tinta vibra exactamente igual que la carne. Uniforms: `uThickness`, `uNoiseAmp 0.35`,
`uInkColor`, `uTime`, `uDistanceScale` (`INK_DISTANCE_SCALE = 2.6`); `renderOrder = 2`;
comparte esqueleto si es `SkinnedMesh`.

### 10.4 Cosmos + electricidad: KRONOS (`:1088-1250`)

| Paleta | `deep` | `nebulaA` | `nebulaB` | `rim` | Uso |
|---|---|---|---|---|---|
| `KRONOS_SOLAR_RIFT_PALETTE` | `0x120614` | `0xbe123c` | `0xf59e0b` | `0xfde68a` | discos de Portales Cósmicos (Fase 3+), `uOpacity 0.92`, `DoubleSide` |
| `KRONOS_VOID_COSMOS_PALETTE` | `0x070518` | `0x4c1d95` | `0xe11d48` | `0xa5f3fc` | cuerpo del boss en Fase 4, `uOpacity 0.9`, `FrontSide` |

`kronosCosmosFrag` (portado de `character-sheet.html`): `uv = gl_FragCoord.xy * 0.0042`,
`n1 = fbm(uv * 1.4 + drift)`, `n2 = fbm(uv * 2.2 - drift * 1.3 + n1 * 0.85)`,
`mix(col, uNebulaA, smoothstep(0.34, 0.78, n1) * 0.85)`,
`mix(col, uNebulaB, smoothstep(0.44, 0.86, n2) * 0.75)`,
estrellas `starLayer(...16.0, 2.4) * 0.9 + starLayer(...28.0, 3.6) * 1.25` (`h < 0.82` descarta),
fresnel `pow(..., 2.6) -> smoothstep(0.25, 0.9) * 0.65`, flash `uRimColor * uEmissiveBoost * 0.4`.
`swapKronosFleshToVoidCosmos(root, animatedMaterials)` sustituye la carne y **conserva el `uTime`**
en la lista de materiales animados.
Portal: `CircleGeometry(1, 64)` (renderOrder 3) + aro `TorusGeometry(1, 0.045, 10, 72)` con
`MeshBasicMaterial({ color: 0xffd27a, opacity: 0.9, AdditiveBlending, DoubleSide })` (renderOrder 4).

### 10.5 Estrellas interiores (star_core) y detalles

| Constante | Valor | Línea |
|---|---|---|
| `STAR_CORE_COLOR` | `0xffcc33` | `:41` |
| `STAR_CORE_RIM` | `0xfff3b0` | `:42` |
| `STAR_CORE_EMISSIVE` | `1.45` | `:43` |
| `STAR_CORE_OUTLINE_THICKNESS` | `0.035` | `:44` |
| `STAR_CORE_INK` | `0xffe58f` | `:45` |
| `FLESH_INK_WHITE` | `0xffffff` | `:67` |
| `FLESH_OUTLINE_THICKNESS` | `0.05` | `:68` |
| `INK_DISTANCE_SCALE` | `2.6` | `:74` |
| `DETAIL_COLOR` / `DETAIL_RIM` | `0x241d38` / `0x6b5f8a` | `:87-88` |
| `DETAIL_OUTLINE_THICKNESS` | `0.04` | `:89` |

Los `star_core` se visten con
`createComicCelMaterial(0xffcc33, { rimColor: 0xfff3b0, rimStrength: 1.0, emissiveBoost: 1.45 })`,
`renderOrder = 0`, contorno `0.035 x enemyInkScale` en `0xffe58f`; la carne va con
`renderOrder = 1` y su contorno con `renderOrder = 2` (`depthWrite: true` oculta el interior del
BackSide blanco).
`ENEMY_MODEL_COLORS` (`:29-38`): `abyssal_cell 0x6b143b/0xff2a9d`,
`spiral_octopus 0x4b1369/0x2563eb`, `crab_gunner 0x7c192d/0xff2a9d`,
`ground_golem 0x3b0f54/0x1e40af`, `lightning_butterfly 0x164e63/0x38bdf8`,
`giant_sparrow 0x7f1d1d/0x2563eb`, `prisma_necroz 0x4c1d95/0xff2a9d`,
`kronos_leviathan 0x31105c/0x1d4ed8`.
`GLB_CACHE_VERSION = 10` (sufijo `?v=` en la URL de `/models/enemies/<archetype>.glb`).

### 10.6 Bolas de tinta ácida — `inkProjectileMaterial` (`DomeWaveManager.ts:1173-1225`)

- Uniforms: `uTime`. Sin texturas: shader procedural 3D (cero costuras UV).
- Vertex: `wobble = sin(x*7.5 + uTime*9.0) * cos(y*7.5 - uTime*7.5) * sin(z*7.5 + uTime*8.0)`;
  desplazamiento `normal * (wobble * 0.085)`.
- Fragment: `turb3D` de tres armónicos (`sin(x*3.2 + sin(y*2.7 + uTime*3.8)) * 0.5`,
  `cos(y*4.1 - sin(z*3.5 - uTime*4.6)) * 0.35`, `sin(z*5.3 + cos(x*4.4 + uTime*5.2)) * 0.25`);
  `swirl = turb3D(dir * 2.4 + ...)`, `veins = turb3D(dir * 5.2 + ...)`;
  `coreBand = smoothstep(0.48, 0.88, swirl * 0.65 + veins * 0.45)`,
  `crackle = smoothstep(0.80, 0.96, veins)`; motas estelares
  `step(0.955, hash31(floor(dir * 16.0 + vec3(0.0, uTime * 0.4, 0.0))))`.
- Colores: `voidCol vec3(0.035, 0.004, 0.015)`, `darkCrimson vec3(0.52, 0.02, 0.09)`,
  `acidRed vec3(1.0, 0.08, 0.20)`, `hotCore vec3(1.0, 0.58, 0.42)`;
  estrellas `vec3(1.0, 0.82, 0.78) * 0.9`; rim `vec3(1.0, 0.14, 0.28) * fresnel * 1.65`
  con `pow(..., 2.1)`.

### 10.7 Bolas eléctricas de plasma — `makeElectricBallShader` (`DomeWaveManager.ts:1259-1301`)

- Uniforms: `uTime`, `uCoreCol`, `uArcCol`, `uHaloCol`.
- Vertex: `spike = sin(x*18.0 + uTime*28.0) * sin(y*16.0 - uTime*24.0) * 0.055`;
  `displaced = position + normal * spike` (superficie que vibra).
- Fragment: `a1 = abs(sin(d.x*16.0 + uTime*25.0 + cos(d.y*14.0 - uTime*19.0)))`,
  `a2 = abs(cos(d.z*19.0 - uTime*31.0 + sin(d.y*11.0 + uTime*14.0)))`,
  `bolt = smoothstep(0.18, 0.0, a1) + smoothstep(0.14, 0.0, a2) * 0.85`;
  `col = mix(uCoreCol, uArcCol, clamp(bolt, 0, 1))`,
  `+ vec3(0.95, 0.99, 1.0) * pow(clamp(bolt, 0, 1), 2.2) * 1.45`,
  `+ uHaloCol * pow(1 - max(dot(N,V),0), 1.9) * 1.5`.
- Instancias: `electricProjectileMaterial` = (`0x091a45`, `0x38bdf8`, `0x7dd3fc`);
  `reflectedElectricMaterial` = (`0x064e3b`, `0x34d399`, `0x67e8f9`).

### 10.8 Bolas capturadas por el Campo Gravitacional (`DomeSkills.ts`)

- `capturedInkBallMaterial` (`:594`): `uDeepColor 0x090314`, `uNebulaA 0x7e22ce`,
  `uNebulaB 0x06b6d4`, `uRimColor 0xf8fafc`, `uTime`. `uv = gl_FragCoord.xy * 0.02`,
  `drift = (uTime*0.05, -uTime*0.03)`, `mix(col, uNebulaA * 0.85, smoothstep(0.42, 0.85, n))` y
  `mix(col, uNebulaB * 0.9, smoothstep(0.55, 0.95, fbm(uv * 1.7 - drift)))`; estrellas
  `fract(uv * 9.0)` con `h > 0.72` (radio `smoothstep(0.12, 0.0, d)`, titileo
  `0.6 + 0.4 * sin(uTime * 3.0 + h * 40.0)`, ganancia `1.4`); rim `pow(..., 2.0) * 0.85`;
  alpha `0.96`.
- `capturedElectricBallMaterial` (`:669`): `uDeepColor 0x0b0420`, `uNebulaA 0x7e22ce`,
  `uElectricCyan 0x22d3ee`, `uRimColor 0xe0f2fe`, `uTime`. `uv = gl_FragCoord.xy * 0.022`,
  `drift = (uTime*0.08, -uTime*0.05)`; arcos
  `boltWave = abs(sin(p.x*16.0 + uTime*22.0 + sin(p.y*12.0 - uTime*15.0)))`,
  `boltMask = smoothstep(0.16, 0.0, boltWave)`,
  `bolt2 = smoothstep(0.12, 0.0, abs(cos(p.z*19.0 - uTime*27.0 + sin(p.x*14.0))))`,
  `spark = clamp(boltMask + bolt2 * 0.85, 0.0, 1.0)`;
  `col = mix(col, uElectricCyan, spark * 0.85) + vec3(0.92, 0.98, 1.0) * pow(spark, 2.5) * 1.6`;
  rim `pow(..., 1.8) -> smoothstep(0.18, 0.9) * 1.25`; alpha `0.98`.
- Proyectiles cel del wave manager: `laserProjectileMaterial`
  `createComicCelMaterial(0xff2233, { rimColor: 0xffd9d9, rimStrength: 1.0, emissiveBoost: 1.3 })`;
  `windProjectileMaterial` `(0xbff4ff, { rimColor: 0xffffff, rimStrength: 1.0, emissiveBoost: 0.78 })`;
  `darkProjectileMaterial` `(0x1c1030, { rimColor: 0x6b4bff, rimStrength: 0.9, emissiveBoost: 0.35 })`;
  `kronosRingMaterial` `(0x9fd8ff, { rimColor: 0x66e0ff, rimStrength: 1.0, emissiveBoost: 0.9 })`.

---

## 11. Tabla resumen de colores hex verificados

| Hex | Uso |
|---|---|
| `0x22d3ee` | cian de marca: vetas de galaxia, anillos guía de la cúpula, `ACCENT_B`, rim de suelos |
| `0xa855f7` | violeta: `veinB`, rim de suelos, grietas de maná, anillo de impacto del vacío |
| `0x7dd3fc` | rim cel por defecto y tinta de arcos |
| `0xd8fbff` | tinta de fragmentos, asteroides y `uRimColor` de la roca cósmica |
| `0x9df3ff` | tinta de monolitos |
| `0x161b33` | tinte de sombra cel por defecto (nunca negro sucio) |
| `0x090b14` | tinta por defecto de `addComicOutline` y contorno de suelos flotantes |
| `0xfbbf24` / `0xfff7d6` | anillo de energía dorado del Pilar del Mundo |
| `0xf43f5e` | `colC` del disco interior de la singularidad; paleta de estrellas |
| `0x3b0764` / `0x1e1b4b` | violetas profundos de los discos de acreción |
| `0x6d28d9` / `0xc4b5fd` | `colB`/`colD` del disco exterior y anillo abisal |
| `0xff1e42` / `0xf8fafc` / `0x09070d` | paleta cómic de impacto (rojo / blanco / tinta) |
| `0x7c3aed` / `0x8ff5ff` | paleta de vacío (violeta / brillo cian) de explosiones |
| `0x8b5cf6` / `0x4c1d95` | `uColorA`/`uColorB` de la nebulosa de los picos |
| `0xf6efe0`, `0xf3ead6`, `0xfff6e6`, `0x8d99ae`, `0xd9e6ff`, `0xc084fc` | polvo de aterrizaje, despegue, derrape, roca, estela y absorción |
| `0xffc24d` | chispas por defecto y anillo de impacto de patada |
| `0x67e8f9` | anillo del telémetro y chispas de aterrizaje/Edén |
| `0x090314`, `0x7e22ce`, `0x06b6d4`, `0xf8fafc` | Cosmic Nebula de NYX (`uDeepColor`, `uNebulaA`, `uNebulaB`, `uRimColor`) |
| `0x0f172a` | ojos de NYX (plano, `toneMapped: false`) |
| `0x0a0e25` | clear color de la portada |
| `#e8eef7` / `#1b2538` / `#34d399` / `#181126` / `#2b1d3d` | damero de baldosas del suelo flotante (comentarios del shader `DomeSlabGeometry`) |
| `0xff2a1a` / `0xffb020` | aviso rojo/ámbar de baldosas de la cúpula |
| `0xffcc33` / `0xfff3b0` / `0xffe58f` | estrella interior `star_core` (base, rim, tinta) |

---

## 12. Datos confirmados como ausentes

| Elemento | Comprobación |
|---|---|
| Niebla de escena (`Fog`, `FogExp2`, `scene.fog`) | 0 apariciones en `src/`; todos los materiales sensibles declaran `fog: false` |
| Sombras (`castShadow`, `receiveShadow`, `shadowMap`) | 0 apariciones en `src/` |
| Post-proceso (`EffectComposer`, `UnrealBloom`, passes) | 0 apariciones en `src/` |
| `renderer.toneMapping` / `outputColorSpace` explícitos | 0 apariciones en `src/` (se usa el comportamiento por defecto de Three.js) |
| Malla de barrera de la cúpula a 88.6 m | Solo el radio numérico y el VFX de rebote; no hay geometría |
| Planetas en el modo cúpula | El planeta anillado vive en el shader del cielo cómic (`toonMaterials.ts`) y hay planetas 3D en el nivel de ciudad (`planetModel.ts`), no en el backdrop de la cúpula |
| `createDomeSlabs` | Exportado en `DomeSlabs.ts:620` sin call site en `src/`; el sistema activo es `DomeFloatingSlabManager` + `DomeSphereTileManager` |
| Escombros generados por baldosas de cúpula | No existen: solo los suelos flotantes rotos generan escombros (`spawnSlabDebris`, 4 por rotura, máx. 12 sueltos) |

---

## 6. Audio Procedural, Música, Controles, UI/HUD, Ajustes, i18n y Leaderboard

# 06 — Audio procedural, música, controles, UI/HUD, i18n, ajustes y leaderboard

Documento de extracción técnica del código real de OUTORBIT. Todos los datos provienen de
lectura directa del repositorio y fueron contrastados dos veces (lectura completa del archivo
+ segunda pasada con `grep`/scripts sobre el mismo archivo). No hay valores estimados ni
propuestas de diseño.

Rutas citadas relativas a la raíz del repo `/home/pakura/Proyectos/OUTORBIT`.

---

## 1. Alcance y método de verificación

Archivos fuente leídos íntegros (o en las secciones relevantes, indicadas):

| Archivo | Líneas | Uso en este documento |
|---|---|---|
| `src/game/audio/SynthAudio.ts` | 1303 | SFX procedurales + motor de audio continuo |
| `src/game/audio/MusicPlayer.ts` | 390 | música, rotación, fundidos, MPRIS |
| `public/audio/*` | — | pistas MP3 + portada |
| `src/game/input/GamepadInput.ts` | 181 | lectura Gamepad API |
| `src/game/input/gamepadMenuNav.ts` | 149 | navegación de menús con mando |
| `src/game/settings.ts` | 504 | ajustes persistidos |
| `src/game/localStorageState.ts` | 262 | claves de persistencia |
| `src/i18n/index.ts` | 170 | infraestructura i18n |
| `src/i18n/es.json`, `en.json`, `ja.json` | 297 c/u | diccionarios |
| `src/ui/TitleScreen.tsx` | 228 | portada |
| `src/ui/DomeGameView.tsx` | 480 | vista de la Cúpula |
| `src/ui/DomeHudSketch.tsx` | 710 | HUD |
| `src/ui/DomeYinYangHud.tsx` | 577 | vida/Edén/EXP (shader WebGL) |
| `src/ui/DomeSkillSlotsHud.tsx` | 246 | slots de habilidad |
| `src/ui/DomePauseModal.tsx` | 289 | pausa |
| `src/ui/SettingsScreen.tsx` | 875 | ajustes |
| `src/ui/LeaderboardModal.tsx` | 129 | ranking (portada) |
| `src/api/leaderboard.ts` | 35 | acceso Base44 |
| `src/ui/DomeBattleReport.tsx` (parcial) | 1026 | informe + ranking Top 5 |
| `src/game/dome/DomeRunStats.ts` (parcial) | — | score y envío al ranking |
| `src/ui/domeGameLoop.ts` (parcial) | 1497 | disparadores de SFX/música, entrada |
| `src/game/dome/NyxDomeController.ts` (parcial) | 4298 | entrada y SFX de Nyx |
| `src/game/dome/DomeCombatSystem.ts` (parcial) | — | mancha de tinta |

Comprobaciones automatizadas ejecutadas (segunda pasada):

- `GameSoundKind`: 22 variantes; `play(kind)` tiene exactamente 22 `case` (coinciden uno a uno).
- `SynthAudio`: 55 métodos públicos (48 `play*` + `play`, `updateMovementSpeed`,
  `setGravityFieldActive`, `setVolumeMultiplier`, `unlock`, `dispose`, `toggleMute`).
- i18n: 251 claves hoja por idioma en `es`, `en` y `ja`; 0 claves faltantes, 0 extra, 0 vacías.
- Diferencias de texto: `en` repite 31 cadenas idénticas al español; `ja` repite 11.

---

## 2. Audio procedural — `src/game/audio/SynthAudio.ts`

### 2.1 Arquitectura y bus

| Constante / campo | Valor | Efecto |
|---|---|---|
| `MASTER_VOLUME` (L44) | `0.65` | ganancia base del bus de SFX |
| `masterGain` (getter) | `MASTER_VOLUME * volumeMultiplier` | ganancia efectiva del `GainNode` maestro |
| `volumeMultiplier` | por defecto `1`, se satura a `0..1.5` | multiplicador del ajuste |
| `noiseBuffer` | ruido blanco de `sampleRate * 0.5` s, creado perezosamente | base de `noise()` |
| `pinkBuffer` | ruido rosa de `sampleRate * 3` s (Paul Kellet) | base del viento y de varios `play*` |
| `levelUpEcho` | `DelayNode` de `0.11 s` con realimentación `0.28` | eco del arpegio de subida de nivel |

Métodos de ciclo de vida:

- `unlock()`: crea `AudioContext` (`window.AudioContext ?? webkitAudioContext`), crea el maestro,
  conecta a `destination` e inicializa el motor gravitacional. Si ya existe y está
  `suspended`, hace `resume()`.
- `dispose()`: `stop()` de viento y osciladores de gravedad, cierre del contexto (`ctx.close()`),
  limpieza de todos los buffers. Lo llama el bucle de la Cúpula al desmontar
  (`src/ui/domeGameLoop.ts:1482`).
- `toggleMute()`: alterna `_muted` y aplica `master.gain.setTargetAtTime(0 o masterGain, now, 0.01)`.
  Devuelve el nuevo estado.
- `needsUnlock` (getter): `ctx === null`.
- `audible` (getter privado): `false` si está muteado o sin contexto; si `ctx.state === 'suspended'`
  hace `resume()` antes de devolver `true`.

### 2.2 Primitivas de síntesis

- `tone(type, fromFreq, toFreq, duration, volume, delay = 0)`: `OscillatorNode` con barrido
  **exponencial** `fromFreq -> max(toFreq, 1)`; envolvente ADSR corta: `0 -> volume` en
  `min(0.02, duration*0.3)` (lineal) y `-> 0.0001` exponencial al final. `stop()` a
  `duration + 0.02`.
- `noise(duration, volume, cutoff)`: `BufferSource` del ruido blanco compartido, en bucle, con
  `BiquadFilter` **lowpass** que barre `cutoff -> max(cutoff*0.15, 60)` en exponencial; envolvente
  `volume -> 0.0001` exponencial.
- `getNoiseBuffer()`: buffer de ruido blanco compartido (una sola creación).

### 2.3 Motor gravitacional continuo (capa de ambiente)

`initGravityEngine()` monta dos capas permanentes colgadas del bus maestro:

1. **Viento**: `BufferSource` de ruido rosa en bucle → `BiquadFilter` **bandpass**
   (`frequency 130`, `Q 1.2`) → `BiquadFilter` **peaking** (`frequency 260`, `gain +5`) →
   `GainNode` (arranca en `0`).
2. **Zumbido de campo gravitacional**: `OscillatorNode` **sine 55 Hz** + **triangle 110.5 Hz** →
   `BiquadFilter` **lowpass 180 Hz** → `GainNode` (arranca en `0`).

`updateMovementSpeed(normalizedSpeed)` — llamado desde el bucle con
`Math.min(1, controller.getCurrentSpeed() / 30)` (`domeGameLoop.ts:1150`):

- Ignora cambios menores a `0.01` (`windSpeed` cacheado).
- `curve = speed^1.65`; `targetFreq = 130 + curve*1520`; `targetQ = 1.2 + curve*2.4`;
  `targetWindVol = speed < 0.02 ? 0 : 0.12 + curve*0.5` (tope 0.62).
- La resonancia sigue a `targetFreq * 1.45`.
- Suavizado `setTargetAtTime` con constantes `0.06` (frecuencias) y `0.08` (Q y ganancia).
- Si el campo gravitacional está activo, los osciladores suben con la velocidad:
  `55 + curve*24` y `110.5 + curve*48` (constante `0.1`).

`setGravityFieldActive(active)` — encendido por `hasActiveGravityRocks() || hasActiveBlackHole()`
(`domeGameLoop.ts:1151`):

- Sube/baja la ganancia a `0.24 / 0` con `setTargetAtTime(..., 0.15)`.
- Al apagarse devuelve los osciladores a `55` y `110.5` (constante `0.1`).

### 2.4 One-shots enrutados por `play(kind)` — 22 tipos

`GameSoundKind` (22) y el `switch` de `play()` coinciden exactamente:
`jump, anchor, stasisGrab, stasisThrow, parry, gravityShift, explosion, alert, warning,
bossHit, victory, keycard, switchClick, gateOpen, step, land, melee, hurt, telegraph,
wallBreak, npcTalk, bounce`.

| `kind` | Método | Síntesis exacta |
|---|---|---|
| `jump` | `playJump` | sine 320→620 Hz, 0.12 s, 0.7 |
| `anchor` | `playAnchor` | triangle 240→110, 0.2 s, 0.8; sine 480→240, 0.12 s, 0.35, delay 0.02 |
| `stasisGrab` | `playStasisGrab` | sine 520→760, 0.08 s, 0.6; sine 760→980, 0.08 s, 0.45, delay 0.06 |
| `stasisThrow` | `playStasisThrow` | sawtooth 720→180, 0.16 s, 0.5 |
| `parry` | `playParry` | square 880→880, 0.05 s, 0.5; square 1320→1180, 0.1 s, 0.4, delay 0.02 |
| `gravityShift` | `playGravityShift` | sine 420→150, 0.42 s, 0.7; sine 632→226, 0.42 s, 0.4, delay 0.03 |
| `explosion` | `playExplosion` | `noise(0.34, 0.9, 900)` + sine 120→40, 0.3 s, 0.8 |
| `alert` | `playAlert` | square 660→660, 0.09 s, 0.45; square 880→880, 0.12 s, 0.45, delay 0.11 |
| `warning` | `playWarning` | square 587→587, 0.07 s, 0.3; square 880→880, 0.11 s, 0.26, delay 0.085 |
| `bossHit` | `playBossHit` | square 150→85, 0.16 s, 0.85; `noise(0.1, 0.35, 500)` |
| `victory` | `playVictory` | triangle 523.25/659.25/783.99/1046.5 Hz, 0.22 s, 0.7, pasos de 0.13 s; sine 1046.5, 0.5 s, 0.5 al final |
| `keycard` | `playKeycard` | sine 990→1320, 0.09 s, 0.7; sine 1320→1760, 0.12 s, 0.55, delay 0.07 |
| `switchClick` | `playSwitchClick` | square 220→160, 0.05 s, 0.55; sine 660→990, 0.12 s, 0.5, delay 0.04 |
| `gateOpen` | `playGateOpen` | sawtooth 140→420, 0.3 s, 0.45; sine 560→840, 0.18 s, 0.35, delay 0.08 |
| `step` | `playStep` | sine 150→95, 0.045 s, 0.16; `noise(0.03, 0.06, 420)` |
| `land` | `playLand` | sine 190→60, 0.14 s, 0.5; `noise(0.07, 0.16, 380)` |
| `melee` | `playMelee` | `noise(0.12, 0.4, 1600)` + triangle 340→120, 0.1 s, 0.5, delay 0.02 |
| `hurt` | `playHurt` | square 190→52, 0.17 s, 0.95; sine 105→36, 0.24 s, 0.9; `noise(0.11, 0.42, 650)`; sawtooth 640→170, 0.26 s, 0.5, delay 0.02; square 320→96, 0.2 s, 0.3, delay 0.05 |
| `telegraph` | `playTelegraph` | square 880→1320, 0.07 s, 0.34; sine 1320→1760, 0.06 s, 0.22, delay 0.05 |
| `wallBreak` | `playWallBreak` | `noise(0.28, 0.7, 750)` + sine 110→42, 0.26 s, 0.7 + sawtooth 90→55, 0.12 s, 0.3, delay 0.03 |
| `npcTalk` | `playNpcTalk` | sine 640→900, 0.07 s, 0.55; sine 900→1180, 0.08 s, 0.4, delay 0.07 |
| `bounce` | `playBounce` | sine 240→620, 0.18 s, 0.7; triangle 240→620, 0.16 s, 0.4, delay 0.02; sine 620→880, 0.08 s, 0.3, delay 0.12 |

Estos 22 one-shots son la ruta de la **campaña** (`!tutorialId`), no la de la Cúpula:
`GameEngine` los emite desde `world.onSound` / `player.onSound`
(`src/game/GameEngine.ts:408`, `:427`) y en `GameEngine.ts:484`; los emisores concretos son
`src/game/entities/PlayerController.ts` (`hurt`, `bounce`, `land`, `step`, `gravityShift`,
`alert`, `jump`, `anchor`), `src/game/entities/enemyAI.ts` (`warning`, `telegraph`, `alert`,
`keycard`) y `src/game/entities/WorldObjects.ts` (`bossHit`, `explosion`, `telegraph`,
`npcTalk`, `gateOpen`, `switchClick`, `wallBreak`).

### 2.5 One-shots adicionales (invocados directamente, fuera del `switch`)

| Método | Síntesis | Disparador verificado |
|---|---|---|
| `playSideDash(direction: -1 \| 0 \| 1)` | noise rosa con `StereoPanner`: `-dir*0.65 -> dir*0.85` en 0.24 s; bandpass `Q 3.2`, `600 -> 2600` (0.08 s) `-> 450`; gain `0.01 -> 0.7 -> 0.001`; triangle 480→160, 0.24 s, 0.24 | dash lateral de Nyx, `NyxDomeController.ts:2212` y `:2263` |
| `playSpinKick()` | noise rosa bandpass `Q 6.5` `280 -> 3200` (0.34 s) `-> 520`; LFO 26 Hz con profundidad `180 -> 10` sobre la frecuencia del filtro; gain `0.05 -> 0.9 -> 0.001`; más `sawtooth` 140→780 por lowpass `400 -> 2800`, gain `0.01 -> 0.25 -> 0.001` | patada taladro / dash de parry: `:2534`, `:2566`, `:2620` |
| `playKineticImpact()` | sine 190→36, 0.25 s, 0.85; square 150→60, 0.12 s, 0.4; `noise(0.12, 0.5, 900)` | impacto real del taladro contra enemigo, `:2671` |
| `playVoidFall()` | noise rosa bandpass `Q 1.6` `2200 -> 320` en 0.5 s, gain `0.05 -> 0.55` (0.08 s) `-> 0.001`; sine 240→70, 0.4 s, 0.4 | Caída al Vacío, `:2567` |
| `playRepulsePush()` | noise rosa lowpass `3200 -> 180` en 0.35 s, gain 0.75; sine 95→42, 0.3 s, 0.7 | skill `repulse_push`, `domeGameLoop.ts:780` |
| `playEdenAbsorb()` | sine 392 / 523.25 / 659.25 Hz con `toFreq = nota*1.5`, 0.4 s, 0.4, pasos de 0.09 s; sine 1568→2093, 0.3 s, 0.2 al final | skill `eden_absorb`, `domeGameLoop.ts:783` |
| `playAttractionWell()` | dos `sawtooth` con `detune ±9`, 70→240 Hz en 1.2 s, lowpass 120→520, gain `0.0001 -> 0.32` (0.66 s) `-> 0.0001` | skill `attraction_well`, `domeGameLoop.ts:786` |
| `playBounceHorizon()` | square 1900→700, 0.14 s, 0.4; sawtooth 2600→1100, 0.1 s, 0.22, delay 0.02; `noise(0.1, 0.3, 4200)` | skill `bounce_horizon`, `domeGameLoop.ts:789` |
| `playBlackHoleCast()` | sine 70→28, 0.9 s, 0.85; noise rosa bandpass `Q 2.2` `200 -> 1600` (0.7 s), gain `0.0001 -> 0.4` (0.25 s) `-> 0.001` (0.8 s) | skill `black_hole`, `domeGameLoop.ts:792` |
| `playImplosion()` | noise rosa bandpass `Q 3.5` `300 -> 2600` (0.28 s), gain `0.5` a 0.22 s; colapso: sine 170→32, 0.3 s, 0.9, delay 0.26 + square 220→70, 0.14 s, 0.35, delay 0.27 | skill `implosion`, `domeGameLoop.ts:795` |
| `playLowHpPulse(urgent = false)` | sine 125→48, 0.14 s, 0.9; sine 105→42, 0.14 s, 0.6, delay 0.18 (urgente 0.14); triangle 880 Hz (urgente 1040), 0.09 s, 0.5 | HUD, `DomeYinYangHud.tsx:381`; urgencia `hp <= 0.12`, periodo `0.65 s` urgente / `0.95 s` normal |
| `playLowEdenPulse()` | dos `sawtooth` `detune ±12`, 540→190 en 0.18 s, bandpass 900 `Q 3`, gain 0.45 a 0.015 s; noise con `highpass 3200`, gain 0.28 durante 0.04 s | HUD, `DomeYinYangHud.tsx:392`, periodo `1.15 s`, umbral `eden <= 0.25` |
| `playLevelUp()` | triangle 523.25 / 783.99 / 1174.66 Hz, pasos de 0.065 s, 0.6 de pico, decay a 0.35 s, ruteado también al eco (`delay 0.11`, feedback `0.28`) | `DomeYinYangHud.tsx:368` al detectar `level` creciente |
| `playNewWave()` | sine 140→42, 0.24 s, 0.9; square 1800 Hz 0.02 s, 0.35; square 2400 Hz 0.02 s, 0.35, delay 0.06 | `DomeYinYangHud.tsx:371` al detectar `wave` creciente |
| `playLevelUpSpark()` | triangle 1480→2960, 0.09 s, 0.26; triangle 2960→880, 0.2 s, 0.2, delay 0.09 | fase 1 del planeta, `DomeLevelUpSequence.tsx:466` |
| `playLevelUpApproach()` | sawtooth 55→210 en 0.9 s por lowpass `Q 7` `220 -> 1600`; gain `0.0001 -> 0.3` (0.35 s) `-> 0.0001` (1.0 s) | fase 2, `DomeLevelUpSequence.tsx:491` |
| `playLevelUpSlash()` | noise en bucle, bandpass `Q 1.1` `3200 -> 240` (0.42 s), gain 0.34 | fase 3 (barrido blanco), `DomeLevelUpSequence.tsx:525` |
| `playCardSlam()` | sine 120→38, 0.16 s, 0.5; `noise(0.09, 0.26, 1400)` | entrada de cartas (340 ms, 480+i*130+430 ms) `:655`, `:662` |
| `playCardTremble()` | sawtooth 46 Hz con LFO 13 Hz profundidad 16, lowpass 220, gain 0.2 durante 0.5 s | carta en el centro, `:765` |
| `playCardStamp()` | square 880→110, 0.12 s, 0.18 + `playCardSlam()` | sello de carta elegida, `:699` |
| `playInkWipe()` | noise en bucle, bandpass `Q 1.1` `240 -> 2600` (0.42 s), gain 0.22 | vuelo de carta al centro, `:761` |
| `playIrisWink()` | sine 640→90, 0.5 s, 0.24; sine 2200, 0.03 s, 0.2, delay 0.5; sine 2900, 0.05 s, 0.16, delay 0.56 | cierre en iris, `:676` |
| `playSparrowShriek()` | sawtooth 1650→3250 (0.14 s) →1380 (0.72 s); triangle 2480→3900 (0.16 s) →1820; LFO 34 Hz profundidad 180 sobre ambas frecuencias; bandpass 2400 `Q 1.8`; gain 0.28 (0.05 s), 0.26 (0.42 s), `-> 0.0001` (0.78 s); `noise(0.55, 0.35, 2200)` | `waveMgr.consumeSparrowShriekPulse()`, `domeGameLoop.ts:1228` |
| `playElectricDash()` | sawtooth 1400→320 en 0.14 s, pico 0.16 | `bflySfx.dash`, `domeGameLoop.ts:1231` |
| `playElectricBall()` | triangle 880→1760 (0.06 s) →520 (0.18 s), pico 0.15 | `bflySfx.ball`, `domeGameLoop.ts:1232` |
| `playElectricBeamTick()` | square 440→980 en 0.08 s, pico 0.11 | `bflySfx.beam`, `domeGameLoop.ts:1233` |

Uso de `playBossHit` en la Cúpula: pulsos de cosmos de KRONOS (`domeGameLoop.ts:1247`),
colapso de Implosión `one_hit` (`:1357`), repulsión de miniboss (`:1387`) y ruptura de cristal
de KRONOS (`:1423`). `playWarning` se usa para el rugido / apertura de portal de KRONOS
(`:1241`).

### 2.6 Niveles de volumen observados en la Cúpula

- `SynthAudio` aplica `masterVolume * sfxVolume` desde el efecto de `DomeGameView`
  (`DomeGameView.tsx:154`).
- `startDomeGameLoop` vuelve a fijar, al montar el bucle, `audio.setVolumeMultiplier(masterVolume)`
  (`domeGameLoop.ts:199`) y `musicPlayer.setVolumeMultiplier(masterVolume)` (`:201`).
- Consecuencia verificada en el orden de ejecución: al primer montaje de la Cúpula manda el valor
  del bucle (solo `masterVolume`); `sfxVolume` y `musicVolume` entran en cuanto cambia
  `settings` y se re-ejecuta el efecto de `DomeGameView`.

---

## 3. Música — `src/game/audio/MusicPlayer.ts`

### 3.1 Pistas y archivos reales

`public/audio/` contiene exactamente:

| ID (`MusicTrackId`) | Archivo | Tamaño | Título en Media Session (`TRACK_TITLES`) |
|---|---|---|---|
| `menu` | `/audio/menu.mp3` | 3 705 098 B | `Menú` |
| `waveA` | `/audio/wave-nocturnal.mp3` | 4 024 555 B | `Nocturnal` |
| `waveB` | `/audio/wave-singularity.mp3` | 3 614 503 B | `Singularity` |
| `boss` | `/audio/boss.mp3` | 3 613 562 B | `Boss` |

Portada única del OST: `public/audio/covers/cover.webp` (637 644 B). Se publica en
`navigator.mediaSession.metadata` con URL **absoluta**
(`new URL('/audio/covers/cover.webp', window.location.origin).href`), `artist: 'OUTORBIT'`,
`album: 'OUTORBIT OST'`, `sizes: '512x512'`, `type: 'image/webp'`.

### 3.2 Constantes de reproducción

| Constante | Valor |
|---|---|
| `BASE_VOLUME` | `0.2` (por debajo de los SFX para que las alertas del HUD destaquen) |
| `FADE_STEP` | `0.05` por tick |
| `FADE_TICK_MS` | `50` ms (fundido completo ≈ 1 s) |
| `GAP_MIN_MS` / `GAP_MAX_MS` | `3000` / `6000` (silencio aleatorio entre pistas) |
| `NATURAL_NEXT` | `menu→menu`, `waveA→waveB`, `waveB→waveA`, `boss→boss` |
| `setVolumeMultiplier` | satura a `0..1.5`; volumen objetivo = `BASE_VOLUME * multiplier` |

### 3.3 Reglas de `play(track)` (verificadas en el código)

- Si hay un silencio entre pistas activo (`gapTimer`), se cancela y la pista arranca ya.
- Misma pista pedida y sin `pendingSwitch`: no hace nada (y limpia la cola).
- Interrumpe con fundido cuando: la pedida es `boss`, la actual es `boss`, o cambia el contexto
  menú ↔ juego (`(track === 'menu') !== (this.current === 'menu')`).
- Si no interrumpe, la pista va a **cola** (`queued`) y suena al terminar la actual, tras el
  silencio de 3-6 s.
- `stop()`: funde a cero, pausa y publica `playbackState = 'none'`.

### 3.4 Disparadores reales

| Punto del código | Llamada |
|---|---|
| `TitleScreen.tsx:81` (montaje) | `musicPlayer.play('menu')` |
| `TitleScreen.tsx:74` | `setVolumeMultiplier(masterVolume * musicVolume)` |
| `domeGameLoop.ts:206-214` (`syncWaveMusic`) | `label === 'BOSS'` → `play('boss')`; resto → alterna `waveA` / `waveB` con `waveTrackToggle++` |
| `domeGameLoop.ts:250` (modo entrenamiento) | `play('waveA')` |
| `domeGameLoop.ts:257` (oleada 1) y `:1128` (oleadas siguientes) | `syncWaveMusic(waveMgr.getWaveInfo().label)` |
| `domeGameLoop.ts:869` | tecla `M`: `musicPlayer.setMuted(audio.toggleMute())` |
| `domeGameLoop.ts:1274` (muerte de Nyx) y `:1483` (desmontaje) | `musicPlayer.stop()` |

Las oleadas de miniboss usan la rotación `waveA`/`waveB` (no tienen pista propia): el único caso
con pista dedicada es `label === 'BOSS'`. Los labels provienen de
`src/game/dome/DomeWaveManager.ts:436-461`: `'BÁSICOS'`, `'MINIBOSS'`, `'BOSS'`.

### 3.5 Elemento `<audio>` y MPRIS

- Un **único** `HTMLAudioElement` creado con `new Audio()`, `loop = false`, `preload = 'auto'`,
  `hidden = true`, montado en `document.body`. Cambia de `src` entre pistas (reciclar el elemento
  mantiene viva la sesión MPRIS en Firefox/Linux).
- `ended` → `onTrackEnded()` → silencio aleatorio → siguiente (`queued ?? NATURAL_NEXT[track]`).
- `loadedmetadata` → `publishPositionState(el)` (`setPositionState` con `duration`,
  `playbackRate`, `position`).
- Acciones del widget registradas una vez: `play` → `setMuted(false)`, `pause` → `setMuted(true)`.
  No se registran `previoustrack` ni `nexttrack`.
- Muteado **no** pausa: la pista sigue avanzando a volumen 0.
- Autoplay bloqueado: se guarda `blocked` y se reintenta en el primer `pointerdown`/`keydown`.
- Instancia única exportada: `export const musicPlayer = new MusicPlayer()`.

---

## 4. Controles

### 4.1 Teclado — acciones rebindables (`ControlAction`, 14)

Defaults en `src/game/settings.ts` (`DEFAULT_BINDINGS`):

| Acción | Tecla por defecto | Alias secundario (solo si el primario sigue siendo el de fábrica) |
|---|---|---|
| `forward` | `KeyW` | + `ArrowUp` (fallback, ver abajo) |
| `back` | `KeyS` | + `ArrowDown` |
| `left` | `KeyA` | + `ArrowLeft` |
| `right` | `KeyD` | + `ArrowRight` |
| `jump` | `Space` | — |
| `sprint` | `ShiftLeft` | `ShiftRight` |
| `interact` | `KeyE` | — |
| `parry` | `KeyF` | — |
| `stasis` | `KeyR` | `KeyC` |
| `lockOn` | `KeyQ` | `Tab`, `KeyV` |
| `radar` | `Tab` | — |
| `slot1` | `Digit1` | — |
| `slot2` | `Digit2` | — |
| `slot3` | `Digit3` | — |

`resolveActionCodes(bindings)` construye por acción la lista `primario + alias + flechas`:

- Los alias solo se aceptan si `primary === DEFAULT_BINDINGS[action]`; tras un rebind se descartan.
- Las flechas (`ArrowUp/Down/Left/Right`) solo se añaden a movimiento si ningún binding las ocupa.
- `NyxDomeController` invierte el mapa en `actionByCode` recorriendo `CONTROL_ACTIONS` en orden;
  como `radar` va después de `lockOn`, `Tab` termina resolviendo a `radar` en la Cúpula.

### 4.2 Acciones realmente consumidas en la Cúpula

Comprobado en `src/game/dome/NyxDomeController.ts`:

| Acción | Consumo |
|---|---|
| `forward`, `back`, `left`, `right` | `isDown(...)` en `update()`, líneas 1463-1464 (fusionadas con el stick izquierdo) |
| `sprint` | `isDown('sprint')` línea 1475 → `updateGrounded(simDt, f, r, sprintHeld, hasMoveInput)` |
| `jump` | `onKeyDown`: `wantJump = true` (línea 972) |
| `slot1`, `slot2`, `slot3` | `onKeyDown`: `wantSlot = 1/2/3` (líneas 973-975) |
| `radar` | `onKeyDown`: `radarEnabled = !radarEnabled` (línea 976) |
| `interact`, `parry`, `stasis`, `lockOn` | sin consumo en el controlador de la Cúpula (sí en la campaña, `PlayerController.ts:775-782`) |

`onKeyDown` ignora auto-repeat (`codesDown.has(code)`), y `setPointerLocked(false)` limpia
`codesDown`, `attackHeld` y `dashHeld`.

### 4.3 Ratón

| Elemento | Comportamiento verificado |
|---|---|
| Captura de puntero | clic en el canvas → `canvas.requestPointerLock()` (`domeGameLoop.ts:812`); overlay del HUD pide “HAZ CLIC EN LA ARENA PARA CAPTURAR EL RATÓN · ESC PARA SOLTAR” |
| `mousemove` | solo con lock; `controller.onMouseMove(e.movementX, e.movementY)` |
| Botón izquierdo (0) | `wantAttack = true`, `attackHeld = true` → Ataque de Velocidad |
| Botón derecho (2) | `wantDash = true`, `dashHeld = true` → Dash / Redirección / Rebote cinético |
| `contextmenu` | `preventDefault()` en el canvas |
| Sensibilidad | `sens = 0.0023 * settings.mouseSensitivity` (rad/píxel), `NyxDomeController.ts:908` |
| Inversión Y | `pitch = -dy * steerScale * (invertY ? -1 : 1)`, `:923` |
| Amortiguación | `VOID_FALL_STEER_DAMP = 0.16` durante `void_fall` |
| Límites | `CAM_PITCH_LIMIT = 1.15` rad (cámara en suelo), `AIM_PITCH_MAX_DOT = 0.985` (vuelo) |

### 4.4 Teclas de sistema en la Cúpula (`domeGameLoop.ts:864-925`)

| Tecla | Efecto |
|---|---|
| `M` | mute simultáneo de SFX y música |
| `Escape` o `KeyP` | abre la pausa (y `exitPointerLock`); si ya está abierta, la cierra sin pedir lock, con gracia de 250 ms (`pauseResumeGraceUntil`) |
| `Tab` | `preventDefault()` (radar) para no perder el foco del canvas |
| `F2` o `Tab` | solo en modo entrenamiento: mostrar/ocultar el panel debug |
| `T` | solo en entrenamiento: recarga Vida + Edén |
| `Escape` (con ajustes o tutorial abiertos) | lo consume el propio modal, la pausa no se mueve |
| Clic en canvas | desbloquea el `AudioContext` y captura el ratón |
| Cualquier `pointerdown` / `keydown` / botón de mando pulsado | desbloquea el `AudioContext` |

### 4.5 Mando — Gamepad API estándar W3C

`src/game/input/GamepadInput.ts`:

- `MAX_STANDARD_BUTTONS = 18` (índices 0..17).
- `readConnectedGamepad()`: devuelve el primer mando con `connected === true`; tolera la excepción
  de navegadores que lanzan sin gesto.
- `applyRadialDeadzone(x, y, deadzone)`: dentro del radio → `(0,0)`; fuera se reescala
  `min(1, (mag - deadzone) / (1 - deadzone)) / mag` (sin salto en el borde).
- `update()` (una vez por frame, antes de física): copia flancos (`currButtons` → `prevButtons`),
  lee botones con `pressed || value > 0.5` y ejes 0..3.
- `justPressed`, `held`, `justPressedAction`, `heldAction`, `getAnyJustPressed`,
  `getLeftStick` (Y negativa = adelante), `getRightStick` (Y negativa = arriba),
  `isConnected`, `getGamepadId`.

Defaults (`DEFAULT_GAMEPAD_BINDINGS`), acciones `GamepadAction` (9):

| Acción | Botón W3C |
|---|---|
| `attack` | 7 (R2) |
| `attackAlt` | 5 (R1) |
| `dash` | 4 (L1) |
| `dashAlt` | 6 (L2) |
| `jump` | 0 (Cruz / A) |
| `slot1` | 2 (Cuadrado / X) |
| `slot2` | 3 (Triángulo / Y) |
| `slot3` | 1 (Círculo / B) |
| `pause` | 9 (Options / Start) |

Etiquetas usadas en Ajustes (`GAMEPAD_BUTTON_LABELS`, 0..17): `Cruz (A)`, `Círculo (B)`,
`Cuadrado (X)`, `Triángulo (Y)`, `L1`, `R1`, `L2`, `R2`, `Share (Select)`, `Options (Start)`,
`L3`, `R3`, `D-Pad Arriba/Abajo/Izquierda/Derecha`, `PS`, `Touchpad`.

Uso en la Cúpula:

- Stick derecho: `rate = GAMEPAD_LOOK_RATE (2.6) * settings.gamepadSensitivity`, aplicado como
  `rotateLook(rs.x * rate * rawDt, rs.y * rate * rawDt)` (`NyxDomeController.ts:1022`).
- Stick izquierdo: se suma a WASD con `clamp(..., -1, 1)`.
- Botones: flanco → `wantAttack` / `wantDash` / `wantJump` / `wantSlot`; mantenido → `heldAction`
  para ataque y dash continuos.
- `pause` (9) abre/cierra la pausa; **Círculo (B, índice 1)** también la cierra
  (`domeGameLoop.ts:978`, `:996`). Reanudar con mando no captura el ratón.
- El mando funciona sin pointer lock; `gamepad.update()` se ejecuta incluso en pausa.

### 4.6 Navegación de menús con mando — `src/game/input/gamepadMenuNav.ts`

`useGamepadMenuNav({ enabled, onDirection, onConfirm, onBack })`:

- Poll con `requestAnimationFrame` (≈60 FPS) del primer mando conectado; se detiene con
  `enabled = false`.
- `STICK_THRESHOLD = 0.55`; direcciones por D-Pad 12/13/14/15 **o** stick izquierdo.
- Repetición: `REPEAT_DELAY_MS = 320` inicial, luego `REPEAT_RATE_MS = 130`.
- Confirmar = botón `0` (Cruz/A) por flanco; volver = botón `1` (Círculo/B) por flanco.

`useGamepadListNav(count, { enabled, columns, initialIndex, onConfirm, onBack })`:

- `columns === 1` → lista vertical (`up`/`down` con wrap); `columns > 1` → fila horizontal
  (`left`/`right` con wrap). Devuelve `[index, setIndex]` con clamp a `0..count-1`.

Dónde se usa:

| Pantalla | Modo |
|---|---|
| `TitleScreen` | lista de 5 entradas: `play`, `training` (si existe), `settings`, `leaderboard`, `language`; `enabled` solo sin modal |
| `DomePauseModal` | lista de botones; `onConfirm` ejecuta, `onBack` = reanudar |
| `DomeLevelUpSequence` | cartas en fila (`columns = choices.length`) y ranuras de reemplazo (`columns = equippedSlots.length`, `onBack` = volver) |

Navegación de teclado en menús:

- Portada: selector de idioma con tres botones (`ESPAÑOL` / `ENGLISH` / `日本語`).
- Pausa: `[1]..[N]` dispara el botón N — etiquetas visibles `[1]`… en cada botón.
- Level-up: `[1..N]` elige carta; con carta en vuelo `[1..3]` elige ranura; `Escape` vuelve.
- Battle Report: `1` / `r` / `R` = jugar de nuevo, `2` = menú (ignorado si se está escribiendo en
  el input).
- Ajustes: `Escape` cierra (salvo mientras se captura tecla o botón).
- Modales de portada (`MenuModalShell`): `Escape` cierra.

### 4.7 Rebinding

- Teclado: al pulsar una fila se entra en captura (`PULSA TECLA...`), se asigna cualquier
  `event.code` al instante y `Escape` cancela.
- Mando: captura por flanco real (estado actual vs poll anterior, índices 0..17); `Escape` cancela.
- Etiquetas de tecla: `formatKeyCode` (`Space → ESPACIO`, `ShiftLeft → SHIFT`, `KeyW → W`,
  `Digit1 → 1`, `ArrowUp → ↑`, `Numpad5 → NUM 5`).
- Botón `RESTAURAR MANDO POR DEFECTO` y `RESTAURAR TODO POR DEFECTO`.

---

## 5. Ajustes — `src/game/settings.ts`

Interfaz `GameSettings` completa (11 campos + bindings):

| Campo | Tipo | Default | Rango / valores (`SETTINGS_LIMITS`) |
|---|---|---|---|
| `language` | `'es' \| 'en' \| 'ja'` | `'en'` | — |
| `mouseSensitivity` | number | `1.0` | 0.25 – 2.5 |
| `invertY` | boolean | `false` | — |
| `baseFov` | number | `70` | 55 – 85 |
| `masterVolume` | number | `1.0` | 0 – 1.5 |
| `musicVolume` | number | `1.0` | 0 – 1.5 |
| `sfxVolume` | number | `1.0` | 0 – 1.5 |
| `halftonesEnabled` | boolean | `true` | — |
| `easyMode` | boolean | `false` | duplica Vida/Edén (`easyMult = 2`) y desactiva `setDifficultyScaling` |
| `bindings` | `Record<ControlAction, string>` | `DEFAULT_BINDINGS` | códigos `KeyboardEvent.code` |
| `gamepadSensitivity` | number | `1.4` | 0.5 – 3.0 |
| `gamepadDeadzone` | number | `0.14` | 0.05 – 0.35 |
| `gamepadBindings` | `Record<GamepadAction, GamepadButtonIndex>` | `DEFAULT_GAMEPAD_BINDINGS` | enteros 0..17 |

Persistencia:

- Clave principal versionada `outorbit.settings.v1` (`STORAGE_KEY`).
- Además, estructuras paralelas en `src/game/localStorageState.ts`:
  `outorbit_language`, `outorbit_nickname`, `outorbit_pilot_name` (legacy),
  `outorbit_best_score`, `outorbit_button_mapping` (array `{device, action, binding}`),
  `outorbit_other_settings` (array `{key, value}` con 10 claves), `outorbit_tutorial`
  (3 ids: `tutorial_de_movimiento`, `tutorial_de_rebotes`, `tutorial_de_slow_mo`).
- `sanitizeSettings` sanea TODO al cargar: números fuera de rango → clamp, tipos inválidos →
  default, idioma distinto de `es`/`ja` → `en`, binding vacío → default. Un JSON corrupto o de
  versión vieja nunca rompe la partida (`try/catch`).
- `saveGameSettings` sanea antes de guardar y escribe las tres estructuras + la clave versionada;
  si `localStorage` falla (modo privado, cuota) los ajustes viven solo en la sesión.
- `resetGameSettings()` / botón de la UI → `cloneGameSettings(DEFAULT_SETTINGS)` y guardado.
- `cloneGameSettings` copia profunda de `bindings` y `gamepadBindings`.

Cómo llegan al juego: `App.tsx` es la fuente de verdad (`useState(() => loadGameSettings())`),
`handleUpdateSettings` hace `saveGameSettings({ ...next, language })` y `setSettings(next)`;
`DomeGameView` propaga a `controllerRef.applySettings`, al audio y a la música en un efecto sobre
`settings`, y el `TitleDioramaSandbox` recibe `setSettings` para el diorama.

---

## 6. UI / HUD

### 6.1 Flujo de pantallas (`src/App.tsx`)

- `screen: 'title' | 'game'`; `runKey` remonta la partida; `trainingMode` activa el panel debug.
- `screen === 'title'` → `TitleScreen` (`onPlay` = `JUGAR`, `onPlayTraining` = `Entrenamiento`).
- `screen === 'game'` con `activeTutorialId` → canvas + `GameHUD` + `BattleReportScreen`
  (ruta de campaña/tutorial).
- `screen === 'game'` sin `activeTutorialId` → `DomeGameView` (la Cúpula).
- En el código actual, `handlePlay` y `handlePlayTraining` fijan `activeTutorialId = null`, y solo
  `handleNextTutorial` cambia ese id (alcanzable únicamente desde `GameHUD`, que se pinta en la
  rama de tutorial). Es decir: la ruta jugable desde la portada es la Cúpula.
- `MobileBlocker` se monta siempre; bloquea con `pointer: coarse` **o** `innerWidth < 768`
  (`mobile.title` / `mobile.body` / `mobile.footer`).

### 6.2 Portada — `src/ui/TitleScreen.tsx`

- Fondo: canvas WebGL del diorama (`TitleDioramaSandbox`) `pointer-events-none`, `aria-hidden`.
- Panel izquierdo (25 % del ancho, `min 230px`, `max 380px`): tag `t('menu.tagline')` +
  logo `OUT` + `ORBIT` (itálica, acento carmesí `#e11d48`).
- Botones `FluidInkButton` con paleta `MENU_STOPS = ['#e11d48', '#7c3aed', '#22d3ee']`:
  `t('menu.play')` (alto 116, 1.5rem), `t('menu.training')` (84, 0.875rem, opcional),
  `t('menu.controls')` (abre Ajustes), `t('menu.leaderboard')` (abre Leaderboard).
  `focused` ligado a `padIndex` del mando.
- Selector de idioma abajo a la izquierda: tres botones con `aria-label` `Español` / `English` /
  `日本語`; el activo en `#0e7490`; el chip se resalta con borde y sombra `#e11d48` cuando el mando
  está en esa fila.
- Modales: `SettingsScreen` y `LeaderboardModal` (`MenuModalShell`, vidrio, `Escape` cierra).

### 6.3 HUD de la Cúpula — `src/ui/DomeHudSketch.tsx`

Contenedor: `absolute inset-0 z-20 pointer-events-none select-none overflow-hidden font-mono
text-white`. Capas, en orden de pintado:

1. **Screentones halftone manga** (bordes): opacidad
   `min(0.88, max(0, (speed - 7)/14) + impactFlash*0.45)`; dos `radial-gradient` cian
   `rgba(34,211,238,0.85)` 2.2 px y violeta `rgba(168,85,247,0.75)` 1.8 px, rejilla 12 px,
   máscara radial (transparente al 48 %, negro al 96 %).
2. **Rayos radiales anime 2D** a velocidad terminal: `radialLines = max(0, (speedLinesIntensity -
   0.5)/0.5)`; `repeating-conic-gradient` blanco 0.32° / oscuro 2.4-2.9°, escala
   `1 + radialLines*0.06`, opacidad `min(0.85, radialLines)`.
3. **Corona de presión G** en esquinas, solo en `speed_attack` o `dashing`; opacidad
   `min(0.72, 0.24 + halftone*0.55)`; rojo `rgba(244,63,94,0.55)` + negro, rejilla 16 px.
4. **Flash de rebote contra la cúpula**: `boxShadow inset 0 0 120px 30px rgba(244,63,94,0.45)`
   con opacidad `min(1, domeBounceFlash)`.
5. **Mancha de Tinta Ácida** (ver 6.5).
6. **Viñeta de Caída al Vacío** (modo `speed_attack` con `speedAttackKind === 'void_fall'`):
   `inset 0 0 220px 70px rgba(109,40,217,0.40)` + `inset 0 0 130px 36px rgba(79,70,229,0.30)`.
7. **Alerta crítica de Edén** (`eden/maxEden < 0.2`): animación `domeHudCritical 0.7s` con
   `inset 0 0 120px 26px rgba(59,232,255,0.26)` + `inset 0 0 40px 10px rgba(168,85,247,0.24)`.
8. **Tinte de cámara lenta** cuando `bulletTimeActive`: `inset 0 0 180px 40px rgba(34,211,238,0.22)`
   + `inset 0 0 90px 24px rgba(168,85,247,0.18)`.
9. **Visor central** (`RETICLE_SIZE_PX = 120` px, `viewBox 0 0 512 512`):
   - Octógono exterior (trazo 2, opacidad 0.8) que se cierra con la velocidad:
     `scale(1 - min(0.08, speed*0.003))`.
   - Octógono interior (trazo 5).
   - 4 arcos giroscópicos (trazo 1.75, opacidad 0.5) rotados `gyroSpinRad`.
   - 4 ticks cardinales (trazo 2.5, opacidad 0.7) contra-rotados `-cameraRollDeg`.
   - Anillo de cuenta atrás de slow-mo (`r = 150`): cian `#22d3ee`, dorado `#ffd54f` en fases de
     parry; `strokeDasharray` proporcional a `bulletTimeRemaining / (isParrySlowMo ? 16.0 : 2.2)`.
   - Estrella central de 4 puntas, color según estado: `#00d0ff` (rebote cinético adjudicado),
     `#ffd54f` (estrella de parry bajo la mira), `#7fd8ff` (rebote disponible sin lock),
     `#ffffff` (sin lock), `#ff4040` (`can_lock`), `#ff0000` (`locked`, con glow rojo).
   - Punto de mira `r = 3` con el mismo color.
   - Escala del visor por `impactFlash`: `scale(1 + impactFlash*0.1)`.
   - Etiqueta bajo el visor con `hud.parryStrikeHint` (stage `strike`), `hud.parryDashHint`
     (stage `decide`) o `hud.bulletTimeHint`; pulsos `domeHudBulletPulse 0.9s`.
10. **Marcador romboidal** de 22×22 sobre el enemigo lockeado/lockeable (rojo `#ff2a55`,
    animación `domeHudPulse 0.9s`).
11. **Radar de enemigos** (`hud.radarDots`): círculos `r 4.5` rojo `#ff1f3d` con borde blanco y
    glow; los fuera de encuadre van al borde con `edgeAngleDeg` y una flecha `9,-4 16,0 9,4`.
12. **Yin-Yang de vida/Edén/EXP/nivel/oleada** (ver 6.4).
13. **3 ranuras de habilidad** (ver 6.6).
14. **Overlay de captura de ratón** cuando `!hud.pointerLocked` y `hidePointerLockPrompt` es falso:
    `hud.clickToCapture` + tres líneas de guía `hud.groundControls`, `hud.floatControls`,
    `hud.speedAttackControls`.
15. **Aviso de mando conectado** (`hud.gamepadConnected`) arriba a la derecha, chip cian:
    `hud.gamepadConnected`.
16. Keyframes propios: `domeHudPulse`, `domeHudBulletPulse`, `domeHudCritical`, `domeHudInkCrawl`.

Props: `hud`, `hidePointerLockPrompt`, `audioRef`, `alertsEnabled`. En `DomeGameView`,
`hidePointerLockPrompt` es true con level-up, battle report, pausa, tutorial o panel debug abierto;
`alertsEnabled` es false con pausa, level-up, battle report o tutorial.

### 6.4 Yin-Yang de vida y Edén — `src/ui/DomeYinYangHud.tsx`

- Lienzo lógico `420 x 200`, símbolo centrado en `(100,100)`, `R_OUTER = 76.5`, `R_INNER = 65.5`,
  `TICK_COUNT = 96` marcas radiales (mayores cada 12).
- Canvas WebGL de 320×320 px superpuesto, dimensionado con `calc(134 / 420 * 100%)` y
  `calc(134 / 200 * 100%)`.
- Shader (fragment):
  - Mitad superior = **Vida**, mitad inferior = **Edén**; cada mitad se llena de abajo arriba con
    `hpFill`/`edenFill`, con menisco ondulado:
    `sin(uv.x*11 + t*2.1)*0.010 + sin(uv.x*23 - t*3.3)*0.005`.
  - Vida por bandas: verde `vec3(0.11,0.86,0.36)` > 65 %, naranja `(1.00,0.50,0.07)` en 45-65 %,
    rojo `(0.94,0.10,0.22)` < 35 % (transiciones suaves).
  - Edén: degradado `deepVoid (0.09,0.04,0.22)` → `nebula (0.48,0.09,0.45)`, screentone y dos capas
    de estrellas en remolino; se oscurece al bajar el Edén (`mix(0.5, 1.0, smoothstep(0, 0.7, eden))`).
  - `emptyCol = vec3(0.03,0.03,0.05)` para la parte vacía.
  - Rim light cian `(0.35,0.85,1.0)` respirando a `sin(t*1.7)`.
  - Onda de choque al subir de nivel (`u_levelPulse`).
  - Puntos críticos (`<= 0.25`): halo + parpadeo `sin(t*9.0)`; rojo `(1.0,0.12,0.22)` arriba,
    cian `(0.15,0.92,1.0)` abajo.
  - Grano `hash21` de amplitud `0.022`.
- Barra superior NV./OLEADA dentro de polígonos recortados por el anillo: `t('hud.levelPrefix')` +
  nivel a 2 dígitos y `t('hud.wave', { n: pad2(wave) })`. Color de la oleada:
  `#ff4d6d` si `BOSS`, `#ffc857` si `MINIBOSS`, `#ffffff` resto. Sin `waveNumber` (entrenamiento)
  muestra `t('hud.training')`.
- Anillo de EXP: pista `rgba(59,232,255,0.25)` (trazo 10) en `r 71` + cuña de progreso horaria
  (`expWedgePath`, arranca a las 12) con ticks activos blancos/cian y `drop-shadow`.
- Audio del HUD (bucle `requestAnimationFrame`): `playLevelUp()` cuando sube `level` (y dispara el
  pulso), `playNewWave()` cuando sube `wave` (siempre, sin depender de `alertsEnabled`);
  con `alertsEnabled`: `playLowHpPulse(urgent)` si `0 < hp01 <= 0.25` (urgente `<= 0.12`,
  periodo 0.95 s / 0.65 s) y `playLowEdenPulse()` si `0 < eden01 <= 0.25` (periodo 1.15 s).
- Colores del texto de estado usados por el HUD: `ACCENT = '#3be8ff'`.
- Se re-renderiza a 30 Hz (`domeGameLoop.ts:1304-1306`: `hudTimer >= 1/30`).

### 6.5 Mancha de Tinta Ácida (overlay)

- Intensidad `hud.inkOverlayIntensity` viene de `DomeCombatSystem.updatePlayerStatus`:
  `inkStainOpacity * fadeIn * fadeOut`, con `INK_FADE_IN_SEC = 0.12` y `INK_FADE_OUT_SEC = 0.45`.
- Parámetros del combate: `INK_DOT_PER_SEC = 4.0` HP/s, `INK_STAIN_SEC = 3.0`,
  `INK_STAIN_OPACITY = 0.55`, `INK_COUNTER_OPACITY = 0.65`, `INK_COUNTER_MIN_SEC = 5.0`,
  `INK_COUNTER_MAX_SEC = 10.0`.
- Dibujo (SOLO SVG, procedural): salpicadura generada con LCG determinista
  (`makeInkRng(seed)`), lienzo virtual `1600 x 900`, `fill = rgba(4,2,8,0.97)`:
  - 2 blobs principales (`inkMainSplatPath`): 28-38 anclas, brazos con probabilidad 0.38, huecos
    internos 4-8 con `fillRule="evenodd"`.
  - 8-12 rayos radiales afilados (`inkStreakPath`).
  - 55 gotas elípticas.
  - 3-5 chorretes (`inkDripPath`).
  - Filtro `domeInkUnifiedRim`: `feMorphology dilate radius 2.2` + `feFlood rgba(165,18,56,0.72)`.
- Se regenera cuando la intensidad sube más de `0.12` o pasa de 0 a >0.005 (semilla nueva por
  impacto); visible con intensidad `> 0.005`.

### 6.6 Slots de habilidad — `src/ui/DomeSkillSlotsHud.tsx`

- Tres ranuras circulares apiladas, `clamp(68px, 5.8vw, 86px)`, opacidad 0.3 si vacía.
- SVG `viewBox 0 0 120 120`: núcleo abisal con gradiente radial (`#1b1138 → #090418 → #040408`,
  activo `#0f2d46`), bisel con 12 muescas (mayores cada 3), retícula heptagonal interior.
- Aro de cooldown: `RING_RADIUS = 46`, `strokeWidth 6.5`, pista `rgba(228,228,236,0.12)`,
  progreso con gradiente `#00e5ff → #818cf8 → #e879f9`, `#00e5ff` sólido si activa.
- Icono `/icons/skills/<skillId>.webp` al 46 %, invertido a blanco (`invert(1)`), opacidad 0.42 en
  cooldown; iconos existentes: `attraction_well`, `black_hole`, `bounce_horizon`, `eden_absorb`,
  `gravity_field`, `implosion`, `repulse_push`.
- Etiqueta de tecla biselada (`slot.keyLabel`) abajo-derecha.
- Pips de nivel (rombos de 5×5) bajo el círculo, uno por nivel.

### 6.7 Aros de materia oscura — `src/ui/DomeDarkMatterRings.tsx`

- Overlay en canvas 2D propio con bucle `requestAnimationFrame` independiente (sin estado React);
  lee `controller.getDarkMatterRings()` cada frame (`NyxDomeController.getDarkMatterRings`, L2013).
- Los aros los proyecta `updateDarkMatterRings(camera, enemies)` (L1947) cada frame:
  centro y radio proyectados de la hitbox del enemigo + `DARK_RING_PADDING_PX * 2`.
- Descartados: por debajo de `DARK_RING_NEAR_CUTOFF_M` de distancia (con fundido de 1.5 m) y, sin
  radar, los que superan `DARK_RING_APPEAR_RADIUS_PX` (fundido en la banda de 12 px). Con el radar
  de `Tab` activo se muestran todos y `alpha = 1`.
- Dibujo: anillo de 72 vértices con ruido angular de armónicos disonantes (`darkNoise`, escala de
  referencia `REF_RADIUS = 133`), `TIME_SPEED = 0.9`, `ROT_SPEED = 0.85`, `globalAlpha =
  baseAlpha * 0.45`, pulso `0.35 + 0.05 * sin(t * 9.4 + phase)` en pasivo.

### 6.8 Pausa — `src/ui/DomePauseModal.tsx`

- Fondo papel `#f1f1ed` con rejilla de 96 px, tinta `#0b0d12`, animación `pauseIn 260ms`.
- Kicker `t('pause.subtitle')` y título `t('pause.title')` con `-webkit-text-stroke: 4px` y sombra
  `rgba(225,29,72,0.3)`.
- Chips: `t('pause.wave', {n})` + etiqueta traducida de oleada (`waveLabelKey`) o
  `t('pause.orbitStable')` sin oleada; `t('pause.level', {n})`.
- Botones (con `hotkey` visible `[1]`, `[2]`, …) y acentos: `pause.resume` (`#22d3ee`),
  `pause.settings` (`#fbbf24`), `pause.restart` (`#e11d48`, oculto en entrenamiento),
  `pause.exit` (`#0b0d12`).
- Teclado `[1]..[N]` ejecuta; mando: lista + Cruz confirma + Círculo reanuda.
- Montaje condicional: `isOpen && !settingsOpen`.

### 6.9 Subida de nivel — `src/ui/DomeLevelUpSequence.tsx`

- Fases: `planet` (transición 3D del planeta) → `cards` → `closing` (iris).
- Sonidos por fase: `playLevelUpSpark` (fase 1), `playLevelUpApproach` (fase 2),
  `playLevelUpSlash` (blanqueo al 72-100 % de la fase 2), `playCardSlam` (340 ms y
  `480 + i*130 + 430` ms), `playInkWipe` (carta vuela al centro), `playCardTremble` (430 ms
  después), `playCardStamp` (sello) y `playIrisWink` (cierre, con 1180 ms antes de aplicar).
- Textos: `levelUp.banner` / `levelUp.replaceBanner`, `levelUp.title` (`LEVEL {{n}}`),
  `levelUp.rarity.*` (`base`, `common`, `epic`, `legendary`), `levelUp.kind.*`
  (`activeNew`, `activeUpgrade`, `passive`), `levelUp.edenCost` (`COSTE: {{n}} EDÉN`),
  `levelUp.chooseHint`, `levelUp.slotReplacement`, `levelUp.emptySlot`, `levelUp.levelShort`,
  `levelUp.escBack`.
- Nombre y descripción por `skills.*` y `skillDescriptions.*` a través de `SKILL_I18N_KEYS`
  (pasivas con sufijo de nivel: `skillDescriptions.hpRegen2`, etc.).

### 6.10 Battle Report y ranking de la Cúpula — `src/ui/DomeBattleReport.tsx`

- Preview del ranking con `fetchTopLeaderboard(BOARD_PREVIEW_LIMIT = 5)`.
- Nombre de piloto recordado (`loadPilotNickname`), récord personal (`loadPersonalBestScore`) y
  **auto-subida** si el jugador ya tiene apodo y supera su récord (`beatRecordOnMount`).
- Estados de guardado: `idle` / `saving` / `saved` / `error`, con claves
  `battleReport.saveIdle`, `saveSaving`, `saveSaved`, `saveError`, `saveErrorHint`,
  `saveHint`, `autoUploadingHint`, `autoUploadedHint`, `belowRecordHint`, `savedOutOfTop`.
- Tras guardar: persiste apodo, actualiza récord, recarga el ranking y resalta la fila propia
  (`boardYou`).
- Atajos: `1` / `r` / `R` jugar de nuevo; `2` menú principal.
- Formato de número por idioma: `ja-JP` / `es-ES` / `en-US` vía `toLocaleString`.

---

## 7. Localización (`es`, `en`, `ja`)

### 7.1 Infraestructura — `src/i18n/index.ts`

- `DICTIONARIES = { es, en, ja }`; `LanguageProvider` envuelve la app en `src/main.jsx`.
- `t(key, params)`: resuelve ruta con puntos (`resolvePath`), sustituye `{{param}}` con
  `interpolate` (los parámetros ausentes se dejan como `{{param}}`).
- Fallback real: diccionario del idioma → `en` → `es` → la propia clave (la UI nunca rompe).
- Contexto por defecto sin provider: `language: 'en'`, `setLanguage`/`toggleLanguage` no-op,
  `t` resolviendo contra `en`→`es`→clave.
- `setLanguage` guarda en `outorbit_language` y en `saveGameSettings({...loadGameSettings(),
  language})`; `toggleLanguage` cicla `es → en → ja → es`.
- Toques de idioma inicial: `loadStoredLanguage() ?? loadGameSettings().language`, y `'en'` como
  último recurso.
- `waveLabelKey(label)`: `'BÁSICOS' → enemies.waveBasic`, `'MINIBOSS' → enemies.waveMiniboss`,
  `'BOSS' → enemies.waveBoss`; cualquier otro label se muestra tal cual.
- `SKILL_I18N_KEYS` (10): `gravity_field→gravityField`, `repulse_push→push`,
  `eden_absorb→edenAbsorption`, `attraction_well→attractionWell`, `bounce_horizon→bounceHorizon`,
  `black_hole→blackHole`, `implosion→implosion`, `speed_force→speed`, `eden_regen→edenRegen`,
  `hp_regen→hpRegen`.
- `ENEMY_I18N_KEYS` (8): `abyssal_cell→enemies.abyssalCell`, `spiral_octopus→spiralOctopus`,
  `crab_gunner→crabGunner`, `ground_golem→groundGolem`,
  `lightning_butterfly→lightningButterfly`, `giant_sparrow→giantSparrow`,
  `prisma_necroz→prismaNecroz`, `kronos_leviathan→kronosLeviathan`.

### 7.2 Cobertura

| Idioma | Claves hoja | Secciones de primer nivel | Faltantes vs `es` | Extras vs `es` | Vacías |
|---|---|---|---|---|---|
| `es` (base) | 251 | 15 | 0 | 0 | 0 |
| `en` | 251 | 15 | 0 | 0 | 0 |
| `ja` | 251 | 15 | 0 | 0 | 0 |

Secciones: `menu`, `controls`, `hud`, `pause`, `levelUp`, `settings`, `skills`, `enemies`,
`battleReport`, `leaderboard`, `tutorials`, `domeTutorial`, `mobile`, `skillDescriptions`,
`trainingPanel`.

Textos idénticos al español (no traducidos, por diseño o por ser nombres propios/siglas):
`en` 31 claves — `menu.tagline`, `menu.trainingDebug`, `menu.leaderboard`, `menu.languageEs`,
`menu.languageEn`, `menu.languageJa`, `controls.actions.sprint`, `controls.actions.parry`,
`hud.hp`, `levelUp.rarity.base`, `settings.tabGeneral`, `settings.sectionAudio`,
`settings.sectionVisual`, `enemies.waveMiniboss`, `enemies.waveBoss`, `enemies.prismaNecroz`,
`battleReport.title`, `battleReport.statKills`, `leaderboard.title`, `leaderboard.colRank`,
`leaderboard.colScore`, `domeTutorial.badge`, los tres `*.number` de tutorial, `*.wasdLabel` (x2),
`legendDash`, `chipParry`, `trainingPanel.debug`, `trainingPanel.extrasSection`.
`ja` 11 claves — `menu.languageEs/En/Ja`, `hud.hp`, `battleReport.title`, `leaderboard.title`,
`leaderboard.colRank`, los tres `*.number` de tutorial y `*.wasdLabel` de movimiento.

Particularidades del japonés verificadas en el archivo: `hud.wave` usa `WAVE {{n}}` (no traduce la
palabra), `pause.title` = `PAUSE`, `levelUp.banner` = `LEVEL UP!`, `levelUp.title` =
`LEVEL {{n}}`, `domeTutorial.continueKey` = `スペース`, `settings.tabGamepad` =
`コントローラー`. Las fuentes de `DomePauseModal` / `SettingsScreen` incluyen
`"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Meiryo"`; el HUD yin-yang usa `HUD_FONT =
'Barlow Condensed', 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Meiryo', 'Arial Narrow',
'Helvetica Neue', sans-serif`, mientras el resto del HUD se apoya en la clase `font-mono`.

### 7.3 Claves por pantalla

| Pantalla / componente | Claves usadas |
|---|---|
| `TitleScreen` | `menu.tagline`, `menu.play`, `menu.training`, `menu.controls`, `menu.leaderboard`, `menu.languageEs/En/Ja` |
| `DomeHudSketch` | `hud.clickToCapture`, `hud.groundControls`, `hud.floatControls`, `hud.speedAttackControls`, `hud.bulletTimeHint`, `hud.parryDashHint`, `hud.parryStrikeHint`, `hud.gamepadConnected` |
| `DomeYinYangHud` | `hud.levelPrefix`, `hud.wave`, `hud.training` |
| `DomePauseModal` | `pause.subtitle`, `pause.title`, `pause.wave`, `pause.orbitStable`, `pause.level`, `pause.resume`, `pause.settings`, `pause.restart`, `pause.exit` |
| `DomeLevelUpSequence` | `levelUp.*`, `skills.*`, `skillDescriptions.*` |
| `DomeBattleReport` | `battleReport.*`, `skills.*` vía `SKILL_I18N_KEYS` |
| `SettingsScreen` | `settings.*`, `controls.keyBindings`, `controls.keyboardHint`, `controls.pressKey`, `controls.pressButton`, `controls.gamepadConnected`, `controls.gamepadNone`, `controls.gamepadConnectHint`, `controls.stickSensitivity`, `controls.deadzone`, `controls.buttonBindings`, `controls.resetGamepad`, `controls.w3cMappingNote`, `controls.actions.*`, `controls.gamepadActions.*` |
| `LeaderboardModal` | `leaderboard.*` |
| `DomeTutorialCard` | `domeTutorial.badge`, `domeTutorial.<id>.number/title/paragraph1/paragraph2`, `domeTutorial.continueKey`, `domeTutorial.continueAction` |
| `DomeTrainingPanel` | `trainingPanel.*`, `enemies.*` vía `ENEMY_I18N_KEYS`, `skills.*`, `skillDescriptions.*` |
| `MobileBlocker` | `mobile.title`, `mobile.body`, `mobile.footer` |

---

## 8. Leaderboard Base44

### 8.1 Entidad

`base44/entities/LeaderboardEntry.jsonc`:

| Propiedad | Tipo | Nota |
|---|---|---|
| `player_name` | string | callsign del piloto (requerido) |
| `clear_time_sec` | number | segundos (requerido) |
| `score` | number | puntuación (requerido) |
| `dominant_style` | string | estilo táctico (requerido) |
| `stealth_pct`, `aggression_pct`, `aerial_pct`, `subterranean_pct`, `stasis_pct` | number | porcentajes |
| `alarms_triggered` | number | alarmas |

RLS: `read {}` y `create {}` abiertos; `update` y `delete` restringidos a `role: admin`.

Tipo espejo en TypeScript: `LeaderboardEntryRecord` (`src/game/types.ts:532-545`) con
`id?` y `created_date?`.

### 8.2 Acceso — `src/api/leaderboard.ts`

- `fetchTopLeaderboard(limit = 10)`: `base44.entities.LeaderboardEntry.list({ sort: '-score',
  limit })`, devuelve `page.items ?? []`; en error hace `console.warn` y devuelve `[]`.
- `submitLeaderboardEntry(entry)`: `base44.entities.LeaderboardEntry.create({...entry})`;
  devuelve el registro o `null` en error.

### 8.3 Uso en la UI

| Lugar | Límite | Notas |
|---|---|---|
| `LeaderboardModal` (portada) | 15 | carga al abrir, cachea y permite `RECARGAR`; columnas `#`, `Piloto`, `Tiempo`, `Score`, `Estilo`, `Alarmas`; `formatTime(clear_time_sec)` → `m:ss`; podio con colores ámbar/plata/bronce; `dominant_style` vacío → `—` |
| `DomeBattleReport` | 5 | preview dentro del informe; resalta la fila propia y permite recargar |

### 8.4 Score y mapeo de campos (`src/game/dome/DomeRunStats.ts`)

`DOME_SCORE_WEIGHTS` y fórmula de `getScore()`:

```
score = wave*500 + kills*100 + elites*750 + bosses*2500 + barrierKills*125
      + perfectRedirections*150 + floor(maxSpeedReached)*10
      + floor(survivalTimeSec)*5 + damageDealt*0.1 + maxLevelReached*250
```

Redondeado y con mínimo 0.

`submitDomeRunToLeaderboard(summary, playerName)` rellena:

| Campo Base44 | Origen |
|---|---|
| `player_name` | nombre introducido (o `battleReport.defaultPilotName` = `PILOTO`) |
| `clear_time_sec` | `round(survivalTimeSec)` |
| `score` | `round(score)` |
| `dominant_style` | `boss_slayer` (≥1 jefe) · `barrier_trickster` (barrierKills*3 ≥ kills) · `redirector` (redirecciones*2 ≥ kills) · `kinetic_duelist` (resto) |
| `stealth_pct`, `subterranean_pct`, `stasis_pct` | `0` (no aplican en la Cúpula) |
| `aggression_pct` | `100 * (1 - barrierKills/kills)` |
| `aerial_pct` | `100 * maxSpeedReached / AERIAL_SPEED_REFERENCE (80)`, clamp 0..100 |
| `alarms_triggered` | oleada alcanzada |

### 8.5 Persistencia local asociada

- `outorbit_nickname` (con migración desde `outorbit_pilot_name`), `outorbit_best_score`.
- `savePilotNickname` limpia espacios y escribe ambas claves de nombre; `loadPersonalBestScore`
  redondea y descarta valores no finitos o ≤ 0.

---

## 9. Notas de verificación y límites del documento

- Todos los valores numéricos de audio (frecuencias, duraciones, ganancias, delays) fueron leídos
  del código y re-extraídos con un script que enumera los 55 métodos y los 22 `case` de `play()`.
- Todos los recuentos de i18n provienen de aplanar los tres JSON y comparar conjuntos de claves.
- El documento no evalúa calidad, no propone rediseños y no incluye recomendaciones.
- Puntos donde el código tiene comportamiento contraintuitivo y se reportan tal cual, sin
  corregirlos: (1) el `fallback` real de `t()` es `en → es → clave` aunque los comentarios del
  archivo digan `es`; (2) `startDomeGameLoop` reajusta el volumen del audio y de la música solo con
  `masterVolume` al montar; (3) las acciones `interact`, `parry`, `stasis` y `lockOn` son
  rebindables y aparecen en Ajustes pero la Cúpula no las consume; (4) `Tab` queda mapeada a
  `radar` por orden de resolución, aunque `lockOn` la declare como alias.

---

## 7. Arquitectura Técnica, Stack, Pipeline, Assets 3D/Audio y Tutoriales

# OUTORBIT — Arquitectura técnica, stack, build, assets y tutoriales

Documento de extracción pura de datos del repositorio en `/home/pakura/Proyectos/OUTORBIT`.
Todos los valores proceden de lectura directa de los archivos y de comandos ejecutados sobre
el árbol de trabajo (no de documentación previa). Donde la documentación del repo contradice
al código, se indica expresamente en la sección 14.

Fecha de extracción: 2026-11-26 (UTC), sobre el commit `fb610ec`.

---

## 1. Identidad y repositorio

| Dato | Valor verificado |
|---|---|
| Nombre del paquete (`package.json`) | `base44-app` |
| Versión | `0.0.0` |
| Autoría/licencia | No hay campo `author`, `license` ni archivo `LICENSE` en la raíz |
| Tipo de módulo | `"type": "module"` |
| Repositorio git | `origin https://github.com/SrPakura/OUTORBIT.git` (fetch y push) |
| Rama actual | `main` |
| Último commit | `fb610ec Make lightning_butterfly dodge all thrown objects/auto-aim except its own ball, and adjust HP to 31 (medium rock 32)` |
| Proyecto Base44 (`base44/config.jsonc`) | `name: "outorbit"`, `visibility: "public"`, `outputDirectory: "./dist"`, `installCommand: npm install`, `buildCommand: npm run build`, `serveCommand: npm run dev` |
| Entidad Base44 | `base44/entities/LeaderboardEntry.jsonc` (campos: `player_name`, `clear_time_sec`, `score`, `dominant_style`, `stealth_pct`, `aggression_pct`, `aerial_pct`, `subterranean_pct`, `stasis_pct`, `alarms_triggered`; RLS: lectura/creación abiertas, update/delete solo `role: admin`) |
| Node declarado | `.nvmrc` → `22.21.1` |
| Node presente en la máquina de análisis | `v26.13.1` (distinto del `.nvmrc`) |

`git log -n 10 --oneline`:

```
fb610ec Make lightning_butterfly dodge all thrown objects/auto-aim except its own ball, and adjust HP to 31 (medium rock 32)
672d556 Set electric_ball lifetime to 5s
3498b31 Tune lightning_butterfly cadence, 10s electric ball explosion, and -15% speed cap
c9279ca feat(dome): fix crab initial slab spawn, add easy mode, wave difficulty scaling & ja i18n
4aa66bc feat(dome): redesign lightning_butterfly electric dash bursts, quartz/plasma shaders, Repulse reflect & Gravity magnet
6cc3609 fix(sparrow): actively intercept, break homing, and shatter gravity rocks & bounce slashes
a8d0d6e fix(nyx,sparrow): fix NaN disappearing arms, add melee evade, projectile shatter, -5% speed & 0.75x slow-mo hold
4778b7c balance(dome): raise giant_sparrow HP to 520 and prevent low-speed skill star nuke
1dfd8d3 feat(dome): add 0.75x tactical slow-mo scenes to giant_sparrow fight
c706aa5 feat(dome): redesign giant_sparrow aerodynamic AI, abilities & 5 animations
```

---

## 2. Stack tecnológico (versiones declaradas vs. instaladas)

### 2.1 `dependencies` declaradas en `package.json`

| Paquete | Rango declarado |
|---|---|
| `@base44/sdk` | `^0.8.63` |
| `@base44/vite-plugin` | `^1.0.53` |
| `lucide-react` | `^0.475.0` |
| `react` | `^18.2.0` |
| `react-dom` | `^18.2.0` |
| `three` | `^0.187.0` |

### 2.2 `devDependencies` declaradas

| Paquete | Rango declarado |
|---|---|
| `@types/react` | `^19.3.0` |
| `@types/react-dom` | `^19.3.0` |
| `@types/three` | `^0.187.0` |
| `@vitejs/plugin-react` | `^4.3.4` |
| `autoprefixer` | `^10.4.20` |
| `base44` | `^0.3.7` |
| `postcss` | `^8.5.3` |
| `tailwindcss` | `^3.4.17` |
| `typescript` | `^7.0.2` |
| `vite` | `^6.1.0` |

### 2.3 Versiones realmente instaladas (`package-lock.json` → `node_modules/<pkg>/version`)

| Paquete | Instalada | Nota |
|---|---:|---|
| `three` | 0.187.0 | motor 3D |
| `react` | 18.3.1 | UI |
| `react-dom` | 18.3.1 | UI |
| `typescript` | 7.0.2 | tipos, `noEmit` |
| `vite` | 6.4.6 | dev server + build |
| `@vitejs/plugin-react` | 4.7.0 | React en Vite |
| `tailwindcss` | 3.4.19 | estilos |
| `postcss` | 8.5.33 | pipeline CSS |
| `autoprefixer` | 10.7.0 | prefijos |
| `@base44/sdk` | 0.8.63 | cliente Base44 |
| `@base44/vite-plugin` | 1.0.53 | plugin Vite (alias `@/`) |
| `base44` (CLI) | 0.3.7 | devDependency |
| `lucide-react` | 0.475.0 | iconos |
| `esbuild` | 0.25.12 | **transitivo**: no está en `package.json`; `npx esbuild --version` devuelve `0.25.12` |
| `@types/three` | 0.187.0 | tipos |

Observaciones verificadas:

- `@types/react` y `@types/react-dom` están declarados en `^19.x` mientras `react`/`react-dom` son 18.3.1 (desalineación de tipos en el propio `package.json`).
- `lucide-react` solo se usa en código React **no alcanzable en runtime** (`src/components/ui/checkbox.jsx`, `src/components/Mfa*.jsx`, `src/pages/*.jsx`). Ningún archivo de `src/ui/` ni `src/game/` lo importa.
- No hay motor de juego ni librería de física externa: sólo `three`.

---

## 3. Configuración del proyecto (archivos de build)

### 3.1 `package.json` → scripts

```json
"scripts": {
  "dev": "vite",
  "build": "esbuild src/game/render/nyxAnimator.ts --bundle --format=esm --outfile=public/nyx-animator-bundle.js && vite build",
  "preview": "vite preview"
}
```

- No existe `test` ni `lint`.
- `build` ejecuta **dos pasos encadenados** con `&&`: primero esbuild (bundle ESM del animador), después `vite build` (app completa a `dist/`).
- El comando de esbuild no pasa `--minify` ni `--target`: se emite ESM legible, sin minificar.

### 3.2 `vite.config.js` (completo, 7 líneas)

```js
import base44 from '@base44/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [base44(), react()],
});
```

- No hay `alias`, `server`, `build` ni `base` declarados a mano.
- El alias `@/` → `/src/` **lo inyecta el plugin de Base44**: `node_modules/@base44/vite-plugin/dist/index.js:63` devuelve `resolve.alias = { "@/": "/src/" }`.
- El mismo plugin avisa en `command === 'build'` si falta `VITE_BASE44_APP_ID` (`BUILD_WITHOUT_APP_ID_WARNING`), lo que explica que un `npm run build` sin entorno Base44 deje el leaderboard inoperativo sin romper la app.

### 3.3 `tsconfig.json` (completo)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "allowJs": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

- `checkJs` **no** está activo: los `.jsx` no se validan de tipos.
- `resolveJsonModule` habilita los imports `es.json` / `en.json` / `ja.json` del i18n.
- `jsconfig.json` replica `paths` (`@/*` → `./src/*`) para el editor.

### 3.4 `tailwind.config.js`

- `content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}']`.
- `theme.extend.borderRadius`: `lg`/`md`/`sm` derivados de `var(--radius)`.
- `theme.extend.colors`: `background`, `foreground`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, todos como `hsl(var(--token))`.
- `plugins: []`.

### 3.5 `postcss.config.js`

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

### 3.6 `src/index.css` (37 líneas)

`@tailwind base/components/utilities` + `@layer base` con las variables HSL de tema (`--background: 0 0% 100%`, `--foreground: 222.2 84% 4.9%`, `--radius: 0.5rem`, etc.) y el `body { @apply bg-background text-foreground antialiased; }`.

### 3.7 `index.html` (completo funcionalmente)

| Elemento | Valor |
|---|---|
| `lang` | `es` (fijo, no cambia con el idioma de la UI) |
| Favicon | `https://base44.com/logo_v2.svg` |
| Viewport | `width=device-width, initial-scale=1.0` |
| Fuentes | Google Fonts: `Barlow Condensed` (700, 800, it 800) + `Noto Sans JP` (500, 700, 900) |
| Título | `OUTORBIT` |
| Estilo inline | `html, body { margin: 0; background: #05010f; }` |
| Montaje | `<div id="root">` + `<script type="module" src="/src/main.jsx">` |

### 3.8 `components.json` (shadcn)

`style: "new-york"`, `rsc: false`, `tsx: false`, `tailwind.config: tailwind.config.js`, `css: src/index.css`, `baseColor: slate`, `cssVariables: true`, alias `components: @/components`, `ui: @/components/ui`.

### 3.9 `base44/`

```
base44/.app.jsonc          (gitignorado: contiene el id de app)
base44/config.jsonc        (nombre/visibilidad/site del proyecto)
base44/entities/LeaderboardEntry.jsonc
base44/agent-skills/weekly-report.md
```

---

## 4. Pipeline de build y de assets

### 4.1 Cadena de build en producción

```
1) esbuild  src/game/render/nyxAnimator.ts
            --bundle --format=esm
            → public/nyx-animator-bundle.js        (291.410 bytes, ESM sin minificar)

2) vite build (plugins: base44(), react())
            → dist/                                 (22 MB en total)
```

- El bundle de esbuild **no lo usa el juego**: lo importa dinámicamente `public/character-sheet.html`
  (`await import('/nyx-animator-bundle.js')`) para previsualizar los estados de animación de Nyx.
  Si el módulo no está disponible, la hoja cae a "poses clásicas" y oculta los botones de animación.
- `public/nyx-animator-bundle.js` está **commiteado** en el repo (285 K en `ls -lh`, 291.410 bytes exactos).
- `dist/` (build presente en el árbol, 22 MB) contiene `index.html`, `assets/index-CmnBYagp.js` (2,1 MB),
  `assets/index-Cp6rM0e4.css` (42 K) y copia íntegra de `public/` (`audio/`, `icons/`, `models/`,
  `character-sheet.html`, `nyx-animator-bundle.js`). `dist` está en `.gitignore`.

### 4.2 `public/character-sheet.html` (46.536 bytes, 1.522 líneas)

| Dato | Valor |
|---|---|
| Título | `OUTORBIT // CHARACTER SHEET: NYX` |
| Carga de three | `importmap` a `https://unpkg.com/three@0.170.0/build/three.module.js` (versión distinta a la del juego, 0.187.0) |
| Addons | `three/addons/` → `https://unpkg.com/three@0.170.0/examples/jsm/` |
| Módulos usados | `GLTFLoader`, `OrbitControls`, `SkeletonUtils` |
| Modelo | `/models/nyx_rigged.glb` |
| Estados | botones generados desde `NYX_ANIM_STATES` del bundle del animador |

### 4.3 Pipeline offline de assets (`scripts/`, 18 archivos + `__pycache__/`; 15 de ellos `.py`)

| Archivo | Tipo | Función verificada en cabecera |
|---|---|---|
| `build_nyx_rigged.mjs` (60 K) | Node | Construye `public/models/nyx_rigged.glb` 100 % procedural (4 primitivas `nyx_hair`, `nyx_body`, `nyx_face`, `nyx_eyes`, esqueleto de 25 huesos, skin JOINTS_0/WEIGHTS_0 + inverseBindMatrices, `verify()` que reparsea el GLB) |
| `bake_nyx_clips.mjs` (9,6 K) | Node | Hornea `nyx_kick_flip`, `nyx_kick_flip_drill`, `nyx_gravity_kick`, `nyx_spiral_drill_kick` a `src/game/render/nyxBakedClips.ts` (Euler XYZ, pista `hips` unwrapped) |
| `blender_*.py` (11 archivos) | Blender | Generación/retargeting de clips: `blender_nyx_run.py`, `blender_build_run_clips.py`, `blender_build_float_clips.py`, `blender_build_kick_flips.py`, `blender_build_kicks.py`, `blender_build_run_from_walk.py`, `blender_export_run_from_blend.py`, `blender_kimodo_retarget_nyx.py`, `blender_blendcap_retarget_nyx.py`, `blender_flow_bridge.py`, `blender_nyx_refs.py` |
| `nyx_walk_clips.py` | Blender | Clips de caminata |
| `kimodo_generate_run.py` | Blender | Generación de la carrera con Kimodo |
| `bvh_loop_analysis.py` | Python | Análisis de bucles BVH |
| `glb_strip_metadata.py` | Python | Limpia `asset.copyright/extras/generator`, `extras`/`extensions` de nodos/mallas/materiales/skins/animaciones; opción `--ascii-names` |
| `smoke_golem_parry.ts` | TS | Smoke test del parry del Gólem (no es runner de tests) |

Nota verificada: **todos** los GLB de `public/models/` declaran `asset.generator = "Khronos glTF Blender I/O v5.3.43"`,
mientras `build_nyx_rigged.mjs:1178` escribe `generator: 'build_nyx_rigged.mjs'`. Es decir, los GLB commiteados
no son la salida literal del script actual: fueron exportados con el exportador de Blender.

### 4.4 Flujo real en runtime de los GLB

| Asset | Cargador | Detalle |
|---|---|---|
| `nyx_rigged.glb` | `src/game/render/nyxModelLoader.ts:275` (`loadAsync`) | Se viste con un `ShaderMaterial` propio ("Nebula Cósmica"): FBM + estrellas, uniforms `uDeepColor`, `uNebulaA`, `uNebulaB`, `uRimColor`, `uTime`, `uGravityShift`, `uSpeed01`, con `#include <skinning_*>` |
| Clips de Nyx | `nyxModelLoader.ts:197-319` | 17 GLB independientes: 3 de walk (start/loop/end), 3 de run, 4 de float, `nyx_zero_g_float`, y el resto se hornean en TS |
| Enemigos | `src/game/dome/DomeEnemyModels.ts:457` | URL `/models/enemies/<archetype>.glb?v=GLB_CACHE_VERSION`, con `GLB_CACHE_VERSION = 10` (bust de caché por query string) |
| Instanciación de enemigos | `DomeEnemyModels.ts` | `preloadEnemyModels()` precarga los 8; `instantiateEnemyVisual()` clona con `SkeletonUtils.clone` (si hay SkinnedMesh/huesos) o `.clone(true)`, aplica material cel de cómic + contorno de tinta, devuelve `starCores` y `AnimationMixer`. Un 404 se ignora y deja la forma provisional |

---

## 5. Arquitectura de módulos (`src/`)

Totales medidos con `wc -l` (incluye `.ts/.tsx/.jsx/.js/.css`):

| Ámbito | Líneas |
|---|---:|
| `src/` completo | 70.220 |
| `src/game/dome/` | 26.160 |
| `src/game/render/` (+ `render/models/`) | 13.517 |
| `src/ui/` | 11.822 |

### 5.1 Árbol de directorios

```
src/
  api/            base44Client.js, leaderboard.ts
  components/     AuthLayout, Base44Logo, GoogleIcon, Mfa*, ProtectedRoute, ui/{button,checkbox,input}.jsx
  game/
    GameEngine.ts        (legado, 1.464)
    types.ts             (contrato del motor legado, 600)
    settings.ts          (504)
    localStorageState.ts (262)
    ai/        AdaptationDirector.ts (103), BehaviorTracker.ts (152), KronosNeuralNet.ts (248)
    audio/     MusicPlayer.ts (390), SynthAudio.ts (1.303)
    dome/      24 módulos (26.160 líneas)
    entities/  PlayerController.ts (2.389), WorldObjects.ts (4.131), enemyAI.ts (1.451)
    input/     GamepadInput.ts (181), gamepadMenuNav.ts (149)
    levels/    tutorialDefinitions.ts (1.168)
    math/      spherical.ts (548), terrain.ts (299)
    render/    domeArenaScene.ts (1.804), nyxAnimator.ts (1.104), nyxBakedClips.ts (826),
               toonMaterials.ts (657), enemyAnimator.ts (632), nyxModelLoader.ts (351),
               menuShaders.ts (176), meshFactory.ts (105), cityModels.ts (829),
               proceduralModels.ts (67), nyxAnims*.ts, nyx*Player.ts
    render/models/  17 archivos procedurales (characterModel, guardFaction, beastEnemies,
                    cyberEnemies, shogunateEnemies, bossKronos, structures, verdantProps,
                    cryoIronProps, puzzleObjects, signaling, npcModel, planetModel,
                    propRegistry, enemyRegistry, modelParts)
    sandbox/   SandboxManager.ts (833)
  i18n/      index.ts (170), es.json, en.json, ja.json
  lib/       app-params.js, authMfa.js, authMfaFlow.js, authReturnTo.js
  pages/     ForgotPassword, Login, Mfa, OAuthConsent, Register, ResetPassword (.jsx, legado)
  ui/        21 archivos (11.822 líneas)
  App.tsx (170), main.jsx (10), index.css (37)
```

### 5.2 `src/game/dome/` — el juego que sí se ejecuta

| Archivo | Líneas | Responsabilidad (según cabecera y exports verificados) |
|---|---:|---|
| `DomeWaveManager.ts` | 5.060 | Ciclo de oleadas, planes de spawn, IA genérica, FSM de Pulpo/Cangrejo/Prisma/Gorrión, pool de proyectiles, anillos y portales de KRONOS |
| `NyxDomeController.ts` | 4.298 | Jugador: física 0G, cámara, dash, ataque de velocidad, frenado, Sentadilla Cinética, lock del visor, radar, recursos, animación |
| `DomeSkills.ts` | 2.039 | Ejecutor 3D de las 7 habilidades activas y sus VFX |
| `domeKronosBehavior.ts` | 1.729 | Boss de 4 fases: cadena de 13 puntos, anillos, portales, mordisco, supernova |
| `domeGolemBehavior.ts` | 1.337 | Gólem: helicóptero, observación, puñetazo, cargas en espiral, stamina, ventana de parry |
| `DomeEnemyModels.ts` | 1.310 | Precarga/instanciación de GLB, paletas por arquetipo, shaders de carne/estrella, rigs (`collectGolemRig`, `collectKronosRig`, `collectSparrowRig`, `collectButterflyRig`, `collectPrismaNecrozRig`) |
| `domeSparrowBehavior.ts` | 1.113 | Gorrión Gigante |
| `domeCrabBehavior.ts` | 1.063 | Cangrejo Artillero: salto entre slabs, láser con fuego amigo, ráfaga, kamikaze |
| `MotionVfx.ts` | 969 | Pool de chispas, polvo, anillos |
| `domeNecrozBehavior.ts` | 940 | Prisma Necroz |
| `domeCellBehavior.ts` | 914 | Enjambre de Células Abisales con director de atención |
| `domeButterflyBehavior.ts` | 743 | Mariposa Relámpago |
| `DomeSlabs.ts` | 665 | Colisión y raycast contra slabs |
| `DomeProgression.ts` | 553 | Curva de EXP, slots, catálogo de habilidades/pasivas, generador de cartas |
| `ComicImpactVfx.ts` | 506 | Golpes cómic |
| `DomeSphereTiles.ts` | 475 | Damero de la esfera |
| `DomeSlabGeometry.ts` | 467 | Geometría de slabs |
| `DomeFloatingSlabs.ts` | 463 | Suelos flotantes |
| `DomeCombatSystem.ts` | 459 | Stats por arquetipo, daño carne/estrella, tinta, fábrica de entidades |
| `DomePickups.ts` | 362 | Orbes de EXP/Edén/vida |
| `nyxKineticBounce.ts` | 229 | Sentadilla Cinética |
| `DomeRunStats.ts` | 222 | Métricas de run, score, envío al leaderboard |
| `domeTypes.ts` | 204 | Tipos y constantes de arena/visor |
| `domeEnemyOrient.ts` | 40 | Orientación compartida de enemigos |

### 5.3 `src/ui/` — pantallas, HUD y modales

| Archivo | Líneas | Responsabilidad |
|---|---:|---|
| `DomeLevelUpSequence.tsx` | 1.504 | Cinemática de subida de nivel: 2 cartas + cierre en iris, teclado y mando |
| `domeGameLoop.ts` | 1.497 | Runtime de la run: renderer, escena, managers, listeners, oleadas, muerte, HUD a 30 Hz |
| `GameHUD.tsx` | 1.197 | HUD de campaña (rama legada) |
| `DomeBattleReport.tsx` | 1.026 | Game Over, estadísticas, firma del piloto, top 5 |
| `SettingsScreen.tsx` | 875 | Ajustes: general, teclado, mando (pantalla completa) |
| `DomeTutorialCard.tsx` | 766 | Tarjeta cómic de los 3 tutoriales con bloqueo de 4 s |
| `DomeHudSketch.tsx` | 710 | Compositor del HUD: halftone, visor, radar, tinta, avisos |
| `DomeYinYangHud.tsx` | 577 | Yin-yang WebGL de Vida/Edén + anillo de EXP |
| `TitleDioramaSandbox.ts` | 483 | Diorama 3D de la portada (carga `nyx_rigged.glb`) |
| `DomeGameView.tsx` | 480 | Estado React de la partida y montaje de modales |
| `SkillIcon.tsx` | 441 | Iconos SVG vectoriales 72×72 (7 activas + 3 pasivas) |
| `FluidInkButton.tsx` | 379 | Botón de tinta animado (portada) |
| `BattleReportScreen.tsx` | 353 | Informe de batalla legado |
| `DomeTrainingPanel.tsx` | 294 | Panel debug de entrenamiento |
| `DomePauseModal.tsx` | 289 | Pausa |
| `DomeSkillSlotsHud.tsx` | 246 | 3 ranuras con icono webp, cooldown y pips |
| `DomeDarkMatterRings.tsx` | 236 | Aros de materia oscura sobre enemigos lejanos |
| `TitleScreen.tsx` | 228 | Portada: diorama, menú, selector de idioma |
| `LeaderboardModal.tsx` | 128 | Ranking |
| `MenuModalShell.tsx` | 69 | Marco de modal |
| `MobileBlocker.tsx` | 44 | Bloqueo en táctil/`<768 px` |

### 5.4 `src/game/render/`

| Archivo | Líneas | Función |
|---|---:|---|
| `domeArenaScene.ts` | 1.804 | Backdrop de la cúpula + 60 bloques `/* glsl */` en todo el proyecto (20 en este archivo) |
| `nyxAnimator.ts` | 1.104 | Animador del esqueleto de Nyx: 28 huesos, 21 estados, poses procedurales + clips horneados |
| `nyxBakedClips.ts` | 826 | Keyframes generados por `scripts/bake_nyx_clips.mjs` |
| `toonMaterials.ts` | 657 | Cel-shading de 3 bandas, halftone, Fresnel, tinta (Inverted Hull), `setHalftonesEnabled` global |
| `enemyAnimator.ts` | 632 | Animación de enemigos procedurales |
| `nyxModelLoader.ts` | 351 | Carga del rig + shader Nebula + reproductores de clips |
| `menuShaders.ts` | 176 | Shader del divisor de la portada |
| `meshFactory.ts` | 105 | Utilidades de geometría y `mulberry32` |
| `nyxAnimsCombat/Grounded/Skills/Traversal.ts` | 347/320/236/250 | Poses por estado |
| `nyxWalkPlayer/RunPlayer/FloatPlayer/LoopPlayer.ts` | 238/223/181/164 | Reproductores de clips GLB |
| `cityModels.ts` | 829 | Modelos de ciudad (legado) |
| `proceduralModels.ts` | 67 | Barrel de exports de `render/models/` |

Conteo de bloques shader marcados con `/* glsl */`: 60 → `domeArenaScene` 20, `DomeEnemyModels` 9,
`toonMaterials` 8, `DomeSkills` 6, `nyxModelLoader` 4, `DomeWaveManager` 4, `ComicImpactVfx` 3,
`menuShaders` 2, `DomeSlabGeometry` 2, `MotionVfx` 2.

### 5.5 `src/game/audio/`

| Archivo | Líneas | Función |
|---|---:|---|
| `SynthAudio.ts` | 1.303 | 48 métodos `play*` de SFX 100 % sintetizados con WebAudio + viento rosa y zumbido gravitatorio continuos |
| `MusicPlayer.ts` | 390 | Reproductor de las 4 pistas con fundidos, silencio 3–6 s, cola de oleada, interrupción de jefe, integración `navigator.mediaSession` (MPRIS) |

### 5.6 `src/game/ai/`, `math/`, `input/`, `entities/`, `levels/`, `sandbox/` (legado)

| Archivo | Líneas | Función |
|---|---:|---|
| `entities/WorldObjects.ts` | 4.131 | Bases, edificios con colisión/LoS, enemigos con cono de visión, KRONOS |
| `entities/PlayerController.ts` | 2.389 | Movimiento esférico, estasis, lock-on, dash |
| `entities/enemyAI.ts` | 1.451 | IA de campaña |
| `ai/KronosNeuralNet.ts` | 248 | MLP (según cabecera del módulo: 134 parámetros, backpropagation online) |
| `ai/BehaviorTracker.ts` | 152 | Vector de comportamiento del jugador |
| `ai/AdaptationDirector.ts` | 103 | Adaptación por planeta |
| `math/spherical.ts` | 548 | Transporte paralelo por cuaterniones, colisión esfera + estructuras tangentes |
| `math/terrain.ts` | 299 | Terreno esférico, `isInLowBasin` |
| `input/GamepadInput.ts` | 181 | Gamepad API, `readConnectedGamepad` |
| `input/gamepadMenuNav.ts` | 149 | `useGamepadListNav` para menús |
| `levels/tutorialDefinitions.ts` | 1.168 | 5 mini-niveles jugables (ver sección 8) |
| `sandbox/SandboxManager.ts` | 833 | Retos de sandbox |

### 5.7 `src/game/types.ts` (600 líneas) — contrato del motor legado

Bloques exportados verificados: `CharacterId` (`kitsune` \| `digger` \| `axel`), `CharacterProfile`,
`BiomeType` (`tutorial` \| `verdant` \| `cryo` \| `bastion` \| `kronos`), `StructureKind`, `StructureSpec`,
`PlanetSpec`, `WaterBubbleSpec`, `GrassZoneSpec`, `RestrictedZoneSpec`, `InteractableKind`, `WorldObjectSpec`,
`PropKind`, `PropSpec`, `PlanetRuntime`, `EnemyKind` (`guard` \| `officer` \| `drone` \| `turret` \| `brute` \| `kronos`),
`EnemySkin`, `EnemyAlertState`, `EnemySpawnSpec`, `NpcSpec`, `PlayerBehaviorVector`, `BehaviorPercentages`,
`PlanetAdaptationConfig`, `LevelId` (`sandbox` \| `prologue` \| `verdant` \| `cryo` \| `bastion` \| `kronos`),
`CollectibleKind`, `CollectibleSpec`, `AnchorNodeSpec`, `SandboxChallengeKind`, `SandboxChallengeCheckpoint`,
`SandboxChallengeSpec`, `LevelObjective`, `GalaxySpec`, `ObjectiveMarker`, `RadioToast`, `DamageFeedbackInfo`,
`GamePhase`, `HudSnapshot`, `LeaderboardEntryRecord`, `GAME_CONSTANTS`.

### 5.8 `src/game/dome/domeTypes.ts` (204 líneas) — contrato del juego actual

- `NyxMovementMode`: `grounded` | `floating` | `dashing` | `speed_attack` | `kick_recover` | `kinetic_bounce`.
- `SpeedAttackKind`: `gravity_kick` | `spiral_drill_kick` | `void_fall`.
- `ReticleLockState`: `none` | `can_lock` | `locked`.
- `KineticBounceUiState`: `none` | `available` | `committed`.
- `SlabExactMesh`, `SlabCollider`, `SlabRaycastHit`, `TestEnemySphere`.
- `DomeHudState` (HP, Edén, EXP, nivel, velocidad, `drillThreshold`, modo, ataque, pointer lock, gamepad, lock del visor,
  parry del Gólem, `kineticBounceState`, `lockedEnemyScreenPos`, bullet time, 3 slots, `domeBounceFlash`, `inkOverlayIntensity`,
  `waveNumber`, `waveLabel`, `impactFlash`, `cameraRollDeg`, `gyroSpinRad`, `edenFlash`, `radarEnabled`, `radarDots`).
- `DomeRadarDot`, `DomeDarkRing`.
- Constantes: `DARK_RING_PADDING_PX = 5`, `DARK_RING_NEAR_CUTOFF_M = 20`, `DARK_RING_APPEAR_RADIUS_PX = 109`,
  `RETICLE_SIZE_PX = 120`, `RETICLE_LOCK_RADIUS_PX = 62`, `RETICLE_BREAK_RADIUS_PX = 262`,
  `VISOR_CIRCLE_RADIUS_PX = 120 * (216 / 512) ≈ 50.6`, `DOME_ARENA_RADIUS = 90`, `DOME_PLAYER_BOUND_RADIUS = 88.6`.

### 5.9 Ajustes y persistencia

`src/game/settings.ts` (504 líneas):

- `ControlAction`: 14 acciones (`forward`, `back`, `left`, `right`, `jump`, `sprint`, `interact`, `parry`,
  `stasis`, `lockOn`, `radar`, `slot1`, `slot2`, `slot3`).
- `GamepadAction`: 9 (`attack`, `attackAlt`, `dash`, `dashAlt`, `jump`, `slot1`, `slot2`, `slot3`, `pause`).
- `GamepadButtonIndex`: 0..17 (mapeo W3C documentado en el archivo).
- `Language`: `'es' | 'en' | 'ja'`.
- `SETTINGS_LIMITS`: `mouseSensitivity` 0.25–2.5, `baseFov` 55–85, `masterVolume`/`musicVolume`/`sfxVolume` 0–1.5,
  `gamepadSensitivity` 0.5–3.0, `gamepadDeadzone` 0.05–0.35.
- `DEFAULT_SETTINGS`: `language: 'en'`, `mouseSensitivity: 1.0`, `invertY: false`, `baseFov: 70`, volúmenes `1.0`,
  `halftonesEnabled: true`, `easyMode: false`, `gamepadSensitivity: 1.4`, `gamepadDeadzone: 0.14`.
- `SECONDARY_ALIASES`: `sprint: ['ShiftRight']`, `stasis: ['KeyC']`, `lockOn: ['Tab','KeyV']`; `ARROW_FALLBACK` para las flechas.
- Clave única versionada: `outorbit.settings.v1`.

Claves de `localStorage` (`localStorageState.ts`, `STORAGE_KEYS`):

| Clave | Contenido |
|---|---|
| `outorbit_language` | `es` \| `en` \| `ja` |
| `outorbit_nickname` | Apodo del piloto |
| `outorbit_pilot_name` | Legado |
| `outorbit_best_score` | Récord personal |
| `outorbit_button_mapping` | Mapeos PC y mando (`ButtonMappingEntry`) |
| `outorbit_other_settings` | 10 claves (`OtherSettingKey`): `mouseSensitivity`, `invertY`, `baseFov`, `masterVolume`, `musicVolume`, `sfxVolume`, `halftonesEnabled`, `easyMode`, `gamepadSensitivity`, `gamepadDeadzone` |
| `outorbit_tutorial` | Array `TutorialProgressEntry[]` con 3 ids |

---

## 6. Inventario de modelos 3D (`public/models/`)

### 6.1 Nyx — 18 archivos GLB (1.921.540 bytes ≈ 1,83 MB)

| Archivo | Bytes | Nodos | Joints (skin) | Mallas | Animaciones | Nombre de clip |
|---|---:|---:|---:|---:|---:|---|
| `nyx_rigged.glb` | 337.208 | 32 | 27 | 4 | 0 | — (`nyx_body`, `nyx_eyes`, `nyx_face`, `nyx_hair`) |
| `nyx_gravity_fall.glb` | 393.396 | 32 | 27 | 4 | 2 | `gravity_fall`, `gravity_fall_v2` |
| `nyx_zero_g_float.glb` | 109.456 | 28 | 27 | 0 | 1 | `Animation` |
| `nyx_float_fwd.glb` | 109.756 | 28 | 27 | 0 | 1 | `Animation` |
| `nyx_float_fwd_mir.glb` | 109.756 | 28 | 27 | 0 | 1 | `Animation` |
| `nyx_float_fwd_mid.glb` | 109.756 | 28 | 27 | 0 | 1 | `Animation` |
| `nyx_float_back.glb` | 109.756 | 28 | 27 | 0 | 1 | `Animation` |
| `nyx_walk_loop.glb` | 104.320 | 28 | 27 | 0 | 1 | `walk_loop` |
| `nyx_walk_end.glb` | 83.708 | 28 | 27 | 0 | 1 | `walk_end` |
| `nyx_walk_start.glb` | 82.624 | 28 | 27 | 0 | 1 | `walk_start` |
| `nyx_kick_flip_drill.glb` | 69.612 | 28 | 27 | 0 | 1 | `Animation` |
| `nyx_kick_flip.glb` | 54.424 | 28 | 27 | 0 | 1 | `Animation` |
| `nyx_gravity_kick.glb` | 52.240 | 28 | 27 | 0 | 1 | `Animation` |
| `nyx_spiral_drill_kick.glb` | 42.464 | 28 | 27 | 0 | 1 | `Animation` |
| `nyx_kinetic_squat.glb` | 41.376 | 28 | 27 | 0 | 1 | `Animation` |
| `nyx_run_end.glb` | 39.136 | 28 | 27 | 0 | 1 | `Animation` |
| `nyx_run_start.glb` | 38.328 | 28 | 27 | 0 | 1 | `Animation` |
| `nyx_run_loop.glb` | 34.224 | 28 | 27 | 0 | 1 | `Animation` |

Estructura del rig (leída del JSON del GLB de `nyx_rigged.glb`): 27 joints en el skin, 4 primitivas de malla, 0 animaciones, `asset.version 2.0`, `asset.generator "Khronos glTF Blender I/O v5.3.43"`.
El animador en TS declara **28 huesos** (`BONE_COUNT = 28` en `nyxAnimator.ts`; los 27 del skin + `halo_ring`, opcional) y **21 estados** (`NYX_ANIM_STATES`): `idle`, `run`, `jump_land`, `land_recover`, `zero_g_float`, `gravity_fall`, `air_dash`, `gravity_kick`, `kick_flip`, `kick_flip_drill`, `spiral_drill_kick`, `gravity_slide`, `counter_parry`, `wall_shift_flip`, `dome_bounce`, `kinetic_squat`, `victory_float`, `stasis_cast`, `stasis_throw`, `hit_stagger`, `eden_absorb`.

Índices de hueso (orden fijo, 3 floats por hueso): `hips 0`, `spine 1`, `chest 2`, `neck 3`, `head 4`,
`upperArm_L 5`, `forearm_L 6`, `hand_L 7`, `upperArm_R 8`, `forearm_R 9`, `hand_R 10`, `thigh_L 11`,
`shin_L 12`, `thigh_R 13`, `shin_R 14`, `hair_1..4 15..18`, `clavicle_L/R 19/20`, `foot_L 21`, `toe_L 22`,
`foot_R 23`, `toe_R 24`, `sleeve_L/R 25/26`, `halo_ring 27`.

### 6.2 Enemigos — 8 archivos GLB (`public/models/enemies/`, 2.147.656 bytes ≈ 2,05 MB)

| Archivo | Bytes | Nodos | Joints | Mallas | Anims | Clips incluidos |
|---|---:|---:|---:|---:|---:|---|
| `ground_golem.glb` | 507.444 | 13 | 9 | 3 | 10 | `golem_block_end`, `golem_block_loop`, `golem_block_start`, `golem_brute_punch`, `golem_exhausted_loop`, `golem_helicopter_loop`, `golem_hit`, `golem_parried_head_hit`, `golem_thick_spiral`, `golem_thin_spiral` |
| `kronos_leviathan.glb` | 415.104 | 55 | 20 | 28 | 5 | `kronos_swim_idle`, `kronos_rings_telegraph`, `kronos_tail_whip`, `kronos_portal_bite`, `kronos_supernova` |
| `crab_gunner.glb` | 354.468 | 16 | 12 | 3 | 10 | `crab_burst_shoot`, `crab_hit`, `crab_idle_breathe`, `crab_jump_air_loop`, `crab_jump_land`, `crab_jump_launch`, `crab_kamikaze_prime`, `crab_laser_charge`, `crab_laser_fire_loop`, `crab_scuttle_loop` |
| `giant_sparrow.glb` | 280.880 | 20 | 12 | 5 | 8 | `sparrow_chase_fly`, `sparrow_wild_flap`, `sparrow_hard_brake`, `sparrow_shriek`, `sparrow_air_ball`, `sparrow_air_drill`, `sparrow_crash_stun`, `sparrow_hit` |
| `prisma_necroz.glb` | 246.968 | 15 | 11 | 3 | 7 | `necroz_idle_fresh`, `necroz_idle_lazy`, `necroz_sloth_collapse`, `necroz_shield_build`, `necroz_defensive_spikes`, `necroz_summon_dome_spikes`, `necroz_hit` |
| `spiral_octopus.glb` | 138.136 | 18 | 15 | 2 | 7 | `octopus_idle_observe`, `octopus_pre_dash_ready`, `octopus_dash_propel`, `octopus_shoot_ball`, `octopus_giant_charge`, `octopus_counter_parry`, `octopus_hit` |
| `lightning_butterfly.glb` | 124.612 | 18 | 9 | 8 | 6 | `butterfly_dash_pivot`, `butterfly_electric_dash`, `butterfly_fast_flap`, `butterfly_hit`, `butterfly_lightning_beam`, `butterfly_shoot_ball` |
| `abyssal_cell.glb` | 80.044 | 7 | 4 | 2 | 8 | `cell_idle_float`, `cell_sneak_loop`, `cell_flee_loop`, `cell_windup`, `cell_lunge`, `cell_recover`, `cell_duplicate`, `cell_hit` |

Total de clips de enemigo: 61.

### 6.3 Arquetipos y stats de combate (`DOME_ENEMY_ARCHETYPES`)

| Arquetipo | HP | Radio | Grosor de carne | EXP | Élite | Boss | Puntos débiles |
|---|---:|---:|---:|---:|---|---|---:|
| `abyssal_cell` | 40 | 1.6 | 15 | 1.0 | no | no | 1 |
| `spiral_octopus` | 70 | 2.2 | 55 | 1.5 | no | no | 1 |
| `crab_gunner` | 60 | 1.8 | 35 | 1.25 | no | no | 1 |
| `ground_golem` | 140 | 3.2 | 80 | 2.0 | no | no | 1 |
| `lightning_butterfly` | 31 | 1.2 | 8 | 1.5 | no | no | 1 |
| `giant_sparrow` | 520 | 4.5 | 85 | 3.0 | **sí** | no | 2 |
| `prisma_necroz` | 300 | 3.8 | 65 | 3.0 | **sí** | no | 1 |
| `kronos_leviathan` | 4 (4 Estrellas Dorsales) | 3.2 | 90 | 10.0 | no | **sí** | 4 |

Ningún arquetipo tiene `evasive: true` en la tabla; la evasión vive en las FSM de comportamiento
(comentarios del archivo: el Pulpo la gobierna con su propio ciclo de 5,0 s; el dash evasivo genérico de 3 s no aplica).

### 6.4 Oleadas (`DomeWaveManager`)

- `CYCLE_LENGTH = 15`.
- Dentro de cada ciclo: oleada 5 → `giant_sparrow` (etiqueta `MINIBOSS`, `floorMode 'miniboss'`);
  oleada 10 → `prisma_necroz` (`MINIBOSS`); oleada 15 → `kronos_leviathan` (`BOSS`, `floorMode 'boss'`).
- Resto: `basic_mix` con `count = 4 + minibossesPassed`.
- `speedMult = 1 + cycle * 0.2` (solo con `difficultyScaling`).
- `minibossesPassed = cycle*2 + (inCycle > 10 ? 2 : inCycle > 5 ? 1 : 0)`; `bossesPassed = cycle`.
- Tras cada ciclo de boss, las oleadas de miniboss reciben `basic_mix` extra (`bossesPassed` enemigos).
- Grosor de tinta por oleada (`enemyInkScaleForWave`): `1 + 0.25 * floor((wave-1)/10)` → ×1 en 1–10, ×1.25 en 11–20, ×1.5 en 21–30…

### 6.5 Progresión: 7 habilidades activas y 3 pasivas

| id | Nombre | Rareza | Coste Edén | Cooldown | Niv. máx. | Acento |
|---|---|---|---:|---:|---:|---|
| `gravity_field` | Campo Gravitacional | base | 8 | 5 | 5 | `#7ae8dc` |
| `repulse_push` | Empuje | common | 12 | 7 | 5 | `#42bde8` |
| `eden_absorb` | Absorción de Edén | common | 0 | 6 | 3 | `#7dffa8` |
| `attraction_well` | Pozo de Atracción | common | 18 | 10 | 3 | `#42bde8` |
| `bounce_horizon` | Horizonte de Rebote | epic | 22 | 8 | 3 | `#df9fff` |
| `black_hole` | Agujero Negro | epic | 30 | 16 | 3 | `#df9fff` |
| `implosion` | Implosión | legendary | 45 | 25 | 1 | `#ffd992` |

Pasivas (`PASSIVE_IDS`): `speed_force`, `eden_regen`, `hp_regen`.
`ACTIVE_SKILL_IDS` en orden: `gravity_field`, `repulse_push`, `eden_absorb`, `attraction_well`, `bounce_horizon`, `black_hole`, `implosion`.

---

## 7. Iconos y audio

### 7.1 Iconos raster (`public/icons/skills/`, 7 archivos, 9.840 bytes totales)

| Archivo | Bytes |
|---|---:|
| `attraction_well.webp` | 1.408 |
| `black_hole.webp` | 1.862 |
| `bounce_horizon.webp` | 1.654 |
| `eden_absorb.webp` | 1.208 |
| `gravity_field.webp` | 1.458 |
| `implosion.webp` | 972 |
| `repulse_push.webp` | 1.278 |

Consumo verificado: `src/ui/DomeSkillSlotsHud.tsx:175` → `src={/icons/skills/${slot.skillId}.webp}`.
Existe además un segundo sistema de iconos **vectorial inline** en `src/ui/SkillIcon.tsx`
(SVG 72×72 con `currentColor`, un `case` por cada habilidad activa y pasiva); no usa los webp.

### 7.2 Audio (`public/audio/`)

| Archivo | Bytes | Duración (ffprobe) | Uso |
|---|---:|---:|---|
| `menu.mp3` | 3.705.098 | 173,55 s | Portada / menú |
| `wave-nocturnal.mp3` | 4.024.555 | 181,61 s | Oleadas A (`waveA`, título "Nocturnal") |
| `wave-singularity.mp3` | 3.614.503 | 173,40 s | Oleadas B (`waveB`, título "Singularity") |
| `boss.mp3` | 3.613.562 | 170,11 s | Jefe (`BOSS`) |
| `covers/cover.webp` | 637.644 | — | Portada MediaSession, 1254×1254 px, una sola para todo el OST |

Total `public/audio/`: 15.595.362 bytes (15,6 MB). Mapa `TRACK_SOURCES` en `MusicPlayer.ts:27-32`;
títulos publicados: `Menú`, `Nocturnal`, `Singularity`, `Boss`; álbum `OUTORBIT OST`, artista `OUTORBIT`.
Artwork con **URL absoluta** (`new URL('/audio/covers/cover.webp', window.location.origin).href`) para MPRIS.
Ningún archivo de efectos: los SFX son síntesis WebAudio (48 métodos `play*` en `SynthAudio.ts`).

### 7.3 Resumen de peso de `public/`

| Ruta | Bytes |
|---|---:|
| `public/models/*.glb` (18 GLB de Nyx, sin subcarpeta) | 1.921.540 |
| `public/models/enemies/*.glb` (8 GLB) | 2.147.656 |
| `public/models/` (total, verificado con `du -sb`) | 4.069.196 |
| `public/icons/skills/` (7 webp) | 9.840 |
| `public/audio/` (4 mp3 + portada) | 15.595.362 |
| `public/nyx-animator-bundle.js` | 291.410 |
| `public/character-sheet.html` | 46.536 |
| **Total `public/`** | **20.012.344 (≈ 19,1 MiB)** |

Los totales de la tabla salen de `stat -c '%s'` sumado por carpeta; `du -sb public/models` coincide exactamente
con 4.069.196 (1.921.540 + 2.147.656). `du -sb public` aislado devuelve 337.946 porque en la misma invocación
GNU `du` descuenta los directorios ya recorridos: 337.946 = 291.410 + 46.536, los dos archivos sueltos de `public/`.
Conteo de archivos en `public/`: **40**; en `dist/` (build servido): **22 MB** según `du -sh`.

---

## 8. Tutoriales

Existen **dos sistemas de tutorial distintos**, ambos en el repo.

### 8.1 Tarjetas tutoriales de la Cúpula (el sistema vivo) — 3 tarjetas

Componente: `src/ui/DomeTutorialCard.tsx` (766 líneas). Ids de `src/game/localStorageState.ts`
(`TutorialProgressId`): `tutorial_de_movimiento`, `tutorial_de_rebotes`, `tutorial_de_slow_mo`.

Comportamiento verificado del componente:

- `CONTINUE_LOCK_MS = 4000`: el botón Continuar está deshabilitado 4 s por tarjeta, con barra de progreso y contador `[Ns]`.
- Se descarta con `Space`, `Enter`, clic en el botón, o botón 0 (Cruz/A) del mando leído por `readConnectedGamepad()` en bucle `requestAnimationFrame`.
- Estructura visual: overlay a la derecha, dos marcos desplazados (ámbar + cian), artículo con trama halftone,
  pestaña `TUTORIAL` (clave `domeTutorial.badge`), número fantasma (`01`/`02`/`03`), diagrama SVG, cuerpo
  (`title`, `paragraph1`, `paragraph2`) y footer con `continueKey`/`continueAction`.
- Diagramas por tarjeta: (1) aro orbital + bloque WASD + tecla ESPACIO + ratón SVG con clic izquierdo carmesí
  (`#e11d48`) y derecho cian (`#22d3ee`); (2) mira heptagonal + estrella de 4 puntas cian y ratón con clic
  derecho destacado, más un `dtut-reticle-spotlight` pulsante centrado en pantalla; (3) reloj/esfera con arco
  de tiempo dilatado, badge `TIEMPO 0.2x`.
- Paleta del componente: papel `#f1f1ed`, tinta `#0b0d12`, cian `#22d3ee`/`#38bdf8`, ámbar `#fbbf24`, carmesí `#e11d48`.

Textos exactos (de `src/i18n/es.json`, bloque `domeTutorial`):

| id | number | title | paragraph1 | paragraph2 |
|---|---|---|---|---|
| `tutorial_de_movimiento` | 01 | MOVIMIENTO | "Muévete con WASD en un entorno de gravedad 0 frenético donde puedes alcanzar velocidades altísimas, y frena usando ESPACIO." | "Además, puedes ejecutar dashes en cualquier dirección con CLIC DERECHO, y con CLIC IZQUIERDO ataques a enemigos con auto-aim, o caídas al vacío para ganar gran velocidad si no apuntas a ningún enemigo." |
| `tutorial_de_rebotes` | 02 | REBOTES CINÉTICOS | "Cuando vas a la suficiente velocidad y apuntas a un suelo flotante o a su iceberg, la mira se pone azul." | "Pulsa CLIC DERECHO para rebotar contra la superficie y encadenar impulso, permitiéndote ganar muchísima velocidad." |
| `tutorial_de_slow_mo` | 03 | SLOW-MO | "En el juego, ciertos ataques, parrys, esquives o movimientos especiales activan el modo slow-mo." | "Aprovecha esta ventana de cámara lenta para redirigir tu trayectoria con un dash o preparar el siguiente golpe." |

Chips/etiquetas adicionales: `wasdLabel: WASD`, `spaceLabel: ESPACIO`, `dashLabel: CLIC DERECHO`,
`attackLabel: CLIC IZQUIERDO`, `legendMove: MOVER 0G`, `legendBrake: FRENAR`, `legendAttack: ATAQUE / CAÍDA`,
`legendDash: DASH`, `reticleLabel: MIRA AZUL`, `legendReticle: VELOCIDAD LISTA`, `legendBounce: REBOTAR`,
`badgeTime: TIEMPO 0.2x`, `chipParry: PARRY`, `chipDodge: ESQUIVE`, `chipSpecial: MOV. ESPECIALES`.

Disparadores (en `DomeGameView.tsx`):

| Tarjeta | Condición de apertura | Línea |
|---|---|---|
| `tutorial_de_movimiento` | Estado inicial: si `!completed` al montar la vista (y no es Entrenamiento). No se abre en modo training | 113-118 |
| `tutorial_de_rebotes` | Primera vez que `hud.kineticBounceState === 'available'`, sin otro tutorial/pausa/level-up/report abierto | 281-308 |
| `tutorial_de_slow_mo` | Primera vez que `hud.bulletTimeActive === true`, con las mismas guardas | 312-337 |

Al abrirse se libera el pointer lock (`document.exitPointerLock?.()`); al cerrarse se marca
`setTutorialCompleted(id, true)` en `outorbit_tutorial`, se limpia el estado y se vuelve a pedir pointer lock.
En Ajustes existe el toggle "Omitir tutoriales" (`settings.skipTutorials`) que llama a `setAllTutorialsCompleted(checked)`.

### 8.2 Mini-niveles de tutorial del motor legado — 5 specs

`src/game/levels/tutorialDefinitions.ts` (1.168 líneas). `TutorialId`:
`tut-movement`, `tut-stasis`, `tut-stealth`, `tut-squad`, `tut-gravity`. Cada `TutorialSpec` incluye
`id`, `order`, `title`, `badge`, `summary`, `recommendedCharacter`, `lessonSteps[]`, `goalMode`
(`'generators'` \| `'reach_target_planet'`), `targetPlanetId?` y su propia `GalaxySpec` mínima (1–2 planetas).

| id | title | badge | Personaje recomendado | goalMode | lessonSteps |
|---|---|---|---|---|---|
| `tut-movement` | 1 · Parkour, Combate y Parry | MOVIMIENTO | `kitsune` | `generators` | 3 pasos (flores gigantes → torreta/parry [F] → generador del fuerte) |
| `tut-stasis` | 2 · Estasis, Fijado y Explosivos | ESTASIS | `kitsune` | `generators` | 3 pasos ([R/C] capturar → [Q] fijar → lanzar con clic izq.) |
| `tut-stealth` | 3 · Sigilo, Modo Advertencia y Disfraces | SIGILO | `kitsune` | `generators` | 3 pasos (hierba pública → patio restringido en ámbar → [E] noquear y tarjeta) |
| `tut-squad` | 4 · Digger y Axel: Subsuelo, Agua y Flores | ESCUADRÓN | `digger` | `generators` | 3 pasos ([2]+[SHIFT] excavar → palanca/compuerta → [3] Axel 2.35x y planear) |
| `tut-gravity` | 5 · Gravity Shift y Salto Interplanetario | GRAVEDAD | `axel` | `reach_target_planet` (`GRAVITY_DESTINATION.id`) | 3 pasos (clic derecho slow-mo → soltar para surfear → aterrizar o destruir baliza) |

Helpers internos del archivo (verificados): `BaseFrame` con proyección gnomónica en metros, `baseFrame()`,
`frameDir()`, `tangentTo()`, y un constructor de galaxia por tutorial (`movementGalaxy()`, `stasisGalaxy()`,
`stealthGalaxy()`, `squadGalaxy()`, `gravityGalaxy()`). `getTutorialSpec(id)` lanza
`Tutorial desconocido: "<id>"` si el id no existe.

Claves i18n asociadas (bloque `tutorials`): `title: TUTORIALES`,
`subtitle: "Una mecánica por nivel · 5 lecciones jugables"`, `play: "JUGAR TUTORIAL"`.

---

## 9. Flujo de pantallas de la aplicación

### 9.1 Punto de entrada

`src/main.jsx` (10 líneas):

```jsx
ReactDOM.createRoot(document.getElementById('root')).render(
  <LanguageProvider>
    <App />
  </LanguageProvider>,
);
```

`src/App.tsx` (170 líneas) mantiene: `screen: 'title' | 'game'`, `activeTutorialId: TutorialId | null`,
`trainingMode: boolean`, `runKey: number`, `hud: HudSnapshot | null`, `settings: GameSettings`.

### 9.2 Ramas de render (en orden de evaluación)

| Condición | Qué se monta |
|---|---|
| `screen === 'title'` | `<TitleScreen>` (diorama 3D + menú + selector de idioma) |
| `activeTutorialId !== null` | `<canvas>` + `new GameEngine(...)` instanciado en un efecto + `<GameHUD>` + (`phase === 'victory' && !tutorialId` → `<BattleReportScreen>`) |
| resto | `<DomeGameView settings onUpdateSettings onExit trainingMode>` |

`<MobileBlocker />` se renderiza siempre por encima (`fixed inset-0 z-[100]`, se activa si
`matchMedia('(pointer: coarse)')` o `innerWidth < 768`).

### 9.3 Portada (`TitleScreen.tsx`, 228 líneas)

- Diorama de gravedad cero (`TitleDioramaSandbox`, 483 líneas) con `nyx_rigged.glb` y el shader de divisor de `menuShaders.ts`.
- Botones `FluidInkButton` con paleta `MENU_STOPS = ['#e11d48','#7c3aed','#22d3ee']`:
  `menu.play` ("JUGAR"), `menu.training` ("Entrenamiento", solo si `onPlayTraining`), `menu.controls` ("Ajustes"), `menu.leaderboard` ("Leaderboard"). Tagline de cabecera: `menu.tagline` = "ZERO-G ROGUELIKE".
- Selector de idioma abajo a la izquierda con tres botones: `ESPAÑOL` / `ENGLISH` / `日本語`
  (`menu.languageEs`/`languageEn`/`languageJa`, `setLanguage('es' | 'en' | 'ja')`; el activo se resalta en `#0e7490`).
- Navegación con mando: `useGamepadListNav(actions.length, { enabled: modal === null, onConfirm })`.
- Modales: `SettingsScreen` y `LeaderboardModal` (`MenuModal = 'settings' | 'leaderboard' | null`).
- Música: `musicPlayer.play('menu')` al montar; volumen `masterVolume * musicVolume`.

### 9.4 Partida de la Cúpula (`DomeGameView.tsx`, 480 líneas)

Estado React: `runSeed`, `hud` (`DomeHudState`, con `INITIAL_HUD` de HP/Edén 100 y `drillThreshold 14.5`),
`levelUpState`, `battleReport`, `isPauseOpen`, `settingsOpen`, `activeTutorial`, `debugPanelOpen`,
`trainingArchetype` (por defecto `'abyssal_cell'`), `trainingPassive`, `trainingPassiveLevels`
(`speed_force`/`eden_regen`/`hp_regen` a 0).

Componentes montados: `DomeHudSketch` (HUD), `DomeYinYangHud`, `DomeSkillSlotsHud`, `DomeDarkMatterRings`,
`DomeLevelUpSequence`, `DomePauseModal`, `SettingsScreen`, `DomeTrainingPanel` (solo training),
`DomeTutorialCard`, `DomeBattleReport`. El runtime 3D vive en `startDomeGameLoop()`
(`domeGameLoop.ts`): `requestAnimationFrame` propio (línea 958/1459) y `setHud` limitado a
`1/30 s` (`hudTimer >= 1/30`, líneas 1304-1306).

Controles del runtime verificados en `domeGameLoop.ts`: pointer lock al clic en el lienzo, `pointerlockchange`
abre pausa si ESC fue consumido por el navegador, desbloqueo de audio en cualquier `pointerdown`/`keydown`,
`F2`/`Tab` alternan el panel debug en training, `T` recarga Vida+Edén en training, `Tab` se usa como radar
fuera de training.

### 9.5 Modos

| Modo | Entrada | Comportamiento |
|---|---|---|
| JUGAR | `handlePlay()` en `App.tsx` | `activeTutorialId = null`, `trainingMode = false`, `runKey++` |
| ENTRENAMIENTO [DEBUG] | `handlePlayTraining()` | Nyx inmortal, Edén +25/s, sin oleadas automáticas, un enemigo intercambiable, panel F2/Tab |
| Tutorial de campaña | `handleNextTutorial()` (rama legada) | Avanza `TUTORIAL_SPECS`, `runKey++` |

`runKey` remonta el motor desde cero en cada reintento/cambio.

---

## 10. i18n

- 3 diccionarios en `src/i18n/`: `es.json` (13.662 B), `en.json` (12.848 B), `ja.json` (15.654 B).
- **251 claves hoja** y **15 secciones** en cada uno (paridad exacta medida con recorrido recursivo de los JSON).
- `src/i18n/index.ts` (170 líneas): `LanguageProvider`, `useI18n()` → `{ language, setLanguage, toggleLanguage, t }`.
  - `t(key, params)` resuelve rutas con puntos, interpola `{{param}}` con `/\{\{(\w+)\}\}/g`.
  - Fallback: diccionario activo → `en.json` → `es.json` → la propia clave.
  - `toggleLanguage()` cicla `es → en → ja → es`.
  - Contexto por defecto (sin provider): `language: 'en'`.
  - Persiste en `outorbit_language` y en `GameSettings.language`.
  - Exporta `waveLabelKey(label)` (`BÁSICOS`/`MINIBOSS`/`BOSS` → claves `enemies.wave*`),
    `SKILL_I18N_KEYS` (10 ids) y `ENEMY_I18N_KEYS` (8 arquetipos).

---

## 11. Audio en runtime

- Música: `MusicPlayer` singleton (`musicPlayer`), tipo `MusicTrackId = 'menu' | 'waveA' | 'waveB' | 'boss'`.
- Comportamiento (cabecera del módulo): cada pista suena completa sin loop; al terminar, silencio aleatorio de 3-6 s;
  siguiente = la pedida en cola o rotación natural (`NATURAL_NEXT`); el jefe interrumpe siempre con fundido ~1 s y al
  terminar vuelve la de básicos; si el autoplay se bloquea, reintenta en el primer `pointerdown`/`keydown`.
- Un único `<audio>` oculto en `document.body` que cambia de `src` (necesario para MPRIS en Firefox/Linux);
  publica `MediaMetadata` y `setPositionState`.
- SFX: `SynthAudio` (1.303 líneas) con `AudioContext` propio, `master` gain, buffer de ruido, `pinkBuffer`,
  viento (`windSource`, `windFilter`, `windResonance`, `windGain`) y motor gravitatorio (`gravityOsc1/2`, `gravityGain`),
  `levelUpEcho` (DelayNode). 48 métodos `play*` (entre ellos `playRepulsePush`, `playEdenAbsorb`, `playAttractionWell`,
  `playBounceHorizon`, `playBlackHoleCast`, `playImplosion`, `playKineticImpact`, `playVoidFall`).

---

## 12. Entorno de ejecución y dependencias implícitas

- `@/` → `/src/` inyectado por `@base44/vite-plugin` (no por `vite.config.js`).
- Three.js se importa como `three` y addons desde `three/examples/jsm/...` (`GLTFLoader`, `SkeletonUtils`).
- `GLTFLoader` es la única vía de carga de modelos; no hay `DRACOLoader` ni `KTX2Loader` configurados.
- Render: `new THREE.WebGLRenderer({ canvas, antialias: true })` en `src/ui/domeGameLoop.ts:129` (no en React);
  el HUD yin-yang abre su **propio** contexto `canvas.getContext('webgl', { alpha: true, antialias: true })`
  (`DomeYinYangHud.tsx:324`) con vertex/fragment shader inline, lienzo lógico 420×200 y 96 marcas de EXP.
- `navigator.mediaSession` y `document.pointerLockElement` son requisitos funcionales, no opcionales.
- `public/models`, `public/icons`, `public/audio` se sirven desde la raíz (`/models/...`, `/icons/...`, `/audio/...`).

---

## 13. Métricas de código

| Métrica | Valor |
|---|---:|
| Archivos en `src/` (cualquier extensión) | 128 → 81 `.ts`, 20 `.tsx`, 18 `.jsx`, 5 `.js`, 3 `.json`, 1 `.css` |
| Líneas en `src/` (sin contar los 3 `.json` de i18n) | 70.220 |
| Líneas en `src/game/dome/` | 26.160 |
| Líneas en `src/game/render/` | 13.517 |
| Líneas en `src/ui/` | 11.822 |
| Archivo más grande | `src/game/dome/DomeWaveManager.ts` (5.060) |
| Segundo más grande | `src/game/dome/NyxDomeController.ts` (4.298) |
| Archivos en `public/` | 40 |
| Bloques `/* glsl */` | 60 (en 10 archivos) |
| Estados de animación de Nyx | 21 |
| Huesos del animador / joints del GLB | 28 / 27 |
| Clips de enemigo (GLB) | 61 |
| Claves i18n por idioma | 251 (15 secciones) |

---

## 14. Discrepancias verificadas entre documentación y código

Todo lo siguiente se comprobó directamente contra el árbol de trabajo:

1. `ARCHITECTURE.md` describe `src/game/levels/levelDefinitions.ts` (`GALAXY_PLANETS`) y una campaña de 5 planetas.
   **Ese archivo no existe**: `src/game/levels/` solo contiene `tutorialDefinitions.ts`. `ARCHITECTURE.md` también
   omite por completo `src/game/dome/`, que es donde vive el juego.
2. `README.md` da recuentos de líneas desactualizados: `DomeWaveManager` 4.660 (real 5.060),
   `NyxDomeController` 4.284 (real 4.298), `DomeSkills` 1.836 (real 2.039), `SynthAudio` 1.185 (real 1.303),
   `domeGameLoop` 1.415 (real 1.497), `DomeCombatSystem` 455 (real 459), `DomeEnemyModels` 1.130 (real 1.310).
3. `README.md` indica 250 claves i18n; el recuento real es **251** hojas por idioma (15 secciones).
4. `README.md` indica ~292 KB para el bundle del animador; son **291.410 bytes** (285 KiB).
5. El comentario de cabecera de `src/game/render/domeArenaScene.ts` habla de "Cúpula de cristal de 50 m",
   pero la constante del archivo es `DOME_RADIUS = 90`, coherente con `DOME_ARENA_RADIUS = 90` de `domeTypes.ts`.
6. El `generator` de todos los GLB es `"Khronos glTF Blender I/O v5.3.43"`, mientras `build_nyx_rigged.mjs:1178`
   se declara a sí mismo como generador (`generator: 'build_nyx_rigged.mjs'`): los GLB commiteados fueron
   exportados con Blender, no generados literalmente por el script actual.
7. `character-sheet.html` fija three **0.170.0** por importmap, mientras el juego compila con **0.187.0**.
8. `index.html` declara `lang="es"` de forma fija, mientras el idioma por defecto de la UI es `en`
   (`DEFAULT_SETTINGS.language = 'en'`).
9. `INITIAL_HUD` de `DomeGameView.tsx` usa `drillThreshold: 14.5` como valor de arranque, pero el umbral real
   del controlador es `DRILL_SPEED_THRESHOLD = 18.0` (`NyxDomeController.ts:182`), que es el que se emite en
   cada `HudSnapshot` (`NyxDomeController.ts:1290`).
10. `lucide-react`, `base44` (CLI) y todo `src/pages` + `src/components` + `src/lib/auth*` existen pero no
    participan en la aplicación montada (`App.tsx` solo renderiza `TitleScreen`, `DomeGameView`, `MobileBlocker`
    y, en la rama inalcanzable, `GameEngine`/`GameHUD`/`BattleReportScreen`).

---

## 8. Estilo Visual, Paletas, Tipografía y Usabilidad (UI/UX) de Todas las Pantallas

# 08 — Estilo visual, UI/UX, tipografía, paleta, animaciones y flujos de pantalla

Extracción técnica del código real de OUTORBIT. Cada dato de este documento proviene de la
lectura directa del archivo citado y fue contrastado en una segunda pasada con `grep`/conteo de
literales sobre el mismo archivo. No hay valores estimados, ni propuestas de diseño.

Rutas relativas a la raíz del repo `/home/pakura/Proyectos/OUTORBIT`.

---

## 1. Alcance y método de verificación

| Archivo | Líneas | Uso en este documento |
|---|---|---|
| `public/character-sheet.html` | 1522 | Hoja de personaje standalone: CSS, visor 3D, controles |
| `src/ui/DomePauseModal.tsx` | 289 | Menú de pausa |
| `src/ui/DomeBattleReport.tsx` | 1026 | Game Over / informe de la Cúpula (papel+tinta) |
| `src/ui/BattleReportScreen.tsx` | 353 | Informe de la campaña/tutoriales (oscuro, violeta) |
| `src/ui/SettingsScreen.tsx` | 875 | Ajustes con 3 pestañas |
| `src/ui/DomeLevelUpSequence.tsx` | 1504 | Subida de nivel: planeta 3D + cartas + iris |
| `src/ui/DomeSkillSlotsHud.tsx` | 246 | 3 ranuras circulares de habilidad |
| `src/ui/MenuModalShell.tsx` | 69 | Marco de modales de portada |
| `src/ui/FluidInkButton.tsx` | 379 | Botón de tinta líquida (SVG animado) |
| `src/ui/TitleScreen.tsx` | 228 | Portada |
| `src/ui/LeaderboardModal.tsx` | 128 | Ranking Top 15 |
| `src/ui/DomeTrainingPanel.tsx` | 294 | Panel debug del modo entrenamiento |
| `src/ui/DomeTutorialCard.tsx` | 766 | Tarjeta cómic de tutorial |
| `src/ui/MobileBlocker.tsx` | 44 | Bloqueo en móvil/táctil |
| `src/ui/SkillIcon.tsx` | 441 | Iconos SVG de habilidad (72×72) |
| `src/ui/DomeGameView.tsx` (parcial) | 480 | Montaje y orden de capas de todos los overlays |
| `src/ui/domeGameLoop.ts` (parcial) | 1497 | Disparadores de pausa, panel debug, pausa lógica |
| `src/game/input/gamepadMenuNav.ts` | 149 | Navegación de menús con mando |
| `src/game/dome/DomeProgression.ts` (parcial) | — | Rarezas, colores de acento, nº de cartas |
| `src/game/settings.ts` (parcial) | — | Límites y defaults de ajustes |
| `src/game/render/menuShaders.ts` (parcial) | — | Shader del *blade* de papel de la portada |
| `src/i18n/es.json` | 297 | Copias exactas de los textos |
| `index.html`, `src/index.css`, `tailwind.config.js` | — | Tokens globales y fuentes cargadas |

Segunda pasada: conteo de literales hex por archivo (`#f1f1ed`, `#fbfbf8`, `#0b0d12`, `#e11d48`,
`#22d3ee`, `#fbbf24`, `#2a2f3d`), `grep` de `z-index`, `@keyframes`, `-webkit-text-stroke`,
`box-shadow`, atajos de teclado y claves i18n. Se verificó además qué clases declaradas en CSS **no**
se usan en el markup y qué claves de diccionario no se referencian en `src/`.

---

## 2. Sistema de diseño global (lo que comparten todas las pantallas del juego)

### 2.1 Paleta canónica

Se repite literalmente en `DomePauseModal`, `DomeBattleReport`, `DomeLevelUpSequence`,
`SettingsScreen`, `DomeTutorialCard`, `TitleScreen`, `FluidInkButton` y `public/character-sheet.html`.

| Rol | Hex | Uso |
|---|---|---|
| Papel | `#f1f1ed` | Fondo de pausa, ajustes, subida de nivel, informe, tutorial, núcleo de botones de tinta |
| Papel de panel | `#fbfbf8` | Superficie de paneles, tarjetas y botones sobre el papel |
| Tinta | `#0b0d12` | Texto, bordes, chips invertidos, sombras duras |
| Tinta suave | `#2a2f3d` | Texto secundario / descripciones |
| Carmesí | `#e11d48` | Acento primario: sellos, filos, slashes, "reiniciar" |
| Cian | `#22d3ee` | Acento de foco/acción primaria, iconos, valores |
| Dorado | `#fbbf24` | Acento de ranking/dorado, rarezas, "ajustes" en pausa |
| Violeta menú | `#7c3aed` | Parada media del degradado de los botones de portada |

Fondos oscuros (modales/portada): `#05010f` (portada y overlay de modales), `#0b0618` (bloqueo
móvil), `#0d0a1f` (panel de `MenuModalShell`), `#160b2e` (panel de `BattleReportScreen`),
`#1a1033` (tarjeta de `MobileBlocker`), `#090314` / `#040510` (HUD y vista de la Cúpula),
`#0b0b14` (borde del panel de `MenuModalShell`).

Acentos secundarios usados en barras de estilo de `BattleReportScreen`: `#34d399` (sigilo),
`#f87171` (agresión), `#67e8f9` (aéreo), `#facc15` (subsuelo), `#a78bfa` (estasis).

Acentos de habilidad (`src/game/dome/DomeProgression.ts`): `gravity_field` `#7ae8dc`,
`repulse_push` `#42bde8`, `eden_absorb` `#7dffa8`, `attraction_well` `#42bde8`,
`bounce_horizon` `#df9fff`, `black_hole` `#df9fff`, `implosion` `#ffd992`; pasivas
`speed_force` `#ffd992`, `eden_regen` `#df9fff`, `hp_regen` `#7dffa8`.

### 2.2 Tipografías

`index.html` carga desde Google Fonts:

```
Barlow+Condensed:ital,wght@0,700;0,800;1,800
Noto+Sans+JP:wght@500;700;900
```

Uso real en el código:

| Contexto | Stack |
|---|---|
| Pantallas de papel (pausa, ajustes, informe, subida de nivel) | `"Helvetica Neue", Helvetica, Arial, "Noto Sans JP", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif` |
| Chips, etiquetas, claves, valores numéricos | `ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace` |
| Hoja de personaje (`--sans` / `--mono`) | `"Helvetica Neue", Helvetica, Arial, sans-serif` / `ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace` |
| Tarjeta de tutorial (microtextos) | `ui-monospace, "SF Mono", Menlo, monospace` |
| HUD Yin-Yang (`HUD_FONT`, `DomeYinYangHud.tsx:30`) | `'Barlow Condensed', 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Meiryo', 'Arial Narrow', 'Helvetica Neue', sans-serif` |

Conclusión verificada: `Barlow Condensed` solo se referencia en el HUD (`DomeYinYangHud.tsx`); el
resto de la UI de papel usa Helvetica Neue como primera familia y deja `Noto Sans JP` para los
glifos japoneses. `src/index.css` no define familias propias: solo variables HSL de shadcn y
`body { @apply bg-background text-foreground antialiased }`.

### 2.3 Patrones visuales recurrentes

- **Rejilla de papel**: `background-image` con dos `linear-gradient` de 1px, color
  `rgba(11,13,18,0.06)`, `background-size: 96px 96px`. Presente en pausa, ajustes, subida de nivel,
  informe y hoja de personaje (esta última a 96px + retícula fina de 16px).
- **Líneas de velocidad**: `repeating-conic-gradient(from 0deg at 50% X%, transparent 0deg 5.2deg,
  rgba(11,13,18,0.05) 5.2deg 5.9deg)` con `mask-image: radial-gradient(circle at 50% X%, ...)`.
  El centro y la opacidad cambian por pantalla (pausa `42%`/`0.05`, ajustes `30%`/`0.045`,
  subida de nivel `46%`/`0.05`, informe `24%`/`0.05`).
- **Estallido halftone**: `radial-gradient(<color> 2.2–2.4px, transparent 2.4–2.6px)` con rejilla
  de 14–15px y máscara radial. En pausa tinta `rgba(11,13,18,0.13)`; en el informe carmesí
  `rgba(225,29,72,0.16)`; en subida de nivel tinta `rgba(11,13,18,0.16)`.
- **Sombras duras** (sin blur), múltiplos del acento: `3px 3px`, `4px 4px`, `5px 5px`, `6px 6px`,
  `7px 7px`, `8px 8px`, `9px 9px`, `10px 10px`, `12px 12px`, `14px 14px 0`.
- **Sesgo**: contenedores y chips con `transform: skewX(-5deg / -6deg / -8deg / -9deg / -12deg)` y
  el contenido interior con el sesgo inverso (`skewX(5/6/8/9/12deg)`).
- **Botones**: fondo papel de panel, borde 2–3px de tinta, sombra dura del acento, hover que
  traslada `-2px`/`-12px` y engorda la sombra, `:active` que la reduce. Nunca hay `border-radius`
  en los botones de papel (sí `rounded-*` en los modales oscuros de portada/campaña).
- **Títulos**: itálicos, `font-weight: 900`, `letter-spacing` negativo, y la firma
  `color: transparent` + `-webkit-text-stroke` (3px, 3.5px o 4px de `#0b0d12`) + `text-shadow`
  dura carmesí translúcida.
- **Globos de texto**: microcopy en mono, mayúsculas, `letter-spacing` 0.1–0.36em.

### 2.4 Mapa de capas (z-index) verificado

| Capa | z-index | Fuente |
|---|---|---|
| Modales de portada (`MenuModalShell`) | `z-40` | `MenuModalShell.tsx:35` |
| Tarjeta de tutorial | `45` | `DomeTutorialCard.tsx:398` |
| Carta de subida de nivel en vuelo | `45` | `DomeLevelUpSequence.tsx:1333` |
| Menú de pausa | `50` | `DomePauseModal.tsx:138` |
| Subida de nivel (raíz) | `50` | `DomeLevelUpSequence.tsx:988` |
| Informe de la Cúpula | `50` | `DomeBattleReport.tsx:485` |
| Informe de campaña | `z-50` (Tailwind) | `BattleReportScreen.tsx:125` |
| Ajustes | `60` | `SettingsScreen.tsx:551` |
| Panel de entrenamiento | `z-[60]` | `DomeTrainingPanel.tsx:133` |
| Flash blanco de subida de nivel | `60` | `DomeLevelUpSequence.tsx:1447` |
| Iris (aro / punto) | `65` / `66` | `DomeLevelUpSequence.tsx:1472,1490` |
| Bloqueo móvil | `z-[100]` | `MobileBlocker.tsx:30` |

### 2.5 Localización y textos

Toda la UI de juego usa `useI18n()` y las claves de `src/i18n/es.json` (`menu`, `pause`, `settings`,
`controls`, `battleReport`, `levelUp`, `leaderboard`, `mobile`, `trainingPanel`, `domeTutorial`,
`skills`, `skillDescriptions`). Excepciones verificadas con texto fijo en español:

- `MenuModalShell.tsx:59` — botón `CERRAR` (literal, no clave i18n).
- `SettingsScreen.tsx:135` — el chip del interruptor muestra `ON` / `OFF` (literal en inglés).
- `SettingsScreen.tsx` — chips de idioma `ES`, `EN`, `JA` (literales).
- `BattleReportScreen.tsx` — todos los textos fijos en español (pantalla no traducida).

---

## 3. `public/character-sheet.html` — Hoja de personaje (página standalone)

Documento HTML independiente (Three.js vía `importmap` a `unpkg.com/three@0.170.0`, sin React).
Título de pestaña: `OUTORBIT // CHARACTER SHEET: NYX`. Carga el modelo `/models/nyx_rigged.glb` y,
si está disponible, `/nyx-animator-bundle.js` (si falla, oculta el bloque de animaciones y avisa por
`console.warn`).

### 3.1 Identidad visual

Variables CSS (`:root`):

```
--ink: #0b0d12; --ink-soft: #2a2f3d; --paper: #f1f1ed; --panel: #fbfbf8;
--grid: rgba(11,13,18,0.065); --grid-fine: rgba(11,13,18,0.03);
--crimson: #e11d48; --cyan: #22d3ee; --gold: #fbbf24;
```

Fondo del `body`: papel `#f1f1ed` con **cuatro** gradientes de rejilla (96px gruesa + 16px fina).
Contenedor `.sheet` con `max-width: 1640px`, `padding: 22px 24px 34px`.

Cabecera:

- `.hdr__top`: flex con borde inferior `2px solid var(--ink)`; dos etiquetas `.tag` (fondo tinta,
  texto blanco, mono 800 10px, `letter-spacing .16em`, `transform: skewX(-9deg)`) y
  `.tag--ghost` (sin fondo, borde 1px). Texto real: `OUTORBIT`, `CHARACTER SHEET` y metadatos
  `FILE 02 · NYX_RIGGED.GLB · 27 BONES`.
- `.hdr__title`: `clamp(24px, 3.5vw, 50px)`, peso 900, `letter-spacing -0.035em`, `line-height .94`,
  mayúsculas. El bloque `OUTORBIT` va dentro de `.hdr__bar` (fondo tinta, `skewX(-9deg)`, texto
  blanco en un `span` con el sesgo inverso). Separador `.hdr__slash` en carmesí.
- `.hdr__sub`: borde izquierdo `4px solid var(--crimson)`, mono 700 11px, `letter-spacing .13em`,
  mayúsculas. Texto: `GRAVITY ROGUELITE PROTAGONIST · UNIVERSE SHADER + HAIR & SLEEVE PHYSICS (27 BONES)`.
- `.hdr__controls`: barra `background: rgba(255,255,255,0.55)`, borde 1px de tinta, `padding
  12px 14px`, `gap: 22px`, con cuatro grupos `.ctrl` etiquetados `PALETA / UNIVERSO`, `POSE`,
  `ANIMACIÓN (NyxAnimator · 20)` y `RENDER`.

### 3.2 Controles (todos operables con ratón; `aria-pressed` en cada toggle)

| Grupo | Controles |
|---|---|
| Paleta | Botones `.pal` generados por JS desde `PALETTES`; activo `background: var(--ink)`, texto blanco y `box-shadow: 3px 3px 0 var(--crimson)`; hover `translateY(-1px)`; 4 chips de color (9×14px) por botón |
| Pose | `A-POSE`, `GRAVITY FLOAT` (activa por defecto), `T-POSE` |
| Animación | `◀`, `<select>` con 20 estados, `▶`, `DASH ➜ +X` (alterna a `-X`), `AUTO-REPETIR` (activo por defecto); además se inyectan botones por cada estado de `NYX_ANIM_STATES` antes del botón de dash |
| Render | `HALFTONES`, `TINTA BLANCA`, `FÍSICAS PELO` (los tres activos) |

`.toggle` es un botón con borde 1px de tinta, mono 800 10px, `letter-spacing .1em`, y un cuadrado
de 8px dibujado con `::before`. Estado `.is-on`: fondo tinta, texto blanco y el cuadrado en cian.
Transición: `background 120ms ease, color 120ms ease`.

Lista exacta de animaciones del `<select>` (20): `idle`, `run`, `jump_land`, `land_recover`,
`zero_g_float`, `gravity_fall`, `air_dash`, `gravity_kick`, `kick_flip`, `kick_flip_drill`,
`spiral_drill_kick`, `gravity_slide`, `counter_parry`, `wall_shift_flip`, `dome_bounce`,
`victory_float`, `stasis_cast`, `stasis_throw`, `hit_stagger`, `eden_absorb`.

Comportamiento: elegir una animación marca `state.pose = 'anim'`, desmarca las poses clásicas y
marca el botón correspondiente; elegir una pose clásica desmarca los botones de animación. Con
`AUTO-REPETIR` activo, al terminar una animación se espera 0.9 s y se relanza (si
`getStateTime() > 1.6`).

### 3.3 Layout y visor 3D

- `.views` ocupa `height: clamp(540px, 74vh, 840px)`; dentro hay un único `<canvas id="gl">`
  posicionado en absoluto `inset: 0` con `pointer-events: none; z-index: 1` y **un** panel
  `article.panel.panel--dynamic[data-view="dynamic"]`.
- El panel pinta papel `#fbfbf8` con rejilla de 22px, un `::before` con degradado radial blanco
  (centro 50% 44%) y un `::after` con borde de 1px (2px carmesí cuando el panel es `--dynamic`).
- Etiqueta flotante: `01` + `NYX · GRAVITY VIEWPORT`; pista en la esquina inferior derecha
  `DRAG · ORBIT · SCROLL ZOOM` (fondo tinta, mono 800 9px).
- Un solo `WebGLRenderer` (`antialias`, `alpha`, `powerPreference: 'high-performance'`) que
  renderiza por regiones con `setViewport`/`setScissor`; `FOV = 30` y `devicePixelRatio` limitado
  a 2. `OrbitControls` sobre el propio panel: `enableDamping`, `dampingFactor 0.075`,
  `enablePan false`, distancia entre `0.55×` y `1.9×` del encuadre, ángulos polares entre `0.25` y
  `π-0.25`.
- El pivote del modelo respira: `bob = sin(t*1.15)*0.045` y rotación
  `(0.06 + sin(t*0.8)*0.03, -0.32 + sin(t*0.45)*0.12, -0.14 + sin(t*0.6)*0.04)`.
- Estados de carga: `#overlay` centrado, `rgba(241,241,237,0.86)`, mono 800 11px,
  `letter-spacing .16em`, texto `CARGANDO NYX_RIGGED.GLB…`; en error añade `.overlay--error`
  (texto carmesí) con `NO SE PUDO CARGAR /models/nyx_rigged.glb — <mensaje>`.
- Responsive: `max-width: 1080px` reduce la altura a `clamp(460px, 58vh, 640px)`; `max-width: 640px`
  usa `padding: 14px 12px 24px` y una rejilla de 4 filas de 900px (herencia de la versión de 4 vistas).

### 3.4 Materiales y shaders (identidad cósmica/cel)

- `THREE.ColorManagement.enabled = false` para que los hex lleguen a pantalla idénticos a los
  swatches CSS.
- **Cel-shading** de 3 bandas (`litColor = base*1.12`, `midColor = mix(base, shadow, 0.28)`,
  `darkColor = mix(base, shadow, 0.62)`) con umbrales `NdotL < 0.12` y `< 0.48`, trama halftone
  (ángulo 30°, escala 6.5) en la zona `-0.25 < NdotL < 0.34`, y rim light Fresnel
  (`rimColor 0x7dd3fc`, `rimPower 3.2`, `rimStrength 0.55`, sombra `0x161b33`).
- **Shader de universo** para cuerpo/pelo/rostro (`uOpacity 0.90`): FBM de 4 octavas en
  screen-space (`uv = gl_FragCoord.xy * 0.0042`), dos capas de estrellas con parpadeo, deriva
  `(t*0.045, -t*0.03)` y borde Fresnel `pow(..., 2.6) * 0.65`.
- **Contorno de tinta** (Inverted Hull `BackSide` con soporte `SkinnedMesh`): grosor 0.015 para
  `nyx_body`, 0.011 para `nyx_hair`, 0.008 para `nyx_face`, color blanco `0xffffff`, con variación
  de pincel `sin(x*7.3 + y*5.1) * cos(z*6.7 - y*4.2) * 0.2`.
- Física de pelo tipo spring-damper (`k = 28.0`, `damp = 4.8`) sobre `hair_1/2/3`, arrastrada
  también por la velocidad angular de cámara (`camVel * 0.05`, saturada a ±0.35).

### 3.5 Paletas (3) y slots

| id | Nombre | `rim` | universo (`deep`, `nebA`, `nebB`, `rim`) | colores (`body`, `hair`, `face`, `eyes`) |
|---|---|---|---|---|
| `astral` | `VOID COSMOS` | `#a5f3fc` | `#070518`, `#4c1d95`, `#e11d48`, `#ffffff` | `#120c2b`, `#e2e8f0`, `#f6dcc8`, `#181b2c` |
| `eclipse` (por defecto) | `RAVEN NEBULA` | `#e9d5ff` | `#090314`, `#7e22ce`, `#06b6d4`, `#f8fafc` | `#1a0c2e`, `#1e1b2e`, `#f4d4c0`, `#0f172a` |
| `solar` | `SOLAR RIFT` | `#fde68a` | `#120614`, `#be123c`, `#f59e0b`, `#ffffff` | `#1c0b1e`, `#fef3c7`, `#f2d6c0`, `#181b2c` |

Slots y overrides de material: `body` → universo, `hair` → universo (`rimStrength 0.72`),
`face` → universo (`rimStrength 0.25`), `eyes` → cel (`rimStrength 0.4`, `emissiveBoost 0.0`).

### 3.6 Observaciones verificadas (no visuales)

- `.side`, `.card`, `.swatches`, `.mesh*`, `.ability*` están definidos en CSS pero **no existen en
  el markup**; `renderSwatches()` y `renderMeshBreakdown()` son funciones vacías (`1070-1071`).
- `.pal__name` se asigna como clase en JS (`1060`) pero no tiene regla CSS.
- `VIEW_DEFS` contiene solo la vista `dynamic` (`1101`), por lo que `frontModel` nunca se asigna y
  la rama de rotación `frontModel` (`1488-1491`) no se ejecuta; el `@media (max-width: 640px)`
  mantiene la rejilla de 4 filas de la versión anterior.

---

## 4. Portada: `TitleScreen` + `FluidInkButton` + `MenuModalShell`

### 4.1 `TitleScreen.tsx`

Contenedor: `relative min-h-screen w-full overflow-hidden bg-[#05010f]`. Canvas del diorama
`pointer-events-none fixed inset-0 h-full w-full` (`aria-hidden`). La música del menú arranca al
montar con `musicPlayer.play('menu')`.

Menú: columna absoluta `left-[3.5%] top-[14%] z-10 w-[25%] min-w-[230px] max-w-[380px]
flex flex-col gap-7`.

- `.title-tag`: etiqueta `ZERO-G ROGUELIKE` con fondo blanco, tinta, mono 800 10px,
  `letter-spacing .2em`, `padding 6px 10px 5px`, `skewX(-8deg)`, `box-shadow: 3px 3px 0 #0b0d12`.
- `.title-tag__line`: barra de 3px carmesí, `flex: 1`, `skewY(-1deg)`.
- `.title-logo`: `clamp(52px, 4.6vw, 76px)`, peso 900, itálica, `letter-spacing -0.04em`,
  `line-height .9`, color tinta, `text-shadow: 5px 5px 0 #e11d48`; el tramo `ORBIT` va en
  `.title-logo__accent` (carmesí con `text-shadow: 5px 5px 0 #0b0d12`).
- Paleta de botones: `MENU_STOPS = ['#e11d48', '#7c3aed', '#22d3ee']`.

Botones (`FluidInkButton`) y sus alturas de `viewBox`:

| Orden | Etiqueta i18n | `vbHeight` | `labelFontSize` |
|---|---|---|---|
| 1 | `menu.play` → `JUGAR` | 116 | `1.5rem` |
| 2 | `menu.training` → `Entrenamiento` (solo si `onPlayTraining`) | 84 | `0.875rem` |
| 3 | `menu.controls` → `Ajustes` | 84 | `0.875rem` |
| 4 | `menu.leaderboard` → `Leaderboard` | 84 | `0.875rem` |

Selector de idioma abajo a la izquierda (`bottom-4 left-4`): contenedor `-skew-x-12` con
`border-2 border-[#0b0d12] bg-white/70`, `shadow-[4px_4px_0_#0b0d12]`; los tres botones
(`ESPAÑOL` / `ENGLISH` / `日本語`) en `skew-x-12`; idioma activo `text-[#0e7490]`, inactivo
`text-[#0b0d12]/40` con hover a `/70`; separadores `/` a `/30`. Cuando el mando enfoca ese último
ítem, el contenedor pasa a `border-[#e11d48]`, `shadow-[4px_4px_0_#e11d48]` y `-translate-y-0.5`.

Navegación con mando: `useGamepadListNav(actions.length, { enabled: modal === null })` con el orden
`play → training (opcional) → settings → leaderboard → language`; el índice enfocado se pasa a cada
botón como `focused`.

Shader del *blade* (`src/game/render/menuShaders.ts`): quad a pantalla completa que pinta el panel de
papel opaco a la izquierda (`vec3(0.945, 0.945, 0.929)`) con rejilla de 96px al 55% de mezcla, filo
de tinta `vec3(0.043, 0.051, 0.071)` (alpha 0.92), y una estela líquida de 0.055 de ancho con
carmesí `vec3(0.88, 0.11, 0.28)` → ciruela `vec3(0.42, 0.19, 0.90)` → cian
`vec3(0.13, 0.83, 0.93)` y puntos halftone. El borde diagonal va de `0.40` (arriba) a `0.24` (abajo)
del ancho, con onda líquida de amplitud `0.022`.

### 4.2 `FluidInkButton.tsx`

Botón SVG de "tinta viva" portado de `referencia_boton.html`. Constantes y defaults:

- `VB_W = 340` (ancho fijo del `viewBox`); `vbHeight` por defecto `96`; `cornerRadius` `2`;
  `core` `#f1f1ed`; `textColor` `#0b0d12`; `amplitude` `2.2`; `focused` `false`.
- 64 puntos repartidos por el perímetro del rectángulo redondeado; path Catmull-Rom cerrado con
  `tension = 0.12` (silueta rectangular nítida). El núcleo de papel es el mismo path desplazado
  `7.5` unidades hacia dentro, con `feGaussianBlur stdDeviation="6.5"`; el aura exterior tiene
  `stdDeviation="8"`, `feFuncA slope="1.05"` y `opacity 0.32`.

Animación (por frame, `requestAnimationFrame`):

- `state.time += dt * 2.1`; `pulse *= 0.91`.
- Degradado con vaivén: `gradShift = sin(t*0.45) * 24`, aplicado a `x1/y1/x2/y2` (12%→88%).
- Onda del borde: `sin(a*3 + t*1.15) + 0.55*cos(a*5 - t*0.85) + 0.35*sin(a*2 + t*1.65)`, normalizada
  por `1.9` y multiplicada por `amplitude`.
- Onda elástica al pulsar: `sin(a*4 - t*5) * pulse * 3.2`.
- Atracción magnética: si el puntero está a menos de `68` unidades, `pull = (1 - dist/68) * 3.2`
  aplicado solo a la componente normal (`max(0.25, align)`).

CSS inyectado:

- `.fink-wrap`: `position: relative; width: 100%; transform: skewX(-12deg)`; transición
  `160ms cubic-bezier(0.22, 1, 0.36, 1)`.
- `.fink-wrap.is-focused`: `skewX(-12deg) scale(1.03) translateX(5px)` +
  `drop-shadow(0 0 14px rgba(225, 29, 72, 0.45))`.
- `.fink-btn:active`: `scale(0.965)`; `:focus-visible`: `outline: 3px solid #e11d48; offset 4px`.
- `.fink-label`: `clamp(15px, 1.7vw, 21px)`, 900, itálica, `letter-spacing .06em`, mayúsculas,
  `skewX(12deg)`.
- `.fink-hint`: mono 800 10px, `letter-spacing .14em`, `padding 5px 8px 4px`, borde 2px,
  `background rgba(255,255,255,0.35)`, `skewX(12deg)`.
- `hint` pinta un chip a la derecha cuando se pasa (p. ej. `[DEBUG]`); el color del borde se deriva
  del texto (`${textColor}55`).

### 4.3 `MenuModalShell.tsx` — marco de modales de portada

Comentario del archivo: "vidrio cósmico de alto contraste con borde de tinta y sombra offset tipo
cómic". Cierra con `Escape` o con el botón `CERRAR`.

- Overlay: `fixed inset-0 z-40 bg-[#05010f]/85 p-4 backdrop-blur-sm`, centrado.
- Panel: `max-h-[88vh] w-full max-w-3xl rounded-2xl border-4 border-[#0b0b14] bg-[#0d0a1f]/95
  shadow-[10px_10px_0_#0b0b14]`.
- Cabecera: `border-b-2 border-white/10 px-6 py-4`; `<h2>` `text-2xl font-black italic
  tracking-[0.14em] text-white` con `textShadow: 3px 3px 0 ${accent}`; subtítulo
  `text-[11px] font-black uppercase tracking-[0.26em]` en el color de acento.
- Cuerpo: `flex-1 overflow-y-auto px-6 py-5`. Pie opcional: `border-t-2 border-white/10 px-6 py-4`.
- Botón cerrar: `rounded-lg border-2 border-[#0b0b14] bg-white/10 px-3 py-1.5 text-[11px]
  font-black tracking-[0.18em] text-white hover:bg-white/20`.
- `accent` por defecto `#22d3ee`; `LeaderboardModal` lo sobreescribe a `#fbbf24`.

---

## 5. `DomePauseModal.tsx` — Pausa de la Cúpula

### 5.1 Estructura y estilo

Capa `fixed inset-0 z-index 50` sin transparencia: papel `#f1f1ed` + rejilla 96px
`rgba(11,13,18,0.06)`, tinta `#0b0d12`, entrada `pauseIn 260ms ease-out`
(`opacity 0 → 1`, `scale(1.04) → 1`).

- `.pause-speedlines`: `inset: -12%`, `repeating-conic-gradient(from 0deg at 50% 42%, ...)` con
  `rgba(11,13,18,0.05)` en 5.2deg–5.9deg, máscara radial `transparent 24% → #000 80%`.
- `.pause-burst`: círculo de `120vmin` centrado en `50% 42%`, puntos
  `rgba(11,13,18,0.13) 2.2px` / rejilla `14px`, máscara `#000 0% → transparent 60%`.
- `.pause-kicker`: mono 800 11px, `letter-spacing .42em`, `rgba(11,13,18,0.55)`; texto i18n
  `CÚPULA · SIMULACIÓN CONGELADA`.
- `.pause-title`: `clamp(84px, 15vw, 200px)`, 900, itálica, `letter-spacing -0.06em`,
  `line-height .85`, `color: transparent`, `-webkit-text-stroke: 4px #0b0d12`,
  `text-shadow: 8px 8px 0 rgba(225,29,72,0.3)`, animación
  `pauseTitleIn 420ms cubic-bezier(.2, 1.3, .4, 1) backwards` (desde `translateY(40px)
  skewX(-10deg) scale(1.15)`). Texto: `PAUSA`.
- Chips de información: `.pause-info__chip` fondo tinta, texto cian `#22d3ee`, mono 800 11px,
  `letter-spacing .18em`, `padding 8px 14px 7px`, `skewX(-8deg)`; el chip de nivel usa dorado
  `#fbbf24`. Contenido: `OLEADA <n> · <etiqueta traducida>` (o `ÓRBITA ESTABLE`) y `NIVEL <n>`.
  La etiqueta de oleada se traduce con `waveLabelKey()` (`BÁSICOS`, `MINIBOSS`, `BOSS`).

### 5.2 Botones

`nav.pause-nav`: columna con `gap: 14px`, `margin-top: 5vh`, `width: min(460px, 86vw)`.

`.pause-btn`: `background #fbfbf8`, `border: 3px solid #0b0d12`,
`box-shadow: 6px 6px 0 var(--accent)`, `padding 15px 20px`, `transform: skewX(-6deg)`,
transición `transform 130ms cubic-bezier(.2,.9,.3,1), box-shadow 130ms, background 130ms`.
Entrada `pauseBtnIn 360ms cubic-bezier(.2,1.2,.35,1)` desde `skewX(-6deg) translateX(-46px)`, con
retardos encadenados `90ms`, `170ms`, `250ms`, `330ms`.
`hover`/`.is-focused`: `translateX(10px)`, `box-shadow: 10px 10px 0 accent`, `background #fff`.
`:active`: `translateX(4px)`, `box-shadow: 4px 4px 0 accent`.
Etiqueta `.pause-btn__label`: 17px, 900, itálica, `letter-spacing .06em`, mayúsculas.
Atajo `.pause-btn__key`: mono 800 10px, `letter-spacing .14em`, fondo tinta, texto blanco,
`padding 6px 8px 5px`.

Opciones y acentos (`items`, en orden):

| # | Clave i18n | Texto ES | Acento | Condición |
|---|---|---|---|---|
| 1 | `pause.resume` | `REANUDAR` | `#22d3ee` | siempre |
| 2 | `pause.settings` | `AJUSTES` | `#fbbf24` | siempre |
| 3 | `pause.restart` | `REINICIAR ÓRBITA` | `#e11d48` | solo si llega `onRestart` (en entrenamiento se omite) |
| 4 | `pause.exit` | `SALIR AL TÍTULO` | `#0b0d12` | siempre |

### 5.3 UX / atajos / comportamiento

- **Teclado**: `[1]`…`[N]` dispara la acción correspondiente mientras la pausa está abierta
  (`Number(event.key) - 1` validado contra `items.length`).
- **Mando** (`useGamepadListNav`): D-Pad/stick mueve, Cruz (A) confirma, Círculo (B) ejecuta
  `onResume`. Repetición: retardo inicial 320 ms, luego cada 130 ms (`gamepadMenuNav.ts`).
- **Teclado global** (`domeGameLoop.ts:898`): `Escape` o `KeyP` abren/cierran la pausa; se ignoran
  si hay ajustes, tutorial, subida de nivel o informe abiertos. Al abrir se llama
  `document.exitPointerLock()`; al cerrar con teclado **no** se pide pointer lock (ESC no es gesto
  válido) y se deja una gracia de 250 ms (`pauseResumeGraceUntil`).
- **Mando global** (`domeGameLoop.ts:966`): el botón de acción `pause` (Options) abre/cierra; al
  abrir sale del pointer lock; al reanudar con mando **no** se captura el ratón. Círculo (B) cierra
  la pausa si no hay ajustes abiertos.
- **REANUDAR** limpia la marca `hadPointerLockRef` y llama `canvas.requestPointerLock()`.
- **REINICIAR ÓRBITA** cierra la pausa, borra el informe, cierra la subida de nivel, resetea el HUD a
  `INITIAL_HUD`, limpia la marca de pointer lock e incrementa `runSeed` (remonta el canvas).
- **SALIR AL TÍTULO** delega en `onExitToMenu` (`onExit` de `App.tsx`).
- Mientras dura la pausa el bucle aplica `effRawDt = 0` (`menuPaused` incluye pausa, subida de
  nivel, informe y tutorial) y el HUD desactiva alertas.
- `DomePauseModal` se monta con `isOpen={isPauseOpen && !settingsOpen}`; los ajustes se abren
  encima (`SettingsScreen`, z 60) y al cerrarlos se vuelve a la pausa.

---

## 6. `SettingsScreen.tsx` — Ajustes

### 6.1 Estructura

Raíz `.set-root`: `fixed inset-0`, `z-index: 60`, `overflow-y: auto`, papel `#f1f1ed` con rejilla
96px, tinta, stack Helvetica Neue + Noto Sans JP. `.set-speedlines` con centro `50% 30%`,
`rgba(11,13,18,0.045)` y máscara `transparent 30% → #000 85%`.

Cabecera (`.set-header`, `padding: 5vh 4vw 0`):

- `.set-title`: `clamp(56px, 9vw, 120px)`, 900, itálica, `letter-spacing -0.05em`,
  `line-height .9`, `color: transparent`, `-webkit-text-stroke: 3px #0b0d12`,
  `text-shadow: 6px 6px 0 rgba(225,29,72,0.25)`. Texto `AJUSTES`.
- `.set-banner`: banda de tinta con texto blanco, `clamp(13px, 1.6vw, 19px)`, 900 itálica,
  `padding 7px 22px 10px`, `box-shadow: 5px 5px 0 #e11d48`, `rotate(-2deg)`; texto
  `CONFIGURACIÓN · SE APLICA AL INSTANTE`. `.set-banner__slash`: barra carmesí de 7px que entra con
  `setSlashIn 260ms cubic-bezier(.6,0,.2,1) 180ms forwards` (`scaleX(0) → 1`).
- `.set-close`: absoluto `right: 4vw; top: 5vh`, fondo tinta, mono 800 11px, `letter-spacing .18em`,
  `padding 10px 14px 9px`, `skewX(-8deg)`, `box-shadow: 4px 4px 0 #22d3ee`; hover
  `translateY(-2px)` + `6px 6px 0 #22d3ee`. Texto `CERRAR [ESC]`.

Pestañas `.set-tab`: papel `#fbfbf8`, borde 3px tinta, 900 13px itálica, `padding 12px 22px 13px`,
`skewX(-8deg)`, `box-shadow: 4px 4px 0 rgba(11,13,18,0.25)`; activa: fondo tinta, texto blanco,
`box-shadow: 5px 5px 0 var(--accent)` y `translateY(-2px)`. Acentos por pestaña: `GENERAL`
`#e11d48`, `TECLADO Y RATÓN` `#22d3ee`, `MANDO` `#fbbf24`.

Contenido `.set-content` (`padding: 3vh 4vw 0`); pestañas general y mando usan `.set-grid`
(`grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))`, `gap: 22px`). Paneles `.set-panel`:
papel `#fbfbf8`, borde 3px tinta, `box-shadow: 8px 8px 0 rgba(11,13,18,0.9)`,
`padding 20px 20px 18px`, con `::before` de trama halftone (`rgba(11,13,18,0.08) 1.5px`, 11px,
máscara `linear-gradient(200deg, #000 0%, transparent 46%)`). Título `.set-panel__title`: 15px 900
itálica mayúsculas, fondo del acento, texto blanco, `padding 5px 12px 6px`, `skewX(-8deg)`.

Filas `.set-row`: rejilla `1fr auto`, `gap 6px 14px`, `padding 9px 0`, borde inferior punteado
`2px rgba(11,13,18,0.18)`. `.set-row__label` 12px 800 mayúsculas; `.set-row__value` mono 800 11px
en chip tinta con texto cian `#22d3ee`, `padding 5px 9px 4px`, `skewX(-8deg)`.

### 6.2 Controles y valores

**Pestaña GENERAL** — tres paneles:

| Panel (acento) | Control | Rango / default | Formato |
|---|---|---|---|
| `Cámara` (`#22d3ee`) | Sensibilidad del ratón | `0.25 … 2.5`, step `0.05`, default `1.0` | `x.xx` + `x` |
| `Cámara` | Campo de visión (FOV) | `55 … 85`, step `1`, default `70` | entero + `°` |
| `Cámara` | Invertir eje Y (toggle) | default `false` | `ON`/`OFF` |
| `Audio` (`#e11d48`) | Volumen general | `0 … 1.5`, step `0.05`, default `1.0` | `%` |
| `Audio` | Volumen de música | `0 … 1.5`, step `0.05`, default `1.0` | `%` |
| `Audio` | Volumen de sonidos y efectos | `0 … 1.5`, step `0.05`, default `1.0` | `%` |
| `Visual` (`#fbbf24`) | Trama halftone (cómic) | default `true` | `ON`/`OFF` |
| `Visual` | Modo fácil (`Vida y Edén x2, sin escalada`) | default `false` | `ON`/`OFF` |
| `Visual` | Omitir tutoriales | persistencia separada | `ON`/`OFF` |
| `Visual` | Idioma | `ES` / `EN` / `JA` | chips |

Slider `.set-slider`: pista de tinta de 8px con borde 2px; thumb cuadrado de 18×18 (Firefox 14×14,
`border-radius: 0`) con `background #f1f1ed`, `border: 3px solid var(--accent)` y
`box-shadow: 2px 2px 0 #0b0d12`.
Toggle `.set-chip`: mono 800 10px, `letter-spacing .16em`, `padding 6px 10px 5px`, borde
`2px rgba(11,13,18,0.35)`, `skewX(-8deg)`, `max-width 220px` con elipsis; encendido: fondo del
acento, texto blanco y borde del acento; apagado: transparente y texto `rgba(11,13,18,0.45)`.
Chips de idioma: activo con fondo tinta y texto cian; inactivo `rgba(11,13,18,0.6)` con hover a
tinta y borde de tinta.

**Pestaña TECLADO Y RATÓN** — un panel (`#22d3ee`) con `set-note` y `.set-bindings`
(`grid auto-fill minmax(240px, 1fr)`). `.set-binding`: borde `2px rgba(11,13,18,0.8)`,
`background rgba(255,255,255,0.6)`, `padding 8px 10px`, etiqueta 11px 800 mayúsculas.
`.set-key`: `min-width 96px`, fondo tinta, texto cian, mono 800 10px, `padding 7px 10px 6px`,
`skewX(-8deg)`; hover invierte (fondo cian, texto tinta); capturando: fondo `#e11d48`, texto blanco
y parpadeo `setCapturePulse 0.6s steps(2) infinite` (alterna a tinta). Etiqueta mientras captura:
`PULSA TECLA...`.

Se listan las **14** acciones de `CONTROL_ACTIONS` con bindings por defecto: `KeyW`, `KeyS`, `KeyA`,
`KeyD`, `Space`, `ShiftLeft`, `KeyE`, `KeyF`, `KeyR`, `KeyQ`, `Tab`, `Digit1`, `Digit2`, `Digit3`
(`Avanzar`, `Retroceder`, `Izquierda`, `Derecha`, `Saltar`, `Sprint`, `Interactuar`, `Parry`,
`Estasis`, `Fijar objetivo`, `Radar de enemigos (Cúpula)`, `Personaje 1/2/3`).

**Pestaña MANDO** — panel de estado + panel de botones (`#fbbf24`):

- Chip de estado: nombre del mando en fondo dorado con texto tinta, o `— ninguno —` con chip por
  defecto. Se actualiza por `setInterval` de 400 ms más eventos `gamepadconnected` /
  `gamepaddisconnected`.
- Slider sensibilidad del stick derecho `0.5 … 3.0` (step `0.05`, default `1.4`); zona muerta
  `0.05 … 0.35` (step `0.01`, default `0.14`, formato `%`).
- Botón `RESTAURAR MANDO POR DEFECTO` (`.set-mini-btn`, borde 2px tinta, mono 800 9px,
  `skewX(-8deg)`, hover fondo tinta + texto dorado).
- Nueve acciones de `GAMEPAD_ACTIONS` (`attack`, `attackAlt`, `dash`, `dashAlt`, `jump`, `slot1`,
  `slot2`, `slot3`, `pause`); al capturar se muestra `PULSA BOTÓN...`; sólo se asignan los índices
  `0 … 17` y solo en flanco de subida (pulsado ahora y no en el sondeo previo).
- Nota final con el mapeo W3C: `0=Cruz (A), 1=Círculo (B), 2=Cuadrado (X), 3=Triángulo (Y), 4=L1,
  5=R1, 6=L2, 7=R2, 9=Options (Start), 12..15=D-Pad`.
- Pie `.set-footer`: botón `.set-restore` (`RESTAURAR TODO POR DEFECTO`) carmesí `#e11d48`, texto
  blanco, borde 3px tinta, 900 12px itálica, `padding 13px 26px 14px`, `skewX(-8deg)`,
  `box-shadow: 6px 6px 0 #0b0d12` (hover `8px 8px`, active `4px 4px`).

### 6.3 Aplicación y persistencia

- Cada cambio llama `onUpdateSettings(cloneGameSettings(settings))` inmediatamente (comentario del
  archivo: "Todo se aplica al instante… persiste en localStorage y propaga al juego en vivo").
- Persistencia en `outorbit.settings.v1` (`src/game/settings.ts:186`), con saneado y *clamp* de cada
  valor a `SETTINGS_LIMITS`.
- `Omitir tutoriales` no va en `GameSettings`: usa `areAllTutorialsCompleted()` /
  `setAllTutorialsCompleted()` (`outorbit_tutorial`).
- `Escape` cierra los ajustes salvo que se esté capturando una tecla o un botón.
- En la portada, los ajustes se abren como modal sobre `TitleScreen`; en la Cúpula, sobre la pausa
  (z 60 frente a 50). El FOV y la trama halftone se ven al instante en el diorama y en el juego
  (nota del diccionario `controls.keyboardHint`).
- `SettingsScreen` **no** implementa navegación con mando (no usa `useGamepadListNav`).

---

## 7. `DomeLevelUpSequence.tsx` — Subida de nivel

### 7.1 Fases y tiempos

Tres fases (`phase`): `'planet'` → `'cards'` → `'closing'`. Si `skipPlanetAnimation` (selección
inicial) arranca directamente en `'cards'`.

`TIMING = { PHASE1_END: 0.3, PHASE2_END: 1.55 }` segundos. Coreografía:

1. **Planeta**: punto blanco que pulsa (`sin/cos` en dos tramos), planeta que emerge a partir de
   `t1 > 0.55`, zoom continuo desde `z = -155`, giro `spinAngle += dt * 4.5`, y un barrido diagonal
   que cubre la pantalla con papel. Al terminar, `onDone()` 240 ms después y se congela el último
   frame.
2. **Cartas**: hoja de papel con líneas de velocidad, estallido halftone, número de nivel gigante,
   banner y 2–3 cartas que caen con impacto.
3. **Iris**: `clip-path: circle(120vmax at 50% 46%)` → `circle(2.8vmin …)` en 700 ms, aro carmesí
   que pasa de `scale(12)` a `scale(0.28)` y punto de papel que parpadea (420 ms, retardo 680 ms).
   El `onSelect` real se dispara **1180 ms** después de iniciar el cierre.

### 7.2 Escena 3D (`PlanetTransition`)

- `WebGLRenderer` transparente (`alpha: true`, `setClearColor(0x000000, 0)` sobre la partida viva),
  `pixelRatio` limitado a 2.
- Cámara `PerspectiveCamera` con FOV responsivo: `68` si `aspect < 0.72`, `60` si `< 1.0`, `54` en
  el resto; `near 0.08`, `far 1200`.
- Rig: `roll = -27°`, `pitch = 25°`, planeta de radio `1.0` (esfera 64×48), casco de contorno
  `1.045` con material `BackSide` color papel; anillo `LatheGeometry` de 96 segmentos entre
  `RING_INNER = 1.42` y `RING_OUTER = 3.25` con grosor `0.11` y bisel `0.025`; 48 partículas
  orbitales doradas (`size 0.11`).
- Paleta del shader (constantes `vec3`): tinta base `(0.043, 0.051, 0.071)`, papel
  `(0.945, 0.945, 0.929)`, cian `(0.133, 0.827, 0.933)`, carmesí `(0.882, 0.114, 0.282)`.
  Planet: 3 bandas con halftone de 7px, meridianos cian al 22%, ecuador papel al 35%, rim
  cian→carmesí según `N.y`, especular de papel al 92%, `uEnergyPulse` y `uWhiteout`.
  Ring: bandas cian en `rn 0.22` y `0.68`, corte de tinta en `0.45`, filos cian en `0.07` y `0.91`,
  `speedTick` carmesí en `rn 0.82`.
- Barrido (`wipeFragmentShader`): `mode 0` = cian→carmesí, `mode 1` = acento (carmesí) → mezcla
  cian/carmesí; `edgeWidth` 0.055 / 0.075; halftone de 14px con `uHalftoneAlpha` a 1.0 al final.

### 7.3 Hoja de papel, título y cartas

- `.lu-root`: `fixed inset-0 z-index 50`, `background: transparent` (el papel lo pone `.lu-sheet`).
- `.lu-sheet`: papel `#f1f1ed` + rejilla 96px `rgba(11,13,18,0.06)`; `is-shaking` aplica
  `luShake 300ms linear` con traslaciones de hasta ±7px y rotaciones de ±0.35deg.
- `.lu-speedlines` (centro `50% 46%`, aparece con `luLinesIn 900ms ease-out 200ms`) y `.lu-burst`
  (130vmin, puntos `rgba(11,13,18,0.16) 2.4px` cada 15px, entra con
  `luBurstIn 700ms cubic-bezier(.2,.9,.3,1) 350ms` desde `scale(0.4) rotate(-8deg)`).
- `.lu-title`: arriba `7vh`, centrado. `.lu-title__num`: `clamp(90px, 17vw, 230px)`, 900 itálica,
  `letter-spacing -0.06em`, `line-height .82`, transparente con `-webkit-text-stroke: 3px #0b0d12`,
  `luNumIn 460ms cubic-bezier(.2,1.3,.4,1) 120ms` desde `translateY(60px) skewX(-14deg) scale(1.25)`.
  Muestra el nivel con `pad2` (dos dígitos). `.lu-title__banner`: banda tinta, texto blanco,
  `clamp(22px, 3.4vw, 44px)`, `padding 8px 30px 13px`, `box-shadow: 7px 7px 0 #e11d48`,
  `rotate(-3.5deg)`, revelada con `clip-path: inset(0 100% 0 0 → 0)` en 380 ms con 300 ms de
  retardo; texto `¡SUBIDA DE NIVEL!`. `.lu-title__slash`: barra carmesí de 10px que se despliega con
  `luSlashIn 260ms` a los 560 ms.
- `.lu-stage`: flex centrado, `gap: 4vw`, `padding-top: 16vh`. `.lu-card-slot` de
  `width: min(300px, 26vw)`; entrada `luCardSlam 520ms cubic-bezier(.16,1.2,.3,1)` desde
  `translateY(72vh) rotate(9deg) scale(0.9)` con rebote a `-14px` y retardos `480/610/740 ms`.
- `.lu-card`: papel `#fbfbf8`, borde 3px tinta, `box-shadow: 9px 9px 0 var(--accent)`,
  `padding 46px 18px 18px`, `transform: skewX(-5deg)`, `cursor: pointer`. Hover y `.is-pad-focus`:
  `translateY(-12px) scale(1.05)` y `box-shadow: 14px 14px 0 var(--accent)`; el foco de mando añade
  `outline: 4px solid #22d3ee; offset 4px`; `:focus-visible` con `outline: 3px solid #22d3ee`.
  `::before` añade trama halftone `rgba(11,13,18,0.1) 1.6px` cada 11px con máscara a 200°.
- Contenido de la carta: `.lu-card__ghost` (número fantasma de 92px, `-webkit-text-stroke: 2px
  rgba(11,13,18,0.14)`, esquina superior derecha), `.lu-card__rarity` (chip en la esquina superior
  izquierda, fondo del acento, mono 800 10px, `letter-spacing .22em`, `skewX(-9deg)`),
  `.lu-card__icon` (108×108 con cruz de guías `rgba(11,13,18,0.05)` y `.ring` de 2px con dos lados
  transparentes girando `luRingSpin 8s linear infinite`), `SkillIcon size={68}` con
  `drop-shadow(2px 2px 0 rgba(11,13,18,0.14))`, `.lu-card__name` (21px 900 itálica mayúsculas),
  `.lu-card__level` (mono 800 12px, `Nv. X` + flecha en color de acento `→ Nv. Y`),
  `.lu-card__cost` (chip tinta/cian `COSTE: n EDÉN`), `.lu-card__desc` (11.5px/1.5, `#2a2f3d`,
  `min-height: 66px`), `.lu-card__key` (`[n]`, esquina inferior derecha, tinta/blanco).
- Carta descartada `.is-out`: `opacity .16`, `filter: grayscale(1)`, `translateY(16px) scale(0.96)`
  y `pointer-events: none`.
- Sello `.lu-stamp` (`¡ELEGIDA!`): fondo `#e11d48`, texto blanco, 900 26px itálica,
  `border: 3px solid #fff`, `box-shadow: 6px 6px 0 #0b0d12`, `rotate(-8deg)`, entra con
  `luStampSlam 280ms cubic-bezier(.2,1.5,.4,1)` desde `scale(2.8)`. Onda `.lu-shock`: borde 4px
  carmesí que escala de 1 a 1.45 y se desvanece en 520 ms.
- Vuelo al centro (`.is-flying`): `position: fixed`, `z-index 45`, transición 420 ms hacia
  `translate(cx,cy) skewX(-5deg) scale(1.1)` con `box-shadow: 18px 18px 0 var(--accent)`; temblor
  `.is-trembling` con `luTremble 130ms linear infinite` (desplazamientos de 2–3px).
- Panel de reemplazo `.lu-replace`: overlay `rgba(11,13,18,0.82)` con `z-index 40`, contenido
  alineado abajo (`padding-bottom: 5vh`). Banner `¿POR CUÁL LA CAMBIAS?` en carmesí, texto blanco,
  `clamp(20px,3vw,38px)`, `box-shadow: 8px 8px 0 #fff`, `rotate(-2.5deg)`, cae con `luBannerDrop`.
  Ranuras `.lu-slot` de `width: min(250px, 22vw)`, papel `#f1f1ed`, `border: 3px solid #fff`,
  `box-shadow: 7px 7px 0 #22d3ee`, `skewX(-5deg)`; entrada `luSlotRise 380ms` con retardos
  `120/210/300 ms`; hover/foco: `translateY(-10px) scale(1.05)`, `box-shadow: 11px 11px 0 #e11d48`,
  borde carmesí y `outline: 4px solid #22d3ee`. Índice `R1/R2/R3` en chip tinta; nombre 17px 900
  itálica; nivel en mono 11px. Botón `[ESC] VOLVER` con borde y texto blanco translúcido.
- Flash `.lu-flash`: blanco a pantalla completa, `z-index 60`, `luFlashBang 240ms steps(3)` desde
  `opacity .95`.

### 7.4 Rarezas y cartas

Rarezas (`SkillRarity` → label i18n `levelUp.rarity.*`): `base` → `BASE`, `common` → `COMÚN`,
`epic` → `ÉPICA`, `legendary` → `LEGENDARIA`. El color de acento de cada carta viene de
`LevelUpCardOption.accentColor` (`DomeProgression.ts`), que coincide con el `accentColor` del
catálogo de habilidades/pasivas listado en 2.1.

Generación (`generateLevelUpChoices`): nivel 1 → carta fija `gravity_field` (BASE) + una aleatoria;
niveles impares → 2 cartas de habilidad nueva/mejora; niveles pares → hasta 3 pasivas (fallback a
activas si todas están al máximo). En el uso normal se muestran **2 cartas** (el layout soporta 3 y
el diccionario dice `ELIGE 1 DE 2 CARTAS`).

`requiresSlotReplacement` + carta `kind === 'active_new'` → vuela al centro y abre el panel de
reemplazo; el resto se resuelve con sello directo.

### 7.5 Interacción

- **Ratón**: clic en la carta (o en una ranura al reemplazar).
- **Teclado** (solo en fase `cards`): `[1..N]` elige carta; con carta en vuelo `[1..3]` elige ranura;
  `Escape` vuelve (`closeReplace`). `Enter`/`Espacio` en la carta enfocada también elige.
- **Mando**: `useGamepadListNav` en modo rejilla de 1 fila (`columns = choices.length`) para las
  cartas y (`columns = equippedSlots.length`) para las ranuras; Cruz (A) confirma, Círculo (B) vuelve.
  El foco se aplica con la clase imperativa `is-pad-focus`.
- **Feedback sonoro** (`SynthAudio`): `playLevelUpSpark()` al entrar en fase 1,
  `playLevelUpApproach()` en fase 2, `playCardSlam()` en el impacto del título (340 ms) y de cada
  carta (`480 + i*130 + 430` ms), `playInkWipe()` al lanzar el vuelo, `playCardTremble()` al empezar
  el temblor, `playCardStamp()` al sellar e `playIrisWink()` al iniciar el cierre.
- **Feedback físico**: `shake()` reintroduce `is-shaking` en la hoja; `flash()` remonta `.lu-flash`.
- Al encadenar niveles (`newLevel` cambia) se limpian bloqueos y el foco vuelve al índice 0.

### 7.6 Observaciones verificadas

- `.lu-card__upgrade` está declarado en CSS pero ninguna carta lo usa.
- Las clases `is-in` (en `.lu-sheet`) y `is-on` (en `.lu-replace`, `.lu-flash`) se aplican en el
  markup pero no tienen regla asociada.
- Claves i18n `levelUp.title`, `levelUp.subtitle`, `levelUp.chooseHint`, `levelUp.slotReplacement` y
  `levelUp.kind.*` existen en `es.json` pero **no** se referencian en `src/`.

---

## 8. `DomeSkillSlotsHud.tsx` — Ranuras de habilidad (HUD)

Tres círculos apilados verticalmente bajo el HUD Yin-Yang, `pointer-events-none`, centrados con
`translate(-x, 0)`.

Posicionamiento: `left: calc(20px + min(420px, 30vw) * (100 / 420))`,
`top: calc(20px + min(420px, 30vw) * (200 / 420) + 6px)`, separación
`gap: clamp(12px, 1.25vw, 18px)`.

Cada ranura mide `clamp(68px, 5.8vw, 86px)` y baja a `opacity 0.3` si está vacía. SVG `120×120`,
`overflow: visible`.

- **Núcleo**: `radialGradient` descentrado (`cx 38% cy 32% r 68%`) desde
  `#1b1138` (o `#0f2d46` si la habilidad está activa) al 96% → `#090418` al 58% → `#040408`.
- **Bisel exterior**: círculo `r 57` con `rgba(228,228,236,0.28)` (o `rgba(0,229,255,0.7)` activo).
- **12 muescas** radiales entre `r 55` y `57`/`58.5`; las mayores (cada 3) en `#00e5ff` si activa.
- **Retícula heptagonal** interior de radio 34, trazo `rgba(228,228,236,0.13)`.
- **Aro de progreso**: radio 46, `strokeWidth 6.5`, `strokeLinecap: butt`, rotado `-90 60 60`;
  pista `rgba(228,228,236,0.12)`. Listo: degradado `#00e5ff → #818cf8 (55%) → #e879f9`; activo:
  `#00e5ff` sólido; en cooldown: arco horario calculado con
  `progress = 1 - cdRemaining/maxCd`. Brillos: `drop-shadow(0 0 4px rgba(0,229,255,0.45))` listo y
  `0 0 6px rgba(0,229,255,0.9)` activo.
- **Icono**: `img` WebP desde `/icons/skills/<skillId>.webp`, 46% del círculo, `filter: invert(1)` +
  brillo cian; en cooldown `opacity 0.42` y sin brillo.
- **Etiqueta de tecla**: polígono biselado (hexágono recortado) de 20×20 en la esquina inferior
  derecha, relleno `#06060a`, borde blanco translúcido (cian si activa), texto mono 900 11px.
- **Pips de nivel**: rombos de 5×5 rotados 45° bajo el círculo, color `#e4e4ec` (cian con
  `box-shadow: 0 0 5px #00e5ff` si activa), uno por nivel.

---

## 9. Final de partida

### 9.1 `DomeBattleReport.tsx` — Informe de la Cúpula (el que usa el juego)

Se monta desde `DomeGameView` cuando existe `battleReport`. Raíz `.brep-root`: `fixed inset-0`,
`z-index 50`, `overflow-y: auto`, papel `#f1f1ed` + rejilla 96px, entrada
`brepIn 260ms ease-out` (`scale(1.03) → 1`). Adornos: `.brep-speedlines` (centro `50% 24%`,
`rgba(11,13,18,0.05)`, máscara `transparent 26% → #000 84%`) y `.brep-burst` (115vmin en `50% 22%`,
puntos carmesí `rgba(225,29,72,0.16) 2.4px` cada 15px).

Layout `.brep-wrap`: `max-width: 1160px`, `min-height: 100dvh`, `padding
clamp(18px,3vh,36px) 4vw clamp(20px,3.2vh,36px)`, columna centrada con `gap clamp(16px,2.6vh,28px)`
—pensado para caber en un viewport de escritorio sin scroll.

**Cabecera asimétrica**: `.brep-kicker` mono 800 11px `letter-spacing .36em`
(`CÚPULA PERDIDA · INFORME DE COMBATE`) + `.brep-title` `clamp(50px, 7.6vw, 108px)`, 900 itálica,
`letter-spacing -0.055em`, `line-height .86`, transparente con `-webkit-text-stroke: 3.5px #0b0d12`,
`text-shadow: 7px 7px 0 rgba(225,29,72,0.32)`, animación `brepTitleIn 420ms` desde
`translateY(32px) skewX(-12deg) scale(1.12)`; texto `GAME OVER`. A la derecha, `.brep-score`: caja
papel `#fbfbf8`, borde 3px tinta, `box-shadow: 7px 7px 0 #e11d48`, `rotate(-1.8deg)`,
`padding 10px 28px 13px`, entrada `brepScoreIn 360ms … 120ms`; etiqueta `PUNTUACIÓN FINAL` en mono
800 9px `letter-spacing .32em` y valor `clamp(40px,5.4vw,72px)` 900 itálica con cifras tabulares y
`text-shadow: 4px 4px 0 rgba(34,211,238,0.45)`.

**Rejilla**: `grid-template-columns: minmax(0,1fr) minmax(0,1.05fr)`, `gap 18px`.

Paneles `.brep-panel`: papel `#fbfbf8`, borde 3px tinta, `box-shadow: 7px 7px 0
rgba(11,13,18,0.9)`, `padding 15px 16px 14px`, con halftone `rgba(11,13,18,0.08) 1.5px` cada 11px y
máscara a 200°. Título `.brep-panel__title`: chip inclinado `skewX(-8deg)` con fondo del acento,
texto blanco, 12px 900 itálica mayúsculas, `padding 4px 11px 5px`.

Métricas de la run (`Panel` acento `#e11d48`, título `ESTADÍSTICAS`):

| Tile | Acento | Formato |
|---|---|---|
| `OLEADA` | `#e11d48` | entero |
| `KILLS` | `#0b0d12` | entero |
| `TIEMPO SOBREVIVIDO` | `#22d3ee` | `m:ss` |
| `VELOCIDAD MÁX.` | `#fbbf24` | `x.x m/s` |

`.brep-stat`: tarjeta blanca, borde 3px tinta, `box-shadow: 4px 4px 0 rgba(11,13,18,0.85)`,
`skewX(-6deg)` (contenido contradesviado), barra inferior de 5px del acento; etiqueta mono 800 9px
`rgba(11,13,18,0.52)` y valor 23px 900 itálica tabular.

Chips extra: `NIVEL n`, `BARRERA n` y `REDIRECCIONES n` (esta última en `.brep-chip--gold`: fondo
tinta, texto `#fbbf24`, borde tinta). `.brep-chip` es mono 800 10px, borde 2px
`rgba(11,13,18,0.45)`, `skewX(-8deg)`, `padding 6px 9px 5px`.

Carga final (`Panel` acento `#22d3ee`, título `CARGA FINAL`): lista de ranuras
`R1/R2/R3` (`.brep-slot__idx` en chip tinta con texto cian) con nombre de la habilidad traducida y
`Nv. n` en mono 10px `rgba(11,13,18,0.58)`. Vacío: `SIN HABILIDADES EQUIPADAS`.

Columna derecha (`brep-panel--ranking`): título `FIRMA DEL PILOTO` (acento `#e11d48`) si hay
`onSubmitScore`, o `MEJORES PILOTOS` (acento `#fbbf24`) con botón `RECARGAR` si no lo hay.

- Formulario (solo si existe `onSubmitScore` **y** no hay apodo guardado): `input.brep-input`
  (`maxLength 18`, `autoFocus`, 19px 900 itálica mayúsculas, borde 3px tinta,
  `box-shadow: 4px 4px 0 rgba(11,13,18,0.85)`, placeholder 13px `rgba(11,13,18,0.28)`; foco:
  borde y sombra cian `#22d3ee`) + `button.brep-save` (tinta/blanco, `box-shadow: 4px 4px 0 #22d3ee`,
  hover `translateY(-2px)` y `6px 6px`, active `2px 2px`).
- Estados del botón (`SaveState` → clave i18n): `idle` → `GUARDAR EN LEADERBOARD`,
  `saving` → `GUARDANDO...` (parpadeo `brepSaving 0.7s steps(2)` alternando a `#2a2f3d`),
  `saved` → `GUARDADO` (fondo cian, texto tinta, sombra tinta),
  `error` → `ERROR · REINTENTAR` (fondo `#e11d48`). Texto de ayuda `.brep-hint` mono 800 9px
  (`SIN LOGIN OBLIGATORIO · RANKING GLOBAL`, error en carmesí).
- Con apodo guardado: si la marca supera el récord personal se sube **automáticamente** al montar
  (`autoSubmittedRef`) y se muestra `NUEVO RÉCORD (score) · SUBIDO AUTOMÁTICAMENTE COMO name`; si no
  lo supera, `PILOTO name · RÉCORD PERSONAL: best`. El apodo se persiste con `savePilotNickname`
  (`outorbit_nickname`) y el récord con `savePersonalBestScore` (`outorbit_best_score`).
- Sub-cabecera `MEJORES PILOTOS` en chip dorado + botón `RECARGAR` (`.brep-mini`, transparente con
  borde 2px tinta, mono 800 9px, `skewX(-8deg)`; hover fondo tinta y texto dorado; deshabilitado
  con `cursor: wait` y `opacity .5`).
- Ranking Top 5 (`BOARD_PREVIEW_LIMIT = 5`, `fetchTopLeaderboard(5)`), `brep-board` con borde
  superior 2px tinta y filas `28px 1fr auto` separadas por borde punteado 2px
  `rgba(11,13,18,0.22)`. Rango en mono 11px `rgba(11,13,18,0.45)` (el `#1` en carmesí); nombre 12px
  900 itálica mayúsculas con elipsis; marcador propio `.is-you` con
  `background rgba(34,211,238,0.18)` y `box-shadow: inset 4px 0 0 #22d3ee`; chip `TÚ` cian 8px;
  puntuación en mono 900 14px tabular.
- Si la marca guardada no entra en el Top 5 se muestra `.brep-recorded`
  (`MARCA REGISTRADA · name (score) FUERA DEL TOP 5`) con `background rgba(34,211,238,0.16)` y
  `border-left: 4px solid #22d3ee`.
- Estados de carga: `CARGANDO RANKING...` y `SIN MARCAS AÚN · SÉ EL PRIMERO` en `.brep-empty`
  (mono 800 10px, `rgba(11,13,18,0.48)`).

Salidas `.brep-actions` (centradas, `gap 14px`): botón `JUGAR DE NUEVO` (`brep-action--primary`:
fondo `#0b0d12`, texto blanco, sombra cian, hover `#161a24`) con `[1]`, y `MENÚ PRINCIPAL`
(papel, sombra de tinta) con `[2]`. `.brep-action`: borde 3px tinta, `padding 13px 26px 14px`,
14px 900 itálica mayúsculas, `skewX(-6deg)`, `box-shadow: 6px 6px 0 accent`, hover
`translateY(-2px)` + `9px 9px`, active `4px 4px`, `:focus-visible` sombra cian de 8px;
`.brep-action__key` mono 10px con `opacity .52`.

Atajos del informe: `1`, `r` o `R` → jugar de nuevo; `2` → menú principal; si el foco está en un
`INPUT`/`TEXTAREA`/`contentEditable`, los atajos se ignoran y `Escape` hace `blur()` del input. Tras
guardar con éxito el foco pasa al botón principal (`requestAnimationFrame`).

Responsive: a `780px` la cabecera se apila y la rejilla pasa a una columna; a `480px` el formulario
y las acciones se apilan y los botones ocupan el 100% con el atajo a la derecha.

### 9.2 `BattleReportScreen.tsx` — Informe de la campaña/tutoriales

Solo se renderiza en la rama de tutoriales de `App.tsx` cuando `hud.phase === 'victory'` y el
tutorial ya no está activo; visualmente **no** comparte el sistema papel/tinta.

- Overlay: `pointer-events-auto fixed inset-0 z-50 flex items-center justify-center overflow-y-auto
  bg-[#05010f]/95 p-4`.
- Panel: `max-w-4xl rounded-2xl border-4 border-yellow-400 bg-[#160b2e] p-8
  shadow-[12px_12px_0_#000]`.
- Kicker `BETA COMPLETA · COMANDANTE KRONOS DERROTADO` en `text-[10px] font-black
  tracking-[0.5em] text-yellow-300`; título `INFORME DE COMBATE FINAL` en `text-4xl font-black
  tracking-widest text-white drop-shadow-[3px_3px_0_#000]`.
- Radar SVG: `viewBox="0 0 236 236"`, centro `118`, radio `88`; anillos al 25/50/75/100% con trazo
  `#3b3b58`; ejes desde el centro; perfil relleno `rgba(103,232,249,0.28)` con trazo `#67e8f9` de
  2.5 y vértices de radio 3.5; etiquetas a `1.22` del radio, 10px, peso 900.
- Ejes y colores: `SIGILO #34d399`, `AGRESIÓN #f87171`, `AÉREO #67e8f9`, `SUBSUELO #facc15`,
  `ESTASIS #a78bfa`.
- Barras: etiqueta `w-24` 10px 900, pista `h-4` con `bg-slate-800` y borde 2px negro, relleno con
  ancho mínimo del 2%, porcentaje en mono 11px tabular.
- Bloque MLP: título `LECTURA DE LA RED MLP DE KRONOS` en `text-red-400` y texto con
  `Red neuronal híbrida 8 → 10 → 4` (cifras en cian), `KRONOS_PARAM_COUNT parámetros` y
  actualizaciones online (en dorado), `MSE 0.00185 · 2000 partidas sintéticas`, y el estilo
  dominante en cian.
- Tres tarjetas (`TIEMPO`, `ALARMAS`, `PUNTUACIÓN`) con etiqueta 10px/violeta-300 y valor mono 2xl
  blanco (la puntuación en `text-yellow-300`), sobre `bg-black/40` con borde 2px negro.
- Puntuación calculada aquí:
  `max(0, round(12000 - elapsedRunSec*4 - alarms*300 - damageTaken*120 + parries*60 +
  stealthKnockouts*80 + bruteKills*40))`.
- Firma: `input` `maxLength 18`, valor inicial `PILOTO`, placeholder `Tu callsign`,
  `focus:ring-2 focus:ring-cyan-400`; botón que pasa de `GUARDAR EN LEADERBOARD BASE44` (cian) a
  `GUARDANDO...` y a `¡GUARDADO EN BASE44!` (esmeralda); nota
  `Sin login obligatorio · Ranking global vía Base44`.
- Top 10 (`fetchTopLeaderboard(10)`), filas `bg-violet-950/60`, rango dorado, nombre 11px, tiempo
  cian, puntuación naranja; vacío: `Sin registros aún. ¡Sé el primero!`.
- Botones finales: `JUGAR DE NUEVO` (`bg-yellow-400`) y `MENÚ PRINCIPAL` (`bg-slate-600`), ambos
  con borde 4px negro y `shadow-[6px_6px_0_#000]`.

---

## 10. `DomeTutorialCard.tsx` — Tarjeta de tutorial

Overlay `.dtut-overlay`: `fixed inset-0`, `z-index 45`, `pointer-events: auto`,
`background: radial-gradient(circle at 30% 50%, rgba(4,5,16,0.18), rgba(4,5,16,0.58) 72%)`,
alineado a la derecha (`justify-content: flex-end`, `padding 24px clamp(20px,4.5vw,68px)`),
entrada `dtut-fade-in 200ms ease-out`. Diálogo accesible (`role="dialog"`,
`aria-modal`, `aria-labelledby="dtut-title"`).

Escenario `.dtut-stage`: `width: min(440px, 92vw)`, entra con `dtut-slide-in 240ms
cubic-bezier(0.22, 1, 0.36, 1)` desde `translateX(28px) scale(0.97)`.

Marcos cómic desplazados: `.dtut-frame--amber` (`border: 4px solid #fbbf24`,
`translate(11px, 11px)`) y `.dtut-frame--cyan` (`4px solid #22d3ee`, `translate(5px, 5px)`).

Tarjeta `.dtut-card`: papel `#f1f1ed`, borde `3.5px solid #0b0d12`,
`box-shadow: 8px 8px 0 #0b0d12`, `padding 22px 24px 20px`, columna con `gap 14px`; capa halftone
`radial-gradient(#94a3b8 1.2px, transparent 1.2px)` cada 12px con `opacity 0.22`.

Cabecera: `.dtut-badge` (`TUTORIAL`) con fondo `#fbbf24`, borde 2.5px tinta,
`box-shadow: 3px 3px 0 #0b0d12`, `padding 4px 14px`, `skewX(-12deg) translate(-8px, -4px)`, mono
900 11px `letter-spacing .22em`; número fantasma `.dtut-num` de 56px con
`-webkit-text-stroke: 2px rgba(11,13,18,0.16)`.

Diagramas (tres tutoriales):

| id | Número | Diagrama |
|---|---|---|
| `tutorial_de_movimiento` | `01` | Anillo orbital + teclas WASD (28×26, gap 4, fondo blanco, borde 2.5px, `border-radius 5px`, sombra 2px) + barra `ESPACIO` (92×22, ámbar) + ratón SVG con clic izquierdo carmesí `#e11d48` y derecho cian `#22d3ee` |
| `tutorial_de_rebotes` | `02` | Anillo cian + mira heptagonal (`polygon 48,6 79,21 88,54 67,84 29,84 8,54 17,21`, relleno tinta al 88%, trazo `#22d3ee`) con estrella de 4 puntas `#38bdf8` + ratón con clic derecho cian; además un `dtut-reticle-spotlight` fijo de 140px en el centro con aro `#38bdf8` pulsante (`dtut-pulse 1.35s`) y aro discontinuo cian girando (`dtut-spin 8s`) |
| `tutorial_de_slow_mo` | `03` | Cronómetro SVG (corona ámbar, esfera tinta con trazo cian, arco carmesí de 5px, agujas ámbar/blancas, centro cian) + chip `TIEMPO 0.2x` (tinta/cian con `box-shadow: 3px 3px 0 #fbbf24`, `skewX(-10deg)`) |

Anillo orbital `.dtut-orbit-ring`: 214×148, `border-radius 999px`, borde 2px
`rgba(11,13,18,0.16)`, fondo radial blanco; arcos de 3.5px cian arriba (`rotate(-16deg)`) y carmesí
abajo (`rotate(-12deg)`).

Chips de leyenda `.dtut-chip`: mono 9.5px 900, borde 2px tinta, `padding 3px 7px`, variantes:
por defecto blanco; `--amber` `#fef3c7`; `--crimson` fondo `#ffe4e6`, borde `#e11d48`, texto
`#9f1239`; `--cyan` fondo `#cffafe`, borde `#0891b2`, texto `#155e75`.

Texto: `.dtut-title` 28px 900 itálica mayúsculas; `.dtut-copy` 13.5px/1.48, peso 600, `#1e293b`.
Ambos párrafos provienen de `domeTutorial.<id>.paragraph1/2`.

Botón continuar `.dtut-continue`: fondo tinta, texto papel, borde 2.5px,
`box-shadow: 4px 4px 0 #22d3ee`, `padding 9px 16px`, 12px 800; bloqueado `.is-locked` con
`background #334155`, sombra `#94a3b8` y `opacity .85`; barra de progreso interna de 3px cian
(`transition: width 60ms linear`) que se llena durante el bloqueo; etiqueta de tecla en dorado;
hover (desbloqueado) `translate(-2px,-2px)` con sombra carmesí de 6px; active `translate(1px,1px)`
con sombra cian de 2px.

UX: bloqueo de lectura de `CONTINUE_LOCK_MS = 4000` ms; mientras dura, el botón está `disabled` y
muestra `[Ns]`; al desbloquearse muestra `[ESPACIO]` + `Continuar`. Se descarta con `Espacio`,
`Enter` (listener en captura, `preventDefault` y `stopPropagation`), clic en el botón o Cruz/A del
mando (índice 0, solo en flanco de subida y tras el bloqueo).

---

## 11. `DomeTrainingPanel.tsx` — Panel debug de entrenamiento

`aside` flotante: `absolute right-3 top-3 z-[60] max-h-[94vh] w-[320px] overflow-y-auto
rounded-md border border-cyan-300/40 bg-[#090314]/85 p-3 font-mono text-white
shadow-[0_0_28px_rgba(34,211,238,0.18)] backdrop-blur-md select-none` (glassmorphism oscuro con
halo cian). `aria-label="Panel de entrenamiento (debug)"`.

- Cabecera con borde inferior `white/15`: `Entrenamiento [Debug]` en `text-xs` 900
  `tracking-[0.18em]` cian, `[Debug]` en ámbar; a la derecha `F2 / Tab: ocultar` en 9px
  `text-white/45`.
- Títulos de sección (`SectionTitle`): 10px 900 mayúsculas `tracking-[0.22em]` en
  `text-cyan-200/80`.
- `PanelButton`: `rounded-sm border px-1.5 py-1 text-[10px] font-bold uppercase
  tracking-[0.06em]`; inactivo `border-white/20 bg-white/5 text-white/70` con hover a
  `border-white/50 bg-white/10 text-white`; activo según acento: `cyan`
  (`border-cyan-300/70 bg-cyan-400/20 text-cyan-100`), `rose`, `amber`, `violet` equivalentes.
- Secciones: `Enemigo (8/8)` con rejilla 2 columnas de los 8 arquetipos; botones
  `Reiniciar enemigo` (ámbar) y `Quieto (pasivo)` / `IA activa` (violeta/rosa); `Ranuras 1 / 2 / 3`
  con `+Nv` y `Vaciar`; `Habilidades activas (7)` con botones `→1`, `→2`, `→3`; `Pasivas (3)` con
  botones de nivel `0..3`; `Extras` con `Recargar Vida + Edén (T)` y la nota
  `Nyx inmortal · Edén +25/s · sin oleadas automáticas`.
- Los nombres de habilidades y pasivas usan su `accentColor` como color de texto; el `title`
  (tooltip) lleva la descripción traducida.
- Se muestra con `F2`/`Tab` (alterna y sale del pointer lock al abrir; lo recupera al cerrar si no
  hay otros menús) y permanece visible al abrir la pausa (`training && (debugPanelOpen ||
  isPauseOpen)`). `T` recarga Vida + Edén (`trainingBridgeRef.refillResources()`).

Observación: `ENEMY_LABELS` (mapa de nombres en español) se declara en el archivo pero no se usa; la
UI tira de `ENEMY_I18N_KEYS` + `t()`.

---

## 12. `LeaderboardModal.tsx` — Ranking de la portada

Renderiza dentro de `MenuModalShell` con `accent="#fbbf24"`, título `LEADERBOARD` y subtítulo
`Top 15 pilotos · ranking global vía Base44`.

- Carga `fetchTopLeaderboard(15)` al abrir y en cada recarga (`reloadKey`), con guardia `cancelled`.
- Pie (`footer`): a la izquierda `Sincronizando...` o `n registros` (10px 600 mayúsculas
  `tracking-[0.18em] text-slate-400`); a la derecha botón `RECARGAR` (borde 2px `#0b0b14`,
  `bg-white/10`, 11px 900 `tracking-[0.16em]`, hover `white/20`, deshabilitado con
  `cursor-wait opacity-50`).
- Estados: cargando `CARGANDO RANKING...` (12px 700 `tracking-[0.2em]` cian centrado, `py-10`);
  vacío con dos líneas (`Sin registros todavía.` / `Sé el primero en alcanzar el portal de KRONOS.`).
- Tabla: contenedor `rounded-xl border-2 border-white/10`; cabecera y filas comparten
  `grid-cols-[42px_1fr_64px_64px_1fr_56px] gap-2` con `px-3`
  (columnas: `#`, `Piloto`, `Tiempo`, `Score`, `Estilo`, `Alarmas`; las numéricas a la derecha).
  Cabecera: `bg-white/5`, borde inferior 2px, 9px 900 mayúsculas `tracking-[0.14em] text-slate-400`.
  Filas: 11px, borde `white/5`, `odd:bg-white/[0.03]`.
- Colores de fila: rango `#1` `text-amber-300`, `#2` `text-slate-200`, `#3` `text-orange-300`,
  resto `text-slate-400`; piloto `text-slate-100` con truncado; tiempo `text-cyan-300`; score
  `text-orange-300`; estilo en chip `rounded-full border border-violet-400/40
  bg-violet-500/15 px-2 py-0.5 text-[9px] uppercase text-violet-200` (o `—`); alarmas
  `text-rose-300`.
- Formato de tiempo `m:ss` con `padStart(2, '0')`.

---

## 13. `MobileBlocker.tsx` — Bloqueo en móvil/táctil

Detección: `matchMedia('(pointer: coarse)')` **o** `window.innerWidth < 768`; se recalcula en
`resize`.

- Overlay: `fixed inset-0 z-[100] flex items-center justify-center bg-[#0b0618]/97 p-6`.
- Tarjeta: `max-w-md rounded-2xl border-4 border-yellow-400 bg-[#1a1033] p-8 text-center
  shadow-[10px_10px_0_#000]`.
- Icono: círculo de 64px con borde 4px negro y degradado `from-yellow-300 via-orange-400
  to-violet-600`, `shadow-[4px_4px_0_#000]`.
- Título `SOLO PARA PC` en `text-3xl font-black tracking-wide text-yellow-300`; cuerpo 14px
  `text-slate-300` (explica que es para Teclado + Ratón: Pointer Lock, WASD, Gravity Shift con clic
  derecho); pie 12px `text-slate-400` (`Abre el juego desde un ordenador de escritorio…`).
- No bloquea la carga del juego: se renderiza encima (`z-[100]`) desde `App.tsx`.

---

## 14. Flujos, atajos y feedback consolidados

### 14.1 Navegación general

`App.tsx`: `TitleScreen` (`screen === 'title'`) → si hay tutorial activo se usa `GameHUD` +
`BattleReportScreen`; en caso contrario `DomeGameView` (Cúpula o entrenamiento). `MobileBlocker` se
monta siempre por encima.

`DomeGameView` monta, en este orden de capas: canvas (`cursor-none`, fondo `#040510`) →
`DomeDarkMatterRings` → `DomeHudSketch` → `DomeTrainingPanel` (si procede) → `DomePauseModal` →
`SettingsScreen` → `DomeLevelUpSequence` → `DomeBattleReport` → `DomeTutorialCard`. El aviso de
pointer lock del HUD se oculta cuando hay subida de nivel, informe, pausa, tutorial o panel debug
abiertos; las alertas del HUD se silencian en esos mismos estados.

### 14.2 Tabla de atajos verificada

| Contexto | Tecla / botón | Acción |
|---|---|---|
| Pausa | `1`…`4` | Ejecuta la opción N del menú |
| Pausa (global) | `Escape`, `KeyP` | Abre/cierra la pausa |
| Pausa (global) | Options (mando) | Abre/cierra la pausa |
| Pausa | Círculo/B (mando) | Reanuda |
| Juego | `Escape`, `KeyP` | Pausa (ignorado si hay ajustes/tutorial/subida/informe) |
| Entrenamiento | `F2`, `Tab` | Muestra/oculta el panel debug |
| Entrenamiento | `T` | Recarga Vida + Edén |
| Subida de nivel | `1`…`N` | Elige carta |
| Subida de nivel | `1`…`3` (con carta en vuelo) | Elige ranura a reemplazar |
| Subida de nivel | `Escape` | Vuelve del panel de reemplazo |
| Subida de nivel | D-Pad/stick izq-der + Cruz (A) / Círculo (B) | Navega / confirma / vuelve |
| Informe Cúpula | `1`, `r`, `R` | Jugar de nuevo |
| Informe Cúpula | `2` | Menú principal |
| Informe Cúpula | `Escape` (escribiendo) | `blur()` del input |
| Tutorial | `Espacio`, `Enter`, clic, Cruz/A | Continuar (tras 4 s) |
| Ajustes | `Escape` | Cierra (salvo captura en curso) |
| Ajustes | cualquier `code` (capturando) | Asigna la tecla; `Escape` cancela |
| Ajustes | botón 0…17 (capturando mando) | Asigna el botón; `Escape` cancela |
| Modales de portada | `Escape` / botón `CERRAR` | Cierra |
| Portada | D-Pad/stick + Cruz (A) | Navega y activa el botón enfocado |

Repetición de direcciones con mando: primer movimiento inmediato, luego 320 ms de espera y
repeticiones cada 130 ms; umbral del stick `0.55`.

### 14.3 Feedback visual/sonoro

- **Visual**: cambios de clase en hover/foco (`is-focused`, `is-pad-focus`, `is-on`), sombras que
  crecen, traslaciones de 2–12px, sellos con onda expansiva, `flash` blanco, temblor de carta,
  sacudida de la hoja completa, barridos de iris, líneas de velocidad, halftone y chips invertidos.
- **Sonoro**: la UI de papel solo suena en la subida de nivel (`playLevelUpSpark`,
  `playLevelUpApproach`, `playCardSlam`, `playInkWipe`, `playCardTremble`, `playCardStamp`,
  `playIrisWink`). En portada, pausa, ajustes, informe, tutorial, ranking y panel debug no se
  invoca ningún SFX; la única música es `musicPlayer.play('menu')` al montar la portada, con volumen
  `masterVolume * musicVolume`.
- El audio se desbloquea con cualquier botón del mando (`audio.unlock()` en el bucle) además de con
  ratón/teclado.

---

## 15. Inconsistencias y código muerto observados (verificados)

| Ubicación | Observación |
|---|---|
| `public/character-sheet.html` | `.side`, `.card`, `.swatches`, `.meshes`, `.ability` definidos sin markup; `renderSwatches()`/`renderMeshBreakdown()` vacías; `.pal__name` sin regla CSS |
| `public/character-sheet.html` | `VIEW_DEFS` solo contiene `dynamic`; la rama `frontModel` y el `@media (max-width: 640px)` de 4 vistas quedan sin uso |
| `src/ui/DomeLevelUpSequence.tsx` | `.lu-card__upgrade` sin uso; clases `is-in`/`is-on` sin reglas; claves `levelUp.title`, `.subtitle`, `.chooseHint`, `.slotReplacement`, `.kind.*` no referenciadas |
| `src/ui/DomeTutorialCard.tsx` | El bloqueo de 4 s se aplica por igual a los tres tutoriales; el chip `TIEMPO 0.2x` se pinta con la clase `.dtut-slowmo-badge` |
| `src/ui/DomeTrainingPanel.tsx` | `ENEMY_LABELS` declarado y nunca usado (se usa `ENEMY_I18N_KEYS`) |
| `src/ui/MenuModalShell.tsx` | El botón `CERRAR` no está traducido |
| `src/ui/SettingsScreen.tsx` | Chips `ON`/`OFF` y `ES`/`EN`/`JA` no traducidos; sin navegación por mando |
| `src/ui/BattleReportScreen.tsx` | Pantalla heredada de la campaña con todo el texto fijo en español y estética ajena al sistema papel/tinta |
| `src/index.css` | Tokens shadcn en HSL sobre fondo blanco, sin relación con la paleta del juego; las pantallas del juego sobrescriben fondo y color |

---

## 16. Referencia cruzada

El HUD de la Cúpula (`DomeHudSketch.tsx`, `DomeYinYangHud.tsx`, `DomeDarkMatterRings.tsx`,
`GameHUD.tsx`) y los shaders del arena se documentan en `06_audio_music_ui_i18n.md` y
`05_arena_shaders_vfx.md`; este documento cubre exclusivamente las pantallas y componentes de
interfaz enumerados en el encabezado.

---

