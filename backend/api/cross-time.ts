import type { Player, Store } from './store.ts';
import type { BattleRecord } from '../common/game/battles.ts';
import type { BattleRewards } from './services.ts';
import { isActiveRun } from '../common/game/expedition.ts';
import { CROSS_TIME_QUEST } from '../common/game/quests.ts';
import { CROSS_TIME_QUEST_ID, CROSS_TIME_SHARD, CROSS_TIME_ROSTER, crossTimeSlots } from '../common/game/cross-time.ts';
import { ROSTER_LIMIT } from '../common/game/model.ts';
import { stockUses } from '../common/game/items.ts';
import { seedRng, nextU32 } from '../common/engine/rng.ts';

export function crossTimeRecruitView(store: Store, player: Player) {
  const flags = player.flags.crossTime;
  const units = store.units(player.id);
  const unlocked = !!flags?.clearedNormal;
  const shards = store.countInventory(player.id, CROSS_TIME_SHARD);
  const slotsUsed = crossTimeSlots(units);
  const rosterFull = units.filter(u => u.status === 'active').length >= ROSTER_LIMIT;
  const run = store.activeRun(player.id);
  const busy = !!store.activeBattle(player.id) || isActiveRun(run) || !!store.activeAnnualEntry(player.id);
  return { unlocked, shards, cost: 3, slotsUsed, slotLimit: 3, rosterFull, busy,
    recruits: CROSS_TIME_ROSTER.map(identity => {
      const exchanged = (flags?.exchanged ?? []).includes(identity.id);
      const blockedReason = !unlocked ? '先普通通关时空试炼' : exchanged ? '此身份已经兑换过' : busy ? '请先返回营地' : slotsUsed >= 3 ? '时空名额已满' : rosterFull ? '名册已满' : shards < 3 ? '需要3枚时空碎片' : null;
      return { identityId: identity.id, name: identity.name, classId: identity.classId, personalSkill: identity.personalSkill, level: 20, growthType: 'growth', exchanged, eligible: blockedReason === null, blockedReason };
    }),
  };
}

export function crossTimeQuestView(store: Store, player: Player, regions: number[]) {
  if (player.day < 1000) return null;
  const flags = player.flags.crossTime;
  const inProgress = store.activeBattle(player.id)?.questId === CROSS_TIME_QUEST_ID;
  return { ...CROSS_TIME_QUEST, region: flags?.acceptedRegion ?? null, acceptedRegion: flags?.acceptedRegion ?? null,
    accountGlobal: true, availableRegions: flags?.acceptedRegion ? [flags.acceptedRegion] : regions,
    available: regions.length > 0 && !store.activeBattle(player.id) && !isActiveRun(store.activeRun(player.id)) && !store.activeAnnualEntry(player.id),
    done: !!flags?.clearedNormal, claimed: !!flags?.clearedNormal, inProgress,
    repeatable: true, autoReward: true, enemyCount: 17, stageNames: ['终焉诸将'], toDay: player.day + 8, risk: 'permadeath',
    enemyLevel: 48, enemyLevels: { normal: 48, hard: 52 },
    hardAvailable: true, hardUnlocked: !!flags?.clearedNormal,
    enemyPreview: Object.fromEntries((['normal', 'hard'] as const).map(difficulty => [difficulty, CROSS_TIME_ROSTER.map(row => ({
      identityId: row.id, name: row.name, classId: row.classId, level: difficulty === 'hard' ? 52 : 48,
      stats: difficulty === 'hard' ? row.hard52 : row.normal48, con: row.con + (difficulty === 'hard' ? 2 : 0),
      personalSkill: row.personalSkill, pos: row.pos, weapons: row.weapons, books: row.books, boss: row.boss, group: row.group,
    }))])),
    firstClearRewards: {
      normal: { gold: 2500, items: CROSS_TIME_QUEST.reward.items, shardChance: 0, available: !flags?.clearedNormal },
      hard: { gold: 3500, items: [['brave_sword', 1], ['full_meal', 2]], shardChance: .2, available: !flags?.clearedHard },
    },
    repeatRewards: { normal: { gold: 800, shardChance: .2 }, hard: { gold: 1500, shardChance: .2 } },
  };
}

export function crossTimeVictory(record: BattleRecord): boolean {
  return record.state.result?.winner === 'player' && record.state.units.some(u => u.side === 'enemy' && u.id === 'cross-time:lu-bu' && !u.alive);
}

// Called inside dispatch's transaction. The saved record and command receipt freeze the roll.
export function grantCrossTimeRewards(store: Store, player: Player, record: BattleRecord, rewards: BattleRewards): void {
  if (!crossTimeVictory(record)) return;
  const flags = player.flags.crossTime ??= {};
  const hard = record.state.aiDifficulty === 'hard';
  const first = hard ? !flags.clearedHard : !flags.clearedNormal;
  rewards.gold = hard ? first ? 3500 : 1500 : first ? 2500 : 800;
  const items: [Parameters<Store['addInventory']>[1], number][] = first
    ? hard ? [['brave_sword', 1], ['full_meal', 2]] : [['silver_sword', 1], ['vulnerary', 2], [CROSS_TIME_SHARD, 3]] : [];
  if ((hard || !first) && nextU32(seedRng(`cross-time-reward:${record.id}:${record.seed}`)) / 0x100000000 < .2) items.push([CROSS_TIME_SHARD, 1]);
  for (const [item, count] of items) { store.addInventory(player.id, item, stockUses(item), count); rewards.items.push({ item, count }); }
  player.gold += rewards.gold;
  if (hard) flags.clearedHard = true;
  else flags.clearedNormal = true;
  player.flags.questsDone = [...new Set([...(player.flags.questsDone ?? []), CROSS_TIME_QUEST_ID])];
  player.flags.questRewardsClaimed = [...new Set([...(player.flags.questRewardsClaimed ?? []), CROSS_TIME_QUEST_ID])];
}
