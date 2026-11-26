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
