import type { ClassId } from '../data/classes.ts';
import type { CharacterId } from '../data/characters.ts';
import { CHARACTERS } from '../data/characters.ts';
import { stats } from '../data/types.ts';
import type { Rank, WeaponType } from '../data/types.ts';
import type { ItemId, WeaponId } from '../data/weapons.ts';
import { seedRng } from '../engine/rng.ts';
import type { BattleState, Behavior, Point, UnitState } from '../engine/types.ts';
import { tilesFromGlyphs } from '../maps/map.ts';

// 黑松隘口: the demo field battle used by the battle page. The layout is the pixel-art map
// `pinepass` (design/pixel-art/gen_art.py); a test keeps the two in sync. Unit numbers are demo data.
export const PINEPASS_ROWS = [
  'mmmmmmfffmmmwwmmfffmmmmm',
  'mmmmff.ffmm.ww.mffffmmmm',
  'mmf..ff.f...ww...ff..mmm',
  'mf..fff.....ww..f.....mm',
  'm...ff..f...ww....f....m',
  '...f...ff...ww..f..#####',
  '..f.........ww.....#ppp#',
  'rrrrrrrrrrrrbbrrrrrrppF#',
  '........f...wwf....#ppp#',
  '...ff.......ww.ff..##.##',
  '..fff.v.....ww...f..ff..',
  '..ff........ww..f.f.fff.',
  'm.f.........ss...ff...fm',
  'mmff.f.......ww......fmm',
  'mmmff..m.....ww...mmmmmm',
  'mmmmmmmmm....ww..mmmmmmm',
];

export const PINEPASS_META = {
  region: '西境 · 区域 2 · 第 3 战',
  goal: '击败敌方主将 · 布洛克',
  stars: '12 回合内 · 无人被击败',
};

interface Spec {
  id: string;
  name?: string;
  character?: CharacterId;
  classId: ClassId;
  level: number;
  exp?: number;
  stats: [number, number, number, number, number, number, number, number];
  con: number;
  pos: Point;
  weapons: WeaponId[];
  ranks: Partial<Record<WeaponType, Rank>>;
  items?: [ItemId, number][];
  boss?: boolean;
  behavior?: Behavior;
}

function unit(side: UnitState['side'], spec: Spec): UnitState {
  const character = spec.character ? CHARACTERS[spec.character] : undefined;
  const s = stats(...spec.stats);
  return {
    id: spec.id,
    name: spec.name ?? character?.name ?? spec.id,
    side,
    character: spec.character,
    classId: spec.classId,
    level: spec.level,
    exp: spec.exp ?? 0,
    stats: s,
    con: spec.con,
    hp: s.hp,
    pos: spec.pos,
    weapons: spec.weapons,
    items: (spec.items ?? []).map(([id, uses]) => ({ id, uses })),
    ranks: spec.ranks,
    skill: character?.skill,
    boss: spec.boss,
    behavior: spec.behavior,
    acted: false,
    alive: true,
  };
}

const ALLIES: Spec[] = [
  { id: 'erin', character: 'erin', classId: 'swordsman', level: 9, exp: 80, stats: [25, 10, 1, 13, 14, 8, 6, 4], con: 6, pos: [10, 6], weapons: ['killing_edge', 'steel_sword', 'iron_sword'], ranks: { sword: 'C' }, items: [['vulnerary', 3]] },
  { id: 'gustav', character: 'gustav', classId: 'knight', level: 8, exp: 35, stats: [29, 11, 0, 7, 3, 3, 15, 2], con: 13, pos: [11, 8], weapons: ['steel_lance', 'iron_lance'], ranks: { lance: 'D' } },
  { id: 'noah', character: 'noah', classId: 'cleric', level: 6, exp: 50, stats: [18, 0, 6, 4, 7, 11, 2, 9], con: 5, pos: [8, 7], weapons: ['heal'], ranks: { staff: 'D' } },
  { id: 'owen', character: 'owen', classId: 'archer', level: 7, exp: 20, stats: [22, 8, 0, 10, 8, 5, 5, 2], con: 7, pos: [8, 8], weapons: ['steel_bow', 'iron_bow'], ranks: { bow: 'D' }, items: [['vulnerary', 2]] },
  { id: 'victor', character: 'victor', classId: 'cavalier', level: 8, exp: 10, stats: [30, 11, 0, 10, 9, 5, 11, 4], con: 10, pos: [7, 9], weapons: ['steel_lance', 'armorslayer', 'javelin', 'iron_sword'], ranks: { lance: 'C', sword: 'D' } },
  { id: 'lina', character: 'lina', classId: 'pegasus', level: 7, exp: 60, stats: [21, 7, 2, 10, 14, 11, 4, 9], con: 5, pos: [11, 4], weapons: ['iron_lance', 'javelin'], ranks: { lance: 'D' } },
];

const ENEMIES: Spec[] = [
  { id: 'brock', name: '布洛克', classId: 'knight', level: 10, stats: [34, 13, 0, 7, 3, 4, 13, 3], con: 14, pos: [22, 7], weapons: ['steel_lance', 'javelin'], ranks: { lance: 'C' }, boss: true, behavior: 'hold' },
  { id: 'axe1', name: '灰岩斧兵', classId: 'fighter', level: 8, stats: [30, 11, 0, 5, 6, 2, 5, 0], con: 11, pos: [14, 8], weapons: ['iron_axe'], ranks: { axe: 'D' }, behavior: 'aggressive' },
  { id: 'sword1', name: '灰岩剑士', classId: 'swordsman', level: 8, stats: [24, 9, 0, 10, 12, 4, 5, 2], con: 6, pos: [16, 11], weapons: ['iron_sword'], ranks: { sword: 'D' }, behavior: 'aggressive' },
  { id: 'cav1', name: '灰岩骑兵', classId: 'cavalier', level: 8, stats: [27, 10, 0, 8, 8, 3, 8, 2], con: 10, pos: [18, 9], weapons: ['iron_lance', 'iron_sword'], ranks: { lance: 'D', sword: 'D' }, behavior: 'aggressive' },
  { id: 'archer1', name: '灰岩弓兵', classId: 'archer', level: 7, stats: [22, 8, 0, 8, 7, 3, 4, 1], con: 7, pos: [15, 6], weapons: ['iron_bow'], ranks: { bow: 'D' }, behavior: 'opportunist' },
  { id: 'mage1', name: '灰岩术士', classId: 'mage', level: 7, stats: [19, 0, 8, 6, 7, 3, 2, 6], con: 5, pos: [18, 6], weapons: ['fire'], ranks: { tome: 'D' }, behavior: 'opportunist' },
  { id: 'priest1', name: '灰岩祭司', classId: 'cleric', level: 6, stats: [18, 0, 6, 4, 6, 5, 1, 8], con: 5, pos: [21, 8], weapons: ['heal'], ranks: { staff: 'D' }, behavior: 'healer' },
];

export function createPinepassBattle(seed = 'pinepass-demo'): BattleState {
  const tiles = tilesFromGlyphs(PINEPASS_ROWS);
  return {
    engineVersion: 1,
    id: `pinepass-${seed}`,
    kind: 'field',
    name: '黑松隘口',
    map: { width: tiles[0].length, height: tiles.length, tiles },
    units: [...ALLIES.map(spec => unit('player', spec)), ...ENEMIES.map(spec => unit('enemy', spec))],
    turn: 1,
    turnLimit: 20,
    phase: 'player',
    goal: { kind: 'boss', target: 'brock' },
    rng: seedRng(`${seed}:combat`),
    growthRng: seedRng(`${seed}:growth`),
  };
}
