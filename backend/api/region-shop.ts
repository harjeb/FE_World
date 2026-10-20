import type { Player } from './store.ts';
import { DAYS_PER_SEASON } from '../common/game/calendar.ts';
import type { ItemKey } from '../common/game/items.ts';
import { regionStock } from '../common/game/quest-shop.ts';
import type { RegionStockRow } from '../common/game/quest-shop.ts';

// 地区声望商店的本季上架与限购（docs/38 §3.6）：每季换一批（账号＋季度做种子），每件本季限购；
// 已购数量记在 flags.regionShopBought（键为 地区:物品），换季自动清零。
export const shopSeason = (day: number): number => Math.floor(day / DAYS_PER_SEASON);
export const nextRefreshDay = (day: number): number => (shopSeason(day) + 1) * DAYS_PER_SEASON;

export function boughtThisSeason(player: Player): Record<string, number> {
  const season = shopSeason(player.day);
  if (player.flags.regionShopSeason !== season) {
    player.flags.regionShopSeason = season;
    player.flags.regionShopBought = {};
  }
  return player.flags.regionShopBought ?? (player.flags.regionShopBought = {});
}

export type RegionShopRow = RegionStockRow & { bought: number; remaining: number };

export function regionShopView(player: Player, region: number, reputation: number): RegionShopRow[] {
  const bought = boughtThisSeason(player);
  return regionStock(region, reputation, `${player.id}:${shopSeason(player.day)}`).map(row => {
    const count = bought[`${region}:${row.item}`] ?? 0;
    return { ...row, bought: count, remaining: Math.max(0, row.limit - count) };
  });
}

export function stockRow(player: Player, region: number, reputation: number, item: string): RegionShopRow | undefined {
  return regionShopView(player, region, reputation).find(row => row.item === (item as ItemKey));
}
