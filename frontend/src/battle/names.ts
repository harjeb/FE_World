import type { BattleState } from '@common/engine/index.ts';

// Arena teams draw from the same character pool, so both sides can field 古斯塔夫. Names that appear on
// both sides get a side prefix wherever the side is not otherwise shown (log lines, scene titles).
export function displayName(state: BattleState, id: string): string {
  const unit = state.units.find(u => u.id === id);
  if (!unit) return id;
  const clash = state.units.some(u => u.side !== unit.side && u.name === unit.name);
  return clash ? `${unit.side === 'player' ? '我方' : '敌方'}${unit.name}` : unit.name;
}
