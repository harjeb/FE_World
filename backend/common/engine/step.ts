import { ITEMS } from '../data/weapons.ts';
import { decide } from './ai.ts';
import { moveRange, pathTo } from './movement.ts';
import { runCombat, runHeal, terrainHeal, useItem } from './resolve.ts';
import { attackWeapons, cellKey, inBounds, inRange, living, staffWeapons, unitById } from './units.ts';
import { EngineError } from './types.ts';
import type { ActAction, Action, BattleEvent, BattleState, Side, UnitState } from './types.ts';

// The single entry point that changes a battle: step(state, action) → { state, events } (docs/07).
// It never mutates its input, reads no clock and draws randomness only from the state's RNG.
export function step(prev: BattleState, action: Action): { state: BattleState; events: BattleEvent[] } {
  if (prev.result) throw new EngineError('BATTLE_OVER', '战斗已经结束');
  const state = structuredClone(prev);
  const events: BattleEvent[] = [];
  if (action.type !== 'act') {
    if (state.phase !== 'player') throw new EngineError('NOT_YOUR_PHASE', '当前不是己方阶段');
    if (action.type === 'retreat') finish(state, events, 'enemy', '全军撤退');
    else if (action.type === 'surrender') finish(state, events, 'enemy', '投降');
    else endPlayerPhase(state, events);
  } else {
    if (unitById(state, action.unit).side !== state.phase) throw new EngineError('NOT_YOUR_PHASE', '当前不是该单位的阶段');
    applyAct(state, action, events);
  }
  return { state, events };
}

function validate(state: BattleState, unit: UnitState, action: ActAction): UnitState | null {
  const foeOrAlly = (id: string) => {
    const target = unitById(state, id);
    if (!target.alive) throw new EngineError('TARGET_OUT_OF_RANGE', `${target.name} 已退出战斗`);
    return target;
  };
  switch (action.act) {
    case 'wait':
      return null;
    case 'attack': {
      const target = foeOrAlly(action.target);
      if (target.side === unit.side) throw new EngineError('TARGET_OUT_OF_RANGE', '不能攻击友军');
      if (!attackWeapons(unit).includes(action.weapon)) throw new EngineError('WEAPON_RANK_TOO_LOW', `${unit.name} 不能使用这把武器`);
      if (!inRange(unit, action.weapon, action.to, target.pos)) throw new EngineError('TARGET_OUT_OF_RANGE', '目标不在射程内');
      return target;
    }
    case 'heal': {
      const target = foeOrAlly(action.target);
      if (target.side !== unit.side || target.id === unit.id) throw new EngineError('TARGET_OUT_OF_RANGE', '只能治疗其他友军');
      if (!staffWeapons(unit).includes(action.weapon)) throw new EngineError('WEAPON_RANK_TOO_LOW', `${unit.name} 不能使用这根杖`);
      if (!inRange(unit, action.weapon, action.to, target.pos)) throw new EngineError('TARGET_OUT_OF_RANGE', '目标不在杖的射程内');
      if (target.hp >= target.stats.hp) throw new EngineError('NOTHING_TO_HEAL', `${target.name} 没有受伤`);
      return target;
    }
    case 'item': {
      const stack = unit.items[action.item];
      if (!stack || !(stack.id in ITEMS)) throw new EngineError('NO_SUCH_ITEM', '没有这件道具');
      if (unit.hp >= unit.stats.hp) throw new EngineError('NOTHING_TO_HEAL', `${unit.name} 没有受伤`);
      return null;
    }
  }
}

// Move and action are one atomic command: everything is validated before anything changes.
function applyAct(state: BattleState, action: ActAction, events: BattleEvent[]): void {
  const unit = unitById(state, action.unit);
  if (!unit.alive) throw new EngineError('UNKNOWN_UNIT', `${unit.name} 已退出战斗`);
  if (unit.acted) throw new EngineError('UNIT_ALREADY_ACTED', `${unit.name} 本阶段已经行动`);
  const range = moveRange(state, unit);
  if (!inBounds(state, action.to) || !range.stops.has(cellKey(state, action.to))) {
    throw new EngineError('UNREACHABLE', '目标格不可达');
  }
  const target = validate(state, unit, action);
  if (cellKey(state, action.to) !== range.origin) {
    events.push({ t: 'move', unit: unit.id, path: pathTo(state, range, action.to) });
    unit.pos = [action.to[0], action.to[1]];
    unit.movedTurn = state.turn;
  }
  if (action.act === 'attack' && target) {
    // Attacking equips the weapon, so it is also the one used to counter later.
    unit.weapons = [action.weapon, ...unit.weapons.filter(w => w !== action.weapon)];
    runCombat(state, unit, target, action.weapon, events);
  } else if (action.act === 'heal' && target) {
    runHeal(state, unit, target, action.weapon, events);
  } else if (action.act === 'item') {
    useItem(unit, action.item, events);
  } else {
    events.push({ t: 'wait', unit: unit.id });
  }
  unit.acted = true;
  checkResult(state, events);
}

function finish(state: BattleState, events: BattleEvent[], winner: Side, reason: string): void {
  state.result = { winner, reason };
  events.push({ t: 'end', winner, reason });
}

function checkResult(state: BattleState, events: BattleEvent[]): void {
  if (state.result) return;
  if (state.goal.kind === 'boss' && !unitById(state, state.goal.target).alive) finish(state, events, 'player', '击败敌方主将');
  else if (living(state, 'enemy').length === 0) finish(state, events, 'player', '全歼敌军');
  else if (living(state, 'player').length === 0) finish(state, events, 'enemy', '我方全部退出战斗');
}

function startPhase(state: BattleState, side: Side, events: BattleEvent[]): void {
  state.phase = side;
  for (const unit of living(state, side)) unit.acted = false;
  events.push({ t: 'phase', side, turn: state.turn });
  terrainHeal(state, side, events);
}

// Remaining player units wait, the rule AI plays the enemy phase, then the next turn starts.
function endPlayerPhase(state: BattleState, events: BattleEvent[]): void {
  for (const unit of living(state, 'player')) unit.acted = true;
  startPhase(state, 'enemy', events);
  for (const enemy of living(state, 'enemy')) {
    if (state.result) return;
    if (!enemy.alive) continue;
    applyAct(state, decide(state, enemy), events);
  }
  if (state.result) return;
  if (state.turn >= state.turnLimit) {
    finish(state, events, 'enemy', `${state.turnLimit} 回合内未达成胜利条件`);
    return;
  }
  state.turn += 1;
  startPhase(state, 'player', events);
}
