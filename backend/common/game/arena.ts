import type { CharacterId } from '../data/characters.ts';
import { ARENA_MAPS } from '../arena/maps.ts';
import { OPPONENTS } from '../arena/demo.ts';
import { applyBans, arenaPoints, createArenaBattle, validateAttack } from '../arena/rules.ts';
import type { AttackPlan, Defense, Reveal, SnapshotUnit } from '../arena/rules.ts';
import { trialAttack } from '../arena/defense.ts';
import { dateOf } from './calendar.ts';
import type { BattleState } from '../engine/types.ts';

// One player's arena day (docs/05): three opponents, each attackable once. The server owns this;
// the browser only renders it.

export type AttackStatus = 'new' | 'revealed' | 'fighting' | 'won' | 'lost';

export interface ArenaAttack {
  opponentId: string;
  status: AttackStatus;
  bans: CharacterId[];
  battleId: string | null;
  points: number;
  // 离开竞技场日时还没打完（noShow）或主动投降（surrender）不发参与金币 (docs/00 §10.3)。
  noShow?: boolean;
  surrender?: boolean;
  // Filled by ARENA_BAN so ARENA_ATTACK can be validated against the same reveal.
  reveal?: Reveal;
}

export interface DefenseTrial { attacker: string; held: boolean; turn: number; reason: string }

export interface ArenaDayRecord {
  id: string;
  playerId: string;
  day: number;
  opponents: Defense[];
  attacks: Record<string, ArenaAttack>;
  defenseTrials: DefenseTrial[];
  defensePoints: number;
  // 报名时锁定的防守快照；结算只用它，赛后改阵不影响当日结果 (docs/00 §10.1)。
  defense: Defense | null;
  settled: boolean;
  ruleVersion: string;
  frozenAt: number;
}

export const OPPONENT_COUNT = 3;
// 普通竞技场奖励 (docs/00 §10.3): amounts are drafts, with a per-match cap.
export const ARENA_GOLD = { win: 300, loss: 80 };

export function officialOpponents(): Defense[] {
  return structuredClone(OPPONENTS);
}

export function createArenaDay(playerId: string, day: number, opponents?: Defense[], defense: Defense | null = null): ArenaDayRecord {
  const list = (opponents && opponents.length > 0 ? opponents : officialOpponents()).slice(0, OPPONENT_COUNT);
  const attacks: Record<string, ArenaAttack> = {};
  for (const opponent of list) attacks[opponent.id] = { opponentId: opponent.id, status: 'new', bans: [], battleId: null, points: 0 };
  return { id: `day-${playerId}-${day}`, playerId, day, opponents: list, attacks, defenseTrials: [], defensePoints: 0, defense, settled: false, ruleVersion: 'arena-v2', frozenAt: Date.now() };
}

export function mapOf(opponent: Defense) {
  return ARENA_MAPS[opponent.map];
}

// docs/05: the attacker bans B defenders, then the real fielded list and positions are revealed.
export function banFor(day: ArenaDayRecord, opponentId: string, bans: CharacterId[], roster: SnapshotUnit[]): Reveal {
  const opponent = day.opponents.find(o => o.id === opponentId);
  if (!opponent) throw new Error(`没有对手 ${opponentId}`);
  const attack = day.attacks[opponentId];
  if (!attack) throw new Error(`今天没有 ${opponentId} 这个对手`);
  if (attack.status !== 'new') throw new Error('这个对手已经执行过禁用');
  const reveal = applyBans(opponent, bans, roster);
  attack.bans = [...bans];
  attack.reveal = reveal;
  attack.status = 'revealed';
  return reveal;
}

export function startAttack(day: ArenaDayRecord, opponentId: string, roster: SnapshotUnit[], plan: AttackPlan, seed: string, departureDay = day.day): BattleState {
  const opponent = day.opponents.find(o => o.id === opponentId);
  if (!opponent) throw new Error(`没有对手 ${opponentId}`);
  const attack = day.attacks[opponentId];
  if (!attack) throw new Error(`今天没有 ${opponentId} 这个对手`);
  if (attack.status === 'won' || attack.status === 'lost') throw new Error('这个对手今天已经打过了');
  if (attack.status !== 'revealed') throw new Error('还没对该对手执行 BAN');
  const reveal = applyBans(opponent, attack.bans, roster);
  const errors = validateAttack(opponent, reveal, roster, plan);
  if (errors.length > 0) throw new Error(errors.join('；'));
  attack.reveal = reveal;
  const state = createArenaBattle(opponent, attack.bans, roster, plan, seed, dateOf(departureDay).season);
  attack.status = 'fighting';
  return state;
}

// Settles one attack from the finished battle. Returns the points earned.
export function settleAttack(day: ArenaDayRecord, opponentId: string, battle: BattleState): number {
  const attack = day.attacks[opponentId];
  if (!attack) throw new Error(`今天没有 ${opponentId} 这个对手`);
  const won = battle.result?.winner === 'player';
  attack.status = won ? 'won' : 'lost';
  attack.surrender = !won && battle.result?.reason === '投降';
  attack.points = arenaPoints(battle).total;
  return attack.points;
}

// Others attack my defense while I play: the rule AI with three official rosters, computed at
// settlement (docs/05「防守结果」). Deterministic per day.
export function runDefenseTrials(day: ArenaDayRecord, defense: Defense, rosters: { legion: string; roster: SnapshotUnit[] }[]): void {
  day.defenseTrials = rosters.map((entry, i) => {
    const run = trialAttack(defense, entry, `${day.id}:defense:${i}`);
    return { attacker: entry.legion, held: run.held, turn: run.turn, reason: run.reason };
  });
  day.defensePoints = day.defenseTrials.filter(t => t.held).length * 10;
}

export function attackProgress(day: ArenaDayRecord): { done: number; total: number; points: number } {
  const records = Object.values(day.attacks);
  return {
    done: records.filter(r => r.status === 'won' || r.status === 'lost').length,
    total: records.length,
    points: records.reduce((sum, r) => sum + r.points, 0) + day.defensePoints,
  };
}
