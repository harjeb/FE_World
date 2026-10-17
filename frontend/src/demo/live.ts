// Live, server-backed views of the demo data the screens were built against. The screens import the
// same names as before; the values are refreshed from the API session, and the original demo data is
// only the fallback while loading or when the backend is unreachable (docs/06).
import {
  MY_DEFENSE as DEMO_DEFENSE, MY_LEGION as DEMO_LEGION, MY_POINTS as DEMO_POINTS,
  MY_ROSTER as DEMO_ROSTER, OPPONENTS as DEMO_OPPONENTS, SPARRING as DEMO_SPARRING,
} from '@common/arena/demo.ts';
import type { Defense, SnapshotUnit } from '@common/arena/rules.ts';
import type { GrowthType } from '@common/data/growth-types.ts';
import { session } from '../api/session.ts';
import type { ServerUnit } from '../api/session.ts';
import { WORLD as DEMO_WORLD } from './world.ts';

export const SPARRING = DEMO_SPARRING;

// The personal calendar (docs/00 §2): one day number per legion; labels come from the shared dateOf.
export interface World {
  day: number;
  isArenaDay: boolean;
  nextArenaDay: number;
  gold: number;
  bexp: number;
  rank: { place: number; change: number };
  agent: { online: boolean; activity: string };
  rosterLimit: number;
}

// How the official rosters fared against my locked defense when the arena day settled (GET_ARENA_RESULTS).
export interface DefenseResult { legion: string; letter: string; color: string; status: 'held' | 'lost'; detail: string }

// Per-unit growth type and age come from the server (recruits can differ from the character default).
export interface UnitTrait { growthType: GrowthType; growthTypeName: string; age: number; ageBand: string | null; growthBonus: number }
export let UNIT_TRAITS: Record<string, UnitTrait> = {};

export let MY_LEGION = DEMO_LEGION;
export let MY_POINTS = DEMO_POINTS;
export let MY_ROSTER: SnapshotUnit[] = DEMO_ROSTER;
// The full server records (with ids), so screens can call unit-scoped ops and show real fields.
export let MY_UNITS: ServerUnit[] = [];
export const serverUnit = (id: string): ServerUnit | undefined => MY_UNITS.find(u => u.id === id) ?? MY_UNITS.find(u => u.character === id);
export let OPPONENTS: Defense[] = DEMO_OPPONENTS;
export let MY_DEFENSE: Defense = DEMO_DEFENSE;
export let WORLD: World = { ...DEMO_WORLD, rosterLimit: 18 };
export let DEFENSE_RESULTS: DefenseResult[] = [];
// The Agent's latest reported plan (AGENT_REPORT_PLAN); null until one is reported. No made-up fallback.
export let AGENT_PLAN: { text: string } | null = null;

function sync(): void {
  const { state, arena, defense, results } = session.get();
  if (!state) return;
  MY_LEGION = state.player.legion;
  MY_POINTS = state.arena.points;
  MY_ROSTER = state.units.filter(u => u.status === 'active').map(u => u.snapshot);
  MY_UNITS = state.units;
  UNIT_TRAITS = Object.fromEntries(state.units.map(u => [u.id, {
    growthType: u.growthType, growthTypeName: u.growthTypeName, age: u.age, ageBand: u.ageBand, growthBonus: u.growthBonus,
  }]));
  MY_DEFENSE = defense ?? DEMO_DEFENSE;
  WORLD = {
    day: state.day,
    isArenaDay: state.arena.isArenaDay,
    nextArenaDay: state.arena.nextArenaDay,
    gold: state.gold,
    bexp: state.bexp,
    rank: state.arena.rank,
    agent: { online: state.agentLastSeen !== null && Date.now() - state.agentLastSeen < 5 * 60_000, activity: state.agentPlan ? '已上报计划' : '待命' },
    rosterLimit: state.rosterLimit,
  };
  AGENT_PLAN = state.agentPlan ? { text: state.agentPlan } : null;
  const colors = ['#4E6E5A', '#5E666C', '#7A6A9A', '#8A6A3A'];
  DEFENSE_RESULTS = (results?.defenseTrials ?? []).map((t, i) => ({
    legion: t.attacker, letter: t.attacker.slice(0, 1), color: colors[i % colors.length],
    status: t.held ? 'held' : 'lost', detail: t.held ? `撑过 ${t.turn} 回合，守住了` : `第 ${t.turn} 回合失守`,
  }));
  // Opponents come from the server as summary rows; the demo defense objects match the official
  // teams the server uses, so the map layout and candidate list stay authoritative (docs/05).
  if (arena && arena.opponents.length > 0) {
    OPPONENTS = arena.opponents.map(o => {
      const known = DEMO_OPPONENTS.find(d => d.id === o.id);
      return known ? { ...known, legion: o.legion, points: o.points, record: o.record, map: o.map as Defense['map'] } : known!;
    }).filter(Boolean);
  }
}

session.subscribe(sync);
sync();
