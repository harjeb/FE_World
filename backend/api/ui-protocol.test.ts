// Protocol support for the web UI (TODO UI-01–04): the battle commands the engine already had
// (战技／法术／功能杖／舞蹈), the state the pages need after a reload, and the battle report data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import type { Player } from './store.ts';
import { loginOrRegister } from './auth.ts';
import { seedFullRoster } from './test-support.ts';
import { dispatch } from './handlers.ts';
import type { Context } from './handlers.ts';
import { stateView, syncPlayer } from './services.ts';
import { OP } from '../common/protocol/ops.ts';
import { createFieldBattle } from '../common/game/battles.ts';
import { regionById } from '../common/game/calendar.ts';
import type { BattleRecord } from '../common/game/battles.ts';
import { createUnit, growthRates } from '../common/game/model.ts';
import type { UnitRecord } from '../common/game/model.ts';
import { WEAPON_ART_BY_ID } from '../common/data/weapon-arts.ts';
import { actionOptions, destinationCells, step } from '../common/engine/index.ts';
import type { BattleState, Point, UnitState } from '../common/engine/index.ts';

function setup(name: string) {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, name, undefined, '测试军团');
  seedFullRoster(store, player);
  return { store, accountId, player: syncPlayer(store, player) };
}

function ctxFor(store: Store, accountId: string, player: Player, agentModel: string | null = null): Context {
  return { store, accountId, player, agentModel, push: () => {} };
}

// A field battle with the given units, stored as the player's active battle.
function battleWith(store: Store, player: Player, units: UnitRecord[], seed = 'ui'): BattleRecord {
  const record = createFieldBattle(units, { region: 1, cleared: 0, day: player.day, seed });
  record.playerId = player.id;
  store.saveBattle(record);
  return record;
}

const free = (state: BattleState, at: Point) => at[0] >= 0 && at[1] >= 0 && at[0] < state.map.width && at[1] < state.map.height
  && !state.units.some(u => u.alive && u.pos[0] === at[0] && u.pos[1] === at[1]);

// Puts `unit` next to `anchor` (any in-bounds empty neighbor); terrain does not matter for these checks.
function placeNextTo(state: BattleState, unit: UnitState, anchor: UnitState, distance = 1): void {
  for (const [dx, dy] of [[distance, 0], [-distance, 0], [0, distance], [0, -distance]]) {
    const at: Point = [anchor.pos[0] + dx, anchor.pos[1] + dy];
    if (free(state, at)) { unit.pos = at; return; }
  }
  throw new Error('no free neighbor');
}

function save(store: Store, record: BattleRecord, state: BattleState): void {
  record.state = state;
  store.saveBattle(record);
}

test('UNIT_ACT runs a learned weapon art and spends its durability', () => {
  const { store, accountId, player } = setup('ui-art');
  const ctx = ctxFor(store, accountId, player);
  const victor = store.unit(player.id, 'u_victor')!;
  victor.learnedArts = ['fw_art_36']; victor.equippedArts = ['fw_art_36'];
  store.saveUnit(victor, player.id);
  const record = battleWith(store, player, [victor]);
  const state = structuredClone(record.state);
  const me = state.units.find(u => u.id === 'u_victor')!;
  const foe = state.units.find(u => u.side === 'enemy')!;
  placeNextTo(state, foe, me);
  save(store, record, state);
  const reach = dispatch(ctx, OP.GET_REACHABLE, { unitId: 'u_victor' }) as { stops: { pos: Point; arts: { art: string; weapon: string; targets: string[] }[] }[] };
  const here = reach.stops.find(s => s.pos[0] === me.pos[0] && s.pos[1] === me.pos[1])!;
  assert.ok(here.arts.some(a => a.art === 'fw_art_36' && a.weapon === 'steel_lance' && a.targets.includes(foe.id)), JSON.stringify(here.arts));
  const preview = dispatch(ctx, OP.PREVIEW_COMBAT, { attackerId: 'u_victor', from: me.pos, weapon: 'steel_lance', art: 'fw_art_36', targetId: foe.id }) as { attacker: { hit: number } };
  assert.ok(preview.attacker.hit >= 0);
  const before = me.weaponInstances!.find(w => w.id === 'steel_lance')!.durability;
  const result = dispatch(ctx, OP.UNIT_ACT, { unitId: 'u_victor', moveTo: me.pos, action: 'art', targetId: foe.id, weapon: 'steel_lance', art: 'fw_art_36' }) as { events: { t: string }[]; state: BattleState };
  assert.ok(result.events.some(e => e.t === 'art'));
  assert.ok(result.events.some(e => e.t === 'combat'));
  const after = result.state.units.find(u => u.id === 'u_victor')!.weaponInstances!.find(w => w.id === 'steel_lance')!.durability;
  assert.equal(after, before - 2);
});

test('UNIT_ACT casts a spellbook, previews it, and silence blocks casting', () => {
  const { store, accountId, player } = setup('ui-cast');
  const ctx = ctxFor(store, accountId, player);
  const sera = store.unit(player.id, 'u_sera')!;
  const record = battleWith(store, player, [sera]);
  const state = structuredClone(record.state);
  const me = state.units.find(u => u.id === 'u_sera')!;
  const foe = state.units.find(u => u.side === 'enemy')!;
  placeNextTo(state, foe, me);
  save(store, record, state);
  assert.ok(me.spellbooks!.some(b => b.id === 'fire'));
  const preview = dispatch(ctx, OP.PREVIEW_COMBAT, { attackerId: 'u_sera', from: me.pos, spell: 'fire', targetId: foe.id }) as { attacker: { weapon: string; damage: number } };
  assert.equal(preview.attacker.weapon, 'fire');
  const charges = me.spellbooks!.find(b => b.id === 'fire')!.charges;
  const result = dispatch(ctx, OP.UNIT_ACT, { unitId: 'u_sera', moveTo: me.pos, action: 'cast', targetId: foe.id, spell: 'fire' }) as { events: { t: string }[]; state: BattleState };
  assert.ok(result.events.some(e => e.t === 'cast'));
  assert.equal(result.state.units.find(u => u.id === 'u_sera')!.spellbooks!.find(b => b.id === 'fire')!.charges, charges - 1);

  // Silenced casters get no cast options and the command is refused.
  const silenced = structuredClone(record.state);
  const caster = silenced.units.find(u => u.id === 'u_sera')!;
  caster.statuses = { silence: 2 };
  assert.equal(actionOptions(silenced, caster, caster.pos).casts.length, 0);
  const target = silenced.units.find(u => u.side === 'enemy')!;
  placeNextTo(silenced, target, caster);
  assert.throws(() => step(silenced, { type: 'act', unit: 'u_sera', to: caster.pos, act: 'cast', target: target.id, spell: 'fire' }), /沉默/);
});

test('PREVIEW_COMBAT gives status spells and staves a hit chance and attack spells their remaining charges', () => {
  const { store, accountId, player } = setup('ui-status-preview');
  const ctx = ctxFor(store, accountId, player);
  const sera = store.unit(player.id, 'u_sera')!;
  sera.ranks.staff = 'A';
  sera.spellbooks = [{ id: 'fw_spell_40', charges: 2, maxCharges: 2 }, { id: 'fire', charges: 1, maxCharges: 20 }];
  sera.weapons = ['silence_staff']; sera.bookInstances = [{ id: 'silence_staff', charges: 5, maxCharges: 5 }];
  const record = battleWith(store, player, [sera]);
  const state = structuredClone(record.state);
  const me = state.units.find(u => u.id === 'u_sera')!;
  // 单人出击只有一名敌方主将：首领的状态命中减半。
  const foe = state.units.find(u => u.side === 'enemy')!;
  placeNextTo(state, foe, me);
  save(store, record, state);
  const spell = dispatch(ctx, OP.PREVIEW_COMBAT, { attackerId: 'u_sera', from: me.pos, spell: 'fw_spell_40', targetId: foe.id }) as { status: { status: string; chance: number; boss: boolean }; attacker?: unknown };
  assert.equal(spell.status.status, 'silence'); assert.equal(spell.status.boss, true); assert.ok(spell.status.chance >= 0 && spell.status.chance <= 50); assert.equal(spell.attacker, undefined);
  const staff = dispatch(ctx, OP.PREVIEW_COMBAT, { attackerId: 'u_sera', from: me.pos, weapon: 'silence_staff', targetId: foe.id }) as { status: { status: string } };
  assert.equal(staff.status.status, 'silence');
  const fire = dispatch(ctx, OP.PREVIEW_COMBAT, { attackerId: 'u_sera', from: me.pos, spell: 'fire', targetId: foe.id }) as { attacker: { charges: number; doubles: boolean } };
  assert.equal(fire.attacker.charges, 1); assert.equal(fire.attacker.doubles, false);
});

test('the wall spell places exactly one wall and never on the caster’s landing cell', () => {
  const { store, player } = setup('ui-wall');
  const sera = store.unit(player.id, 'u_sera')!;
  const noah = store.unit(player.id, 'u_noah')!;
  sera.spellbooks = [{ id: 'fw_spell_9', charges: 5, maxCharges: 5 }];
  // 彷徨之壁是 B 级白魔法：现职业要有杖权限且杖熟练度达到 B。
  sera.ranks.staff = 'B';
  const record = battleWith(store, player, [sera, noah]);
  const state = structuredClone(record.state);
  const me = state.units.find(u => u.id === 'u_sera')!;
  const ally = state.units.find(u => u.id === 'u_noah')!;
  placeNextTo(state, ally, me);
  const option = actionOptions(state, me, me.pos).casts.find(c => c.spell === 'fw_spell_9')!;
  assert.ok(option.targets.some(t => t.id === ally.id));
  assert.deepEqual(option.dest, { from: 'stand', max: 3, required: true, wall: true });
  const cells = destinationCells(state, me, me.pos, option.dest!);
  assert.ok(cells.length > 0);
  assert.ok(!cells.some(c => c[0] === me.pos[0] && c[1] === me.pos[1]));
  const result = step(state, { type: 'act', unit: me.id, to: me.pos, act: 'cast', target: ally.id, spell: 'fw_spell_9', dest: cells[0] });
  assert.equal((result.state.objects ?? []).filter(o => o.label === '临时墙').length, 1);
  assert.throws(() => step(state, { type: 'act', unit: me.id, to: me.pos, act: 'cast', target: ally.id, spell: 'fw_spell_9' }), /落点/);
});

test('UNIT_ACT uses a status staff and a dancer can refresh an ally', () => {
  const { store, accountId, player } = setup('ui-staff');
  const ctx = ctxFor(store, accountId, player);
  const noah = store.unit(player.id, 'u_noah')!;
  noah.weapons = ['sleep_staff', 'heal'];
  noah.ranks.staff = 'B';
  noah.bookInstances = [{ id: 'sleep_staff', charges: 3, maxCharges: 3 }, { id: 'heal', charges: 10, maxCharges: 10 }];
  const dancer = createUnit('lina', 10, 'u_dancer', player.day, true, { classId: 'dancer' });
  store.addUnit(player.id, dancer);
  const erin = store.unit(player.id, 'u_erin')!;
  store.saveUnit(noah, player.id);
  const record = battleWith(store, player, [noah, dancer, erin]);
  const state = structuredClone(record.state);
  const me = state.units.find(u => u.id === 'u_noah')!;
  const foe = state.units.find(u => u.side === 'enemy' && !u.boss)!;
  // 状态杖按命中判定；把技巧拉满，使这次命中为 100%。
  me.stats.skl = 200;
  placeNextTo(state, foe, me, 2);
  save(store, record, state);
  const reach = dispatch(ctx, OP.GET_REACHABLE, { unitId: 'u_noah' }) as { stops: { pos: Point; staves: { weapon: string; effect: string; targets: string[] }[] }[] };
  const here = reach.stops.find(s => s.pos[0] === me.pos[0] && s.pos[1] === me.pos[1])!;
  assert.ok(here.staves.some(s => s.weapon === 'sleep_staff' && s.effect === 'sleep' && s.targets.includes(foe.id)));
  const slept = dispatch(ctx, OP.UNIT_ACT, { unitId: 'u_noah', moveTo: me.pos, action: 'staff', targetId: foe.id, weapon: 'sleep_staff' }) as { events: { t: string; status?: string }[] };
  assert.ok(slept.events.some(e => e.t === 'status' && e.status === 'sleep'));

  // Erin acted; the dancer gives her another action.
  const now = store.battle(player.id, record.id)!;
  const board = structuredClone(now.state);
  const dancing = board.units.find(u => u.id === 'u_dancer')!;
  const ally = board.units.find(u => u.id === 'u_erin')!;
  ally.acted = true;
  placeNextTo(board, ally, dancing);
  save(store, now, board);
  const danced = dispatch(ctx, OP.UNIT_ACT, { unitId: 'u_dancer', moveTo: dancing.pos, action: 'dance', targetId: 'u_erin' }) as { state: BattleState };
  assert.equal(danced.state.units.find(u => u.id === 'u_erin')!.acted, false);
});

test('GET_STATE keeps the travel candidate across reloads and GET_TODAY explains why recruiting waits', () => {
  const { store, accountId, player } = setup('ui-recruit');
  const ctx = ctxFor(store, accountId, player);
  player.flags.recruitFailsByRegion = { 2: 4 };
  store.savePlayer(player);
  const result = dispatch(ctx, OP.RECRUIT, { region: 2 }) as { success: boolean };
  assert.equal(result.success, true);
  const state = dispatch(ctx, OP.GET_STATE, {}) as ReturnType<typeof stateView>;
  assert.ok(state.pendingRecruit);
  assert.equal(state.pendingRecruit!.regionName, regionById(2).name);
  const today = dispatch(ctx, OP.GET_TODAY, {}) as { actions: { key: string; available: boolean; note: string }[] };
  const recruit = today.actions.find(a => a.key === 'recruit')!;
  assert.equal(recruit.available, false);
  assert.match(recruit.note, /候选/);
  dispatch(ctx, OP.DECLINE_RECRUIT, {});
  assert.equal((dispatch(ctx, OP.GET_STATE, {}) as ReturnType<typeof stateView>).pendingRecruit, null);

  player.day = 100;
  store.savePlayer(player);
  const early = dispatch(ctx, OP.GET_TODAY, {}) as { actions: { key: string; available: boolean; note: string }[] };
  const blocked = early.actions.find(a => a.key === 'recruit')!;
  assert.equal(blocked.available, false);
  assert.match(blocked.note, /第二年/);
});

test('the control lease and perfect-forge tickets are part of GET_STATE', () => {
  const { store, accountId, player } = setup('ui-lease');
  const agent = ctxFor(store, accountId, player, 'test-model');
  dispatch(agent, OP.CLAIM_CONTROL, {});
  player.flags.perfectWeapons = { iron_sword: 1, iron_axe: 0 };
  store.savePlayer(player);
  const state = stateView(store, player);
  assert.equal(state.control?.owner, 'agent');
  assert.deepEqual(state.perfectWeapons, { iron_sword: 1 });
});

test('the inn and food restore class spellbooks as well as carried books', () => {
  const { store, accountId, player } = setup('ui-inn');
  const ctx = ctxFor(store, accountId, player);
  const sera = store.unit(player.id, 'u_sera')!;
  sera.spellbooks = sera.spellbooks!.map(b => ({ ...b, charges: 0 }));
  sera.bookInstances = sera.bookInstances!.map(b => ({ ...b, charges: 1 }));
  store.saveUnit(sera, player.id);
  const fire = dispatch(ctx, OP.INN_REST, { unitId: 'u_sera', book: 'fire' }) as { charges: [number, number] };
  assert.equal(fire.charges[0], fire.charges[1]);
  // 雷霆 is both a carried tome and a class spellbook; the flag picks the spellbook.
  const thunder = dispatch(ctx, OP.INN_REST, { unitId: 'u_sera', book: 'thunder', spellbook: true }) as { charges: [number, number] };
  assert.equal(thunder.charges[0], thunder.charges[1]);
  const saved = store.unit(player.id, 'u_sera')!;
  assert.equal(saved.bookInstances!.find(b => b.id === 'thunder')!.charges, 1);
  store.addInventory(player.id, 'full_meal', 0, 1);
  dispatch(ctx, OP.USE_FOOD, { unitId: 'u_sera', book: 'wind', spellbook: true, item: 'full_meal' });
  const fed = store.unit(player.id, 'u_sera')!;
  assert.equal(fed.spellbooks!.find(b => b.id === 'wind')!.charges, fed.spellbooks!.find(b => b.id === 'wind')!.maxCharges);
});

test('winning a tower floor marks it cleared, stores a private report and pays the first-clear reward', () => {
  const { store, accountId, player } = setup('ui-tower');
  const ctx = ctxFor(store, accountId, player);
  const started = dispatch(ctx, OP.START_CHALLENGE, { floorId: 'tower-1', unitIds: ['u_erin', 'u_victor'] }) as { battleId: string };
  const record = store.battle(player.id, started.battleId)!;
  const state = structuredClone(record.state);
  state.goal = { kind: 'rout' };
  for (const unit of state.units.filter(u => u.side === 'enemy')) unit.alive = false;
  save(store, record, state);
  const erin = state.units.find(u => u.id === 'u_erin')!;
  dispatch(ctx, OP.UNIT_ACT, { unitId: 'u_erin', moveTo: erin.pos, action: 'wait' });
  assert.ok((player.flags.towerCleared ?? []).includes('tower-1'));
  const floors = dispatch(ctx, OP.GET_CHALLENGES, {}) as { floors: { id: string; cleared: boolean }[] };
  assert.equal(floors.floors.find(f => f.id === 'tower-1')!.cleared, true);
  const reward = dispatch(ctx, OP.CLAIM_CHALLENGE_REWARD, { floorId: 'tower-1' }) as { key: string };
  assert.equal(reward.key, 'tower-1:first');
  const list = dispatch(ctx, OP.GET_REPLAYS, { activity: 'challenge' }) as { replays: { id: string; mine: boolean; public: boolean; winner: string; day: number }[] };
  const row = list.replays.find(r => r.id === started.battleId)!;
  assert.equal(row.mine, true);
  assert.equal(row.public, false);
  assert.equal(row.winner, 'player');
  assert.equal(row.day, player.day);
});

test('field battles are listed in the reports with filters, notes and casualties', () => {
  const { store, accountId, player } = setup('ui-reports');
  const ctx = ctxFor(store, accountId, player, 'test-model');
  const start = dispatch(ctx, OP.SORTIE, { region: 1, unitIds: ['u_erin', 'u_karl'] }) as { battleId: string };
  dispatch(ctx, OP.AGENT_PHASE_NOTE, { text: '卡尔压上，艾琳守后。' });
  const live = dispatch(ctx, OP.GET_BATTLE, { full: true }) as { notes: { turn: number; text: string }[] };
  assert.deepEqual(live.notes.map(n => [n.turn, n.text]), [[1, '卡尔压上，艾琳守后。']]);
  dispatch(ctx, OP.RETREAT, {});
  const all = dispatch(ctx, OP.GET_REPLAYS, {}) as { replays: { id: string; activity: string; winner: string | null; fielded: number }[]; activities: { id: string }[] };
  const row = all.replays.find(r => r.id === start.battleId)!;
  assert.equal(row.activity, 'field');
  assert.equal(row.fielded, 2);
  assert.ok(all.activities.some(a => a.id === 'annual'));
  const won = dispatch(ctx, OP.GET_REPLAYS, { result: 'won' }) as { replays: { id: string }[] };
  assert.ok(!won.replays.some(r => r.id === start.battleId));
  const replay = dispatch(ctx, OP.GET_REPLAY, { replayId: start.battleId }) as { notes: { text: string }[]; public: boolean; summary: { activity: string } };
  assert.equal(replay.public, false);
  assert.equal(replay.summary.activity, 'field');
  assert.equal(replay.notes[0].text, '卡尔压上，艾琳守后。');
});

test('random recruits do not borrow a fixed character’s story or name for their legacy', () => {
  const { store, accountId, player } = setup('ui-identity');
  const ctx = ctxFor(store, accountId, player);
  const tavern = dispatch(ctx, OP.GET_TAVERN, {}) as { regions: { region: number; id: string }[] };
  const hired = dispatch(ctx, OP.HIRE_TAVERN, { region: tavern.regions[0].region, id: tavern.regions[0].id }) as { unit: { id: string; name: string; origin: string } };
  assert.equal(hired.unit.origin, 'recruit');
  const detail = dispatch(ctx, OP.GET_UNIT, { unitId: hired.unit.id }) as { story: unknown; origin: string };
  assert.equal(detail.story, null);
  const victor = dispatch(ctx, OP.GET_UNIT, { unitId: 'u_victor' }) as { story: unknown; origin: string };
  assert.equal(victor.origin, 'fixed');
  assert.ok(victor.story);
  assert.equal((dispatch(ctx, OP.GET_UNIT, { unitId: 'u_erin' }) as { origin: string }).origin, 'protagonist');
  const recruit = store.unit(player.id, hired.unit.id)!;
  recruit.level = 20;
  store.saveUnit(recruit, player.id);
  dispatch(ctx, OP.RETIRE_UNIT, { unitId: recruit.id });
  const legacies = dispatch(ctx, OP.GET_LEGACIES, {}) as { legacies: { sourceUnitId: string; sourceName: string }[] };
  assert.equal(legacies.legacies.find(l => l.sourceUnitId === recruit.id)!.sourceName, hired.unit.name);
  const memorial = dispatch(ctx, OP.GET_MEMORIAL, {}) as { memorials: { unitId: string; origin: string; legacy: { state: string } | null; record: { battles: number } }[] };
  const row = memorial.memorials.find(m => m.unitId === recruit.id)!;
  assert.equal(row.origin, 'recruit');
  assert.equal(row.legacy?.state, 'available');
  assert.equal(row.record.battles, 0);
});

test('the class market shows each class’s real total growth for the unit', () => {
  const { store, accountId, player } = setup('ui-growth');
  const ctx = ctxFor(store, accountId, player);
  const market = dispatch(ctx, OP.GET_CLASS_MARKET, { unitId: 'u_erin' }) as { classes: { id: string; growth: Record<string, number> | null }[] };
  const erin = store.unit(player.id, 'u_erin')!;
  const current = market.classes.find(c => c.id === erin.classId)!;
  assert.deepEqual(current.growth, growthRates(erin));
  const other = market.classes.find(c => c.id !== erin.classId)!;
  assert.deepEqual(other.growth, growthRates({ ...erin, classId: other.id as UnitRecord['classId'] }));
});

test('original art API exposes legal allies, persists swaps, and retries never pay twice', () => {
  const { store, accountId, player } = setup('ui-original');
  const ctx = ctxFor(store, accountId, player);
  const victor = store.unit(player.id, 'u_victor')!, erin = store.unit(player.id, 'u_erin')!;
  victor.learnedArts = ['fe_art_cover_exchange']; victor.equippedArts = ['fe_art_cover_exchange']; victor.ranks.sword = 'A'; store.saveUnit(victor, player.id);
  const record = battleWith(store, player, [victor, erin]);
  const state = structuredClone(record.state);
  state.map.tiles = state.map.tiles.map(row => row.map(() => 'plain')); state.objects = []; state.scenario = undefined;
  const me = state.units.find(u => u.id === victor.id)!, ally = state.units.find(u => u.id === erin.id)!, foe = state.units.find(u => u.side === 'enemy')!;
  me.pos = [2, 2]; ally.pos = [2, 3]; ally.acted = true; foe.pos = [3, 2];
  for (const unit of [me, foe]) { unit.hp = unit.stats.hp = 300; unit.stats.skl = 150; unit.stats.lck = 100; }
  save(store, record, state);
  const reach = dispatch(ctx, OP.GET_REACHABLE, { unitId: me.id }) as { stops: { pos: Point; arts: { art: string; weapon: string; allies: string[] }[] }[] };
  const option = reach.stops.find(row => row.pos.join() === me.pos.join())!.arts.find(row => row.art === 'fe_art_cover_exchange')!;
  assert.ok(option.allies.includes(ally.id));
  const preview = dispatch(ctx, OP.PREVIEW_COMBAT, { attackerId: me.id, from: me.pos, weapon: option.weapon, art: 'fe_art_cover_exchange', targetId: foe.id }) as { attacker: { strikes: number }; targets: unknown[] };
  assert.equal(preview.attacker.strikes, 1); assert.equal(preview.targets.length, 1);
  const request = { unitId: me.id, moveTo: me.pos, action: 'art', targetId: foe.id, weapon: option.weapon, art: 'fe_art_cover_exchange', allyId: ally.id, commandId: 'original-once' };
  assert.throws(() => dispatch(ctx, OP.UNIT_ACT, { ...request, allyId: foe.id }), /友军/);
  const first = dispatch(ctx, OP.UNIT_ACT, request) as { state: BattleState };
  const retry = dispatch(ctx, OP.UNIT_ACT, request);
  assert.equal(JSON.stringify(retry), JSON.stringify(first));
  const after = first.state.units.find(u => u.id === me.id)!;
  assert.deepEqual(after.pos, ally.pos);
  assert.equal(after.weaponInstances!.find(w => w.id === option.weapon)!.durability, me.weaponInstances!.find(w => w.id === option.weapon)!.durability - WEAPON_ART_BY_ID.get('fe_art_cover_exchange')!.cost);
  const reloaded = store.battle(player.id, record.id)!.state;
  assert.deepEqual(reloaded.units.find(u => u.id === me.id)!.pos, ally.pos);
  assert.equal(reloaded.units.find(u => u.id === ally.id)!.acted, true);
});
