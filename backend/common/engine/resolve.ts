import { ITEMS, WEAPONS } from '../data/weapons.ts';
import type { WeaponId } from '../data/weapons.ts';
import { TERRAINS } from '../maps/map.ts';
import { combatProgress, forecast, resolveStrike, skipStrike, strikeRates } from './combat.ts';
import type { CombatArt } from './combat.ts';
import { artState, clearArtEffects } from './arts.ts';
import { addArtBuff, consumeArtExchange, inflictArtStatus } from './art-effects.ts';
import { combatExp, gainExp, staffExp } from './growth.ts';
import { roll100 } from './rng.ts';
import { chargeRow, cureStatuses, distance, living, wake, weaponRange } from './units.ts';
import type { BattleEvent, BattleState, Side, Strike, UnitState } from './types.ts';

// Runs one exchange with the battle RNG. Hit uses two rolls averaged (2RN), crit one roll (docs/03).
// `cast` marks an attack spell paid from the caster's spellbooks.
export function runCombat(state: BattleState, attacker: UnitState, defender: UnitState, weaponId: WeaponId, events: BattleEvent[], art?: CombatArt, cast = false): Strike[] {
  const f = forecast(state, attacker.id, attacker.pos, weaponId, defender.id, art, cast);
  const progress = combatProgress(f), oldBuffs = [attacker, defender].map(u => [...(u.artEffects?.buffs ?? [])]);
  const strikes: Strike[] = [];
  const dealt = { attacker: false, defender: false };
  // 法术书／魔道书的开场与速度追击各是一次施放、各扣 1 次（未命中也扣）；次数用尽的那次不发生。
  const books = { attacker: chargeRow(attacker, weaponId, cast), defender: f.defender.canAttack && f.defender.weapon ? chargeRow(defender, f.defender.weapon, false) : undefined };
  const paid = new Set<string>();
  const chance = (percent: number) => percent >= 100 || percent > 0 && roll100(state.rng) < percent;
  for (const spec of f.order) {
    if (attacker.petrified || defender.petrified || progress.stopped) break;
    if (skipStrike(f, spec, progress)) continue;
    if (spec.chance !== undefined) {
      if (progress.forced < 0) progress.forced = chance(spec.chance) ? 1 : 0;
      if (!progress.forced) continue;
    }
    const book = books[spec.side], use = `${spec.side}:${spec.followUp}`;
    if (book && !paid.has(use)) {
      if (book.charges <= 0) continue;
      book.charges -= 1; paid.add(use);
    }
    const [me, foe] = spec.side === 'attacker' ? [attacker, defender] : [defender, attacker];
    const rates = strikeRates(f, spec, progress), proc = chance(rates.proc);
    const hit = roll100(state.rng) + roll100(state.rng) < 2 * rates.hit;
    const crit = hit && roll100(state.rng) < rates.crit;
    const backlash = hit && chance(rates.backlash);
    const block = spec.side === 'attacker' && hit && chance(art?.counterBlockOnHit ?? 0);
    const afflict = spec.side === 'attacker' && hit && !!art?.onHit && chance(art.onHit.chance ?? 100);
    const resolved = resolveStrike(f, spec, progress, hit, crit, proc, block, afflict, backlash);
    attacker.hp = progress.aHp; defender.hp = progress.dHp;
    // 反噬时伤害落在出手者身上，目标既不受击也不消耗屏障。
    const victim = resolved.backlash ? me : foe;
    if (hit && !resolved.backlash && foe.artEffects?.barrier) { delete foe.artEffects.barrier; artState(foe, events); }
    if (resolved.damage > 0 && wake(victim)) events.push({ t: 'status', unit: victim.id, status: 'sleep', active: false });
    if (resolved.shield) {
      victim.shields = (victim.shields ?? 0) - 1; victim.shieldsUsed = (victim.shieldsUsed ?? 0) + 1;
      const shieldIndex = victim.items.findIndex(item => item.id === 'immortal_shield');
      if (shieldIndex >= 0) victim.items.splice(shieldIndex, 1);
      victim.petrified = true;
      events.push({ t: 'shield', unit: victim.id });
    }
    if (resolved.afflicted && art?.onHit) {
      for (const status of art.onHit.statuses ?? []) inflictArtStatus(foe, status, events);
      if (art.onHit.movePenalty && (!art.onHit.onlyFlying || !f.defender.terrain.applies)) addArtBuff(state, foe, art.id, 'move', -art.onHit.movePenalty, 'phase', events);
      if (art.onHit.debuff) { const b = art.onHit.debuff; addArtBuff(state, foe, art.id, b.stat, b.amount, b.duration, events); }
      if (art.onHit.stripProtection) addArtBuff(state, foe, art.id, 'protection', -1, 'exchange', events);
    }
    if (resolved.inflicted) {
      // 武器／法术的命中附加：毒、定身、降速，持续到受害方自己的阶段结束。
      const source = spec.side === 'attacker' ? weaponId : f.defender.weapon!;
      for (const status of f[spec.side].afflicts) inflictArtStatus(foe, status, events);
      const debuff = WEAPONS[source].onHit?.debuff;
      if (debuff && f[spec.side].slows > 0) addArtBuff(state, foe, source, debuff.stat, debuff.amount, 'phase', events);
    }
    if (resolved.damage > 0 && !resolved.backlash) dealt[spec.side] = true;
    strikes.push({ by: me.id, target: foe.id, hit, crit, damage: resolved.damage, hpAfter: foe.hp,
      ...(resolved.heal || resolved.backlash ? { byHpAfter: me.hp } : {}), ...(proc ? { proc: true } : {}), ...(resolved.backlash ? { backlash: true } : {}) });
  }
  [attacker, defender].forEach((u, index) => consumeArtExchange(u, oldBuffs[index], events));
  // 屏障只挡一次交战。
  for (const unit of [attacker, defender]) {
    if (!unit.artEffects?.buffs?.some(b => b.stat === 'ward')) continue;
    unit.artEffects = { ...unit.artEffects, buffs: unit.artEffects.buffs.filter(b => b.stat !== 'ward') };
    artState(unit, events);
  }
  events.push({
    t: 'combat', attacker: attacker.id, defender: defender.id,
    weapons: [weaponId, f.defender.canAttack ? f.defender.weapon : null], strikes,
    ...(art ? { forecast: f } : {}),
  });
  if (art) events.push({ t: 'art', unit: attacker.id, target: defender.id, art: art.id });
  for (const unit of [attacker, defender]) {
    if (!unit.alive || unit.petrified || unit.hp === 0) clearArtEffects(state, unit, events);
    if (unit.hp > 0) continue;
    unit.alive = false;
    if (unit.carried) {
      state.boxes ??= [];
      for (let box = 0; box < unit.carried; box++) state.boxes.push([...unit.pos]);
      events.push({ t: 'drop', unit: unit.id, boxes: unit.carried, at: [...unit.pos] });
      unit.carried = 0;
    }
    events.push({ t: 'defeated', unit: unit.id });
  }
  // Surviving player units that took part gain experience, including a defender that only countered.
  const friendly = attacker.side === defender.side;
  for (const [unit, foe, didDamage] of [[attacker, defender, dealt.attacker], [defender, attacker, dealt.defender]] as const) {
    if (!friendly && unit.side === 'player' && unit.alive) gainExp(state, unit, combatExp(unit, foe, didDamage, !foe.alive), events);
  }
  return strikes;
}

// Staff and spell healing: 魔 + 基值（缺省 10；祈愿／职业固有各 +5）or full, never above max HP.
export function healAmount(healer: UnitState, target: UnitState, weaponId: WeaponId): number {
  if (!target.alive || target.petrified || target.hp <= 0 || target.immunities?.includes('healing')) return 0;
  const missing = target.stats.hp - target.hp;
  const w = WEAPONS[weaponId];
  if (w.heal === 'full') return missing;
  const classHeal = (healer.classSkills ?? []).includes('sk-93') ? 5 : 0;
  return Math.min(missing, healer.stats.mag + (w.healBase ?? 10) + (healer.skill === 'prayer' ? 5 : 0) + classHeal);
}

// `extra` adds a separately rolled bonus (圣治 +100); it still never heals past max HP or a petrified unit.
export function runHeal(state: BattleState, healer: UnitState, target: UnitState, weaponId: WeaponId, events: BattleEvent[], extra = 0): void {
  const base = healAmount(healer, target, weaponId);
  const amount = base > 0 ? Math.min(target.stats.hp - target.hp, base + extra) : 0;
  target.hp += amount;
  if (healer.skill === 'shelter') target.shelteredTurn = state.turn;
  events.push({ t: 'heal', by: healer.id, target: target.id, amount, hpAfter: target.hp, source: 'staff' });
  if (WEAPONS[weaponId].cure) for (const status of cureStatuses(target, events)) events.push({ t: 'status', unit: target.id, status, active: false });
  if (healer.side === 'player') gainExp(state, healer, staffExp(healer), events);
}

// 范围治疗（群疗杖、群体圣疗）：施法者所在格射程内的每名受伤友军各结算一次，不含施法者本人。
export function areaHealTargets(state: BattleState, healer: UnitState, weaponId: WeaponId, at = healer.pos): UnitState[] {
  const [min, max] = weaponRange(healer, weaponId);
  return living(state, healer.side).filter(ally => ally.id !== healer.id && !ally.npc && healAmount(healer, ally, weaponId) > 0
    && distance(at, ally.pos) >= min && distance(at, ally.pos) <= max);
}

export function runAreaHeal(state: BattleState, healer: UnitState, weaponId: WeaponId, events: BattleEvent[]): void {
  for (const ally of areaHealTargets(state, healer, weaponId)) {
    const amount = healAmount(healer, ally, weaponId);
    ally.hp += amount;
    if (healer.skill === 'shelter') ally.shelteredTurn = state.turn;
    events.push({ t: 'heal', by: healer.id, target: ally.id, amount, hpAfter: ally.hp, source: 'staff' });
  }
  if (healer.side === 'player') gainExp(state, healer, staffExp(healer), events);
}

export function useItem(unit: UnitState, index: number, events: BattleEvent[]): void {
  const stack = unit.items[index];
  const amount = unit.petrified || unit.immunities?.includes('healing') ? 0 : Math.min(unit.stats.hp - unit.hp, ITEMS[stack.id].heal);
  unit.hp += amount;
  stack.uses -= 1;
  if (stack.uses === 0) unit.items.splice(index, 1);
  events.push({ t: 'heal', by: unit.id, target: unit.id, amount, hpAfter: unit.hp, source: 'item' });
}

// Forts and thrones restore 20% max HP to the units standing on them when their phase starts.
export function terrainHeal(state: BattleState, side: Side, events: BattleEvent[]): void {
  for (const unit of living(state, side)) {
    if (unit.petrified || unit.immunities?.includes('healing')) continue;
    const percent = TERRAINS[state.map.tiles[unit.pos[1]][unit.pos[0]]].heal;
    const amount = Math.min(unit.stats.hp - unit.hp, Math.floor(unit.stats.hp * percent / 100));
    if (amount <= 0) continue;
    unit.hp += amount;
    events.push({ t: 'heal', by: null, target: unit.id, amount, hpAfter: unit.hp, source: 'terrain' });
  }
}
