import { annualIndexFor, annualWindowOpen } from './annual.ts';
import { nextU32, seedRng } from '../engine/rng.ts';

// 庆典（大竞技场窗口，每年最后 18 日）期间，王都每月商店整店打折（docs/38 §1）：
// 每件商品各自在 50%～65% 里随机一个折扣（折扣，实付为原价的 35%～50%）。
// 种子按账号和届次固定，整个庆典不变，刷新或重复读取不会重抽；只作用于买入价。
export const FESTIVAL_DISCOUNT_MIN = 50;
export const FESTIVAL_DISCOUNT_MAX = 65;

// 当前庆典届次；窗口之外为 null。
export function festivalIndex(day: number): number | null {
  return annualWindowOpen(day) ? annualIndexFor(day) : null;
}

// 折扣百分比（50～65）；不在庆典期间为 0。
export function festivalDiscount(playerId: string, day: number, item: string): number {
  const index = festivalIndex(day);
  if (index === null) return 0;
  const span = FESTIVAL_DISCOUNT_MAX - FESTIVAL_DISCOUNT_MIN + 1;
  return FESTIVAL_DISCOUNT_MIN + nextU32(seedRng(`festival-discount:${playerId}:${index}:${item}`)) % span;
}

// 折后单价，至少 1 金币。
export function festivalPrice(price: number, discount: number): number {
  return discount > 0 ? Math.max(1, Math.round(price * (100 - discount) / 100)) : price;
}
