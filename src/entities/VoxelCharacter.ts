import * as THREE from 'three';

// An articulated, animated voxel humanoid: head, torso, two arms, two legs,
// plus stylized details (hair, scarf, weapon, glowing eyes). Limbs pivot at
// joints and are driven by procedural walk/run/jump/attack/gather animations,
// so the result reads as a real character rather than a plain cube.

export interface CharacterPalette {
  skin: number;
  hair: number;
  shirt: number;
  pants: number;
  boots: number;
  accent: number; // scarf / trim
  eye: number;
  emissiveEyes?: boolean;
}

export interface CharacterOptions {
  palette: CharacterPalette;
  scale?: number;
  hasHair?: boolean;
  hasScarf?: boolean;
  hasCape?: boolean;
  armor?: boolean;
  weapon?: 'sword' | 'none' | 'claw';
}

type AnimState = 'idle' | 'move' | 'jump';

function box(
  w: number,
  h: number,
  d: number,
  color: number,
  emissive = 0x000000,
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.75, metalness: 0.05 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export class VoxelCharacter {
  readonly root = new THREE.Group();

  private bob = new THREE.Group();
  private torso!: THREE.Mesh;
  private headPivot = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private scarf?: THREE.Mesh;
  private capeSegments: THREE.Group[] = [];

  private phase = 0;
  private attackTimer = 0;
  private gatherTimer = 0;
  private state: AnimState = 'idle';
  private moveSpeed01 = 0;
  private readonly scale: number;

  constructor(private opts: CharacterOptions) {
    this.scale = opts.scale ?? 1;
    this.build();
  }

  private build() {
    const p = this.opts.palette;
    this.root.add(this.bob);

    // Legs (pivot at hip, y = 0.72).
    for (const [group, dx] of [
      [this.legL, -0.16],
      [this.legR, 0.16],
    ] as const) {
      group.position.set(dx, 0.72, 0);
      const thigh = box(0.26, 0.42, 0.28, p.pants);
      thigh.position.y = -0.21;
      const boot = box(0.28, 0.32, 0.3, p.boots);
      boot.position.y = -0.55;
      group.add(thigh, boot);
      this.bob.add(group);
    }

    // Torso.
    this.torso = box(0.62, 0.6, 0.36, p.shirt);
    this.torso.position.y = 1.05;
    this.bob.add(this.torso);

    // Belt accent.
    const belt = box(0.64, 0.1, 0.38, p.accent);
    belt.position.y = 0.78;
    this.bob.add(belt);

    // Arms (pivot at shoulder, y = 1.28).
    for (const [group, dx, isRight] of [
      [this.armL, -0.42, false],
      [this.armR, 0.42, true],
    ] as const) {
      group.position.set(dx, 1.28, 0);
      const upper = box(0.2, 0.4, 0.24, p.shirt);
      upper.position.y = -0.2;
      // Bracer (armored forearm).
      if (this.opts.armor) {
        const bracer = box(0.24, 0.24, 0.28, 0x9aa0a7);
        (bracer.material as THREE.MeshStandardMaterial).metalness = 0.6;
        (bracer.material as THREE.MeshStandardMaterial).roughness = 0.4;
        bracer.position.y = -0.4;
        group.add(bracer);
      }
      const hand = box(0.22, 0.2, 0.26, p.skin);
      hand.position.y = -0.5;
      group.add(upper, hand);
      // Fingers (individual, not mitten).
      for (let f = -1; f <= 1; f++) {
        const finger = box(0.05, 0.12, 0.07, p.skin);
        finger.position.set(f * 0.07, -0.64, 0.08);
        group.add(finger);
      }
      const thumb = box(0.05, 0.1, 0.06, p.skin);
      thumb.position.set(isRight ? -0.12 : 0.12, -0.58, 0.05);
      group.add(thumb);
      // Pauldron (shoulder armor).
      if (this.opts.armor) {
        const pauldron = box(0.34, 0.22, 0.34, 0xb7bec6);
        const pm = pauldron.material as THREE.MeshStandardMaterial;
        pm.metalness = 0.65;
        pm.roughness = 0.35;
        pauldron.position.y = 0.02;
        group.add(pauldron);
      }
      this.bob.add(group);

      if (isRight && this.opts.weapon === 'sword') {
        const blade = box(0.1, 0.9, 0.1, 0xdfe9f5);
        const bm = blade.material as THREE.MeshStandardMaterial;
        bm.metalness = 0.85;
        bm.roughness = 0.28;
        blade.position.set(0, -0.9, 0.02);
        const guard = box(0.32, 0.08, 0.14, 0xcaa64a);
        guard.position.set(0, -0.5, 0.02);
        const grip = box(0.1, 0.22, 0.12, 0x5a3a22);
        grip.position.set(0, -0.36, 0.02);
        group.add(grip, guard, blade);
      }
      if (isRight && this.opts.weapon === 'claw') {
        for (let i = -1; i <= 1; i++) {
          const claw = box(0.06, 0.34, 0.06, 0xdfe7ee);
          claw.position.set(i * 0.08, -0.66, 0.05);
          claw.rotation.x = -0.2;
          group.add(claw);
        }
      }
    }

    // Head + face.
    this.headPivot.position.y = 1.35;
    const head = box(0.44, 0.44, 0.44, p.skin);
    head.position.y = 0.22;
    this.headPivot.add(head);

    const eyeMat = this.opts.palette.emissiveEyes
      ? new THREE.MeshStandardMaterial({
          color: p.eye,
          emissive: p.eye,
          emissiveIntensity: 2.2,
          roughness: 0.5,
        })
      : new THREE.MeshStandardMaterial({ color: p.eye, roughness: 0.5 });
    for (const dx of [-0.1, 0.1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.05), eyeMat);
      eye.position.set(dx, 0.24, 0.23);
      this.headPivot.add(eye);
    }

    if (this.opts.hasHair) {
      // Multi-layer voxel hair.
      const hairTop = box(0.52, 0.14, 0.52, p.hair);
      hairTop.position.y = 0.47;
      const hairTuft = box(0.3, 0.12, 0.3, p.hair);
      hairTuft.position.set(0.05, 0.56, 0.08);
      const hairBack = box(0.52, 0.4, 0.16, p.hair);
      hairBack.position.set(0, 0.26, -0.22);
      this.headPivot.add(hairTop, hairTuft, hairBack);
      for (const dx of [-0.28, 0.28]) {
        const side = box(0.1, 0.34, 0.5, p.hair);
        side.position.set(dx, 0.26, 0);
        this.headPivot.add(side);
      }
      // Brow adds a touch of expression.
      for (const dx of [-0.1, 0.1]) {
        const brow = box(0.13, 0.04, 0.04, p.hair);
        brow.position.set(dx, 0.33, 0.23);
        this.headPivot.add(brow);
      }
    }
    this.bob.add(this.headPivot);

    if (this.opts.hasScarf) {
      this.scarf = box(0.5, 0.16, 0.42, p.accent);
      this.scarf.position.y = 1.28;
      this.bob.add(this.scarf);
    }

    // Chest armor / tunic layering.
    if (this.opts.armor) {
      const chest = box(0.68, 0.5, 0.42, 0xb7bec6);
      const cm = chest.material as THREE.MeshStandardMaterial;
      cm.metalness = 0.55;
      cm.roughness = 0.4;
      chest.position.y = 1.08;
      this.bob.add(chest);
      const trim = box(0.7, 0.1, 0.44, p.accent);
      trim.position.y = 1.3;
      this.bob.add(trim);
    }

    // Flowing cape: a chain of segments that swings with movement.
    if (this.opts.hasCape) {
      let parent: THREE.Object3D = this.bob;
      let yStart = 1.36;
      for (let i = 0; i < 5; i++) {
        const seg = new THREE.Group();
        seg.position.set(0, i === 0 ? yStart : -0.34, i === 0 ? -0.22 : 0);
        const cloth = box(0.56 - i * 0.04, 0.36, 0.06, p.accent);
        (cloth.material as THREE.MeshStandardMaterial).roughness = 0.9;
        cloth.position.y = -0.17;
        seg.add(cloth);
        parent.add(seg);
        this.capeSegments.push(seg);
        parent = seg;
        yStart = 0;
      }
    }

    this.root.scale.setScalar(this.scale);
  }

  // --- animation drivers set by the owning entity each frame ---
  setLocomotion(speed01: number, grounded: boolean) {
    this.moveSpeed01 = speed01;
    if (!grounded) this.state = 'jump';
    else if (speed01 > 0.05) this.state = 'move';
    else this.state = 'idle';
  }

  triggerAttack() {
    if (this.attackTimer <= 0) this.attackTimer = 0.45;
  }

  triggerGather() {
    if (this.gatherTimer <= 0) this.gatherTimer = 0.5;
  }

  get isAttacking(): boolean {
    return this.attackTimer > 0.15;
  }

  update(dt: number) {
    const runRate = 8 + this.moveSpeed01 * 6;
    this.phase += dt * runRate * (this.state === 'move' ? 1 : 0.25);

    const swing = Math.sin(this.phase);
    const swing2 = Math.sin(this.phase * 2);

    if (this.state === 'move') {
      const amp = 0.5 + this.moveSpeed01 * 0.5;
      this.legL.rotation.x = swing * amp;
      this.legR.rotation.x = -swing * amp;
      this.armL.rotation.x = -swing * amp * 0.8;
      this.armR.rotation.x = swing * amp * 0.8;
      // A pronounced bob + slight roll so the gait reads even from behind.
      this.bob.position.y = Math.abs(swing2) * 0.11;
      this.bob.rotation.y = swing * 0.06;
      this.bob.rotation.z = swing * 0.05;
    } else if (this.state === 'jump') {
      this.legL.rotation.x = -0.5;
      this.legR.rotation.x = 0.3;
      this.armL.rotation.x = -1.4;
      this.armR.rotation.x = -1.4;
      this.bob.position.y = 0;
      this.bob.rotation.y = 0;
      this.bob.rotation.z = 0;
    } else {
      // idle breathing sway
      const idle = Math.sin(this.phase * 0.5);
      this.legL.rotation.x = 0;
      this.legR.rotation.x = 0;
      this.armL.rotation.x = idle * 0.08;
      this.armR.rotation.x = -idle * 0.08;
      this.bob.position.y = idle * 0.02;
      this.bob.rotation.y = 0;
      this.bob.rotation.z = 0;
      this.headPivot.rotation.y = Math.sin(this.phase * 0.3) * 0.15;
    }

    // Attack overrides right arm.
    if (this.attackTimer > 0) {
      this.attackTimer = Math.max(0, this.attackTimer - dt);
      const t = 1 - this.attackTimer / 0.45;
      const swingArc = Math.sin(t * Math.PI);
      this.armR.rotation.x = -2.2 * swingArc;
      this.armR.rotation.z = -0.4 * swingArc;
    } else {
      this.armR.rotation.z = 0;
    }

    // Gather = chopping motion on right arm.
    if (this.gatherTimer > 0) {
      this.gatherTimer = Math.max(0, this.gatherTimer - dt);
      const t = 1 - this.gatherTimer / 0.5;
      const chop = Math.sin(t * Math.PI * 2);
      this.armR.rotation.x = -1.2 - chop * 0.8;
    }

    // Scarf flutter.
    if (this.scarf) {
      this.scarf.rotation.z = Math.sin(this.phase) * 0.05 * (this.moveSpeed01 + 0.2);
    }

    // Cape cloth: segments swing back with speed and ripple down the chain.
    if (this.capeSegments.length) {
      const lift = 0.12 + this.moveSpeed01 * 0.7 + (this.state === 'jump' ? 0.5 : 0);
      for (let i = 0; i < this.capeSegments.length; i++) {
        const ripple = Math.sin(this.phase * 1.4 - i * 0.7) * (0.05 + this.moveSpeed01 * 0.08);
        const sway = Math.sin(this.phase * 0.9 - i * 0.5) * 0.06;
        this.capeSegments[i].rotation.x = lift * (0.4 + i * 0.14) + ripple;
        this.capeSegments[i].rotation.z = sway;
      }
    }
  }

  dispose() {
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
  }
}
