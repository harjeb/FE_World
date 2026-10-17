// 地区声望（docs/20 §4）：永久、独立、不因购买扣除。四档，避免做得太碎。
export interface ReputationTier { at: number; name: string }

export const REPUTATION_TIERS: readonly ReputationTier[] = [
  { at: 0, name: '陌生' },
  { at: 100, name: '熟悉' },
  { at: 250, name: '信任' },
  { at: 500, name: '盟友' },
];

// 重复委托只在声望低于 250 时加声望，封顶 250；500 档必须靠一次性核心任务（docs/20 §4）。
export const REPEAT_REPUTATION_CAP = 250;

export function reputationTier(reputation: number): { index: number; at: number; name: string; next: number | null } {
  let index = 0;
  for (let i = 0; i < REPUTATION_TIERS.length; i++) if (reputation >= REPUTATION_TIERS[i].at) index = i;
  const tier = REPUTATION_TIERS[index];
  return { index, at: tier.at, name: tier.name, next: REPUTATION_TIERS[index + 1]?.at ?? null };
}

export function reputationUnlocked(reputation: number, need: number): boolean {
  return reputation >= need;
}
