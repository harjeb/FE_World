import { CHARACTERS } from '../data/characters.ts';
import { autoplay, GUARD_RADIUS, moveRange, reachCells, unitById, weaponRange } from '../engine/index.ts';
import type { Behavior, Point } from '../engine/index.ts';
import { ARENA_MAPS } from './maps.ts';
import type { ArenaMapId } from './maps.ts';
import { applyBans, canHeal, createArenaBattle, defenderId, defenseBoard, opponentList, resolveUnit, unitKey } from './rules.ts';
import type { Defense, SnapshotUnit } from './rules.ts';

// Editing helpers for the defense settings page (docs/05「防守设置」). All return new objects.

const selectedUnit = (defense: Defense, reference: string) => resolveUnit(defense.slots.map(s => s.unit), reference);

const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];

// Switching maps changes D + B and the spawn zone: keep units by priority and drop bans and
// commanders that no longer fit. The commander takes the zone's throne or fort (or its middle) and
// the others fill the nearest cells around it in priority order.
export function switchMap(defense: Defense, mapId: ArenaMapId): Defense {
  const map = ARENA_MAPS[mapId];
  const kept = withCommanders({ ...defense, map: mapId, slots: defense.slots.slice(0, map.deploy + map.bans), bans: defense.bans.slice(0, map.bans) });
  const zone = map.defenderZone;
  const on = (glyph: string) => zone.find(([x, y]) => map.rows[y][x] === glyph);
  const anchor = on('T') ?? on('F') ?? zone[Math.floor(zone.length / 2)];
  const free = [...zone].sort((a, b) => dist(a, anchor) - dist(b, anchor) || a[1] - b[1] || a[0] - b[0]);
  const lead = selectedUnit(kept, kept.commanders[0]);
  const ordered = [...kept.slots].sort((a, b) => Number(b.unit === lead) - Number(a.unit === lead));
  const cells = new Map(ordered.map(s => [unitKey(s.unit), free.shift()!]));
  return { ...kept, slots: kept.slots.map(s => ({ ...s, pos: cells.get(unitKey(s.unit))! })) };
}

const dist = (a: Point, b: Point) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

// Commanders must be listed units; if none are left, the top-priority unit takes command.
function withCommanders(defense: Defense): Defense {
  const listed = defense.slots.map(s => unitKey(s.unit));
  const kept = defense.commanders.map(c => selectedUnit(defense, c)).filter((u): u is SnapshotUnit => !!u).map(unitKey);
  return { ...defense, commanders: kept.length > 0 ? kept : listed.slice(0, 1) };
}

export function addUnit(defense: Defense, unit: SnapshotUnit): Defense {
  const map = ARENA_MAPS[defense.map];
  const cell = map.defenderZone.find(z => !defense.slots.some(s => same(s.pos, z)));
  if (!cell || defense.slots.length >= map.deploy + map.bans || defense.slots.some(s => unitKey(s.unit) === unitKey(unit))) return defense;
  const behavior: Behavior = canHeal(unit) ? 'healer' : 'opportunist';
  return withCommanders({ ...defense, slots: [...defense.slots, { unit, pos: cell, behavior }] });
}

export function removeUnit(defense: Defense, character: string): Defense {
  const unit = selectedUnit(defense, character);
  return withCommanders({ ...defense, commanders: withCommanders(defense).commanders, slots: defense.slots.filter(s => s.unit !== unit) });
}

// Moves a unit within the defender zone, swapping places with whoever stands there.
export function moveUnit(defense: Defense, character: string, to: Point): Defense {
  const map = ARENA_MAPS[defense.map];
  const unit = selectedUnit(defense, character);
  const from = defense.slots.find(s => s.unit === unit)?.pos;
  if (!from || !map.defenderZone.some(z => same(z, to))) return defense;
  const slots = defense.slots.map(s => (s.unit === unit ? { ...s, pos: to } : same(s.pos, to) ? { ...s, pos: from } : s));
  return { ...defense, slots };
}

export function shiftPriority(defense: Defense, character: string, delta: -1 | 1): Defense {
  const unit = selectedUnit(defense, character);
  const i = defense.slots.findIndex(s => s.unit === unit), j = i + delta;
  if (i < 0 || j < 0 || j >= defense.slots.length) return defense;
  const slots = [...defense.slots];
  [slots[i], slots[j]] = [slots[j], slots[i]];
  return { ...defense, slots };
}

export function setBehavior(defense: Defense, character: string, behavior: Behavior): Defense {
  const unit = selectedUnit(defense, character);
  return { ...defense, slots: defense.slots.map(s => (s.unit === unit ? { ...s, behavior } : s)) };
}

// Advice that does not make the setup invalid but probably is not what the player wants.
export function defenseNotes(defense: Defense): string[] {
  const map = ARENA_MAPS[defense.map];
  const notes: string[] = [];
  const order = defense.slots.map(s => s.unit);
  const lead = selectedUnit(defense, defense.commanders[0]);
  const rank = lead ? order.indexOf(lead) : -1;
  if (lead && rank >= map.deploy) {
    notes.push(`主将${lead.name ?? CHARACTERS[lead.character].name}排在第 ${rank + 1} 位：前 ${map.deploy} 人都没被禁用时他不会上场，主将由出战的备选接任。`);
  }
  if (defense.slots.slice(0, map.deploy).every(s => s.behavior === 'hold')) notes.push('出战单位全部固守：对方可以只打一个目标而不受其他人干扰。');
  return notes;
}

export type ReachKind = 'trigger' | 'counter' | 'guard' | 'heal' | 'chase';

// The area that drives a unit's AI behavior, drawn on the map for the selected unit.
export function behaviorArea(defense: Defense, character: string): { kind: ReachKind; cells: Point[] } | null {
  const map = ARENA_MAPS[defense.map];
  const selected = selectedUnit(defense, character);
  const slot = defense.slots.find(s => s.unit === selected);
  if (!slot) return null;
  const state = defenseBoard(defense);
  const unit = unitById(state, defenderId(unitKey(slot.unit)));
  const toPoints = (keys: Iterable<number>) => [...keys].map(k => [k % map.rows[0].length, Math.floor(k / map.rows[0].length)] as Point);
  const range = moveRange(state, unit);
  switch (slot.behavior) {
    case 'opportunist': return { kind: 'trigger', cells: toPoints(reachCells(state, unit, range, 'attack')) };
    case 'aggressive': return { kind: 'chase', cells: toPoints(reachCells(state, unit, range, 'attack')) };
    case 'healer': return { kind: 'heal', cells: toPoints(reachCells(state, unit, range, 'heal')) };
    case 'hold': {
      const cells: Point[] = [];
      for (const w of unit.weapons) {
        const [min, max] = weaponRange(unit, w);
        for (let y = 0; y < map.rows.length; y++) for (let x = 0; x < map.rows[0].length; x++) {
          const d = Math.abs(x - slot.pos[0]) + Math.abs(y - slot.pos[1]);
          if (d >= min && d <= max && !cells.some(c => c[0] === x && c[1] === y)) cells.push([x, y]);
        }
      }
      return { kind: 'counter', cells };
    }
    case 'guard': {
      const commander = selectedUnit(defense, defense.commanders[0]);
      const lead = defense.slots.find(s => s.unit === commander) ?? slot;
      const cells: Point[] = [];
      for (let y = 0; y < map.rows.length; y++) for (let x = 0; x < map.rows[0].length; x++) {
        if (Math.abs(x - lead.pos[0]) + Math.abs(y - lead.pos[1]) <= GUARD_RADIUS && range.cost.has(y * map.rows[0].length + x)) cells.push([x, y]);
      }
      return { kind: 'guard', cells };
    }
  }
}

export interface TrialRun { attacker: string; bans: string[]; held: boolean; turn: number; reason: string }

// 陪练试攻: the rule AI attacks this defense with another player's roster. It bans the highest-level
// listed units (all it can see before the reveal), fields the first D it may, and plays it out.
export function trialAttack(defense: Defense, attacker: { legion: string; roster: SnapshotUnit[] }, seed: string): TrialRun {
  const map = ARENA_MAPS[defense.map];
  const bans = opponentList(defense).slice(0, map.bans).map(unitKey);
  const reveal = applyBans(defense, bans, attacker.roster);
  const barred = reveal.barred.map(c => resolveUnit(attacker.roster, c));
  const allowed = attacker.roster.filter(u => !barred.includes(u));
  const picks = allowed.slice(0, map.deploy).map((u, i) => ({ character: u.character, unitId: u.id, pos: map.attackerZone[i] }));
  const end = autoplay(createArenaBattle(defense, bans, attacker.roster, { picks, commander: unitKey(allowed[0]) }, seed));
  return { attacker: attacker.legion, bans, held: end.result!.winner === 'enemy', turn: end.turn, reason: end.result!.reason };
}
