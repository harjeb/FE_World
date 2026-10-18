import { useState } from 'react';
import { session, useSession } from '../api/session.ts';
import type { ActionQuote, ArtTrainingResult, ServerUnit } from '../api/session.ts';
import { useServerData } from '../api/useServerData.ts';
import { advance, dateLabel } from '../ui/calendar.ts';
import { QuoteBox, useAct } from './SystemParts.tsx';

export function ArtTrainingPanel({ unit }: { unit: ServerUnit }) {
  const version = useSession().state?.version ?? 0;
  return <Training key={`${unit.id}:${version}`} unit={unit} version={version} />;
}

function Training({ unit, version }: { unit: ServerUnit; version: number }) {
  const { data, error } = useServerData(() => session.artTraining(unit.id), [unit.id]);
  const { busy, act } = useAct();
  const [picked, setPicked] = useState<string | null>(null);
  const [quote, setQuote] = useState<ActionQuote | null>(null);
  const choice = data?.choices.find(c => c.art === picked)
    ?? data?.choices.find(c => c.available && !c.learned)
    ?? data?.choices.find(c => !c.learned && unit.learnedArts.includes(c.requires))
    ?? data?.choices[0];
  const canTrain = !!choice && choice.available && !choice.learned && unit.learnedArts.includes(choice.requires);
  const current = () => session.get().state?.version === version;

  async function preview() {
    if (!choice || !canTrain) return;
    setQuote(null);
    await act('quote', async () => {
      const result = await session.quote('art_training', { unitId: unit.id, art: choice.art });
      if (!current()) throw new Error('状态已更新，请重新获取报价');
      return result;
    }, result => {
      setQuote(result);
      return result.blockers.length ? result.blockers.join('；') : '研修报价已就绪，请确认日期与费用';
    });
  }

  async function confirm() {
    if (!quote || !canTrain) return;
    setQuote(null);
    await act('train', () => {
      if (!current()) throw new Error('状态已更新，请重新获取报价');
      return session.execute<ArtTrainingResult>(quote.quoteId);
    }, result => `${unit.name}学会了${result.name}：${result.days} 日，${result.costGold} 金币`);
  }

  return (
    <section className="panel" style={{ gridColumn: '1 / -1' }} aria-labelledby="art-training-h">
      <div className="ph"><h2 id="art-training-h">战技研修</h2>{data && <span className="num">{dateLabel(data.day)} · {data.gold} 金币</span>}</div>
      <p className="sys-note">先通过职业精通学会基础战技，再花费日期和金币研修进阶战技；学习不受当前职业或武器等级限制。</p>
      {error && <p className="sys-note" role="alert">读不到战技研修：{error}</p>}
      {!data && !error && <p className="sys-note" role="status">读取战技研修…</p>}
      {data && <>
        <div className="sys-note">
          <label>研修战技　<select value={choice?.art ?? ''} disabled={busy !== null} onChange={e => { setPicked(e.target.value); setQuote(null); }}>
            {data.choices.map(c => <option key={c.art} value={c.art} disabled={c.learned || !unit.learnedArts.includes(c.requires)}>
              {c.name} · 前置：{c.requiresName} · {c.days} 日 / {c.gold} 金币{c.learned ? ' · 已学会' : c.blocker ? ` · ${c.blocker}` : ''}
            </option>)}
          </select></label>
        </div>
        {choice ? <dl className="facts">
          <dt>效果</dt><dd>{choice.effect}</dd>
          <dt>前置战技</dt><dd>{choice.requiresName}（{unit.learnedArts.includes(choice.requires) ? '已学会' : '尚未学会'}）</dd>
          <dt>研修费用</dt><dd>{choice.days} 日 · {choice.gold} 金币 → {advance(data.day, choice.days).label}</dd>
          <dt>状态</dt><dd>{choice.learned ? '已学会' : choice.blocker ?? (canTrain ? '可以研修' : '尚未学会前置战技')}</dd>
        </dl> : <p className="sys-note">暂无可研修战技。</p>}
        {quote && <QuoteBox quote={quote} />}
        <div className="go-bar">
          <button type="button" className="btn btn-ghost" disabled={busy !== null || !canTrain || !!error} onClick={() => void preview()}>{busy === 'quote' ? '报价中…' : '查看研修报价'}</button>
          {quote && <button type="button" className="btn btn-primary" disabled={busy !== null || !canTrain || quote.blockers.length > 0 || !!error} onClick={() => void confirm()}>{busy === 'train' ? '研修中…' : '确认研修'}</button>}
        </div>
      </>}
    </section>
  );
}
