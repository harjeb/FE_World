// 地区声望（docs/20 §4）：永久、独立、不因购买扣除。四档，避免做得太碎。
export interface ReputationTier { at: number; name: string }

export const REPUTATION_TIERS: readonly ReputationTier[] = [
  { at: 0, name: '陌生' },
  { at: 100, name: '熟悉' },
  { at: 250, name: '信任' },
  { at: 500, name: '盟友' },
];

// 声望永久保存；全部来源均为一次性地区任务，不提供重复委托。

export function reputationTier(reputation: number): { index: number; at: number; name: string; next: number | null } {
  let index = 0;
  for (let i = 0; i < REPUTATION_TIERS.length; i++) if (reputation >= REPUTATION_TIERS[i].at) index = i;
  const tier = REPUTATION_TIERS[index];
  return { index, at: tier.at, name: tier.name, next: REPUTATION_TIERS[index + 1]?.at ?? null };
}

export function reputationUnlocked(reputation: number, need: number): boolean {
  return reputation >= need;
}
