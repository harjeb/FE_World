import { fileURLToPath } from 'node:url';
import { openDb } from '../api/db.ts';
import { Store } from '../api/store.ts';
import { snapshotData, settleMonthlyRatings, syncPlayer } from '../api/services.ts';
import { isArenaDay } from '../common/game/calendar.ts';

// The worker (docs/07): month-end snapshots, arena-day settlement and the due_tasks queue. Because the
// calendar is personal and lazy, most of the work is idempotent sweeping — restarting never doubles it.
export function tick(store: Store, now = Date.now()): number {
  let handled = 0;
  // 现实月榜按服务端时钟归档与重置，不推进个人日期（docs/13 §6.4）。
  const rating = settleMonthlyRatings(store, now);
  handled += rating.archived.length;
  for (const player of store.allPlayers()) {
    if (player.registered && !isArenaDay(player.day)) {
      // Nothing to do; syncPlayer handles the lazy arena open/settle below.
    }
    const before = store.unsettledArenaDays(player.id).length;
    syncPlayer(store, player);
    handled += Math.max(0, before - store.unsettledArenaDays(player.id).length);
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
