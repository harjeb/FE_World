import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combatExp, expPreview } from './growth.ts';
import { createEnemy } from '../game/enemies.ts';

const unit = (level: number, boss = false) => createEnemy('test', { classId: 'fighter', level, boss, pos: [0, 0] });

test('five levels above a foe caps the entire combat award at one, including bosses', () => {
  for (const boss of [false, true]) {
    assert.ok(combatExp(unit(14), unit(10, boss), true, true) > 1);
    for (const level of [15, 16, 99]) {
      assert.equal(combatExp(unit(level), unit(10, boss), true, true), 1);
      assert.equal(combatExp(unit(level), unit(10, boss), true, false), 1);
      assert.deepEqual(expPreview(unit(level), unit(10, boss)), { fight: 1, kill: 1 });
    }
  }
});

test('equal-level and under-level combat keeps its rewards; no damage gives no experience', () => {
  assert.equal(combatExp(unit(10), unit(10), true, true), 30);
  assert.equal(combatExp(unit(10), unit(10, true), true, true), 70);
  assert.ok(combatExp(unit(5), unit(10), true, true) > 30);
  assert.equal(combatExp(unit(15), unit(10), false, false), 0);
  assert.equal(combatExp(unit(10), unit(10), false, false), 0);
});
