import type { ReactNode } from 'react';
import { MY_LEGION, MY_POINTS, SNAPSHOT_LABEL } from '@common/arena/demo.ts';
import { CRESTS } from '../assets.ts';
import { links } from '../router.ts';
import { useArena } from '../arena/store.ts';

// Page frame for everything except the battle itself: status bar and main navigation
// (from the 军营 / 竞技场 artboards). Only pages that exist are listed.
export function Shell({ current, children }: { current: 'arena' | 'field'; children: ReactNode }) {
  const day = useArena();
  return (
    <div className="app-bg">
      <header className="topbar" aria-label="状态栏">
        <a className="tb-brand" href={links.arena} aria-label={`AgentTactics · ${MY_LEGION}`}>
          <img className="px" src={CRESTS.raven} width={48} height={48} alt="" />
          <span className="flex flex-col" style={{ lineHeight: 1.15 }}>
            <span className="pixel" style={{ fontSize: 14, fontWeight: 700, color: '#FFFFFF', letterSpacing: '.1em' }}>AGENT TACTICS</span>
            <span style={{ fontSize: 12, color: '#C6D3DC' }}>{MY_LEGION}</span>
          </span>
        </a>
        <span className="tb-sep" aria-hidden="true" />
        <div><span className="tb-k">当前游戏月</span><span className="tb-v">第 7 月 <small>· 竞技场日</small></span></div>
        <div><span className="tb-k">参赛快照</span><span className="tb-v" style={{ fontSize: 14 }}>{SNAPSHOT_LABEL}</span></div>
        <span className="tb-sep" aria-hidden="true" />
        <div><span className="tb-k">竞技场积分</span><span className="tb-v num">{(MY_POINTS + day.points).toLocaleString()} <small>今日 +{day.points}</small></span></div>
      </header>
      <div className="shell">
        <aside className="rail">
          <nav aria-label="主导航">
            <a className="nav-item" href={links.arena} aria-current={current === 'arena' ? 'page' : undefined}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4l11 11" /><path d="M20 4L9 15" /><path d="M13 17l4-4" /><path d="M7 13l4 4" /><path d="M16 16l3 3" /><path d="M8 16l-3 3" /></svg>
              竞技场 <span className="nb">今日</span>
            </a>
            <a className="nav-item" href={links.field} aria-current={current === 'field' ? 'page' : undefined}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 21V4" /><path d="M5 4h12l-2.5 4L17 12H5" /></svg>
              出击 · 示例战斗
            </a>
          </nav>
          <p className="rail-note">军营、名册、整备、战报等页面尚未实现。</p>
        </aside>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
