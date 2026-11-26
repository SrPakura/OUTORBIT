# OUTORBIT

**Juego de acción 3D en tercera persona dentro de una cúpula esférica en gravedad cero.** TypeScript sobre Three.js, sin motor de juego externo: física, IA, animación y audio son código propio. React + Vite para la UI, Base44 solo para el leaderboard.

Pilotas a **Nyx** sola, con patadas cinéticas, dash y 7 habilidades gravitatorias, contra oleadas infinitas de 8 arquetipos enemigos, hasta que caes. No hay campaña, ni planetas, ni escuadrón: hay una arena, un ciclo de oleadas y una puntuación que subir al ranking.

**Estado: beta jugable.** Un modo completo (la Cúpula) más un modo Entrenamiento/Debug. El antiguo motor de campaña sigue en el repo pero **no es alcanzable** (ver [Código legado](#código-legado-lo-que-existe-pero-no-se-ejecuta)).

---

## Roguelike o roguelite

**Es un roguelike.** Concretamente un *roguelike de arena* (arcade roguelike, el término que usa el propio código en `DomeRunStats.ts`). No es un roguelite, y el motivo es una sola línea de código: **al morir no se conserva nada**.

La distinción estándar:

| | Roguelike | Roguelite |
|---|---|---|
| Run con muerte permanente | Sí | Sí |
| Build se pierde al morir | Sí | Sí |
| **Meta-progresión permanente entre runs** (desbloqueos, moneda, mejoras que sobreviven) | **No** | **Sí** (Hades, Dead Cells, Rogue Legacy) |
| Cada run te hace más fuerte por haber jugado la anterior | No | Sí |

Lo que hace OUTORBIT, verificado en código:

- **Muerte = pérdida total.** `domeGameLoop` detecta `hp <= 0`, congela el mundo y abre el Battle Report; "JUGAR DE NUEVO" incrementa `runSeed` y **reconstruye desde cero** `DomeProgressionManager`, `DomeRunTracker` y `DomeWaveManager`. Nivel, EXP, cartas, pasivas y oleada desaparecen.
- **No existe moneda, ni árbol meta, ni desbloqueos.** `DomeProgressionManager` arranca siempre con los mismos 100 HP, 100 Edén y los 3 slots vacíos. El catálogo de 7 habilidades y 3 pasivas está disponible íntegro desde la primera partida.
- **Lo único que persiste es configuración y vanidad**: idioma, ajustes, bindings, apodo, récord personal y qué tutoriales has visto. `localStorage` no guarda ni un punto de progresión jugable (ver [Persistencia](#persistencia)).
- **La variedad viene de dentro de la run**: al subir de nivel eliges 1 de 2 cartas aleatorias de un catálogo fijo, sin rerolls. Dos partidas no tienen el mismo build, pero **no hay ninguna razón mecánica para jugar la segunda** salvo tu propia puntuación: es skill puro y leaderboard.

Matiz honesto, porque el término "roguelike" también exige generación procedural de niveles:

- **Las oleadas son deterministas.** `getWavePlan(n)` es una función pura del número de oleada (composición, arquetipos y recuentos fijos; solo escalan `+2·ciclo` enemigos y `×1 + 0.2·ciclo` de velocidad). Las posiciones usan RNG sembrado (`makeRng(oleada·7919 + 13)`), así que son reproducibles.
- **La arena es siempre la misma** cúpula de 90 m. Lo que sí es procedural es la geometría de los suelos flotantes y sus trayectorias aleatorias por partida.

Es decir: el ADN presente es **permadeath + run única + build aleatoria dentro de la run**. Falta la generación procedural de escenarios, que es lo único que le impediría llamarse roguelike "de manual". Si algún día añades desbloqueos permanentes, entonces sí pasa a ser roguelite — y ese cambio hay que hacerlo en `DomeProgression` + `localStorageState`, no en la UI.

> Nota: el tagline del menú dice `ZERO-G ROGUELITE` (ES/EN) y `無重力ローグライト` (JA) en `src/i18n/*.json`. Con el código actual es **inexacto**: o se cambia a `ROGUELIKE`, o se añade meta-progresión para que el cartel sea verdad.

---

## Cómo jugar

### Modos

| Modo | Qué es |
|------|--------|
| **JUGAR** | La Cúpula: run normal, oleadas infinitas, permadeath, puntuación al leaderboard. |
| **Entrenamiento** | Misma cúpula sin oleadas automáticas: Nyx inmortal, Edén +25/s, un único enemigo intercambiable y panel de debug con `F2` (`Tab` también dentro del modo). Sirve para probar habilidades, pasivas y arquetipos. |

Tutoriales: **3 tarjetas** contextuales dentro de la Cúpula (movimiento, rebotes, slow-mo). Se guardan en `outorbit_tutorial` y se pueden marcar como vistos desde Ajustes → *Omitir tutoriales*.

### Controles (teclado y ratón)

| Acción | Tecla |
|--------|-------|
| Moverse / propulsión en 0G | `W` `A` `S` `D` |
| Cámara | Ratón (pointer lock al hacer clic) |
| Despegar · frenar con voltereta · freno aéreo | `Espacio` |
| Sprint / derrape en suelo | `Shift` |
| Ataque (patada, taladro ≥18 m/s, Caída al Vacío, lanzar roca, remate del parry) | Clic izquierdo |
| Dash (3 Edén) · adjudicar Sentadilla Cinética · dash del parry | Clic derecho |
| Habilidades 1 / 2 / 3 | `1` `2` `3` |
| Radar de enemigos | `Tab` |
| Pausa | `Esc` o `P` |
| Silenciar audio | `M` |
| Panel de entrenamiento | `F2` (y `Tab` en modo Entrenamiento) |

Se pueden reasignar 14 acciones de teclado desde **Ajustes → Teclado y ratón**. Ojo: `E`, `F`, `R` y `Q` (interactuar, parry, estasis, lock-on) siguen apareciendo y son rebindables, pero **en la Cúpula no hacen nada** — nadie las lee en `NyxDomeController`. Los botones del ratón están fijos en código (0 = ataque, 2 = dash), no son rebindables.

### Mando

Gamepad API con mapeo W3C (DualShock 4 por USB/Bluetooth o cualquier genérico). Stick izquierdo mueve (sumado a WASD), stick derecho gira la cámara, `R2`/`R1` atacan, `L1`/`L2` hacen dash, `Cruz` salta, `Cuadrado`/`Triángulo`/`Círculo` lanzan habilidades 1/2/3, `Options` pausa. En menús: D-Pad o stick navega, `Cruz` confirma, `Círculo` vuelve. Sensibilidad y deadzone ajustables.

Solo PC: en pantallas táctiles o de menos de 768 px aparece un aviso de bloqueo.

### HUD

- **Yin-yang central** (`DomeYinYangHud`, canvas WebGL con shader propio): mitad superior = **Vida** (verde >60 %, naranja 40–60 %, rojo <40 %, halo parpadeante ≤25 %), mitad inferior = **Edén** (nebulosa violeta con remolino de estrellas).
- **Anillo de EXP de 96 marcas** entre los dos aros, con cuña de progreso. Sin cifra: se lee por posición.
- **Píldora** `NV. 01` / `OLEADA 03` (blanco normal, ámbar MINIBOSS, rojo BOSS); en entrenamiento muestra `ENTRENAMIENTO`.
- **3 ranuras de habilidad** con icono, aro de cooldown, tecla y pips de nivel.
- **Visor de 120 px**: octógono que escala con la velocidad, arcos giroscópicos, ticks que contra-rotan con el horizonte artificial y una estrella central cuyo color indica el estado (libre, bloqueable, bloqueado, rebote disponible, rebote adjudicado, hover de parry).
- Feedback: halftone dinámico por velocidad, líneas radiales a velocidad terminal, corona de presión, mancha de tinta ácida del pulpo, viñeta de Caída al Vacío, tinte de slow-mo, aros de materia oscura sobre enemigos lejanos y radar de puntos.

---

## Mecánicas

### Vida y Edén

Ambos empiezan en **100** y crecen **×1.05 por nivel** con cura completa. El Edén es el combustible: **1.0/s** flotando o moviéndote, **3.0** por dash, **2.0/s** durante el ataque de velocidad, y **8–45** por habilidad. Se regenera un **1 %/s** en suelo (0 % flotando salvo con las manos libres), más **+12 %** al hacer *touch-and-go* sobre un suelo con impacto >3 m/s (cooldown 2.5 s por slab), más orbes de Edén.

### Daño cinético: carne y estrella

Cada enemigo es una **estrella interior** envuelta en **carne amortiguadora** (`fleshThickness` 8–90). Fuerza = `velocidad de impacto × multiplicador de fuerza × (taladro ? 1.55 : 1)`.

- Si la fuerza **supera** la carne, el golpe penetra y hace `max(fuerza × 2.2, 34 % del maxHp)` y gasta un punto débil. La mayoría de enemigos tiene 1; el Gorrión 2 (pecho y boca abierta), KRONOS 4.
- Si **no** la supera, haces `fuerza × 0.9`, desgastas `fuerza × 0.18` de carne y **rebotas** con una voltereta (`kick_flip`): no puedes taladrar lo que no has abierto.
- Hit-stop de 45–120 ms según penetración o muerte.

### Barrera Blanca

Cualquier enemigo **no élite y no boss** que toque el límite de la arena (R = 88.6) **muere al instante**. Es una herramienta de combate: el Empuje lanza enemigos contra ella, y el juego lo cuenta como kill de barrera en la puntuación. Tú también la recibes: −10 HP y empujón de vuelta.

### Movimiento avanzado

- **Taladro Espiral** a partir de **18 m/s**: atraviesa carne y multiplica la fuerza ×1.55.
- **Caída al Vacío**: ataque en picado sin enemigo fijado, con viñeta propia.
- **Sentadilla Cinética** (`nyxKineticBounce`): a **≥12 m/s**, si el visor apunta a un slab, la estrella se pone azul; el clic derecho adjudica el rebote, Nyx curva el vector, comprime en 0.16 s y sale disparada conservando todo el impulso. **Cuesta 0 de Edén** y no ocupa ranura.
- **Parry del Gólem Rompesuelos**: no es un botón, es una ventana espacial. Con su guardia alzada, cruzas hacia dentro a `radio + 9` con Edén ≥6 % y el mundo entra en slow-mo **0.10**; el dash te lleva a la estrella dorada y el remate en picado le quita el **35 % de su vida total** (cooldown 18 s, ventana 1.2 s, 1.8 s de vulnerabilidad). Si llegas sin dash o te alejas, lockout de 5 s.
- **Contra-parry del Pulpo Espiral**: su ciclo de 5 s abre una ventana; el contraataque a bocajarro provoca una mancha de tinta de 5–10 s.

---

## Progresión de la run

- **Curva de EXP**: `expToNext` empieza en 1.0 y pasa a `0.5 × nivel`. La EXP se mide en "enemigos básicos" (1.0 = una Célula Abisal), así que el nivel 2 llega con 1 enemigo y el nivel 6 pide 2.5.
- **Chaining de 30 m**: al subir, `domeGameLoop` mira la EXP que hay en un radio de **30 m**; si alcanza para otro nivel, la marca como contada y la aplica en cadena, abriendo un único modal con todos los niveles pendientes.
- **3 ranuras** de habilidad activa y **3 pasivas** (máximo Nv 3 cada una).
- **2 cartas por subida, sin rerolls.** Nivel 1: Campo Gravitacional fija + 1 aleatoria. Niveles impares: habilidad nueva o mejora +1 de una equipada. Niveles pares: las pasivas. Si las 3 ranuras están ocupadas y toca habilidad nueva, el modal pide cuál reemplazar.

### Habilidades activas (7)

| Habilidad | Rareza | Edén | CD | Nv máx | Efecto |
|---|---|---|---|---|---|
| **Campo Gravitacional** | Base | 8 | 5 s | 5 | Captura escombros y bolas de tinta y los orbita; relanzas para golpear. Daño por roca 15 / 28 / 58, bola de tinta 90. El cooldown empieza al gastar la última roca. |
| **Empuje** | Común | 12 | 7 s | 5 | Onda antigravitatoria: radio `9 + 3·Nv`, fuerza `16 + 7·Nv`. Empuja enemigos (y suelos si no estás apoyada), mata contra la Barrera Blanca. |
| **Absorción de Edén** | Común | 0 | 6 s | 3 | Quieta y con los brazos en alto: cura `5 + 4·Nv` HP y `8 + 5·Nv` Edén. |
| **Pozo de Atracción** | Común | 18 | 10 s | 3 | Enlaza 2 enemigos 1.8 s (atracción `70 + 20·Nv`, daño al choque `15 + 7·Nv`); con uno solo, lo aplasta entre los dos slabs más cercanos. |
| **Horizonte de Rebote** | Épica | 22 | 8 s | 3 | `Nv` ondas cortantes perforantes de 42 m/s; auto-aim desde Nv 2. |
| **Agujero Negro** | Épica | 30 | 16 s | 3 | Singularidad de 4.5 s que avanza succionando y dañando por tick; radio `8 + 2.5·Nv`. |
| **Implosión** | Legendaria | 45 | 25 s | 1 | Matar instantáneo, sin rango, con cinemática. A jefes les revienta 1 estrella o cristal; a élites con ≥50 % de vida solo les quita un 20 %. |

### Pasivas (3)

| Pasiva | Nv 1 | Nv 2 | Nv 3 | Efecto |
|---|---|---|---|---|
| **Velocidad (+Fuerza física)** | +20 % | +50 % | +75 % | Sube velocidad **y** multiplicador de fuerza: más rápido pega más fuerte y penetra más. |
| **Regeneración de Edén** | 2 %/s | 3 %/s | 5 %/s | Solo quieta. Sustituye el 1 %/s base. |
| **Regeneración de Vida** | 1 %/s | 1,5 %/s | 2 %/s | Constante, incluso peleando. |

Los modificadores derivados escalan solos: imán de orbes `4 + 2.5·nivel` m de radio y `10 + 7·nivel` m/s.

---

## Oleadas y enemigos

Ciclo de **15 oleadas** que se repite infinito, **1.6 s** entre oleadas. No hay condición de victoria: la run solo acaba cuando cae Nyx.

| Oleada | Etiqueta | Contenido | Suelos |
|---|---|---|---|
| 1–4 | BÁSICOS | 4 → 8 enemigos | flotantes |
| 5 | MINIBOSS | Gorrión Gigante | baldosas de esfera |
| 6–9 | BÁSICOS | 7 → 11 | flotantes |
| 10 | MINIBOSS | Prisma Necroz | baldosas |
| 11–14 | BÁSICOS | 9 → 13 | flotantes |
| 15 | BOSS | Leviatán KRONOS | 120 baldosas fijas |
| 16+ | repite | `+2·ciclo` enemigos, velocidad `1 + 0.2·ciclo` | igual |

| Enemigo | HP | Radio | Carne | EXP | Notas |
|---|---|---|---|---|---|
| Mariposa Relámpago | 25 | 1.2 | 8 | 1.5 | Evasiva: dash de 28 m/s con 3 s de cooldown. |
| Célula Abisal | 40 | 1.6 | 15 | 1.0 | Enjambre oportunista: acecho, lunge y duplicación. |
| Cangrejo Artillero | 60 | 1.8 | 35 | 1.25 | Torreta de slab: láser continuo de 20 HP/s **con fuego amigo**, ráfaga de 3 y kamikaze. |
| Pulpo Espiral | 70 | 2.2 | 55 | 1.5 | Hostigador de media distancia con ciclo de 5 s y contra-parry; su tinta drena 4 HP/s. |
| Gólem Rompesuelos | 140 | 3.2 | 80 | 2.0 | Puñetazo, dos cargas en espiral, pared reactiva y stamina; protagonista del parry. |
| Prisma Necroz (élite) | 600 | 3.8 | 65 | 3.0 | Pinchos que repelen el cuerpo a cuerpo; se abre tras su dash o ráfaga. |
| Gorrión Gigante (élite) | 640 | 4.5 | 60 | 3.0 | 2 puntos débiles, el del pecho solo con la boca abierta. |
| Leviatán KRONOS (boss) | 4 estrellas | 3.2 (cabeza) | 90 | 10.0 | 4 Estrellas Dorsales = 4 fases; cadena de 13 puntos, anillos, portales y mordisco, y una fase final de 60 s. |

Ningún HP escala con la oleada: la dificultad sube por número de enemigos, velocidad y grosor de la tinta del contorno, no por estadísticas.

---

## La arena

- **Cúpula de radio 90 m** (`DOME_ARENA_RADIUS`), límite jugable a **88.6 m** (la Barrera Blanca), con retícula geodésica, anillo ecuatorial y dos meridianos que pulsan.
- **320 baldosas** triangulares extraídas del icosaedro: superficie pisable a 87.5 m, pool de 120. En miniboss se activan 10–20 que rotan cada 10 s con 2.2 s de aviso; en boss, 120 fijas.
- **Suelos flotantes**: pool de 10 piezas que cruzan la cúpula colgadas de cuerdas a 2.2–4.2 m/s, con colisión exacta contra triángulos.
- **Backdrop** (`domeArenaScene`, generado con `mulberry32`): Pilar del Mundo de 240 m con 4 anillos de energía, Singularidad cenital con dos discos de acreción, 14 monolitos en espiral de Fibonacci, 8 arcos rúnicos, 36 fragmentos orbitales, 11 asteroides, 16 prismas de cristal, 260 estrellas de 4 puntas, vórtice abisal a Y = −125, dos agujeros negros de horizonte y bóveda espacial de radio 800.

Visualmente todo es **cel-shading de 3 bandas, contorno de tinta (Inverted Hull) y halftone de puntos a 30°** solo en el terminador. Nyx es un GLB riggeado de 25 huesos vestido con un shader de nebulosa cósmica y contorno blanco; los 8 enemigos son GLB con material cel y contorno de tinta que engorda cada 10 oleadas.

---

## Leaderboard

Base44, entidad `LeaderboardEntry` con **lectura y escritura anónimas** (no hay login ni cuentas). Top 15 en el menú; top 5 en el Battle Report.

Se envía al terminar una run, desde el Battle Report: **automático** si ya hay apodo guardado y superas tu récord, o manual con el campo de piloto (18 caracteres).

Fórmula del score (`DOME_SCORE_WEIGHTS`, documentada en código para poder balancear):

```
oleada · 500 + kills · 100 + élites · 750 + jefes · 2500
+ kills por barrera · 125 + redirecciones · 150
+ floor(velocidad máx.) · 10 + floor(segundos) · 5
+ daño · 0.1 + nivel · 250
```

`dominant_style` se deriva de cómo jugaste: `boss_slayer` si mataste jefes, `barrier_trickster` si un tercio de tus kills fueron contra la barrera, `redirector` si la mitad fueron redirecciones, `kinetic_duelist` en el resto.

---

## Cómo ejecutarlo

Requisitos: **Node 22.21.1** (`.nvmrc`) y npm.

```bash
npm install
npm run dev       # servidor de desarrollo (Vite)
npm run build     # esbuild del animator + vite build → dist/
npm run preview   # sirve el build
npx tsc --noEmit  # verificación de tipos (0 errores)
```

Detalles que importan:

- `npm run build` hace **dos** cosas: empaqueta `src/game/render/nyxAnimator.ts` con esbuild a `public/nyx-animator-bundle.js` (~292 KB, usado **solo** por `public/character-sheet.html`, no por el juego) y después `vite build` hacia `dist/`.
- Los scripts de `scripts/` son el pipeline offline de assets: los `.py` generan en Blender los clips de animación y los `.mjs` construyen el rig de Nyx y hornean los clips a TypeScript. **No hacen falta para jugar**; los assets ya están en `public/models/`.
- `npm run build` a secas no define `VITE_BASE44_APP_ID`: Vite avisa y las llamadas al leaderboard fallan en silencio (el juego sigue). Para el leaderboard real hay que construir con el CLI de Base44 (`base44 deploy --build -y`).
- El warning de "chunk larger than 500 kB" es esperado: Three.js va dentro del bundle.
- No hay `npm test` ni `npm run lint`. El único chequeo automático es `npx tsc --noEmit`. Ojo: el `tsconfig` no activa `checkJs`, así que **los `.jsx` no se validan** (por eso los imports rotos de `src/pages` y `src/components` no rompen el build).

---

## Stack

Versiones instaladas (`node_modules`), no solo las declaradas:

| Paquete | Versión | Uso |
|---|---|---|
| `three` | 0.187.0 | Motor 3D: escena, materiales, shaders |
| `react` / `react-dom` | 18.3.1 | UI: menús, HUD, modales |
| `typescript` | 7.0.2 | Todo el juego (strict, sin emit) |
| `vite` | 6.4.6 | Bundler y dev server |
| `@vitejs/plugin-react` | 4.7.0 | React en Vite |
| `tailwindcss` | 3.4.19 | Estilos de la UI |
| `@base44/sdk` | 0.8.63 | Leaderboard |
| `@base44/vite-plugin` | 1.0.53 | Integración Base44 (define el alias `@/`) |
| `lucide-react` | 0.475.0 | Iconos |
| `esbuild` | 0.25.12 (transitivo) | Bundle del animator |

Sin motor de juego: física esférica y de slabs, FSM de IA, animación procedural sobre clips horneados, síntesis de audio con WebAudio y 10 shaders GLSL propios, todo escrito a mano.

---

## Estructura y mapa de `src/`

```
OUTORBIT/
├── base44/                 # Config + entidad LeaderboardEntry
├── public/
│   ├── models/             # 18 GLB de Nyx (rig + 17 clips), 8 GLB de enemigos
│   ├── audio/              # 4 pistas mp3 + portada
│   ├── icons/skills/       # 7 iconos webp
│   └── character-sheet.html
├── scripts/                # Pipeline Blender/Python + smoke test del parry
├── src/
│   ├── game/dome/          # EL JUEGO (ver abajo)
│   ├── game/render/        # Materiales, escena de la cúpula, Nyx, modelos
│   ├── game/audio/         # SFX sintetizados + reproductor de música
│   ├── game/input/         # Mando y navegación de menús con mando
│   ├── game/settings.ts    # Ajustes, bindings, persistencia
│   ├── i18n/               # es / en / ja
│   ├── ui/                 # Pantallas, HUD y modales
│   └── App.tsx             # Portada ↔ partida
└── package.json
```

### `src/game/dome/` — el juego real

| Archivo | Líneas | Qué hace |
|---|---:|---|
| `NyxDomeController.ts` | 4.284 | Jugador: física 0G, cámara, dash, ataque de velocidad, frenado, Sentadilla Cinética, lock-in del visor, radar, recursos y animación. |
| `DomeWaveManager.ts` | 4.660 | Ciclo de oleadas, spawn, IA genérica y las FSM de Pulpo, Cangrejo, Prisma y Gorrión; pool de proyectiles; puertas anti-skip de KRONOS. |
| `DomeSkills.ts` | 1.836 | Ejecutor 3D de las 7 habilidades + VFX de área. |
| `domeKronosBehavior.ts` | 1.729 | Boss de 4 fases: cadena de 13 puntos, anillos, portales, mordisco, fase final. |
| `domeGolemBehavior.ts` | 1.337 | Gólem: helicóptero, observación, puñetazo, cargas en espiral, stamina y ventana de parry. |
| `DomeEnemyModels.ts` | 1.130 | Carga y viste los GLB de enemigos, rigs por arquetipo y shaders. |
| `domeCrabBehavior.ts` | 1.063 | Cangrejo: salto entre slabs, láser con fuego amigo, ráfaga y kamikaze. |
| `MotionVfx.ts` / `ComicImpactVfx.ts` | 969 / 506 | Pools de chispas, polvo, anillos y golpes cómic. |
| `domeCellBehavior.ts` | 914 | Enjambre de Células Abisales con director de atención. |
| `DomeSlabs.ts` / `DomeSlabGeometry.ts` | 665 / 467 | Colisión y raycast exactos contra triángulos, damero cel-shaded. |
| `DomeProgression.ts` | 553 | Curva de EXP, slots, pasivas, catálogo y generador de cartas. |
| `DomeCombatSystem.ts` | 455 | Stats por arquetipo, daño carne/estrella, Barrera Blanca, tinta. |
| `DomeSphereTiles.ts` / `DomeFloatingSlabs.ts` | 475 / 445 | Suelos de esfera y suelos flotantes con pool. |
| `DomePickups.ts` | 362 | Orbes de EXP, Edén y vida con imán y chaining. |
| `DomeRunStats.ts` | 222 | Métricas de la run, score y envío al leaderboard. |
| `domeTypes.ts` | 204 | Tipos y constantes de arena y visor. |
| `domeEnemyOrient.ts` / `nyxKineticBounce.ts` | 40 / 229 | Orientación compartida y la Sentadilla Cinética. |

### `src/ui/` — pantallas y HUD

| Archivo | Líneas | Qué hace |
|---|---:|---|
| `domeGameLoop.ts` | 1.415 | Runtime de la run: renderer, escena, managers, input, oleadas, muerte, HUD a 30 Hz. |
| `DomeLevelUpSequence.tsx` | 1.504 | Cinemática de planeta + 2 cartas + cierre en iris, con teclado y mando. |
| `DomeBattleReport.tsx` | 1.026 | Game Over, estadísticas, carga final, firma del piloto y top 5. |
| `SettingsScreen.tsx` | 869 | Ajustes: general, teclado y mando (pantalla completa). |
| `DomeTutorialCard.tsx` | 766 | Tarjeta cómic de los 3 tutoriales, con bloqueo de 4 s. |
| `DomeHudSketch.tsx` | 710 | Compositor del HUD: halftone, visor, radar, tinta, avisos. |
| `DomeGameView.tsx` | 480 | Estado React de la partida y montaje de todos los modales. |
| `TitleScreen.tsx` | 228 | Portada con diorama 3D, menú y selector de idioma. |
| `DomeYinYangHud.tsx` / `DomeSkillSlotsHud.tsx` | 577 / 246 | Yin-yang de vida/Edén con EXP y ranuras de habilidad. |
| `FluidInkButton.tsx` / `SkillIcon.tsx` / `DomeDarkMatterRings.tsx` | 379 / 441 / 236 | Botón de tinta animado, iconos SVG y aros de materia oscura. |
| `DomePauseModal.tsx` / `DomeTrainingPanel.tsx` / `LeaderboardModal.tsx` / `MenuModalShell.tsx` / `MobileBlocker.tsx` | 289 / 294 / 129 / 69 / 45 | Pausa, panel debug, ranking, marco de modal y bloqueo móvil. |

### `src/game/render/`

`domeArenaScene.ts` (1.804, backdrop y shaders de la arena), `nyxAnimator.ts` (1.092, animador de 28 huesos con clips horneados y poses procedurales), `nyxBakedClips.ts` (826, keyframes generados por `scripts/bake_nyx_clips.mjs`), `toonMaterials.ts` (657, cel-shading + tinta + halftone), `enemyAnimator.ts` (632), `nyxModelLoader.ts` (351), `menuShaders.ts` (176), `meshFactory.ts` (105) y los reproductores de clips `nyxWalk/Run/Float/LoopPlayer` + `nyxAnims*`.

---

## Código legado: lo que existe pero no se ejecuta

Aviso importante para no perder tiempo leyendo lo que no se juega. `src/App.tsx` solo monta `DomeGameView`; la rama de campaña exige `activeTutorialId !== null`, y **ningún componente de la UI escribe ese estado con un valor distinto de `null`** (el único setter con id real, `handleNextTutorial`, solo se pasa a `GameHUD`, que vive dentro de esa misma rama muerta).

Inalcanzable hoy:

| Bloque | Líneas aprox. | Qué era |
|---|---|---|
| `src/game/GameEngine.ts` + `entities/` + `ai/` + `math/` + `levels/` + `sandbox/` | ~11.600 | Motor de "campaña de 5 planetas", con tutoriales, sigilo, sandbox, terreno esférico y la red neuronal de KRONOS. |
| `src/game/render/models/` (17 archivos) + `cityModels.ts` + `proceduralModels.ts` | ~5.000 | Modelos procedurales de planetas, props, ciudades y el escuadrón de 3 personajes. |
| `src/ui/GameHUD.tsx` + `BattleReportScreen.tsx` | 1.550 | HUD de campaña e informe con radar de 5 ejes. |
| `src/pages/` + `src/components/` + `src/lib/auth*` | ~2.100 | Boilerplate de auth de Base44 (login, MFA, OAuth). Además está roto: importa `react-router-dom` y primitivos `ui/*` que no existen, y nadie lo valida porque el `tsconfig` no mira `.jsx`. |

Dentro del código vivo también hay restos: `createDomeSlabs()` y `SLAB_SPECS` (nunca se llaman), `releaseGravityField()`, `computeBarrierImpact()`, `DomeRunTracker.reset()`, media docena de helpers de KRONOS dentro de un `if (false)`, 12 sonidos de `SynthAudio`, los campos `hp`/`eden` de `DomeProgression` y los bindings `interact`/`parry`/`stasis`/`lockOn`.

---

## Persistencia

Todo en `localStorage`, con lectura y escritura protegidas (modo privado nunca rompe el juego):

| Clave | Contenido |
|---|---|
| `outorbit.settings.v1` | Blob completo de `GameSettings` |
| `outorbit_language` | `es` · `en` · `ja` (por defecto **`en`**) |
| `outorbit_button_mapping` | 23 entradas PC + mando |
| `outorbit_other_settings` | 9 ajustes (cámara, volúmenes, halftones, mando) |
| `outorbit_nickname` (+ `outorbit_pilot_name` legado) | Apodo del piloto |
| `outorbit_best_score` | Récord personal |
| `outorbit_tutorial` | 3 flags: `tutorial_de_movimiento`, `tutorial_de_rebotes`, `tutorial_de_slow_mo` |

Nada de progresión jugable: ni nivel, ni habilidades, ni moneda.

---

## i18n

Tres idiomas: **español, inglés y japonés**. **250 claves hoja con paridad exacta** en `es.json`, `en.json` y `ja.json`, y **15 secciones**. El idioma por defecto es **inglés**; `t()` resuelve rutas con puntos, interpola `{{param}}` y cae a `en` y luego a `es` antes de devolver la clave cruda.

Pendientes conocidos: 16 claves sin usar, `CERRAR` del marco de modal y las etiquetas de teclas/botones (`ESPACIO`, `BLOQ MAYÚS`, `Cruz (A)`…) están hardcodeadas en español, y `<html lang="es">` no cambia con el idioma.

---

## Audio

- **Música**: 4 pistas en `public/audio/` (`menu`, `wave-nocturnal`, `wave-singularity`, `boss`) con volumen base 0.2 y fundidos de ~1 s. Las dos de oleada se alternan, cada pista suena entera (sin loop) y deja **3–6 s de silencio** antes de la siguiente; la del jefe interrumpe siempre y al acabar vuelve la de básicos. Publica metadatos en `navigator.mediaSession` (widget de sistema). Si el autoplay está bloqueado, arranca en el primer gesto.
- **Efectos**: 100 % sintetizados con WebAudio en `SynthAudio.ts` (1.185 líneas, ~32 sonidos en uso) más viento rosa y zumbido gravitatorio continuos ligados a la velocidad. Ningún archivo de sonido.
- **Bug conocido**: en la Cúpula solo se aplica `masterVolume`; `musicVolume` y `sfxVolume` no tienen efecto (sí lo tienen en la portada).

---

## Assets y licencias

- **Sí están en el repo**: los 26 `.glb` de `public/models/` (rig de Nyx + 17 clips + 8 enemigos), las 4 pistas de `public/audio/`, la portada y los 7 iconos de habilidad.
- **Gitignorados**: `referencias y base/` (material de referencia con copyright de terceros), `animaciones_generadas/` (brutos de Blender y BVH), `base44/.app.jsonc` (id de la app) y `dist/`.
- `public/nyx-animator-bundle.js` se genera en el build pero **está commiteado**: si tocas `nyxAnimator.ts`, reconstruye antes de subir.
- El rig de Nyx es **generado por código** con `scripts/build_nyx_rigged.mjs` (sin leer ningún asset externo), y los clips que el juego no reproduce en runtime se hornean a TypeScript con `scripts/bake_nyx_clips.mjs`.
- **Licencias de la música**: no hay ningún archivo de licencia ni créditos en el repo, así que este README no las afirma. Pendiente documentarlas con el autor antes de publicar.

---

## Notas para desarrollar

- Verificación tras cada cambio: `npx tsc --noEmit` (0 errores) y `npm run build` (exit 0). No hay tests ni lint.
- **No te fíes de los comentarios antiguos**: quedan restos de "cúpula de 50 m" (son 90), "umbral de taladro 14.5 m/s" (es 18), "slow-mo de redirección 0.20" (es 0.25) y "rig de 18/27 huesos" (son 25 en el GLB y 28 en el animador).
- `ARCHITECTURE.md`, `ANIMACIONES.md` y los `.md` de `referencias y base/` describen el proyecto anterior (campaña de planetas, escuadrón, sandbox): **están desactualizados**, trátalos como histórico.
- `src/game/types.ts` es el contrato del **motor legado**; el juego actual habla sobre todo con `src/game/dome/domeTypes.ts`.
- El ajuste `halftonesEnabled` es global: `setHalftonesEnabled` escribe un uniform compartido por todos los materiales, sin reconstruirlos.
- `public/character-sheet.html` previsualiza los 21 estados de animación de Nyx y es el motivo de que el build empaquete el animator aparte.
