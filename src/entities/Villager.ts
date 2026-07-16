import * as THREE from 'three';
import { VoxelCharacter, type CharacterPalette } from './VoxelCharacter';

export const CIVILIAN_PALETTES: CharacterPalette[] = [
  { skin: 0xe0b088, hair: 0x3a2414, shirt: 0x6a8f4f, pants: 0x4a4038, boots: 0x2a2018, accent: 0xcaa64a, eye: 0x201810 },
  { skin: 0xd8a06a, hair: 0x1a1414, shirt: 0x8a5a44, pants: 0x3a3a4a, boots: 0x241a12, accent: 0x9c6b3a, eye: 0x201810 },
  { skin: 0xf0c8a0, hair: 0x6a4a24, shirt: 0x5a6a8f, pants: 0x40382e, boots: 0x2a2018, accent: 0xb0b6bc, eye: 0x201810 },
  { skin: 0xc89060, hair: 0x2a1a10, shirt: 0x7a4f6a, pants: 0x3a4038, boots: 0x241a12, accent: 0xd0a040, eye: 0x201810 },
];

type Mode = 'waiting' | 'toCamp' | 'resident';

// A rescuable survivor who, once rescued, walks to camp and lives there,
// wandering between spots — the visible, growing population of the settlement.
export class Villager {
  readonly character: VoxelCharacter;
  readonly root: THREE.Group;
  x: number;
  z: number;
  yaw = 0;
  mode: Mode = 'waiting';
  approach = false; // once true, a waiting survivor runs toward a nearby player

  private target = new THREE.Vector2();
  private idleTimer = 0;
  private readonly speed = 2.6;

  constructor(x: number, z: number, private campX: number, private campZ: number) {
    this.x = x;
    this.z = z;
    const palette = CIVILIAN_PALETTES[Math.floor(Math.random() * CIVILIAN_PALETTES.length)];
    this.character = new VoxelCharacter({
      palette,
      hasHair: true,
      hasScarf: Math.random() > 0.5,
      weapon: 'none',
      scale: 0.92 + Math.random() * 0.1,
    });
    this.root = this.character.root;
    this.root.position.set(x, 0, z);
  }

  rescue() {
    if (this.mode === 'waiting') {
      this.mode = 'toCamp';
      this.pickCampTarget();
    }
  }

  private pickCampTarget() {
    const a = Math.random() * Math.PI * 2;
    const r = 3 + Math.random() * 7;
    this.target.set(this.campX + Math.cos(a) * r, this.campZ + Math.sin(a) * r);
  }

  update(dt: number, heightAt: (x: number, z: number) => number, hero?: { x: number; z: number }) {
    let speed01 = 0;
    if (this.mode === 'waiting') {
      if (this.approach && hero) {
        const dx = hero.x - this.x;
        const dz = hero.z - this.z;
        const dist = Math.hypot(dx, dz);
        // Once the player is in view, the survivor runs to them for rescue.
        if (dist < 16 && dist > 0.4) {
          const step = this.speed * 1.2 * dt;
          this.x += (dx / dist) * step;
          this.z += (dz / dist) * step;
          this.yaw = Math.atan2(dx, dz);
          speed01 = 0.8;
        } else {
          this.yaw = Math.atan2(dx, dz);
        }
      } else {
        // Gentle idle; face roughly toward the camp so they read as "waiting".
        this.yaw = Math.atan2(this.campX - this.x, this.campZ - this.z);
      }
    } else {
      const dx = this.target.x - this.x;
      const dz = this.target.y - this.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.6) {
        const step = this.speed * dt;
        this.x += (dx / dist) * step;
        this.z += (dz / dist) * step;
        this.yaw = Math.atan2(dx, dz);
        speed01 = 0.6;
      } else if (this.mode === 'toCamp') {
        this.mode = 'resident';
        this.idleTimer = 1 + Math.random() * 2;
      } else {
        // resident idle, then pick a new spot to wander to
        this.idleTimer -= dt;
        if (this.idleTimer <= 0) {
          this.pickCampTarget();
        }
      }
    }

    this.character.setLocomotion(speed01, true);
    this.character.update(dt);
    this.root.position.set(this.x, heightAt(this.x, this.z), this.z);
    this.root.rotation.y = this.yaw;
  }

  dispose() {
    this.character.dispose();
  }
}
