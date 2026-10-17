import { openDb } from '../../backend/api/db.ts';
import { Store } from '../../backend/api/store.ts';
import { loginOrRegister } from '../../backend/api/auth.ts';
import { seedDefense, seedFullRoster } from '../../backend/api/test-support.ts';
import { createUnit } from '../../backend/common/game/model.ts';

// Existing-account coverage uses an explicit legacy fixture; new-account tests
// must complete the real setup UI rather than depending on the old starter roster.
export function seedBrowserAccount(dbPath, name, duplicates = false) {
  const store = new Store(openDb(dbPath));
  try {
    const { player } = loginOrRegister(store, name, undefined, '浏览器测试军团');
    seedFullRoster(store, player);
    seedDefense(store, player);
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
