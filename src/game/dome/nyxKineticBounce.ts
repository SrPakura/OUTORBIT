import * as THREE from 'three';

// ============================================================================
// OUTORBIT — NYX: Sentadilla Cinética (Rebote Impulsado en Pared)
// ============================================================================
//
// Mecánica intrínseca de NYX (NO es una habilidad activa): cuando se desplaza
// hacia una pared (cualquier superficie NO pisable: canto de la tapa, raíz
// iceberg, lateral de un suelo) a una velocidad de impacto igual o superior a
// TRIGGER_SPEED (12 m/s: ~1 s de WASD en flotación, cualquier dash o patada
// lo supera), en lugar del rebote estándar amortiguado
// Nyx orienta los pies hacia la normal de la pared, absorbe el impacto en una
// sentadilla redirigiendo su energía cinética y sale disparada en la
// dirección opuesta conservando TODO el impulso acumulado.
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
//   idle ──(predicción de impacto)──► prepare ──(contacto real)──► squat
//          ──(fin de la compresión)──► launch ──(fin del impulso)──► idle
//
//   idle     Estado de reposo lógico. Sin efecto visual.
//
//   prepare  PREPARACIÓN (duración variable, típicamente ~0.16 s, tope
//            PREPARE_TIMEOUT = 0.30 s). Un raycast de anticipación detecta
//            la pared a (radio + velocidad × PREDICT_TIME) metros. La física
//            NO cambia: Nyx sigue volando con su vector intacto mientras el
//            cuerpo gira los pies hacia la normal prevista (lerp exponencial
//            a ORIENT_RATE). Si el contacto no llega a tiempo (o resulta ser
//            una cara pisable), la preparación se cancela sin efecto.
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
// Orientación del modelo durante prepare/squat/launch:
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
 * Umbral de activación: velocidad de impacto (m/s) mínima para que la pared
 * "muerda" la sentadilla. Anclado originalmente al umbral del taladro
 * espiral (18 m/s); rebajado a 12 m/s para que sea alcanzable con ~1 s de
 * empuje WASD en flotación, sin llegar a dispararse al correr o derrapar
 * en suelo (7.4 / 10 m/s).
 */
export const KINETIC_BOUNCE = {
  /** m/s de impacto total que activan la sentadilla. */
  TRIGGER_SPEED: 12.0,
  /**
   * m/s mínimos de componente normal: un roce tangencial no la activa.
   * 2.0 = hasta ~80° de inclinación a 12 m/s (antes 4.0, ~70°): los impactos
   * en diagonal contra la raíz iceberg disparan sentadilla en vez de
   * desviarse como roce de canto.
   */
  MIN_NORMAL_IMPACT: 2.0,
  /** s de anticipación del raycast: mira `velocidad × PREDICT_TIME` metros. */
  PREDICT_TIME: 0.16,
  /** s máximos de preparación sin contacto antes de cancelar. */
  PREPARE_TIMEOUT: 0.30,
  /**
   * Impacto frontal previsto: la normal se opone al vuelo (|dot| mínimo).
   * 0.35 = la preparación orienta los pies también en impactos en diagonal
   * (hasta ~69° de la normal); el disparo real lo miden TRIGGER_SPEED y
   * MIN_NORMAL_IMPACT en el contacto.
   */
  HEAD_ON_DOT: 0.35,
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
export type KineticBouncePhase = 'idle' | 'prepare' | 'squat' | 'launch';

/**
 * Estado de la Sentadilla Cinética. El controlador lo alimenta con las
 * normales de contacto y la velocidad; la clase guarda los vectores de la
 * coreografía (entrada, pared y salida) sin allocations por frame.
 */
export class KineticBounceState {
  phase: KineticBouncePhase = 'idle';
  /** Segundos llevados en la fase actual (prepare/squat/launch). */
  timer = 0;

  /** Normal de la pared: la prevista en prepare, la real en squat/launch. */
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

  /** Fase de preparación: guarda la normal prevista y el vector de vuelo. */
  beginPrepare(normal: THREE.Vector3, dir: THREE.Vector3, speed: number): void {
    this.phase = 'prepare';
    this.timer = 0;
    this.wallNormal.copy(normal);
    this.entryDir.copy(dir);
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
