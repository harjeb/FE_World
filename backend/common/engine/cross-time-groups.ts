import type { BattleEvent, BattleState, CrossTimeGroup, UnitState } from './types.ts';

export function createCrossTimeGroups(roster: readonly { id: string; group: string }[]): CrossTimeGroup[] {
  return (['A', 'B', 'C', 'D'] as const).map((id, index) => ({
    id, name: ['前殿四将', '中厅五谋', '上殿四翼', '吕布本阵'][index],
    unitIds: roster.filter(row => row.group === id).map(row => `cross-time:${row.id}`),
    active: false, ...(index === 0 ? { activateTurn: 2, reason: '固定第2回合' } : { thresholdY: [0, 13, 8, 4][index] }),
  }));
}

export function isCrossTimeDormant(state: BattleState, unit: UnitState): boolean {
  return !!state.crossTimeGroups?.some(group => !group.active && group.unitIds.includes(unit.id));
}

// Called once the entire action (including displacement and result checks) has resolved.
export function scheduleCrossTimeGroups(state: BattleState, events: BattleEvent[], attacked: readonly string[] = []): void {
  if (state.result) return;
  const groups = state.crossTimeGroups ?? [];
  for (const [index, group] of groups.entries()) {
    if (group.id === 'A' || group.active || group.activateTurn !== undefined) continue;
    const previous = groups[index - 1];
    const reason = group.unitIds.some(id => attacked.includes(id)) ? '遭到玩家敌对行动'
      : state.units.some(unit => unit.alive && unit.side === 'player' && group.thresholdY !== undefined && unit.pos[1] <= group.thresholdY) ? '玩家越过警戒线'
      : previous && previous.unitIds.every(id => !state.units.some(unit => unit.id === id && unit.alive)) ? '前组全灭' : undefined;
    if (!reason) continue;
    group.activateTurn = state.turn + (state.phase === 'enemy' ? 1 : 0);
    group.reason = reason;
    events.push({ t: 'cross_time_group', id: group.id, name: group.name, turn: group.activateTurn, active: false, reason });
  }
}

export function activateCrossTimeGroups(state: BattleState, events: BattleEvent[]): void {
  if (state.result) return;
  for (const group of state.crossTimeGroups ?? []) {
    if (group.active || group.activateTurn === undefined || group.activateTurn > state.turn) continue;
    group.active = true;
    events.push({ t: 'cross_time_group', id: group.id, name: group.name, turn: group.activateTurn, active: true, reason: group.reason ?? '警戒' });
  }
}
