import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createPinepassBattle, PINEPASS_ROWS } from '../battles/pinepass.ts';
import { decide, EngineError, forecast, living, moveRange, step, threatMap, trueHit, unitById } from './index.ts';
import type { BattleEvent, BattleState } from './index.ts';
import { rollLevelUp } from './growth.ts';
import { cellKey } from './units.ts';
import { nextU32, roll100, seedRng } from './rng.ts';

const battle = () => createPinepassBattle('test');

test('the RNG is seeded, deterministic and serializable', () => {
  const a = seedRng('x'), b = seedRng('x'), c = seedRng('y');
  const seq = (s: ReturnType<typeof seedRng>) => Array.from({ length: 5 }, () => nextU32(s));
  assert.deepEqual(seq(a), seq(b));
  assert.notDeepEqual(seq(seedRng('x')), seq(c));
  const copy = JSON.parse(JSON.stringify(a));
  assert.deepEqual(seq(a), seq(copy));
  for (let i = 0; i < 1000; i++) {
    const r = roll100(a);
    assert.ok(Number.isInteger(r) && r >= 0 && r <= 99);
  }
});

test('2RN hit probabilities', () => {
  assert.equal(trueHit(0), 0);
  assert.equal(trueHit(100), 1);
  assert.equal(trueHit(50), 0.505);
  assert.ok(trueHit(86) > 0.95 && trueHit(30) < 0.2);
});

test('the pinepass layout matches the pixel-art map', () => {
  const art = readFileSync(fileURLToPath(new URL('../../../design/pixel-art/gen_art.py', import.meta.url)), 'utf8');
  const block = art.slice(art.indexOf("'pinepass':"), art.indexOf(']),', art.indexOf("'pinepass':")));
  assert.deepEqual([...block.matchAll(/"([^"]+)"/g)].map(m => m[1]), PINEPASS_ROWS);
});

test('movement follows terrain costs, flying crosses water, enemies block', () => {
  const state = battle();
  const key = (x: number, y: number) => cellKey(state, [x, y]);
  const erin = moveRange(state, unitById(state, 'erin'));
  assert.ok(erin.stops.has(key(14, 7)), 'Erin reaches the east end of the bridge road');
  assert.ok(!erin.cost.has(key(12, 6)), 'water is impassable on foot');
  assert.ok(!erin.stops.has(key(14, 8)), 'cannot stop on an enemy');
  const lina = moveRange(state, unitById(state, 'lina'));
  assert.ok(lina.stops.has(key(12, 4)) && lina.stops.has(key(13, 3)), 'flying crosses the river');
  const gustav = moveRange(state, unitById(state, 'gustav'));
  assert.ok([...gustav.cost.keys()].every(k => state.map.tiles[Math.floor(k / 24)][k % 24] !== 'mountain'));
  const noah = moveRange(state, unitById(state, 'noah'));
  assert.ok(noah.cost.has(key(8, 8)) && !noah.stops.has(key(8, 8)), 'allies can be passed but not stopped on');
});

test('forecast numbers follow the combat formulas', () => {
  const state = battle();
  const f = forecast(state, 'erin', [14, 7], 'killing_edge', 'axe1');
  assert.deepEqual(
    [f.attacker.attackSpeed, f.attacker.damage, f.attacker.hit, f.attacker.crit, f.attacker.followUpCrit, f.attacker.strikes],
    [13, 12, 86, 34, 44, 2],
  );
  assert.deepEqual([f.defender.damage, f.defender.hit, f.defender.crit, f.defender.strikes], [12, 37, 0, 1]);
  assert.equal(f.attacker.triangle, 1);
  assert.deepEqual(f.order.map(s => s.side), ['attacker', 'defender', 'attacker']);
  assert.ok(f.defenderDies > 0.4 && f.defenderDies < 0.7);
  // Bows cannot answer an adjacent attacker, axes cannot answer an archer two cells away.
  assert.equal(forecast(state, 'lina', [14, 6], 'javelin', 'archer1').defender.canAttack, false);
  assert.equal(forecast(state, 'owen', [13, 7], 'steel_bow', 'axe1').defender.canAttack, false);
  // Bows are effective against flyers, the armorslayer against armor.
  assert.equal(forecast(state, 'archer1', [11, 6], 'iron_bow', 'lina').attacker.effective, true);
  const armor = forecast(state, 'victor', [21, 7], 'armorslayer', 'brock');
  assert.equal(armor.attacker.effective, true);
  assert.equal(armor.attacker.damage, 11 + 7 * 3 - 13 - 2);
});

test('an action is atomic: invalid commands throw and never mutate the input', () => {
  const state = battle();
  const before = JSON.stringify(state);
  assert.throws(() => step(state, { type: 'act', unit: 'erin', to: [12, 6], act: 'wait' }), (e: EngineError) => e.code === 'UNREACHABLE');
  assert.throws(() => step(state, { type: 'act', unit: 'erin', to: [10, 6], act: 'attack', target: 'axe1', weapon: 'killing_edge' }), (e: EngineError) => e.code === 'TARGET_OUT_OF_RANGE');
  assert.throws(() => step(state, { type: 'act', unit: 'axe1', to: [14, 8], act: 'wait' }), (e: EngineError) => e.code === 'NOT_YOUR_PHASE');
  const { state: next } = step(state, { type: 'act', unit: 'gustav', to: [11, 8], act: 'wait' });
  assert.throws(() => step(next, { type: 'act', unit: 'gustav', to: [11, 8], act: 'wait' }), (e: EngineError) => e.code === 'UNIT_ALREADY_ACTED');
  assert.equal(JSON.stringify(state), before);
});

test('retreat ends the battle as a loss and nothing can act afterwards', () => {
  const { state, events } = step(battle(), { type: 'retreat' });
  assert.deepEqual(state.result, { winner: 'enemy', reason: '全军撤退' });
  assert.deepEqual(events, [{ t: 'end', winner: 'enemy', reason: '全军撤退' }]);
  assert.throws(() => step(state, { type: 'endPhase' }), (e: EngineError) => e.code === 'BATTLE_OVER');
});

test('attacking moves, fights, awards experience and equips the weapon', () => {
  const { state, events } = step(battle(), { type: 'act', unit: 'erin', to: [14, 7], act: 'attack', target: 'axe1', weapon: 'steel_sword' });
  const erin = unitById(state, 'erin');
  assert.deepEqual(erin.pos, [14, 7]);
  assert.equal(erin.weapons[0], 'steel_sword');
  assert.equal(erin.acted, true);
  const kinds = events.map(e => e.t);
  assert.deepEqual(kinds.slice(0, 2), ['move', 'combat']);
  const combat = events.find(e => e.t === 'combat') as Extract<BattleEvent, { t: 'combat' }>;
  assert.equal(combat.strikes.at(-1)!.hpAfter, unitById(state, combat.strikes.at(-1)!.target).hp);
  assert.ok(kinds.includes('exp') || !erin.alive);
});

test('level-ups respect growth, caps and empty-level protection', () => {
  const state = battle();
  const erin = unitById(state, 'erin');
  const capped = structuredClone(erin);
  capped.stats = { hp: 150, str: 99, mag: 99, skl: 99, spd: 99, lck: 99, def: 99, res: 99 };
  assert.deepEqual(rollLevelUp(state, capped), { gains: {}, rerolls: 0 });
  let empty = 0;
  for (let i = 0; i < 300; i++) {
    const { gains } = rollLevelUp(state, structuredClone(erin));
    if (Object.keys(gains).length === 0) empty++;
    assert.ok(Object.values(gains).every(g => g === 1));
  }
  assert.ok(empty < 3, 'rerolls make empty levels rare');
});

test('rule AI is deterministic and respects behaviors', () => {
  const state = battle();
  state.phase = 'enemy';
  assert.deepEqual(decide(state, unitById(state, 'axe1')), decide(structuredClone(state), unitById(state, 'axe1')));
  const hold = decide(state, unitById(state, 'brock'));
  assert.deepEqual([hold.to, hold.act], [[22, 7], 'wait']);
  const watcher = decide(state, unitById(state, 'mage1'));
  assert.deepEqual([watcher.to, watcher.act], [[18, 6], 'wait']);
  assert.ok(threatMap(state, 'enemy').size > 0);
});

function autoplay(seed: string): { state: BattleState; events: BattleEvent[] } {
  let state = createPinepassBattle(seed);
  const events: BattleEvent[] = [];
  while (!state.result) {
    for (const unit of living(state, 'player')) {
      if (state.result) break;
      const current = unitById(state, unit.id);
      if (!current.alive || current.acted) continue;
      const result = step(state, decide(state, current));
      state = result.state;
      events.push(...result.events);
    }
    if (state.result) break;
    const result = step(state, { type: 'endPhase' });
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

test('a full battle plays to an end and replays identically', () => {
  const first = autoplay('replay');
  const second = autoplay('replay');
  assert.ok(first.state.result);
  assert.equal(JSON.stringify(first.state), JSON.stringify(second.state));
  assert.deepEqual(first.events, second.events);
  assert.ok(first.events.some(e => e.t === 'phase' && e.side === 'enemy'));
  for (const seed of ['a', 'b', 'c', 'd']) assert.ok(autoplay(seed).state.result);
});
