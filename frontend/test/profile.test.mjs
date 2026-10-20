import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, next) {
    return next(specifier.startsWith('@common/')
      ? new URL(`../../backend/common/${specifier.slice(8)}`, import.meta.url).href : specifier, context);
  },
});
const { asUnit, combatProfile, displayScale, COMBAT_KEYS } = await import('../src/pages/profile.ts');
const { CLASSES } = await import('@common/data/classes.ts');
const { WEAPONS } = await import('@common/data/weapons.ts');
const { createUnit, toSnapshot } = await import('@common/game/model.ts');

test('profile preserves Apollo personal trait while the permanent skill stat stays unchanged', () => {
  const record = createUnit('owen', 20, 'apollo', 0, true, { personalSkill: 'lightshot' });
  record.stats.skl = 59;
  const unit = asUnit(toSnapshot(record));
  const profile = combatProfile(unit);
  const plain = combatProfile({ ...unit, skill: undefined });
  assert.equal(unit.skill, 'lightshot');
  assert.equal(profile.now.hit - plain.now.hit, 118);
  assert.equal(profile.now.crit - plain.now.crit, 30);
  assert.equal(unit.stats.skl, 59);
});

test('basic radar shares a finite scale rounded above high stats', () => {
  assert.equal(displayScale([4, 20, 99]), 100);
  const values = [101, 124, 207, 333, 156, 299, 120, 180];
  const scale = displayScale(values);
  assert.equal(scale, 340);
  assert.ok(values.every(value => Number.isFinite(value / scale) && value / scale <= 1));
  assert.ok(values[0] / scale < values[3] / scale);
});

test('combat radar uses actual high stats and finite expanding scales', () => {
  const classId = Object.keys(CLASSES).find(id => CLASSES[id].weapons.sword);
  const weapon = Object.keys(WEAPONS).find(id => WEAPONS[id].type === 'sword' && WEAPONS[id].rank === 'E');
  const unit = {
    id: 'high-stats', name: 'High stats', side: 'player', classId, level: 99, exp: 0,
    stats: { hp: 150, str: 350, mag: 210, skl: 270, spd: 320, lck: 250, def: 230, res: 220, cha: 180 },
    con: 20, hp: 150, pos: [0, 0], weapons: [weapon], items: [], ranks: { sword: 'S' },
    acted: false, alive: true,
  };
  const before = structuredClone(unit.stats);
  const profile = combatProfile(unit);
  assert.equal(profile.weapon, weapon);
  assert.ok(profile.now.attack > 99);
  assert.ok(profile.now.hit > 200);
  for (const key of COMBAT_KEYS) {
    assert.ok(Number.isFinite(profile.now[key]), key);
    assert.ok(Number.isFinite(profile.scale[key]) && profile.scale[key] >= profile.now[key], key);
    assert.ok(Number.isFinite(profile.now[key] / profile.scale[key]), key);
  }
  assert.deepEqual(unit.stats, before);
});
