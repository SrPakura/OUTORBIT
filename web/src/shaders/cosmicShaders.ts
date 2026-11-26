import * as THREE from 'three';

export function srgbVec3(hex: string): THREE.Vector3 {
  const n = parseInt(hex.replace('#', ''), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// ============================================================================
// 1. Bóveda espacial de la Cúpula (#040510 -> #0c1430 -> #1e1038)
// ============================================================================
export const SKY_VERT = /* glsl */ `
  varying vec3 vWorldDir;
  void main() {
    vWorldDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const SKY_FRAG = /* glsl */ `
  varying vec3 vWorldDir;
  void main() {
    float h = clamp(vWorldDir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 abyss = vec3(0.016, 0.020, 0.063);   // #040510
    vec3 mid = vec3(0.047, 0.078, 0.188);     // #0c1430
    vec3 top = vec3(0.118, 0.063, 0.220);     // #1e1038
    vec3 col = mix(abyss, mid, smoothstep(0.0, 0.55, h));
    col = mix(col, top, smoothstep(0.45, 1.0, h));
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ============================================================================
// 2. Estrellas de 4 puntas del Diorama
// ============================================================================
export const STARS_VERT = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aSeed;
  uniform float uTime;
  uniform float uPixelScale;
  varying vec3 vColor;
  varying float vSeed;
  void main() {
    vColor = aColor;
    vSeed = aSeed;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    float twinkle = 0.72 + 0.28 * sin(uTime * 2.4 + aSeed * 19.7);
    gl_PointSize = (aSize * twinkle * uPixelScale) / max(1.0, -mvPos.z);
    gl_Position = projectionMatrix * mvPos;
  }
`;

export const STARS_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vSeed;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float ax = abs(p.x);
    float ay = abs(p.y);
    float crossMask = exp(-ax * 7.5) * exp(-ay * 1.4) + exp(-ay * 7.5) * exp(-ax * 1.4);
    float core = exp(-length(p) * 3.8);
    float alpha = clamp(crossMask * 0.85 + core, 0.0, 1.0);
    if (alpha < 0.04) discard;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

// ============================================================================
// 3. Divisor Líquido (port exacto de src/game/render/menuShaders.ts)
// ============================================================================
export const DIVIDER_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const DIVIDER_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uAspect;
  varying vec2 vUv;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      sum += amp * valueNoise(p);
      p = p * 2.03 + vec2(1.7, 9.2);
      amp *= 0.5;
    }
    return sum;
  }

  float halftoneDots(vec2 fragCoord, float scale) {
    float angle = 0.523599;
    mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    vec2 uv = (rot * fragCoord) / scale;
    vec2 grid = fract(uv) - 0.5;
    return length(grid);
  }

  void main() {
    vec2 uv = vUv;
    float baseEdgeX = mix(0.18, 0.04, 1.0 - uv.y);
    vec2 flow = vec2(uv.x * uAspect, uv.y);
    float t = uTime;
    float n1 = fbm(vec2(flow.y * 3.0 + t * 0.22, flow.x * 1.5 - t * 0.12));
    float n2 = fbm(vec2(flow.y * 6.2 - t * 0.28, flow.x * 2.6 + t * 0.16));
    float wave = sin(uv.y * 9.0 + t * 1.2) * 0.40 + (n1 - 0.5) * 1.25 + (n2 - 0.5) * 0.55;
    float fluidEdgeX = baseEdgeX + (wave / 1.5) * 0.024;
    float d = uv.x - fluidEdgeX;

    vec3 col;
    float alpha;
    if (d < 0.0) {
      vec3 paper = vec3(0.945, 0.945, 0.929);
      vec2 gp = gl_FragCoord.xy / 96.0;
      vec2 gf = abs(fract(gp) - 0.5);
      float lineMask = smoothstep(0.485, 0.5, max(gf.x, gf.y));
      col = mix(paper, paper * 0.93, lineMask * 0.55);
      alpha = 1.0;
    } else if (d < 0.005) {
      col = vec3(0.043, 0.051, 0.071);
      alpha = 0.94;
    } else if (d < 0.07) {
      float f = (d - 0.005) / 0.065;
      float swirl = fbm(vec2(uv.y * 5.0 + t * 0.3, f * 3.5 - t * 0.45));
      vec3 ink = vec3(0.043, 0.051, 0.071);
      vec3 crimson = vec3(0.88, 0.11, 0.28);
      vec3 plum = vec3(0.49, 0.23, 0.93);
      vec3 cian = vec3(0.13, 0.83, 0.93);
      vec3 liquid = mix(crimson, plum, smoothstep(0.2, 0.85, swirl));
      liquid = mix(liquid, cian, smoothstep(0.55, 1.0, swirl) * 0.45);
      col = mix(ink, liquid, smoothstep(0.0, 0.4, f));
      float dots = halftoneDots(gl_FragCoord.xy, 6.5);
      float dotMask = smoothstep(0.7, 0.1, f) * 0.45;
      alpha = (dots < dotMask ? 0.48 : 0.22) * (1.0 - smoothstep(0.0, 1.0, f));
    } else {
      col = vec3(0.0);
      alpha = 0.0;
    }
    gl_FragColor = vec4(col, alpha);
  }
`;

// ============================================================================
// 4. Shader Cosmic Nebula de NYX + Contorno Blanco Skinned
// ============================================================================
export const NYX_VERT = /* glsl */ `
  #include <common>
  #include <skinning_pars_vertex>
  varying vec3 vNormalWorld;
  varying vec3 vViewDir;
  void main() {
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
    vNormalWorld = normalize(mat3(modelMatrix) * objectNormal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const NYX_FRAG = /* glsl */ `
  uniform vec3 uDeepColor;
  uniform vec3 uNebulaA;
  uniform vec3 uNebulaB;
  uniform vec3 uRimColor;
  uniform float uTime;
  uniform float uGravityShift;
  uniform float uSpeed01;
  varying vec3 vNormalWorld;
  varying vec3 vViewDir;

  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }
  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }
  float fbm(vec2 p) {
    float v = 0.0; float a = 0.5;
    mat2 m = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 4; i++) { v += a * noise2(p); p = m * p * 2.02; a *= 0.5; }
    return v;
  }
  float starLayer(vec2 uv, float scale, float speed) {
    vec2 gv = fract(uv * scale) - 0.5;
    vec2 id = floor(uv * scale);
    float h = hash21(id);
    if (h < 0.82) return 0.0;
    vec2 offset = vec2(hash21(id + 7.1), hash21(id + 13.7)) - 0.5;
    float d = length(gv - offset * 0.65);
    float tw = 0.55 + 0.45 * sin(uTime * speed + h * 40.0);
    return smoothstep(mix(0.04, 0.14, fract(h * 19.3)), 0.0, d) * tw;
  }

  void main() {
    vec3 N = normalize(vNormalWorld);
    vec3 V = normalize(vViewDir);
    vec2 uv = gl_FragCoord.xy * 0.0042;
    vec2 drift = vec2(uTime * 0.045, -uTime * 0.03);
    float n1 = fbm(uv * 1.4 + drift);
    float n2 = fbm(uv * 2.2 - drift * 1.3 + n1 * 0.85);
    vec3 col = mix(uDeepColor, uNebulaA, smoothstep(0.34, 0.78, n1) * 0.85);
    col = mix(col, uNebulaB, smoothstep(0.44, 0.86, n2) * 0.75);

    float starSpeed = mix(2.4, 2.4 + 7.0 * uSpeed01, uGravityShift);
    float stars = starLayer(uv + drift * 0.35, 16.0, starSpeed) * 0.9
                + starLayer(uv - drift * 0.20, 28.0, starSpeed * 1.5) * 1.25;
    col += mix(vec3(1.0), uRimColor, 0.35) * stars;

    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.6);
    vec3 shiftRim = mix(vec3(0.13, 0.83, 0.93), vec3(0.66, 0.33, 0.97), 0.5 + 0.5 * sin(uTime * 1.7));
    float rimStrength = mix(0.65, 2.15, uGravityShift);
    col += mix(uRimColor, shiftRim, uGravityShift) * smoothstep(0.25, 0.9, fresnel) * rimStrength;
    col = mix(col, col * 1.22, uGravityShift);
    gl_FragColor = vec4(col, 0.92);
  }
`;

export const INVERTED_HULL_VERT = /* glsl */ `
  #include <common>
  #include <skinning_pars_vertex>
  uniform float uThickness;
  uniform float uNoiseAmp;
  void main() {
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    float brushVar = sin(transformed.x * 7.3 + transformed.y * 5.1) * cos(transformed.z * 6.7 - transformed.y * 4.2);
    float width = max(0.002, uThickness * (1.0 + brushVar * uNoiseAmp));
    vec3 extruded = transformed + normalize(objectNormal) * width;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(extruded, 1.0);
  }
`;

export const INVERTED_HULL_FRAG = /* glsl */ `
  uniform vec3 uInkColor;
  void main() {
    gl_FragColor = vec4(uInkColor, 1.0);
  }
`;

// ============================================================================
// 5. Carne Nebulosa de Enemigos + Rayos-X Cinéticos (`uFleshPeel`)
// ============================================================================
const ENERGY_WOBBLE_GLSL = /* glsl */ `
  float energyWobble(vec3 pos, float uTime) {
    return sin(pos.x * 9.0 + uTime * 22.0) * cos(pos.y * 7.0 - uTime * 19.0);
  }
`;

export const ENEMY_NEBULA_VERT = /* glsl */ `
  #include <common>
  #include <skinning_pars_vertex>
  uniform float uTime;
  varying vec3 vNormalWorld;
  varying vec3 vViewDir;
  varying vec3 vLocalPos;
  ${ENERGY_WOBBLE_GLSL}
  void main() {
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <begin_vertex>
    vLocalPos = position;
    #include <skinning_vertex>
    vec3 pos = transformed + objectNormal * energyWobble(transformed, uTime) * 0.045;
    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vNormalWorld = normalize(mat3(modelMatrix) * objectNormal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const ENEMY_NEBULA_FRAG = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uRimColor;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uFleshPeel;
  varying vec3 vNormalWorld;
  varying vec3 vViewDir;
  varying vec3 vLocalPos;

  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }
  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }
  float fbm(vec2 p) {
    float v = 0.0; float a = 0.5;
    mat2 m = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 4; i++) { v += a * noise2(p); p = m * p * 2.02; a *= 0.5; }
    return v;
  }
  float starLayer(vec2 uv, float scale, float speed) {
    vec2 gv = fract(uv * scale) - 0.5;
    vec2 id = floor(uv * scale);
    float h = hash21(id);
    if (h < 0.70) return 0.0;
    vec2 offset = vec2(hash21(id + 7.1), hash21(id + 13.7)) - 0.5;
    float d = length(gv - offset * 0.65);
    float tw = 0.6 + 0.4 * sin(uTime * speed + h * 40.0);
    return smoothstep(mix(0.05, 0.16, fract(h * 19.3)), 0.0, d) * tw;
  }

  void main() {
    vec3 N = normalize(vNormalWorld);
    vec3 V = normalize(vViewDir);
    vec2 uv = gl_FragCoord.xy * 0.0048;
    vec2 drift = vec2(uTime * 0.045, -uTime * 0.03);
    float n1 = fbm(uv * 1.6 + drift);
    float n2 = fbm(uv * 2.5 - drift * 1.3 + n1 * 0.9);
    vec3 col = vec3(0.02, 0.008, 0.035);
    col = mix(col, uColorA * 0.55, smoothstep(0.36, 0.80, n1));
    col = mix(col, uColorB * 0.72, smoothstep(0.48, 0.88, n2));
    float stars = starLayer(uv + drift * 0.35, 14.0, 2.6) * 1.3 + starLayer(uv - drift * 0.22, 24.0, 3.8) * 1.6;
    col += mix(vec3(1.0), uRimColor, 0.3) * stars;

    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.2);
    col += uRimColor * smoothstep(0.25, 0.9, fresnel) * 0.72;

    // Rayos-X Cinéticos (uFleshPeel 0..1): disolución FBM de la carne nebulosa para revelar star_core.
    float dissolveMask = fbm(vLocalPos.xy * 3.8 + vLocalPos.zy * 2.1 + drift * 2.0);
    if (uFleshPeel > 0.01) {
      float threshold = uFleshPeel * 0.88;
      if (dissolveMask < threshold) {
        if (dissolveMask > threshold - 0.055) {
          gl_FragColor = vec4(0.13, 0.83, 0.93, 0.95);
          return;
        }
        discard;
      }
      col += vec3(0.13, 0.83, 0.93) * smoothstep(threshold, threshold + 0.14, dissolveMask) * 0.35;
    }

    float baseAlpha = mix(uOpacity * 0.45, min(0.92, uOpacity * 1.15), fresnel);
    float alpha = mix(baseAlpha, baseAlpha * 0.28 + fresnel * 0.42, uFleshPeel);
    gl_FragColor = vec4(col, alpha);
  }
`;

// ============================================================================
// 6. Cuarzo Eléctrico (Mariposa Relámpago) + Rayos-X (`uFleshPeel`)
// ============================================================================
export const BUTTERFLY_QUARTZ_VERT = /* glsl */ `
  #include <common>
  #include <skinning_pars_vertex>
  varying vec3 vLocalPos;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  void main() {
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <begin_vertex>
    vLocalPos = position;
    #include <skinning_vertex>
    vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * objectNormal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const BUTTERFLY_QUARTZ_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uCharge;
  uniform float uFleshPeel;
  varying vec3 vLocalPos;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  float qHash(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float qNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(qHash(i), qHash(i + vec3(1,0,0)), f.x),
          mix(qHash(i + vec3(0,1,0)), qHash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(qHash(i + vec3(0,0,1)), qHash(i + vec3(1,0,1)), f.x),
          mix(qHash(i + vec3(0,1,1)), qHash(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float facet = floor(abs(dot(N, vec3(0.42, 0.78, 0.46))) * 4.5) / 4.5;
    vec3 quartzDeep = vec3(0.08, 0.22, 0.48);
    vec3 quartzMid = vec3(0.16, 0.62, 0.88);
    vec3 quartzSpec = vec3(0.76, 0.96, 1.0);
    vec3 col = mix(quartzDeep, quartzMid, 0.35 + facet * 0.65);

    vec3 p = vLocalPos * 7.5;
    float n1 = qNoise(p + vec3(uTime * 7.0, -uTime * 5.2, uTime * 3.8));
    float n2 = qNoise(p * 2.3 - vec3(uTime * 11.5, uTime * 8.4, -uTime * 6.0));
    float ridge = 1.0 - abs(n1 * 2.0 - 1.0);
    float groove = smoothstep(0.82, 0.985, ridge * (0.6 + 0.4 * n2));
    float pulse = 0.55 + 0.45 * sin(uTime * 28.0 + vLocalPos.x * 9.0 + vLocalPos.y * 11.0);
    float arcIntensity = groove * pulse * (0.65 + uCharge * 1.45);

    col += vec3(0.32, 0.86, 1.0) * arcIntensity * 1.35;
    col += quartzSpec * pow(groove, 3.0) * (0.5 + uCharge);

    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.0);
    col += mix(vec3(0.25, 0.88, 1.0), vec3(0.68, 0.48, 1.0), fresnel * 0.45) * (0.65 + uCharge * 0.6) * fresnel;

    if (uFleshPeel > 0.01 && n1 < uFleshPeel * 0.82) discard;

    float alpha = mix(0.74, 0.96, clamp(fresnel + arcIntensity * 0.4, 0.0, 1.0));
    alpha = mix(alpha, alpha * 0.35 + fresnel * 0.4, uFleshPeel);
    gl_FragColor = vec4(col, alpha);
  }
`;

// ============================================================================
// 7. Núcleo Estelar Dorado (star_core 0xffcc33 + 0xfff3b0 rim)
// ============================================================================
export const STAR_CORE_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec3 vNormalWorld;
  varying vec3 vViewDir;
  void main() {
    vec3 N = normalize(vNormalWorld);
    vec3 V = normalize(vViewDir);
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.0);
    float pulse = 0.85 + 0.15 * sin(uTime * 5.0);
    vec3 base = vec3(1.0, 0.8, 0.2) * 1.35 * pulse;
    vec3 rim = vec3(1.0, 0.95, 0.69) * fresnel * 0.9;
    gl_FragColor = vec4(base + rim, 1.0);
  }
`;
