import type { BattleState } from '@common/engine/index.ts';

// Arena teams draw from the same character pool, so both sides can field 古斯塔夫. Names that appear on
// both sides get a side prefix wherever the side is not otherwise shown (log lines, scene titles).
export function displayName(state: BattleState, id: string): string {
  const unit = state.units.find(u => u.id === id);
  if (!unit) return id;
  const clash = state.units.some(u => u.side !== unit.side && u.name === unit.name);
  return clash ? `${unit.side === 'player' ? '我方' : '敌方'}${unit.name}` : unit.name;
}

// The victory condition in words, from the battle state (the server's goal text carries unit ids for Agents).
const GOAL_TEXT: Record<BattleState['goal']['kind'], (s: BattleState) => string> = {
  boss: () => '击败敌方主将或全灭',
  rout: () => '全灭敌军',
  seize: () => '主将压制目标点',
  defend: s => `坚守 ${s.turnLimit} 回合`,
  escape: s => `撤离 ${s.goal.kind === 'escape' ? s.goal.need : 1} 人到撤离点`,
  gather: s => `带 ${s.goal.kind === 'gather' ? s.goal.need : 1} 箱物资撤离`,
  escort: () => '护送对象抵达撤离点',
};
export const goalLabel = (state: BattleState): string => GOAL_TEXT[state.goal.kind](state);
