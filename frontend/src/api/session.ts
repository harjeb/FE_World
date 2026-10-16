// The server session: one place that logs in, keeps GET_STATE / GET_TODAY / GET_ARENA / GET_DEFENSE /
// GET_ROSTER and exposes the op wrappers the screens call. Everything else in the frontend derives from here, so
// there is exactly one source of truth (docs/06「协议只在 common 定义一处」).
import { useSyncExternalStore } from 'react';
import { OP } from '@common/protocol/ops.ts';
import type { Action, BattleEvent, BattleState } from '@common/engine/index.ts';
import type { Defense, SnapshotUnit } from '@common/arena/rules.ts';
import type { CharacterId } from '@common/data/characters.ts';
import { ApiError, call, login as apiLogin, setToken, token } from './client.ts';

export interface ServerUnit {
  id: string;
  character: CharacterId;
  name: string;
  classId: string;
  className: string;
  tier: string;
  stage: number;
  route: string;
  species: 'human' | 'beast' | 'dragon';
  level: number;
  exp: number;
  hp: number;
  maxHp: number;
  status: 'active' | 'dead' | 'retired';
  equipped: string | null;
  items: string[];
  growthType: 'early' | 'normal' | 'late' | 'growth';
  growthTypeName: string;
  age: number;
  ageBand: string | null;
  growthBonus: number;
  joinedDay: number;
  weaponExp: Record<string, number>;
  growthLog: { level: number; gains: Record<string, number> }[];
  // 能力药 used per stat this round (docs/00: 5 per stat, 20 in total).
  drugCounts: Record<string, number>;
  snapshot: SnapshotUnit;
}

export interface ServerState {
  player: { id: string; name: string; legion: string; protagonist: string };
  day: number;
  date: { year: number; season: number; dayOfSeason: number; dayOfMonth: number; label: string };
  gold: number;
  bexp: number;
  arena: { points: number; medals: number; registered: boolean; nextArenaDay: number; isArenaDay: boolean; rank: { place: number; change: number } };
  nextMonthStart: number;
  actionDays: number;
  rosterLimit: number;
  rosterCount: number;
  units: ServerUnit[];
  inventory: { item: string; name: string; uses: number; count: number }[];
  regions: { id: number; name: string; offset: number; resource: string; cleared: boolean }[];
  progress: { cleared: number; baseLevel: number };
  festival: { round: number; year: number; nextDay: number };
  agentPlan: string | null;
  agentLastSeen: number | null;
}

export interface ServerOpponent {
  id: string; legion: string; points: number; record: string; map: string; mapName: string;
  deploy: number; bans: number; turnLimit: number; goalText: string; feature: string;
}

export interface ServerArena {
  season: number; points: number; medals: number; registered: boolean; isArenaDay: boolean;
  nextArenaDay: number; day: number | null; settled: boolean;
  progress: { done: number; total: number; points: number } | null;
  opponents: ServerOpponent[];
  mapPool: { id: string; name: string; deploy: number; bans: number; turnLimit: number; goalText: string; feature: string }[];
}

// GET_TODAY: what each camp action costs right now, and the sortie rules shown before committing days.
export interface TodayAction {
  key: 'sortie' | 'sweep' | 'train' | 'rest' | 'recruit';
  name: string;
  costDays: number;
  costGold?: number;
  available: boolean;
  note: string;
  maxUnits?: number;
  turnLimit?: number;
  goalText?: string;
  lethal?: boolean;
}

export interface ServerToday {
  day: number;
  date: ServerState['date'];
  actions: TodayAction[];
  sortieRegions: { id: number; name: string; resource: string; cleared: boolean; level: number }[];
  festival: { open: boolean; round: number; costDays: number };
  nextArenaDay: number;
  nextMonthStart: number;
  battle: { id: string; name: string; kind: 'field' | 'arena'; mode: string; turn: number; opponentId: string | null } | null;
}

// GET_SHOP: this season's stock; it refills on the first day of each season.
export interface ShopRow { item: string; name: string; price: number; stock: number; kind: 'weapon' | 'consumable' | 'seal' | 'stat' | 'material' }

// GET_SNAPSHOTS: the roster as saved on each arena day the player registered (docs/00 §10).
export interface ServerSnapshot { day: number; date: ServerState['date']; roster: SnapshotUnit[]; defense: Defense | null }

export interface ArenaAttackView { opponentId: string; status: string; points: number; bans: CharacterId[]; battleId: string | null; noShow?: boolean; surrender?: boolean }
export interface ArenaResults {
  day: number | null; settled: boolean; attacks: ArenaAttackView[];
  defenseTrials: { attacker: string; held: boolean; turn: number; reason: string }[];
  // The defense that day locked at registration (it may differ from the one being edited now).
  lockedDefense?: Defense | null;
  points: number; medals: number;
}

export interface SessionSnapshot {
  ready: boolean;
  loading: boolean;
  error: string | null;
  state: ServerState | null;
  today: ServerToday | null;
  arena: ServerArena | null;
  results: ArenaResults | null;
  defense: Defense | null;
  // GET_DEFENSE: whether today's arena already locked the defense, and on which day.
  defenseLock: { locked: boolean; lockedDay: number | null };
  roster: ServerUnit[];
  // The active arena attack's raw battle state, keyed by opponent id, so a reload can resume.
  battles: Record<string, BattleState>;
}

class SessionStore {
  private snap: SessionSnapshot = { ready: false, loading: false, error: null, state: null, today: null, arena: null, results: null, defense: null, defenseLock: { locked: false, lockedDay: null }, roster: [], battles: {} };
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  get = (): SessionSnapshot => this.snap;

  private set(patch: Partial<SessionSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const listener of this.listeners) listener();
  }

  get loggedIn(): boolean {
    return this.snap.ready;
  }

  async login(name: string, password?: string, legion?: string): Promise<void> {
    this.set({ loading: true, error: null });
    try {
      await apiLogin(name, password, legion);
      await this.refresh();
      this.set({ ready: true });
    } catch (error) {
      this.set({ loading: false, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  // Loads everything a screen might read. Called after login and after any state-changing op.
  async refresh(): Promise<void> {
    if (!token()) return;
    this.set({ loading: true, error: null });
    try {
      const [state, today, arena, defense, roster, results] = await Promise.all([
        call<ServerState>(OP.GET_STATE),
        call<ServerToday>(OP.GET_TODAY).catch(() => null),
        call<ServerArena>(OP.GET_ARENA).catch(() => null),
        call<{ defense: Defense | null; locked: boolean; lockedDay: number | null }>(OP.GET_DEFENSE),
        call<{ units: ServerUnit[] }>(OP.GET_ROSTER),
        call<ArenaResults>(OP.GET_ARENA_RESULTS).catch(() => null),
      ]);
      this.set({
        state, today, arena, defense: defense.defense, defenseLock: { locked: defense.locked, lockedDay: defense.lockedDay },
        roster: roster.units, results, loading: false, ready: true, error: null,
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'UNAUTHORIZED') {
        setToken(null);
        this.set({ ready: false, loading: false, error: '登录已过期，请重新登录' });
        return;
      }
      this.set({ loading: false, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  logout(): void {
    setToken(null);
    this.set({ ready: false, state: null, today: null, arena: null, results: null, defense: null, roster: [], battles: {} });
  }

  // Runs an op and refreshes the derived views, so a screen never shows stale numbers.
  async run<T = unknown>(op: number, data: Record<string, unknown> = {}, refresh = true): Promise<T> {
    const result = await call<T>(op, data);
    if (refresh) await this.refresh();
    return result;
  }

  // ---- arena attacks -----------------------------------------------------

  async arenaBan(opponentId: string, bans: CharacterId[]): Promise<void> {
    await this.run(OP.ARENA_BAN, { opponentId, bans }, false);
  }

  async arenaAttack(opponentId: string, picks: { character: CharacterId; pos: [number, number] }[], commander: CharacterId, seed?: string): Promise<string> {
    const result = await call<{ battleId: string; state: BattleState }>(OP.ARENA_ATTACK, { opponentId, picks, commander, seed });
    this.set({ battles: { ...this.snap.battles, [opponentId]: result.state } });
    return result.battleId;
  }

  battleFor(opponentId: string): BattleState | null {
    return this.snap.battles[opponentId] ?? null;
  }

  // The bridge the battle controller uses when a session is server-authoritative.
  async applyBattle(battleId: string, action: Action): Promise<{ state: BattleState; events: BattleEvent[] }> {
    const data: Record<string, unknown> = { battleId };
    let op: number;
    if (action.type === 'endPhase') op = OP.END_PHASE;
    else if (action.type === 'retreat') op = OP.RETREAT;
    else if (action.type === 'surrender') op = OP.SURRENDER;
    else {
      op = OP.UNIT_ACT;
      data.unitId = action.unit;
      data.moveTo = action.to;
      data.action = action.act;
      if (action.act === 'attack' || action.act === 'heal') { data.targetId = action.target; data.weapon = action.weapon; }
      if (action.act === 'item') data.item = action.item;
    }
    const result = await call<{ state: BattleState; events?: BattleEvent[] }>(op, data);
    if (result.state?.result) await this.refresh();
    return { state: result.state, events: result.events ?? [] };
  }

  async sortie(region: number, unitIds: string[], seed?: string): Promise<{ battleId: string; state: BattleState }> {
    const result = await call<{ battleId: string; state: BattleState }>(OP.SORTIE, { region, unitIds, seed });
    await this.refresh();
    return result;
  }

  async setDefense(defense: Defense): Promise<void> {
    await this.run(OP.SET_DEFENSE, { defense });
  }

  // ---- replays -----------------------------------------------------------

  async replays(): Promise<ServerReplay[]> {
    const result = await call<{ replays: ServerReplay[] }>(OP.GET_REPLAYS);
    return result.replays;
  }

  async shop(): Promise<ShopRow[]> {
    const result = await call<{ items: ShopRow[] }>(OP.GET_SHOP);
    return result.items;
  }

  async snapshots(): Promise<ServerSnapshot[]> {
    const result = await call<{ snapshots: ServerSnapshot[] }>(OP.GET_SNAPSHOTS);
    return result.snapshots;
  }

  async replay(replayId: string): Promise<ServerReplayData> {
    const result = await call<{ replayId: string; battle: ServerReplayData; publicAt: number }>(OP.GET_REPLAY, { replayId });
    return result.battle;
  }
}

export interface ServerReplay {
  id: string; name: string; kind: 'field' | 'arena'; mode: string;
  winner: 'player' | 'enemy' | null; reason: string | null; turns: number;
  createdAt: number; publicAt: number; mine: boolean;
}

// A stored BattleRecord: `initial` plus the action list rebuilds every step (see watch/recording.ts).
export interface ServerReplayData {
  id: string; name: string; kind: 'field' | 'arena'; mode: string; goalText: string;
  initial: BattleState; state: BattleState; events: BattleEvent[]; actions: Action[];
}

export const session = new SessionStore();

export function useSession(): SessionSnapshot {
  return useSyncExternalStore(session.subscribe, session.get);
}
