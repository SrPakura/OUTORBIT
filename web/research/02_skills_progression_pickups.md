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
