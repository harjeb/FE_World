import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFieldBattle } from '../common/game/battles.ts';
import { WEAPON_ART_BY_ID } from '../common/data/weapon-arts.ts';
import { applyBattleOutcome, flushRecoveryBag, recordDeath, recordRetire, unitDetail } from './services.ts';
import { OP } from '../common/protocol/ops.ts';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginForTest as loginOrRegister } from './test-support.ts';
import { dispatch, type Context } from './handlers.ts';

function setup() {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, 'equipment', undefined, '精炼测试');
  player.gold = 10000;
  store.savePlayer(player);
  store.addInventory(player.id, 'ore', 0, 20);
  const unit = store.units(player.id)[0];
  unit.classId = 'archer';
  unit.ranks.bow = 'D';
  unit.weapons = ['fw_weapon_85', 'fw_weapon_85'];
  unit.weaponInstances = [
    { id: 'fw_weapon_85', durability: 7, maxDurability: 50 },
    { id: 'fw_weapon_85', durability: 12, maxDurability: 40 },
  ];
  store.saveUnit(unit, player.id);
  const ctx: Context = { store, player, accountId, agentModel: null, push: () => {} };
  const refine = (extra = {}) => dispatch(ctx, OP.REFINE_WEAPON, { unitId: unit.id, item: 'fw_weapon_85', ...extra });
  const transfer = (action: string) => dispatch(ctx, OP.TRANSFER_ITEM, { unitId: unit.id, item: 'fw_weapon_85', action });
  return { ctx, unit, refine, transfer };
}

test('refinement pays once per command, caps at three and leaves time/durability/duplicates intact', () => {
  const { ctx, unit, refine } = setup();
  const day = ctx.player.day;
  const ore = ctx.store.countInventory(ctx.player.id, 'ore');
  const result = refine({ commandId: 'once' });
  assert.deepEqual(refine({ commandId: 'once' }), result);
  refine(); refine();
  assert.throws(() => refine());
  assert.equal(ctx.player.gold, 8200);
  assert.equal(ctx.player.day, day);
  assert.equal(ctx.store.countInventory(ctx.player.id, 'ore'), ore - 6);
  assert.deepEqual(ctx.store.unit(ctx.player.id, unit.id)!.weaponInstances, [
    { id: 'fw_weapon_85', durability: 7, maxDurability: 50, refinement: 3 },
    { id: 'fw_weapon_85', durability: 12, maxDurability: 40 },
  ]);
});

test('warehouse FIFO preserves damaged/refined/perfect copies and sell consumes metadata', () => {
  const { ctx, unit, refine, transfer } = setup();
  refine();
  const gold = ctx.player.gold;
  const ore = ctx.store.countInventory(ctx.player.id, 'ore');
  const original = ctx.store.unit(ctx.player.id, unit.id)!.weaponInstances;
  transfer('equip');
  assert.equal(ctx.store.unit(ctx.player.id, unit.id)!.weapons.length, 2);
  transfer('toWarehouse'); transfer('toWarehouse');
  ctx.player.flags.perfectWeapons = { fw_weapon_85: 1 };
  transfer('toUnit'); transfer('toUnit');
  assert.deepEqual(ctx.store.unit(ctx.player.id, unit.id)!.weaponInstances, original);
  assert.equal(ctx.player.flags.perfectWeapons.fw_weapon_85, 1);
  assert.equal(ctx.player.gold, gold);
  assert.equal(ctx.store.countInventory(ctx.player.id, 'ore'), ore);
  transfer('toWarehouse'); transfer('toWarehouse');
  dispatch(ctx, OP.SELL, { item: 'fw_weapon_85', count: 2 });
  assert.deepEqual(ctx.store.getPlayer(ctx.player.id)!.flags.storedWeapons, []);
});

test('equipment discovery, preview and command retry use only the granting weapon and pay once', () => {
  const { ctx, unit } = setup();
  unit.classId = 'swordsman'; unit.ranks.sword = 'C';
  unit.weapons = ['killing_edge', 'steel_sword'];
  unit.weaponInstances = unit.weapons.map(id => ({ id, durability: 30, maxDurability: 40 }));
  ctx.store.saveUnit(unit, ctx.player.id);
  const art = WEAPON_ART_BY_ID.get('fw_art_23')!;
  assert.deepEqual(unit.learnedArts, []);
  assert.ok(unitDetail(unit).equipmentArts.includes(art.id));
  const record = createFieldBattle([unit], { region: 1, cleared: 0, day: ctx.player.day, seed: 'grant-api' });
  record.playerId = ctx.player.id;
  const me = record.state.units.find(row => row.id === unit.id)!, foe = record.state.units.find(row => row.side === 'enemy')!;
  record.state.map = { width: 8, height: 5, tiles: Array.from({ length: 5 }, () => Array.from({ length: 8 }, () => 'plain' as const)) };
  record.state.units = [me, foe]; record.state.objects = []; record.state.scenario = undefined; record.state.goal = { kind: 'rout' };
  me.pos = [2, 2]; foe.pos = [3, 2]; me.hp = me.stats.hp = foe.hp = foe.stats.hp = 1000;
  record.initial = structuredClone(record.state);
  ctx.store.saveBattle(record);
  const reachable = dispatch(ctx, OP.GET_REACHABLE, { unitId: unit.id }) as any;
  const options = reachable.stops.find(stop => stop.pos[0] === 2 && stop.pos[1] === 2).arts;
  assert.ok(options.some(option => option.art === art.id && option.weapon === 'killing_edge'));
  assert.ok(!options.some(option => option.art === art.id && option.weapon === 'steel_sword'));
  const preview = { attackerId: unit.id, from: [2, 2], targetId: foe.id, weapon: 'killing_edge', art: art.id };
  dispatch(ctx, OP.PREVIEW_COMBAT, preview);
  assert.throws(() => dispatch(ctx, OP.PREVIEW_COMBAT, { ...preview, weapon: 'steel_sword' }), /武器/);
  const command = { unitId: unit.id, moveTo: [2, 2], action: 'art', targetId: foe.id, weapon: 'killing_edge', art: art.id, commandId: 'grant-action' };
  const first = dispatch(ctx, OP.UNIT_ACT, command) as any;
  assert.equal(JSON.stringify(dispatch(ctx, OP.UNIT_ACT, command)), JSON.stringify(first));
  assert.equal(ctx.store.activeBattle(ctx.player.id)!.state.units.find(row => row.id === unit.id)!.weaponInstances![0].durability, 30 - art.cost);
  assert.deepEqual(ctx.store.unit(ctx.player.id, unit.id)!.learnedArts, []);
});

test('death, retirement and deferred recovery preserve refined instance resources', () => {
  for (const deferred of [false, true]) {
    const { ctx, unit } = setup();
    unit.isProtagonist = false;
    unit.weaponInstances![0].refinement = 3;
    const expected = structuredClone(unit.weaponInstances);
    if (deferred) recordDeath(ctx.store, ctx.player, unit, 'death', null, true);
    else recordRetire(ctx.store, ctx.player, unit);
    if (deferred) {
      assert.equal(ctx.store.countInventory(ctx.player.id, 'fw_weapon_85'), 0);
      assert.deepEqual(ctx.player.flags.recoveryBag?.filter(row => row.weapon).map(row => row.weapon), expected);
      flushRecoveryBag(ctx.store, ctx.player);
      assert.equal(flushRecoveryBag(ctx.store, ctx.player), 0);
    }
    assert.equal(ctx.store.countInventory(ctx.player.id, 'fw_weapon_85'), 2);
    assert.deepEqual(ctx.player.flags.storedWeapons, expected);
    assert.deepEqual(ctx.store.unit(ctx.player.id, unit.id)!.weaponInstances, []);
  }
});

test('lethal annual matches persist resources but simulated arena matches do not', () => {
  for (const lethal of [false, true]) {
    const { ctx, unit } = setup();
    const record = createFieldBattle([unit], { region: 1, cleared: 0, day: ctx.player.day, seed: 'grant-resource' });
    record.kind = 'arena'; record.mode = lethal ? 'festival' : 'arena';
    record.state.units.find(row => row.id === unit.id)!.weaponInstances![0].durability = 2;
    applyBattleOutcome(ctx.store, ctx.player, record);
    assert.equal(ctx.store.unit(ctx.player.id, unit.id)!.weaponInstances![0].durability, lethal ? 2 : 7);
  }
});

test('battle and annual locks reject refinement without payment', () => {
  for (const annual of [false, true]) {
    const { ctx, unit, refine } = setup();
    if (annual) {
      ctx.store.saveAnnualEntry({ id: 'annual', playerId: ctx.player.id, annualIndex: 1, state: 'qualifier', qualifierWins: 0, qualifierCount: 0, round: 0, unitIds: [unit.id], carry: {}, battleId: null, createdAt: 0, updatedAt: 0 });
    } else {
      const battle = createFieldBattle([unit], { region: 1, cleared: 0, day: ctx.player.day, seed: 'busy' });
      battle.playerId = ctx.player.id;
      ctx.store.saveBattle(battle);
    }
    const before = JSON.stringify({ player: ctx.player, unit: ctx.store.unit(ctx.player.id, unit.id), inventory: ctx.store.inventory(ctx.player.id) });
    assert.throws(() => refine(), annual ? /大竞技场/ : /战斗/);
    assert.equal(JSON.stringify({ player: ctx.player, unit: ctx.store.unit(ctx.player.id, unit.id), inventory: ctx.store.inventory(ctx.player.id) }), before);
  }
});

test('invalid requests and insufficient resources never mutate', () => {
  for (const scenario of ['gold', 'ore', 'inactive', 'run', 'dispatch', 'missing', 'fraction', 'negative', 'unsupported']) {
    const { ctx, unit, refine } = setup();
    if (scenario === 'gold') ctx.player.gold = 0;
    if (scenario === 'ore') ctx.store.takeInventory(ctx.player.id, 'ore', 1000);
    if (scenario === 'inactive') unit.status = 'dead';
    if (scenario === 'run') unit.lockedRunId = 'locked';
    if (scenario === 'dispatch') unit.lockedDispatchId = 'locked';
    if (scenario === 'missing') unit.weaponInstances = [];
    if (scenario === 'fraction') unit.weaponInstances![0].refinement = 0.5;
    if (scenario === 'negative') unit.weaponInstances![0].refinement = -1;
    ctx.store.saveUnit(unit, ctx.player.id);
    ctx.store.savePlayer(ctx.player);
    const snapshot = () => JSON.stringify({ player: ctx.player, unit: ctx.store.unit(ctx.player.id, unit.id), inventory: ctx.store.inventory(ctx.player.id) });
    const before = snapshot();
    assert.throws(() => refine(scenario === 'unsupported' ? { item: 'iron_sword' } : {}), scenario);
    assert.equal(snapshot(), before, scenario);
  }
  const { refine } = setup();
  assert.throws(() => refine({ unitId: 'missing' }));
  assert.throws(() => refine({ item: 1 }));
});
