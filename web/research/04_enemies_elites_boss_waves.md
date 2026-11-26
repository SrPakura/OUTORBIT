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
