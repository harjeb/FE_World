import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginOrRegister } from './auth.ts';
import { dispatch } from './handlers.ts';
import type { Context } from './handlers.ts';
import { companionPool, createSetupCompanion, setupCompanionClassId, stateView } from './services.ts';
import { CLASSES, CLASS_PATHS, canonicalClassId } from '../common/data/classes.ts';
import { CHARACTERS, CHARACTER_IDS } from '../common/data/characters.ts';
import type { CharacterId } from '../common/data/characters.ts';
import { WEAPONS } from '../common/data/weapons.ts';
import { canWield } from '../common/engine/units.ts';
import { QUEST_RECRUITS } from '../common/game/quests.ts';
import { OP } from '../common/protocol/ops.ts';
import type { Player } from './store.ts';

function fresh(name: string) {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, name, undefined, '测试军团');
  const ctx: Context = { store, accountId, player, agentModel: null, push: () => {} };
  return { store, ctx, player };
}

const HERO = { name: '星见', sex: 'female', portrait: 'random:female:setup-companion', allocation: { mag: 5, spd: 5 } };

test('开局同伴候选映射到所属路线的初级（stage 1）职业', () => {
  const pool = companionPool();
  assert.ok(pool.length > 0);
  assert.ok(pool.every(id => !QUEST_RECRUITS.includes(id)), '剧情奖励人物（ren/ig/mira）不进开局候选');
  for (const id of pool) {
    const classId = setupCompanionClassId(id);
    assert.equal(CLASSES[classId].stage, 1, `${id}: ${CHARACTERS[id].classId} → ${classId} 应为初级职业`);
    // 初级职业须属于预设职业所在路线的晋升路径（如 fighter 的初级入口是 gladiator，它同时横跨剑斧两路线）。
    const route = CLASSES[CHARACTERS[id].classId].route;
    assert.ok(CLASS_PATHS[route].some(path => path[0] === classId), `${id} 初级入口 ${classId} 应在 ${route} 路径上`);
  }
  // 两位原中级预设的映射样例：轻骑兵→飞鸵兵、萨满巫师→诅咒师。
  assert.equal(setupCompanionClassId('victor'), 'ornius_rider');
  assert.equal(setupCompanionClassId('sera'), 'adept');
});

test('开局入队工厂按初级职业创建 1 级单位，装备与熟练度兼容新职业', () => {
  for (const id of companionPool()) {
    const unit = createSetupCompanion(id as CharacterId, 0);
    const cls = CLASSES[unit.classId];
    assert.equal(cls.stage, 1, `${id} 入队职业 ${unit.classId} 应为初级`);
    assert.equal(unit.level, 1);
    // 熟练度全部 E，且覆盖该职业全部武器类型。
    for (const type of Object.keys(cls.weapons)) {
      assert.equal((unit.ranks as Record<string, string>)[type], 'E', `${id} ${type} 熟练度应为 E`);
    }
    // 携带武器全部是 E 级且当前职业可挥动。
    for (const wid of unit.weapons) {
      assert.equal(WEAPONS[wid as keyof typeof WEAPONS].rank, 'E', `${id} 起始武器 ${wid} 应为 E 级`);
      assert.ok(canWield(unit, wid as Parameters<typeof canWield>[1]), `${id} 应能使用起始武器 ${wid}`);
    }
    assert.ok(unit.items.some(row => row.id === 'vulnerary'), `${id} 应带伤药`);
  }
});

test('开局候选视图下发初级职业', () => {
  const { store, player } = fresh('setup-companion-view');
  type PoolEntry = { id: CharacterId; classId: string };
  const view = stateView(store, player) as { setup: { pool: PoolEntry[] } };
  for (const entry of view.setup.pool) {
    assert.equal(CLASSES[entry.classId as keyof typeof CLASSES].stage, 1, `${entry.id} 视图职业 ${entry.classId} 应为初级`);
    assert.equal(entry.classId, setupCompanionClassId(entry.id), '视图职业须与入队映射一致');
  }
});

test('COMPLETE_SETUP 后同伴以初级职业入队且装备兼容', t => {
  const { store, ctx, player } = fresh('setup-companion-complete');
  t.after(() => store.db.close());
  const result = dispatch(ctx, OP.COMPLETE_SETUP, { protagonist: HERO, companions: ['victor', 'lina'] }) as { companions: string[] };
  assert.deepEqual(result.companions, ['victor', 'lina']);
  for (const id of ['victor', 'lina'] as CharacterId[]) {
    const unit = store.unit(player.id, `u_${id}`)!;
    assert.equal(CLASSES[unit.classId].stage, 1, `${id} 入队职业 ${unit.classId} 应为初级`);
    assert.equal(unit.classId, setupCompanionClassId(id));
    assert.ok(unit.weapons.every(wid => canWield(unit, wid as Parameters<typeof canWield>[1])), `${id} 装备须与新职业兼容`);
  }
  // 固定任务伙伴不受影响：quest recruit 路径仍按角色表职业与 'recruit' 成套装备（ren 为例保持中级剑客）。
  assert.equal(CHARACTERS.ren.classId, 'swordsman');
  assert.ok(CLASSES[CHARACTERS.ren.classId].stage === 2, '任务伙伴职业不受开局初级化影响');
});
