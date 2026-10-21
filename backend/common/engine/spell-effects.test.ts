import assert from 'node:assert/strict';
import test from 'node:test';
import { createPinepassBattle } from '../battles/pinepass.ts';
import { SPELLBOOK_BY_ID } from '../data/spellbooks.ts';
import { artBonus } from './art-effects.ts';
import { spellForecast, statusChance } from './magic.ts';
import { actionOptions } from './ranges.ts';
import { runCombat } from './resolve.ts';
import { seedRng } from './rng.ts';
import { step } from './step.ts';
import { destinationCells, spellBlock, spellDestination, spellTargets, staffTargets, withSpellWeapon } from './support.ts';
import { isSilenced, unitById } from './units.ts';
import type { ActAction, BattleState, Point, UnitState } from './types.ts';

// A caster that may cast every school at any rank, beside an enemy and an ally on an open plain.
function field(spells: string[], seed = 'spell-effects') {
  const state: BattleState = createPinepassBattle(seed);
  state.kind = 'arena'; state.goal = { kind: 'rout' }; state.objects = []; state.scenario = undefined; state.boxes = [];
  state.map = { width: 12, height: 8, tiles: Array.from({ length: 8 }, () => Array(12).fill('plain')) };
  const base = state.units[0];
  const make = (id: string, side: UnitState['side'], pos: Point): UnitState => {
    const unit = structuredClone(base);
    Object.assign(unit, { id, side, pos, classId: 'sage', acted: false, alive: true, shields: 0, tags: [], immunities: [], items: [], skills: [], classSkills: [], skill: undefined, con: 100 });
    unit.stats = { hp: 60, str: 10, mag: 20, skl: 20, spd: 10, lck: 20, def: 10, res: 10, cha: 0 };
    unit.hp = 60; unit.ranks = { tome: 'SSS', staff: 'SSS', sword: 'SSS' };
    unit.weapons = []; unit.weaponInstances = []; unit.bookInstances = []; unit.spellbooks = [];
    delete unit.artEffects; delete unit.statuses;
    return unit;
  };
  const me = make('me', 'player', [3, 3]), foe = make('foe', 'enemy', [4, 3]), ally = make('ally', 'player', [3, 4]);
  me.spellbooks = spells.map(id => ({ id, charges: SPELLBOOK_BY_ID.get(id)!.maxCharges, maxCharges: SPELLBOOK_BY_ID.get(id)!.maxCharges }));
  state.units = [me, foe, ally];
  return { state, me, foe, ally };
}
const cast = (state: BattleState, spell: string, target: string, extra: Partial<Extract<ActAction, { act: 'cast' }>> = {}) =>
  step(state, { type: 'act', unit: 'me', to: unitById(state, 'me').pos, act: 'cast', target, spell, ...extra });
const charges = (state: BattleState, spell: string) => unitById(state, 'me').spellbooks!.find(row => row.id === spell)!.charges;

test('physical-defense spells read 物防, effective spells triple might, Luna ignores 魔防', () => {
  const { state, foe } = field(['fw_spell_8', 'fw_spell_38', 'fw_spell_18', 'fw_spell_11']);
  foe.stats.def = 0; foe.stats.res = 30; foe.classId = 'pegasus';
  const glass = spellForecast(state, 'me', [3, 3], 'fw_spell_8', 'foe');
  assert.equal(glass.attacker.effective, true);
  assert.equal(glass.attacker.damage, 20 + 12 * 3 + 2);
  const luna = spellForecast(state, 'me', [3, 3], 'fw_spell_38', 'foe');
  assert.equal(luna.attacker.damage, 20 + 1 + 2);
  foe.classId = 'cavalier';
  assert.equal(spellForecast(state, 'me', [3, 3], 'fw_spell_11', 'foe').attacker.effective, true);
  foe.tags = ['demon'];
  assert.equal(spellForecast(state, 'me', [3, 3], 'fw_spell_18', 'foe').attacker.effective, true);
});

test('Sword of Judgment strikes twice for one cast; follow-ups need and spend a second charge', () => {
  const { state, me, foe } = field(['fw_spell_36', 'fire', 'fw_spell_37']);
  me.stats.spd = 40; me.stats.skl = 200; foe.stats.hp = 500; foe.hp = 500;
  const judgment = spellForecast(state, 'me', [3, 3], 'fw_spell_36', 'foe');
  assert.equal(judgment.attacker.strikes, 2); assert.equal(judgment.attacker.doubles, false);
  const before = charges(state, 'fw_spell_36');
  const after = cast(state, 'fw_spell_36', 'foe').state;
  assert.equal(charges(after, 'fw_spell_36'), before - 1);
  const fire = spellForecast(state, 'me', [3, 3], 'fire', 'foe');
  assert.equal(fire.attacker.doubles, true);
  const fired = cast(state, 'fire', 'foe').state;
  assert.equal(charges(fired, 'fire'), 20 - 2);
  me.spellbooks!.find(row => row.id === 'fire')!.charges = 1;
  assert.equal(spellForecast(state, 'me', [3, 3], 'fire', 'foe').attacker.doubles, false);
  foe.pos = [6, 3];
  assert.equal(spellForecast(state, 'me', [3, 3], 'fw_spell_37', 'foe').attacker.doubles, false, 'the jaw of the earth never follows up');
});

test('drain, root and slow ride on landed attack spells', () => {
  const { state, me, foe } = field(['fw_spell_17', 'nosferatu', 'fw_spell_23', 'fw_spell_62']);
  // 高技巧保证命中，目标高幸运排除必杀，确保目标存活后才看附加效果。
  me.stats.skl = 200; me.hp = 10; foe.stats.res = 0; foe.stats.lck = 200; foe.stats.hp = 200; foe.hp = 200;
  const drained = cast(state, 'nosferatu', 'foe');
  const heal = drained.events.find(e => e.t === 'combat');
  assert.ok(heal && heal.t === 'combat' && heal.strikes.some(s => s.by === 'me' && (s.byHpAfter ?? 0) > 10));
  const rooted = cast(state, 'fw_spell_23', 'foe').state;
  assert.ok(unitById(rooted, 'foe').artEffects?.statuses?.includes('root'));
  const slowed = cast(state, 'fw_spell_62', 'foe').state;
  assert.equal(artBonus(unitById(slowed, 'foe'), 'spd'), -3);
  me.petrified = false; me.immunities = ['healing'];
  assert.equal(withSpellWeapon(SPELLBOOK_BY_ID.get('fw_spell_17')!, () => spellForecast(state, 'me', [3, 3], 'fw_spell_17', 'foe')).attacker.drain, 0);
});

test('Silence and Freeze roll a status chance without combat; bosses halve it and immunity removes the target', () => {
  const { state, me, foe } = field(['fw_spell_40', 'fw_spell_54']);
  me.stats.skl = 200;
  const chance = statusChance(state, me, foe, 'silence', 60);
  assert.equal(chance.chance, 100);
  foe.boss = true;
  assert.equal(statusChance(state, me, foe, 'silence', 60).chance, 50);
  foe.boss = false;
  const silenced = cast(state, 'fw_spell_40', 'foe');
  assert.ok(!silenced.events.some(e => e.t === 'combat'), 'a status spell never starts an exchange');
  assert.ok(silenced.events.some(e => e.t === 'statusRoll' && e.landed));
  assert.equal(isSilenced(unitById(silenced.state, 'foe')), true);
  const frozen = cast(state, 'fw_spell_54', 'foe').state;
  assert.ok(unitById(frozen, 'foe').artEffects?.statuses?.includes('root'));
  foe.immunities = ['silence'];
  assert.ok(!spellTargets(state, me, me.pos, 'fw_spell_40').some(t => t.id === 'foe'));
});

test('sleep and silence staves roll to hit; staff sleep lasts the target’s next phase and wakes on damage', () => {
  const { state, me, foe } = field([]);
  me.weapons = ['sleep_staff', 'silence_staff'];
  me.bookInstances = [{ id: 'sleep_staff', charges: 5, maxCharges: 5 }, { id: 'silence_staff', charges: 5, maxCharges: 5 }];
  me.stats.skl = 200; foe.weapons = []; foe.pos = [5, 3];
  assert.ok(staffTargets(state, me, me.pos, 'sleep_staff').some(t => t.id === 'foe'));
  const slept = step(state, { type: 'act', unit: 'me', to: me.pos, act: 'staff', target: 'foe', weapon: 'sleep_staff' });
  const sleeper = unitById(slept.state, 'foe');
  assert.equal(sleeper.statuses?.sleep, true); assert.equal(sleeper.statuses?.sleepPhases, 1);
  // 敌方阶段整段睡过，阶段结束时醒来。
  const night = step(slept.state, { type: 'endPhase' });
  assert.equal(unitById(night.state, 'foe').statuses?.sleep, undefined);
  assert.ok(night.events.some(e => e.t === 'status' && e.unit === 'foe' && e.status === 'sleep' && !e.active));
  const silenced = step(state, { type: 'act', unit: 'me', to: me.pos, act: 'staff', target: 'foe', weapon: 'silence_staff' });
  assert.equal(unitById(silenced.state, 'foe').statuses?.silence, 3);
  foe.boss = true; foe.immunities = [];
  assert.equal(statusChance(state, me, foe, 'sleep', 60).chance, 50);
});

test('Miracle Dodge, Magic Shield and Barrier buff an ally until the next own phase; Barrier halves one exchange', () => {
  const { state } = field(['fw_spell_19', 'fw_spell_48', 'fw_spell_55']);
  const dodge = cast(state, 'fw_spell_19', 'ally').state;
  assert.equal(artBonus(unitById(dodge, 'ally'), 'dodge'), 30);
  const shield = cast(state, 'fw_spell_48', 'ally').state;
  assert.equal(artBonus(unitById(shield, 'ally'), 'res'), 10);
  const warded = cast(state, 'fw_spell_55', 'ally').state;
  const ally = unitById(warded, 'ally'), enemy = unitById(warded, 'foe');
  enemy.weapons = ['iron_sword']; enemy.ranks = { sword: 'SSS' }; enemy.stats.str = 40; enemy.stats.skl = 200; enemy.pos = [3, 5];
  ally.stats.def = 0; ally.stats.lck = 200; ally.weapons = []; ally.hp = 60;
  const strikes = runCombat(warded, enemy, ally, 'iron_sword', []);
  assert.equal(strikes.find(s => s.by === 'foe' && s.hit)!.damage, Math.floor((40 + 5 + 3) / 2));
  assert.equal(artBonus(unitById(warded, 'ally'), 'ward'), 0, 'the barrier is spent after one exchange');
  const again = runCombat(warded, enemy, ally, 'iron_sword', []);
  assert.equal(again.find(s => s.by === 'foe' && s.hit)!.damage, 40 + 5 + 3);
});

test('healing books use their own base, Recover-style bonus rolls once, and area heals reach every injured ally', () => {
  const { state, ally } = field(['fw_spell_26', 'fw_spell_24', 'fw_spell_50']);
  ally.hp = 1;
  const big = cast(state, 'fw_spell_26', 'ally');
  assert.equal(unitById(big.state, 'ally').hp, 1 + 20 + 30 + 5);
  let bonus = false;
  for (let seed = 0; seed < 80 && !bonus; seed++) {
    const trial = structuredClone(state); trial.rng = seedRng(`heal-${seed}`);
    unitById(trial, 'ally').hp = 1;
    const hp = unitById(cast(trial, 'fw_spell_24', 'ally').state, 'ally').hp;
    assert.ok(hp === 1 + 20 + 3 + 5 || hp === 60, String(hp));
    bonus ||= hp === 60;
  }
  assert.ok(bonus, 'a 10% bonus heal should occur within 80 casts');
  const second = structuredClone(ally); second.id = 'ally2'; second.pos = [3, 7]; second.hp = 5;
  state.units.push(second); unitById(state, 'ally').hp = 5;
  const area = cast(state, 'fw_spell_50', 'ally');
  assert.equal(area.events.filter(e => e.t === 'heal').length, 2);
  assert.equal(unitById(area.state, 'ally2').hp, 5 + 20 + 20 + 5);
});

test('regen cannot be refreshed, torch has no target without fog, and the fortify staff heals its whole range', () => {
  const { state, me, ally } = field(['fw_spell_58', 'fw_spell_45']);
  const regen = cast(state, 'fw_spell_58', 'ally').state;
  assert.ok(!spellTargets(regen, unitById(regen, 'me'), [3, 3], 'fw_spell_58').some(t => t.id === 'ally'));
  assert.equal(spellTargets(state, me, me.pos, 'fw_spell_45').length, 0);
  me.weapons = ['fortify']; me.bookInstances = [{ id: 'fortify', charges: 5, maxCharges: 5 }];
  ally.hp = 10;
  const other = structuredClone(ally); other.id = 'ally2'; other.pos = [6, 3]; other.hp = 10; state.units.push(other);
  const healed = step(state, { type: 'act', unit: 'me', to: me.pos, act: 'heal', target: 'ally', weapon: 'fortify' });
  assert.equal(unitById(healed.state, 'ally').hp, 10 + 20 + 5 + 5);
  assert.equal(unitById(healed.state, 'ally2').hp, 10 + 20 + 5 + 5);
});

test('casting needs school permission, rank and, for manual spells, the learned manual', () => {
  const { state, me } = field(['fw_spell_60', 'fw_spell_12', 'fire']);
  const book = (id: string) => SPELLBOOK_BY_ID.get(id)!;
  assert.match(spellBlock(me, book('fw_spell_60'))!, /教材/);
  me.learnedSpells = ['fw_spell_60'];
  assert.equal(spellBlock(me, book('fw_spell_60')), null);
  me.ranks.tome = 'E';
  assert.match(spellBlock(me, book('fw_spell_60'))!, /S/);
  me.classId = 'guardian';
  assert.match(spellBlock(me, book('fire'))!, /权限/);
  assert.equal(spellBlock(me, book('fw_spell_12')), null);
  const listed = actionOptions(state, me, me.pos).casts.map(c => c.spell);
  assert.deepEqual(listed, ['fw_spell_12']);
});

test('the temporary wall keeps two per caster and never seals the only route to an exit', () => {
  const { state, me } = field(['fw_spell_9']);
  state.goal = { kind: 'escape', exits: [[0, 0]], need: 1 };
  // 只留一条走廊通往出口：第 0 行以外全是墙，走廊入口在 (0,1)。
  state.map.tiles = state.map.tiles.map((row, y) => row.map((_, x) => (y === 0 || x === 0 || y >= 3 ? 'plain' : 'wall')));
  me.pos = [0, 3];
  const rule = spellDestination('fw_spell_9')!;
  const cells = destinationCells(state, me, me.pos, rule);
  assert.ok(!cells.some(([x, y]) => x === 0 && y === 1), 'the corridor cell would cut the only route');
  assert.ok(!cells.some(([x, y]) => x === 0 && y === 0), 'never on the exit');
  const open = field(['fw_spell_9']);
  const ruleOpen = spellDestination('fw_spell_9')!;
  let board = open.state;
  for (let n = 0; n < 2; n++) {
    const dest = destinationCells(board, unitById(board, 'me'), [3, 3], ruleOpen)[0];
    board = cast(board, 'fw_spell_9', 'ally', { dest }).state;
    unitById(board, 'me').acted = false;
  }
  assert.equal(board.objects!.filter(o => o.owner === 'me').length, 2);
  assert.equal(spellTargets(board, unitById(board, 'me'), [3, 3], 'fw_spell_9').length, 0);
});

test('warp and rescue never carry an escort NPC or a unit holding a supply box', () => {
  const { state, me, ally } = field(['fw_spell_56']);
  ally.pos = [5, 3];
  assert.ok(spellTargets(state, me, me.pos, 'fw_spell_56').some(t => t.id === 'ally'));
  ally.carried = 1;
  assert.ok(!spellTargets(state, me, me.pos, 'fw_spell_56').some(t => t.id === 'ally'));
  ally.carried = 0; ally.npc = true;
  assert.ok(!spellTargets(state, me, me.pos, 'fw_spell_56').some(t => t.id === 'ally'));
});
