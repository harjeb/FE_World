import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { CLASSES } from '../../backend/common/data/classes.ts';
import { STAT_KEYS } from '../../backend/common/data/types.ts';
import { applyGrowthBonus } from '../../backend/common/data/growth-types.ts';
import { rollLevelUp } from '../../backend/common/engine/growth.ts';
import { seedRng } from '../../backend/common/engine/rng.ts';

const roster = JSON.parse(readFileSync(new URL('./roster.json', import.meta.url), 'utf8'));
assert.deepEqual(roster.statOrder, STAT_KEYS);
assert.equal(roster.units.length, 17);
const stats = values => Object.fromEntries(STAT_KEYS.map((key, i) => [key, values[i]]));
const growthDoc = readFileSync(new URL('../../docs/38-cross-time-generals-draft.md', import.meta.url), 'utf8');
const output = [];
for (const row of roster.units) {
  const cls = CLASSES[row.classId];
  assert.ok(cls && cls.stage === 3, row.name);
  assert.equal(row.base.reduce((a, b) => a + b, 0), 70, `${row.name}: recruitment base unchanged`);
  assert.equal(row.enemyBonus.length, STAT_KEYS.length);
  assert.ok(row.enemyBonus.every(value => Number.isInteger(value) && value >= 0));
  assert.ok(row.enemyBonus.reduce((a, b) => a + b, 0) >= 20, `${row.name}: enemy-only bonus`);
  const line = growthDoc.split('\n').find(line => line.startsWith(`| ${row.name} |`) && /^\d+$/.test(line.split('|')[2].trim()));
  assert.ok(line, `${row.name}: growth table row`);
  assert.deepEqual(line.split('|').slice(2, 11).map(s => Number(s.trim())), row.growth, `${row.name}: growth matches design`);
  const personal = stats(row.growth);
  const rates = applyGrowthBonus(stats(STAT_KEYS.map(key => Math.max(0, personal[key] + cls.growth[key]))), 'growth', 25);
  const empty = STAT_KEYS.reduce((p, key) => p * Math.max(0, 1 - rates[key] / 100), 1);
  const factor = 1 + empty + empty ** 2;
  const base = stats(row.base);
  const level20 = stats(STAT_KEYS.map(key => Math.round(base[key] + 19 * rates[key] / 100 * factor)));
  const mean48 = stats(STAT_KEYS.map(key => level20[key] + 28 * rates[key] / 100 * factor));
  const recruit48 = stats(STAT_KEYS.map(key => Math.round(mean48[key])));
  const enemyBonus = stats(row.enemyBonus);
  const normal48 = stats(STAT_KEYS.map(key => Math.min(cls.caps[key] ?? Infinity, recruit48[key] + enemyBonus[key])));
  const level52 = stats(STAT_KEYS.map(key => Math.round(level20[key] + 32 * rates[key] / 100 * factor)));
  const hard52 = stats(STAT_KEYS.map(key => Math.min(cls.caps[key] ?? Infinity, Math.ceil((level52[key] + enemyBonus[key]) * (key === 'hp' ? 1.25 : 1.15)))));
  for (const key of STAT_KEYS) assert.equal(normal48[key] - recruit48[key], enemyBonus[key], `${row.name}: enemy gain is not lost to a cap`);
  // The expectation formula assumes no cap can be reached, including the rare all-success path.
  for (const key of STAT_KEYS) assert.ok(base[key] + 51 * Math.ceil(rates[key] / 100) < (cls.caps[key] ?? Infinity), `${row.name}: ${key} cap`);

  const sums = stats(STAT_KEYS.map(() => 0));
  const samples = 5000;
  for (let sample = 0; sample < samples; sample++) {
    const unit = { character: 'erin', classId: row.classId, stats: { ...level20 }, personalGrowth: personal, growthType: 'growth', age: 25 };
    const state = { growthRng: seedRng(`cross-time-level48:${row.name}:${sample}`) };
    for (let level = 20; level < 48; level++) {
      const { gains } = rollLevelUp(state, unit);
      for (const key of STAT_KEYS) unit.stats[key] += gains[key] ?? 0;
    }
    for (const key of STAT_KEYS) sums[key] += unit.stats[key];
  }
  const sampleMeans = stats(STAT_KEYS.map(key => sums[key] / samples));
  for (const key of STAT_KEYS) assert.ok(Math.abs(sampleMeans[key] - mean48[key]) < 0.25, `${row.name}: ${key} simulated mean`);
  output.push({ name: row.name, classId: row.classId, className: cls.name, base, personalGrowth: personal, classGrowth: cls.growth,
    rates, emptyLevelChance: empty, level20, mean48, recruit48, enemyBonus, normal48, hard52, con: row.con, hardCon: row.con + 2, move: cls.move,
    monteCarlo: { samples, mean: sampleMeans } });
}
writeFileSync(new URL('./levels.json', import.meta.url), JSON.stringify({ status: 'design-draft-not-runtime',
  method: 'recruit L20 = round(base + 19*r*(1+p0+p0^2)); recruit mean L48 = L20 + 28*r*(1+p0+p0^2); normal enemy = rounded recruit L48 + enemyBonus; hard enemy = (rounded recruit L52 + enemyBonus) then HP*1.25/others*1.15 ceil; never apply enemyBonus to recruits',
  units: output }, null, 2) + '\n');
for (const row of output) console.log(`| ${row.name} | ${row.className} | ${Object.values(row.normal48).join(' | ')} |`);
console.log('PASS: 17 class/growth/base checks; 85,000 engine growth samples agree within 0.25 points per stat.');
