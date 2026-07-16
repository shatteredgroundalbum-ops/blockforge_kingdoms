import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/rng';

// Instanced ground cover (grass tufts, flowers, mushrooms) with a wind-sway
// vertex animation. Everything is GPU-instanced so thousands of props cost only
// a few draw calls.

function bladeTexture(): THREE.Texture {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, s, s);
  for (let i = 0; i < 7; i++) {
    const x = 6 + Math.random() * (s - 12);
    const w = 3 + Math.random() * 3;
    const top = 4 + Math.random() * 10;
    const g = ctx.createLinearGradient(0, s, 0, top);
    g.addColorStop(0, '#2f5e24');
    g.addColorStop(1, '#6db83f');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w, s);
    ctx.quadraticCurveTo(x - w * 0.5, s * 0.5, x + (Math.random() - 0.5) * 8, top);
    ctx.quadraticCurveTo(x + w * 0.5, s * 0.5, x + w, s);
    ctx.closePath();
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function flowerTexture(): THREE.Texture {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  // stem
  ctx.strokeStyle = '#3f7d2e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(s / 2, s);
  ctx.lineTo(s / 2, s * 0.45);
  ctx.stroke();
  // petals
  const colors = ['#ff6f91', '#ffd93d', '#7ac6ff', '#c58cff'];
  const col = colors[Math.floor(Math.random() * colors.length)];
  ctx.fillStyle = col;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(s / 2 + Math.cos(a) * 9, s * 0.35 + Math.sin(a) * 9, 6, 9, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ffe08a';
  ctx.beginPath();
  ctx.arc(s / 2, s * 0.35, 5, 0, Math.PI * 2);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Adds a wind uniform + sway to any standard material.
function applyWind(mat: THREE.MeshStandardMaterial, strength: number): { value: number } {
  const uTime = { value: 0 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uWind = { value: strength };
    shader.vertexShader =
      'uniform float uTime;\nuniform float uWind;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         #ifdef USE_INSTANCING
           float wpx = instanceMatrix[3].x;
           float wpz = instanceMatrix[3].z;
         #else
           float wpx = 0.0; float wpz = 0.0;
         #endif
         float sway = sin(uTime * 1.6 + wpx * 0.35 + wpz * 0.3)
                    + 0.4 * sin(uTime * 3.1 + wpx * 0.7);
         float h = clamp(uv.y, 0.0, 1.0);
         transformed.x += sway * uWind * h;
         transformed.z += cos(uTime * 1.3 + wpz * 0.4) * uWind * 0.6 * h;`,
      );
  };
  return uTime;
}

export interface VegetationField {
  group: THREE.Group;
  update: (t: number) => void;
}

export function createVegetation(
  size: number,
  heightAt: (x: number, z: number) => number,
  canPlace: (x: number, z: number) => boolean,
): VegetationField {
  const group = new THREE.Group();
  const rnd = mulberry32(7);
  const timers: { value: number }[] = [];
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  // --- grass tufts (crossed quads) ---
  const p1 = new THREE.PlaneGeometry(0.7, 0.8);
  p1.translate(0, 0.4, 0);
  const p2 = p1.clone();
  p2.rotateY(Math.PI / 2);
  const tuft = mergeGeometries([p1, p2])!;
  const grassMat = new THREE.MeshStandardMaterial({
    map: bladeTexture(),
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    roughness: 1,
    metalness: 0,
    vertexColors: true,
  });
  timers.push(applyWind(grassMat, 0.14));

  const GRASS = 2600;
  const grass = new THREE.InstancedMesh(tuft, grassMat, GRASS);
  grass.castShadow = false;
  grass.receiveShadow = true;
  let gi = 0;
  let guard = 0;
  while (gi < GRASS && guard < GRASS * 6) {
    guard++;
    const x = (rnd() * 2 - 1) * (size - 4);
    const z = (rnd() * 2 - 1) * (size - 4);
    if (!canPlace(x, z)) continue;
    const y = heightAt(x, z);
    if (y < -1.5) continue; // no grass underwater
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rnd() * Math.PI, 0);
    const sc = 0.7 + rnd() * 0.9;
    dummy.scale.set(sc, sc * (0.8 + rnd() * 0.6), sc);
    dummy.updateMatrix();
    grass.setMatrixAt(gi, dummy.matrix);
    color.setHSL(0.28 + rnd() * 0.08, 0.5, 0.42 + rnd() * 0.16);
    grass.setColorAt(gi, color);
    gi++;
  }
  grass.count = gi;
  grass.instanceMatrix.needsUpdate = true;
  group.add(grass);

  // --- flowers ---
  const flowerGeo = new THREE.PlaneGeometry(0.7, 0.7);
  flowerGeo.translate(0, 0.35, 0);
  const flowerMat = new THREE.MeshStandardMaterial({
    map: flowerTexture(),
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 1,
  });
  timers.push(applyWind(flowerMat, 0.08));
  const FLOWERS = 320;
  const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, FLOWERS);
  let fi = 0;
  guard = 0;
  while (fi < FLOWERS && guard < FLOWERS * 8) {
    guard++;
    const x = (rnd() * 2 - 1) * (size - 6);
    const z = (rnd() * 2 - 1) * (size - 6);
    if (!canPlace(x, z)) continue;
    const y = heightAt(x, z);
    if (y < -1) continue;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rnd() * Math.PI, 0);
    const sc = 0.8 + rnd() * 0.6;
    dummy.scale.setScalar(sc);
    dummy.updateMatrix();
    flowers.setMatrixAt(fi, dummy.matrix);
    fi++;
  }
  flowers.count = fi;
  flowers.instanceMatrix.needsUpdate = true;
  group.add(flowers);

  // --- mushrooms (little capped stalks) ---
  const capGeo = new THREE.ConeGeometry(0.22, 0.22, 8);
  capGeo.translate(0, 0.32, 0);
  const stalkGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.24, 6);
  stalkGeo.translate(0, 0.12, 0);
  const mush = mergeGeometries([capGeo, stalkGeo])!;
  // group by color via 2 instanced meshes
  for (const [capColor, count] of [
    [0xb0402f, 120],
    [0xc9843f, 90],
  ] as const) {
    const mat = new THREE.MeshStandardMaterial({ color: capColor, roughness: 0.85 });
    const mm = new THREE.InstancedMesh(mush, mat, count);
    mm.castShadow = true;
    let mi = 0;
    guard = 0;
    while (mi < count && guard < count * 10) {
      guard++;
      const x = (rnd() * 2 - 1) * (size - 6);
      const z = (rnd() * 2 - 1) * (size - 6);
      if (!canPlace(x, z)) continue;
      const y = heightAt(x, z);
      if (y < -0.8) continue;
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, rnd() * Math.PI, 0);
      const sc = 0.7 + rnd() * 0.8;
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      mm.setMatrixAt(mi, dummy.matrix);
      mi++;
    }
    mm.count = mi;
    mm.instanceMatrix.needsUpdate = true;
    group.add(mm);
  }

  return {
    group,
    update: (t: number) => {
      for (const u of timers) u.value = t;
    },
  };
}
