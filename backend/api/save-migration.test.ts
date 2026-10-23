import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginForTest as loginOrRegister } from './test-support.ts';
import { syncPlayer } from './services.ts';
import { migrateCalendarDay, migrateSaveFile } from './save-migration.ts';
import { createUnit, ageAt, toSnapshot } from '../common/game/model.ts';
import { dateOf, isArenaDay } from '../common/game/calendar.ts';
import { annualIndexFor, annualWindowOpen, nextAnnualWindowStart, createAnnualEntry } from '../common/game/annual.ts';
import { createDispatch } from '../common/game/dispatch.ts';
import { createOrder, recipeById } from '../common/game/production.ts';
import { createArenaDay } from '../common/game/arena.ts';
import { createFieldBattle } from '../common/game/battles.ts';
import { createRun } from '../common/game/expedition.ts';

function fixture(t: TestContext, legacy = true) {
  const directory = mkdtempSync(join(tmpdir(), 'fe-save-migration-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'save.db'), backupPath = join(directory, 'before.db');
  const db = openDb(path), store = new Store(db);
  const { player } = loginOrRegister(store, 'migration-fixture', undefined, 'old legion');
  player.day = legacy ? 119 : 999;
  player.flags.shopMonth = legacy ? 3 : 7;
  player.flags.tavernQuarter = player.flags.shopMonth;
  player.flags.minigameQuarter = player.flags.shopMonth;
  player.flags.minigamePlays = 4;
  player.flags.regionReputation = { 2: 620, 9: 160 };
  player.flags.questsDone = ['r9-1', 'r9-2', 'r9-3'];
  player.flags.questRewardsClaimed = [...player.flags.questsDone];
  player.flags.chapterExpClaimed = [1];
  player.flags.storyCompleted = [1];
  store.savePlayer(player);
  const unit = createUnit('victor', 20, 'old-unit', 30);
  unit.baseAge = 18; unit.age = 18;
  unit.ageBaseDays = 18 * (legacy ? 120 : 500); unit.ageEpochDay = 30;
  unit.personalGrowth!.str = 71;
  unit.weaponInstances![0].durability = 7;
  unit.learnedArts = ['fw_art_1']; unit.classMastery[unit.classId] = 8;
  store.saveUnit(unit, player.id, 1);
  // Use raw stored records after this point: reading through normalizeUnit must not pre-normalize old ages.
  const protagonist = store.unit(player.id, 'u_erin')!;
  if (legacy) { protagonist.ageBaseDays = protagonist.baseAge * 120; store.saveUnit(protagonist, player.id); }
  return { directory, path, backupPath, db, store, player, unit };
}
function unmark(db: DatabaseSync): void { db.exec('DROP TABLE save_metadata'); }
function dump(db: DatabaseSync, table: string): unknown[] { return db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(); }

function seedHistory(f: ReturnType<typeof fixture>) {
  const { store, player, unit } = f;
  const order = createOrder('growing', player.id, recipeById('plant_herb')!, 110);
  store.saveProductionOrder(order);
  store.saveProductionOrder({ ...order, id: 'ready', startedDay: 80, readyDay: 100, state: 'ready' });
  store.saveProductionOrder({ ...order, id: 'collected', startedDay: 60, readyDay: 80, state: 'collected' });
  const running = createDispatch('running', player.id, 9, [unit.id], 10, unit.classId, 'sword', 115);
  store.saveDispatch(running);
  unit.lockedDispatchId = running.id;
  store.saveUnit(unit, player.id);
  const result = { day: 100, materials: [{ item: 'ore' as const, count: 5 }], weapons: [], unitRewards: [] };
  store.saveDispatch({ ...running, id: 'returned', startedDay: 90, returnDay: 100, state: 'returned', result });
  const annual = createAnnualEntry('annual-1', player.id, 1, [unit.id]);
  annual.state = 'champion'; annual.roster = { [unit.id]: structuredClone(unit) };
  store.saveAnnualEntry(annual);
  const run = createRun('completed-run', player.id, 9, [unit.id], 10, 0);
  run.state = 'completed'; store.saveRun(run);
  const battle = createFieldBattle([unit], { region: 9, cleared: 0, seed: 'old-frozen-seed', day: 119 });
  battle.playerId = player.id; battle.endDay = 119; battle.arenaDay = 29;
  battle.rulesetVersion = 'rules-v2'; battle.catalogVersion = 10;
  battle.state.result = { winner: 'player', reason: 'fixture finished' };
  store.saveBattle(battle); store.saveReplay(player.id, battle, Number.MAX_SAFE_INTEGER);
  const arena = createArenaDay(player.id, 119);
  store.saveArenaDay(arena);
  const snapshot = store.saveSnapshot(player.id, 29, { roster: [toSnapshot(unit)], defense: null, label: '第 29 日快照' });
  store.saveMemorial({ unitId: 'departed', playerId: player.id, name: 'past', character: 'victor', classId: unit.classId,
    level: 20, cause: 'retired', atDay: 90, battleId: null, stats: unit.stats, lineageDepth: 0 });
  store.saveReincarnation(player.id, unit.id, { unitId: unit.id, sourceCycle: 0, targetCycle: 1, newAgeBaseDays: 16 * 120, baseStats: unit.stats, growthAllocation: {} });
  store.saveReceipt(player.id, 'old-paid-command', 126, 'frozen-hash', { gold: 5000, day: 119 });
  store.saveQuote('old-quote', player.id, player.version, { toDay: 125 });
  store.addEvent(player.id, 'old-history', 'old calendar text', { day: 119 });
  store.addTask(player.id, 'wall-clock-task', 1_800_000_000_000, { id: 'real-time' });
  return { battle: store.battle(player.id, battle.id)!, arena, snapshot: store.snapshot(player.id, snapshot.day)!, result };
}

test('calendar conversion preserves year/quarter boundaries, arena days and D0 monotonically', () => {
  assert.deepEqual([0, 29, 30, 59, 60, 89, 90, 119, 120, 239, 960].map(migrateCalendarDay), [0, 124, 125, 249, 250, 374, 375, 499, 500, 999, 4000]);
  for (let day = 1; day <= 977; day++) {
    assert.ok(migrateCalendarDay(day) > migrateCalendarDay(day - 1));
    assert.equal(isArenaDay(migrateCalendarDay(day)), (day + 1) % 30 === 0);
    assert.equal(dateOf(migrateCalendarDay(day)).year, Math.floor(day / 120) + 1);
  }
  assert.throws(() => migrateCalendarDay(-1), /Invalid game day/);
});

test('a dry run and refused unmarked startup leave the save unchanged', t => {
  const f = fixture(t); unmark(f.db); f.db.close();
  const before = readFileSync(f.path);
  assert.throws(() => openDb(f.path), /SAVE_CALENDAR_MIGRATION_REQUIRED/);
  assert.throws(() => migrateSaveFile({ path: f.path }), /Specify --from-year-days/);
  const report = migrateSaveFile({ path: f.path, sourceYearDays: 120 });
  assert.equal(report.status, 'ready');
  assert.deepEqual(report.players, [{ id: f.player.id, fromDay: 119, toDay: 499 }]);
  assert.deepEqual(readFileSync(f.path), before);
  assert.equal(existsSync(f.backupPath), false);
});

test('a persistent 120-day save migrates once, backs up WAL and retains economic and frozen history', t => {
  const f = fixture(t), history = seedHistory(f);
  const preservedTables = ['inventory', 'shop', 'events', 'outbox', 'command_receipts', 'due_tasks', 'tokens', 'sessions'];
  const preserved = new Map(preservedTables.map(table => [table, dump(f.db, table)]));
  const beforeUnit = structuredClone(f.store.unit(f.player.id, f.unit.id)!);
  unmark(f.db);
  // Keep this connection open, so the backup must include committed rows still in WAL.
  const report = migrateSaveFile({ path: f.path, sourceYearDays: 120, apply: true, backupPath: f.backupPath });
  assert.equal(report.status, 'applied');
  assert.equal(report.backupPath, f.backupPath);
  f.db.close();
  const backup = new DatabaseSync(f.backupPath, { readOnly: true });
  try {
    assert.equal((backup.prepare('SELECT day FROM players').get() as { day: number }).day, 119);
    assert.deepEqual(dump(backup, 'command_receipts'), preserved.get('command_receipts'));
    assert.equal(backup.prepare("SELECT name FROM sqlite_master WHERE name='save_metadata'").get(), undefined);
  } finally { backup.close(); }
  const reopened = openDb(f.path), store = new Store(reopened);
  try {
    const player = store.getPlayer(f.player.id)!, unit = store.unit(player.id, f.unit.id)!;
    assert.equal(player.day, 499); assert.equal(player.gold, f.player.gold);
    assert.deepEqual(player.flags, f.player.flags);
    assert.equal(player.version, f.player.version + 1);
    assert.equal(ageAt(unit, player.day, 500), ageAt(beforeUnit, 119, 120));
    assert.equal(unit.joinedDay, 125); assert.equal(unit.ageEpochDay, 499);
    for (const field of ['stats', 'personalGrowth', 'weaponInstances', 'classMastery', 'learnedArts', 'lockedDispatchId'] as const) assert.deepEqual(unit[field], beforeUnit[field], field);
    for (const table of preservedTables) assert.deepEqual(dump(reopened, table), preserved.get(table), table);
    assert.equal(store.quote(player.id, 'old-quote'), null);
    assert.equal(store.receipt(player.id, 'old-paid-command')!.response && (store.receipt(player.id, 'old-paid-command')!.response as any).day, 119);
    assert.equal(store.productionOrder(player.id, 'growing')!.readyDay - player.day, 11);
    assert.equal(store.productionOrder(player.id, 'ready')!.readyDay - player.day, -19);
    assert.equal(store.productionOrder(player.id, 'collected')!.readyDay - store.productionOrder(player.id, 'collected')!.startedDay, 20);
    const running = store.dispatch(player.id, 'running')!;
    assert.equal(running.returnDay - player.day, 6); assert.equal(running.durationDays, 10);
    assert.equal(running.returnDay - running.startedDay, 10);
    const returned = store.dispatch(player.id, 'returned')!;
    assert.equal(returned.returnDay - returned.startedDay, returned.durationDays);
    assert.deepEqual(returned.result, { ...history.result, day: migrateCalendarDay(100) });
    const frozen = store.battle(player.id, history.battle.id)!;
    assert.equal(frozen.endDay, 499); assert.equal(frozen.arenaDay, 124);
    for (const field of ['initial', 'state', 'actions', 'seed', 'rulesetVersion', 'catalogVersion', 'costDays'] as const) assert.deepEqual(frozen[field], history.battle[field], field);
    assert.deepEqual(store.replay(player.id, history.battle.id)!.data, frozen);
    assert.equal(store.arenaDay(player.id, 499)!.id, history.arena.id);
    const snapshot = store.snapshot(player.id, 124)!;
    assert.equal(snapshot.id, history.snapshot.id);
    assert.deepEqual(snapshot.data.roster, history.snapshot.data.roster);
    assert.equal(snapshot.data.label, '第 124 日快照');
    store.saveSnapshot(player.id, 124, snapshot.data);
    assert.equal(dump(reopened, 'snapshots').length, 1, 'same-day updates preserve a migrated snapshot ID');
    assert.equal(store.annualEntryFor(player.id, 1)!.state, 'champion');
    assert.equal(store.memorials(player.id)[0].data.atDay, 375);
    assert.equal(JSON.parse((reopened.prepare('SELECT data FROM reincarnations').get() as { data: string }).data).newAgeBaseDays, 8000);
    // Pending work does not pay early; returned work must not be paid twice after restart.
    const gold = player.gold;
    syncPlayer(store, player);
    assert.equal(player.gold, gold);
    assert.equal(store.dispatch(player.id, 'running')!.state, 'running');
    player.day += 6; store.savePlayer(player); syncPlayer(store, player);
    assert.equal(store.dispatch(player.id, 'running')!.state, 'returned');
    const inventory = store.inventory(player.id), exp = store.unit(player.id, unit.id)!.exp;
    syncPlayer(store, player);
    assert.deepEqual(store.inventory(player.id), inventory);
    assert.equal(store.unit(player.id, unit.id)!.exp, exp);
  } finally { reopened.close(); }
  const bytes = readFileSync(f.path);
  assert.equal(migrateSaveFile({ path: f.path, sourceYearDays: 120, apply: true, backupPath: f.backupPath }).status, 'up-to-date');
  assert.deepEqual(readFileSync(f.path), bytes);
});

test('unmarked 500-day saves are adopted without changing dates, ages, progress or current battles', t => {
  const f = fixture(t, false);
  const battle = createFieldBattle([f.unit], { region: 2, cleared: 0, seed: 'current-battle', day: 999 });
  battle.playerId = f.player.id; f.store.saveBattle(battle);
  const units = dump(f.db, 'units'), battles = dump(f.db, 'battles');
  unmark(f.db); f.db.close();
  assert.equal(migrateSaveFile({ path: f.path, sourceYearDays: 500, apply: true, backupPath: f.backupPath }).status, 'applied');
  const db = openDb(f.path);
  try {
    assert.deepEqual(dump(db, 'units'), units); assert.deepEqual(dump(db, 'battles'), battles);
    const player = new Store(db).getPlayer(f.player.id)!;
    assert.equal(player.day, 999); assert.deepEqual(player.flags, f.player.flags);
  } finally { db.close(); }
});

test('active battles, between-map expeditions and annual entries block without backups or partial writes', t => {
  const f = fixture(t);
  const battle = createFieldBattle([f.unit], { region: 2, cleared: 0, seed: 'unfinished', day: 119 });
  battle.playerId = f.player.id; f.store.saveBattle(battle);
  const run = createRun('between-maps', f.player.id, 2, [f.unit.id], 10, 0); run.state = 'between_maps'; f.store.saveRun(run);
  f.store.saveAnnualEntry(createAnnualEntry('unfinished-year', f.player.id, 1, [f.unit.id]));
  unmark(f.db); const before = dump(f.db, 'players'); f.db.close();
  const report = migrateSaveFile({ path: f.path, sourceYearDays: 120, apply: true, backupPath: f.backupPath });
  assert.equal(report.status, 'blocked'); assert.equal(report.blockers.length, 3);
  assert.equal(existsSync(f.backupPath), false);
  const db = new DatabaseSync(f.path); try { assert.deepEqual(dump(db, 'players'), before); } finally { db.close(); }
});

test('missing old age anchors use the old calendar and a missing player-version column is upgraded atomically', t => {
  const f = fixture(t);
  const raw = JSON.parse((f.db.prepare('SELECT data FROM units WHERE id = ?').get(f.unit.id) as { data: string }).data);
  delete raw.ageBaseDays; delete raw.ageEpochDay;
  f.db.prepare('UPDATE units SET data = ? WHERE id = ?').run(JSON.stringify(raw), f.unit.id);
  f.db.exec('ALTER TABLE players DROP COLUMN version'); unmark(f.db); f.db.close();
  migrateSaveFile({ path: f.path, sourceYearDays: 120, apply: true, backupPath: f.backupPath });
  const db = openDb(f.path);
  try {
    const store = new Store(db), unit = store.unit(f.player.id, f.unit.id)!;
    assert.equal(ageAt(unit, 499, 500), 18);
    assert.equal(store.getPlayer(f.player.id)!.version, 1);
  } finally { db.close(); }
});

test('failed writes roll the entire calendar transaction back, keeping the standalone backup usable', t => {
  const f = fixture(t); unmark(f.db);
  f.db.exec("CREATE TRIGGER fail_unit_migration BEFORE UPDATE ON units BEGIN SELECT RAISE(ABORT, 'injected migration failure'); END;");
  const players = dump(f.db, 'players'), units = dump(f.db, 'units'); f.db.close();
  assert.throws(() => migrateSaveFile({ path: f.path, sourceYearDays: 120, apply: true, backupPath: f.backupPath }), /injected migration failure/);
  const db = new DatabaseSync(f.path);
  try {
    assert.deepEqual(dump(db, 'players'), players); assert.deepEqual(dump(db, 'units'), units);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='save_metadata'").get(), undefined);
  } finally { db.close(); }
  const backup = new DatabaseSync(f.backupPath, { readOnly: true });
  try { assert.deepEqual(dump(backup, 'players'), players); } finally { backup.close(); }
});

test('unknown schemas and existing backups are refused, and CLI defaults to a read-only plan', t => {
  const f = fixture(t); unmark(f.db); f.db.close();
  const cli = new URL('./migrate-save.ts', import.meta.url);
  const run = (...args: string[]) => spawnSync(process.execPath, [fileURLToPath(cli), ...args], { encoding: 'utf8' });
  const planned = run('--db', f.path, '--from-year-days', '120');
  assert.equal(planned.status, 0, planned.stderr); assert.equal(JSON.parse(planned.stdout).status, 'ready');
  assert.equal(existsSync(f.backupPath), false);
  const invalid = run('--db', f.path, '--from-year-days', '365');
  assert.equal(invalid.status, 1); assert.match(invalid.stderr, /must be 120 or 500/);
  assert.throws(() => migrateSaveFile({ path: f.path, sourceYearDays: 120, apply: true, backupPath: f.path }), /Backup must be a new path/);
  writeFileSync(f.backupPath, 'existing backup sentinel');
  assert.throws(() => migrateSaveFile({ path: f.path, sourceYearDays: 120, apply: true, backupPath: f.backupPath }), /Backup must be a new path/);
  assert.equal(readFileSync(f.backupPath, 'utf8'), 'existing backup sentinel');
  const db = new DatabaseSync(f.path);
  db.exec("CREATE TABLE save_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO save_metadata VALUES ('schema_version','999'),('calendar_days_per_year','120');");
  db.close();
  assert.throws(() => openDb(f.path), /Unsupported save schema/);
  assert.throws(() => migrateSaveFile({ path: f.path, sourceYearDays: 120 }), /Unsupported save schema/);
});

test('finished annual indices stay claimed and unentered windows follow the current year-end schedule', t => {
  const f = fixture(t); f.player.day = 120; f.store.savePlayer(f.player);
  const annual = createAnnualEntry('finished-year', f.player.id, 1, [f.unit.id]); annual.state = 'eliminated'; f.store.saveAnnualEntry(annual);
  unmark(f.db); f.db.close();
  migrateSaveFile({ path: f.path, sourceYearDays: 120, apply: true, backupPath: f.backupPath });
  const db = openDb(f.path);
  try {
    const store = new Store(db), player = store.getPlayer(f.player.id)!;
    assert.equal(player.day, 500); assert.equal(annualIndexFor(player.day), 1);
    assert.equal(store.annualEntryFor(player.id, 1)!.state, 'eliminated');
    assert.equal(annualWindowOpen(player.day), false); assert.equal(nextAnnualWindowStart(player.day), 982);
  } finally { db.close(); }
});
