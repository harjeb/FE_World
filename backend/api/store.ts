import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Defense } from '../common/arena/rules.ts';
import type { RandomRecruit } from '../common/game/random-recruit.ts';
import type { ItemKey } from '../common/game/items.ts';
import { SHOP_STOCK } from '../common/game/items.ts';
import { createUnit, normalizeUnit } from '../common/game/model.ts';
import type { UnitRecord } from '../common/game/model.ts';
import type { CharacterId } from '../common/data/characters.ts';
import type { LegacyRecord } from '../common/game/legacy.ts';
import { normalizeLegacy } from '../common/game/legacy.ts';
import type { ProductionOrder } from '../common/game/production.ts';
import type { RunRecord } from '../common/game/expedition.ts';
import type { AnnualEntry } from '../common/game/annual.ts';
import type { DispatchRecord } from '../common/game/dispatch.ts';
import type { MonthlyRatingReward, RatingPeriod, RatingRow } from '../common/game/ratings.ts';
import type { BattleRecord } from '../common/game/battles.ts';
import type { ArenaDayRecord } from '../common/game/arena.ts';
import { isArenaDay } from '../common/game/calendar.ts';

import type { WeaponId, WeaponInstance } from '../common/data/weapons.ts';

export interface PlayerFlags {
  calendarVersion?: 120 | 500;
  calendarMigration?: { from: 120 | 500; at: number; oldDay: number; newDay: number; legacySnapshotIds: string[] };
  storedWeapons?: WeaponInstance[];
  // 放回仓库的魔道书／杖剩余次数（与 storedWeapons 一样按先进先出对应仓库里的同名实物）。
  storedBooks?: { id: WeaponId; charges: number; maxCharges: number }[];
  hardUnlocks?: { regions: number[]; dungeons: number[]; quests: string[] };
  clearedRegions: number[];
  // 世界地图开荒：玩家显式选择的已解锁地区（canonical 列表，含旧档认领结果；clearedRegions 永不重置，
  // 实际可用地区 = unlockedRegions ∪ clearedRegions，见 common/game/region-map.ts）。
  unlockedRegions?: number[];
  // 各地区探索度（0–100）；缺字段的旧档按已讨伐地区一次性补满，之后独立累计。
  regionExploration?: Record<number, number>;
  // 历史首次通关等级记录；新出征按日期计算，不再用此值锁重打难度。
  firstClearLevel?: Record<number, number>;
  shopMonth: number;
  festivalRound: number;
  festivalYear: number;
  chapterExpClaimed: number[];
  // 已完成的八章主线（docs/13 §6.3）。
  storyCompleted?: number[];
  // 回收袋（docs/13 §2.3）：活动途中死亡的装备先放这里，活动结束后再入仓库。
  recoveryBag?: { item: ItemKey; uses: number; weapon?: WeaponInstance; book?: { id: WeaponId; charges: number; maxCharges: number } }[];
  // 职业市场月度购买计数（docs/13 §5.4）：key 为现实月，值为当月已购买新资格数。
  classPurchases?: Record<string, number>;
  recruitFails?: number;
  // 地区任务与声望（docs/20）：已完成任务、已领奖任务、各地区声望。
  questsDone?: string[];
  questRewardsClaimed?: string[];
  questBoxes?: Record<string, number>;
  regionReputation?: Record<number, number>;
  // 开局自选的两名同伴（docs/20 §5.1）：未设置表示还没选；选过之后即使减员也不再要求重选。
  companions?: CharacterId[];
  // 自捏开局是否已完成（docs/00「神主角」）：完成后不再要求重选，也不允许重开刷初始。
  setupCompleted?: boolean;
  // 紧急补员：上次领取时的战死人数，防止一次损失重复领取（docs/00 §3.3）。
  emergencyClaimed?: number;
  // 最近一次 Agent 连接上报时间 (docs/06)，用于区分在线/离线。
  agentLastSeen?: number;
  // 账号级传承解锁：完成一次核心任务后永久开放（docs/00 §7.3）。
  legacyUnlocked?: boolean;
  // 游历候选：成功后先保存，接受/拒绝前不重掷。
  pendingRecruit?: { id: string; region: number; day: number; seed: string; candidate: RandomRecruit };
  recruitFailsByRegion?: Record<number, number>;
  // 酒馆季度候选：同一季度只刷新一次。
  tavernQuarter?: number;
  tavernCandidates?: Record<number, { id: string; price: number; hired: boolean; candidate: RandomRecruit }[]>;
  annualRewardsClaimed?: string[];
  towerCleared?: string[];
  challengeRewardsClaimed?: string[];
  minigameQuarter?: number;
  minigamePlays?: number;
  // 完美锻造产出的 +10 强化券：下一次把该武器装入角色栏时消耗。
  perfectWeapons?: Record<string, number>;
  controlLease?: { owner: string; expiresAt: number };
}

export interface Player {
  id: string;
  accountId: string;
  name: string;
  legion: string;
  day: number;
  gold: number;
  bexp: number;
  arenaPoints: number;
  arenaMedals: number;
  registered: boolean;
  protagonist: string;
  defense: Defense | null;
  flags: PlayerFlags;
  version: number;
  createdAt: number;
}

export interface CommandReceipt { commandId: string; op: number; payloadHash: string; response: unknown; committedAt: number }
export interface MemorialRow { unitId: string; playerId: string; data: MemorialData; createdAt: number }
export interface MemorialData { unitId: string; name: string; character: string; classId: string; level: number; cause: 'death' | 'retired' | 'age'; atDay: number; battleId: string | null; stats: unknown; lineageDepth: number }

export interface InventoryRow { id: number; item: ItemKey; uses: number; count: number }
export interface EventRow { id: number; kind: string; text: string; data: unknown; createdAt: number }
export interface NoteRow { id: number; kind: string; text: string; battleId: string | null; createdAt: number; turn?: number | null }
export interface SnapshotRow { id: string; day: number; data: SnapshotData; createdAt: number }
export interface SnapshotData { roster: unknown[]; defense: Defense | null; label: string }
export interface DueTask { id: number; playerId: string | null; kind: string; dueAt: number; payload: unknown }
export interface ReplayRow { id: string; playerId: string; data: BattleRecord; publicAt: number; createdAt: number }

const SEED_LEVELS: [string, number][] = [
  ['erin', 11], ['victor', 11], ['gustav', 10], ['lina', 10], ['owen', 10], ['noah', 9],
  ['karl', 9], ['sera', 9], ['ren', 9], ['roland', 9], ['ig', 8], ['mira', 8],
];
// 演示等级表：开局主角与自选同伴按此等级加入，保证界面立即可玩。
export const DEMO_LEVEL: Record<string, number> = Object.fromEntries(SEED_LEVELS);
export const PROTAGONIST: CharacterId = 'erin';

// The prototype's fixed moment: the arena day that ends game month 7 (docs/11「演示页面」). A new
// player starts here with a trained roster so every screen is immediately playable.
export const NEW_GAME_DAY = 0;
export const NEW_GAME_GOLD = 13_120;
export const NEW_GAME_BEXP = 0;
// 演示/测试用的旧起点，仅显式演示或测试夹具使用。
export const SEED_DAY = 999;
export const SEED_GOLD = 13_120;
export const SEED_BEXP = 340;

export class Store {
  readonly db: DatabaseSync;

  // 业务写入与收据同事务：任何中途异常回滚整次命令。
  transaction<T>(fn: () => T): T {
    if (this.db.isTransaction) return fn();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  // ---- accounts and auth -------------------------------------------------

  createAccount(name: string, passwordHash: string | null): string {
    const id = randomUUID();
    this.db.prepare('INSERT INTO accounts (id, name, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(id, name, passwordHash, Date.now());
    return id;
  }

  accountByName(name: string): { id: string; name: string; passwordHash: string | null } | null {
    const row = this.db.prepare('SELECT id, name, password_hash FROM accounts WHERE name = ?').get(name) as
      { id: string; name: string; password_hash: string | null } | undefined;
    return row ? { id: row.id, name: row.name, passwordHash: row.password_hash } : null;
  }

  createToken(accountId: string, kind: 'agent' | 'web', label: string | null): string {
    const token = kind === 'agent' ? `sk_${randomUUID().replace(/-/g, '')}` : `ws_${randomUUID().replace(/-/g, '')}`;
    this.db.prepare('INSERT INTO tokens (token, account_id, kind, label, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(token, accountId, kind, label, Date.now());
    return token;
  }

  resolveToken(token: string): { accountId: string; kind: string } | null {
    const row = this.db.prepare('SELECT account_id, kind FROM tokens WHERE token = ?').get(token) as
      { account_id: string; kind: string } | undefined;
    return row ? { accountId: row.account_id, kind: row.kind } : null;
  }

  createSession(accountId: string): string {
    const token = randomUUID().replace(/-/g, '');
    this.db.prepare('INSERT INTO sessions (token, account_id, created_at, last_seen) VALUES (?, ?, ?, ?)')
      .run(token, accountId, Date.now(), Date.now());
    return token;
  }

  resolveSession(token: string): string | null {
    const row = this.db.prepare('SELECT account_id, last_seen FROM sessions WHERE token = ?').get(token) as { account_id: string; last_seen: number } | undefined;
    if (!row) return null;
    // 30 天不活跃的网页会话失效；Agent token 独立且不随网页会话过期。
    if (Date.now() - row.last_seen > 30 * 24 * 60 * 60 * 1000) {
      this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      return null;
    }
    this.db.prepare('UPDATE sessions SET last_seen = ? WHERE token = ?').run(Date.now(), token);
    return row.account_id;
  }

  // ---- players -----------------------------------------------------------

  createPlayer(accountId: string, name: string, legion: string): Player {
    const id = randomUUID();
    const flags: PlayerFlags = { hardUnlocks: { regions: [], dungeons: [], quests: [] }, calendarVersion: 500, clearedRegions: [], regionExploration: {}, shopMonth: 0, festivalRound: 0, festivalYear: 0, chapterExpClaimed: [] };
    this.db.prepare(`INSERT INTO players
      (id, account_id, name, legion, day, gold, bexp, arena_points, arena_medals, registered, protagonist, defense, flags, version, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, accountId, name, legion, NEW_GAME_DAY, NEW_GAME_GOLD, NEW_GAME_BEXP, 0, 0, 1, PROTAGONIST, JSON.stringify(null), JSON.stringify(flags), 0, Date.now());
    // 开局先发一名占位主角；玩家在初始界面自捏神主角并选两名同伴（docs/00「神主角」、docs/13 §开局）。
    const unit = createUnit(PROTAGONIST, 1, `u_${PROTAGONIST}`, NEW_GAME_DAY, true);
    unit.isProtagonist = true;
    this.saveUnit(unit, id, 0);
    this.addInventory(id, 'vulnerary', 3, 5);
    this.addInventory(id, 'herb', 0, 6);
    this.addInventory(id, 'ore', 0, 4);
    this.addInventory(id, 'wood', 0, 4);
    this.addInventory(id, 'seed', 0, 4);
    this.refillShop(id, flags.shopMonth);
    this.addEvent(id, 'account', `军团建立：${legion}。`, {});
    return this.getPlayer(id)!;
  }

  // Project only settlement evidence; never deserialize historical battle boards.
  hardUnlockEvidence(playerId: string): { kind: 'region' | 'run'; region: number; questId: string | null }[] {
    return this.db.prepare(`
      SELECT 'region' AS kind, json_extract(data, '$.region') AS region, NULL AS questId
      FROM battles WHERE player_id = ?
        AND json_extract(data, '$.mode') = 'field'
        AND json_extract(data, '$.state.result.winner') = 'player'
        AND COALESCE(json_extract(data, '$.state.aiDifficulty'), 'normal') = 'normal'
        AND COALESCE(json_extract(data, '$.questId'), '') = ''
        AND COALESCE(json_extract(data, '$.runId'), '') = ''
        AND NOT COALESCE(json_extract(data, '$.dungeon'), 0)
        AND COALESCE(json_extract(data, '$.challengeId'), '') = ''
      UNION ALL
      SELECT 'run' AS kind, json_extract(data, '$.region') AS region, json_extract(data, '$.questId') AS questId
      FROM runs WHERE player_id = ? AND state = 'completed'
        AND COALESCE(json_extract(data, '$.aiDifficulty'), 'normal') = 'normal'
    `).all(playerId, playerId) as { kind: 'region' | 'run'; region: number; questId: string | null }[];
  }

  getPlayer(id: string): Player | null {
    const row = this.db.prepare('SELECT * FROM players WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? rowToPlayer(row) : null;
  }

  getPlayerByAccount(accountId: string): Player | null {
    const row = this.db.prepare('SELECT * FROM players WHERE account_id = ?').get(accountId) as Record<string, unknown> | undefined;
    return row ? rowToPlayer(row) : null;
  }

  allPlayers(): Player[] {
    return (this.db.prepare('SELECT * FROM players').all() as Record<string, unknown>[]).map(rowToPlayer);
  }

  savePlayer(player: Player, expectedVersion?: number): void {
    const result = expectedVersion === undefined
      ? this.db.prepare(`UPDATE players SET day = ?, gold = ?, bexp = ?, arena_points = ?, arena_medals = ?,
          registered = ?, protagonist = ?, defense = ?, flags = ?, version = ? WHERE id = ?`)
        .run(player.day, player.gold, player.bexp, player.arenaPoints, player.arenaMedals,
          player.registered ? 1 : 0, player.protagonist, JSON.stringify(player.defense), JSON.stringify(player.flags), player.version, player.id)
      : this.db.prepare(`UPDATE players SET day = ?, gold = ?, bexp = ?, arena_points = ?, arena_medals = ?,
          registered = ?, protagonist = ?, defense = ?, flags = ?, version = ? WHERE id = ? AND version = ?`)
        .run(player.day, player.gold, player.bexp, player.arenaPoints, player.arenaMedals,
          player.registered ? 1 : 0, player.protagonist, JSON.stringify(player.defense), JSON.stringify(player.flags), player.version, player.id, expectedVersion);
    if (Number(result.changes) === 0) throw new Error('PLAYER_VERSION_CONFLICT: 玩家状态已被其他连接修改');
  }

  // ---- units -------------------------------------------------------------

  units(playerId: string): UnitRecord[] {
    return (this.db.prepare('SELECT data FROM units WHERE player_id = ? ORDER BY position').all(playerId) as { data: string }[])
      .map(row => this.readUnit(playerId, row.data));
  }

  unit(playerId: string, unitId: string): UnitRecord | null {
    const row = this.db.prepare('SELECT data FROM units WHERE player_id = ? AND id = ?').get(playerId, unitId) as { data: string } | undefined;
    return row ? this.readUnit(playerId, row.data) : null;
  }

  private readUnit(playerId: string, data: string): UnitRecord {
    const unit = normalizeUnit(JSON.parse(data) as UnitRecord);
    // Old growth claims accidentally stored numeric contracts. Stop future backfill,
    // preserving every previously earned attribute and the original lineage lock.
    if (unit.inheritance && this.legacy(playerId, unit.inheritance.legacyId)?.mode === 'growth') unit.inheritance = undefined;
    return unit;
  }

  saveUnit(unit: UnitRecord, playerId: string, position?: number): void {
    normalizeUnit(unit);
    const existing = this.db.prepare('SELECT position FROM units WHERE player_id = ? AND id = ?').get(playerId, unit.id) as { position: number } | undefined;
    if (existing) {
      this.db.prepare('UPDATE units SET data = ? WHERE player_id = ? AND id = ?').run(JSON.stringify(unit), playerId, unit.id);
    } else {
      this.db.prepare('INSERT INTO units (id, player_id, position, data) VALUES (?, ?, ?, ?)')
        .run(unit.id, playerId, position ?? this.units(playerId).length, JSON.stringify(unit));
    }
  }

  addUnit(playerId: string, unit: UnitRecord): void {
    this.saveUnit(unit, playerId, this.units(playerId).length);
  }

  removeUnit(playerId: string, unitId: string): void {
    this.db.prepare('DELETE FROM units WHERE player_id = ? AND id = ?').run(playerId, unitId);
  }

  // ---- inventory and shop ------------------------------------------------

  inventory(playerId: string): InventoryRow[] {
    return (this.db.prepare('SELECT id, item, uses, count FROM inventory WHERE player_id = ? ORDER BY id').all(playerId) as
      { id: number; item: string; uses: number; count: number }[])
      .map(r => ({ id: r.id, item: r.item as ItemKey, uses: r.uses, count: r.count }));
  }

  addInventory(playerId: string, item: ItemKey, uses: number, count: number): void {
    const row = this.db.prepare('SELECT id, uses, count FROM inventory WHERE player_id = ? AND item = ? AND uses = ?')
      .get(playerId, item, uses) as { id: number; count: number } | undefined;
    if (row) this.db.prepare('UPDATE inventory SET count = ? WHERE id = ?').run(row.count + count, row.id);
    else this.db.prepare('INSERT INTO inventory (player_id, item, uses, count) VALUES (?, ?, ?, ?)').run(playerId, item, uses, count);
  }

  // Removes up to `count`; returns how many were actually removed.
  takeInventory(playerId: string, item: ItemKey, count: number, uses?: number): number {
    const rows = this.db.prepare('SELECT id, count FROM inventory WHERE player_id = ? AND item = ? AND (? IS NULL OR uses = ?) ORDER BY id')
      .all(playerId, item, uses ?? null, uses ?? null) as { id: number; count: number }[];
    let left = count;
    for (const row of rows) {
      if (left <= 0) break;
      const take = Math.min(row.count, left);
      left -= take;
      if (take === row.count) this.db.prepare('DELETE FROM inventory WHERE id = ?').run(row.id);
      else this.db.prepare('UPDATE inventory SET count = ? WHERE id = ?').run(row.count - take, row.id);
    }
    return count - left;
  }

  // Takes one item from a single stack and returns that stack's remaining uses, or null if there is
  // none. `uses` picks the stack; otherwise the fullest goes first. Uses travel with the item, so a
  // half-used 伤药 never comes back full (TRANSFER_ITEM).
  takeStack(playerId: string, item: ItemKey, uses: number | null): number | null {
    const row = (uses === null
      ? this.db.prepare('SELECT id, uses, count FROM inventory WHERE player_id = ? AND item = ? ORDER BY uses DESC, id LIMIT 1').get(playerId, item)
      : this.db.prepare('SELECT id, uses, count FROM inventory WHERE player_id = ? AND item = ? AND uses = ? ORDER BY id LIMIT 1').get(playerId, item, uses)) as
      { id: number; uses: number; count: number } | undefined;
    if (!row) return null;
    if (row.count <= 1) this.db.prepare('DELETE FROM inventory WHERE id = ?').run(row.id);
    else this.db.prepare('UPDATE inventory SET count = ? WHERE id = ?').run(row.count - 1, row.id);
    return row.uses;
  }

  countInventory(playerId: string, item: ItemKey): number {
    const row = this.db.prepare('SELECT COALESCE(SUM(count), 0) AS n FROM inventory WHERE player_id = ? AND item = ?')
      .get(playerId, item) as { n: number };
    return row.n;
  }

  shop(playerId: string): { item: ItemKey; stock: number }[] {
    return (this.db.prepare('SELECT item, stock FROM shop WHERE player_id = ? ORDER BY rowid').all(playerId) as { item: string; stock: number }[])
      .map(r => ({ item: r.item as ItemKey, stock: r.stock }));
  }

  setShopStock(playerId: string, item: ItemKey, stock: number): void {
    this.db.prepare('INSERT INTO shop (player_id, item, stock) VALUES (?, ?, ?) ON CONFLICT(player_id, item) DO UPDATE SET stock = ?')
      .run(playerId, item, stock, stock);
  }

  refillShop(playerId: string, month: number): void {
    this.db.prepare('DELETE FROM shop WHERE player_id = ?').run(playerId);
    for (const row of SHOP_STOCK) this.setShopStock(playerId, row.item, row.stock);
  }

  // 旧档商店升级：同季度老存档的 shop 表只有旧库存行，缺当前商店新增行；
  // 只用 INSERT OR IGNORE 补插缺失行，不清空、不补满已消耗的库存。
  ensureShopRows(playerId: string): void {
    const insert = this.db.prepare('INSERT OR IGNORE INTO shop (player_id, item, stock) VALUES (?, ?, ?)');
    for (const row of SHOP_STOCK) insert.run(playerId, row.item, row.stock);
  }

  // ---- events, notes -----------------------------------------------------

  addEvent(playerId: string, kind: string, text: string, data: unknown): number {
    const result = this.db.prepare('INSERT INTO events (player_id, kind, text, data, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(playerId, kind, text, JSON.stringify(data ?? null), Date.now());
    const id = Number(result.lastInsertRowid);
    // 同事务写入 outbox：推送失败可按 event id 重试，events 表仍是最终事实来源。
    this.db.prepare('INSERT OR IGNORE INTO outbox (event_id, player_id, kind, payload, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, playerId, kind, JSON.stringify({ id, kind, text, data: data ?? null }), Date.now());
    return id;
  }

  pendingOutbox(limit = 100): { eventId: number; playerId: string; payload: unknown }[] {
    return (this.db.prepare('SELECT event_id, player_id, payload FROM outbox WHERE delivered_at IS NULL ORDER BY event_id LIMIT ?').all(limit) as { event_id: number; player_id: string; payload: string }[])
      .map(row => ({ eventId: row.event_id, playerId: row.player_id, payload: JSON.parse(row.payload) }));
  }

  markOutboxDelivered(eventIds: number[]): void {
    const now = Date.now();
    const update = this.db.prepare('UPDATE outbox SET delivered_at = ? WHERE event_id = ?');
    for (const id of eventIds) update.run(now, id);
  }

  events(playerId: string, sinceId: string | number = 0, limit = 100): EventRow[] {
    return (this.db.prepare('SELECT id, kind, text, data, created_at FROM events WHERE player_id = ? AND id > ? ORDER BY id LIMIT ?')
      .all(playerId, sinceId, limit) as { id: number; kind: string; text: string; data: string; created_at: number }[])
      .map(r => ({ id: r.id, kind: r.kind, text: r.text, data: JSON.parse(r.data), createdAt: r.created_at }));
  }

  latestEventId(playerId: string): string {
    const row = this.db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM events WHERE player_id = ?').get(playerId) as { id: number };
    return String(row.id);
  }

  addNote(playerId: string, kind: string, text: string, battleId: string | null, turn: number | null = null): void {
    this.db.prepare('INSERT INTO notes (player_id, kind, text, battle_id, created_at, turn) VALUES (?, ?, ?, ?, ?, ?)')
      .run(playerId, kind, text, battleId, Date.now(), turn);
  }

  // 一场战斗的 Agent 阶段意图与点评，按写入顺序。
  notesForBattle(playerId: string, battleId: string): NoteRow[] {
    return (this.db.prepare('SELECT id, kind, text, battle_id, created_at, turn FROM notes WHERE player_id = ? AND battle_id = ? ORDER BY id LIMIT 500').all(playerId, battleId) as { id: number; kind: string; text: string; battle_id: string | null; created_at: number; turn: number | null }[])
      .map(r => ({ id: r.id, kind: r.kind, text: r.text, battleId: r.battle_id, createdAt: r.created_at, turn: r.turn ?? null }));
  }

  notes(playerId: string, kind?: string): NoteRow[] {
    const rows = kind
      ? this.db.prepare('SELECT id, kind, text, battle_id, created_at FROM notes WHERE player_id = ? AND kind = ? ORDER BY id DESC LIMIT 50').all(playerId, kind)
      : this.db.prepare('SELECT id, kind, text, battle_id, created_at FROM notes WHERE player_id = ? ORDER BY id DESC LIMIT 50').all(playerId);
    return (rows as { id: number; kind: string; text: string; battle_id: string | null; created_at: number }[])
      .map(r => ({ id: r.id, kind: r.kind, text: r.text, battleId: r.battle_id, createdAt: r.created_at }));
  }

  // ---- battles -----------------------------------------------------------

  saveBattle(record: BattleRecord): void {
    this.db.prepare('INSERT INTO battles (id, player_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(player_id, id) DO UPDATE SET data = ?, updated_at = ?')
      .run(record.id, record.playerId, JSON.stringify(record), record.createdAt, record.updatedAt, JSON.stringify(record), record.updatedAt);
  }

  battle(playerId: string, battleId: string): BattleRecord | null {
    const row = this.db.prepare('SELECT data FROM battles WHERE id = ? AND player_id = ?').get(battleId, playerId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as BattleRecord : null;
  }

  activeBattle(playerId: string): BattleRecord | null {
    const rows = this.db.prepare('SELECT data FROM battles WHERE player_id = ? ORDER BY updated_at DESC LIMIT 5').all(playerId) as { data: string }[];
    for (const row of rows) {
      const record = JSON.parse(row.data) as BattleRecord;
      if (!record.state.result) return record;
    }
    return null;
  }

  // 全部战斗记录（含已结束与进行中）：旧档地区认领按真实证据扫描。
  battles(playerId: string): BattleRecord[] {
    return (this.db.prepare('SELECT data FROM battles WHERE player_id = ?').all(playerId) as { data: string }[])
      .map(row => JSON.parse(row.data) as BattleRecord);
  }

  // ---- arena days --------------------------------------------------------

  saveArenaDay(day: ArenaDayRecord): void {
    this.db.prepare('INSERT INTO arena_days (id, player_id, day, data, settled) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = ?, settled = ?')
      .run(day.id, day.playerId, day.day, JSON.stringify(day), day.settled ? 1 : 0, JSON.stringify(day), day.settled ? 1 : 0);
  }

  arenaDay(playerId: string, day: number): ArenaDayRecord | null {
    const row = this.db.prepare('SELECT data FROM arena_days WHERE player_id = ? AND day = ?').get(playerId, day) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as ArenaDayRecord : null;
  }

  latestArenaDay(playerId: string): ArenaDayRecord | null {
    const row = this.db.prepare('SELECT data FROM arena_days WHERE player_id = ? ORDER BY day DESC LIMIT 1').get(playerId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as ArenaDayRecord : null;
  }

  unsettledArenaDays(playerId: string): ArenaDayRecord[] {
    return (this.db.prepare('SELECT data FROM arena_days WHERE player_id = ? AND settled = 0 ORDER BY day').all(playerId) as { data: string }[])
      .map(row => JSON.parse(row.data) as ArenaDayRecord);
  }

  // ---- snapshots ---------------------------------------------------------

  saveSnapshot(playerId: string, day: number, data: SnapshotData): SnapshotRow {
    const legacyIds = this.getPlayer(playerId)?.flags.calendarMigration?.legacySnapshotIds ?? [];
    let id = this.snapshot(playerId, day)?.id ?? `snap-${playerId}-${day}`;
    while (legacyIds.includes(id)) id += '-calendar500';
    this.db.prepare('INSERT INTO snapshots (id, player_id, day, data, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = ?')
      .run(id, playerId, day, JSON.stringify(data), Date.now(), JSON.stringify(data));
    return { id, day, data, createdAt: Date.now() };
  }

  snapshot(playerId: string, day: number): SnapshotRow | null {
    const row = this.db.prepare('SELECT id, day, data, created_at FROM snapshots WHERE player_id = ? AND day = ?').get(playerId, day) as
      { id: string; day: number; data: string; created_at: number } | undefined;
    return row ? { id: row.id, day: row.day, data: JSON.parse(row.data), createdAt: row.created_at } : null;
  }

  latestSnapshot(playerId: string): SnapshotRow | null {
    const row = this.db.prepare('SELECT id, day, data, created_at FROM snapshots WHERE player_id = ? ORDER BY day DESC LIMIT 1').get(playerId) as
      { id: string; day: number; data: string; created_at: number } | undefined;
    return row ? { id: row.id, day: row.day, data: JSON.parse(row.data), createdAt: row.created_at } : null;
  }

  // The player's own arena-day snapshots, newest first (GET_SNAPSHOTS).
  snapshots(playerId: string, limit: number): SnapshotRow[] {
    return (this.db.prepare('SELECT id, day, data, created_at FROM snapshots WHERE player_id = ? ORDER BY day DESC LIMIT ?').all(playerId, limit) as
      { id: string; day: number; data: string; created_at: number }[])
      .map(row => ({ id: row.id, day: row.day, data: JSON.parse(row.data), createdAt: row.created_at }));
  }

  // Other players' snapshots from the same personal day (docs/00 §10.1).
  snapshotsAtDay(day: number, excludePlayerId: string): { playerId: string; data: SnapshotData }[] {
    return (this.db.prepare('SELECT id, player_id, data FROM snapshots WHERE day = ? AND player_id != ?')
      .all(day, excludePlayerId) as { id: string; player_id: string; data: string }[])
      .filter(row => {
        const flags = this.getPlayer(row.player_id)?.flags;
        return flags?.calendarVersion === 500 && !flags.calendarMigration?.legacySnapshotIds.includes(row.id);
      })
      .map(r => ({ playerId: r.player_id, data: JSON.parse(r.data) as SnapshotData }));
  }

  // ---- due tasks ---------------------------------------------------------

  addTask(playerId: string | null, kind: string, dueAt: number, payload: unknown): void {
    this.db.prepare('INSERT INTO due_tasks (player_id, kind, due_at, payload) VALUES (?, ?, ?, ?)')
      .run(playerId, kind, dueAt, JSON.stringify(payload ?? null));
  }

  pendingTasks(now: number, limit = 100): DueTask[] {
    return (this.db.prepare('SELECT id, player_id, kind, due_at, payload FROM due_tasks WHERE done = 0 AND due_at <= ? ORDER BY due_at LIMIT ?')
      .all(now, limit) as { id: number; player_id: string | null; kind: string; due_at: number; payload: string }[])
      .map(r => ({ id: r.id, playerId: r.player_id, kind: r.kind, dueAt: r.due_at, payload: JSON.parse(r.payload) }));
  }

  completeTask(id: number): void {
    this.db.prepare('UPDATE due_tasks SET done = 1 WHERE id = ?').run(id);
  }

  // ---- replays -----------------------------------------------------------

  saveReplay(playerId: string, record: BattleRecord, publicAt: number): void {
    this.db.prepare('INSERT INTO replays (id, player_id, data, public_at, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(player_id, id) DO UPDATE SET data = ?, public_at = ?')
      .run(record.id, playerId, JSON.stringify(record), publicAt, Date.now(), JSON.stringify(record), publicAt);
  }

  replay(playerId: string, replayId: string): ReplayRow | null {
    const row = this.db.prepare('SELECT id, player_id, data, public_at, created_at FROM replays WHERE id = ? AND (player_id = ? OR public_at <= ?)')
      .get(replayId, playerId, Date.now()) as { id: string; player_id: string; data: string; public_at: number; created_at: number } | undefined;
    if (!row) return null;
    return { id: row.id, playerId: row.player_id, data: JSON.parse(row.data), publicAt: row.public_at, createdAt: row.created_at };
  }

  replays(playerId: string, limit = 50): ReplayRow[] {
    return (this.db.prepare('SELECT id, player_id, data, public_at, created_at FROM replays WHERE player_id = ? OR public_at <= ? ORDER BY created_at DESC LIMIT ?')
      .all(playerId, Date.now(), limit) as { id: string; player_id: string; data: string; public_at: number; created_at: number }[])
      .map(r => ({ id: r.id, playerId: r.player_id, data: JSON.parse(r.data), publicAt: r.public_at, createdAt: r.created_at }));
  }

  // 本人是否留有战报：战报页在首场战斗前保持隐藏（reports 特性门）。
  hasOwnReplays(playerId: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM replays WHERE player_id = ? LIMIT 1').get(playerId);
  }

  // ---- idempotent command receipts (docs/13 §1.4、§2.1) -------------------

  receipt(playerId: string, commandId: string): CommandReceipt | null {
    const row = this.db.prepare('SELECT command_id, op, payload_hash, response, committed_at FROM command_receipts WHERE player_id = ? AND command_id = ?')
      .get(playerId, commandId) as { command_id: string; op: number; payload_hash: string; response: string; committed_at: number } | undefined;
    return row ? { commandId: row.command_id, op: row.op, payloadHash: row.payload_hash, response: JSON.parse(row.response), committedAt: row.committed_at } : null;
  }

  saveReceipt(playerId: string, commandId: string, op: number, payloadHash: string, response: unknown): void {
    this.db.prepare('INSERT OR IGNORE INTO command_receipts (player_id, command_id, op, payload_hash, response, committed_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(playerId, commandId, op, payloadHash, JSON.stringify(response ?? null), Date.now());
  }

  // ---- legacies, reincarnation, memorial (docs/13 §2.2) ------------------

  saveLegacy(legacy: LegacyRecord): void {
    this.db.prepare('INSERT OR REPLACE INTO legacies (id, player_id, source_unit_id, data, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(legacy.id, legacy.playerId, legacy.sourceUnitId, JSON.stringify(legacy), legacy.createdAt);
  }

  legacy(playerId: string, legacyId: string): LegacyRecord | null {
    const row = this.db.prepare('SELECT data FROM legacies WHERE player_id = ? AND id = ?').get(playerId, legacyId) as { data: string } | undefined;
    return row ? normalizeLegacy(JSON.parse(row.data) as LegacyRecord) : null;
  }

  legacyBySource(playerId: string, sourceUnitId: string): LegacyRecord | null {
    const row = this.db.prepare('SELECT data FROM legacies WHERE player_id = ? AND source_unit_id = ?').get(playerId, sourceUnitId) as { data: string } | undefined;
    return row ? normalizeLegacy(JSON.parse(row.data) as LegacyRecord) : null;
  }

  legacies(playerId: string): LegacyRecord[] {
    return (this.db.prepare('SELECT data FROM legacies WHERE player_id = ? ORDER BY created_at DESC').all(playerId) as { data: string }[])
      .map(row => normalizeLegacy(JSON.parse(row.data) as LegacyRecord));
  }

  saveReincarnation(playerId: string, unitId: string, data: unknown): void {
    this.db.prepare('INSERT OR REPLACE INTO reincarnations (unit_id, player_id, data, created_at) VALUES (?, ?, ?, ?)')
      .run(unitId, playerId, JSON.stringify(data), Date.now());
  }

  saveMemorial(row: MemorialData): void {
    this.db.prepare('INSERT OR REPLACE INTO memorials (unit_id, player_id, data, created_at) VALUES (?, ?, ?, ?)')
      .run(row.unitId, row.playerId, JSON.stringify(row), Date.now());
  }

  memorials(playerId: string): MemorialRow[] {
    return (this.db.prepare('SELECT unit_id, player_id, data, created_at FROM memorials WHERE player_id = ? ORDER BY created_at DESC').all(playerId) as
      { unit_id: string; player_id: string; data: string; created_at: number }[])
      .map(r => ({ unitId: r.unit_id, playerId: r.player_id, data: JSON.parse(r.data) as MemorialData, createdAt: r.created_at }));
  }

  // ---- production orders (docs/13 §2.3) ---------------------------------

  saveProductionOrder(order: ProductionOrder): void {
    this.db.prepare('INSERT OR REPLACE INTO production_orders (id, player_id, data, state, ready_day, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(order.id, order.playerId, JSON.stringify(order), order.state, order.readyDay, Date.now());
  }

  productionOrder(playerId: string, orderId: string): ProductionOrder | null {
    const row = this.db.prepare('SELECT data FROM production_orders WHERE player_id = ? AND id = ?').get(playerId, orderId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as ProductionOrder : null;
  }

  productionOrders(playerId: string): ProductionOrder[] {
    return (this.db.prepare('SELECT data FROM production_orders WHERE player_id = ? ORDER BY created_at').all(playerId) as { data: string }[])
      .map(row => JSON.parse(row.data) as ProductionOrder);
  }

  // ---- dungeon runs (docs/13 §2.4) --------------------------------------

  saveRun(run: RunRecord): void {
    run.updatedAt = Date.now();
    this.db.prepare('INSERT OR REPLACE INTO runs (id, player_id, state, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(run.id, run.playerId, run.state, JSON.stringify(run), run.createdAt, run.updatedAt);
  }

  run(playerId: string, runId: string): RunRecord | null {
    const row = this.db.prepare('SELECT data FROM runs WHERE player_id = ? AND id = ?').get(playerId, runId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as RunRecord : null;
  }

  activeRun(playerId: string): RunRecord | null {
    const row = this.db.prepare("SELECT data FROM runs WHERE player_id = ? AND state IN ('battle','between_maps') ORDER BY updated_at DESC LIMIT 1").get(playerId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as RunRecord : null;
  }

  latestRun(playerId: string): RunRecord | null {
    const row = this.db.prepare('SELECT data FROM runs WHERE player_id = ? ORDER BY updated_at DESC LIMIT 1').get(playerId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as RunRecord : null;
  }

  hasCompletedRun(playerId: string, region: number, questId?: string, aiDifficulty?: 'normal' | 'hard'): boolean {
    return !!this.db.prepare(`SELECT 1 FROM runs WHERE player_id = ? AND state = 'completed'
      AND json_extract(data, '$.region') = ? AND json_extract(data, '$.questId') IS ?
      AND (? IS NULL OR COALESCE(json_extract(data, '$.aiDifficulty'), 'normal') = ?) LIMIT 1`)
      .get(playerId, region, questId ?? null, aiDifficulty ?? null, aiDifficulty ?? null);
  }

  // 全部远征记录：旧档地区认领按真实证据扫描。
  runs(playerId: string): RunRecord[] {
    return (this.db.prepare('SELECT data FROM runs WHERE player_id = ?').all(playerId) as { data: string }[])
      .map(row => JSON.parse(row.data) as RunRecord);
  }

  // ---- annual arena entries (docs/13 §2.5) ------------------------------

  saveAnnualEntry(entry: AnnualEntry): void {
    entry.updatedAt = Date.now();
    this.db.prepare('INSERT OR REPLACE INTO annual_entries (id, player_id, annual_index, state, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(entry.id, entry.playerId, entry.annualIndex, entry.state, JSON.stringify(entry), entry.createdAt, entry.updatedAt);
  }

  annualEntry(playerId: string, id: string): AnnualEntry | null {
    const row = this.db.prepare('SELECT data FROM annual_entries WHERE player_id = ? AND id = ?').get(playerId, id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as AnnualEntry : null;
  }

  annualEntryFor(playerId: string, annualIndex: number): AnnualEntry | null {
    const row = this.db.prepare('SELECT data FROM annual_entries WHERE player_id = ? AND annual_index = ?').get(playerId, annualIndex) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as AnnualEntry : null;
  }

  latestAnnualEntry(playerId: string): AnnualEntry | null {
    const row = this.db.prepare('SELECT data FROM annual_entries WHERE player_id = ? ORDER BY annual_index DESC LIMIT 1').get(playerId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as AnnualEntry : null;
  }

  activeAnnualEntry(playerId: string): AnnualEntry | null {
    const row = this.db.prepare("SELECT data FROM annual_entries WHERE player_id = ? AND state IN ('qualifier','knockout') ORDER BY annual_index DESC LIMIT 1").get(playerId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as AnnualEntry : null;
  }

  // ---- action quotes (docs/13 §3.2) -------------------------------------

  saveQuote(id: string, playerId: string, playerVersion: number, data: unknown): void {
    this.db.prepare('INSERT OR REPLACE INTO action_quotes (id, player_id, player_version, data, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, playerId, playerVersion, JSON.stringify(data), Date.now());
  }

  quote(playerId: string, id: string): { playerVersion: number; data: Record<string, unknown> } | null {
    const row = this.db.prepare('SELECT player_version, data FROM action_quotes WHERE player_id = ? AND id = ?').get(playerId, id) as
      { player_version: number; data: string } | undefined;
    return row ? { playerVersion: row.player_version, data: JSON.parse(row.data) as Record<string, unknown> } : null;
  }

  // ---- background dispatches (docs/13 §5.5) -----------------------------

  saveDispatch(dispatch: DispatchRecord): void {
    this.db.prepare('INSERT OR REPLACE INTO dispatches (id, player_id, state, return_day, data, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(dispatch.id, dispatch.playerId, dispatch.state, dispatch.returnDay, JSON.stringify(dispatch), dispatch.createdAt);
  }

  dispatch(playerId: string, id: string): DispatchRecord | null {
    const row = this.db.prepare('SELECT data FROM dispatches WHERE player_id = ? AND id = ?').get(playerId, id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as DispatchRecord : null;
  }

  dispatches(playerId: string): DispatchRecord[] {
    return (this.db.prepare('SELECT data FROM dispatches WHERE player_id = ? ORDER BY created_at DESC').all(playerId) as { data: string }[])
      .map(row => JSON.parse(row.data) as DispatchRecord);
  }

  runningDispatches(playerId: string): DispatchRecord[] {
    return (this.db.prepare("SELECT data FROM dispatches WHERE player_id = ? AND state = 'running' ORDER BY return_day").all(playerId) as { data: string }[])
      .map(row => JSON.parse(row.data) as DispatchRecord);
  }

  // ---- real-month ratings (docs/13 §6.4) --------------------------------

  saveRatingPeriod(period: RatingPeriod): void {
    this.db.prepare('INSERT OR REPLACE INTO rating_periods (id, mode, starts_at, ends_at, status, rewards_finalized_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(period.id, period.mode, period.startsAt, period.endsAt, period.status, period.rewardsFinalizedAt);
  }

  ratingPeriod(id: string, mode = 'arena'): RatingPeriod | null {
    const row = this.db.prepare('SELECT * FROM rating_periods WHERE id = ? AND mode = ?').get(id, mode) as Record<string, unknown> | undefined;
    return row ? rowToPeriod(row) : null;
  }

  activeRatingPeriod(mode = 'arena'): RatingPeriod | null {
    const row = this.db.prepare("SELECT * FROM rating_periods WHERE mode = ? AND status = 'active' ORDER BY starts_at DESC LIMIT 1").get(mode) as Record<string, unknown> | undefined;
    return row ? rowToPeriod(row) : null;
  }

  ratingPeriods(mode = 'arena'): RatingPeriod[] {
    return (this.db.prepare('SELECT * FROM rating_periods WHERE mode = ? ORDER BY starts_at DESC').all(mode) as Record<string, unknown>[]).map(rowToPeriod);
  }

  rating(periodId: string, playerId: string, mode = 'arena'): RatingRow | null {
    const row = this.db.prepare('SELECT * FROM ratings WHERE period_id = ? AND player_id = ? AND mode = ?').get(periodId, playerId, mode) as Record<string, unknown> | undefined;
    return row ? rowToRating(row) : null;
  }

  saveRating(row: RatingRow): void {
    this.db.prepare('INSERT OR REPLACE INTO ratings (period_id, player_id, mode, progress_bracket, rating, wins, losses, matches) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(row.periodId, row.playerId, row.mode, row.progressBracket, row.rating, row.wins, row.losses, row.matches);
  }

  ratingsForPeriod(periodId: string, mode = 'arena'): RatingRow[] {
    return (this.db.prepare('SELECT * FROM ratings WHERE period_id = ? AND mode = ?').all(periodId, mode) as Record<string, unknown>[]).map(rowToRating);
  }

  saveMonthlyReward(row: MonthlyRatingReward): void {
    this.db.prepare('INSERT OR REPLACE INTO monthly_rating_rewards (period_id, player_id, final_rank, reward, claimed_at) VALUES (?, ?, ?, ?, ?)')
      .run(row.periodId, row.playerId, row.finalRank, JSON.stringify(row.reward), row.claimedAt);
  }

  monthlyReward(periodId: string, playerId: string): MonthlyRatingReward | null {
    const row = this.db.prepare('SELECT * FROM monthly_rating_rewards WHERE period_id = ? AND player_id = ?').get(periodId, playerId) as Record<string, unknown> | undefined;
    return row ? rowToReward(row) : null;
  }

  monthlyRewards(playerId: string): MonthlyRatingReward[] {
    return (this.db.prepare('SELECT * FROM monthly_rating_rewards WHERE player_id = ? ORDER BY period_id DESC').all(playerId) as Record<string, unknown>[]).map(rowToReward);
  }
}

function rowToPlayer(row: Record<string, unknown>): Player {
  return {
    id: row.id as string,
    accountId: row.account_id as string,
    name: row.name as string,
    legion: row.legion as string,
    day: row.day as number,
    gold: row.gold as number,
    bexp: row.bexp as number,
    arenaPoints: row.arena_points as number,
    arenaMedals: row.arena_medals as number,
    registered: !!row.registered,
    protagonist: row.protagonist as string,
    defense: row.defense ? JSON.parse(row.defense as string) as Defense : null,
    flags: JSON.parse(row.flags as string) as PlayerFlags,
    version: (row.version as number | undefined) ?? 0,
    createdAt: row.created_at as number,
  };
}

// Local snapshot helper for the seeded defense.
export function isPlayerArenaDay(player: Player): boolean {
  return player.registered && isArenaDay(player.day);
}

function rowToPeriod(row: Record<string, unknown>): RatingPeriod {
  return {
    id: row.id as string, mode: row.mode as string, startsAt: row.starts_at as number, endsAt: row.ends_at as number,
    status: row.status as RatingPeriod['status'], rewardsFinalizedAt: (row.rewards_finalized_at as number | null) ?? null,
  };
}

function rowToRating(row: Record<string, unknown>): RatingRow {
  return {
    periodId: row.period_id as string, playerId: row.player_id as string, mode: row.mode as string,
    progressBracket: row.progress_bracket as number, rating: row.rating as number, wins: row.wins as number,
    losses: row.losses as number, matches: row.matches as number,
  };
}

function rowToReward(row: Record<string, unknown>): MonthlyRatingReward {
  return {
    periodId: row.period_id as string, playerId: row.player_id as string, finalRank: row.final_rank as number,
    reward: JSON.parse(row.reward as string) as { gold: number }, claimedAt: (row.claimed_at as number | null) ?? null,
  };
}
