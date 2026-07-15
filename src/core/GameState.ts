// Central mutable game state: resources, player vitals, day/night clock.

export type ResourceKind = 'wood' | 'stone' | 'gold' | 'gems';

export interface Inventory {
  wood: number;
  stone: number;
  gold: number;
  gems: number;
}

export class GameState {
  inventory: Inventory = { wood: 0, stone: 0, gold: 0, gems: 0 };

  health = 100;
  maxHealth = 100;

  // Day/night: normalized time of day in [0, 1). 0.35 = bright mid-morning.
  timeOfDay = 0.35;
  dayLength = 70; // seconds for a full day+night cycle
  day = 1;

  structuresBuilt = 0;
  enemiesDefeated = 0;

  // Populated by the HUD so systems can request a re-render on change.
  onChange: (() => void) | null = null;

  get isNight(): boolean {
    // Night runs across the wrap point (dusk -> dawn).
    return this.timeOfDay > 0.72 || this.timeOfDay < 0.08;
  }

  addResource(kind: ResourceKind, amount: number): void {
    this.inventory[kind] += amount;
    this.notify();
  }

  spend(cost: Partial<Inventory>): boolean {
    for (const key of Object.keys(cost) as ResourceKind[]) {
      if (this.inventory[key] < (cost[key] ?? 0)) return false;
    }
    for (const key of Object.keys(cost) as ResourceKind[]) {
      this.inventory[key] -= cost[key] ?? 0;
    }
    this.notify();
    return true;
  }

  damage(amount: number): void {
    this.health = Math.max(0, this.health - amount);
    this.notify();
  }

  heal(amount: number): void {
    this.health = Math.min(this.maxHealth, this.health + amount);
    this.notify();
  }

  advance(dt: number): boolean {
    const prevNight = this.isNight;
    const prev = this.timeOfDay;
    this.timeOfDay += dt / this.dayLength;
    if (this.timeOfDay >= 1) {
      this.timeOfDay -= 1;
    }
    // New day starts when we cross dawn.
    if (prev > 0.9 && this.timeOfDay < 0.1) {
      this.day += 1;
      this.notify();
    }
    const nightChanged = this.isNight !== prevNight;
    if (nightChanged) this.notify();
    return nightChanged;
  }

  notify(): void {
    this.onChange?.();
  }
}
