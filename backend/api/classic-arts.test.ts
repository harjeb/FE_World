import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFieldBattle } from '../common/game/battles.ts';
import { WEAPON_ART_BY_ID } from '../common/data/weapon-arts.ts';
import { OP } from '../common/protocol/ops.ts';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginForTest as loginOrRegister } from './test-support.ts';
import { dispatch, type Context } from './handlers.ts';

function fixture(artId: string, weapon = 'fw_weapon_65') {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, 'classic-arts', undefined, '战技');
  const ctx: Context = { store, player, accountId, agentModel: null, push: () => {} };
  const unit = store.units(player.id)[0];
  const record = createFieldBattle([unit], { region: 1, cleared: 0, day: player.day, seed: 'classic-api' });
  record.playerId = player.id;
  const me = record.state.units.find(u => u.id === unit.id)!, foe = record.state.units.find(u => u.side === 'enemy')!;
  record.state.map = { width: 8, height: 5, tiles: Array.from({ length: 5 }, () => Array.from({ length: 8 }, () => 'plain' as const)) };
  record.state.units = [me, foe]; record.state.objects = []; record.state.scenario = undefined; record.state.goal = { kind: 'rout' };
  me.pos = [2, 2]; foe.pos = [3, 2]; me.hp = me.stats.hp = foe.hp = foe.stats.hp = 1000;
  me.weapons = [weapon as never]; me.weaponInstances = [{ id: weapon as never, durability: 50, maxDurability: 50 }];
  me.classId = artId === 'swift_thrusts' ? 'paladin' : artId === 'fw_art_69' ? 'bow_knight' : artId === 'fw_art_86' ? 'monk' : 'berserker';
  me.ranks = { ...me.ranks, axe: 'S', lance: 'S', fist: 'S', staff: 'S', bow: 'S' };
  me.arts = [artId];
  const save = () => { record.initial = structuredClone(record.state); store.saveBattle(record); };
  save();
  const preview = (extra = {}) => dispatch(ctx, OP.PREVIEW_COMBAT, { attackerId: me.id, from: me.pos, targetId: foe.id, weapon, art: artId, ...extra }) as any;
  const act = (extra = {}) => dispatch(ctx, OP.UNIT_ACT, { unitId: me.id, moveTo: me.pos, action: 'art', targetId: foe.id, weapon, art: artId, ...extra }) as any;
  const snapshot = () => JSON.stringify(store.activeBattle(player.id));
  return { ctx, record, me, foe, save, preview, act, snapshot };
}

test('wall-only discovery, object preview and player/agent receipt charge once', () => {
  const f = fixture('fw_art_60');
  f.record.state.objects = [{ id: 'wall', kind: 'wall', pos: [2, 3], state: 'intact', hp: 100, maxHp: 100 }];
  f.foe.pos = [7, 4]; f.save();
  const reachable = dispatch(f.ctx, OP.GET_REACHABLE, { unitId: f.me.id }) as any;
  const option = reachable.stops.find(s => s.pos.join() === '2,2').arts.find(a => a.art === 'fw_art_60');
  assert.deepEqual(option.objects, ['wall']);
  const before = f.snapshot();
  const preview = f.preview({ targetId: 'wall' });
  assert.equal(preview.hp, 100); assert.ok(preview.damage > 0); assert.equal('exp' in preview, false);
  assert.equal(f.snapshot(), before);
  const command = { targetId: 'wall', commandId: 'wall-once' };
  const result = f.act(command);
  f.ctx.agentModel = 'test-agent';
  assert.deepEqual(f.act(command), result);
  const state = f.ctx.store.activeBattle(f.ctx.player.id)!.state;
  assert.equal(state.units.find(u => u.id === f.me.id)!.weaponInstances![0].durability, 50 - WEAPON_ART_BY_ID.get('fw_art_60')!.cost);
  assert.equal(state.objects![0].hp, preview.hpAfter);
});

test('post move preview rejects before RNG/payment; execution moves without refreshing action', () => {
  const f = fixture('fw_art_69', 'steel_bow');
  f.foe.pos = [4, 2]; f.save();
  const before = f.snapshot();
  assert.throws(() => f.preview({ postTo: [99, 99] }));
  assert.throws(() => f.act({ postTo: [99, 99] }));
  assert.equal(f.snapshot(), before);
  f.preview({ postTo: [1, 2] });
  f.act({ postTo: [1, 2] });
  const me = f.ctx.store.activeBattle(f.ctx.player.id)!.state.units.find(u => u.id === f.me.id)!;
  assert.deepEqual(me.pos, [1, 2]); assert.equal(me.acted, true);
  assert.throws(() => f.act());
});

test('support malformed, nested, unknown and unavailable resources fail atomically in both ops', () => {
  const f = fixture('fw_art_86', 'steel_gauntlet');
  for (const support of [null, [], { target: f.me.id }, { target: f.me.id, spell: 'unknown' },
    { target: f.me.id, weapon: 'heal', spell: 'unknown' }, { target: f.me.id, weapon: 'heal', art: 'fw_art_86' },
    { target: f.me.id, weapon: 'heal', action: { action: 'attack' } }, { targetId: f.me.id, weapon: 'heal' }]) {
    const before = f.snapshot();
    assert.throws(() => f.preview({ support })); assert.throws(() => f.act({ support }));
    assert.equal(f.snapshot(), before);
  }
});


test('fw86 pays a separate heal resource without granting another attack', () => {
  const f = fixture('fw_art_86', 'steel_gauntlet');
  f.me.weapons.push('heal');
  f.me.bookInstances = [{ id: 'heal', charges: 2, maxCharges: 20 }];
  const ally = structuredClone(f.me); ally.id += '-ally'; ally.pos = [1, 2]; ally.hp -= 100;
  f.record.state.units.push(ally); f.save();
  f.me.bookInstances![0].charges = 0; f.save();
  const empty = f.snapshot();
  assert.throws(() => f.preview({ support: { target: ally.id, weapon: 'heal' } }));
  assert.throws(() => f.act({ support: { target: ally.id, weapon: 'heal' } }));
  assert.equal(f.snapshot(), empty);
  f.me.bookInstances![0].charges = 2; f.save();
  const before = f.snapshot();
  f.preview({ support: { target: ally.id, weapon: 'heal' } });
  assert.equal(f.snapshot(), before);
  f.act({ support: { target: ally.id, weapon: 'heal' }, commandId: 'heal-once' });
  const me = f.ctx.store.activeBattle(f.ctx.player.id)!.state.units.find(u => u.id === f.me.id)!;
  assert.equal(me.bookInstances![0].charges, 1);
  assert.ok(f.ctx.store.activeBattle(f.ctx.player.id)!.state.units.find(u => u.id === ally.id)!.hp > ally.hp); assert.equal(me.acted, true);
  assert.throws(() => f.act());
});

test('fixed multihit and primary/secondary forecasts agree with deterministic runtime and retry', () => {
  for (const art of ['swift_thrusts', 'axe_sweep']) {
    const f = fixture(art, art === 'swift_thrusts' ? 'steel_lance' : 'steel_axe');
    f.me.stats.skl = 1000; f.me.stats.lck = 0; f.me.stats.str = 40;
    f.foe.stats.spd = 0; f.foe.stats.lck = 1000; f.foe.stats.def = 10;
    const secondary = structuredClone(f.foe); secondary.id += '-secondary'; secondary.pos = [2, 3];
    if (art === 'axe_sweep') f.record.state.units.push(secondary);
    f.save();
    const extra = art === 'axe_sweep' ? { secondaryId: secondary.id } : {};
    const preview = f.preview(extra);
    const command = { ...extra, commandId: art };
    const result = f.act(command);
    assert.deepEqual(f.act(command), result);
    const state = f.ctx.store.activeBattle(f.ctx.player.id)!.state;
    const lost = 1000 - state.units.find(u => u.id === f.foe.id)!.hp;
    assert.ok(lost > 0);
    assert.ok(Math.abs(lost - preview.expectedDealt) < 1e-8);
    if (art === 'axe_sweep') {
      assert.ok(preview.targets.length >= 2);
      assert.equal(1000 - state.units.find(u => u.id === secondary.id)!.hp, lost);
    }
  }
});
