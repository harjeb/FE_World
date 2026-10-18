import { useSyncExternalStore } from 'react';

// Hash routes, so the static build works from any server path:
//   #/camp                   军营 (default)
//   #/world                   世界地图：选择讨伐路线、查看已开通地区
//   #/roster[/<id>[/tab]]    名册: 属性与装备 / 成长记录 / 精通与技能 / 职业资格 / 退役与轮回
//   #/roster/<id>/promote    转职
//   #/arena                  today's arena: attacks, the real-month table and rewards
//   #/arena/annual           年度大竞技场: registration, bracket and its matches
//   #/arena/<id>/ban         看对手 + 禁用
//   #/arena/<id>/deploy      揭晓 + 部署
//   #/arena/<id>/battle      the attack itself
//   #/field                  出击: 出征准备, then the server battle
//   #/field/dungeon          大副本: three maps in a row with a fixed team
//   #/field/dispatch         后台派遣: auto exploration / class training
//   #/quests[/tower]         地区任务 / 挑战塔
//   #/workshop               生产: 药草田、炼药所、铁匠铺
//   #/tavern                 酒馆: paid recruits, minigames, the free emergency recruit
//   #/story                  主线: the eight yearly chapters
//   #/legacy                 传承: legacies and the 纪念名册
//   #/rules                  规则手册
//   #/settings               设置: account, Agent access, control lease, battle display defaults
//   #/prep[/<id>]            整备: warehouse, shop, carried items, repairs, books, 能力药 and 公共经验
//   #/spectate               Agent 实时观战 (the battle in progress)
//   #/replay                 战报: every finished battle, filters and the casualty / consumption report
//   #/replay/<id>            one stored battle, step by step
// The old #/arena/defense entry is gone: the first release's arena is attack-only.
export type RosterTab = 'stats' | 'growth' | 'mastery' | 'classes' | 'retire';
export type FieldTab = 'field' | 'dungeon' | 'dispatch';

export type Route =
  | { page: 'camp' }
  | { page: 'world' }
  | { page: 'roster'; unit: string | null; tab: RosterTab }
  | { page: 'promote'; unit: string }
  | { page: 'arena' }
  | { page: 'ban' | 'deploy' | 'arena-battle'; opponent: string }
  | { page: 'field' }
  | { page: 'dungeon' }
  | { page: 'dispatch' }
  | { page: 'annual' }
  | { page: 'workshop' }
  | { page: 'tavern' }
  | { page: 'story' }
  | { page: 'quests'; tab: 'regions' | 'tower' }
  | { page: 'legacy' }
  | { page: 'rules' }
  | { page: 'settings' }
  | { page: 'prep'; unit: string | null }
  | { page: 'spectate' }
  | { page: 'reports' }
  | { page: 'replay'; id: string };

const ROSTER_TABS: RosterTab[] = ['growth', 'mastery', 'classes', 'retire'];

export function regionInHash(hash: string): number | null {
  const query = hash.indexOf('?');
  if (query < 0) return null;
  const raw = new URLSearchParams(hash.slice(query + 1)).get('region');
  const region = raw === null ? NaN : Number(raw);
  return Number.isInteger(region) && region >= 1 && region <= 12 ? region : null;
}

export function parseRoute(hash: string): Route {
  const [first, second, third] = hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
  switch (first) {
    case 'field':
      return second === 'dungeon' ? { page: 'dungeon' } : second === 'dispatch' ? { page: 'dispatch' } : { page: 'field' };
    case 'world': return { page: 'world' };
    case 'workshop': return { page: 'workshop' };
    case 'tavern': return { page: 'tavern' };
    case 'story': return { page: 'story' };
    case 'quests': return { page: 'quests', tab: second === 'tower' ? 'tower' : 'regions' };
    case 'legacy': return { page: 'legacy' };
    case 'rules': return { page: 'rules' };
    case 'settings': return { page: 'settings' };
    case 'prep': return { page: 'prep', unit: second ?? null };
    case 'spectate': return { page: 'spectate' };
    case 'replay': return second ? { page: 'replay', id: second } : { page: 'reports' };
    case 'roster':
      if (second && third === 'promote') return { page: 'promote', unit: second };
      return { page: 'roster', unit: second ?? null, tab: ROSTER_TABS.includes(third as RosterTab) ? third as RosterTab : 'stats' };
    case 'arena':
      if (second === 'annual') return { page: 'annual' };
      if (!second || second === 'defense') return { page: 'arena' };
      if (third === 'deploy') return { page: 'deploy', opponent: second };
      if (third === 'battle') return { page: 'arena-battle', opponent: second };
      return { page: 'ban', opponent: second };
    default:
      return { page: 'camp' };
  }
}

export const links = {
  camp: '#/camp',
  world: '#/world',
  roster: (id?: string, tab: RosterTab = 'stats') => (id ? `#/roster/${id}${tab === 'stats' ? '' : `/${tab}`}` : '#/roster'),
  promote: (id: string) => `#/roster/${id}/promote`,
  arena: '#/arena',
  field: '#/field',
  dungeon: '#/field/dungeon',
  dispatch: '#/field/dispatch',
  annual: '#/arena/annual',
  workshop: '#/workshop',
  tavern: '#/tavern',
  story: '#/story',
  quests: '#/quests',
  tower: '#/quests/tower',
  legacy: '#/legacy',
  rules: '#/rules',
  settings: '#/settings',
  prep: (id?: string) => (id ? `#/prep/${id}` : '#/prep'),
  spectate: '#/spectate',
  reports: '#/replay',
  replay: (id: string) => `#/replay/${id}`,
  ban: (id: string) => `#/arena/${id}/ban`,
  deploy: (id: string) => `#/arena/${id}/deploy`,
  battle: (id: string) => `#/arena/${id}/battle`,
};

export function go(hash: string): void {
  window.location.hash = hash;
}

const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
};

export function useRoute(): Route {
  return parseRoute(useSyncExternalStore(subscribe, () => window.location.hash));
}
