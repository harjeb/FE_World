import { Component, lazy, Suspense, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { session, useSession } from './api/session.ts';
import { token } from './api/client.ts';
import { CampPage } from './pages/CampPage.tsx';
import { CompanionSetup } from './pages/CompanionSetup.tsx';
import { useRoute } from './router.ts';
import { activityOf, featuresOf, isRouteAllowed } from './model/access.ts';
import { WorldPage } from './pages/WorldPage.tsx';
import { Toasts } from './ui/toast.tsx';
const AnnualPage = lazy(() => import('./arena/AnnualPage.tsx').then(m => ({ default: m.AnnualPage })));
const ArenaBattle = lazy(() => import('./arena/ArenaBattle.tsx').then(m => ({ default: m.ArenaBattle })));
const ArenaHub = lazy(() => import('./arena/ArenaHub.tsx').then(m => ({ default: m.ArenaHub })));
const BanPage = lazy(() => import('./arena/BanPage.tsx').then(m => ({ default: m.BanPage })));
const DeployPage = lazy(() => import('./arena/DeployPage.tsx').then(m => ({ default: m.DeployPage })));
const DispatchPage = lazy(() => import('./battle/DispatchPage.tsx').then(m => ({ default: m.DispatchPage })));
const DungeonPage = lazy(() => import('./battle/DungeonPage.tsx').then(m => ({ default: m.DungeonPage })));
const FieldBattle = lazy(() => import('./battle/FieldBattle.tsx').then(m => ({ default: m.FieldBattle })));
const LegacyPage = lazy(() => import('./pages/LegacyPage.tsx').then(m => ({ default: m.LegacyPage })));
const PrepPage = lazy(() => import('./pages/PrepPage.tsx').then(m => ({ default: m.PrepPage })));
const PromotePage = lazy(() => import('./pages/PromotePage.tsx').then(m => ({ default: m.PromotePage })));
const RosterPage = lazy(() => import('./pages/RosterPage.tsx').then(m => ({ default: m.RosterPage })));
const RulesPage = lazy(() => import('./pages/RulesPage.tsx').then(m => ({ default: m.RulesPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage.tsx').then(m => ({ default: m.SettingsPage })));
const StoryPage = lazy(() => import('./pages/StoryPage.tsx').then(m => ({ default: m.StoryPage })));
const QuestsPage = lazy(() => import('./pages/QuestsPage.tsx').then(m => ({ default: m.QuestsPage })));
const TavernPage = lazy(() => import('./pages/TavernPage.tsx').then(m => ({ default: m.TavernPage })));
const WorkshopPage = lazy(() => import('./pages/WorkshopPage.tsx').then(m => ({ default: m.WorkshopPage })));
const ReplayPage = lazy(() => import('./watch/ReplayPage.tsx').then(m => ({ default: m.ReplayPage })));
const ReportsPage = lazy(() => import('./watch/ReportsPage.tsx').then(m => ({ default: m.ReportsPage })));
const SpectatePage = lazy(() => import('./watch/SpectatePage.tsx').then(m => ({ default: m.SpectatePage })));

class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="app-bg" style={{ padding: 24 }} role="alert">
      <p>页面载入失败，请检查连接后重新载入。已提交的进度保存在服务器。</p>
      <button className="btn" type="button" onClick={() => window.location.reload()}>重新载入</button>
    </div> : this.props.children;
  }
}

// Every designed screen, now reading live server state. 军营 is home. 被旗标锁住的直达路由改渲染
// 世界地图（不挂载被锁页面，避免它的取数与写入）；进行中的战斗与竞技场活动路由不被弹走。
function Page() {
  const route = useRoute();
  const { state, today, run, annual } = useSession();
  useEffect(() => { void session.loadPage(route.page).catch(() => {}); }, [route.page]);
  if (state && !isRouteAllowed(route, featuresOf(state), activityOf({ state, today, run, annual }))) {
    return <WorldPage />;
  }
  switch (route.page) {
    case 'roster': return <RosterPage unit={route.unit} tab={route.tab} />;
    case 'promote': return <PromotePage key={route.unit} unit={route.unit} />;
    case 'field': return <FieldBattle />;
    case 'dungeon': return <DungeonPage />;
    case 'dispatch': return <DispatchPage />;
    case 'annual': return <AnnualPage />;
    case 'workshop': return <WorkshopPage />;
    case 'tavern': return <TavernPage />;
    case 'story': return <StoryPage />;
    case 'quests': return <QuestsPage tab={route.tab} />;
    case 'legacy': return <LegacyPage />;
    case 'rules': return <RulesPage />;
    case 'settings': return <SettingsPage />;
    case 'prep': return <PrepPage unit={route.unit} />;
    case 'spectate': return <SpectatePage />;
    case 'reports': return <ReportsPage />;
    case 'replay': return <ReplayPage key={route.id} id={route.id} />;
    case 'arena': return <ArenaHub />;
    case 'ban': return <BanPage key={route.opponent} id={route.opponent} />;
    case 'deploy': return <DeployPage key={route.opponent} id={route.opponent} />;
    case 'arena-battle': return <ArenaBattle key={route.opponent} id={route.opponent} />;
    case 'world': return <WorldPage />;
    default: return <CampPage />;
  }
}

function Login() {
  const { loading, error } = useSession();
  const [name, setName] = useState('指挥官');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  return (
    <div className="app-bg" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <form
        className="panel" style={{ padding: 24, width: 'min(360px, 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}
        onSubmit={e => { e.preventDefault(); if (mode === 'register' && password !== confirm) return; void session.login(name.trim(), password, mode).catch(() => {}); }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>AgentTactics</h1>
        <p style={{ fontSize: 13, color: '#4E473D' }}>登录已有账号，或注册新的军团指挥官。</p>
        <label style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
          指挥官名
          <input autoComplete="username" value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={32} required />
        </label>
        <div role="group" aria-label="账号操作">{(['login', 'register'] as const).map(value => <button key={value} type="button" className="btn" aria-pressed={mode === value} disabled={loading} onClick={() => { setMode(value); setPassword(''); setConfirm(''); }}>{value === 'login' ? '登录' : '注册'}</button>)}</div>
        <label>密码（最多 128 字符）<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} minLength={mode === 'login' ? 1 : 8} maxLength={128} required disabled={loading} /></label>
        {mode === 'register' && <label>确认密码<input name="confirmPassword" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} minLength={8} maxLength={128} required disabled={loading} /></label>}
        {mode === 'register' && confirm && password !== confirm && <p role="alert">两次密码不一致</p>}
        {error && <p role="alert" style={{ color: '#93392F', fontSize: 13 }}>{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={loading || name.trim().length < 2 || password.length < (mode === 'login' ? 1 : 8) || (mode === 'register' && password !== confirm)}>
          {loading ? '进入中…' : mode === 'register' ? '注册并进入' : '进入阵营'}
        </button>
      </form>
    </div>
  );
}

function SyncNotice() {
  const { error, loading } = useSession();
  return error ? <div className="sys-strip" role="status" style={{ margin: 0, padding: '10px 16px' }}>
    <span>{error}</span>{' '}
    <button className="btn btn-sm" type="button" disabled={loading} onClick={() => void session.refresh().catch(() => {})}>
      {loading ? '同步中…' : '重新同步'}
    </button>
  </div> : null;
}

export default function App() {
  const { ready, loading, state } = useSession();
  useEffect(() => {
    const reconnect = () => { if (token()) void session.refresh().catch(() => {}); };
    if (token() && !session.get().ready && !session.get().loading) reconnect();
    window.addEventListener('online', reconnect);
    return () => window.removeEventListener('online', reconnect);
  }, []);
  if (!ready) return <>{loading && token() ? <div className="app-bg" style={{ padding: 24 }}>载入中…</div> : <Login />}</>;
  return (
    <>
      <SyncNotice />
      <PageBoundary>
        <Suspense fallback={<div className="app-bg" style={{ padding: 24 }} role="status">载入页面中…</div>}>
          {state?.setup.needed ? <CompanionSetup /> : <Page />}
        </Suspense>
      </PageBoundary>
      <Toasts />
    </>
  );
}
