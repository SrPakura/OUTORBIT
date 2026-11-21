import * as THREE from 'three';
import { addComicOutline } from './toonMaterials';

// ============================================================================
// PASO C — Logotipo 3D "OUTORBIT" (tipografía cinética Persona 5 x Frieren)
// ============================================================================
//
// Glifos vectoriales extruidos a mano (THREE.Shape + ExtrudeGeometry) con
// bisel biselado y afilado: nada de texto hinchado ni "puffy". Cada letra se
// define con contornos geométricos limpios (agujeros reales en O, R y B) y un
// kerning uniforme para que se lea sin ambigüedad.
//
// El material es un ShaderMaterial propio (OutorbitLogoShader): gradiente
// cel-metálico índigo-obsidiana en biseles/laterales -> oro/ámbar/coral/cian
// en las caras frontales, brillo cristalino diagonal que barre las letras y
// rim Fresnel turquesa/violeta. Un contorno de tinta cómic lo recorta sobre el
// blade blanco. Alrededor: anillo orbital de maná con barrido animado y tres
// estrellas de 4 puntas facetadas orbitando.

export interface MenuLogo3D {
  group: THREE.Group;
  animTick: (dt: number) => void;
  dispose: () => void;
}

// ---------------------------------------------------------------------------
// Glifos: contornos geométricos (unidades de altura de mayúscula = 1.0)
// ---------------------------------------------------------------------------

type Pt = [number, number];

const CAP_HALF = 0.5;
const STROKE = 0.17;
const TRACKING = 0.09;

/** Rectángulo con las cuatro esquinas achaflanadas (octógono). */
function chamferRect(cx: number, cy: number, halfW: number, halfH: number, chamfer: number): Pt[] {
  const c = Math.max(0, Math.min(chamfer, Math.min(halfW, halfH) * 0.9));
  return [
    [cx - halfW + c, cy - halfH],
    [cx + halfW - c, cy - halfH],
    [cx + halfW, cy - halfH + c],
    [cx + halfW, cy + halfH - c],
    [cx + halfW - c, cy + halfH],
    [cx - halfW + c, cy + halfH],
    [cx - halfW, cy + halfH - c],
    [cx - halfW, cy - halfH + c],
  ];
}

/** Contorno + agujeros -> THREE.Shape desplazada `offsetX` en X. */
function contourShape(points: Pt[], holes: Pt[][] = [], offsetX = 0): THREE.Shape {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => {
    if (i === 0) shape.moveTo(x + offsetX, y);
    else shape.lineTo(x + offsetX, y);
  });
  shape.closePath();
  for (const hole of holes) {
    const path = new THREE.Path();
    hole.forEach(([x, y], i) => {
      if (i === 0) path.moveTo(x + offsetX, y);
      else path.lineTo(x + offsetX, y);
    });
    path.closePath();
    shape.holes.push(path);
  }
  return shape;
}

interface Glyph {
  outer: Pt[];
  holes: Pt[][];
  width: number;
}

/** O: anillo octogonal con agujero real. */
function glyphO(): Glyph {
  const halfW = 0.37;
  const outer = chamferRect(0, 0, halfW, CAP_HALF, 0.15);
  const inner = chamferRect(0, 0, halfW - STROKE, CAP_HALF - STROKE, 0.09);
  return { outer, holes: [inner], width: halfW * 2 };
}

/** U: contorno único abierto arriba (dos astas + curva inferior achaflanada). */
function glyphU(): Glyph {
  const halfW = 0.37;
  const innerHalfW = halfW - STROKE;
  const bottom = -CAP_HALF;
  const innerBottom = bottom + STROKE;
  const outer = [
    [-halfW, CAP_HALF],
    [-halfW, bottom + 0.15],
    [-halfW + 0.15, bottom],
    [halfW - 0.15, bottom],
    [halfW, bottom + 0.15],
    [halfW, CAP_HALF],
    [innerHalfW, CAP_HALF],
    [innerHalfW, innerBottom + 0.09],
    [innerHalfW - 0.09, innerBottom],
    [-innerHalfW + 0.09, innerBottom],
    [-innerHalfW, innerBottom + 0.09],
    [-innerHalfW, CAP_HALF],
  ] as Pt[];
  return { outer, holes: [], width: halfW * 2 };
}

/** T: travesaño superior + asta central. */
function glyphT(): Glyph {
  const halfW = 0.37;
  const stem = 0.085;
  const barBottom = CAP_HALF - STROKE;
  const outer = [
    [-halfW + 0.06, CAP_HALF],
    [halfW - 0.06, CAP_HALF],
    [halfW, CAP_HALF - 0.06],
    [halfW, barBottom],
    [stem, barBottom],
    [stem, -CAP_HALF],
    [-stem, -CAP_HALF],
    [-stem, barBottom],
    [-halfW, barBottom],
    [-halfW, CAP_HALF - 0.06],
  ] as Pt[];
  return { outer, holes: [], width: halfW * 2 };
}

/** R: asta + bolsa superior con contraforma real + pata diagonal. */
function glyphR(): Glyph {
  const halfW = 0.37;
  const stemRight = -halfW + STROKE;
  const outer = [
    [-halfW, -CAP_HALF],
    [-halfW, CAP_HALF],
    [0.05, CAP_HALF],
    [0.27, 0.44],
    [halfW, 0.26],
    [halfW, 0.10],
    [0.27, -0.06],
    [0.10, -0.13],
    [halfW, -CAP_HALF],
    [0.14, -CAP_HALF],
    [-0.02, -0.13],
    [stemRight, -0.13],
    [stemRight, -CAP_HALF],
  ] as Pt[];
  const bowl = [
    [stemRight, 0.33],
    [0.02, 0.33],
    [0.18, 0.26],
    [0.18, 0.10],
    [0.02, 0.02],
    [stemRight, 0.02],
  ] as Pt[];
  return { outer, holes: [bowl], width: halfW * 2 };
}

/** B: asta + dos bolsas con contraformas reales. */
function glyphB(): Glyph {
  const halfW = 0.37;
  const stemRight = -halfW + STROKE;
  const outer = [
    [-halfW, -CAP_HALF],
    [-halfW, CAP_HALF],
    [0.03, CAP_HALF],
    [0.23, 0.44],
    [0.33, 0.28],
    [0.33, 0.20],
    [0.23, 0.06],
    [0.07, 0.0],
    [0.25, -0.06],
    [0.35, -0.20],
    [0.35, -0.34],
    [0.25, -0.48],
    [0.03, -CAP_HALF],
  ] as Pt[];
  const upperBowl = [
    [stemRight, 0.34],
    [0.01, 0.34],
    [0.15, 0.28],
    [0.15, 0.20],
    [0.01, 0.16],
    [stemRight, 0.16],
  ] as Pt[];
  const lowerBowl = [
    [stemRight, -0.14],
    [0.01, -0.14],
    [0.17, -0.20],
    [0.17, -0.30],
    [0.01, -0.38],
    [stemRight, -0.38],
  ] as Pt[];
  return { outer, holes: [upperBowl, lowerBowl], width: halfW * 2 };
}

/** I: asta limpia (sin remates, coherente con el resto del alfabeto). */
function glyphI(): Glyph {
  const halfW = 0.10;
  const outer = [
    [-halfW, CAP_HALF],
    [halfW, CAP_HALF],
    [halfW, -CAP_HALF],
    [-halfW, -CAP_HALF],
  ] as Pt[];
  return { outer, holes: [], width: halfW * 2 };
}

const WORD = 'OUTORBIT';

function buildGlyph(letter: string): Glyph {
  switch (letter) {
    case 'O':
      return glyphO();
    case 'U':
      return glyphU();
    case 'T':
      return glyphT();
    case 'R':
      return glyphR();
    case 'B':
      return glyphB();
    case 'I':
      return glyphI();
    default:
      return glyphI();
  }
}

/**
 * Construye la geometría extruida de "OUTORBIT": una sola ExtrudeGeometry con
 * los 8 glifos (agujeros incluidos), centrada en X/Y/Z y con bisel afilado.
 */
function buildLogoGeometry(): { geometry: THREE.ExtrudeGeometry; halfWidth: number } {
  const glyphs = WORD.split('').map(buildGlyph);
  const totalWidth =
    glyphs.reduce((sum, glyph) => sum + glyph.width, 0) + TRACKING * (glyphs.length - 1);

  let cursor = -totalWidth / 2;
  const shapes: THREE.Shape[] = [];
  for (const glyph of glyphs) {
    const centerX = cursor + glyph.width / 2;
    shapes.push(contourShape(glyph.outer, glyph.holes, centerX));
    cursor += glyph.width + TRACKING;
  }

  const geometry = new THREE.ExtrudeGeometry(shapes, {
    depth: 0.22,
    bevelEnabled: true,
    bevelThickness: 0.045,
    bevelSize: 0.032,
    bevelSegments: 2,
    steps: 1,
    curveSegments: 1,
  });

  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box) {
    const center = new THREE.Vector3();
    box.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();

  return { geometry, halfWidth: totalWidth / 2 };
}

// ---------------------------------------------------------------------------
// Shader del logotipo (cel-metálico + glint cristalino + rim Fresnel)
// ---------------------------------------------------------------------------

const logoVertexShader = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec3 vObjNormal;
  varying vec3 vLocalPos;

  void main() {
    vLocalPos = position;
    vObjNormal = normalize( normal );
    vec4 world = modelMatrix * vec4( position, 1.0 );
    vWorldPos = world.xyz;
    vWorldNormal = normalize( mat3( modelMatrix ) * normal );
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const logoFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uHalfWidth;
  uniform vec3 uSunDir;
  uniform vec3 uObsidian;
  uniform vec3 uGold;
  uniform vec3 uAmber;
  uniform vec3 uCoral;
  uniform vec3 uCyan;
  uniform vec3 uRimCyan;
  uniform vec3 uRimViolet;

  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec3 vObjNormal;
  varying vec3 vLocalPos;

  void main() {
    vec3 N = normalize( vWorldNormal );
    vec3 V = normalize( cameraPosition - vWorldPos );
    vec3 L = normalize( uSunDir );
    float NdotL = dot( N, L );
    float NdotV = max( dot( N, V ), 0.0 );

    // Coordenada horizontal normalizada del logotipo (-1 .. 1).
    float gx = clamp( vLocalPos.x / max( uHalfWidth, 0.001 ), -1.0, 1.0 );

    // Gradiente cinético oro -> ámbar -> coral -> cian a lo largo de la palabra.
    vec3 grad = mix( uGold, uAmber, smoothstep( -0.95, -0.20, gx ) );
    grad = mix( grad, uCoral, smoothstep( -0.15, 0.42, gx ) );
    grad = mix( grad, uCyan, smoothstep( 0.48, 1.0, gx ) );

    // Cara frontal (normal +Z local) vs bisel/lateral (índigo-obsidiana).
    float front = smoothstep( 0.55, 0.95, abs( vObjNormal.z ) );
    vec3 bevelColor = mix( uObsidian, grad * 0.42, 0.30 );

    // Cel de 3 bandas duras: lectura cómic, sin degradados sucios.
    float lit = NdotL * 0.5 + 0.5;
    float band = lit > 0.74 ? 1.0 : ( lit > 0.46 ? 0.74 : 0.48 );
    vec3 col = mix( bevelColor, grad, front ) * band;

    // Brillo cristalino diagonal que barre las letras de forma continua.
    float sweepCoord = ( vLocalPos.x * 0.55 + vLocalPos.y * 0.85 ) / max( uHalfWidth, 0.001 );
    float sweep = fract( sweepCoord * 0.85 - uTime * 0.17 );
    float glint = smoothstep( 0.0, 0.055, sweep ) * smoothstep( 0.20, 0.055, sweep );
    col += vec3( 1.0, 0.98, 0.92 ) * glint * ( 0.45 + 0.55 * front );

    // Rim Fresnel turquesa -> violeta según la posición en la palabra.
    float fres = pow( 1.0 - NdotV, 2.6 );
    vec3 rim = mix( uRimCyan, uRimViolet, smoothstep( 0.0, 1.0, gx * 0.5 + 0.5 ) );
    col += rim * fres * 0.9;

    // Especular metálico duro (chamfer afilado).
    vec3 H = normalize( L + V );
    float spec = pow( max( dot( N, H ), 0.0 ), 46.0 );
    col += vec3( 1.0, 0.95, 0.86 ) * spec * 0.6;

    gl_FragColor = vec4( col, 1.0 );
  }
`;

const ringVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`;

const ringFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  varying vec2 vUv;

  void main() {
    float a = vUv.x;
    // Barrido de maná que recorre el anillo.
    float sweep = fract( a * 2.0 - uTime * 0.32 );
    float glow = smoothstep( 0.0, 0.10, sweep ) * smoothstep( 0.34, 0.10, sweep );
    vec3 col = mix( uColorA, uColorB, 0.5 + 0.5 * sin( a * 6.28318 + uTime * 0.8 ) );
    col = mix( col, uColorC, glow * 0.85 );
    // Casi opaco: el anillo debe leerse nítido sobre el blade blanco.
    float alpha = 0.88 + glow * 0.12;
    gl_FragColor = vec4( col * ( 0.92 + glow * 0.55 ), alpha );
  }
`;

/** Estrella de 4 puntas facetada (contorno + extrusión fina). */
function buildStarSpark(outer: number, inner: number, color: number): THREE.Mesh {
  const shape = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (i / 8) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.035,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 1,
  });
  geometry.center();

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color, toneMapped: false })
  );
  addComicOutline(mesh, 0.012, 0x090b14);
  return mesh;
}

/**
 * Crea el logotipo 3D completo: letras extruidas con shader propio + contorno
 * de tinta, anillo orbital de maná y tres estrellas de 4 puntas orbitando.
 * `animTick(dt)` respira la inclinación y anima anillo, brillos y estrellas.
 */
export function createMenuLogo3D(): MenuLogo3D {
  const group = new THREE.Group();
  group.name = 'menuLogo3D';

  // Grupo interno: la respiración/inclinación no ensucia la posición que fija
  // el encuadre de la cámara de overlay.
  const tilt = new THREE.Group();
  tilt.name = 'menuLogoTilt';
  group.add(tilt);

  const { geometry, halfWidth } = buildLogoGeometry();

  const logoMaterial = new THREE.ShaderMaterial({
    vertexShader: logoVertexShader,
    fragmentShader: logoFragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uHalfWidth: { value: halfWidth },
      uSunDir: { value: new THREE.Vector3(0.42, 0.78, 0.62).normalize() },
      uObsidian: { value: new THREE.Color(0x1b1f3b) },
      uGold: { value: new THREE.Color(0xffd24a) },
      uAmber: { value: new THREE.Color(0xff9f1c) },
      uCoral: { value: new THREE.Color(0xff5d73) },
      uCyan: { value: new THREE.Color(0x22d3ee) },
      uRimCyan: { value: new THREE.Color(0x67e8f9) },
      uRimViolet: { value: new THREE.Color(0xa78bfa) },
    },
    fog: false,
  });

  const letters = new THREE.Mesh(geometry, logoMaterial);
  letters.name = 'menuLogoLetters';
  addComicOutline(letters, 0.024, 0x090b14);
  tilt.add(letters);

  // --- Anillo orbital de maná (elipse inclinada alrededor de la palabra) ---
  // Contorno cel oscuro por detrás: recorta el anillo con tinta limpia para
  // que se lea nítido sobre el blade blanco (nunca se lava con el fondo).
  const ringOutlineGeometry = new THREE.TorusGeometry(3.5, 0.080, 8, 128);
  const ringOutlineMaterial = new THREE.MeshBasicMaterial({
    color: 0x090b14,
    toneMapped: false,
  });
  const ringOutline = new THREE.Mesh(ringOutlineGeometry, ringOutlineMaterial);
  ringOutline.name = 'menuLogoRingOutline';
  ringOutline.rotation.set(1.38, 0.0, -0.22);
  ringOutline.position.z = -0.14;
  tilt.add(ringOutline);

  const ringGeometry = new THREE.TorusGeometry(3.5, 0.070, 8, 128);
  const ringMaterial = new THREE.ShaderMaterial({
    vertexShader: ringVertexShader,
    fragmentShader: ringFragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(0x22d3ee) },
      uColorB: { value: new THREE.Color(0xa78bfa) },
      uColorC: { value: new THREE.Color(0xffe08a) },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.name = 'menuLogoRing';
  ring.rotation.set(1.38, 0.0, -0.22);
  ring.position.z = -0.12;
  ring.renderOrder = 2;
  tilt.add(ring);

  // --- Tres estrellas de 4 puntas facetadas orbitando suavemente ---
  const sparkColors = [0xffe08a, 0x7dd3fc, 0xf9a8d4];
  const sparks: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const spark = buildStarSpark(0.30, 0.085, sparkColors[i]);
    spark.name = `menuLogoSpark${i}`;
    tilt.add(spark);
    sparks.push(spark);
  }

  let time = 0;

  return {
    group,
    animTick(dt: number): void {
      time += dt;
      logoMaterial.uniforms.uTime.value = time;
      ringMaterial.uniforms.uTime.value = time;

      // Respiración sutil: inclinación viva sin marear.
      tilt.rotation.z = Math.sin(time * 0.62) * 0.022;
      tilt.rotation.x = Math.sin(time * 0.47 + 0.8) * 0.030;
      tilt.rotation.y = Math.sin(time * 0.35 + 1.9) * 0.045;
      tilt.position.y = Math.sin(time * 0.9) * 0.035;

      ring.rotation.z = -0.22 + Math.sin(time * 0.4) * 0.05;
      ringOutline.rotation.z = ring.rotation.z;

      for (let i = 0; i < sparks.length; i++) {
        const phase = (i / sparks.length) * Math.PI * 2;
        const orbit = time * (0.55 + i * 0.12) + phase;
        const radius = 3.15 + Math.sin(time * 0.7 + phase) * 0.22;
        const spark = sparks[i];
        spark.position.set(
          Math.cos(orbit) * radius,
          Math.sin(orbit) * radius * 0.42 + Math.sin(time * 1.3 + phase) * 0.18,
          Math.sin(orbit * 0.8 + phase) * 0.55
        );
        spark.rotation.z = orbit * 1.6;
        const pulse = 0.85 + Math.sin(time * 2.4 + phase) * 0.18;
        spark.scale.setScalar(pulse);
      }
    },
    dispose(): void {
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) {
          for (const m of material) m.dispose();
        } else if (material) {
          material.dispose();
        }
      });
      group.clear();
      tilt.clear();
    },
  };
}
