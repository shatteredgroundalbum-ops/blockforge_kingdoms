import * as THREE from 'three';

interface TerrainSampler {
  heightAt(x: number, z: number): number;
  cameraDistanceLimit?: (tx: number, tz: number, dirX: number, dirZ: number, maxDist: number) => number;
}

// Orbiting third-person follow camera with smooth follow, dynamic FOV, combat
// shake, and terrain-aware collision. Yaw also drives camera-relative movement,
// so the Hero reads back `yaw`.
export class CameraController {
  yaw = Math.PI;
  pitch = 0.42;
  distance = 7.5;
  fovTarget = 60;

  private targetPos = new THREE.Vector3();
  private currentPos = new THREE.Vector3(0, 6, 16);
  private shake = 0;

  constructor(private camera: THREE.PerspectiveCamera) {}

  rotate(dYaw: number, dPitch: number) {
    this.yaw += dYaw;
    this.pitch = Math.max(0.12, Math.min(1.15, this.pitch + dPitch));
  }

  // Trigger a brief camera shake (combat impacts, damage).
  addShake(amount: number) {
    this.shake = Math.min(1, this.shake + amount);
  }

  update(dt: number, focusX: number, focusY: number, focusZ: number, terrain?: TerrainSampler) {
    // Look a bit above the character's feet.
    this.targetPos.set(focusX, focusY + 1.4, focusZ);

    // Camera collision: pull in the distance if the view is blocked by objects.
    let dist = this.distance;
    const dirX = -Math.sin(this.yaw);
    const dirZ = -Math.cos(this.yaw);
    if (terrain?.cameraDistanceLimit) {
      const limit = terrain.cameraDistanceLimit(
        this.targetPos.x,
        this.targetPos.z,
        dirX,
        dirZ,
        this.distance,
      );
      dist = Math.min(dist, limit);
    }

    const horiz = Math.cos(this.pitch) * dist;
    const height = Math.sin(this.pitch) * dist;
    const desired = new THREE.Vector3(
      this.targetPos.x + dirX * horiz,
      this.targetPos.y + height,
      this.targetPos.z + dirZ * horiz,
    );

    // Terrain-aware collision: never let the camera sink below the ground.
    if (terrain) {
      const minY = terrain.heightAt(desired.x, desired.z) + 1.2;
      if (desired.y < minY) desired.y = minY;
    }

    const lerp = Math.min(1, dt * 10);
    this.currentPos.lerp(desired, lerp);

    // Dynamic FOV.
    this.camera.fov += (this.fovTarget - this.camera.fov) * Math.min(1, dt * 6);
    this.camera.updateProjectionMatrix();

    // Apply position + decaying shake.
    this.camera.position.copy(this.currentPos);
    if (this.shake > 0.001) {
      const s = this.shake * this.shake * 0.4;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 3);
    }
    this.camera.lookAt(this.targetPos);
  }
}
