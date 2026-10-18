import { ITEMS, WEAPONS } from '../data/weapons.ts';
import type { WeaponId } from '../data/weapons.ts';
import { WEAPON_ART_BY_ID } from '../data/weapon-arts.ts';
import { ART_MECHANICS } from '../data/art-mechanics.ts';
import { SPELLBOOK_BY_ID } from '../data/spellbooks.ts';
import { decide } from './ai.ts';
import { moveRange, pathTo, travelCosts } from './movement.ts';
import { canEscape, canFinishGather, canSeize } from './ranges.ts';
import { runCombat, runHeal, terrainHeal, useItem } from './resolve.ts';
import { artCombatOptions } from './combat.ts';
import { afterClassicArt, artStats, expireArtPhase } from './art-effects.ts';
import { artObjects, artPostMoves, artSupportOptions, objectArtDamage, sameArtSupport } from './art-options.ts';
import { roll100 } from './rng.ts';
import { afterArt, artState, beginArtAction, clearArtEffects, displace, endArtAction, validateArt } from './arts.ts';
import { attackWeapons, cellKey, cureStatuses, distance, equipWeapon, hasCurableStatus, inBounds, inRange, isAsleep, isBerserk, isSilenced, keyPoint, living, samePoint, staffWeapons, tickStatuses, unitById } from './units.ts';
import { adjacentFree, destinationValid, isHostileSpell, spellDestination, SPECIAL_SUPPORT_SPELLS, staffDestination, withSpellWeapon } from './support.ts';
import type { DestinationRule } from './support.ts';
import { EngineError } from './types.ts';
import { damageObject, interactionOptions, interactObject, runScenarioEvents } from './scenario.ts';
import type { ActAction, Action, BattleEvent, BattleState, Point, Side, UnitState } from './types.ts';

// The single entry point that changes a battle: step(state, action) → { state, events } (docs/07).
// It never mutates its input, reads no clock and draws randomness only from the state's RNG.
export function step(prev: BattleState, action: Action): { state: BattleState; events: BattleEvent[] } {
  if (prev.result) throw new EngineError('BATTLE_OVER', '战斗已经结束');
  const state = structuredClone(prev);
  const events: BattleEvent[] = [];
  if (action.type !== 'act') {
    if (state.phase !== 'player') throw new EngineError('NOT_YOUR_PHASE', '当前不是己方阶段');
    if (action.type === 'retreat') {
      const gathered = canFinishGather(state);
      finish(state, events, gathered ? 'player' : 'enemy', gathered ? '带回物资' : '全军撤退');
    }
    else if (action.type === 'surrender') finish(state, events, 'enemy', '投降');
    else endPlayerPhase(state, events);
  } else {
    if (unitById(state, action.unit).side !== state.phase) throw new EngineError('NOT_YOUR_PHASE', '当前不是该单位的阶段');
    applyAct(state, action, events);
  }
  return { state, events };
}

function validate(state: BattleState, unit: UnitState, action: ActAction, auto: boolean): UnitState | null {
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
      if (target.side === unit.side && !(isBerserk(unit) && (auto || unit.side === 'enemy'))) throw new EngineError('TARGET_OUT_OF_RANGE', '不能攻击友军');
      if (!attackWeapons(unit).includes(action.weapon)) throw new EngineError('WEAPON_RANK_TOO_LOW', `${unit.name} 不能使用这把武器`);
      if (!inRange(unit, action.weapon, action.to, target.pos)) throw new EngineError('TARGET_OUT_OF_RANGE', '目标不在射程内');
      return target;
    }
    case 'heal': {
      const target = foeOrAlly(action.target);
      if (target.side !== unit.side || target.id === unit.id) throw new EngineError('TARGET_OUT_OF_RANGE', '只能治疗其他友军');
      if (target.petrified || target.immunities?.includes('healing')) throw new EngineError('NOTHING_TO_HEAL', `${target.name} 当前不能治疗`);
      if (!staffWeapons(unit).includes(action.weapon)) throw new EngineError('WEAPON_RANK_TOO_LOW', `${unit.name} 不能使用这根杖`);
      if (!inRange(unit, action.weapon, action.to, target.pos)) throw new EngineError('TARGET_OUT_OF_RANGE', '目标不在杖的射程内');
      if (target.hp >= target.stats.hp && !(WEAPONS[action.weapon].cure && hasCurableStatus(target))) throw new EngineError('NOTHING_TO_HEAL', `${target.name} 没有受伤或异常`);
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
    case 'interact': {
      const options = interactionOptions(state, unit, action.to);
      if (!options.some(option => option.object === action.target)) throw new EngineError('TARGET_OUT_OF_RANGE', '物件不在相邻格或已经使用');
      return null;
    }
    case 'art': {
      const art = WEAPON_ART_BY_ID.get(action.art);
      if (!art) throw new EngineError('FORBIDDEN', '没有这个战技');
      validateArt(state, unit, action, art);
      return artObjects(state, action.to, art).includes(action.target) ? null : foeOrAlly(action.target);
    }
    case 'staff': {
      const target = foeOrAlly(action.target);
      if (!staffWeapons(unit).includes(action.weapon)) throw new EngineError('WEAPON_RANK_TOO_LOW', `${unit.name} 不能使用这根杖`);
      if (!inRange(unit, action.weapon, action.to, target.pos)) throw new EngineError('TARGET_OUT_OF_RANGE', '目标不在杖的射程内');
      const hostile = action.weapon === 'sleep_staff' || action.weapon === 'silence_staff';
      if (hostile ? target.side === unit.side : target.side !== unit.side || target.id === unit.id) throw new EngineError('TARGET_OUT_OF_RANGE', hostile ? '状态杖目标必须是敌军' : '只能对友军使用这根杖');
      if (action.weapon === 'restore' && !hasCurableStatus(target)) throw new EngineError('NOTHING_TO_HEAL', `${target.name} 没有可解除的异常`);
      if (!hostile && action.weapon !== 'restore' && action.weapon !== 'warp_staff' && action.weapon !== 'rescue_staff' && (target.petrified || target.hp >= target.stats.hp)) throw new EngineError('NOTHING_TO_HEAL', `${target.name} 不能接受这根杖`);
      const rule = staffDestination(action.weapon);
      if (rule && !destinationOk(state, unit, action, rule)) throw new EngineError('UNREACHABLE', '传送落点不合法');
      return target;
    }
    case 'cast': {
      const target = foeOrAlly(action.target);
      const book = SPELLBOOK_BY_ID.get(action.spell);
      const instance = unit.spellbooks?.find(row => row.id === action.spell);
      if (!book || !instance || instance.charges <= 0) throw new EngineError('NO_SUCH_ITEM', '没有可施放的法术书次数');
      if (isSilenced(unit)) throw new EngineError('FORBIDDEN', `${unit.name} 沉默中，不能施法`);
      const hostile = isHostileSpell(book);
      if (hostile ? target.side === unit.side : target.side !== unit.side) throw new EngineError('TARGET_OUT_OF_RANGE', hostile ? '法术目标必须是敌军' : '法术目标必须是友军');
      const d = Math.abs(target.pos[0] - action.to[0]) + Math.abs(target.pos[1] - action.to[1]);
      if (d < book.range[0] || d > book.range[1]) throw new EngineError('TARGET_OUT_OF_RANGE', '目标不在法术射程内');
      if (!hostile && (target.petrified || target.hp >= target.stats.hp) && !SPECIAL_SUPPORT_SPELLS.includes(book.id)) throw new EngineError('NOTHING_TO_HEAL', `${target.name} 不能接受这个法术`);
      const rule = spellDestination(book.id);
      if (rule && !destinationOk(state, unit, action, rule)) throw new EngineError('UNREACHABLE', book.id === 'fw_spell_9' ? '临时墙落点不合法' : '传送落点不合法');
      return target;
    }
    case 'dance': {
      const target = foeOrAlly(action.target);
      if (target.side !== unit.side || target.id === unit.id) throw new EngineError('TARGET_OUT_OF_RANGE', '只能再行动友军');
      if (!(unit.classId === 'dancer' || unit.classId === 'apsara')) throw new EngineError('FORBIDDEN', '这个职业不能跳舞');
      if (distance(action.to, target.pos) !== 1) throw new EngineError('TARGET_OUT_OF_RANGE', '跳舞只能选择相邻的友军');
      if (!target.acted) throw new EngineError('BAD_REQUEST', '目标尚未行动');
      return target;
    }
    case 'item': {
      const stack = unit.items[action.item];
      if (!stack || !(stack.id in ITEMS) || (ITEMS[stack.id] as { shield?: boolean }).shield) throw new EngineError('NO_SUCH_ITEM', '没有这件道具');
      if (unit.hp >= unit.stats.hp || unit.immunities?.includes('healing')) throw new EngineError('NOTHING_TO_HEAL', `${unit.name} 当前不能治疗`);
      return null;
    }
  }
}

// 指定落点按规则校验；可省略落点的指令由引擎在移动后取相邻空格，这里只要求有空格可用。
function destinationOk(state: BattleState, unit: UnitState, action: ActAction & { dest?: Point }, rule: DestinationRule): boolean {
  if (action.dest) return destinationValid(state, unit, action.to, rule, action.dest);
  return !rule.required && adjacentFree(state, unit) !== null;
}

// Move and action are one atomic command: everything is validated before anything changes.
function applyAct(state: BattleState, action: ActAction, events: BattleEvent[], auto = false): void {
  const unit = unitById(state, action.unit);
  if (!unit.alive) throw new EngineError('UNKNOWN_UNIT', `${unit.name} 已退出战斗`);
  if (unit.npc) throw new EngineError('UNIT_ALREADY_ACTED', `${unit.name} 由系统控制，不能手动操作`);
  if (unit.petrified) throw new EngineError('UNIT_ALREADY_ACTED', `${unit.name} 石化庇护中，无法行动`);
  if (isAsleep(unit)) throw new EngineError('UNIT_ALREADY_ACTED', `${unit.name} 睡眠中，无法行动`);
  if (isBerserk(unit) && unit.side === 'player' && !auto) throw new EngineError('UNIT_ALREADY_ACTED', `${unit.name} 混乱中，由 AI 控制`);
  if (unit.acted) throw new EngineError('UNIT_ALREADY_ACTED', `${unit.name} 本阶段已经行动`);
  const range = moveRange(state, unit);
  if (!inBounds(state, action.to) || !range.stops.has(cellKey(state, action.to))) {
    throw new EngineError('UNREACHABLE', '目标格不可达');
  }
  const target = validate(state, unit, action, auto);
  const art = action.act === 'art' ? WEAPON_ART_BY_ID.get(action.art)! : null;
  const hits = action.act === 'art' && art ? validateArt(state, unit, action, art) : [];
  const walked = art ? new Set(pathTo(state, range, action.to).slice(1).map(p => p.join(','))).size : 0;
  const artOptions = action.act === 'art' && art ? hits.map((hit, index) => artCombatOptions(state, unit, action.to, action.weapon, art, hit, index, walked)) : [];
  beginArtAction(state, unit, events);
  if (cellKey(state, action.to) !== range.origin) {
    events.push({ t: 'move', unit: unit.id, path: pathTo(state, range, action.to) });
    unit.pos = [action.to[0], action.to[1]];
    unit.movedTurn = state.turn;
  }
  // 抢物资：站上物资箱即自动拾取（docs/20 §2）。
  if (!(unit.carried ?? 0) && state.boxes?.some(b => samePoint(b, unit.pos))) {
    const index = state.boxes.findIndex(b => samePoint(b, unit.pos));
    state.boxes.splice(index, 1);
    unit.carried = 1;
    events.push({ t: 'loot', unit: unit.id, boxes: unit.carried });
  }
  if (action.act === 'attack' && target) {
    // Attacking equips the weapon, so it is also the one used to counter later.
    equipWeapon(unit, action.weapon);
    spendCharge(unit, action.weapon);
    runCombat(state, unit, target, action.weapon, events);
  } else if (action.act === 'art' && art) {
    equipWeapon(unit, action.weapon);
    const instance = unit.weaponInstances!.find(row => row.id === action.weapon)!;
    instance.durability -= art.cost;
    const mechanics = ART_MECHANICS[art.id], refund = mechanics?.refund;
    const refundChance = refund?.stat ? Math.max(0, Math.min(100, Math.floor(artStats(unit)[refund.stat] / (refund.divisor ?? 1)))) : 0;
    let free = refundChance >= 100 || refundChance > 0 && roll100(state.rng) < refundChance;
    if (!target) {
      damageObject(state, unit, action.target, objectArtDamage(unit, action.weapon, art), events);
      events.push({ t: 'art', unit: unit.id, target: action.target, art: art.id });
      runScenarioEvents(state, events);
    }
    if (art.id === 'fe_art_king_fang' && target?.artEffects?.scent) {
      target.artEffects.scent = target.artEffects.scent.filter(side => side !== unit.side); artState(target, events);
    }
    for (const [index, hit] of hits.entries()) {
      if (!unit.alive || unit.petrified) break;
      const strikes = runCombat(state, unit, hit, action.weapon, events, artOptions[index]);
      const landed = strikes.some(strike => strike.by === unit.id && strike.hit);
      free ||= !!refund?.critical && strikes.some(strike => strike.by === unit.id && strike.crit);
      afterArt(state, unit, hit, action, art, landed, events);
      if (mechanics) afterClassicArt(state, unit, hit, art.id, mechanics, landed, !hit.alive, events);
      if (!hit.alive || hit.petrified) break;
    }
    if (free) instance.durability = Math.min(instance.maxDurability, instance.durability + art.cost);
    if (unit.alive && !unit.petrified && !state.result) {
      if (action.postTo && artPostMoves(state, unit, unit.pos, art).some(p => samePoint(p, action.postTo!))) {
        const range = moveRange(state, unit, mechanics!.postMove!);
        events.push({ t: 'move', unit: unit.id, path: pathTo(state, range, action.postTo) });
        unit.pos = [...action.postTo]; unit.movedTurn = state.turn; displace(unit, events);
      }
      if (action.support && artSupportOptions(state, unit, unit.pos, art).some(option => sameArtSupport(option, action.support!))) {
        const support = action.support;
        const extra: ActAction = support.spell ? { type: 'act', unit: unit.id, to: unit.pos, act: 'cast', target: support.target, spell: support.spell, dest: support.dest }
          : { type: 'act', unit: unit.id, to: unit.pos, act: 'staff', target: support.target, weapon: support.weapon!, dest: support.dest };
        performSupport(state, unit, extra, unitById(state, support.target), events);
      }
    }
  } else if (action.act === 'heal' && target) {
    spendCharge(unit, action.weapon);
    runHeal(state, unit, target, action.weapon, events);
  } else if ((action.act === 'staff' || action.act === 'cast') && target) {
    performSupport(state, unit, action, target, events);
  } else if (action.act === 'item') {
    useItem(unit, action.item, events);
  } else if (action.act === 'interact') {
    interactObject(state, unit, action.target, events);
  } else if (action.act === 'dance' && target) {
    target.acted = false;
    events.push({ t: 'dance', unit: unit.id, target: target.id });
  } else if (action.act === 'seize') {
    events.push({ t: 'seize', unit: unit.id });
    unit.acted = true;
    endArtAction(state, unit, events);
    finish(state, events, 'player', '压制王座');
    return;
  } else if (action.act === 'escape') {
    events.push({ t: 'escape', unit: unit.id });
    unit.acted = true;
    unit.alive = false;
    unit.escaped = true;
    endArtAction(state, unit, events);
    clearArtEffects(state, unit, events);
    checkResult(state, events);
    return;
  } else {
    events.push({ t: 'wait', unit: unit.id });
  }
  unit.acted = true;
  endArtAction(state, unit, events);
  checkResult(state, events);
}

function performSupport(state: BattleState, unit: UnitState, action: ActAction, target: UnitState, events: BattleEvent[]): void {
  if (action.act === 'staff') {
    spendCharge(unit, action.weapon);
    if (action.weapon === 'warp_staff' || action.weapon === 'rescue_staff') {
      const dest = action.dest ?? adjacentFree(state, unit);
      if (dest) { const from = [...target.pos] as Point; target.pos = [...dest]; events.push({ t: 'move', unit: target.id, path: [from, [...dest]] }); displace(target, events); }
    } else if (action.weapon === 'sleep_staff') {
      target.statuses = { ...target.statuses, sleep: true };
      events.push({ t: 'status', unit: target.id, status: 'sleep', active: true });
    } else if (action.weapon === 'silence_staff') {
      target.statuses = { ...target.statuses, silence: 3 };
      events.push({ t: 'status', unit: target.id, status: 'silence', active: true });
    } else if (action.weapon === 'restore') {
      for (const status of cureStatuses(target, events)) events.push({ t: 'status', unit: target.id, status, active: false });
    } else runHeal(state, unit, target, action.weapon, events);
  } else if (action.act === 'cast') {
    const book = SPELLBOOK_BY_ID.get(action.spell)!, instance = unit.spellbooks!.find(row => row.id === action.spell)!;
    instance.charges = Math.max(0, instance.charges - 1);
    events.push({ t: 'cast', unit: unit.id, target: target.id, spell: book.id });
    if (book.id === 'fw_spell_9') {
      const dest = action.dest!;
      state.objects ??= [];
      state.objects.push({ id: `spell-wall-${state.turn}-${dest[0]}-${dest[1]}`, kind: 'wall', pos: [...dest], state: 'intact', hp: 15, maxHp: 15, label: '临时墙', expiresTurn: state.turn + 2 });
    } else if (['fw_spell_49', 'fw_spell_56', 'fw_spell_57'].includes(book.id)) {
      const dest = action.dest ?? adjacentFree(state, unit);
      if (dest) { const from = [...target.pos] as Point; target.pos = [...dest]; events.push({ t: 'move', unit: target.id, path: [from, [...dest]] }); displace(target, events); }
    } else if (book.id === 'fw_spell_58') {
      target.statuses = { ...target.statuses, regen: 5 };
      events.push({ t: 'status', unit: target.id, status: 'regen', active: true });
    } else if (book.id === 'fw_spell_22') {
      for (const status of cureStatuses(target, events)) events.push({ t: 'status', unit: target.id, status, active: false });
    } else withSpellWeapon(book, () => {
      if (isHostileSpell(book)) runCombat(state, unit, target, book.id as WeaponId, events);
      else runHeal(state, unit, target, book.id as WeaponId, events);
    });
  }
}

function spendCharge(unit: UnitState, weapon: WeaponId): void {
  const row = unit.bookInstances?.find(entry => entry.id === weapon);
  if (row) row.charges = Math.max(0, row.charges - 1);
}

function finish(state: BattleState, events: BattleEvent[], winner: Side, reason: string): void {
  state.result = { winner, reason };
  for (const unit of state.units) clearArtEffects(state, unit, events);
  if (state.embers?.length) { state.embers = []; events.push({ t: 'embers', cells: [] }); }
  events.push({ t: 'end', winner, reason });
}

function escapedUnits(state: BattleState): number {
  return state.units.filter(u => u.side === 'player' && u.escaped).length;
}

function checkResult(state: BattleState, events: BattleEvent[]): void {
  if (state.result) return;
  const goal = state.goal;
  if (goal.kind === 'boss' && !unitById(state, goal.target).alive) { finish(state, events, 'player', '击败敌方主将'); return; }
  if (goal.kind === 'escape' && escapedUnits(state) >= goal.need) { finish(state, events, 'player', '成功撤离'); return; }
  if (canFinishGather(state) && !living(state, 'player').some(unit => !unit.npc)) { finish(state, events, 'player', '带回物资'); return; }
  if (goal.kind === 'escort') {
    const npc = unitById(state, goal.npc);
    if (npc.escaped) { finish(state, events, 'player', '护送成功'); return; }
    if (!npc.alive) { finish(state, events, 'enemy', '护卫对象阵亡'); return; }
  }
  const seize = goal.kind === 'seize';
  // On a seize map only seizing wins, even after every defender has fallen.
  if ((goal.kind === 'rout' || goal.kind === 'boss') && living(state, 'enemy').length === 0) { finish(state, events, 'player', '全歼敌军'); return; }
  if (!living(state, 'player').some(unit => !unit.npc)) { finish(state, events, 'enemy', '我方全部退出战斗'); return; }
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
    const routeGoal = state.npcRoute?.find(point => !samePoint(point, npc.pos)) ?? null;
    const cost = travelCosts(state, npc, routeGoal ? [routeGoal] : exits);
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
  expireArtPhase(state, side, 'start', events);
  if (state.objects) state.objects = state.objects.filter(object => object.expiresTurn === undefined || object.expiresTurn > state.turn);
  // 石化庇护到下一个己方阶段解除（docs/13 §4.2）。
  if (side === 'player') for (const unit of living(state, 'player')) unit.petrified = false;
  for (const unit of living(state, side)) {
    unit.acted = false;
    if (unit.statuses?.regen && !unit.petrified && !unit.immunities?.includes('healing') && unit.hp < unit.stats.hp) {
      const amount = Math.min(unit.stats.hp - unit.hp, Math.max(1, Math.floor(unit.stats.hp * 0.05)));
      unit.hp += amount;
      events.push({ t: 'heal', by: null, target: unit.id, amount, hpAfter: unit.hp, source: 'terrain' });
    }
    for (const status of tickStatuses(unit)) events.push({ t: 'status', unit: unit.id, status, active: false });
  }
  // 护卫 NPC 在玩家能行动之前先走一步（它自己把 acted 置回 true）。
  if (side === 'player') advanceNpcs(state, events);
  if (state.result) return;
  events.push({ t: 'phase', side, turn: state.turn });
  runScenarioEvents(state, events);
  for (const unit of state.units) if (!unit.alive || unit.petrified) clearArtEffects(state, unit, events);
  if (state.result) return;
  terrainHeal(state, side, events);
  if (!state.result) checkResult(state, events);
}

// Remaining player units wait, the rule AI plays the enemy phase, then the next turn starts.
function endPlayerPhase(state: BattleState, events: BattleEvent[]): void {
  // 混乱的我方单位在玩家阶段结束前由规则 AI 行动，不能由玩家直接操作。
  for (const unit of living(state, 'player').filter(u => isBerserk(u) && !u.acted && !isAsleep(u) && !u.petrified)) {
    applyAct(state, decide(state, unit), events, true);
    if (state.result) return;
  }
  for (const unit of living(state, 'player')) {
    if (!unit.acted && !unit.petrified && !isAsleep(unit)) {
      beginArtAction(state, unit, events); endArtAction(state, unit, events);
    }
    unit.acted = true;
  }
  expireArtPhase(state, 'player', 'end', events);
  startPhase(state, 'enemy', events);
  for (const enemy of living(state, 'enemy')) {
    if (state.result) return;
    if (!enemy.alive) continue;
    // 石化中的单位不能行动（docs/00 §7.2）。
    if (enemy.petrified || isAsleep(enemy)) { enemy.acted = true; continue; }
    applyAct(state, decide(state, enemy), events);
  }
  expireArtPhase(state, 'enemy', 'end', events);
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
