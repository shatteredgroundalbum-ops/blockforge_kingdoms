import * as THREE from 'three';
import { noise2 } from '../core/rng';

// Rolling terrain heightfield. Kept gentle in the playable interior (and flat
// under the settlement) so circle-based collision still works, while rising
// into hills toward the edges. This is the single source of ground height used
// by movement, entity placement, and prop scattering.

const POND = new THREE.Vector2(-26, 22);

function hills(x: number, z: number): number {
  let a = 0;
  let freq = 1;
  let amp = 1;
  for (let i = 0; i < 4; i++) {
    a += noise2(x * freq, z * freq) * amp;
    freq *= 2;
    amp *= 0.5;
  }
  return a;
}

export function terrainHeight(x: number, z: number): number {
  let h = hills(x * 0.018, z * 0.018) * 5.5;
  h += hills(x * 0.07 + 11, z * 0.07 + 5) * 1.1;

  // Flatten the settlement / spawn area.
  const dCenter = Math.hypot(x, z);
  const flat = THREE.MathUtils.smoothstep(dCenter, 12, 28);
  h *= flat;

  // Carve a basin for the pond.
  const dPond = Math.hypot(x - POND.x, z - POND.y);
  h -= Math.max(0, 1 - dPond / 13) * 4.0;

  // Rise into foothills toward the map edge.
  const edge = Math.max(Math.abs(x), Math.abs(z));
  h += Math.max(0, edge - 44) * 0.9;

  return h;
}

export interface TerrainTextures {
  map: THREE.Texture;
  normalMap: THREE.Texture;
}

export function createTerrainMesh(size: number, tex: TerrainTextures): THREE.Mesh {
  const seg = 160;
  const geo = new THREE.PlaneGeometry(size * 2, size * 2, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  const grass = new THREE.Color(0xffffff); // tints the grass albedo as-is
  const grassDark = new THREE.Color(0xcdd8c0);
  const slope = new THREE.Color(0x8a6f4a);
  const rock = new THREE.Color(0x9198a0);
  const sand = new THREE.Color(0xd8c79a);
  const colors: number[] = [];
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = terrainHeight(x, z);
    pos.setY(i, y);

    // Approximate slope via finite differences.
    const e = 1.2;
    const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
    const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
    const steep = Math.min(1, Math.hypot(hx, hz) / (2 * e) / 0.9);

    const tint = noise2(x * 0.2, z * 0.2) * 0.5 + 0.5;
    tmp.copy(grass).lerp(grassDark, tint * 0.6);
    if (y < -1.2) tmp.lerp(sand, THREE.MathUtils.clamp((-1.2 - y) * 0.8, 0, 1));
    tmp.lerp(slope, THREE.MathUtils.clamp(steep * 1.2, 0, 0.9));
    if (y > 8) tmp.lerp(rock, THREE.MathUtils.clamp((y - 8) * 0.15, 0, 0.8));
    colors.push(tmp.r, tmp.g, tmp.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    map: tex.map,
    normalMap: tex.normalMap,
    normalScale: new THREE.Vector2(0.7, 0.7),
    vertexColors: true,
    roughness: 1,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}
