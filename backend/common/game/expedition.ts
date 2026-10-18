import type { ItemStack, UnitState } from '../engine/types.ts';
import type { WeaponId } from '../data/weapons.ts';

// 三图地区大副本（docs/00 §8.1.3、docs/13 §4.3）：固定名单、跨图不自动恢复、只有完整通关才带回掉落。

export const DUNGEON_STAGES = 3;
// 每进入一张图支付本图全部日数（docs/13 §3.2）。
export const DUNGEON_STAGE_DAYS = 8;

export type RunState = 'battle' | 'between_maps' | 'completed' | 'failed' | 'withdrawn';

export interface RunCarry { hp: number; items: ItemStack[]; weapons: WeaponId[] }

export interface RunRecord {
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
  // 地区远征任务（docs/20）：完成后标记该任务；每图日数可覆盖（任务远征 2 日/图）。
  questId?: string;
  stageDays?: number;
  // 经典地图副本：按顺序使用的场景 id 与显示名（不填则沿用随机地图三图副本）。
  scenarioIds?: string[];
  stageNames?: string[];
  rulesetVersion?: string;
  createdAt: number;
  updatedAt: number;
}

export function createRun(id: string, playerId: string, region: number, unitIds: string[], level: number, clearedAtStart: number,
  opts: { questId?: string; stageDays?: number; scenarioIds?: string[]; stageNames?: string[] } = {}): RunRecord {
  return {
    id, playerId, region, state: 'battle', unitIds: [...unitIds], stageIndex: 0,
    level, clearedAtStart, battleId: null, carry: {}, pendingLoot: [], questId: opts.questId, stageDays: opts.stageDays,
    scenarioIds: opts.scenarioIds ? [...opts.scenarioIds] : undefined,
    stageNames: opts.stageNames ? [...opts.stageNames] : undefined,
    rulesetVersion: 'run-v2', createdAt: Date.now(), updatedAt: Date.now(),
  };
}

// 经典副本按场景数结算；随机地图副本固定三图。
export function stageCount(run: Pick<RunRecord, 'scenarioIds'>): number {
  return run.scenarioIds?.length ?? DUNGEON_STAGES;
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
    carry[unit.id] = { hp: unit.hp, items: unit.items.map(i => ({ ...i })), weapons: [...unit.weapons] };
  }
  return carry;
}

export function survivingIds(carry: Record<string, RunCarry>): string[] {
  return Object.keys(carry);
}

// 每图基础掉落；完整通关才带回，撤离／失败作废（docs/13 §4.3）。
export function stageLoot(region: number, stageIndex: number): { item: string; count: number }[] {
  const material = region % 3 === 0 ? 'ore' : region % 3 === 1 ? 'herb' : 'wood';
  return [{ item: material, count: 2 + stageIndex }, { item: 'seed', count: 1 }];
}

export function runSummary(run: RunRecord): Record<string, unknown> {
  const count = stageCount(run);
  return {
    id: run.id, region: run.region, state: run.state, stageIndex: run.stageIndex, level: run.level, questId: run.questId ?? null,
    unitIds: run.unitIds, survivingIds: survivingIds(run.carry), battleId: run.battleId,
    // What each survivor brings into the next map: HP and supplies do not recover between maps.
    carry: run.carry,
    pendingLoot: run.pendingLoot, canContinue: run.state === 'between_maps',
    rulesetVersion: run.rulesetVersion ?? 'run-v1', stageCount: count, stageDays: run.stageDays ?? DUNGEON_STAGE_DAYS, stageNames: run.stageNames ?? null,
    stageName: run.stageNames?.[run.stageIndex] ?? null,
    nextStageName: run.stageNames?.[run.stageIndex + 1] ?? null,
  };
}
