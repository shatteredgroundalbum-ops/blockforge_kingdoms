import * as THREE from 'three';

// A Shadow Rift: the physical wound through which the Blight spreads. It
// pulses with corrupted energy, darkens the ground around it, and periodically
// births Hollow. The player seals it by destroying it, which cleanses the area.

export class ShadowRift {
  readonly root = new THREE.Group();
  readonly x: number;
  readonly z: number;
  readonly radius = 2.2;

  hp = 48;
  maxHp = 48;
  sealed = false;

  private shards: THREE.Mesh[] = [];
  private shardHeights: number[] = [];
  private core!: THREE.Mesh;
  private light = new THREE.PointLight(0xb04cff, 2.2, 26, 2);
  private blight!: THREE.Mesh;
  private spawnTimer = 3;
  private t = 0;

  constructor(x: number, z: number) {
    this.x = x;
    this.z = z;
    this.build();
    this.root.position.set(x, 0, z);
  }

  private build() {
    // Corruption stain on the ground.
    const blightGeo = new THREE.CircleGeometry(9, 28);
    blightGeo.rotateX(-Math.PI / 2);
    this.blight = new THREE.Mesh(
      blightGeo,
      new THREE.MeshLambertMaterial({ color: 0x1c0f2a, transparent: true, opacity: 0.7 }),
    );
    this.blight.position.y = 0.06;
    this.blight.receiveShadow = true;
    this.root.add(this.blight);

    // Glowing core.
    const coreMat = new THREE.MeshLambertMaterial({ color: 0x7a1fb0, emissive: 0x8a2ff0 });
    this.core = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 1.4), coreMat);
    this.core.position.y = 1.8;
    this.core.castShadow = true;
    this.root.add(this.core);

    // Jagged shards orbiting the core.
    for (let i = 0; i < 7; i++) {
      const h = 1.2 + Math.random() * 2.2;
      const shard = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, h, 0.4),
        new THREE.MeshLambertMaterial({ color: 0x2a1740, emissive: 0x5a1f8a }),
      );
      const ang = (i / 7) * Math.PI * 2;
      const r = 1.8 + Math.random();
      shard.position.set(Math.cos(ang) * r, h / 2, Math.sin(ang) * r);
      shard.rotation.set(Math.random() * 0.4, ang, Math.random() * 0.4);
      shard.castShadow = true;
      this.shards.push(shard);
      this.shardHeights.push(h);
      this.root.add(shard);
    }

    this.light.position.set(0, 3, 0);
    this.root.add(this.light);
  }

  update(dt: number): void {
    this.t += dt;
    if (this.sealed) return;
    this.core.rotation.y += dt * 0.8;
    const pulse = 0.9 + Math.sin(this.t * 3) * 0.12;
    this.core.scale.set(pulse, 1, pulse);
    this.light.intensity = 2.0 + Math.sin(this.t * 5) * 0.6;
    for (let i = 0; i < this.shards.length; i++) {
      this.shards[i].position.y = this.shardHeights[i] / 2 + Math.sin(this.t * 2 + i) * 0.25;
    }
  }

  // Returns true roughly on an interval while active, so the owner can spawn a
  // Hollow near the rift.
  tickSpawn(dt: number): boolean {
    if (this.sealed) return false;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 6;
      return true;
    }
    return false;
  }

  takeDamage(amount: number): boolean {
    if (this.sealed) return false;
    this.hp -= amount;
    this.core.position.y = 1.8 + 0.15;
    setTimeout(() => (this.core.position.y = 1.8), 70);
    if (this.hp <= 0) {
      this.seal();
      return true;
    }
    return false;
  }

  private seal(): void {
    this.sealed = true;
    this.hp = 0;
    this.light.intensity = 0;
    // Cleanse: collapse the corruption and recolor the scar to healed earth.
    (this.core.material as THREE.MeshLambertMaterial).emissive.set(0x000000);
    (this.core.material as THREE.MeshLambertMaterial).color.set(0x4a7d43);
    for (const s of this.shards) {
      (s.material as THREE.MeshLambertMaterial).emissive.set(0x000000);
      s.visible = false;
    }
    (this.blight.material as THREE.MeshLambertMaterial).color.set(0x3f6b32);
    (this.blight.material as THREE.MeshLambertMaterial).opacity = 0.35;
    this.core.scale.set(0.4, 0.2, 0.4);
    this.core.position.y = 0.4;
  }

  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}
