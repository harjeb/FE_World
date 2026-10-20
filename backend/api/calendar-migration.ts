import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export type CalendarSource = 120 | 500;
type Json = Record<string, any>;
export interface CalendarPlan {
  playerId: string; from: CalendarSource; oldDay: number; newDay: number; version: number;
  noop: boolean; updates: { table: string; id: string; data: string; due?: number }[];
  flags: Json;
}

function object(text: string, label: string): Json {
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Unsupported ${label} JSON`);
  return value;
}
function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`Invalid ${label}`);
  return value as number;
}
// Preserve year/season and proportional position within the old 30-day season.
export function calendarDay120(day: number): number {
  integer(day, 'calendar day');
  return integer(Math.floor(day / 120) * 500 + Math.floor(day % 120 / 30) * 125 + Math.floor(day % 30 * 125 / 30), 'converted day');
}
function knownKeys(value: Json, keys: string[], label: string): void {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new Error(`Unsupported ${label}.${key}; manual review required`);
  }
}
function rejectUnknownDates(value: unknown, allowed: string[], path = ''): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const field = path ? `${path}.${key}` : key;
    if (/(?:days?|date|months?|quarters?|years?)$/i.test(key) && !allowed.includes(field)) throw new Error(`Unsupported date field ${field}`);
    rejectUnknownDates(child, allowed, field);
  }
}
const FLAG_KEYS = ['calendarVersion', 'calendarMigration', 'storedWeapons', 'storedBooks', 'clearedRegions', 'hardUnlocks', 'unlockedRegions', 'regionExploration', 'firstClearLevel', 'shopMonth', 'festivalRound', 'festivalYear', 'chapterExpClaimed', 'storyCompleted', 'recoveryBag', 'classPurchases', 'recruitFails', 'questsDone', 'questRewardsClaimed', 'questBoxes', 'regionReputation', 'companions', 'setupCompleted', 'emergencyClaimed', 'agentLastSeen', 'legacyUnlocked', 'pendingRecruit', 'recruitFailsByRegion', 'tavernQuarter', 'tavernCandidates', 'annualRewardsClaimed', 'towerCleared', 'challengeRewardsClaimed', 'minigameQuarter', 'minigamePlays', 'perfectWeapons', 'controlLease'];
const UNIT_KEYS = ['id', 'character', 'name', 'sex', 'portrait', 'classId', 'homeClassId', 'species', 'level', 'exp', 'stats', 'con', 'hp', 'weapons', 'weaponInstances', 'bookInstances', 'spellbooks', 'items', 'ranks', 'weaponExp', 'status', 'joinedDay', 'growthType', 'personalGrowth', 'baseAge', 'age', 'ageBaseDays', 'ageEpochDay', 'lifespanYears', 'growthLog', 'drugCounts', 'promotedFrom', 'cycle', 'growthAllocation', 'inheritedGrowth', 'classQualifications', 'classMastery', 'learningProgress', 'learnedSkills', 'learnedArts', 'equippedSkills', 'equippedArts', 'learnedSpells', 'lineageDepth', 'receivedLegacyId', 'isProtagonist', 'retiredDay', 'reincarnatedDay', 'inheritance', 'lockedRunId', 'lockedDispatchId'];

/** Read-only, raw SQLite inspection: never invokes normalizers or lazy settlement. */
export function planCalendarMigration(db: DatabaseSync, playerId: string, from: CalendarSource): CalendarPlan {
  if (from !== 120 && from !== 500) throw new Error('Explicit --from 120 or 500 required');
  const player = db.prepare('SELECT day, version, flags FROM players WHERE id = ?').get(playerId) as { day: number; version: number; flags: string } | undefined;
  if (!player) throw new Error(`Unknown player ${playerId}`);
  const flags = object(player.flags, 'flags');
  const oldDay = integer(player.day, 'player.day');
  integer(player.version, 'player.version');
  const marker = flags.calendarVersion;
  if (flags.calendarMigration && flags.calendarMigration.from !== from) throw new Error(`Calendar marker/source mismatch for ${playerId}`);
  const noop = marker === 500 && (from === 500 && !flags.calendarMigration || flags.calendarMigration?.from === from);
  if (marker !== undefined && marker !== from && !noop) throw new Error(`Calendar marker/source mismatch for ${playerId}`);
  const plan: CalendarPlan = { playerId, from, oldDay, newDay: from === 120 ? calendarDay120(oldDay) : oldDay, version: player.version, noop, updates: [], flags };
  if (noop) { plan.newDay = oldDay; return plan; }
  integer(player.version + 1, 'next player.version');
  knownKeys(flags, FLAG_KEYS, 'flags');
  if (flags.calendarMigration !== undefined) throw new Error('Unsupported existing migration metadata');
  if (flags.festivalRound !== 0) throw new Error('Active festivalRound');
  const rows = (table: string) => db.prepare(`SELECT * FROM ${table} WHERE player_id = ?`).all(playerId) as Json[];
  for (const row of rows('battles')) {
    const battle = object(row.data, 'battle');
    if (!battle.state || !battle.state.result) throw new Error('Active battle');
  }
  for (const row of rows('runs')) {
    const run = object(row.data, 'run');
    if (row.state !== run.state) throw new Error('Run SQL/JSON mismatch');
    if (['battle', 'between_maps'].includes(row.state)) throw new Error('Active run');
    if (!['completed', 'failed', 'withdrawn'].includes(row.state)) throw new Error('Unsupported run state');
  }
  for (const row of rows('annual_entries')) {
    const entry = object(row.data, 'annual entry');
    if (row.state !== entry.state) throw new Error('Annual SQL/JSON mismatch');
    if (['qualifier', 'knockout'].includes(row.state)) throw new Error('Unfinished annual entry');
    if (!['eliminated', 'champion', 'withdrawn'].includes(row.state)) throw new Error('Unsupported annual state');
  }
  for (const row of rows('arena_days')) {
    const arena = object(row.data, 'arena day');
    if (arena.day !== row.day || !!arena.settled !== !!row.settled) throw new Error('Arena SQL/JSON mismatch');
    if (!row.settled) throw new Error('Unsettled arena day');
    if (from === 120 && row.day === plan.newDay) throw new Error('Target day collides with frozen arena history');
  }
  // Even global tasks could affect selected players. Only the known wall-clock snapshot task is safe.
  const tasks = db.prepare('SELECT kind, payload FROM due_tasks WHERE done = 0 AND (player_id = ? OR player_id IS NULL)').all(playerId) as Json[];
  for (const task of tasks) {
    const payload = JSON.parse(task.payload ?? 'null');
    if (task.kind !== 'month-snapshot' || payload !== null && (typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length)) throw new Error('Unrecognized pending due_task');
  }
  if (from === 120) {
    rejectUnknownDates(flags, ['shopMonth', 'festivalYear', 'tavernQuarter', 'minigameQuarter']);
    if (flags.pendingRecruit !== undefined) throw new Error('Unsupported pendingRecruit JSON; resolve the offer before migration');
    // Candidate pools have no date coordinates; their source quarter indices stay valid.
    for (const row of rows('units')) {
      const unit = object(row.data, 'unit');
      knownKeys(unit, UNIT_KEYS, 'unit');
      rejectUnknownDates(unit, ['joinedDay', 'ageEpochDay', 'ageBaseDays', 'lifespanYears', 'retiredDay', 'reincarnatedDay']);
      if (unit.id !== row.id || integer(unit.joinedDay, 'joinedDay') > oldDay || unit.lockedRunId) throw new Error('Ambiguous unit identity/date/run lock');
      const epoch = integer(unit.ageEpochDay ?? unit.joinedDay, 'ageEpochDay');
      const base = integer(unit.ageBaseDays ?? integer(unit.baseAge, 'baseAge') * 120, 'ageBaseDays');
      const elapsed = unit.isProtagonist ? 0 : Math.max(0, oldDay - epoch);
      const years = Math.floor((base + elapsed) / 120);
      if (unit.age !== years || unit.isProtagonist && unit.baseAge !== years || epoch > oldDay) throw new Error('Ambiguous unit age; source age fields disagree');
      for (const key of ['joinedDay', 'ageEpochDay', 'retiredDay', 'reincarnatedDay']) {
        if (unit[key] !== undefined) unit[key] = calendarDay120(unit[key]);
      }
      unit.ageEpochDay = calendarDay120(epoch);
      unit.ageBaseDays = calendarDay120(base + elapsed) - (unit.isProtagonist ? 0 : plan.newDay - unit.ageEpochDay);
      integer(unit.ageBaseDays, 'converted ageBaseDays');
      plan.updates.push({ table: 'units', id: row.id, data: JSON.stringify(unit) });
    }
    for (const table of ['production_orders', 'dispatches']) {
      for (const row of rows(table)) {
        const data = object(row.data, table);
        const production = table === 'production_orders';
        knownKeys(data, production ? ['id', 'playerId', 'recipeId', 'facility', 'state', 'startedDay', 'readyDay', 'output', 'quality'] : ['id', 'playerId', 'state', 'region', 'startedDay', 'durationDays', 'returnDay', 'classId', 'weaponType', 'unitIds', 'result', 'createdAt', 'materialLoot', 'weaponLoot'], table);
        const key = production ? 'readyDay' : 'returnDay';
        rejectUnknownDates(data, ['startedDay', key, 'durationDays', 'result.day']);
        if (row.state !== data.state || row[production ? 'ready_day' : 'return_day'] !== data[key] || data.id !== row.id || data.playerId !== playerId) throw new Error(`${table} SQL/JSON mismatch`);
        if (!(production ? ['growing', 'ready', 'collected'] : ['running', 'returned', 'cancelled']).includes(data.state)) throw new Error(`Unsupported ${table} state`);
        // Completed records remain frozen in their source calendar.
        if (production ? data.state === 'collected' : data.state !== 'running') continue;
        integer(data.startedDay, 'startedDay'); integer(data[key], key);
        if (data.startedDay > oldDay || data[key] < data.startedDay) throw new Error(`Ambiguous ${table} dates`);
        if (!production && (data.result !== null || integer(data.durationDays, 'durationDays') !== data.returnDay - data.startedDay)) throw new Error('Ambiguous dispatch duration/result');
        const shift = plan.newDay - oldDay;
        data.startedDay += shift;
        data[key] += shift;
        integer(data[key], 'converted deadline');
        plan.updates.push({ table, id: row.id, data: JSON.stringify(data), due: data[key] });
      }
    }
  }
  flags.calendarVersion = 500;
  flags.calendarMigration = { from, at: Date.now(), oldDay, newDay: plan.newDay,
    legacySnapshotIds: from === 120 ? rows('snapshots').map(row => row.id) : [] };
  return plan;
}

export function databaseFingerprint(db: DatabaseSync): string {
  const hash = createHash('sha256');
  const schema = db.prepare("SELECT type, name, sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY type, name").all() as { type: string; name: string; sql: string }[];
  hash.update(JSON.stringify(schema));
  for (const row of schema) {
    if (row.type === 'table') hash.update(JSON.stringify(db.prepare(`SELECT * FROM "${row.name.replaceAll('"', '""')}" ORDER BY rowid`).all()));
  }
  return hash.digest('hex');
}

/** Caller must stop all writers and create/verify a SQLite backup before calling. */
export function applyCalendarMigration(db: DatabaseSync, playerIds: string[], from: CalendarSource, expectedFingerprint?: string): CalendarPlan[] {
  if (!playerIds.length || new Set(playerIds).size !== playerIds.length) throw new Error('Explicit unique player IDs required');
  db.exec('BEGIN IMMEDIATE');
  try {
    if (expectedFingerprint !== undefined && databaseFingerprint(db) !== expectedFingerprint) throw new Error('Database changed since backup; stop writers and retry with a new backup');
    // Revalidate every player under the write lock; all selected players commit together.
    const plans = playerIds.map(id => planCalendarMigration(db, id, from));
    if (plans.some(plan => !plan.noop)) db.exec(`CREATE TABLE IF NOT EXISTS calendar_migration_audit (
      player_id TEXT PRIMARY KEY, source_calendar INTEGER NOT NULL, target_calendar INTEGER NOT NULL,
      old_day INTEGER NOT NULL, new_day INTEGER NOT NULL, old_version INTEGER NOT NULL, detail TEXT NOT NULL
    )`);
    for (const plan of plans) {
      if (plan.noop) continue;
      for (const update of plan.updates) {
        const deadline = update.table === 'production_orders' ? ', ready_day = ?' : update.table === 'dispatches' ? ', return_day = ?' : '';
        const args = update.due === undefined ? [update.data, plan.playerId, update.id] : [update.data, update.due, plan.playerId, update.id];
        db.prepare(`UPDATE ${update.table} SET data = ?${deadline} WHERE player_id = ? AND id = ?`).run(...args);
      }
      const saved = db.prepare('UPDATE players SET day = ?, flags = ?, version = version + 1 WHERE id = ? AND version = ?')
        .run(plan.newDay, JSON.stringify(plan.flags), plan.playerId, plan.version);
      if (Number(saved.changes) !== 1) throw new Error('Player version conflict during calendar migration');
      db.prepare('DELETE FROM action_quotes WHERE player_id = ?').run(plan.playerId);
      db.prepare('INSERT INTO calendar_migration_audit VALUES (?, ?, 500, ?, ?, ?, ?)')
        .run(plan.playerId, from, plan.oldDay, plan.newDay, plan.version, JSON.stringify(plan));
    }
    db.exec('COMMIT');
    return plans;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
