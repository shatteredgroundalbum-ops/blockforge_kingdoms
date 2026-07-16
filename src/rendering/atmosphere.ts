import * as THREE from 'three';
import { mulberry32 } from '../core/rng';

// Sky atmosphere: stars that fade in at night, a moon opposite the sun, and
// slow drifting clouds. Plus a lightweight rising-smoke particle emitter.

export interface Atmosphere {
  group: THREE.Group;
  update: (dt: number, daylight: number, sunDir: THREE.Vector3, camPos: THREE.Vector3) => void;
}

export function createAtmosphere(): Atmosphere {
  const group = new THREE.Group();
  const rnd = mulberry32(42);

  // Stars.
  const starCount = 900;
  const sg = new THREE.BufferGeometry();
  const sp = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const u = rnd();
    const v = rnd();
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * v - 1);
    const r = 340;
    sp[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    sp[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.9 + 20; // upper hemisphere
    sp[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.6,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const stars = new THREE.Points(sg, starMat);
  stars.frustumCulled = false;
  group.add(stars);

  // Moon.
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(7, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0xdfe6ff, fog: false }),
  );
  const moonGlow = new THREE.Mesh(
    new THREE.SphereGeometry(11, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x9fb0ff, transparent: true, opacity: 0.18, fog: false }),
  );
  moon.add(moonGlow);
  group.add(moon);

  // Clouds: soft flattened puff clusters drifting on the wind.
  const cloudGroup = new THREE.Group();
  const puffMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    transparent: true,
    opacity: 0.9,
    fog: false,
  });
  for (let i = 0; i < 14; i++) {
    const cluster = new THREE.Group();
    const puffs = 3 + Math.floor(rnd() * 4);
    for (let p = 0; p < puffs; p++) {
      const s = 6 + rnd() * 10;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(s, 8, 6), puffMat);
      puff.scale.y = 0.5;
      puff.position.set((rnd() - 0.5) * 22, (rnd() - 0.5) * 4, (rnd() - 0.5) * 14);
      cluster.add(puff);
    }
    cluster.position.set((rnd() * 2 - 1) * 220, 70 + rnd() * 40, (rnd() * 2 - 1) * 220);
    cloudGroup.add(cluster);
  }
  group.add(cloudGroup);

  return {
    group,
    update: (dt, daylight, sunDir, camPos) => {
      group.position.set(camPos.x, 0, camPos.z);
      const night = THREE.MathUtils.clamp(1 - daylight * 3, 0, 1);
      starMat.opacity = night;
      // Moon opposite the sun.
      moon.position.set(-sunDir.x * 300, Math.max(20, -sunDir.y * 300 + 40), -sunDir.z * 300);
      const moonVis = night;
      (moon.material as THREE.MeshBasicMaterial).opacity = moonVis;
      (moon.material as THREE.MeshBasicMaterial).transparent = true;
      moon.visible = moonVis > 0.02;
      // Clouds drift and dim at night.
      puffMat.opacity = 0.35 + daylight * 0.55;
      puffMat.color.setRGB(0.5 + daylight * 0.5, 0.5 + daylight * 0.5, 0.55 + daylight * 0.45);
      for (const c of cloudGroup.children) {
        c.position.x += dt * 1.6;
        if (c.position.x > 240) c.position.x = -240;
      }
    },
  };
}

// A pool-based rising smoke column (campfire, chimneys).
export class SmokeEmitter {
  readonly points: THREE.Points;
  private life: Float32Array;
  private vel: Float32Array;
  private readonly n: number;
  private origin: THREE.Vector3;
  private rate = 0;

  constructor(x: number, y: number, z: number, count = 40, private spread = 0.25) {
    this.n = count;
    this.origin = new THREE.Vector3(x, y, z);
    const pos = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.life[i] = -Math.random() * 2;
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x9a9a9a,
      size: 1.4,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  setRate(r: number) {
    this.rate = r;
  }

  update(dt: number) {
    const pos = this.points.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0 && this.rate > 0) {
        // respawn
        this.life[i] = 2.4 + Math.random() * 1.5;
        arr[i * 3] = this.origin.x + (Math.random() - 0.5) * this.spread;
        arr[i * 3 + 1] = this.origin.y;
        arr[i * 3 + 2] = this.origin.z + (Math.random() - 0.5) * this.spread;
        this.vel[i * 3] = (Math.random() - 0.5) * 0.3;
        this.vel[i * 3 + 1] = 0.9 + Math.random() * 0.6;
        this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
      } else if (this.life[i] > 0) {
        arr[i * 3] += this.vel[i * 3] * dt + dt * 0.2; // drift with wind
        arr[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
        arr[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      }
    }
    pos.needsUpdate = true;
  }
}
