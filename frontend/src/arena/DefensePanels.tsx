import { MY_ROSTER } from '../demo/live.ts';
import { addUnit, removeUnit, setBehavior, shiftPriority } from '@common/arena/defense.ts';
import type { TrialRun } from '@common/arena/defense.ts';
import { ARENA_MAPS } from '@common/arena/maps.ts';
import { canHeal } from '@common/arena/rules.ts';
import type { Defense } from '@common/arena/rules.ts';
import { CHARACTERS } from '@common/data/characters.ts';
import type { CharacterId } from '@common/data/characters.ts';
import { CLASSES } from '@common/data/classes.ts';
import type { Behavior } from '@common/engine/index.ts';
import { portraitFor, spriteFor } from '../assets.ts';

export const BEHAVIORS: { id: Behavior; name: string; short: string; note: string }[] = [
  { id: 'aggressive', name: '进攻', short: '攻', note: '主动追击最近的敌人' },
  { id: 'opportunist', name: '伺机', short: '伺', note: '敌人进入攻击范围才行动' },
  { id: 'hold', name: '固守', short: '固', note: '原地不动，只反击' },
  { id: 'guard', name: '护卫', short: '卫', note: '在主将 3 格内行动' },
  { id: 'healer', name: '治疗优先', short: '疗', note: '优先治疗受伤友军' },
];
export const behaviorOf = (id: Behavior) => BEHAVIORS.find(b => b.id === id)!;

const name = (c: CharacterId) => CHARACTERS[c].name;

export function roleOf(defense: Defense, c: CharacterId): string {
  const i = defense.commanders.indexOf(c);
  return i === 0 ? '主将' : i > 0 ? `备选 ${i}` : '';
}

interface Props { draft: Defense; change: (next: Defense) => void; selected: CharacterId | null; select: (c: CharacterId | null) => void }

// 防守名单: priority with ↑ / ↓ buttons (docs/08: not drag only), behavior per unit, add and remove.
export function DefenseList({ draft, change, selected, select }: Props) {
  const map = ARENA_MAPS[draft.map];
  const size = map.deploy + map.bans;
  const outside = MY_ROSTER.filter(u => !draft.slots.some(s => s.unit.character === u.character));
  return (
    <section className="panel" aria-labelledby="dl-h">
      <div className="ph">
        <h2 id="dl-h">防守名单 <span className="num" style={{ fontWeight: 500, color: '#6A6256' }}>{draft.slots.length} / {size}（{map.deploy} + {map.bans}）</span></h2>
        <span style={{ fontSize: 12, color: '#6A6256' }}>被禁用后按顺序递补</span>
      </div>
      <ol>
        {draft.slots.map((s, i) => {
          const c = s.unit.character;
          const looks = { classId: s.unit.classId, side: 'player' as const, character: c };
          const role = roleOf(draft, c);
          return (
            <li key={c} className={`dfrow${selected === c ? ' sel' : ''}${i >= map.deploy ? ' subrow' : ''}`}>
              <span className="pn" aria-label={`优先级 ${i + 1}`}>{i + 1}</span>
              <span className="pf ally" style={{ width: 34, height: 34 }}><img className="px" src={portraitFor(looks) ?? spriteFor(looks)} width={32} height={32} alt="" /></span>
              <button type="button" className="dname" aria-pressed={selected === c} onClick={() => select(selected === c ? null : c)}>
                <b>{name(c)}{role && <span className="tag tag-blue" style={{ height: 18, marginLeft: 6 }}>{role}</span>}</b>
                <span>{CLASSES[s.unit.classId].name} · Lv {s.unit.level} · ({s.pos[0]},{s.pos[1]}){i >= map.deploy ? ' · 替补' : ''}</span>
              </button>
              <span className="mv">
                <button type="button" aria-label={`上移 ${name(c)}`} disabled={i === 0} onClick={() => change(shiftPriority(draft, c, -1))}>↑</button>
                <button type="button" aria-label={`下移 ${name(c)}`} disabled={i === draft.slots.length - 1} onClick={() => change(shiftPriority(draft, c, 1))}>↓</button>
                <button type="button" className="out" aria-label={`把 ${name(c)} 移出名单`} onClick={() => change(removeUnit(draft, c))}>移出</button>
              </span>
              <span className="dsub">
                <label className="flex items-center gap-2">
                  <span>行为</span>
                  <select className="bsel" value={s.behavior} onChange={e => change(setBehavior(draft, c, e.target.value as Behavior))} aria-label={`${name(c)} 的 AI 行为`}>
                    {BEHAVIORS.map(b => <option key={b.id} value={b.id} disabled={b.id === 'healer' && !canHeal(s.unit)}>{b.name}</option>)}
                  </select>
                </label>
                <span>{behaviorOf(s.behavior).note}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {draft.slots.length < size && (
        <div className="sect">
          <div className="sect-k"><span>可加入（还差 {size - draft.slots.length} 人）</span></div>
          <div className="acts">
            {outside.map(u => (
              <button key={u.character} type="button" className="btn btn-sm" onClick={() => change(addUnit(draft, u))}>
                ＋ {name(u.character)} <span className="muted">{CLASSES[u.classId].name} Lv {u.level}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// 主将顺序: commander and up to two backups, picked from the list.
export function CommanderPanel({ draft, change }: Pick<Props, 'draft' | 'change'>) {
  const slots: string[] = [draft.commanders[0] ?? '', draft.commanders[1] ?? '', draft.commanders[2] ?? ''];
  const set = (i: number, value: string) => {
    const next = [...slots];
    next[i] = value;
    change({ ...draft, commanders: next.filter((c, j) => c && next.indexOf(c) === j) as CharacterId[] });
  };
  return (
    <section className="panel" aria-labelledby="lead-h">
      <div className="ph"><h2 id="lead-h">主将顺序</h2><span style={{ fontSize: 12, color: '#6A6256' }}>主将被禁用时由备选接任</span></div>
      <div className="flex flex-wrap items-center gap-2" style={{ padding: '10px 14px' }}>
        {['主将', '备选 1', '备选 2'].map((label, i) => (
          <label key={label} className="flex items-center gap-1.5" style={{ fontSize: 13 }}>
            {label}
            <select className="bsel" value={slots[i]} onChange={e => set(i, e.target.value)} disabled={i > 0 && !slots[i - 1]}>
              {i > 0 && <option value="">无</option>}
              {draft.slots.map(s => s.unit.character).filter(c => c === slots[i] || !slots.includes(c)).map(c => <option key={c} value={c}>{name(c)}</option>)}
            </select>
            {i < 2 && <span aria-hidden="true" style={{ color: '#B9AE98' }}>›</span>}
          </label>
        ))}
      </div>
    </section>
  );
}

// 预设禁用: up to B character names from the shared pool.
export function BansPanel({ draft, change }: Pick<Props, 'draft' | 'change'>) {
  const map = ARENA_MAPS[draft.map];
  const pool = Object.keys(CHARACTERS) as CharacterId[];
  const set = (i: number, value: string) => {
    const next = Array.from({ length: map.bans }, (_, j) => (j === i ? value : draft.bans[j] ?? '')).filter(Boolean) as CharacterId[];
    change({ ...draft, bans: next.filter((c, j) => next.indexOf(c) === j) });
  };
  return (
    <section className="panel" aria-labelledby="pre-h">
      <div className="ph">
        <h2 id="pre-h">预设禁用 <span className="num" style={{ fontWeight: 500, color: '#6A6256' }}>{draft.bans.length} / {map.bans}</span></h2>
        <span style={{ fontSize: 12, color: '#6A6256' }}>进攻方名册中有该角色即不能派他出战</span>
      </div>
      <div className="flex flex-wrap items-center gap-2" style={{ padding: '10px 14px' }}>
        {Array.from({ length: map.bans }, (_, i) => (
          <select key={i} className="bsel" value={draft.bans[i] ?? ''} onChange={e => set(i, e.target.value)} aria-label={`预设禁用 ${i + 1}`}>
            <option value="">不禁用</option>
            {pool.filter(c => c === draft.bans[i] || !draft.bans.includes(c)).map(c => <option key={c} value={c}>⊘ {name(c)}</option>)}
          </select>
        ))}
        <span style={{ fontSize: 12, color: '#4E473D', flexBasis: '100%' }}>角色池全服共享，可以针对环境里常见的角色；禁用名额随地图变化。</span>
      </div>
    </section>
  );
}

export function TrialPanel({ runs, total, stale }: { runs: TrialRun[]; total: number; stale: boolean }) {
  const held = runs.filter(r => r.held).length;
  const legions = [...new Set(runs.map(r => r.attacker))];
  return (
    <section className="panel" aria-labelledby="trial-h" aria-live="polite">
      <div className="ph">
        <h2 id="trial-h">陪练试攻 {runs.length < total && <span className="muted" style={{ fontWeight: 500 }}>进行中 {runs.length} / {total}</span>}</h2>
        <b className="num">守住 {held} / {runs.length}</b>
      </div>
      <ul className="info">
        {legions.map(l => {
          const mine = runs.filter(r => r.attacker === l);
          return (
            <li key={l}>
              <span>{l} 进攻 <span className="muted">（禁用 {mine[0].bans.map(name).join('、')}）</span></span>
              <b>守住 {mine.filter(r => r.held).length} / {mine.length}</b>
            </li>
          );
        })}
      </ul>
      <p style={{ padding: '0 14px 12px', fontSize: 12, color: '#6A6256' }}>
        规则 AI 扮演进攻方：先禁用等级最高的单位，再派出名册前几人。真实玩家和 Agent 通常更强，结果仅供参考。{stale && ' 设置已修改，结果基于修改前的防守。'}
      </p>
    </section>
  );
}
