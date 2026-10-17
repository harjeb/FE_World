import { useState } from 'react';
import { CLASSES } from '@common/data/classes.ts';
import type { ClassId } from '@common/data/classes.ts';
import { session, useSession } from '../api/session.ts';
import { toast } from '../ui/toast.tsx';
import { Face } from './SystemParts.tsx';

// 开局自选同伴（docs/20 §5.1）：新账号只有主角，先挑两名同伴才能进游戏，只能选一次。
export function CompanionSetup() {
  const { state } = useSession();
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  if (!state?.setup.needed) return null;

  const toggle = (id: string) => setPicked(cur => (cur.includes(id) ? cur.filter(x => x !== id) : cur.length < 2 ? [...cur, id] : cur));
  const submit = async () => {
    setBusy(true);
    try {
      await session.chooseCompanions(picked);
      toast('同伴已加入名册');
    } catch (e) {
      toast(`选择失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-bg" style={{ minHeight: '100vh', padding: 24 }}>
      <div className="panel" style={{ maxWidth: 760, margin: '0 auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h1 className="serif" style={{ fontSize: 24 }}>组建你的军团</h1>
        <p style={{ fontSize: 14, color: '#4E473D' }}>开局只有主角一人。从下面选两名同伴，他们会立刻加入名册（只能选一次）。</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
          {state.setup.pool.map(c => {
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
                  <span style={{ fontSize: 12, color: '#4E473D' }}>{CLASSES[c.classId as ClassId]?.name} · Lv {c.level}</span>
                </span>
              </button>
            );
          })}
        </div>
        <button type="button" className="btn btn-primary" disabled={picked.length !== 2 || busy} onClick={() => void submit()}>
          {busy ? '加入中…' : `确认同伴（${picked.length}/2）`}
        </button>
      </div>
    </div>
  );
}
