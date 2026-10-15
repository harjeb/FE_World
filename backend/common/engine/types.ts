import type { ClassId } from '../data/classes.ts';
import type { CharacterId } from '../data/characters.ts';
import type { SkillId } from '../data/skills.ts';
import type { Rank, Stats, WeaponType } from '../data/types.ts';
import type { ItemId, WeaponId } from '../data/weapons.ts';
import type { Terrain } from '../maps/map.ts';
import type { RngState } from './rng.ts';

export type Point = [number, number];
export type Side = 'player' | 'enemy';
// Rule-AI behaviors from docs/03: 进攻 / 伺机 / 固守 / 护卫 / 治疗优先.
export type Behavior = 'aggressive' | 'opportunist' | 'hold' | 'guard' | 'healer';

export interface ItemStack { id: ItemId; uses: number }

export interface UnitState {
  id: string;
  name: string;
  side: Side;
  character?: CharacterId;
  classId: ClassId;
  level: number;
  exp: number;
  stats: Stats;
  con: number;
  hp: number;
  pos: Point;
  // The first usable attack weapon is the equipped one and is used to counter.
  weapons: WeaponId[];
  items: ItemStack[];
  ranks: Partial<Record<WeaponType, Rank>>;
  skill?: SkillId;
  // The side's commander (主将 / 首领): the boss target, the unit guards follow.
  boss?: boolean;
  behavior?: Behavior;
  acted: boolean;
  movedTurn?: number;
  // 庇护: def +2 while state.turn equals this turn.
  shelteredTurn?: number;
  alive: boolean;
}

// boss: defeat the commander (全灭 also wins); rout: only defeating every enemy wins (docs/05).
export type Goal = { kind: 'boss'; target: string } | { kind: 'rout' };

export interface BattleState {
  engineVersion: 1;
  id: string;
  // Arena battles use frozen snapshots and give no experience (docs/03).
  kind: 'field' | 'arena';
  name: string;
  map: { width: number; height: number; tiles: Terrain[][] };
  units: UnitState[];
  turn: number;
  turnLimit: number;
  phase: Side;
  goal: Goal;
  // Combat rolls and level-up rolls use separate streams (docs/02).
  rng: RngState;
  growthRng: RngState;
  result?: { winner: Side; reason: string };
}

interface ActBase { type: 'act'; unit: string; to: Point }
export type ActAction =
  | ActBase & { act: 'wait' }
  | ActBase & { act: 'attack'; target: string; weapon: WeaponId }
  | ActBase & { act: 'heal'; target: string; weapon: WeaponId }
  | ActBase & { act: 'item'; item: number };
// retreat: 全军撤退 in field battles (docs/06 op 56); surrender: 投降 in arena attacks (op 67).
// Both end the battle as a loss.
export type Action = ActAction | { type: 'endPhase' } | { type: 'retreat' } | { type: 'surrender' };

export interface Strike { by: string; target: string; hit: boolean; crit: boolean; damage: number; hpAfter: number }

export type BattleEvent =
  | { t: 'move'; unit: string; path: Point[] }
  | { t: 'combat'; attacker: string; defender: string; weapons: [WeaponId, WeaponId | null]; strikes: Strike[] }
  | { t: 'defeated'; unit: string }
  | { t: 'heal'; by: string | null; target: string; amount: number; hpAfter: number; source: 'staff' | 'item' | 'terrain' }
  | { t: 'exp'; unit: string; gained: number; exp: number; level: number }
  | { t: 'levelUp'; unit: string; level: number; gains: Partial<Stats>; rerolls: number }
  | { t: 'wait'; unit: string }
  | { t: 'phase'; side: Side; turn: number }
  | { t: 'end'; winner: Side; reason: string };

// Error codes follow docs/06; the API turns them into protocol errors.
export class EngineError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
