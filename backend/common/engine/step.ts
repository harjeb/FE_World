import { ITEMS } from '../data/weapons.ts';
import { decide } from './ai.ts';
import { moveRange, pathTo, travelCosts } from './movement.ts';
import { canEscape, canSeize } from './ranges.ts';
import { runCombat, runHeal, terrainHeal, useItem } from './resolve.ts';
import { attackWeapons, cellKey, inBounds, inRange, keyPoint, living, samePoint, staffWeapons, unitById } from './units.ts';
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
      if (target.petrified) throw new EngineError('NOTHING_TO_HEAL', `${target.name} 石化庇护中，不能治疗`);
      if (!staffWeapons(unit).includes(action.weapon)) throw new EngineError('WEAPON_RANK_TOO_LOW', `${unit.name} 不能使用这根杖`);
      if (!inRange(unit, action.weapon, action.to, target.pos)) throw new EngineError('TARGET_OUT_OF_RANGE', '目标不在杖的射程内');
      if (target.hp >= target.stats.hp) throw new EngineError('NOTHING_TO_HEAL', `${target.name} 没有受伤`);
      return target;
    }
    case 'seize': {
      if (!canSeize(state, unit, action.to)) throw new EngineError('CANNOT_SEIZE', '只有主将站在王座上才能压制');
      return null;
    }
    case 'escape': {
      if (!canEscape(state, unit, action.to)) throw new EngineError('UNREACHABLE', '只有站在撤离点上的单位才能撤离');
      return null;
    }
    case 'item': {
      const stack = unit.items[action.item];
      if (!stack || !(stack.id in ITEMS) || (ITEMS[stack.id] as { shield?: boolean }).shield) throw new EngineError('NO_SUCH_ITEM', '没有这件道具');
      if (unit.hp >= unit.stats.hp) throw new EngineError('NOTHING_TO_HEAL', `${unit.name} 没有受伤`);
      return null;
    }
  }
}

// Move and action are one atomic command: everything is validated before anything changes.
function applyAct(state: BattleState, action: ActAction, events: BattleEvent[]): void {
  const unit = unitById(state, action.unit);
  if (!unit.alive) throw new EngineError('UNKNOWN_UNIT', `${unit.name} 已退出战斗`);
  if (unit.npc) throw new EngineError('UNIT_ALREADY_ACTED', `${unit.name} 由系统控制，不能手动操作`);
  if (unit.petrified) throw new EngineError('UNIT_ALREADY_ACTED', `${unit.name} 石化庇护中，无法行动`);
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
  // 抢物资：站上物资箱即自动拾取（docs/20 §2）。
  if (state.boxes?.some(b => samePoint(b, unit.pos))) {
    const here = state.boxes.filter(b => samePoint(b, unit.pos)).length;
    state.boxes = state.boxes.filter(b => !samePoint(b, unit.pos));
    unit.carried = (unit.carried ?? 0) + here;
    events.push({ t: 'loot', unit: unit.id, boxes: unit.carried });
  }
  if (action.act === 'attack' && target) {
    // Attacking equips the weapon, so it is also the one used to counter later.
    unit.weapons = [action.weapon, ...unit.weapons.filter(w => w !== action.weapon)];
    runCombat(state, unit, target, action.weapon, events);
  } else if (action.act === 'heal' && target) {
    runHeal(state, unit, target, action.weapon, events);
  } else if (action.act === 'item') {
    useItem(unit, action.item, events);
  } else if (action.act === 'seize') {
    events.push({ t: 'seize', unit: unit.id });
    unit.acted = true;
    finish(state, events, 'player', '压制王座');
    return;
  } else if (action.act === 'escape') {
    events.push({ t: 'escape', unit: unit.id });
    unit.acted = true;
    unit.alive = false;
    unit.escaped = true;
    checkResult(state, events);
    return;
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

function escapedUnits(state: BattleState): number {
  return state.units.filter(u => u.side === 'player' && u.escaped).length;
}
function escapedBoxes(state: BattleState): number {
  return state.units.filter(u => u.side === 'player' && u.escaped).reduce((sum, u) => sum + (u.carried ?? 0), 0);
}

function checkResult(state: BattleState, events: BattleEvent[]): void {
  if (state.result) return;
  const goal = state.goal;
  if (goal.kind === 'boss' && !unitById(state, goal.target).alive) { finish(state, events, 'player', '击败敌方主将'); return; }
  if (goal.kind === 'escape' && escapedUnits(state) >= goal.need) { finish(state, events, 'player', '成功撤离'); return; }
  if (goal.kind === 'gather' && escapedBoxes(state) >= goal.need) { finish(state, events, 'player', '带回物资'); return; }
  if (goal.kind === 'escort' && unitById(state, goal.npc).escaped) { finish(state, events, 'player', '护送成功'); return; }
  const seize = goal.kind === 'seize';
  // On a seize map only seizing wins, even after every defender has fallen.
  if (!seize && living(state, 'enemy').length === 0) { finish(state, events, 'player', '全歼敌军'); return; }
  if (goal.kind === 'escort' && !unitById(state, goal.npc).alive) { finish(state, events, 'enemy', '护卫对象阵亡'); return; }
  if (living(state, 'player').length === 0) { finish(state, events, 'enemy', '我方全部退出战斗'); return; }
  // Only the commander can seize, so losing it ends the attack.
  if (seize && !living(state, 'player').some(u => u.boss)) finish(state, events, 'enemy', '我方主将被击败，无法压制王座');
}

// 护卫对象每个己方阶段自动向撤离点前进，到达即撤离（docs/20 §2）。
function advanceNpcs(state: BattleState, events: BattleEvent[]): void {
  const goal = state.goal;
  const exits = goal.kind === 'escort' ? goal.exits : null;
  if (!exits || exits.length === 0) return;
  for (const npc of state.units.filter(u => u.npc && u.alive && u.side === 'player')) {
    const range = moveRange(state, npc);
    const cost = travelCosts(state, npc, exits);
    let best = range.origin, bestCost = Infinity;
    for (const stop of range.stops) {
      const c = cost.get(stop) ?? Infinity;
      if (c < bestCost) { bestCost = c; best = stop; }
    }
    const to = keyPoint(state, best);
    if (cellKey(state, to) !== range.origin) {
      events.push({ t: 'move', unit: npc.id, path: pathTo(state, range, to) });
      npc.pos = to;
    }
    if (exits.some(e => samePoint(e, npc.pos))) {
      events.push({ t: 'escape', unit: npc.id });
      npc.alive = false;
      npc.escaped = true;
    }
    npc.acted = true;
  }
  checkResult(state, events);
}

function startPhase(state: BattleState, side: Side, events: BattleEvent[]): void {
  state.phase = side;
  // 石化庇护到下一个己方阶段解除（docs/13 §4.2）。
  if (side === 'player') for (const unit of living(state, 'player')) unit.petrified = false;
  for (const unit of living(state, side)) unit.acted = false;
  // 护卫 NPC 在玩家能行动之前先走一步（它自己把 acted 置回 true）。
  if (side === 'player') advanceNpcs(state, events);
  if (state.result) return;
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
    // 石化中的单位不能行动（docs/00 §7.2）。
    if (enemy.petrified) { enemy.acted = true; continue; }
    applyAct(state, decide(state, enemy), events);
  }
  if (state.result) return;
  if (state.turn >= state.turnLimit) {
    // 坚守图撑到回合上限即胜（docs/20）；其余图超过回合上限算失败。
    if (state.goal.kind === 'defend') finish(state, events, 'player', `坚守 ${state.turnLimit} 回合`);
    else finish(state, events, 'enemy', `${state.turnLimit} 回合内未达成胜利条件`);
    return;
  }
  state.turn += 1;
  startPhase(state, 'player', events);
}
