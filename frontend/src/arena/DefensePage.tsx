import { useEffect, useRef, useState } from 'react';
import { useSession } from '../api/session.ts';
import { SPARRING, WORLD } from '../demo/live.ts';
import { behaviorArea, defenseNotes, moveUnit, switchMap, trialAttack } from '@common/arena/defense.ts';
import type { TrialRun } from '@common/arena/defense.ts';
import { ARENA_MAPS } from '@common/arena/maps.ts';
import type { ArenaMapId } from '@common/arena/maps.ts';
import { validateDefense } from '@common/arena/rules.ts';
import type { Defense } from '@common/arena/rules.ts';
import { CHARACTERS } from '@common/data/characters.ts';
import type { CharacterId } from '@common/data/characters.ts';
import type { Point } from '@common/engine/index.ts';
import { MAPS, spriteFor } from '../assets.ts';
import { links } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { MapPreview, useFitCell } from './ArenaParts.tsx';
import { BansPanel, behaviorOf, CommanderPanel, DefenseList, roleOf, TrialPanel } from './DefensePanels.tsx';
import { defenseDraft, useSavedDefense } from './defenseStore.ts';
import { plainDate } from '../ui/calendar.ts';

const AREA_TEXT = {
  trigger: ['trig', '伺机范围：敌人进入即行动'],
  chase: ['trig', '进攻：本回合可攻击的范围，之后会主动追击'],
  counter: ['trig', '固守：原地不动，只在被攻击时反击'],
  guard: ['trig', '护卫：在主将 3 格内活动'],
  heal: ['healz', '治疗范围：优先治疗受伤友军'],
} as const;

// Counts edited parts: the map, each changed list position, commanders and bans.
function changes(saved: Defense, draft: Defense): number {
  let n = saved.map === draft.map ? 0 : 1;
  const len = Math.max(saved.slots.length, draft.slots.length);
  for (let i = 0; i < len; i++) if (JSON.stringify(saved.slots[i]) !== JSON.stringify(draft.slots[i])) n++;
  if (saved.commanders.join() !== draft.commanders.join()) n++;
  if (saved.bans.join() !== draft.bans.join()) n++;
  return n;
}

const TRIAL_SEEDS = ['a', 'b', 'c', 'd'];

// 防守设置 (ArenaDefense artboard, docs/05): map, list with priority and AI behavior, positions,
// commander order and preset bans for the next arena; today's arena keeps the locked snapshot.
export function DefensePage() {
  const lock = useSession().defenseLock;
  const saved = useSavedDefense();
  const [draft, setDraft] = useState<Defense>(saved);
  const [selected, setSelected] = useState<CharacterId | null>(saved.commanders[0] ?? null);
  const [runs, setRuns] = useState<TrialRun[] | null>(null);
  const [stale, setStale] = useState(false);
  const map = ARENA_MAPS[draft.map];
  const [fitRef, cell] = useFitCell(map.rows[0].length, [48, 32]);
  const running = runs !== null && runs.length < SPARRING.length * TRIAL_SEEDS.length;
  const errors = validateDefense(draft);
  const notes = defenseNotes(draft);
  const edits = changes(saved, draft);
  const pick = selected && draft.slots.some(s => s.unit.character === selected) ? selected : null;
  const area = pick ? behaviorArea(draft, pick) : null;

  const change = (next: Defense) => {
    setDraft(next);
    if (runs) setStale(true);
  };
  const latest = useRef({ draft, pick, change });
  latest.current = { draft, pick, change };

  // Arrow keys move the selected unit inside the defender zone.
  useEffect(() => {
    const steps: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const onKey = (e: KeyboardEvent) => {
      const { draft: d, pick: p, change: c } = latest.current;
      if (!steps[e.key] || !p || (e.target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName))) return;
      const from = d.slots.find(s => s.unit.character === p)!.pos;
      e.preventDefault();
      c(moveUnit(d, p, [from[0] + steps[e.key][0], from[1] + steps[e.key][1]]));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Runs the sparring battles a few at a time so the page stays responsive.
  const runTrial = async () => {
    const tested = draft;
    const results: TrialRun[] = [];
    setRuns([]);
    setStale(false);
    for (const attacker of SPARRING) {
      for (const seed of TRIAL_SEEDS) {
        await new Promise(resolve => setTimeout(resolve, 0));
        results.push(trialAttack(tested, attacker, `${attacker.legion}-${seed}`));
        setRuns([...results]);
      }
    }
  };

  const onCell = (at: Point) => {
    const there = draft.slots.find(s => s.pos[0] === at[0] && s.pos[1] === at[1]);
    if (pick && map.defenderZone.some(z => z[0] === at[0] && z[1] === at[1])) change(moveUnit(draft, pick, at));
    else if (there) setSelected(there.unit.character);
  };

  return (
    <Shell current="arena">
      <div className="headrow">
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>竞技场 · 防守设置</h1>
        <span className="snap">{lock.locked && lock.lockedDay !== null ? `今天的防守已在${plainDate(lock.lockedDay)}报名时锁定 · 这里改的是下一次` : `${plainDate(WORLD.nextArenaDay)}（下一个竞技场日）报名时锁定`}</span>
        {edits > 0 ? <span className="tag tag-red">{edits} 项修改未保存</span> : <span className="tag tag-green">已保存</span>}
        <span className="ml-auto flex flex-wrap gap-2">
          <a className="btn btn-sm btn-ghost" href={links.arena}>返回竞技场</a>
          {edits > 0 && <button type="button" className="btn btn-sm" onClick={() => change(saved)}>放弃修改</button>}
          <button type="button" className="btn btn-sm" disabled={errors.length > 0 || running} onClick={() => void runTrial()}>用陪练 AI 试攻</button>
          <button type="button" className="btn btn-primary" disabled={errors.length > 0 || edits === 0} onClick={() => { void defenseDraft.save(draft); }}>保存防守</button>
        </span>
      </div>
      <p style={{ fontSize: 13, color: '#4E473D' }}>{lock.locked
        ? `今天的竞技场用报名时锁定的防守；这里保存的修改从下一个竞技场日（${plainDate(WORLD.nextArenaDay)}）起生效。`
        : '到达竞技场日时自动报名，并锁定当时保存的防守；单位的属性与装备按那时的名册。'}</p>

      <div className="maps" role="group" aria-label="选择防守地图（规则随地图变化）">
        {Object.values(ARENA_MAPS).map(m => (
          <button key={m.id} type="button" className="mapopt" aria-pressed={draft.map === m.id}
            onClick={() => { if (draft.map !== m.id) change(switchMap(draft, m.id as ArenaMapId)); }}>
            <img className="px thumb" src={MAPS[m.name]} alt="" />
            <span><span className="mo-n">{m.name}{draft.map === m.id ? ' ✓' : ''}</span><span className="mo-r">出战 {m.deploy} · 禁用 {m.bans} · {m.turnLimit} 回合 · {m.goalText}</span></span>
          </button>
        ))}
      </div>

      {(errors.length > 0 || notes.length > 0) && (
        <ul className="panel notes" role="status">
          {errors.map(e => <li key={e} className="err">✕ {e}</li>)}
          {notes.map(n => <li key={n}>! {n}</li>)}
        </ul>
      )}

      <div className="arena-cols">
        <section className="panel" aria-labelledby="dmap-h" style={{ flex: '999 1 560px', minWidth: 0 }}>
          <div className="ph">
            <h2 id="dmap-h">{map.name} · 我方为防守方</h2>
            <span style={{ fontSize: 12, color: '#6A6256' }}>进攻方胜利条件：{map.turnLimit} 回合内{map.goalText}</span>
          </div>
          <div className="mapscroll" ref={fitRef}>
            <MapPreview map={map} cell={cell} mine={map.defenderZone} foe={map.attackerZone} cursor={pick ? draft.slots.find(s => s.unit.character === pick)!.pos : null}
              marks={area ? { cells: area.cells, className: AREA_TEXT[area.kind][0] } : undefined}
              units={draft.slots.map((s, i) => ({
                key: s.unit.character, side: 'player' as const, pos: s.pos, sprite: spriteFor({ classId: s.unit.classId, side: 'player' }),
                prio: i + 1, behavior: behaviorOf(s.behavior).short, bench: i >= map.deploy, selected: pick === s.unit.character,
                role: roleOf(draft, s.unit.character).replace('主将', '主').replace('备选 ', '备'),
              }))}
              onCell={onCell}
              label={`防守布阵：${draft.slots.map((s, i) => `${i + 1}. ${CHARACTERS[s.unit.character].name}（${behaviorOf(s.behavior).name}）`).join('，')}`}>
              <span className="maptag mt-red" style={{ left: map.attackerZone[0][0] * cell + 2, top: map.attackerZone[0][1] * cell - 26 }}>◆ 进攻方出生区</span>
              <span className="maptag mt-blue" style={{ right: 4, bottom: 4 }}>● 我方防守区</span>
            </MapPreview>
          </div>
          <div className="lgd">
            {area && pick && <span><b>{CHARACTERS[pick].name}</b> · {AREA_TEXT[area.kind][1]}</span>}
            <span><b className="pn" style={{ display: 'inline-flex', width: 18, height: 18, fontSize: 10 }}>1</b> 出战优先级</span>
            <span><b>攻</b> 进攻 · <b>伺</b> 伺机 · <b>固</b> 固守 · <b>卫</b> 护卫 · <b>疗</b> 治疗优先</span>
            <span>虚线框：替补，前 {map.deploy} 人有人被禁用时才出战</span>
            <span>选中单位后点蓝色格子或按方向键移动站位</span>
          </div>
        </section>

        <div className="flex flex-col gap-3" style={{ flex: '1 1 380px', minWidth: 0 }}>
          <DefenseList draft={draft} change={change} selected={pick} select={setSelected} />
          <CommanderPanel draft={draft} change={change} />
          <BansPanel draft={draft} change={change} />
          {runs && <TrialPanel runs={runs} total={SPARRING.length * TRIAL_SEEDS.length} stale={stale} />}
        </div>
      </div>
    </Shell>
  );
}
