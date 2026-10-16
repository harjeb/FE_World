import { useEffect, useState } from 'react';
import { session } from '../api/session.ts';
import type { ServerReplay, ServerReplayData } from '../api/session.ts';
import { Frame, ReplayView } from './ReplayPage.tsx';

// Agent 实时观战: the server owns the battle, so the viewer auto-plays the player's most recent stored
// battle (docs/11「Agent 接入后的真实观战」). It is the same read-only viewer as 回放, just started
// playing; there is no local rule-AI stand-in any more.
export function SpectatePage() {
  const [list, setList] = useState<ServerReplay[] | null>(null);
  const [data, setData] = useState<ServerReplayData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void session.replays().then(setList).catch(e => setError(String(e?.message ?? e)));
  }, []);
  const latest = list?.[0]?.id ?? null;
  useEffect(() => {
    if (!latest) return;
    void session.replay(latest).then(setData).catch(e => setError(String(e?.message ?? e)));
  }, [latest]);

  if (error) return <Frame title="实时观战" message={`读取战报失败：${error}`} />;
  if (!data) return <Frame title="实时观战" message={list && list.length === 0 ? '还没有可观的战斗：先打一场竞技场或出击，Agent 的最近一局会出现在这里。' : '正在读取最近一局…'} list={list} selected={latest} />;
  return <ReplayView key={data.id} data={data} list={list ?? []} selected={latest} autoPlay spectate />;
}
