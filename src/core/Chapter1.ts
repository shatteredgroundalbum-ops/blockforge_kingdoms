import * as THREE from 'three';
import type { Hero } from '../entities/Hero';
import type { World } from '../world/World';
import type { HUD } from '../ui/HUD';
import type { CameraController } from '../systems/CameraController';
import type { GameState } from './GameState';
import { Enemy } from '../entities/Enemy';
import { Villager } from '../entities/Villager';
import { buildRuins, type Ruins } from '../world/ruins';
import { createBeacon, type Beacon } from '../rendering/markers';
import { CHAPTER1 } from './lore';

export interface ChapterCtx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  hero: Hero;
  world: World;
  hud: HUD;
  cameraCtrl: CameraController;
  enemies: Enemy[];
  state: GameState;
  onComplete: () => void;
}

type Phase =
  | 'introFade'
  | 'opening'
  | 'walkRuins'
  | 'rescue'
  | 'gather'
  | 'build'
  | 'night'
  | 'morning'
  | 'travel'
  | 'enemy'
  | 'crystal'
  | 'arrive'
  | 'ending'
  | 'done';

const REFUGE = new THREE.Vector3(0, 0, 0);

// Scripted director for Chapter One. Owns the ruined-village set pieces, drives
// the camera during cinematics, gates player control, and sequences the story
// beats. `lockPlayer`/`cinematic` are read by Game to hand over control.
export class Chapter1 {
  active = true;
  lockPlayer = true;
  cinematic = true;

  private phase: Phase = 'introFade';
  private timer = 0;
  private busy = false; // waiting on a dialogue sequence
  private ruins!: Ruins;
  private elder: Villager | null = null;
  private refugeFolk: Villager[] = [];
  private enemy: Enemy | null = null;
  private eyes: THREE.Group | null = null;
  private refugeBeacon: Beacon | null = null;
  private baseWood = 0;
  private baseStone = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();

  constructor(private ctx: ChapterCtx) {}

  start() {
    const { hero, world, scene, camera, hud, state } = this.ctx;
    // Place the hero on the ridge north of the ruined village.
    hero.x = 0;
    hero.z = 22;
    hero.y = world.heightAt(0, 22);
    hero.yaw = Math.PI;
    // Keep it a somber overcast morning.
    state.timeOfDay = 0.34;

    this.ruins = buildRuins((x, z) => world.heightAt(x, z));
    scene.add(this.ruins.group);

    // Ensure gatherable resources line the ruins so the "gather" beat is always
    // reachable wherever the player pauses after the rescue.
    world.spawnGatherCluster(0, 15);

    // Spawn a few refugees behind the settlement (the refuge) for the ending.
    for (const [x, z] of [[3, -2], [-3, -3], [1, -4]] as [number, number][]) {
      const v = new Villager(x, z, REFUGE.x, REFUGE.z);
      v.mode = 'resident';
      scene.add(v.root);
      this.refugeFolk.push(v);
    }

    // Cinematic camera starts high, looking over the burning village.
    this.camPos.set(-18, world.heightAt(-18, 30) + 16, 34);
    this.camLook.set(0, 2, 18);
    camera.position.copy(this.camPos);
    camera.lookAt(this.camLook);

    hud.setLetterbox(true);
    hud.fadeTo(true);
    hud.setObjective('Chapter One', 'Ashes of the Fallen');
  }

  private say(speaker: string, lines: string[], onDone: () => void) {
    this.busy = true;
    this.lockPlayer = true;
    this.ctx.hud.showDialogueSequence(speaker, lines, () => {
      this.busy = false;
      onDone();
    });
  }

  private dist(x: number, z: number): number {
    return Math.hypot(this.ctx.hero.x - x, this.ctx.hero.z - z);
  }

  private setCinematicCam(pos: THREE.Vector3, look: THREE.Vector3, dt: number, lerp = 1.2) {
    this.camPos.lerp(pos, Math.min(1, dt * lerp));
    this.camLook.lerp(look, Math.min(1, dt * lerp));
    this.ctx.camera.position.copy(this.camPos);
    this.ctx.camera.lookAt(this.camLook);
  }

  update(dt: number, t: number) {
    if (!this.active) return;
    this.ruins.update(dt, t);
    for (const v of this.refugeFolk) v.update(dt, (x, z) => this.ctx.world.heightAt(x, z));
    if (this.elder) this.elder.update(dt, (x, z) => this.ctx.world.heightAt(x, z));
    if (this.eyes) this.animateEyes(t);
    if (this.refugeBeacon) this.refugeBeacon.update(t);

    this.timer += dt;
    if (this.busy) return;

    switch (this.phase) {
      case 'introFade':
        this.ctx.hud.fadeTo(false);
        this.ctx.hud.showTitleCard(CHAPTER1.title, CHAPTER1.subtitle, 4.5);
        this.go('opening');
        break;

      case 'opening': {
        // Slowly drift the camera across the burning ruins.
        const w = this.ctx.world;
        const px = -18 + Math.min(this.timer, 9) * 3.2;
        this.setCinematicCam(
          new THREE.Vector3(px, w.heightAt(px, 30) + 14, 32),
          new THREE.Vector3(0, 2, 17),
          dt,
          0.9,
        );
        if (this.timer > 2 && this.timer < 6) {
          this.ctx.hud.showNarration(CHAPTER1.openingNarration[1], 4);
        }
        if (this.timer > 9.5) {
          this.ctx.hud.setLetterbox(false);
          this.cinematic = false;
          this.lockPlayer = false;
          this.ctx.hud.setObjective('Search the Ruins', 'Find anyone still alive');
          this.ctx.hud.showNarration(CHAPTER1.searchNarration, 5);
          this.go('walkRuins');
        }
        break;
      }

      case 'walkRuins':
        if (this.dist(this.ruins.debrisPos.x, this.ruins.debrisPos.z) < 6.5) {
          this.ctx.hud.setInteractPrompt(null);
          this.rescueElder();
        } else if (this.dist(this.ruins.debrisPos.x, this.ruins.debrisPos.z) < 12) {
          this.ctx.hud.setInteractPrompt('A voice cries out beneath the rubble…');
        }
        break;

      case 'gather': {
        const wood = this.ctx.state.lifetimeWood - this.baseWood;
        const stone = this.ctx.state.lifetimeStone - this.baseStone;
        this.ctx.hud.updateObjectiveProgress(
          `Wood ${Math.min(wood, 3)}/3 · Stone ${Math.min(stone, 3)}/3`,
        );
        if (wood >= 3 && stone >= 3) {
          this.ctx.hud.setObjective('Build a Campfire', 'Hold back the dark');
          this.ctx.hud.showNarration(CHAPTER1.buildNarration, 5);
          this.baseStructures = this.ctx.state.structuresBuilt;
          this.go('build');
        }
        break;
      }

      case 'build':
        this.ctx.hud.updateObjectiveProgress(
          `Campfire ${Math.min(this.ctx.state.structuresBuilt - this.baseStructures, 1)}/1`,
        );
        if (this.ctx.state.structuresBuilt - this.baseStructures >= 1) {
          this.beginFirstNight();
        }
        break;

      case 'night':
        // Tension only — no attack. Hold, then dawn breaks.
        if (this.timer > 12) this.beginMorning();
        break;

      case 'travel':
        if (this.dist(0, 8) < 6) this.spawnEncounter();
        break;

      case 'enemy':
        if (this.enemy && !this.enemy.alive) {
          this.ctx.state.addResource('gems', 1);
          this.ctx.hud.showNarration(CHAPTER1.crystalNarration, 6);
          this.ctx.hud.setObjective('Reach the Refuge', 'Bring word to the survivors');
          this.go('crystal');
        }
        break;

      case 'crystal':
        if (this.dist(REFUGE.x, REFUGE.z) < 9) this.arriveRefuge();
        break;

      case 'ending': {
        // Rise above the refuge revealing smoke on the horizon.
        const h = this.ctx.hero;
        this.setCinematicCam(
          new THREE.Vector3(h.x - 4, 26 + this.timer * 2.5, h.z + 20),
          new THREE.Vector3(h.x, 2, h.z - 6),
          dt,
          0.9,
        );
        if (this.timer > 3.5 && this.timer < 8) {
          this.ctx.hud.showNarration(CHAPTER1.endingNarration[1], 5);
        }
        if (this.timer > 8 && !this.endFading) {
          this.endFading = true;
          this.ctx.hud.fadeTo(true);
        }
        if (this.timer > 9.5) {
          this.ctx.hud.showTitleCard(CHAPTER1.complete, '', 4);
        }
        if (this.timer > 13) {
          this.finish();
        }
        break;
      }
    }
  }

  private baseStructures = 0;
  private endFading = false;

  private go(phase: Phase) {
    this.phase = phase;
    this.timer = 0;
  }

  private rescueElder() {
    this.go('rescue');
    // Clear the debris and reveal the survivor.
    this.ruins.group.remove(
      ...this.ruins.group.children.filter((c) => c.position.distanceTo(this.ruins.debrisPos) < 0.5),
    );
    const ex = this.ruins.debrisPos.x + 1.5;
    const ez = this.ruins.debrisPos.z;
    this.elder = new Villager(ex, ez, REFUGE.x, REFUGE.z);
    this.elder.mode = 'resident';
    this.ctx.scene.add(this.elder.root);
    this.ctx.hud.showToast('Survivor rescued!');
    this.ctx.state.population += 1;
    this.ctx.state.survivorsRescued += 1;
    this.ctx.state.addReputation(15);
    this.say('ELDER SURVIVOR', CHAPTER1.elderRescue, () => {
      this.ctx.hud.setObjective('Gather Supplies', 'Wood and stone for the fire');
      this.ctx.hud.showNarration(CHAPTER1.gatherNarration, 5);
      this.baseWood = this.ctx.state.lifetimeWood;
      this.baseStone = this.ctx.state.lifetimeStone;
      this.go('gather');
    });
  }

  private beginFirstNight() {
    this.go('night');
    this.ctx.state.timeOfDay = 0.78; // night
    this.ctx.hud.showBanner('NIGHTFALL', true);
    this.ctx.hud.showNarration(CHAPTER1.nightNarration, 6);
    // Glowing eyes among the trees — menace without attack.
    this.eyes = new THREE.Group();
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2d2d, fog: false });
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 16 + Math.random() * 8;
      const ex = this.ctx.hero.x + Math.cos(a) * r;
      const ez = this.ctx.hero.z + Math.sin(a) * r;
      const y = this.ctx.world.heightAt(ex, ez) + 1.2;
      for (const dx of [-0.18, 0.18]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), eyeMat);
        eye.position.set(ex + dx, y, ez);
        this.eyes.add(eye);
      }
    }
    this.ctx.scene.add(this.eyes);
  }

  private animateEyes(t: number) {
    if (!this.eyes) return;
    this.eyes.position.x = Math.sin(t * 0.6) * 1.2;
    this.eyes.children.forEach((e, i) => {
      (e as THREE.Mesh).visible = Math.sin(t * 2 + i * 0.9) > -0.6; // occasional blink
    });
  }

  private beginMorning() {
    this.go('morning');
    this.ctx.state.timeOfDay = 0.32;
    if (this.eyes) {
      this.ctx.scene.remove(this.eyes);
      this.eyes = null;
    }
    this.say('ELDER SURVIVOR', CHAPTER1.morningElder, () => {
      this.ctx.hud.showToast("Received: Woodcutter's Axe");
      this.ctx.hud.setObjective('Travel to the Refuge', 'Head south, past the old bridge');
      this.ctx.hud.showNarration(CHAPTER1.travelNarration, 6);
      // Beacon over the refuge.
      this.refugeBeacon = createBeacon(0xffd76a);
      this.refugeBeacon.group.position.set(REFUGE.x, this.ctx.world.heightAt(REFUGE.x, REFUGE.z), REFUGE.z);
      this.ctx.scene.add(this.refugeBeacon.group);
      this.go('travel');
    });
  }

  private spawnEncounter() {
    this.go('enemy');
    this.ctx.hud.showNarration(CHAPTER1.enemyNarration, 5);
    this.enemy = new Enemy(this.ctx.hero.x + 2, this.ctx.hero.z - 6, 1);
    this.ctx.enemies.push(this.enemy);
    this.ctx.scene.add(this.enemy.root);
  }

  private arriveRefuge() {
    this.go('arrive');
    this.busy = true;
    this.lockPlayer = true;
    if (this.refugeBeacon) {
      this.ctx.scene.remove(this.refugeBeacon.group);
      this.refugeBeacon = null;
    }
    this.say('REFUGE LEADER', CHAPTER1.leader, () => {
      this.busy = false;
      this.beginEnding();
    });
  }

  private beginEnding() {
    this.go('ending');
    this.cinematic = true;
    this.lockPlayer = true;
    this.ctx.hud.setLetterbox(true);
    this.ctx.hud.showNarration(CHAPTER1.endingNarration[0], 5);
    // Distant smoke columns on the horizon = the whole kingdom burning.
    const smokeGroup = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const a = -0.6 + i * 0.24;
      const r = 120 + Math.random() * 60;
      const sx = Math.sin(a) * r;
      const sz = -Math.cos(a) * r;
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(2 + Math.random() * 2, 4, 40, 6, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0x555052,
          transparent: true,
          opacity: 0.5,
          fog: false,
          side: THREE.DoubleSide,
        }),
      );
      col.position.set(sx, 20, sz);
      smokeGroup.add(col);
      const glow = new THREE.PointLight(0xff5a20, 1.2, 60, 2);
      glow.position.set(sx, 4, sz);
      smokeGroup.add(glow);
    }
    this.ctx.scene.add(smokeGroup);
  }

  private finish() {
    this.go('done');
    this.active = false;
    this.lockPlayer = false;
    this.cinematic = false;
    // Clean up chapter-only actors that shouldn't linger.
    if (this.enemy) {
      this.ctx.scene.remove(this.enemy.root);
    }
    this.ctx.hud.fadeTo(false);
    this.ctx.hud.setLetterbox(false);
    this.ctx.onComplete();
  }
}
