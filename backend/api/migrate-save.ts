import { parseArgs } from 'node:util';
import { migrateSaveFile } from './save-migration.ts';

try {
  const { values } = parseArgs({ options: {
    db: { type: 'string' },
    'from-year-days': { type: 'string' },
    apply: { type: 'boolean', default: false },
    backup: { type: 'string' },
    help: { type: 'boolean', default: false },
  } });
  if (values.help) {
    console.log('Usage: npm --prefix backend run migrate-save -- --db PATH [--from-year-days 120|500] [--apply] [--backup NEW_PATH]\nDefault: read-only dry run. Stop API/Worker before applying. See docs/33-save-migration.md.');
  } else {
    if (!values.db) throw new Error('Missing --db PATH');
    const source = values['from-year-days'];
    if (source !== undefined && source !== '120' && source !== '500') throw new Error('--from-year-days must be 120 or 500');
    if (values.backup && !values.apply) throw new Error('--backup is only used with --apply');
    const report = migrateSaveFile({
      path: values.db, sourceYearDays: source === undefined ? undefined : Number(source) as 120 | 500,
      apply: values.apply, backupPath: values.backup,
    });
    console.log(JSON.stringify(report, null, 2));
    if (report.status === 'blocked') process.exitCode = 2;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
