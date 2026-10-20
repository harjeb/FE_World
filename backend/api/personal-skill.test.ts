import assert from 'node:assert/strict';
import test from 'node:test';
import { defenseBoard } from '../common/arena/rules.ts';
import type { Defense } from '../common/arena/rules.ts';
import { createUnit, toBattleUnit, toSnapshot } from '../common/game/model.ts';
import { OP } from '../common/protocol/ops.ts';
import { loginOrRegister } from './auth.ts';
import { openDb } from './db.ts';
import { dispatch, type Context } from './handlers.ts';
import { Store } from './store.ts';
import { seedFullRoster } from './test-support.ts';

test('personal trait survives storage, API snapshots and arena, replacing the portrait skill without taking a slot', t => {
  const db = openDb(':memory:'); t.after(() => db.close());
  const store = new Store(db), { accountId, player } = loginOrRegister(store, 'apollo', undefined, '光明神射');
  seedFullRoster(store, player);
  const unit = createUnit('owen', 20, 'u_apollo', player.day, true, { personalSkill: 'lightshot' });
  unit.name = '阿波罗'; unit.portrait = 'erin'; store.saveUnit(unit, player.id);
  const saved = store.unit(player.id, unit.id)!;
  assert.equal(saved.personalSkill, 'lightshot');
  assert.equal(toBattleUnit(saved, 'player', saved.id, [0, 0]).skill, 'lightshot');
  const ctx: Context = { store, player, accountId, agentModel: null, push: () => {} };
  const detail = dispatch(ctx, OP.GET_UNIT, { unitId: saved.id }) as { snapshot: ReturnType<typeof toSnapshot> };
  assert.equal(detail.snapshot.personalSkill, 'lightshot');
  assert.deepEqual(detail.snapshot.skills, []);
  const defense: Defense = { id: 'apollo', legion: 'test', points: 0, record: '', map: 'plains', commanders: ['owen'], bans: [],
    slots: [{ unit: detail.snapshot, pos: [0, 0], behavior: 'aggressive' }] };
  assert.equal(defenseBoard(defense).units[0].skill, 'lightshot');
  const old = createUnit('owen', 1, 'old', 0);
  assert.equal(toBattleUnit(old, 'player', old.id, [0, 0]).skill, 'hawkeye', 'legacy portrait skills unchanged');
});
