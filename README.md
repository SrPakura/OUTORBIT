# OUTORBIT

**Roguelike de arena 3D en tercera persona en gravedad cero.** Escrito en TypeScript sobre Three.js sin motor de juego externo: física 0G, IA, animación y audio sintetizado son código propio. React + Vite para la interfaz y Base44 para el leaderboard.

Pilotas a **Nyx** dentro de una cúpula esférica de 90 m con patadas cinéticas, dash, rebotes y 7 habilidades gravitatorias contra oleadas infinitas de 8 arquetipos enemigos, hasta que caes.

- **Jugar en el navegador (PC):** https://outorbit-68425086.base44.app
- **Web oficial (bestiario, arsenal y recursos):** https://outorbit.pakura.dev
- **Base44 Launchpad:** https://app.base44.com/launchpad/outorbit-68425086
- **Tráiler oficial:** [Español](https://youtu.be/SbeiJa_cvQg) · [English](https://youtu.be/J531y2JGJIA) · [日本語](https://youtu.be/QMWH1bp72aY)
- **Gameplay sin cortes:** https://youtu.be/judB3ZIQRtc

---

## Cómo jugar

Solo PC (navegador con WebGL 2.0). Disponible en **español, inglés y japonés**.

### Modos

| Modo | Descripción |
|---|---|
| **Jugar (La Cúpula)** | Run estándar con oleadas infinitas, muerte permanente y envío al leaderboard global. |
| **Entrenamiento** | Cúpula sin oleadas automáticas: Nyx inmortal, regeneración rápida de Edén, enemigo intercambiable y panel de pruebas con `F2` (o `Tab`). |
| **Modo Fácil** *(Ajustes)* | Duplica Vida y Edén máximos (`×2`), desactiva el escalado de dificultad entre ciclos y permite alternar slow-mo `0.75×` con `Tab`. |

Incluye **4 tutoriales** contextuales (movimiento, rebotes, slow-mo y habilidades) que pueden omitirse desde Ajustes.

### Controles (teclado y ratón)

| Acción | Tecla |
|---|---|
| Moverse / propulsión 0G | `W` `A` `S` `D` |
| Cámara | Ratón (pointer lock) |
| Despegar · frenar con voltereta · freno aéreo | `Espacio` |
| Sprint / derrape en suelo | `Shift` |
| Ataque (patada, taladro ≥18 m/s, Caída al Vacío, lanzar roca, remate de parry) | Clic izquierdo |
| Dash · adjudicar Sentadilla Cinética · dash de parry | Clic derecho |
| Habilidades 1 / 2 / 3 | `1` `2` `3` |
| Radar de enemigos (o slow-mo en Modo Fácil) | `Tab` |
| Pausa | `Esc` o `P` |
| Silenciar audio | `M` |
| Panel de entrenamiento | `F2` |

Las acciones de teclado se pueden reasignar en **Ajustes → Teclado y ratón**.

### Mando

Compatible con la Gamepad API estándar (W3C), con navegación completa en menús, reasignación de botones, sensibilidad y deadzone ajustables e iconos de PlayStation en el HUD. Stick izquierdo mueve, stick derecho rota cámara, `R2`/`R1` atacan, `L1`/`L2` hacen dash, `Cruz` salta, `Cuadrado`/`Triángulo`/`Círculo` lanzan habilidades 1/2/3 y `Options` pausa.

### HUD

- **Yin-yang central** (WebGL): mitad superior = **Vida**, mitad inferior = **Edén**, rodeados por el anillo de EXP.
- **Indicador de nivel y oleada** (normal, MINIBOSS, BOSS o ENTRENAMIENTO).
- **3 ranuras de habilidad** con cooldown y nivel.
- **Visor dinámico**: escala con la velocidad, muestra el horizonte artificial y cambia el color de la estrella central según el estado (objetivo fijado, rebote disponible/adjudicado, ventana de parry).

---

## Mecánicas

### Vida y Edén

- Ambos arrancan en **100** y crecen **×1.05 por nivel** con curación completa (también al derrotar al jefe).
- **Regeneración base**: **1 %/s de Vida** constante y **1 %/s de Edén** al estar quieta.
- **Consumo de Edén**: **1.5/s** en movimiento 0G, **4.5** por dash, **3.0/s** en ataque de velocidad y **12–68** por habilidad (0 en Absorción de Edén).
- **Nado en 0G**: si el Edén cae por debajo de **5.5** en el aire, Nyx pasa a nadar físicamente sin coste de Edén.
- **Touch-and-go**: aterrizar sobre un suelo a >3 m/s recupera **+12 % de Edén** (cooldown de 2.5 s por suelo), además de los orbes que sueltan los enemigos.

### Combate cinético: carne y estrella

Cada enemigo es una **estrella interior** protegida por **carne amortiguadora**. La fuerza del golpe es `velocidad × multiplicador × (taladro ? 1.55 : 1)`:

- Si la fuerza **supera** la carne, penetra, inflige `max(fuerza × 2.2, 34 % del HP máx.)` y rompe un punto débil.
- Si **no** la supera, inflige `fuerza × 0.9`, desgasta `fuerza × 0.18` de carne y Nyx rebota con voltereta.

### Barrera Blanca

Límite esférico de la arena (**R = 88.6 m**):

- Cualquier enemigo **no élite y no jefe** que choque contra ella **muere al instante** (cuenta como kill de barrera en la puntuación).
- Si impacta Nyx, recibe **−20 HP** y sale despedida hacia el interior.

### Movimiento avanzado

- **Taladro Espiral (≥18 m/s)**: atraviesa carne con multiplicador **×1.55** de fuerza.
- **Caída al Vacío**: ataque en picado sin objetivo fijado.
- **Sentadilla Cinética**: a **≥12 m/s** apuntando a un suelo, el clic derecho curva la trayectoria, comprime el impulso y dispara a Nyx conservando toda su velocidad. **Cuesta 0 de Edén.**
- **Parry del Gólem Rompesuelos**: ventana espacial ante su guardia que activa slow-mo **0.10×**; el dash hacia su estrella dorada permite un remate en picado que le quita el **35 % de su vida total**.
- **Contra-parry del Pulpo Espiral**: ventana en su ciclo de 5 s; su tinta ácida drena **4 HP/s** en pantalla.

---

## Progresión de la run

- **EXP y chaining**: la curva escala como `0.5 × nivel` (desde `1.0` en nivel 1). Al subir, los orbes en un radio de **30 m** se encadenan en una única selección.
- **3 rerolls por partida** para refrescar las opciones de cartas.
- **Nivel 1**: Campo Gravitacional fija + 1 habilidad aleatoria. **Niveles impares**: 2 cartas (habilidad nueva o mejora +1; si los 3 slots están llenos, eliges cuál reemplazar). **Niveles pares**: hasta 3 cartas entre pasivas y cartas de **curación instantánea (100 % Vida o 100 % Edén)**.

### Habilidades activas (7 · 3 ranuras)

| Habilidad | Rareza | Edén | CD | Nv máx | Efecto |
|---|---|---:|---:|---:|---|
| **Campo Gravitacional** | Base | 12 | 5 s | 5 | Captura escombros y bolas de tinta para orbitarlos y lanzarlos (daño 15 / 28 / 58 por roca, 90 por tinta). |
| **Empuje** | Común | 18 | 7 s | 5 | Onda antigravitatoria (radio `9 + 3·Nv`, fuerza `16 + 7·Nv`) que lanza enemigos contra la Barrera Blanca. |
| **Absorción de Edén** | Común | 0 | 6 s | 3 | Canalización estática que restaura `5 + 4·Nv` HP y `20 + 12·Nv` Edén. |
| **Pozo de Atracción** | Común | 27 | 10 s | 3 | Enlaza 2 enemigos durante 2.2 s y los estrella (`45 + 15·Nv`, ignora carne); con uno solo, lo aplasta entre suelos (`30 + 7·Nv`). |
| **Horizonte de Rebote** | Épica | 33 | 8 s | 3 | Dispara `Nv` ondas cortantes perforantes a 42 m/s (auto-aim desde Nv 2). |
| **Agujero Negro** | Épica | 45 | 16 s | 3 | Singularidad de 4.5 s que avanza succionando y dañando por tick (radio `8 + 2.5·Nv`). |
| **Implosión** | Legendaria | 68 | 25 s | 1 | Eliminación instantánea con cinemática. A jefes les destruye 1 estrella/cristal; a élites con ≥50 % HP les quita un 20 %. |

### Pasivas (3)

| Pasiva | Nv 1 | Nv 2 | Nv 3 | Efecto |
|---|---|---|---|---|
| **Velocidad (+Fuerza física)** | +20 % | +50 % | +75 % | Aumenta velocidad y fuerza de impacto. |
| **Regeneración de Edén** | 2 %/s | 3 %/s | 5 %/s | Al estar quieta (sustituye el 1 %/s base). |
| **Regeneración de Vida** | 1,5 %/s | 2 %/s | 3 %/s | Constante, incluso en combate (sustituye el 1 %/s base). |

---

## Oleadas y enemigos

Ciclo infinito de **15 oleadas**. Las oleadas 1–4 introducen los arquetipos básicos en orden; a partir de la oleada 6 las oleadas normales son mezclas aleatorias que crecen tras cada miniboss (`4 + minibosses superados`), y cada ciclo completo acelera a los enemigos (`×1 + 0.2·ciclo`) y añade escolta a los minibosses.

| Oleada | Tipo | Contenido | Suelos |
|---|---|---|---|
| 1–4 | BÁSICOS | Introducción progresiva de básicos | Flotantes |
| 5 | MINIBOSS | Gorrión Gigante | Baldosas de esfera |
| 6–9 | BÁSICOS | Mezcla aleatoria | Flotantes |
| 10 | MINIBOSS | Prisma Necroz | Baldosas de esfera |
| 11–14 | BÁSICOS | Mezcla aleatoria | Flotantes |
| 15 | BOSS | Leviatán KRONOS | 120 baldosas fijas |
| 16+ | CICLO ∞ | Repite con mayor número y velocidad | Igual |

| Enemigo | HP | Radio | Carne | EXP | Notas |
|---|---:|---:|---:|---:|---|
| Mariposa Relámpago | 31 | 1.2 | 8 | 1.5 | Evasiva con dash rápido. |
| Célula Abisal | 40 | 1.6 | 15 | 1.0 | Enjambre oportunista con acecho y duplicación. |
| Cangrejo Artillero | 60 | 1.8 | 35 | 1.25 | Torreta en suelos: láser continuo con fuego amigo, ráfaga y kamikaze. |
| Pulpo Espiral | 70 | 2.2 | 55 | 1.5 | Media distancia con ciclo de contra-parry y tinta ácida. |
| Gólem Rompesuelos | 140 | 3.2 | 80 | 2.0 | Cargas en espiral, guardia y ventana de parry espacial. |
| Prisma Necroz *(élite)* | 300 | 3.8 | 65 | 3.0 | Pinchos que repelen cuerpo a cuerpo; vulnerable tras dash o ráfaga. |
| Gorrión Gigante *(élite)* | 416 | 4.5 | 85 | 3.0 | 2 puntos débiles (el del pecho solo con la boca abierta). |
| Leviatán KRONOS *(boss)* | 4 estrellas | 3.2 | 90 | 10.0 | 4 fases (4 Estrellas Dorsales), cuerpo articulado de 13 segmentos, anillos, portales y fase final de 60 s. |

---

## La arena y apartado técnico

- **Cúpula geodésica de 90 m** con retícula, baldosas triangulares sobre la esfera y 10 suelos flotantes móviles con colisión exacta contra triángulos.
- **Estilo visual**: cel-shading de 3 bandas, contorno de tinta (*inverted hull*) y halftone de puntos con shaders GLSL propios.
- **Audio**: 4 pistas de música (`public/audio/`) con soporte de `MediaSession` y efectos 100 % sintetizados con WebAudio (`SynthAudio.ts`).
- **Leaderboard**: entidad anónima `LeaderboardEntry` en Base44 (top 15 en menú, top 5 en el Battle Report). La puntuación pondera oleada, kills, élites, jefes, kills por barrera, redirecciones, velocidad máxima, tiempo, daño y nivel, asignando un estilo dominante (`boss_slayer`, `barrier_trickster`, `redirector` o `kinetic_duelist`).

---

## Desarrollo local

Requisitos: **Node 22.21.1** (`.nvmrc`) y npm.

```bash
npm install
npm run dev       # servidor de desarrollo (Vite)
npm run build     # bundle del animador (esbuild) + vite build → dist/
npm run preview   # previsualizar el build
npx tsc --noEmit  # comprobación de tipos TypeScript
```

Para desplegar con el leaderboard real de Base44 (`VITE_BASE44_APP_ID`):

```bash
base44 deploy --build -y
```

Sin esa variable el juego funciona con normalidad y el leaderboard falla en silencio.

### Stack

- **3D y shaders**: Three.js, GLSL personalizado
- **Lenguaje**: TypeScript (`strict`)
- **Interfaz y build**: React 18, Vite 6, Tailwind CSS 3, Lucide Icons
- **Backend**: Base44 SDK (solo leaderboard)

### Estructura

```
OUTORBIT/
├── base44/                 # Configuración y entidad LeaderboardEntry
├── public/
│   ├── models/             # Rig y clips GLB de Nyx + 8 GLB de enemigos
│   ├── audio/              # 4 pistas OST (.mp3) y portada
│   ├── icons/skills/       # 7 iconos de habilidades (.webp)
│   └── character-sheet.html
├── src/
│   ├── api/                # Cliente Base44 y leaderboard
│   ├── game/
│   │   ├── dome/           # Núcleo del juego (física, IA, oleadas, habilidades, combate, replay/trailer)
│   │   ├── render/         # Escena de la cúpula, materiales cel-shading y animador de Nyx
│   │   ├── audio/          # SFX WebAudio y reproductor de música
│   │   ├── input/          # Gamepad API y navegación de menús
│   │   └── settings.ts     # Ajustes, controles y persistencia
│   ├── i18n/               # Traducciones (es / en / ja)
│   ├── ui/                 # Portada, HUD, modales y bucle principal
│   └── App.tsx
└── package.json
```

> El juego también expone herramientas de grabación determinista, bot de demostración y modo cámara teatro en consola (`window.trailer`) en `src/game/dome/trailer/`.

---

## Créditos y licencia

Creado por **Alejandro Pérez ([SrPakura](https://portfolio.pakura.dev))** para la **Base44 × Nitro Web Game Contest** (100 % gratuito), inspirado en *Gravity Rush*. Más información técnica y de transparencia en [outorbit.pakura.dev/resources](https://outorbit.pakura.dev/resources).

Distribuido bajo licencia **GNU GPL v3.0** (ver [LICENSE](LICENSE)).
