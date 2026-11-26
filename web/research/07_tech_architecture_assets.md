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
