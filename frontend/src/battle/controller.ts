// Battle page state outside React: the authoritative engine state, what is currently shown (`view`,
// which lags behind while events animate), the player's in-progress command and transient effects.
// Components read immutable snapshots through useSyncExternalStore.
import type { WeaponId } from '@common/data/weapons.ts';
import { actionOptions, EngineError, living, step, unitById } from '@common/engine/index.ts';
import type { Action, BattleEvent, BattleState, Point, Side, UnitState } from '@common/engine/index.ts';
import { describe } from './log.ts';
import type { LogEntry } from './log.ts';
import { back, canCommand, clickCell, IDLE } from './selection.ts';
import type { Mode } from './selection.ts';
import { loadSettings, saveSettings } from './settings.ts';
import type { Settings } from './settings.ts';
import { playEvents } from './playback.ts';
import type { BattleSession } from './session.ts';

export type CombatEvent = Extract<BattleEvent, { t: 'combat' }>;
export type LevelUpEvent = Extract<BattleEvent, { t: 'levelUp' }>;
export interface FloatText { id: number; at: Point; text: string; kind: 'dmg' | 'crit' | 'miss' | 'heal' | 'exp' }
export interface CombatShow { event: CombatEvent; before: BattleState; done: () => void }
export interface LevelShow { event: LevelUpEvent; unit: UnitState; done: () => void }
export type Dialog = 'endPhase' | 'retreat' | null;

export interface Snapshot {
  state: BattleState;
  view: BattleState;
  mode: Mode;
  hover: Point | null;
  cursor: Point | null;
  log: LogEntry[];
  floats: FloatText[];
  fading: ReadonlySet<string>;
  banner: { side: Side; turn: number } | null;
  combat: CombatShow | null;
  levelUp: LevelShow | null;
  dialog: Dialog;
  notice: string | null;
  settings: Settings;
}

function fresh(state: BattleState, settings: Settings): Snapshot {
  return {
    state, view: state, mode: IDLE, hover: null, cursor: null, log: [], floats: [], fading: new Set(),
    banner: null, combat: null, levelUp: null, dialog: null, notice: null, settings,
  };
}

export class BattleController {
  private snap: Snapshot;
  private listeners = new Set<() => void>();
  private floatId = 1;
  readonly session: BattleSession;
  // Registered by the map so animations keep the acting unit on screen.
  focus: (at: Point) => void = () => {};

  constructor(session: BattleSession) {
    this.session = session;
    this.snap = fresh(session.initial, loadSettings());
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  get = () => this.snap;

  set(patch: Partial<Snapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const listener of this.listeners) listener();
  }

  private get blocked(): boolean {
    const s = this.snap;
    return s.mode.kind === 'busy' || !!s.dialog || !!s.levelUp || !!s.combat || !!s.state.result;
  }

  start(): void {
    void this.showBanner('player', this.snap.state.turn);
  }

  hoverCell(at: Point | null): void {
    if (this.snap.mode.kind !== 'busy') this.set({ hover: at });
  }

  click(at: Point): void {
    if (this.blocked) return;
    this.set({ mode: clickCell(this.snap.state, this.snap.mode, at, this.snap.hover), notice: null });
  }

  select(unitId: string): void {
    if (this.blocked) return;
    const unit = unitById(this.snap.state, unitId);
    this.set({ mode: canCommand(this.snap.state, unit) ? { kind: 'move', unit: unit.id } : { kind: 'inspect', unit: unit.id } });
    this.focus(unit.pos);
  }

  cancel(): void {
    if (this.snap.dialog) this.set({ dialog: null });
    else if (!this.blocked) this.set({ mode: back(this.snap.mode), notice: null });
  }

  chooseAction(kind: 'attack' | 'heal' | 'item' | 'wait'): void {
    const mode = this.snap.mode;
    if (this.blocked || !('to' in mode)) return;
    if (kind === 'wait') {
      void this.commit({ type: 'act', unit: mode.unit, to: mode.to, act: 'wait' });
      return;
    }
    if (kind === 'item') {
      this.set({ mode: { kind: 'item', unit: mode.unit, to: mode.to } });
      return;
    }
    const options = actionOptions(this.snap.state, unitById(this.snap.state, mode.unit), mode.to)[kind];
    if (options.length === 0) return;
    const only = options.flatMap(o => o.targets).filter((t, i, all) => all.findIndex(u => u.id === t.id) === i);
    this.set({ mode: { kind, unit: mode.unit, to: mode.to, weapon: options[0].weapon, target: only.length === 1 ? only[0].id : null } });
  }

  chooseWeapon(weapon: WeaponId): void {
    const mode = this.snap.mode;
    if (this.blocked || (mode.kind !== 'attack' && mode.kind !== 'heal')) return;
    const option = actionOptions(this.snap.state, unitById(this.snap.state, mode.unit), mode.to)[mode.kind]
      .find(o => o.weapon === weapon);
    if (!option) return;
    const target = option.targets.some(t => t.id === mode.target) ? mode.target : null;
    this.set({ mode: { ...mode, weapon, target } });
  }

  chooseTarget(targetId: string): void {
    const mode = this.snap.mode;
    if (this.blocked || (mode.kind !== 'attack' && mode.kind !== 'heal')) return;
    this.set({ mode: { ...mode, target: targetId } });
  }

  useItem(index: number): void {
    const mode = this.snap.mode;
    if (this.blocked || mode.kind !== 'item') return;
    void this.commit({ type: 'act', unit: mode.unit, to: mode.to, act: 'item', item: index });
  }

  canConfirm(): boolean {
    const mode = this.snap.mode;
    return !this.blocked && (mode.kind === 'attack' || mode.kind === 'heal') && mode.target !== null;
  }

  confirm(): void {
    const mode = this.snap.mode;
    if (!this.canConfirm() || (mode.kind !== 'attack' && mode.kind !== 'heal') || !mode.target) return;
    void this.commit({ type: 'act', unit: mode.unit, to: mode.to, act: mode.kind, target: mode.target, weapon: mode.weapon });
  }

  moveCursor(dx: number, dy: number): void {
    if (this.blocked) return;
    const { state, cursor, mode } = this.snap;
    const origin = cursor ?? ('unit' in mode ? unitById(state, mode.unit).pos : living(state, 'player')[0]?.pos ?? [0, 0]);
    const next: Point = [
      Math.max(0, Math.min(state.map.width - 1, origin[0] + dx)),
      Math.max(0, Math.min(state.map.height - 1, origin[1] + dy)),
    ];
    this.set({ cursor: next, hover: next });
    this.focus(next);
  }

  activateCursor(): void {
    if (this.snap.cursor) this.click(this.snap.cursor);
  }

  requestEndPhase(): void {
    if (this.blocked || this.snap.state.phase !== 'player') return;
    if (living(this.snap.state, 'player').some(u => !u.acted)) this.set({ dialog: 'endPhase' });
    else void this.commit({ type: 'endPhase' });
  }

  requestRetreat(): void {
    if (!this.blocked && this.snap.state.phase === 'player') this.set({ dialog: 'retreat' });
  }

  confirmDialog(): void {
    const dialog = this.snap.dialog;
    this.set({ dialog: null });
    if (dialog === 'endPhase') void this.commit({ type: 'endPhase' });
    if (dialog === 'retreat') void this.commit({ type: this.session.surrender ? 'surrender' : 'retreat' });
  }

  restart(): void {
    if (this.snap.mode.kind === 'busy' || !this.session.restart) return;
    this.snap = fresh(this.session.restart(), this.snap.settings);
    this.set({});
    this.start();
  }

  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
    const settings = { ...this.snap.settings, [key]: value };
    saveSettings(settings);
    this.set({ settings });
  }

  float(at: Point, text: string, kind: FloatText['kind']): void {
    const id = this.floatId++;
    this.set({ floats: [...this.snap.floats, { id, at, text, kind }] });
    setTimeout(() => this.set({ floats: this.snap.floats.filter(f => f.id !== id) }), 900);
  }

  async showBanner(side: Side, turn: number): Promise<void> {
    this.set({ banner: { side, turn } });
    await new Promise(resolve => setTimeout(resolve, 1000));
    this.set({ banner: null });
  }

  // Applies a command, animates its events, then hands control back (or ends the phase when every
  // unit has acted, as in docs/03).
  private async commit(action: Action): Promise<void> {
    const before = this.snap.state;
    let result: ReturnType<typeof step>;
    try {
      result = step(before, action);
    } catch (error) {
      this.set({ notice: error instanceof EngineError ? error.message : String(error) });
      return;
    }
    this.set({ state: result.state, mode: { kind: 'busy' }, hover: null, notice: null });
    this.session.onChange?.(result.state);
    await playEvents(this, result.events, before);
    this.set({ view: result.state, log: [...describe(result.events, before).reverse(), ...this.snap.log].slice(0, 80) });
    const next = result.state;
    if (!next.result && next.phase === 'player' && living(next, 'player').every(u => u.acted)) {
      await this.commit({ type: 'endPhase' });
      return;
    }
    this.set({ mode: IDLE });
  }
}
