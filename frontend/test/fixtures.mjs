import { openDb } from '../../backend/api/db.ts';
import { Store } from '../../backend/api/store.ts';
import { loginOrRegister } from '../../backend/api/auth.ts';
import { seedDefense, seedFullRoster } from '../../backend/api/test-support.ts';
import { createUnit } from '../../backend/common/game/model.ts';

export const TEST_PASSWORD = 'browser-test-password';

// 流程测试直接准备一手可胜的棋盘，结算仍通过真实 HTTP 操作完成。
export function prepareBrowserBattleWin(dbPath, playerId, battleId) {
  const store = new Store(openDb(dbPath));
  try {
    const battle = store.battle(playerId, battleId);
    const leader = battle.state.units.find(unit => unit.side === 'player');
    for (const enemy of battle.state.units.filter(unit => unit.side === 'enemy')) { enemy.alive = false; enemy.hp = 0; }
    if (battle.state.goal.kind === 'seize') leader.pos = [...battle.state.goal.throne];
    battle.initial = structuredClone(battle.state);
    store.saveBattle(battle);
    return { battleId, unitId: leader.id, moveTo: leader.pos, action: battle.state.goal.kind === 'seize' ? 'seize' : 'wait', commandId: `win-${battleId}` };
  } finally { store.db.close(); }
}

// 主线收尾战要先完成前置任务（派遣＋提交材料）；浏览器流程直接记完，前置任务本身由后端测试覆盖。
export function skipStoryStepsInDb(dbPath, playerId, chapter) {
  const store = new Store(openDb(dbPath));
  try {
    const player = store.getPlayer(playerId);
    player.flags.storyStepsDone = [...new Set([...(player.flags.storyStepsDone ?? []), `story-${chapter}-a`, `story-${chapter}-b`])];
    store.savePlayer(player);
  } finally { store.db.close(); }
}

// Existing-account coverage uses an explicit legacy fixture; new-account tests
// must complete the real setup UI rather than depending on the old starter roster.
export function seedBrowserAccount(dbPath, name, duplicates = false, qualificationRanks = {}) {
  const store = new Store(openDb(dbPath));
  try {
    const { player } = loginOrRegister(store, name, TEST_PASSWORD, '浏览器测试军团');
    seedFullRoster(store, player);
    seedDefense(store, player);
    for (const [id, ranks] of Object.entries(qualificationRanks)) {
      const unit = store.unit(player.id, id);
      Object.assign(unit.ranks, ranks);
      store.saveUnit(unit, player.id);
    }
    player.flags.setupCompleted = true;
    store.savePlayer(player);
    if (duplicates) {
      const original = store.unit(player.id, 'u_owen');
      original.growthType = 'early';
      original.age = original.baseAge = 20;
      original.ageBaseDays = 20 * 120;
      original.ageEpochDay = player.day;
      store.saveUnit(original, player.id);
      const twin = createUnit('owen', original.level, 'u_owen_twin', player.day, true, { growthType: 'late', age: 20 });
      twin.name = '同模板伙伴';
      store.addUnit(player.id, twin);
    }
  } finally { store.db.close(); }
}
