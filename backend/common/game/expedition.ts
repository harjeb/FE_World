import type { FieldEncounter } from './encounters.ts';
import type { DungeonStage } from './dungeon-plans.ts';
import type { AiDifficulty, ItemStack, UnitState } from '../engine/types.ts';
import type { WeaponId } from '../data/weapons.ts';
import type { ItemKey } from './items.ts';

// 三图地区大副本（docs/00 §8.1.3、docs/13 §4.3）：固定名单、跨图不自动恢复、只有完整通关才带回掉落。

export const DUNGEON_STAGES = 3;
// 每进入一张图支付本图全部日数（docs/13 §3.2）。
export const DUNGEON_STAGE_DAYS = 8;

export type RunState = 'battle' | 'between_maps' | 'completed' | 'failed' | 'withdrawn';

export interface RunCarry extends Pick<UnitState, 'weaponInstances' | 'bookInstances' | 'spellbooks'> { hp: number; items: ItemStack[]; weapons: WeaponId[] }

export interface RunRecord {
  encounter?: FieldEncounter;
  aiDifficulty?: AiDifficulty;
  id: string;
  playerId: string;
  region: number;
  state: RunState;
  unitIds: string[];
  stageIndex: number;
  level: number;
  clearedAtStart: number;
  battleId: string | null;
  carry: Record<string, RunCarry>;
  pendingLoot: { item: string; count: number }[];
  // 本趟已拿到的一次性隐藏要素（mapId:objectId）；完整通关才记入账号，撤离／失败作废。
  pendingClaims?: string[];
  // 地区远征任务（docs/20）：完成后标记该任务；每图日数可覆盖（任务远征 2 日/图）。
  questId?: string;
  stageDays?: number;
  // 经典地图副本：按顺序使用的场景 id 与显示名（不填则沿用随机地图三图副本）。
  // New runs freeze their generated/classic sequence; absent on legacy runs.
  stages?: DungeonStage[];
  scenarioIds?: string[];
  stageNames?: string[];
  rulesetVersion?: string;
  createdAt: number;
  updatedAt: number;
}

export function createRun(id: string, playerId: string, region: number, unitIds: string[], level: number, clearedAtStart: number,
  opts: { encounter?: FieldEncounter; stages?: DungeonStage[]; aiDifficulty?: AiDifficulty; questId?: string; stageDays?: number; scenarioIds?: string[]; stageNames?: string[] } = {}): RunRecord {
  return {
    encounter: opts.encounter ? structuredClone(opts.encounter) : undefined,
    id, playerId, region, aiDifficulty: opts.aiDifficulty ?? 'normal', state: 'battle', unitIds: [...unitIds], stageIndex: 0,
    level, clearedAtStart, battleId: null, carry: {}, pendingLoot: [], questId: opts.questId, stageDays: opts.stageDays,
    stages: opts.stages?.map(stage => ({ ...stage })),
    scenarioIds: opts.scenarioIds ? [...opts.scenarioIds] : undefined,
    stageNames: opts.stageNames ? [...opts.stageNames] : opts.stages?.map(stage => stage.name),
    rulesetVersion: opts.stages ? 'run-v3' : 'run-v2', createdAt: Date.now(), updatedAt: Date.now(),
  };
}

// Saved sequences take priority; legacy runs retain their original structure.
export function stageCount(run: Pick<RunRecord, 'scenarioIds' | 'stages'>): number {
  return run.stages?.length ?? run.scenarioIds?.length ?? DUNGEON_STAGES;
}

export function stageScenario(run: Pick<RunRecord, 'scenarioIds' | 'stages'>, index: number): string | undefined {
  return run.stages ? run.stages[index]?.scenarioId : run.scenarioIds?.[index];
}

export function isActiveRun(run: RunRecord | null): boolean {
  return !!run && (run.state === 'battle' || run.state === 'between_maps');
}

// 从一张图结束时提取跨图携带状态：存活者的 HP、物品与武器；死者不进入下一张（docs/13 §4.3）。
export function carryFromBattle(state: { units: UnitState[] }, unitIds: string[]): Record<string, RunCarry> {
  const carry: Record<string, RunCarry> = {};
  for (const unit of state.units) {
    if (unit.side !== 'player' || !unitIds.includes(unit.id)) continue;
    if (!unit.alive) continue;
    carry[unit.id] = {
      hp: unit.hp, items: unit.items.map(i => ({ ...i })), weapons: [...unit.weapons],
      weaponInstances: unit.weaponInstances?.map(row => ({ ...row })),
      bookInstances: unit.bookInstances?.map(row => ({ ...row })),
      spellbooks: unit.spellbooks?.map(row => ({ ...row })),
    };
  }
  return carry;
}

export function survivingIds(carry: Record<string, RunCarry>): string[] {
  return Object.keys(carry);
}

// Each difficulty has its own guaranteed first-clear equipment and supplies.
const FIRST_CLEAR_WEAPONS: Record<AiDifficulty, WeaponId[]> = {
  normal: [
    'steel_sword', 'killer_bow', 'armorslayer', 'silver_lance', 'recover', 'thunder',
    'steel_axe', 'killer_lance', 'silver_axe', 'dragonstone_plus', 'silver_bow', 'flame_lance',
  ],
  hard: [
    'silver_sword', 'brave_bow', 'brave_sword', 'brave_lance', 'fortify', 'flame_lance',
    'silver_axe', 'brave_lance', 'brave_axe', 'brave_sword', 'brave_bow', 'fortify',
  ],
};
export function dungeonFirstClearLoot(region: number, aiDifficulty: AiDifficulty = 'normal'): { item: ItemKey; count: number }[] {
  const weapon = FIRST_CLEAR_WEAPONS[aiDifficulty][region - 1];
  if (!weapon) throw new Error(`Unknown dungeon region ${region}`);
  return [{ item: weapon, count: 1 }, { item: 'vulnerary', count: aiDifficulty === 'hard' ? 4 : 2 },
    { item: 'full_meal', count: aiDifficulty === 'hard' ? 2 : 1 }];
}

// 每图基础掉落；完整通关才带回，撤离／失败作废（docs/13 §4.3）。
export function stageLoot(region: number, stageIndex: number): { item: string; count: number }[] {
  const material = region % 3 === 0 ? 'ore' : region % 3 === 1 ? 'herb' : 'wood';
  return [{ item: material, count: 2 + stageIndex }, { item: 'seed', count: 1 }];
}

export function runSummary(run: RunRecord): Record<string, unknown> {
  const count = stageCount(run);
  return {
    id: run.id, aiDifficulty: run.aiDifficulty ?? 'normal', region: run.region, state: run.state, stageIndex: run.stageIndex, level: run.level, questId: run.questId ?? null,
    encounter: run.encounter,
    unitIds: run.unitIds, survivingIds: survivingIds(run.carry), battleId: run.battleId,
    // What each survivor brings into the next map: HP and supplies do not recover between maps.
    carry: run.carry,
    pendingLoot: run.pendingLoot, canContinue: run.state === 'between_maps',
    rulesetVersion: run.rulesetVersion ?? 'run-v1', stageCount: count, stageDays: run.stageDays ?? DUNGEON_STAGE_DAYS, stageNames: run.stageNames ?? null,
    stageName: run.stageNames?.[run.stageIndex] ?? null,
    nextStageName: run.stageNames?.[run.stageIndex + (run.state === 'between_maps' ? 0 : 1)] ?? null,
  };
}
