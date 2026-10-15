import { useSyncExternalStore } from 'react';

// Hash routes, so the static build works from any server path:
//   #/arena                  today's arena
//   #/arena/<id>/ban         看对手 + 禁用
//   #/arena/<id>/deploy      揭晓 + 部署
//   #/arena/<id>/battle      the attack itself
//   #/field                  PvE demo battle
export type Route =
  | { page: 'arena' }
  | { page: 'ban' | 'deploy' | 'arena-battle'; opponent: string }
  | { page: 'field' };

export function parseRoute(hash: string): Route {
  const [first, opponent, step] = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (first === 'field') return { page: 'field' };
  if (first === 'arena' && opponent) {
    if (step === 'deploy') return { page: 'deploy', opponent };
    if (step === 'battle') return { page: 'arena-battle', opponent };
    return { page: 'ban', opponent };
  }
  return { page: 'arena' };
}

export const links = {
  arena: '#/arena',
  field: '#/field',
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
