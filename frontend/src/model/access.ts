// 功能旗标与路由门禁：ServerState.features（FeatureAccess）决定哪些模块可见、哪些直达路由可用。
// 读取特性旗标前只展示基础页面；进行中的活动由 activityOf 单独保留。
import type { FeatureAccess, FeatureKey } from '@common/game/region-map.ts';
import type { ServerAnnual, ServerRun, ServerState, ServerToday } from '../api/session.ts';
import type { Route } from '../router.ts';
import { annualLive } from './roster.ts';

export const LOCKED_FEATURES: FeatureAccess = {
  field: false, dungeon: false, dispatch: false, quests: false, tower: false, workshop: false,
  tavern: false, arena: false, annual: false, story: false, legacy: false, reports: false, spectate: false,
};

export function featuresOf(state: ServerState | null | undefined): FeatureAccess {
  return { ...LOCKED_FEATURES, ...state?.features };
}

export function featureOn(features: FeatureAccess, key: FeatureKey): boolean {
  return features[key] !== false;
}

// 正在进行的活动：这些路由保持可达，旗标变化不能把玩家从进行中的战斗／赛事里弹出去。
export interface ActivityContext {
  battle: ServerToday['battle'];
  runBattle: boolean;
  annualEntry: boolean;
}

export function activityOf(s: {
  state: ServerState | null; today: ServerToday | null; run: ServerRun | null; annual: ServerAnnual | null;
}): ActivityContext {
  return {
    battle: s.today?.battle ?? null,
    runBattle: !!s.run && (s.run.state === 'battle' || s.run.state === 'between_maps'),
    annualEntry: annualLive(s.annual),
  };
}

// 路由门禁：被锁的直达地址应改渲染世界地图（由调用方处理），这里只回答「允许与否」。
export function isRouteAllowed(route: Route, features: FeatureAccess, activity: ActivityContext): boolean {
  switch (route.page) {
    case 'camp':
    case 'world':
    case 'roster':
    case 'promote':
    case 'prep':
    case 'rules':
    case 'settings':
      return true;
    case 'field': return activity.battle?.mode === 'field' || features.field;
    case 'dungeon': return activity.runBattle || features.dungeon;
    case 'dispatch': return features.dispatch;
    case 'annual': return activity.annualEntry || features.annual;
    case 'arena': return features.arena;
    case 'ban':
    case 'deploy':
    case 'arena-battle':
      return features.arena || activity.battle?.mode === 'arena';
    case 'quests': return route.tab === 'tower' ? features.tower : features.quests;
    case 'workshop': return features.workshop;
    case 'tavern': return features.tavern;
    case 'story': return features.story;
    case 'legacy': return features.legacy;
    case 'reports': return features.reports;
    case 'replay': return features.reports;
    case 'spectate': return features.spectate;
  }
}
