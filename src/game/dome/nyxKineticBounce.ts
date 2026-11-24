import * as THREE from 'three';

// ============================================================================
// OUTORBIT — NYX: Sentadilla Cinética (Rebote Impulsado en Pared)
// ============================================================================
//
// Mecánica intrínseca de NYX (NO es una habilidad activa), 100% OPTATIVA:
// cuando el visor apunta a una superficie de suelo (cara lisa de la tapa,
// canto, raíz iceberg — cualquier cara de un slab) a velocidad >=
// TRIGGER_SPEED (12 m/s: ~1 s de WASD en flotación) y con margen de
// aproximación suficiente, la estrella del visor se pone AZUL CLARITO
// (disponible). El jugador la ADJUDICA con el Clic Derecho (el del dash):
// la estrella pasa a AZUL BRILLANTE, Nyx se orienta, curva su vector hacia
// el punto de impacto óptimo (perpendicular a la superficie = animación
// limpia y rebote máximo) y al contacto absorbe en sentadilla y sale
// disparada en la dirección reflejada conservando TODO el impulso. Sin
// velocidad mínima el Clic Derecho hace el dash normal: el botón nunca se
// siente muerto.
//
// Lore mecánico: Nyx altera de forma natural la gravedad local junto con su
// propia composición de cosmos, absorbiendo el impacto sin daño físico ni
// frenado y redirigiendo la energía al extender las piernas.
//
// Reglas de recursos:
//   - Coste de Edén: 0 (nunca consume).
//   - No es un dash, ni un propulsor, ni el modo de flotación activa: no
//     ocupa ranura, no tiene cooldown de habilidad (solo un antirrebote
//     físico corto) y no puede bloquearse por falta de recursos.
//
// ----------------------------------------------------------------------------
// CONTRATO DE ANIMACIÓN PARA BLENDER (Gemini 4 Hydrogen)
// ----------------------------------------------------------------------------
// Este módulo es la FUENTE DE VERDAD de la física y el timing. El clip
// definitivo `nyx_kinetic_squat` debe producirse en Blender sincronizado con
// estos valores. La física mueve el root: el clip es IN-PLACE (sin root
// motion); Blender solo anima huesos.
//
// Máquina de estados (fases en orden, ver `KineticBouncePhase`):
//
//   idle ──(Clic Derecho con pared en la mira)──► committed ──(contacto
//          real)──► squat ──(fin de la compresión)──► launch ──(fin del
//          impulso)──► idle
//
//   idle     Estado de reposo lógico. Sin efecto visual. El controlador
//            refresca cada frame `aimReady` (pared en la mira, velocidad y
//            margen suficientes) para pintar la estrella azul clarito.
//
//   committed ADJUDICACIÓN (duración variable, tope COMMIT_TIMEOUT = 2.6 s).
//            El jugador ha pedido el rebote: la estrella brilla en azul y
//            Nyx curva su vector hacia el punto de impacto óptimo
//            (HOMING_TURN_RATE; a HOMING_FINAL_DIST metros gira a la
//            entrada perpendicular −normal) mientras el cuerpo orienta los
//            pies hacia la normal (lerp exponencial a ORIENT_RATE). Si el
//            contacto no llega a tiempo (o resulta ser una cara pisable), la
//            adjudicación se cancela sin efecto.
//            ANIMACIÓN: reorientación del rig, sin clip dedicado.
//
//   squat    COMPRESIÓN DE SENTADILLA (SQUAT_DURATION = 0.16 s ≈ 9.6 frames
//            a 60 fps). Empieza en el contacto real con la pared. La esfera
//            queda clavada sobre el punto de contacto (radio + 0.02 m) y la
//            velocidad muere exponencialmente (ABSORB_LAMBDA): la energía
//            se "guarda" en la flexión. ANIMACIÓN: clip `kinetic_squat`,
//            segmento t ∈ [0, 0.16] s.
//
//   launch   IMPULSO DE SALIDA (LAUNCH_DURATION = 0.12 s ≈ 7.2 frames a
//            60 fps). Las piernas se extienden y la velocidad se fija de
//            golpe a exitSpeed = entrySpeed × SPEED_KEEP en la dirección
//            reflejada. ANIMACIÓN: mismo clip, segmento t ∈ [0.16, 0.28] s.
//            Duración total del clip: 0.28 s (KINETIC_SQUAT_CLIP.duration en
//            `nyxBakedClips.ts`, horneado de nyx_kinetic_squat.glb, DEBE
//            coincidir con SQUAT_DURATION + LAUNCH_DURATION).
//
// Orientación del modelo durante committed/squat/launch:
//   - Eje +Y del rig (cabeza) = normal de la pared (`wallNormal`).
//   - Pies (-Y) hacia la superficie de contacto.
//   - Eje +Z (frente) = tangente: la proyección del rumbo de vuelo al plano
//     de la pared. En el lanzamiento el frente gira hacia `exitDir`.
//
// Vectores de dirección (espacio mundo):
//   - entryDir: vector unitario de la velocidad en el contacto (hacia la
//     pared). entrySpeed = |velocidad| ≥ TRIGGER_SPEED (12 m/s).
//   - wallNormal: normal unitaria de la superficie en el punto de contacto
//     (apunta SIEMPRE hacia Nyx, lista para empujar).
//   - exitDir = entryDir − 2·(entryDir·wallNormal)·wallNormal  (reflejo).
//     En un impacto frontal perfecto exitDir = −entryDir ("dirección
//     opuesta"). exitSpeed = entrySpeed × SPEED_KEEP (100% del impulso).
//
// Parámetros de velocidad que el clip debe respetar:
//   - La compresión absorbe la velocidad con decaimiento exp(−16·t): el
//     desplazamiento del root durante la sentadilla es ~0 (clavada). El clip
//     NO debe desplazar la cadera hacia la pared más allá de unos pocos cm
//     (la esfera ya está a radio+0.02 de la superficie).
//   - El impulso de salida es instantáneo a nivel físico: el frame exacto
//     t = 0.16 s del clip es el primer frame en que la velocidad ya es la
//     de salida. La extensión de piernas del clip debe anticiparse unos 2-3
//     frames ANTES de t = 0.16 para que el estirón visual preceda al
//     despegue físico (anticipación clásica).
// ============================================================================

/**
 * Umbral de activación: velocidad (m/s) mínima para que la opción de rebote
 * aparezca en la mira. 12 m/s = ~1 s de empuje WASD en flotación, sin
 * llegar a ofrecerse al correr o derrapar en suelo (7.4 / 10 m/s).
 */
export const KINETIC_BOUNCE = {
  /** m/s mínimos para que la estrella ofrezca el rebote. */
  TRIGGER_SPEED: 12.0,
  /** m máximos de la mira a la pared para ofrecer el rebote. */
  AIM_RANGE: 42.0,
  /**
   * s mínimos de aproximación (distancia / velocidad): si la pared está tan
   * cerca que no da tiempo a orientarse y curvar el vector, la opción no
   * se ofrece (la estrella no se pone azul).
   */
  MIN_APPROACH_TIME: 0.22,
  /** s máximos de adjudicación sin contacto antes de cancelar. */
  COMMIT_TIMEOUT: 2.6,
  /** rad/s de curvado del vector hacia el punto de impacto óptimo. */
  HOMING_TURN_RATE: 10.0,
  /**
   * m al punto de impacto a partir de los que el vector gira de "hacia el
   * punto" a "perpendicular a la pared" (−normal): entrada frontal = rebote
   * máximo y animación más limpia.
   */
  HOMING_FINAL_DIST: 4.0,
  /**
   * m de la cámara de rebote: al contactar, la cámara se ancla donde estaba
   * y mira a Nyx (se la ve hacer la sentadilla y girar); al salir de este
   * radio del punto de impacto, vuelve a seguirla con un blend elástico.
   */
  BOUNCE_CAM_RADIUS: 5.0,
  /** s de compresión de la sentadilla (fase squat). */
  SQUAT_DURATION: 0.16,
  /** s de impulso de salida (fase launch). */
  LAUNCH_DURATION: 0.12,
  /** Fracción del impulso conservado al salir (1.0 = todo el impulso). */
  SPEED_KEEP: 1.0,
  /** Absorción de velocidad durante la compresión: exp(−λ·dt). */
  ABSORB_LAMBDA: 16.0,
  /** rad/s de giro del cuerpo hacia la orientación de pared. */
  ORIENT_RATE: 14.0,
  /** s de antirrebote físico tras el lanzamiento (no es cooldown de skill). */
  COOLDOWN: 0.30,
} as const;

/** Fases de la Sentadilla Cinética (ver contrato de animación arriba). */
export type KineticBouncePhase = 'idle' | 'committed' | 'squat' | 'launch';

/** Estado de la estrella del visor para el HUD. */
export type KineticBounceUiState = 'none' | 'available' | 'committed';

/**
 * Estado de la Sentadilla Cinética. El controlador lo alimenta con las
 * normales de contacto y la velocidad; la clase guarda los vectores de la
 * coreografía (entrada, pared y salida) sin allocations por frame.
 */
export class KineticBounceState {
  phase: KineticBouncePhase = 'idle';
  /** Segundos llevados en la fase actual (committed/squat/launch). */
  timer = 0;

  /**
   * ¿Hay pared valida en la mira este frame? Lo refresca el controlador
   * cada frame en idle: pinta la estrella azul clarito y arma el commit
   * del Clic Derecho.
   */
  aimReady = false;

  /** Punto de impacto previsto/adjudicado (mundo). */
  readonly targetPoint = new THREE.Vector3();
  /** Normal de la pared: la prevista en committed, la real en squat/launch. */
  readonly wallNormal = new THREE.Vector3();
  /** Vector unitario de entrada (hacia la pared) en el contacto. */
  readonly entryDir = new THREE.Vector3(0, 0, -1);
  /** Vector unitario de salida (reflejo de la entrada). */
  readonly exitDir = new THREE.Vector3(0, 0, 1);
  /** m/s de entrada capturados en el contacto. */
  entrySpeed = 0;
  /** m/s de salida: entrySpeed × SPEED_KEEP. */
  exitSpeed = 0;

  reset(): void {
    this.phase = 'idle';
    this.timer = 0;
    this.entrySpeed = 0;
    this.exitSpeed = 0;
  }

  /**
   * Adjudicación del rebote (Clic Derecho con pared en la mira): fija el
   * punto de impacto óptimo y la normal prevista; el controlador curva el
   * vector hacia ellos.
   */
  beginCommit(point: THREE.Vector3, normal: THREE.Vector3, speed: number): void {
    this.phase = 'committed';
    this.timer = 0;
    this.targetPoint.copy(point);
    this.wallNormal.copy(normal);
    this.entrySpeed = speed;
  }

  /** Contacto real: fija la normal de la pared y captura la entrada. */
  beginSquat(normal: THREE.Vector3, dir: THREE.Vector3, speed: number): void {
    this.phase = 'squat';
    this.timer = 0;
    this.wallNormal.copy(normal);
    this.entryDir.copy(dir);
    this.entrySpeed = speed;
  }

  /**
   * Calcula el lanzamiento: exitDir = reflejo de entryDir sobre el plano de
   * la pared y exitSpeed = entrySpeed × SPEED_KEEP (todo el impulso).
   */
  beginLaunch(): void {
    this.phase = 'launch';
    this.timer = 0;
    this.exitDir
      .copy(this.entryDir)
      .addScaledVector(this.wallNormal, -2 * this.entryDir.dot(this.wallNormal));
    if (this.exitDir.lengthSq() < 1e-6) {
      // Entrada degenerada (sin componente normal): sale por la normal.
      this.exitDir.copy(this.wallNormal);
    } else {
      this.exitDir.normalize();
    }
    this.exitSpeed = this.entrySpeed * KINETIC_BOUNCE.SPEED_KEEP;
  }
}
