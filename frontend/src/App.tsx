import { useEffect, useState } from 'react';
import { session, useSession } from './api/session.ts';
import { token } from './api/client.ts';
import { AnnualPage } from './arena/AnnualPage.tsx';
import { ArenaBattle } from './arena/ArenaBattle.tsx';
import { ArenaHub } from './arena/ArenaHub.tsx';
import { BanPage } from './arena/BanPage.tsx';
import { DeployPage } from './arena/DeployPage.tsx';
import { DispatchPage } from './battle/DispatchPage.tsx';
import { DungeonPage } from './battle/DungeonPage.tsx';
import { FieldBattle } from './battle/FieldBattle.tsx';
import { CampPage } from './pages/CampPage.tsx';
import { CompanionSetup } from './pages/CompanionSetup.tsx';
import { LegacyPage } from './pages/LegacyPage.tsx';
import { PrepPage } from './pages/PrepPage.tsx';
import { PromotePage } from './pages/PromotePage.tsx';
import { RosterPage } from './pages/RosterPage.tsx';
import { RulesPage } from './pages/RulesPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { StoryPage } from './pages/StoryPage.tsx';
import { QuestsPage } from './pages/QuestsPage.tsx';
import { TavernPage } from './pages/TavernPage.tsx';
import { WorkshopPage } from './pages/WorkshopPage.tsx';
import { useRoute } from './router.ts';
import { activityOf, featuresOf, isRouteAllowed } from './model/access.ts';
import { WorldPage } from './pages/WorldPage.tsx';
import { Toasts } from './ui/toast.tsx';
import { ReplayPage } from './watch/ReplayPage.tsx';
import { ReportsPage } from './watch/ReportsPage.tsx';
import { SpectatePage } from './watch/SpectatePage.tsx';

// Every designed screen, now reading live server state. 军营 is home. 被旗标锁住的直达路由改渲染
// 世界地图（不挂载被锁页面，避免它的取数与写入）；进行中的战斗与竞技场活动路由不被弹走。
function Page() {
  const route = useRoute();
  const { state, today, run, annual } = useSession();
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
  return (
    <div className="app-bg" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <form
        className="panel" style={{ padding: 24, width: 360, display: 'flex', flexDirection: 'column', gap: 12 }}
        onSubmit={e => { e.preventDefault(); void session.login(name.trim()); }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>AgentTactics</h1>
        <p style={{ fontSize: 13, color: '#4E473D' }}>输入军团指挥官名进入游戏。首次进入会创建账号与初始名册。</p>
        <label style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
          指挥官名
          <input value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={32} required />
        </label>
        {error && <p role="alert" style={{ color: '#93392F', fontSize: 13 }}>{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={loading || name.trim().length < 2}>
          {loading ? '进入中…' : '进入军营'}
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const { ready, loading, state } = useSession();
  useEffect(() => {
    if (token() && !session.get().ready && !session.get().loading) void session.refresh();
  }, []);
  if (!ready) return <>{loading ? <div className="app-bg" style={{ padding: 24 }}>载入中…</div> : <Login />}</>;
  if (state?.setup.needed) return <><CompanionSetup /><Toasts /></>;
  return (
    <>
      <Page />
      <Toasts />
    </>
  );
}
