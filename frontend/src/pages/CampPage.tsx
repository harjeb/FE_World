import type { ReactNode } from 'react';
import { CHARACTERS } from '@common/data/characters.ts';
import { CLASSES } from '@common/data/classes.ts';
import { DAYS_PER_SEASON, SEASONS_PER_YEAR, dateOf } from '@common/game/calendar.ts';
import { OP } from '@common/protocol/ops.ts';
import { CRESTS, ICONS, portraitFor } from '../assets.ts';
import { session, useSession } from '../api/session.ts';
import { AGENT_PLAN, MY_LEGION, WORLD } from '../demo/live.ts';
import { ROSTER, ROSTER_LIMIT } from '../demo/roster.ts';
import { links } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { AnvilIcon, CandleIcon, LockIcon, ScrollIcon } from '../ui/icons.tsx';
import { dateLabel, plainDate } from '../ui/calendar.ts';
import { toast } from '../ui/toast.tsx';
import { CampActions } from './CampActions.tsx';

const name = (c: string) => CHARACTERS[c as keyof typeof CHARACTERS].name;

interface Task {
  key: string; icon: ReactNode; title: string; tag?: [string, string]; desc: string;
  action?: { label: string; href?: string; run?: () => void; primary?: boolean };
}

const icon = (src: string, size: number) => <img className="px" src={src} width={size} height={size} alt="" />;

// 军营首页 · 作战简报 (Camp artboard) on the personal calendar (docs/00 §2): what is pending today, the
// day actions, the legion at a glance and what the Agent reported. Everything comes from the session.
export function CampPage() {
  const { state, today, arena, results, run, annual, story, production, legacies } = useSession();
  const date = dateOf(WORLD.day);
  const toArena = WORLD.nextArenaDay - WORLD.day;
  const progress = arena && !arena.settled && arena.isArenaDay ? arena.progress : null;
  const left = progress ? progress.total - progress.done : 0;
  const battle = today?.battle ?? null;
  const registered = state?.arena.registered ?? true;
  const nextSeason = state?.nextMonthStart ?? WORLD.day;
  const injured = ROSTER.filter(e => e.status === 'injured');
  const promotable = ROSTER.filter(e => e.promotable);
  const squad = ROSTER.filter(e => e.status === 'main');

  const cleared = state?.progress.cleared ?? 0;
  const seasonLeft = DAYS_PER_SEASON - date.dayOfSeason;
  const summary = `名册 ${ROSTER.length} / ${ROSTER_LIMIT} 人 · 已讨伐 ${cleared} / ${state?.regions.length ?? 12} 个地区 · ${WORLD.isArenaDay ? '今天是竞技场日' : `${toArena} 日后是竞技场日`}`;

  const tasks: Task[] = [];
  if (battle) {
    const inRun = battle.kind === 'field' && run?.battleId === battle.id;
    const href = battle.mode === 'festival' ? links.annual : inRun ? links.dungeon : battle.kind === 'field' ? links.field
      : battle.mode === 'arena' && battle.opponentId ? links.battle(battle.opponentId) : null;
    tasks.push({
      key: 'battle', icon: icon(ICONS.sortie, 32), title: `进行中的战斗 · ${battle.name}`, tag: [`第 ${battle.turn} 回合`, 'tag-blue'],
      desc: battle.mode === 'festival' ? '大竞技场的这一场还没打完，倒下的普通角色会永久死亡。'
        : inRun ? `大副本第 ${run!.stageIndex + 1} 图还没打完，HP 与道具跨图不恢复。`
          : battle.kind === 'field' ? '野外战斗还没结束，结束前不能再次出击。' : '这场竞技场进攻还没结束。',
      action: href ? { label: '继续战斗', href, primary: true } : undefined,
    });
  }
  if (run?.state === 'between_maps') {
    tasks.push({
      key: 'run', icon: icon(ICONS.sortie, 32), title: `大副本 · 第 ${run.stageIndex + 1} 图待出发`, tag: [`存活 ${run.survivingIds.length} / ${run.unitIds.length}`, 'tag-brass'],
      desc: '可以带着现在的 HP 与道具继续，或撤离并放弃未带回的掉落。远征没结束前不能出击或报名大竞技场。',
      action: { label: '查看远征', href: links.dungeon, primary: true },
    });
  }
  const annualEntry = annual?.entry && annual.entry.annualIndex === annual.annualIndex ? annual.entry : null;
  if (annual && annualEntry && (annualEntry.state === 'qualifier' || annualEntry.state === 'knockout') && battle?.mode !== 'festival') {
    tasks.push({
      key: 'annual', icon: icon(ICONS.medal, 24), title: `第 ${annual.annualIndex} 届大竞技场 · 下一场`, tag: [annualEntry.state === 'qualifier' ? `海选 ${annualEntry.qualifierWins} 胜 ${annualEntry.qualifierCount - annualEntry.qualifierWins} 负` : '正赛', 'tag-blue'],
      desc: `每场推进 ${annual.costDays} 日，真实死亡；局间只恢复存活者的 HP。`, action: { label: '去赛程', href: links.annual },
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
  const ripe = production?.ready.length ?? 0;
  if (ripe > 0) {
    tasks.push({ key: 'craft', icon: <AnvilIcon />, title: `生产 · ${ripe} 件已成熟`, desc: '领取不推进日期；领取后工位空出来，可以开下一单。', action: { label: '去领取', href: links.workshop } });
  }
  const heirs = legacies?.legacies.filter(l => l.state === 'available').length ?? 0;
  if (heirs > 0) {
    tasks.push({ key: 'legacy', icon: <CandleIcon />, title: `传承 · ${heirs} 份遗产待兑现`, desc: '遗产可以交给一名 1 级新角色，选择成长传承或数值传承。', action: { label: '查看遗产', href: links.legacy } });
  }
  if (!registered) {
    tasks.push({
      key: 'arena', icon: icon(ICONS.medal, 24), title: '竞技场 · 未报名', desc: '没有报名时，到达竞技场日也不会开放。报名会保存当前名册的快照。',
      action: {
        label: '报名下一次', primary: true,
        run: () => void session.run(OP.ARENA_REGISTER).then(() => toast('已报名下一次竞技场'), e => toast(`报名失败：${e instanceof Error ? e.message : String(e)}`)),
      },
    });
  } else if (progress) {
    tasks.push({
      key: 'arena', icon: icon(ICONS.medal, 24), title: '今日竞技场', tag: [`进攻 ${progress.done} / ${progress.total}`, left === 0 ? 'tag-green' : 'tag-brass'],
      desc: left > 0 ? `还有 ${left} 场进攻没打，推进日期后按落败计；防守在结算时由规则 AI 试攻。` : '进攻已全部打完；推进日期后结算防守与奖励。',
      action: { label: '去竞技场', href: links.arena, primary: true },
    });
  } else {
    tasks.push({
      key: 'arena', icon: icon(ICONS.medal, 24), title: '下一个竞技场日', tag: [`${toArena} 日后`, 'tag-grey'],
      desc: `${plainDate(WORLD.nextArenaDay)}：到达当天自动报名，并锁定当时的防守。`, action: { label: '防守设置', href: links.defense },
    });
  }
  if (results?.settled && results.day !== null) {
    const wins = results.attacks.filter(a => a.status === 'won').length;
    const held = results.defenseTrials.filter(t => t.held).length;
    tasks.push({
      key: 'last', icon: <LockIcon />, title: `上次竞技场 · ${plainDate(results.day)}`,
      desc: `进攻 ${wins} 胜 ${results.attacks.length - wins} 负，防守守住 ${held} / ${results.defenseTrials.length} 场。`,
      action: { label: '查看结果', href: links.arena },
    });
  }

  const nextChapter = story?.chapters.find(c => !c.available);
  const nextCrop = production?.orders.filter(o => o.state === 'growing').sort((a, b) => a.readyDay - b.readyDay)[0];
  const dates = ([
    ...(WORLD.isArenaDay ? [[WORLD.day, '今天', '竞技场日：推进日期后结算，没打的进攻按落败计']] : []),
    [WORLD.nextArenaDay, plainDate(WORLD.nextArenaDay), `下一个竞技场日（${toArena} 日后）`],
    [nextSeason, plainDate(nextSeason), `新的一季，商店补货（${nextSeason - WORLD.day} 日后）`],
    ...(nextChapter ? [[nextChapter.openDay, plainDate(nextChapter.openDay), `主线第 ${nextChapter.chapter} 章开放（${nextChapter.openDay - WORLD.day} 日后）`]] : []),
    ...(nextCrop ? [[nextCrop.readyDay, plainDate(nextCrop.readyDay), `${nextCrop.recipe}成熟（${nextCrop.readyDay - WORLD.day} 日后）`]] : []),
  ] as [number, string, string][]).sort((a, b) => a[0] - b[0]).map(([, when, what]) => [when, what] as [string, string]);

  return (
    <Shell current="camp">
      <div className="brief-head">
        <div className="flex items-center gap-3.5">
          <img className="px" src={CRESTS.raven} width={48} height={48} alt={`${MY_LEGION}纹章`} />
          <div>
            <div className="eyebrow">作战简报 · {dateLabel(WORLD.day)}</div>
            <h1 className="serif" style={{ fontSize: 28, lineHeight: 1.25 }}>{MY_LEGION}</h1>
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
                <li key={t.key} className="task">
                  <span className="t-ico">{t.icon}</span>
                  <div>
                    <div className="t-title"><span className="t-prio">{String(i + 1).padStart(2, '0')}</span>{t.title}{t.tag && <span className={`tag ${t.tag[1]}`}>{t.tag[0]}</span>}</div>
                    <div className="t-desc">{t.desc}</div>
                  </div>
                  {t.action?.href && <a className={`btn btn-sm${t.action.primary ? ' btn-primary' : ''}`} href={t.action.href}>{t.action.label}</a>}
                  {t.action?.run && <button type="button" className={`btn btn-sm${t.action.primary ? ' btn-primary' : ''}`} onClick={t.action.run}>{t.action.label}</button>}
                  {!t.action && <span />}
                </li>
              ))}
            </ol>
          </section>

          <CampActions />
        </div>

        <div className="colstack">
          <section className="panel" aria-labelledby="legion-h">
            <div className="ph"><h2 id="legion-h">军团概况</h2><a className="btn btn-sm btn-ghost" href={links.roster()}>名册 ›</a></div>
            <div className="stats3">
              <div><span>名册</span><b>{ROSTER.length} <small>/ {ROSTER_LIMIT}</small></b></div>
              <div><span>重伤</span><b style={{ color: '#93392F' }}>{injured.length} <small>{injured.map(e => name(e.unit.character)).join('、')}</small></b></div>
              <div><span>可转职</span><b style={{ color: '#45603B' }}>{promotable.length} <small>{promotable.length > 2 ? `${name(promotable[0].unit.character)} 等` : promotable.map(e => name(e.unit.character)).join('、')}</small></b></div>
            </div>
            <div style={{ padding: '10px 14px 0', fontSize: 13, color: '#4E473D' }}>主力</div>
            <div className="squad">
              {squad.map(e => {
                const looks = { classId: e.unit.classId, side: 'player' as const, character: e.unit.character };
                return (
                  <a key={e.unit.character} className="sq" href={links.roster(e.unit.character)}>
                    <span className="pf ally" style={{ width: 58, height: 58 }}><img className="px" src={portraitFor(looks)!} width={64} height={64} alt="" style={{ margin: '-4px 0 0 -3px' }} /></span>
                    <span className="n">{name(e.unit.character)}</span>
                    <span className="l">{CLASSES[e.unit.classId].name}</span>
                    <span className="l num">Lv {e.unit.level}</span>
                  </a>
                );
              })}
            </div>
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
              <span className="inline-flex items-center gap-1.5" style={{ fontSize: 13, color: WORLD.agent.online ? '#45603B' : '#6A6256' }}><span className="dot" style={{ background: WORLD.agent.online ? '#536D49' : '#9A9184' }} />{WORLD.agent.online ? '在线' : '离线'}</span>
            </div>
            {AGENT_PLAN
              ? <>
                <div style={{ padding: '10px 16px 0', fontSize: 13, color: '#6A6256' }}>培养计划 · Agent 最近一次上报</div>
                <blockquote className="plan"><q>{AGENT_PLAN.text}</q></blockquote>
              </>
              : <p style={{ padding: '10px 16px', fontSize: 13, color: '#6A6256' }}>Agent 还没有上报培养计划。</p>}
            <div className="flex flex-wrap items-center gap-2.5" style={{ padding: '0 16px 14px' }}>
              <span style={{ fontSize: 13, color: '#4E473D' }}>{battle ? `进行中：${battle.name}，第 ${battle.turn} 回合` : '现在没有进行中的战斗。'}</span>
              <a className="btn btn-sm ml-auto" href={links.spectate}>观战</a>
            </div>
          </section>
        </div>
      </div>
    </Shell>
  );
}
