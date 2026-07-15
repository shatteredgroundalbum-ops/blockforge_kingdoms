import * as THREE from 'three';
import { GameState } from './GameState';
import { World } from '../world/World';
import { Hero } from '../entities/Hero';
import { Enemy } from '../entities/Enemy';
import { Input } from '../systems/Input';
import { CameraController } from '../systems/CameraController';
import { HUD } from '../ui/HUD';

const DAY_SKY = new THREE.Color(0x8fc7ff);
const DUSK_SKY = new THREE.Color(0xff9a52);
const NIGHT_SKY = new THREE.Color(0x0a0e22);

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();

  private state = new GameState();
  private world: World;
  private hero: Hero;
  private input: Input;
  private cameraCtrl: CameraController;
  private hud: HUD;

  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private ambient: THREE.AmbientLight;

  private enemies: Enemy[] = [];
  private spawnTimer = 0;
  private waveRemaining = 0;
  private wasNight = false;
  private dayRegen = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    // Cap pixel ratio at 1: software WebGL (and low-end mobile) is fill-bound.
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      400,
    );

    this.scene.background = DAY_SKY.clone();
    this.scene.fog = new THREE.Fog(DAY_SKY.clone(), 55, 150);

    // Lighting.
    this.hemi = new THREE.HemisphereLight(0xbfe3ff, 0x3a5a2a, 0.9);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xfff2d6, 1.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 120;
    const s = 55;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // Systems + entities.
    this.world = new World(this.scene);
    this.hero = new Hero();
    this.scene.add(this.hero.root);
    this.input = new Input(canvas);
    this.cameraCtrl = new CameraController(this.camera);
    this.hud = new HUD(this.state, this.input);

    // Starter resources so building is reachable quickly in the demo.
    this.state.inventory.wood = 4;
    this.state.inventory.stone = 2;
    this.state.notify();

    window.addEventListener('resize', this.onResize);
    this.hud.showBanner('DAY 1 — BUILD YOUR SETTLEMENT', false);
  }

  start() {
    this.clock.start();
    this.loop();
  }

  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private loop = () => {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private update(dt: number) {
    // Time of day + day/night transitions.
    const nightChanged = this.state.advance(dt);
    if (nightChanged) {
      if (this.state.isNight) {
        this.beginNight();
      } else {
        this.beginDay();
      }
    }
    this.updateSky();

    // Camera.
    const camDelta = this.input.consumeCameraDelta();
    this.cameraCtrl.rotate(camDelta.yaw, camDelta.pitch);

    // Hero movement (camera-relative).
    const running = this.input.isHeld('dodge') || Math.hypot(this.input.moveX, this.input.moveY) > 0.85;
    this.hero.update(dt, this.input.moveX, this.input.moveY, this.cameraCtrl.yaw, running, this.world);
    this.cameraCtrl.update(dt, this.hero.x, this.hero.y, this.hero.z);

    // Actions.
    for (const action of this.input.consumeActions()) {
      if (action === 'jump') this.hero.jump();
      else if (action === 'attack') this.doAttack();
      else if (action === 'gather') this.doGather();
      else if (action === 'build') this.doBuild();
    }

    // Enemies + combat.
    this.updateEnemies(dt);

    // Spawn management during night.
    if (this.state.isNight && this.waveRemaining > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnEnemy();
        this.spawnTimer = 1.8;
        this.waveRemaining--;
      }
    }

    // Gentle daytime health regen.
    if (!this.state.isNight && this.state.health < this.state.maxHealth) {
      this.dayRegen += dt;
      if (this.dayRegen >= 1) {
        this.dayRegen = 0;
        this.state.heal(2);
      }
    }

    this.world.updateCampfire(this.clock.elapsedTime, this.state.isNight ? 2.4 : 0);
    this.hud.update(dt);
  }

  private doAttack() {
    this.hero.attack();
    const dir = this.hero.facing();
    let hit = false;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - this.hero.x;
      const dz = e.z - this.hero.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.6) continue;
      const dot = (dx / (dist || 1)) * dir.x + (dz / (dist || 1)) * dir.z;
      if (dot < 0.2) continue;
      hit = true;
      if (e.takeDamage(7)) {
        this.state.enemiesDefeated++;
        this.state.addResource('gold', 5);
        this.hud.showToast('+5 gold');
      }
    }
    if (!hit) {
      // Attacking also chops a facing tree/rock for a smoother action feel.
      this.tryGather(false);
    }
  }

  private doGather() {
    if (!this.tryGather(true)) {
      this.hud.showToast('Nothing to gather');
    }
  }

  private tryGather(showAnim: boolean): boolean {
    const dir = this.hero.facing();
    const g = this.world.findGatherable(this.hero.x, this.hero.z, dir.x, dir.z, 4.5);
    if (!g) return false;
    if (showAnim) this.hero.gather();
    const gained = this.world.hitGatherable(g, 1);
    if (gained > 1) {
      // Depleted this node.
      if (g.resource === 'wood') {
        this.state.addResource('wood', gained);
        this.hud.showToast(`+${gained} wood`);
      } else {
        this.state.addResource('stone', gained);
        this.hud.showToast(`+${gained} stone`);
        if (Math.random() < 0.5) this.state.addResource('gold', 3);
        if (Math.random() < 0.2) this.state.addResource('gems', 1);
      }
    }
    return true;
  }

  private doBuild() {
    const cost = { wood: 4, stone: 2 };
    if (!this.state.spend(cost)) {
      this.hud.showToast('Need 4 wood + 2 stone');
      return;
    }
    const dir = this.hero.facing();
    const bx = this.hero.x + dir.x * 2.2;
    const bz = this.hero.z + dir.z * 2.2;
    this.world.addStructure(bx, bz);
    this.state.structuresBuilt++;
    this.hud.showToast('Defense built!');
  }

  private updateEnemies(dt: number) {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dmg = e.update(dt, this.hero.x, this.hero.z, this.world);
      if (dmg > 0) {
        this.state.damage(dmg);
        if (this.state.health <= 0) this.respawn();
      }
    }
    // Cleanup dead.
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive) {
        this.scene.remove(e.root);
        e.dispose();
        this.enemies.splice(i, 1);
      }
    }
  }

  private spawnEnemy() {
    const angle = Math.random() * Math.PI * 2;
    const dist = 34 + Math.random() * 8;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const e = new Enemy(x, z, this.state.day);
    this.enemies.push(e);
    this.scene.add(e.root);
  }

  private beginNight() {
    this.wasNight = true;
    this.waveRemaining = 2 + this.state.day * 2;
    this.spawnTimer = 0.5;
    this.hud.showBanner('NIGHT FALLS — DEFEND THE SETTLEMENT', true);
  }

  private beginDay() {
    if (!this.wasNight) return;
    this.wasNight = false;
    this.waveRemaining = 0;
    // Corrupted creatures retreat from sunlight.
    for (const e of this.enemies) {
      this.scene.remove(e.root);
      e.dispose();
    }
    this.enemies = [];
    this.hud.showBanner(`DAWN — DAY ${this.state.day}`, false);
  }

  private respawn() {
    this.hud.showBanner('YOU FELL — RESPAWNING AT CAMP', true);
    this.hero.x = 0;
    this.hero.z = 6;
    this.state.health = Math.floor(this.state.maxHealth * 0.6);
    this.state.notify();
    for (const e of this.enemies) {
      this.scene.remove(e.root);
      e.dispose();
    }
    this.enemies = [];
    this.waveRemaining = Math.max(0, this.waveRemaining - 2);
  }

  private updateSky() {
    const t = this.state.timeOfDay;
    // Sun elevation angle over the day (peaks at midday t=0.4).
    const sunAngle = (t - 0.15) * Math.PI * 2;
    const elevation = Math.sin(sunAngle);
    const radius = 80;
    this.sun.position.set(
      Math.cos(sunAngle) * radius * 0.4 + this.hero.x,
      Math.max(6, elevation * radius),
      Math.sin(sunAngle) * radius * 0.3 + this.hero.z,
    );
    this.sun.target.position.set(this.hero.x, 0, this.hero.z);

    const daylight = Math.max(0, elevation);
    // Sky color: night -> dusk -> day based on daylight.
    const sky = new THREE.Color();
    if (daylight <= 0) {
      sky.copy(NIGHT_SKY);
    } else if (daylight < 0.3) {
      sky.copy(NIGHT_SKY).lerp(DUSK_SKY, daylight / 0.3);
    } else {
      sky.copy(DUSK_SKY).lerp(DAY_SKY, (daylight - 0.3) / 0.7);
    }
    (this.scene.background as THREE.Color).copy(sky);
    (this.scene.fog as THREE.Fog).color.copy(sky);

    this.sun.intensity = 0.15 + daylight * 1.7;
    this.sun.color.setHSL(0.09 + daylight * 0.05, 0.6, 0.55 + daylight * 0.15);
    this.hemi.intensity = 0.2 + daylight * 0.8;
    this.ambient.intensity = this.state.isNight ? 0.28 : 0.25;
    // Cool moonlight tint at night.
    if (this.state.isNight) this.ambient.color.setHex(0x35406a);
    else this.ambient.color.setHex(0xffffff);
  }
}
