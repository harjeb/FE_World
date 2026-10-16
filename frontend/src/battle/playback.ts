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
