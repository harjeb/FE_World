import { useEffect, useState } from 'react';
import { ARENA_MAPS } from '@common/arena/maps.ts';
import { arenaPoints } from '@common/arena/rules.ts';
import type { Defense } from '@common/arena/rules.ts';
import { CHARACTERS } from '@common/data/characters.ts';
import { ARENA_GOLD } from '@common/game/arena.ts';
import { ICONS } from '../assets.ts';
import { session, useSession } from '../api/session.ts';
import type { ServerReplay } from '../api/session.ts';
import { DEFENSE_RESULTS, MY_DEFENSE, MY_POINTS, OPPONENTS, WORLD } from '../demo/live.ts';
import { links } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { dateLabel, plainDate } from '../ui/calendar.ts';
import { Crest } from './ArenaParts.tsx';
import { useSavedDefense } from './defenseStore.ts';
import { arena, todayPoints, useArena } from './store.ts';
import type { AttackRecord } from './store.ts';

const STATUS: Record<AttackRecord['status'], [string, string]> = {
  new: ['○ 未开始', 'todo'],
  revealed: ['● 待部署', 'live'],
  fighting: ['● 进行中', 'live'],
  won: ['✓ 胜利', 'win'],
  lost: ['✕ 落败', 'lose'],
};
const DEFENSE_STATUS = { held: ['✓ 守住', 'win'], lost: ['✕ 失守', 'lose'] } as const;

function outcome(record: AttackRecord): string {
  const battle = record.battle;
  if (!battle?.result) return record.status === 'won' ? '胜利' : record.battleId ? '落败' : '没打，按落败计';
  const p = arenaPoints(battle);
  if (battle.result.reason === '投降') return '已投降，按落败计';
  return p.total > 0 ? `第 ${battle.turn} / ${battle.turnLimit} 回合${battle.result.reason}${p.flawless ? ' · 无人阵亡' : ''}` : `第 ${battle.turn} 回合 · ${battle.result.reason}`;
}

function breakdown(record: AttackRecord): string {
  if (!record.battle?.result) return record.points > 0 ? '胜利' : '落败';
  const p = arenaPoints(record.battle);
  return p.total > 0 ? [`胜 ${p.win}`, p.flawless && `无阵亡 ${p.flawless}`, p.swift && `速胜 ${p.swift}`].filter(Boolean).join(' · ') : '落败';
}

// What the defense was set to do, ignoring unit stats (those follow the roster between arena days).
const plan = (d: Defense) => JSON.stringify([d.map, d.commanders, d.bans, d.slots.map(s => [s.unit.character, s.pos, s.behavior])]);

// 竞技场 · 结果 (ArenaResults artboard) on the personal calendar (docs/00 §2, §10): on an arena day it
// is today's attacks; on any other day it is the last settled arena day plus when the next one comes.
// Everything comes from GET_ARENA / GET_ARENA_RESULTS / GET_REPLAYS.
export function ArenaHub() {
  const { arena: info, results } = useSession();
  const day = useArena();
  const nextDefense = useSavedDefense();
  const [replays, setReplays] = useState<ServerReplay[] | null>(null);
  useEffect(() => {
    let alive = true;
    session.replays().then(list => { if (alive) setReplays(list); }).catch(() => { if (alive) setReplays([]); });
    return () => { alive = false; };
  }, []);

  const open = !!info?.isArenaDay && !info.settled && info.day === WORLD.day;
  const recordDay = info?.day ?? null;
  const toArena = WORLD.nextArenaDay - WORLD.day;
  const today = todayPoints(day);
  const dayPoints = open ? today : info?.progress?.points ?? 0;
  const views = results?.attacks ?? [];
  const wins = views.filter(a => a.status === 'won').length;
  const paid = views.filter(a => a.status === 'lost' && !a.noShow && !a.surrender).length;
  const gold = wins * ARENA_GOLD.win + paid * ARENA_GOLD.loss;
  const held = DEFENSE_RESULTS.filter(r => r.status === 'held').length;
  const locked = results?.lockedDefense ?? null;
  const shown = locked ?? MY_DEFENSE;
  const others = replays?.filter(r => !r.mine && r.kind === 'arena') ?? null;

  return (
    <Shell current="arena">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">竞技场{recordDay !== null ? ` · ${dateLabel(recordDay)}` : ''}</div>
          <h1 className="serif" style={{ fontSize: 26, lineHeight: 1.25 }}>{open ? '今日对局与结果' : recordDay !== null ? '上次竞技场结果' : '竞技场'}</h1>
        </div>
        <div style={{ fontSize: 14, color: '#4E473D' }}>
          {open ? '今天是竞技场日 · 推进日期后结算' : <>下一个竞技场日：{plainDate(WORLD.nextArenaDay)}（<b className="num">{toArena}</b> 日后）</>}
        </div>
      </div>

      <div className="sum">
        <div><span>{open ? '今日积分' : '当日积分'}</span><b className="num">+{dayPoints} <small>{open ? `已打 ${day.done} / ${OPPONENTS.length} 场` : '含防守'}</small></b></div>
        <div><span>竞技场积分</span><b className="num">{(MY_POINTS + (open ? today : 0)).toLocaleString()} {open && today > 0 && <small>含今日</small>}</b></div>
        <div><span>排名</span><b className="num">第 {WORLD.rank.place} 名 <small>按积分估算</small></b></div>
        <div><span>{open ? '今日进度' : '当日战绩'}</span><b style={{ fontSize: 20 }}>{open ? `进攻 ${day.done} / ${OPPONENTS.length}` : `进攻 ${wins} 胜 · 守住 ${held} / ${DEFENSE_RESULTS.length}`}</b></div>
      </div>

      <div className="arena-cols">
        <div className="flex flex-col gap-3" style={{ flex: '999 1 560px', minWidth: 0 }}>
          <section className="panel" aria-labelledby="atk-h">
            <div className="ph"><h2 id="atk-h">我方进攻</h2><span style={{ fontSize: 12, color: '#6A6256' }}>{open ? '没打的进攻在推进日期后按落败计' : recordDay !== null ? '已结算' : ''}</span></div>
            {OPPONENTS.length === 0 && <p className="def-next">还没有竞技场记录：到达竞技场日时会自动报名并生成对手。</p>}
            <ol>
              {OPPONENTS.map(o => {
                const record = arena.record(o.id);
                const map = ARENA_MAPS[o.map];
                const [label, tone] = STATUS[record.status];
                const finished = record.status === 'won' || record.status === 'lost';
                const action: [string, string] | null = finished ? (record.battleId ? ['回放', links.replay(record.battleId)] : null)
                  : !open ? null
                    : record.status === 'new' ? ['查看对手', links.ban(o.id)]
                      : record.status === 'revealed' ? ['继续部署', links.deploy(o.id)] : ['继续战斗', links.battle(o.id)];
                const detail = finished ? outcome(record)
                  : record.status === 'new' ? `出战 ${map.deploy} · 禁用 ${map.bans} · ${map.turnLimit} 回合 · 胜利条件：${map.goalText}`
                    : `已禁用 ${record.bans.map(c => CHARACTERS[c].name).join('、')}${record.battle ? ` · 第 ${record.battle.turn} 回合` : ' · 等待部署'}`;
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
                      <span>{finished ? breakdown(record) : record.status === 'new' ? '推进日期前打' : '结束后结算'}</span>
                    </div>
                    {action ? <a className={`btn btn-sm${finished ? '' : ' btn-primary'}`} href={action[1]}>{action[0]}</a> : <span />}
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="panel" aria-labelledby="def-h">
            <div className="ph">
              <h2 id="def-h">我方防守 <span style={{ fontWeight: 500, color: '#6A6256' }}>{ARENA_MAPS[shown.map].name} · 主将 {CHARACTERS[shown.commanders[0]].name}</span></h2>
              <a className="btn btn-sm btn-ghost" href={links.defense}>防守设置</a>
            </div>
            {DEFENSE_RESULTS.length > 0
              ? (
                <ol>
                  {DEFENSE_RESULTS.map(r => {
                    const [label, tone] = DEFENSE_STATUS[r.status];
                    return (
                      <li key={r.legion} className="match">
                        <span className={`res ${tone}`}>{label}</span>
                        <span className="crest" style={{ background: r.color, width: 40, height: 40 }} aria-hidden="true">{r.letter}</span>
                        <div className="min-w-0">
                          <div className="m-n">{r.legion} 试攻</div>
                          <div className="m-d">{r.detail}</div>
                        </div>
                        <div className="pts">
                          <b style={{ color: r.status === 'held' ? '#2C4A5E' : '#93392F' }}>{r.status === 'held' ? '+10' : '0'}</b>
                          <span>{r.status === 'held' ? '防守成功' : '防守失败'}</span>
                        </div>
                        <span />
                      </li>
                    );
                  })}
                </ol>
              )
              : <p className="def-next">{open ? '推进日期结算时，由规则 AI 用官方队伍试攻你锁定的防守；每守住一场得 10 分和 1 枚勋章。' : '还没有防守记录。'}</p>}
            <p className="def-next">
              {locked && recordDay !== null
                ? `${open ? '今天' : '那天'}用的是${plainDate(recordDay)}报名时锁定的防守。下一次：${plan(locked) === plan(nextDefense) ? '与这次相同' : `已改为${ARENA_MAPS[nextDefense.map].name}，${CHARACTERS[nextDefense.commanders[0]].name}任主将`}。`
                : '到达竞技场日时自动报名，锁定当时的防守。'}
            </p>
          </section>
        </div>

        <div className="flex flex-col gap-3" style={{ flex: '1 1 340px', minWidth: 0 }}>
          <section className="panel" aria-labelledby="rw-h">
            <div className="ph"><h2 id="rw-h">{open ? '今日奖励' : '当日奖励'}</h2><span style={{ fontSize: 12, color: '#6A6256' }}>{open ? '推进日期后结算' : '已结算'}</span></div>
            <div className="rw">
              <div><img className="px" src={ICONS.medal} width={24} height={24} alt="" /><span><span>竞技场勋章</span><b>{open ? '结算时' : `+${held}`}</b></span></div>
              <div><img className="px" src={ICONS.coin} width={24} height={24} alt="" /><span><span>金币{open ? '（已打的场次）' : ''}</span><b>+{gold}</b></span></div>
            </div>
            <p style={{ padding: '10px 16px', fontSize: 13, color: '#4E473D' }}>进攻胜利 +{ARENA_GOLD.win} 金币、落败 +{ARENA_GOLD.loss}；没打或投降不发金币。每守住一场防守得 1 枚勋章。</p>
          </section>

          <section className="panel" aria-labelledby="lock-h">
            <div className="ph"><h2 id="lock-h">他人对局回放</h2><span className="tag tag-grey">结束即公开</span></div>
            {others && others.length > 0
              ? <ul className="lr">{others.slice(0, 4).map(r => <li key={r.id}><span>{r.name}</span><a className="btn btn-sm" href={links.replay(r.id)}>观看</a></li>)}</ul>
              : <p style={{ padding: '10px 16px', fontSize: 13, color: '#6A6256' }}>{others ? '还没有其他军团公开的竞技场回放。' : '读取中…'}</p>}
          </section>

          <section className="panel" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <b style={{ fontSize: 14 }}>计分规则</b>
            <div style={{ fontSize: 13, color: '#4E473D' }}>进攻胜利 +20，无人阵亡 +5，在回合上限一半内获胜再 +5；防守成功 +10；落败或弃权 0。</div>
          </section>
        </div>
      </div>
    </Shell>
  );
}
