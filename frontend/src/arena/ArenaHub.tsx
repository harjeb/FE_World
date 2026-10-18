import { ARENA_MAPS } from '@common/arena/maps.ts';
import type { ArenaMapId } from '@common/arena/maps.ts';
import { arenaPoints } from '@common/arena/rules.ts';
import { ARENA_GOLD } from '@common/game/arena.ts';
import { annualIndexFor } from '@common/game/annual.ts';
import { OP } from '@common/protocol/ops.ts';
import { ICONS } from '../assets.ts';
import { session, useSession } from '../api/session.ts';
import { useServerData } from '../api/useServerData.ts';
import { annualLive } from '../model/roster.ts';
import { links } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { dateLabel, plainDate } from '../ui/calendar.ts';
import { useAct } from '../pages/SystemParts.tsx';
import { Crest } from './ArenaParts.tsx';
import { arena, useArena } from './store.ts';
import type { AttackRecord } from './store.ts';

const STATUS: Record<AttackRecord['status'], [string, string]> = {
  new: ['○ 未开始', 'todo'],
  revealed: ['● 待部署', 'live'],
  fighting: ['● 进行中', 'live'],
  won: ['✓ 胜利', 'win'],
  lost: ['✕ 落败', 'lose'],
};

function outcome(record: AttackRecord): string {
  if (record.noShow) return '没打，按落败计（不发金币）';
  if (record.surrender) return '已投降，按落败计（不发金币）';
  const battle = record.battle;
  if (!battle?.result) return record.status === 'won' ? '胜利' : '落败';
  const p = arenaPoints(battle);
  return p.total > 0 ? `第 ${battle.turn} / ${battle.turnLimit} 回合${battle.result.reason}${p.flawless ? ' · 无人阵亡' : ''}` : `第 ${battle.turn} 回合 · ${battle.result.reason}`;
}

function breakdown(record: AttackRecord): string {
  if (!record.battle?.result) return record.points > 0 ? '胜利' : '落败';
  const p = arenaPoints(record.battle);
  return p.total > 0 ? [`胜 ${p.win}`, p.flawless && `无阵亡 ${p.flawless}`, p.swift && `速胜 ${p.swift}`].filter(Boolean).join(' · ') : '落败';
}

const month = (id: string) => id.replace(/^(\d{4})-(\d{2}).*$/, '$1 年 $2 月');

// 普通竞技场 (docs/00 §10, TODO ARENA-01–05): attack-only. Register once, three opponents a day, each
// attack moves the date 1 day; the score feeds the real-month table and its rewards.
export function ArenaHub() {
  const { state, arena: info, results, annual } = useSession();
  const day = useArena();
  const { busy, act } = useAct();
  const { data: ratings } = useServerData(() => session.ratings(), []);
  const { data: others } = useServerData(() => session.replays({ activity: 'arena', limit: 30 }), []);
  if (!state) return null;
  const open = arena.open();
  const opponents = arena.opponents();
  const recordDay = info?.day ?? null;
  const toArena = state.arena.nextArenaDay - state.day;
  const views = results?.attacks ?? [];
  const wins = views.filter(a => a.status === 'won').length;
  const paid = views.filter(a => a.status === 'lost' && !a.noShow && !a.surrender).length;
  const gold = wins * ARENA_GOLD.win + paid * ARENA_GOLD.loss;
  const live = annualLive(annual);
  const theirs = (others?.replays ?? []).filter(r => !r.mine).slice(0, 4);
  const current = ratings?.current;

  return (
    <Shell current="arena">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">普通竞技场{recordDay !== null ? ` · ${dateLabel(recordDay)}` : ''}</div>
          <h1 className="serif" style={{ fontSize: 26, lineHeight: 1.25 }}>{open ? '当日对局' : recordDay !== null ? '上次竞技场结果' : '竞技场'}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3" style={{ fontSize: 14, color: '#4E473D' }}>
          <span>{state.arena.isArenaDay ? '今天是竞技场日' : <>下一个竞技场日：{plainDate(state.arena.nextArenaDay)}（<b className="num">{toArena}</b> 日后）</>}</span>
          <a className="btn btn-sm" href={links.annual}>年度大竞技场{annual ? ` · 第 ${live || annual.windowOpen || annual.nextOpenDay >= 4000 ? annual.annualIndex : annualIndexFor(annual.nextOpenDay)} 届` : ''}{live ? ' · 进行中' : annual?.windowOpen && !(annual.entry && annual.entry.annualIndex === annual.annualIndex) ? ' · 报名中' : ''} ›</a>
        </div>
      </div>

      {!state.arena.registered && (
        <section className="panel register" aria-label="报名竞技场">
          <div>
            <b>还没有报名普通竞技场</b>
            <p style={{ fontSize: 13, color: '#4E473D' }}>报名后当天生成 3 个对手（同日到达的其他军团快照，不足时由官方队伍补足），之后每个竞技场日自动生成。只打进攻，不需要编防守队；模拟战没有真实伤亡，也不发等级经验。</p>
          </div>
          <button type="button" className="btn btn-primary" disabled={busy !== null || live}
            onClick={() => void act('register', () => session.run(OP.ARENA_REGISTER), () => '已报名普通竞技场')}>{busy === 'register' ? '报名中…' : '报名'}</button>
        </section>
      )}

      <div className="sum">
        <div><span>{open ? '当日积分' : '上次积分'}</span><b className="num">+{open ? day.points : info?.progress?.points ?? 0} <small>{open ? `已打 ${day.done} / ${opponents.length} 场` : ''}</small></b></div>
        <div><span>竞技场积分</span><b className="num">{state.arena.points.toLocaleString()} <small>勋章 {state.arena.medals}</small></b></div>
        <div><span>本月排名</span><b className="num">{current?.rank ? <>第 {current.rank} 名 <small>/ {current.field} 人</small></> : <>未上榜 <small>{current ? `${current.field} 人参赛` : ''}</small></>}</b></div>
        <div><span>{open ? '当日进度' : '当日战绩'}</span><b style={{ fontSize: 20 }}>{open ? `进攻 ${day.done} / ${opponents.length}` : `进攻 ${wins} 胜 ${views.length - wins} 负`}</b></div>
      </div>

      <div className="arena-cols">
        <div className="flex flex-col gap-3" style={{ flex: '999 1 560px', minWidth: 0 }}>
          <section className="panel" aria-labelledby="atk-h">
            <div className="ph"><h2 id="atk-h">我方进攻</h2><span style={{ fontSize: 12, color: '#6A6256' }}>{open ? '每场入场推进 1 日；打完或到下一个竞技场日时，没打的才按落败计' : recordDay !== null ? '已结算' : ''}</span></div>
            {opponents.length === 0 && <p className="def-next">{state.arena.registered ? '还没有对手：到达竞技场日时会生成。' : '报名后当天生成对手。'}</p>}
            <ol>
              {opponents.map(o => {
                const record = arena.record(o.id);
                const map = ARENA_MAPS[o.map as ArenaMapId];
                const [label, tone] = STATUS[record.status];
                const finished = record.status === 'won' || record.status === 'lost';
                const action: [string, string] | null = finished ? (record.battleId ? ['战报', links.replay(record.battleId)] : null)
                  : !open || live ? null
                    : record.status === 'new' ? ['查看对手', links.ban(o.id)]
                      : record.status === 'revealed' ? ['继续部署', links.deploy(o.id)] : ['继续战斗', links.battle(o.id)];
                const detail = finished ? outcome(record)
                  : record.status === 'new' ? `出战 ${map.deploy} · 禁用 ${map.bans} · ${map.turnLimit} 回合 · 胜利条件：${map.goalText}`
                    : `已禁用 ${record.bans.length} 人${record.battle ? ` · 第 ${record.battle.turn} 回合` : ' · 等待部署'}`;
                return (
                  <li key={o.id} className="match">
                    <span className={`res ${tone}`}>{label}</span>
                    <Crest id={o.id} size={40} />
                    <div className="min-w-0">
                      <div className="m-n">{o.legion} · {map.name}</div>
                      <div className="m-d">{detail}</div>
                    </div>
                    <div className="pts">
                      <b style={{ color: record.points > 0 ? '#2C4A5E' : finished ? '#93392F' : undefined }}>{finished ? `+${record.points}` : '—'}</b>
                      <span>{finished ? breakdown(record) : record.status === 'new' ? '入场推进 1 日' : '结束后计分'}</span>
                    </div>
                    {action ? <a className={`btn btn-sm${finished ? '' : ' btn-primary'}`} href={action[1]}>{action[0]}</a> : <span />}
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="panel" aria-labelledby="rt-h">
            <div className="ph"><h2 id="rt-h">现实月榜{ratings ? ` · ${month(ratings.period.id)}` : ''}</h2><span style={{ fontSize: 12, color: '#6A6256' }}>按现实月份归档，与个人日历无关</span></div>
            {!ratings && <p className="def-next">读取月榜…</p>}
            {ratings && <>
              <div className="rw rw-3">
                <div><span><span>月榜分</span><b>{ratings.current.rating}</b></span></div>
                <div><span><span>本月战绩</span><b>{ratings.current.wins} 胜 {ratings.current.losses} 负</b></span></div>
                <div><span><span>名次</span><b>{ratings.current.rank ? `第 ${ratings.current.rank} 名` : '未上榜'}</b></span></div>
              </div>
              <div className="grp">已归档的月份</div>
              <ul className="lr">
                {ratings.archived.map(p => (
                  <li key={p.id}>
                    <span>{month(p.id)}{p.reward ? ` · 第 ${p.reward.finalRank} 名 · ${p.reward.reward.gold.toLocaleString()} 金币` : ' · 没有参赛'}</span>
                    {p.reward && (p.reward.claimedAt
                      ? <span className="tag tag-grey">已领取</span>
                      : <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null}
                        onClick={() => void act(p.id, () => session.run<{ gold: number }>(OP.CLAIM_RATING_REWARD, { periodId: p.id }), r => `领取${month(p.id)}月榜奖励：金币 +${r.gold.toLocaleString()}`)}>领取</button>)}
                  </li>
                ))}
                {ratings.archived.length === 0 && <li><span className="muted">还没有归档的月份；每个现实月结束时归档并冻结奖励。</span></li>}
              </ul>
            </>}
          </section>
        </div>

        <div className="flex flex-col gap-3" style={{ flex: '1 1 340px', minWidth: 0 }}>
          <section className="panel" aria-labelledby="rw-h">
            <div className="ph"><h2 id="rw-h">{open ? '当日奖励' : '上次奖励'}</h2><span style={{ fontSize: 12, color: '#6A6256' }}>{open ? '打完三场或到下一个竞技场日时结算' : '已结算'}</span></div>
            <div className="rw">
              <div><img className="px" src={ICONS.coin} width={24} height={24} alt="" /><span><span>金币{open ? '（已打完的场次）' : ''}</span><b>+{gold}</b></span></div>
              <div><img className="px" src={ICONS.medal} width={24} height={24} alt="" /><span><span>积分</span><b>+{open ? day.points : info?.progress?.points ?? 0}</b></span></div>
            </div>
            <p style={{ padding: '10px 16px', fontSize: 13, color: '#4E473D' }}>进攻胜利 +{ARENA_GOLD.win} 金币、打完的落败 +{ARENA_GOLD.loss}；没打或投降不发金币。</p>
          </section>

          <section className="panel" aria-labelledby="lock-h">
            <div className="ph"><h2 id="lock-h">他人对局回放</h2><span className="tag tag-grey">结束即公开</span></div>
            {theirs.length > 0
              ? <ul className="lr">{theirs.map(r => <li key={r.id}><span>{r.name}</span><a className="btn btn-sm" href={links.replay(r.id)}>观看</a></li>)}</ul>
              : <p style={{ padding: '10px 16px', fontSize: 13, color: '#6A6256' }}>{others ? '还没有其他军团公开的竞技场回放。' : '读取中…'}</p>}
          </section>

          <section className="panel" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <b style={{ fontSize: 14 }}>计分规则</b>
            <div style={{ fontSize: 13, color: '#4E473D' }}>进攻胜利 +20，无人阵亡 +5，在回合上限一半内获胜再 +5；落败、投降或没打 0。首版只有进攻，不需要设置防守；对手的历史快照只作为 AI 对手出现。</div>
          </section>
        </div>
      </div>
    </Shell>
  );
}
