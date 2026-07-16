import type { GameState } from './GameState';

// A linear campaign chain for the vertical slice, tracing the plot's early
// arc: awaken in the ruins -> salvage -> fortify -> survive the night ->
// seal the Shadow Rift and cleanse Greenhaven.

export interface Quest {
  id: string;
  title: string;
  desc: string;
  progress: (s: GameState) => string;
  isComplete: (s: GameState) => boolean;
}

export const QUEST_CHAIN: Quest[] = [
  {
    id: 'salvage',
    title: 'Salvage the Ruins',
    desc: 'Gather timber and stone from the wilds of Greenhaven to begin rebuilding.',
    progress: (s) => `Wood ${Math.min(s.lifetimeWood, 6)}/6 · Stone ${Math.min(s.lifetimeStone, 3)}/3`,
    isComplete: (s) => s.lifetimeWood >= 6 && s.lifetimeStone >= 3,
  },
  {
    id: 'rescue',
    title: 'Rescue the Survivors',
    desc: 'Scattered survivors wait in the wilds. Reach them and bring them home.',
    progress: (s) => `Survivors rescued ${s.survivorsRescued}/3`,
    isComplete: (s) => s.survivorsRescued >= 3,
  },
  {
    id: 'fortify',
    title: 'Fortify the Camp',
    desc: 'Raise stone defenses before the Blight comes for the survivors at night.',
    progress: (s) => `Defenses built ${Math.min(s.structuresBuilt, 2)}/2`,
    isComplete: (s) => s.structuresBuilt >= 2,
  },
  {
    id: 'survive',
    title: 'Survive the Night',
    desc: 'Hold the settlement until dawn against the corrupted Hollow.',
    progress: (s) => (s.isNight ? 'Hold until dawn…' : `Nights survived ${s.nightsSurvived}/1`),
    isComplete: (s) => s.nightsSurvived >= 1,
  },
  {
    id: 'seal',
    title: 'Seal the Shadow Rift',
    desc: 'A Shadow Rift has torn open. Destroy it to cleanse Greenhaven of the Blight.',
    progress: (s) =>
      s.riftSealed
        ? 'Rift sealed'
        : `Rift integrity ${Math.max(0, Math.ceil((s.riftHp / (s.riftMaxHp || 1)) * 100))}%`,
    isComplete: (s) => s.riftSealed,
  },
  {
    id: 'relic',
    title: 'Recover the Verdant Crown',
    desc: 'The sealed rift has surrendered Greenhaven’s royal relic. Claim it.',
    progress: (s) => (s.relicRecovered ? 'Relic recovered' : 'Approach the glowing relic'),
    isComplete: (s) => s.relicRecovered,
  },
];

export class QuestSystem {
  index = 0;
  done = false;

  constructor(
    private state: GameState,
    private onAdvance: (quest: Quest, index: number) => void,
    private onAllComplete: () => void,
  ) {}

  get current(): Quest | null {
    return this.done ? null : QUEST_CHAIN[this.index];
  }

  update(): void {
    if (this.done) return;
    const quest = QUEST_CHAIN[this.index];
    if (quest.isComplete(this.state)) {
      if (this.index >= QUEST_CHAIN.length - 1) {
        this.done = true;
        this.onAllComplete();
        return;
      }
      this.index++;
      this.onAdvance(QUEST_CHAIN[this.index], this.index);
    }
  }
}
