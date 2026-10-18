import { SPELLS } from './spells.ts';

export interface SpellbookDef {
  id: string; name: string; school: string; role: string; might: number; hit: number; crit: number;
  weight: number; range: [number, number]; maxCharges: number; effect: string;
}

const BASE_BOOKS: SpellbookDef[] = [
  { id: 'fire', name: '火焰', school: 'black', role: 'attack', might: 5, hit: 90, crit: 0, weight: 4, range: [1, 2], maxCharges: 20, effect: '基础火魔法' },
  { id: 'thunder', name: '雷霆', school: 'black', role: 'attack', might: 8, hit: 80, crit: 5, weight: 6, range: [1, 2], maxCharges: 20, effect: '基础雷魔法' },
  { id: 'wind', name: '风刃', school: 'black', role: 'attack', might: 6, hit: 85, crit: 0, weight: 3, range: [1, 2], maxCharges: 20, effect: '对飞行特效' },
  { id: 'flame_lance', name: '炎枪', school: 'black', role: 'attack', might: 12, hit: 75, crit: 0, weight: 10, range: [1, 2], maxCharges: 12, effect: '高阶火魔法' },
  { id: 'bolting', name: '雷暴术', school: 'black', role: 'attack', might: 10, hit: 65, crit: 0, weight: 15, range: [3, 5], maxCharges: 5, effect: '远程魔法' },
  { id: 'light', name: '光术', school: 'white', role: 'attack', might: 4, hit: 95, crit: 0, weight: 3, range: [1, 2], maxCharges: 20, effect: '基础光魔法' },
  { id: 'elfire', name: '烈火', school: 'black', role: 'attack', might: 10, hit: 85, crit: 0, weight: 8, range: [1, 2], maxCharges: 10, effect: '中阶火魔法' },
  { id: 'meteor', name: '陨星', school: 'black', role: 'attack', might: 14, hit: 70, crit: 0, weight: 12, range: [3, 5], maxCharges: 5, effect: '远程火魔法' },
];

export const SPELLBOOKS: readonly SpellbookDef[] = [
  ...BASE_BOOKS,
  ...SPELLS.map(spell => ({
    id: spell.id, name: spell.name, school: spell.school, role: spell.role, might: spell.might ?? 0,
    hit: spell.hit ?? 0, crit: spell.crit ?? 0, weight: spell.weight ?? 0, range: [...spell.range] as [number, number],
    maxCharges: spell.maxCharges, effect: spell.effect,
  })),
];

export const SPELLBOOK_BY_ID = new Map(SPELLBOOKS.map(book => [book.id, book]));
