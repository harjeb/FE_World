import { living } from './units.ts';
import type { BattleEvent, BattleState, ScenarioTrigger, UnitState } from './types.ts';

// Shared declarative conditions. Evaluation never mutates the board or consumes randomness.
export function conditionMet(state: BattleState, trigger: ScenarioTrigger, self?: UnitState): boolean {
  if (trigger.kind === 'turn') return state.turn >= trigger.turn;
  if (trigger.kind === 'object') return state.objects?.some(object => object.id === trigger.object && object.state === trigger.state) ?? false;
  if (trigger.kind === 'flag') return state.scenario?.flags.includes(trigger.flag) ?? false;
  if (trigger.kind === 'any') return trigger.conditions.some(condition => conditionMet(state, condition, self));
  if (trigger.kind === 'all') return trigger.conditions.length > 0 && trigger.conditions.every(condition => conditionMet(state, condition, self));
  if (trigger.kind !== 'area') return false;
  const units = trigger.side === 'self' ? self?.alive && !self.escaped ? [self] : [] : living(state, trigger.side).filter(unit => !unit.npc);
  return units.some(unit => unit.pos[0] >= trigger.min[0] && unit.pos[0] <= trigger.max[0]
    && unit.pos[1] >= trigger.min[1] && unit.pos[1] <= trigger.max[1]);
}

export function thiefAwake(state: BattleState, unit: UnitState): boolean {
  if (unit.thiefActive) return true;
  if (unit.thiefTrigger) return conditionMet(state, unit.thiefTrigger, unit);
  return unit.thiefTurn === undefined || state.turn >= unit.thiefTurn;
}

// Commit activation only while resolving real actions, never during AI scoring/forecasting.
export function activateThieves(state: BattleState, events: BattleEvent[]): void {
  if (state.result) return;
  const treasure = state.objects?.some(object => !object.once && object.loot
    && (object.kind === 'chest' && object.state === 'closed' || object.kind === 'village' && object.state === 'idle'));
  for (const unit of living(state, 'enemy')) {
    if (unit.behavior !== 'thief' || unit.thiefActive || unit.carrying || !thiefAwake(state, unit)) continue;
    unit.thiefActive = true;
    if (treasure) events.push({ t: 'scenario', event: `thief-alert:${unit.id}`, message: `${unit.name}盯上了宝物，准备动手抢夺！` });
  }
}
