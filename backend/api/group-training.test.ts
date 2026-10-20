import assert from 'node:assert/strict';
import test from 'node:test';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginOrRegister } from './auth.ts';
import { seedFullRoster } from './test-support.ts';
import { dispatch, type Context } from './handlers.ts';
import { syncPlayer } from './services.ts';
import { OP } from '../common/protocol/ops.ts';
import { TRAINING_GROUPS, trainingLimit } from '../common/game/training.ts';
import { addWeaponExp, createUnit, RANK_EXP } from '../common/game/model.ts';

function setup(t: { after: (fn: () => void) => void }, day = 0): Context {
  const store = new Store(openDb(':memory:'));
  t.after(() => store.db.close());
  const { accountId, player } = loginOrRegister(store, 'group-training');
  seedFullRoster(store, player);
  player.day = day;
  store.savePlayer(player);
  return { store, accountId, player: syncPlayer(store, player), agentModel: null, push() {} };
}
const snapshot = (ctx: Context) => JSON.stringify({ player: ctx.player, units: ctx.store.units(ctx.player.id) });

for (const [day, limit] of [[0, 1], [499, 1], [500, 3], [999, 3], [1000, 5], [1499, 5], [1500, 8], [5000, 8]]) {
  test(`training on day ${day} allows ${limit} people and charges one shared duration`, t => {
    const ctx = setup(t, day);
    const units = ctx.store.units(ctx.player.id).filter(unit => unit.status === 'active');
    const unitIds = units.slice(0, limit).map(unit => unit.id);
    assert.equal(trainingLimit(day), limit);
    const action = (dispatch(ctx, OP.GET_TODAY, {}) as any).actions.find((row: any) => row.key === 'train');
    assert.equal(action.maxUnits, limit);
    assert.equal(action.groups.length, 3);
    assert.throws(() => dispatch(ctx, OP.TRAIN, { unitIds: units.slice(0, limit + 1).map(unit => unit.id), groupId: 'agility' }), /最多/);
    const gold = ctx.player.gold;
    dispatch(ctx, OP.TRAIN, { unitIds, groupId: 'agility' });
    assert.equal(ctx.player.day, day + 3);
    assert.equal(ctx.player.gold, gold - 200 * limit);
  });
}

for (const group of TRAINING_GROUPS) {
  test(`${group.id}: every grouped weapon gains XP even without gear or class permission; quote and retry match`, t => {
    const ctx = setup(t, 500);
    const ids = ['u_erin', 'u_owen', 'u_noah'];
    const before = ids.map(id => ctx.store.unit(ctx.player.id, id)!);
    const quote = dispatch(ctx, OP.PREVIEW_ACTION, { action: 'train', unitIds: ids, groupId: group.id }) as any;
    assert.deepEqual([quote.costGold, quote.costDays, quote.blockers], [600, 3, []]);
    const payload = { quoteId: quote.quoteId, commandId: `group-${group.id}` };
    const result = dispatch(ctx, OP.EXECUTE_ACTION, payload) as any;
    assert.equal(result.units.length, 3);
    for (let index = 0; index < ids.length; index++) {
      const after = ctx.store.unit(ctx.player.id, ids[index])!;
      for (const type of group.weapons) {
        const prior = Math.max(before[index].weaponExp[type] ?? 0, RANK_EXP[before[index].ranks[type] ?? 'E']);
        assert.equal(after.weaponExp[type], prior + 3, `${after.id} ${type}`);
      }
      assert.deepEqual([after.level, after.exp, after.stats, after.classMastery], [before[index].level, before[index].exp, before[index].stats, before[index].classMastery]);
      assert.equal(result.units[index].weapons.length, group.weapons.length);
    }
    const after = snapshot(ctx);
    assert.deepEqual(dispatch(ctx, OP.EXECUTE_ACTION, payload), result);
    assert.equal(snapshot(ctx), after);
  });
}

test('all selections validate before charging or granting any XP, including busy members after the first', t => {
  const ctx = setup(t, 500);
  const locked = ctx.store.unit(ctx.player.id, 'u_owen')!;
  locked.lockedDispatchId = 'busy';
  ctx.store.saveUnit(locked, ctx.player.id);
  const invalid = [
    { unitIds: [], groupId: 'agility' },
    { unitIds: ['u_erin', 'u_erin'], groupId: 'agility' },
    { unitIds: ['u_erin', 'u_owen'], groupId: 'agility' },
    { unitIds: ['u_erin'], groupId: 'invalid' },
    { unitIds: ['u_erin'] },
    { unitIds: ['u_erin'], groupId: 'agility', weaponType: 'sword' },
  ];
  for (const payload of invalid) {
    const before = snapshot(ctx);
    assert.throws(() => dispatch(ctx, OP.TRAIN, payload));
    assert.equal(snapshot(ctx), before);
  }
  ctx.player.gold = 399;
  ctx.store.savePlayer(ctx.player);
  const before = snapshot(ctx);
  assert.throws(() => dispatch(ctx, OP.TRAIN, { unitIds: ['u_erin', 'u_noah'], groupId: 'mystic' }), /400/);
  assert.equal(snapshot(ctx), before);
});

test('E to D requires 50 weapon experience and an existing D rank never regresses', () => {
  const unit = createUnit('erin', 1, 'threshold', 0, true, { classId: 'gladiator', startingGear: 'basic' });
  assert.equal(addWeaponExp(unit, 'sword', 49), null);
  assert.equal(unit.ranks.sword, 'E');
  assert.equal(addWeaponExp(unit, 'sword', 1), 'D');
  unit.weaponExp.sword = 30;
  assert.equal(addWeaponExp(unit, 'sword', 1), null);
  assert.equal(unit.ranks.sword, 'D');
  assert.equal(unit.weaponExp.sword, 51);
});
