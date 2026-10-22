import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combatExp, expPreview, gainExp } from './growth.ts';
import { createPinepassBattle } from '../battles/pinepass.ts';
import { createEnemy } from '../game/enemies.ts';

const unit = (level: number, boss = false) => createEnemy('test', { classId: 'fighter', level, boss, pos: [0, 0] });

test('five levels above a foe reduces base experience to one but retains the boss kill bonus', () => {
  for (const boss of [false, true]) {
    assert.ok(combatExp(unit(14), unit(10, boss), true, true) > 1);
    for (const level of [15, 16, 99]) {
      const kill = boss ? 21 : 1;
      assert.equal(combatExp(unit(level), unit(10, boss), true, true), kill);
      assert.equal(combatExp(unit(level), unit(10, boss), true, false), 1);
      assert.deepEqual(expPreview(unit(level), unit(10, boss)), { fight: 1, kill });
    }
  }
});

test('equal-level and under-level combat keeps its rewards; no damage gives no experience', () => {
  assert.equal(combatExp(unit(10), unit(10), true, true), 30);
  assert.equal(combatExp(unit(10), unit(10, true), true, true), 50);
  assert.ok(combatExp(unit(5), unit(10), true, true) > 30);
  assert.equal(combatExp(unit(15), unit(10), false, false), 0);
  assert.equal(combatExp(unit(10), unit(10), false, false), 0);
  assert.equal(combatExp(unit(10), unit(10, true), false, false), 0);
});

test('bosses add twenty only on kills and the total still caps at one hundred', () => {
  for (const [level, normal, boss] of [[6, 17, 37], [10, 30, 50], [14, 43, 63], [15, 47, 67], [30, 97, 100], [99, 100, 100]]) {
    assert.equal(combatExp(unit(10), unit(level), true, true), normal);
    assert.equal(combatExp(unit(10), unit(level, true), true, true), boss);
    assert.deepEqual(expPreview(unit(10), unit(level, true)), {
      fight: combatExp(unit(10), unit(level), true, false), kill: boss,
    });
    assert.equal(combatExp(unit(10), unit(level, true), false, true), boss);
  }
});

test('boss experience joins existing progress rather than granting a whole level', () => {
  for (const [before, level, exp] of [[0, 10, 63], [37, 11, 0], [99, 11, 62]]) {
    const state = createPinepassBattle('boss-exp');
    const actor = state.units.find(unit => unit.side === 'player')!;
    actor.level = 10; actor.exp = before;
    gainExp(state, actor, combatExp(actor, unit(14, true), true, true), []);
    assert.deepEqual([actor.level, actor.exp], [level, exp]);
  }
});
