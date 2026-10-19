import { useState } from 'react';
import { CLASSES } from '@common/data/classes.ts';
import { GROWTH_TYPE_NAMES } from '@common/data/growth-types.ts';
import { deriveProtagonistTendency, PROTAGONIST_TENDENCIES } from '@common/data/characters.ts';
import { STAT_KEYS, STAT_NAMES } from '@common/data/types.ts';
import type { StatKey, Stats } from '@common/data/types.ts';
import { session, useSession } from '../api/session.ts';
import { toast } from '../ui/toast.tsx';
import { Face } from './SystemParts.tsx';

// 自捏开局：固定平民／成长型，保留基础属性并额外分配 10 点，每项最多加 5；倾向由加点推导。
export function CompanionSetup() {
  const { state } = useSession();
  const [name, setName] = useState('');
  const [sex, setSex] = useState<'male' | 'female'>('male');
  const [portrait, setPortrait] = useState('');
  const [alloc, setAlloc] = useState<Record<StatKey, number> | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  if (!state?.setup.needed) return null;

  const opts = state.setup.protagonist;
  const fixedClassId = opts.classId;
  // 默认不预分配额外属性点。
  const current = alloc ?? (opts.defaultAllocation as Record<StatKey, number>);
  const chosenPortrait = portrait || opts.portraits[0]?.id || 'erin';
  const used = STAT_KEYS.reduce((sum, k) => sum + current[k], 0);
  const tendency = deriveProtagonistTendency(current as Stats);
  const bump = (k: StatKey, d: number) => setAlloc(a => {
    const base = a ?? (opts.defaultAllocation as Record<StatKey, number>);
    const next = Math.max(opts.minPerStat[k], Math.min(opts.maxPerStat[k], base[k] + d));
    const after = STAT_KEYS.reduce((sum, x) => sum + (x === k ? next : base[x]), 0);
    return after > opts.budget ? base : { ...base, [k]: next };
  });
  // 形象即主角的 character 锚点：换形象时把新形象从同伴里移除，旧形象回到可选池。
  const changePortrait = (id: string) => {
    setPortrait(id);
    setPicked(p => p.filter(x => x !== id));
  };
  const pool = state.setup.pool.filter(c => c.id !== chosenPortrait);
  const toggle = (id: string) => setPicked(cur => (cur.includes(id) ? cur.filter(x => x !== id) : cur.length < 2 ? [...cur, id] : cur));
  const trimmed = name.trim();
  const ready = trimmed.length >= 2 && trimmed.length <= 12 && picked.length === 2 && used === opts.budget;
  const submit = async () => {
    setBusy(true);
    try {
      await session.completeSetup({ name: trimmed, sex, portrait: chosenPortrait, allocation: current }, picked);
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
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 14, color: '#4E473D' }}>
            <span>职业 <b style={{ color: '#2B2620' }}>{opts.className}</b>（固定）</span>
            <span>成长 <b style={{ color: '#2B2620' }}>{GROWTH_TYPE_NAMES[opts.growthType as keyof typeof GROWTH_TYPE_NAMES]}</b>（固定）</span>
            <span>培养倾向 <b style={{ color: '#2B2620' }}>{PROTAGONIST_TENDENCIES[tendency].name}</b>（按属性分配自动推导）</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
            <span style={{ width: 64 }}>形象</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {opts.portraits.map(p => (
                <button key={p.id} type="button" title={p.name} onClick={() => changePortrait(p.id)}
                  style={{ padding: 2, cursor: 'pointer', borderRadius: 6, border: chosenPortrait === p.id ? '2px solid #8A6A2F' : '1px solid #C9BFA8', background: '#FFFDF7' }}>
                  <Face character={p.id} classId={fixedClassId} size={32} />
                </button>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 14 }}>
            <div style={{ color: '#4E473D' }}>保留基础属性 · 额外还剩 {opts.budget - used} / {opts.budget} 点（每项最多加 {opts.maxPerStat.str} 点）</div>
            <div className="alloc" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8, marginTop: 6 }}>
              {STAT_KEYS.map(k => (
                <div key={k} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className="al-k" style={{ width: 40 }}>{STAT_NAMES[k]}</span>
                  <span className="num" aria-label={`${STAT_NAMES[k]}基础值`}>{opts.baseStats[k]}</span>
                  <button type="button" className="btn btn-sm" aria-label={`${STAT_NAMES[k]} −1`} disabled={current[k] <= opts.minPerStat[k]} onClick={() => bump(k, -1)}>−</button>
                  <b className="num" style={{ minWidth: 20, textAlign: 'center' }} aria-label={`${STAT_NAMES[k]}加点`}>+{current[k]}</b>
                  <button type="button" className="btn btn-sm" aria-label={`${STAT_NAMES[k]} +1`} disabled={current[k] >= opts.maxPerStat[k] || used >= opts.budget} onClick={() => bump(k, 1)}>+</button>
                  <span className="num" aria-label={`${STAT_NAMES[k]}最终值`}>= {opts.baseStats[k] + current[k]}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 className="serif" style={{ fontSize: 18 }}>初始同伴（{picked.length}/2）</h2>
          <p style={{ fontSize: 13, color: '#4E473D' }}>从剩余预设中选两名；主角所选形象不可再选。</p>
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
                    <span style={{ fontSize: 12, color: '#4E473D' }}>{CLASSES[c.classId as keyof typeof CLASSES]?.name ?? c.classId} · Lv {c.level}</span>
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
