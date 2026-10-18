import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ART_MECHANICS as m } from './art-mechanics.ts';
import { WEAPON_ARTS } from './weapon-arts.ts';

test('exact non-original coverage and known English sequences', () => {
  assert.equal(Object.keys(m).length, 300);
  assert.deepEqual(Object.keys(m).sort(), WEAPON_ARTS.filter(a => !a.original).map(a => a.id).sort());
  const known = new Set(['single','speed_follow_up','no_speed_follow_up','fixed_2_hits','fixed_3_hits','fixed_4_hits','fixed_5_hits','follow_up_before_counter','forced_follow_up','conditional_forced_follow_up','counter_first','steal_foe_follow_up']);
  for (const a of WEAPON_ARTS) assert.ok(known.has(a.sequence), a.id);
});
test('base and upgrade mechanics remain distinct where effects differ', () => {
  for (const [a,b] of [[18,212],[24,270],[28,223],[29,224],[34,172],[35,325],[42,242],[43,298],[46,229],[47,330],[57,251],[65,65],[72,282],[99,222],[107,303],[112,112],[125,235],[138,317],[147,300],[150,150],[151,226],[159,315],[160,265],[163,256],[164,257],[170,241],[177,280],[184,314],[188,302],[194,194],[195,301],[199,244],[200,324],[204,261],[205,316],[214,279],[215,281],[216,294]] as const) {
    assert.deepEqual(m[`fw_art_${a}`],m[`fw_art_${b}`], `${a}/${b}`);
  }
  for (const [a,b] of [[20,21],[26,268],[74,74],[82,266],[84,283],[96,288],[102,290],[104,253],[111,297],[115,311],[126,304],[128,296],[137,243],[149,289],[152,326],[165,259],[174,271],[182,313],[185,320],[193,275],[202,322],[209,238],[213,277],[217,307],[218,319]] as const) {
    if (a !== b && a !== 20 && a !== 149) assert.notDeepEqual(m[`fw_art_${a}`],m[`fw_art_${b}`], `${a}/${b}`);
  }
});
test('special families and supplement boundaries', () => {
  assert.deepEqual(m.fw_art_22,{magic:true,area:'square',scale:.5});
  assert.equal(m.fw_art_33.sealFollowUp,undefined);
  assert.deepEqual(m.fw_art_33.onHit?.statuses,['poison']);
  assert.deepEqual(m.fw_art_358.forceChance,{stat:'mag',divisor:2});
  for (const n of [184,314]) assert.equal(m[`fw_art_${n}`].hitAfterMiss,10);
  assert.equal(m.fw_art_191.counterBlockOnMiss,true);
  assert.equal(m.fw_art_202.sureHit,'first'); assert.equal(m.fw_art_322.sureHit,'all');
  assert.equal(m.fw_art_204.onHit?.stripProtection,true);
  assert.equal(m.fw_art_217.proc?.followUp,true); assert.equal(m.fw_art_24.proc?.followUp,undefined);
  assert.deepEqual(m.fw_art_350.conditions,[{when:'foe_bow',hits:2,scale:.9}]);
  assert.equal(m.fw_art_201.foeHitZeroThreshold,20); assert.equal(m.fw_art_305.foeHitZeroThreshold,30);
  assert.equal(m.fw_art_219.drainPoisonOnly,true); assert.equal(m.fw_art_347.refund?.critical,true);
  assert.equal(m.fw_art_86.support,true); assert.equal(m.fw_art_60.destructive,true);
  assert.equal(m.fw_art_342.postMove,2); assert.equal(m.fw_art_206.nonlethal,true);
  assert.equal(m.fw_art_351.minimumDamage,20); assert.equal(m.fw_art_171.fixedHit,10);
  for (const n of [40,45,162,179,258,285,286,356,192,196,199,244,274,323]) assert.equal(m[`fw_art_${n}`].rangeWeaponRequired,true);
  assert.equal(m.wind_sweep.noCounter,true); assert.equal(m.deadeye_shot.rangePenalty,10);
  assert.equal(m.chariot_line.area,'line'); assert.equal(m.axe_sweep.scale,.75);
  assert.equal(m.armor_fist.scale,.7); assert.deepEqual(m.armor_fist.effective,['armored']);
  assert.equal(m.spellblade_cut.magic,true); assert.equal(m.beast_pounce.push,true);
  assert.equal(m.dagger_disarm.onHit?.debuff?.amount,-3); assert.equal(m.dragon_pressure.magic,true);
  for (const id of ['wrath_cut','tempest_thrust','smash_blow','curved_shot','swift_thrusts','hunter_volley']) assert.deepEqual(m[id],{});
});
test('source row 315 has valid project parameters and mapped after buff', () => {
  const source = JSON.parse(readFileSync(new URL('../../../docs/data/fw-weapon-arts.json',import.meta.url),'utf8'));
  const row = source.arts.find((a: {id:string}) => a.id === 'fw_art_315');
  assert.equal(row.project.might,10); assert.equal(row.project.cost,5);
  assert.equal(row.project.unlock.requiresArtId,'fw_art_159');
  assert.deepEqual(m.fw_art_315.postBuff,[{trigger:'after',stat:'skl',amount:2,duration:'map',cap:10}]);
});
