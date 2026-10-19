import { DatabaseSync, backup } from 'node:sqlite';
import { closeSync, openSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyCalendarMigration, databaseFingerprint, planCalendarMigration } from '../backend/api/calendar-migration.ts';
import type { CalendarSource } from '../backend/api/calendar-migration.ts';

export async function migrateCalendar(args: string[]): Promise<unknown> {
  let dbPath: string | undefined, backupPath: string | undefined, from: CalendarSource | undefined, confirm: string | undefined;
  let apply = false;
  const ids: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--apply') apply = true;
    else if (arg === '--db') dbPath = args[++i];
    else if (arg === '--backup') backupPath = args[++i];
    else if (arg === '--player') ids.push(args[++i]);
    else if (arg === '--from') {
      const value = args[++i];
      if (value !== '120' && value !== '500') throw new Error('--from must be 120 or 500');
      from = Number(value) as CalendarSource;
    } else if (arg.startsWith('--confirm-calendar-source=')) confirm = arg.split('=')[1];
    else throw new Error(`Unknown argument ${arg}`);
  }
  if (!dbPath || !from || !ids.length || ids.some(id => !id || id.startsWith('--')) || new Set(ids).size !== ids.length) throw new Error('Usage: node tools/migrate-calendar.ts --db PATH --player ID [--player ID ...] --from 120|500 [--apply --confirm-calendar-source=120|500 --backup NEW_PATH]');
  if (apply && (confirm !== String(from) || !backupPath)) throw new Error('Apply requires matching --confirm-calendar-source and a new --backup path; stop API, worker and all other writers first');
  if (!statSync(dbPath).isFile()) throw new Error('Database path must be an existing file');
  // Do not use openDb: it initializes schemas and changes pragmas even during a dry run.
  const db = new DatabaseSync(dbPath, { readOnly: !apply });
  try {
    const plans = ids.map(id => planCalendarMigration(db, id, from!));
    if (!apply || plans.every(plan => plan.noop)) return { mode: apply ? 'noop' : 'dry-run', plans };
    if (resolve(dbPath) === resolve(backupPath!)) throw new Error('Backup must differ from source');
    // Exclusive reservation prevents overwriting an existing recovery copy.
    closeSync(openSync(backupPath!, 'wx', 0o600));
    await backup(db, backupPath!);
    const copy = new DatabaseSync(backupPath!, { readOnly: true });
    let fingerprint: string;
    try {
      const integrity = copy.prepare('PRAGMA integrity_check').all() as { integrity_check: string }[];
      if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') throw new Error('Backup integrity verification failed');
      fingerprint = databaseFingerprint(copy);
      if (databaseFingerprint(db) !== fingerprint) throw new Error('Backup differs from source; stop all writers and retry with a new path');
    } finally { copy.close(); }
    return { mode: 'applied', backup: resolve(backupPath!), plans: applyCalendarMigration(db, ids, from, fingerprint) };
  } finally { db.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await migrateCalendar(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
}
