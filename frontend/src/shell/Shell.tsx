import type { ReactNode } from 'react';
import { CRESTS, ICONS } from '../assets.ts';
import { todayPoints, useArena } from '../arena/store.ts';
import { MY_LEGION, MY_POINTS, WORLD } from '../demo/live.ts';
import { ROSTER } from '../demo/roster.ts';
import { links } from '../router.ts';
import { AttackIcon, BookIcon, CampIcon, ChestIcon, FlagIcon, ReportIcon, RosterIcon, SlidersIcon } from '../ui/icons.tsx';
import { plainDate } from '../ui/calendar.ts';
import { notBuilt } from '../ui/toast.tsx';

export type ShellPage = 'camp' | 'roster' | 'field' | 'prep' | 'arena' | 'reports';

function Stat({ icon, label, children }: { icon?: string; label: string; children: ReactNode }) {
  return (
    <div className="tb-item">
      {icon && <img className="px" src={icon} width={24} height={24} alt="" />}
      <span><span className="tb-k">{label}</span><span className="tb-v">{children}</span></span>
    </div>
  );
}

// Status bar from the 军营 artboard, on the personal calendar (docs/00 §2, §11「显示个人日期、下个特殊事件」).
// Everything is live from GET_STATE; demo/world.ts only fills the first frame.
function TopBar() {
  const day = useArena();
  return (
    <header className="topbar" aria-label="状态栏">
      <a className="tb-brand" href={links.camp} aria-label={`AgentTactics · ${MY_LEGION} 军营`}>
        <img className="px" src={CRESTS.raven} width={48} height={48} alt="" />
        <span className="flex flex-col" style={{ lineHeight: 1.15 }}>
          <span className="pixel" style={{ fontSize: 14, fontWeight: 700, color: '#FFFFFF', letterSpacing: '.1em' }}>AGENT TACTICS</span>
          <span style={{ fontSize: 12, color: '#C6D3DC' }}>{MY_LEGION}</span>
        </span>
      </a>
      <span className="tb-sep" aria-hidden="true" />
      <Stat label="日期">{plainDate(WORLD.day)}</Stat>
      <span className="tb-sep" aria-hidden="true" />
      <Stat icon={ICONS.hourglass} label="下个事件">
        {WORLD.isArenaDay ? '今天 · 竞技场日' : <>竞技场日 <small>{WORLD.nextArenaDay - WORLD.day} 日后</small></>}
      </Stat>
      <Stat icon={ICONS.coin} label="金币"><span className="num">{WORLD.gold.toLocaleString()}</span></Stat>
      <Stat icon={ICONS.bexp} label="公共经验"><span className="num">{WORLD.bexp}</span></Stat>
      <Stat icon={ICONS.medal} label="竞技场积分"><span className="num">{MY_POINTS.toLocaleString()}</span>{WORLD.isArenaDay && <small> 今日 +{todayPoints(day)}</small>}</Stat>
      <div className="tb-end">
        {/* 在线 = 5 分钟内收到过带 agentModel 的请求 (demo/live.ts)，与军营的 Agent 简报同一口径。 */}
        <a className="tb-chip" href={links.spectate} title={WORLD.agent.online ? '观看 Agent 的战斗' : '5 分钟内没有收到 Agent 的请求'}>
          <span className="dot" style={{ background: WORLD.agent.online ? '#9BD08A' : '#9A9184' }} />
          {WORLD.agent.online ? `Agent 在线 · ${WORLD.agent.activity}` : 'Agent 离线'}
        </a>
        <button type="button" className="tb-icon" aria-label="设置" onClick={() => notBuilt('设置')}><SlidersIcon /></button>
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

// Pages without an artboard stay in the navigation, so the frame matches the design, and say so.
function Missing({ icon, children }: { icon: ReactNode; children: string }) {
  return (
    <button type="button" className="nav-item missing" onClick={() => notBuilt(children)} title="演示版没有这个页面">
      {icon}{children}
    </button>
  );
}

// Page frame for everything except the battle-style pages (battle, 观战, 回放), which have their own bar.
export function Shell({ current, children }: { current: ShellPage; children: ReactNode }) {
  const promotable = ROSTER.filter(e => e.promotable).length;
  return (
    <div className="app-bg">
      <TopBar />
      <div className="shell">
        <aside className="rail">
          <nav aria-label="主导航" className="flex flex-col gap-1">
            <NavLink page="camp" current={current} href={links.camp} icon={<CampIcon />}>军营</NavLink>
            <NavLink page="roster" current={current} href={links.roster()} icon={<RosterIcon />} badge={promotable > 0 ? `可转职 ${promotable}` : undefined}>名册</NavLink>
            <NavLink page="field" current={current} href={links.field} icon={<FlagIcon />}>出击</NavLink>
            <NavLink page="prep" current={current} href={links.prep()} icon={<ChestIcon />}>整备</NavLink>
            <NavLink page="arena" current={current} href={links.arena} icon={<AttackIcon />} badge={WORLD.isArenaDay ? '今日' : undefined}>竞技场</NavLink>
            <NavLink page="reports" current={current} href={links.replay()} icon={<ReportIcon />}>战报</NavLink>
          </nav>
          <div className="rail-foot">
            <Missing icon={<BookIcon />}>规则手册</Missing>
            <p className="rail-note">演示版：数据为示例，养成与经济规则尚未确定。</p>
          </div>
        </aside>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
