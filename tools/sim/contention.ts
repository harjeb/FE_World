import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openDb } from '../../backend/api/db.ts';
import { Store } from '../../backend/api/store.ts';
import { loginOrRegister } from '../../backend/api/auth.ts';
import { dispatch } from '../../backend/api/handlers.ts';
import { syncPlayer } from '../../backend/api/services.ts';
import { OP } from '../../backend/common/protocol/ops.ts';

const filename = fileURLToPath(import.meta.url);
if (process.argv[2] === '--child') {
  const [, , , dbPath, playerId, role, commandId] = process.argv;
  const store = new Store(openDb(dbPath));
  process.send?.('ready');
  process.once('message', () => {
    try {
      const player = store.getPlayer(playerId)!;
      if (role === 'crash') {
        store.db.exec('BEGIN IMMEDIATE');
        player.gold += 999;
        store.savePlayer(player);
        store.addEvent(playerId, 'crash-probe', 'uncommitted', {});
        store.saveReceipt(playerId, 'crash-probe', OP.REST, 'probe', {});
        process.send?.('uncommitted');
        return;
      }
      if (role === 'worker') store.transaction(() => syncPlayer(store, store.getPlayer(playerId)!));
      else dispatch({ store, player, accountId: player.accountId, agentModel: null, push: () => {} }, OP.REST, { days: 1, commandId });
      process.send?.({ ok: true });
    } catch (error) { process.send?.({ ok: false, error: String(error) }); }
    finally { if (role !== 'crash') { store.db.close(); process.disconnect(); } }
  });
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await contention(), null, 2));
}

export async function contention() {
  const dir = mkdtempSync(join(tmpdir(), 'agent-contention-'));
  const path = join(dir, 'game.sqlite');
  let store = new Store(openDb(path));
  const children: ReturnType<typeof fork>[] = [];
  try {
    const { player } = loginOrRegister(store, 'contention', 'test-password', '竞争验证');
    const spawn = (role: string, id: string) => {
      const child = fork(filename, ['--child', path, player.id, role, id], { execPath: process.execPath, execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
      children.push(child);
      let stderr = '';
      child.stderr?.on('data', b => { stderr += b; });
      const wait = () => new Promise<any>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('child timeout')), 15000);
        child.once('message', value => { clearTimeout(timer); resolve(value); });
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('exit', code => { clearTimeout(timer); reject(new Error(`child exited ${code}: ${stderr}`)); });
      });
      return { child, wait };
    };
    const race = async (roles: [string, string][]) => {
      const peers = roles.map(([role, id]) => spawn(role, id));
      await Promise.all(peers.map(p => p.wait()));
      const results = peers.map(p => p.wait());
      peers.forEach(p => p.child.send('go'));
      return Promise.all(results);
    };
    const same = await race([['api', 'same'], ['api', 'same']]);
    const sameDay = store.getPlayer(player.id)!.day;
    const distinct = await race([['api', 'distinct-a'], ['api', 'distinct-b'], ['worker', '']]);
    const distinctDay = store.getPlayer(player.id)!.day;
    const beforeCrash = store.getPlayer(player.id)!;
    const crash = spawn('crash', '');
    await crash.wait();
    const pending = crash.wait(); crash.child.send('go');
    assert.equal(await pending, 'uncommitted');
    const exited = new Promise(resolve => crash.child.once('exit', resolve));
    crash.child.kill('SIGKILL'); await exited;
    store.db.close(); store = new Store(openDb(path));
    assert.deepEqual(store.getPlayer(player.id), beforeCrash);
    assert.equal(store.receipt(player.id, 'crash-probe'), null);
    assert.equal(store.db.prepare("SELECT count(*) AS n FROM events WHERE kind = 'crash-probe'").get()!.n, 0);
    const orphanOutbox = store.db.prepare('SELECT count(*) AS n FROM outbox o LEFT JOIN events e ON e.id=o.event_id WHERE e.id IS NULL').get()!.n;
    assert.equal(orphanOutbox, 0);
    const missingOutbox = store.db.prepare('SELECT count(*) AS n FROM events e LEFT JOIN outbox o ON o.event_id=e.id WHERE o.event_id IS NULL').get()!.n;
    assert.equal(missingOutbox, 0);
    return { same, sameDay, distinct, distinctDay,
      checks: { sameIdExactlyOneDay: sameDay === 1, distinctIdsNoLostUpdates: distinctDay === 3, crashRollback: true, eventsOutboxAtomic: true },
      receipts: ['same', 'distinct-a', 'distinct-b'].map(id => ({ id, committed: !!store.receipt(player.id, id) })) };
  } finally {
    children.forEach(child => { if (child.exitCode === null) child.kill('SIGKILL'); });
    store.db.close(); rmSync(dir, { recursive: true, force: true });
  }
}
