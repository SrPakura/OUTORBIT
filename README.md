# OUTORBIT

**Zero-G roguelite espacial** — un action-adventure 3D en TypeScript puro sobre Three.js: galaxia continua de planetas esféricos, combate con gravedad cero y un modo Cúpula roguelite de oleadas. Construido con React + Vite + Base44.

Pilotas a **Nyx** y su escuadrón de tres personajes intercambiables (1/2/3) a través de cinco mundos: el Prólogo, la selva de **Verdant** (Templos de Jade), el Shogunato Nevado de **Cryo**, la metrópoli cyberpunk de **Bastion** y el asalto final a **Kronos**. Corre, vuela, hace parry, congela enemigos con estasis y encadena Gravity Dashes de planeta a planeta.

**Estado: beta jugable.** Campaña completa (5 niveles), 5 tutoriales jugables, modo Cúpula con progresión roguelite y leaderboard global, y un panel de entrenamiento/debug.

---

## Cómo jugar

### Modos

| Modo | Descripción |
|------|-------------|
| **Campaña** | 5 niveles continuos: Prólogo → Verdant → Cryo → Bastion → Kronos. Combate, sigilo, puzles y el Leviatán Kronos como jefe final. |
| **Tutoriales** | 5 lecciones jugables, una mecánica por nivel: movimiento, estasis, sigilo, escuadrón y gravedad. |
| **Cúpula** | Roguelite de oleadas dentro de una cúpula congelada: sube de nivel eligiendo cartas de habilidades activas y pasivas, sobrevive a los arquetipos enemigos (incluidos el Leviatán Kronos y el Cangrejo Artillero) y sube tu puntuación al leaderboard global. |
| **Entrenamiento / Debug** | Cúpula sin oleadas automáticas: Nyx inmortal, enemigo único intercambiable, skills y pasivas configurables desde el panel debug (F2 / Tab). |

### Controles (teclado y ratón)

| Acción | Tecla |
|--------|-------|
| Moverse | `W` `A` `S` `D` |
| Cámara | Ratón (pointer lock al hacer clic) |
| Saltar / despegar | `Espacio` |
| Sprint | `Shift` |
| Interactuar | `E` |
| Parry | `F` |
| Estasis | `R` (alternativo: `C`) |
| Fijar objetivo (lock-on) | `Q` |
| Personaje del escuadrón | `1` / `2` / `3` |
| Ataque de velocidad / disparo | Clic izquierdo |
| Gravity Dash / redirección | Clic derecho |
| Zoom de cámara | Rueda del ratón |
| Silenciar audio | `M` |
| Pausa | `Esc` |

Todas las teclas son reasignables desde **Opciones → Modificar controles** (se persisten en localStorage).

### Mando

Soporte de mando vía Gamepad API con mapeo W3C estándar: **DualShock 4** (USB/Bluetooth) o cualquier mando genérico. Stick izquierdo mueve a Nyx (WASD analógico), stick derecho gira la cámara, `Options` abre/cierra la pausa. Los botones también son reasignables desde el mismo panel.

> El juego es solo para PC: en pantallas móviles se muestra un aviso de bloqueo.

---

## Cómo ejecutarlo

Requisitos: **Node.js 20+** y npm.

```bash
npm install     # instalar dependencias
npm run dev     # servidor de desarrollo (Vite)
npm run build   # build de producción
npm run preview # previsualizar el build de producción
```

Detalles del build:

- `npm run build` hace dos cosas: empaqueta `src/game/render/nyxAnimator.ts` con esbuild a `public/nyx-animator-bundle.js` (no trackeado por git) y luego ejecuta `vite build` hacia `dist/`.
- Los clips de la marcha (`public/models/nyx_walk_{start,loop,end}.glb`) se generan con `python3 scripts/nyx_walk_clips.py` a partir de los GLB de `animaciones_generadas/procesadas/`: corrige la altura de la cadera para que la suela toque el suelo y renombra los clips.
- Verificación de tipos: `npx tsc --noEmit` (0 errores esperado).
- Los modelos 3D riggeados (`public/models/nyx_rigged.glb` y `public/models/enemies/`) son assets locales **gitignorados** por política de copyright: el repo no los incluye.

---

## Stack técnico

Versiones reales declaradas en `package.json`:

| Paquete | Versión | Uso |
|---------|---------|-----|
| `react` / `react-dom` | ^18.2.0 | UI (menús, HUD, modales) |
| `three` | ^0.187.0 | Motor 3D (render, física, escenas) |
| `typescript` | ^7.0.2 | Lenguaje (strict, sin emit propio) |
| `vite` | ^6.1.0 | Bundler y dev server |
| `@vitejs/plugin-react` | ^4.3.4 | Integración React de Vite |
| `tailwindcss` | ^3.4.17 | Estilos del HUD y menús |
| `postcss` / `autoprefixer` | ^8.5.3 / ^10.4.20 | Pipeline de CSS |
| `@base44/sdk` | ^0.8.63 | Leaderboard global del modo Cúpula |
| `@base44/vite-plugin` | ^1.0.53 | Integración Base44 |
| `lucide-react` | ^0.475.0 | Iconos de UI |
| `@types/react` / `@types/react-dom` | ^19.3.0 | Tipos de React |
| `@types/three` | ^0.187.0 | Tipos de Three.js |

Arquitectura: sin motor de juegos externo — el motor (física esférica, IA, animación procedural, audio sintetizado con WebAudio) es TypeScript propio sobre Three.js. Los modelos de personajes/enemigos son **procedurales** (geometrías Three.js generadas por código, estilo cel-shading); solo Nyx y los jefes usan `.glb` riggeado animado proceduralmente.

---

## Estructura del proyecto

```
OUTORBIT/
├── base44/                  # Configuración Base44 (entidades, auth)
├── public/
│   ├── audio/               # Música del juego (4 mp3, ver "Música y licencias")
│   ├── models/              # .glb de Nyx y enemigos (LOCAL, gitignorado)
│   └── nyx-animator-bundle.js  # Generado por el build (gitignorado)
├── scripts/                 # Utilidades de Blender (Python)
├── src/
│   ├── api/                 # Cliente Base44 + leaderboard
│   ├── components/          # Auth Base44 (login, MFA, rutas protegidas)
│   ├── game/                # MOTOR (ver mapa abajo)
│   ├── i18n/                # Internacionalización es/en (paridad exacta)
│   ├── lib/                 # Utilidades de auth (Base44)
│   ├── pages/               # Páginas de auth (login, registro, MFA...)
│   ├── ui/                  # Pantallas y HUD del juego (ver mapa abajo)
│   ├── App.tsx              # Router: título → juego / auth
│   ├── index.css            # Tailwind + estilos globales
│   └── main.jsx             # Entry point
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Mapa de `src/` — módulo por módulo

Referencia completa para navegar el código (incluye los módulos extraídos en la refactorización de la beta).

### `src/game/` — el motor

| Archivo | Líneas | Qué hace |
|---------|--------|----------|
| `types.ts` | 600 | **Contrato sagrado**: tipos y specs compartidos de todo el motor (planetas, niveles, enemigos, props, estructuras, HUD) + `GAME_CONSTANTS`. No tocar a la ligera. |
| `settings.ts` | 399 | `GameSettings`, bindings reasignables de teclado y mando, persistencia en localStorage, formato de teclas. |
| `GameEngine.ts` | 1464 | Bucle principal de campaña: renderer, cámara orbital, listeners de input, sincronización de HUD, pausa, zoom. |

#### `src/game/entities/`

| Archivo | Líneas | Qué hace |
|---------|--------|----------|
| `WorldObjects.ts` | 4131 | El mundo persistente: planetas, estructuras, props, spawning de enemigos, combate, estasis, hazards, NPCs, lock-on y FX. Colliders particionados por `planetId` (buckets `Map` con getters por planeta). |
| `PlayerController.ts` | 2389 | FSM de Nyx en campaña: suelo, vuelo zero-G, dashes, parry, estasis, escuadrón, colisiones. |
| `enemyAI.ts` | 1451 | **NUEVO (refactor)**: sistema de IA de los enemigos de campaña (`EnemyAISystem` + interfaz `EnemyAIHost`), extraído de WorldObjects. Constantes de tuning exportadas. |

#### `src/game/dome/` — modo Cúpula

| Archivo | Líneas | Qué hace |
|---------|--------|----------|
| `domeTypes.ts` | 139 | Tipos compartidos del modo: `DomeHudState` (incluye destello de Edén), `SlabCollider`, `SlabRaycastHit`, `TestEnemySphere`, constantes de límites. |
| `NyxDomeController.ts` | 2561 | Controlador de Nyx dentro de la Cúpula: input, acciones, modos de física (flotar/suelo), colisiones con slabs, cámara spring-arm con slerp de horizonte, y físicas de flujo (derrape aéreo, landing slide, ledge glance, touch-and-go). |
| `DomeWaveManager.ts` | 2069 | Oleadas: arquetipos, spawning, proyectiles, poses de enemigos. Delega la IA de jefes en los módulos `dome*Behavior`. |
| `domeKronosBehavior.ts` | 497 | **NUEVO (refactor)**: IA del Leviatán Kronos de la Cúpula (contexto `KronosBehaviorContext`). |
| `domeCrabBehavior.ts` | 621 | **NUEVO (refactor)**: IA del Cangrejo Artillero (contexto `CrabBehaviorContext`). |
| `domeEnemyOrient.ts` | 40 | **NUEVO (refactor)**: orientación de enemigos dome (`lookAtQuat`, `faceTowards`), deduplicada de 5 poses repetidas. |
| `DomeCombatSystem.ts` | 421 | Daño, HP, atribución de golpes, regla de espinas (`THORNS_DAMAGE_TO_NYX`). |
| `DomeProgression.ts` | 551 | Progresión roguelite: niveles, elección de cartas, catálogos de skills activas y pasivas. |
| `DomeSkills.ts` | 1384 | Habilidades activas: campo gravitacional, wells, rocas, y el trío visual de área (anillo de suelo proyectado + cúpula iridiscente + giro 0G). |
| `DomePickups.ts` | 232 | Pickups de XP, Edén y vida, con callback `onCollect` para la llamarada de absorción. |
| `DomeRunStats.ts` | 222 | `DomeRunTracker` (estadísticas de la run) + envío al leaderboard vía Base44. |
| `DomeFloatingSlabs.ts` | 445 | Plataformas flotantes de la arena (pool con colliders). |
| `DomeSphereTiles.ts` | 475 | Suelos esféricos por modo de oleada (basic/miniboss/boss). |
| `DomeSlabs.ts` | 636 | Gestión de slabs del suelo básico y `raycastSlabs` (caja y malla exacta, con `out` reutilizable para evitar allocations). |
| `DomeSlabGeometry.ts` | 467 | Geometrías de los slabs. |
| `DomeEnemyModels.ts` | 650 | Modelos procedurales de los arquetipos enemigos de la Cúpula. |
| `MotionVfx.ts` | 842 | VFX de movimiento: pools preasignados de chispas y polvo, anillos (barrera, ruptura sónica), trazos de viento 3D, aura de velocidad terminal, estela gravitatoria, llamarada de absorción y telémetro de aterrizaje. |
| `domeArenaScene.ts` → en `render/` | 1804 | Ver `render/domeArenaScene.ts`. |

#### `src/game/render/`

| Archivo | Líneas | Qué hace |
|---------|--------|----------|
| `toonMaterials.ts` | 612 | Materiales toon/cel-shading compartidos (`createToonMaterial`), GLSL de outline. |
| `meshFactory.ts` | 105 | **NUEVO (refactor)**: helpers de malla compartidos y deduplicados: `toonMesh`, `celMesh`, `glowMesh`, `additiveGlowMaterial`, `hashString`, `lighten`, `makeSeededRandom`, `mulberry32`. |
| `proceduralModels.ts` | 67 | **Barril de re-exportación** de `models/`: conserva la API histórica (`buildCharacterModel`, `buildEnemyModelBySkin`, `buildPlanetModel`, etc.) para que los consumidores no cambien. |
| `cityModels.ts` | 829 | Props de ciudad (`buildCityPropMesh`). |
| `domeArenaScene.ts` | 1804 | Backdrop de la Cúpula: shaders GLSL (niebla, estrellas), materiales y montaje de la escena de arena. |
| `nyxModelLoader.ts` | 234 | Carga de `public/models/nyx_rigged.glb` (`loadNyxRigged`, tipo `LoadedNyx`) y uniforms `uGravityShift`/`uSpeed01` del shader de Nyx. |
| `nyxAnimator.ts` | 922 | Animator procedural de Nyx (se empaqueta aparte con esbuild). |
| `nyxAnimsGrounded.ts` | 320 | Clips de animación en suelo (idle, correr, saltar). |
| `nyxAnimsCombat.ts` | 347 | Clips de combate (disparo, parry, daño). |
| `nyxAnimsSkills.ts` | 236 | Clips de habilidades (estasis, dash). |
| `nyxAnimsTraversal.ts` | 243 | Clips de traversal (vuelo, aterrizaje). |
| `enemyAnimator.ts` | 632 | Animación procedural de enemigos (squash & stretch, telegraphs). |
| `menuShaders.ts` | 171 | Shaders del fondo del menú/título. |

#### `src/game/render/models/` — **NUEVO (refactor)**: los 17 módulos de modelos procedurales

Antes era un único `proceduralModels.ts` de 4.778 líneas; ahora cada familia temática vive en su módulo:

| Archivo | Líneas | Qué hace |
|---------|--------|----------|
| `modelParts.ts` | 81 | Piezas anatómicas compartidas: `buildEyes`, `buildLimb`, `buildShadowHalo`, `buildThrusterGlow`. |
| `characterModel.ts` | 538 | El escuadrón cabezón estilo Animal Crossing: `buildCharacterModel` (Nyx, Axel, Digger...), paletas, skins temáticas. |
| `npcModel.ts` | 115 | NPC amigable con boina y bocadillo `[E]`: `buildNpcModel`. |
| `planetModel.ts` | 324 | Planetas esféricos con biomas: `buildPlanetModel`. |
| `guardFaction.ts` | 585 | Facción base de la Red de IA: `buildGuardModel`, `buildOfficerModel`, `buildDroneModel`, `buildTurretModel`, `buildBruteModel` + `GUARD_UNIFORM`. |
| `beastEnemies.ts` | 524 | Animales de la selva de Verdant: pantera, mono, gorila, avispa. |
| `shogunateEnemies.ts` | 355 | Samuráis y onis del Shogunato Nevado (Cryo). |
| `cyberEnemies.ts` | 516 | Cibernéticos de Neon Bastion: cyber guard, drone, mech. |
| `enemyRegistry.ts` | 62 | Despachador `buildEnemyModelBySkin`: instancia por skin con fallback al modelo del kind. |
| `bossKronos.ts` | 166 | `buildKronosModel`, el Leviatán jefe final. |
| `verdantProps.ts` | 592 | Props de selva y aldea feudal: árboles, templos de jade, flora interactiva. |
| `cryoIronProps.ts` | 127 | Props de hielo e industriales de Cryo. |
| `cyberProps.ts` | 185 | Props cyberpunk de Neon Bastion (neones, hologramas). |
| `propRegistry.ts` | 112 | Despachador de props por `PropKind` (`buildPropMesh`). |
| `structures.ts` | 336 | Estructuras con colisión: `buildStructureMesh`, puertas, palancas, muros rompibles. |
| `signaling.ts` | 154 | Señalización: balizas, haces de luz, conos de visión, cinturón interceptor. |
| `puzzleObjects.ts` | 235 | Objetos de puzle: interruptores, palancas, puertas bloqueadas. |

#### `src/game/math/`

| Archivo | Líneas | Qué hace |
|---------|--------|----------|
| `spherical.ts` | 548 | Matemática esférica: orientación sobre planetas (`orientObjectOnSphere`), conversiones de coordenadas. |
| `terrain.ts` | 299 | Altura de terreno por bioma (`getPlanetTerrainOffset`). |

#### `src/game/levels/`

| Archivo | Líneas | Qué hace |
|---------|--------|----------|
| `tutorialDefinitions.ts` | 1168 | Los 5 tutoriales jugables (tut-mov, tut-stasis, tut-stealth, tut-squad, tut-grav): spawns, objetivos y triggers. |

#### `src/game/sandbox/`

| Archivo | Líneas | Qué hace |
|---------|--------|----------|
| `SandboxManager.ts` | 833 | Sandbox del diorama del título: retos, coleccionables (monedas y orbes estrella). |

#### `src/game/ai/`

| Archivo | Líneas | Qué hace |
|---------|--------|----------|
| `AdaptationDirector.ts` | 103 | Director de adaptación de dificultad según el comportamiento del jugador. |
| `BehaviorTracker.ts` | 152 | Tracker de patrones de juego (muertes, estasis, sigilo). |
| `KronosNeuralNet.ts` | 248 | Red neuronal del Leviatán Kronos en campaña. |

#### `src/game/audio/` y `src/game/input/`

| Archivo | Líneas | Qué hace |
|---------|--------|----------|
| `audio/SynthAudio.ts` | 540 | Audio 100% sintetizado con WebAudio (sin assets de sonido): disparos, impactos, y las alertas del HUD (vida baja, Edén bajo, subida de nivel, oleada nueva). |
| `audio/MusicPlayer.ts` | 158 | Reproductor de música con crossfade entre dos elementos `<audio>`, mute global y multiplicador de volumen. Singleton `musicPlayer`. |
| `input/GamepadInput.ts` | 181 | Gamepad API con mapeo W3C (DualShock 4 y genéricos). |

### `src/ui/` — pantallas y HUD

| Archivo | Líneas | Qué hace |
|---------|--------|----------|
| `TitleScreen.tsx` | 171 | Pantalla de título con menú principal (campaña, tutoriales, cúpula, opciones). |
| `TitleDioramaSandbox.ts` | 484 | Diorama 3D del título con el sandbox jugable de fondo. |
| `GameHUD.tsx` | 1197 | HUD de campaña, memoizado por secciones (refactor): vida, estasis, escuadrón, retícula, prompts. |
| `ControlsModal.tsx` | 459 | Panel de opciones y reasignación de controles (teclado + mando). |
| `LeaderboardModal.tsx` | 129 | Leaderboard global del modo Cúpula. |
| `BattleReportScreen.tsx` | 353 | Informe de fin de campaña. |
| `DomeGameView.tsx` | 293 | Vista del modo Cúpula: React puro (estado, handlers, JSX). El runtime vive en `domeGameLoop.ts`. |
| `domeGameLoop.ts` | 842 | **NUEVO (refactor)**: runtime del modo Cúpula (`startDomeGameLoop`): renderer, escena, oleadas, input, tick y limpieza. Recibe refs y setters por parámetro y devuelve el dispose. |
| `DomeHudSketch.tsx` | 477 | HUD del modo Cúpula: compone el HUD yin-yang, el visor central, los slots de habilidad, los rayos radiales de velocidad terminal y el sheen de recarga. |
| `DomeYinYangHud.tsx` | 572 | **NUEVO**: HUD yin-yang de vida/Edén (canvas WebGL con shader propio) + anillo de EXP de 96 marcas + barra NV./OLEADA. Dispara las alertas sonoras de vida baja, Edén bajo, subida de nivel y oleada nueva. |
| `DomePauseModal.tsx` | 217 | Pausa del modo Cúpula. |
| `DomeBattleReport.tsx` | 260 | Informe de combate de la Cúpula (game over + envío de puntuación). |
| `DomeTrainingPanel.tsx` | 284 | Panel debug de entrenamiento (F2 / Tab). |
| `FluidLevelUpModal.tsx` | 408 | Modal de subida de nivel con elección de cartas. |
| `MobileBlocker.tsx` | 45 | Aviso de "solo PC" en pantallas móviles. |

### `src/i18n/`, `src/api/`, `src/components/`, `src/pages/`, `src/lib/`

| Carpeta | Qué hace |
|---------|----------|
| `src/i18n/` | `index.ts` (hook `useI18n`) + `es.json`, `en.json` y `ja.json` con **paridad exacta de claves** (248). Si tocas UI con traducciones, mantén la paridad. |
| `src/api/` | `base44Client.js` (cliente Base44) y `leaderboard.ts` (API del leaderboard). |
| `src/components/` + `src/pages/` + `src/lib/` | Boilerplate de auth de Base44: login, registro, MFA, OAuth, rutas protegidas. |

---

## Música y licencias

Cuatro pistas en `public/audio/` (mp3, ~15 MB en total), servidas como estáticas y reproducidas por `src/game/audio/MusicPlayer.ts` con crossfade de ~1 s entre dos elementos `<audio>`:

| Archivo | Pista original | Cuándo suena |
|---------|----------------|--------------|
| `menu.mp3` | OUTORBIT Weightless Piano Solo | Pantalla de título y menús |
| `wave-nocturnal.mp3` | Nocturnal Acceleration | Oleadas básicas y de miniboss (rota con la siguiente) |
| `wave-singularity.mp3` | Singularity Rush | Oleadas básicas y de miniboss (rota con la anterior) |
| `boss.mp3` | Collapse of the Infinite | Oleada de jefe |

Las dos pistas de oleada se alternan en cada oleada nueva para que no se repita la misma melodía dos veces seguidas. El volumen de la música sigue al ajuste `masterVolume` y se silencia con `M` (junto con los SFX). Si el navegador bloquea el autoplay, la pista queda pendiente y arranca en el primer clic o tecla.

### Licencias

Las licencias de estas cuatro pistas son **para siempre**. Además, durante los **próximos 10 meses** están **100 % licenciadas**: son más seguras que nunca y se pueden usar sin ninguna restricción. Pasados esos 10 meses dejan de estar licenciadas, pero existe un **trato de condiciones por el que Google no reclamará** su uso. En resumen: uso perpetuo garantizado, con una ventana de 10 meses de cobertura total y un acuerdo posterior que cubre el resto.

---

## Notas para desarrollar

- Verificación tras cada cambio: `npx tsc --noEmit` (0 errores) y `npm run build` (exit 0).
- El warning de Vite "chunk larger than 500 kB" es esperado: Three.js va en el bundle.
- `src/game/types.ts` es el contrato central del motor: cambiar un tipo ahí afecta a todo el juego.
- Assets 3D (`public/models/`) y la carpeta `referencias y base/` están gitignorados por política de copyright: no subas su contenido al repo.
