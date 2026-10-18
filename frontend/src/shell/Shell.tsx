import type { ReactNode } from 'react';
import { CRESTS, ICONS } from '../assets.ts';
import { links } from '../router.ts';
import { useSession } from '../api/session.ts';
import type { ServerState } from '../api/session.ts';
import { annualLive, canPromote } from '../model/roster.ts';
import { featuresOf } from '../model/access.ts';
import { AnvilIcon, AttackIcon, BookIcon, CampIcon, CandleIcon, CompassIcon, ChestIcon, FlagIcon, MugIcon, QuestIcon, ReportIcon, RosterIcon, ScrollIcon, SlidersIcon } from '../ui/icons.tsx';
import { clockTime, plainDate } from '../ui/calendar.ts';

export type ShellPage = 'camp' | 'world' | 'roster' | 'field' | 'prep' | 'workshop' | 'tavern' | 'arena' | 'story' | 'quests' | 'legacy' | 'reports' | 'rules' | 'settings';

function Stat({ icon, label, children }: { icon?: string; label: string; children: ReactNode }) {
  return (
    <div className="tb-item">
      {icon && <img className="px" src={icon} width={24} height={24} alt="" />}
      <span><span className="tb-k">{label}</span><span className="tb-v">{children}</span></span>
    </div>
  );
}

// 在线 = 5 分钟内收到过带 agentModel 的请求（服务端每分钟最多记一次心跳）。
export function agentOnline(state: ServerState | null): boolean {
  return !!state?.agentLastSeen && Date.now() - state.agentLastSeen < 5 * 60_000;
}

// Status bar from the 军营 artboard, on the personal calendar (docs/00 §2, §11「显示个人日期、下个特殊事件」).
function TopBar() {
  const { state } = useSession();
  if (!state) return <header className="topbar" aria-label="状态栏" />;
  const toArena = state.arena.nextArenaDay - state.day;
  const online = agentOnline(state);
  const lease = state.control;
  const spectate = featuresOf(state).spectate;
  const AgentStatus = spectate ? 'a' : 'span';
  return (
    <header className="topbar" aria-label="状态栏">
      <a className="tb-brand" href={links.camp} aria-label={`AgentTactics · ${state.player.legion} 军营`}>
        <img className="px" src={CRESTS.raven} width={48} height={48} alt="" />
        <span className="flex flex-col" style={{ lineHeight: 1.15 }}>
          <span className="pixel" style={{ fontSize: 14, fontWeight: 700, color: '#FFFFFF', letterSpacing: '.1em' }}>AGENT TACTICS</span>
          <span style={{ fontSize: 12, color: '#C6D3DC' }}>{state.player.legion}</span>
        </span>
      </a>
      <span className="tb-sep" aria-hidden="true" />
      <Stat label="日期">{plainDate(state.day)}</Stat>
      <span className="tb-sep" aria-hidden="true" />
      <Stat icon={ICONS.hourglass} label="下个事件">
        {state.arena.isArenaDay ? '今天 · 竞技场日' : <>竞技场日 <small>{toArena} 日后</small></>}
      </Stat>
      <Stat icon={ICONS.coin} label="金币"><span className="num">{state.gold.toLocaleString()}</span></Stat>
      <Stat icon={ICONS.bexp} label="公共经验"><span className="num">{state.bexp.toLocaleString()}</span></Stat>
      <Stat icon={ICONS.medal} label="竞技场积分">
        <span className="num">{state.arena.points.toLocaleString()}</span>
        <small> {state.arena.rank.place !== null ? `本月第 ${state.arena.rank.place} 名` : '本月未上榜'}</small>
      </Stat>
      <div className="tb-end">
        {lease && <span className="tb-chip" title={`控制租约至 ${clockTime(lease.expiresAt)}`}>{lease.owner === 'agent' ? 'Agent 控制中' : '网页控制中'}</span>}
        <AgentStatus className="tb-chip" href={spectate ? links.spectate : undefined} title={online ? 'Agent 已连接' : '5 分钟内没有收到 Agent 的请求'}>
          <span className="dot" style={{ background: online ? '#9BD08A' : '#9A9184' }} />
          {online ? `Agent 在线${state.agentPlan ? ' · 已上报计划' : ''}` : 'Agent 离线'}
        </AgentStatus>
        <a className="tb-icon" href={links.settings} aria-label="设置" title="设置：账号、Agent 接入与控制权"><SlidersIcon /></a>
      </div>
    </header>
  );
}

function NavLink({ page, current, href, icon, badge, children }: { page: ShellPage; current: ShellPage; href: string; icon: ReactNode; badge?: string; children: ReactNode }) {
  return (
    <a className="nav-item" href={href} aria-current={page === current ? 'page' : undefined}>
      {icon}{children}{badge && <span className="nb">{badge}</span>}
    </a>
  );
}

// Page frame for everything except the battle-style pages (battle, 观战, 回放), which have their own bar.
export function Shell({ current, children }: { current: ShellPage; children: ReactNode }) {
  const { state, production, story, legacies, quests, annual, today } = useSession();
  const active = state?.units.filter(u => u.status === 'active') ?? [];
  const promotable = active.filter(canPromote).length;
  // Badges only for things waiting on the player.
  const ripe = production?.ready.length ?? 0;
  const chapterDue = story?.chapters.some(c => c.available && (!c.completed || !c.claimed)) ?? false;
  const heirs = state?.legacyUnlocked ? legacies?.legacies.filter(l => l.state === 'available').length ?? 0 : 0;
  const claimable = quests?.regions.reduce((n, r) => n + r.quests.filter(q => q.done && !q.claimed).length, 0) ?? 0;
  const world = state?.world ?? null;
  const f = featuresOf(state);
  const live = annualLive(annual);
  return (
    <div className="app-bg">
      <TopBar />
      <div className="shell">
        <aside className="rail">
          <nav aria-label="主导航" className="flex flex-col gap-1">
            <NavLink page="camp" current={current} href={links.camp} icon={<CampIcon />} badge={state?.pendingRecruit ? '候选' : undefined}>军营</NavLink>
            <NavLink page="world" current={current} href={links.world} icon={<CompassIcon />} badge={world && world.selectableRegions.length > 0 ? '可选路线' : undefined}>世界</NavLink>
            <NavLink page="roster" current={current} href={links.roster()} icon={<RosterIcon />} badge={promotable > 0 ? `可转职 ${promotable}` : undefined}>名册</NavLink>
            {f.field && <NavLink page="field" current={current} href={links.field} icon={<FlagIcon />} badge={today?.battle?.kind === 'field' ? '战斗中' : undefined}>出击</NavLink>}
            {f.quests && <NavLink page="quests" current={current} href={links.quests} icon={<QuestIcon />} badge={claimable > 0 ? `待领 ${claimable}` : undefined}>任务</NavLink>}
            <NavLink page="prep" current={current} href={links.prep()} icon={<ChestIcon />}>整备</NavLink>
            {f.workshop && <NavLink page="workshop" current={current} href={links.workshop} icon={<AnvilIcon />} badge={ripe > 0 ? `可领取 ${ripe}` : undefined}>生产</NavLink>}
            {f.tavern && <NavLink page="tavern" current={current} href={links.tavern} icon={<MugIcon />}>酒馆</NavLink>}
            {f.arena && <NavLink page="arena" current={current} href={links.arena} icon={<AttackIcon />} badge={live ? '赛事中' : state?.arena.isArenaDay ? '今日' : undefined}>竞技场</NavLink>}
            {f.story && <NavLink page="story" current={current} href={links.story} icon={<ScrollIcon />} badge={chapterDue ? '待处理' : undefined}>主线</NavLink>}
            {f.legacy && <NavLink page="legacy" current={current} href={links.legacy} icon={<CandleIcon />} badge={heirs > 0 ? `遗产 ${heirs}` : undefined}>传承</NavLink>}
            {f.reports && <NavLink page="reports" current={current} href={links.reports} icon={<ReportIcon />}>战报</NavLink>}
          </nav>
          <div className="rail-foot">
            <NavLink page="rules" current={current} href={links.rules} icon={<BookIcon />}>规则手册</NavLink>
          </div>
        </aside>
        <main className="main">
          {live && current !== 'arena' && (
            <p className="sys-strip lock-strip" role="status">
              第 {annual!.entry!.annualIndex} 届大竞技场进行中：名单与物资已锁定，其他行动暂停，直到打完或退出本届。<a href={links.annual}>去赛程 ›</a>
            </p>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
