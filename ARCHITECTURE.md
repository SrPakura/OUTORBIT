# OUTORBIT — Arquitectura Técnica Maestra

> **Documento sagrado de arquitectura.** Ningún módulo puede inventar tipos paralelos ni romper los contratos definidos en `src/game/types.ts`.

---

## 1. Principios de Diseño y Rendimiento
1. **Separación estricta Juego ↔ UI:** Todo el loop de simulación (`requestAnimationFrame`), Three.js, físicas analíticas e IA corre en TypeScript puro bajo `src/game/`. React (`src/ui/`) solo renderiza menús, HUD y el Battle Report recibiendo snapshots inmutables (`HudSnapshot`) cuando cambia algún estado relevante (o máximo a ~15 Hz para reloj/barras continuas).
2. **Cero motores de físicas pesados:** No se usan Rapier/Cannon/Ammo. Las colisiones y gravedad se resuelven analíticamente por esferas, cápsulas/esferas y proyecciones vectoriales.
3. **Cero Gimbal Lock en los polos:** Toda entidad caminante mantiene una orientación por cuaternión (`basisQuat`) cuyo eje local `+Y` se alinea continuamente con la normal radial $\hat{u} = \text{normalize}(P - C)$ del planeta activo mediante `Quaternion.setFromUnitVectors(prevUp, nextUp)`. El yaw/pitch de cámara vive dentro de ese marco tangente.
4. **Cero GC Spikes en el loop:** Reutilizar `THREE.Vector3` y `THREE.Quaternion` preasignados (`_tmpVec1`, `_tmpQuat1`, etc.) dentro de `update(dt)`. Usar `InstancedMesh` para estrellas, hierba alta, asteroides repetidos y partículas simples.
5. **Estética Cel-Shading (Ref: `referencias y base/referencia_visual-bitmap.png`):**
   - `MeshToonMaterial` con `DataTexture` de gradiente discreto (`NearestFilter`).
   - Contornos negros gruesos estilo cómic mediante *Inverted Hull* (`BackSide` con extrusión por normales en shader o malla clonada escalada) en planetas, props, asteroides y personajes modulares.

---

## 2. Estructura de Carpetas

```text
base44/
  entities/
    LeaderboardEntry.jsonc      # Entidad pública para puntuaciones y estadísticas de runs
src/
  api/
    base44Client.js             # Cliente oficial @base44/sdk
    leaderboard.ts              # Wrapper tipado para leer/enviar LeaderboardEntry
  game/
    types.ts                    # CONTRATO SAGRADO ÚNICO (interfaces, enums, constantes)
    GameEngine.ts               # Orquestador del loop principal, Pointer Lock y ciclo de niveles
    math/
      spherical.ts              # Cuaterniones en esfera, transporte paralelo, colisión esfera/órbita
    render/
      toonMaterials.ts          # MeshToonMaterial + GradientMap + Inverted-Hull Outlines + Skybox
      proceduralModels.ts       # Modelos modulares cabezones (Kitsune, Digger, Axel, Guardias, Kronos, Props)
    entities/
      PlayerController.ts       # Input, movimiento, Gravity Shift (0.2x), Ancla, Estasis, Parry, Disfraz
      EnemyManager.ts           # Guardias, drones, torretas, detección por cono curvo, radio y alertas
      WorldObjects.ts           # Objetos agarrables (rocas, barriles, bolas nieve), láseres, generadores, burbujas
    ai/
      BehaviorTracker.ts        # Registro en tiempo real de acciones -> PlayerBehaviorVector
      AdaptationDirector.ts     # Motor estadístico inter-planeta -> PlanetAdaptationConfig
    levels/
      levelDefinitions.ts       # Prólogo (Luna Tutorial), Verdant, Cryo-Drop, Iron Bastion, Kronos Arena
      LevelBuilder.ts           # Construye planetas, anillos, asteroides, agua, hierba y spawns desde LevelSpec
    audio/
      SynthAudio.ts             # Audio procedural Web Audio API (salto, estasis, parry, alerta, gravity shift)
  ui/
    MobileBlocker.tsx           # Pantalla elegante si entran desde dispositivo móvil/táctil
    TitleScreen.tsx             # Portada + Leaderboard rápido + Botón JUGAR (sin login obligatorio)
    GameHUD.tsx                 # Vida, Escuadrón (1/2/3), Alerta, Disfraz, Estasis, Controles contextuales, Mira
    LevelTransitionModal.tsx    # Informe estadístico de la IA al saltar al siguiente planeta
    BattleReportScreen.tsx      # Pantalla final: gráfico de cómo te leyó la IA + envío/vista Leaderboard Base44
  App.tsx                       # Punto de entrada UI que monta el canvas del GameEngine y suscribe HudSnapshot
```

---

## 3. Fases de Desarrollo (Hitos Progresivos -> GitHub + Base44)

### Hito 1 — Vertical Slice Orbital (Día 1)
- `base44/entities/LeaderboardEntry.jsonc` + `src/api/leaderboard.ts`.
- `src/game/math/spherical.ts` (transporte paralelo sin gimbal lock + gravedad multi-planeta).
- `src/game/render/toonMaterials.ts` + cielo degradado/estrellas + anillos/cubos orbitales.
- `src/game/render/proceduralModels.ts` (Kitsune básico + planeta + satélite + árboles/rocas).
- `src/game/GameEngine.ts` + `PlayerController.ts`: movimiento WASD, salto, Pointer Lock cámara 360º, **Gravity Shift** (Clic Derecho cámara lenta `0.2x` + raycast/apuntado hacia otro planeta para saltar de órbita).
- `MobileBlocker.tsx`, `TitleScreen.tsx`, `GameHUD.tsx`.
- **Verificación:** `tsc --noEmit`, `npm run build`, inspección visual en navegador, push a GitHub y primer `base44 deploy --build -y`.

### Hito 2 — Escuadrón Completo + Habilidades + Combate Letal
- Cambio instantáneo `1 / 2 / 3` entre **Kitsune**, **Digger** y **Axel**.
- Ancla Gravitatoria (`Espacio` en el aire), Campo de Estasis (`Clic Izquierdo` hasta 4 objetos), Parry (`F`/`Q`), Noqueo/Disfraz (`E`).
- Subsuelo y núcleo para Digger (`Shift`), nado supersónico y burbujas espaciales para Axel, sigilo en hierba alta y Modo Lunar para Kitsune.

### Hito 3 — Red de IA Intra-planeta e Inter-planeta
- Guardias con cono de visión curvo, comunicación por radio, sospecha de disfraz, alarma global.
- `BehaviorTracker` + `AdaptationDirector` generando contramedidas reales entre planetas (patrullas dobles, escáneres, sensores sísmicos, torretas antiaéreas, cascos blindados).

### Hito 4 — Campaña Completa + Jefe Final KRONOS + Battle Report + Audio
- Los 4 escenarios + Arena de Kronos con adaptación en tiempo real según el personaje activo.
- `SynthAudio.ts`, `BattleReportScreen.tsx` con gráfica SVG del perfil de jugador y envío real a `LeaderboardEntry` en Base44.
