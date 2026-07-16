import * as THREE from 'three';

// Procedural sky dome + ground textures used to give the stylized voxel world a
// more realistic, atmospheric look without external assets.

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_Position.z = gl_Position.w; // force to far plane
  }
`;

const skyFragment = /* glsl */ `
  precision mediump float;
  varying vec3 vDir;
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  void main() {
    vec3 dir = normalize(vDir);
    float h = dir.y;
    vec3 col;
    if (h > 0.0) {
      float t = pow(clamp(h, 0.0, 1.0), 0.55);
      col = mix(uHorizon, uTop, t);
    } else {
      col = mix(uHorizon, uGround, clamp(-h * 3.0, 0.0, 1.0));
    }
    // Sun disc + glow.
    float d = max(dot(dir, normalize(uSunDir)), 0.0);
    float glow = pow(d, 8.0) * 0.6 + pow(d, 120.0) * 1.4;
    float disc = smoothstep(0.9975, 0.9990, d);
    col += uSunColor * (glow + disc * 2.0);
    // Subtle horizon haze.
    col += uHorizon * pow(1.0 - abs(h), 6.0) * 0.15;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export interface SkyDome {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
}

export function createSkyDome(): SkyDome {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(0x2a6bd8) },
      uHorizon: { value: new THREE.Color(0xbfe0ff) },
      uGround: { value: new THREE.Color(0x2a2f38) },
      uSunColor: { value: new THREE.Color(0xfff4d6) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    },
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return { mesh, material };
}

// --- procedural value noise for textures ---
function fract(n: number): number {
  return n - Math.floor(n);
}
function hash(x: number, y: number): number {
  return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
}
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < 4; i++) {
    sum += vnoise(x * freq, y * freq) * amp;
    freq *= 2;
    amp *= 0.5;
  }
  return sum;
}

export interface GroundTextures {
  map: THREE.Texture;
  normalMap: THREE.Texture;
}

// A tiling grass/earth albedo plus a matching normal map derived from the same
// height field, so the large ground plane reads as textured terrain.
export function makeGroundTextures(size = 256): GroundTextures {
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      height[y * size + x] = fbm((x / size) * 8, (y / size) * 8);
    }
  }

  // Albedo.
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const base = new THREE.Color(0x4f8a36);
  const dark = new THREE.Color(0x37652a);
  const dirt = new THREE.Color(0x6b5230);
  const tmp = new THREE.Color();
  for (let i = 0; i < size * size; i++) {
    const h = height[i];
    const blades = fbm((i % size) * 0.6, Math.floor(i / size) * 0.6);
    tmp.copy(base).lerp(dark, THREE.MathUtils.clamp(h * 1.3, 0, 1));
    if (blades > 0.72) tmp.lerp(dirt, (blades - 0.72) * 2.5);
    // per-texel grain
    const g = 0.85 + hash(i % size, Math.floor(i / size)) * 0.3;
    img.data[i * 4] = Math.min(255, tmp.r * 255 * g);
    img.data[i * 4 + 1] = Math.min(255, tmp.g * 255 * g);
    img.data[i * 4 + 2] = Math.min(255, tmp.b * 255 * g);
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(24, 24);
  map.anisotropy = 4;

  // Normal map from height gradient (Sobel).
  const nc = document.createElement('canvas');
  nc.width = nc.height = size;
  const nctx = nc.getContext('2d')!;
  const nimg = nctx.createImageData(size, size);
  const strength = 2.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hl = height[y * size + ((x - 1 + size) % size)];
      const hr = height[y * size + ((x + 1) % size)];
      const hd = height[((y - 1 + size) % size) * size + x];
      const hu = height[((y + 1) % size) * size + x];
      const dx = (hl - hr) * strength;
      const dy = (hd - hu) * strength;
      const nz = 1;
      const len = Math.hypot(dx, dy, nz);
      const i = (y * size + x) * 4;
      nimg.data[i] = ((dx / len) * 0.5 + 0.5) * 255;
      nimg.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      nimg.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      nimg.data[i + 3] = 255;
    }
  }
  nctx.putImageData(nimg, 0, 0);
  const normalMap = new THREE.CanvasTexture(nc);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(24, 24);

  return { map, normalMap };
}
