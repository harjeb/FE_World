import { RANKS } from '../data/types.ts';
import type { Rank } from '../data/types.ts';
import { WEAPONS } from '../data/weapons.ts';
import type { WeaponId } from '../data/weapons.ts';
import { nextU32, seedRng } from '../engine/rng.ts';
import { BOUND_WEAPONS } from './items.ts';

// 密室随机宝箱：比玩家当前能买到的最高级高一级。唯一／绑定武器不进随机池；
// 高一级已没有非绑定武器（S 及以上全是唯一武器）时，退到不超过目标的最高一档。
export function rankUpPool(base: Rank): { rank: Rank; items: WeaponId[] } {
  const target = Math.min(RANKS.indexOf(base) + 1, RANKS.length - 1);
  for (let index = target; index >= 0; index--) {
    const rank = RANKS[index];
    const items = (Object.keys(WEAPONS) as WeaponId[]).filter(id => WEAPONS[id].rank === rank && !BOUND_WEAPONS.has(id));
    if (items.length > 0) return { rank, items };
  }
  return { rank: 'E', items: [] };
}

// 同一场战斗里的几个随机箱互不重复（池不够时才允许重复）；用独立种子，不推进战斗随机数。
export function rollRankUpLoot(base: Rank, seed: string, count: number): WeaponId[] {
  const { items } = rankUpPool(base);
  const rng = seedRng(`rank-up-loot:${seed}`);
  const left = [...items];
  const picked: WeaponId[] = [];
  for (let i = 0; i < count && items.length > 0; i++) {
    const from = left.length > 0 ? left : items;
    const index = nextU32(rng) % from.length;
    picked.push(from[index]);
    if (from === left) left.splice(index, 1);
  }
  return picked;
}
