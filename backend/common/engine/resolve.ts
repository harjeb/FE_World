import { ITEMS, WEAPONS } from '../data/weapons.ts';
import type { WeaponId } from '../data/weapons.ts';
import { TERRAINS } from '../maps/map.ts';
import { forecast } from './combat.ts';
import { combatExp, gainExp, staffExp } from './growth.ts';
import { roll100 } from './rng.ts';
import { living } from './units.ts';
import type { BattleEvent, BattleState, Side, Strike, UnitState } from './types.ts';

// Runs one exchange with the battle RNG. Hit uses two rolls averaged (2RN), crit one roll (docs/03).
export function runCombat(state: BattleState, attacker: UnitState, defender: UnitState, weaponId: WeaponId, events: BattleEvent[]): void {
  const f = forecast(state, attacker.id, attacker.pos, weaponId, defender.id);
  const strikes: Strike[] = [];
  const dealt = { attacker: false, defender: false };
  for (const spec of f.order) {
    if (attacker.hp === 0 || defender.hp === 0) break;
    const [me, foe, side] = spec.side === 'attacker'
      ? [attacker, defender, f.attacker] as const
      : [defender, attacker, f.defender] as const;
    const hit = roll100(state.rng) + roll100(state.rng) < 2 * side.hit;
    const crit = hit && roll100(state.rng) < (spec.followUp ? side.followUpCrit : side.crit);
    const damage = hit ? side.damage * (crit ? 3 : 1) : 0;
    foe.hp = Math.max(0, foe.hp - damage);
    if (damage > 0) dealt[spec.side] = true;
    strikes.push({ by: me.id, target: foe.id, hit, crit, damage, hpAfter: foe.hp });
  }
  events.push({
    t: 'combat', attacker: attacker.id, defender: defender.id,
    weapons: [weaponId, f.defender.canAttack ? f.defender.weapon : null], strikes,
  });
  for (const unit of [attacker, defender]) {
    if (unit.hp > 0) continue;
    unit.alive = false;
    events.push({ t: 'defeated', unit: unit.id });
  }
  // Surviving player units that took part gain experience, including a defender that only countered.
  for (const [unit, foe, didDamage] of [[attacker, defender, dealt.attacker], [defender, attacker, dealt.defender]] as const) {
    if (unit.side === 'player' && unit.alive) gainExp(state, unit, combatExp(unit, foe, didDamage, !foe.alive), events);
  }
}

export function runHeal(state: BattleState, healer: UnitState, target: UnitState, weaponId: WeaponId, events: BattleEvent[]): void {
  const staff = WEAPONS[weaponId];
  const missing = target.stats.hp - target.hp;
  const amount = staff.heal === 'full' ? missing : Math.min(missing, healer.stats.mag + 10);
  target.hp += amount;
  if (healer.skill === 'shelter') target.shelteredTurn = state.turn;
  events.push({ t: 'heal', by: healer.id, target: target.id, amount, hpAfter: target.hp, source: 'staff' });
  if (healer.side === 'player') gainExp(state, healer, staffExp(healer), events);
}

export function useItem(unit: UnitState, index: number, events: BattleEvent[]): void {
  const stack = unit.items[index];
  const amount = Math.min(unit.stats.hp - unit.hp, ITEMS[stack.id].heal);
  unit.hp += amount;
  stack.uses -= 1;
  if (stack.uses === 0) unit.items.splice(index, 1);
  events.push({ t: 'heal', by: unit.id, target: unit.id, amount, hpAfter: unit.hp, source: 'item' });
}

// Forts and thrones restore 20% max HP to the units standing on them when their phase starts.
export function terrainHeal(state: BattleState, side: Side, events: BattleEvent[]): void {
  for (const unit of living(state, side)) {
    const percent = TERRAINS[state.map.tiles[unit.pos[1]][unit.pos[0]]].heal;
    const amount = Math.min(unit.stats.hp - unit.hp, Math.floor(unit.stats.hp * percent / 100));
    if (amount <= 0) continue;
    unit.hp += amount;
    events.push({ t: 'heal', by: null, target: unit.id, amount, hpAfter: unit.hp, source: 'terrain' });
  }
}
