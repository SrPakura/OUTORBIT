import * as THREE from 'three';

// ============================================================================
// Cel-shading: gradientes discretos (DataTexture + NearestFilter) cacheados
// ============================================================================

const gradientCache = new Map<number, THREE.DataTexture>();

/**
 * Gradiente de 4 pasos para MeshToonMaterial. Cacheado: un solo DataTexture
 * compartido por todos los materiales (sin allocations repetidas).
 */
function getGradientMap(steps = 4): THREE.DataTexture {
  const cached = gradientCache.get(steps);
  if (cached) return cached;

  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) {
    data[i] = Math.round((255 * (i + 1)) / steps);
  }
  const texture = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  gradientCache.set(steps, texture);
  return texture;
}

/**
 * Material toon vibrante con cel-shading de 4 pasos.
 */
export function createToonMaterial(
  color: string | number,
  emissive?: string | number
): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: getGradientMap(),
    emissive: emissive ?? 0x000000,
  });
}

// ============================================================================
// Contorno negro estilo cómic (Inverted Hull: BackSide + extrusión por normal)
// ============================================================================

interface OutlineShaderParams {
  vertexShader: string;
}

/**
 * Añade un contorno negro grueso a `mesh` mediante Inverted Hull: una malla
 * BackSide que comparte geometría y extruye los vértices a lo largo de la
 * normal en el vertex shader. Contorno limpio y uniforme en esferas y modelos
 * modulares. Devuelve la malla de contorno (añadida como hija de `mesh`).
 */
export function addComicOutline(
  mesh: THREE.Mesh,
  thickness = 0.045,
  color: number = 0x0b0b14
): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({
    color,
    side: THREE.BackSide,
    fog: false,
  });
  const extrusion = thickness.toFixed(4);
  material.onBeforeCompile = (shader: OutlineShaderParams) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n\ttransformed += normalize( normal ) * ${extrusion};`
    );
  };
  const outline = new THREE.Mesh(mesh.geometry, material);
  outline.renderOrder = -1;
  mesh.add(outline);
  return outline;
}

// ============================================================================
// Fondo espacial: cielo degradado (esfera invertida) + estrellas instanciadas
// ============================================================================

const SKY_RADIUS = 900;
const STAR_COUNT = 700;
const STAR_SHELL_RADIUS = 820;

const skyVertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`;

const skyFragmentShader = /* glsl */ `
  uniform vec3 uTopColor;
  uniform vec3 uBottomColor;
  varying vec3 vDir;
  void main() {
    float h = normalize( vDir ).y * 0.5 + 0.5;
    float curve = pow( h, 1.35 );
    vec3 col = mix( uBottomColor, uTopColor, curve );
    gl_FragColor = vec4( col, 1.0 );
  }
`;

/**
 * Crea el fondo del nivel: cielo degradado (atardecer violeta -> espacio oscuro)
 * con una esfera invertida ShaderMaterial y un campo de estrellas con
 * InstancedMesh (una sola draw call). Devuelve handle con update/dispose.
 */
export function createSpaceBackdrop(
  scene: THREE.Scene,
  topColor: string,
  bottomColor: string
): { update: (dt: number) => void; dispose: () => void } {
  const group = new THREE.Group();
  group.name = 'spaceBackdrop';

  // --- Cielo degradado ---
  const skyMaterial = new THREE.ShaderMaterial({
    vertexShader: skyVertexShader,
    fragmentShader: skyFragmentShader,
    uniforms: {
      uTopColor: { value: new THREE.Color(topColor) },
      uBottomColor: { value: new THREE.Color(bottomColor) },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 24), skyMaterial);
  skyMesh.frustumCulled = false;
  group.add(skyMesh);

  // --- Estrellas instanciadas ---
  const starGeometry = new THREE.OctahedronGeometry(1.4, 0);
  const starMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    fog: false,
    transparent: true,
    opacity: 0.9,
  });
  const stars = new THREE.InstancedMesh(starGeometry, starMaterial, STAR_COUNT);
  stars.frustumCulled = false;

  const dummy = new THREE.Object3D();
  const dir = new THREE.Vector3();
  for (let i = 0; i < STAR_COUNT; i++) {
    // Distribución uniforme sobre la esfera (u,phi)
    const u = Math.random();
    const phi = Math.random() * Math.PI * 2;
    const cosTheta = 1 - 2 * u;
    const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
    dir.set(sinTheta * Math.cos(phi), cosTheta, sinTheta * Math.sin(phi));
    dummy.position.copy(dir).multiplyScalar(STAR_SHELL_RADIUS);
    const scale = 0.35 + Math.random() * 1.1;
    dummy.scale.setScalar(scale);
    dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    dummy.updateMatrix();
    stars.setMatrixAt(i, dummy.matrix);
  }
  stars.instanceMatrix.needsUpdate = true;
  group.add(stars);

  scene.add(group);

  return {
    update(dt: number): void {
      stars.rotation.y += dt * 0.004;
      stars.rotation.x += dt * 0.0015;
    },
    dispose(): void {
      scene.remove(group);
      skyMesh.geometry.dispose();
      skyMaterial.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
      stars.dispose();
    },
  };
}
