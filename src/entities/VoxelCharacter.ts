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
      const hand = box(0.22, 0.22, 0.26, p.skin);
      hand.position.y = -0.48;
      group.add(upper, hand);
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
      const hairTop = box(0.5, 0.16, 0.5, p.hair);
      hairTop.position.y = 0.46;
      const hairBack = box(0.5, 0.34, 0.14, p.hair);
      hairBack.position.set(0, 0.28, -0.2);
      this.headPivot.add(hairTop, hairBack);
    }
    this.bob.add(this.headPivot);

    if (this.opts.hasScarf) {
      this.scarf = box(0.5, 0.16, 0.42, p.accent);
      this.scarf.position.y = 1.28;
      this.bob.add(this.scarf);
      const tail = box(0.18, 0.5, 0.14, p.accent);
      tail.position.set(-0.18, 1.02, -0.22);
      tail.rotation.x = 0.2;
      this.bob.add(tail);
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
