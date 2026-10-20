import { isCrossTimeDormant } from './cross-time-groups.ts';
import { SPELLBOOK_BY_ID } from '../data/spellbooks.ts';
import { forecast, terrainBonus } from './combat.ts';
import type { Forecast } from './combat.ts';
import { moveRange, travelCosts } from './movement.ts';
import type { MoveRange } from './movement.ts';
import { targetsFrom, threatMap, reachCells } from './ranges.ts';
import { seedRng } from './rng.ts';
import { step } from './step.ts';
import { spellTargets } from './support.ts';
import { attackWeapons, cellKey, distance, isAsleep, isBerserk, keyPoint, living, staffWeapons } from './units.ts';
import type { ActAction, BattleState, Point, UnitState } from './types.ts';

// Deterministic rule AI (docs/03「服务端规则 AI」). Same state, same decision; only combat rolls are random.
const KILL_WEIGHT = 50;
// 护卫 units stay within this many cells of their commander.
export const GUARD_RADIUS = 3;

function sortedStops(range: MoveRange): number[] {
  return [...range.stops].sort((a, b) => a - b);
}

interface AttackChoice { action: Extract<ActAction, { act: 'attack' }>; target: UnitState; forecast: Forecast }

function* attackChoices(state: BattleState, unit: UnitState, stops: number[], danger: Map<number, number>, landings: number): Generator<AttackChoice> {
  for (const weapon of attackWeapons(unit)) {
    const targets = new Map<UnitState, Point[]>();
    for (const stop of stops) {
      const to = keyPoint(state, stop);
      for (const target of targetsFrom(state, unit, to, weapon, 'attack')) {
        if (!targets.has(target)) targets.set(target, []);
        targets.get(target)!.push(to);
      }
    }
    for (const [target, positions] of targets) {
      positions.sort((a, b) => landingCost(state, unit, a, danger) - landingCost(state, unit, b, danger));
      for (const to of positions.slice(0, landings)) {
        yield { target, action: { type: 'act', unit: unit.id, to, act: 'attack', target: target.id, weapon },
          forecast: forecast(state, unit.id, to, weapon, target.id) };
      }
    }
  }
}

function landingCost(state: BattleState, unit: UnitState, at: Point, danger: Map<number, number>): number {
  const terrain = terrainBonus(state, unit, at);
  return 8 * (danger.get(cellKey(state, at)) ?? 0) - terrain.def * 2 - terrain.avoid / 10;
}

// Score = expected damage + kill chance × large weight − expected counter damage.
function bestAttack(state: BattleState, unit: UnitState, stops: number[], maxRisk = 1, anySide = false): ActAction | null {
  let best: { score: number; action: ActAction } | null = null;
  for (const stop of stops) {
    const to = keyPoint(state, stop);
    for (const weapon of attackWeapons(unit)) {
      for (const target of targetsFrom(state, unit, to, weapon, 'attack', anySide)) {
        const f = forecast(state, unit.id, to, weapon, target.id);
        if (f.attackerDies > maxRisk) continue;
        const score = f.expectedDealt + KILL_WEIGHT * f.defenderDies - f.expectedTaken - KILL_WEIGHT * f.attackerDies;
        if (!best || score > best.score + 1e-9) best = { score, action: { type: 'act', unit: unit.id, to, act: 'attack', target: target.id, weapon } };
      }
    }
  }
  return best?.action ?? null;
}

function bestHeal(state: BattleState, unit: UnitState, stops: number[], range: MoveRange, danger: Map<number, number>): ActAction | null {
  let best: { ratio: number; risk: number; cost: number; action: ActAction } | null = null;
  const consider = (stop: number, target: UnitState, action: ActAction) => {
    const ratio = target.hp / target.stats.hp, risk = danger.get(stop) ?? 0, cost = range.cost.get(stop)!;
    if (!best || ratio < best.ratio || ratio === best.ratio && (risk < best.risk || risk === best.risk && cost < best.cost)) {
      return { ratio, risk, cost, action };
    }
    return best;
  };
  const staves = staffWeapons(unit);
  const spells = (unit.spellbooks ?? []).filter(book => book.charges > 0 && SPELLBOOK_BY_ID.get(book.id)?.role === 'heal');
  for (const stop of stops) {
    const to = keyPoint(state, stop);
    for (const weapon of staves) {
      for (const target of targetsFrom(state, unit, to, weapon, 'heal')) {
        best = consider(stop, target, { type: 'act', unit: unit.id, to, act: 'heal', target: target.id, weapon });
      }
    }
    for (const book of spells) {
      for (const target of spellTargets(state, unit, to, book.id)) {
        best = consider(stop, target, { type: 'act', unit: unit.id, to, act: 'cast', target: target.id, spell: book.id });
      }
    }
  }
  return best?.action ?? null;
}

function followAllies(state: BattleState, unit: UnitState, stops: number[], range: MoveRange, danger: Map<number, number>): ActAction {
  const allies = living(state, unit.side).filter(u => u.id !== unit.id && !u.petrified && !u.npc);
  const hurt = allies.filter(u => u.hp < u.stats.hp && !u.immunities?.includes('healing'));
  const foes = living(state).filter(u => u.side !== unit.side);
  const fighters = allies.filter(u => attackWeapons(u).length > 0);
  const group = fighters.length ? fighters : allies;
  const front = group.slice().sort((a, b) => Math.min(...foes.map(f => distance(a.pos, f.pos))) - Math.min(...foes.map(f => distance(b.pos, f.pos))))[0];
  const goals = hurt.length ? hurt : front ? [front] : [];
  const costs = travelCosts(state, unit, goals.map(u => u.pos));
  let bestStop = range.origin, bestScore = Infinity, bestMove = Infinity;
  for (const stop of stops) {
    // Stay just behind the formation; exposure must buy more than a small distance gain.
    const score = Math.max(0, (costs.get(stop) ?? Infinity) - (hurt.length ? 1 : 2)) + 4 * (danger.get(stop) ?? 0);
    const move = range.cost.get(stop)!;
    if (score < bestScore || score === bestScore && move < bestMove) {
      bestStop = stop; bestScore = score; bestMove = move;
    }
  }
  return { type: 'act', unit: unit.id, to: keyPoint(state, bestStop), act: 'wait' };
}

// Move to the stop that is cheapest to walk from toward the goal cells.
function advance(state: BattleState, unit: UnitState, stops: number[], goals: Point[]): ActAction {
  const cost = travelCosts(state, unit, goals);
  let bestStop = cellKey(state, unit.pos), bestCost = cost.get(bestStop) ?? Infinity;
  for (const stop of stops) {
    const c = cost.get(stop) ?? Infinity;
    if (c < bestCost) { bestCost = c; bestStop = stop; }
  }
  return { type: 'act', unit: unit.id, to: keyPoint(state, bestStop), act: 'wait' };
}

function normalDecision(state: BattleState, unit: UnitState): ActAction {
  const stay: ActAction = { type: 'act', unit: unit.id, to: unit.pos, act: 'wait' };
  if (isAsleep(unit)) return stay;
  const berserk = isBerserk(unit);
  const behavior = berserk ? 'aggressive' : unit.behavior ?? 'aggressive';
  if (behavior === 'hold') return stay;
  const range = moveRange(state, unit);
  let stops = sortedStops(range);
  const boss = living(state, unit.side).find(u => u.boss && u.id !== unit.id);
  if (behavior === 'guard' && boss) {
    const near = stops.filter(key => distance(keyPoint(state, key), boss.pos) <= GUARD_RADIUS);
    stops = near.length > 0 ? near : stops;
  }
  // Reach includes ordinary weapons and spells; it does not simulate hostile combat arts.
  const danger = behavior === 'healer' ? threatMap(state, unit.side === 'player' ? 'enemy' : 'player') : new Map<number, number>();
  if (behavior === 'healer') {
    const heal = bestHeal(state, unit, stops, range, danger);
    if (heal) return heal;
  }
  const foes = berserk ? living(state).filter(u => u.id !== unit.id) : living(state).filter(u => u.side !== unit.side);
  const goal = state.goal;
  if (!berserk && goal.kind === 'seize' && unit.side === 'player' && unit.boss) {
    // The commander seizes as soon as it can, fights only safe exchanges, and heads for the throne
    // once at most two defenders are left.
    if (range.stops.has(cellKey(state, goal.throne))) return { type: 'act', unit: unit.id, to: goal.throne, act: 'seize' };
    const safe = bestAttack(state, unit, stops, 0.05, berserk);
    if (safe) return safe;
    return foes.length <= 2 ? advance(state, unit, stops, [goal.throne]) : stay;
  }
  if (behavior === 'opportunist') {
    // 伺机: act only once a foe has stepped into this unit's reach.
    return bestAttack(state, unit, stops, 1, berserk) ?? stay;
  }
  const attack = bestAttack(state, unit, stops, 1, berserk);
  if (attack) return attack;
  if (behavior === 'guard' && boss) return advance(state, unit, stops, [boss.pos]);
  if (behavior === 'healer') return followAllies(state, unit, stops, range, danger);
  return foes.length > 0 ? advance(state, unit, stops, foes.map(u => u.pos)) : stay;
}

function cautiousAdvance(state: BattleState, unit: UnitState, stops: number[], goals: Point[], danger: Map<number, number>): ActAction {
  const costs = travelCosts(state, unit, goals);
  let best = cellKey(state, unit.pos), score = (costs.get(best) ?? Infinity) + 4 * (danger.get(best) ?? 0);
  for (const stop of stops) {
    const next = (costs.get(stop) ?? Infinity) + 4 * (danger.get(stop) ?? 0);
    if (next < score) { best = stop; score = next; }
  }
  return { type: 'act', unit: unit.id, to: keyPoint(state, best), act: 'wait' };
}

interface Choice { action: ActAction; score: number }

function tacticalChoices(state: BattleState, actors: UnitState[], search = false): Choice[] {
  const foes = living(state, 'player');
  const threats = foes.map(unit => ({ unit, cells: reachCells(state, unit, moveRange(state, unit), 'attack') }));
  const danger = new Map<number, number>();
  for (const threat of threats) for (const cell of threat.cells) danger.set(cell, (danger.get(cell) ?? 0) + 1);
  const choices: { unit: UnitState; attack: AttackChoice }[] = [];
  const byTarget = new Map<string, AttackChoice[]>();
  const ranked: Choice[] = [];
  const offer = (action: ActAction, score: number) => { ranked.push({ action, score }); };
  for (const unit of actors) {
    if (!unit.alive || unit.acted || unit.petrified || isAsleep(unit)) continue;
    const stay: ActAction = { type: 'act', unit: unit.id, to: unit.pos, act: 'wait' };
    if (isBerserk(unit) || unit.behavior === 'hold') {
      offer(normalDecision(state, unit), -2000);
      continue;
    }
    const range = moveRange(state, unit);
    let stops = sortedStops(range);
    const boss = living(state, unit.side).find(u => u.boss && u.id !== unit.id);
    if (unit.behavior === 'guard' && boss) {
      const near = stops.filter(key => distance(keyPoint(state, key), boss.pos) <= GUARD_RADIUS);
      if (near.length) stops = near;
    }
    if (unit.behavior === 'healer') {
      const heal = bestHeal(state, unit, stops, range, danger);
      if (heal && 'target' in heal) {
        const target = state.units.find(u => u.id === heal.target)!;
        offer(heal, 20 + 100 * (1 - target.hp / target.stats.hp));
        continue;
      }
    }
    for (const attack of attackChoices(state, unit, stops, danger, search ? 8 : 4)) {
      choices.push({ unit, attack });
      if (!byTarget.has(attack.target.id)) byTarget.set(attack.target.id, []);
      byTarget.get(attack.target.id)!.push(attack);
    }
    const goals = unit.behavior === 'guard' && boss ? [boss.pos] : foes.map(u => u.pos);
    const fallback = unit.behavior === 'opportunist' ? stay : unit.behavior === 'healer'
      ? followAllies(state, unit, stops, range, danger) : cautiousAdvance(state, unit, stops, goals, danger);
    offer(fallback, -1000 - Math.min(100, ...foes.map(foe => distance(unit.pos, foe.pos))));
    if (search && unit.behavior !== 'opportunist') {
      const costs = travelCosts(state, unit, goals);
      const score = (stop: number) => (costs.get(stop) ?? 100) + 4 * (danger.get(stop) ?? 0) + range.cost.get(stop)! * 0.05;
      for (const stop of stops.filter(stop => stop !== range.origin).sort((a, b) => score(a) - score(b)).slice(0, 6)) {
        offer({ type: 'act', unit: unit.id, to: keyPoint(state, stop), act: 'wait' }, -1000 - score(stop));
      }
    }
  }
  for (const options of byTarget.values()) options.sort((a, b) => b.forecast.expectedDealt - a.forecast.expectedDealt);
  for (const { unit, attack } of choices) {
    const { action, target, forecast: f } = attack;
    const cell = cellKey(state, action.to);
    const exposure = threats.reduce((sum, threat) => sum + (threat.cells.has(cell)
      ? threat.unit.id === target.id ? 1 - f.defenderDies : 1 : 0), 0);
    const hpAfter = Math.max(0, unit.hp - f.expectedTaken) / unit.stats.hp;
    // Estimate a follow-up from each ally without reserving the same landing twice.
    let support = 0;
    const supporters = new Set([unit.id]), landings = new Set([cell]);
    for (const other of byTarget.get(target.id)!) {
      const at = cellKey(state, other.action.to);
      if (!supporters.has(other.action.unit) && !landings.has(at)) {
        support += other.forecast.expectedDealt * (1 - other.forecast.attackerDies);
        supporters.add(other.action.unit); landings.add(at);
      }
    }
    const focus = !f.defender.protected && support > 0 && f.expectedDealt + support >= target.hp
      ? 35 * (1 - f.defenderDies) : 0;
    const terrain = terrainBonus(state, unit, action.to);
    const overkill = Math.max(0, f.attacker.damage * f.attacker.strikes - target.hp);
    const score = f.expectedDealt + 70 * f.defenderDies + focus - f.expectedTaken
      - (unit.boss ? 150 : 80) * f.attackerDies - exposure * (8 + 12 * (1 - hpAfter))
      + terrain.def * 2 + terrain.avoid / 10 - overkill * 0.15;
    if (score > 0) offer(action, score);
  }
  return ranked.sort((a, b) => b.score - a.score);
}

function searchCandidates(state: BattleState, actors: UnitState[], only?: string): Choice[] {
  const seen = new Set<string>();
  const ranked = tacticalChoices(state, actors, true).filter(choice => {
    if (only && choice.action.unit !== only) return false;
    const key = JSON.stringify(choice.action);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  const selected: Choice[] = [];
  const take = (pool: Choice[], limit: number) => {
    const units = new Set<string>();
    const diverse = pool.filter(choice => {
      if (units.has(choice.action.unit)) return false;
      units.add(choice.action.unit); return true;
    });
    for (const choice of [...diverse, ...pool]) {
      if (!limit) break;
      if (!selected.includes(choice)) { selected.push(choice); limit--; }
    }
  };
  take(ranked.filter(c => c.action.act !== 'wait'), 4);
  take(ranked.filter(c => c.action.act === 'wait' && distance(c.action.to, state.units.find(u => u.id === c.action.unit)!.pos) > 0), 4);
  take(ranked, 8 - selected.length);
  return selected;
}

const SEARCH_SIMULATIONS = 72;

function searchDecision(state: BattleState, actors: UnitState[], only?: string, budget?: { remaining: number }): ActAction | null {
  if (budget && budget.remaining < SEARCH_SIMULATIONS) return tacticalChoices(state, actors).find(choice => !only || choice.action.unit === only)?.action ?? null;
  const ready = actors.filter(unit => unit.alive && !unit.acted && !unit.petrified && !isAsleep(unit));
  if (!ready.length) return null;
  // Include allied occupied cells: vacating one can enable an attack even when no attack is legal yet.
  const canCoordinate = ready.length > 1 && ready.some(unit => {
    if (unit.behavior === 'hold') return false;
    if (unit.behavior === 'healer' && living(state, 'enemy').some(ally => ally.hp < ally.stats.hp && !ally.petrified && !ally.immunities?.includes('healing'))) return true;
    const weapons = attackWeapons(unit);
    return weapons.length > 0 && [...moveRange(state, unit).cost.keys()].some(cell =>
      weapons.some(weapon => targetsFrom(state, unit, keyPoint(state, cell), weapon, 'attack').length > 0));
  });
  if (!canCoordinate) return tacticalChoices(state, actors).find(choice => !only || choice.action.unit === only)?.action ?? null;
  if (budget) budget.remaining -= SEARCH_SIMULATIONS;
  const actorIds = new Set(actors.map(unit => unit.id));
  const threats = living(state, 'player').map(unit => ({ id: unit.id, cells: reachCells(state, unit, moveRange(state, unit), 'attack') }));
  const evaluate = (after: BattleState): number => {
    let score = after.result ? after.result.winner === 'enemy' ? 200 : -200 : 0;
    const foes = living(after, 'player');
    for (const before of state.units.filter(unit => unit.alive)) {
      const now = after.units.find(unit => unit.id === before.id)!;
      const lost = before.hp - (now.alive ? now.hp : 0);
      if (before.side === 'player') { score += lost + (now.alive ? 0 : 70); continue; }
      score -= lost * 1.2 + (now.alive ? 0 : before.boss ? 180 : 90);
      if (!now.alive || !now.acted || before.acted) continue;
      const risk = (at: Point) => threats.filter(t => foes.some(f => f.id === t.id) && t.cells.has(cellKey(after, at))).length;
      const oldCover = terrainBonus(state, before, before.pos), cover = terrainBonus(after, now, now.pos);
      const near = (at: Point) => Math.min(100, ...foes.map(foe => distance(at, foe.pos)));
      score += 0.4 * (near(before.pos) - near(now.pos)) + 2 * (cover.def - oldCover.def) + (cover.avoid - oldCover.avoid) / 10
        - 10 * (risk(now.pos) - risk(before.pos)) - 0.05;
    }
    return score;
  };
  type Node = { state: BattleState; first: ActAction | null; score: number; priority: number };
  let beam: Node[] = [{ state, first: null, score: 0, priority: 0 }];
  // shortcut: three actions, beam width four and eight branches (at most 72 simulations); widen only after profiling.
  for (let depth = 0; depth < 3; depth++) {
    const next: Node[] = [];
    for (const node of beam) {
      if (node.state.result) { next.push(node); continue; }
      const units = node.state.units.filter(unit => actorIds.has(unit.id));
      const candidates = searchCandidates(node.state, units, depth === 0 ? only : undefined);
      if (!candidates.length) { next.push(node); continue; }
      for (const choice of candidates) {
        // Independent planning rolls: never use, consume or predict the battle's RNG state.
        const simulated = step({ ...node.state, phase: 'enemy', rng: seedRng(`ai-search-${depth}`) }, choice.action).state;
        next.push({ state: simulated, first: node.first ?? choice.action, score: evaluate(simulated), priority: node.first ? node.priority : choice.score });
      }
    }
    beam = next.sort((a, b) => b.score - a.score || b.priority - a.priority).slice(0, 4);
    if (beam.every(node => node.state.result)) break;
  }
  return beam[0]?.first ?? null;
}

export function decide(state: BattleState, unit: UnitState): ActAction {
  if (isCrossTimeDormant(state, unit)) return { type: 'act', unit: unit.id, to: unit.pos, act: 'wait' };
  if (unit.side === 'enemy' && !isBerserk(unit) && !isAsleep(unit) && !unit.petrified && !unit.acted) {
    const actors = living(state, 'enemy').filter(actor => !isCrossTimeDormant(state, actor));
    return (state.aiDifficulty === 'hard' ? searchDecision(state, actors, unit.id)
      : tacticalChoices(state, actors).find(choice => choice.action.unit === unit.id)?.action) ?? normalDecision(state, unit);
  }
  return normalDecision(state, unit);
}

// Both levels replan after actual actions; hard additionally compares legal multi-unit continuations.
export function nextEnemyAction(state: BattleState, units: UnitState[], budget?: { remaining: number }): ActAction | null {
  units = units.filter(unit => !isCrossTimeDormant(state, unit));
  return state.aiDifficulty === 'hard' ? searchDecision(state, units, undefined, budget) : tacticalChoices(state, units)[0]?.action ?? null;
}
