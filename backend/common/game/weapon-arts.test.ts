import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createPinepassBattle } from '../battles/pinepass.ts';
import { CATALOG_CLASS_IDS, CLASSES } from '../data/classes.ts';
import { EQUIPMENT_ART_LINKS } from '../data/expanded-weapons.ts';
import { WEAPON_ART_BY_ID } from '../data/weapon-arts.ts';
import { WEAPONS } from '../data/weapons.ts';
import type { WeaponId } from '../data/weapons.ts';
import { actionOptions, artForecast, step, unitById } from '../engine/index.ts';
import { availableArts } from '../engine/arts.ts';
import { createUnit, equipmentArts, toBattleUnit, toSnapshot } from './model.ts';
import { createClassicBattle, createFestivalBattle, createFieldBattle } from './battles.ts';
import { carryFromBattle } from './expedition.ts';

function setup(weapon: WeaponId, refinement = 0) {
  const record = createUnit('erin', 10, 'artist', 0, true);
  const type = WEAPONS[weapon].type;
  record.classId = CATALOG_CLASS_IDS.find(id => CLASSES[id].weapons[type])!;
  record.weapons = [weapon, weapon];
  record.ranks = { [type]: 'SSS' };
  record.weaponInstances = [
    { id: weapon, durability: 40, maxDurability: 50, refinement },
    { id: weapon, durability: 20, maxDurability: 40 },
  ];
  record.learnedSkills = ['keen', 'opening', 'steadfast', 'nimble', 'grit'];
  record.equippedSkills = [...record.learnedSkills];
  const state = createPinepassBattle('equipment-arts');
  state.kind = 'arena'; state.goal = { kind: 'rout' }; state.objects = []; state.scenario = undefined;
  state.map = { width: 8, height: 5, tiles: Array.from({ length: 5 }, () => Array.from({ length: 8 }, () => 'plain' as const)) };
  const me = toBattleUnit(record, 'player', record.id, [2, 2]);
  const foe = toBattleUnit(createUnit('erin', 10, 'foe', 0, true), 'enemy', 'foe', [3, 2]);
  for (const unit of [me, foe]) {
    unit.stats = { hp: 1000, str: 30, mag: 30, skl: 100, spd: 10, lck: 0, def: 20, res: 20, cha: 0 };
    unit.hp = 1000; unit.skill = undefined; unit.skills = []; unit.classSkills = [];
  }
  state.units = [me, foe];
  return { record, state, me, foe };
}

test('all 36 canonical equipment links grant only their own weapon arts without permanent learning or slots', () => {
  const source = JSON.parse(readFileSync(new URL('../../../docs/data/fw-equipment-expansion.json', import.meta.url), 'utf8'));
  assert.deepEqual(EQUIPMENT_ART_LINKS, source.equipmentArtLinks.map(({ artId, projectWeaponId, minimumRefinement }) => ({ artId, projectWeaponId, minimumRefinement })));
  assert.equal(EQUIPMENT_ART_LINKS.length, 36);
  assert.equal(Object.values(WEAPONS).flatMap(weapon => weapon.grants?.arts ?? []).length, 36);
  for (const link of EQUIPMENT_ART_LINKS) {
    const weapon = link.projectWeaponId as WeaponId, art = WEAPON_ART_BY_ID.get(link.artId)!;
    const { record, state, me, foe } = setup(weapon, link.minimumRefinement);
    foe.pos = [me.pos[0] + art.range[0], me.pos[1]];
    assert.equal(art.unlock.kind, 'equipment_grant');
    assert.ok(equipmentArts(record).includes(art.id), art.id);
    assert.deepEqual(record.learnedArts, [], art.id);
    assert.equal(record.equippedSkills.length, 5);
    assert.ok(!me.arts?.includes(art.id), 'grant must stay dynamic');
    const options = actionOptions(state, me, me.pos).arts.filter(option => option.art === art.id);
    assert.ok(options.some(option => option.weapon === weapon && option.usable && option.targets.includes(foe)), art.id);
    assert.equal(artForecast(state, me, me.pos, weapon, art, foe).targets[0].target, foe.id);
    const result = step(state, { type: 'act', unit: me.id, to: me.pos, act: 'art', weapon, art: art.id, target: foe.id });
    const after = unitById(result.state, me.id);
    // 绝花在技巧100时必定返还本次成本；其余装备战技仍支付一次。
    assert.equal(after.weaponInstances![0].durability, art.id === 'fw_art_112' ? 40 : 40 - art.cost, art.id);
    assert.equal(after.weaponInstances![1].durability, 20, art.id);
    assert.equal(after.weapons.length, 2, 'equipping for combat must not discard duplicates');
    assert.deepEqual(record.learnedArts, []);
    assert.deepEqual(toSnapshot(record).weaponInstances, record.weaponInstances);
    assert.deepEqual(record.weaponInstances![0].durability, 40, 'engine never mutates the roster');
  }
});

test('equipment grants recheck class, rank, durability, refinement and presence, even if forged into the art list', () => {
  for (const link of EQUIPMENT_ART_LINKS) {
    const art = WEAPON_ART_BY_ID.get(link.artId)!, weapon = link.projectWeaponId as WeaponId;
    for (const failure of ['class', 'rank', 'durability', 'instance', 'removed']) {
      const { state, me, foe } = setup(weapon, link.minimumRefinement);
      foe.pos = [me.pos[0] + art.range[0], me.pos[1]];
      me.arts = [art.id];
      if (failure === 'class') me.classId = 'troubadour';
      if (failure === 'rank') me.ranks[WEAPONS[weapon].type] = 'E';
      if (failure === 'durability') me.weaponInstances![0].durability = art.cost - 1;
      if (failure === 'instance') delete me.weaponInstances;
      if (failure === 'removed') me.weapons = ['iron_sword'];
      const before = JSON.stringify(state);
      assert.ok(!availableArts(me).includes(art.id), `${art.id} ${failure}`);
      assert.throws(() => artForecast(state, me, me.pos, weapon, art, foe), `${art.id} ${failure}`);
      assert.throws(() => step(state, { type: 'act', unit: me.id, to: me.pos, act: 'art', weapon, art: art.id, target: foe.id }), `${art.id} ${failure}`);
      assert.equal(JSON.stringify(state), before);
    }
  }
  for (const refinement of [0, 1, 2, 3]) {
    const { record } = setup('fw_weapon_85', refinement);
    assert.equal(equipmentArts(record).includes('fw_art_336'), refinement === 3);
  }
});

test('cross-map and annual frozen rosters carry exact remaining resources rather than restoring the granting weapon', () => {
  const { record, state, me } = setup('fw_weapon_85', 3);
  me.weaponInstances![0].durability = 1;
  const carry = carryFromBattle(state, [record.id]);
  const frozen = JSON.parse(JSON.stringify(record));
  const battles = [
    createFieldBattle([record], { region: 1, cleared: 0, seed: 'carry-field', carry }),
    createClassicBattle([record], { mapId: 'fe1-ch16', seed: 'carry-classic', carry }),
    createFestivalBattle([frozen], 2, 'carry-festival', { carry }),
  ];
  for (const battle of battles) {
    const unit = battle.state.units.find(row => row.id === record.id)!;
    assert.deepEqual(unit.weaponInstances, me.weaponInstances);
    assert.ok(!availableArts(unit).includes('fw_art_336'));
  }
  assert.equal(record.weaponInstances![0].durability, 40);
});

test('carrying a grant never permits using a different same-type weapon or promotes the old incorrect grants', () => {
  const { state, me, foe } = setup('killing_edge');
  me.weapons.push('steel_sword');
  me.weaponInstances!.push({ id: 'steel_sword', durability: 40, maxDurability: 40 });
  const art = WEAPON_ART_BY_ID.get('fw_art_23')!;
  assert.ok(availableArts(me).includes(art.id));
  assert.ok(!actionOptions(state, me, me.pos).arts.some(option => option.art === art.id && option.weapon === 'steel_sword'));
  assert.throws(() => artForecast(state, me, me.pos, 'steel_sword', art, foe), /武器/);
  for (const weapon of ['killer_blade', 'royal_sword', 'divine_lance'] as const) {
    const { record } = setup(weapon);
    assert.deepEqual(equipmentArts(record), []);
    assert.ok(WEAPONS[weapon].grants?.skill);
  }
});
