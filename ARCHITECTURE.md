# OUTORBIT 2.0 — Arquitectura Maestra (Galaxia Continua & Sandbox Táctico)

> **Documento sagrado de arquitectura.** Todos los módulos deben respetar los contratos definidos en `src/game/types.ts`.

---

## 1. Visión de Diseño: Un Único Sistema Solar Vivo
- **Cero pantallas de carga / cero modales que corten la partida:** Todos los planetas (*Luna Tutorial*, *Verdant*, *Cryo-Drop*, *Iron Bastion* y *Trono de KRONOS*) coexisten simultáneamente en una sola escena 3D continua.
- **Tormentas Orbitales (soft-lock, sin barreras feas):** Los planetas posteriores están "protegidos" por un Cinturón de Asteroides Interceptores (rocas rojas/oscuras con contorno cómic orbitando rápido). Todos los planetas son **accesibles físicamente desde el minuto 1**: el retículo avisa `TORMENTA ORBITAL ACTIVA (¡Riesgo de impacto!)` en amarillo pero SÍ deja saltar; en vuelo, los interceptores persiguen la trayectoria del jugador y, al impactar, restan 1 de HP y lo rebotan al planeta origen (con skill se puede colar). Al destruir los generadores del planeta anterior (o conseguir la tarjeta maestra en *Iron Bastion*), el cinturón se desactiva limpiamente en vivo, la **Red de IA Estadística** inyecta allí sus contramedidas dinámicas y un banner táctico de radio (no bloqueante) avisa al jugador mientras sigue jugando o saltando en *Gravity Shift*.
- **Libertad Sandbox de 4 Rutas:** Cada planeta grande posee bases con edificios/murallas/torres/tejados/plataformas orbitales con colisión real, ofreciendo siempre múltiples caminos:
  1. **Sigilo (`Kitsune`):** Hierba alta, cobertura tras edificios, lanzar objetos para distraer guardias (`investigating`), noqueo aislado (`E`) y disfraz.
  2. **Subsuelo (`Digger`):** Excavar (`Shift`) por debajo de murallas/vallas láser, o atravesar el núcleo (zoom-out 180º) para salir dentro del patio trasero de la base.
  3. **Aire / Parkour (`Axel`):** Burbujas espaciales, anillos y Ancla Gravitatoria (`Espacio` en aire) para escalar a torres/tejados/plataformas orbitales.
  4. **Combate Letal (`Estasis + Lock-On + Parry`):** Capturar hasta 4 objetos (`R` / `C`), fijar objetivo estilo GTA (`Q` + `←/→`), disparar 1 a 1 (`Clic Izq.`), hacer Parry (`F`) o usar barriles explosivos y *Gravity Dash* (`Clic Der.`).

---

## 2. Claridad Visual Diegética
- **Conos de visión en el suelo:** Sector curvo adherido al terreno frente a cada guardia/oficial (verde/ámbar en patrulla, amarillo investigando ruido, rojo en combate), **recortado/ocluso por edificios reales**.
- **Balizas verticales luminosas:** Columnas de luz sobre generadores, tarjetas y zonas clave visibles desde cualquier punto del planeta.
- **Marcadores direccionales en HUD:** Proyección 2D en pantalla / borde de pantalla mostrando iconos y distancia (`m`) hacia los objetivos activos del planeta actual (o el siguiente planeta desbloqueado).

---

## 3. Estructura Modular (`src/`)
```text
src/
  api/leaderboard.ts               # Base44 LeaderboardEntry SDK wrapper
  game/
    types.ts                       # CONTRATO SAGRADO ÚNICO
    GameEngine.ts                  # Loop continuo de la Galaxia, Pointer Lock, cámara multi-planeta/edificio
    math/
      spherical.ts                 # Transporte paralelo por cuaterniones, colisión esfera + estructuras tangentes
    render/
      toonMaterials.ts             # Cel-shading GLSL 3 bandas + halftone + Fresnel + tinta limpia + cielo cósmico
      proceduralModels.ts          # Kitsune/Digger/Axel/Enemigos/Kronos/Edificios/Escudos/Conos de visión
    entities/
      PlayerController.ts          # Movimiento, colisión con edificios/techos, Estasis R+Click, Lock-On Q, Dash
      WorldObjects.ts              # Planeta-scoped bases, edificios con colisión/LoS, enemigos con cono+distracción, Kronos
    ai/
      BehaviorTracker.ts           # Vector de comportamiento acumulado y porcentajes
      AdaptationDirector.ts        # Adaptación dinámica de cada planeta al caer su escudo
      KronosNeuralNet.ts           # MLP híbrido 8->10->4 (134 parámetros offline + backpropagation online)
    levels/
      levelDefinitions.ts          # GALAXY_PLANETS (5 planetas en el mismo espacio + bases, edificios, rutas, burbujas)
    audio/
      SynthAudio.ts                # Web Audio API procedural
  ui/
    MobileBlocker.tsx
    TitleScreen.tsx
    GameHUD.tsx                    # HUD táctico + marcadores direccionales + toast de adaptación IA + barra de Kronos
    BattleReportScreen.tsx         # Radar SVG + informe MLP + Leaderboard Base44
```
