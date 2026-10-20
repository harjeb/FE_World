import { SPELLBOOK_BY_ID } from '../data/spellbooks.ts';
import type { WeaponType } from '../data/types.ts';
import { WEAPONS } from '../data/weapons.ts';
import type { BattleRecord } from './battles.ts';

// Awakening-style WEXP: one award per exchange, regardless of follow-ups, damage or hit.
export const WEAPON_EXP_PER_USE = 2;

export function battleWeaponExperience(record: BattleRecord): Map<string, Map<WeaponType, number>> {
  const gained = new Map<string, Map<WeaponType, number>>();
  const players = new Set(record.initial.units.filter(unit => unit.side === 'player' && !unit.npc).map(unit => unit.id));
  const add = (id: string, type: WeaponType | undefined, uses = 1) => {
    if (!players.has(id) || !type || uses <= 0) return;
    const row = gained.get(id) ?? new Map<WeaponType, number>();
    row.set(type, (row.get(type) ?? 0) + uses * WEAPON_EXP_PER_USE);
    gained.set(id, row);
  };
  const weaponType = (id: string): WeaponType | undefined => {
    const weapon = WEAPONS[id as keyof typeof WEAPONS];
    if (weapon) return weapon.type;
    const spell = SPELLBOOK_BY_ID.get(id);
    return spell ? spell.study === 'whiteMagic' ? 'staff' : 'tome' : undefined;
  };
  let cast: { unit: string; spell: string } | undefined;
  const arts = new Map<string, { unit: string; type: WeaponType | undefined; exchanges: number; actions: number }>();
  const artKey = (unit: string, art: string, weapon: string) => JSON.stringify([unit, art, weapon]);
  for (const event of record.events) {
    if (event.t === 'cast') {
      const spell = SPELLBOOK_BY_ID.get(event.spell);
      if (spell && spell.role !== 'attack') add(event.unit, spell.study === 'whiteMagic' ? 'staff' : 'tome');
      // An attack spell emits both cast and combat. Count its actual strike in combat below.
      cast = spell?.role === 'attack' ? { unit: event.unit, spell: event.spell } : undefined;
    }
    if (event.t !== 'combat') continue;
    const castAttack = cast?.unit === event.attacker && cast.spell === event.weapons[0];
    cast = undefined;
    const art = event.forecast?.art;
    for (const [id, weapon] of [[event.attacker, event.weapons[0]], [event.defender, event.weapons[1]]] as const) {
      if (!weapon || !event.strikes.some(strike => strike.by === id)) continue;
      if (id === event.attacker && castAttack) {
        const spell = SPELLBOOK_BY_ID.get(weapon)!;
        add(id, spell.study === 'whiteMagic' ? 'staff' : 'tome');
        continue;
      }
      if (id === event.attacker && art) {
        const key = artKey(id, art.id, weapon);
        const row = arts.get(key) ?? { unit: id, type: weaponType(weapon), exchanges: 0, actions: 0 };
        row.exchanges++;
        arts.set(key, row);
      } else add(id, weaponType(weapon));
    }
  }
  // A multi-target art is one paid weapon action; each actual defender counter still counts.
  for (const action of record.actions) {
    if (action.type !== 'act' || action.act !== 'art') continue;
    const row = arts.get(artKey(action.unit, action.art, action.weapon));
    if (row) row.actions++;
  }
  for (const row of arts.values()) add(row.unit, row.type, Math.min(row.exchanges, row.actions));
  // Staff charges cover healing, area healing, restore, teleport and missed status staves.
  // One paid use counts once even if it emits several target effects, or no effect event.
  for (const initial of record.initial.units) {
    if (!players.has(initial.id)) continue;
    const final = record.state.units.find(unit => unit.id === initial.id);
    if (!final) continue;
    const charges = (units: typeof initial.bookInstances) => (units ?? [])
      .filter(book => WEAPONS[book.id]?.type === 'staff').reduce((sum, book) => sum + book.charges, 0);
    add(initial.id, 'staff', Math.max(0, charges(initial.bookInstances) - charges(final.bookInstances)));
  }
  return gained;
}
