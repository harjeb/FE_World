import data from '../../../content/scenarios/classic-maps-v1/adaptations.json' with { type: 'json' };
import type { ClassId } from '../data/classes.ts';
import type { BattleObject, BattleObjectState, Behavior, Goal, ScenarioAction, ScenarioEvent, ScenarioMapChange, ScenarioSpawn } from '../engine/types.ts';

// 经典地图适配层（docs/24、QUEST-06～09）。catalog 只保存可玩地形与初始编制；
// 这里保存物件、增援、机关、宝箱掉落和难度策略，并保留源文件 SHA-256。
export interface ClassicAdaptation {
  mapId: string;
  adapterVersion: string;
  sourceSha256: string | null;
  difficulty: number;
  levelPolicy: { base: 'quest'; stageBonus: number; bossBonus: number; spread: number };
  deployment: { max: number };
  objects: BattleObject[];
  events: ScenarioEvent[];
  mapChanges: ScenarioMapChange[];
  notes: string[];
  release: { status: 'accepted'; checks: string[] };
}

interface RawObject {
  id: string; kind: BattleObject['kind']; pos: [number, number]; state: BattleObjectState;
  hp?: number; maxHp?: number; label?: string; loot?: { item: string; count: number }; lootRoll?: 'rank_up'; secret?: { quest: string; loot?: { item: string; count: number } }; hideIn?: string[]; change?: string; sourceId?: string;
}
interface RawAdaptation extends Omit<ClassicAdaptation, 'objects' | 'events' | 'mapChanges'> {
  objects: RawObject[];
  events: { id: string; trigger: ScenarioEvent['trigger']; actions: Record<string, unknown>[] }[];
  mapChanges: ScenarioMapChange[];
}
interface RawFile { format: string; schemaVersion: number; count: number; maps: RawAdaptation[] }

const file = data as unknown as RawFile;
if (file.format !== 'agent-tactics.classic-adaptations' || file.schemaVersion !== 1 || file.count !== file.maps.length) {
  throw new Error('经典地图适配文件格式无效');
}

function action(raw: Record<string, unknown>): ScenarioAction {
  const kind = raw.kind;
  if (kind === 'spawn') {
    const units = (raw.units as { classId: string; pos: [number, number]; levelOffset: number; boss?: boolean; behavior?: Behavior }[])
      .map(unit => ({ ...unit, classId: unit.classId as ClassId })) as ScenarioSpawn[];
    return { kind, units };
  }
  if (kind === 'setObject') return { kind, object: raw.object as string, state: raw.state as BattleObjectState };
  if (kind === 'mapChange') return { kind, change: raw.change as string };
  if (kind === 'flag') return { kind, flag: raw.flag as string };
  if (kind === 'loot') return { kind, item: raw.item as string, count: raw.count as number };
  if (kind === 'goal') return { kind, goal: raw.goal as Goal };
  if (kind === 'end') return { kind, winner: raw.winner as 'player' | 'enemy', reason: raw.reason as string };
  if (kind === 'damage') return { kind, target: raw.target as 'player' | 'enemy', amount: raw.amount as number,
    count: raw.count as number | undefined, from: raw.from as [number, number] | undefined, range: raw.range as number | undefined };
  if (kind === 'status') return { kind, target: raw.target as 'player' | 'enemy', status: raw.status as 'sleep' | 'silence' | 'berserk' | 'petrified',
    turns: raw.turns as number | undefined, count: raw.count as number | undefined, from: raw.from as [number, number] | undefined, range: raw.range as number | undefined };
  if (kind === 'scenario') return { kind, message: raw.message as string };
  throw new Error(`未知经典事件动作 ${String(kind)}`);
}

const ADAPTATIONS: ClassicAdaptation[] = file.maps.map(raw => ({
  ...raw,
  objects: raw.objects.map(obj => ({ ...obj })),
  events: raw.events.map(event => ({ ...event, actions: event.actions.map(action) })),
  mapChanges: raw.mapChanges.map(change => ({ ...change, terrain: change.terrain.map(row => [...row]) })),
}));

export const CLASSIC_ADAPTATIONS: readonly ClassicAdaptation[] = ADAPTATIONS;
export const CLASSIC_ADAPTATION_BY_ID = new Map(ADAPTATIONS.map(entry => [entry.mapId, entry]));

export function classicAdaptation(mapId: string): ClassicAdaptation {
  const found = CLASSIC_ADAPTATION_BY_ID.get(mapId);
  if (!found) throw new Error(`经典地图 ${mapId} 没有适配配置`);
  return found;
}
