import { useCallback, useState } from 'react';
import { regionById } from '@common/game/calendar.ts';
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
import { CrossTimeExchange } from './CrossTimeExchange.tsx';
import { FrogFace, FrogRace } from './FrogRace.tsx';
import { toast } from '../ui/toast.tsx';

const SPECIES = { human: '人类', beast: '兽人', dragon: '龙人' } as const;
// 返还倍率与判定（common/game/minigames.ts，docs/18）：押中总返还含本金。
const DICE_RETURN = 2;

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
        </div>
        <div style={{ fontSize: 13, color: '#4E473D', textAlign: 'right' }}>金币 <b className="num">{state.gold.toLocaleString()}</b> · 名册 {state.rosterCount} / {state.rosterLimit}</div>
      </div>
      {!open && <p className="sys-strip" role="status">酒馆在第二年（{plainDate(RECRUIT_UNLOCK_DAY)}）开放，还有 {RECRUIT_UNLOCK_DAY - state.day} 日；游历招募同时开放。紧急补员不受这个限制。</p>}
      <CrossTimeExchange />
      {/* 酒馆未开放时左栏（候选＋小游戏）不渲染，紧急补员单独占满整行，避免空出一大列。 */}
      {open ? <div className="sys-cols">
        <div className="colstack">
          <HirePanel />
          <MinigamePanel />
        </div>
        <div className="colstack">
          <EmergencyPanel />
        </div>
      </div> : <div className="colstack"><EmergencyPanel /></div>}
    </Shell>
  );
}

function HirePanel() {
  const { state, annual } = useSession();
  const { busy, act } = useAct();
  const [region, setRegion] = useState<number | null>(null);
  // 只列已开通的地区（state.regions 就是已开通清单）；默认第一个已开通地区。
  const openRegions = state?.regions ?? [];
  const regionId = openRegions.some(r => r.id === region) ? region : openRegions[0]?.id ?? null;
  const { data, error } = useServerData(() => session.tavern(regionId ?? undefined), [regionId]);
  if (!state) return null;
  const full = state.rosterCount >= state.rosterLimit;
  const locked = annualLive(annual);
  const openIds = new Set(openRegions.map(r => r.id));
  const groups = new Map<number, TavernRow[]>();
  for (const row of data?.regions ?? []) if (openIds.has(row.region)) groups.set(row.region, [...(groups.get(row.region) ?? []), row]);
  return (
    <section className="panel" aria-labelledby="tv-h">
      <div className="ph">
        <h2 id="tv-h">本季候选</h2>
        <label className="inline-flex items-center gap-1.5" style={{ fontSize: 13 }}>
          地区
          {openRegions.length === 0 ? <a href={links.world}>先在世界地图开通地区</a> : (
            <select value={regionId ?? ''} onChange={e => setRegion(e.target.value ? Number(e.target.value) : null)} aria-label="酒馆地区">
              {openRegions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}
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
  // 青蛙赛跑：结果到手后先播演出，冲线后才揭晓输赢。
  const [racing, setRacing] = useState(false);
  const [raceNo, setRaceNo] = useState(0);
  const { busy, act } = useAct();
  const finishRace = useCallback(() => {
    setRacing(false);
    if (result?.game === 'frogs') toast(result.payout > 0 ? `押中了！入账 ${result.payout}，净赚 ${result.net}` : `没押中，净亏 ${-result.net}`);
  }, [result]);
  if (!state) return null;
  if (!data) return <section className="panel"><p className="sys-note">{error ?? '读取小游戏…'}</p></section>;
  const left = data.limit - data.played;
  const blocked = today?.battle ? '战斗进行中' : run && (run.state === 'battle' || run.state === 'between_maps') ? '连续副本进行中' : annualLive(annual) ? '年度赛事进行中' : null;
  const odds = data.frogs[pick];
  const times = (tenths: number) => (tenths / 10).toFixed(1);
  const total = game === 'dice' ? bet * DICE_RETURN : bet * odds.returnTenths / 10;
  const play = () => act('play', () => session.run<MinigameResult>(OP.PLAY_MINIGAME, game === 'dice' ? { game, bet, choice } : { game, bet, pick }), r => {
    setResult(r);
    if (r.game === 'frogs') {
      setRacing(true);
      setRaceNo(n => n + 1);
      return `开跑！押了${data.frogNames[r.pick]} ${r.bet} 金`;
    }
    return r.payout > 0 ? `赢了！入账 ${r.payout}，净赚 ${r.net}` : `没押中，净亏 ${-r.net}`;
  });
  return (
    <section className="panel" aria-labelledby="mg-h">
      <div className="ph"><h2 id="mg-h">小游戏</h2><span className={`tag ${left > 0 ? 'tag-blue' : 'tag-grey'}`}>本季还剩 {left} / {data.limit} 局</span></div>
      <div className="mg-tabs" role="tablist" aria-label="选择小游戏">
        <button type="button" role="tab" aria-selected={game === 'dice'} className="chip" onClick={() => setGame('dice')}>摇盅猜大小</button>
        <button type="button" role="tab" aria-selected={game === 'frogs'} className="chip" onClick={() => setGame('frogs')}>青蛙赛跑</button>
      </div>
      {game === 'frogs' && <div className="mg-body">
        <div className="frog-odds" role="radiogroup" aria-label="押哪只青蛙">
          {data.frogs.map((frog, i) => (
            <button key={frog.name} type="button" role="radio" aria-checked={pick === i} className="frog-pick" disabled={racing} onClick={() => setPick(i)}>
              <FrogFace frog={i} size={32} />
              <span className="fo-name">{frog.name}</span>
              <span className="fo-num">夺冠 {frog.chance}%</span>
              <b className="fo-pay">{times(frog.returnTenths)} 倍</b>
            </button>
          ))}
        </div>
      </div>}
      <div className="mg-body">
        {game === 'dice' && <div className="chips" role="radiogroup" aria-label="押大或小">
          <button type="button" role="radio" aria-checked={choice === 'big'} className="chip" onClick={() => setChoice('big')}>押大</button>
          <button type="button" role="radio" aria-checked={choice === 'small'} className="chip" onClick={() => setChoice('small')}>押小</button>
        </div>}
        <div className="chips" role="radiogroup" aria-label="下注额">
          {data.bets.map(b => <button key={b} type="button" role="radio" aria-checked={bet === b} className="chip" disabled={state.gold < b} onClick={() => setBet(b)}>{b} 金</button>)}
        </div>
        <p className="mg-quote">下注 <b>{bet}</b> 金{game === 'frogs' && <>押{odds.name}（夺冠 {odds.chance}%）</>}：押中入账 <b>{total}</b>（净赚 {total - bet}）；押错入账 0（净亏 {bet}）。</p>
      </div>
      {result?.game === 'frogs' && <FrogRace key={raceNo} order={result.order} pick={result.pick} names={data.frogNames} seed={`${raceNo}:${result.remaining}:${result.order.join('')}`} onDone={finishRace} />}
      {result && !racing && <MinigameOutcome result={result} frogs={data.frogNames} />}
      <div className="go-bar">
        {blocked && <span className="why" style={{ marginRight: 'auto' }}>{blocked}，不能下注</span>}
        <button type="button" className="btn btn-primary" disabled={busy !== null || racing || left <= 0 || !!blocked || state.gold < bet} onClick={() => void play()}>
          {busy === 'play' ? '开局中…' : racing ? '比赛进行中…' : left <= 0 ? '本季正式局已用完' : `确认下注 ${bet} 金`}
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
