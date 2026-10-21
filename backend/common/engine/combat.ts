import { hasTrait, prepareTraitExchange, traitBranches, traitOpening } from './personal-traits.ts';
import type { TraitRolls } from './personal-traits.ts';
import { WEAPONS, triangle } from '../data/weapons.ts';
import { weaponRankBonus } from '../data/weapon-proficiency.ts';
import type { Weapon, WeaponAilment, WeaponId } from '../data/weapons.ts';
import { ART_MECHANICS } from '../data/art-mechanics.ts';
import type { ArtMechanics } from '../data/art-mechanics.ts';
import { TERRAINS } from '../maps/map.ts';
import { combatStats, skillMods } from './skills.ts';
import type { Fighter } from './skills.ts';
import type { WeaponArt } from '../data/weapon-arts.ts';
import { artVictims, validateArt, walkedCells } from './arts.ts';
import { artBonus, artStats } from './art-effects.ts';
import { chargeRow, classOf, distance, equipped, inRange, living, samePoint, unitById } from './units.ts';
import type { BattleState, Point, UnitState } from './types.ts';

// Formulas from docs/03-combat.md. Art percentages are applied before protection and crit.
const clamp = (v: number) => Math.max(0, Math.min(100, v));
export interface TerrainBonus { name: string; avoid: number; def: number; applies: boolean }
export interface SideForecast {
  rawHit?: number;
  firstDamage?: number; firstWard?: number; thunder?: boolean;
  unit: string; weapon: WeaponId | null; hp: number; maxHp: number; skl: number;
  attackSpeed: number; attack: number; damage: number; rawDamage: number; hit: number; crit: number; followUpCrit: number;
  strikes: number; canAttack: boolean; doubles: boolean; triangle: -1 | 0 | 1; effective: boolean;
  terrain: TerrainBonus; barrier: number; protected: boolean; netherProtected: boolean; silenceable: boolean;
  // 武器自身的普通攻击效果（战技另按战技规则）：反噬概率、受伤减免、命中附加状态／降速、吸血比例。
  backlash: number; ward: number; afflicts: WeaponAilment[]; locks: boolean; slows: number; drain: number;
  // 法术书／魔道书本次可用的施放次数；null 表示不是按次数结算的武器。
  charges: number | null;
}
export interface StrikeSpec { side: 'attacker' | 'defender'; followUp: boolean; chance?: number }
export interface Forecast {
  attacker: SideForecast; defender: SideForecast; order: StrikeSpec[];
  defenderDies: number; attackerDies: number; expectedDealt: number; expectedTaken: number;
  killHeal?: number;
  traitRolls?: TraitRolls;
  branches?: { probability: number; rolls: TraitRolls; forecast: Forecast }[];
  art?: CombatArt;
  assumption?: 'independent_opening_state';
}
export interface CombatArt extends ArtMechanics {
  secondaryTraitTarget?: boolean;
  id: string; might: number; hit: number; crit: number; sequence?: string; hits?: number;
  single?: boolean; noCrit?: boolean; scale?: number; pierce?: number; terrainAvoid?: number;
  firstCounterReduction?: number; reductionOnHit?: boolean; sealOnHit?: boolean;
  procChance?: number; forceProbability?: number; allowFoeFollowUp?: boolean; onHitStatLoss?: number;
}
export interface CombatProgress {
  directKill: boolean; defenderAttempts: number; thunderHit: boolean;
  aHp: number; dHp: number; attackerHit: boolean; counterReduced: boolean; barrierA: number; barrierD: number;
  counterBlocked: boolean; defenderNoFollow: boolean; attackerNoFollow: boolean; misses: number; attacks: number; stopped: boolean;
  defenseLoss: number; speedLoss: number; netherDisabled: boolean; forced: -1 | 0 | 1;
}
export function combatProgress(f: Forecast): CombatProgress {
  return { directKill: false, defenderAttempts: 0, thunderHit: false, aHp: f.attacker.hp, dHp: f.defender.hp, attackerHit: false, counterReduced: false,
    barrierA: f.attacker.barrier, barrierD: f.defender.barrier, counterBlocked: false,
    defenderNoFollow: !!f.art?.sealFollowUp && !f.art.sealOnHit, attackerNoFollow: false, misses: 0, attacks: 0, stopped: false,
    defenseLoss: 0, speedLoss: 0, netherDisabled: false, forced: -1 };
}
export function skipStrike(f: Forecast, spec: StrikeSpec, p: CombatProgress): boolean {
  return p.stopped || p.aHp <= 0 || p.dHp <= 0 || (spec.side === 'attacker' && spec.followUp && p.attackerNoFollow)
    || (spec.side === 'defender' && (p.counterBlocked
    || (spec.followUp && (p.defenderNoFollow || f.defender.attackSpeed - p.speedLoss - f.attacker.attackSpeed < 4))));
}
export function strikeRates(f: Forecast, spec: StrikeSpec, p: CombatProgress) {
  const me = f[spec.side], art = spec.side === 'attacker' ? f.art : undefined;
  const guaranteed = art?.sureHit === 'all' || (art?.sureHit === 'first' && p.attacks === 0);
  return {
    hit: guaranteed ? 100 : clamp((spec.side === 'defender' && p.thunderHit && me.hit === 100 ? me.rawHit ?? me.hit : me.hit)
      + (art?.hitAfterMiss ?? 0) * p.misses - (spec.side === 'defender' && p.thunderHit ? 10 : 0)),
    crit: spec.followUp ? me.followUpCrit : me.crit,
    proc: art?.proc && (!spec.followUp || art.proc.followUp) && (art.proc.when !== 'foe_full' || p.dHp === f.defender.maxHp) ? art.procChance ?? 0 : 0,
    backlash: me.backlash,
  };
}
export function strikeDamage(f: Forecast, side: StrikeSpec['side'], critical: boolean, p: CombatProgress, followUp = false, proc = false, traitEffects = true): number {
  const me = f[side], art = f.art;
  let raw = me.rawDamage + (traitEffects && (side === 'attacker' ? p.attacks : p.defenderAttempts) === 0 ? me.firstDamage ?? 0 : 0);
  if (side === 'attacker') raw += (followUp ? art?.followUpAttack ?? 0 : 0) + (proc ? art?.proc?.attack ?? 0 : 0) + p.defenseLoss;
  let damage = Math.floor(Math.max(side === 'attacker' ? art?.minimumDamage ?? 0 : 0, raw) * (side === 'attacker' ? art?.scale ?? 1 : art?.incomingScale ?? 1));
  if ((side === 'attacker' ? f.defender.netherProtected && !p.netherDisabled : f.attacker.netherProtected)) damage = Math.floor(damage / 2);
  damage *= critical ? 3 : 1;
  if (side === 'defender' && !p.counterReduced && (!art?.reductionOnHit || p.attackerHit)) damage = Math.floor(damage * (100 - (art?.firstCounterReduction ?? 0)) / 100);
  // 屏障：受击方本次交战受到的伤害按比例减少。
  const ward = (side === 'attacker' ? f.defender : f.attacker).ward;
  if (ward) damage = Math.floor(damage * (100 - ward) / 100);
  damage = Math.max(0, damage - (side === 'attacker' ? p.barrierD : p.barrierA));
  if (traitEffects && (side === 'attacker' ? p.attacks : p.defenderAttempts) === 0) damage = Math.max(0, damage - ((side === 'attacker' ? f.defender : f.attacker).firstWard ?? 0));
  if (side === 'attacker' && art?.nonlethal && p.dHp >= 2) damage = Math.min(damage, p.dHp - 1);
  return damage;
}
export interface StrikeResolution { damage: number; hpAfter: number; heal: number; shield: boolean; afflicted: boolean; backlash: boolean; inflicted: boolean }
// Runtime rolls and exact forecast branches both use this state transition.
export function resolveStrike(f: Forecast, spec: StrikeSpec, p: CombatProgress, hit: boolean, critical: boolean, proc = false, block = false, afflict = false, backlash = false): StrikeResolution {
  const isA = spec.side === 'attacker', art = f.art, me = f[spec.side];
  if (spec.chance !== undefined) p.forced = 1;
  const damage = hit ? strikeDamage(f, spec.side, critical, p, spec.followUp, proc, !backlash) : 0;
  if (isA && p.attacks === 0 && hit && !backlash && f.attacker.thunder) p.thunderHit = true;
  if (!isA) p.defenderAttempts++;
  if (hit && backlash) {
    // 反噬：这一击的伤害改由出手者承受；不朽盾照常保命，保命后交战结束。
    let after = Math.max(0, (isA ? p.aHp : p.dHp) - damage), shield = false;
    if (after === 0 && me.protected) { after = 1; shield = true; p.stopped = true; }
    if (isA) { p.aHp = after; p.attacks++; } else p.dHp = after;
    return { damage, hpAfter: after, heal: 0, shield, afflicted: false, backlash: true, inflicted: false };
  }
  const before = isA ? p.dHp : p.aHp;
  let after = Math.max(0, before - damage), shield = false, heal = 0;
  if (hit) {
    if (after === 0 && (isA ? f.defender.protected : f.attacker.protected)) { after = 1; shield = true; p.stopped = true; }
    if (isA) { p.attackerHit = true; p.barrierD = 0; }
    else { p.barrierA = 0; if (!art?.reductionOnHit || p.attackerHit) p.counterReduced = true; }
  }
  if (isA && hit && after === 0) p.directKill = true;
  // 普通攻击、反击与施法按武器自身的吸血和命中附加；主动战技只按战技自己的规则。
  const weaponRules = !isA || !art;
  const drain = weaponRules ? me.drain : art?.drain ?? 0;
  const striker = isA ? p.aHp : p.dHp;
  if (hit && drain && striker > 0) {
    heal = Math.min(me.maxHp - striker, Math.floor((before - after) * drain));
    if (isA) p.aHp += heal; else p.dHp += heal;
  }
  const inflicted = hit && weaponRules && after > 0 && !shield && (me.afflicts.length > 0 || me.slows > 0);
  if (inflicted && me.locks) { if (isA) p.defenderNoFollow = true; else p.attackerNoFollow = true; }
  if (inflicted && isA && me.slows) p.speedLoss = Math.max(p.speedLoss, me.slows);
  if (isA) {
    p.dHp = after; p.attacks++;
    if (!hit) { p.misses++; if (art?.counterBlockOnMiss) p.counterBlocked = true; }
    if (hit && block) p.counterBlocked = true;
    if (hit && art?.sealFollowUp && art.sealOnHit) p.defenderNoFollow = true;
    if (hit && afflict && after > 0 && !shield) {
      if (!art?.allowFoeFollowUp && art?.onHit?.statuses?.some(s => s === 'poison' || s === 'confusion')) p.defenderNoFollow = true;
      if (art?.onHit?.statuses?.includes('silence') && f.defender.silenceable) p.counterBlocked = true;
      const debuff = art?.onHit?.debuff;
      if (debuff?.stat === 'def') p.defenseLoss = Math.max(p.defenseLoss, art?.onHitStatLoss ?? 0);
      if (debuff?.stat === 'spd') p.speedLoss = Math.max(p.speedLoss, art?.onHitStatLoss ?? 0);
      if (art?.onHit?.stripProtection) p.netherDisabled = true;
    }
  } else p.aHp = after;
  return { damage, hpAfter: after, heal, shield, afflicted: hit && afflict && after > 0 && !shield, backlash: false, inflicted };
}
export function forecastOnHit(f: Forecast): (StrikeSpec & { damage: number; criticalDamage: number; maxDamage: number; criticalMaxDamage: number })[] {
  const result: (StrikeSpec & { damage: number; criticalDamage: number; maxDamage: number; criticalMaxDamage: number })[] = [];
  const p = combatProgress(f);
  for (const spec of f.order) {
    if (skipStrike(f, spec, p)) continue;
    const canProc = strikeRates(f, spec, p).proc > 0;
    result.push({ ...spec, damage: strikeDamage(f, spec.side, false, p, spec.followUp), criticalDamage: strikeDamage(f, spec.side, true, p, spec.followUp),
      maxDamage: strikeDamage(f, spec.side, false, p, spec.followUp, canProc), criticalMaxDamage: strikeDamage(f, spec.side, true, p, spec.followUp, canProc) });
    resolveStrike(f, spec, p, true, false, false, (f.art?.counterBlockOnHit ?? 0) >= 100, !!f.art?.onHit && (f.art.onHit.chance ?? 100) >= 100);
  }
  return result;
}
export function attackSpeed(unit: UnitState, weapon: WeaponId | null): number {
  return artStats(unit).spd - Math.max(0, (weapon ? WEAPONS[weapon].weight : 0) - unit.con);
}
export function terrainBonus(state: BattleState, unit: UnitState, [x, y]: Point): TerrainBonus {
  const t = TERRAINS[state.map.tiles[y][x]], applies = classOf(unit).moveType !== 'flying';
  return { name: t.name, avoid: applies ? t.avoid : 0, def: applies ? t.def : 0, applies };
}
export function isMagicWeapon(w: Weapon): boolean {
  return !!w.magic || w.type === 'tome' || w.type === 'dragon';
}
export function weaponProficiencyBonus(unit: UnitState, weaponId: WeaponId | null) {
  const weapon = weaponId ? WEAPONS[weaponId] : undefined;
  const type = weapon?.proficiencyType ?? weapon?.type;
  return weaponRankBonus(type ?? 'sword', type ? unit.ranks[type] : 'E');
}
export function unitCombatStats(state: BattleState, unit: UnitState, weaponId: WeaponId | null, pos: Point = unit.pos) {
  const w = weaponId ? WEAPONS[weaponId] : null, s = combatStats(unit, w), rank = weaponProficiencyBonus(unit, weaponId);
  const mods = skillMods(state, { unit, pos, weapon: w, moved: unit.movedTurn === state.turn });
  const as = attackSpeed(unit, weaponId);
  return {
    skl: s.skl,
    attack: w ? (isMagicWeapon(w) ? s.mag : s.str) + w.might + rank.attack + mods.attack + artBonus(unit, 'attack') : 0,
    hit: w ? w.hit + s.skl * 2 + Math.floor(s.lck / 2) + rank.hit + mods.hit + artBonus(unit, 'hit') : 0,
    crit: w ? w.crit + Math.floor(s.skl / 2) + rank.crit + mods.crit + artBonus(unit, 'crit') : 0,
    attackSpeed: as + mods.attackSpeed + artBonus(unit, 'as'),
    avoid: as * 2 + s.lck + terrainBonus(state, unit, pos).avoid + mods.avoid + artBonus(unit, 'avoid') + (w?.bonus?.avoid ?? 0),
    // 守方一侧（sideVs 的 defense / dodge，不含对手战技）：物防含地形防御，魔防不含；必杀回避。
    protection: s.def + mods.def + terrainBonus(state, unit, pos).def,
    resistance: s.res + mods.res + (w?.bonus?.res ?? 0),
    dodge: s.lck + artBonus(unit, 'dodge'),
  };
}
function matches(unit: UnitState, kind: NonNullable<ArtMechanics['effective']>[number]): boolean {
  const c = classOf(unit);
  return kind === 'flying' || kind === 'mounted' ? c.moveType === kind : kind === 'armored' ? c.armored
    : kind === 'beast' || kind === 'dragon' ? c.route === kind : !!unit.tags?.includes('demon');
}
export function weaponEffective(w: Weapon | null, foe: UnitState): boolean {
  if (!w) return false;
  const c = classOf(foe);
  return !!w.effective?.includes(c.moveType) || (c.armored && !!w.effective?.includes('armored'))
    || !!w.effectiveRoutes?.some(route => route === c.route) || !!w.effectiveTags?.some(tag => matches(foe, tag));
}
function sideVs(state: BattleState, me: Fighter, meWeapon: WeaponId | null, foe: Fighter, foeWeapon: WeaponId | null, role: StrikeSpec['side'], art?: CombatArt, incoming?: CombatArt): SideForecast {
  const w = me.weapon, fw = foe.weapon, s = combatStats(me.unit, w), fs = combatStats(foe.unit, fw), rank = weaponProficiencyBonus(me.unit, meWeapon);
  // 逆克制：任一方持逆克制武器时本次克制反转，双方都持有则抵消。
  const raw = w && fw ? triangle(w.type, fw.type) : 0, tri = raw && !!w?.reaver !== !!fw?.reaver ? -raw as -1 | 1 : raw;
  const effective = weaponEffective(w, foe.unit) || !!art?.effective?.some(kind => matches(foe.unit, kind));
  const mods = skillMods(state, me), fm = skillMods(state, foe), am = art?.mods, im = incoming?.foeMods;
  // 战技按战技自己的伤害类型；普通攻击按武器（魔法武器、法术书与龙石为魔力）。
  const magic = art ? !!art.magic || w?.type === 'tome' || w?.type === 'dragon' : !!w && isMagicWeapon(w);
  const vsRes = !art && w?.defense ? w.defense === 'res' : magic;
  const attack = w ? (magic ? s.mag : s.str) + (w.might + tri) * (effective ? 3 : 1) + rank.attack + mods.attack + artBonus(me.unit, 'attack') + (art?.might ?? 0) + (am?.attack ?? 0) + (im?.attack ?? 0)
    + (role === 'defender' ? w.guard?.attack ?? 0 : 0) : 0;
  const ft = terrainBonus(state, foe.unit, foe.pos), foeAm = incoming?.mods, foeIm = art?.foeMods;
  const defense = vsRes ? (!art && w?.ignoreRes ? 0 : fs.res) + fm.res + (foeAm?.res ?? 0) + (foeIm?.res ?? 0) + (fw?.bonus?.res ?? 0)
    : fs.def + fm.def + (foeAm?.def ?? 0) + (foeIm?.def ?? 0) + (role === 'attacker' ? fw?.guard?.def ?? 0 : 0);
  // 地形防御只挡物理伤害；魔法（对魔防）不吃地形。
  const protection = Math.max(0, defense - (art?.pierce ?? 0)) + (art?.ignoreTerrain || vsRes ? 0 : ft.def);
  const hitRaw = w ? w.hit + s.skl * 2 + Math.floor(s.lck / 2) + tri * 15 + rank.hit + mods.hit + artBonus(me.unit, 'hit') + (art?.hit ?? 0) + (am?.hit ?? 0) + (im?.hit ?? 0)
    + (art ? w.artHit ?? 0 : 0) + (foe.unit.artEffects?.scent?.includes(me.unit.side) && art?.id !== 'fe_art_king_fang' ? 10 : 0) : 0;
  // 地形回避：削减战技只减正加成（最低 0）；浅滩这类负值照常扣。无视地形的战技两者都不计。
  const terrainAvoid = art?.ignoreTerrain ? 0 : ft.avoid > 0 ? Math.max(0, ft.avoid - (art?.terrainAvoid ?? 0)) : ft.avoid;
  const avoid = attackSpeed(foe.unit, foeWeapon) * 2 + fs.lck + terrainAvoid + fm.avoid + artBonus(foe.unit, 'avoid') + (foeAm?.avoid ?? 0) + (foeIm?.avoid ?? 0)
    + (fw?.bonus?.avoid ?? 0);
  const critRaw = w ? w.crit + Math.floor(s.skl / 2) + rank.crit + mods.crit + artBonus(me.unit, 'crit') + (art?.crit ?? 0) + (am?.crit ?? 0) + (im?.crit ?? 0) : 0;
  const dodge = fs.lck + artBonus(foe.unit, 'dodge') + (foeAm?.dodge ?? 0) + (foeIm?.dodge ?? 0);
  const rawDamage = w ? attack + mods.damage - protection : 0;
  // 普通攻击／反击／施法的武器效果；主动战技不叠加武器的附毒、吸血或反噬。
  const weaponRules = role === 'defender' || !art;
  const afflicts = weaponRules ? (w?.onHit?.statuses ?? []).filter(status => !foe.unit.immunities?.includes(status)) : [];
  const debuff = weaponRules && !foe.unit.immunities?.includes('debuff') ? w?.onHit?.debuff : undefined;
  const prior = debuff ? Math.min(0, ...(foe.unit.artEffects?.buffs ?? []).filter(b => b.stat === debuff.stat && b.duration !== 'map').map(b => b.amount)) : 0;
  return { unit: me.unit.id, weapon: meWeapon, hp: me.unit.hp, maxHp: me.unit.stats.hp, skl: s.skl,
    firstDamage: me.traits?.firstDamage, firstWard: me.traits?.firstWard, thunder: me.traits?.thunder,
    attackSpeed: attackSpeed(me.unit, meWeapon) + mods.attackSpeed + artBonus(me.unit, 'as') + (am?.as ?? 0) + (im?.as ?? 0),
    rawHit: w ? art?.fixedHit ?? hitRaw - avoid : 0,
    attack, rawDamage, damage: Math.max(0, rawDamage), hit: w ? art?.fixedHit ?? clamp(hitRaw - avoid) : 0,
    crit: w && !art?.noCrit ? clamp(critRaw - dodge) : 0,
    followUpCrit: w && !art?.noCrit ? clamp(critRaw + mods.followUpCrit + (art?.followUpCrit ?? 0) - dodge) : 0,
    strikes: 0, canAttack: false, doubles: false, triangle: tri, effective, terrain: terrainBonus(state, me.unit, me.pos),
    barrier: me.unit.artEffects?.barrier?.amount ?? 0, protected: (me.unit.shields ?? 0) > 0,
    netherProtected: !!me.unit.tags?.includes('nether_protection') && artBonus(me.unit, 'protection') >= 0 && !fw?.purify,
    silenceable: w?.type === 'tome' || w?.type === 'staff',
    backlash: weaponRules && w?.backlash ? clamp(31 - s.lck) : 0,
    ward: clamp(artBonus(me.unit, 'ward')),
    afflicts, locks: afflicts.some(status => status === 'poison' || status === 'confusion') && !foe.unit.immunities?.includes('follow_up_lock'),
    slows: debuff ? Math.min(fs[debuff.stat], Math.max(0, -debuff.amount + prior)) : 0,
    drain: weaponRules && w?.drain && !me.unit.immunities?.includes('healing') ? w.drain : 0,
    charges: null };
}
const TRUE_HIT = Array.from({ length: 101 }, (_, h) => {
  let pairs = 0; for (let s = 0; s < 2 * h && s <= 198; s++) pairs += s <= 99 ? s + 1 : 199 - s;
  return pairs / 10000;
});
export function trueHit(displayed: number): number { return TRUE_HIT[clamp(Math.floor(displayed))]; }
export function strikeOrder(a: SideForecast, d: SideForecast, braveA: boolean, braveD: boolean, art?: CombatArt, hitsA?: number, desperation = false): StrikeSpec[] {
  const opening: StrikeSpec[] = [], counter: StrikeSpec[] = [], follow: StrikeSpec[] = [], dFollow: StrikeSpec[] = [];
  const push = (into: StrikeSpec[], side: StrikeSpec['side'], n: number, followUp: boolean, chance?: number) => {
    for (let i = 0; i < n; i++) into.push({ side, followUp, ...(chance === undefined ? {} : { chance }) });
  };
  const fixed = art?.hits ?? (art?.sequence?.startsWith('fixed_') ? Number(art.sequence.split('_')[1]) : undefined) ?? hitsA;
  push(opening, 'attacker', fixed ?? (braveA ? 2 : 1), false);
  if (d.canAttack) push(counter, 'defender', braveD ? 2 : 1, false);
  if (a.doubles && fixed === undefined) push(follow, 'attacker', braveA ? 2 : 1, true);
  else if (art?.forceProbability && fixed === undefined) push(follow, 'attacker', braveA ? 2 : 1, true, art.forceProbability);
  if (d.canAttack && d.doubles) push(dFollow, 'defender', braveD ? 2 : 1, true);
  if (art?.sequence === 'counter_first') return [...counter, ...opening, ...follow, ...dFollow];
  if (desperation || art?.sequence === 'follow_up_before_counter') return [...opening, ...follow, ...counter, ...dFollow];
  return [...opening, ...counter, ...follow, ...dFollow];
}
// `cast` marks an attack spell from the unit's spellbooks (its charges live there, not in bookInstances).
export function forecast(state: BattleState, attackerId: string, from: Point, weaponId: WeaponId, defenderId: string, art?: CombatArt, cast = false, fixedTraits = false): Forecast {
  const au = unitById(state, attackerId), du = unitById(state, defenderId), counter = equipped(du);
  if (!fixedTraits) {
    const choices = traitBranches([au, du]);
    if (choices.some(b => Object.keys(b.rolls).length)) {
      const branches = choices.map(b => {
        const scope = prepareTraitExchange(state, [au, du], b.rolls);
        try { return { ...b, forecast: forecast(state, attackerId, from, weaponId, defenderId, art, cast, true) }; }
        finally { scope.cleanup(); }
      });
      const result = { ...branches[0].forecast, branches };
      for (const key of ['defenderDies', 'attackerDies', 'expectedDealt', 'expectedTaken'] as const)
        result[key] = branches.reduce((sum, b) => sum + b.probability * b.forecast[key], 0);
      return result;
    }
  }
  const a: Fighter = { unit: au, pos: from, weapon: WEAPONS[weaponId], moved: !samePoint(from, au.pos) || au.movedTurn === state.turn };
  const d: Fighter = { unit: du, pos: du.pos, weapon: counter ? WEAPONS[counter] : null, moved: du.movedTurn === state.turn };
  a.traits = traitOpening(state, au, du, from, true, weaponId, cast);
  d.traits = traitOpening(state, du, au, du.pos, false, counter ?? '', false);
  d.traits.hit += a.traits.counterHit;
  if (art?.secondaryTraitTarget) a.traits.firstDamage = 0;
  const attacker = sideVs(state, a, weaponId, d, counter, 'attacker', art), defender = sideVs(state, d, counter, a, weaponId, 'defender', undefined, art);
  attacker.charges = chargeRow(au, weaponId, cast)?.charges ?? null;
  defender.charges = counter ? chargeRow(du, counter, false)?.charges ?? null : null;
  attacker.canAttack = true;
  defender.canAttack = !art?.noCounter && !du.petrified && counter !== null && inRange(du, counter, du.pos, from);
  const blocked = (u: UnitState) => !u.immunities?.includes('follow_up_lock') && u.artEffects?.statuses?.some(s => s === 'poison' || s === 'confusion');
  // 固定段数的法术一次施放打完；禁追击的法术只打一次。
  const hitsA = !art ? a.weapon?.hits : undefined;
  const single = art?.single || art?.sequence === 'single' || art?.sequence === 'no_speed_follow_up' || art?.hits !== undefined || art?.sequence?.startsWith('fixed_')
    || hitsA !== undefined || (!art && !!a.weapon?.noFollowUp);
  // 速度追击是下一次施放：书／杖次数不足以再付一次时不追击（反击方同理）。
  const repeatable = (charges: number | null) => charges === null || charges >= 2;
  attacker.doubles = !single && !blocked(au) && repeatable(attacker.charges) && (attacker.attackSpeed - defender.attackSpeed >= 4 || art?.sequence === 'forced_follow_up');
  defender.doubles = defender.canAttack && !blocked(du) && repeatable(defender.charges) && !(art?.sealFollowUp && !art.sealOnHit) && defender.attackSpeed - attacker.attackSpeed >= 4;
  if (art?.sequence === 'steal_foe_follow_up' && defender.doubles && !blocked(au)) { attacker.doubles = true; defender.doubles = false; }
  if (blocked(au) && art?.forceProbability) art = { ...art, forceProbability: 0 };
  if (art?.foeHitZeroThreshold !== undefined && defender.hit <= art.foeHitZeroThreshold) defender.hit = 0;
  const desperation = attacker.doubles && (artBonus(au, 'desperation') > 0 || au.skill === 'desperation' || !!au.skills?.includes('desperation'));
  const order = strikeOrder(attacker, defender, !single && !!a.weapon?.brave, !!d.weapon?.brave, art, hitsA, desperation);
  attacker.strikes = order.filter(s => s.side === 'attacker').length; defender.strikes = order.filter(s => s.side === 'defender').length;
  const f: Forecast = { attacker, defender, order, ...(art ? { art } : {}), defenderDies: 0, attackerDies: 0, expectedDealt: 0, expectedTaken: 0 };
  if (hasTrait(au, 'underworld') && au.side !== du.side && !au.petrified && !au.immunities?.includes('healing')
    && !au.artEffects?.buffs?.some(b => b.source === 'underworld_used')) f.killHeal = Math.min(6, Math.ceil(au.stats.hp / 10));
  return { ...f, ...outcomes(f) };
}
export function artCombatOptions(state: BattleState, unit: UnitState, to: Point, weapon: WeaponId, art: WeaponArt, target: UnitState, index = 0, walked = walkedCells(state, unit, to), primaryTarget = target.id): CombatArt {
  const m = ART_MECHANICS[art.id] ?? {}, result: CombatArt = { ...m, id: art.id, might: art.might, hit: art.hit, crit: art.crit, sequence: art.sequence };
  result.secondaryTraitTarget = target.id !== primaryTarget;
  if (!art.original) {
    const s = combatStats(unit, WEAPONS[weapon]), fw = equipped(target), ft = fw ? WEAPONS[fw] : undefined;
    const c = classOf(target), t = terrainBonus(state, unit, to);
    const checks = { foe_half: target.hp * 2 <= target.stats.hp, foe_poison: target.artEffects?.statuses?.includes('poison'), foe_full: target.hp === target.stats.hp,
      self_full: unit.hp === unit.stats.hp, terrain: t.avoid > 0 || t.def > 0,
      foe_as_lead: unitCombatStats(state, target, fw).attackSpeed - unitCombatStats(state, unit, weapon, to).attackSpeed >= 4, foe_magic: ft?.type === 'tome' || ft?.type === 'dragon',
      foe_sword: ft?.type === 'sword', foe_lance: ft?.type === 'lance', foe_bow: ft?.type === 'bow', foe_mounted: c.moveType === 'mounted',
      foe_armored: c.armored, foe_flying: c.moveType === 'flying', foe_large: target.tags?.includes('large') || target.classId === 'dreadnought' || c.route === 'dragon' && c.stage >= 3 };
    if (art.id === 'fw_art_350') result.hits = 1;
    for (const condition of m.conditions ?? []) if (checks[condition.when]) {
      if (condition.mods) {
        result.mods = { ...result.mods };
        for (const [key, value] of Object.entries(condition.mods)) result.mods[key as keyof NonNullable<ArtMechanics['mods']>] = (result.mods[key as keyof NonNullable<ArtMechanics['mods']>] ?? 0) + value;
      }
      if (condition.incomingScale !== undefined) result.incomingScale = condition.incomingScale;
      if (condition.hits !== undefined) result.hits = condition.hits;
      if (condition.scale !== undefined) result.scale = condition.scale;
    }
    result.hit -= (m.rangePenalty ?? 0) * Math.max(0, distance(to, target.pos) - art.range[0]);
    result.might += (m.adjacentAttack ?? 0) * living(state, unit.side).filter(ally => ally.id !== unit.id && !ally.petrified && distance(to, ally.pos) === 1).length;
    if (m.proc) result.procChance = clamp(Math.floor((m.proc.stat ? s[m.proc.stat] / (m.proc.divisor ?? 1) : m.proc.chance ?? 0) + (m.proc.plus ?? 0)));
    if (m.forceChance) result.forceProbability = clamp(Math.floor(s[m.forceChance.stat] / m.forceChance.divisor));
    // 专属武器可替换战技的吸血比例（索雷尔的辉枪：太阳回复100%，不与50%相加）。
    const drainOverride = WEAPONS[weapon].artDrain?.[art.id];
    if (drainOverride !== undefined) result.drain = drainOverride;
    if (m.drainPoisonOnly && !checks.foe_poison || unit.immunities?.includes('healing')) result.drain = 0;
    if (m.onHit) {
      result.onHit = { ...m.onHit, statuses: m.onHit.statuses?.filter(status => !target.immunities?.includes(status)) };
      if (target.immunities?.includes('debuff')) delete result.onHit.debuff;
      if (target.immunities?.includes('movement_debuff')) delete result.onHit.movePenalty;
      if (target.immunities?.includes('defense_pierce')) delete result.onHit.stripProtection;
      const debuff = result.onHit.debuff;
      if (debuff && (debuff.stat === 'def' || debuff.stat === 'spd')) {
        const prior = Math.min(0, ...(target.artEffects?.buffs ?? []).filter(b => b.stat === debuff.stat && b.duration !== 'map').map(b => b.amount));
        result.onHitStatLoss = Math.min(artStats(target)[debuff.stat], Math.max(0, -debuff.amount + prior));
      }
      result.allowFoeFollowUp = target.immunities?.includes('follow_up_lock');
    }
    if (m.area || art.id === 'axe_sweep') { result.single = true; result.noCrit = true; result.noCounter = index > 0; }
    if (target.immunities?.includes('follow_up_lock')) result.sealFollowUp = false;
    return result;
  }
  result.single = true; result.noCrit = ['fe_art_split_breath', 'fe_art_ancient_breath'].includes(art.id); result.noCounter = index > 0;
  result.scale = art.id === 'fe_art_split_breath' && index > 0 ? .5 : 1;
  if (art.id === 'fe_art_gap_stab') result.terrainAvoid = 15;
  if (art.id === 'fe_art_guard_probe') { result.firstCounterReduction = 30; result.reductionOnHit = true; }
  if (art.id === 'fe_art_braced_maul') result.firstCounterReduction = 20;
  if (art.id === 'fe_art_pulse_sever') { result.sealFollowUp = !target.immunities?.includes('follow_up_lock'); result.sealOnHit = true; }
  if (art.id === 'fe_art_running_rend' && walked >= 3) result.might += 5;
  if (!target.immunities?.includes('defense_pierce')) {
    if (art.id === 'fe_art_king_fang') result.pierce = Math.min(12, Math.floor(artStats(target).def * 35 / 100));
    if (art.id === 'fe_art_pack_flank' && distance(to, target.pos) === 1) {
      const opposite: Point = [2 * target.pos[0] - to[0], 2 * target.pos[1] - to[1]];
      if (living(state, unit.side).some(ally => ally.id !== unit.id && !ally.petrified && samePoint(ally.pos, opposite))) result.pierce = Math.min(8, Math.floor(artStats(target).def * 25 / 100));
    }
  }
  return result;
}
export function artForecast(state: BattleState, unit: UnitState, to: Point, weapon: WeaponId, art: WeaponArt, target: UnitState, secondary?: string, ally?: string): Forecast & { targets: { target: string; forecast: Forecast }[] } {
  validateArt(state, unit, { type: 'act', unit: unit.id, to, act: 'art', target: target.id, weapon, art: art.id, secondary, ally }, art);
  // shortcut: later targets use opening state, extend to joint branches when exact combined AoE odds are required.
  const targets = artVictims(state, unit, to, weapon, art, target, secondary).map((victim, index) => {
    const branches = traitBranches([unit, victim]).map(b => {
      const scope = prepareTraitExchange(state, [unit, victim], b.rolls);
      try { return { ...b, forecast: forecast(state, unit.id, to, weapon, victim.id,
        artCombatOptions(state, unit, to, weapon, art, victim, index, undefined, target.id), false, true) }; }
      finally { scope.cleanup(); }
    });
    const f: Forecast = { ...branches[0].forecast, ...(branches.length > 1 ? { branches } : {}),
      ...(index > 0 ? { assumption: 'independent_opening_state' as const } : {}) };
    for (const key of ['defenderDies', 'attackerDies', 'expectedDealt', 'expectedTaken'] as const)
      f[key] = branches.reduce((sum, b) => sum + b.probability * b.forecast[key], 0);
    return { target: victim.id, forecast: f };
  });
  return { ...targets.find(entry => entry.target === target.id)!.forecast, targets };
}
interface Tally { defenderDies: number; attackerDies: number; expectedDealt: number; expectedTaken: number }
function outcomes(f: Forecast): Tally {
  const memo = new Map<string, Tally>();
  const visit = (i: number, p: CombatProgress): Tally => {
    if (i === f.order.length || p.aHp <= 0 || p.dHp <= 0 || p.stopped) {
      const heal = p.aHp > 0 && p.directKill && p.dHp <= 0 ? Math.min(f.killHeal ?? 0, f.attacker.maxHp - p.aHp) : 0;
      return { defenderDies: p.dHp <= 0 ? 1 : 0, attackerDies: p.aHp <= 0 ? 1 : 0,
        expectedDealt: f.defender.hp - p.dHp, expectedTaken: f.attacker.hp - p.aHp - heal };
    }
    const key = `${i}:${Object.values(p).join(',')}`, cached = memo.get(key); if (cached) return cached;
    const spec = f.order[i];
    if (skipStrike(f, spec, p)) return visit(i + 1, p);
    const total: Tally = { defenderDies: 0, attackerDies: 0, expectedDealt: 0, expectedTaken: 0 };
    const add = (q: number, next: CombatProgress) => {
      if (q <= 0) return; const t = visit(i + 1, next);
      for (const field of Object.keys(total) as (keyof Tally)[]) total[field] += q * t[field];
    };
    const chance = spec.chance === undefined ? 1 : p.forced < 0 ? spec.chance / 100 : p.forced;
    const rates = strikeRates(f, spec, p), hit = trueHit(rates.hit), crit = rates.crit / 100, backlash = rates.backlash / 100;
    add(1 - chance, spec.chance === undefined ? p : { ...p, forced: 0 });
    const branch = (q: number, hit: boolean, critical = false, proc = false, block = false, afflict = false, rebound = false) => {
      if (q <= 0) return; const next = { ...p }; resolveStrike(f, spec, next, hit, critical, proc, block, afflict, rebound); add(q, next);
    };
    branch(chance * (1 - hit), false);
    const block = spec.side === 'attacker' ? (f.art?.counterBlockOnHit ?? 0) / 100 : 0;
    const afflict = spec.side === 'attacker' && f.art?.onHit ? (f.art.onHit.chance ?? 100) / 100 : 0;
    for (const [critical, cq] of [[false, 1 - crit], [true, crit]] as const) {
      // 反噬只来自武器的普通攻击，与战技的触发／封锁／附加互斥。
      branch(chance * hit * cq * backlash, true, critical, false, false, false, true);
      for (const [proc, pq] of [[false, 1 - rates.proc / 100], [true, rates.proc / 100]] as const)
        for (const [blocked, bq] of [[false, 1 - block], [true, block]] as const)
          for (const [afflicted, aq] of [[false, 1 - afflict], [true, afflict]] as const)
            branch(chance * hit * cq * (1 - backlash) * pq * bq * aq, true, critical, proc, blocked, afflicted);
    }
    memo.set(key, total); return total;
  };
  return visit(0, combatProgress(f));
}
