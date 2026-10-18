import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WEAPON_ART_BY_ID } from '../common/data/weapon-arts.ts';
import { createFieldBattle } from '../common/game/battles.ts';
import { OP } from '../common/protocol/ops.ts';
import type { BattleState, Point } from '../common/engine/types.ts';
import { dispatch, type Context } from './handlers.ts';
import { loginOrRegister } from './auth.ts';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { seedFullRoster } from './test-support.ts';

function setup() {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, 'skill-slots', undefined, '混合技能格');
  seedFullRoster(store, player);
  const ctx: Context = { store, player, accountId, agentModel: null, push: () => {} };
  const unit = store.unit(player.id, 'u_erin')!;
  unit.learnedSkills = ['opening', 'keen', 'nimble', 'focus', 'charge'];
  unit.learnedArts = ['fw_art_20', 'fw_art_21', 'fw_art_27', 'fe_art_gap_stab'];
  unit.weapons = ['steel_sword'];
  unit.weaponInstances = [{ id: 'steel_sword', durability: 40, maxDurability: 40 }];
  store.saveUnit(unit, player.id);
  const equip = (data: Record<string, unknown>) => dispatch(ctx, OP.EQUIP_SKILLS, { unitId: unit.id, ...data });
  const snapshot = () => JSON.stringify({ player: ctx.player, saved: store.getPlayer(player.id), unit: store.unit(player.id, unit.id) });
  return { ctx, unit, equip, snapshot };
}

test('mixed loadouts save once, deduplicate, preserve old callers and expose selected versus learned arts', () => {
  const { ctx, unit, equip, snapshot } = setup();
  const { day, gold } = ctx.player;
  const command = { skills: ['opening', 'keen', 'nimble', 'opening'], arts: ['fw_art_20', 'fw_art_21', 'fw_art_20'], commandId: 'mixed-once' };
  const result = equip(command) as { equippedSkills: string[]; equippedArts: string[]; slots: number };
  const after = snapshot();
  assert.equal(JSON.stringify(equip(command)), JSON.stringify(result));
  assert.equal(snapshot(), after);
  assert.deepEqual(result.equippedSkills, ['opening', 'keen', 'nimble']);
  assert.deepEqual(result.equippedArts, ['fw_art_20', 'fw_art_21']);
  assert.equal(result.slots, 5);
  assert.equal(ctx.player.day, day); assert.equal(ctx.player.gold, gold);
  assert.throws(() => equip({ ...command, arts: [] }), /commandId/);
  equip({ skills: ['opening'] });
  assert.deepEqual(ctx.store.unit(ctx.player.id, unit.id)!.equippedArts, result.equippedArts);
  const mastery = dispatch(ctx, OP.GET_MASTERY, { unitId: unit.id }) as { learnedArts: string[]; equippedArts: string[] };
  const detail = dispatch(ctx, OP.GET_UNIT, { unitId: unit.id }) as { arts: string[]; learnedArts: string[]; equippedArts: string[]; snapshot: { arts: string[] } };
  assert.deepEqual(mastery.learnedArts, unit.learnedArts);
  assert.deepEqual(detail.learnedArts, unit.learnedArts);
  assert.deepEqual(detail.equippedArts, result.equippedArts);
  assert.deepEqual(detail.arts, result.equippedArts);
  assert.deepEqual(detail.snapshot.arts, result.equippedArts);
  equip({ skills: [], arts: [] });
  const loaded = ctx.store.unit(ctx.player.id, unit.id)!;
  assert.deepEqual(loaded.equippedArts, []);
  assert.deepEqual(loaded.learnedArts, unit.learnedArts);
});

test('invalid array payloads, unlearned choices and combined overflow never alter either selection', () => {
  const { unit, equip, snapshot } = setup();
  equip({ skills: ['opening'], arts: ['fw_art_27'] });
  for (const payload of [
    {}, { skills: 'opening' }, { skills: [null] }, { skills: [{}] },
    { skills: [], arts: null }, { skills: [], arts: [2] }, { skills: [], arts: [{}] },
    { skills: ['opening', 'keen', 'nimble', 'focus', 'charge'], arts: ['fw_art_27'] },
    { skills: ['hawkeye'], arts: [] }, { skills: [], arts: ['fw_art_29'] },
    { skills: [], arts: ['fw_art_23'] }, { skills: [], arts: ['missing'] },
    { skills: [], arts: ['__proto__'] }, { skills: ['__proto__'], arts: [] },
    { unitId: 'another-player-unit', skills: [], arts: [] },
  ]) {
    const before = snapshot();
    assert.throws(() => equip(payload), JSON.stringify(payload));
    assert.equal(snapshot(), before, JSON.stringify(payload));
  }
  assert.equal(unit.learnedArts!.length, 4);
});

test('loadouts are camp-only and cannot change dead, retired, expedition, dispatch or annual frozen units', () => {
  for (const condition of ['dead', 'retired', 'run', 'dispatch', 'battle', 'annual', 'lease'] as const) {
    const { ctx, unit, equip, snapshot } = setup();
    if (condition === 'dead' || condition === 'retired') unit.status = condition;
    if (condition === 'run') unit.lockedRunId = 'frozen-run';
    if (condition === 'dispatch') unit.lockedDispatchId = 'busy-dispatch';
    if (condition === 'lease') ctx.player.flags.controlLease = { owner: 'agent', expiresAt: Date.now() + 60_000 };
    ctx.store.saveUnit(unit, ctx.player.id);
    if (condition === 'battle') {
      const other = ctx.store.unit(ctx.player.id, 'u_karl')!;
      const record = createFieldBattle([other], { region: 1, cleared: 0, day: ctx.player.day, seed: 'slots-busy' });
      record.playerId = ctx.player.id; ctx.store.saveBattle(record);
    }
    if (condition === 'annual') dispatch(ctx, OP.REGISTER_ANNUAL, { unitIds: ['u_karl', 'u_ig'] });
    ctx.store.savePlayer(ctx.player);
    const before = snapshot();
    assert.throws(() => equip({ skills: [], arts: ['fw_art_27'] }), condition);
    assert.equal(snapshot(), before, condition);
  }
});

test('battle discovery, forecast and execution reject known but unequipped arts', () => {
  const { ctx, unit, equip } = setup();
  equip({ skills: ['opening'], arts: ['fw_art_27'] });
  const record = createFieldBattle([ctx.store.unit(ctx.player.id, unit.id)!], { region: 1, cleared: 0, day: ctx.player.day, seed: 'selected-art' });
  record.playerId = ctx.player.id;
  record.state.map.tiles = record.state.map.tiles.map(row => row.map(() => 'plain'));
  record.state.objects = [];
  const me = record.state.units.find(row => row.id === unit.id)!;
  const foe = record.state.units.find(row => row.side === 'enemy')!;
  me.pos = [1, 1]; foe.pos = [2, 1];
  record.state.units = [me, foe];
  for (const row of [me, foe]) { row.stats.hp = 1000; row.hp = 1000; }
  ctx.store.saveBattle(record);
  const options = dispatch(ctx, OP.GET_REACHABLE, { unitId: me.id }) as { stops: { pos: Point; arts: { art: string; targets: string[] }[] }[] };
  const here = options.stops.find(stop => stop.pos[0] === 1 && stop.pos[1] === 1)!;
  assert.deepEqual([...new Set(here.arts.map(row => row.art))], ['fw_art_27']);
  assert.ok(here.arts.some(row => row.targets.includes(foe.id)));
  const preview = { attackerId: me.id, from: me.pos, targetId: foe.id, weapon: 'steel_sword' };
  const command = { unitId: me.id, moveTo: me.pos, action: 'art', targetId: foe.id, weapon: 'steel_sword', commandId: 'selected-once' };
  const before = JSON.stringify(ctx.store.battle(ctx.player.id, record.id));
  assert.throws(() => dispatch(ctx, OP.PREVIEW_COMBAT, { ...preview, art: 'fw_art_20' }));
  assert.throws(() => dispatch(ctx, OP.UNIT_ACT, { ...command, art: 'fw_art_20' }));
  assert.equal(JSON.stringify(ctx.store.battle(ctx.player.id, record.id)), before);
  dispatch(ctx, OP.PREVIEW_COMBAT, { ...preview, art: 'fw_art_27' });
  const result = dispatch(ctx, OP.UNIT_ACT, { ...command, art: 'fw_art_27' }) as { state: BattleState };
  assert.equal(JSON.stringify(dispatch(ctx, OP.UNIT_ACT, { ...command, art: 'fw_art_27' })), JSON.stringify(result));
  assert.equal(result.state.units.find(row => row.id === me.id)!.weaponInstances![0].durability, 40 - WEAPON_ART_BY_ID.get('fw_art_27')!.cost);
});

test('loading an old persisted repertoire fills free slots once without deleting learning', () => {
  const { ctx, unit, equip } = setup();
  unit.equippedSkills = ['opening', 'keen'];
  delete unit.equippedArts;
  ctx.store.db.prepare('UPDATE units SET data = ? WHERE id = ? AND player_id = ?').run(JSON.stringify(unit), unit.id, ctx.player.id);
  const loaded = ctx.store.unit(ctx.player.id, unit.id)!;
  assert.deepEqual(loaded.equippedArts, unit.learnedArts!.slice(0, 3));
  assert.deepEqual(loaded.learnedArts, unit.learnedArts);
  equip({ skills: [], arts: [] });
  const reloaded = ctx.store.unit(ctx.player.id, unit.id)!;
  assert.deepEqual(reloaded.equippedArts, []);
  assert.deepEqual(reloaded.learnedArts, unit.learnedArts);
});
