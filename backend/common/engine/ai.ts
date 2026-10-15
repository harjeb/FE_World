import { forecast } from './combat.ts';
import { moveRange, travelCosts } from './movement.ts';
import type { MoveRange } from './movement.ts';
import { targetsFrom } from './ranges.ts';
import { attackWeapons, distance, keyPoint, living, staffWeapons } from './units.ts';
import type { ActAction, BattleState, Point, UnitState } from './types.ts';

// Deterministic rule AI (docs/03「服务端规则 AI」). Same state, same decision; only combat rolls are random.
const KILL_WEIGHT = 50;
// 护卫 units stay within this many cells of their commander.
export const GUARD_RADIUS = 3;

function sortedStops(range: MoveRange): number[] {
  return [...range.stops].sort((a, b) => a - b);
}

// Score = expected damage + kill chance × large weight − expected counter damage.
function bestAttack(state: BattleState, unit: UnitState, stops: number[]): ActAction | null {
  let best: { score: number; action: ActAction } | null = null;
  for (const stop of stops) {
    const to = keyPoint(state, stop);
    for (const weapon of attackWeapons(unit)) {
      for (const target of targetsFrom(state, unit, to, weapon, 'attack')) {
        const f = forecast(state, unit.id, to, weapon, target.id);
        const score = f.expectedDealt + KILL_WEIGHT * f.defenderDies - f.expectedTaken - KILL_WEIGHT * f.attackerDies;
        if (!best || score > best.score + 1e-9) {
          best = { score, action: { type: 'act', unit: unit.id, to, act: 'attack', target: target.id, weapon } };
        }
      }
    }
  }
  return best?.action ?? null;
}

function bestHeal(state: BattleState, unit: UnitState, stops: number[]): ActAction | null {
  let best: { ratio: number; action: ActAction } | null = null;
  for (const stop of stops) {
    const to = keyPoint(state, stop);
    for (const weapon of staffWeapons(unit)) {
      for (const target of targetsFrom(state, unit, to, weapon, 'heal')) {
        const ratio = target.hp / target.stats.hp;
        if (!best || ratio < best.ratio) best = { ratio, action: { type: 'act', unit: unit.id, to, act: 'heal', target: target.id, weapon } };
      }
    }
  }
  return best?.action ?? null;
}

// Move to the stop that is cheapest to walk from toward the goal cells.
function advance(state: BattleState, unit: UnitState, stops: number[], goals: Point[]): ActAction {
  const cost = travelCosts(state, unit, goals);
  let bestStop = stops[0], bestCost = Infinity;
  for (const stop of stops) {
    const c = cost.get(stop) ?? Infinity;
    if (c < bestCost) { bestCost = c; bestStop = stop; }
  }
  return { type: 'act', unit: unit.id, to: keyPoint(state, bestStop), act: 'wait' };
}

export function decide(state: BattleState, unit: UnitState): ActAction {
  const stay: ActAction = { type: 'act', unit: unit.id, to: unit.pos, act: 'wait' };
  const behavior = unit.behavior ?? 'aggressive';
  if (behavior === 'hold') return stay;
  const range = moveRange(state, unit);
  let stops = sortedStops(range);
  const boss = living(state, unit.side).find(u => u.boss && u.id !== unit.id);
  if (behavior === 'guard' && boss) {
    const near = stops.filter(key => distance(keyPoint(state, key), boss.pos) <= GUARD_RADIUS);
    stops = near.length > 0 ? near : stops;
  }
  if (behavior === 'healer') {
    const heal = bestHeal(state, unit, stops);
    if (heal) return heal;
  }
  const foes = living(state).filter(u => u.side !== unit.side);
  if (behavior === 'opportunist') {
    // 伺机: act only once a foe has stepped into this unit's reach.
    return bestAttack(state, unit, stops) ?? stay;
  }
  const attack = bestAttack(state, unit, stops);
  if (attack) return attack;
  if (behavior === 'guard' && boss) return advance(state, unit, stops, [boss.pos]);
  if (behavior === 'healer') {
    const hurt = living(state, unit.side).filter(u => u.id !== unit.id && u.hp < u.stats.hp);
    return hurt.length > 0 ? advance(state, unit, stops, hurt.map(u => u.pos)) : stay;
  }
  return foes.length > 0 ? advance(state, unit, stops, foes.map(u => u.pos)) : stay;
}
