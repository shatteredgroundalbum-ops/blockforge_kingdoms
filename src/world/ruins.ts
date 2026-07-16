import * as THREE from 'three';
import { SmokeEmitter } from '../rendering/atmosphere';

// Chapter One set pieces: the burned home village, environmental story props,
// the debris pile hiding the first survivor, and the corrupted trail toward the
// refuge. Reuses SmokeEmitter for rising smoke and emissive boxes + point
// lights for fire glow.

type HeightFn = (x: number, z: number) => number;

function box(w: number, h: number, d: number, color: number, rough = 0.9): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: rough }),
  );
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export interface Ruins {
  group: THREE.Group;
  debrisPos: THREE.Vector3;
  update: (dt: number, t: number) => void;
}

export function buildRuins(heightAt: HeightFn): Ruins {
  const group = new THREE.Group();
  const smoke: SmokeEmitter[] = [];
  const fires: { light: THREE.PointLight; core: THREE.Mesh; phase: number }[] = [];

  const addFire = (x: number, y: number, z: number, scale = 1) => {
    const core = box(0.6 * scale, 0.7 * scale, 0.6 * scale, 0xff7a1a);
    const cm = core.material as THREE.MeshStandardMaterial;
    cm.emissive.set(0xff5a00);
    cm.emissiveIntensity = 2.6;
    core.position.set(x, y, z);
    group.add(core);
    const light = new THREE.PointLight(0xff7a30, 2.4 * scale, 14 * scale, 2);
    light.position.set(x, y + 0.6, z);
    group.add(light);
    fires.push({ light, core, phase: Math.random() * 6 });
    const s = new SmokeEmitter(x, y + 0.8, z, 26, 0.4 * scale);
    s.setRate(1);
    smoke.push(s);
    group.add(s.points);
  };

  // A charred, broken house.
  const ruinedHouse = (cx: number, cz: number, rot: number, burning: boolean) => {
    const g = new THREE.Group();
    const y = heightAt(cx, cz);
    // Broken foundation + partial walls (some collapsed).
    const found = box(5, 0.6, 5, 0x555049, 0.95);
    found.position.y = 0.3;
    g.add(found);
    const wallColor = 0x3a2c20;
    // three partial walls of varying height (one missing => destroyed look)
    const w1 = box(5, 2.2, 0.4, wallColor);
    w1.position.set(0, 1.4, -2.3);
    g.add(w1);
    const w2 = box(0.4, 1.4, 4, wallColor);
    w2.position.set(-2.3, 1.0, 0);
    g.add(w2);
    const w3 = box(0.4, 0.8, 2.4, wallColor);
    w3.position.set(2.3, 0.7, 0.8);
    g.add(w3);
    // collapsed roof beams
    for (let i = 0; i < 4; i++) {
      const beam = box(0.3, 0.3, 3.5, 0x2a1e14);
      beam.position.set(-1.5 + i * 1.0, 0.5 + Math.random() * 0.6, Math.random() * 1.5);
      beam.rotation.set(Math.random() * 0.6, Math.random(), 0.3 + Math.random() * 0.5);
      g.add(beam);
    }
    g.position.set(cx, y, cz);
    g.rotation.y = rot;
    group.add(g);
    if (burning) addFire(cx + (Math.random() - 0.5) * 2, y + 1, cz + (Math.random() - 0.5) * 2, 1);
  };

  // Small environmental story props: table w/ food, toys, tools, open pen.
  const storyProps = (cx: number, cz: number) => {
    const y = heightAt(cx, cz);
    // overturned table
    const table = box(1.4, 0.2, 0.9, 0x6b4a2f);
    table.position.set(cx, y + 0.15, cz);
    table.rotation.z = 0.5;
    group.add(table);
    // bread/food on ground
    const food = box(0.25, 0.18, 0.25, 0xd8b26a);
    food.position.set(cx + 0.6, y + 0.1, cz + 0.4);
    group.add(food);
    // a child's toy (small bright block)
    const toy = box(0.3, 0.3, 0.3, 0xe0574a);
    toy.position.set(cx - 0.8, y + 0.15, cz - 0.5);
    group.add(toy);
    // scattered blacksmith tools
    const anvil = box(0.5, 0.4, 0.3, 0x40454b, 0.5);
    (anvil.material as THREE.MeshStandardMaterial).metalness = 0.6;
    anvil.position.set(cx + 1.2, y + 0.2, cz - 0.8);
    group.add(anvil);
  };

  // Layout the burned home village (compact, just north of the refuge).
  ruinedHouse(-4, 20, 0.2, true);
  ruinedHouse(5, 21, -0.4, true);
  ruinedHouse(2, 17, 0.9, false);
  ruinedHouse(-6, 16, -0.2, true);
  storyProps(0, 19);
  storyProps(-3, 18);
  // open livestock pen (broken fence ring)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    if (i === 2 || i === 3) continue; // gate left open
    const post = box(0.16, 1.0, 0.16, 0x6b4a2f);
    const px = 8 + Math.cos(a) * 2.2;
    const pz = 18 + Math.sin(a) * 2.2;
    post.position.set(px, heightAt(px, pz) + 0.5, pz);
    group.add(post);
  }

  // Debris pile hiding the first survivor (interact target).
  const debris = new THREE.Group();
  const dpx = 0;
  const dpz = 15;
  const dpy = heightAt(dpx, dpz);
  for (let i = 0; i < 6; i++) {
    const beam = box(2.2, 0.35, 0.35, 0x3a2a1c);
    beam.position.set((Math.random() - 0.5) * 1.5, 0.3 + i * 0.28, (Math.random() - 0.5) * 1.5);
    beam.rotation.set(Math.random() * 0.4, Math.random() * Math.PI, 0.2 + Math.random() * 0.5);
    debris.add(beam);
  }
  debris.position.set(dpx, dpy, dpz);
  group.add(debris);

  // Corrupted trail toward the refuge (south): black crystals, corrupted
  // trees, a wrecked wagon, a fallen bridge.
  const blackCrystal = (cx: number, cz: number) => {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const s = 0.4 + Math.random() * 0.8;
      const c = new THREE.Mesh(
        new THREE.OctahedronGeometry(s, 0),
        new THREE.MeshStandardMaterial({
          color: 0x1a0f26,
          emissive: 0x6a1fb0,
          emissiveIntensity: 1.4,
          roughness: 0.3,
          metalness: 0.2,
          flatShading: true,
        }),
      );
      c.castShadow = true;
      c.position.set((Math.random() - 0.5) * 1.4, s * 0.8, (Math.random() - 0.5) * 1.4);
      c.rotation.set(Math.random(), Math.random(), Math.random());
      g.add(c);
    }
    g.position.set(cx, heightAt(cx, cz), cz);
    group.add(g);
  };
  const corruptedTree = (cx: number, cz: number) => {
    const g = new THREE.Group();
    const h = 3 + Math.random() * 1.5;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.4, h, 6),
      new THREE.MeshStandardMaterial({ color: 0x241a20, roughness: 0.95, flatShading: true }),
    );
    trunk.castShadow = true;
    trunk.position.y = h / 2;
    trunk.rotation.z = 0.15;
    g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const branch = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.14, 1.4, 5),
        new THREE.MeshStandardMaterial({ color: 0x2a1a2e, roughness: 0.9, flatShading: true }),
      );
      branch.position.y = h * 0.6 + i * 0.4;
      branch.rotation.z = (i % 2 === 0 ? 1 : -1) * (0.8 + Math.random() * 0.4);
      g.add(branch);
    }
    g.position.set(cx, heightAt(cx, cz), cz);
    group.add(g);
  };

  blackCrystal(4, 12);
  blackCrystal(-5, 10);
  blackCrystal(3, 7);
  corruptedTree(6, 12);
  corruptedTree(-6, 9);
  corruptedTree(5, 6);

  // Wrecked wagon.
  {
    const wagon = new THREE.Group();
    const bed = box(2.4, 0.6, 1.3, 0x5a3f26);
    bed.position.y = 0.7;
    bed.rotation.z = 0.3;
    wagon.add(bed);
    for (const dx of [-0.9, 0.9]) {
      const wheel = new THREE.Mesh(
        new THREE.TorusGeometry(0.5, 0.12, 6, 12),
        new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.9 }),
      );
      wheel.position.set(dx, 0.5, 0.8);
      wheel.rotation.y = Math.PI / 2;
      wagon.add(wheel);
    }
    const fallen = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.12, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0x3a2a1c }),
    );
    fallen.position.set(0, 0.15, -1);
    wagon.add(fallen);
    wagon.position.set(-4, heightAt(-4, 13), 13);
    group.add(wagon);
  }

  // Fallen bridge (broken planks over a dip).
  {
    const bridge = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const plank = box(1.4, 0.2, 0.9, 0x4a3320);
      plank.position.set(i * 1.1 - 3, 0.2 - (i > 3 ? (i - 3) * 0.5 : 0), 0);
      plank.rotation.z = i > 3 ? 0.5 : 0;
      bridge.add(plank);
    }
    bridge.position.set(8, heightAt(8, 6), 6);
    group.add(bridge);
  }

  return {
    group,
    debrisPos: new THREE.Vector3(dpx, dpy, dpz),
    update: (dt, t) => {
      for (const s of smoke) s.update(dt);
      for (const f of fires) {
        f.light.intensity = 2.0 + Math.sin(t * 12 + f.phase) * 0.7;
        f.core.scale.setScalar(0.9 + Math.sin(t * 15 + f.phase) * 0.12);
      }
    },
  };
}
