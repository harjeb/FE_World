import { useState } from 'react';
import { REGION_EXPLORATION_MAX } from '@common/game/region-map.ts';
import type { WorldMapNode } from '@common/game/region-map.ts';
import { session, useSession } from '../api/session.ts';
import { featuresOf } from '../model/access.ts';
import { go, links } from '../router.ts';
import { PixelWorldMap } from '../world/PixelWorldMap.tsx';
import { Shell } from '../shell/Shell.tsx';
import { dateLabel } from '../ui/calendar.ts';
import { RegionExploration } from '../ui/RegionExploration.tsx';
import { toast } from '../ui/toast.tsx';

// 节点状态 → 标签与样式类。四态互斥：未开通的远端地区不能提交选择。
const STATE_TEXT: Record<WorldMapNode['state'], [string, string]> = {
  cleared: ['已讨伐', 'tag-green'],
  unlocked: ['已开通', 'tag-blue'],
  available: ['可选路线', 'tag-brass'],
  locked: ['未开通', 'tag-grey'],
};

// 世界地图 (docs/00 §8.1): 从王都向四方选择讨伐路线。可选地区由服务端给出（GET_STATE 的 world 视图），
// 选择（CHOOSE_ROUTE）立即开通、不耗行动日；已开通地区可以直达任务／出击。地图不本地推算路线。
export function WorldPage() {
  const { state } = useSession();
  const world = state?.world ?? null;
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const features = featuresOf(state);

  const node = world?.nodes.find(n => n.id === picked) ?? null;
  const counts = {
    explored: world?.nodes.filter(n => n.exploration >= REGION_EXPLORATION_MAX).length ?? 0,
    unlocked: world?.unlockedRegions.length ?? 0,
    available: world?.selectableRegions.length ?? 0,
  };

  const choose = async (region: number) => {
    setBusy(true);
    try {
      await session.chooseRoute(region);
      toast('路线已开通，可以前往该地区出击与做任务。');
    } catch (e) {
      toast(`选择路线失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell current="world">
      <div className="brief-head">
        <div>
          <div className="eyebrow">世界地图 · {state ? dateLabel(state.day) : ''}</div>
          <h1 className="serif" style={{ fontSize: 28, lineHeight: 1.25 }}>十二地区讨伐路线</h1>
        </div>
        <div style={{ fontSize: 13, color: '#4E473D', textAlign: 'right' }}>
          探索完成 <b className="num">{counts.explored}</b> · 已开通 <b className="num">{counts.unlocked}</b> · 可选路线 <b className="num">{counts.available}</b>
        </div>
      </div>

      {!world && (
        <section className="panel">
          <p style={{ padding: '12px 16px', fontSize: 14, color: '#4E473D' }}>暂时读不到世界地图数据，刷新页面再试。</p>
        </section>
      )}

      {world && (
        <div className="world-cols">
          <section className="panel" aria-labelledby="wm-h">
            <div className="ph"><h2 id="wm-h">地图</h2></div>
            <div className="world-map pixel" role="group" aria-label="世界地图">
              <PixelWorldMap world={world} picked={picked} onPick={setPicked}
                onEnter={id => go(features.quests ? `${links.quests}?region=${id}` : links.world)} />
              <ul className="world-list" aria-label="地区列表">
                {world.nodes.map(n => {
                  const [label, tag] = STATE_TEXT[n.state];
                  const open = n.state === 'unlocked' || n.state === 'cleared';
                  return (
                    <li key={n.id}>
                      <button type="button" data-region={n.id}
                        className={`world-node ${n.state}${picked === n.id ? ' picked' : ''}`}
                        aria-pressed={picked === n.id}
                        disabled={n.state === 'locked'}
                        aria-label={`${n.name} · ${label}${open ? ` · 探索度 ${n.exploration} / ${REGION_EXPLORATION_MAX}` : ''}`}
                        title={n.state === 'locked' ? '未开通：先将相连地区探索度提升至 100' : `${n.name} · ${label}`}
                        onClick={() => setPicked(n.id)}>
                        <span className="wn-n">{n.name}</span>
                        {open ? <RegionExploration region={n} /> : <span className={`tag ${tag}`}>{label}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            <ul className="world-legend" aria-label="图例">
              <li><i className="cap" />王都</li>
              <li><i className="cleared" />已讨伐</li>
              <li><i className="unlocked" />已开通</li>
              <li><i className="available" />可选路线</li>
              <li><i className="locked" />未开通</li>
            </ul>
          </section>

          <div className="colstack">
            {node ? <NodeDetails node={node} busy={busy} onChoose={() => void choose(node.id)} features={features} /> : (
              <section className="panel">
                <div className="ph"><h2>选择一个地区</h2></div>
              </section>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}

function NodeDetails({ node, busy, onChoose, features }: {
  node: WorldMapNode; busy: boolean; onChoose: () => void; features: ReturnType<typeof featuresOf>;
}) {
  const [label] = STATE_TEXT[node.state];
  const open = node.state === 'unlocked' || node.state === 'cleared';
  return (
    <section className="panel" aria-labelledby="wd-h">
      <div className="ph"><h2 id="wd-h">{node.name}</h2><span className={`tag ${STATE_TEXT[node.state][1]}`}>{label}</span></div>
      <dl className="facts" style={{ padding: '4px 16px 8px' }}>
        <dt>特产</dt><dd>{node.resource}</dd>
      </dl>
      {open && <div style={{ padding: '0 16px 14px' }}>
        <RegionExploration region={node} />
      </div>}
      <div className="go-bar" style={{ padding: '0 16px 14px' }}>
        {node.state === 'available' && (
          <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={onChoose}>
            {busy ? '开通中…' : `选择此路线 · 开通${node.name}`}
          </button>
        )}
        {open && (
          <>
            {features.quests && <a className="btn btn-sm" href={`${links.quests}?region=${node.id}`}>前往任务</a>}
            {features.field && <a className="btn btn-sm btn-primary" href={`${links.field}?region=${node.id}`}>出击此地</a>}
            {features.dungeon && <a className="btn btn-sm" href={`${links.dungeon}?region=${node.id}`}>大副本</a>}
            {features.dispatch && <a className="btn btn-sm" href={`${links.dispatch}?region=${node.id}`}>派遣</a>}
          </>
        )}
      </div>
    </section>
  );
}
