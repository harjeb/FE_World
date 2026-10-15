import { stats } from './types.ts';
import type { MoveType, Rank, Stats, WeaponType } from './types.ts';

// docs/02-units-classes-growth.md「基础职业」. Promoted classes are added with the promotion page;
// their stat caps are still undecided in 02.
export interface ClassDef {
  name: string;
  tier: 'base' | 'promoted';
  moveType: MoveType;
  move: number;
  // Highest weapon rank the class can reach, per weapon type.
  weapons: Partial<Record<WeaponType, Rank>>;
  growth: Stats;
  caps: Stats;
  maxLevel: number;
}

const BASE_CAPS = stats(40, 20, 20, 20, 20, 20, 20, 20);

const TABLE = {
  swordsman: { name: '剑士', tier: 'base', moveType: 'foot', move: 5, weapons: { sword: 'B' }, growth: stats(10, 5, 0, 15, 15, 5, 0, 5), caps: BASE_CAPS, maxLevel: 20 },
  fighter: { name: '斧兵', tier: 'base', moveType: 'foot', move: 5, weapons: { axe: 'B' }, growth: stats(20, 15, 0, 5, 5, 0, 5, 0), caps: BASE_CAPS, maxLevel: 20 },
  knight: { name: '重甲兵', tier: 'base', moveType: 'armored', move: 4, weapons: { lance: 'B' }, growth: stats(15, 10, 0, 5, -5, 0, 20, 5), caps: BASE_CAPS, maxLevel: 20 },
  cavalier: { name: '骑兵', tier: 'base', moveType: 'mounted', move: 7, weapons: { sword: 'C', lance: 'B' }, growth: stats(10, 10, 0, 10, 5, 0, 10, 5), caps: BASE_CAPS, maxLevel: 20 },
  pegasus: { name: '天马骑士', tier: 'base', moveType: 'flying', move: 7, weapons: { lance: 'B' }, growth: stats(5, 5, 0, 10, 15, 5, 0, 15), caps: BASE_CAPS, maxLevel: 20 },
  archer: { name: '弓兵', tier: 'base', moveType: 'foot', move: 5, weapons: { bow: 'B' }, growth: stats(10, 10, 0, 15, 5, 5, 5, 0), caps: BASE_CAPS, maxLevel: 20 },
  mage: { name: '魔道士', tier: 'base', moveType: 'foot', move: 5, weapons: { tome: 'B' }, growth: stats(5, 0, 15, 10, 5, 5, 0, 10), caps: BASE_CAPS, maxLevel: 20 },
  cleric: { name: '修士', tier: 'base', moveType: 'foot', move: 5, weapons: { staff: 'B' }, growth: stats(5, 0, 10, 5, 5, 10, 0, 15), caps: BASE_CAPS, maxLevel: 20 },
} satisfies Record<string, ClassDef>;
export type ClassId = keyof typeof TABLE;
export const CLASSES: Record<ClassId, ClassDef> = TABLE;

export function classDef(id: ClassId): ClassDef {
  return CLASSES[id];
}
