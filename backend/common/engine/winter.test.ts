import assert from 'node:assert/strict';
import test from 'node:test';
import { createPinepassBattle } from '../battles/pinepass.ts';
import { MY_ROSTER, OPPONENTS } from '../arena/demo.ts';
import { ARENA_MAPS } from '../arena/maps.ts';
import { banFor, createArenaDay, startAttack } from '../game/arena.ts';
import { CLASSES } from '../data/classes.ts';
import { createClassicBattle, createFieldBattle, createFestivalBattle } from '../game/battles.ts';
import { fieldEncounter } from '../game/encounters.ts';
import { createUnit } from '../game/model.ts';
import { seasonalMap, tilesFromGlyphs } from '../maps/map.ts';
import type { Terrain } from '../maps/map.ts';
import { afterClassicArt } from './art-effects.ts';
import { movementBudget, moveRange } from './movement.ts';
import { step } from './step.ts';
import type { BattleEvent } from './types.ts';

function corridor(classId: keyof typeof CLASSES = 'swordsman') {
  const state = createPinepassBattle('winter');
  state.map = { width: 12, height: 3, season: 4, tiles: tilesFromGlyphs(['############', '............', '############']) };
  const unit = state.units[0], enemy = state.units.find(u => u.side === 'enemy')!;
  state.units = [unit, enemy];
  unit.classId = classId; unit.pos = [0, 1]; unit.acted = false;
  enemy.pos = [11, 1]; enemy.boss = true;
  state.goal = { kind: 'boss', target: enemy.id };
  return { state, unit, enemy };
}

test('winter transforms only grass and water without changing the source map', () => {
  const tiles: Terrain[][] = [['plain', 'water', 'shallows', 'road', 'bridge', 'floor', 'forest', 'mountain', 'wall']];
  const before = structuredClone(tiles);
  assert.deepEqual(seasonalMap(tiles, 4).tiles[0], ['snow', 'ice', 'ice', 'road', 'bridge', 'floor', 'forest', 'mountain', 'wall']);
  for (const season of [1, 2, 3]) assert.deepEqual(seasonalMap(tiles, season).tiles, before);
  assert.deepEqual(tiles, before);
});

test('snow and ice adjust the action budget once at the origin, not on every step', () => {
  const { state, unit } = corridor();
  state.map.tiles[1].fill('ice');
  state.map.tiles[1][0] = 'snow';
  assert.equal(movementBudget(state, unit), 4);
  assert.ok(moveRange(state, unit).stops.has(12 + 4));
  assert.ok(!moveRange(state, unit).stops.has(12 + 5));
  state.map.tiles[1][0] = 'ice';
  assert.equal(movementBudget(state, unit), 6);
  assert.ok(moveRange(state, unit).stops.has(12 + 6));
  assert.ok(!moveRange(state, unit).stops.has(12 + 7));
  unit.artEffects = { movementPenalty: 2 };
  assert.equal(movementBudget(state, unit), 4);
  unit.artEffects.statuses = ['root'];
  assert.equal(movementBudget(state, unit), 0);
  assert.equal(moveRange(state, unit, 8).stops.size, 1);
});

test('flight ignores both seasonal movement modifiers and never breaks ice', () => {
  const { state, unit } = corridor('pegasus');
  for (const tile of ['snow', 'ice'] as const) {
    state.map.tiles[1].fill(tile);
    assert.equal(movementBudget(state, unit), CLASSES.pegasus.move);
    const result = step(state, { type: 'act', unit: unit.id, to: [3, 1], act: 'wait' });
    assert.ok(!result.events.some(e => e.t === 'terrain'));
    assert.deepEqual(result.state.map.tiles, state.map.tiles);
  }
});

test('foot soldiers preserve ice; both heavy infantry and armored cavalry break their entire path', () => {
  for (const classId of ['swordsman', 'knight', 'great_knight'] as const) {
    const { state, unit } = corridor(classId);
    for (const x of [1, 2, 3, 4]) state.map.tiles[1][x] = 'ice';
    const action = { type: 'act', unit: unit.id, to: [3, 1], act: 'wait' } as const;
    const result = step(state, { ...action, to: [3, 1] });
    const heavy = CLASSES[classId].armored;
    assert.deepEqual(result.state.map.tiles[1].slice(1, 4), Array(3).fill(heavy ? 'water' : 'ice'));
    assert.equal(result.state.map.tiles[1][4], 'ice', 'unwalked ice survives');
    assert.equal(result.events.filter(e => e.t === 'terrain').length, heavy ? 3 : 0);
    assert.equal(result.state.units[0].hp, unit.hp, 'no invented falling damage');
    assert.equal(state.map.tiles[1][1], 'ice', 'input stays immutable');
    assert.deepEqual(JSON.parse(JSON.stringify(step(JSON.parse(JSON.stringify(state)), { ...action, to: [3, 1] }))),
      JSON.parse(JSON.stringify(result)), 'serializable deterministic replay');
    if (heavy) {
      const moved = result.state.units[0];
      assert.ok(moveRange(result.state, moved).stops.has(12 + 4), 'heavy unit can leave its broken landing tile');
      assert.ok(!moveRange(result.state, moved).stops.has(12 + 2), 'broken route is impassable afterwards');
    }
  }
});

test('invalid attacks cannot leave a trail of broken ice', () => {
  const { state, unit, enemy } = corridor('knight');
  state.map.tiles[1][1] = 'ice';
  const before = structuredClone(state);
  assert.throws(() => step(state, { type: 'act', unit: unit.id, to: [1, 1], act: 'attack', target: enemy.id, weapon: 'iron_sword' }));
  assert.deepEqual(state, before);
});

test('a forced push onto ice breaks the landing tile without reactivating the unit', () => {
  const { state, unit, enemy } = corridor();
  enemy.classId = 'great_knight'; enemy.pos = [1, 1]; enemy.acted = true;
  state.map.tiles[1][2] = 'ice';
  const events: BattleEvent[] = [];
  afterClassicArt(state, unit, enemy, 'push', { push: true }, true, false, events);
  assert.deepEqual(enemy.pos, [2, 1]);
  assert.equal(state.map.tiles[1][2], 'water');
  assert.equal(enemy.acted, true);
  assert.deepEqual(events.filter(e => e.t === 'terrain'), [{ t: 'terrain', unit: enemy.id, at: [2, 1], terrain: 'water' }]);
});

test('teleporting armor breaks only the landing ice, not intermediate tiles', () => {
  const { state, unit, enemy } = corridor('cleric');
  const ally = { ...structuredClone(enemy), id: 'heavy', side: 'player' as const, classId: 'knight' as const, pos: [1, 1] as [number, number] };
  state.units.push(ally);
  unit.weapons = ['warp_staff']; unit.ranks.staff = 'S';
  unit.bookInstances = [{ id: 'warp_staff', charges: 5, maxCharges: 5 }];
  for (const x of [2, 3, 4]) state.map.tiles[1][x] = 'ice';
  const result = step(state, { type: 'act', unit: unit.id, to: unit.pos, act: 'staff', weapon: 'warp_staff', target: ally.id, dest: [4, 1] });
  assert.deepEqual(result.state.units.find(u => u.id === ally.id)!.pos, [4, 1]);
  assert.deepEqual(result.state.map.tiles[1].slice(2, 5), ['ice', 'ice', 'water']);
});

test('new field, classic and annual battles freeze their season; originals stay unchanged', () => {
  const units = [createUnit('erin', 1, 'winter')];
  const encounter = fieldEncounter('season', 374, 1);
  const autumn = createFieldBattle(units, { encounter, region: 1, cleared: 0, day: 374, seed: 'season' });
  const winter = createFieldBattle(units, { encounter, region: 1, cleared: 0, day: 375, seed: 'season' });
  const spring = createFieldBattle(units, { encounter, region: 1, cleared: 0, day: 500, seed: 'season' });
  assert.equal(winter.state.map.season, 4);
  assert.deepEqual(winter.state.map.tiles, seasonalMap(autumn.state.map.tiles, 4).tiles);
  assert.deepEqual(spring.state.map.tiles, autumn.state.map.tiles);
  assert.ok(winter.state.map.tiles.flat().includes('snow'));
  assert.deepEqual(winter.initial.map, winter.state.map);
  const classic = createClassicBattle(units, { mapId: 'fe1-ch16', seed: 'classic', day: 375 });
  assert.equal(classic.state.map.season, 4);
  assert.ok(!classic.state.map.tiles.flat().some(t => t === 'plain' || t === 'water' || t === 'shallows'));
  const festival = createFestivalBattle(units, 1, 'annual', { day: 500, season: 4 });
  assert.equal(festival.state.map.season, 4);
  assert.ok(festival.state.map.tiles.flat().includes('snow'));
  assert.deepEqual(festival.state.units.map(u => u.level), createFestivalBattle(units, 1, 'annual', { day: 500 }).state.units.map(u => u.level));
});

test('ordinary arena uses actual departure season even for opponents from an older arena day', () => {
  const opponent = OPPONENTS.find(o => o.id === 'frost')!;
  const day = createArenaDay('winter', 0, [opponent]);
  const reveal = banFor(day, opponent.id, ['lina', 'sera'], MY_ROSTER);
  const map = ARENA_MAPS[opponent.map];
  const picks = MY_ROSTER.filter(u => !reveal.barred.includes(u.character)).slice(0, map.deploy)
    .map((u, i) => ({ character: u.character, pos: map.attackerZone[i] }));
  const state = startAttack(day, opponent.id, MY_ROSTER, { picks, commander: picks[0].character }, 'winter-arena', 375);
  assert.equal(state.map.season, 4);
  assert.ok(state.map.tiles.flat().includes('snow'));
});

test('both new wild layouts enter their regional encounter pools without replacing old layouts', () => {
  const units = [createUnit('erin', 1, 'water-map')];
  for (const [region, name] of [[4, '大河浅洲'], [5, '湖心群岛']] as const) {
    const battles = Array.from({ length: 12 }, (_, i) => createFieldBattle(units, { region, cleared: 0, day: 0, seed: `water-${i}` }));
    assert.ok(battles.some(b => b.name.includes('遭遇战')));
    const water = battles.find(b => b.name.includes(name));
    assert.ok(water);
    assert.ok(water.state.map.tiles.flat().filter(t => t === 'water').length >= water.state.map.width * water.state.map.height / 4);
  }
});
