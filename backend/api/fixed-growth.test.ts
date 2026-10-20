import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHARACTERS, LEGACY_FIXED_GROWTH } from '../common/data/characters.ts';
import { createUnit } from '../common/game/model.ts';
import { loginOrRegister } from './auth.ts';
import { openDb } from './db.ts';
import { Store } from './store.ts';

test('a saved legacy fixed companion adopts new growth on read and persists it on the next write', t => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const store = new Store(db);
  const { player } = loginOrRegister(store, 'fixed-growth-test', undefined, '成长测试');
  const sera = createUnit('sera', 41, 'u_sera', player.day);
  store.saveUnit(sera, player.id);
  sera.personalGrowth = { ...LEGACY_FIXED_GROWTH.sera };
  db.prepare('UPDATE units SET data = ? WHERE player_id = ? AND id = ?').run(JSON.stringify(sera), player.id, sera.id);
  const loaded = store.unit(player.id, sera.id)!;
  assert.deepEqual(loaded.personalGrowth, CHARACTERS.sera.growth);
  assert.deepEqual(loaded.stats, sera.stats);
  assert.equal(loaded.level, 41);
  store.saveUnit(loaded, player.id);
  const row = db.prepare('SELECT data FROM units WHERE player_id = ? AND id = ?').get(player.id, sera.id) as { data: string };
  assert.deepEqual(JSON.parse(row.data).personalGrowth, CHARACTERS.sera.growth);
  assert.deepEqual(store.unit(player.id, sera.id), loaded);
});
