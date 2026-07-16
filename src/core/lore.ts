// Narrative data for BLOCKFORGE: KINGDOMS, set in the fractured world of
// Eldoria. This module is the single source of truth for story text so the UI,
// quests, and future campaign content can share it.

export interface Kingdom {
  id: string;
  name: string;
  biome: string;
  specialization: string;
  relic: string;
  blurb: string;
}

export const KINGDOMS: Kingdom[] = [
  {
    id: 'greenhaven',
    name: 'Greenhaven',
    biome: 'Fertile woodland',
    specialization: 'Farming, timber, medicine, taming',
    relic: 'The Verdant Crown',
    blurb: 'A woodland kingdom of farms and forests — home of your first settlement.',
  },
  {
    id: 'stoneguard',
    name: 'Stoneguard',
    biome: 'Mountains',
    specialization: 'Mining, engineering, metalworking',
    relic: 'The Adamant Keystone',
    blurb: 'A fortified mountain kingdom sealed from within after the mines fell.',
  },
  {
    id: 'frostmere',
    name: 'Frostmere',
    biome: 'Frozen valleys',
    specialization: 'Scouting, crystals, weather-tech',
    relic: 'The Frostglass Lens',
    blurb: 'A northern kingdom of glaciers and observatories, its people scattered.',
  },
  {
    id: 'sunscar',
    name: 'Sunscar',
    biome: 'Desert',
    specialization: 'Trade, alchemy, irrigation',
    relic: 'The Sunwell Seal',
    blurb: 'A desert kingdom of trade cities and buried temples, its reservoirs poisoned.',
  },
  {
    id: 'emberfall',
    name: 'Emberfall',
    biome: 'Volcanic',
    specialization: 'Forges, siege engineering',
    relic: 'The Ember Core',
    blurb: 'A volcanic kingdom nearest the Shadow King’s buried capital — the most corrupted.',
  },
];

export const FACTIONS = [
  { name: 'The Hollow', desc: 'Former humans consumed by the Blight; some retain military training.' },
  { name: 'Corrupted Beasts', desc: 'Wildlife twisted into larger, deadlier forms.' },
  { name: 'Riftborn', desc: 'Creatures made of corrupted energy, alive only while a Rift feeds them.' },
  { name: 'The Ashen Order', desc: 'A cult that believes the Shadow King will bring permanent order.' },
  { name: 'Broken Lords', desc: 'Rulers who accepted corrupted power for authority or revenge.' },
];

export const SHADOW_KING_LINES = {
  firstRift:
    'So. Another survivor who mistakes stubbornness for destiny. Seal my rift if you can — you only delay what you cannot stop.',
  riftSealed:
    'You cleanse one wound and call it victory. The Heartfire is mine, builder. Every wall you raise proves my truth: they obey because you are strong.',
  relic:
    'The Verdant Crown. You gather my old jailers’ trinkets — how fitting. Bring me all five, and we will end this division together. They follow you now; freedom only gave them the Blight.',
  taunt:
    'They follow you now. Freedom gave them the Blight; you give them order. We are not so different.',
};

// Visible settlement stages (the camp grows as population + structures rise).
export const SETTLEMENT_TIERS = [
  { name: 'Survivor Camp', pop: 1, structures: 0 },
  { name: 'Defended Outpost', pop: 2, structures: 2 },
  { name: 'Growing Village', pop: 4, structures: 3 },
  { name: 'Fortified Town', pop: 6, structures: 5 },
];

// Chapter One — Ashes of the Fallen.
export const CHAPTER1 = {
  title: 'CHAPTER ONE',
  subtitle: 'Ashes of the Fallen',
  openingNarration: [
    'You climb the shattered ridge. The battle is over.',
    'Below, your village burns. Nothing moves.',
    'Only wind, and the smell of ash.',
  ],
  searchNarration: 'Search the ruins of your home. Find anyone still alive.',
  elderRescue: [
    '…help… please, over here…',
    'Bless you. I thought I was the last soul left breathing.',
    'They came out of the dark in the night — creatures no one had ever seen.',
    'The defenders bought time enough for a few to flee into the forest.',
    'Go. Find them. I will keep the fire while you can.',
  ],
  gatherNarration: 'Gather wood and stone. We must keep a fire through the night.',
  buildNarration: 'Build a campfire before darkness falls.',
  nightNarration: 'Whatever destroyed the village is still out there. Do not stray from the light.',
  morningElder: [
    'You lived through the night. Good.',
    'Other settlements may yet stand. There is a refuge south, past the old bridge.',
    'Take this — the woodcutter’s axe. He won’t be needing it now.',
    'Go to them. Tell them they are not alone.',
  ],
  travelNarration: 'Follow the trail south to the refuge. Beware the corrupted ground.',
  enemyNarration: 'A corrupted creature. Attack, dodge, and survive.',
  crystalNarration: 'It dissolved into black ash, leaving a strange crystal. You have never seen its like.',
  leader: [
    'Stranger… you came from the north? Through all that smoke?',
    'Did anyone else survive?',
  ],
  endingNarration: [
    'Beyond the forest, another column of smoke rises. Then another. Then another.',
    'This is not one village. It is the entire kingdom.',
  ],
  complete: 'CHAPTER ONE COMPLETE',
};

export const SURVIVOR_LINES = [
  'You came back for us… I thought the whole camp was lost.',
  'Thank you. I can still swing a hammer — put me to work.',
  'The Hollow took the others. I’ll follow you, whatever comes.',
  'Greenhaven isn’t dead while people like you still stand.',
];

export const INTRO = {
  world: 'ELDORIA',
  tagline: 'Five kingdoms fell to the Blight. You will rebuild them.',
  lines: [
    'The Blight spread from the Shadow King’s buried prison, corrupting the land through Shadow Rifts.',
    'You awaken among the ruins of your settlement in the woodland kingdom of GREENHAVEN — a few tools, damaged gear, and scattered survivors.',
    'You have no title and no army. You have only a choice: act where others have failed.',
    'First, survive. Then rebuild. Then restore a world.',
  ],
};
