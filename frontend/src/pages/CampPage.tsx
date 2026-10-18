import type { ReactNode } from 'react';
import { DAYS_PER_SEASON, DAYS_PER_YEAR, SEASONS_PER_YEAR, dateOf } from '@common/game/calendar.ts';
import { regionById } from '@common/game/calendar.ts';
import { OP } from '@common/protocol/ops.ts';
import { CRESTS, ICONS } from '../assets.ts';
import { session, useSession } from '../api/session.ts';
import type { ServerUnit } from '../api/session.ts';
import { useServerData } from '../api/useServerData.ts';
import { annualLive, canPromote, LIFESPAN_TEXT, rosterOrder, STATUS_TAG, STATUS_TEXT, unitStatus } from '../model/roster.ts';
import { links } from '../router.ts';
import { agentOnline, Shell } from '../shell/Shell.tsx';
import { AnvilIcon, CandleIcon, CompassIcon, LockIcon, QuestIcon, RosterIcon, ScrollIcon } from '../ui/icons.tsx';
import { dateLabel, plainDate } from '../ui/calendar.ts';
import { toast } from '../ui/toast.tsx';
import { CampActions } from './CampActions.tsx';
import { UnitFace } from './SystemParts.tsx';

interface Task {
  key: string; icon: ReactNode; title: string; tag?: [string, string]; desc: string;
  action?: { label: string; href?: string; run?: () => void; primary?: boolean };
}

const icon = (src: string, size: number) => <img className="px" src={src} width={size} height={size} alt="" />;

// 军营首页 · 作战简报 (Camp artboard) on the personal calendar (docs/00 §2): what is pending today, the
// day actions, the legion at a glance and what the Agent reported. Everything comes from the server.
export function CampPage() {
  const { state, today, arena, results, run, annual, story, production, legacies, quests } = useSession();
  const { data: dispatches } = useServerData(() => session.dispatches(), []);
  const { data: agent } = useServerData(() => session.agentInfo(), []);
  if (!state) return null;
  const day = state.day;
  const date = dateOf(day);
  const toArena = state.arena.nextArenaDay - day;
  const progress = arena && !arena.settled && arena.day !== null ? arena.progress : null;
  const left = progress ? progress.total - progress.done : 0;
  const battle = today?.battle ?? null;
  const active = state.units.filter(u => u.status === 'active');
  const ordered = rosterOrder(active, annual);
  const ready = ordered.filter(u => unitStatus(u, annual) === 'ready');
  const away = ordered.filter(u => unitStatus(u, annual) !== 'ready');
  const promotable = active.filter(canPromote);
  const aging = active.filter(u => u.lifespanWarning !== 'none');
  const cleared = state.progress.cleared;
  const seasonLeft = DAYS_PER_SEASON - date.dayOfSeason;
  const summary = `名册 ${active.length} / ${state.rosterLimit} 人 · 可出战 ${ready.length} 人 · 已讨伐 ${cleared} / ${state.regions.length} 个地区`;

  const tasks: Task[] = [];
  if (battle) {
    const inRun = battle.kind === 'field' && run?.battleId === battle.id;
    const href = battle.mode === 'festival' ? links.annual : inRun ? links.dungeon : battle.kind === 'field' ? links.field
      : battle.mode === 'arena' && battle.opponentId ? links.battle(battle.opponentId) : null;
    tasks.push({
      key: 'battle', icon: icon(ICONS.sortie, 32), title: `进行中的战斗 · ${battle.name}`, tag: [`第 ${battle.turn} 回合`, 'tag-blue'],
      desc: battle.mode === 'festival' ? '大竞技场的这一场还没打完，倒下的普通角色会永久死亡。'
        : inRun ? `连续副本第 ${run!.stageIndex + 1} 图还没打完，HP 与道具跨图不恢复。`
          : battle.kind === 'field' ? '这场战斗还没结束，结束前不能开始新的战斗。' : '这场竞技场进攻还没结束。',
      action: href ? { label: '继续战斗', href, primary: true } : undefined,
    });
  }
  const pending = state.pendingRecruit;
  if (pending) {
    const full = active.length >= state.rosterLimit;
    tasks.push({
      key: 'recruit', icon: <RosterIcon />, title: `游历候选 · ${pending.name}`, tag: [`${pending.className} Lv ${pending.level}`, 'tag-brass'],
      desc: `在${pending.regionName}遇到的候选，接受前一直保留，重连不重掷。${full ? '名册已满：先腾出位置再接受。' : '拒绝不退已花的日期。'}`,
      action: { label: '去确认', href: `${links.camp}?recruit`, primary: true },
    });
  }
  if (run?.state === 'between_maps') {
    tasks.push({
      key: 'run', icon: icon(ICONS.sortie, 32), title: `连续副本 · 第 ${run.stageIndex + 1} 图待出发`, tag: [`存活 ${run.survivingIds.length} / ${run.unitIds.length}`, 'tag-brass'],
      desc: '可以带着现在的 HP 与道具继续，或撤离并放弃未带回的掉落。远征没结束前不能出击或报名大竞技场。',
      action: { label: '查看远征', href: links.dungeon, primary: true },
    });
  }
  const annualEntry = annual?.entry && annual.entry.annualIndex === annual.annualIndex ? annual.entry : null;
  if (annual && annualLive(annual) && battle?.mode !== 'festival') {
    tasks.push({
      key: 'annual', icon: icon(ICONS.medal, 24), title: `第 ${annual.annualIndex} 届大竞技场 · 下一场`, tag: [annualEntry?.state === 'qualifier' ? `海选 ${annualEntry.qualifierWins} 胜 ${annualEntry.qualifierCount - annualEntry.qualifierWins} 负` : '正赛', 'tag-blue'],
      desc: `每场推进 ${annual.costDays} 日，真实死亡；局间只恢复存活者的 HP。赛事期间其他行动暂停。`, action: { label: '去赛程', href: links.annual, primary: true },
    });
  } else if (annual && !annualEntry && annual.windowOpen) {
    tasks.push({
      key: 'annual', icon: icon(ICONS.medal, 24), title: `第 ${annual.annualIndex} 届大竞技场报名中`, tag: ['报名窗口', 'tag-brass'],
      desc: '报名锁定名单与快照；海选 3 场至少 2 胜进正赛。名次不影响主线章节。', action: { label: '报名', href: links.annual },
    });
  }
  const chapter = story?.chapters.find(c => c.available && (!c.completed || !c.claimed));
  if (story && chapter) {
    tasks.push({
      key: 'story', icon: <ScrollIcon />, title: `主线第 ${chapter.chapter} 章「${chapter.title}」`, tag: chapter.completed ? ['奖励待领取', 'tag-green'] : ['可完成', 'tag-blue'],
      desc: chapter.completed ? `已完成，可以领取团队公共经验 ${story.bexp}。` : '章节事件已开放，名次和地区进度都不挡章节。', action: { label: '去主线', href: links.story },
    });
  }
  const claimable = quests?.regions.flatMap(r => r.quests.filter(q => q.done && !q.claimed).map(q => ({ ...q, regionName: r.name }))) ?? [];
  if (claimable.length > 0) {
    tasks.push({
      key: 'quests', icon: <QuestIcon />, title: `地区任务 · ${claimable.length} 份奖励待领取`, tag: ['奖励待领取', 'tag-green'],
      desc: `${claimable.slice(0, 3).map(q => `${q.regionName}「${q.name}」`).join('、')}${claimable.length > 3 ? ' 等' : ''}。金币、物资与声望要手动领取；固定人物在领奖时加入。`,
      action: { label: '去领取', href: links.quests },
    });
  }
  const ripe = production?.ready.length ?? 0;
  if (ripe > 0) {
    tasks.push({ key: 'craft', icon: <AnvilIcon />, title: `生产 · ${ripe} 件已成熟`, desc: '领取不推进日期；领取后工位空出来，可以开下一单。', action: { label: '去领取', href: links.workshop } });
  }
  const heirs = legacies?.legacies.filter(l => l.state === 'available').length ?? 0;
  if (heirs > 0) {
    tasks.push({
      key: 'legacy', icon: <CandleIcon />, title: `传承 · ${heirs} 份遗产待兑现`,
      desc: state.legacyUnlocked ? '遗产可以交给一名 1 级新角色，选择成长传承或数值传承。' : '传承尚未解锁：完成任一地区的核心任务并领奖后开放。',
      action: { label: '查看遗产', href: links.legacy },
    });
  }
  const urgent = aging.filter(u => u.lifespanWarning === 'lastSeason' || u.lifespanWarning === 'due');
  if (urgent.length > 0) {
    tasks.push({
      key: 'age', icon: <CandleIcon />, title: `寿命预警 · ${urgent.map(u => u.name).join('、')}`, tag: ['不足一季', 'tag-red'],
      desc: '寿终会永久离队；达到传承等级的可以先正常退役留下遗产。跨过寿终日的行动会被服务端阻挡。',
      action: { label: '查看', href: links.roster(urgent[0].id, 'retire') },
    });
  }
  if (!state.arena.registered) {
    tasks.push({
      key: 'arena', icon: icon(ICONS.medal, 24), title: '普通竞技场 · 未报名', desc: '报名后当天就会生成 3 个对手；每场进攻推进 1 日，只打进攻，没有防守。',
      action: {
        label: '报名', primary: true,
        run: () => void session.run(OP.ARENA_REGISTER).then(() => toast('已报名普通竞技场'), e => toast(`报名失败：${e instanceof Error ? e.message : String(e)}`)),
      },
    });
  } else if (progress) {
    tasks.push({
      key: 'arena', icon: icon(ICONS.medal, 24), title: '竞技场 · 当日进攻', tag: [`进攻 ${progress.done} / ${progress.total}`, left === 0 ? 'tag-green' : 'tag-brass'],
      desc: left > 0 ? `还有 ${left} 场进攻没打，每场推进 1 日；离开当日后未打的按落败计、不发金币。` : '进攻已全部打完；推进日期后结算积分与金币。',
      action: { label: '去竞技场', href: links.arena, primary: left > 0 },
    });
  } else {
    tasks.push({
      key: 'arena', icon: icon(ICONS.medal, 24), title: '下一个竞技场日', tag: [`${toArena} 日后`, 'tag-grey'],
      desc: `${plainDate(state.arena.nextArenaDay)}：已报名的军团到达当天会生成对手；只打进攻，不需要编防守队。`, action: { label: '竞技场', href: links.arena },
    });
  }
  if (results?.settled && results.day !== null) {
    const wins = results.attacks.filter(a => a.status === 'won').length;
    tasks.push({
      key: 'last', icon: <LockIcon />, title: `上次竞技场 · ${plainDate(results.day)}`,
      desc: `进攻 ${wins} 胜 ${results.attacks.length - wins} 负，当日积分已计入。`, action: { label: '查看结果', href: links.arena },
    });
  }

  const nextChapter = story?.chapters.find(c => !c.available);
  const nextCrop = production?.orders.filter(o => o.state === 'growing').sort((a, b) => a.readyDay - b.readyDay)[0];
  const returns = (dispatches?.running ?? []).sort((a, b) => a.returnDay - b.returnDay);
  const dates = ([
    ...(state.arena.isArenaDay ? [[day, '今天', '竞技场日']] : []),
    [state.arena.nextArenaDay, plainDate(state.arena.nextArenaDay), `下一个竞技场日（${toArena} 日后）`],
    [state.nextMonthStart, plainDate(state.nextMonthStart), `新的一季，商店补货（${state.nextMonthStart - day} 日后）`],
    ...(annual && !annual.windowOpen ? [[annual.nextOpenDay, plainDate(annual.nextOpenDay), `大竞技场报名开放（${annual.nextOpenDay - day} 日后）`]] : []),
    ...(nextChapter ? [[nextChapter.openDay, plainDate(nextChapter.openDay), `主线第 ${nextChapter.chapter} 章开放（${nextChapter.openDay - day} 日后）`]] : []),
    ...(nextCrop ? [[nextCrop.readyDay, plainDate(nextCrop.readyDay), `${nextCrop.recipe}成熟（${nextCrop.readyDay - day} 日后）`]] : []),
    ...returns.slice(0, 3).map(d => [d.returnDay, plainDate(d.returnDay), `${regionById(d.region).name}派遣返程 · ${d.unitIds.length} 人（${d.returnDay - day} 日后）`]),
    ...aging.filter(u => u.lifespanEndDay !== null && u.lifespanEndDay - day <= DAYS_PER_YEAR).map(u => [u.lifespanEndDay!, plainDate(u.lifespanEndDay!), `${u.name}寿终（${u.lifespanEndDay! - day} 日后）`]),
  ] as [number, string, string][]).sort((a, b) => a[0] - b[0]).map(([, when, what]) => [when, what] as [string, string]);

  const online = agentOnline(state);
  const face = (u: ServerUnit) => {
    const status = unitStatus(u, annual);
    return (
      <a key={u.id} className="sq" href={links.roster(u.id)}>
        <UnitFace unit={u} size={58} />
        <span className="n">{u.name}</span>
        <span className="l">{u.className}</span>
        <span className="l num">Lv {u.level}{status !== 'ready' ? ` · ${STATUS_TEXT[status]}` : ''}</span>
      </a>
    );
  };

  return (
    <Shell current="camp">
      <div className="brief-head">
        <div className="flex items-center gap-3.5">
          <img className="px" src={CRESTS.raven} width={48} height={48} alt={`${state.player.legion}纹章`} />
          <div>
            <div className="eyebrow">作战简报 · {dateLabel(day)}</div>
            <h1 className="serif" style={{ fontSize: 28, lineHeight: 1.25 }}>{state.player.legion}</h1>
            <p style={{ fontSize: 14, color: '#4E473D' }}>{summary}</p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, color: '#4E473D' }}>第 {date.year} 年 · 第 {date.season} / {SEASONS_PER_YEAR} 季（{seasonLeft > 0 ? `本季还剩 ${seasonLeft} 日` : '本季最后一天'}）</div>
          <div className="seasons" aria-hidden="true">
            {Array.from({ length: SEASONS_PER_YEAR }, (_, i) => <i key={i} className={i + 1 < date.season ? 'past' : i + 1 === date.season ? 'cur' : ''} />)}
          </div>
        </div>
      </div>

      <div className="camp-cols">
        <div className="colstack">
          <section className="panel" aria-labelledby="tasks-h">
            <div className="ph"><h2 id="tasks-h">待办</h2><span style={{ fontSize: 13, color: '#6A6256' }}>按个人日历</span></div>
            <ol>
              {tasks.map((t, i) => (
                <li key={t.key} className="task" data-task={t.key}>
                  <span className="t-ico">{t.icon}</span>
                  <div>
                    <div className="t-title"><span className="t-prio">{String(i + 1).padStart(2, '0')}</span>{t.title}{t.tag && <span className={`tag ${t.tag[1]}`}>{t.tag[0]}</span>}</div>
                    <div className="t-desc">{t.desc}</div>
                  </div>
                  {t.action?.href && <a className={`btn btn-sm${t.action.primary ? ' btn-primary' : ''}`} href={t.action.href}
                    onClick={t.key === 'recruit' ? e => { e.preventDefault(); document.getElementById('recruit-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } : undefined}>{t.action.label}</a>}
                  {t.action?.run && <button type="button" className={`btn btn-sm${t.action.primary ? ' btn-primary' : ''}`} onClick={t.action.run}>{t.action.label}</button>}
                  {!t.action && <span />}
                </li>
              ))}
              {tasks.length === 0 && <li className="empty-row">现在没有待办。可以从下面的行动推进日期。</li>}
            </ol>
          </section>

          <CampActions />
        </div>

        <div className="colstack">
          <section className="panel" aria-labelledby="legion-h">
            <div className="ph"><h2 id="legion-h">军团概况</h2><a className="btn btn-sm btn-ghost" href={links.roster()}>名册 ›</a></div>
            <div className="stats3">
              <div><span>名册</span><b>{active.length} <small>/ {state.rosterLimit}</small></b></div>
              <div><span>外出</span><b style={{ color: away.length > 0 ? '#6E5322' : undefined }}>{away.length} <small>{away.slice(0, 2).map(u => u.name).join('、')}</small></b></div>
              <div><span>可转职</span><b style={{ color: '#45603B' }}>{promotable.length} <small>{promotable.length > 2 ? `${promotable[0].name} 等` : promotable.map(u => u.name).join('、')}</small></b></div>
            </div>
            <div style={{ padding: '10px 14px 0', fontSize: 13, color: '#4E473D' }}>可出战 · {ready.length} 人 <span className="muted">（出战人数按地图规定，名册多出的人留作替补）</span></div>
            <div className="squad">{ready.slice(0, 12).map(face)}</div>
            {away.length > 0 && <>
              <div style={{ padding: '0 14px', fontSize: 13, color: '#4E473D' }}>活动占用</div>
              <ul className="roster-mini">
                {away.map(u => {
                  const status = unitStatus(u, annual);
                  return (
                    <li key={u.id}>
                      <UnitFace unit={u} size={32} />
                      <span className="min-w-0"><b>{u.name}</b><span className="muted"> · {u.className} Lv {u.level}</span></span>
                      <span className={`tag ${STATUS_TAG[status]}`}>{STATUS_TEXT[status]}</span>
                    </li>
                  );
                })}
              </ul>
            </>}
            {aging.length > 0 && <p className="pfoot">{aging.map(u => `${u.name}：${LIFESPAN_TEXT[u.lifespanWarning]}`).join('；')}。</p>}
          </section>

          <section className="panel" aria-labelledby="time-h">
            <div className="ph"><h2 id="time-h">重要日期</h2><span style={{ fontSize: 13, color: '#6A6256' }}>个人日历</span></div>
            <ol className="times">
              {dates.map(([when, what]) => <li key={what}><span className="w">{when}</span><span>{what}</span></li>)}
            </ol>
          </section>

          <section className="panel" aria-labelledby="agent-h">
            <div className="ph">
              <h2 id="agent-h">Agent 简报</h2>
              <span className="inline-flex items-center gap-1.5" style={{ fontSize: 13, color: online ? '#45603B' : '#6A6256' }}><span className="dot" style={{ background: online ? '#536D49' : '#9A9184' }} />{online ? '在线' : '离线'}</span>
            </div>
            {state.agentPlan
              ? <>
                <div style={{ padding: '10px 16px 0', fontSize: 13, color: '#6A6256' }}>培养计划 · Agent 最近一次上报</div>
                <blockquote className="plan"><q>{state.agentPlan}</q></blockquote>
              </>
              : <p style={{ padding: '10px 16px', fontSize: 13, color: '#6A6256' }}>Agent 还没有上报培养计划。</p>}
            {agent?.dailyReport && <>
              <div style={{ padding: '0 16px', fontSize: 13, color: '#6A6256' }}>离线日报</div>
              <blockquote className="plan"><q>{agent.dailyReport}</q></blockquote>
            </>}
            <div className="flex flex-wrap items-center gap-2.5" style={{ padding: '0 16px 14px' }}>
              <span style={{ fontSize: 13, color: '#4E473D' }}>{battle ? `进行中：${battle.name}，第 ${battle.turn} 回合` : '现在没有进行中的战斗。'}</span>
              <a className="btn btn-sm ml-auto" href={links.spectate}><CompassIcon />{battle ? '实时观战' : '观战'}</a>
            </div>
          </section>
        </div>
      </div>
    </Shell>
  );
}
