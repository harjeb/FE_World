import { useState } from 'react';
import { regionById, REGIONS } from '@common/game/calendar.ts';
import { RECRUIT_UNLOCK_DAY } from '@common/game/random-recruit.ts';
import { OP } from '@common/protocol/ops.ts';
import { session, useSession } from '../api/session.ts';
import type { MinigameResult, ServerEmergency, TavernRow } from '../api/session.ts';
import { useServerData } from '../api/useServerData.ts';
import { annualLive } from '../model/roster.ts';
import { links } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { dateLabel, plainDate } from '../ui/calendar.ts';
import { Checks, Face, useAct } from './SystemParts.tsx';

const SPECIES = { human: '人类', beast: '兽人', dragon: '龙人' } as const;
// 返还倍率与判定（common/game/minigames.ts，docs/18）：押中总返还含本金。
const DICE_RETURN = 2;
// GET_TAVERN without a region lists these three (handlers.ts).
const DEFAULT_TAVERNS = [2, 3, 5];
const FROG_RETURN = 3.8;

// 酒馆 (docs/18, TODO SETUP-04): from the second year, three paid candidates per region each season, the
// two minigames, and the free recruit after heavy losses. None of it moves the personal date.
export function TavernPage() {
  const { state } = useSession();
  if (!state) return null;
  const open = state.day >= RECRUIT_UNLOCK_DAY;
  return (
    <Shell current="tavern">
      <div className="brief-head">
        <div>
          <div className="eyebrow">酒馆 · {dateLabel(state.day)}</div>
          <h1 className="serif" style={{ fontSize: 28, lineHeight: 1.25 }}>酒馆</h1>
          <p style={{ fontSize: 14, color: '#4E473D' }}>雇佣候选、两种小游戏都不推进日期。候选每季度刷新一次，刷新前不会重掷；小游戏可以完全不玩，不影响主线与招募。</p>
        </div>
        <div style={{ fontSize: 13, color: '#4E473D', textAlign: 'right' }}>金币 <b className="num">{state.gold.toLocaleString()}</b> · 名册 {state.rosterCount} / {state.rosterLimit}</div>
      </div>
      {!open && <p className="sys-strip" role="status">酒馆在第二年（{plainDate(RECRUIT_UNLOCK_DAY)}）开放，还有 {RECRUIT_UNLOCK_DAY - state.day} 日；游历招募同时开放。紧急补员不受这个限制。</p>}
      <div className="sys-cols">
        <div className="colstack">
          {open && <HirePanel />}
          {open && <MinigamePanel />}
        </div>
        <div className="colstack">
          <EmergencyPanel />
          <section className="panel" aria-labelledby="tr-h">
            <div className="ph"><h2 id="tr-h">规则</h2></div>
            <ul className="sys-rules">
              <li>每个地区每季度 3 名候选，价格按当前招募等级计算；雇到就加入名册，名册满时不能雇。</li>
              <li>游历招募在<a href={links.camp}>军营</a>：只花行动日，遇到候选后再决定接受或拒绝。</li>
              <li>小游戏每个游戏季度共 6 局正式局，两种游戏共用；属性、等级与装备都不影响结果。</li>
              <li>战斗、连续副本和年度赛事进行中不能下注。</li>
            </ul>
          </section>
        </div>
      </div>
    </Shell>
  );
}

function HirePanel() {
  const { state, annual } = useSession();
  const { busy, act } = useAct();
  const [region, setRegion] = useState<number | null>(null);
  const { data, error } = useServerData(() => session.tavern(region ?? undefined), [region]);
  if (!state) return null;
  const full = state.rosterCount >= state.rosterLimit;
  const locked = annualLive(annual);
  const groups = new Map<number, TavernRow[]>();
  for (const row of data?.regions ?? []) groups.set(row.region, [...(groups.get(row.region) ?? []), row]);
  return (
    <section className="panel" aria-labelledby="tv-h">
      <div className="ph">
        <h2 id="tv-h">本季候选</h2>
        <label className="inline-flex items-center gap-1.5" style={{ fontSize: 13 }}>
          地区
          <select value={region ?? ''} onChange={e => setRegion(e.target.value ? Number(e.target.value) : null)} aria-label="酒馆地区">
            <option value="">{DEFAULT_TAVERNS.map(id => regionById(id).name).join(' · ')}</option>
            {REGIONS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="sys-note">{error}</p>}
      {!data && !error && <p className="sys-note">读取酒馆…</p>}
      {[...groups].map(([id, rows]) => (
        <div key={id}>
          <div className="grp">{regionById(id).name}</div>
          <ul className="roster-mini tavern">
            {rows.map(row => (
              <li key={row.id} className={row.hired ? 'fallen' : undefined}>
                <Face character={row.portrait} classId={row.classId} portrait={row.portrait} size={40} dim={row.hired} />
                <span className="min-w-0">
                  <b>{row.name}</b><span className="muted"> · {row.className} Lv {row.level}</span>
                  <span className="rm-sub">{row.sex === 'female' ? '女' : '男'} · {SPECIES[row.species]}</span>
                </span>
                {row.hired
                  ? <span className="tag tag-grey">已雇佣</span>
                  : <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null || full || locked || state.gold < row.price}
                    title={full ? '名册已满' : state.gold < row.price ? '金币不足' : undefined}
                    onClick={() => void act(row.id, () => session.run(OP.HIRE_TAVERN, { region: row.region, id: row.id }), () => `${row.name}加入了名册（−${row.price.toLocaleString()} 金币）`)}>
                    {busy === row.id ? '雇佣中…' : `雇佣 ${row.price.toLocaleString()} 金`}
                  </button>}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {full && <p className="pfoot why">名册已满（{state.rosterLimit} 人）：先解雇或退役一人再雇佣。</p>}
    </section>
  );
}

function MinigamePanel() {
  const { state, today, run, annual } = useSession();
  const { data, error } = useServerData(() => session.minigames(), []);
  const [game, setGame] = useState<'dice' | 'frogs'>('dice');
  const [bet, setBet] = useState(20);
  const [choice, setChoice] = useState<'big' | 'small'>('big');
  const [pick, setPick] = useState(0);
  const [result, setResult] = useState<MinigameResult | null>(null);
  const { busy, act } = useAct();
  if (!state) return null;
  if (!data) return <section className="panel"><p className="sys-note">{error ?? '读取小游戏…'}</p></section>;
  const left = data.limit - data.played;
  const blocked = today?.battle ? '战斗进行中' : run && (run.state === 'battle' || run.state === 'between_maps') ? '连续副本进行中' : annualLive(annual) ? '年度赛事进行中' : null;
  const total = game === 'dice' ? bet * DICE_RETURN : Math.floor(bet * FROG_RETURN);
  const play = () => act('play', () => session.run<MinigameResult>(OP.PLAY_MINIGAME, game === 'dice' ? { game, bet, choice } : { game, bet, pick }), r => {
    setResult(r);
    return r.payout > 0 ? `赢了！入账 ${r.payout}，净赚 ${r.net}` : `没押中，净亏 ${-r.net}`;
  });
  return (
    <section className="panel" aria-labelledby="mg-h">
      <div className="ph"><h2 id="mg-h">小游戏</h2><span className={`tag ${left > 0 ? 'tag-blue' : 'tag-grey'}`}>本季还剩 {left} / {data.limit} 局</span></div>
      <div className="mg-tabs" role="tablist" aria-label="选择小游戏">
        <button type="button" role="tab" aria-selected={game === 'dice'} className="chip" onClick={() => setGame('dice')}>摇盅猜大小</button>
        <button type="button" role="tab" aria-selected={game === 'frogs'} className="chip" onClick={() => setGame('frogs')}>青蛙赛跑</button>
      </div>
      {game === 'dice'
        ? <div className="mg-body">
          <p className="sys-note">三颗骰子：总和 11–17 为大，10 及以下为小；三颗点数相同（三同点）押哪边都输。押对返还下注的 {DICE_RETURN} 倍（含本金）。</p>
          <div className="chips" role="radiogroup" aria-label="押大或小">
            <button type="button" role="radio" aria-checked={choice === 'big'} className="chip" onClick={() => setChoice('big')}>押大</button>
            <button type="button" role="radio" aria-checked={choice === 'small'} className="chip" onClick={() => setChoice('small')}>押小</button>
          </div>
        </div>
        : <div className="mg-body">
          <p className="sys-note">四只青蛙各 25% 机会夺冠；押中冠军返还下注的 {FROG_RETURN} 倍（含本金）。名字和跳法只是演出，不代表速度。</p>
          <div className="chips" role="radiogroup" aria-label="押哪只青蛙">
            {data.frogNames.map((frog, i) => <button key={frog} type="button" role="radio" aria-checked={pick === i} className="chip" onClick={() => setPick(i)}>{frog}</button>)}
          </div>
        </div>}
      <div className="mg-body">
        <div className="chips" role="radiogroup" aria-label="下注额">
          {data.bets.map(b => <button key={b} type="button" role="radio" aria-checked={bet === b} className="chip" disabled={state.gold < b} onClick={() => setBet(b)}>{b} 金</button>)}
        </div>
        <p className="mg-quote">下注 <b>{bet}</b> 金：押中入账 <b>{total}</b>（净赚 {total - bet}）；押错入账 0（净亏 {bet}）。</p>
      </div>
      {result && <MinigameOutcome result={result} frogs={data.frogNames} />}
      <div className="go-bar">
        {blocked && <span className="why" style={{ marginRight: 'auto' }}>{blocked}，不能下注</span>}
        <button type="button" className="btn btn-primary" disabled={busy !== null || left <= 0 || !!blocked || state.gold < bet} onClick={() => void play()}>
          {busy === 'play' ? '开局中…' : left <= 0 ? '本季正式局已用完' : `确认下注 ${bet} 金`}
        </button>
      </div>
    </section>
  );
}

function MinigameOutcome({ result, frogs }: { result: MinigameResult; frogs: string[] }) {
  const won = result.payout > 0;
  return (
    <div className={`mg-result ${won ? 'won' : 'lost'}`} role="status">
      {result.game === 'dice'
        ? <>
          <span className="dice" aria-label={`骰子 ${result.dice.join('、')}`}>{result.dice.map((d, i) => <b key={i}>{d}</b>)}</span>
          <span>总和 {result.total} · {result.triple ? '三同点' : result.big ? '大' : '小'}；押{result.choice === 'big' ? '大' : '小'}</span>
        </>
        : <span>名次：{result.order.map((frog, i) => `${i + 1}. ${frogs[frog]}`).join('　')}；押 {frogs[result.pick]}</span>}
      <b>{won ? `入账 ${result.payout}（净赚 ${result.net}）` : `净亏 ${-result.net}`}</b>
    </div>
  );
}

// 严重损失后的免费补员（EMERGENCY_RECRUIT）：真实伤亡使现役存活降到阈值以下时开放。
function EmergencyPanel() {
  const { data } = useServerData(() => session.memorial(), []);
  const status: ServerEmergency | null = data?.emergency ?? null;
  const { busy, act } = useAct();
  return (
    <section className="panel" aria-labelledby="em-h">
      <div className="ph"><h2 id="em-h">紧急补员</h2>{status && <span className={`tag ${status.available ? 'tag-green' : 'tag-grey'}`}>{status.available ? '可以领取' : '未开放'}</span>}</div>
      <p className="sys-note">真实伤亡使现役存活人数降到 {status?.threshold ?? 2} 人及以下（含主角）时，可以在酒馆免费招募随机 {status?.units ?? 2} 人：不花金币、不推进日期。解雇、退役与派遣都不算新伤亡；每次新的真实损失只能领一次。</p>
      {status && (
        <>
          <Checks items={[
            [status.deaths > status.claimedFor, `新的真实伤亡（已领取到第 ${status.claimedFor} 次）`],
            [status.survivors <= status.threshold, `现役存活 ${status.survivors} 人（需要 ≤${status.threshold}）`],
            [status.room >= status.units, `名册空位 ${status.room}（需要 ${status.units} 个）`],
          ]} />
          <div className="go-bar">
            <button type="button" className="btn btn-primary" disabled={busy !== null || !status.available}
              onClick={() => void act('recruit', () => session.run<{ units: { name: string; className: string; level: number }[] }>(OP.EMERGENCY_RECRUIT),
                r => `酒馆补员：${r.units.map(u => `${u.name}（${u.className} Lv ${u.level}）`).join('、')} 加入了名册`)}>
              {busy === 'recruit' ? '招募中…' : `免费招募 ${status.units} 人`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
