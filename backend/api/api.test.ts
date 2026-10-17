import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginOrRegister } from './auth.ts';
import { seedFullRoster, seedDefense } from './test-support.ts';
import { dispatch } from './handlers.ts';
import type { Context } from './handlers.ts';
import { applyBattleOutcome, syncPlayer, stateView } from './services.ts';
import { OP } from '../common/protocol/ops.ts';
import { createFieldBattle, FIELD_BATTLE } from '../common/game/battles.ts';
import { decide } from '../common/engine/index.ts';
import { tick } from '../worker/worker.ts';
import { TERRAINS } from '../common/maps/map.ts';
import { officialOpponents, runDefenseTrials } from '../common/game/arena.ts';
import type { Player } from './store.ts';

function setup() {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, 'tester', undefined, '测试军团');
  seedFullRoster(store, player);
  seedDefense(store, player);
  return { store, accountId, player: syncPlayer(store, player) };
}

function ctxFor(store: Store, accountId: string, player: Player): Context {
  return { store, accountId, player, agentModel: null, push: () => {} };
}

// Plays the active battle to the end through the real op handlers with the rule AI.
function playOut(ctx: Context): void {
  for (let guard = 0; guard < 600; guard++) {
    const battle = ctx.store.activeBattle(ctx.player.id);
    if (!battle || battle.state.result) return;
    const unit = battle.state.units.find(u => u.side === 'player' && u.alive && !u.acted);
    if (unit) {
      const action = decide(battle.state, unit);
      dispatch(ctx, OP.UNIT_ACT, {
        battleId: battle.id, unitId: unit.id, moveTo: action.to, action: action.act,
        targetId: 'target' in action ? action.target : undefined,
        weapon: 'weapon' in action ? action.weapon : undefined,
        item: 'item' in action ? action.item : undefined,
      });
    } else {
      dispatch(ctx, OP.END_PHASE, { battleId: battle.id });
    }
  }
  throw new Error('battle did not finish');
}

test('a new account gets a playable seeded roster and state', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const state = stateView(store, player) as Record<string, unknown>;
  assert.equal((state.units as unknown[]).length, 12);
  assert.equal(state.gold, 13_120);
  assert.equal((state.date as { label: string }).label.includes('竞技场日'), true);
  const roster = dispatch(ctx, OP.GET_ROSTER, {}) as { count: number };
  assert.equal(roster.count, 12);
});

test('a fresh account starts with a placeholder protagonist and completes a self-made setup once', () => {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, 'fresh', undefined, '新军团');
  const ctx = ctxFor(store, accountId, player);
  type View = { units: { id: string; name: string; character: string }[]; setup: { needed: boolean; pool: { id: string }[]; protagonist: { budget: number; maxPerStat: number } } };
  const fresh = stateView(store, player) as View;
  assert.equal(fresh.units.length, 1, '开局只有占位主角');
  assert.equal(fresh.setup.needed, true);
  assert.ok(fresh.setup.protagonist.budget > 0);
  const pool = fresh.setup.pool.map(c => c.id);
  assert.ok(pool.includes('victor'));
  assert.ok(!pool.includes('ren'), '剧情奖励人物不能当同伴');
  const hero = { name: '星见', sex: 'female', classId: 'mage', growthType: 'normal', tendency: 'magic', portrait: 'sera', allocation: { mag: 4, spd: 3 } };
  assert.throws(() => dispatch(ctx, OP.COMPLETE_SETUP, { protagonist: { ...hero, name: '甲' }, companions: ['victor', 'lina'] }), /2–12/);
  assert.throws(() => dispatch(ctx, OP.COMPLETE_SETUP, { protagonist: { ...hero, classId: 'beast' }, companions: ['victor', 'lina'] }), /职业/);
  assert.throws(() => dispatch(ctx, OP.COMPLETE_SETUP, { protagonist: { ...hero, allocation: { mag: 99 } }, companions: ['victor', 'lina'] }), /0–6/);
  assert.throws(() => dispatch(ctx, OP.COMPLETE_SETUP, { protagonist: hero, companions: ['victor'] }), /2 名/);
  assert.throws(() => dispatch(ctx, OP.COMPLETE_SETUP, { protagonist: hero, companions: ['victor', 'victor'] }), /重复/);
  assert.throws(() => dispatch(ctx, OP.COMPLETE_SETUP, { protagonist: hero, companions: ['victor', 'ren'] }), /不能作为开局同伴/);
  const done = dispatch(ctx, OP.COMPLETE_SETUP, { protagonist: hero, companions: ['victor', 'lina'] }) as { protagonist: { name: string; classId: string }; companions: string[] };
  assert.equal(done.protagonist.name, '星见');
  assert.equal(done.protagonist.classId, 'mage');
  assert.deepEqual(done.companions, ['victor', 'lina']);
  const after = stateView(store, player) as View;
  assert.equal(after.units.length, 3);
  assert.equal(after.setup.needed, false);
  const heroUnit = after.units.find(u => u.id === 'u_protagonist')!;
  assert.equal(heroUnit.name, '星见');
  assert.equal(heroUnit.character, 'sera');
  assert.throws(() => dispatch(ctx, OP.COMPLETE_SETUP, { protagonist: hero, companions: ['karl', 'owen'] }), /已经完成/);
});

test('catalog carries the static tables with a version', () => {
  const { store, accountId, player } = setup();
  const catalog = dispatch(ctxFor(store, accountId, player), OP.GET_CATALOG, {}) as { version: number; weapons: Record<string, unknown>; promotions: unknown[] };
  assert.equal(catalog.version, 8);
  assert.ok(Object.keys(catalog.weapons).length > 20);
  assert.ok(catalog.promotions.length >= 48);
});

test('old saved units and frozen legacies expose charm without rewriting other stats', () => {
  const db = openDb(':memory:');
  const store = new Store(db);
  const { accountId, player } = loginOrRegister(store, 'old-charm', undefined, '旧存档');
  const unit = store.unit(player.id, 'u_erin')!;
  const old = JSON.parse(JSON.stringify(unit));
  delete old.stats.cha;
  const before = structuredClone(old.stats);
  db.prepare('UPDATE units SET data = ? WHERE player_id = ? AND id = ?').run(JSON.stringify(old), player.id, old.id);
  const detail = dispatch(ctxFor(store, accountId, player), OP.GET_UNIT, { unitId: old.id }) as { snapshot: { stats: Record<string, number> } };
  const { cha, ...retained } = detail.snapshot.stats;
  assert.equal(cha, 0);
  assert.deepEqual(retained, before);
  const legacy = { id: 'old-legacy', playerId: player.id, sourceUnitId: old.id, sourceName: '旧角色',
    sourceCharacter: 'erin', sourceLineageDepth: 0, cause: 'retired', sourceLevel: 15, sourceStats: before,
    sourceGrowth: { ...before }, state: 'available', recipientUnitId: null, mode: null, createdAt: 1 };
  db.prepare('INSERT INTO legacies (id, player_id, source_unit_id, data, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(legacy.id, player.id, old.id, JSON.stringify(legacy), 1);
  assert.equal(store.legacy(player.id, legacy.id)!.sourceStats.cha, 0);
  assert.equal(store.legacy(player.id, legacy.id)!.sourceGrowth.cha, 0);
});

test('old active battle projections show charm while stored battle RNG data stays untouched', () => {
  const { store, accountId, player } = setup();
  const record = createFieldBattle([store.unit(player.id, 'u_erin')!], { region: 1, cleared: 0, seed: 'old-charm-api' });
  record.playerId = player.id;
  for (const unit of [...record.state.units, ...record.initial.units]) delete (unit.stats as Partial<typeof unit.stats>).cha;
  store.saveBattle(record);
  const before = JSON.stringify(store.battle(player.id, record.id)!.state);
  const view = dispatch(ctxFor(store, accountId, player), OP.GET_BATTLE, { battleId: record.id, full: true, detail: true }) as {
    state: { units: { stats: Record<string, number> }[] }; units: { stats: Record<string, number> }[];
  };
  assert.equal(view.state.units[0].stats.cha, 0);
  assert.equal(view.units[0].stats.cha, 0);
  assert.equal(JSON.stringify(store.battle(player.id, record.id)!.state), before);
});

test('a field sortie spends days and can be played to a result', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const start = dispatch(ctx, OP.SORTIE, { region: 1, unitIds: ['u_erin', 'u_victor', 'u_gustav', 'u_lina', 'u_owen', 'u_noah'] }) as { battleId: string };
  assert.ok(start.battleId);
  assert.equal(ctx.player.day, 209 + 8);
  playOut(ctx);
  const refreshed = store.getPlayer(ctx.player.id)!;
  const finished = store.battle(refreshed.id, start.battleId);
  assert.ok(finished?.state.result);
});

test('field level-ups are copied into the unit growth log', () => {
  const { store, accountId, player } = setup();
  const erin = store.unit(player.id, 'u_erin')!;
  const record = createFieldBattle([erin], { region: 1, cleared: 0, seed: 'growth-log' });
  record.playerId = player.id;
  // Stand in for the engine: one level-up with its rolled gains, then the battle ends.
  const unit = record.state.units.find(u => u.id === 'u_erin')!;
  unit.level += 1;
  unit.stats.hp += 1;
  unit.stats.spd += 1;
  record.events.push({ t: 'levelUp', unit: 'u_erin', level: unit.level, gains: { hp: 1, spd: 1 }, rerolls: 0 });
  record.state.result = { winner: 'player', reason: '击败敌方主将' };
  const rewards = applyBattleOutcome(store, ctxFor(store, accountId, player).player, record);
  const saved = store.unit(player.id, 'u_erin')!;
  assert.equal(saved.level, erin.level + 1);
  assert.deepEqual(saved.growthLog.at(-1), { level: erin.level + 1, gains: { hp: 1, spd: 1 } });
  assert.deepEqual(rewards.levelUps, [{ unit: 'u_erin', level: erin.level + 1 }]);
});

test('today lists every action cost and the sortie rules before committing', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const today = dispatch(ctx, OP.GET_TODAY, {}) as { actions: { key: string; costDays: number; costGold?: number; available: boolean; maxUnits?: number; turnLimit?: number; goalText?: string; lethal?: boolean }[] };
  const sortie = today.actions.find(a => a.key === 'sortie')!;
  assert.deepEqual([sortie.costDays, sortie.maxUnits, sortie.turnLimit, sortie.goalText, sortie.lethal, sortie.available],
    [8, FIELD_BATTLE.maxUnits, FIELD_BATTLE.turnLimit, FIELD_BATTLE.goalText, true, true]);
  assert.equal(today.actions.find(a => a.key === 'train')!.costGold, 200);
  assert.equal((today as { battle?: unknown }).battle, null);
  dispatch(ctx, OP.SORTIE, { region: 1, unitIds: ['u_erin'] });
  const busy = dispatch(ctx, OP.GET_TODAY, {}) as typeof today & { battle: { kind: string; name: string; turn: number } | null };
  assert.equal(busy.actions.find(a => a.key === 'sortie')!.available, false);
  assert.deepEqual([busy.battle?.kind, busy.battle?.turn], ['field', 1]);
  assert.ok(busy.battle?.name.startsWith('晨原'));
});

test('own arena-day snapshots can be read back with their date', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const { snapshots } = dispatch(ctx, OP.GET_SNAPSHOTS, {}) as { snapshots: { day: number; date: { label: string }; roster: { character: string; level: number }[] }[] };
  // The seeded account starts on an arena day, so registration already saved one snapshot.
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].day, ctx.player.day);
  assert.ok(snapshots[0].date.label.includes('竞技场日'));
  assert.equal(snapshots[0].roster.find(u => u.character === 'erin')?.level, store.unit(player.id, 'u_erin')!.level);
});

test('arena day opens with three opponents, bans and a playable attack', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const arena = dispatch(ctx, OP.GET_ARENA, {}) as { opponents: { id: string; deploy: number; bans: number }[]; isArenaDay: boolean };
  assert.equal(arena.isArenaDay, true);
  assert.equal(arena.opponents.length, 3);
  const opponent = arena.opponents[0];
  const opponentId = opponent.id;
  const list = dispatch(ctx, OP.GET_OPPONENT, { opponentId }) as { list: { character: string }[] };
  assert.ok(list.list.length > 0);
  const bans = list.list.slice(0, opponent.bans).map(u => u.character);
  const reveal = dispatch(ctx, OP.ARENA_BAN, { opponentId, bans }) as { reveal: { fielded: unknown[] } };
  assert.equal(reveal.reveal.fielded.length, opponent.deploy);
  const roster = stateView(store, ctx.player).units as { character: string }[];
  const banned = new Set(bans);
  const chars = roster.map(u => u.character).filter(c => !banned.has(c)).slice(0, opponent.deploy);
  const picks = chars.map((character, i) => ({ character, pos: [i % 3, 2 + Math.floor(i / 3)] }));
  const attack = dispatch(ctx, OP.ARENA_ATTACK, { opponentId, picks, commander: chars[0] }) as { battleId: string };
  assert.ok(attack.battleId);
  dispatch(ctx, OP.SURRENDER, { battleId: attack.battleId });
  const results = dispatch(ctx, OP.GET_ARENA_RESULTS, {}) as { attacks: { status: string }[] };
  assert.equal(results.attacks.some(a => a.status === 'lost'), true);
});

test('arena pays gold only for matches actually fought', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const arena = dispatch(ctx, OP.GET_ARENA, {}) as { opponents: { id: string; deploy: number; bans: number }[] };
  const opponent = arena.opponents[0];
  const list = dispatch(ctx, OP.GET_OPPONENT, { opponentId: opponent.id }) as { list: { character: string }[] };
  const bans = list.list.slice(0, opponent.bans).map(u => u.character);
  dispatch(ctx, OP.ARENA_BAN, { opponentId: opponent.id, bans });
  const roster = stateView(store, ctx.player).units as { character: string }[];
  const banned = new Set(bans);
  const chars = roster.map(u => u.character).filter(c => !banned.has(c)).slice(0, opponent.deploy);
  const picks = chars.map((character, i) => ({ character, pos: [i % 3, 2 + Math.floor(i / 3)] }));
  const attack = dispatch(ctx, OP.ARENA_ATTACK, { opponentId: opponent.id, picks, commander: chars[0] }) as { battleId: string };
  dispatch(ctx, OP.SURRENDER, { battleId: attack.battleId });
  const day = store.arenaDay(ctx.player.id, ctx.player.day)!;
  assert.equal(day.attacks[opponent.id].surrender, true, '投降应被记录');
  const goldBefore = ctx.player.gold;
  // 跨过 24:00：投降的那场与未打完的两场都计落败，但不发参与金币，防守也不发可用金币。
  ctx.player.day += 31;
  store.savePlayer(ctx.player);
  tick(store, Date.now());
  assert.equal(ctx.player.gold, goldBefore, '投降、未打完与防守都不发可用金币');
  const settled = store.arenaDay(ctx.player.id, day.day)!;
  assert.equal(settled.settled, true);
  assert.equal(Object.values(settled.attacks).every(a => a.status === 'lost'), true);
  assert.equal(Object.values(settled.attacks).filter(a => a.noShow).length, 2);
});

test('defense can be read, edited and validated', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const current = dispatch(ctx, OP.GET_DEFENSE, {}) as { defense: { map: string; slots: unknown[] } };
  assert.ok(current.defense.slots.length > 0);
  // Switching to 王城 needs 11 units, so the seeded 6-unit list must be rejected.
  assert.throws(() => dispatch(ctx, OP.SET_DEFENSE, { defense: { ...current.defense, map: 'castle' } }), /防守名单/);
  assert.throws(() => dispatch(ctx, OP.SET_DEFENSE, { defense: { ...current.defense, slots: [] } }), /防守名单/);
  const saved = dispatch(ctx, OP.SET_DEFENSE, { defense: current.defense }) as { defense: unknown };
  assert.ok(saved.defense);
});

test('saving a defense rebuilds units from the live roster and ignores forged stats', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const current = dispatch(ctx, OP.GET_DEFENSE, {}) as { defense: { slots: { unit: { character: string; stats: Record<string, number> } }[] } };
  const forged = structuredClone(current.defense);
  for (const slot of forged.slots) slot.unit.stats.str = 99;
  const saved = dispatch(ctx, OP.SET_DEFENSE, { defense: forged }) as { defense: { id: string; slots: { unit: { character: string; stats: Record<string, number> } }[] } };
  assert.equal(saved.defense.id, `mine-${ctx.player.id}`);
  const erin = saved.defense.slots.find(s => s.unit.character === 'erin')!;
  assert.equal(erin.unit.stats.str, store.unit(ctx.player.id, 'u_erin')!.stats.str);
  assert.notEqual(erin.unit.stats.str, 99);
});

test('the defense view follows the live roster after a promotion', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  type View = { defense: { slots: { unit: { character: string; classId: string } }[] } };
  const before = (dispatch(ctx, OP.GET_DEFENSE, {}) as View).defense.slots.find(s => s.unit.character === 'noah')!;
  assert.equal(before.unit.classId, 'cleric');
  player.day = 360;
  player.gold = 100_000;
  dispatch(ctx, OP.BUY_CLASS_QUALIFICATION, { unitId: 'u_noah', classId: 'bishop' });
  dispatch(ctx, OP.PROMOTE, { unitId: 'u_noah', promotion: 'bishop' });
  const after = (dispatch(ctx, OP.GET_DEFENSE, {}) as View).defense.slots.find(s => s.unit.character === 'noah')!;
  assert.equal(after.unit.classId, 'bishop');
});

test('arena results carry the defense locked at registration', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const locked = store.arenaDay(ctx.player.id, ctx.player.day)!.defense!;
  type Slots = { slots: { behavior: string }[] };
  const edited = structuredClone((dispatch(ctx, OP.GET_DEFENSE, {}) as { defense: Slots }).defense);
  const changed = locked.slots[0].behavior === 'aggressive' ? 'hold' : 'aggressive';
  edited.slots[0].behavior = changed;
  dispatch(ctx, OP.SET_DEFENSE, { defense: edited });
  const results = dispatch(ctx, OP.GET_ARENA_RESULTS, {}) as { lockedDefense: Slots | null };
  assert.equal(results.lockedDefense?.slots[0].behavior, locked.slots[0].behavior);
  assert.notEqual(results.lockedDefense?.slots[0].behavior, changed);
});

test('arena settlement uses the defense locked at registration, not a later edit', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  dispatch(ctx, OP.GET_ARENA, {});
  const day = store.arenaDay(ctx.player.id, ctx.player.day)!;
  assert.ok(day.defense, '报名时应锁定防守快照');
  const expected = structuredClone(day);
  runDefenseTrials(expected, day.defense!, officialOpponents().map(o => ({ legion: o.legion, roster: o.slots.map(s => s.unit) })));
  // 改掉当前防守后结算：仍应用报名时锁定的那份。
  ctx.player.defense = { ...day.defense!, slots: [] };
  ctx.player.day += 31;
  store.savePlayer(ctx.player);
  tick(store, Date.now());
  const settled = store.arenaDay(ctx.player.id, day.day)!;
  assert.equal(settled.settled, true);
  assert.deepEqual(settled.defenseTrials, expected.defenseTrials);
});

test('the agent ASCII map legend matches the terrain table', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const start = dispatch(ctx, OP.SORTIE, { region: 1, unitIds: ['u_erin'] }) as { battleId: string };
  const view = dispatch(ctx, OP.GET_BATTLE, { battleId: start.battleId }) as { map: { legend: Record<string, string> } };
  for (const terrain of Object.values(TERRAINS)) assert.equal(view.map.legend[terrain.glyph], terrain.name);
});

test('live battle state hides the RNG and enemy AI behavior', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  // 竞技场 BAN 揭晓不暴露 AI 行为 (docs/05)。
  const arena = dispatch(ctx, OP.GET_ARENA, {}) as { opponents: { id: string; bans: number }[] };
  const opp = arena.opponents[0];
  const list = dispatch(ctx, OP.GET_OPPONENT, { opponentId: opp.id }) as { list: { character: string }[] };
  const bans = list.list.slice(0, opp.bans).map(u => u.character);
  const reveal = dispatch(ctx, OP.ARENA_BAN, { opponentId: opp.id, bans }) as { reveal: { fielded: { behavior?: unknown }[] } };
  assert.ok(reveal.reveal.fielded.every(u => !('behavior' in u)));
  // 进行中的战斗不下发随机数状态或行为；客户端提交的 seed 不被采用 (docs/03)。
  const start = dispatch(ctx, OP.SORTIE, { region: 1, unitIds: ['u_erin'], seed: 'attacker-chosen' }) as {
    battleId: string; state: { rng?: unknown; growthRng?: unknown; units: { behavior?: unknown }[] };
  };
  assert.equal('rng' in start.state, false);
  assert.equal('growthRng' in start.state, false);
  assert.ok(start.state.units.every(u => !('behavior' in u)));
  const full = dispatch(ctx, OP.GET_BATTLE, { battleId: start.battleId, full: true }) as { state: { rng?: unknown } };
  assert.equal('rng' in full.state, false);
});

test('shop buy/sell and item transfer work', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const shop = dispatch(ctx, OP.GET_SHOP, {}) as { items: { item: string; price: number }[] };
  assert.ok(shop.items.length > 0);
  const goldBefore = ctx.player.gold;
  dispatch(ctx, OP.BUY, { item: 'iron_sword', count: 1 });
  assert.equal(ctx.player.gold, goldBefore - shop.items.find(i => i.item === 'iron_sword')!.price);
  dispatch(ctx, OP.TRANSFER_ITEM, { unitId: 'u_erin', item: 'iron_sword', action: 'toUnit' });
  dispatch(ctx, OP.TRANSFER_ITEM, { unitId: 'u_erin', item: 'iron_sword', action: 'equip' });
  const unit = dispatch(ctx, OP.GET_UNIT, { unitId: 'u_erin' }) as { weapons: { id: string }[] };
  assert.equal(unit.weapons[0].id, 'iron_sword');
  dispatch(ctx, OP.SELL, { item: 'herb', count: 2 });
});

test('a half-used 伤药 keeps its uses through the warehouse', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const unit = store.unit(player.id, 'u_erin')!;
  unit.items = [{ id: 'vulnerary', uses: 1 }];
  store.saveUnit(unit, player.id);
  dispatch(ctx, OP.TRANSFER_ITEM, { unitId: 'u_erin', item: 'vulnerary', action: 'toWarehouse' });
  const rows = store.inventory(player.id).filter(r => r.item === 'vulnerary');
  assert.deepEqual(rows.map(r => [r.uses, r.count]).sort(), [[1, 1], [3, 5]]);
  dispatch(ctx, OP.TRANSFER_ITEM, { unitId: 'u_erin', item: 'vulnerary', action: 'toUnit', uses: 1 });
  assert.deepEqual(store.unit(player.id, 'u_erin')!.items, [{ id: 'vulnerary', uses: 1 }]);
  // Without `uses` the fullest stack goes out.
  dispatch(ctx, OP.TRANSFER_ITEM, { unitId: 'u_owen', item: 'vulnerary', action: 'toUnit' });
  assert.equal(store.unit(player.id, 'u_owen')!.items.at(-1)?.uses, 3);
});

test('only weapons and battle items can be carried', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  assert.throws(() => dispatch(ctx, OP.TRANSFER_ITEM, { unitId: 'u_erin', item: 'herb', action: 'toUnit' }), /不能带进战斗/);
  assert.equal(store.countInventory(player.id, 'herb'), 6);
});

test('a 能力药 that cannot be used stays in the warehouse', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  dispatch(ctx, OP.BUY, { item: 'secret_book', count: 1 });
  const unit = store.unit(player.id, 'u_erin')!;
  unit.drugCounts = { skl: 5 };
  store.saveUnit(unit, player.id);
  assert.throws(() => dispatch(ctx, OP.USE_ITEM, { unitId: 'u_erin', item: 'secret_book' }), (e: { code?: string }) => e.code === 'FORBIDDEN');
  assert.equal(store.countInventory(player.id, 'secret_book'), 1);
  const used = dispatch(ctx, OP.USE_ITEM, { unitId: 'u_owen', item: 'secret_book' }) as { stat: string; amount: number; drugCounts: Record<string, number> };
  assert.deepEqual([used.stat, used.amount, used.drugCounts.skl], ['skl', 2, 1]);
  assert.equal(store.countInventory(player.id, 'secret_book'), 0);
});

test('shared experience is not spent on a unit at the level cap', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const unit = store.unit(player.id, 'u_erin')!;
  unit.level = 99;
  store.saveUnit(unit, player.id);
  const before = ctx.player.bexp;
  assert.throws(() => dispatch(ctx, OP.ASSIGN_BEXP, { unitId: 'u_erin', amount: 100 }), /已满级/);
  assert.equal(ctx.player.bexp, before);
  const assigned = dispatch(ctx, OP.ASSIGN_BEXP, { unitId: 'u_owen', amount: 150 }) as { levelUps: unknown[]; bexp: number };
  assert.deepEqual([assigned.levelUps.length, assigned.bexp], [1, before - 150]);
});

test('agent activity marks the player online', () => {
  const { store, accountId, player } = setup();
  const plain = ctxFor(store, accountId, player);
  assert.equal((dispatch(plain, OP.GET_STATE, {}) as { agentLastSeen: number | null }).agentLastSeen, null);
  const agent = { ...plain, agentModel: 'test-agent' };
  const state = dispatch(agent, OP.GET_STATE, {}) as { agentLastSeen: number | null };
  assert.equal(typeof state.agentLastSeen, 'number');
});

test('camp actions advance the calendar and change state', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const day0 = ctx.player.day;
  dispatch(ctx, OP.REST, { days: 1 });
  assert.equal(ctx.player.day, day0 + 1);
  const gold = ctx.player.gold;
  const train = dispatch(ctx, OP.TRAIN, { unitId: 'u_erin' }) as { rankAfter: string; day: number };
  assert.equal(ctx.player.gold, gold - 200);
  assert.ok(train.rankAfter);
  // 扫荡只允许已讨伐地区。
  assert.throws(() => dispatch(ctx, OP.SWEEP, { region: 12 }), /已讨伐/);
});

test('roster summary carries the real fields the pages read', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const alt = store.unit(ctx.player.id, 'u_erin')!.weapons[1];
  dispatch(ctx, OP.TRANSFER_ITEM, { unitId: 'u_erin', item: alt, action: 'equip' });
  const roster = dispatch(ctx, OP.GET_ROSTER, {}) as {
    units: { id: string; equipped: string; joinedDay: number; weaponExp: Record<string, number>; growthLog: unknown[]; snapshot: { weapons: string[] } }[];
  };
  const erin = roster.units.find(u => u.id === 'u_erin')!;
  assert.equal(erin.equipped, erin.snapshot.weapons[0]);
  assert.equal(erin.equipped, alt);
  assert.equal(typeof erin.joinedDay, 'number');
  assert.equal(Array.isArray(erin.growthLog), true);
  assert.equal(typeof erin.weaponExp, 'object');
});

test('the promotion compatibility endpoint requires a purchased qualification and preserves earned progress', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  assert.throws(() => dispatch(ctx, OP.PROMOTE, { unitId: 'u_erin', promotion: '剑圣' }), /没有转职方向/);
  const unit = store.unit(player.id, 'u_erin')!;
  unit.level = 1;
  unit.exp = 42;
  store.saveUnit(unit, player.id);
  assert.throws(() => dispatch(ctx, OP.PROMOTE, { unitId: unit.id, promotion: 'sword_hero' }), /尚未购买/);
  player.day = 360;
  player.gold = 100_000;
  dispatch(ctx, OP.BUY_CLASS_QUALIFICATION, { unitId: unit.id, classId: 'sword_hero' });
  const before = store.inventory(player.id);
  const promoted = dispatch(ctx, OP.PROMOTE, { unitId: unit.id, promotion: 'sword_hero' }) as { classId: string; level: number; exp: number };
  assert.equal(promoted.classId, 'shido');
  assert.equal(promoted.level, 1);
  assert.equal(promoted.exp, 42);
  assert.deepEqual(store.unit(player.id, unit.id)!.stats, unit.stats);
  assert.deepEqual(store.inventory(player.id), before);
});

test('recruit spends days and adds a unit with a growth type and age', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  let result = dispatch(ctx, OP.RECRUIT, { region: 1 }) as { success: boolean; unit?: { growthType: string; age: number } };
  // 40% success with a guaranteed hit on the fifth try, so six attempts always land one.
  for (let i = 0; i < 5 && !result.success; i++) result = dispatch(ctx, OP.RECRUIT, { region: 1 }) as typeof result;
  assert.equal(result.success, true);
  assert.ok(['early', 'normal', 'late', 'growth'].includes(result.unit!.growthType));
  assert.ok(result.unit!.age >= 12 && result.unit!.age <= 45);
});

test('the worker settles arena days that the player has moved past', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  dispatch(ctx, OP.GET_ARENA, {});
  ctx.player.day += 31;
  store.savePlayer(ctx.player);
  const handled = tick(store, Date.now());
  assert.ok(handled >= 1);
  const day = store.arenaDay(ctx.player.id, 209);
  assert.equal(day?.settled, true);
});

test('agent notes are stored and surfaced in state', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  dispatch(ctx, OP.AGENT_REPORT_PLAN, { text: '本月重点练莉娜。' });
  const info = dispatch(ctx, OP.GET_AGENT_INFO, {}) as { plan: string };
  assert.equal(info.plan, '本月重点练莉娜。');
  const state = dispatch(ctx, OP.GET_STATE, {}) as { agentPlan: string };
  assert.equal(state.agentPlan, '本月重点练莉娜。');
});

test('finished battles are stored as replays that can be listed and replayed', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const arena = dispatch(ctx, OP.GET_ARENA, {}) as { opponents: { id: string; deploy: number; bans: number }[] };
  const opponent = arena.opponents[0];
  const list = dispatch(ctx, OP.GET_OPPONENT, { opponentId: opponent.id }) as { list: { character: string }[] };
  const bans = list.list.slice(0, opponent.bans).map(u => u.character);
  dispatch(ctx, OP.ARENA_BAN, { opponentId: opponent.id, bans });
  const banned = new Set(bans);
  const roster = stateView(store, ctx.player).units as { character: string }[];
  const chars = roster.map(u => u.character).filter(c => !banned.has(c)).slice(0, opponent.deploy);
  const picks = chars.map((character, i) => ({ character, pos: [i % 3, 2 + Math.floor(i / 3)] }));
  const attack = dispatch(ctx, OP.ARENA_ATTACK, { opponentId: opponent.id, picks, commander: chars[0] }) as { battleId: string };
  dispatch(ctx, OP.SURRENDER, { battleId: attack.battleId });

  const replays = dispatch(ctx, OP.GET_REPLAYS, {}) as { replays: { id: string; winner: string; mine: boolean }[] };
  assert.equal(replays.replays.length, 1);
  assert.equal(replays.replays[0].id, attack.battleId);
  assert.equal(replays.replays[0].mine, true);
  const replay = dispatch(ctx, OP.GET_REPLAY, { replayId: attack.battleId }) as { battle: { initial: { units: unknown[] }; actions: unknown[]; state: { result?: unknown } } };
  assert.ok(replay.battle.initial.units.length > 0, '回放要带开局局面');
  assert.ok(replay.battle.actions.length > 0, '回放要带指令列表');
  assert.ok(replay.battle.state.result, '回放要带终局结果');
});

test('op errors carry a code and an action for the agent', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  assert.throws(() => dispatch(ctx, OP.GET_BATTLE, {}), (error: unknown) => (error as { code: string }).code === 'NOT_FOUND');
  assert.throws(() => dispatch(ctx, OP.UNIT_ACT, { unitId: 'x', moveTo: [0, 0], action: 'wait' }), (error: unknown) => (error as { code: string }).code === 'NOT_FOUND');
});
