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
  taunt:
    'They follow you now. Freedom gave them the Blight; you give them order. We are not so different.',
};

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
