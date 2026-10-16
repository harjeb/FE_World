import { useSyncExternalStore } from 'react';

// Hash routes, so the static build works from any server path:
//   #/camp                   军营 (default)
//   #/roster[/<id>[/growth]] 名册: 属性与装备 / 成长记录
//   #/roster/<id>/promote    转职
//   #/arena                  today's arena: attacks, defense results, rewards
//   #/arena/defense          defense settings for the next arena
//   #/arena/<id>/ban         看对手 + 禁用
//   #/arena/<id>/deploy      揭晓 + 部署
//   #/arena/<id>/battle      the attack itself
//   #/field                  出击: 出征准备, then the server battle
//   #/prep[/<id>]            整备: warehouse, shop, carried items, 能力药 and 公共经验
//   #/spectate               Agent 实时观战
//   #/replay                 历史回放
export type RosterTab = 'stats' | 'growth';

export type Route =
  | { page: 'camp' }
  | { page: 'roster'; unit: string | null; tab: RosterTab }
  | { page: 'promote'; unit: string }
  | { page: 'arena' }
  | { page: 'defense' }
  | { page: 'ban' | 'deploy' | 'arena-battle'; opponent: string }
  | { page: 'field' }
  | { page: 'prep'; unit: string | null }
  | { page: 'spectate' }
  | { page: 'replay'; id: string | null };

export function parseRoute(hash: string): Route {
  const [first, second, third] = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  switch (first) {
    case 'field': return { page: 'field' };
    case 'prep': return { page: 'prep', unit: second ?? null };
    case 'spectate': return { page: 'spectate' };
    case 'replay': return { page: 'replay', id: second ?? null };
    case 'roster':
      if (second && third === 'promote') return { page: 'promote', unit: second };
      return { page: 'roster', unit: second ?? null, tab: third === 'growth' ? 'growth' : 'stats' };
    case 'arena':
      if (second === 'defense') return { page: 'defense' };
      if (!second) return { page: 'arena' };
      if (third === 'deploy') return { page: 'deploy', opponent: second };
      if (third === 'battle') return { page: 'arena-battle', opponent: second };
      return { page: 'ban', opponent: second };
    default:
      return { page: 'camp' };
  }
}

export const links = {
  camp: '#/camp',
  roster: (id?: string, tab: RosterTab = 'stats') => (id ? `#/roster/${id}${tab === 'growth' ? '/growth' : ''}` : '#/roster'),
  promote: (id: string) => `#/roster/${id}/promote`,
  arena: '#/arena',
  defense: '#/arena/defense',
  field: '#/field',
  prep: (id?: string) => (id ? `#/prep/${id}` : '#/prep'),
  spectate: '#/spectate',
  replay: (id?: string) => (id ? `#/replay/${id}` : '#/replay'),
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
