// Regression probes for design inconsistencies found at deaa143, using in-memory databases.
// Exit 1 means at least one documented rule differs from the implementation.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../../backend/api/db.ts';
import { Store } from '../../backend/api/store.ts';
import { loginOrRegister } from '../../backend/api/auth.ts';
import { dispatch } from '../../backend/api/handlers.ts';
import { applyBattleOutcome } from '../../backend/api/services.ts';
import { OP } from '../../backend/common/protocol/ops.ts';
import { annualWindowOpen } from '../../backend/common/game/annual.ts';
import { createFieldBattle } from '../../backend/common/game/battles.ts';
import { createUnit, toBattleUnit, ageAt } from '../../backend/common/game/model.ts';
import { createLegacy, claimLegacy, applyInheritanceFloor, numericFloor, reincarnate, sourceGrowthVector, totalStats } from '../../backend/common/game/legacy.ts';
import { CLASSES } from '../../backend/common/data/classes.ts';
import { CHARACTERS } from '../../backend/common/data/characters.ts';
import { STAT_KEYS } from '../../backend/common/data/types.ts';
import { gainExp } from '../../backend/common/engine/growth.ts';
import { step } from '../../backend/common/engine/step.ts';
import { runCombat } from '../../backend/common/engine/resolve.ts';
import { seedRng } from '../../backend/common/engine/rng.ts';

export const results = [];
function probe(id, description, expected, run) {
  try {
    const actual = run();
    let pass = true;
    try { assert.deepEqual(actual, expected); } catch { pass = false; }
    results.push({ id, description, pass, expected, actual });
  } catch (error) {
    results.push({ id, description, pass: false, error: error.message });
  }
}

function withContext(run) {
  const store = new Store(openDb(':memory:'));
  try {
    const { accountId, player } = loginOrRegister(store, 'audit-user', undefined, 'Audit');
    player.registered = false;
    player.flags.setupCompleted = true;
    return run({ store, accountId, player, agentModel: null, push: () => {} });
  } finally { store.db.close(); }
}

function plainBattle(units, goal = { kind: 'rout' }, boxes = []) {
  return {
    engineVersion: 1, id: 'audit', kind: 'field', name: 'Audit',
    map: { width: 10, height: 10, tiles: Array.from({ length: 10 }, () => Array(10).fill('plain')) },
    units, turn: 1, turnLimit: 10, phase: 'player', goal, boxes,
    rng: seedRng('audit'), growthRng: seedRng('audit-growth'),
  };
}

function fighter(id, side, pos, extra = {}) {
  return toBattleUnit(createUnit('karl', 1, id, 0, false), side, id, pos, extra);
}

function inheritanceFixture(mode, weights) {
  const source = createUnit('karl', 15, 'source', 0, false);
  source.stats = { ...CLASSES[source.classId].caps };
  const heir = createUnit('owen', 1, 'heir', 0, false, { growthType: 'normal' });
  const legacy = createLegacy(source, 'retired', 'audit-legacy', 'audit-player');
  claimLegacy(legacy, heir, mode, weights);
  return { source, heir };
}
const allWeights = Object.fromEntries(STAT_KEYS.map(key => [key, 1]));

probe('A01', 'Annual entry opens at D482 and leaves 18 days before the next boundary',
  [false, true, false], () => [481, 482, 500].map(annualWindowOpen));

probe('A02', 'An active annual entry blocks unrelated calendar actions', false, () => withContext(ctx => {
  ctx.player.day = 482;
  dispatch(ctx, OP.REGISTER_ANNUAL, { unitIds: ['u_erin'] });
  const before = ctx.player.day;
  try { dispatch(ctx, OP.REST, { days: 5 }); } catch { return false; }
  return ctx.player.day !== before;
}));

probe('A03', 'Annual match units retain the level frozen at registration', true, () => withContext(ctx => {
  ctx.player.day = 482;
  const unit = ctx.store.unit(ctx.player.id, 'u_erin');
  const before = unit.level;
  ctx.player.bexp = 1000;
  dispatch(ctx, OP.REGISTER_ANNUAL, { unitIds: [unit.id] });
  try { dispatch(ctx, OP.ASSIGN_BEXP, { unitId: unit.id, amount: 100 }); }
  catch (error) { if (error.code !== 'FORBIDDEN') throw error; }
  const started = dispatch(ctx, OP.START_ANNUAL_MATCH, {});
  const battle = ctx.store.battle(ctx.player.id, started.battleId);
  return battle.state.units.find(u => u.id === unit.id).level === before;
}));

probe('A04', 'The old festival endpoint cannot bypass annual registration', false, () => withContext(ctx => {
  ctx.player.day = 0;
  try { return !!dispatch(ctx, OP.START_MAIN_STAGE, {}).battleId; } catch { return false; }
}));

probe('L01', 'Growth inheritance does not also grant numeric backfill', 0, () => {
  const { heir } = inheritanceFixture('growth', allWeights);
  heir.level = 15;
  return Object.values(applyInheritanceFloor(heir)).reduce((sum, gain) => sum + gain, 0);
});

probe('L02', 'A field level-up fulfils the inherited numeric floor', true, () => {
  const { heir } = inheritanceFixture('numeric', allWeights);
  const contract = heir.inheritance;
  const unit = toBattleUnit(heir, 'player', heir.id, [1, 1]);
  unit.exp = 99;
  gainExp(plainBattle([unit]), unit, 1, []);
  const floor = numericFloor(unit.level, contract.initialTotal, contract.clippedTarget, contract.targetLevel);
  return totalStats(unit.stats) >= floor;
});

probe('L03', 'Numeric backfill redirects points after the preferred stat caps', true, () => {
  const { heir } = inheritanceFixture('numeric', { str: 1 });
  heir.level = 15;
  applyInheritanceFloor(heir);
  return totalStats(heir.stats) >= heir.inheritance.clippedTarget;
});

probe('L04', 'A source does not pass its separate reincarnation bonus to an heir',
  CHARACTERS.karl.growth.str, () => {
    const unit = createUnit('karl', 99, 'source', 0, false);
    unit.cycle = 1;
    unit.growthAllocation = { str: 10 };
    return sourceGrowthVector(unit).str;
  });

probe('P01', 'A reincarnated unit is still 16 when its age is refreshed on that day', 16, () => {
  const unit = createUnit('karl', 99, 'reborn', 0, false);
  reincarnate(unit, {}, 'fighter', 500, 4000);
  return ageAt(unit, 4000, 500);
});

probe('Q01', 'Eliminating enemies cannot replace gathering; a dead escort loses',
  { gather: null, escort: 'enemy' }, () => {
    const player = fighter('p', 'player', [1, 1]);
    const enemy = fighter('e', 'enemy', [9, 9], { alive: false, hp: 0 });
    const gather = step(plainBattle([player, enemy], { kind: 'gather', exits: [[8, 8]], need: 1 }),
      { type: 'act', unit: 'p', to: [1, 1], act: 'wait' }).state.result?.winner ?? null;
    const npc = fighter('npc', 'player', [2, 2], { npc: true, alive: false, hp: 0 });
    const escort = step(plainBattle([player, enemy, npc], { kind: 'escort', exits: [[8, 8]], npc: 'npc' }),
      { type: 'act', unit: 'p', to: [1, 1], act: 'wait' }).state.result?.winner ?? null;
    return { gather, escort };
  });

probe('Q02', 'A carrier can hold at most one supply box', 1, () => {
  const state = plainBattle([
    fighter('p', 'player', [1, 1], { carried: 1 }), fighter('e', 'enemy', [9, 9]),
  ], { kind: 'gather', exits: [[8, 8]], need: 3 }, [[1, 1]]);
  return step(state, { type: 'act', unit: 'p', to: [1, 1], act: 'wait' }).state.units[0].carried;
});

probe('Q03', 'A dead carrier drops its box back onto the map', 1, () => {
  const carrier = fighter('p', 'player', [1, 1], { carried: 1, hp: 1, weapons: [] });
  const enemy = fighter('e', 'enemy', [2, 1]);
  enemy.stats.str = 99;
  enemy.stats.skl = 99;
  enemy.stats.spd = 99;
  const state = plainBattle([carrier, enemy], { kind: 'gather', exits: [[8, 8]], need: 1 });
  runCombat(state, enemy, carrier, enemy.weapons[0], []);
  assert.equal(carrier.alive, false, 'The fixture must actually defeat the carrier');
  return state.boxes.length;
});

probe('C01', 'A field potion use remains spent after retreat', 1, () => withContext(ctx => {
  const unit = ctx.store.unit(ctx.player.id, 'u_erin');
  unit.items = [{ id: 'vulnerary', uses: 2 }];
  ctx.store.saveUnit(unit, ctx.player.id);
  const record = createFieldBattle([unit], { region: 1, cleared: 0, day: 0, seed: 'audit-potion' });
  record.playerId = ctx.player.id;
  const fighter = record.state.units.find(u => u.id === unit.id);
  fighter.hp = 1;
  const used = step(record.state, { type: 'act', unit: unit.id, to: fighter.pos, act: 'item', item: 0 });
  assert.equal(used.state.units.find(u => u.id === unit.id).items[0].uses, 1);
  record.state = step(used.state, { type: 'retreat' }).state;
  record.events = used.events;
  applyBattleOutcome(ctx.store, ctx.player, record);
  return ctx.store.unit(ctx.player.id, unit.id).items[0].uses;
}));

probe('C02', 'Only the actual protagonist is protected from permanent death', 'dead', () => withContext(ctx => {
  const duplicate = createUnit('erin', 1, 'ordinary-erin', 0, false);
  ctx.store.addUnit(ctx.player.id, duplicate);
  const record = createFieldBattle([duplicate], { region: 1, cleared: 0, day: 0, seed: 'audit-identity' });
  record.playerId = ctx.player.id;
  const unit = record.state.units.find(u => u.id === duplicate.id);
  unit.hp = 0;
  unit.alive = false;
  record.state.result = { winner: 'enemy', reason: 'Audit fixture' };
  applyBattleOutcome(ctx.store, ctx.player, record);
  return ctx.store.unit(ctx.player.id, duplicate.id).status;
}));

probe('M01', 'Retreating without participating does not grant class mastery', 0, () => withContext(ctx => {
  const unit = ctx.store.unit(ctx.player.id, 'u_erin');
  const record = createFieldBattle([unit], { region: 1, cleared: 0, day: 0, seed: 'audit-mastery' });
  record.playerId = ctx.player.id;
  record.state = step(record.state, { type: 'retreat' }).state;
  applyBattleOutcome(ctx.store, ctx.player, record);
  return ctx.store.unit(ctx.player.id, unit.id).classMastery[unit.classId] ?? 0;
}));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const result of results) {
    console.log(`${result.error ? 'ERROR' : result.pass ? 'PASS' : 'MISMATCH'} ${result.id}: ${result.description}`);
    if (!result.pass) console.log(JSON.stringify(result.error ? { error: result.error } : { expected: result.expected, actual: result.actual }));
  }
  const mismatches = results.filter(result => !result.pass && !result.error).length;
  const errors = results.filter(result => result.error).length;
  console.log(`Design audit: ${results.length} probes, ${mismatches} mismatches, ${errors} fixture errors.`);
  process.exitCode = errors ? 2 : mismatches ? 1 : 0;
}
