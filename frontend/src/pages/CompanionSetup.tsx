import { useState } from 'react';
import { CLASSES } from '@common/data/classes.ts';
import { GROWTH_TYPE_NAMES } from '@common/data/growth-types.ts';
import type { GrowthType } from '@common/data/growth-types.ts';
import { STAT_KEYS, STAT_NAMES } from '@common/data/types.ts';
import type { StatKey } from '@common/data/types.ts';
import { session, useSession } from '../api/session.ts';
import { toast } from '../ui/toast.tsx';
import { Face } from './SystemParts.tsx';

const ZERO = Object.fromEntries(STAT_KEYS.map(k => [k, 0])) as Record<StatKey, number>;

// 自捏开局（docs/00「神主角」、docs/13 §开局）：自建神主角（姓名/性别/职业/形象/成长类型/培养倾向/
// 九属性分配）并从剩余预设中挑两名同伴；同一事务提交，只能完成一次。
export function CompanionSetup() {
  const { state } = useSession();
  const [name, setName] = useState('');
  const [sex, setSex] = useState<'male' | 'female'>('male');
  const [classId, setClassId] = useState('swordsman');
  const [growthType, setGrowthType] = useState<GrowthType>('normal');
  const [tendency, setTendency] = useState('balanced');
  const [portrait, setPortrait] = useState('');
  const [alloc, setAlloc] = useState<Record<StatKey, number>>(ZERO);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  if (!state?.setup.needed) return null;

  const opts = state.setup.protagonist;
  const cls = opts.classes.find(c => c.classId === classId) ?? opts.classes[0];
  const chosenPortrait = portrait || cls.base;
  const used = STAT_KEYS.reduce((sum, k) => sum + alloc[k], 0);
  const bump = (k: StatKey, d: number) => setAlloc(a => {
    const next = Math.max(0, Math.min(opts.maxPerStat, a[k] + d));
    return used - a[k] + next > opts.budget ? a : { ...a, [k]: next };
  });
  const changeClass = (id: string) => {
    setClassId(id);
    const base = opts.classes.find(c => c.classId === id)?.base;
    if (base) setPicked(p => p.filter(x => x !== base));
  };
  const pool = state.setup.pool.filter(c => c.id !== cls.base);
  const toggle = (id: string) => setPicked(cur => (cur.includes(id) ? cur.filter(x => x !== id) : cur.length < 2 ? [...cur, id] : cur));
  const trimmed = name.trim();
  const ready = trimmed.length >= 2 && trimmed.length <= 12 && picked.length === 2;
  const submit = async () => {
    setBusy(true);
    try {
      await session.completeSetup({ name: trimmed, sex, classId, growthType, tendency, portrait: chosenPortrait, allocation: alloc }, picked);
      toast('神主角与同伴已加入名册');
    } catch (e) {
      toast(`开局失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-bg" style={{ minHeight: '100vh', padding: 24 }}>
      <div className="panel" style={{ maxWidth: 860, margin: '0 auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 className="serif" style={{ fontSize: 24 }}>缔结神约</h1>
        <p style={{ fontSize: 14, color: '#4E473D' }}>以有限化身行走世间。自定主角与两名初始同伴，确定后不可重开。</p>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 className="serif" style={{ fontSize: 18 }}>神主角</h2>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
            <span style={{ width: 64 }}>姓名</span>
            <input value={name} maxLength={12} onChange={e => setName(e.target.value)} placeholder="2–12 字"
              style={{ flex: 1, maxWidth: 220, padding: '4px 8px', border: '1px solid #C9BFA8', borderRadius: 6 }} />
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
            <span style={{ width: 64 }}>性别</span>
            {(['male', 'female'] as const).map(s => (
              <button key={s} type="button" className={`btn btn-sm${sex === s ? ' btn-primary' : ''}`} onClick={() => setSex(s)}>
                {s === 'male' ? '男' : '女'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 14 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ width: 64 }}>职业</span>
              <select value={classId} onChange={e => changeClass(e.target.value)} style={{ padding: '4px 8px' }}>
                {opts.classes.map(c => <option key={c.classId} value={c.classId}>{c.name}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span>成长</span>
              <select value={growthType} onChange={e => setGrowthType(e.target.value as GrowthType)} style={{ padding: '4px 8px' }}>
                {(Object.keys(GROWTH_TYPE_NAMES) as GrowthType[]).map(g => <option key={g} value={g}>{GROWTH_TYPE_NAMES[g]}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span>倾向</span>
              <select value={tendency} onChange={e => setTendency(e.target.value)} style={{ padding: '4px 8px' }}>
                {opts.tendencies.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
            <span style={{ width: 64 }}>形象</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {opts.portraits.map(p => (
                <button key={p.id} type="button" title={p.name} onClick={() => setPortrait(p.id)}
                  style={{ padding: 2, cursor: 'pointer', borderRadius: 6, border: chosenPortrait === p.id ? '2px solid #8A6A2F' : '1px solid #C9BFA8', background: '#FFFDF7' }}>
                  <Face character={p.id} classId={classId} size={32} />
                </button>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 14 }}>
            <div style={{ color: '#4E473D' }}>九属性分配 · 还剩 {opts.budget - used} / {opts.budget} 点（单项最多 {opts.maxPerStat}）</div>
            <div className="alloc" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginTop: 6 }}>
              {STAT_KEYS.map(k => (
                <div key={k} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className="al-k" style={{ width: 40 }}>{STAT_NAMES[k]}</span>
                  <button type="button" className="btn btn-sm" aria-label={`${STAT_NAMES[k]} −1`} disabled={alloc[k] === 0} onClick={() => bump(k, -1)}>−</button>
                  <b className="num" style={{ width: 16, textAlign: 'center' }}>{alloc[k]}</b>
                  <button type="button" className="btn btn-sm" aria-label={`${STAT_NAMES[k]} +1`} disabled={alloc[k] >= opts.maxPerStat || used >= opts.budget} onClick={() => bump(k, 1)}>+</button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 className="serif" style={{ fontSize: 18 }}>初始同伴（{picked.length}/2）</h2>
          <p style={{ fontSize: 13, color: '#4E473D' }}>从剩余预设中选两名；主角所选职业的预设不可选。</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
            {pool.map(c => {
              const on = picked.includes(c.id);
              return (
                <button key={c.id} type="button" onClick={() => toggle(c.id)}
                  style={{
                    padding: 10, display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', cursor: 'pointer',
                    border: on ? '2px solid #8A6A2F' : '1px solid #C9BFA8', borderRadius: 8, background: on ? '#F5EEDD' : '#FFFDF7',
                  }}>
                  <Face character={c.id} classId={c.classId} size={36} />
                  <span>
                    <span style={{ display: 'block', fontWeight: 600 }}>{c.name}</span>
                    <span style={{ fontSize: 12, color: '#4E473D' }}>{CLASSES[c.classId as keyof typeof CLASSES]?.name} · Lv {c.level}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <button type="button" className="btn btn-primary" disabled={!ready || busy} onClick={() => void submit()}>
          {busy ? '缔结中…' : '确认开局'}
        </button>
      </div>
    </div>
  );
}
