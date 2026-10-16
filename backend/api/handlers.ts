import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { OP } from '../common/protocol/ops.ts';
import { EngineError } from '../common/engine/types.ts';
import type { Action, ActAction, BattleEvent, BattleState, Point, Side } from '../common/engine/types.ts';
import { actionOptions, expPreview, forecast, moveRange, step, threatMap, unitById } from '../common/engine/index.ts';
import { TERRAINS } from '../common/maps/map.ts';
import { WEAPONS } from '../common/data/weapons.ts';
import { CLASSES, CLASS_PATHS, classOpenYear, classPrice, initialClass, initialClassOf } from '../common/data/classes.ts';
import { CHARACTERS } from '../common/data/characters.ts';
import { GAME_ITEMS, isItemKey } from '../common/game/items.ts';
import type { ItemKey } from '../common/game/items.ts';
import { catalog } from '../common/game/catalog.ts';
import { ACTION_DAYS, DAYS_PER_YEAR, dateOf, encounterLevel, isArenaDay, nextArenaDay, nextMonthStart, REGIONS, regionById, regionLevel } from '../common/game/calendar.ts';
import { createFestivalBattle, createFieldBattle, FIELD_BATTLE, sparringRoster } from '../common/game/battles.ts';
import type { BattleRecord } from '../common/game/battles.ts';
import { addWeaponExp, ageDaysOf, createUnit, gainExperience, lifespanEndDayOf, promote, rankFromExp, ROSTER_LIMIT, toSnapshot, useDrug } from '../common/game/model.ts';
import type { UnitRecord } from '../common/game/model.ts';
import { PROMOTIONS } from '../common/data/promotions.ts';
import { settleAttack, startAttack } from '../common/game/arena.ts';
import type { ArenaDayRecord } from '../common/game/arena.ts';
import type { AttackPlan, Defense } from '../common/arena/rules.ts';
import { applyBans, opponentList, validateDefense } from '../common/arena/rules.ts';
import { ARENA_MAPS } from '../common/arena/maps.ts';
import { seedRng } from '../common/engine/rng.ts';
import { GROWTH_TYPE_NAMES, MAINLINE_YEARS, rollGrowthType, rollRecruitAge } from '../common/data/growth-types.ts';
import type { Store, Player } from './store.ts';
import { activeSnapshot, applyBattleOutcome, bindDefense, handleAnnualOutcome, handleRunOutcome, recordDeath, recordRetire, snapshotData, stateView, syncPlayer, unitDetail, unitSummary } from './services.ts';
import { canClaim, canReincarnate, claimLegacy, LEGACY_MIN_LEVEL, previewInheritance, reincarnate, totalStats } from '../common/game/legacy.ts';
import type { LegacyMode } from '../common/game/legacy.ts';
import { canStart, createOrder, describeOrder, FACILITIES, facilityById, mature, RECIPES, recipeById, slotsUsed } from '../common/game/production.ts';
import { createRun, DUNGEON_STAGE_DAYS, isActiveRun, runSummary, survivingIds } from '../common/game/expedition.ts';
import { annualIndexFor, annualSummary, annualWindowOpen, ANNUAL_QUALIFIER_MATCHES, ANNUAL_QUALIFIER_WINS, createAnnualEntry, nextFestivalRound } from '../common/game/annual.ts';
import { CHAPTER_BEXP, chapterAvailable, chapterOpenDay, STORY_CHAPTERS } from '../common/game/story.ts';

export class OpError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export interface Context {
  store: Store;
  player: Player;
  accountId: string;
  agentModel: string | null;
  push: (op: number, data: unknown) => void;
}

type Handler = (ctx: Context, data: Record<string, unknown>) => unknown;
type Json = Record<string, unknown>;

// 训练的金币花费：TRAIN 扣款与 GET_TODAY 展示共用。
const TRAIN_GOLD = 200;

const asString = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || value.length === 0) throw new OpError('BAD_REQUEST', `缺少字段 ${name}`);
  return value;
};
const asNumber = (value: unknown, name: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new OpError('BAD_REQUEST', `字段 ${name} 必须是数字`);
  return value;
};
const asPoint = (value: unknown, name: string): Point => {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(v => Number.isInteger(v))) {
    throw new OpError('BAD_REQUEST', `字段 ${name} 必须是 [x, y] 整数`);
  }
  return [value[0] as number, value[1] as number];
};

function requireUnit(store: Store, player: Player, unitId: string): UnitRecord {
  const unit = store.unit(player.id, unitId);
  if (!unit) throw new OpError('NOT_FOUND', `没有单位 ${unitId}`);
  return unit;
}

function requireBattle(ctx: Context, data: Json): BattleRecord {
  const id = typeof data.battleId === 'string' ? data.battleId : undefined;
  const record = id ? ctx.store.battle(ctx.player.id, id) : ctx.store.activeBattle(ctx.player.id);
  if (!record) throw new OpError('NOT_FOUND', id ? `没有战斗 ${id}` : '当前没有进行中的战斗');
  return record;
}

// ---- battle helpers ------------------------------------------------------

const PLAYER_GLYPHS = 'abcdefghijklmnopqrstuvwxyz';
const ENEMY_GLYPHS = '123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function asciiMap(state: BattleState): { w: number; h: number; ascii: string[]; legend: Record<string, string> } {
  const grid: string[][] = state.map.tiles.map(row => row.map(tile => TERRAINS[tile].glyph));
  const legend: Record<string, string> = Object.fromEntries(Object.values(TERRAINS).map(t => [t.glyph, t.name] as [string, string]));
  let pi = 0, ei = 0;
  for (const unit of state.units.filter(u => u.alive)) {
    const glyph = unit.side === 'player'
      ? (unit.acted ? PLAYER_GLYPHS[pi].toUpperCase() : PLAYER_GLYPHS[pi])
      : ENEMY_GLYPHS[ei];
    if (unit.side === 'player') pi++; else ei++;
    grid[unit.pos[1]][unit.pos[0]] = glyph;
  }
  legend['a-z'] = '己方（大写 = 已行动）';
  legend['1-9'] = '敌方';
  return { w: state.map.width, h: state.map.height, ascii: grid.map(row => row.join('')), legend };
}

function goalText(state: BattleState): string {
  if (state.goal.kind === 'boss') return `击败主将（${state.goal.target}）`;
  if (state.goal.kind === 'seize') return `压制王座 [${state.goal.throne.join(',')}]`;
  return '全灭敌军';
}

export function battleView(record: BattleRecord, detail: boolean, sinceEvent = 0) {
  const state = record.state;
  return {
    battleId: record.id,
    kind: record.kind,
    mode: record.mode,
    name: record.name,
    turn: state.turn,
    turnLimit: state.turnLimit,
    phase: state.phase,
    goal: goalText(state),
    result: state.result ?? null,
    map: asciiMap(state),
    units: state.units.filter(u => u.alive).map(u => detail ? fullUnit(u) : compactUnit(u)),
    events: record.events.slice(sinceEvent),
    eventCount: record.events.length,
  };
}

function compactUnit(u: BattleState['units'][number]) {
  return {
    id: u.id, name: u.name, side: u.side, class: CLASSES[u.classId].name, lv: u.level, pos: u.pos,
    hp: [u.hp, u.stats.hp], acted: u.acted, leader: !!u.boss, equip: u.weapons[0] ? WEAPONS[u.weapons[0]].name : null,
    items: u.items.map(i => `${GAME_ITEMS[i.id as ItemKey]?.name ?? i.id}(${i.uses})`),
  };
}

function fullUnit(u: BattleState['units'][number]) {
  return { ...compactUnit(u), stats: u.stats, con: u.con, weapons: u.weapons, ranks: u.ranks, skill: u.skill ?? null };
}

// 进行中的战斗不下发随机数状态或敌方 AI 行为 (docs/03「结束前隐藏种子」、docs/05「AI 行为不公开」)。
function publicState(state: BattleState): BattleState {
  const copy = structuredClone(state) as unknown as { rng?: unknown; growthRng?: unknown; units: { behavior?: unknown }[] };
  delete copy.rng;
  delete copy.growthRng;
  for (const unit of copy.units) delete unit.behavior;
  return copy as unknown as BattleState;
}

function applyAction(ctx: Context, record: BattleRecord, action: Action): { state: BattleState; events: BattleEvent[] } {
  let result: { state: BattleState; events: BattleEvent[] };
  try {
    result = step(record.state, action);
  } catch (error) {
    if (error instanceof EngineError) throw new OpError(error.code, error.message);
    throw error;
  }
  record.state = result.state;
  record.events.push(...result.events);
  record.actions.push(action);
  record.updatedAt = Date.now();
  ctx.store.saveBattle(record);
  if (result.state.result) finishBattle(ctx, record);
  else if (result.state.phase === 'player') ctx.push(OP.PHASE_STARTED, { battleId: record.id, turn: result.state.turn });
  ctx.push(OP.BATTLE_UPDATED, { battleId: record.id, turn: result.state.turn, events: result.events.length });
  return result;
}

function finishBattle(ctx: Context, record: BattleRecord): void {
  const rewards = applyBattleOutcome(ctx.store, ctx.player, record);
  const runOutcome = handleRunOutcome(ctx.store, ctx.player, record);
  const annualOutcome = handleAnnualOutcome(ctx.store, ctx.player, record);
  if (record.mode === 'arena' && record.opponentId && record.arenaDay !== undefined) {
    const day = ctx.store.arenaDay(ctx.player.id, record.arenaDay);
    if (day) {
      settleAttack(day, record.opponentId, record.state);
      ctx.store.saveArenaDay(day);
    }
  }
  ctx.store.addEvent(ctx.player.id, 'battle-end', `${record.name} 结束：${record.state.result?.winner === 'player' ? '胜利' : '失败'}。`, {
    battleId: record.id, deaths: rewards.deaths, gold: rewards.gold, runState: runOutcome?.run.state ?? null, annualState: annualOutcome?.entry.state ?? null,
  });
  ctx.push(OP.STATE_CHANGED, { reason: 'battle-end', battleId: record.id });
}

// ---- handlers ------------------------------------------------------------

const handlers: Record<number, Handler> = {
  [OP.GET_STATE]: ctx => stateView(ctx.store, ctx.player),

  [OP.GET_EVENTS]: (ctx, data) => {
    // 事件游标是十进制字符串（docs/13 §2.1）：可传 cursor 或旧的 sinceId。
    const since = typeof data.sinceId === 'number' ? data.sinceId : (typeof data.cursor === 'string' ? Number(data.cursor) : 0);
    const events = ctx.store.events(ctx.player.id, Number.isFinite(since) ? since : 0);
    const cursor = events.length > 0 ? String(events[events.length - 1].id) : String(since || 0);
    return { events, cursor };
  },

  [OP.GET_AGENT_INFO]: ctx => ({
    online: ctx.agentModel !== null,
    model: ctx.agentModel,
    plan: ctx.store.notes(ctx.player.id, 'plan')[0]?.text ?? null,
    dailyReport: ctx.store.notes(ctx.player.id, 'daily')[0]?.text ?? null,
  }),

  [OP.GET_ROSTER]: ctx => ({
    limit: ROSTER_LIMIT,
    count: ctx.store.units(ctx.player.id).filter(u => u.status === 'active').length,
    units: ctx.store.units(ctx.player.id).map(unitSummary),
  }),

  [OP.GET_UNIT]: (ctx, data) => unitDetail(requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'))),

  [OP.GET_INVENTORY]: ctx => ({
    inventory: ctx.store.inventory(ctx.player.id).map(row => ({ item: row.item, name: GAME_ITEMS[row.item].name, uses: row.uses, count: row.count })),
    units: ctx.store.units(ctx.player.id).map(u => ({ unit: u.id, items: u.items.map(i => ({ item: i.id, uses: i.uses })) })),
  }),

  [OP.GET_CATALOG]: () => catalog(),

  [OP.GET_TODAY]: ctx => {
    const cleared = ctx.player.flags.clearedRegions;
    const date = dateOf(ctx.player.day);
    const current = ctx.store.activeBattle(ctx.player.id);
    const fighting = !!current;
    const full = ctx.store.units(ctx.player.id).filter(u => u.status === 'active').length >= ROSTER_LIMIT;
    return {
      day: ctx.player.day,
      date,
      actions: [
        { key: 'sortie', name: '出击', costDays: ACTION_DAYS.sortie, available: !fighting, note: fighting ? '已有进行中的战斗，打完再出击' : '手动打一场野外战斗，经验与掉落最多',
          maxUnits: FIELD_BATTLE.maxUnits, turnLimit: FIELD_BATTLE.turnLimit, goalText: FIELD_BATTLE.goalText, lethal: true },
        { key: 'sweep', name: '扫荡', costDays: ACTION_DAYS.sweep, available: cleared.length > 0, note: cleared.length > 0 ? '自动结算已讨伐地区' : '先讨伐至少一个地区' },
        { key: 'train', name: '训练', costDays: ACTION_DAYS.train, costGold: TRAIN_GOLD, available: true, note: '补武器熟练度，暂不发等级经验' },
        { key: 'rest', name: '休整', costDays: 1, available: true, note: '自选日数推进日期' },
        { key: 'recruit', name: '游历招募', costDays: ACTION_DAYS.recruit, available: !full, note: full ? `名册已满（上限 ${ROSTER_LIMIT} 人）` : '只花行动日，按地区概率遇到新人' },
      ],
      sortieRegions: REGIONS.map(region => ({
        id: region.id, name: region.name, resource: region.resource,
        cleared: cleared.includes(region.id), level: regionLevel(cleared.length, region.offset),
      })),
      festival: { open: date.dayOfMonth >= 28 || ctx.player.flags.festivalRound > 0, round: ctx.player.flags.festivalRound, costDays: ACTION_DAYS.festivalMatch },
      nextArenaDay: nextArenaDay(ctx.player.day),
      nextMonthStart: nextMonthStart(ctx.player.day),
      // The unfinished battle, if any, so the camp can offer to resume it.
      battle: current ? { id: current.id, name: current.name, kind: current.kind, mode: current.mode, turn: current.state.turn, opponentId: current.opponentId ?? null } : null,
    };
  },

  [OP.SORTIE]: (ctx, data) => {
    if (ctx.store.activeBattle(ctx.player.id)) throw new OpError('BATTLE_IN_PROGRESS', '已有进行中的战斗');
    if (isActiveRun(ctx.store.activeRun(ctx.player.id))) throw new OpError('FORBIDDEN', '远征进行中，先打完或撤离');
    const region = asNumber(data.region, 'region');
    const ids = Array.isArray(data.unitIds) ? data.unitIds as string[] : [];
    const units = ids.length > 0
      ? ids.map(id => requireUnit(ctx.store, ctx.player, id))
      : ctx.store.units(ctx.player.id).filter(u => u.status === 'active').slice(0, 6);
    const ready = units.filter(u => u.status === 'active');
    if (ready.length === 0) throw new OpError('BAD_REQUEST', '没有可出战的单位');
    // 种子由服务器生成，不采用客户端提交的 seed，避免预选随机结果 (docs/03)。
    const seed = randomUUID().slice(0, 8);
    // 已通关地区使用首次通关时锁定的等级档，重打不追涨 (docs/00 §8.1.2)。
    const lockedLevel = ctx.player.flags.firstClearLevel?.[region];
    const record = createFieldBattle(ready, { region, cleared: ctx.player.flags.clearedRegions.length, seed, level: lockedLevel });
    record.playerId = ctx.player.id;
    ctx.player.day += ACTION_DAYS.sortie;
    syncPlayer(ctx.store, ctx.player);
    ctx.store.saveBattle(record);
    ctx.store.addEvent(ctx.player.id, 'sortie', `出征 ${regionById(region).name}，${ready.length} 人。`, { battleId: record.id });
    ctx.push(OP.PHASE_STARTED, { battleId: record.id, turn: 1 });
    return { battleId: record.id, battle: battleView(record, false), state: publicState(record.state) };
  },

  [OP.SWEEP]: (ctx, data) => {
    const region = asNumber(data.region, 'region');
    const times = Math.max(1, Math.min(10, typeof data.times === 'number' ? data.times : 1));
    if (!ctx.player.flags.clearedRegions.includes(region)) throw new OpError('BAD_REQUEST', '只能扫荡已讨伐地区');
    const material: ItemKey = region % 3 === 0 ? 'ore' : region % 3 === 1 ? 'herb' : 'wood';
    const perRun = 2 + Math.floor(regionLevel(ctx.player.flags.clearedRegions.length, regionById(region).offset) / 20);
    ctx.player.day += ACTION_DAYS.sweep * times;
    ctx.store.addInventory(ctx.player.id, material, 0, perRun * times);
    syncPlayer(ctx.store, ctx.player);
    ctx.store.addEvent(ctx.player.id, 'sweep', `扫荡 ${regionById(region).name} ${times} 次，获得 ${GAME_ITEMS[material].name} ×${perRun * times}。`, { region, times });
    ctx.push(OP.STATE_CHANGED, { reason: 'sweep' });
    return { days: ACTION_DAYS.sweep * times, items: [{ item: material, count: perRun * times }], day: ctx.player.day };
  },

  [OP.TRAIN]: (ctx, data) => {
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    if (unit.status !== 'active') throw new OpError('BAD_REQUEST', '该单位不在名册中');
    if (ctx.player.gold < TRAIN_GOLD) throw new OpError('NOT_ENOUGH_GOLD', `训练需要 ${TRAIN_GOLD} 金币`);
    ctx.player.gold -= TRAIN_GOLD;
    const type = typeof data.weaponType === 'string' ? data.weaponType : null;
    const weaponId = unit.weapons.find(w => WEAPONS[w].type === type) ?? unit.weapons[0];
    const weaponType = WEAPONS[weaponId].type;
    const before = unit.ranks[weaponType] ?? 'E';
    const rank = addWeaponExp(unit, weaponType, 10);
    ctx.player.day += ACTION_DAYS.train;
    ctx.store.saveUnit(unit, ctx.player.id);
    syncPlayer(ctx.store, ctx.player);
    ctx.push(OP.STATE_CHANGED, { reason: 'train' });
    return { unit: unit.id, weaponType, rankBefore: before, rankAfter: unit.ranks[weaponType] ?? 'E', rankUp: rank, day: ctx.player.day, gold: ctx.player.gold };
  },

  [OP.REST]: (ctx, data) => {
    const days = Math.max(1, Math.min(120, typeof data.days === 'number' ? data.days : 1));
    ctx.player.day += days;
    syncPlayer(ctx.store, ctx.player);
    ctx.push(OP.STATE_CHANGED, { reason: 'rest' });
    return { days, day: ctx.player.day, date: dateOf(ctx.player.day) };
  },

  [OP.RECRUIT]: (ctx, data) => {
    const region = asNumber(data.region, 'region');
    if (ctx.store.units(ctx.player.id).filter(u => u.status === 'active').length >= ROSTER_LIMIT) throw new OpError('BAD_REQUEST', '名册已满');
    const fails = ctx.player.flags.recruitFails ?? 0;
    const roll = seedRng(`recruit:${ctx.player.id}:${ctx.player.day}`)[0] % 100;
    const success = roll < 40 || fails >= 4;
    ctx.player.day += ACTION_DAYS.recruit;
    if (!success) {
      ctx.player.flags.recruitFails = fails + 1;
      syncPlayer(ctx.store, ctx.player);
      ctx.store.addEvent(ctx.player.id, 'recruit', `在 ${regionById(region).name} 游历未遇到新人（第 ${fails + 1} 次失败）。`, { region });
      return { success: false, fails: fails + 1, day: ctx.player.day };
    }
    ctx.player.flags.recruitFails = 0;
    const candidates = Object.keys(CHARACTERS) as (keyof typeof CHARACTERS)[];
    const owned = new Set(ctx.store.units(ctx.player.id).map(u => u.character));
    const pool = candidates.filter(c => !owned.has(c));
    const character = pool.length > 0 ? pool[roll % pool.length] : candidates[roll % candidates.length];
    const level = Math.max(1, regionLevel(ctx.player.flags.clearedRegions.length, regionById(region).offset) - 4);
    // 成长类型与年龄由招募决定（成长型 5%）；同一天的结果确定可复现。
    const traits = seedRng(`recruit-traits:${ctx.player.id}:${ctx.player.day}`);
    const growthType = rollGrowthType(traits[0] % 100);
    const remainingYears = Math.max(0, MAINLINE_YEARS - (dateOf(ctx.player.day).year - 1));
    const age = rollRecruitAge(growthType, remainingYears, traits[1]);
    const unit = createUnit(character, level, `u_${character}_${ctx.player.day}`, ctx.player.day, true, { growthType, age,
      classId: initialClass((Object.keys(CLASS_PATHS) as (keyof typeof CLASS_PATHS)[])[regionById(region).id - 1]) });
    ctx.store.addUnit(ctx.player.id, unit);
    syncPlayer(ctx.store, ctx.player);
    ctx.store.addEvent(ctx.player.id, 'recruit', `在 ${regionById(region).name} 遇到 ${CHARACTERS[character].name}（Lv${level}，${GROWTH_TYPE_NAMES[growthType]}，${age} 岁）。`, { unit: unit.id });
    ctx.push(OP.STATE_CHANGED, { reason: 'recruit' });
    return { success: true, unit: unitSummary(unit), day: ctx.player.day };
  },

  [OP.START_MAIN_STAGE]: ctx => {
    if (ctx.store.activeBattle(ctx.player.id)) throw new OpError('BATTLE_IN_PROGRESS', '已有进行中的战斗');
    const active = ctx.store.units(ctx.player.id).filter(u => u.status === 'active');
    if (active.length === 0) throw new OpError('BAD_REQUEST', '没有可出战的单位');
    const round = (ctx.player.flags.festivalRound ?? 0) + 1;
    const seed = randomUUID().slice(0, 8);
    const record = createFestivalBattle(active, round, seed);
    record.playerId = ctx.player.id;
    ctx.player.day += ACTION_DAYS.festivalMatch;
    syncPlayer(ctx.store, ctx.player);
    ctx.store.saveBattle(record);
    ctx.store.addEvent(ctx.player.id, 'festival', `大竞技场第 ${round} 轮开始。`, { battleId: record.id });
    ctx.push(OP.PHASE_STARTED, { battleId: record.id, turn: 1 });
    return { battleId: record.id, round, battle: battleView(record, false) };
  },

  [OP.SKIP_MAIN_STAGE]: ctx => {
    ctx.player.day = nextMonthStart(ctx.player.day);
    syncPlayer(ctx.store, ctx.player);
    ctx.push(OP.MONTH_STARTED, { day: ctx.player.day, date: dateOf(ctx.player.day) });
    return { day: ctx.player.day, date: dateOf(ctx.player.day) };
  },

  [OP.GET_SHOP]: ctx => ({
    season: dateOf(ctx.player.day).season,
    items: ctx.store.shop(ctx.player.id).map(row => ({ item: row.item, name: GAME_ITEMS[row.item].name, price: GAME_ITEMS[row.item].price, stock: row.stock, kind: GAME_ITEMS[row.item].kind })),
  }),

  [OP.BUY]: (ctx, data) => {
    const item = asString(data.item, 'item');
    const count = Math.max(1, Math.min(10, typeof data.count === 'number' ? data.count : 1));
    if (!isItemKey(item)) throw new OpError('NOT_FOUND', `没有商品 ${item}`);
    const stockRow = ctx.store.shop(ctx.player.id).find(s => s.item === item);
    if (!stockRow || stockRow.stock < count) throw new OpError('BAD_REQUEST', '库存不足');
    const price = GAME_ITEMS[item].price * count;
    if (ctx.player.gold < price) throw new OpError('NOT_ENOUGH_GOLD', `需要 ${price} 金币`);
    ctx.player.gold -= price;
    ctx.store.setShopStock(ctx.player.id, item, stockRow.stock - count);
    ctx.store.addInventory(ctx.player.id, item, GAME_ITEMS[item].uses ?? 0, count);
    ctx.store.savePlayer(ctx.player);
    ctx.push(OP.STATE_CHANGED, { reason: 'buy' });
    return { item, count, price, gold: ctx.player.gold };
  },

  [OP.SELL]: (ctx, data) => {
    const item = asString(data.item, 'item');
    const count = Math.max(1, typeof data.count === 'number' ? data.count : 1);
    if (!isItemKey(item)) throw new OpError('NOT_FOUND', `没有物品 ${item}`);
    const taken = ctx.store.takeInventory(ctx.player.id, item, count);
    if (taken === 0) throw new OpError('NO_SUCH_ITEM', '仓库里没有这件物品');
    const gain = Math.floor(GAME_ITEMS[item].price / 2) * taken;
    ctx.player.gold += gain;
    ctx.store.savePlayer(ctx.player);
    ctx.push(OP.STATE_CHANGED, { reason: 'sell' });
    return { item, count: taken, gold: ctx.player.gold, gained: gain };
  },

  [OP.TRANSFER_ITEM]: (ctx, data) => {
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    const item = asString(data.item, 'item');
    const action = asString(data.action, 'action');
    if (!isItemKey(item)) throw new OpError('NOT_FOUND', `没有物品 ${item}`);
    const isWeapon = GAME_ITEMS[item].kind === 'weapon';
    if (action === 'equip') {
      if (!unit.weapons.includes(item as never)) throw new OpError('BAD_REQUEST', '该单位没有携带这件武器');
      unit.weapons = [item as never, ...unit.weapons.filter(w => w !== item)];
    } else if (action === 'toUnit') {
      if (unit.status !== 'active') throw new OpError('BAD_REQUEST', '该单位不在现役名册');
      if (isWeapon) {
        if (unit.weapons.length >= 5) throw new OpError('BAD_REQUEST', '武器携带栏已满');
        if (ctx.store.takeInventory(ctx.player.id, item, 1) === 0) throw new OpError('NO_SUCH_ITEM', '仓库里没有这件武器');
        unit.weapons.push(item as never);
      } else {
        // 只有武器和战斗道具能带进战斗；材料、转职印、能力药留在仓库 (docs/00 §6「材料不占战斗携带栏」)。
        if (GAME_ITEMS[item].kind !== 'consumable') throw new OpError('BAD_REQUEST', `${GAME_ITEMS[item].name}不能带进战斗`);
        if (unit.items.length >= 5) throw new OpError('BAD_REQUEST', '携带栏已满');
        const uses = ctx.store.takeStack(ctx.player.id, item, typeof data.uses === 'number' ? data.uses : null);
        if (uses === null) throw new OpError('NO_SUCH_ITEM', '仓库里没有这件物品');
        unit.items.push({ id: item as never, uses });
      }
    } else if (action === 'toWarehouse') {
      if (isWeapon) {
        const index = unit.weapons.indexOf(item as never);
        if (index < 0) throw new OpError('NO_SUCH_ITEM', '该单位没有携带这件武器');
        unit.weapons.splice(index, 1);
        ctx.store.addInventory(ctx.player.id, item, 0, 1);
      } else {
        const index = unit.items.findIndex(i => i.id === item);
        if (index < 0) throw new OpError('NO_SUCH_ITEM', '该单位没有这件物品');
        const [stack] = unit.items.splice(index, 1);
        // 剩余次数随物品回仓库，不会变回满的。
        ctx.store.addInventory(ctx.player.id, item, stack.uses, 1);
      }
    } else {
      throw new OpError('BAD_REQUEST', 'action 只能是 equip / toUnit / toWarehouse');
    }
    ctx.store.saveUnit(unit, ctx.player.id);
    ctx.push(OP.STATE_CHANGED, { reason: 'transfer' });
    return unitDetail(unit);
  },

  [OP.USE_ITEM]: (ctx, data) => {
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    const item = asString(data.item, 'item');
    if (!isItemKey(item)) throw new OpError('NOT_FOUND', `没有物品 ${item}`);
    if (GAME_ITEMS[item].kind === 'stat') {
      if (unit.status !== 'active') throw new OpError('BAD_REQUEST', '该单位不在现役名册');
      if (ctx.store.countInventory(ctx.player.id, item) === 0) throw new OpError('NO_SUCH_ITEM', '仓库里没有这件物品');
      let result: ReturnType<typeof useDrug>;
      try {
        result = useDrug(unit, item);
      } catch (error) {
        // 额度用满或属性已到上限：不扣道具 (docs/00 §9「溢出使用应拦截」)。
        throw new OpError('FORBIDDEN', error instanceof Error ? error.message : String(error));
      }
      ctx.store.takeInventory(ctx.player.id, item, 1);
      ctx.store.saveUnit(unit, ctx.player.id);
      ctx.push(OP.STATE_CHANGED, { reason: 'use-item' });
      return { unit: unit.id, stat: result.stat, amount: result.amount, stats: unit.stats, drugCounts: unit.drugCounts };
    }
    throw new OpError('BAD_REQUEST', '这件物品不能这样使用');
  },

  [OP.PROMOTE]: (ctx, data) => {
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    const name = asString(data.promotion, 'promotion');
    if (ctx.store.activeBattle(ctx.player.id)) throw new OpError('BATTLE_IN_PROGRESS', '战斗结束后才能转职');
    const promotion = PROMOTIONS.find(p => p.from === unit.classId && (p.name === name || p.to === name));
    if (!promotion) throw new OpError('NOT_FOUND', `当前职业没有转职方向 ${name}`);
    if (unit.status !== 'active') throw new OpError('BAD_REQUEST', '该单位不在现役名册');
    promote(unit, promotion);
    ctx.store.saveUnit(unit, ctx.player.id);
    ctx.store.addEvent(ctx.player.id, 'promote', `${CHARACTERS[unit.character].name} 转职为 ${promotion.name}。`, { unit: unit.id });
    ctx.push(OP.STATE_CHANGED, { reason: 'promote' });
    return unitDetail(unit);
  },

  [OP.ASSIGN_BEXP]: (ctx, data) => {
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    const amount = Math.max(1, Math.min(ctx.player.bexp, asNumber(data.amount, 'amount')));
    if (ctx.player.bexp < amount) throw new OpError('BAD_REQUEST', '公共经验不足');
    if (unit.status !== 'active') throw new OpError('BAD_REQUEST', '该单位不在现役名册');
    // 满级时经验不再累积；先拦下，免得公共经验被白白扣掉。
    if (unit.level >= CLASSES[unit.classId].maxLevel) throw new OpError('FORBIDDEN', '已满级，不能再分配经验');
    ctx.player.bexp -= amount;
    const ups = gainExperience(unit, amount, seedRng(`bexp:${unit.id}:${ctx.player.day}:${amount}`));
    ctx.store.saveUnit(unit, ctx.player.id);
    ctx.store.savePlayer(ctx.player);
    ctx.push(OP.STATE_CHANGED, { reason: 'bexp' });
    return { unit: unit.id, amount, level: unit.level, exp: unit.exp, levelUps: ups, bexp: ctx.player.bexp };
  },

  [OP.DISMISS]: (ctx, data) => {
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    if (unit.character === ctx.player.protagonist) throw new OpError('FORBIDDEN', '不能解雇主角');
    ctx.store.removeUnit(ctx.player.id, unit.id);
    ctx.store.addEvent(ctx.player.id, 'dismiss', `${CHARACTERS[unit.character].name} 离开了军团。`, { unit: unit.id });
    ctx.push(OP.STATE_CHANGED, { reason: 'dismiss' });
    return { unit: unit.id, removed: true };
  },

  // ---- permanent legion: legacies, retirement, reincarnation (docs/00 §5、§7) ----

  [OP.GET_LEGACIES]: ctx => {
    const units = ctx.store.units(ctx.player.id);
    return {
      minLevel: LEGACY_MIN_LEVEL,
      legacies: ctx.store.legacies(ctx.player.id).map(legacy => {
        const recipient = legacy.recipientUnitId ? units.find(u => u.id === legacy.recipientUnitId) : undefined;
        return {
          id: legacy.id, sourceUnitId: legacy.sourceUnitId, sourceName: legacy.sourceName,
          cause: legacy.cause, sourceLevel: legacy.sourceLevel, sourceTotal: totalStats(legacy.sourceStats),
          sourceStats: legacy.sourceStats, sourceGrowth: legacy.sourceGrowth,
          state: legacy.state, mode: legacy.mode, recipientUnitId: legacy.recipientUnitId,
          recipientName: recipient ? CHARACTERS[recipient.character].name : null,
        };
      }),
    };
  },

  [OP.CLAIM_LEGACY]: (ctx, data) => {
    const legacy = ctx.store.legacy(ctx.player.id, asString(data.legacyId, 'legacyId'));
    if (!legacy) throw new OpError('NOT_FOUND', '没有这份遗产');
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    const mode = asString(data.mode, 'mode') as LegacyMode;
    if (mode !== 'growth' && mode !== 'numeric') throw new OpError('BAD_REQUEST', 'mode 取 growth / numeric');
    const problem = canClaim(legacy, unit);
    if (problem) throw new OpError('FORBIDDEN', problem);
    const stone = mode === 'growth' ? 'legacy_stone_growth' : 'legacy_stone_numeric';
    if (ctx.store.countInventory(ctx.player.id, stone) < 1) throw new OpError('NO_SUCH_ITEM', `需要一枚${GAME_ITEMS[stone].name}`);
    const preview = previewInheritance(legacy, unit);
    const weights = (data.weights && typeof data.weights === 'object' ? data.weights : {}) as Record<string, number>;
    ctx.store.takeInventory(ctx.player.id, stone, 1);
    claimLegacy(legacy, unit, mode, weights);
    ctx.store.saveLegacy(legacy);
    ctx.store.saveUnit(unit, ctx.player.id);
    ctx.store.addEvent(ctx.player.id, 'legacy', `${CHARACTERS[unit.character].name} 以${mode === 'growth' ? '成长' : '数值'}传承兑现了 ${legacy.sourceName} 的遗产。`, { unit: unit.id, legacy: legacy.id, mode });
    ctx.push(OP.STATE_CHANGED, { reason: 'legacy' });
    return { legacy: { id: legacy.id, state: legacy.state, mode: legacy.mode, recipientUnitId: legacy.recipientUnitId }, unit: unitDetail(unit), preview };
  },

  [OP.RETIRE_UNIT]: (ctx, data) => {
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    if (unit.character === ctx.player.protagonist) throw new OpError('FORBIDDEN', '主角不能退役');
    if (unit.status !== 'active') throw new OpError('BAD_REQUEST', '该单位不在现役名册');
    const legacyId = recordRetire(ctx.store, ctx.player, unit);
    ctx.push(OP.STATE_CHANGED, { reason: 'retire' });
    return { unit: unit.id, status: unit.status, legacyId };
  },

  [OP.REINCARNATE_UNIT]: (ctx, data) => {
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    const problem = canReincarnate(unit);
    if (problem) throw new OpError('FORBIDDEN', problem);
    if (ctx.store.countInventory(ctx.player.id, 'reincarnation_core') < 1) throw new OpError('NO_SUCH_ITEM', '需要一枚轮回核心');
    const cost = 5000;
    if (ctx.player.gold < cost) throw new OpError('NOT_ENOUGH_GOLD', `轮回需要 ${cost} 金币`);
    const allocation = (data.allocation && typeof data.allocation === 'object' ? data.allocation : {}) as Record<string, number>;
    const initial = initialClassOf(CHARACTERS[unit.character].classId);
    let result: ReturnType<typeof reincarnate>;
    try {
      result = reincarnate(unit, allocation as never, initial, DAYS_PER_YEAR, ctx.player.day);
    } catch (error) {
      throw new OpError('FORBIDDEN', error instanceof Error ? error.message : String(error));
    }
    ctx.store.takeInventory(ctx.player.id, 'reincarnation_core', 1);
    ctx.player.gold -= cost;
    ctx.store.saveUnit(unit, ctx.player.id);
    ctx.store.saveReincarnation(ctx.player.id, unit.id, result.record);
    ctx.store.savePlayer(ctx.player);
    ctx.store.addEvent(ctx.player.id, 'reincarnate', `${CHARACTERS[unit.character].name} 完成轮回，回到 ${CLASSES[initial].name} 与 16 岁。`, { unit: unit.id });
    ctx.push(OP.STATE_CHANGED, { reason: 'reincarnate' });
    return { unit: unitDetail(unit), allocation: result.allocation, baseStats: result.baseStats };
  },

  [OP.GET_MEMORIAL]: ctx => ({
    memorials: ctx.store.memorials(ctx.player.id).map(row => row.data),
  }),

  [OP.EMERGENCY_RECRUIT]: ctx => {
    const units = ctx.store.units(ctx.player.id);
    const active = units.filter(u => u.status === 'active');
    const deaths = ctx.store.memorials(ctx.player.id).filter(m => m.data.cause === 'death').length;
    const claimedFor = ctx.player.flags.emergencyClaimed ?? 0;
    if (deaths < 3) throw new OpError('FORBIDDEN', '尚未达到严重损失（累计战死 3 人）');
    if (deaths <= claimedFor) throw new OpError('FORBIDDEN', '本次损失已经领取过免费补员');
    const room = ROSTER_LIMIT - active.length;
    if (room < 2) throw new OpError('FORBIDDEN', `名册空间不足（还差 ${2 - room} 个位置）`);
    const owned = new Set(units.map(u => u.character));
    const pool = (Object.keys(CHARACTERS) as (keyof typeof CHARACTERS)[]).filter(c => !owned.has(c));
    const picks = pool.length >= 2 ? pool : (Object.keys(CHARACTERS) as (keyof typeof CHARACTERS)[]);
    const rng = seedRng(`emergency:${ctx.player.id}:${deaths}`);
    const created = [];
    for (let i = 0; i < 2; i++) {
      const character = picks[(rng[i] ?? i) % picks.length];
      const level = Math.max(1, regionLevel(ctx.player.flags.clearedRegions.length, 0) - 4);
      const traits = seedRng(`emergency-traits:${ctx.player.id}:${deaths}:${i}`);
      const growthType = rollGrowthType(traits[0] % 100);
      const remainingYears = Math.max(0, MAINLINE_YEARS - (dateOf(ctx.player.day).year - 1));
      const age = rollRecruitAge(growthType, remainingYears, traits[1]);
      const unit = createUnit(character, level, `u_${character}_e${ctx.player.day}_${i}`, ctx.player.day, true, { growthType, age });
      ctx.store.addUnit(ctx.player.id, unit);
      created.push(unitSummary(unit));
    }
    ctx.player.flags.emergencyClaimed = deaths;
    ctx.store.savePlayer(ctx.player);
    ctx.store.addEvent(ctx.player.id, 'recruit', `严重损失补员：酒馆免费加入 ${created.length} 人。`, { units: created.map(u => u.id) });
    ctx.push(OP.STATE_CHANGED, { reason: 'emergency-recruit' });
    return { units: created, free: true };
  },

  [OP.GET_CLASS_MARKET]: (ctx, data) => {
    const year = dateOf(ctx.player.day).year;
    const unit = typeof data.unitId === 'string' ? ctx.store.unit(ctx.player.id, data.unitId) : null;
    return {
      year,
      classes: (Object.keys(CLASSES) as (keyof typeof CLASSES)[]).map(id => ({
        id, name: CLASSES[id].name, stage: CLASSES[id].stage, route: CLASSES[id].route,
        openYear: classOpenYear(id), open: year >= classOpenYear(id), price: classPrice(id),
        owned: !!unit?.classQualifications?.includes(id),
      })),
    };
  },

  [OP.BUY_CLASS_QUALIFICATION]: (ctx, data) => {
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    const classId = asString(data.classId, 'classId') as keyof typeof CLASSES;
    if (!CLASSES[classId]) throw new OpError('NOT_FOUND', `没有职业 ${classId}`);
    if (unit.status !== 'active') throw new OpError('BAD_REQUEST', '该单位不在现役名册');
    if (ctx.store.activeBattle(ctx.player.id)) throw new OpError('BATTLE_IN_PROGRESS', '战斗结束后才能购买资格');
    if (unit.lockedRunId) throw new OpError('FORBIDDEN', '远征中的角色不能购买资格');
    const year = dateOf(ctx.player.day).year;
    if (year < classOpenYear(classId)) throw new OpError('FORBIDDEN', `${CLASSES[classId].name} 要到第 ${classOpenYear(classId)} 年才开放`);
    const route = CLASSES[classId].route;
    const required = route === 'beast' ? 'beast' : route === 'dragon' ? 'dragon' : 'human';
    if (unit.isProtagonist && required !== 'human') throw new OpError('FORBIDDEN', '主角不能购买兽／龙职业资格');
    if (unit.species !== required) throw new OpError('FORBIDDEN', `${CLASSES[classId].name} 需要 ${required === 'beast' ? '兽' : required === 'dragon' ? '龙' : '人类'}种族`);
    if (unit.classQualifications?.includes(classId)) throw new OpError('FORBIDDEN', '已经拥有该职业资格');
    const price = classPrice(classId);
    if (ctx.player.gold < price) throw new OpError('NOT_ENOUGH_GOLD', `购买 ${CLASSES[classId].name} 需要 ${price} 金币`);
    ctx.player.gold -= price;
    unit.classQualifications = [...(unit.classQualifications ?? []), classId];
    ctx.store.saveUnit(unit, ctx.player.id);
    ctx.store.savePlayer(ctx.player);
    ctx.store.addEvent(ctx.player.id, 'class-market', `${CHARACTERS[unit.character].name} 购买职业资格 ${CLASSES[classId].name}（${price} 金币）。`, { unit: unit.id, classId });
    ctx.push(OP.STATE_CHANGED, { reason: 'class-market' });
    return { unit: unit.id, classId, price, gold: ctx.player.gold, qualifications: unit.classQualifications };
  },

  // ---- dungeon runs (docs/00 §8.1.3, docs/13 §4.3) ---------------------

  [OP.GET_RUN]: ctx => {
    const run = ctx.store.activeRun(ctx.player.id) ?? ctx.store.latestRun(ctx.player.id);
    return { run: run ? runSummary(run) : null };
  },

  [OP.START_DUNGEON]: (ctx, data) => {
    if (ctx.store.activeBattle(ctx.player.id)) throw new OpError('BATTLE_IN_PROGRESS', '已有进行中的战斗');
    if (isActiveRun(ctx.store.activeRun(ctx.player.id))) throw new OpError('FORBIDDEN', '已有进行中的远征');
    const region = asNumber(data.region, 'region');
    const ids = Array.isArray(data.unitIds) ? data.unitIds as string[] : [];
    const units = ids.length > 0
      ? ids.map(id => requireUnit(ctx.store, ctx.player, id))
      : ctx.store.units(ctx.player.id).filter(u => u.status === 'active').slice(0, 6);
    const ready = units.filter(u => u.status === 'active' && !u.lockedRunId);
    if (ready.length === 0) throw new OpError('BAD_REQUEST', '没有可出战的单位');
    // 出发时锁定等级、名单与物品；只有实际创建 run 才锁配置（docs/13 §4.4）。
    const level = regionLevel(ctx.player.flags.clearedRegions.length, regionById(region).offset);
    const run = createRun(`run-${randomUUID().slice(0, 8)}`, ctx.player.id, region, ready.map(u => u.id), level, ctx.player.flags.clearedRegions.length);
    for (const unit of ready) { unit.lockedRunId = run.id; ctx.store.saveUnit(unit, ctx.player.id); }
    ctx.player.day += DUNGEON_STAGE_DAYS;
    syncPlayer(ctx.store, ctx.player);
    const seed = randomUUID().slice(0, 8);
    const record = createFieldBattle(ready, { region, cleared: run.clearedAtStart, seed, level, stageIndex: 0, runId: run.id });
    record.playerId = ctx.player.id;
    run.battleId = record.id;
    ctx.store.saveRun(run);
    ctx.store.saveBattle(record);
    ctx.store.addEvent(ctx.player.id, 'dungeon', `进入 ${regionById(region).name} 大副本（第 1 图）。`, { runId: run.id });
    ctx.push(OP.PHASE_STARTED, { battleId: record.id, turn: 1 });
    return { run: runSummary(run), battleId: record.id, battle: battleView(record, false) };
  },

  [OP.CONTINUE_DUNGEON]: ctx => {
    if (ctx.store.activeBattle(ctx.player.id)) throw new OpError('BATTLE_IN_PROGRESS', '已有进行中的战斗');
    const run = ctx.store.activeRun(ctx.player.id);
    if (!run || run.state !== 'between_maps') throw new OpError('NOT_FOUND', '没有等待继续的远征');
    // 下一张只能使用原名单中仍存活、未离队的角色（docs/00 §8.1.3）。
    const units = survivingIds(run.carry).map(id => ctx.store.unit(ctx.player.id, id)).filter((u): u is NonNullable<typeof u> => !!u && u.status === 'active');
    if (units.length === 0) throw new OpError('FORBIDDEN', '没有存活的队员，只能撤离');
    ctx.player.day += DUNGEON_STAGE_DAYS;
    syncPlayer(ctx.store, ctx.player);
    const seed = randomUUID().slice(0, 8);
    const record = createFieldBattle(units, { region: run.region, cleared: run.clearedAtStart, seed, level: run.level, stageIndex: run.stageIndex, runId: run.id, carry: run.carry });
    record.playerId = ctx.player.id;
    run.state = 'battle';
    run.battleId = record.id;
    ctx.store.saveRun(run);
    ctx.store.saveBattle(record);
    ctx.store.addEvent(ctx.player.id, 'dungeon', `${regionById(run.region).name} 大副本第 ${run.stageIndex + 1} 图开始。`, { runId: run.id });
    ctx.push(OP.PHASE_STARTED, { battleId: record.id, turn: 1 });
    return { run: runSummary(run), battleId: record.id, battle: battleView(record, false) };
  },

  [OP.WITHDRAW_RUN]: ctx => {
    const run = ctx.store.activeRun(ctx.player.id);
    if (!run) throw new OpError('NOT_FOUND', '没有进行中的远征');
    if (ctx.store.activeBattle(ctx.player.id)) throw new OpError('FORBIDDEN', '战斗中请先用 RETREAT 撤离');
    run.state = 'withdrawn';
    for (const id of run.unitIds) {
      const unit = ctx.store.unit(ctx.player.id, id);
      if (unit?.lockedRunId === run.id) { unit.lockedRunId = null; ctx.store.saveUnit(unit, ctx.player.id); }
    }
    ctx.store.saveRun(run);
    ctx.store.addEvent(ctx.player.id, 'dungeon', '撤离大副本，未带回的掉落作废。', { runId: run.id });
    return { run: runSummary(run) };
  },

  // ---- production (docs/00 §9.2, docs/13 §2.3) -------------------------

  [OP.GET_PRODUCTION]: ctx => {
    const orders = ctx.store.productionOrders(ctx.player.id).map(o => mature(o, ctx.player.day));
    for (const order of orders) ctx.store.saveProductionOrder(order);
    const open = orders.filter(o => o.state !== 'collected');
    return {
      day: ctx.player.day,
      facilities: FACILITIES.map(f => ({ ...f, used: slotsUsed(open, f.id) })),
      recipes: RECIPES.map(r => ({ id: r.id, name: r.name, facility: r.facility, days: r.days, input: r.input, output: r.output, kind: r.kind })),
      orders: open.map(o => ({ id: o.id, ...describeOrder(o), startedDay: o.startedDay, quality: o.quality })),
      ready: open.filter(o => o.state === 'ready').map(o => o.id),
    };
  },

  [OP.PLANT]: ctx => {
    const recipe = recipeById('plant_herb')!;
    if (!canStart(ctx.store.productionOrders(ctx.player.id), recipe)) throw new OpError('FORBIDDEN', '药草田工位已满');
    if (ctx.store.countInventory(ctx.player.id, 'seed') < 1) throw new OpError('NO_SUCH_ITEM', '没有种子');
    ctx.store.takeInventory(ctx.player.id, 'seed', 1);
    // 播种消耗种子并推进 1 日（docs/00 §9.2）。
    ctx.player.day += 1;
    const order = createOrder(`po-${randomUUID().slice(0, 8)}`, ctx.player.id, recipe, ctx.player.day);
    ctx.store.saveProductionOrder(order);
    syncPlayer(ctx.store, ctx.player);
    ctx.push(OP.STATE_CHANGED, { reason: 'plant' });
    return { order: { id: order.id, ...describeOrder(order) }, day: ctx.player.day };
  },

  [OP.START_PRODUCTION]: (ctx, data) => {
    const recipe = recipeById(asString(data.recipeId, 'recipeId'));
    if (!recipe) throw new OpError('NOT_FOUND', '没有这个配方');
    if (!canStart(ctx.store.productionOrders(ctx.player.id), recipe)) throw new OpError('FORBIDDEN', `${facilityById(recipe.facility).name}工位已满`);
    for (const input of recipe.input) {
      if (ctx.store.countInventory(ctx.player.id, input.item) < input.count) throw new OpError('NO_SUCH_ITEM', `缺少${GAME_ITEMS[input.item].name}`);
    }
    // 开工先扣输入、消耗开工日，ready_day = 开工动作结束日 + duration（docs/13 §3.3）。
    for (const input of recipe.input) ctx.store.takeInventory(ctx.player.id, input.item, input.count);
    const order = createOrder(`po-${randomUUID().slice(0, 8)}`, ctx.player.id, recipe, ctx.player.day);
    ctx.store.saveProductionOrder(order);
    ctx.push(OP.STATE_CHANGED, { reason: 'production' });
    return { order: { id: order.id, ...describeOrder(order) }, day: ctx.player.day };
  },

  [OP.COLLECT_PRODUCTION]: (ctx, data) => {
    const order = ctx.store.productionOrder(ctx.player.id, asString(data.orderId, 'orderId'));
    if (!order) throw new OpError('NOT_FOUND', '没有这个订单');
    if (order.state === 'collected') throw new OpError('FORBIDDEN', '这个订单已经领取过');
    mature(order, ctx.player.day);
    if (order.state !== 'ready') throw new OpError('FORBIDDEN', `还要等到第 ${order.readyDay} 日`);
    // 领取不额外推进日期；产出在开工时固定，不能重抽（docs/13 §2.3）。
    ctx.store.addInventory(ctx.player.id, order.output.item, GAME_ITEMS[order.output.item].uses ?? 0, order.output.count);
    order.state = 'collected';
    ctx.store.saveProductionOrder(order);
    ctx.push(OP.STATE_CHANGED, { reason: 'collect' });
    return { orderId: order.id, item: order.output.item, count: order.output.count };
  },

  [OP.REPAIR_ITEM]: () => {
    // 耐久与完美锻造仍是候选（docs/00 §9.2.1、docs/13 §7），首版 features.refinement.enabled=false，
    // 不提供可以凭空多发耐久的接口。
    throw new OpError('FEATURE_DISABLED', '耐久与维修尚未启用：规则版本未开启 features.durability');
  },

  // ---- battle ops --------------------------------------------------------

  [OP.GET_BATTLE]: (ctx, data) => {
    const record = requireBattle(ctx, data);
    const view = battleView(record, data.detail === true, typeof data.sinceEvent === 'number' ? data.sinceEvent : 0);
    // `full` returns the raw engine state so a browser can resume animation exactly (docs/06).
    return data.full === true ? { ...view, state: publicState(record.state) } : view;
  },

  [OP.GET_REACHABLE]: (ctx, data) => {
    const record = requireBattle(ctx, data);
    const unit = unitById(record.state, asString(data.unitId, 'unitId'));
    if (unit.side !== record.state.phase) throw new OpError('NOT_YOUR_PHASE', '当前不是该单位的阶段');
    const range = moveRange(record.state, unit);
    const stops = [...range.stops].map(key => {
      const pos: Point = [key % record.state.map.width, Math.floor(key / record.state.map.width)];
      const options = actionOptions(record.state, unit, pos);
      return {
        pos, cost: range.cost.get(key) ?? 0,
        attackable: options.attack.flatMap(o => o.targets.map(t => ({ target: t.id, weapon: o.weapon }))),
        healable: options.heal.flatMap(o => o.targets.map(t => ({ target: t.id, weapon: o.weapon }))),
        seize: options.seize,
      };
    });
    return { unit: unit.id, origin: unit.pos, stops };
  },

  [OP.PREVIEW_COMBAT]: (ctx, data) => {
    const record = requireBattle(ctx, data);
    const attacker = asString(data.attackerId, 'attackerId');
    const from = asPoint(data.from, 'from');
    const weapon = asString(data.weapon, 'weapon') as never;
    const target = asString(data.targetId, 'targetId');
    const f = forecast(record.state, attacker, from, weapon, target);
    const attackerUnit = unitById(record.state, attacker), defenderUnit = unitById(record.state, target);
    return {
      attacker: f.attacker, defender: f.defender, order: f.order,
      defenderDies: f.defenderDies, attackerDies: f.attackerDies,
      expectedDealt: f.expectedDealt, expectedTaken: f.expectedTaken,
      exp: record.kind === 'field' ? expPreview(attackerUnit, defenderUnit) : null,
    };
  },

  [OP.GET_THREAT_MAP]: (ctx, data) => {
    const record = requireBattle(ctx, data);
    const side: Side = data.side === 'player' ? 'player' : 'enemy';
    const threat = threatMap(record.state, side);
    return {
      side,
      cells: [...threat.entries()].map(([key, count]) => ({ pos: [key % record.state.map.width, Math.floor(key / record.state.map.width)], count })),
    };
  },

  [OP.UNIT_ACT]: (ctx, data) => {
    const record = requireBattle(ctx, data);
    const unit = asString(data.unitId, 'unitId');
    const to = asPoint(data.moveTo, 'moveTo');
    const act = asString(data.action, 'action');
    let action: ActAction;
    if (act === 'attack') action = { type: 'act', unit, to, act: 'attack', target: asString(data.targetId, 'targetId'), weapon: asString(data.weapon, 'weapon') as never };
    else if (act === 'heal') action = { type: 'act', unit, to, act: 'heal', target: asString(data.targetId, 'targetId'), weapon: asString(data.weapon, 'weapon') as never };
    else if (act === 'item') action = { type: 'act', unit, to, act: 'item', item: asNumber(data.item, 'item') };
    else if (act === 'seize') action = { type: 'act', unit, to, act: 'seize' };
    else if (act === 'wait') action = { type: 'act', unit, to, act: 'wait' };
    else throw new OpError('BAD_REQUEST', 'action 取 attack / heal / item / seize / wait');
    const { state, events } = applyAction(ctx, record, action);
    return { battleId: record.id, result: state.result ?? null, events, state: publicState(state), battle: battleView(record, false, record.events.length - events.length) };
  },

  [OP.END_PHASE]: ctx => {
    const record = requireBattle(ctx, {});
    const { state, events } = applyAction(ctx, record, { type: 'endPhase' });
    return { battleId: record.id, result: state.result ?? null, events, state: publicState(state), battle: battleView(record, false, record.events.length - events.length) };
  },

  [OP.RETREAT]: ctx => {
    const record = requireBattle(ctx, {});
    const { state } = applyAction(ctx, record, { type: 'retreat' });
    return { battleId: record.id, result: state.result, state: publicState(state) };
  },

  [OP.GET_BATTLE_LOG]: (ctx, data) => {
    const record = requireBattle(ctx, data);
    return { battleId: record.id, events: record.events, actions: record.actions };
  },

  // ---- arena -------------------------------------------------------------

  [OP.GET_ARENA]: ctx => {
    const player = ctx.player;
    const day = isArenaDay(player.day) ? player.day : null;
    const record = day !== null ? ctx.store.arenaDay(player.id, day) : ctx.store.latestArenaDay(player.id);
    return {
      season: dateOf(player.day).season,
      points: player.arenaPoints,
      medals: player.arenaMedals,
      registered: player.registered,
      isArenaDay: isArenaDay(player.day),
      nextArenaDay: nextArenaDay(player.day),
      day: record?.day ?? null,
      settled: record?.settled ?? false,
      progress: record ? arenaProgress(record) : null,
      opponents: (record?.opponents ?? []).map(opponentView),
      mapPool: Object.values(ARENA_MAPS).map(m => ({ id: m.id, name: m.name, deploy: m.deploy, bans: m.bans, turnLimit: m.turnLimit, goalText: m.goalText, feature: m.feature })),
    };
  },

  [OP.GET_DEFENSE]: ctx => {
    const record = isArenaDay(ctx.player.day) ? ctx.store.arenaDay(ctx.player.id, ctx.player.day) : null;
    // 存下的槽位是保存那一刻的单位数据；按当前名册重建后返回，转职、升级、换装后显示的就是下次报名会用的阵容。
    const active = ctx.store.units(ctx.player.id).filter(u => u.status === 'active');
    const defense = ctx.player.defense ? bindDefense(active, ctx.player.defense, false) : null;
    // 今日竞技场已报名且未结算时，改阵只影响下一次 (docs/00 §10.1)。
    return { defense, locked: !!record && !record.settled, lockedDay: record?.day ?? null };
  },

  [OP.SET_DEFENSE]: (ctx, data) => {
    const submitted = data.defense as Defense | undefined;
    if (!submitted || typeof submitted !== 'object') throw new OpError('BAD_REQUEST', '缺少 defense');
    let bound: Defense;
    try {
      // 只信任角色与站位，属性/装备一律用服务器名册重建 (docs/00 §10.1)。
      bound = bindDefense(ctx.store.units(ctx.player.id).filter(u => u.status === 'active'), submitted);
    } catch (error) {
      throw new OpError('DEFENSE_INVALID', error instanceof Error ? error.message : String(error));
    }
    bound = { ...bound, id: `mine-${ctx.player.id}`, legion: ctx.player.legion };
    const errors = validateDefense(bound);
    if (errors.length > 0) throw new OpError('DEFENSE_INVALID', errors.join('；'));
    ctx.player.defense = bound;
    ctx.store.savePlayer(ctx.player);
    ctx.push(OP.STATE_CHANGED, { reason: 'defense' });
    return { defense: ctx.player.defense };
  },

  [OP.ARENA_REGISTER]: ctx => {
    ctx.player.registered = true;
    ctx.store.saveSnapshot(ctx.player.id, ctx.player.day, snapshotData(ctx.store, ctx.player));
    ctx.store.savePlayer(ctx.player);
    ctx.store.addEvent(ctx.player.id, 'arena', '已报名下一次竞技场。', { day: ctx.player.day });
    return { registered: true, day: ctx.player.day, nextArenaDay: nextArenaDay(ctx.player.day) };
  },

  [OP.GET_OPPONENT]: (ctx, data) => {
    const record = requireArenaDay(ctx, data);
    const opponent = findOpponent(record, asString(data.opponentId, 'opponentId'));
    return {
      opponent: opponentView(opponent),
      list: opponentList(opponent).map(u => ({ character: u.character, name: CHARACTERS[u.character].name, classId: u.classId, level: u.level, stats: u.stats, weapons: u.weapons, ranks: u.ranks })),
    };
  },

  [OP.ARENA_BAN]: (ctx, data) => {
    const record = requireArenaDay(ctx, data);
    const opponentId = asString(data.opponentId, 'opponentId');
    const bans = Array.isArray(data.bans) ? data.bans as never[] : [];
    const roster = activeSnapshot(ctx.store, ctx.player);
    const attack = record.attacks[opponentId];
    if (attack && (attack.status === 'won' || attack.status === 'lost')) throw new OpError('ARENA_ALREADY_ATTACKED', '这个对手今天已经打过了');
    let reveal;
    try {
      reveal = applyBans(findOpponent(record, opponentId), bans, roster);
    } catch (error) {
      if (error instanceof EngineError) throw new OpError(error.code, error.message);
      throw error;
    }
    if (attack) { attack.bans = bans as never[]; attack.reveal = reveal; attack.status = 'revealed'; }
    ctx.store.saveArenaDay(record);
    return {
      opponentId, reveal: {
        fielded: reveal.fielded.map(s => ({ character: s.unit.character, name: CHARACTERS[s.unit.character].name, pos: s.pos })),
        commander: reveal.commander, barred: reveal.barred,
      },
    };
  },

  [OP.ARENA_ATTACK]: (ctx, data) => {
    if (ctx.store.activeBattle(ctx.player.id)) throw new OpError('BATTLE_IN_PROGRESS', '已有进行中的战斗');
    const record = requireArenaDay(ctx, data);
    const opponentId = asString(data.opponentId, 'opponentId');
    const picks = (Array.isArray(data.picks) ? data.picks : []).map(p => {
      const entry = p as { character: string; pos: unknown };
      return { character: entry.character as never, pos: asPoint(entry.pos, 'pos') };
    });
    const plan: AttackPlan = { picks, commander: asString(data.commander, 'commander') as never };
    const roster = activeSnapshot(ctx.store, ctx.player);
    // 种子由服务器生成，不采用客户端提交的 seed (docs/03)。
    const seed = randomUUID().slice(0, 8);
    let state: BattleState;
    try {
      state = startAttack(record, opponentId, roster, plan, seed);
    } catch (error) {
      if (error instanceof EngineError) throw new OpError(error.code, error.message);
      throw error;
    }
    const opponent = findOpponent(record, opponentId);
    const map = ARENA_MAPS[opponent.map];
    const battle: BattleRecord = {
      id: state.id, playerId: ctx.player.id, kind: 'arena', mode: 'arena',
      name: `${opponent.legion} · ${map.name}`, goalText: map.goalText, initial: structuredClone(state), state, events: [], actions: [],
      seed, opponentId, arenaDay: record.day, createdAt: Date.now(), updatedAt: Date.now(),
    };
    ctx.store.saveBattle(battle);
    ctx.store.saveArenaDay(record);
    ctx.push(OP.PHASE_STARTED, { battleId: battle.id, turn: 1 });
    return { battleId: battle.id, battle: battleView(battle, false), state: publicState(state) };
  },

  [OP.SURRENDER]: ctx => {
    const record = requireBattle(ctx, {});
    if (record.mode !== 'arena' && record.mode !== 'festival') throw new OpError('BAD_REQUEST', '只有竞技场战斗可以投降');
    const { state } = applyAction(ctx, record, { type: 'surrender' });
    return { battleId: record.id, result: state.result, state: publicState(state) };
  },

  [OP.GET_ARENA_RESULTS]: ctx => {
    const record = ctx.store.latestArenaDay(ctx.player.id);
    if (!record) return { day: null, attacks: [], defenseTrials: [], points: ctx.player.arenaPoints };
    return {
      day: record.day,
      settled: record.settled,
      attacks: Object.values(record.attacks).map(a => ({
        opponentId: a.opponentId, legion: record.opponents.find(o => o.id === a.opponentId)?.legion ?? a.opponentId,
        status: a.status, points: a.points, bans: a.bans, battleId: a.battleId,
        // Neither earns participation gold (services.ts::settleArenaDay).
        noShow: !!a.noShow, surrender: !!a.surrender,
      })),
      defenseTrials: record.defenseTrials,
      // The defense locked at registration: what that day's trials used, whatever was edited since.
      lockedDefense: record.defense ?? null,
      points: ctx.player.arenaPoints,
      medals: ctx.player.arenaMedals,
    };
  },

  [OP.GET_REPLAY]: (ctx, data) => {
    const id = asString(data.replayId, 'replayId');
    const replay = ctx.store.replay(ctx.player.id, id);
    if (!replay) throw new OpError('NOT_FOUND', '找不到回放，或这场对局还没有公开');
    return { replayId: replay.id, battle: replay.data, publicAt: replay.publicAt };
  },

  [OP.GET_REPLAYS]: ctx => ({
    replays: ctx.store.replays(ctx.player.id).map(r => ({
      id: r.id, name: r.data.name, kind: r.data.kind, mode: r.data.mode,
      winner: r.data.state.result?.winner ?? null, reason: r.data.state.result?.reason ?? null,
      turns: r.data.state.turn, createdAt: r.createdAt, publicAt: r.publicAt, mine: r.playerId === ctx.player.id,
    })),
  }),

  [OP.GET_SNAPSHOTS]: ctx => ({
    snapshots: ctx.store.snapshots(ctx.player.id, 12).map(s => ({ day: s.day, date: dateOf(s.day), roster: s.data.roster, defense: s.data.defense })),
  }),

  [OP.GET_SPARRING]: () => ({
    sparring: [
      { id: 'frost', legion: '霜狼骑团', roster: sparringRoster('frost', 6) },
      { id: 'maple', legion: '赤枫商会', roster: sparringRoster('maple', 6) },
      { id: 'white', legion: '白塔学士团', roster: sparringRoster('white', 8) },
    ],
  }),

  [OP.START_SPARRING]: (ctx, data) => {
    if (ctx.store.activeBattle(ctx.player.id)) throw new OpError('BATTLE_IN_PROGRESS', '已有进行中的战斗');
    const legion = typeof data.legion === 'string' ? data.legion : '霜狼骑团';
    const roster = sparringRoster(legion, 6);
    const defense = {
      id: `sparring-${legion}`, legion, points: 0, record: '陪练', map: 'plains' as const,
      slots: roster.map((unit, i) => ({ unit, pos: [11 + (i % 4), 3 + Math.floor(i / 4)], behavior: 'aggressive' as const })),
      commanders: [roster[0].character], bans: [],
    };
    const mine = activeSnapshot(ctx.store, ctx.player);
    const picks = mine.slice(0, 6).map((u, i) => ({ character: u.character, pos: [1 + (i % 3), 3 + Math.floor(i / 3)] as Point }));
    const seed = randomUUID().slice(0, 8);
    const state = startAttack({ id: 'sparring', playerId: ctx.player.id, day: ctx.player.day, opponents: [defense], attacks: { [defense.id]: { opponentId: defense.id, status: 'revealed', bans: [], battleId: null, points: 0 } }, defenseTrials: [], defensePoints: 0, defense: null, settled: false },
      defense.id, mine, { picks, commander: picks[0].character }, seed);
    const battle: BattleRecord = {
      id: state.id, playerId: ctx.player.id, kind: 'arena', mode: 'sparring', name: `${legion} · 陪练`,
      goalText: ARENA_MAPS.plains.goalText, initial: structuredClone(state), state, events: [], actions: [], seed,
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    ctx.store.saveBattle(battle);
    return { battleId: battle.id, battle: battleView(battle, false) };
  },

  // ---- annual arena (docs/00 §9.4, docs/13 §6) -------------------------

  [OP.GET_ANNUAL]: ctx => {
    const annualIndex = annualIndexFor(ctx.player.day);
    const entry = ctx.store.annualEntryFor(ctx.player.id, annualIndex) ?? ctx.store.latestAnnualEntry(ctx.player.id);
    return {
      annualIndex,
      windowOpen: annualWindowOpen(ctx.player.day),
      nextOpenDay: (annualIndex + 1) * 120,
      qualifierMatches: ANNUAL_QUALIFIER_MATCHES,
      qualifierWins: ANNUAL_QUALIFIER_WINS,
      costDays: ACTION_DAYS.festivalMatch,
      entry: entry ? annualSummary(entry) : null,
    };
  },

  [OP.REGISTER_ANNUAL]: (ctx, data) => {
    if (ctx.store.activeBattle(ctx.player.id)) throw new OpError('BATTLE_IN_PROGRESS', '已有进行中的战斗');
    if (isActiveRun(ctx.store.activeRun(ctx.player.id))) throw new OpError('FORBIDDEN', '远征进行中，先打完或撤离');
    const annualIndex = annualIndexFor(ctx.player.day);
    if (!annualWindowOpen(ctx.player.day)) throw new OpError('FORBIDDEN', '大竞技场报名窗口未开放（每年最后三日）');
    if (ctx.store.annualEntryFor(ctx.player.id, annualIndex)) throw new OpError('FORBIDDEN', '本届已经报名；淘汰或退赛后当届不能重报');
    const ids = Array.isArray(data.unitIds) ? data.unitIds as string[] : [];
    const units = (ids.length > 0 ? ids.map(id => requireUnit(ctx.store, ctx.player, id)) : ctx.store.units(ctx.player.id))
      .filter(u => u.status === 'active');
    if (units.length === 0) throw new OpError('BAD_REQUEST', '没有可报名的单位');
    const entry = createAnnualEntry(`annual-${annualIndex}-${randomUUID().slice(0, 8)}`, ctx.player.id, annualIndex, units.map(u => u.id));
    ctx.store.saveAnnualEntry(entry);
    ctx.store.saveSnapshot(ctx.player.id, ctx.player.day, snapshotData(ctx.store, ctx.player));
    ctx.store.addEvent(ctx.player.id, 'festival', `报名第 ${annualIndex} 届大竞技场（${units.length} 人）。`, { annualIndex });
    ctx.push(OP.STATE_CHANGED, { reason: 'annual-register' });
    return { entry: annualSummary(entry) };
  },

  [OP.START_ANNUAL_MATCH]: ctx => {
    if (ctx.store.activeBattle(ctx.player.id)) throw new OpError('BATTLE_IN_PROGRESS', '已有进行中的战斗');
    const entry = ctx.store.activeAnnualEntry(ctx.player.id);
    if (!entry) throw new OpError('NOT_FOUND', '没有进行中的大竞技场报名');
    if (isActiveRun(ctx.store.activeRun(ctx.player.id))) throw new OpError('FORBIDDEN', '远征进行中，先打完或撤离');
    // 第一场用报名名单；之后只能用原名单中仍存活者（docs/00 §9.4.2）。
    const sourceIds = entry.qualifierCount === 0 && entry.round === 0 ? entry.unitIds : Object.keys(entry.carry);
    const units = sourceIds.map(id => ctx.store.unit(ctx.player.id, id)).filter((u): u is NonNullable<typeof u> => !!u && u.status === 'active');
    if (units.length === 0) throw new OpError('FORBIDDEN', '没有可出战的报名队员，只能退赛');
    const round = nextFestivalRound(entry);
    const seed = randomUUID().slice(0, 8);
    const record = createFestivalBattle(units, round, seed, { annualId: entry.id, carry: entry.carry });
    record.playerId = ctx.player.id;
    ctx.player.day += ACTION_DAYS.festivalMatch;
    syncPlayer(ctx.store, ctx.player);
    ctx.store.saveBattle(record);
    entry.battleId = record.id;
    ctx.store.saveAnnualEntry(entry);
    ctx.store.addEvent(ctx.player.id, 'festival', `大竞技场第 ${annualIndexFor(ctx.player.day)} 届第 ${round} 轮开始。`, { battleId: record.id });
    ctx.push(OP.PHASE_STARTED, { battleId: record.id, turn: 1 });
    return { entry: annualSummary(entry), round, battleId: record.id, battle: battleView(record, false) };
  },

  // ---- eight-chapter story (docs/00 §9.4.2, docs/13 §6.3) --------------

  [OP.GET_STORY]: ctx => ({
    chapters: Array.from({ length: STORY_CHAPTERS }, (_, i) => {
      const chapter = i + 1;
      return {
        chapter, openDay: chapterOpenDay(chapter), available: chapterAvailable(chapter, ctx.player.day),
        completed: (ctx.player.flags.storyCompleted ?? []).includes(chapter),
        claimed: ctx.player.flags.chapterExpClaimed.includes(chapter),
      };
    }),
  }),

  [OP.COMPLETE_STORY_EVENT]: (ctx, data) => {
    const chapter = asNumber(data.chapter, 'chapter');
    if (!chapterAvailable(chapter, ctx.player.day)) throw new OpError('FORBIDDEN', '该章尚未开放');
    ctx.player.flags.storyCompleted ??= [];
    if (!ctx.player.flags.storyCompleted.includes(chapter)) ctx.player.flags.storyCompleted.push(chapter);
    ctx.store.savePlayer(ctx.player);
    ctx.store.addEvent(ctx.player.id, 'story', `完成主线第 ${chapter} 章。`, { chapter });
    ctx.push(OP.STATE_CHANGED, { reason: 'story' });
    return { chapter, completed: true };
  },

  [OP.CLAIM_REWARD]: (ctx, data) => {
    const key = asString(data.rewardKey, 'rewardKey');
    const match = /^chapter:(\d+)$/.exec(key);
    if (!match) throw new OpError('NOT_FOUND', '没有这个奖励键');
    const chapter = Number(match[1]);
    if (!(ctx.player.flags.storyCompleted ?? []).includes(chapter)) throw new OpError('FORBIDDEN', '该章尚未完成');
    // 唯一奖励键：重复请求不会重复发（docs/13 §2.5）。
    if (ctx.player.flags.chapterExpClaimed.includes(chapter)) throw new OpError('FORBIDDEN', '该奖励已经领取过');
    ctx.player.flags.chapterExpClaimed.push(chapter);
    ctx.player.bexp += CHAPTER_BEXP;
    ctx.store.savePlayer(ctx.player);
    ctx.push(OP.STATE_CHANGED, { reason: 'reward' });
    return { rewardKey: key, bexp: CHAPTER_BEXP, total: ctx.player.bexp };
  },

  // ---- agent narrative ---------------------------------------------------

  [OP.AGENT_REPORT_PLAN]: (ctx, data) => {
    const text = asString(data.text, 'text');
    ctx.store.addNote(ctx.player.id, 'plan', text, null);
    return { ok: true };
  },
  [OP.AGENT_PHASE_NOTE]: (ctx, data) => {
    const text = asString(data.text, 'text');
    ctx.store.addNote(ctx.player.id, 'phase', text, typeof data.battleId === 'string' ? data.battleId : null);
    return { ok: true };
  },
  [OP.AGENT_COMMENT_BATTLE]: (ctx, data) => {
    const text = asString(data.text, 'text');
    ctx.store.addNote(ctx.player.id, 'comment', text, typeof data.battleId === 'string' ? data.battleId : null);
    return { ok: true };
  },
  [OP.AGENT_DAILY_REPORT]: (ctx, data) => {
    const text = asString(data.text, 'text');
    ctx.store.addNote(ctx.player.id, 'daily', text, null);
    return { ok: true };
  },
};

// Late import to break the model<->services cycle for the few model helpers used above.

function requireArenaDay(ctx: Context, data: Json): ArenaDayRecord {
  const day = typeof data.day === 'number' ? data.day : (isArenaDay(ctx.player.day) ? ctx.player.day : null);
  const record = day !== null ? ctx.store.arenaDay(ctx.player.id, day) : ctx.store.latestArenaDay(ctx.player.id);
  if (!record) throw new OpError('ARENA_NOT_OPEN', '现在不是竞技场日，或你还没有报名');
  return record;
}

function findOpponent(record: ArenaDayRecord, id: string): Defense {
  const opponent = record.opponents.find(o => o.id === id);
  if (!opponent) throw new OpError('NOT_FOUND', `今天没有对手 ${id}`);
  return opponent;
}

function opponentView(opponent: { id: string; legion: string; points: number; record: string; map: string }) {
  const map = ARENA_MAPS[opponent.map as keyof typeof ARENA_MAPS];
  return {
    id: opponent.id, legion: opponent.legion, points: opponent.points, record: opponent.record,
    map: opponent.map, mapName: map.name, deploy: map.deploy, bans: map.bans, turnLimit: map.turnLimit,
    goalText: map.goalText, feature: map.feature,
  };
}

function arenaProgress(record: { attacks: Record<string, { status: string; points: number }>; defensePoints: number }) {
  const records = Object.values(record.attacks);
  return {
    done: records.filter(r => r.status === 'won' || r.status === 'lost').length,
    total: records.length,
    points: records.reduce((sum, r) => sum + r.points, 0) + record.defensePoints,
  };
}

export function dispatch(ctx: Context, op: number, data: Json): unknown {
  const handler = handlers[op];
  if (!handler) throw new OpError('UNKNOWN_OP', `没有 op ${op}`);
  // 带 agentModel 的请求视为 Agent 在线心跳 (docs/06)；最多每分钟写一次。
  if (ctx.agentModel) {
    const now = Date.now();
    if (!ctx.player.flags.agentLastSeen || now - ctx.player.flags.agentLastSeen > 60_000) {
      ctx.player.flags.agentLastSeen = now;
      ctx.store.savePlayer(ctx.player);
    }
  }
  // 幂等命令收据 (docs/13 §1.4、§2.1)：带 commandId 的写命令超时重发返回原结果，换负载则报冲突。
  const commandId = typeof data.commandId === 'string' && data.commandId.length > 0 ? data.commandId : null;
  if (!commandId) return runHandler(ctx, op, handler, data);
  const payloadHash = commandHash(op, data);
  const existing = ctx.store.receipt(ctx.player.id, commandId);
  if (existing) {
    if (existing.payloadHash !== payloadHash || existing.op !== op) {
      throw new OpError('IDEMPOTENCY_CONFLICT', '同一个 commandId 被用于不同的请求负载');
    }
    return existing.response;
  }
  const result = runHandler(ctx, op, handler, data);
  ctx.store.saveReceipt(ctx.player.id, commandId, op, payloadHash, result);
  return result;
}

// 写命令成功后推进玩家版本，供预览／执行绑定（docs/13 §2.1）。
function runHandler(ctx: Context, op: number, handler: Handler, data: Json): unknown {
  const result = handler(ctx, data);
  if (WRITE_OPS.has(op)) {
    ctx.player.version = (ctx.player.version ?? 0) + 1;
    ctx.store.savePlayer(ctx.player);
  }
  return result;
}

// 会改变玩家状态的 op：成功后 version +1。
const WRITE_OPS = new Set<number>([
  OP.SORTIE, OP.SWEEP, OP.TRAIN, OP.REST, OP.RECRUIT, OP.START_MAIN_STAGE, OP.SKIP_MAIN_STAGE,
  OP.BUY, OP.SELL, OP.TRANSFER_ITEM, OP.USE_ITEM, OP.PROMOTE, OP.ASSIGN_BEXP, OP.DISMISS,
  OP.SET_DEFENSE, OP.ARENA_REGISTER, OP.ARENA_BAN, OP.ARENA_ATTACK, OP.SURRENDER, OP.START_SPARRING,
  OP.CLAIM_LEGACY, OP.RETIRE_UNIT, OP.REINCARNATE_UNIT, OP.EMERGENCY_RECRUIT, OP.BUY_CLASS_QUALIFICATION,
  OP.PLANT, OP.START_PRODUCTION, OP.COLLECT_PRODUCTION, OP.START_DUNGEON, OP.CONTINUE_DUNGEON, OP.WITHDRAW_RUN,
  OP.REGISTER_ANNUAL, OP.START_ANNUAL_MATCH, OP.COMPLETE_STORY_EVENT, OP.CLAIM_REWARD,
  OP.UNIT_ACT, OP.END_PHASE, OP.RETREAT,
]);

// 负载摘要包含操作与数据（去掉 commandId），不包含连接 seq（docs/13 §2.1）。
function commandHash(op: number, data: Json): string {
  const rest: Json = {};
  for (const [key, value] of Object.entries(data)) if (key !== 'commandId') rest[key] = value as Json;
  return createHash('sha256').update(`${op}:${stableStringify(rest)}`).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export function hasHandler(op: number): boolean {
  return op in handlers;
}

export { requireUnit, requireBattle, isArenaDay, encounterLevel, rankFromExp, toSnapshot };
