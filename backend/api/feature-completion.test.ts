import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginOrRegister } from './auth.ts';
import { seedFullRoster } from './test-support.ts';
import { dispatch } from './handlers.ts';
import type { Context } from './handlers.ts';
import { syncPlayer } from './services.ts';
import { OP, PUSH_OPS } from '../common/protocol/ops.ts';
import { schemaFor } from '../common/protocol/schemas.ts';
import { growthRates, equipmentSkills, createUnit } from '../common/game/model.ts';
import { createClassicBattle } from '../common/game/battles.ts';
import { actionOptions } from '../common/engine/ranges.ts';
import { step } from '../common/engine/step.ts';
import { WEAPONS } from '../common/data/weapons.ts';
import { dicePayout, FROG_CHANCE, frogPayout, FROG_RETURN_TENTHS, frogRace, MINIGAME_PLAYS_PER_QUARTER } from '../common/game/minigames.ts';
import { SPELLBOOKS } from '../common/data/spellbooks.ts';
import { WEAPON_ARTS } from '../common/data/weapon-arts.ts';
import { replayCompatibility, RULESET_VERSION } from '../common/game/version.ts';
import { CLASS_ABILITIES } from '../common/data/class-abilities.ts';

function setup(name: string) {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, name, undefined, '测试军团');
  seedFullRoster(store, player);
  return { store, accountId, player: syncPlayer(store, player) };
}
function ctxFor(store: Store, accountId: string, player: ReturnType<typeof setup>['player'], actor?: string): Context {
  return { store, accountId, player, agentModel: actor === 'agent' ? 'test' : null, actor, push: () => {} };
}

test('tavern candidates are quarterly, paid and never rerolled', () => {
  const { store, accountId, player } = setup('tavern');
  const ctx = ctxFor(store, accountId, player);
  const view = dispatch(ctx, OP.GET_TAVERN, {}) as { quarter: number; regions: { id: string; price: number; region: number; hired: boolean }[] };
  assert.equal(view.quarter, Math.floor(player.day / 125));
  assert.equal(view.regions.filter(row => row.region === 2).length, 3);
  const row = view.regions.find(entry => entry.region === 2)!;
  const gold = player.gold;
  const hired = dispatch(ctx, OP.HIRE_TAVERN, { region: 2, id: row.id }) as { hired: boolean; unit: { id: string } };
  assert.equal(hired.hired, true);
  assert.ok(player.gold < gold);
  assert.throws(() => dispatch(ctx, OP.HIRE_TAVERN, { region: 2, id: row.id }), /雇佣/);
  assert.ok(store.unit(player.id, hired.unit.id));
});

test('challenge floors charge days, record clears and pay first/repeat rewards once', () => {
  const { store, accountId, player } = setup('challenge');
  const ctx = ctxFor(store, accountId, player);
  const before = player.day;
  const started = dispatch(ctx, OP.START_CHALLENGE, { floorId: 'tower-1', unitIds: ['u_erin', 'u_victor', 'u_gustav', 'u_lina', 'u_owen', 'u_noah'] }) as { battleId: string; floor: { costDays: number } };
  assert.equal(player.day, before + started.floor.costDays);
  assert.equal(store.battle(player.id, started.battleId)?.challengeId, 'tower-1');
  player.flags.towerCleared = ['tower-1'];
  store.savePlayer(player);
  const reward = dispatch(ctx, OP.CLAIM_CHALLENGE_REWARD, { floorId: 'tower-1' }) as { key: string; gold: number };
  assert.equal(reward.key, 'tower-1:first');
  assert.ok(reward.gold > 0);
  const repeat = dispatch(ctx, OP.CLAIM_CHALLENGE_REWARD, { floorId: 'tower-1' }) as { key: string };
  assert.equal(repeat.key, 'tower-1:repeat');
  assert.throws(() => dispatch(ctx, OP.CLAIM_CHALLENGE_REWARD, { floorId: 'tower-1' }), /已经领取/);
});

test('dancer can return one acted ally to action; SS/SSS weapons require the new ranks', () => {
  const dancer = createUnit('lina', 20, 'dancer', 0, true, { classId: 'dancer' });
  const ally = createUnit('victor', 20, 'ally', 0);
  const record = createClassicBattle([dancer, ally], { mapId: 'fe1-ch16', seed: 'dance', day: 0 });
  const battle = record.state;
  const dancerUnit = battle.units.find(unit => unit.id === 'dancer')!;
  const allyUnit = battle.units.find(unit => unit.id === 'ally')!;
  allyUnit.acted = true;
  const options = actionOptions(battle, dancerUnit, dancerUnit.pos);
  assert.ok(options.dance.includes('ally'));
  const result = step(battle, { type: 'act', unit: 'dancer', to: dancerUnit.pos, act: 'dance', target: 'ally' });
  assert.equal(result.state.units.find(unit => unit.id === 'ally')!.acted, false);
  // 舞蹈只能选相邻友军：拉远后既不出现在可用列表，也不能提交。
  const far = structuredClone(battle);
  const farDancer = far.units.find(unit => unit.id === 'dancer')!;
  const farAlly = far.units.find(unit => unit.id === 'ally')!;
  farDancer.pos = [1, 1];
  farAlly.pos = [4, 1];
  farAlly.acted = true;
  assert.ok(!actionOptions(far, farDancer, farDancer.pos).dance.includes(farAlly.id));
  assert.throws(() => step(far, { type: 'act', unit: 'dancer', to: farDancer.pos, act: 'dance', target: 'ally' }), /相邻/);
  assert.equal(WEAPONS.royal_sword.rank, 'SS');
  assert.equal(WEAPONS.divine_lance.rank, 'SSS');
});

test('minigame odds and quarterly quota follow the documented rules', () => {
  let big = 0, small = 0, triple = 0;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) {
    const result = { dice: [a, b, c] as [number, number, number], total: a + b + c, triple: a === b && b === c, big: a + b + c >= 11 };
    if (result.triple) triple++; else if (result.big) big++; else small++;
  }
  assert.deepEqual([big, small, triple], [105, 105, 6]);
  assert.equal(dicePayout(50, 'big', { dice: [6, 6, 6], total: 18, triple: true, big: true }), 0);
  const race = frogRace('fixed');
  assert.equal(new Set(race.order).size, 4);
  // 固定强弱：夺冠率 40/20/30/10%，返还 2.4/4.8/3.2/9.6 倍，每只期望返还都是 96%，各档下注都整除。
  for (let frog = 0; frog < 4; frog++) {
    assert.equal(FROG_CHANCE[frog] * FROG_RETURN_TENTHS[frog], 960);
    for (const bet of [20, 50, 100]) {
      const paid = frogPayout(bet, frog, { order: [frog], winner: frog });
      assert.ok(Number.isInteger(paid) && paid === bet * FROG_RETURN_TENTHS[frog] / 10);
    }
  }
  assert.equal(frogPayout(100, 1, { order: [0, 1, 2, 3], winner: 0 }), 0);
  const wins = [0, 0, 0, 0];
  for (let i = 0; i < 20_000; i++) wins[frogRace(`odds-${i}`).winner]++;
  wins.forEach((n, frog) => assert.ok(Math.abs(n / 200 - FROG_CHANCE[frog]) < 1.5, `frog ${frog}: ${n / 200}%`));
  const { store, accountId, player } = setup('minigame');
  const ctx = ctxFor(store, accountId, player);
  const plays = dispatch(ctx, OP.GET_MINIGAMES, {}) as { limit: number; played: number };
  assert.equal(plays.limit, MINIGAME_PLAYS_PER_QUARTER);
  const before = player.gold;
  dispatch(ctx, OP.PLAY_MINIGAME, { game: 'dice', bet: 20, choice: 'big', commandId: 'dice-once' });
  const replay = dispatch(ctx, OP.PLAY_MINIGAME, { game: 'dice', bet: 20, choice: 'big', commandId: 'dice-once' }) as { net: number };
  assert.equal(typeof replay.net, 'number');
  assert.equal(player.gold <= before + 40, true);
  assert.equal(player.flags.minigamePlays, 1);
});

test('first-release catalogs contain all 170 designed templates plus legacy compatibility rows and 315 arts', () => {
  const staves = Object.values(WEAPONS).filter(weapon => weapon.type === 'staff').length;
  assert.equal(staves, 9);
  assert.equal(Object.keys(WEAPONS).length, 137);
  assert.equal(SPELLBOOKS.length, 50);
  const source = JSON.parse(readFileSync(new URL('../../docs/data/fw-equipment-expansion.json', import.meta.url), 'utf8'));
  const design = [...source.baseline, ...source.weapons, ...source.spells];
  assert.equal(new Set(design.map(row => row.id)).size, 170);
  for (const row of design) assert.ok(row.kind === 'spellbook' || row.id.startsWith('fw_spell_')
    ? SPELLBOOKS.some(book => book.id === row.id) : Object.hasOwn(WEAPONS, row.id), row.id);
  assert.equal(WEAPON_ARTS.length, 315);
  assert.equal(CLASS_ABILITIES.length, 58);
  for (const weapon of Object.values(WEAPONS)) {
    if (weapon.type === 'tome' || weapon.type === 'staff') assert.ok(weapon.maxCharges);
    else assert.ok(weapon.maxDurability);
  }
});

test('learned weapon arts are exposed and validated against weapon type', () => {
  const unit = createUnit('victor', 20, 'artist', 0, true, { classId: 'swordsman' });
  unit.weapons = ['iron_sword']; unit.ranks.sword = 'C';
  unit.learnedArts = [WEAPON_ARTS.find(art => art.weapon === 'sword')!.id];
  unit.equippedArts = [...unit.learnedArts];
  const record = createClassicBattle([unit], { mapId: 'fe1-ch16', seed: 'art', day: 0 });
  const battle = record.state;
  const player = battle.units.find(entry => entry.id === 'artist')!;
  const options = actionOptions(battle, player, player.pos);
  assert.ok(options.arts.length > 0);
  player.ranks.sword = 'E';
  assert.equal(actionOptions(battle, player, player.pos).arts.length, 0);
  player.ranks.sword = 'C'; player.weapons = ['iron_lance'];
  assert.equal(actionOptions(battle, player, player.pos).arts.length, 0);
});

test('store transactions roll back business writes and reject stale player versions', () => {
  const { store, player } = setup('transactions');
  const gold = player.gold;
  assert.throws(() => store.transaction(() => {
    player.gold = 1;
    store.savePlayer(player);
    throw new Error('injected');
  }), /injected/);
  const reloaded = store.getPlayer(player.id)!;
  assert.equal(reloaded.gold, gold);
  const stale = store.getPlayer(player.id)!;
  reloaded.gold = 10;
  reloaded.version += 1;
  store.savePlayer(reloaded);
  stale.gold = 20;
  assert.throws(() => store.savePlayer(stale, stale.version), /VERSION_CONFLICT/);
});

test('equipped weapons grant skills and growth without occupying the five skill slots', () => {
  const unit = createUnit('victor', 10, 'equipped', 0, true);
  const base = growthRates(unit).spd;
  unit.weapons = ['royal_sword'];
  assert.equal(equipmentSkills(unit).includes('opening'), true);
  assert.ok(growthRates(unit).spd > base);
  assert.deepEqual(unit.equippedSkills, []);
});

test('magic classes carry spellbooks and expose cast options', () => {
  const unit = createUnit('sera', 20, 'spellcaster', 0, true, { classId: 'mage' });
  assert.ok((unit.spellbooks?.length ?? 0) > 0);
  const record = createClassicBattle([unit], { mapId: 'fe1-ch16', seed: 'cast', day: 0 });
  const player = record.state.units.find(entry => entry.id === 'spellcaster')!;
  assert.ok(actionOptions(record.state, player, player.pos).casts.length > 0);
});

test('stale web sessions expire while agent tokens remain separate', () => {
  const { store, accountId } = setup('sessions');
  const token = store.createSession(accountId);
  store.db.prepare('UPDATE sessions SET last_seen = 0 WHERE token = ?').run(token);
  assert.equal(store.resolveSession(token), null);
  const agent = store.createToken(accountId, 'agent', 'test');
  assert.equal(store.resolveToken(agent)?.accountId, accountId);
});

test('replay versions distinguish current, old-rule and old-engine records', () => {
  assert.equal(replayCompatibility({ engineVersion: 1, rulesetVersion: RULESET_VERSION }).compatible, true);
  assert.equal(replayCompatibility({ engineVersion: 1, rulesetVersion: 'rules-v2' }).compatible, false);
  assert.equal(replayCompatibility({ engineVersion: 1, rulesetVersion: 'rules-v3' }).compatible, false);
  assert.equal(replayCompatibility({ engineVersion: 1, rulesetVersion: 'rules-v4' }).compatible, false);
  assert.equal(replayCompatibility({ engineVersion: 1, rulesetVersion: 'rules-v5' }).compatible, false);
  assert.equal(replayCompatibility({ engineVersion: 1, rulesetVersion: 'rules-v6' }).compatible, false);
  assert.equal(replayCompatibility({ engineVersion: 1, rulesetVersion: 'rules-v26' }).compatible, false);
  assert.equal(replayCompatibility({ engineVersion: 0, rulesetVersion: RULESET_VERSION }).compatible, false);
});

test('events are committed with an outbox row that can be retried and acked', () => {
  const { store, player } = setup('outbox');
  const id = store.addEvent(player.id, 'test', 'delivery', { ok: true });
  const pending = store.pendingOutbox();
  assert.ok(pending.some(row => row.eventId === id));
  store.markOutboxDelivered([id]);
  assert.equal(store.pendingOutbox().some(row => row.eventId === id), false);
  assert.ok(store.events(player.id, 0, 1000).some(event => event.id === id));
});

test('control lease blocks the other actor until released', () => {
  const { store, accountId, player } = setup('lease');
  const human = ctxFor(store, accountId, player, 'human');
  const agent = ctxFor(store, accountId, player, 'agent');
  dispatch(agent, OP.CLAIM_CONTROL, {});
  assert.throws(() => dispatch(human, OP.REST, { days: 1 }), /控制权/);
  dispatch(agent, OP.REST, { days: 1 });
  dispatch(agent, OP.RELEASE_CONTROL, {});
  dispatch(human, OP.REST, { days: 1 });
});

test('every public request has a schema entry for Agent/MCP discovery', () => {
  for (const [name, op] of Object.entries(OP)) {
    if (!PUSH_OPS.has(op)) assert.ok(schemaFor(name), name);
  }
  assert.equal(schemaFor('UNKNOWN_OP'), undefined);
});
