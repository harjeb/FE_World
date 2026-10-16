import type { CharacterId } from '../common/data/characters.ts';
import { CHARACTERS } from '../common/data/characters.ts';
import { CLASSES } from '../common/data/classes.ts';
import { STAT_KEYS } from '../common/data/types.ts';
import { WEAPONS } from '../common/data/weapons.ts';
import { GAME_ITEMS } from '../common/game/items.ts';
import type { ItemKey } from '../common/game/items.ts';
import { addWeaponExp, ageAt, effectiveCaps, growthRates, toSnapshot } from '../common/game/model.ts';
import { GROWTH_TYPE_NAMES, ageBandOf, growthBonus } from '../common/data/growth-types.ts';
import type { UnitRecord } from '../common/game/model.ts';
import { dateOf, isArenaDay, nextArenaDay, nextMonthStart, REGIONS, regionById, baseLevel, DAYS_PER_SEASON } from '../common/game/calendar.ts';
import { summarizeOutcome, weaponsUsed } from '../common/game/battles.ts';
import type { BattleRecord } from '../common/game/battles.ts';
import { attackProgress, createArenaDay, officialOpponents, OPPONENT_COUNT, runDefenseTrials, ARENA_GOLD } from '../common/game/arena.ts';
import type { ArenaDayRecord } from '../common/game/arena.ts';
import type { Defense, SnapshotUnit } from '../common/arena/rules.ts';
import type { Store, Player, SnapshotData } from './store.ts';
import { SEED_DAY } from './store.ts';

export const ROSTER_LIMIT = 18;

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
export function syncPlayer(store: Store, player: Player): Player {
  const month = Math.floor(player.day / DAYS_PER_SEASON);
  if (player.flags.shopMonth !== month) {
    store.refillShop(player.id, month);
    player.flags.shopMonth = month;
  }
  if (player.registered && isArenaDay(player.day) && !store.arenaDay(player.id, player.day)) {
    const snapshot = snapshotData(store, player);
    store.saveSnapshot(player.id, player.day, snapshot);
    const day = createArenaDay(player.id, player.day, matchedOpponents(store, player), snapshot.defense);
    store.saveArenaDay(day);
    store.addEvent(player.id, 'arena', `竞技场日：${day.opponents.length} 个对手已生成。`, { day: player.day });
  }
  for (const day of store.unsettledArenaDays(player.id)) {
    if (day.day < player.day) settleArenaDay(store, player, day);
  }
  // Ages follow the personal calendar (1 year per 120 days), which moves the growth-type band.
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
  // 只用报名时锁定的防守；旧记录没有 defense 时才回退到当前配置 (docs/00 §10.1)。
  const defense = day.defense ?? player.defense ?? officialOpponents()[0];
  const rosters = officialOpponents().map(o => ({ legion: o.legion, roster: o.slots.map(s => s.unit) }));
  runDefenseTrials(day, defense, rosters);
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
  store.saveArenaDay(day);
  store.addEvent(player.id, 'arena', `竞技场日结算：进攻 ${wins} 胜 ${losses} 负，积分 +${progress.points}，金币 +${gold}。`, {
    day: day.day, wins, losses, points: progress.points, gold,
  });
}

export interface BattleRewards { gold: number; items: { item: ItemKey; count: number }[]; levelUps: { unit: string; level: number }[]; deaths: string[]; weaponRanks: { unit: string; type: string; rank: string }[] }

// Writes a finished battle back to the roster: growth, weapon experience, deaths, rewards and the
// replay (docs/00 §7.1 for death, §8.3 for rewards).
export function applyBattleOutcome(store: Store, player: Player, record: BattleRecord): BattleRewards {
  const outcome = summarizeOutcome(record);
  const lethal = record.mode === 'field' || record.mode === 'festival';
  const rewards: BattleRewards = { gold: 0, items: [], levelUps: [], deaths: [], weaponRanks: [] };
  const units = store.units(player.id);
  const used = weaponsUsed(record);
  for (const battleUnit of record.state.units.filter(u => u.side === 'player')) {
    const unit = units.find(u => u.id === battleUnit.id);
    if (!unit) continue;
    if (battleUnit.alive) {
      if (record.kind === 'field') {
        unit.level = battleUnit.level;
        unit.exp = battleUnit.exp;
        unit.stats = { ...battleUnit.stats };
        // The engine already rolled the gains; copy its level-ups into the unit's history (名册「历次升级」).
        for (const event of record.events) {
          if (event.t !== 'levelUp' || event.unit !== battleUnit.id) continue;
          unit.growthLog.push({ level: event.level, gains: event.gains });
          rewards.levelUps.push({ unit: unit.id, level: event.level });
        }
      }
      for (const type of used.get(battleUnit.id) ?? []) {
        const rank = addWeaponExp(unit, type, 2);
        if (rank) rewards.weaponRanks.push({ unit: unit.id, type, rank });
      }
      store.saveUnit(unit, player.id);
    } else if (lethal) {
      if (unit.character === player.protagonist) {
        // 神主角 HP 归零只撤退，不死亡 (docs/00 §7.1).
        unit.status = 'active';
      } else {
        unit.status = 'dead';
        rewards.deaths.push(unit.id);
      }
      store.saveUnit(unit, player.id);
    }
  }
  const won = outcome.winner === 'player';
  if (record.mode === 'field' && won) {
    const regionId = record.region ?? 1;
    rewards.gold = 180 + record.state.turn * 6;
    const region = regionById(regionId);
    const material: ItemKey = region.id % 3 === 0 ? 'ore' : region.id % 3 === 1 ? 'herb' : 'wood';
    const count = 2 + Math.floor(record.state.turn / 4);
    store.addInventory(player.id, material, 0, count);
    rewards.items.push({ item: material, count });
    if (!player.flags.clearedRegions.includes(region.id)) {
      player.flags.clearedRegions.push(region.id);
      store.addEvent(player.id, 'region', `首次讨伐 ${region.name}（已讨伐 ${player.flags.clearedRegions.length} 个地区）。`, { region: region.id });
    }
    player.gold += rewards.gold;
  }
  if (record.mode === 'festival') {
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
  if (record.mode === 'arena' || record.mode === 'festival') store.saveReplay(player.id, record, Date.now());
  return rewards;
}

// Compact roster summary for GET_STATE / GET_ROSTER.
export function unitSummary(unit: UnitRecord) {
  const cls = CLASSES[unit.classId];
  const band = ageBandOf(unit.age);
  return {
    id: unit.id, character: unit.character, name: characterName(unit.character), classId: unit.classId,
    className: cls.name, tier: cls.tier, stage: cls.stage, route: cls.route, species: unit.species, ranks: unit.ranks, level: unit.level, exp: unit.exp, hp: unit.hp, maxHp: unit.stats.hp,
    status: unit.status, equipped: unit.weapons[0] ?? null, items: unit.items.map(i => GAME_ITEMS[i.id as ItemKey]?.name ?? i.id),
    joinedDay: unit.joinedDay, weaponExp: unit.weaponExp, growthLog: unit.growthLog, drugCounts: unit.drugCounts,
    growthType: unit.growthType, growthTypeName: GROWTH_TYPE_NAMES[unit.growthType],
    age: unit.age, ageBand: band ? band.name : null, growthBonus: growthBonus(unit.growthType, unit.age),
    // The arena snapshot the browser needs to build AttackPlans and defense previews.
    snapshot: toSnapshot(unit),
  };
}

export function unitDetail(unit: UnitRecord) {
  const cls = CLASSES[unit.classId];
  return {
    ...unitSummary(unit),
    stats: unit.stats, caps: effectiveCaps(unit), con: unit.con,
    growth: growthRates(unit),
    weapons: unit.weapons.map(id => ({ id, name: WEAPONS[id].name, type: WEAPONS[id].type, might: WEAPONS[id].might, hit: WEAPONS[id].hit, crit: WEAPONS[id].crit, range: WEAPONS[id].range })),
    ranks: unit.ranks, weaponExp: unit.weaponExp, skill: cls.tier,
    growthLog: unit.growthLog, drugCounts: unit.drugCounts, joinedDay: unit.joinedDay, promotedFrom: unit.promotedFrom ?? null,
    baseAge: unit.baseAge,
  };
}

function characterName(character: CharacterId): string {
  return CHARACTERS[character]?.name ?? character;
}
const CHARACTER_NAMES = Object.fromEntries(Object.entries(CHARACTERS).map(([id, c]) => [id, c.name])) as Record<CharacterId, string>;

// The whole visible state, shared by GET_STATE and the browser's camp page.
export function stateView(store: Store, player: Player) {
  const units = store.units(player.id);
  const active = units.filter(u => u.status === 'active');
  const date = dateOf(player.day);
  const cleared = player.flags.clearedRegions;
  return {
    player: { id: player.id, name: player.name, legion: player.legion, protagonist: player.protagonist },
    day: player.day,
    date,
    gold: player.gold,
    bexp: player.bexp,
    arena: {
      points: player.arenaPoints, medals: player.arenaMedals, registered: player.registered,
      nextArenaDay: nextArenaDay(player.day), isArenaDay: isArenaDay(player.day),
      rank: { place: Math.max(1, 300 - Math.floor(player.arenaPoints / 10)), change: 0 },
    },
    nextMonthStart: nextMonthStart(player.day),
    actionDays: nextArenaDay(player.day) - player.day,
    rosterLimit: ROSTER_LIMIT,
    rosterCount: active.length,
    units: units.map(unitSummary),
    inventory: store.inventory(player.id).map(row => ({ item: row.item, name: GAME_ITEMS[row.item].name, uses: row.uses, count: row.count })),
    regions: REGIONS.map(region => ({ ...region, cleared: cleared.includes(region.id) })),
    progress: { cleared: cleared.length, baseLevel: baseLevel(cleared.length) },
    festival: { round: player.flags.festivalRound, year: player.flags.festivalYear, nextDay: (Math.floor(player.day / 120) + 1) * 120 },
    agentPlan: store.notes(player.id, 'plan')[0]?.text ?? null,
    agentLastSeen: player.flags.agentLastSeen ?? null,
    seed: { day: SEED_DAY },
  };
}

export function activeSnapshot(store: Store, player: Player): SnapshotUnit[] {
  return store.units(player.id).filter(u => u.status === 'active').map(toSnapshot);
}

export function defenseOrSeed(player: Player): Defense {
  return player.defense ?? officialOpponents()[0];
}
