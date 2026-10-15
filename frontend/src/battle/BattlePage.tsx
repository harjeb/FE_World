import { useEffect, useState, useSyncExternalStore } from 'react';
import { BattleMap } from './BattleMap.tsx';
import { CombatScene } from './CombatScene.tsx';
import { BattleController } from './controller.ts';
import { ConfirmDialog, LevelUpDialog, ResultDialog } from './Dialogs.tsx';
import { Hud } from './Hud.tsx';
import { BattleLog, Legend } from './Legend.tsx';
import type { BattleSession } from './session.ts';
import { SidePanel } from './SidePanel.tsx';

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
};

function useKeyboard(ctl: BattleController) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const snap = ctl.get();
      if (snap.combat || e.altKey || e.ctrlKey || e.metaKey) return;
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (typing) return;
      if (snap.levelUp) {
        if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') { e.preventDefault(); snap.levelUp.done(); }
        return;
      }
      if (snap.dialog) {
        if (e.key === 'Escape') { e.preventDefault(); ctl.cancel(); }
        if (e.key === 'Enter') { e.preventDefault(); ctl.confirmDialog(); }
        return;
      }
      const onButton = e.target instanceof HTMLButtonElement;
      // Enter confirms a ready attack or heal even right after clicking a weapon button
      // (docs/08: 确认攻击 ENTER); only buttons marked data-own-enter keep their own Enter.
      const ownEnter = e.target instanceof HTMLElement && !!e.target.closest('[data-own-enter]');
      if (ARROWS[e.key] && !onButton) {
        e.preventDefault();
        ctl.moveCursor(...ARROWS[e.key]);
      } else if (e.key === 'Enter' && ctl.canConfirm() && !ownEnter) {
        e.preventDefault();
        ctl.confirm();
      } else if (e.key === 'Enter' && !onButton) {
        e.preventDefault();
        ctl.activateCursor();
      } else if (e.key === ' ' && !onButton) {
        e.preventDefault();
        ctl.activateCursor();
      } else if (e.key === 'Escape') {
        ctl.cancel();
      } else if (e.key === 't' || e.key === 'T') {
        ctl.setSetting('threat', !snap.settings.threat);
      } else if (e.key === 'g' || e.key === 'G') {
        ctl.setSetting('grid', !snap.settings.grid);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctl]);
}

// A battle page for any session (field demo, arena attack): map about 70%, tactical side panel about 30%.
export function BattlePage({ session }: { session: BattleSession }) {
  const [ctl] = useState(() => new BattleController(session));
  const snap = useSyncExternalStore(ctl.subscribe, ctl.get);
  useKeyboard(ctl);
  useEffect(() => { ctl.start(); }, [ctl]);
  const showResult = !!snap.state.result && snap.mode.kind !== 'busy' && !snap.combat && !snap.levelUp;

  return (
    <div className="app-bg battle-shell">
      <Hud snap={snap} ctl={ctl} />
      <main className="stage">
        <div className="mapcol">
          <BattleMap snap={snap} ctl={ctl} />
          <Legend snap={snap} ctl={ctl} />
          <BattleLog entries={snap.log} />
        </div>
        <aside className="side" aria-label="战术信息栏">
          <SidePanel snap={snap} ctl={ctl} />
        </aside>
      </main>
      {snap.combat && <CombatScene key={snap.combat.event.strikes.length + snap.combat.event.attacker} show={snap.combat} />}
      {snap.levelUp && <LevelUpDialog show={snap.levelUp} />}
      {snap.dialog && (
        <ConfirmDialog kind={snap.dialog} state={snap.state} surrender={session.surrender}
          onConfirm={() => ctl.confirmDialog()} onCancel={() => ctl.cancel()} />
      )}
      {showResult && <ResultDialog state={snap.state} view={session.result(snap.state, () => ctl.restart())} />}
    </div>
  );
}
