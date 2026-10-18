import { DatabaseSync } from 'node:sqlite';
import type { SQLInputValue } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { CHARACTERS } from '../common/data/characters.ts';
import { DAYS_PER_YEAR } from '../common/game/calendar.ts';

export const SAVE_SCHEMA_VERSION = 1;
const METADATA_SQL = 'CREATE TABLE IF NOT EXISTS save_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)';
type Row = Record<string, string | number | null>;
type JsonObject = Record<string, any>;
type SourceYearDays = 120 | 500;

function hasTable(db: DatabaseSync, name: string): boolean {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
}
function metadata(db: DatabaseSync, key: string): string | undefined {
  if (!hasTable(db, 'save_metadata')) return undefined;
  return (db.prepare('SELECT value FROM save_metadata WHERE key = ?').get(key) as { value: string } | undefined)?.value;
}
function setMetadata(db: DatabaseSync, key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO save_metadata (key, value) VALUES (?, ?)').run(key, value);
}
function checkSchema(db: DatabaseSync): void {
  const version = metadata(db, 'schema_version');
  if (version !== undefined && (!/^\d+$/.test(version) || Number(version) > SAVE_SCHEMA_VERSION)) {
    throw new Error(`Unsupported save schema version: ${version}`);
  }
}

// Startup never guesses the calendar of an existing populated save. The CLI can adopt an
// already-500-day unmarked save without scaling it, or explicitly migrate a 120-day save.
export function assertCurrentSave(db: DatabaseSync): void {
  checkSchema(db);
  const calendar = metadata(db, 'calendar_days_per_year');
  const populated = hasTable(db, 'players') && !!db.prepare('SELECT 1 FROM players LIMIT 1').get();
  if ((calendar !== undefined && calendar !== String(DAYS_PER_YEAR)) || (populated && calendar === undefined)) {
    throw new Error('SAVE_CALENDAR_MIGRATION_REQUIRED: run migrate-save with --from-year-days 120 or 500; inspect the dry run before --apply (docs/33-save-migration.md)');
  }
}

export function initializeSaveMetadata(db: DatabaseSync): void {
  db.exec(METADATA_SQL);
  setMetadata(db, 'schema_version', String(SAVE_SCHEMA_VERSION));
  setMetadata(db, 'calendar_days_per_year', String(DAYS_PER_YEAR));
}

function dayNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid game day: ${label}`);
  return value;
}

// Preserve both ends of each quarter: D0 -> D0, D29 -> D124, D119 -> D499.
// Arena-day snapshots therefore remain on arena days, including at year boundaries.
export function migrateCalendarDay(value: number): number {
  const day = dayNumber(value, 'calendar');
  const result = Math.floor(day / 30) * 125 + Math.round(day % 30 * 124 / 29);
  return dayNumber(result, 'converted calendar');
}

function object(text: unknown, label: string): JsonObject {
  let value: unknown;
  try { value = JSON.parse(String(text)); } catch { throw new Error(`Invalid JSON: ${label}`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid JSON object: ${label}`);
  return value as JsonObject;
}
function convertFields(data: JsonObject, fields: string[]): void {
  for (const field of fields) if (data[field] !== undefined && data[field] !== null) data[field] = migrateCalendarDay(data[field]);
}
function convertUnit(unit: JsonObject, referenceDay: number): void {
  const joined = dayNumber(unit.joinedDay, 'unit.joinedDay');
  const epoch = dayNumber(unit.ageEpochDay ?? joined, 'unit.ageEpochDay');
  const base = unit.ageBaseDays ?? (unit.baseAge ?? CHARACTERS[unit.character as keyof typeof CHARACTERS]?.age) * 120;
  const ageDays = dayNumber(base, 'unit.ageBaseDays') + (unit.isProtagonist ? 0 : Math.max(0, referenceDay - epoch));
  unit.ageBaseDays = dayNumber(Math.round(ageDays * DAYS_PER_YEAR / 120), 'converted age');
  unit.ageEpochDay = migrateCalendarDay(referenceDay);
  unit.age = Math.floor(unit.ageBaseDays / DAYS_PER_YEAR);
  convertFields(unit, ['joinedDay', 'retiredDay', 'reincarnatedDay']);
}

export interface SaveMigrationReport {
  status: 'ready' | 'blocked' | 'up-to-date' | 'applied';
  fromYearDays: number | null;
  toYearDays: number;
  schemaVersion: number;
  players: { id: string; fromDay: number; toDay: number }[];
  rows: Record<string, number>;
  blockers: string[];
  notes: string[];
  backupPath?: string;
}

interface Change { sql: string; values: SQLInputValue[] }
interface Plan { report: SaveMigrationReport; changes: Change[] }

// A read-only plan also parses and validates the exact fields that an apply will write.
function buildPlan(db: DatabaseSync, source?: SourceYearDays): Plan {
  checkSchema(db);
  if (!hasTable(db, 'players')) throw new Error('Not a game save: missing players table');
  const calendar = metadata(db, 'calendar_days_per_year');
  const current = calendar === String(DAYS_PER_YEAR) && metadata(db, 'schema_version') === String(SAVE_SCHEMA_VERSION);
  const from = current ? DAYS_PER_YEAR : calendar === undefined ? source : Number(calendar);
  if (!current && (from !== 120 && from !== 500)) throw new Error('Specify --from-year-days 120 or 500 for an unmarked save');
  if (!current && calendar !== undefined && source !== undefined && source !== from) throw new Error('Source calendar disagrees with saved metadata');
  const report: SaveMigrationReport = {
    status: current ? 'up-to-date' : 'ready', fromYearDays: from ?? null, toYearDays: DAYS_PER_YEAR,
    schemaVersion: SAVE_SCHEMA_VERSION, players: [], rows: {}, blockers: [],
    notes: from === 120 ? [
      'Annual indices and claimed rewards stay frozen; unentered old windows do not carry over to the current year-end schedule.',
      'Events, outbox and command receipts retain their original payloads and old-calendar text; refresh GET_STATE after a receipt replay.',
      'Production and dispatch work keeps its original action-day duration and remaining days; completed work is anchored at its converted completion date.',
    ] : [],
  };
  if (current) return { report, changes: [] };
  const scaling = from === 120;
  const columns = (db.prepare('PRAGMA table_info(players)').all() as { name: string }[]).map(row => row.name);
  const players = db.prepare('SELECT id, day, flags FROM players ORDER BY id').all() as Row[];
  const ownerDays = new Map<string, number>();
  const changes: Change[] = [];
  if (!columns.includes('version')) changes.push({ sql: 'ALTER TABLE players ADD COLUMN version INTEGER NOT NULL DEFAULT 0', values: [] });
  for (const row of players) {
    const id = String(row.id), oldDay = dayNumber(row.day, `player ${id}`);
    ownerDays.set(id, oldDay);
    const newDay = scaling ? migrateCalendarDay(oldDay) : oldDay;
    report.players.push({ id, fromDay: oldDay, toDay: newDay });
    const flags = object(row.flags, `player ${id} flags`);
    if (scaling && flags.pendingRecruit) convertFields(flags.pendingRecruit, ['day']);
    changes.push({ sql: 'UPDATE players SET day = ?, flags = ?, version = version + 1 WHERE id = ?', values: [newDay, JSON.stringify(flags), id] });
  }
  report.rows.players = players.length;
  const ownerDay = (row: Row): number => {
    const day = ownerDays.get(String(row.player_id));
    if (day === undefined) throw new Error(`Missing player for migrated record: ${row.player_id}`);
    return day;
  };
  const jsonTables = ['units', 'production_orders', 'dispatches', 'annual_entries', 'runs', 'battles', 'replays', 'arena_days', 'snapshots', 'memorials', 'reincarnations'];
  for (const table of jsonTables) {
    if (!hasTable(db, table)) continue;
    // rowid is used only as an internal row locator; game IDs and all references stay stable.
    const rows = db.prepare(`SELECT rowid AS migration_rowid, * FROM ${table}`).all() as Row[];
    report.rows[table] = rows.length;
    for (const row of rows) {
      const data = object(row.data, `${table}:${row.migration_rowid}`);
      if (!scaling) continue;
      const oldNow = ownerDay(row), newNow = migrateCalendarDay(oldNow);
      const fields: string[] = [];
      const values: SQLInputValue[] = [];
      const blocked = (reason: string) => report.blockers.push(`${table}:${row.migration_rowid}: ${reason}`);
      switch (table) {
        case 'units':
          convertUnit(data, oldNow);
          break;
        case 'production_orders':
        case 'dispatches': {
          const production = table === 'production_orders';
          const end = production ? 'readyDay' : 'returnDay';
          const column = production ? 'ready_day' : 'return_day';
          if (row[column] !== data[end] || row.state !== data.state) throw new Error(`Inconsistent ${table} index/data`);
          const oldStart = dayNumber(data.startedDay, `${table}.startedDay`), oldEnd = dayNumber(data[end], `${table}.${end}`);
          const duration = oldEnd - oldStart;
          if (duration < 0 || (!production && duration !== data.durationDays)) throw new Error(`Invalid ${table} duration`);
          const pending = production ? data.state !== 'collected' : data.state === 'running';
          // Keep actual work/rewards and remaining days. Completed work is anchored at its migrated
          // completion date, with its original action-day duration, rather than becoming a longer job.
          data[end] = pending ? dayNumber(newNow + oldEnd - oldNow, 'shifted deadline') : migrateCalendarDay(oldEnd);
          data.startedDay = dayNumber(data[end] - duration, 'shifted start');
          if (data.result) convertFields(data.result, ['day']);
          fields.push(`${column} = ?`); values.push(data[end]);
          break;
        }
        case 'annual_entries':
          if (row.state === 'qualifier' || row.state === 'knockout') blocked('finish or withdraw the annual entry using the old server');
          if (data.roster) for (const unit of Object.values(data.roster)) convertUnit(unit as JsonObject, oldNow);
          break;
        case 'runs':
          if (row.state === 'battle' || row.state === 'between_maps') blocked('finish or withdraw the expedition using the old server');
          break;
        case 'battles':
        case 'replays':
          if (table === 'battles' && !data.state?.result) blocked('finish or retreat from the battle using the old server');
          convertFields(data, ['endDay', 'arenaDay']);
          // Frozen state, RNG, actions, seed, rules/catalog versions and actual action cost are untouched.
          break;
        case 'arena_days':
          if (row.day !== data.day) throw new Error('Inconsistent arena day index/data');
          if (Object.values(data.attacks ?? {}).some((attack: any) => attack.status === 'fighting')) blocked('finish the arena battle using the old server');
          convertFields(data, ['day']);
          fields.push('day = ?'); values.push(data.day);
          break;
        case 'snapshots':
          if (!Array.isArray(data.roster)) throw new Error('Invalid snapshot roster');
          for (const unit of data.roster) if (unit.joinedDay !== undefined) convertUnit(unit, dayNumber(row.day, 'snapshot.day'));
          if (data.label === `第 ${row.day} 日快照`) data.label = `第 ${migrateCalendarDay(dayNumber(row.day, 'snapshot.day'))} 日快照`;
          fields.push('day = ?'); values.push(migrateCalendarDay(dayNumber(row.day, 'snapshot.day')));
          break;
        case 'memorials':
          convertFields(data, ['atDay']);
          break;
        case 'reincarnations':
          if (data.newAgeBaseDays !== undefined) data.newAgeBaseDays = dayNumber(Math.round(dayNumber(data.newAgeBaseDays, 'reincarnation age') * DAYS_PER_YEAR / 120), 'converted reincarnation age');
          break;
      }
      changes.push({ sql: `UPDATE ${table} SET data = ?${fields.length ? ', ' + fields.join(', ') : ''} WHERE rowid = ?`, values: [JSON.stringify(data), ...values, row.migration_rowid] });
    }
  }
  if (scaling && hasTable(db, 'action_quotes')) changes.push({ sql: 'DELETE FROM action_quotes', values: [] });
  if (report.blockers.length) report.status = 'blocked';
  return { report, changes };
}

function checkIntegrity(db: DatabaseSync): void {
  const result = db.prepare('PRAGMA integrity_check').all() as { integrity_check: string }[];
  if (result.length !== 1 || result[0].integrity_check !== 'ok') throw new Error('SQLite integrity_check failed');
  if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('SQLite foreign_key_check failed');
}

export interface SaveMigrationOptions {
  path: string;
  sourceYearDays?: SourceYearDays;
  apply?: boolean;
  backupPath?: string;
}

export function migrateSaveFile(options: SaveMigrationOptions): SaveMigrationReport {
  const path = resolve(options.path);
  if (!existsSync(path)) throw new Error(`Save does not exist: ${path}`);
  if (options.sourceYearDays !== undefined && options.sourceYearDays !== 120 && options.sourceYearDays !== 500) throw new Error('Unsupported source calendar');
  const db = new DatabaseSync(path, { readOnly: !options.apply });
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec('BEGIN');
    let plan: Plan;
    try { checkIntegrity(db); plan = buildPlan(db, options.sourceYearDays); }
    finally { db.exec('ROLLBACK'); }
    if (!options.apply || plan.report.status !== 'ready') return plan.report;
    const backupPath = resolve(options.backupPath ?? `${path}.pre-calendar-${Date.now()}.db`);
    if (backupPath === path || existsSync(backupPath)) throw new Error('Backup must be a new path, different from the source save');
    mkdirSync(dirname(backupPath), { recursive: true });
    const dataVersion = () => (db.prepare('PRAGMA data_version').get() as { data_version: number }).data_version;
    const beforeBackup = dataVersion();
    // VACUUM INTO creates a consistent standalone SQLite image including committed WAL pages.
    db.prepare('VACUUM INTO ?').run(backupPath);
    db.exec('BEGIN IMMEDIATE');
    try {
      if (dataVersion() !== beforeBackup) throw new Error('Save changed during backup; stop API/Worker and retry with a new backup path');
      plan = buildPlan(db, options.sourceYearDays);
      if (plan.report.status !== 'ready') throw new Error('Save state changed before migration; inspect a new dry run');
      for (const change of plan.changes) db.prepare(change.sql).run(...change.values);
      initializeSaveMetadata(db);
      setMetadata(db, 'last_calendar_migration', JSON.stringify({
        fromYearDays: plan.report.fromYearDays, toYearDays: DAYS_PER_YEAR, schemaVersion: SAVE_SCHEMA_VERSION,
        appliedAt: new Date().toISOString(), backupPath,
      }));
      checkIntegrity(db);
      db.exec('COMMIT');
      return { ...plan.report, status: 'applied', backupPath };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } finally { db.close(); }
}
