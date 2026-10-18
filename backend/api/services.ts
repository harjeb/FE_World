import type { CharacterId } from '../common/data/characters.ts';
import { CHARACTERS, CHARACTER_IDS, PROTAGONIST_ALLOCATION_BUDGET, PROTAGONIST_ALLOCATION_MAX, PROTAGONIST_CLASSES, PROTAGONIST_TENDENCIES } from '../common/data/characters.ts';
import { CLASSES } from '../common/data/classes.ts';
import { STAT_KEYS } from '../common/data/types.ts';
import { WEAPONS } from '../common/data/weapons.ts';
import { GAME_ITEMS } from '../common/game/items.ts';
import type { ItemKey } from '../common/game/items.ts';
import { addWeaponExp, ageAt, daysUntilBirthday, effectiveCaps, equipmentArts, gainExperience, growthRates, lifespanEndDayOf, lifespanWarning, toSnapshot, unitName } from '../common/game/model.ts';
import { gainMastery, MASTERY_PER_BATTLE, MASTERY_PER_TRAIN_DAY, MASTERY_PER_WIN } from '../common/game/mastery.ts';
import { dispatchMaterials, dispatchWeapons } from '../common/game/dispatch.ts';
import type { DispatchResult } from '../common/game/dispatch.ts';
import { createPeriod, periodIdFor, rankByRating, ratingDelta, rewardForRank } from '../common/game/ratings.ts';
import type { RatingPeriod, RatingRow } from '../common/game/ratings.ts';
import { seedRng } from '../common/engine/rng.ts';
import { scenarioLoot } from '../common/engine/scenario.ts';
import { createLegacy, eligibleForLegacy } from '../common/game/legacy.ts';
import type { LegacyCause } from '../common/game/legacy.ts';
import { carryFromBattle, DUNGEON_STAGES, stageCount, stageLoot } from '../common/game/expedition.ts';
import type { RunCarry, RunRecord } from '../common/game/expedition.ts';
import { advanceBracket, knockoutResult, nextAnnualWindowStart, qualifierResult } from '../common/game/annual.ts';
import type { AnnualEntry } from '../common/game/annual.ts';
import { GROWTH_TYPE_NAMES, ageBandOf, growthBonus } from '../common/data/growth-types.ts';
import type { UnitRecord } from '../common/game/model.ts';
import { dateOf, isArenaDay, nextArenaDay, nextMonthStart, REGIONS, regionById, enemyLevel, DAYS_PER_SEASON } from '../common/game/calendar.ts';
import { summarizeOutcome, weaponsUsed } from '../common/game/battles.ts';
import type { BattleRecord } from '../common/game/battles.ts';
import { attackProgress, createArenaDay, officialOpponents, OPPONENT_COUNT, runDefenseTrials, ARENA_GOLD } from '../common/game/arena.ts';
import type { ArenaDayRecord } from '../common/game/arena.ts';
import { QUEST_RECRUITS } from '../common/game/quests.ts';
import { recruitLevel, recruitPortrait } from '../common/game/random-recruit.ts';
import type { Defense, SnapshotUnit } from '../common/arena/rules.ts';
import type { Store, Player, SnapshotData } from './store.ts';
import { SEED_DAY } from './store.ts';
import { DEMO_LEVEL } from './store.ts';

export const ROSTER_LIMIT = 18;
// 不公开的战报：public_at 取一个永远到不了的时间，只有本人能读。
export const PRIVATE_REPLAY = Number.MAX_SAFE_INTEGER;

export function snapshotData(store: Store, player: Player): SnapshotData {
  const active = store.units(player.id).filter(u => u.status === 'active');
  const roster = active.map(toSnapshot);
  // 快照里的防守必须来自真实名册，不能用客户端提交的属性 (docs/00 §10.1)。
  const defense = player.defense ? bindDefense(active, player.defense, false) : null;
  return { roster, defense, label: `第 ${player.day} 日快照` };
}

// 用服务器当前名册重建防守单位，属性/装备只取服务器数据，杜绝伪造。
// strict=true 时缺人报错（保存防守用）；false 时丢弃缺人槽位（报名快照用）。
export function bindDefense(units: UnitRecord[], defense: Defense, strict = true): Defense {
  const byCharacter = new Map(units.map(u => [u.character, toSnapshot(u)]));
  const slots: Defense['slots'] = [];
  for (const slot of defense.slots) {
    const unit = byCharacter.get(slot.unit.character);
    if (!unit) {
      if (strict) throw new Error(`${CHARACTERS[slot.unit.character].name} 不在当前名册中`);
      continue;
    }
    slots.push({ ...slot, unit });
  }
  return { ...defense, slots };
}

// The lazy calendar: opening and settling arena days happens when the player acts, not on a timer
// (docs/07「行动日懒结算」). The worker sweeps the same function for idle players.
export function ensureArenaDay(store: Store, player: Player): void {
  if (!player.registered || store.arenaDay(player.id, player.day)) return;
  const snapshot = snapshotData(store, player);
  const day = createArenaDay(player.id, player.day, matchedOpponents(store, player), null);
  store.saveArenaDay(day);
}

export function syncPlayer(store: Store, player: Player): Player {
  const month = Math.floor(player.day / DAYS_PER_SEASON);
  if (player.flags.shopMonth !== month) {
    store.refillShop(player.id, month);
    player.flags.shopMonth = month;
  }
  if (player.registered && isArenaDay(player.day) && !store.arenaDay(player.id, player.day)) {
    const snapshot = snapshotData(store, player);
    store.saveSnapshot(player.id, player.day, snapshot);
    const day = createArenaDay(player.id, player.day, matchedOpponents(store, player), null);
    store.saveArenaDay(day);
    store.addEvent(player.id, 'arena', `竞技场日：${day.opponents.length} 个对手已生成。`, { day: player.day });
  }
  for (const day of store.unsettledArenaDays(player.id)) {
    if (day.day >= player.day) continue;
    // 普通竞技场每场推进 1 日，不能因为日期离开竞技场日就把同一记录里还没打的进攻
    // 直接判负：只有全部场次都结束，或已经走到下一个竞技场日，才结算剩余场次。
    const attacks = Object.values(day.attacks);
    const finished = attacks.every(attack => attack.status === 'won' || attack.status === 'lost');
    if (finished || player.day >= nextArenaDay(day.day)) settleArenaDay(store, player, day);
  }
  // 后台派遣达到 return_day 时一次结算（docs/13 §5.5）。
  settleDispatches(store, player);
  // 自然寿终：主角不衰老，其他角色到寿终日在日历推进时死亡（docs/00 §3.4）。
  for (const unit of store.units(player.id)) {
    if (unit.status !== 'active' || unit.isProtagonist) continue;
    if (player.day >= lifespanEndDayOf(unit)) recordDeath(store, player, unit, 'age', null);
  }
  // Ages follow the personal calendar (1 year per DAYS_PER_YEAR days), which moves the growth-type band.
  for (const unit of store.units(player.id)) {
    const age = ageAt(unit, player.day, DAYS_PER_SEASON * 4);
    if (age !== unit.age) { unit.age = age; store.saveUnit(unit, player.id); }
  }
  store.savePlayer(player);
  return player;
}

function matchedOpponents(store: Store, player: Player): Defense[] {
  const others = store.snapshotsAtDay(player.day, player.id).filter(s => s.data.defense);
  const matched = others.slice(0, OPPONENT_COUNT).map(s => structuredClone(s.data.defense!));
  if (matched.length < OPPONENT_COUNT) matched.push(...officialOpponents().slice(0, OPPONENT_COUNT - matched.length));
  return matched;
}

// Unfinished attacks count as losses; defense trials and rewards settle here (docs/07).
export function settleArenaDay(store: Store, player: Player, day: ArenaDayRecord): void {
  // 离开竞技场日时还没打完的进攻按落败计，但不发参与金币 (docs/00 §10.3)。
  for (const attack of Object.values(day.attacks)) {
    if (attack.status === 'new' || attack.status === 'revealed' || attack.status === 'fighting') { attack.status = 'lost'; attack.noShow = true; }
  }
  // 首版没有玩家防守；只有旧记录仍带 defense 时才补跑历史防守 trial。
  if (day.defense) {
    const rosters = officialOpponents().map(o => ({ legion: o.legion, roster: o.slots.map(s => s.unit) }));
    runDefenseTrials(day, day.defense, rosters);
  }
  day.settled = true;
  const progress = attackProgress(day);
  const attacks = Object.values(day.attacks);
  const wins = attacks.filter(a => a.status === 'won').length;
  // 反复投降、未打完不发参与金币；防守快照只计入积分/勋章，不产生可用金币 (docs/00 §10.1、§10.3)。
  const losses = attacks.filter(a => a.status === 'lost' && !a.noShow && !a.surrender).length;
  const gold = wins * ARENA_GOLD.win + losses * ARENA_GOLD.loss;
  player.gold += gold;
  player.arenaPoints += progress.points;
  player.arenaMedals += day.defenseTrials.filter(t => t.held).length;
  // 现实月榜：有效赛果记入当前现实月，与个人日历无关（docs/13 §6.4）。
  recordRating(store, player.id, wins, losses);
  store.saveArenaDay(day);
  store.addEvent(player.id, 'arena', `竞技场日结算：进攻 ${wins} 胜 ${losses} 负，积分 +${progress.points}，金币 +${gold}。`, {
    day: day.day, wins, losses, points: progress.points, gold,
  });
}

export interface BattleRewards { gold: number; items: { item: ItemKey; count: number }[]; levelUps: { unit: string; level: number }[]; deaths: string[]; weaponRanks: { unit: string; type: string; rank: string }[] }

// 死亡／退役统一处理（docs/00 §7.1、§7.4）：先冻结遗产来源，再回收装备，最后写纪念名册。
export function recordDeath(store: Store, player: Player, unit: UnitRecord, cause: LegacyCause, battleId: string | null, deferred = false): string | null {
  if (unit.status === 'dead') return null;
  const legacy = eligibleForLegacy(unit) ? createLegacy(unit, cause, `legacy-${unit.id}`, player.id) : null;
  if (legacy) store.saveLegacy(legacy);
  recoverEquipment(store, player, unit, deferred);
  unit.status = 'dead';
  unit.lockedDispatchId = null;
  store.saveUnit(unit, player.id);
  store.saveMemorial({
    unitId: unit.id, playerId: player.id, name: unitName(unit), character: unit.character,
    classId: unit.classId, level: unit.level, cause, atDay: player.day, battleId, stats: unit.stats, lineageDepth: unit.lineageDepth,
  });
  store.addEvent(player.id, 'death', `${unitName(unit)}${cause === 'age' ? '寿终' : '战死'}。`, { unit: unit.id, cause, legacy: legacy?.id ?? null });
  return legacy?.id ?? null;
}

// 正常退役：达到传承门槛则留下遗产，退役后退出战斗名册（docs/00 §7.4）。
export function recordRetire(store: Store, player: Player, unit: UnitRecord, deferred = false): string | null {
  if (unit.status !== 'active') throw new Error('只有现役角色可以退役');
  const legacy = eligibleForLegacy(unit) ? createLegacy(unit, 'retired', `legacy-${unit.id}`, player.id) : null;
  if (legacy) store.saveLegacy(legacy);
  recoverEquipment(store, player, unit, deferred);
  unit.status = 'retired';
  unit.retiredDay = player.day;
  store.saveUnit(unit, player.id);
  store.saveMemorial({
    unitId: unit.id, playerId: player.id, name: unitName(unit), character: unit.character,
    classId: unit.classId, level: unit.level, cause: 'retired', atDay: player.day, battleId: null, stats: unit.stats, lineageDepth: unit.lineageDepth,
  });
  store.addEvent(player.id, 'retire', `${unitName(unit)} 退役。`, { unit: unit.id, legacy: legacy?.id ?? null });
  return legacy?.id ?? null;
}

// 回收真实装备并保留当时耐久／剩余次数，不额外复制新品（docs/00 §7.1）。
// deferred：活动途中先入回收袋，活动结束后再入仓库（docs/13 §2.3）。
function recoverEquipment(store: Store, player: Player, unit: UnitRecord, deferred: boolean): void {
  const instances = [...(unit.weaponInstances ?? [])];
  for (const weapon of unit.weapons) {
    const index = instances.findIndex(row => row.id === weapon);
    const instance = index >= 0 ? instances.splice(index, 1)[0] : undefined;
    if (deferred) {
      player.flags.recoveryBag ??= [];
      player.flags.recoveryBag.push({ item: weapon, uses: 0, weapon: instance ? { ...instance } : undefined });
    } else {
      store.addInventory(player.id, weapon, 0, 1);
      if (instance) (player.flags.storedWeapons ??= []).push({ ...instance });
    }
  }
  for (const item of unit.items) {
    if (deferred) (player.flags.recoveryBag ??= []).push({ item: item.id, uses: item.uses });
    else store.addInventory(player.id, item.id, item.uses, 1);
  }
  unit.weapons = [];
  unit.weaponInstances = [];
  unit.items = [];
}

// 活动结束（单场／整次连战／整届赛事）时把回收袋并入仓库；途中不可接用（docs/00 §7.1）。
export function flushRecoveryBag(store: Store, player: Player): number {
  const bag = player.flags.recoveryBag ?? [];
  if (bag.length === 0) return 0;
  for (const row of bag) {
    store.addInventory(player.id, row.item, row.uses, 1);
    if (row.weapon) (player.flags.storedWeapons ??= []).push({ ...row.weapon });
  }
  player.flags.recoveryBag = [];
  store.savePlayer(player);
  return bag.length;
}

// Writes a finished battle back to the roster: growth, weapon experience, deaths, rewards and the
// replay (docs/00 §7.1 for death, §8.3 for rewards).
export function applyBattleOutcome(store: Store, player: Player, record: BattleRecord): BattleRewards {
  const outcome = summarizeOutcome(record);
  const lethal = record.mode === 'field' || record.mode === 'festival';
  const rewards: BattleRewards = { gold: 0, items: [], levelUps: [], deaths: [], weaponRanks: [] };
  const units = store.units(player.id);
  const used = weaponsUsed(record);
  const participants = new Set<string>();
  for (const event of record.events) {
    if (event.t === 'combat' && event.strikes.length) { participants.add(event.attacker); participants.add(event.defender); }
    if (event.t === 'heal' && event.by && event.source === 'staff' && event.amount > 0) participants.add(event.by);
    if (event.t === 'seize' || event.t === 'escape' || event.t === 'loot') participants.add(event.unit);
  }
  for (const battleUnit of record.state.units.filter(u => u.side === 'player')) {
    const unit = units.find(u => u.id === battleUnit.id);
    if (!unit) continue;
    if (record.kind === 'field') {
      unit.level = battleUnit.level;
      unit.exp = battleUnit.exp;
      unit.stats = { ...battleUnit.stats };
      for (const event of record.events) {
        if (event.t !== 'levelUp' || event.unit !== battleUnit.id) continue;
        unit.growthLog.push({ level: event.level, gains: event.gains });
        rewards.levelUps.push({ unit: unit.id, level: event.level });
      }
    }
    if (lethal) {
      if (battleUnit.weaponInstances) unit.weaponInstances = battleUnit.weaponInstances.map(row => ({ ...row }));
      if (battleUnit.bookInstances) unit.bookInstances = battleUnit.bookInstances.map(row => ({ ...row }));
      if (battleUnit.spellbooks) unit.spellbooks = battleUnit.spellbooks.map(row => ({ ...row }));
      unit.weapons = [...battleUnit.weapons];
      unit.items = battleUnit.items.map(item => ({ ...item }));
      // Older active battles counted consumed shields without removing their stacks.
      const initialShields = record.initial.units.find(u => u.id === unit.id)?.items.filter(item => item.id === 'immortal_shield').length ?? 0;
      let extra = Math.max(0, unit.items.filter(item => item.id === 'immortal_shield').length - Math.max(0, initialShields - (battleUnit.shieldsUsed ?? 0)));
      unit.items = unit.items.filter(item => !(item.id === 'immortal_shield' && extra-- > 0));
    }
    if (battleUnit.alive || battleUnit.escaped) {
      for (const type of lethal ? used.get(battleUnit.id) ?? [] : []) {
        const rank = addWeaponExp(unit, type, 2);
        if (rank) rewards.weaponRanks.push({ unit: unit.id, type, rank });
      }
      // 有效参战积累当前职业精通（docs/00 §4.2.1）；普通竞技场／练习不计。
      if (lethal && participants.has(unit.id)) {
        gainMastery(unit, MASTERY_PER_BATTLE + (outcome.winner === 'player' ? MASTERY_PER_WIN : 0));
      }
      store.saveUnit(unit, player.id);
    } else if (lethal) {
      if (unit.isProtagonist) {
        // 神主角 HP 归零只撤退，不死亡 (docs/00 §7.1).
        unit.status = 'active';
        store.saveUnit(unit, player.id);
      } else {
        recordDeath(store, player, unit, 'death', record.id, !!record.runId || !!record.annualId);
        rewards.deaths.push(unit.id);
      }
    }
  }
  const won = outcome.winner === 'player';
  // 经典地图宝箱/村庄战利品：稳定 id 去重，只有胜利才入库；副本由 handleRunOutcome 暂存。
  if (won && !record.dungeon) {
    for (const drop of scenarioLoot(record.state)) {
      if (!Object.hasOwn(GAME_ITEMS, drop.item)) continue;
      const item = drop.item as ItemKey;
      store.addInventory(player.id, item, GAME_ITEMS[item].uses ?? 0, drop.count);
      rewards.items.push({ item, count: drop.count });
    }
  }
  if (record.mode === 'field' && won && !record.dungeon) {
    const regionId = record.region ?? 1;
    rewards.gold = 180 + record.state.turn * 6;
    const region = regionById(regionId);
    const material: ItemKey = region.id % 3 === 0 ? 'ore' : region.id % 3 === 1 ? 'herb' : 'wood';
    const count = 2 + Math.floor(record.state.turn / 4);
    store.addInventory(player.id, material, 0, count);
    rewards.items.push({ item: material, count });
    if (!player.flags.clearedRegions.includes(region.id)) {
      player.flags.clearedRegions.push(region.id);
      player.flags.firstClearLevel ??= {};
      if (player.flags.firstClearLevel[region.id] === undefined) player.flags.firstClearLevel[region.id] = record.initial.units.find(u => u.side === 'enemy')!.level;
      store.addEvent(player.id, 'region', `首次讨伐 ${region.name}（已讨伐 ${player.flags.clearedRegions.length} 个地区）。`, { region: region.id });
    }
    player.gold += rewards.gold;
  }
  if (record.mode === 'festival' && !record.annualId) {
    const year = dateOf(player.day).year;
    if (won) {
      player.flags.festivalRound += 1;
      if (player.flags.festivalRound > 9) {
        store.addEvent(player.id, 'festival', '大竞技场夺冠！', { year });
        player.flags.festivalRound = 0;
      }
    } else {
      store.addEvent(player.id, 'festival', `第 ${player.flags.festivalRound + 1} 轮被淘汰。`, { year });
      player.flags.festivalRound = 0;
    }
    player.flags.festivalYear = year;
  }
  store.savePlayer(player);
  store.addEvent(player.id, 'battle', `${record.name}：${won ? '胜利' : '失败'}（${outcome.reason}）。`, {
    battleId: record.id, winner: outcome.winner, deaths: rewards.deaths, gold: rewards.gold,
  });
  // 每场结束的战斗都留战报（docs/00 §11「战报保留伤亡与消耗」）。竞技场与大竞技场结束即公开；
  // 野外、任务、副本、挑战塔与练习只给本人看（公开时间待定前不对外）。
  record.endDay = player.day;
  store.saveReplay(player.id, record, record.mode === 'arena' || record.mode === 'festival' ? Date.now() : PRIVATE_REPLAY);
  return rewards;
}

// 连续副本结算（docs/00 §8.1.3、docs/13 §4.3）：胜则进入下一图，首领图胜利才完整通关；
// 撤离／失败作废未带回掉落，但保留死亡与消耗。
export function handleRunOutcome(store: Store, player: Player, record: BattleRecord): { run: RunRecord; completed: boolean } | null {
  if (!record.runId) return null;
  const run = store.run(player.id, record.runId);
  if (!run) return null;
  const won = record.state.result?.winner === 'player';
  const carry = carryFromBattle(record.state, run.unitIds);
  const releaseLocks = () => {
    for (const id of run.unitIds) {
      const unit = store.unit(player.id, id);
      if (unit?.lockedRunId === run.id) { unit.lockedRunId = null; store.saveUnit(unit, player.id); }
    }
  };
  let completed = false;
  if (won) {
    run.pendingLoot.push(...stageLoot(run.region, run.stageIndex));
    for (const drop of scenarioLoot(record.state)) run.pendingLoot.push({ item: drop.item, count: drop.count });
    if (run.stageIndex >= stageCount(run) - 1) {
      run.state = 'completed';
      completed = true;
      releaseLocks();
      const region = regionById(run.region);
      const firstClear = !player.flags.clearedRegions.includes(run.region);
      if (firstClear) player.flags.clearedRegions.push(run.region);
      player.flags.firstClearLevel ??= {};
      if (player.flags.firstClearLevel[run.region] === undefined) player.flags.firstClearLevel[run.region] = run.level;
      for (const drop of run.pendingLoot) {
        const item = drop.item as ItemKey;
        store.addInventory(player.id, item, GAME_ITEMS[item]?.uses ?? 0, drop.count);
      }
      const gold = 300 + record.state.turn * 8;
      player.gold += gold;
      // 整次连战结束，回收袋并入仓库（docs/00 §7.1）。
      flushRecoveryBag(store, player);
      store.addEvent(player.id, 'region', `完整通关 ${region.name} 大副本（已讨伐 ${player.flags.clearedRegions.length} 个地区）。`, { region: run.region, loot: run.pendingLoot, gold });
      // 地区远征任务：三图全部完成才标记完成，奖励仍用 CLAIM_QUEST_REWARD 另领（docs/20 §2）。
      if (run.questId) {
        player.flags.questsDone ??= [];
        if (!player.flags.questsDone.includes(run.questId)) {
          player.flags.questsDone.push(run.questId);
          store.addEvent(player.id, 'quest', '地区远征完成，任务奖励待领取。', { questId: run.questId });
        }
      }
    } else {
      run.state = 'between_maps';
      run.stageIndex += 1;
      run.battleId = null;
    }
  } else {
    run.state = 'failed';
    releaseLocks();
    flushRecoveryBag(store, player);
  }
  run.carry = carry;
  store.saveRun(run);
  store.savePlayer(player);
  return { run, completed };
}

// 年度大竞技场结算（docs/13 §6）：海选三场至少两胜，正赛六轮单败；局间只恢复存活者 HP。
export function handleAnnualOutcome(store: Store, player: Player, record: BattleRecord): { entry: AnnualEntry; finished: boolean } | null {
  if (!record.annualId) return null;
  const entry = store.annualEntry(player.id, record.annualId);
  if (!entry) return null;
  const won = record.state.result?.winner === 'player';
  // 下一场的名单：按报名顺序，取上一场仍可用、现在仍在现役的人（docs/13 §6「每轮使用存活报名替补」）。
  // 上场者带本场剩下的物品与武器、恢复满 HP；没上场的替补保持原样；死者不复活，消耗不补（docs/00 §9.4.2）。
  // 主角倒下只撤退，仍在现役，下一场照常可用。
  const firstMatch = entry.qualifierCount === 0 && entry.round === 0;
  const eligible = new Set(firstMatch ? entry.unitIds : Object.keys(entry.carry));
  const carry: Record<string, RunCarry> = {};
  for (const id of entry.unitIds) {
    const unit = eligible.has(id) ? store.unit(player.id, id) : null;
    if (!unit || unit.status !== 'active') continue;
    const fought = record.state.units.find(u => u.side === 'player' && u.id === id);
    const kept = fought ?? entry.carry[id] ?? unit;
    carry[id] = {
      hp: unit.stats.hp, items: kept.items.map(i => ({ ...i })), weapons: [...kept.weapons],
      weaponInstances: kept.weaponInstances?.map(row => ({ ...row })),
      bookInstances: kept.bookInstances?.map(row => ({ ...row })),
      spellbooks: kept.spellbooks?.map(row => ({ ...row })),
    };
  }
  entry.carry = carry;
  if (entry.state === 'qualifier') qualifierResult(entry, won);
  else if (entry.state === 'knockout') {
    knockoutResult(entry, won);
    advanceBracket(entry, won);
  }
  entry.battleId = null;
  store.saveAnnualEntry(entry);
  const finished = entry.state === 'champion' || entry.state === 'eliminated';
  if (finished) {
    const key = `annual:${entry.annualIndex}:${entry.state}`;
    player.flags.annualRewardsClaimed ??= [];
    if (!player.flags.annualRewardsClaimed.includes(key)) {
      player.flags.annualRewardsClaimed.push(key);
      player.gold += entry.state === 'champion' ? 5_000 : 1_000;
      player.arenaMedals += entry.state === 'champion' ? 3 : 1;
      store.addEvent(player.id, 'festival-reward', `大竞技场第 ${entry.annualIndex} 届奖励已发放。`, { key });
    }
    flushRecoveryBag(store, player);
  }
  store.addEvent(player.id, 'festival', `大竞技场第 ${entry.annualIndex} 届：${won ? '胜利' : '失败'}（${entry.state}）。`, { annualIndex: entry.annualIndex, state: entry.state });
  return { entry, finished };
}

// 后台派遣结算（docs/00 §9.1.1、docs/13 §5.5）：达到 return_day 时只结算一次，奖励只给参与者。
// 出发时冻结的职业／武器在此入账；返程后释放人员锁。
export function settleDispatches(store: Store, player: Player): DispatchResult[] {
  const settled: DispatchResult[] = [];
  for (const dispatch of store.runningDispatches(player.id)) {
    if (dispatch.returnDay > player.day) continue;
    const materials = dispatchMaterials(dispatch.region, dispatch.durationDays);
    const weaponRoll = seedRng(`dispatch-weapons:${dispatch.id}`)[0] % 4;
    const weapons = dispatchWeapons(dispatch.region, dispatch.durationDays, weaponRoll);
    const unitRewards: DispatchResult['unitRewards'] = [];
    for (const unitId of dispatch.unitIds) {
      const unit = store.unit(player.id, unitId);
      if (!unit || unit.status !== 'active') continue;
      const year = Math.min(7, Math.floor(player.day / 500));
      const perDay = [11, 9, 7, 6, 5, 5, 4, 4][year];
      const exp = perDay * dispatch.durationDays;
      const ups = gainExperience(unit, exp, seedRng(`dispatch-exp:${dispatch.id}:${unitId}`));
      const mastery = MASTERY_PER_TRAIN_DAY * dispatch.durationDays;
      const unlocked = gainMastery(unit, mastery, dispatch.classId).map(node => node.name);
      const weaponRank = addWeaponExp(unit, dispatch.weaponType, dispatch.durationDays, dispatch.classId);
      store.saveUnit(unit, player.id);
      unitRewards.push({ unitId, exp, levelUps: ups.map(u => ({ level: u.level, gains: u.gains as Record<string, number> })), mastery, unlocked, weaponType: dispatch.weaponType, weaponRank });
    }
    for (const row of materials) store.addInventory(player.id, row.item, 0, row.count);
    for (const row of weapons) store.addInventory(player.id, row.item, 0, row.count);
    dispatch.state = 'returned';
    dispatch.result = { day: player.day, materials, weapons, unitRewards };
    store.saveDispatch(dispatch);
    for (const unitId of dispatch.unitIds) {
      const unit = store.unit(player.id, unitId);
      if (unit?.lockedDispatchId === dispatch.id) { unit.lockedDispatchId = null; store.saveUnit(unit, player.id); }
    }
    store.addEvent(player.id, 'dispatch', `派遣返程：${dispatch.unitIds.length} 人经过 ${dispatch.durationDays} 日。`, { dispatchId: dispatch.id });
    settled.push(dispatch.result);
  }
  return settled;
}

// 现实月榜（docs/13 §6.4）：确保当前现实月有一个 active period，不推进个人日期。
export function ensureRatingPeriod(store: Store, now = Date.now(), mode = 'arena'): RatingPeriod {
  const id = periodIdFor(now);
  const active = store.activeRatingPeriod(mode);
  if (active) return active;
  const period = createPeriod(id, mode);
  store.saveRatingPeriod(period);
  return period;
}

// 把一场有效赛果记入当前现实月；胜多负少，跨月只计新月一次。
export function recordRating(store: Store, playerId: string, wins: number, losses: number, mode = 'arena', now = Date.now()): RatingRow {
  const period = ensureRatingPeriod(store, now, mode);
  const row: RatingRow = store.rating(period.id, playerId, mode) ?? {
    periodId: period.id, playerId, mode, progressBracket: 0, rating: 0, wins: 0, losses: 0, matches: 0,
  };
  row.wins += wins;
  row.losses += losses;
  row.matches += wins + losses;
  row.rating += ratingDelta(wins, losses);
  store.saveRating(row);
  return row;
}

// 归档旧月、冻结奖励并开启新月；幂等，可反复调用。
export function settleMonthlyRatings(store: Store, now = Date.now(), mode = 'arena'): { archived: string[]; active: string } {
  const id = periodIdFor(now);
  const active = store.activeRatingPeriod(mode);
  const archived: string[] = [];
  if (active && active.id !== id) {
    const rows = store.ratingsForPeriod(active.id, mode);
    const ranks = rankByRating(rows);
    for (const row of rows) {
      const rank = ranks.get(row.playerId) ?? rows.length;
      store.saveMonthlyReward({ periodId: active.id, playerId: row.playerId, finalRank: rank, reward: rewardForRank(rank), claimedAt: null });
    }
    active.status = 'archived';
    active.rewardsFinalizedAt = now;
    store.saveRatingPeriod(active);
    archived.push(active.id);
  }
  const existing = store.ratingPeriod(id, mode);
  const current = existing ?? createPeriod(id, mode);
  if (current.status !== 'active' || current.rewardsFinalizedAt !== null) {
    current.status = 'active';
    current.rewardsFinalizedAt = null;
    store.saveRatingPeriod(current);
  } else if (!existing) {
    store.saveRatingPeriod(current);
  }
  return { archived, active: id };
}

// Public roster summary: no age curve/band internals; totalGrowth is server-computed.
export function publicUnitSummary(unit: UnitRecord, day = unit.ageEpochDay ?? unit.joinedDay) {
  const { ageBand: _band, growthBonus: _bonus, ageBaseDays: _base, ageEpochDay: _epoch, ...rest } = unitSummary(unit, day);
  return { ...rest, totalGrowth: growthRates(unit) };
}

// Compact roster summary for internal use.
export function unitSummary(unit: UnitRecord, day = unit.ageEpochDay ?? unit.joinedDay) {
  const cls = CLASSES[unit.classId];
  const band = ageBandOf(unit.age);
  return {
    id: unit.id, character: unit.character, name: unitName(unit), sex: unit.sex ?? null, portrait: unit.portrait ?? null, classId: unit.classId,
    className: cls.name, tier: cls.tier, stage: cls.stage, route: cls.route, species: unit.species, ranks: unit.ranks, level: unit.level, exp: unit.exp, hp: unit.hp, maxHp: unit.stats.hp,
    status: unit.status, equipped: unit.weapons[0] ?? null, items: unit.items.map(i => GAME_ITEMS[i.id as ItemKey]?.name ?? i.id),
    joinedDay: unit.joinedDay, weaponExp: unit.weaponExp, growthLog: unit.growthLog, drugCounts: unit.drugCounts,
    growthType: unit.growthType, growthTypeName: GROWTH_TYPE_NAMES[unit.growthType],
    age: unit.age, ageBand: band ? band.name : null, growthBonus: growthBonus(unit.growthType, unit.age),
    cycle: unit.cycle, lineageDepth: unit.lineageDepth, isProtagonist: !!unit.isProtagonist,
    ageBaseDays: unit.ageBaseDays, ageEpochDay: unit.ageEpochDay,
    lifespanYears: unit.lifespanYears, lifespanEndDay: lifespanEndDayOf(unit),
    daysUntilBirthday: daysUntilBirthday(unit, day), lifespanWarning: lifespanWarning(unit, day),
    growthAllocation: unit.growthAllocation ?? {}, classQualifications: unit.classQualifications ?? [],
    classMastery: unit.classMastery ?? {}, learnedSkills: unit.learnedSkills ?? [], equippedSkills: unit.equippedSkills ?? [],
    personalGrowth: unit.personalGrowth ?? null,
    inheritedGrowth: unit.inheritedGrowth ?? null, lockedRunId: unit.lockedRunId ?? null, lockedDispatchId: unit.lockedDispatchId ?? null,
    hasInheritance: !!unit.inheritance,
    // 身份来源：神主角、固定人物（开局同伴／任务加入，沿用角色表姓名）或随机招募（有自己的姓名）。
    origin: unitOrigin(unit),
    learnedArts: unit.learnedArts ?? [], equippedArts: unit.equippedArts ?? [], equipmentArts: equipmentArts(unit),
    // 装备资源实例：武器耐久、魔道书／杖次数与职业法术书次数（整备、维修与旅馆用）。
    weaponInstances: unit.weaponInstances ?? [], bookInstances: unit.bookInstances ?? [], spellbooks: unit.spellbooks ?? [],
    // The arena snapshot the browser needs to build AttackPlans and defense previews.
    snapshot: toSnapshot(unit),
  };
}

export type UnitOrigin = 'protagonist' | 'fixed' | 'recruit';

export function unitOrigin(unit: UnitRecord): UnitOrigin {
  return unit.isProtagonist ? 'protagonist' : unit.name ? 'recruit' : 'fixed';
}

export function unitDetail(unit: UnitRecord, day = unit.ageEpochDay ?? unit.joinedDay) {
  const cls = CLASSES[unit.classId];
  return {
    ...publicUnitSummary(unit, day),
    stats: unit.stats, caps: effectiveCaps(unit), con: unit.con,
    weapons: unit.weapons.map(id => ({ id, name: WEAPONS[id].name, type: WEAPONS[id].type, might: WEAPONS[id].might, hit: WEAPONS[id].hit, crit: WEAPONS[id].crit, range: WEAPONS[id].range })),
    ranks: unit.ranks, weaponExp: unit.weaponExp, skill: cls.tier,
    weaponInstances: unit.weaponInstances ?? [], bookInstances: unit.bookInstances ?? [],
    // 职业法术书（cast 用，每本独立次数；旅馆与食物恢复，见 INN_REST／USE_FOOD 的 spellbook 参数）。
    spellbooks: unit.spellbooks ?? [],
    arts: [...new Set([...(unit.equippedArts ?? []), ...equipmentArts(unit)])],
    equipmentSkills: unit.weapons.flatMap(id => WEAPONS[id].grants?.skill ? [WEAPONS[id].grants!.skill!] : []),
    growthLog: unit.growthLog, drugCounts: unit.drugCounts, joinedDay: unit.joinedDay, promotedFrom: unit.promotedFrom ?? null,
  };
}


// The whole visible state, shared by GET_STATE and the browser's camp page.
// 开局可自选的同伴：全部预设角色，去掉主角与剧情奖励人物（ren/ig/mira）。
export function companionPool(exclude: string[] = []): CharacterId[] {
  return CHARACTER_IDS.filter(id => !exclude.includes(id) && !QUEST_RECRUITS.includes(id));
}

export function startingCompanionPool(protagonist: string): CharacterId[] {
  return companionPool([protagonist]);
}

// 新账号只发占位主角，需要先完成自捏开局；老存档（已有多人）不再要求。
export function setupNeeded(player: Player, activeCount: number): boolean {
  return !player.flags.setupCompleted && !player.flags.companions && activeCount <= 1;
}

export function stateView(store: Store, player: Player) {
  const units = store.units(player.id);
  const active = units.filter(u => u.status === 'active');
  const date = dateOf(player.day);
  const cleared = player.flags.clearedRegions;
  return {
    player: { id: player.id, name: player.name, legion: player.legion, protagonist: player.protagonist },
    version: player.version ?? 0,
    eventCursor: store.latestEventId(player.id),
    day: player.day,
    date,
    gold: player.gold,
    bexp: player.bexp,
    arena: {
      points: player.arenaPoints, medals: player.arenaMedals, registered: player.registered,
      nextArenaDay: nextArenaDay(player.day), isArenaDay: isArenaDay(player.day),
      rank: { place: rankByRating(store.ratingsForPeriod(periodIdFor(Date.now()))).get(player.id) ?? null, change: 0 },
    },
    nextMonthStart: nextMonthStart(player.day),
    actionDays: nextArenaDay(player.day) - player.day,
    rosterLimit: ROSTER_LIMIT,
    rosterCount: active.length,
    units: units.map(unit => publicUnitSummary(unit, player.day)),
    inventory: store.inventory(player.id).map(row => ({ item: row.item, name: GAME_ITEMS[row.item].name, uses: row.uses, count: row.count })),
    recoveryBag: (player.flags.recoveryBag ?? []).map(row => ({ item: row.item, name: GAME_ITEMS[row.item]?.name ?? row.item, uses: row.uses })),
    regions: REGIONS.map(region => ({ ...region, cleared: cleared.includes(region.id) })),
    progress: { cleared: cleared.length, baseLevel: enemyLevel(player.day) },
    festival: { round: player.flags.festivalRound, year: player.flags.festivalYear, nextDay: nextAnnualWindowStart(player.day) },
    agentPlan: store.notes(player.id, 'plan')[0]?.text ?? null,
    agentLastSeen: player.flags.agentLastSeen ?? null,
    // 游历候选（ACCEPT_RECRUIT／DECLINE_RECRUIT 前一直保留，重连不重掷）。
    pendingRecruit: pendingRecruitView(player),
    // 账号级传承解锁（完成一次地区核心任务后永久开放，CLAIM_LEGACY 前置）。
    legacyUnlocked: !!player.flags.legacyUnlocked,
    // 控制租约（CLAIM_CONTROL）：租约期内只有持有方能写。
    control: player.flags.controlLease && player.flags.controlLease.expiresAt > Date.now() ? { ...player.flags.controlLease } : null,
    // 完美锻造券：下一次把该武器交给角色时生成 +10 耐久的实例。
    perfectWeapons: Object.fromEntries(Object.entries(player.flags.perfectWeapons ?? {}).filter(([, n]) => (n ?? 0) > 0)),
    setup: {
      needed: setupNeeded(player, active.length),
      pool: companionPool().map(id => ({ id, name: CHARACTERS[id].name, classId: CHARACTERS[id].classId, level: 1 })),
      chosen: player.flags.companions ?? null,
      protagonist: {
        classes: PROTAGONIST_CLASSES.map(c => ({ classId: c.classId, name: c.name, character: c.character, con: CLASSES[c.classId].con })),
        tendencies: Object.entries(PROTAGONIST_TENDENCIES).map(([id, t]) => ({ id, name: t.name })),
        portraits: CHARACTER_IDS.map(id => ({ id, name: CHARACTERS[id].name })),
        budget: PROTAGONIST_ALLOCATION_BUDGET,
        maxPerStat: PROTAGONIST_ALLOCATION_MAX,
      },
    },
    seed: { day: 0 },
  };
}

function pendingRecruitView(player: Player) {
  const pending = player.flags.pendingRecruit;
  if (!pending) return null;
  const { candidate } = pending;
  return {
    id: pending.id, region: pending.region, regionName: regionById(pending.region).name, day: pending.day,
    name: candidate.name, sex: candidate.sex, species: candidate.species, classId: candidate.classId,
    className: CLASSES[candidate.classId].name, level: recruitLevel(player.day), portrait: recruitPortrait(pending.seed),
  };
}

export function activeSnapshot(store: Store, player: Player): SnapshotUnit[] {
  // 派遣中的角色仍算存活，但不能参加其他战斗（docs/13 §5.5）。
  return store.units(player.id).filter(u => u.status === 'active' && !u.lockedDispatchId).map(toSnapshot);
}

export function defenseOrSeed(player: Player): Defense {
  return player.defense ?? officialOpponents()[0];
}
