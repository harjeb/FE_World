import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { createUnit, ageAt } from '../common/game/model.ts';
import { createOrder, RECIPES } from '../common/game/production.ts';
import { createDispatch, dispatchMaterials } from '../common/game/dispatch.ts';
import { createArenaDay } from '../common/game/arena.ts';
import { createAnnualEntry } from '../common/game/annual.ts';
import { createRun } from '../common/game/expedition.ts';
import { applyCalendarMigration, calendarDay120, databaseFingerprint, planCalendarMigration } from './calendar-migration.ts';
import { migrateCalendar } from '../../tools/migrate-calendar.ts';

function fixture(path = ':memory:', day = 119) {
  const db = openDb(path), store = new Store(db);
  const player = store.createPlayer(store.createAccount(`test-${Math.random()}`, null), 'test', 'test');
  player.day = day;
  delete player.flags.calendarVersion;
  player.flags.shopMonth = Math.floor(day / 30);
  player.flags.tavernQuarter = Math.floor(day / 30);
  player.flags.minigameQuarter = Math.floor(day / 30);
  player.flags.minigamePlays = 2;
  store.savePlayer(player);
  const unit = createUnit('erin', 1, 'u_erin', 0);
  unit.isProtagonist = false;
  unit.baseAge = 20; unit.ageBaseDays = 20 * 120; unit.ageEpochDay = 0;
  unit.age = 20 + Math.floor(day / 120);
  store.saveUnit(unit, player.id);
  return { db, store, player };
}
function raw(db: DatabaseSync, table: string) { return db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(); }

test('absolute calendar boundaries and raw conversion preserve age, rewards, resources and source counters', () => {
  for (const [old, current] of [[0, 0], [29, 120], [30, 125], [119, 495], [120, 500], [239, 995], [240, 1000]]) assert.equal(calendarDay120(old), current);
  const { db, store, player } = fixture();
  try {
    const order = createOrder('order', player.id, RECIPES[0], 110);
    store.saveProductionOrder(order);
    const dispatch = createDispatch('dispatch', player.id, 1, ['u_erin'], 20, 'mercenary', 'sword', 110);
    store.saveDispatch(dispatch);
    store.saveQuote('quote', player.id, 0, { day: 119 });
    const before = ['inventory', 'shop', 'events', 'outbox'].map(table => raw(db, table));
    const plan = planCalendarMigration(db, player.id, 120);
    assert.equal(plan.newDay, 495);
    assert.equal(store.getPlayer(player.id)!.day, 119);
    applyCalendarMigration(db, [player.id], 120);
    const current = store.getPlayer(player.id)!;
    assert.equal(current.day, 495); assert.equal(current.version, 1); assert.equal(current.flags.calendarVersion, 500);
    assert.equal(current.gold, player.gold); assert.equal(current.bexp, player.bexp);
    assert.deepEqual([current.flags.shopMonth, current.flags.tavernQuarter, current.flags.minigameQuarter, current.flags.minigamePlays], [3, 3, 3, 2]);
    const unit = store.unit(player.id, 'u_erin')!;
    assert.equal(unit.homeClassId, createUnit('erin', 1, 'expected', 0).homeClassId);
    assert.equal(unit.age, 20); assert.equal(ageAt(unit, current.day, 500), 20);
    assert.equal(unit.ageBaseDays, 10000); assert.equal(unit.ageEpochDay, 0);
    const migratedOrder = store.productionOrder(player.id, order.id)!;
    assert.equal(migratedOrder.readyDay - current.day, order.readyDay - player.day);
    assert.equal(migratedOrder.readyDay - migratedOrder.startedDay, 20);
    assert.deepEqual(migratedOrder.output, order.output);
    const migratedDispatch = store.dispatch(player.id, dispatch.id)!;
    assert.equal(migratedDispatch.returnDay - current.day, dispatch.returnDay - player.day);
    assert.equal(migratedDispatch.durationDays, 20);
    assert.deepEqual(dispatchMaterials(1, migratedDispatch.durationDays), dispatchMaterials(1, dispatch.durationDays));
    assert.equal((raw(db, 'production_orders')[0] as any).ready_day, migratedOrder.readyDay);
    assert.equal((raw(db, 'dispatches')[0] as any).return_day, migratedDispatch.returnDay);
    assert.deepEqual(['inventory', 'shop', 'events', 'outbox'].map(table => raw(db, table)), before);
    assert.equal(store.quote(player.id, 'quote'), null);
    const fingerprint = databaseFingerprint(db);
    assert.equal(applyCalendarMigration(db, [player.id], 120)[0].noop, true);
    assert.equal(databaseFingerprint(db), fingerprint);
    assert.throws(() => planCalendarMigration(db, player.id, 500), /mismatch/);
  } finally { db.close(); }
});

test('500 adoption never scales dates or unit JSON; new saves are marked and wrong source refuses', () => {
  const { db, store, player } = fixture(':memory:', 999);
  try {
    const units = raw(db, 'units');
    store.saveSnapshot(player.id, 999, { roster: [], defense: null, label: '500 history' });
    assert.equal(store.snapshotsAtDay(999, 'other').length, 0);
    applyCalendarMigration(db, [player.id], 500);
    assert.equal(store.snapshotsAtDay(999, 'other').length, 1);
    assert.equal(store.getPlayer(player.id)!.day, 999);
    assert.deepEqual(raw(db, 'units'), units);
    assert.equal(applyCalendarMigration(db, [player.id], 500)[0].noop, true);
    assert.throws(() => planCalendarMigration(db, player.id, 120), /mismatch/);
    const fresh = store.createPlayer(store.createAccount('fresh', null), 'fresh', 'fresh');
    assert.equal(fresh.flags.calendarVersion, 500);
    assert.throws(() => planCalendarMigration(db, fresh.id, 120), /mismatch/);
  } finally { db.close(); }
});

for (const day of [0, 29, 30, 119, 120, 239, 240]) {
  test(`age remains consistent at source boundary ${day}`, () => {
    const { db, store, player } = fixture(':memory:', day);
    try {
      const unit = store.unit(player.id, 'u_erin')!;
      unit.ageEpochDay = Math.min(day, 29); unit.ageBaseDays = 20 * 120 + 29;
      unit.age = Math.floor((unit.ageBaseDays + day - unit.ageEpochDay) / 120);
      store.saveUnit(unit, player.id);
      applyCalendarMigration(db, [player.id], 120);
      const current = store.unit(player.id, unit.id)!;
      assert.equal(current.age, unit.age);
      assert.equal(ageAt(current, store.getPlayer(player.id)!.day, 500), unit.age);
    } finally { db.close(); }
  });
}

const locks: [string, (f: ReturnType<typeof fixture>) => void, RegExp][] = [
  ['all battles including older than latest five', ({ db, player }) => {
    for (let i = 0; i < 7; i++) db.prepare('INSERT INTO battles VALUES (?, ?, ?, ?, ?)').run(`b${i}`, player.id, JSON.stringify({ state: { result: i ? { winner: 'player' } : null } }), i, i);
  }, /Active battle/],
  ...(['battle', 'between_maps'] as const).map(state => [`run ${state}`, ({ store, player }: ReturnType<typeof fixture>) => {
    const run = createRun('run', player.id, 1, ['u_erin'], 1, 0); run.state = state; store.saveRun(run);
  }, /Active run/] as [string, (f: ReturnType<typeof fixture>) => void, RegExp]),
  ...(['qualifier', 'knockout'] as const).map(state => [`annual ${state}`, ({ store, player }: ReturnType<typeof fixture>) => {
    const entry = createAnnualEntry('annual', player.id, 1, ['u_erin']); entry.state = state; store.saveAnnualEntry(entry);
  }, /Unfinished annual/] as [string, (f: ReturnType<typeof fixture>) => void, RegExp]),
  ['unsettled arena', ({ store, player }) => store.saveArenaDay(createArenaDay(player.id, 29)), /Unsettled arena/],
  ['festival', ({ store, player }) => { player.flags.festivalRound = 1; store.savePlayer(player); }, /festivalRound/],
  ['unknown player task', ({ store, player }) => store.addTask(player.id, 'unknown', Date.now(), {}), /due_task/],
  ['unknown global task', ({ store }) => store.addTask(null, 'unknown', Date.now(), {}), /due_task/],
  ['ambiguous recognized task payload', ({ store, player }) => store.addTask(player.id, 'month-snapshot', Date.now(), { day: 119 }), /due_task/],
  ['pending recruit', ({ db, player }) => db.prepare("UPDATE players SET flags = json_set(flags, '$.pendingRecruit', json('{}')) WHERE id = ?").run(player.id), /pendingRecruit/],
  ['unknown flags', ({ db, player }) => db.prepare("UPDATE players SET flags = json_set(flags, '$.mysteryDate', 100) WHERE id = ?").run(player.id), /Unsupported/],
  ['unknown unit field', ({ db, player }) => db.prepare("UPDATE units SET data = json_set(data, '$.mysteryDay', 100) WHERE player_id = ?").run(player.id), /Unsupported/],
  ['nested ambiguous date', ({ db, player }) => db.prepare("UPDATE units SET data = json_set(data, '$.inheritance', json('{\"legacyId\":\"old\",\"expiryDay\":100}')) WHERE player_id = ?").run(player.id), /Unsupported date/],
  ['ambiguous age', ({ db, player }) => db.prepare("UPDATE units SET data = json_set(data, '$.age', 99) WHERE player_id = ?").run(player.id), /Ambiguous unit age/],
  ['SQL JSON deadline mismatch', ({ db, store, player }) => { store.saveProductionOrder(createOrder('order', player.id, RECIPES[0], 110)); db.exec('UPDATE production_orders SET ready_day = 999'); }, /SQL\/JSON mismatch/],
  ['exact target arena collision', ({ store, player }) => { const arena = createArenaDay(player.id, 495); arena.settled = true; store.saveArenaDay(arena); }, /collides/],
];
for (const [label, lock, expected] of locks) test(`refuses ${label} without writing`, () => {
  const f = fixture();
  try {
    lock(f);
    const fingerprint = databaseFingerprint(f.db);
    assert.throws(() => applyCalendarMigration(f.db, [f.player.id], 120), expected);
    assert.equal(databaseFingerprint(f.db), fingerprint);
  } finally { f.db.close(); }
});

test('frozen histories stay byte-identical; source snapshots are isolated and cannot be overwritten', () => {
  const { db, store, player } = fixture();
  try {
    const arena = createArenaDay(player.id, 29); arena.settled = true; store.saveArenaDay(arena);
    const snapshot = store.saveSnapshot(player.id, 495, { roster: [], defense: null, label: 'old calendar' });
    db.prepare('INSERT INTO replays VALUES (?, ?, ?, ?, ?)').run('replay', player.id, '{"day":119,"roster":[{"ageBaseDays":2400}]}', 1, 1);
    db.prepare('INSERT INTO battles VALUES (?, ?, ?, ?, ?)').run('battle', player.id, '{"state":{"result":{"winner":"player"}},"endDay":119}', 1, 1);
    const annual = createAnnualEntry('annual', player.id, 1, []); annual.state = 'eliminated'; store.saveAnnualEntry(annual);
    db.prepare('INSERT INTO reincarnations VALUES (?, ?, ?, ?)').run('unit', player.id, '{"newAgeBaseDays":2400}', 1);
    db.prepare('INSERT INTO memorials VALUES (?, ?, ?, ?)').run('unit', player.id, '{"atDay":119}', 1);
    db.prepare('INSERT INTO legacies VALUES (?, ?, ?, ?, ?)').run('legacy', player.id, 'unit', '{"createdAt":1}', 1);
    store.saveReceipt(player.id, 'receipt', 1, 'hash', { day: 119 });
    const tables = ['battles', 'replays', 'snapshots', 'arena_days', 'annual_entries', 'reincarnations', 'memorials', 'legacies', 'events', 'command_receipts'];
    const history = tables.map(table => raw(db, table));
    assert.deepEqual(store.snapshotsAtDay(495, 'other'), []); // unmarked is never assumed current
    applyCalendarMigration(db, [player.id], 120);
    assert.deepEqual(tables.map(table => raw(db, table)), history);
    assert.deepEqual(store.snapshotsAtDay(495, 'other'), []);
    const current = store.saveSnapshot(player.id, 495, { roster: [], defense: null, label: 'current' });
    assert.notEqual(current.id, snapshot.id);
    assert.equal((db.prepare('SELECT data FROM snapshots WHERE id = ?').get(snapshot.id) as any).data, JSON.stringify(snapshot.data));
    assert.equal(store.snapshotsAtDay(495, 'other').length, 1);
  } finally { db.close(); }
});

test('known wall-clock task timestamps and completed production/dispatch histories remain unchanged', () => {
  const { db, store, player } = fixture();
  try {
    store.addTask(player.id, 'month-snapshot', 123456789, {});
    const order = createOrder('collected', player.id, RECIPES[0], 0); order.state = 'collected'; store.saveProductionOrder(order);
    const dispatch = createDispatch('returned', player.id, 1, [], 20, 'mercenary', 'sword', 0); dispatch.state = 'returned'; store.saveDispatch(dispatch);
    const before = ['due_tasks', 'production_orders', 'dispatches'].map(table => raw(db, table));
    applyCalendarMigration(db, [player.id], 120);
    assert.deepEqual(['due_tasks', 'production_orders', 'dispatches'].map(table => raw(db, table)), before);
  } finally { db.close(); }
});

test('CLI dry run leaves database and WAL bytes unchanged; verified WAL backup restores source', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'calendar-'));
  const path = join(dir, 'save.db'), backupPath = join(dir, 'backup.db');
  const { db, player } = fixture(path);
  try {
    const files = [path, `${path}-wal`].filter(existsSync);
    const bytes = files.map(file => readFileSync(file));
    const fingerprint = databaseFingerprint(db);
    const args = ['--db', path, '--player', player.id, '--from', '120'];
    assert.equal((await migrateCalendar(args) as any).mode, 'dry-run');
    files.forEach((file, i) => assert.deepEqual(readFileSync(file), bytes[i]));
    await assert.rejects(migrateCalendar([...args, '--apply']), /confirmation|confirm-calendar/);
    await assert.rejects(migrateCalendar(['--db', join(dir, 'missing.db'), '--player', player.id, '--from', '120', '--apply', '--confirm-calendar-source=120', '--backup', backupPath]), /ENOENT/);
    assert.equal(existsSync(join(dir, 'missing.db')), false);
    assert.equal((await migrateCalendar([...args, '--apply', '--confirm-calendar-source=120', '--backup', backupPath]) as any).mode, 'applied');
    assert.notEqual(databaseFingerprint(db), fingerprint);
    const copy = new DatabaseSync(backupPath, { readOnly: true });
    try { assert.equal(databaseFingerprint(copy), fingerprint); } finally { copy.close(); }
    const restoredPath = join(dir, 'restored.db'); copyFileSync(backupPath, restoredPath);
    const restored = new DatabaseSync(restoredPath);
    try {
      assert.equal(databaseFingerprint(restored), fingerprint);
      assert.equal((restored.prepare('PRAGMA integrity_check').get() as any).integrity_check, 'ok');
    } finally { restored.close(); }
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('all selected players are revalidated before any migration commits', () => {
  const { db, store, player } = fixture();
  try {
    const second = store.createPlayer(store.createAccount('second', null), 'second', 'second');
    delete second.flags.calendarVersion; second.flags.festivalRound = 1; store.savePlayer(second);
    const fingerprint = databaseFingerprint(db);
    assert.throws(() => applyCalendarMigration(db, [player.id, second.id], 120), /festivalRound/);
    assert.equal(databaseFingerprint(db), fingerprint);
  } finally { db.close(); }
});

test('rollback restores all writes, quotes, marker, version and audit; backup fingerprint revalidates', () => {
  const { db, store, player } = fixture();
  try {
    store.saveQuote('quote', player.id, 0, {});
    db.exec("CREATE TRIGGER reject_quote_delete BEFORE DELETE ON action_quotes BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    const fingerprint = databaseFingerprint(db);
    assert.throws(() => applyCalendarMigration(db, [player.id], 120, 'stale'), /changed since backup/);
    assert.throws(() => applyCalendarMigration(db, [player.id], 120, fingerprint), /test failure/);
    assert.equal(databaseFingerprint(db), fingerprint);
    assert.equal(store.getPlayer(player.id)!.flags.calendarVersion, undefined);
    assert.equal(store.getPlayer(player.id)!.version, 0);
    assert.ok(store.quote(player.id, 'quote'));
  } finally { db.close(); }
});
