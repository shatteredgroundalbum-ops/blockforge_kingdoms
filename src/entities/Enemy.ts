import * as THREE from 'three';
import { VoxelCharacter } from './VoxelCharacter';
import type { World } from '../world/World';

const CORRUPTED_PALETTE = {
  skin: 0x4a2f52,
  hair: 0x1a1020,
  shirt: 0x33203a,
  pants: 0x241528,
  boots: 0x140c18,
  accent: 0x7a1fb0,
  eye: 0xff2d55,
  emissiveEyes: true,
};

export class Enemy {
  readonly character: VoxelCharacter;
  readonly root: THREE.Group;

  x: number;
  z: number;
  yaw = 0;
  hp = 12;
  readonly radius = 0.5;
  readonly speed: number;
  private attackCooldown = 0;
  alive = true;

  constructor(x: number, z: number, difficulty: number) {
    this.x = x;
    this.z = z;
    this.speed = 2.4 + difficulty * 0.4 + Math.random() * 0.6;
    this.hp = 10 + difficulty * 4;
    this.character = new VoxelCharacter({
      palette: CORRUPTED_PALETTE,
      hasHair: false,
      hasScarf: false,
      weapon: 'claw',
      scale: 0.95 + Math.random() * 0.2,
    });
    this.root = this.character.root;
    this.root.position.set(x, 0, z);
  }

  // Returns damage to deal to the player this frame (0 if none).
  update(dt: number, targetX: number, targetZ: number, world: World): number {
    if (!this.alive) return 0;
    const dx = targetX - this.x;
    const dz = targetZ - this.z;
    const dist = Math.hypot(dx, dz);
    let dmg = 0;

    if (dist > 1.4) {
      const nx = this.x + (dx / dist) * this.speed * dt;
      const nz = this.z + (dz / dist) * this.speed * dt;
      const resolved = world.resolveCollision(nx, nz, this.radius);
      this.x = resolved.x;
      this.z = resolved.z;
      this.character.setLocomotion(0.7, true);
    } else {
      this.character.setLocomotion(0, true);
      if (this.attackCooldown <= 0) {
        this.character.triggerAttack();
        dmg = 6;
        this.attackCooldown = 1.5;
      }
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.yaw = Math.atan2(dx, dz);
    this.root.rotation.y = this.yaw;
    this.root.position.set(this.x, 0, this.z);
    this.character.update(dt);
    return dmg;
  }

  takeDamage(amount: number): boolean {
    this.hp -= amount;
    // hit flash
    this.root.scale.multiplyScalar(1.08);
    setTimeout(() => this.root.scale.divideScalar(1.08), 70);
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }

  dispose() {
    this.character.dispose();
  }
}
