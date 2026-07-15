// Unified input for desktop (keyboard/mouse) and mobile (touch joystick + buttons).

export type ActionName = 'attack' | 'gather' | 'build' | 'jump' | 'dodge';

export class Input {
  // Movement vector in local screen space: x = right, y = forward (-1..1).
  moveX = 0;
  moveY = 0;

  // Accumulated camera rotation deltas consumed each frame.
  cameraYaw = 0;
  cameraPitch = 0;

  private keys = new Set<string>();
  private actionQueue: ActionName[] = [];
  private held = new Set<ActionName>();

  // Camera-drag pointer tracking (right half of the screen on mobile / mouse drag on desktop).
  private draggingPointerId: number | null = null;
  private lastDragX = 0;
  private lastDragY = 0;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    if (e.code === 'Space') this.queueAction('jump');
    if (e.code === 'KeyJ' || e.code === 'KeyF') this.queueAction('attack');
    if (e.code === 'KeyE') this.queueAction('gather');
    if (e.code === 'KeyB') this.queueAction('build');
    if (e.code === 'ShiftLeft') this.held.add('dodge');
    this.updateKeyboardMovement();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    if (e.code === 'ShiftLeft') this.held.delete('dodge');
    this.updateKeyboardMovement();
  };

  private updateKeyboardMovement() {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    // Only override joystick when keyboard is active.
    if (x !== 0 || y !== 0 || (!this.joystickActive)) {
      this.moveX = x;
      this.moveY = y;
    }
  }

  private joystickActive = false;

  // --- Mobile joystick API (called by the HUD) ---
  setJoystick(x: number, y: number) {
    this.joystickActive = true;
    this.moveX = x;
    this.moveY = y;
  }

  releaseJoystick() {
    this.joystickActive = false;
    this.moveX = 0;
    this.moveY = 0;
  }

  // --- Camera drag (right side of screen) ---
  private onPointerDown = (e: PointerEvent) => {
    // Use pointer on the canvas for camera control.
    if (this.draggingPointerId === null) {
      this.draggingPointerId = e.pointerId;
      this.lastDragX = e.clientX;
      this.lastDragY = e.clientY;
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== this.draggingPointerId) return;
    const dx = e.clientX - this.lastDragX;
    const dy = e.clientY - this.lastDragY;
    this.lastDragX = e.clientX;
    this.lastDragY = e.clientY;
    this.cameraYaw -= dx * 0.005;
    this.cameraPitch -= dy * 0.005;
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerId === this.draggingPointerId) {
      this.draggingPointerId = null;
    }
  };

  // --- Actions ---
  queueAction(action: ActionName) {
    this.actionQueue.push(action);
  }

  setHeld(action: ActionName, value: boolean) {
    if (value) this.held.add(action);
    else this.held.delete(action);
  }

  isHeld(action: ActionName): boolean {
    return this.held.has(action);
  }

  // Consume queued edge-triggered actions for this frame.
  consumeActions(): ActionName[] {
    const out = this.actionQueue;
    this.actionQueue = [];
    return out;
  }

  // Consume camera delta accumulated this frame.
  consumeCameraDelta(): { yaw: number; pitch: number } {
    const out = { yaw: this.cameraYaw, pitch: this.cameraPitch };
    this.cameraYaw = 0;
    this.cameraPitch = 0;
    return out;
  }
}
