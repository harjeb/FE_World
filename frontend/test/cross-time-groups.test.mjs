import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('@common/') ? new URL(`../../backend/common/${specifier.slice(8)}`, import.meta.url).href : specifier, context);
} });
const { activationWarnings, groupStatus } = await import('../src/battle/cross-time-groups.ts');

const groups = [
  { id: 'A', name: '前殿四将', members: ['a'], status: 'scheduled', activationTurn: 2 },
  { id: 'B', name: '中厅五谋', members: ['b'], status: 'dormant', boundaryY: 13 },
  { id: 'C', name: '上殿四翼', members: ['c'], status: 'dormant', boundaryY: 8 },
  { id: 'D', name: '吕布本阵', members: ['d'], status: 'dormant', boundaryY: 4 },
];

test('planned landing warns for every crossed group before a command, including distant teleport landings', () => {
  assert.deepEqual(activationWarnings(groups, 3, 'player', [[10, 14]]), []);
  assert.equal(activationWarnings(groups, 3, 'player', [[10, 13]]).length, 1);
  const warnings = activationWarnings(groups, 3, 'player', [[10, 4]]);
  assert.equal(warnings.length, 3);
  assert.ok(warnings.every(text => text.includes('第 3 回合敌方阶段')));
});

test('assault warning includes misses; A retains turn two; enemy-phase landing schedules following turn', () => {
  assert.match(activationWarnings(groups, 1, 'player', [], ['a'])[0], /第 2 回合.*固定计时不提前/);
  assert.match(activationWarnings(groups, 3, 'player', [], ['c'])[0], /未命中也触发/);
  assert.match(activationWarnings(groups, 3, 'enemy', [[10, 13]])[0], /第 4 回合/);
  const active = groups.map(group => ({ ...group, status: 'active' }));
  assert.deepEqual(activationWarnings(active, 3, 'player', [[10, 1]], ['d']), []);
  assert.equal(groupStatus(groups[1]), '待命');
  assert.match(groupStatus(groups[0]), /第 2 回合/);
});
