import * as THREE from 'three';
import { mulberry32 } from '../core/rng';
import { makeGroundTextures } from '../rendering/env';
import { terrainHeight, createTerrainMesh } from '../rendering/terrain';
import { createVegetation, type VegetationField } from '../rendering/vegetation';
import { SmokeEmitter } from '../rendering/atmosphere';

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

  private vegetation!: VegetationField;
  readonly smoke: SmokeEmitter[] = [];
  private swayers: { obj: THREE.Object3D; phase: number; amp: number }[] = [];
  private lanterns: { light: THREE.PointLight; base: number }[] = [];

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
    this.buildGround();
    this.buildBorderMountains();
    this.buildWater();
    this.buildSettlement();
    this.starterNodes();
    this.scatter();
    this.buildVegetation();
  }

  // Public ground-height sampler used by movement + entity placement.
  heightAt(x: number, z: number): number {
    return terrainHeight(x, z);
  }

  private buildVegetation() {
    const canPlace = (x: number, z: number): boolean => {
      if (Math.hypot(x, z) < 10) return false; // keep settlement clear
      if (Math.hypot(x + 26, z - 22) < 11) return false; // pond
      return true;
    };
    this.vegetation = createVegetation(this.size, terrainHeight, canPlace);
    this.root.add(this.vegetation.group);
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
    const { map, normalMap } = makeGroundTextures();
    const ground = createTerrainMesh(this.size, { map, normalMap });
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
      m.position.set(x, terrainHeight(x, z) + h / 2 - 1, z);
      m.rotation.y = rnd() * 0.5;
      // snow cap
      const cap = box(w * 0.6, h * 0.2, w * 0.6, 0xeaf2ff);
      cap.position.y = h * 0.5;
      m.add(cap);
      this.root.add(m);
    }
  }

  private water!: THREE.Mesh;
  private waterBase!: Float32Array;

  private buildWater() {
    const geo = new THREE.CircleGeometry(13, 40, 0, Math.PI * 2);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2a6fa8,
      transparent: true,
      opacity: 0.8,
      roughness: 0.06,
      metalness: 0.4,
      envMapIntensity: 1.4,
    });
    this.water = new THREE.Mesh(geo, mat);
    this.water.position.set(-26, -0.5, 22);
    this.water.receiveShadow = true;
    this.root.add(this.water);
    this.waterBase = Float32Array.from(
      (geo.attributes.position as THREE.BufferAttribute).array,
    );
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
    this.addSmoke(0, 1.5, 0, 30, 0.3);
    this.staticColliders.push({ kind: 'circle', x: 0, z: 0, r: 1.4 });

    // A couple of starter houses (with chimneys + smoke).
    this.buildHouse(10, -8, 0x8a5a34, 0x9c3b2f);
    this.buildHouse(-12, -6, 0x7d5230, 0x3f6b8a);
    this.buildHouse(6, 12, 0x8a5a34, 0x4a7d43);

    // A well.
    this.buildWell(-6, 9);

    // Lived-in props: barrels, crates, market stall, lanterns, fences.
    this.addBarrel(8, -4);
    this.addBarrel(8.9, -4.4);
    this.addCrate(-9, -9);
    this.addCrate(-9.8, -8.2);
    this.addCrate(4, 8);
    this.buildStall(12, 2, 0xcc5a3a);
    this.addLantern(3, 3);
    this.addLantern(-4, -3);
    this.addLantern(9, 8);

    // Wooden palisade + fence line (part of the settlement defenses).
    for (let i = -3; i <= 3; i++) {
      const post = box(0.9, 2.4, 0.5, 0x6b4a2f);
      post.position.set(i * 0.95 + 16, 1.2, 6);
      this.root.add(post);
    }
    this.staticColliders.push({ kind: 'box', minX: 12, maxX: 20, minZ: 5.6, maxZ: 6.4 });
    this.buildFence(-14, 4, -14, 12);
  }

  readonly campCenter = new THREE.Vector2(0, 0);

  // Spawn the new buildings that appear when the settlement reaches a tier, so
  // growth is physically visible in the world.
  applyTier(tier: number) {
    if (tier === 1) {
      this.addWatchtower(13, 3);
      this.addTent(-7, 3, 0x9c6b3a);
      this.addTent(7, -3, 0x6a8f4f);
    } else if (tier === 2) {
      this.addFarm(-4, -9);
      this.buildHouse(13, -3, 0x8a5a34, 0x4a7d43);
      this.addTent(-9, -2, 0x7a4f6a);
    } else if (tier >= 3) {
      this.addWatchtower(-13, 2);
      this.addTent(4, -6, 0x9c6b3a);
    }
  }

  private addTent(x: number, z: number, cloth: number) {
    const g = new THREE.Group();
    const canvasMat = new THREE.MeshStandardMaterial({ color: cloth, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.2, 4), canvasMat);
    body.castShadow = true;
    body.receiveShadow = true;
    body.rotation.y = Math.PI / 4;
    body.position.y = 1.1;
    g.add(body);
    const pole = box(0.1, 2.6, 0.1, 0x4a3320);
    pole.position.y = 1.3;
    g.add(pole);
    g.position.set(x, this.heightAt(x, z), z);
    this.root.add(g);
    this.staticColliders.push({ kind: 'circle', x, z, r: 1.4 });
  }

  private addWatchtower(x: number, z: number) {
    const g = new THREE.Group();
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const leg = box(0.3, 6, 0.3, 0x6b4a2f);
      leg.position.set(dx * 1.0, 3, dz * 1.0);
      g.add(leg);
    }
    const platform = box(2.8, 0.4, 2.8, 0x7a5230);
    platform.position.y = 6;
    g.add(platform);
    const rail = box(2.8, 0.6, 0.2, 0x6b4a2f);
    rail.position.set(0, 6.5, 1.3);
    g.add(rail);
    for (let i = 0; i < 3; i++) {
      const r = box(3.0 - i * 0.8, 0.5, 3.0 - i * 0.8, 0x9c3b2f);
      r.position.y = 6.8 + i * 0.5;
      g.add(r);
    }
    const beacon = box(0.4, 0.4, 0.4, 0xffce7a);
    const bm = beacon.material as THREE.MeshStandardMaterial;
    bm.emissive.set(0xffa53a);
    bm.emissiveIntensity = 2.2;
    beacon.position.y = 6.4;
    g.add(beacon);
    const light = new THREE.PointLight(0xffb45a, 0, 12, 2);
    light.position.y = 6.4;
    g.add(light);
    this.lanterns.push({ light, base: 1.3 });
    g.position.set(x, this.heightAt(x, z), z);
    this.root.add(g);
    this.staticColliders.push({ kind: 'circle', x, z, r: 1.6 });
  }

  private addFarm(x: number, z: number) {
    const g = new THREE.Group();
    const soil = box(6, 0.3, 5, 0x5a3f26, 0.95);
    soil.position.y = 0.15;
    soil.receiveShadow = true;
    g.add(soil);
    for (let row = -2; row <= 2; row++) {
      const furrow = box(5.6, 0.12, 0.5, 0x3f2c18);
      furrow.position.set(0, 0.32, row * 0.9);
      g.add(furrow);
      for (let c = -2; c <= 2; c++) {
        const crop = box(0.2, 0.5 + Math.random() * 0.3, 0.2, 0x6db83f);
        crop.position.set(c * 1.1, 0.5, row * 0.9);
        g.add(crop);
      }
    }
    // scarecrow
    const post = box(0.14, 1.6, 0.14, 0x6b4a2f);
    post.position.set(2.6, 0.9, 0);
    const arms = box(1.2, 0.14, 0.14, 0x6b4a2f);
    arms.position.set(2.6, 1.3, 0);
    const head = box(0.4, 0.4, 0.4, 0xcaa64a);
    head.position.set(2.6, 1.8, 0);
    g.add(post, arms, head);
    g.position.set(x, this.heightAt(x, z), z);
    this.root.add(g);
    this.staticColliders.push({ kind: 'box', minX: x - 3, maxX: x + 3, minZ: z - 2.6, maxZ: z + 2.6 });
  }

  private addSmoke(x: number, y: number, z: number, count: number, spread: number) {
    const s = new SmokeEmitter(x, y, z, count, spread);
    this.smoke.push(s);
    this.root.add(s.points);
  }

  private buildWell(x: number, z: number) {
    const g = new THREE.Group();
    const ring = box(2.2, 1.0, 2.2, 0x8a8f96, 0.95);
    ring.position.y = 0.5;
    g.add(ring);
    const waterTop = box(1.6, 0.1, 1.6, 0x2a6fa8, 0.1);
    (waterTop.material as THREE.MeshStandardMaterial).metalness = 0.4;
    waterTop.position.y = 0.85;
    g.add(waterTop);
    for (const dx of [-0.9, 0.9]) {
      const post = box(0.24, 2.2, 0.24, 0x6b4a2f);
      post.position.set(dx, 1.6, 0);
      g.add(post);
    }
    const roof = box(2.6, 0.4, 1.6, 0x9c3b2f);
    roof.position.y = 2.8;
    roof.rotation.z = 0.05;
    g.add(roof);
    g.position.set(x, this.heightAt(x, z), z);
    this.root.add(g);
    this.staticColliders.push({ kind: 'circle', x, z, r: 1.3 });
  }

  private addBarrel(x: number, z: number) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.36, 1.0, 12),
      new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.8 }),
    );
    body.castShadow = true;
    body.position.y = 0.5;
    g.add(body);
    for (const yy of [0.2, 0.8]) {
      const hoop = new THREE.Mesh(
        new THREE.CylinderGeometry(0.44, 0.44, 0.08, 12),
        new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.7, roughness: 0.4 }),
      );
      hoop.position.y = yy;
      g.add(hoop);
    }
    g.position.set(x, this.heightAt(x, z), z);
    this.root.add(g);
  }

  private addCrate(x: number, z: number) {
    const crate = box(0.9, 0.9, 0.9, 0x8a6a3a, 0.8);
    // plank trim
    const trim = box(0.94, 0.12, 0.94, 0x6b4a2f);
    trim.position.y = 0;
    crate.add(trim);
    crate.position.set(x, this.heightAt(x, z) + 0.45, z);
    crate.rotation.y = Math.random();
    this.root.add(crate);
  }

  private buildStall(x: number, z: number, cloth: number) {
    const g = new THREE.Group();
    for (const dx of [-1.3, 1.3]) {
      for (const dz of [-0.8, 0.8]) {
        const post = box(0.16, 2.2, 0.16, 0x6b4a2f);
        post.position.set(dx, 1.1, dz);
        g.add(post);
      }
    }
    const counter = box(3.0, 0.3, 1.8, 0x8a6a3a);
    counter.position.y = 1.0;
    g.add(counter);
    const awning = box(3.4, 0.2, 2.2, cloth);
    awning.position.y = 2.3;
    awning.rotation.x = 0.12;
    g.add(awning);
    g.position.set(x, this.heightAt(x, z), z);
    this.root.add(g);
    this.staticColliders.push({ kind: 'box', minX: x - 1.5, maxX: x + 1.5, minZ: z - 1, maxZ: z + 1 });
  }

  private addLantern(x: number, z: number) {
    const g = new THREE.Group();
    const post = box(0.16, 2.4, 0.16, 0x4a3320);
    post.position.y = 1.2;
    g.add(post);
    const arm = box(0.6, 0.14, 0.14, 0x4a3320);
    arm.position.set(0.25, 2.3, 0);
    g.add(arm);
    const glass = box(0.34, 0.5, 0.34, 0xffce7a);
    const gm = glass.material as THREE.MeshStandardMaterial;
    gm.emissive.set(0xffa53a);
    gm.emissiveIntensity = 2.2;
    glass.position.set(0.5, 2.0, 0);
    g.add(glass);
    const light = new THREE.PointLight(0xffb45a, 0.0, 9, 2);
    light.position.set(0.5, 2.0, 0);
    g.add(light);
    this.lanterns.push({ light, base: 1.1 });
    g.position.set(x, this.heightAt(x, z), z);
    this.root.add(g);
    this.staticColliders.push({ kind: 'circle', x, z, r: 0.3 });
  }

  private buildFence(x1: number, z1: number, x2: number, z2: number) {
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const x = x1 + ((x2 - x1) * i) / steps;
      const z = z1 + ((z2 - z1) * i) / steps;
      const post = box(0.18, 1.2, 0.18, 0x6b4a2f);
      post.position.set(x, this.heightAt(x, z) + 0.6, z);
      this.root.add(post);
      if (i < steps) {
        const rail = box(0.1, 0.14, ((z2 - z1) / steps) * 0.9 + Math.abs((x2 - x1) / steps), 0x7a5230);
        rail.position.set(x, this.heightAt(x, z) + 0.8, z + (z2 - z1) / steps / 2);
        this.root.add(rail);
      }
    }
  }

  private buildHouse(x: number, z: number, wall: number, roof: number) {
    const g = new THREE.Group();
    // stone foundation
    const found = box(5.4, 0.8, 5.4, 0x8a8f96, 0.95);
    found.position.y = 0.4;
    g.add(found);
    // plastered wall
    const base = box(5, 3, 5, wall);
    base.position.y = 2.3;
    g.add(base);
    // exposed timber beams on the corners + mid
    for (const dx of [-2.4, 0, 2.4]) {
      for (const dz of [-2.4, 2.4]) {
        if (dx === 0 && dz === 2.4) continue; // leave doorway side clear-ish
        const beam = box(0.28, 3, 0.28, 0x4a3320);
        beam.position.set(dx, 2.3, dz);
        g.add(beam);
      }
    }
    const lintel = box(5.1, 0.3, 5.1, 0x4a3320);
    lintel.position.y = 3.7;
    g.add(lintel);
    // door
    const door = box(1.2, 2, 0.2, 0x3a2716);
    door.position.set(0, 1.8, 2.55);
    g.add(door);
    // windows with shutters
    for (const dx of [-1.6, 1.6]) {
      const win = box(0.9, 0.9, 0.2, 0xffd98a);
      const wm = win.material as THREE.MeshStandardMaterial;
      wm.emissive.set(0xffb454);
      wm.emissiveIntensity = 1.2;
      win.position.set(dx, 2.6, 2.55);
      g.add(win);
      for (const sx of [-0.62, 0.62]) {
        const shutter = box(0.28, 0.95, 0.12, 0x6b4a2f);
        shutter.position.set(dx + sx, 2.6, 2.58);
        g.add(shutter);
      }
    }
    // layered roof (stepped voxel pyramid)
    for (let i = 0; i < 4; i++) {
      const r = box(5.4 - i * 1.2, 0.6, 5.4 - i * 1.2, roof);
      r.position.y = 4.1 + i * 0.6;
      g.add(r);
    }
    // chimney + smoke
    const chimney = box(0.8, 2.2, 0.8, 0x7a6a60, 0.9);
    chimney.position.set(1.6, 5.2, -1.4);
    g.add(chimney);
    g.position.set(x, 0, z);
    this.root.add(g);
    this.addSmoke(x + 1.6, z * 0 + 6.3, z - 1.4, 24, 0.25);
    this.staticColliders.push({ kind: 'box', minX: x - 2.8, maxX: x + 2.8, minZ: z - 2.8, maxZ: z + 2.8 });
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
      const roll = rnd();
      if (roll > 0.58) this.addTree(x, z);
      else if (roll > 0.34) this.addRock(x, z);
      else if (roll > 0.18) this.addBush(x, z);
      else this.addLog(x, z);
      placed++;
    }
    // Extra decorative bushes for a denser forest floor.
    for (let i = 0; i < 40; i++) {
      const x = (rnd() * 2 - 1) * (this.size - 6);
      const z = (rnd() * 2 - 1) * (this.size - 6);
      if (Math.hypot(x, z) < 10) continue;
      if (Math.hypot(x + 26, z - 22) < 11) continue;
      this.addBush(x, z);
    }
  }

  private addTree(x: number, z: number) {
    const g = new THREE.Group();
    const y = terrainHeight(x, z);
    const rand = Math.random();

    const trunkMat = () =>
      new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9, flatShading: true });
    const leaf = (radius: number, color: number) => {
      const m = new THREE.Mesh(
        new THREE.IcosahedronGeometry(radius, 0),
        new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true }),
      );
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };

    if (rand < 0.55) {
      // Broadleaf: tapered trunk + clustered organic canopy.
      const trunkH = 2.6 + Math.random() * 1.8;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.45, trunkH, 7),
        trunkMat(),
      );
      trunk.castShadow = true;
      trunk.position.y = trunkH / 2;
      g.add(trunk);
      const greens = [0x4f9138, 0x3f7d2e, 0x5aa03f, 0x357026];
      const blobs = 4 + Math.floor(Math.random() * 3);
      for (let i = 0; i < blobs; i++) {
        const r = 1.1 + Math.random() * 0.9;
        const b = leaf(r, greens[i % greens.length]);
        b.position.set(
          (Math.random() - 0.5) * 1.8,
          trunkH + 0.3 + Math.random() * 1.6,
          (Math.random() - 0.5) * 1.8,
        );
        g.add(b);
      }
    } else {
      // Conifer: stacked shrinking cones.
      const trunkH = 1.4 + Math.random();
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.32, trunkH, 6),
        trunkMat(),
      );
      trunk.castShadow = true;
      trunk.position.y = trunkH / 2;
      g.add(trunk);
      const tiers = 4 + Math.floor(Math.random() * 2);
      const green = [0x2f6b2a, 0x367a30][Math.floor(Math.random() * 2)];
      for (let i = 0; i < tiers; i++) {
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(1.7 - i * 0.32, 1.5, 7),
          new THREE.MeshStandardMaterial({ color: green, roughness: 0.85, flatShading: true }),
        );
        cone.castShadow = true;
        cone.position.y = trunkH + i * 0.95;
        g.add(cone);
      }
    }

    g.position.set(x, y, z);
    this.root.add(g);
    this.swayers.push({ obj: g, phase: Math.random() * Math.PI * 2, amp: 0.02 + Math.random() * 0.02 });
    const collider: ColliderShape = { kind: 'circle', x, z, r: 0.7 };
    this.gatherables.push({ group: g, collider, resource: 'wood', hp: 3, maxHp: 3, x, z });
  }

  private addRock(x: number, z: number) {
    const g = new THREE.Group();
    const y = terrainHeight(x, z);
    const colors = [0x8a8f96, 0x777d84, 0x9aa0a7, 0x6f757c];
    const chunks = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < chunks; i++) {
      const s = 0.5 + Math.random() * 1.1;
      const r = new THREE.Mesh(
        new THREE.DodecahedronGeometry(s, 0),
        new THREE.MeshStandardMaterial({
          color: colors[i % colors.length],
          roughness: 0.95,
          flatShading: true,
        }),
      );
      r.castShadow = true;
      r.receiveShadow = true;
      r.position.set(
        (Math.random() - 0.5) * 1.6,
        s * 0.5 + Math.random() * 0.3,
        (Math.random() - 0.5) * 1.6,
      );
      r.rotation.set(Math.random(), Math.random(), Math.random());
      g.add(r);
    }
    // Ore flecks read as "rare materials".
    const ore = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.28, 0),
      new THREE.MeshStandardMaterial({
        color: 0xffd452,
        emissive: 0x5a3f00,
        metalness: 0.6,
        roughness: 0.35,
        flatShading: true,
      }),
    );
    ore.position.set(0.3, 0.9, 0.3);
    g.add(ore);
    g.position.set(x, y, z);
    this.root.add(g);
    const collider: ColliderShape = { kind: 'circle', x, z, r: 0.95 };
    this.gatherables.push({ group: g, collider, resource: 'stone', hp: 4, maxHp: 4, x, z });
  }

  // Non-gatherable decor scattered through the forest.
  private addBush(x: number, z: number) {
    const g = new THREE.Group();
    const green = [0x3f7d2e, 0x4f9138][Math.floor(Math.random() * 2)];
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.5 + Math.random() * 0.4, 0),
        new THREE.MeshStandardMaterial({ color: green, roughness: 0.85, flatShading: true }),
      );
      b.castShadow = true;
      b.position.set((Math.random() - 0.5) * 0.8, 0.4, (Math.random() - 0.5) * 0.8);
      g.add(b);
    }
    g.position.set(x, terrainHeight(x, z), z);
    this.root.add(g);
    this.swayers.push({ obj: g, phase: Math.random() * 6, amp: 0.03 });
  }

  private addLog(x: number, z: number) {
    const log = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 2.6 + Math.random(), 8),
      new THREE.MeshStandardMaterial({ color: 0x5a3f26, roughness: 0.9, flatShading: true }),
    );
    log.castShadow = true;
    log.receiveShadow = true;
    log.rotation.z = Math.PI / 2;
    log.rotation.y = Math.random() * Math.PI;
    log.position.set(x, terrainHeight(x, z) + 0.35, z);
    this.root.add(log);
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

  // Camera collision: march from the look-target outward along the camera's
  // horizontal direction and stop before the view passes through a solid object
  // (trees, rocks, buildings, structures). Returns the allowed distance.
  cameraDistanceLimit(tx: number, tz: number, dirX: number, dirZ: number, maxDist: number): number {
    const solids: ColliderShape[] = [
      ...this.staticColliders,
      ...this.structures.map((s) => s.collider),
      ...this.gatherables.map((g) => g.collider),
    ];
    const step = 0.5;
    // Extra clearance so the camera clears wide tree canopies (whose visual
    // size is larger than their trunk collider).
    const pad = 1.6;
    for (let d = 1.2; d <= maxDist; d += step) {
      const px = tx + dirX * d;
      const pz = tz + dirZ * d;
      for (const c of solids) {
        if (this.pointInside(px, pz, c, pad)) {
          // Never pull closer than this, so the camera can't enter the hero.
          return Math.max(3.6, d - step);
        }
      }
    }
    return maxDist;
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
    // shake feedback (relative to the node's resting terrain height)
    const baseY = terrainHeight(g.x, g.z);
    g.group.position.y = baseY + 0.12;
    setTimeout(() => (g.group.position.y = baseY), 80);
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
    g.position.set(x, terrainHeight(x, z), z);
    this.root.add(g);
    this.structures.push({ collider: { kind: 'circle', x, z, r: 1.0 } });
    return g;
  }

  updateCampfire(t: number, intensity: number) {
    this.campfire.intensity = intensity * (0.85 + Math.sin(t * 12) * 0.15);
    const flick = 0.9 + Math.sin(t * 15) * 0.1;
    this.campfireCore.scale.setScalar(intensity > 0 ? flick : 1);
  }

  // Per-frame world animation: wind sway, water ripples, lantern flicker, smoke.
  update(t: number, dt: number, isNight: boolean) {
    this.vegetation.update(t);

    // Tree/bush sway (skip nodes that have been removed).
    for (let i = this.swayers.length - 1; i >= 0; i--) {
      const s = this.swayers[i];
      if (!s.obj.parent) {
        this.swayers.splice(i, 1);
        continue;
      }
      s.obj.rotation.z = Math.sin(t * 1.3 + s.phase) * s.amp;
      s.obj.rotation.x = Math.cos(t * 1.1 + s.phase) * s.amp * 0.6;
    }

    // Water ripples.
    if (this.water) {
      const pos = this.water.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        const bx = this.waterBase[i];
        const bz = this.waterBase[i + 2];
        arr[i + 1] = this.waterBase[i + 1] + Math.sin(t * 1.6 + bx * 0.6 + bz * 0.4) * 0.08;
      }
      pos.needsUpdate = true;
    }

    // Lantern flicker (only lit at night).
    for (const l of this.lanterns) {
      l.light.intensity = isNight ? l.base * (0.75 + Math.sin(t * 9 + l.light.position.x) * 0.25) : 0;
    }

    // Smoke plumes.
    for (const s of this.smoke) {
      s.setRate(1);
      s.update(dt);
    }
  }
}
