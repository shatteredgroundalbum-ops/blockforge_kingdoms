import * as THREE from 'three';

// Orbiting third-person follow camera. Yaw is also used to drive
// camera-relative movement, so the Hero reads back `yaw`.
export class CameraController {
  yaw = Math.PI;
  pitch = 0.42;
  distance = 9;

  private targetPos = new THREE.Vector3();
  private currentPos = new THREE.Vector3(0, 6, 16);

  constructor(private camera: THREE.PerspectiveCamera) {}

  rotate(dYaw: number, dPitch: number) {
    this.yaw += dYaw;
    this.pitch = Math.max(0.12, Math.min(1.15, this.pitch + dPitch));
  }

  update(dt: number, focusX: number, focusY: number, focusZ: number) {
    // Look a bit above the character's feet.
    this.targetPos.set(focusX, focusY + 1.4, focusZ);

    const horiz = Math.cos(this.pitch) * this.distance;
    const height = Math.sin(this.pitch) * this.distance;
    const desired = new THREE.Vector3(
      this.targetPos.x - Math.sin(this.yaw) * horiz,
      this.targetPos.y + height,
      this.targetPos.z - Math.cos(this.yaw) * horiz,
    );

    const lerp = Math.min(1, dt * 10);
    this.currentPos.lerp(desired, lerp);
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.targetPos);
  }
}
