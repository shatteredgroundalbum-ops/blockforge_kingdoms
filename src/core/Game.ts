import * as THREE from 'three';
import { GameState } from './GameState';
import { World } from '../world/World';
import { Hero } from '../entities/Hero';
import { Enemy } from '../entities/Enemy';
import { Input } from '../systems/Input';
import { CameraController } from '../systems/CameraController';
import { HUD } from '../ui/HUD';
import { QuestSystem, type Quest } from './Quests';
import { ShadowRift } from '../entities/ShadowRift';
import { Villager } from '../entities/Villager';
import { SHADOW_KING_LINES, SETTLEMENT_TIERS, SURVIVOR_LINES } from './lore';
import { createBeacon, createVerdantCrown, type Beacon, type Relic } from '../rendering/markers';
import { Chapter1 } from './Chapter1';
import { createSkyDome, type SkyDome } from '../rendering/env';
import { createAtmosphere, type Atmosphere } from '../rendering/atmosphere';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Sky gradient palettes keyed by daylight (dawn/day/dusk/night).
const SKY = {
  dayTop: new THREE.Color(0x2f6fd0),
  dayHorizon: new THREE.Color(0xbfe0ff),
  duskTop: new THREE.Color(0x3a3a7a),
  duskHorizon: new THREE.Color(0xff8a4a),
  nightTop: new THREE.Color(0x05070f),
  nightHorizon: new THREE.Color(0x1a2036),
  ground: new THREE.Color(0x2a2f2a),
};
const FOG_DAY = new THREE.Color(0xbfe0ff);
const FOG_NIGHT = new THREE.Color(0x0a0e1c);

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
  private skyDome: SkyDome;
  private atmosphere: Atmosphere;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private daylight = 1;
  private sunDirVec = new THREE.Vector3(0, 1, 0);

  private enemies: Enemy[] = [];
  private spawnTimer = 0;
  private waveRemaining = 0;
  private wasNight = false;
  private dayRegen = 0;

  private quests: QuestSystem;
  private rift: ShadowRift | null = null;
  private paused = true;
  private chapter: Chapter1 | null = null;

  // Survivors to rescue, residents living in the camp, and the relic.
  private survivors: { villager: Villager; beacon: Beacon }[] = [];
  private residents: Villager[] = [];
  private relic: Relic | null = null;
  private relicBeacon: Beacon | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    // Cap pixel ratio at 1: software WebGL (and low-end mobile) is fill-bound.
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // Filmic tone mapping + sRGB output for a richer, more realistic response.
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      600,
    );

    this.scene.fog = new THREE.FogExp2(FOG_DAY.clone(), 0.011);

    // Gradient atmospheric sky dome (synced to the sun in updateSky).
    this.skyDome = createSkyDome();
    this.scene.add(this.skyDome.mesh);

    // Stars, moon, drifting clouds.
    this.atmosphere = createAtmosphere();
    this.scene.add(this.atmosphere.group);

    // Image-based lighting from a neutral studio environment (one-time, cheap).
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environmentIntensity = 0.45;

    // Lighting.
    this.hemi = new THREE.HemisphereLight(0xbfe3ff, 0x40532e, 0.5);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.12);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xfff2d6, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 140;
    const s = 55;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // Post-processing: subtle bloom so emissive glows (campfire, rift, windows,
    // enemy eyes) read realistically. Bloom mips run at half resolution to keep
    // software-WebGL cost down.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2),
      0.55,
      0.5,
      0.85,
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.setSize(window.innerWidth, window.innerHeight);

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

    this.quests = new QuestSystem(
      this.state,
      (quest) => this.activateQuest(quest),
      () => this.onCampaignComplete(),
    );

    window.addEventListener('resize', this.onResize);

    // Chapter One plays first as a scripted, cinematic sequence. When it
    // completes, control hands off to the free-roam settlement/quest sandbox.
    this.paused = false;
    this.chapter = new Chapter1({
      scene: this.scene,
      camera: this.camera,
      hero: this.hero,
      world: this.world,
      hud: this.hud,
      cameraCtrl: this.cameraCtrl,
      enemies: this.enemies,
      state: this.state,
      onComplete: () => this.beginChapterTwo(),
    });
    this.chapter.start();
  }

  private beginChapterTwo() {
    this.hero.x = 2;
    this.hero.z = 5;
    this.spawnSurvivors();
    this.activateQuest(this.quests.current!);
    this.hud.showBanner('CHAPTER TWO — REBUILD GREENHAVEN', false);
  }

  start() {
    this.clock.start();
    this.loop();
  }

  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.bloom.setSize(window.innerWidth / 2, window.innerHeight / 2);
  };

  private loop = () => {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    this.update(dt);
    // Keep the sky dome centered on the camera.
    this.skyDome.mesh.position.copy(this.camera.position);
    this.composer.render();
  };

  private update(dt: number) {
    if (this.paused) return;

    if (this.chapter && this.chapter.active) {
      this.updateChapter(dt);
      return;
    }

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
    // Dynamic FOV while sprinting adds a sense of speed.
    this.cameraCtrl.fovTarget = running && Math.hypot(this.input.moveX, this.input.moveY) > 0.1 ? 70 : 60;
    this.cameraCtrl.update(dt, this.hero.x, this.hero.y, this.hero.z, this.world);

    // Living world: wind sway, water, smoke, atmosphere.
    const t = this.clock.elapsedTime;
    this.world.update(t, dt, this.state.isNight);
    this.atmosphere.update(dt, this.daylight, this.sunDirVec, this.camera.position);

    // Actions.
    for (const action of this.input.consumeActions()) {
      if (action === 'jump') this.hero.jump();
      else if (action === 'attack') this.doAttack();
      else if (action === 'gather') this.doGather();
      else if (action === 'build') this.doBuild();
    }

    // Enemies + combat.
    this.updateEnemies(dt);

    // Shadow Rift (Blight nest) once revealed.
    if (this.rift && !this.rift.sealed) {
      this.rift.update(dt);
      if (this.rift.tickSpawn(dt)) {
        const a = Math.random() * Math.PI * 2;
        this.spawnEnemyAt(this.rift.x + Math.cos(a) * 4, this.rift.z + Math.sin(a) * 4);
      }
    }

    // Survivors, residents, relic, settlement growth.
    this.updateSurvivors(dt, t);
    for (const r of this.residents) r.update(dt, (x, z) => this.world.heightAt(x, z));
    this.updateRelic(t);
    this.updateSettlementTier();

    // Quest progression.
    this.quests.update();
    const q = this.quests.current;
    if (q) this.hud.updateObjectiveProgress(q.progress(this.state));

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

  // Chapter One: the director controls flow; Game applies player/camera based on
  // the director's lock/cinematic flags and runs shared world/enemy updates.
  private updateChapter(dt: number) {
    const chapter = this.chapter!;
    const t = this.clock.elapsedTime;

    chapter.update(dt, t);

    const camDelta = this.input.consumeCameraDelta();
    if (chapter.lockPlayer) {
      // Freeze the hero (idle) and ignore actions during cinematics/dialogue.
      this.hero.update(dt, 0, 0, this.cameraCtrl.yaw, false, this.world);
      this.input.consumeActions();
    } else {
      if (!chapter.cinematic) this.cameraCtrl.rotate(camDelta.yaw, camDelta.pitch);
      const running =
        this.input.isHeld('dodge') || Math.hypot(this.input.moveX, this.input.moveY) > 0.85;
      this.hero.update(dt, this.input.moveX, this.input.moveY, this.cameraCtrl.yaw, running, this.world);
      for (const action of this.input.consumeActions()) {
        if (action === 'jump') this.hero.jump();
        else if (action === 'attack') this.doAttack();
        else if (action === 'gather') this.doGather();
        else if (action === 'build') this.doBuild();
      }
    }

    if (!chapter.cinematic) {
      this.cameraCtrl.fovTarget = 60;
      this.cameraCtrl.update(dt, this.hero.x, this.hero.y, this.hero.z, this.world);
    }

    this.updateSky();
    this.updateEnemies(dt);
    this.world.update(t, dt, this.state.isNight);
    this.atmosphere.update(dt, this.daylight, this.sunDirVec, this.camera.position);
    this.world.updateCampfire(t, this.state.isNight ? 2.4 : 0);
    this.hud.update(dt);
  }

  private doAttack() {
    this.hero.attack();
    const dir = this.hero.facing();
    let hit = false;

    // Striking the Shadow Rift when close and facing it.
    if (this.rift && !this.rift.sealed) {
      const dx = this.rift.x - this.hero.x;
      const dz = this.rift.z - this.hero.z;
      const dist = Math.hypot(dx, dz);
      // The rift is a large, stationary story target that erupts beside the
      // camp: any strike from within the settlement/corruption area counts,
      // regardless of facing.
      if (dist < 13) {
        hit = true;
        const sealed = this.rift.takeDamage(6);
        this.state.riftHp = this.rift.hp;
        this.state.notify();
        if (sealed) {
          this.state.riftSealed = true;
          this.state.notify();
          this.hud.showDialogue('THE SHADOW KING', SHADOW_KING_LINES.riftSealed, 10);
        }
      }
    }
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
        this.state.addReputation(3);
        this.hud.showToast('+5 gold');
      }
    }
    if (hit) {
      this.cameraCtrl.addShake(0.3);
    } else {
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
    this.state.addReputation(5);
    this.hud.showToast('Defense built!');
  }

  private updateEnemies(dt: number) {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dmg = e.update(dt, this.hero.x, this.hero.z, this.world);
      if (dmg > 0) {
        this.state.damage(dmg);
        this.cameraCtrl.addShake(0.45);
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
    this.spawnEnemyAt(Math.cos(angle) * dist, Math.sin(angle) * dist);
  }

  private spawnEnemyAt(x: number, z: number) {
    const e = new Enemy(x, z, this.state.day);
    this.enemies.push(e);
    this.scene.add(e.root);
  }

  private activateQuest(quest: Quest) {
    this.hud.setObjective(quest.title, quest.progress(this.state));
    // Survivors call out and run to the player once the rescue begins.
    if (quest.id === 'rescue') {
      for (const s of this.survivors) s.villager.approach = true;
      this.hud.showBanner('SURVIVORS ARE NEARBY — REACH THEM', false);
    }
    // Reveal the Shadow Rift when its objective begins.
    if (quest.id === 'seal' && !this.rift) {
      this.rift = new ShadowRift(0, -6);
      this.rift.root.position.y = this.world.heightAt(0, -6);
      this.state.riftHp = this.rift.hp;
      this.state.riftMaxHp = this.rift.maxHp;
      this.scene.add(this.rift.root);
      this.hud.showDialogue('THE SHADOW KING', SHADOW_KING_LINES.firstRift, 9);
      this.hud.showBanner('A SHADOW RIFT HAS TORN OPEN', true);
    }
  }

  private onCampaignComplete() {
    this.hud.showVictory(
      'GREENHAVEN RISES',
      'The rift is sealed, the Verdant Crown recovered, and survivors are rebuilding a home from the ashes. One relic of five is claimed — Stoneguard, Frostmere, Sunscar, and Emberfall still wait beyond the hills. You began with nothing. You are becoming a leader.',
    );
  }

  private spawnSurvivors() {
    const spots: [number, number][] = [
      [7, 1],
      [-7, 3],
      [-1, 13],
    ];
    for (const [x, z] of spots) {
      const villager = new Villager(x, z, this.world.campCenter.x, this.world.campCenter.y);
      villager.update(0, (vx, vz) => this.world.heightAt(vx, vz));
      this.scene.add(villager.root);
      const beacon = createBeacon(0x6fdcff);
      beacon.group.position.set(x, this.world.heightAt(x, z), z);
      this.scene.add(beacon.group);
      this.survivors.push({ villager, beacon });
    }
  }

  private updateSurvivors(dt: number, t: number) {
    for (let i = this.survivors.length - 1; i >= 0; i--) {
      const s = this.survivors[i];
      s.villager.update(dt, (x, z) => this.world.heightAt(x, z), { x: this.hero.x, z: this.hero.z });
      s.beacon.update(t);
      const d = Math.hypot(s.villager.x - this.hero.x, s.villager.z - this.hero.z);
      if (d < 3.2) {
        // Rescue!
        s.villager.rescue();
        this.scene.remove(s.beacon.group);
        this.residents.push(s.villager);
        this.survivors.splice(i, 1);
        this.state.survivorsRescued += 1;
        this.state.population += 1;
        this.state.addReputation(15);
        this.hud.showDialogue(
          'SURVIVOR',
          SURVIVOR_LINES[this.state.survivorsRescued % SURVIVOR_LINES.length],
          5,
        );
        this.hud.showToast('Survivor rescued!');
      }
    }
  }

  private updateRelic(t: number) {
    // Reveal the Verdant Crown once the rift is sealed.
    if (this.state.riftSealed && !this.relic && !this.state.relicRecovered) {
      this.relic = createVerdantCrown();
      const rx = this.rift ? this.rift.x : 0;
      const rz = this.rift ? this.rift.z : -6;
      this.relic.group.userData.baseY = this.world.heightAt(rx, rz);
      this.relic.group.position.set(rx, this.world.heightAt(rx, rz), rz);
      this.scene.add(this.relic.group);
      this.relicBeacon = createBeacon(0x8fffa0);
      this.relicBeacon.group.position.set(rx, this.world.heightAt(rx, rz), rz);
      this.scene.add(this.relicBeacon.group);
      this.hud.showBanner('THE VERDANT CROWN REMAINS', false);
    }
    if (this.relic) {
      this.relic.update(t);
      this.relicBeacon?.update(t);
      if (!this.state.relicRecovered) {
        const rx = this.relic.group.position.x;
        const rz = this.relic.group.position.z;
        if (Math.hypot(rx - this.hero.x, rz - this.hero.z) < 4.5) {
          this.state.relicRecovered = true;
          this.state.addReputation(40);
          this.state.notify();
          if (this.relicBeacon) this.scene.remove(this.relicBeacon.group);
          this.scene.remove(this.relic.group);
          this.hud.showDialogue('THE SHADOW KING', SHADOW_KING_LINES.relic, 11);
          this.hud.showToast('Verdant Crown recovered!');
        }
      }
    }
  }

  private updateSettlementTier() {
    const next = this.state.settlementTier + 1;
    if (next < SETTLEMENT_TIERS.length) {
      const tier = SETTLEMENT_TIERS[next];
      if (this.state.population >= tier.pop && this.state.structuresBuilt >= tier.structures) {
        this.state.settlementTier = next;
        this.world.applyTier(next);
        this.state.notify();
        this.hud.showBanner(`SETTLEMENT GROWS — ${tier.name.toUpperCase()}`, false);
      }
    }
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
    this.state.nightsSurvived += 1;
    this.state.notify();
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
    // "Golden" factor peaks near the horizon (dawn/dusk warmth).
    const golden = Math.max(0, 1 - Math.abs(elevation) / 0.35) * (daylight > 0 ? 1 : 0.4);

    // Drive the sky dome gradient: night -> dusk -> day.
    const u = this.skyDome.material.uniforms;
    const top = u.uTop.value as THREE.Color;
    const horizon = u.uHorizon.value as THREE.Color;
    if (daylight <= 0.02) {
      top.copy(SKY.nightTop);
      horizon.copy(SKY.nightHorizon);
    } else if (daylight < 0.3) {
      const k = daylight / 0.3;
      top.copy(SKY.nightTop).lerp(SKY.duskTop, k);
      horizon.copy(SKY.nightHorizon).lerp(SKY.duskHorizon, k);
    } else {
      const k = (daylight - 0.3) / 0.7;
      top.copy(SKY.duskTop).lerp(SKY.dayTop, k);
      horizon.copy(SKY.duskHorizon).lerp(SKY.dayHorizon, k);
    }
    (u.uGround.value as THREE.Color).copy(SKY.ground);
    (u.uSunColor.value as THREE.Color).setRGB(1.0, 0.85 - golden * 0.25, 0.6 - golden * 0.25);
    (u.uSunDir.value as THREE.Vector3)
      .set(this.sun.position.x - this.hero.x, this.sun.position.y, this.sun.position.z - this.hero.z)
      .normalize();
    this.daylight = daylight;
    this.sunDirVec.copy(u.uSunDir.value as THREE.Vector3);

    // Fog matches the horizon haze.
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(FOG_NIGHT).lerp(FOG_DAY, daylight);
    fog.density = 0.010 + (1 - daylight) * 0.006;

    // Sun/moon light: warm and golden low, neutral-bright high.
    this.sun.intensity = 0.05 + daylight * 2.6;
    this.sun.color.setRGB(1.0, 0.92 - golden * 0.22, 0.82 - golden * 0.32);
    this.hemi.intensity = 0.12 + daylight * 0.5;
    // IBL and ambient fill: dim at night, with a cool moonlit tint.
    this.scene.environmentIntensity = 0.12 + daylight * 0.5;
    this.ambient.intensity = this.state.isNight ? 0.14 : 0.08;
    this.ambient.color.setHex(this.state.isNight ? 0x2a3a66 : 0xffffff);
  }
}
