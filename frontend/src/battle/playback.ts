// Animates engine events onto the displayed state one by one: moves walk tile by tile, combats open
// the 交战演出 scene (or show numbers on the map), level-ups wait for the player to read them.
import type { StatKey } from '@common/data/types.ts';
import type { BattleEvent, BattleState } from '@common/engine/index.ts';
import type { BattleController, CombatEvent } from './controller.ts';

const STEP_MS = 70;
const STRIKE_MS = 520;

// What playback drives: the battle controller, or a stand-in that can drop a cancelled replay step.
export type PlaybackHost = Pick<BattleController, 'get' | 'set' | 'focus' | 'float' | 'showBanner'> & { speed?: number };

export async function playEvents(ctl: PlaybackHost, events: BattleEvent[], before: BattleState): Promise<void> {
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms / (ctl.speed ?? 1)));
  let view = before;
  const unitIn = (s: BattleState, id: string) => s.units.find(u => u.id === id)!;
  const edit = (fn: (draft: BattleState) => void) => {
    const draft = structuredClone(view);
    fn(draft);
    view = draft;
    ctl.set({ view: draft });
  };

  const combat = async (e: CombatEvent) => {
    const attacker = unitIn(view, e.attacker), defender = unitIn(view, e.defender);
    ctl.focus(defender.pos);
    const policy = ctl.get().settings.scenes;
    if (policy === 'all' || (policy === 'boss' && (attacker.boss || defender.boss))) {
      await new Promise<void>(resolve => ctl.set({
        combat: { event: e, before: view, done: () => { ctl.set({ combat: null }); resolve(); } },
      }));
      edit(d => { for (const s of e.strikes) unitIn(d, s.target).hp = s.hpAfter; });
    } else {
      for (const s of e.strikes) {
        const at = unitIn(view, s.target).pos;
        ctl.float(at, !s.hit ? 'MISS' : s.crit ? `${s.damage}!` : String(s.damage), !s.hit ? 'miss' : s.crit ? 'crit' : 'dmg');
        edit(d => { unitIn(d, s.target).hp = s.hpAfter; });
        await sleep(STRIKE_MS);
      }
    }
    edit(d => { unitIn(d, e.attacker).acted = true; });
  };

  for (const e of events) {
    switch (e.t) {
      case 'phase':
        edit(d => {
          d.phase = e.side;
          d.turn = e.turn;
          for (const u of d.units) u.acted = false;
        });
        await ctl.showBanner(e.side, e.turn);
        break;
      case 'move':
        ctl.focus(e.path[e.path.length - 1]);
        for (const at of e.path.slice(1)) {
          edit(d => {
            const u = unitIn(d, e.unit);
            u.pos = at;
            u.movedTurn = d.turn;
          });
          await sleep(STEP_MS);
        }
        break;
      case 'combat':
        await combat(e);
        break;
      case 'loot':
        edit(d => {
          const unit = unitIn(d, e.unit);
          unit.carried = e.boxes;
          const index = d.boxes?.findIndex(at => at[0] === unit.pos[0] && at[1] === unit.pos[1]) ?? -1;
          if (index >= 0) d.boxes!.splice(index, 1);
        });
        break;
      case 'drop':
        edit(d => {
          unitIn(d, e.unit).carried = 0;
          d.boxes ??= [];
          for (let box = 0; box < e.boxes; box++) d.boxes.push([...e.at]);
        });
        break;
      case 'escape':
        edit(d => { const unit = unitIn(d, e.unit); unit.alive = false; unit.escaped = true; });
        break;
      case 'object':
        edit(d => {
          const object = d.objects?.find(o => o.id === e.object);
          if (object) object.state = e.state;
          if (e.state === 'destroyed' && object) d.map.tiles[object.pos[1]][object.pos[0]] = 'floor';
        });
        break;
      case 'treasure':
      case 'scenario':
        break;
      case 'hazard':
        edit(d => {
          const u = unitIn(d, e.unit);
          u.hp = e.hpAfter;
          if (e.kind === 'petrified') u.petrified = true;
        });
        break;
      case 'status':
        edit(d => {
          const u = unitIn(d, e.unit);
          if (e.status === 'petrified') u.petrified = e.active;
          else {
            u.statuses ??= {};
            if (e.status === 'sleep') u.statuses.sleep = e.active || undefined;
            else if (e.active) u.statuses[e.status] = e.turns ?? 3;
            else delete u.statuses[e.status];
            if (Object.keys(u.statuses).length === 0) delete u.statuses;
          }
        });
        break;
      case 'spawn':
        edit(d => { if (!d.units.some(u => u.id === e.unit)) d.units.push(structuredClone(e.spawned)); });
        break;
      case 'defeated':
        ctl.set({ fading: new Set([...ctl.get().fading, e.unit]) });
        await sleep(450);
        edit(d => { unitIn(d, e.unit).alive = false; });
        ctl.set({ fading: new Set([...ctl.get().fading].filter(id => id !== e.unit)) });
        break;
      case 'heal':
        ctl.float(unitIn(view, e.target).pos, `+${e.amount}`, 'heal');
        edit(d => {
          unitIn(d, e.target).hp = e.hpAfter;
          if (e.by && e.source !== 'terrain') unitIn(d, e.by).acted = true;
        });
        await sleep(600);
        break;
      case 'exp':
        ctl.float(unitIn(view, e.unit).pos, `EXP +${e.gained}`, 'exp');
        edit(d => {
          const u = unitIn(d, e.unit);
          u.exp = e.exp;
          u.level = e.level;
        });
        await sleep(350);
        break;
      case 'levelUp': {
        const unit = unitIn(view, e.unit);
        await new Promise<void>(resolve => ctl.set({
          levelUp: { event: e, unit, done: () => { ctl.set({ levelUp: null }); resolve(); } },
        }));
        edit(d => {
          const u = unitIn(d, e.unit);
          for (const [key, gain] of Object.entries(e.gains) as [StatKey, number][]) {
            u.stats[key] += gain;
            if (key === 'hp') u.hp += gain;
          }
        });
        break;
      }
      case 'wait':
        edit(d => { unitIn(d, e.unit).acted = true; });
        break;
      case 'dance':
        ctl.float(unitIn(view, e.target).pos, '再行动', 'heal');
        edit(d => { unitIn(d, e.unit).acted = true; unitIn(d, e.target).acted = false; });
        await sleep(500);
        break;
      case 'shield':
        ctl.float(unitIn(view, e.unit).pos, '不朽盾', 'seize');
        edit(d => { const u = unitIn(d, e.unit); u.petrified = true; });
        await sleep(500);
        break;
      case 'cast':
        ctl.focus(unitIn(view, e.target).pos);
        edit(d => { unitIn(d, e.unit).acted = true; });
        break;
      case 'artState':
        edit(d => { unitIn(d, e.unit).artEffects = structuredClone(e.effects); });
        break;
      case 'embers':
        edit(d => { d.embers = structuredClone(e.cells); });
        break;
      case 'art':
        break;
      case 'seize': {
        const at = unitIn(view, e.unit).pos;
        ctl.focus(at);
        ctl.float(at, '压制！', 'seize');
        edit(d => { unitIn(d, e.unit).acted = true; });
        await sleep(900);
        break;
      }
      case 'end':
        break;
    }
  }
}
