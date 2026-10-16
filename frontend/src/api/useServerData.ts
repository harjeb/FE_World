import { useEffect, useState } from 'react';
import { useSession } from './session.ts';

// Data only one page needs (纪念名册, 职业资格 …) is loaded by that page. It reloads when `deps` change
// and whenever the server's player version moves, so it is never older than the session it sits in.
export function useServerData<T>(load: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null } {
  const version = useSession().state?.version ?? 0;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    load().then(
      value => { if (alive) { setData(value); setError(null); } },
      e => { if (alive) setError(e instanceof Error ? e.message : String(e)); },
    );
    return () => { alive = false; };
  }, [version, ...deps]);
  return { data, error };
}
