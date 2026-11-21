import * as THREE from 'three';
import { addComicOutline } from './toonMaterials';

// ============================================================================
// Logotipo 3D "OUTORBIT" — identidad Cosmic Nebula (Persona 5 x Hades x Gravity Rush)
// ============================================================================
//
// Glifos vectoriales extruidos a mano (THREE.Shape + ExtrudeGeometry) con
// corte diagonal agresivo: todo el alfabeto está sheared en itálico
// (`x += y * 0.18`) y cada trazo termina en cuchillas diagonales, nunca en
// esquinas rectas. Bisel fino y afilado (bevelSize 0.02, bevelThickness 0.03,
// depth 0.18): nada de letras hinchadas.
//
// El material es un ShaderMaterial propio: gradiente cinético Cosmic Nebula
// (violeta estelar -> carmesí -> cian eléctrico) sobre obsidiana profunda,
// destello dorado/blanco barriendo los biseles y rim Fresnel cian/carmesí.
// Un contorno de tinta limpio lo recorta sobre el blade astral.
//
// Detrás/alrededor de la palabra: el Anillo de Singularidad — un astrolabio
// cósmico de DOS aros finos inclinados (radio menor que el ancho del logo,
// nunca tapan la lectura) con fragmentos/diamantes de cristal cian, carmesí
// y dorado orbitando sobre sus órbitas.

export interface MenuLogo3D {
  group: THREE.Group;
  animTick: (dt: number) => void;
  dispose: () => void;
}

// ---------------------------------------------------------------------------
// Glifos: contornos geométricos afilados (altura de mayúscula = 1.0)
// ---------------------------------------------------------------------------

type Pt = [number, number];

const CAP_HALF = 0.5;
const STROKE = 0.17;
const TRACKING = 0.09;
/** Shear itálico agresivo: cada glifo se inclina hacia delante. */
const SHEAR = 0.18;

/** Rectángulo con las cuatro esquinas achaflanadas (octógono afilado). */
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

/**
 * Contorno + agujeros -> THREE.Shape desplazada `offsetX` en X y sheared en
 * itálico (`x += y * SHEAR`): el corte diagonal define la personalidad del
 * logotipo. Los agujeros reciben el mismo shear para que O, R y B conserven
 * sus contraformas.
 */
function contourShape(points: Pt[], holes: Pt[][] = [], offsetX = 0): THREE.Shape {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => {
    const sx = x + y * SHEAR + offsetX;
    if (i === 0) shape.moveTo(sx, y);
    else shape.lineTo(sx, y);
  });
  shape.closePath();
  for (const hole of holes) {
    const path = new THREE.Path();
    hole.forEach(([x, y], i) => {
      const sx = x + y * SHEAR + offsetX;
      if (i === 0) path.moveTo(sx, y);
      else path.lineTo(sx, y);
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

/** O: anillo octogonal afilado con agujero real y cortes diagonales amplios. */
function glyphO(): Glyph {
  const halfW = 0.37;
  const outer = chamferRect(0, 0, halfW, CAP_HALF, 0.18);
  const inner = chamferRect(0, 0, halfW - STROKE, CAP_HALF - STROKE, 0.10);
  return { outer, holes: [inner], width: halfW * 2 };
}

/** U: dos astas + curva inferior en cuchilla diagonal. */
function glyphU(): Glyph {
  const halfW = 0.37;
  const innerHalfW = halfW - STROKE;
  const bottom = -CAP_HALF;
  const innerBottom = bottom + STROKE;
  const outer = [
    [-halfW, CAP_HALF],
    [-halfW, bottom + 0.18],
    [-halfW + 0.18, bottom],
    [halfW - 0.18, bottom],
    [halfW, bottom + 0.18],
    [halfW, CAP_HALF - 0.07],
    [halfW - 0.07, CAP_HALF],
    [innerHalfW, CAP_HALF],
    [innerHalfW, innerBottom + 0.10],
    [innerHalfW - 0.10, innerBottom],
    [-innerHalfW + 0.10, innerBottom],
    [-innerHalfW, innerBottom + 0.10],
    [-innerHalfW, CAP_HALF],
  ] as Pt[];
  return { outer, holes: [], width: halfW * 2 };
}

/** T: travesaño superior con extremos en cuchilla + asta central afilada. */
function glyphT(): Glyph {
  const halfW = 0.37;
  const stem = 0.085;
  const barBottom = CAP_HALF - STROKE;
  const outer = [
    [-halfW + 0.05, CAP_HALF],
    [halfW - 0.05, CAP_HALF],
    [halfW, CAP_HALF - 0.12],
    [halfW, barBottom + 0.08],
    [halfW - 0.08, barBottom],
    [stem, barBottom],
    [stem, -CAP_HALF + 0.07],
    [stem - 0.07, -CAP_HALF],
    [-stem + 0.07, -CAP_HALF],
    [-stem, -CAP_HALF + 0.07],
    [-stem, barBottom],
    [-halfW + 0.08, barBottom],
    [-halfW, barBottom + 0.08],
    [-halfW, CAP_HALF - 0.12],
  ] as Pt[];
  return { outer, holes: [], width: halfW * 2 };
}

/** R: asta + bolsa superior con contraforma real + pata diagonal agresiva. */
function glyphR(): Glyph {
  const halfW = 0.37;
  const stemRight = -halfW + STROKE;
  const outer = [
    [-halfW, -CAP_HALF],
    [-halfW, CAP_HALF - 0.07],
    [-halfW + 0.07, CAP_HALF],
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

/** B: asta + dos bolsas con contraformas reales y hombros diagonales. */
function glyphB(): Glyph {
  const halfW = 0.37;
  const stemRight = -halfW + STROKE;
  const outer = [
    [-halfW, -CAP_HALF],
    [-halfW, CAP_HALF - 0.07],
    [-halfW + 0.07, CAP_HALF],
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

/** I: asta en cuchilla (extremos cortados en diagonal, coherente con el shear). */
function glyphI(): Glyph {
  const halfW = 0.10;
  const outer = [
    [-halfW, CAP_HALF],
    [halfW - 0.05, CAP_HALF],
    [halfW, CAP_HALF - 0.05],
    [halfW, -CAP_HALF + 0.05],
    [halfW - 0.05, -CAP_HALF],
    [-halfW + 0.05, -CAP_HALF],
    [-halfW, -CAP_HALF + 0.05],
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
 * los 8 glifos sheared (agujeros incluidos), centrada en X/Y/Z y con bisel
 * fino y afilado.
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
    depth: 0.18,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.02,
    bevelSegments: 2,
    steps: 1,
    curveSegments: 1,
  });

  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  let halfWidth = totalWidth / 2;
  if (box) {
    const center = new THREE.Vector3();
    box.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);
    halfWidth = (box.max.x - box.min.x) * 0.5;
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();

  return { geometry, halfWidth };
}

// ---------------------------------------------------------------------------
// Shader del logotipo (Cosmic Nebula: obsidiana + violeta/carmesí/cian + oro)
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
  uniform vec3 uObsidian;  // #090418 obsidiana profunda
  uniform vec3 uViolet;    // #7e22ce violeta estelar
  uniform vec3 uCrimson;   // #f43f5e carmesí
  uniform vec3 uCyan;      // #22d3ee cian eléctrico
  uniform vec3 uGold;      // destello dorado/blanco de biseles

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

    // Gradiente cinético Cosmic Nebula: violeta -> carmesí -> cian.
    vec3 grad = mix( uViolet, uCrimson, smoothstep( -0.85, 0.05, gx ) );
    grad = mix( grad, uCyan, smoothstep( 0.30, 1.0, gx ) );

    // Cara frontal (normal +Z local) vs bisel/lateral (obsidiana profunda).
    float front = smoothstep( 0.55, 0.95, abs( vObjNormal.z ) );
    vec3 bevelColor = mix( uObsidian, grad * 0.30, 0.22 );

    // Cel de 3 bandas duras: lectura cómic, sin degradados sucios.
    float lit = NdotL * 0.5 + 0.5;
    float band = lit > 0.74 ? 1.0 : ( lit >  0.46 ? 0.74 : 0.48 );
    vec3 col = mix( bevelColor, grad, front ) * band;

    // Destello dorado/blanco que barre los biseles en diagonal.
    float sweepCoord = ( vLocalPos.x * 0.55 + vLocalPos.y * 0.85 ) / max( uHalfWidth, 0.001 );
    float sweep = fract( sweepCoord * 0.85 - uTime * 0.17 );
    float glint = smoothstep( 0.0, 0.055, sweep ) * smoothstep( 0.20, 0.055, sweep );
    col += uGold * glint * ( 0.35 + 0.65 * ( 1.0 - front ) );

    // Rim Fresnel cian -> carmesí según la posición en la palabra.
    float fres = pow( 1.0 - NdotV, 2.6 );
    vec3 rim = mix( uCyan, uCrimson, smoothstep( 0.0, 1.0, gx * 0.5 + 0.5 ) );
    col += rim * fres * 0.9;

    // Especular metálico duro (chamfer afilado).
    vec3 H = normalize( L + V );
    float spec = pow( max( dot( N, H ), 0.0 ), 46.0 );
    col += uGold * spec * 0.6;

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
    // Barrido de energía de singularidad que recorre el aro.
    float sweep = fract( a * 2.0 - uTime * 0.32 );
    float glow = smoothstep( 0.0, 0.10, sweep ) * smoothstep( 0.34, 0.10, sweep );
    vec3 col = mix( uColorA, uColorB, 0.5 + 0.5 * sin( a * 6.28318 + uTime * 0.8 ) );
    col = mix( col, uColorC, glow * 0.85 );
    // Casi opaco: el aro debe leerse nítido sobre el blade astral.
    float alpha = 0.88 + glow * 0.12;
    gl_FragColor = vec4( col * ( 0.92 + glow * 0.55 ), alpha );
  }
`;

/** Diamante de cristal facetado (octaedro) con contorno de tinta blanca. */
function buildCrystalShard(size: number, color: number): THREE.Mesh {
  const geometry = new THREE.OctahedronGeometry(size, 0);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color, toneMapped: false })
  );
  addComicOutline(mesh, Math.max(0.006, size * 0.10), 0xffffff);
  return mesh;
}

interface AstrolabeRing {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  radius: number;
  baseTilt: THREE.Euler;
}

interface OrbitingShard {
  mesh: THREE.Mesh;
  ring: AstrolabeRing;
  phase: number;
  speed: number;
  radialOffset: number;
  spin: number;
}

/**
 * Crea el logotipo 3D completo: letras extruidas con shader Cosmic Nebula +
 * contorno de tinta, y el Anillo de Singularidad (astrolabio de dos aros
 * finos inclinados DETRÁS de la palabra, con cristales cian/carmesí/dorado
 * orbitando sobre sus órbitas). `animTick(dt)` respira la inclinación y
 * anima aros, destellos y cristales.
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
      uObsidian: { value: new THREE.Color(0x090418) },
      uViolet: { value: new THREE.Color(0x7e22ce) },
      uCrimson: { value: new THREE.Color(0xf43f5e) },
      uCyan: { value: new THREE.Color(0x22d3ee) },
      uGold: { value: new THREE.Color(0xffe9a8) },
    },
    fog: false,
  });

  const letters = new THREE.Mesh(geometry, logoMaterial);
  letters.name = 'menuLogoLetters';
  addComicOutline(letters, 0.02, 0x05030e);
  tilt.add(letters);

  // --- Anillo de Singularidad: astrolabio de dos aros finos inclinados ---
  // Radios MENORES que el ancho de la palabra y siempre por DETRÁS (z
  // negativo): enmarcan el logo sin tapar jamás la lectura de OUTORBIT.
  const ringSpecs: Array<{
    radius: number;
    tube: number;
    tilt: [number, number, number];
    z: number;
    colors: [number, number, number];
  }> = [
    {
      radius: 2.55,
      tube: 0.024,
      tilt: [1.42, 0.0, -0.30],
      z: -0.42,
      colors: [0x7e22ce, 0x22d3ee, 0xffe9a8],
    },
    {
      radius: 3.05,
      tube: 0.020,
      tilt: [1.24, 0.0, 0.26],
      z: -0.58,
      colors: [0xf43f5e, 0x7e22ce, 0x22d3ee],
    },
  ];

  const rings: AstrolabeRing[] = [];
  for (const spec of ringSpecs) {
    const material = new THREE.ShaderMaterial({
      vertexShader: ringVertexShader,
      fragmentShader: ringFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uColorA: { value: new THREE.Color(spec.colors[0]) },
        uColorB: { value: new THREE.Color(spec.colors[1]) },
        uColorC: { value: new THREE.Color(spec.colors[2]) },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(spec.radius, spec.tube, 6, 160), material);
    mesh.rotation.set(spec.tilt[0], spec.tilt[1], spec.tilt[2]);
    mesh.position.z = spec.z;
    mesh.renderOrder = 1;
    tilt.add(mesh);
    rings.push({
      mesh,
      material,
      radius: spec.radius,
      baseTilt: new THREE.Euler(spec.tilt[0], spec.tilt[1], spec.tilt[2]),
    });
  }

  // --- Fragmentos/diamantes de cristal orbitando sobre los aros ---
  const shardColors = [0x22d3ee, 0xf43f5e, 0xffe9a8, 0x22d3ee, 0xf43f5e, 0x22d3ee, 0xffe9a8];
  const shards: OrbitingShard[] = [];
  for (let i = 0; i < shardColors.length; i++) {
    const ring = rings[i % rings.length];
    const size = 0.07 + (i % 3) * 0.028;
    const shard = buildCrystalShard(size, shardColors[i]);
    shard.name = `menuLogoShard${i}`;
    tilt.add(shard);
    shards.push({
      mesh: shard,
      ring,
      phase: (i / shardColors.length) * Math.PI * 2,
      speed: 0.42 + (i % 3) * 0.11,
      radialOffset: 0.10 + (i % 2) * 0.16,
      spin: 1.4 + (i % 4) * 0.5,
    });
  }

  let time = 0;
  const shardPos = new THREE.Vector3();

  return {
    group,
    animTick(dt: number): void {
      time += dt;
      logoMaterial.uniforms.uTime.value = time;
      for (const ring of rings) ring.material.uniforms.uTime.value = time;

      // Respiración sutil: inclinación viva sin marear.
      tilt.rotation.z = Math.sin(time * 0.62) * 0.022;
      tilt.rotation.x = Math.sin(time * 0.47 + 0.8) * 0.030;
      tilt.rotation.y = Math.sin(time * 0.35 + 1.9) * 0.045;
      tilt.position.y = Math.sin(time * 0.9) * 0.035;

      // Precesión lenta de los aros del astrolabio.
      rings[0].mesh.rotation.z = rings[0].baseTilt.z + Math.sin(time * 0.4) * 0.05;
      rings[1].mesh.rotation.z = rings[1].baseTilt.z + Math.sin(time * 0.33 + 1.4) * 0.06;

      // Cristales: órbita elíptica sobre el plano de su aro + giro facetado.
      for (const shard of shards) {
        const orbit = time * shard.speed + shard.phase;
        const radius = shard.ring.radius + shard.radialOffset;
        shardPos.set(
          Math.cos(orbit) * radius,
          Math.sin(orbit) * radius,
          0.0
        );
        shardPos.applyEuler(shard.ring.mesh.rotation);
        shardPos.z += shard.ring.mesh.position.z;
        shard.mesh.position.copy(shardPos);
        shard.mesh.rotation.set(orbit * shard.spin, orbit * shard.spin * 0.7, 0);
        const pulse = 0.85 + Math.sin(time * 2.4 + shard.phase) * 0.18;
        shard.mesh.scale.setScalar(pulse);
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
