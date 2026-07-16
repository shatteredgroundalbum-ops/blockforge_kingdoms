import * as THREE from 'three';
import { mulberry32 } from '../core/rng';
import { makeGroundTextures } from '../rendering/env';

export type ColliderShape =
  | { kind: 'circle'; x: number; z: number; r: number }
  | { kind: 'box'; minX: number; maxX: number; minZ: number; maxZ: number };

export interface Gatherable {
  group: THREE.Group;
  collider: ColliderShape;
  resource: 'wood' | 'stone';
  hp: number;
  maxHp: number;
  x: number;
  z: number;
}

function box(w: number, h: number, d: number, color: number, roughness = 0.92): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.0 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export class World {
  readonly root = new THREE.Group();
  readonly gatherables: Gatherable[] = [];
  readonly staticColliders: ColliderShape[] = [];
  readonly structures: { collider: ColliderShape }[] = [];

  readonly size = 60; // half-extent of playable area
  readonly campfire = new THREE.PointLight(0xffa542, 0, 18, 2);
  private campfireCore!: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
    this.buildGround();
    this.buildBorderMountains();
    this.buildWater();
    this.buildSettlement();
    this.starterNodes();
    this.scatter();
  }

  // A handful of resource nodes right next to the spawn point so gathering
  // is immediately reachable (the hero spawns near 0, 6).
  // A tight cluster of resource nodes ringing the spawn point so the opening
  // "salvage" objective is reachable without hunting across the map. All sit
  // within gather range of the spawn (~0, 6).
  private starterNodes() {
    this.addTree(2.6, 7.6);
    this.addTree(-2.6, 7.6);
    this.addTree(2.6, 4.4);
    this.addRock(-2.6, 4.4);
    this.addRock(0, 8.7);
  }

  private buildGround() {
    const geo = new THREE.PlaneGeometry(this.size * 2, this.size * 2, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const { map, normalMap } = makeGroundTextures();
    const mat = new THREE.MeshStandardMaterial({
      map,
      normalMap,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: 1,
      metalness: 0,
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true;
    this.root.add(ground);
  }

  private buildBorderMountains() {
    const rnd = mulberry32(99);
    const s = this.size;
    for (let i = 0; i < 70; i++) {
      const edge = Math.floor(rnd() * 4);
      let x = 0;
      let z = 0;
      const along = (rnd() * 2 - 1) * s;
      const jitter = rnd() * 8;
      if (edge === 0) { x = along; z = -s - jitter; }
      else if (edge === 1) { x = along; z = s + jitter; }
      else if (edge === 2) { x = -s - jitter; z = along; }
      else { x = s + jitter; z = along; }
      const h = 6 + rnd() * 16;
      const w = 5 + rnd() * 8;
      const shade = 0x6f7b86 + Math.floor(rnd() * 0x0a0a0a);
      const m = box(w, h, w, shade);
      m.position.set(x, h / 2 - 1, z);
      // snow cap
      const cap = box(w * 0.6, h * 0.2, w * 0.6, 0xeaf2ff);
      cap.position.y = h * 0.5;
      m.add(cap);
      this.root.add(m);
    }
  }

  private buildWater() {
    const geo = new THREE.CircleGeometry(11, 20);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2a6fa8,
      transparent: true,
      opacity: 0.82,
      roughness: 0.08,
      metalness: 0.35,
      envMapIntensity: 1.2,
    });
    const water = new THREE.Mesh(geo, mat);
    water.position.set(-26, 0.05, 22);
    water.receiveShadow = true;
    this.root.add(water);
    // Beach ring collider so the player doesn't walk into the pond center.
    this.staticColliders.push({ kind: 'circle', x: -26, z: 22, r: 9 });
  }

  private buildSettlement() {
    // Central campfire.
    const ring = box(2.4, 0.3, 2.4, 0x555049);
    ring.position.set(0, 0.15, 0);
    this.root.add(ring);
    for (let i = 0; i < 4; i++) {
      const log = box(1.6, 0.24, 0.24, 0x6b4a2f);
      log.position.set(0, 0.4, 0);
      log.rotation.y = (i / 4) * Math.PI;
      this.root.add(log);
    }
    this.campfireCore = box(0.6, 0.7, 0.6, 0xff7a1a);
    {
      const m = this.campfireCore.material as THREE.MeshStandardMaterial;
      m.emissive.set(0xff6a10);
      m.emissiveIntensity = 2.4;
    }
    this.campfireCore.position.set(0, 0.7, 0);
    this.root.add(this.campfireCore);
    this.campfire.position.set(0, 2.2, 0);
    this.root.add(this.campfire);
    this.staticColliders.push({ kind: 'circle', x: 0, z: 0, r: 1.4 });

    // A couple of starter houses.
    this.buildHouse(10, -8, 0x8a5a34, 0x9c3b2f);
    this.buildHouse(-12, -6, 0x7d5230, 0x3f6b8a);
    this.buildHouse(6, 12, 0x8a5a34, 0x4a7d43);

    // Wooden palisade segment (part of the settlement defenses).
    for (let i = -3; i <= 3; i++) {
      const post = box(0.9, 2.4, 0.5, 0x6b4a2f);
      post.position.set(i * 0.95 + 16, 1.2, 6);
      this.root.add(post);
    }
    this.staticColliders.push({ kind: 'box', minX: 12, maxX: 20, minZ: 5.6, maxZ: 6.4 });
  }

  private buildHouse(x: number, z: number, wall: number, roof: number) {
    const g = new THREE.Group();
    const base = box(5, 3, 5, wall);
    base.position.y = 1.5;
    g.add(base);
    // door
    const door = box(1.2, 2, 0.2, 0x3a2716);
    door.position.set(0, 1, 2.5);
    g.add(door);
    // windows
    for (const dx of [-1.6, 1.6]) {
      const win = box(0.9, 0.9, 0.2, 0xffd98a);
      const wm = win.material as THREE.MeshStandardMaterial;
      wm.emissive.set(0xffb454);
      wm.emissiveIntensity = 1.1;
      win.position.set(dx, 1.8, 2.5);
      g.add(win);
    }
    // roof (stepped voxel pyramid)
    for (let i = 0; i < 3; i++) {
      const r = box(5 - i * 1.4, 0.7, 5 - i * 1.4, roof);
      r.position.y = 3.3 + i * 0.7;
      g.add(r);
    }
    g.position.set(x, 0, z);
    this.root.add(g);
    this.staticColliders.push({ kind: 'box', minX: x - 2.6, maxX: x + 2.6, minZ: z - 2.6, maxZ: z + 2.6 });
  }

  private scatter() {
    const rnd = mulberry32(1234);
    let placed = 0;
    let guard = 0;
    while (placed < 46 && guard < 4000) {
      guard++;
      const x = (rnd() * 2 - 1) * (this.size - 6);
      const z = (rnd() * 2 - 1) * (this.size - 6);
      const distFromCenter = Math.hypot(x, z);
      if (distFromCenter < 8) continue; // keep the settlement clear
      if (Math.hypot(x + 26, z - 22) < 12) continue; // avoid the pond
      if (this.isBlocked(x, z, 2)) continue;
      const isTree = rnd() > 0.42;
      if (isTree) this.addTree(x, z);
      else this.addRock(x, z);
      placed++;
    }
  }

  private addTree(x: number, z: number) {
    const g = new THREE.Group();
    const trunkH = 2.2 + Math.random() * 1.2;
    const trunk = box(0.7, trunkH, 0.7, 0x6b4a2f);
    trunk.position.y = trunkH / 2;
    g.add(trunk);
    const leafColors = [0x3f7d2e, 0x4f9138, 0x357026];
    for (let i = 0; i < 3; i++) {
      const s = 3 - i * 0.7;
      const leaf = box(s, 1.2, s, leafColors[i % leafColors.length]);
      leaf.position.y = trunkH + 0.2 + i * 0.9;
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    this.root.add(g);
    const collider: ColliderShape = { kind: 'circle', x, z, r: 0.7 };
    this.gatherables.push({ group: g, collider, resource: 'wood', hp: 3, maxHp: 3, x, z });
  }

  private addRock(x: number, z: number) {
    const g = new THREE.Group();
    const colors = [0x8a8f96, 0x777d84, 0x9aa0a7];
    for (let i = 0; i < 3; i++) {
      const s = 1.6 - i * 0.4;
      const r = box(s, s, s, colors[i % colors.length]);
      r.position.set((Math.random() - 0.5) * 0.6, 0.4 + i * 0.55, (Math.random() - 0.5) * 0.6);
      r.rotation.y = Math.random();
      g.add(r);
    }
    // A few ore flecks read as "rare materials".
    const ore = box(0.3, 0.3, 0.3, 0xffd452, 0.4);
    const om = ore.material as THREE.MeshStandardMaterial;
    om.emissive.set(0x5a3f00);
    om.metalness = 0.6;
    ore.position.set(0.4, 1.0, 0.4);
    g.add(ore);
    g.position.set(x, 0, z);
    this.root.add(g);
    const collider: ColliderShape = { kind: 'circle', x, z, r: 0.9 };
    this.gatherables.push({ group: g, collider, resource: 'stone', hp: 4, maxHp: 4, x, z });
  }

  private isBlocked(x: number, z: number, pad: number): boolean {
    for (const c of this.allColliders()) {
      if (this.pointInside(x, z, c, pad)) return true;
    }
    for (const g of this.gatherables) {
      if (this.pointInside(x, z, g.collider, pad)) return true;
    }
    return false;
  }

  private pointInside(x: number, z: number, c: ColliderShape, pad: number): boolean {
    if (c.kind === 'circle') return Math.hypot(x - c.x, z - c.z) < c.r + pad;
    return x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad;
  }

  private *allColliders(): Generator<ColliderShape> {
    yield* this.staticColliders;
    for (const s of this.structures) yield s.collider;
  }

  // Resolve a desired position against all solid colliders + gatherables.
  resolveCollision(x: number, z: number, radius: number): { x: number; z: number } {
    let nx = x;
    let nz = z;
    const solids: ColliderShape[] = [
      ...this.staticColliders,
      ...this.structures.map((s) => s.collider),
      ...this.gatherables.map((g) => g.collider),
    ];
    for (const c of solids) {
      if (c.kind === 'circle') {
        const dx = nx - c.x;
        const dz = nz - c.z;
        const dist = Math.hypot(dx, dz);
        const min = c.r + radius;
        if (dist < min && dist > 0.0001) {
          const push = (min - dist) / dist;
          nx += dx * push;
          nz += dz * push;
        }
      } else {
        const closestX = Math.max(c.minX, Math.min(nx, c.maxX));
        const closestZ = Math.max(c.minZ, Math.min(nz, c.maxZ));
        const dx = nx - closestX;
        const dz = nz - closestZ;
        const dist = Math.hypot(dx, dz);
        if (dist < radius && dist > 0.0001) {
          const push = (radius - dist) / dist;
          nx += dx * push;
          nz += dz * push;
        } else if (dist === 0) {
          nz = c.minZ - radius;
        }
      }
    }
    // Clamp to playable bounds.
    const b = this.size - 2;
    nx = Math.max(-b, Math.min(b, nx));
    nz = Math.max(-b, Math.min(b, nz));
    return { x: nx, z: nz };
  }

  // Find the best gatherable within range. Prefers whatever the player is
  // facing, but auto-targets the nearest node otherwise (mobile-friendly).
  findGatherable(px: number, pz: number, dirX: number, dirZ: number, range: number): Gatherable | null {
    let best: Gatherable | null = null;
    let bestScore = -Infinity;
    for (const g of this.gatherables) {
      const dx = g.x - px;
      const dz = g.z - pz;
      const dist = Math.hypot(dx, dz);
      if (dist > range) continue;
      const dot = (dx / (dist || 1)) * dirX + (dz / (dist || 1)) * dirZ;
      // Facing boosts a node's priority but is not required, so gathering is
      // forgiving on touch controls.
      const score = dot * 1.5 - dist;
      if (score > bestScore) {
        bestScore = score;
        best = g;
      }
    }
    return best;
  }

  hitGatherable(g: Gatherable, damage: number): number {
    g.hp -= damage;
    // shake feedback
    g.group.position.y = 0.12;
    setTimeout(() => (g.group.position.y = 0), 80);
    if (g.hp <= 0) {
      this.root.remove(g.group);
      const idx = this.gatherables.indexOf(g);
      if (idx >= 0) this.gatherables.splice(idx, 1);
      return g.resource === 'wood' ? 3 : 3;
    }
    return 1;
  }

  addStructure(x: number, z: number): THREE.Group {
    const g = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      const stone = box(1.6, 1.0, 1.6, i === 0 ? 0x9aa0a7 : 0x878d94);
      stone.position.y = 0.5 + i * 1.0;
      g.add(stone);
    }
    const top = box(1.8, 0.4, 1.8, 0x6f757c);
    top.position.y = 2.2;
    g.add(top);
    g.position.set(x, 0, z);
    this.root.add(g);
    this.structures.push({ collider: { kind: 'circle', x, z, r: 1.0 } });
    return g;
  }

  updateCampfire(t: number, intensity: number) {
    this.campfire.intensity = intensity * (0.85 + Math.sin(t * 12) * 0.15);
    const flick = 0.9 + Math.sin(t * 15) * 0.1;
    this.campfireCore.scale.setScalar(intensity > 0 ? flick : 1);
  }
}
