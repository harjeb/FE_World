import { SPELLS } from './spells.ts';
import type { Rank } from './types.ts';

// 法术的结构化效果（docs/27 §3、docs/22 §6）；未列出的效果不臆造。
export interface SpellEffects {
  effective?: readonly ('flying' | 'mounted' | 'armored' | 'beast' | 'dragon' | 'demon')[];
  drain?: number;
  onHit?: { statuses?: readonly ('poison' | 'root' | 'silence' | 'confusion')[]; debuff?: { stat: 'spd'; amount: number } };
  ignoreRes?: boolean;
  // 敌方控场：命中后施加的状态。
  status?: 'silence' | 'root';
  // 友方辅助：至下个己方阶段的增益（ward 为受到伤害减少的百分比）。
  buff?: { stat: 'dodge' | 'res' | 'ward'; amount: number };
  // 一次施放只判一次的额外回复。
  bonusHeal?: { chance: number; amount: number };
  // 射程内全部受伤友军各回复一次。
  area?: boolean;
  // 视野加成；没有迷雾的地图不能施放。
  vision?: number;
  // 须先用限量教材学会才能施放。
  manual?: boolean;
}

export interface SpellbookDef {
  id: string; name: string; school: 'black' | 'white' | 'dark'; role: 'attack' | 'heal' | 'support' | 'hostile_support';
  might: number; hit: number; crit: number; weight: number; range: [number, number]; maxCharges: number; effect: string;
  // 施放要求：黑／暗魔法读 理 的权限与熟练度，白魔法读 杖 的。
  rank: Rank; study: 'blackMagic' | 'whiteMagic';
  // 治疗基值（回复 魔 + 基值）；伤害按物防或魔防；固定段数与是否允许速度追击。
  healingBase: number | null; defense: 'def' | 'res'; fixedHits: number; followUp: boolean;
  effects: SpellEffects;
}

const base = (id: string, name: string, school: SpellbookDef['school'], rank: Rank, might: number, hit: number, crit: number, weight: number,
  range: [number, number], maxCharges: number, effect: string, effects: SpellEffects = {}): SpellbookDef => ({
  id, name, school, role: 'attack', might, hit, crit, weight, range, maxCharges, effect, rank,
  study: school === 'white' ? 'whiteMagic' : 'blackMagic', healingBase: null, defense: 'res', fixedHits: 1, followUp: true, effects,
});

const BASE_BOOKS: SpellbookDef[] = [
  base('fire', '火焰', 'black', 'E', 5, 90, 0, 4, [1, 2], 20, '基础火魔法'),
  base('thunder', '雷霆', 'black', 'D', 8, 80, 5, 6, [1, 2], 15, '基础雷魔法'),
  base('wind', '风刃', 'black', 'C', 6, 85, 0, 3, [1, 2], 15, '对飞行特效', { effective: ['flying'] }),
  base('flame_lance', '炎枪', 'black', 'B', 12, 75, 0, 10, [1, 2], 12, '高阶火魔法'),
  base('bolting', '雷暴术', 'black', 'A', 10, 65, 0, 15, [3, 5], 5, '3–5 格远程魔法，不能近距反击'),
  base('light', '光术', 'white', 'E', 4, 95, 0, 3, [1, 2], 20, '基础光魔法；白魔法攻击，独立于治疗杖'),
  base('elfire', '烈火', 'black', 'C', 10, 85, 0, 8, [1, 2], 10, '中阶火魔法'),
  base('meteor', '陨星', 'black', 'A', 14, 70, 0, 12, [3, 5], 5, '3–5 格远程火魔法'),
  base('dark', '暗术书', 'dark', 'D', 9, 70, 0, 9, [1, 2], 15, '基础暗魔法'),
  base('nosferatu', '吸血术书', 'dark', 'C', 6, 70, 0, 10, [1, 2], 10, '命中后按实际扣血的 50% 自疗；石化为 0，不与吸血被动重复', { drain: 0.5 }),
];

export const SPELLBOOKS: readonly SpellbookDef[] = [
  ...BASE_BOOKS,
  ...SPELLS.map(spell => ({
    id: spell.id, name: spell.name, school: spell.school, role: spell.role, might: spell.might ?? 0,
    hit: spell.hit ?? 0, crit: spell.crit ?? 0, weight: spell.weight ?? 0, range: [...spell.range] as [number, number],
    maxCharges: spell.maxCharges, effect: spell.effect, rank: spell.rank, study: spell.requiredStudy,
    healingBase: spell.healingBase, defense: spell.damageDefense === 'def' ? 'def' as const : 'res' as const,
    fixedHits: Math.max(1, spell.fixedHits), followUp: spell.allowSpeedFollowUp, effects: spell.effects,
  })),
];

export const SPELLBOOK_BY_ID = new Map(SPELLBOOKS.map(book => [book.id, book]));
