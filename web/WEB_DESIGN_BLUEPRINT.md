# OUTORBIT — Blueprint de Diseño, Dirección Artística y Arquitectura Web

> Documento maestro de diseño y arquitectura para la web oficial de **OUTORBIT** (`outorbit.pakura.dev`, alojada en Cloudflare Pages desde `web/`).  
> Todos los datos numéricos, mecánicas, nombres de clips, shaders, paletas y rutas proceden exclusivamente de la documentación verificada en `web/research/01`–`08`.

---

## 1. Concepto y Narrativa Visual: *El Filo entre el Papel y el Vacío*

OUTORBIT vive en la tensión entre dos lenguajes visuales opuestos que conviven en el juego real:

1. **El mundo editorial de los menús y las decisiones** (`TitleScreen`, `DomePauseModal`, `DomeLevelUpSequence`, `DomeBattleReport`, `SettingsScreen`, `DomeTutorialCard`, `character-sheet.html`):
   - Papel cálido (`#f1f1ed`) y papel de panel (`#fbfbf8`).
   - Rejilla técnica de `96px` (`rgba(11,13,18,0.06)`) y retícula fina de `16px`.
   - Tramas halftone radiales, líneas de velocidad (`repeating-conic-gradient`), bordes sólidos de tinta (`#0b0d12`, `2px–3px`), sombras duras sin blur (`3px` a `14px`), sesgos diagonales (`skewX(-5deg)` a `skewX(-12deg)`) con contra-sesgo interior, y tipografía itálica pesada con `-webkit-text-stroke`.
2. **La Arena de la Cúpula** (`domeArenaScene.ts`, `nyxModelLoader.ts`, `DomeEnemyModels.ts`):
   - Vacío abisal (`#05010f`), bóveda espacial (`#040510 → #0c1430 → #1e1038`), nebulosas FBM y estrellas de 4 puntas.
   - Material *Cosmic Nebula* en Nyx (`#090314` / `#7e22ce` / `#06b6d4` / rim `#f8fafc`) y carne nebulosa semitransparente en los enemigos con `star_core` dorado (`#ffcc33`) en su interior y contorno *Inverted Hull* blanco vibrante.
   - Acentos del HUD Yin-Yang (`#3be8ff`) y de la Barrera Blanca (`88.6 m`).

### Hilo conductor de la Landing
La web utiliza el **Divisor Líquido (`menuShaders.ts`)** como puente narrativo:
- **En el Hero (§1)** se replica la composición de `TitleScreen`: papel `#f1f1ed` a la izquierda y cosmos `#05010f` con Nyx en 3D a la derecha, separados por un filo vivo de tinta `#0b0d12` con estela carmesí (`#e11d48`) → violeta (`#7c3aed`) → cian (`#22d3ee`) y trama halftone.
- **Durante el scroll**, las secciones alternan **láminas de Papel/Tinta** (mecánicas, simulador cinético, cartas de habilidades, controles, créditos) con **cámaras de Cosmos** (visor 3D de Nyx y los 8 enemigos, módulo de audio OST e i18n), conectadas por cortes diagonales y marcas técnicas en monospace.

---

## 2. Sistema de Diseño Canónico (Tokens Exactos del Juego)

### 2.1 Paleta de Colores

| Token | Hex | Uso exacto en la web |
|---|---|---|
| `--paper` | `#f1f1ed` | Fondo de secciones editoriales, tarjetas de tutorial y núcleo de `FluidInkButton` |
| `--panel` | `#fbfbf8` | Superficie de paneles, cartas de habilidades y tarjetas de estadísticas |
| `--ink` | `#0b0d12` | Texto principal sobre papel, bordes `2px–3px`, chips invertidos, sombras duras |
| `--ink-soft` | `#2a2f3d` | Descripciones y texto secundario sobre papel |
| `--void` | `#05010f` | Fondo principal de secciones espaciales, visor 3D y footer |
| `--void-deep` | `#040510` | Base inferior de la bóveda espacial |
| `--void-panel` | `#0d0a1f` | Paneles oscuros sobre el vacío (reproductor OST, specs en visor 3D) |
| `--crimson` | `#e11d48` | Acento primario: slashes, sellos, sombras de títulos, alertas Boss |
| `--cyan` | `#22d3ee` | Acento cinético: Sentadilla Cinética, valores técnicos, foco activo |
| `--cyan-hud` | `#3be8ff` | Acento del HUD Yin-Yang y aro de EXP |
| `--gold` | `#fbbf24` | Estrellas dorsales (`0xffcc33` en 3D), rareza legendaria (`#ffd992`), ranking |
| `--violet` | `#7c3aed` | Parada intermedia de `FluidInkButton`, nebulosa de Nyx, habilidades épicas (`#df9fff`) |

**Colores de acento por habilidad (`DomeProgression.ts`)**:
- `gravity_field`: `#7ae8dc` (`base`)
- `repulse_push`: `#42bde8` (`common`)
- `eden_absorb`: `#7dffa8` (`common`)
- `attraction_well`: `#42bde8` (`common`)
- `bounce_horizon`: `#df9fff` (`epic`)
- `black_hole`: `#df9fff` (`epic`)
- `implosion`: `#ffd992` (`legendary`)
- Pasivas: `speed_force` `#ffd992`, `eden_regen` `#df9fff`, `hp_regen` `#7dffa8`.

### 2.2 Tipografía

| Uso | Stack exacto | Estilo |
|---|---|---|
| Títulos cómic / papel | `"Helvetica Neue", Helvetica, Arial, "Noto Sans JP", sans-serif` | `font-weight: 900`, `italic`, `letter-spacing: -0.04em` a `-0.06em`, `line-height: 0.85–0.94` |
| Títulos huecos (firma) | Mismo stack | `color: transparent`, `-webkit-text-stroke: 3px #0b0d12` (o `3.5px`/`4px`), `text-shadow: 7px 7px 0 rgba(225,29,72,0.3)` |
| Cifras HUD / velocidad / oleadas | `'Barlow Condensed', 'Noto Sans JP', sans-serif` | `700 / 800 / 800i`, `font-variant-numeric: tabular-nums` |
| Kickers, tags, chips, specs | `ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace` | `800`, mayúsculas, `letter-spacing: 0.14em–0.36em` |
| Cuerpo legible | `'Inter', 'Noto Sans JP', system-ui, sans-serif` | `400 / 500 / 600` |

### 2.3 Patrones Visuales Reutilizables (CSS)

1. **Rejilla de papel (`96px`)**:
   ```css
   background-color: #f1f1ed;
   background-image:
     linear-gradient(rgba(11, 13, 18, 0.06) 1px, transparent 1px),
     linear-gradient(90deg, rgba(11, 13, 18, 0.06) 1px, transparent 1px);
   background-size: 96px 96px;
   ```
   *(En la lámina de ficha técnica / visor se puede añadir la sub-rejilla fina de `16px` a `rgba(11,13,18,0.03)`, igual que `character-sheet.html`.)*

2. **Líneas de velocidad (`speedlines`)**:
   ```css
   background: repeating-conic-gradient(
     from 0deg at 50% 42%,
     transparent 0deg 5.2deg,
     rgba(11, 13, 18, 0.05) 5.2deg 5.9deg
   );
   mask-image: radial-gradient(circle at 50% 42%, transparent 24%, #000 80%);
   ```

3. **Estallido halftone**:
   ```css
   background-image: radial-gradient(rgba(11, 13, 18, 0.13) 2.2px, transparent 2.4px);
   background-size: 14px 14px;
   mask-image: radial-gradient(circle, #000 0%, transparent 60%);
   ```

4. **Botones de papel**:
   - `border-radius: 0` (nunca redondeados en papel).
   - `background: #fbfbf8; border: 3px solid #0b0d12; transform: skewX(-6deg); box-shadow: 6px 6px 0 var(--accent);`
   - Hover: `translateY(-2px)` o `translateX(8px)` con sombra engordada a `10px 10px 0 var(--accent)`.
   - Active: `box-shadow: 4px 4px 0 var(--accent)`.

---

## 3. Estructura Detallada de Secciones (7 Bloques)

### Navegación Fija Superior (`Navbar.tsx`)
- Barra compacta que combina borde de tinta y fondo translúcido oscuro/papel según scroll:
  - Izquierda: Mini-logo `OUT` + `ORBIT` (`#e11d48`).
  - Centro: Enlaces ancla (`#intro`, `#combat`, `#bestiary`, `#arsenal`, `#audio`, `#credits`).
  - Derecha:
    - Mini-control de audio OST (`Play/Pause` + nombre de pista actual o `MUTE`).
    - Selector de idioma (`ES | EN | JA`) sincronizado con el diccionario web.
    - Botón compacto `JUGAR →` (`https://outorbit-68425086.base44.app`).

---

### §1 · Hero + Introducción General (*"ZERO-G ROGUELIKE"*)

**Objetivo:** Impacto inmediato idéntico a la portada del juego + explicación clara de qué es OUTORBIT en menos de 10 segundos.

- **Layout**: `min-h-screen` dividido visualmente por el **Divisor Líquido** (`menuShaders.ts`).
  - **Lado izquierdo (Papel `#f1f1ed`, ~42% en desktop arriba → ~25% abajo, en móvil apilado arriba)**:
    - Tag superior sesgado (`skewX(-8deg)`): `ZERO-G ROGUELIKE` + barra carmesí de `3px` (`skewY(-1deg)`).
    - Título principal: `OUT` (`#0b0d12`, sombra `5px 5px 0 #e11d48`) + `ORBIT` (`#e11d48`, sombra `5px 5px 0 #0b0d12`).
    - **Introducción general (copy verificado)**:
      > Combate espacial arcade en 3D dentro de una cúpula geodésica de **90 metros** en gravedad cero. Pilota a **Nyx**, encadena dashes, rebotes cinéticos en pared y patadas taladro a más de **34 m/s** para atravesar la carne nebulosa de las oleadas y destruir la estrella interior de cada enemigo.
    - **3 chips de datos rápidos**:
      - `ARENA ESFÉRICA 90M`
      - `FÍSICA CINÉTICA 0G`
      - `OPEN SOURCE · THREE.JS`
    - **CTAs**:
      - `FluidInkButton` (altura `116`, paradas `['#e11d48', '#7c3aed', '#22d3ee']`) → **JUGAR EN NAVEGADOR** (`https://outorbit-68425086.base44.app`, `target="_blank"`).
      - Botón secundario papel/tinta → **EXPLORAR BESTIARIO 3D** (scroll a `#bestiary`).
      - Botón terciario → **GITHUB** (`https://github.com/SrPakura/OUTORBIT`).
  - **Lado derecho (Cosmos `#05010f`)**:
    - Escena Three.js en tiempo real (`HeroCanvas.tsx`) con la bóveda espacial (`#040510 → #0c1430 → #1e1038`), partículas de estrellas de 4 puntas (`0x22d3ee, 0xf8fafc, 0xfbbf24, 0xf43f5e`) y `nyx_rigged.glb` flotando con el shader *Cosmic Nebula* (`#090314`, `#7e22ce`, `#06b6d4`, rim `#f8fafc`) y su contorno blanco.
  - **Esquina inferior izquierda**: Selector de idioma (`ESPAÑOL / ENGLISH / 日本語`) con el estilo exacto de `TitleScreen.tsx` (`-skew-x-12`, `border-2 border-[#0b0d12]`, activo `#0e7490`).

---

### §2 · Combate Cinético, Física 0G y la Cúpula

**Objetivo:** Explicar por qué OUTORBIT se siente único al jugarse, usando las cifras reales del motor (`NyxDomeController.ts`, `DomeCombatSystem.ts`, `nyxKineticBounce.ts`) y un simulador interactivo.

- **Fondo**: Lámina de papel `#f1f1ed` con rejilla `96px` y líneas de velocidad sutiles.
- **Cabecera**: Kicker `SISTEMA CINÉTICO · NYXDOMECONTROLLER` + Título hueco `-webkit-text-stroke: 3px #0b0d12`: `LA VELOCIDAD ES TU ARMA`.

#### Bloque 2A · Simulador Interactivo del Visor y Penetración (`KineticMeter.tsx`)
Un widget interactivo en panel `#fbfbf8` con borde `3px #0b0d12` y sombra `8px 8px 0 #22d3ee`:
- **Slider de velocidad de Nyx**: `0.0 m/s` a `34.0 m/s` (con botones rápidos de presets: `Caminar 2.0`, `Sprint 7.4`, `Rebote mín. 12.0`, `Umbral Taladro 18.0`, `Gravity Kick 23.5`, `Dash 31.0`, `Taladro Espiral 34.0`).
- **Visor SVG en vivo** (réplica fiel de `DomeHudSketch.tsx`, `RETICLE_SIZE_PX = 120`):
  - Octógono exterior que se cierra con la velocidad (`scale(1 - min(0.08, speed * 0.003))`).
  - Arcos giroscópicos rotando y estrella central de 4 puntas que cambia de estado visual:
    - `< 12 m/s`: Blanco (`#ffffff`) — desplazamiento / patada normal.
    - `12.0 – 17.9 m/s`: Azul claro (`#7fd8ff`) — **Sentadilla Cinética disponible** (`TRIGGER_SPEED = 12.0 m/s`).
    - `≥ 18.0 m/s`: **Patada Taladro activa** (`DRILL_SPEED_THRESHOLD = 18.0 m/s`) — fuerza multiplicada por **`×1.55`** (`DRILL_FORCE_MULTIPLIER`).
- **Tabla de penetración en vivo** (calculada con `kineticForce = speed * (speed >= 18 ? 1.55 : 1.0)`):
  - Muestra en tiempo real qué grosores de carne (`fleshThickness`) penetra directamente (`PENETRA ESTRELLA ×2.2`) y en cuáles rebota desgastando carne (`DESGASTA CARNE ×0.18`):
    - Mariposa Relámpago (`8`) · Célula Abisal (`15`) · Cangrejo Artillero (`35`) · Pulpo Espiral (`55`) · Prisma Necroz (`65`) · Gólem Rompesuelos (`80`) · Gorrión Gigante (`85`) · KRONOS (`90`).

#### Bloque 2B · 4 Tarjetas de Mecánicas Clave
Grid `2×2` de paneles `#fbfbf8` con barra lateral/superior de acento:
1. **6 Modos de Movimiento**:
   - `grounded` (adherida a cualquier cara de losa, incluso boca abajo: `2.0 / 7.4 / 10.0 m/s`).
   - `floating` (0G con inercia espacial, tope suave `28.0 m/s`, curva centrípeta y derrape aéreo).
   - `dashing` (Clic Derecho: `31.0 m/s` durante `0.36 s`, coste `3` Edén, redirigible).
   - `speed_attack` (Clic Izquierdo: `gravity_kick` `23.5 m/s`, `spiral_drill_kick` `34.0 m/s`, o `void_fall` sin objetivo hasta `33.0 m/s`).
   - `kick_recover` (frenado en el aire con 1–2 `kick_flip` que cuenta como redirección perfecta).
   - `kinetic_bounce` (**Sentadilla Cinética**: apunta a una losa a `≤ 42 m` y `≥ 12 m/s`, pulsa Clic Derecho → absorbe `0.16 s` y relanza a `0.12 s` conservando el **100 %** de la velocidad y **0 coste de Edén**).
2. **Slow-Mo Táctico & Hit-Stop**:
   - **Redirección (`0.25×`)**: ventana calculada de `1.25 s – 2.6 s` si el enemigo esquiva o se rompe el lock.
   - **Bullet-Time (`0.25×`)**: `1.6 s` reales al cancelar ataque con dash lateral/trasero.
   - **Parry del Gólem (`0.10×`)**: cámara ultralenta para hacer dash hacia su estrella y rematar la cabeza (`-35 % HP`).
   - **Hit-Stop**: congelación física de `42–120 ms` al conectar golpes o romper estrellas.
3. **Economía de Vida, Edén y Touch-and-Go**:
   - Base `100 HP / 100 Edén` (`+5 %` y curación completa al subir de nivel; `×2` en **Modo Fácil**).
   - El Edén se drena al propulsarse en 0G (`1/s`), dashear (`3`) o atacar (`2/s`), y regenera en suelo o reposo (`1%/s` base).
   - **Touch-and-Go**: aterrizar a `> 3 m/s` sobre una losa recupera **`+12 %` de Edén** (`2.5 s` de cooldown por losa).
4. **La Cúpula Geodésica y la Barrera Blanca**:
   - Radio de arena `90 m`, barrera de juego `88.6 m`.
   - 10 losas flotantes arrancadas (`DomeFloatingSlabs`) que cruzan la esfera por cuerdas orbitales (`2.2–4.2 m/s`) y se fragmentan en escombros absorbibles.
   - Chocar contra la barrera quita **10 HP** a Nyx, pero **mata al instante** a cualquier enemigo no-élite/no-boss empujado contra ella.

---

### §3 · Protagonista y Bestiario 3D Interactivo (*"Nyx & Los 8 Arquetipos"*)

**Objetivo:** Sección estrella de la web. Inspirada en `public/character-sheet.html`, permite inspeccionar en 3D a Nyx y a los 8 enemigos reales con sus shaders, animaciones y datos de combate verificados.

- **Fondo**: Cosmos `#05010f` con textura sutil de retícula espacial (`cosmic-grid`).
- **Cabecera**: Tag `BESTIARIO DE LA CÚPULA · 9 MODELOS GLB` + Título blanco con sombra `#22d3ee`: `PROTAGONISTA Y AMENAZAS`.

#### Layout del Módulo
1. **Selector de Entidad (Barra superior / lateral)**:
   - **Grupo 1 · Protagonista**: `NYX`
   - **Grupo 2 · Oleadas Básicas**: `Célula Abisal` · `Cangrejo Artillero` · `Pulpo Espiral` · `Gólem Rompesuelos` · `Mariposa Relámpago`
   - **Grupo 3 · Élites y Boss**: `Gorrión Gigante (Ol. 5)` · `Prisma Necroz (Ol. 10)` · `Leviatán KRONOS (Ol. 15)`
2. **Visor 3D Central (`ModelViewer3D.tsx`)**:
   - Un único `WebGLRenderer` (`antialias: true`, `alpha: true`, `dpr <= 2`, `FOV = 30`), pausado cuando sale del viewport.
   - `OrbitControls` (`enableDamping`, `dampingFactor: 0.075`, `enablePan: false`, límites polares `0.25..π-0.25`).
   - **Controles específicos para NYX**:
     - Selector de sus **3 paletas cósmicas reales**:
       - `RAVEN NEBULA` (defecto): `#090314` / `#7e22ce` / `#06b6d4` / rim `#f8fafc`
       - `VOID COSMOS`: `#070518` / `#4c1d95` / `#e11d48` / rim `#ffffff`
       - `SOLAR RIFT`: `#120614` / `#be123c` / `#f59e0b` / rim `#ffffff`
     - Toggles: `TINTA BLANCA` (Inverted Hull `0.015 / 0.011 / 0.008`), `ROTACIÓN AUTO`.
   - **Controles específicos para Enemigos**:
     - Shader `enemyNebula` con su rim por arquetipo (`#f59e0b` Célula, `#c084fc` Pulpo, `#38bdf8` Mariposa, `#ff2a9d` Cangrejo/Gólem) + malla interior `star_core` (`0xffcc33`) visible a través de la carne + contorno de tinta blanca vibrante.
     - Selector de **clips de animación reales** extraídos del `.glb` (`AnimationMixer` con crossfade `0.12 s`), por ejemplo:
       - Célula (8 clips): `cell_idle_float`, `cell_sneak_loop`, `cell_flee_loop`, `cell_windup`, `cell_lunge`, `cell_recover`, `cell_duplicate`, `cell_hit`.
       - Cangrejo (10 clips): `crab_idle_breathe`, `crab_scuttle_loop`, `crab_jump_launch`, `crab_jump_air_loop`, `crab_jump_land`, `crab_laser_charge`, `crab_laser_fire_loop`, `crab_burst_shoot`, `crab_kamikaze_prime`, `crab_hit`.
       - Pulpo (7 clips): `octopus_idle_observe`, `octopus_pre_dash_ready`, `octopus_dash_propel`, `octopus_shoot_ball`, `octopus_giant_charge`, `octopus_counter_parry`, `octopus_hit`.
       - Gólem (10 clips): `golem_helicopter_loop`, `golem_block_start`, `golem_block_loop`, `golem_block_end`, `golem_brute_punch`, `golem_thin_spiral`, `golem_thick_spiral`, `golem_exhausted_loop`, `golem_hit`, `golem_parried_head_hit`.
       - Mariposa (6 clips): `butterfly_fast_flap`, `butterfly_electric_dash`, `butterfly_dash_pivot`, `butterfly_shoot_ball`, `butterfly_lightning_beam`, `butterfly_hit`.
       - Gorrión (8 clips): `sparrow_chase_fly`, `sparrow_wild_flap`, `sparrow_hard_brake`, `sparrow_shriek`, `sparrow_air_ball`, `sparrow_air_drill`, `sparrow_crash_stun`, `sparrow_hit`.
       - Prisma Necroz (7 clips): `necroz_idle_fresh`, `necroz_idle_lazy`, `necroz_sloth_collapse`, `necroz_shield_build`, `necroz_defensive_spikes`, `necroz_summon_dome_spikes`, `necroz_hit`.
       - KRONOS (5 clips): `kronos_swim_idle`, `kronos_rings_telegraph`, `kronos_tail_whip`, `kronos_portal_bite`, `kronos_supernova`.
   - Hint de esquina: `DRAG · ORBIT · SCROLL ZOOM` + badge de carga `CARGANDO <MODELO>.GLB...`.
3. **Ficha Técnica Verificada (Panel derecho)**:
   - Muestra exactamente los datos de `DOME_ENEMY_ARCHETYPES` y los archivos `dome*Behavior.ts`:
     - **Stats**: `HP`, `Grosor de Carne`, `Radio`, `EXP`, `Puntos Débiles`, `Inmunidad a Barrera` (sí en élites/boss).
     - **Comportamiento y Ataques**: Resumen preciso sin inventar lore (ej. en **Pulpo Espiral**: ciclo de `5.0 s`, últimos `1.5 s` en rojo = **Contra-Parry** que mancha `5–10 s` al `65%` con `4 HP/s` y huye a `48 m/s`; en **Gólem**: stamina `100`, fatiga `5.0 s`, pared reactiva y parry `0.10×`; en **Prisma Necroz**: escudo de `20` triángulos girando a `25°/s`, púas de `75 m` y barra de Pereza `0–100`; en **KRONOS**: 4 Estrellas Dorsales, 4 fases, portales `SOLAR RIFT` y Fase 4 de supervivencia de `60 s` en `VOID COSMOS` con `Supernova`).
     - **Cómo Contrarrestarlo**: Bullet points directos basados en las reglas reales del código (ej. mirar a la Célula a `< 6.5 m` la pone en `flee`; cubrirse detrás de una losa corta el láser del Cangrejo; capturar bolas de tinta/eléctricas con Campo Gravitacional; provocar que el Gorrión se estrelle contra una losa para abrir sus 2 puntos débiles).

---

### §4 · Arsenal: 7 Habilidades Activas, 3 Pasivas y Sinergias

**Objetivo:** Mostrar la progresión roguelike replicando el diseño exacto de las cartas de `DomeLevelUpSequence.tsx` (`.lu-card`).

- **Fondo**: Papel `#f1f1ed` con rejilla `96px` y estallido halftone en el encabezado.
- **Cabecera**: Kicker `PROGRESIÓN · 3 RANURAS ACTIVAS` + Título `ARSENAL DE LA CÚPULA` + nota verificada: *"Los niveles escalan efecto (daño, radio, cantidad o curación); el coste de Edén y el cooldown son constantes."*

#### 4A · Grid de 7 Cartas Activas (`SkillCard.tsx`)
Cada carta usa `.lu-card` (`skewX(-5deg)`, borde `3px #0b0d12`, sombra `9px 9px 0 var(--accent)`, número fantasma `01..07`, chip de rareza, icono `/icons/skills/<id>.webp` dentro del aro rotatorio de `108×108`, chip `COSTE: N EDÉN`, `CD: N S`, `NV MÁX: N`):

1. **Campo Gravitacional** (`BASE` · `8` Edén · `5s` CD · `Nv. 5` · `#7ae8dc`):
   - Orbita rocas (`15 / 32 / 58` daño) que se lanzan con Clic Izquierdo (`40–64 m/s`, homing `10.5`).
   - **Sinergias destacadas (badges en la carta)**:
     - Absorbe escombros de losas rotas por el Gólem o Gorrión.
     - Captura **bolas de tinta ácida** del Pulpo → `90` daño directo sin auto-aim.
     - Captura **bolas eléctricas** de la Mariposa → `140` daño, `bypassFlesh` e imán 100 % irrompible hacia la Mariposa.
2. **Empuje** (`COMÚN` · `12` Edén · `7s` CD · `Nv. 5` · `#42bde8`):
   - Onda radial (`12–24 m`) con fuerza `23–51`. Empuja enemigos básicos contra la Barrera Blanca (muerte instantánea) y **refleja bolas eléctricas** (`38` daño, `46 m/s`, auto-aim).
3. **Absorción de Edén** (`COMÚN` · `0` Edén · `6s` CD · `Nv. 3` · `#7dffa8`):
   - Requiere estar quieta (`< 1.25 m/s`). Recupera `9 / 13 / 17` HP y `13 / 18 / 23` Edén.
4. **Pozo de Atracción** (`COMÚN` · `18` Edén · `10s` CD · `Nv. 3` · `#42bde8`):
   - Rango `52–76 m`. Atrae 2 enemigos para hacerlos chocar (`22 / 29 / 36` daño a cada uno) o aplasta 1 enemigo solitario entre las 2 losas más cercanas (`26 / 34 / 42` por losa).
5. **Horizonte de Rebote** (`ÉPICA` · `22` Edén · `8s` CD · `Nv. 3` · `#df9fff`):
   - Ráfaga secuencial de `1 / 2 / 3` ondas media luna perforantes a `42 m/s` (`10 / 13 / 16` daño; auto-aim desde Nv. 2).
6. **Agujero Negro** (`ÉPICA` · `30` Edén · `16s` CD · `Nv. 3` · `#df9fff`):
   - Vórtice que avanza `4.5 s` a `7 m/s`, radio `10.5 / 13 / 15.5 m`, succión continua y hasta `9` ticks de daño (`7 / 9 / 11` cada `0.5 s`).
7. **Implosión** (`LEGENDARIA` · `45` Edén · `25s` CD · `Nv. 1` · `#ffd992`):
   - Cinemática orbital sin límite de distancia: aniquila enemigos básicos al instante, inflige `-20 %` de HP máximo a élites (mín. 1 HP), o rompe 1 Estrella Dorsal de KRONOS (1 uso por Leviatán; prohibida en Fase 4).

#### 4B · Franja de 3 Pasivas y Modo Fácil
- **Velocidad + Fuerza Física** (`#ffd992`): `+20 % / +50 % / +75 %` velocidad y penetración cinética.
- **Regeneración de Edén** (`#df9fff`): `2 % / 3 % / 5 %` por segundo en reposo o suelo.
- **Regeneración de Vida** (`#7dffa8`): `1 % / 1.5 % / 2 %` por segundo constante.
- **Chip lateral — Modo Fácil**: Duplica Vida y Edén máximos (`×2`) y desactiva el escalado de velocidad/enemigos por ciclo (`15` oleadas por ciclo).

---

### §5 · Audio Procedural, Banda Sonora y Localización

**Objetivo:** Poner en valor el apartado sonoro (OST + síntesis WebAudio pura) y la accesibilidad multi-idioma/mando.

- **Fondo**: Cosmos `#05010f` con acentos de ranura circular (`DomeSkillSlotsHud.tsx`: degradado abisal `#1b1138 → #090418 → #040408`, 12 muescas radiales, aro `#00e5ff → #818cf8 → #e879f9`).
- **Columna izquierda — Reproductor OST (`OstPlayer.tsx`)**:
  - Portada `/audio/covers/cover.webp`.
  - Lista interactiva de las **4 pistas reales**:
    1. `Menú` (`/audio/menu.mp3` · `2:53`)
    2. `Nocturnal` (`/audio/wave-nocturnal.mp3` · `3:01`)
    3. `Singularity` (`/audio/wave-singularity.mp3` · `2:53`)
    4. `Boss` (`/audio/boss.mp3` · `2:50`)
  - Botón `Play/Pause`, barra de progreso y control de volumen.
- **Columna derecha — Ingeniería Sonora & i18n**:
  - **Motor SynthAudio (`1.303` líneas, 0 archivos de SFX)**: 48 métodos `play*` sintetizados en tiempo real con `AudioContext` (osciladores, filtros biquad, ruido rosa de Paul Kellet para el viento dinámico que escala con la velocidad de Nyx, y zumbido gravitatorio de `55 Hz + 110.5 Hz` cuando Campo Gravitacional o Agujero Negro están activos).
  - **Localización nativa**: `Español`, `English`, `日本語` (251 claves por idioma) + soporte completo de teclado/ratón rebindable y mando W3C (`Gamepad API`).

---

### §6 · Juega Ahora & Guía Rápida de Controles

**Objetivo:** Conversión directa hacia la build jugable con una guía visual clara inspirada en `DomeTutorialCard.tsx`.

- **Fondo**: Contraste `#e11d48` / `#0b0d12` / `#f1f1ed`.
- **3 Mini-tarjetas estilo `DomeTutorialCard`** (con sus acentos ámbar/cian/carmesí):
  1. `01 · MOVIMIENTO`: `WASD` Mover 0G · `ESPACIO` Despegar / Frenar · `CLIC IZQ.` Ataque / Caída al Vacío · `CLIC DER.` Dash.
  2. `02 · REBOTES CINÉTICOS`: `≥ 12 m/s` + Mira Azul (`#7fd8ff`) + `CLIC DER.` → Sentadilla Cinética (`0` Edén, `100%` impulso).
  3. `03 · SLOW-MO & HABILIDADES`: `0.25×` Redirección · `1 / 2 / 3` Ranuras · `TAB` Radar de enemigos.
- **Nota honesta de plataforma**: El juego en navegador requiere **ratón (Pointer Lock) o mando conectado** en pantalla de escritorio (`>= 768px`, como indica `MobileBlocker.tsx`).
- **CTA grande**: `ABRIR OUTORBIT EN BASE44 →` (`https://outorbit-68425086.base44.app`).

---

### §7 · Créditos, Intenciones y Open Source

**Objetivo:** Cerrar la experiencia con transparencia técnica, autoría e invitación al repositorio.

- **Mitad superior (Papel `#f1f1ed`)**:
  - **Intenciones del proyecto**:
    - OUTORBIT nace como un proyecto experimental de **física espacial en gravedad cero y renderizado estilizado en navegador**, construido sin motores externos (solo `Three.js` + matemáticas propias) y sin post-proceso pesado, apoyándose en **60 bloques GLSL escritos a mano** para lograr una estética cómic/cósmica a 60 FPS.
    - Su foco de diseño es la **claridad cinética**: un sistema donde la velocidad no es solo desplazamiento, sino penetración física, y donde cada enemigo responde a reglas legibles (ventanas de parry, cobertura física real, fuego amigo y captura de proyectiles).
  - **Cifras verificadas del código fuente**:
    - `70.220` líneas en `src/` (`26.160` en `src/game/dome/`, `13.517` en `src/game/render/`, `11.822` en `src/ui/`).
    - `60` shaders GLSL · `26` modelos `.glb` (`18` de Nyx + `8` de enemigos) · `61` clips de animación de enemigos · `21` estados de animación de Nyx.
    - Stack: `React 18` · `TypeScript` · `Three.js 0.187.0` · `Tailwind CSS` · `WebAudio API` · `Gamepad API` · `Blender` · `@base44/sdk` (leaderboard global `LeaderboardEntry` sin login obligatorio).
- **Mitad inferior / Footer (Vacío `#05010f`)**:
  - **Créditos**: Desarrollado por **SrPakura** (`pakura.dev`).
  - **Open Source**: Enlace destacado al repositorio `https://github.com/SrPakura/OUTORBIT` para explorar el código de `NyxDomeController`, los comportamientos de IA (`dome*Behavior.ts`), los shaders de `domeArenaScene.ts` y los scripts de Blender (`scripts/`).

---

## 4. Arquitectura Técnica de `web/` y Plan de Assets

### 4.1 Estructura de Directorios en `web/src/`

```text
web/src/
  i18n/
    es.ts                     # Diccionario español de la landing
    en.ts                     # Diccionario inglés
    ja.ts                     # Diccionario japonés
    useWebI18n.tsx            # Provider + hook useWebI18n() + persistencia en localStorage
  data/
    nyxData.ts                # Constantes exactas de Nyx (modos, velocidades, slow-mo, Barrera)
    skillsData.ts             # 7 habilidades activas + 3 pasivas + sinergias verificadas
    enemiesData.ts            # 8 arquetipos (stats, clips GLB, colores rim, debilidades, fases)
    audioData.ts              # 4 pistas OST (ruta, título, duración) + specs de SynthAudio
  shaders/
    cosmicShaders.ts          # Shaders GLSL portados: SKY, STAR, LIQUID_DIVIDER, NYX_NEBULA, ENEMY_NEBULA, STAR_CORE, INVERTED_HULL
  components/
    Navbar.tsx                # Navegación fija, mini-OST, ES/EN/JA, CTA Jugar
    FluidInkButton.tsx        # Botón SVG de tinta viva (64 puntos Catmull-Rom + atracción magnética)
    HeroSection.tsx           # §1 Introducción general + divisor líquido + CTAs
    HeroCanvas.tsx            # Contexto WebGL 1: bóveda espacial + Nyx 3D (pausado fuera de viewport)
    CombatSection.tsx         # §2 Mecánicas 0G, anatomía carne/estrella, slow-mo y Barrera
    KineticMeter.tsx          # Simulador interactivo de velocidad, visor SVG y penetración
    BestiarySection.tsx       # §3 Selector de Nyx + 8 enemigos + ficha técnica
    ModelViewer3D.tsx         # Contexto WebGL 2: visor GLB único con OrbitControls, paletas y clips
    ArsenalSection.tsx        # §4 7 cartas estilo .lu-card + 3 pasivas + Modo Fácil
    AudioI18nSection.tsx      # §5 Reproductor OST + SynthAudio + i18n/Gamepad
    OstPlayer.tsx             # Reproductor <audio> reciclado con portada y progreso
    PlayCtaSection.tsx        # §6 Tarjetas de controles estilo DomeTutorialCard + CTA Base44
    CreditsFooter.tsx         # §7 Intenciones, métricas del código, créditos SrPakura y GitHub
  App.tsx
  main.tsx
  index.css                   # Tokens CSS, rejillas 96px/16px, halftones, speedlines y animaciones
```

### 4.2 Gestión de Assets en `web/public/`
Antes o al iniciar la implementación, copiar los assets estáticos que aún residen solo en `public/` de la raíz hacia `web/public/`:
- `public/icons/skills/*.webp` → `web/public/icons/skills/` (7 iconos, `9.8 KB` total).
- `public/audio/*.mp3` + `public/audio/covers/cover.webp` → `web/public/audio/` (`15.6 MB` total; cada MP3 es `< 4.1 MB`, compatible con el límite de `25 MiB` por archivo de Cloudflare Pages).
- `web/public/models/` ya contiene `nyx_rigged.glb` y `enemies/*.glb` (`~2.5 MB` total).

### 4.3 Reglas de Rendimiento y Responsive
- **Máximo 2 contextos WebGL** en toda la página (`HeroCanvas` y `ModelViewer3D`), ambos gestionados con `IntersectionObserver` para detener su `requestAnimationFrame` cuando no están visibles y con `dpr = Math.min(window.devicePixelRatio, 2)`.
- **Carga bajo demanda**: `ModelViewer3D` carga el `.glb` del enemigo solo al seleccionarlo (precarga inicial opcional de `nyx_rigged.glb` en el Hero) y libera geometrías/materiales/mixers anteriores al cambiar de modelo (`dispose()`).
- **Responsive**: Aunque el juego requiere escritorio (`>= 768px` y ratón/mando), **la web oficial sí debe ser 100 % responsive** en móvil y tablet: el split del Hero pasa a vertical (papel arriba, visor 3D abajo), las cartas se apilan en 1–2 columnas y el visor 3D del bestiario mantiene altura adaptable (`clamp(360px, 55vh, 620px)`).
