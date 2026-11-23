import { memo, useEffect, useMemo, useRef } from 'react';
import type { SynthAudio } from '@/game/audio/SynthAudio';
import { useI18n } from '@/i18n';

// ============================================================================
// HUD yin-yang de la Cúpula: vida, Edén, EXP, nivel y oleada
// ============================================================================
//
// Dos capas superpuestas dentro de un lienzo lógico de 420 x 200:
//
//  1. Un canvas WebGL con el yin-yang. El shader dibuja el símbolo, rellena
//     cada mitad de abajo arriba según vida y Edén, y añade el acabado:
//     screentone halftone, estrellas en remolino en el Edén, menisco ondulado
//     en la línea de llenado, rim light en el borde, onda de choque al subir
//     de nivel y halo en los puntos críticos.
//  2. Un SVG con el anillo de EXP (96 marcas radiales + cuña de progreso) y
//     la barra NV. / OLEADA.
//
// El bucle de dibujo lee el estado desde un ref: el HUD se re-renderiza a
// 30 Hz y recrear el contexto WebGL en cada render sería inviable.

const VIEW_W = 420;
const VIEW_H = 200;
const CX = 100;
const CY = 100;
const R_OUTER = 76.5;
const R_INNER = 65.5;
const TICK_COUNT = 96;

const HUD_FONT = "'Barlow Condensed', 'Arial Narrow', 'Helvetica Neue', sans-serif";
/** Azul del borde exterior: sustituye a todos los rojos del diseño original. */
const ACCENT = '#3be8ff';

const VERTEX_SHADER = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;
varying vec2 v_uv;

uniform float u_time;
uniform float u_hp;
uniform float u_eden;
uniform float u_hpFlash;
uniform float u_edenFlash;
uniform float u_levelPulse;
uniform float u_res;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float screentone(vec2 uv, float freq, float density) {
  mat2 rot = mat2(0.7071, -0.7071, 0.7071, 0.7071);
  vec2 g = fract((rot * uv) * freq) - 0.5;
  float r = clamp(density, 0.0, 0.55);
  return 1.0 - smoothstep(r - 0.07, r + 0.07, length(g));
}

float starLayer(vec2 uv, float scale) {
  vec2 gv = fract(uv * scale) - 0.5;
  vec2 id = floor(uv * scale);
  float n = hash21(id);
  if (n < 0.88) return 0.0;
  vec2 offset = vec2(n - 0.5, fract(n * 34.0) - 0.5) * 0.55;
  float d = length(gv - offset);
  float size = mix(0.03, 0.09, fract(n * 17.0));
  return smoothstep(size, 0.0, d) * (0.6 + 0.4 * sin(u_time * 2.5 + n * 40.0));
}

vec3 edenShader(vec2 uv, float eden) {
  float g = clamp((-uv.y * 0.45 + 0.45) + (-uv.x * 0.25), 0.0, 1.0);
  vec3 deepVoid = vec3(0.09, 0.04, 0.22);
  vec3 nebula   = vec3(0.48, 0.09, 0.45);
  vec3 col = mix(deepVoid, nebula, g);

  float dots = screentone(uv, 30.0, mix(0.08, 0.36, g));
  col = mix(col, col * 1.55 + vec3(0.08, 0.0, 0.12), dots * 0.55);

  // Remolino: las estrellas orbitan el centro del símbolo.
  float a = u_time * 0.06;
  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 suv = rot * uv;
  col += vec3(0.95, 0.92, 1.0) * (starLayer(suv + u_time * 0.008, 12.0) * 0.85
                                + starLayer(suv * 1.3 - u_time * 0.005, 22.0) * 0.5);

  // Cuanto más bajo el Edén, más oscuro se pone el símbolo.
  return col * mix(0.5, 1.0, smoothstep(0.0, 0.7, eden));
}

vec3 vidaShader(vec2 uv, float hp) {
  vec3 green  = vec3(0.11, 0.86, 0.36);
  vec3 orange = vec3(1.00, 0.50, 0.07);
  vec3 red    = vec3(0.94, 0.10, 0.22);

  // Bandas del diseño: verde por encima del 60%, naranja en el tramo 40-60%
  // y rojo por debajo del 40%, con transiciones suaves en los bordes.
  float toOrange = 1.0 - smoothstep(0.55, 0.65, hp);
  float toRed    = 1.0 - smoothstep(0.35, 0.45, hp);
  vec3 base = mix(green, orange, toOrange);
  base = mix(base, red, toRed);

  float g = clamp(-uv.y * 0.45 + 0.45, 0.0, 1.0);
  float dots = screentone(uv, 30.0, mix(0.06, 0.32, g));
  return mix(base, base * 0.68, dots * 0.55);
}

void main() {
  vec2 uv = v_uv;
  float aa = 2.0 / u_res;
  float R = 0.95;
  float r = R * 0.5;

  float dOuter = length(uv) - R;
  float alpha = 1.0 - smoothstep(-aa, aa, dOuter);
  if (alpha <= 0.001) discard;

  float dTop = length(uv - vec2(0.0,  r)) - r;
  float dBot = length(uv - vec2(0.0, -r)) - r;

  float isVida = smoothstep(-aa, aa, uv.x);
  isVida = max(isVida, 1.0 - smoothstep(-aa, aa, dTop));
  isVida = min(isVida, smoothstep(-aa, aa, dBot));

  // Menisco: la línea de llenado ondula como un líquido en gravedad cero.
  float wave = sin(uv.x * 11.0 + u_time * 2.1) * 0.010
             + sin(uv.x * 23.0 - u_time * 3.3) * 0.005;

  float yNorm = clamp((uv.y / R) * 0.5 + 0.5, 0.0, 1.0);
  float hpFill   = 1.0 - smoothstep(u_hp - aa, u_hp + aa, yNorm + wave);
  float edenFill = 1.0 - smoothstep(u_eden - aa, u_eden + aa, yNorm + wave);

  vec3 emptyCol = vec3(0.03, 0.03, 0.05);
  vec3 colVida = mix(emptyCol, vidaShader(uv, u_hp), hpFill);
  vec3 colEden = mix(emptyCol, edenShader(uv, u_eden), edenFill);
  vec3 col = mix(colEden, colVida, isVida);

  // Rim light: borde interior luminoso que respira.
  float rim = smoothstep(0.11, 0.0, abs(dOuter + 0.035));
  col += vec3(0.35, 0.85, 1.0) * rim * (0.16 + 0.08 * sin(u_time * 1.7));

  // Onda de choque al subir de nivel: anillo que se expande desde el centro.
  if (u_levelPulse > 0.001) {
    float t = 1.0 - u_levelPulse;
    float ringR = t * R * 1.2;
    float ring = smoothstep(0.07, 0.0, abs(length(uv) - ringR));
    col += vec3(0.75, 0.95, 1.0) * ring * u_levelPulse * 0.85;
  }

  float dotTop = length(uv - vec2(0.0,  r)) - 0.15;
  float dotBot = length(uv - vec2(0.0, -r)) - 0.15;
  float inTop = 1.0 - smoothstep(-aa, aa, dotTop);
  float inBot = 1.0 - smoothstep(-aa, aa, dotBot);

  float hpCrit   = (u_hp   > 0.001 && u_hp   <= 0.25) ? 1.0 : 0.0;
  float edenCrit = (u_eden > 0.001 && u_eden <= 0.25) ? 1.0 : 0.0;
  float blink = 0.5 + 0.5 * sin(u_time * 9.0);

  float hpGlow   = max(hpCrit * 0.12, u_hpFlash);
  float edenGlow = max(edenCrit * 0.12, u_edenFlash);
  hpGlow   = max(hpGlow, hpCrit * blink * 0.9);
  edenGlow = max(edenGlow, edenCrit * blink * 0.9);

  // Halo alrededor del punto crítico.
  float haloTop = smoothstep(0.34, 0.16, length(uv - vec2(0.0,  r))) * hpGlow;
  float haloBot = smoothstep(0.34, 0.16, length(uv - vec2(0.0, -r))) * edenGlow;
  col += vec3(1.0, 0.12, 0.22) * haloTop * 0.30;
  col += vec3(0.15, 0.92, 1.0) * haloBot * 0.30;

  vec3 topDotCol = mix(vec3(0.015), vec3(1.0, 0.14, 0.24), hpGlow);
  vec3 botDotCol = mix(vec3(0.015), vec3(0.15, 0.92, 1.0), edenGlow);

  col = mix(col, topDotCol, inTop);
  col = mix(col, botDotCol, inBot);

  // Grano sutil: rompe el banding de los degradados.
  col += (hash21(uv * 512.0 + u_time) - 0.5) * 0.022;

  gl_FragColor = vec4(col, alpha);
}
`;

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram | null {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

/** 96 marcas radiales del anillo de EXP (mayores cada 12). */
function buildTicks(majorColor: string, minorColor: string) {
  const ticks = [];
  for (let i = 0; i < TICK_COUNT; i++) {
    const angle = (i / TICK_COUNT) * Math.PI * 2;
    const isMajor = i % 12 === 0;
    const r1 = isMajor ? 66.8 : 69.5;
    const r2 = isMajor ? 75.2 : 74.0;
    ticks.push(
      <line
        key={i}
        x1={CX + Math.cos(angle) * r1}
        y1={CY + Math.sin(angle) * r1}
        x2={CX + Math.cos(angle) * r2}
        y2={CY + Math.sin(angle) * r2}
        stroke={isMajor ? majorColor : minorColor}
        strokeWidth={isMajor ? 1.3 : 0.85}
      />,
    );
  }
  return ticks;
}

/** Cuña de EXP: arranca a las 12 y avanza en sentido horario. */
function expWedgePath(percent: number): string {
  const p = Math.max(0, Math.min(100, percent));
  if (p <= 0.01) return '';
  if (p >= 99.99) return `M ${CX} ${CY} m -100 0 a 100 100 0 1 0 200 0 a 100 100 0 1 0 -200 0`;
  const rad = (p / 100) * Math.PI * 2;
  const x = CX + Math.sin(rad) * 100;
  const y = CY - Math.cos(rad) * 100;
  const largeArc = p > 50 ? 1 : 0;
  return `M ${CX} ${CY} L ${CX} ${CY - 100} A 100 100 0 ${largeArc} 1 ${x} ${y} Z`;
}

function pad2(value: number): string {
  return String(Math.max(0, Math.floor(value))).padStart(2, '0');
}

interface DomeYinYangHudProps {
  hp: number;
  maxHp: number;
  eden: number;
  maxEden: number;
  exp: number;
  expToNext: number;
  level: number;
  waveNumber?: number;
  waveLabel?: string;
  /** Audio del bucle de juego: dispara las alertas de vida, Edén, nivel y oleada. */
  audioRef: { current: SynthAudio | null };
  /** false con la pausa, el level-up o el battle report abiertos. */
  alertsEnabled: boolean;
}

function DomeYinYangHudInner({
  hp,
  maxHp,
  eden,
  maxEden,
  exp,
  expToNext,
  level,
  waveNumber,
  waveLabel,
  audioRef,
  alertsEnabled,
}: DomeYinYangHudProps) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const hp01 = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  const eden01 = maxEden > 0 ? Math.max(0, Math.min(1, eden / maxEden)) : 0;
  const expPct = expToNext > 0 ? Math.max(0, Math.min(100, (exp / expToNext) * 100)) : 0;

  // Estado vivo para el bucle de dibujo (no recrea el contexto WebGL).
  const liveRef = useRef({ hp: 1, eden: 1, level: 1, wave: 1, alerts: true });
  liveRef.current = {
    hp: hp01,
    eden: eden01,
    level,
    wave: waveNumber ?? 1,
    alerts: alertsEnabled,
  };

  const ticksBg = useMemo(
    () => buildTicks('rgba(255,255,255,0.24)', 'rgba(255,255,255,0.14)'),
    [],
  );
  const ticksActive = useMemo(() => buildTicks('#ffffff', ACCENT), []);
  const wedge = expWedgePath(expPct);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true });
    if (!gl) return;
    const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    if (!program) return;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(program, 'u_time');
    const uHp = gl.getUniformLocation(program, 'u_hp');
    const uEden = gl.getUniformLocation(program, 'u_eden');
    const uHpFlash = gl.getUniformLocation(program, 'u_hpFlash');
    const uEdenFlash = gl.getUniformLocation(program, 'u_edenFlash');
    const uLevelPulse = gl.getUniformLocation(program, 'u_levelPulse');
    const uRes = gl.getUniformLocation(program, 'u_res');

    let raf = 0;
    let last = 0;
    let hpFlash = 0;
    let edenFlash = 0;
    let levelPulse = 0;
    let nextHpBeep = 0;
    let nextEdenBeep = 0;
    let lastLevel = liveRef.current.level;
    let lastWave = liveRef.current.wave;

    const render = (now: number) => {
      const sec = now * 0.001;
      const dt = last ? Math.min(0.1, (now - last) * 0.001) : 0.016;
      last = now;

      const live = liveRef.current;
      const audio = audioRef.current;

      // Subida de nivel y cambio de oleada: one-shots que suenan siempre. La
      // subida de nivel abre el modal de cartas en el mismo frame, así que
      // `alerts` ya llega en false y el arpegio se quedaba sin tocar.
      if (audio) {
        if (live.level > lastLevel) {
          audio.playLevelUp();
          levelPulse = 1;
        }
        if (live.wave > lastWave) audio.playNewWave();
      }
      lastLevel = live.level;
      lastWave = live.wave;

      if (live.alerts && audio) {
        // Latido de vida crítica: se acelera por debajo del 12%.
        if (live.hp > 0 && live.hp <= 0.25) {
          if (sec >= nextHpBeep) {
            const urgent = live.hp <= 0.12;
            audio.playLowHpPulse(urgent);
            hpFlash = 1;
            nextHpBeep = sec + (urgent ? 0.65 : 0.95);
          }
        } else {
          nextHpBeep = 0;
        }

        // Descarga de Edén crítica.
        if (live.eden > 0 && live.eden <= 0.25) {
          if (sec >= nextEdenBeep) {
            audio.playLowEdenPulse();
            edenFlash = 1;
            nextEdenBeep = sec + 1.15;
          }
        } else {
          nextEdenBeep = 0;
        }
      } else {
        nextHpBeep = 0;
        nextEdenBeep = 0;
      }

      hpFlash = Math.max(0, hpFlash - dt * 2.4);
      edenFlash = Math.max(0, edenFlash - dt * 2.4);
      levelPulse = Math.max(0, levelPulse - dt * 1.6);

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uTime, sec);
      gl.uniform1f(uHp, live.hp);
      gl.uniform1f(uEden, live.eden);
      gl.uniform1f(uHpFlash, hpFlash);
      gl.uniform1f(uEdenFlash, edenFlash);
      gl.uniform1f(uLevelPulse, levelPulse);
      gl.uniform1f(uRes, canvas.width);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, [audioRef]);

  const waveTone =
    waveLabel === 'BOSS' ? '#ff4d6d' : waveLabel === 'MINIBOSS' ? '#ffc857' : '#ffffff';
  const waveText =
    waveNumber === undefined
      ? t('hud.training')
      : t('hud.wave', { n: pad2(waveNumber) });

  return (
    <div
      className="pointer-events-none absolute left-5 top-5 select-none"
      style={{ width: 'min(420px, 30vw)', aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
    >
      <canvas
        ref={canvasRef}
        width={320}
        height={320}
        className="absolute"
        style={{
          left: 'calc((100 - 67) / 420 * 100%)',
          top: 'calc((100 - 67) / 200 * 100%)',
          width: 'calc(134 / 420 * 100%)',
          height: 'calc(134 / 200 * 100%)',
        }}
      />

      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="absolute inset-0 h-full w-full overflow-visible"
      >
        <defs>
          <mask
            id="dome-hud-cut-center"
            maskUnits="userSpaceOnUse"
            x="0"
            y="0"
            width={VIEW_W}
            height={VIEW_H}
          >
            <rect width={VIEW_W} height={VIEW_H} fill="white" />
            <circle cx={CX} cy={CY} r="64.5" fill="black" />
          </mask>

          <mask
            id="dome-hud-bar-cut"
            maskUnits="userSpaceOnUse"
            x="0"
            y="0"
            width={VIEW_W}
            height={VIEW_H}
          >
            <rect width={VIEW_W} height={VIEW_H} fill="white" />
            <circle cx={CX} cy={CY} r={R_OUTER} fill="black" />
          </mask>

          <mask
            id="dome-hud-exp-wedge"
            maskUnits="userSpaceOnUse"
            x="0"
            y="0"
            width="200"
            height="200"
          >
            <rect width="200" height="200" fill="black" />
            <path d={wedge} fill="white" />
          </mask>
        </defs>

        {/* Barra NV. / OLEADA, recortada al ras del anillo exterior. */}
        <g mask="url(#dome-hud-bar-cut)">
          <polygon
            points="146,56 170,31 384,31 384,48 364,68 146,68"
            fill="rgba(4,4,8,0.92)"
            stroke="#e4e4ec"
            strokeWidth="1.2"
          />
          <polygon
            points="150,57 172,34.5 380.5,34.5 380.5,46.5 362.5,64.5 150,64.5"
            fill="none"
            stroke={ACCENT}
            strokeWidth="1.1"
          />

          <polygon points="188,60 198,40 258,40 248,60" fill="#ffffff" />
          <text
            x="223"
            y="56"
            textAnchor="middle"
            fill="#06060a"
            fontFamily={HUD_FONT}
            fontWeight="800"
            fontStyle="italic"
            fontSize="17"
            letterSpacing="0.5"
          >
            {`${t('hud.levelPrefix')} ${pad2(level)}`}
          </text>

          <polygon points="254,60 264,40 270,40 260,60" fill={ACCENT} />
          <polygon points="264,60 274,40 280,40 270,60" fill={ACCENT} />

          <text
            x="288"
            y="56"
            fill={waveTone}
            fontFamily={HUD_FONT}
            fontWeight="800"
            fontSize="18"
            letterSpacing="0.6"
          >
            {waveText}
          </text>
        </g>

        {/* Carril de EXP entre los dos aros blancos. */}
        <circle cx={CX} cy={CY} r={R_OUTER} fill="rgba(4,4,8,0.9)" mask="url(#dome-hud-cut-center)" />
        <g>{ticksBg}</g>

        <g mask="url(#dome-hud-exp-wedge)">
          <circle
            cx={CX}
            cy={CY}
            r="71"
            fill="none"
            stroke="rgba(59, 232, 255, 0.25)"
            strokeWidth="10"
          />
          <g style={{ filter: 'drop-shadow(0 0 2px rgba(59,232,255,0.8))' }}>{ticksActive}</g>
        </g>

        <circle cx={CX} cy={CY} r={R_INNER} fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1" />
        <circle
          cx={CX}
          cy={CY}
          r={R_OUTER}
          fill="none"
          stroke={ACCENT}
          strokeWidth="1.2"
          style={{ filter: 'drop-shadow(0 0 3px rgba(59,232,255,0.85))' }}
        />
      </svg>
    </div>
  );
}

export const DomeYinYangHud = memo(DomeYinYangHudInner);
export default DomeYinYangHud;
