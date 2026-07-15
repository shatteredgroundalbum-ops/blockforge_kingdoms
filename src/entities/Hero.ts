import * as THREE from 'three';
import { VoxelCharacter } from './VoxelCharacter';
import type { World } from '../world/World';

const WARRIOR_PALETTE = {
  skin: 0xd8a06a,
  hair: 0x4a2c17,
  shirt: 0x3b6ea5,
  pants: 0x394050,
  boots: 0x2a2118,
  accent: 0xb63a2f,
  eye: 0x201810,
};

export class Hero {
  readonly character: VoxelCharacter;
  readonly root: THREE.Group;

  x = 0;
  z = 6;
  y = 0;
  yaw = Math.PI;
  private vy = 0;
  private grounded = true;
  readonly radius = 0.45;

  readonly walkSpeed = 6.5;
  readonly runSpeed = 10;

  constructor() {
    this.character = new VoxelCharacter({
      palette: WARRIOR_PALETTE,
      hasHair: true,
      hasScarf: true,
      weapon: 'sword',
      scale: 1,
    });
    this.root = this.character.root;
    this.syncTransform();
  }

  private syncTransform() {
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.y = this.yaw;
  }

  jump() {
    if (this.grounded) {
      this.vy = 8.5;
      this.grounded = false;
    }
  }

  attack() {
    this.character.triggerAttack();
  }

  gather() {
    this.character.triggerGather();
  }

  facing(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  update(dt: number, moveX: number, moveZ: number, cameraYaw: number, running: boolean, world: World) {
    const len = Math.hypot(moveX, moveZ);
    let speed01 = 0;
    if (len > 0.01) {
      // Convert screen-relative input into world direction using the camera yaw.
      const sin = Math.sin(cameraYaw);
      const cos = Math.cos(cameraYaw);
      const worldX = moveX * cos + moveZ * sin;
      const worldZ = -moveX * sin + moveZ * cos;
      const dir = new THREE.Vector2(worldX, worldZ).normalize();
      const speed = running ? this.runSpeed : this.walkSpeed;
      const nx = this.x + dir.x * speed * dt;
      const nz = this.z + dir.y * speed * dt;
      const resolved = world.resolveCollision(nx, nz, this.radius);
      this.x = resolved.x;
      this.z = resolved.z;
      // Face movement direction (smoothed).
      const targetYaw = Math.atan2(dir.x, dir.y);
      this.yaw = smoothAngle(this.yaw, targetYaw, dt * 12);
      speed01 = running ? 1 : 0.6;
    }

    // Gravity / jump.
    this.vy -= 22 * dt;
    this.y += this.vy * dt;
    if (this.y <= 0) {
      this.y = 0;
      this.vy = 0;
      this.grounded = true;
    }

    this.character.setLocomotion(speed01, this.grounded);
    this.character.update(dt);
    this.syncTransform();
  }
}

function smoothAngle(current: number, target: number, t: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * Math.min(1, t);
}
