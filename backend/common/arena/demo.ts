import { CHARACTERS } from '../data/characters.ts';
import type { CharacterId } from '../data/characters.ts';
import { CLASSES } from '../data/classes.ts';
import { STAT_KEYS } from '../data/types.ts';
import type { Rank, Stats, WeaponType } from '../data/types.ts';
import type { ItemId, WeaponId } from '../data/weapons.ts';
import type { Behavior, Point } from '../engine/types.ts';
import type { Defense, DefenseSlot, SnapshotUnit } from './rules.ts';

// Demo arena day for the frontend prototype: my month-end snapshot and three opponents' defenses.
// The character pool is shared by all players (docs/02), so opponents field the same eight sample
// characters with their own builds. Stats are expected values for the level, not real rolls.

interface Kit { weapons: WeaponId[]; ranks: Partial<Record<WeaponType, Rank>>; items?: [ItemId, number][] }

const KITS: Record<CharacterId, Kit> = {
  erin: { weapons: ['killing_edge', 'steel_sword'], ranks: { sword: 'C' }, items: [['vulnerary', 2]] },
  karl: { weapons: ['steel_axe', 'hand_axe'], ranks: { axe: 'C' } },
  victor: { weapons: ['steel_lance', 'armorslayer', 'steel_sword'], ranks: { lance: 'C', sword: 'D' } },
  lina: { weapons: ['killer_lance', 'javelin'], ranks: { lance: 'C' } },
  owen: { weapons: ['steel_bow', 'killer_bow'], ranks: { bow: 'C' }, items: [['vulnerary', 1]] },
  sera: { weapons: ['thunder', 'wind'], ranks: { tome: 'C' } },
  noah: { weapons: ['heal', 'recover'], ranks: { staff: 'C' } },
  gustav: { weapons: ['steel_lance', 'javelin'], ranks: { lance: 'C' } },
  ren: { weapons: ['steel_sword', 'iron_sword'], ranks: { sword: 'C' } },
  ig: { weapons: ['steel_axe', 'hand_axe'], ranks: { axe: 'C' } },
  mira: { weapons: ['heal', 'recover'], ranks: { staff: 'C' } },
  roland: { weapons: ['steel_lance', 'javelin'], ranks: { lance: 'C' } },
};

// Base stats plus growth × levels gained, rounded down and capped by the class.
export function expectedUnit(character: CharacterId, level: number, kit: Kit = KITS[character]): SnapshotUnit {
  const def = CHARACTERS[character], cls = CLASSES[def.classId];
  const stats = {} as Stats;
  for (const key of STAT_KEYS) {
    const rate = Math.max(0, def.growth[key] + cls.growth[key]);
    stats[key] = Math.min(cls.caps[key], def.base[key] + Math.floor(rate * (level - def.level) / 100));
  }
  return {
    character, classId: def.classId, level, stats, con: def.con,
    weapons: [...kit.weapons], ranks: { ...kit.ranks }, items: (kit.items ?? []).map(([id, uses]) => ({ id, uses })),
  };
}

export const MY_LEGION = '灰鸦军团';
export const MY_POINTS = 1317;

export const MY_ROSTER: SnapshotUnit[] = [
  expectedUnit('erin', 11), expectedUnit('victor', 11), expectedUnit('gustav', 10), expectedUnit('lina', 10),
  expectedUnit('owen', 10), expectedUnit('noah', 9), expectedUnit('karl', 9), expectedUnit('sera', 9),
  expectedUnit('ren', 9), expectedUnit('roland', 9), expectedUnit('ig', 8), expectedUnit('mira', 8),
];

const slot = (character: CharacterId, level: number, pos: Point, behavior: Behavior): DefenseSlot => ({
  unit: expectedUnit(character, level), pos, behavior,
});

export const OPPONENTS: Defense[] = [
  {
    id: 'frost', legion: '霜狼骑团', points: 1302, record: '本季防守 9 胜 4 负', map: 'plains',
    slots: [
      slot('victor', 13, [13, 4], 'hold'),
      slot('gustav', 12, [12, 4], 'guard'),
      slot('owen', 12, [13, 3], 'opportunist'),
      slot('lina', 12, [12, 6], 'aggressive'),
      slot('erin', 12, [11, 5], 'aggressive'),
      slot('noah', 11, [14, 4], 'healer'),
      slot('karl', 12, [11, 3], 'guard'),
      slot('sera', 11, [13, 5], 'opportunist'),
    ],
    commanders: ['victor', 'gustav', 'karl'],
    bans: ['victor'],
  },
  {
    id: 'maple', legion: '赤枫商会', points: 1288, record: '本季防守 7 胜 6 负', map: 'pass',
    slots: [
      slot('gustav', 13, [13, 5], 'hold'),
      slot('karl', 12, [11, 4], 'guard'),
      slot('owen', 12, [13, 3], 'opportunist'),
      slot('sera', 12, [14, 6], 'opportunist'),
      slot('noah', 11, [15, 5], 'healer'),
      slot('erin', 12, [11, 6], 'aggressive'),
    ],
    commanders: ['gustav', 'karl'],
    bans: ['lina'],
  },
  {
    id: 'white', legion: '白塔学士团', points: 1265, record: '本季防守 10 胜 2 负', map: 'castle',
    slots: [
      slot('sera', 11, [18, 7], 'hold'),
      slot('gustav', 11, [13, 7], 'hold'),
      slot('erin', 11, [14, 6], 'guard'),
      slot('owen', 11, [16, 6], 'opportunist'),
      slot('noah', 10, [17, 8], 'healer'),
      slot('lina', 10, [15, 3], 'opportunist'),
      slot('ig', 10, [15, 11], 'opportunist'),
      slot('roland', 10, [16, 8], 'guard'),
      slot('karl', 10, [13, 3], 'hold'),
      slot('ren', 10, [13, 11], 'opportunist'),
      slot('mira', 9, [17, 6], 'healer'),
    ],
    commanders: ['sera', 'gustav', 'erin'],
    bans: ['victor', 'lina'],
  },
];

// 陪练: rosters the rule AI attacks with when the player tests a defense (docs/05「练习」).
export const SPARRING = OPPONENTS.map(o => ({ legion: o.legion, roster: o.slots.map(s => s.unit) }));

// My defense in the locked month-6 snapshot: used today, and the starting draft for the next one.
export const MY_DEFENSE: Defense = {
  id: 'mine', legion: MY_LEGION, points: MY_POINTS, record: '本季防守 8 胜 5 负', map: 'pass',
  slots: [
    slot('victor', 11, [14, 4], 'hold'),
    slot('gustav', 10, [13, 5], 'guard'),
    slot('owen', 10, [13, 3], 'opportunist'),
    slot('sera', 9, [14, 6], 'opportunist'),
    slot('noah', 9, [15, 5], 'healer'),
    slot('erin', 11, [11, 6], 'aggressive'),
  ],
  commanders: ['victor', 'gustav'],
  bans: ['lina'],
};
