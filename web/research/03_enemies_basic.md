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
