import type { ClassId } from '../data/classes.ts';
import type { CharacterId } from '../data/characters.ts';
import type { GrowthType } from '../data/growth-types.ts';
import type { SkillId } from '../data/skills.ts';
import type { Rank, Stats, WeaponType } from '../data/types.ts';
import type { ItemId, WeaponId, WeaponInstance } from '../data/weapons.ts';
import type { Terrain } from '../maps/map.ts';
import type { RngState } from './rng.ts';
import type { InheritanceContract } from '../game/legacy.ts';
import type { Forecast } from './combat.ts';

export type Point = [number, number];
export type Side = 'player' | 'enemy';
export type AiDifficulty = 'normal' | 'hard';
// Rule-AI behaviors from docs/03: 进攻 / 伺机 / 固守 / 护卫 / 治疗优先.
export type Behavior = 'aggressive' | 'opportunist' | 'hold' | 'guard' | 'healer';

export interface ItemStack { id: ItemId; uses: number }

// ward: 屏障，按百分比减少本单位下一次交战受到的伤害。
export type ArtStat = 'str' | 'mag' | 'skl' | 'spd' | 'lck' | 'def' | 'res' | 'attack' | 'hit' | 'crit' | 'avoid' | 'dodge' | 'as' | 'protection' | 'move' | 'ward';
export type ArtAilment = 'poison' | 'root' | 'silence' | 'confusion';
export interface ArtBuff { source: string; stat: ArtStat; amount: number; duration: 'map' | 'next_phase' | 'phase' | 'exchange'; turn: number }

export interface UnitState {
  id: string;
  name: string;
  side: Side;
  character?: CharacterId;
  // 保存的随机形象键或旧预设；缺省时回退到 character 的肖像。
  portrait?: string;
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
  // 成长类型与年龄（docs/02）: carried per unit so recruits can differ from their character default.
  growthType?: GrowthType;
  age?: number;
  // 轮回的 30 点个人成长率分配（docs/00 §5.2），加在个人基础上。
  growthAllocation?: Partial<Stats>;
  // 单位自身掷定的个人基础成长（随机招募必须随战斗带入，否则升级会回退到形象角色）。
  personalGrowth?: Partial<Stats>;
  // 成长率传承替换后的个人基础成长（绝对向量）；存在时优先于 personalGrowth 与角色表基础。
  inheritedGrowth?: Partial<Stats>;
  inheritance?: InheritanceContract;
  // 已学会并装备的技能（最多 5 个，跨职业自由装备）；个人技能单列在 skill。
  skills?: SkillId[];
  // 不朽盾（docs/00 §7.2）：致死时消耗一枚，保留 1HP 并石化至下个己方阶段。
  shields?: number;
  shieldsUsed?: number;
  petrified?: boolean;
  // 睡眠：无法行动，受击或复原杖解除；睡眠杖另记 sleepPhases，睡过目标自己的阶段数后醒。沉默/混乱按己方阶段计数。
  statuses?: { sleep?: boolean; sleepPhases?: number; silence?: number; berserk?: number; regen?: number };
  artEffects?: { formationMoved?: boolean; movementPenalty?: number; scent?: Side[]; barrier?: { amount: number; by: string }; displaced?: boolean; buffs?: ArtBuff[]; statuses?: ArtAilment[] };
  immunities?: ('movement_debuff' | 'follow_up_lock' | 'defense_pierce' | 'poison' | 'root' | 'silence' | 'confusion' | 'debuff' | 'healing' | 'sleep')[];
  tags?: ('large' | 'demon' | 'nether_protection')[];
  // 已学习的主动战技稳定 ID（最多五格；具体学习由成长系统写入）。
  arts?: string[];
  // 用限量教材学会的法术（芬布尔之夜等）；施放这类法术还要持有对应的书。
  learnedSpells?: string[];
  // 当前职业固有能力的参考资料 ID（sk-*）；精通节点另由 learnedSkills 提供。
  classSkills?: string[];
  weaponInstances?: WeaponInstance[];
  bookInstances?: { id: WeaponId; charges: number; maxCharges: number }[];
  spellbooks?: { id: string; charges: number; maxCharges: number }[];
  // 友方 NPC（护卫对象）：不归玩家操作，每个己方阶段自动向撤离点移动（docs/20 §2）。
  npc?: boolean;
  // 已从战场撤离（不算死亡，结算时视为存活）。
  escaped?: boolean;
  // 携带的物资箱数量（抢物资任务）。
  carried?: number;
  // The side's commander (主将 / 首领): the boss target, the unit guards follow.
  boss?: boolean;
  behavior?: Behavior;
  acted: boolean;
  movedTurn?: number;
  // 庇护: def +2 while state.turn equals this turn.
  shelteredTurn?: number;
  alive: boolean;
}

// boss: defeat the commander (全灭 also wins); rout: only defeating every enemy wins;
// seize: the player's commander stands on the throne and seizes it (压制王座, docs/03 and 05);
// defend: hold out until turnLimit is reached (坚守, docs/20);
// escape: N player units reach an exit and evacuate; gather: carry N supply boxes off the map;
// escort: the allied NPC reaches an exit alive (docs/20 §2).
export type Goal =
  | { kind: 'boss'; target: string }
  | { kind: 'rout' }
  | { kind: 'seize'; throne: Point }
  | { kind: 'defend'; turns: number }
  | { kind: 'escape'; exits: Point[]; need: number }
  | { kind: 'gather'; exits: Point[]; need: number }
  | { kind: 'escort'; exits: Point[]; npc: string };

export type BattleObjectKind = 'door' | 'chest' | 'village' | 'wall' | 'switch' | 'ballista';
// hidden：密室物件开局不可见、不可交互，由事件 setObject 揭开（公开状态不下发）。
export type BattleObjectState = 'closed' | 'open' | 'opened' | 'visited' | 'intact' | 'destroyed' | 'idle' | 'triggered' | 'hidden';

export interface BattleObject {
  id: string;
  kind: BattleObjectKind;
  pos: Point;
  state: BattleObjectState;
  hp?: number;
  maxHp?: number;
  label?: string;
  // Stable chest/village loot; settlement reads this ledger only once.
  loot?: { item: string; count: number };
  // 随机升级宝箱：创建战斗时按玩家能买到的最高级再高一级抽成 loot，之后与固定宝箱相同。
  lootRoll?: 'rank_up';
  // 隐藏要素（适配文件）：只在指定任务里出现，loot 为该任务里的替换掉落；其他场合保留原物件或整件移除。
  secret?: { quest: string; loot?: { item: string; count: number } };
  // 隐藏要素每个账号只发一次：完整结算后记入 flags.secretsClaimed，之后的战斗不再生成。
  once?: true;
  // 适配文件字段：在这些任务里整件不生成（主线任务把村庄、宝箱挪到别处）；开战后不保留。
  hideIn?: string[];
  // Switch-bound map change id.
  change?: string;
  // 临时墙等法术物件在指定回合后消失。
  expiresTurn?: number;
  // 法术物件的施法者（彷徨之壁每人最多同时 2 面）。
  owner?: string;
}

export interface ScenarioMapChange { id: string; position: Point; terrain: (Terrain | null)[][] }

export interface ScenarioSpawn { classId: ClassId; pos: Point; levelOffset: number; boss?: boolean; behavior?: Behavior }

export type ScenarioAction =
  | { kind: 'spawn'; units: ScenarioSpawn[] }
  | { kind: 'setObject'; object: string; state: BattleObjectState }
  | { kind: 'mapChange'; change: string }
  | { kind: 'flag'; flag: string }
  | { kind: 'loot'; item: string; count: number }
  | { kind: 'goal'; goal: Goal }
  | { kind: 'end'; winner: Side; reason: string }
  | { kind: 'damage'; target: 'player' | 'enemy'; amount: number; count?: number; from?: Point; range?: number }
  | { kind: 'status'; target: 'player' | 'enemy'; status: 'sleep' | 'silence' | 'berserk' | 'petrified'; turns?: number; count?: number; from?: Point; range?: number }
  | { kind: 'scenario'; message: string };

export type ScenarioTrigger =
  | { kind: 'turn'; turn: number }
  | { kind: 'object'; object: string; state: BattleObjectState }
  | { kind: 'flag'; flag: string };

export interface ScenarioEvent { id: string; trigger: ScenarioTrigger; actions: ScenarioAction[] }

export interface ScenarioRuntime {
  id: string;
  adapterVersion: string;
  sourceSha256: string | null;
  baseLevel: number;
  events: ScenarioEvent[];
  mapChanges: ScenarioMapChange[];
  fired: string[];
  flags: string[];
}

export interface CrossTimeGroup {
  id: 'A' | 'B' | 'C' | 'D';
  name: string;
  unitIds: string[];
  thresholdY?: number;
  active: boolean;
  activateTurn?: number;
  reason?: string;
}

export interface BattleState {
  crossTimeGroups?: CrossTimeGroup[];
  encounter?: import('../game/encounters.ts').FieldEncounter & { playerGroups?: number[] };
  engineVersion: 1;
  id: string;
  // Arena battles use frozen snapshots and give no experience (docs/03).
  kind: 'field' | 'arena';
  // Frozen when departing; absent in older battles means normal.
  aiDifficulty?: AiDifficulty;
  name: string;
  map: { width: number; height: number; tiles: Terrain[][]; season?: number };
  units: UnitState[];
  turn: number;
  turnLimit: number;
  phase: Side;
  goal: Goal;
  // 场上未拾取的物资箱（gather 任务）。
  boxes?: Point[];
  // 护送固定路线与下一步预告（保存后可重连复现）。
  npcRoute?: Point[];
  nextObjective?: string;
  // Interactive scenario layer (classic maps): doors, chests, villages, switches, waves.
  objects?: BattleObject[];
  // One-time loot found on the map; settlement validates and de-duplicates by stable id.
  loot?: { id: string; item: string; count: number }[];
  scenario?: ScenarioRuntime;
  // Combat rolls and level-up rolls use separate streams (docs/02).
  rng: RngState;
  growthRng: RngState;
  embers?: { pos: Point; side: Side; until: string }[];
  result?: { winner: Side; reason: string };
}

interface ActBase { type: 'act'; unit: string; to: Point }
export type ActAction =
  | ActBase & { act: 'wait' }
  | ActBase & { act: 'attack'; target: string; weapon: WeaponId }
  | ActBase & { act: 'heal'; target: string; weapon: WeaponId }
  | ActBase & { act: 'item'; item: number }
  | ActBase & { act: 'seize' }
  | ActBase & { act: 'escape' }
  | ActBase & { act: 'interact'; target: string }
  | ActBase & { act: 'dance'; target: string }
  | ActBase & { act: 'art'; target: string; weapon: WeaponId; art: string; ally?: string; secondary?: string; postTo?: Point; support?: { target: string; spell?: string; weapon?: WeaponId; dest?: Point } }
  | ActBase & { act: 'cast'; target: string; spell: string; dest?: Point }
  | ActBase & { act: 'staff'; target: string; weapon: WeaponId; dest?: Point };
// retreat: 全军撤退 in field battles (docs/06 op 56); surrender: 投降 in arena attacks (op 67).
// Both end the battle as a loss.
export type Action = ActAction | { type: 'endPhase' } | { type: 'retreat' } | { type: 'surrender' };

// backlash: 反噬，这一击的伤害落在出手者身上（hpAfter 仍是目标 HP，byHpAfter 是出手者 HP）。
export interface Strike { by: string; target: string; hit: boolean; crit: boolean; damage: number; hpAfter: number; byHpAfter?: number; proc?: boolean; backlash?: boolean }

export type BattleEvent =
  | { t: 'cross_time_group'; id: CrossTimeGroup['id']; name: string; turn: number; active: boolean; reason: string }
  | { t: 'move'; unit: string; path: Point[] }
  | { t: 'terrain'; unit: string; at: Point; terrain: Terrain }
  | { t: 'combat'; attacker: string; defender: string; weapons: [WeaponId, WeaponId | null]; strikes: Strike[]; forecast?: Forecast }
  | { t: 'defeated'; unit: string }
  | { t: 'shield'; unit: string }
  | { t: 'heal'; by: string | null; target: string; amount: number; hpAfter: number; source: 'staff' | 'item' | 'terrain' | 'art' }
  | { t: 'exp'; unit: string; gained: number; exp: number; level: number }
  | { t: 'levelUp'; unit: string; level: number; gains: Partial<Stats>; rerolls: number }
  | { t: 'wait'; unit: string }
  | { t: 'seize'; unit: string }
  | { t: 'dance'; unit: string; target: string }
  | { t: 'art'; unit: string; target: string; art: string }
  | { t: 'artState'; unit: string; effects: UnitState['artEffects'] }
  | { t: 'embers'; cells: BattleState['embers'] }
  | { t: 'cast'; unit: string; target: string; spell: string }
  // 状态杖／状态法术的命中判定：chance 为显示命中，landed 为是否生效。
  | { t: 'statusRoll'; unit: string; target: string; status: 'sleep' | 'silence' | 'root'; chance: number; landed: boolean }
  | { t: 'loot'; unit: string; boxes: number }
  | { t: 'drop'; unit: string; boxes: number; at: Point }
  | { t: 'escape'; unit: string }
  | { t: 'object'; object: string; by: string; state: BattleObjectState; hpAfter?: number }
  | { t: 'treasure'; unit: string; object: string; item: string; count: number }
  | { t: 'spawn'; unit: string; event: string; spawned: UnitState }
  | { t: 'scenario'; event: string; message: string }
  | { t: 'hazard'; unit: string; source: 'ballista' | 'status' | 'ember'; kind: 'damage' | 'petrified'; amount?: number; hpAfter: number }
  | { t: 'status'; unit: string; status: 'sleep' | 'silence' | 'berserk' | 'petrified' | 'regen'; active: boolean; turns?: number }
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
