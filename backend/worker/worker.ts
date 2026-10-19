import { fileURLToPath } from 'node:url';
import { openDb } from '../api/db.ts';
import { Store } from '../api/store.ts';
import { snapshotData, settleMonthlyRatings, syncPlayer } from '../api/services.ts';

// The worker (docs/07): month-end snapshots, arena-day settlement and the due_tasks queue. Because the
// calendar is personal and lazy, most of the work is idempotent sweeping — restarting never doubles it.
export function tick(store: Store, now = Date.now()): number {
  let handled = 0;
  // 现实月榜按服务端时钟归档与重置，不推进个人日期（docs/13 §6.4）。
  const rating = store.transaction(() => settleMonthlyRatings(store, now));
  handled += rating.archived.length;
  for (const { id } of store.allPlayers()) {
    handled += store.transaction(() => {
      const player = store.getPlayer(id);
      if (!player) return 0;
      const before = store.unsettledArenaDays(id).length;
      syncPlayer(store, player);
      return Math.max(0, before - store.unsettledArenaDays(id).length);
    });
  }
  for (const task of store.pendingTasks(now)) {
    const player = task.playerId ? store.getPlayer(task.playerId) : null;
    if (player) {
      if (task.kind === 'month-snapshot') {
        store.saveSnapshot(player.id, player.day, snapshotData(store, player));
        store.addEvent(player.id, 'snapshot', `第 ${player.day} 日快照已保存。`, {});
      }
    }
    store.completeTask(task.id);
    handled++;
  }
  return handled;
}

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 60_000);

if (process.argv[1] && process.argv[1].endsWith('worker.ts')) {
  const store = new Store(openDb(process.env.DB_PATH ?? fileURLToPath(new URL('../data/agent-tactics.db', import.meta.url))));
  const run = () => {
    try {
      const handled = tick(store);
      if (handled > 0) console.log(`[worker] ${new Date().toISOString()} handled ${handled}`);
    } catch (error) {
      console.error('[worker]', error);
    }
  };
  run();
  setInterval(run, INTERVAL_MS);
  console.log(`AgentTactics worker every ${INTERVAL_MS}ms`);
}
