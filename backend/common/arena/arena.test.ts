import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { autoplay, decide, EngineError, living, step, unitById } from '../engine/index.ts';
import { reachable, tilesFromGlyphs } from '../maps/map.ts';
import { MY_DEFENSE, MY_ROSTER, OPPONENTS } from './demo.ts';
import { switchMap } from './defense.ts';
import { ARENA_MAPS } from './maps.ts';
import { applyBans, arenaPoints, createArenaBattle, opponentList, validateAttack, validateDefense } from './rules.ts';
import type { AttackPlan, Defense } from './rules.ts';

const frost = OPPONENTS.find(o => o.id === 'frost')!;

// The attacker's first legal plan: allowed units in roster order, placed on the first zone cells.
function firstPlan(defense: Defense, bans: string[]): AttackPlan {
  const map = ARENA_MAPS[defense.map];
  const reveal = applyBans(defense, bans as never, MY_ROSTER);
  const picks = MY_ROSTER.filter(u => !reveal.barred.includes(u.character)).slice(0, map.deploy)
    .map((u, i) => ({ character: u.character, pos: map.attackerZone[i] }));
  return { picks, commander: picks[0].character };
}

test('arena maps match the pixel art, zones fit the rules and connect', () => {
  const art = readFileSync(fileURLToPath(new URL('../../../design/pixel-art/gen_art.py', import.meta.url)), 'utf8');
  for (const map of Object.values(ARENA_MAPS)) {
    const start = art.indexOf(`'${map.id}':`);
    const block = art.slice(start, art.indexOf(']),', start));
    assert.deepEqual([...block.matchAll(/"([^"]+)"/g)].map(m => m[1]), map.rows, map.name);
    assert.ok(map.attackerZone.length >= map.deploy && map.defenderZone.length >= map.deploy + map.bans, map.name);
    const defenderCells = new Set(map.defenderZone.map(p => p.join()));
    assert.ok(map.attackerZone.every(p => !defenderCells.has(p.join())));
    const tiles = tilesFromGlyphs(map.rows);
    for (const movement of ['foot', 'armored', 'mounted', 'flying'] as const) {
      const seen = reachable(tiles, map.attackerZone[0], movement);
      assert.ok(map.defenderZone.some(([x, y]) => seen.has(y * tiles[0].length + x)), `${map.name}: ${movement} cannot reach the defenders`);
    }
  }
});

test('demo defenses are valid and the ban list hides priority', () => {
  for (const defense of [...OPPONENTS, MY_DEFENSE]) assert.deepEqual(validateDefense(defense), [], defense.legion);
  const levels = opponentList(frost).map(u => u.level);
  assert.deepEqual(levels, [...levels].sort((a, b) => b - a));
  const broken = structuredClone(frost);
  broken.slots[0].pos = [0, 0];
  broken.slots[1].behavior = 'healer';
  assert.equal(validateDefense(broken).length, 2);
});

test('bans field the first D by priority and hand command to the next commander', () => {
  assert.throws(() => applyBans(frost, ['lina'], MY_ROSTER), (e: EngineError) => e.code === 'ARENA_BAN_INVALID');
  const open = applyBans(frost, ['lina', 'sera'], MY_ROSTER);
  assert.deepEqual(open.fielded.map(s => s.unit.character), ['victor', 'gustav', 'owen', 'erin', 'noah', 'karl']);
  assert.equal(open.commander, 'victor');
  assert.deepEqual(open.barred, ['victor']);
  const swapped = applyBans(frost, ['victor', 'gustav'], MY_ROSTER);
  assert.equal(swapped.commander, 'karl');
  assert.equal(swapped.fielded.length, 6);
});

test('attack plans are checked against bans, zones and the commander', () => {
  const reveal = applyBans(frost, ['lina', 'sera'], MY_ROSTER);
  const plan = firstPlan(frost, ['lina', 'sera']);
  assert.deepEqual(validateAttack(frost, reveal, MY_ROSTER, plan), []);
  const barred = { ...plan, picks: [{ character: 'victor' as const, pos: plan.picks[0].pos }, ...plan.picks.slice(1)] };
  assert.ok(validateAttack(frost, reveal, MY_ROSTER, barred).some(e => e.includes('禁用')));
  const outside = { ...plan, picks: plan.picks.map((p, i) => (i === 0 ? { ...p, pos: [14, 4] as [number, number] } : p)) };
  assert.ok(validateAttack(frost, reveal, MY_ROSTER, outside).some(e => e.includes('出生区')));
  assert.ok(validateAttack(frost, reveal, MY_ROSTER, { ...plan, commander: 'victor' }).some(e => e.includes('主将')));
});

test('an arena battle starts with the attacker, uses snapshots and gives no experience', () => {
  const plan = firstPlan(frost, ['lina', 'sera']);
  const state = createArenaBattle(frost, ['lina', 'sera'], MY_ROSTER, plan, 'seed');
  assert.equal(state.kind, 'arena');
  assert.equal(state.phase, 'player');
  assert.deepEqual(state.goal, { kind: 'boss', target: 'd-victor' });
  assert.equal(state.turnLimit, 20);
  assert.ok(unitById(state, plan.commander).boss && unitById(state, 'd-victor').boss);
  assert.equal(living(state, 'enemy').length, 6);
  const { events } = step(state, { type: 'endPhase' });
  assert.ok(!events.some(e => e.t === 'exp' || e.t === 'levelUp'));
  const castle = OPPONENTS.find(o => o.id === 'white')!;
  const bans = ['lina', 'erin', 'owen'];
  assert.deepEqual(createArenaBattle(castle, bans as never, MY_ROSTER, firstPlan(castle, bans), 's').goal, { kind: 'seize', throne: [18, 7] });
  const woods = switchMap(frost, 'woods');
  const woodsBans = woods.slots.slice(0, 2).map(s => s.unit.character);
  assert.deepEqual(createArenaBattle(woods, woodsBans, MY_ROSTER, firstPlan(woods, woodsBans), 's').goal, { kind: 'rout' });
});

test('王城: only the commander on the throne seizes, and losing the commander loses', () => {
  const castle = OPPONENTS.find(o => o.id === 'white')!;
  const bans = ['sera', 'lina', 'erin'];
  const plan = firstPlan(castle, bans);
  const state = createArenaBattle(castle, bans as never, MY_ROSTER, plan, 'seize');
  assert.equal(plan.commander, 'erin');
  unitById(state, 'erin').pos = [17, 7];
  unitById(state, 'sera').pos = [18, 6];
  const seize = (unit: string, to: [number, number]) => step(state, { type: 'act', unit, to, act: 'seize' });
  const refused = (e: EngineError) => e.code === 'CANNOT_SEIZE';
  assert.throws(() => seize('erin', [17, 7]), refused, 'the commander must stand on the throne');
  assert.throws(() => seize('sera', [18, 7]), refused, 'only the commander seizes');
  assert.equal(decide(state, unitById(state, 'erin')).act, 'seize', 'the AI commander seizes when it can');
  const { state: won, events } = seize('erin', [18, 7]);
  assert.deepEqual(won.result, { winner: 'player', reason: '压制王座' });
  assert.deepEqual(events.slice(-2).map(e => e.t), ['seize', 'end']);

  const routed = structuredClone(state);
  for (const u of living(routed, 'enemy')) Object.assign(u, { hp: 0, alive: false });
  assert.equal(step(routed, { type: 'act', unit: 'sera', to: [18, 6], act: 'wait' }).state.result, undefined, 'a rout does not win');
  const fallen = structuredClone(state);
  Object.assign(unitById(fallen, 'erin'), { hp: 0, alive: false });
  assert.deepEqual(step(fallen, { type: 'act', unit: 'sera', to: [18, 6], act: 'wait' }).state.result,
    { winner: 'enemy', reason: '我方主将被击败，无法压制王座' });
});

test('arena points follow docs/05', () => {
  const won = { ...createArenaBattle(frost, ['lina', 'sera'], MY_ROSTER, firstPlan(frost, ['lina', 'sera']), 'p'), turn: 9, result: { winner: 'player' as const, reason: '' } };
  assert.deepEqual(arenaPoints(won), { total: 30, win: 20, flawless: 5, swift: 5 });
  won.units[0].alive = false;
  won.turn = 11;
  assert.equal(arenaPoints(won).total, 20);
  assert.equal(arenaPoints({ ...won, result: { winner: 'enemy', reason: '' } }).total, 0);
});

// Rule AI on both sides: every opponent must be beatable and also able to hold.
test('each demo opponent can be won and lost by the rule AI', () => {
  for (const defense of OPPONENTS) {
    const map = ARENA_MAPS[defense.map];
    const listed = opponentList(defense).map(u => u.character);
    let wins = 0;
    for (let i = 0; i < 12; i++) {
      const bans = [...listed.slice(i % listed.length), ...listed].filter((c, j, all) => all.indexOf(c) === j).slice(0, map.bans);
      wins += autoplay(createArenaBattle(defense, bans, MY_ROSTER, firstPlan(defense, bans), `${defense.id}-${i}`)).result!.winner === 'player' ? 1 : 0;
    }
    assert.ok(wins > 0 && wins < 12, `${defense.legion}: rule AI won ${wins} / 12`);
  }
});
