import { ArenaBattle } from './arena/ArenaBattle.tsx';
import { ArenaHub } from './arena/ArenaHub.tsx';
import { BanPage } from './arena/BanPage.tsx';
import { DeployPage } from './arena/DeployPage.tsx';
import { FieldBattle } from './battle/FieldBattle.tsx';
import { useRoute } from './router.ts';

// Pages built so far: today's arena (ban → deploy → battle) and the PvE demo battle.
export default function App() {
  const route = useRoute();
  switch (route.page) {
    case 'field': return <FieldBattle />;
    case 'ban': return <BanPage key={route.opponent} id={route.opponent} />;
    case 'deploy': return <DeployPage key={route.opponent} id={route.opponent} />;
    case 'arena-battle': return <ArenaBattle key={route.opponent} id={route.opponent} />;
    default: return <ArenaHub />;
  }
}
