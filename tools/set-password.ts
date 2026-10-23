import { randomBytes } from 'node:crypto';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { setAccountPassword } from '../backend/api/auth.ts';
import { Store } from '../backend/api/store.ts';

// Local operator only: generated secrets never enter shell arguments or environment variables.
export function resetPassword(args: string[]): { name: string; password: string } {
  let dbPath: string | undefined, name: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--db') dbPath = args[++i];
    else if (args[i] === '--name') name = args[++i];
    else throw new Error('Unknown argument; passwords are generated, not accepted as arguments');
  }
  if (!dbPath || !name || name.startsWith('--')) throw new Error('Usage: node tools/set-password.ts --db EXISTING_DB --name ACCOUNT_NAME');
  if (!statSync(dbPath).isFile()) throw new Error('Database must be an existing file');
  const db = new DatabaseSync(dbPath);
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    const store = new Store(db);
    const account = store.accountByName(name);
    if (!account) throw new Error('账号不存在；此命令不会创建账号');
    const password = randomBytes(18).toString('base64url');
    setAccountPassword(store, account.id, password);
    return { name: account.name, password };
  } finally { db.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(resetPassword(process.argv.slice(2)))); }
  catch (error) { console.error(error instanceof Error ? error.message : '设置密码失败'); process.exitCode = 1; }
}
