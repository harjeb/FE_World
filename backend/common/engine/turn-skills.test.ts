import assert from 'node:assert/strict';
import test from 'node:test';
import { createPinepassBattle } from '../battles/pinepass.ts';
import { createFestivalBattle } from '../game/battles.ts';
import { createUnit, normalizeUnit, toBattleUnit, toSnapshot } from '../game/model.ts';
import { artBonus, artStats, expireArtPhase } from './art-effects.ts';
import { forecast } from './combat.ts';
import { applyTurnSkills, initializeTurnSkills } from './turn-skills.ts';

function setup(level = 1) {
  const state = createPinepassBattle('protagonist-skill');
  state.map = { width: 10, height: 10, tiles: Array.from({ length: 10 }, () => Array(10).fill('plain')) };
  const hero = createUnit('erin', level, 'hero', 0, true);
  hero.isProtagonist = true;
  const source = toBattleUnit(hero, 'player', 'hero', [3, 3]);
  const ally = toBattleUnit(createUnit('erin', 1, 'ally', 0, true), 'player', 'ally', [2, 2]);
  const enemy = toBattleUnit(createUnit('erin', 1, 'enemy', 0, true), 'enemy', 'enemy', [4, 3]);
  for (const unit of [source, ally, enemy]) {
    unit.stats = { hp: 100, str: 12, mag: 12, skl: 0, spd: 10, lck: 0, def: 8, res: 8, cha: 0 };
    unit.hp = 100; unit.con = 100; unit.weapons = ['iron_sword']; unit.ranks = { sword: 'S' };
    unit.classSkills = []; unit.skills = []; unit.weaponInstances = undefined;
  }
  enemy.skill = ally.skill = undefined;
  state.units = [source, ally, enemy];
  return { state, source, ally, enemy, hero };
}

test('new snapshots and old protagonists receive the exclusive skill without changing attributes', () => {
  const { hero } = setup();
  const before = { ...hero.stats };
  assert.equal(toSnapshot(hero).personalSkill, 'divine_inspiration');
  assert.equal(normalizeUnit(hero).personalSkill, 'divine_inspiration');
  assert.deepEqual(hero.stats, before);
  assert.equal(toSnapshot(createUnit('erin', 1, 'ordinary', 0)).personalSkill, undefined);
});

test('aura thresholds, exact radius, allies only, and no stacking', () => {
  for (const level of [1, 29, 30, 59, 60, 99]) {
    const { state, source, ally, enemy } = setup(level);
    const baseline = forecast(state, source.id, source.pos, 'iron_sword', enemy.id);
    initializeTurnSkills(state);
    applyTurnSkills(state, 'player', []);
    const amount = level < 30 ? 3 : 6;
    for (const unit of [source, ally]) {
      assert.equal(artBonus(unit, 'damage'), amount);
      assert.equal(artStats(unit).spd, 10 + amount);
      assert.equal(artBonus(unit, 'desperation'), level >= 60 ? 1 : 0);
    }
    assert.equal(artBonus(enemy, 'damage'), 0);
    const boosted = forecast(state, source.id, source.pos, 'iron_sword', enemy.id);
    assert.equal(boosted.attacker.damage - baseline.attacker.damage, amount);
    assert.equal(boosted.attacker.attackSpeed - baseline.attacker.attackSpeed, amount);
  }
  const { state, source, ally } = setup();
  ally.pos = [1, 2]; // Manhattan distance 3.
  initializeTurnSkills(state);
  assert.equal(artBonus(source, 'damage'), 0, 'self and enemies do not satisfy the ally condition');
});

test('buffs stay after moving away, last through the opposing phase, and expire before the next own phase', () => {
  const { state, source, ally } = setup(60);
  initializeTurnSkills(state);
  ally.pos = [0, 0];
  expireArtPhase(state, 'player', 'end', []);
  expireArtPhase(state, 'enemy', 'start', []);
  assert.equal(artBonus(ally, 'damage'), 6);
  assert.equal(artBonus(ally, 'desperation'), 1);
  expireArtPhase(state, 'player', 'start', []);
  applyTurnSkills(state, 'player', []);
  assert.equal(artBonus(source, 'damage'), 0);
  assert.equal(artBonus(ally, 'desperation'), 0);
});

test('desperation reorders an existing speed follow-up without granting extra attacks or defensive priority', () => {
  const { state, source, ally, enemy } = setup(60);
  ally.stats.spd = 16;
  initializeTurnSkills(state);
  const f = forecast(state, source.id, source.pos, 'iron_sword', enemy.id);
  assert.deepEqual(f.order.map(s => s.side), ['attacker', 'attacker', 'defender']);
  assert.equal(f.order[1].followUp, true);
  source.stats.spd = 1;
  const slow = forecast(state, source.id, source.pos, 'iron_sword', enemy.id);
  assert.equal(slow.attacker.doubles, false);
  assert.equal(slow.order.filter(s => s.side === 'attacker').length, 1);
  ally.pos = [5, 3];
  const defensive = forecast(state, enemy.id, enemy.pos, 'iron_sword', ally.id);
  assert.equal(defensive.order[0].side, 'attacker');
  assert.deepEqual(defensive.order.map(s => s.side), ['attacker', 'defender', 'defender']);
});

test('the first annual arena turn freezes the skill in both state and replay initial state', () => {
  const hero = createUnit('erin', 60, 'hero', 0, true); hero.isProtagonist = true;
  const companion = createUnit('owen', 1, 'companion', 0, true);
  const battle = createFestivalBattle([hero, companion], 1, 'turn-aura');
  const source = battle.state.units.find(u => u.id === 'hero')!;
  assert.equal(artBonus(source, 'damage'), 6);
  assert.deepEqual(battle.initial, battle.state);
});
