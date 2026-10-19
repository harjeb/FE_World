import { useState } from 'react';
import { REGION_EXPLORATION_GAIN, REGION_EXPLORATION_MAX } from '@common/game/region-map.ts';
import type { WorldMapView, WorldMapNode } from '@common/game/region-map.ts';
import { session, useSession } from '../api/session.ts';
import { featuresOf } from '../model/access.ts';
import { links } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { dateLabel } from '../ui/calendar.ts';
import { CompassIcon } from '../ui/icons.tsx';
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
          <p style={{ fontSize: 14, color: '#4E473D' }}>从王都出发，四条干线通向第一环；地区探索度满 {REGION_EXPLORATION_MAX} 后，与它相连的新路线才开放选择。开通路线不消耗行动日。</p>
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
            <div className="ph"><h2 id="wm-h">地图</h2><span style={{ fontSize: 12, color: '#6A6256' }}>Tab 移动焦点，Enter 选择；未开通地区不可提交</span></div>
            <div className="world-map" role="group" aria-label="世界地图">
              <svg className="world-roads" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {world.edges.map(([a, b], i) => {
                  const pa = pointOf(world, a);
                  const pb = pointOf(world, b);
                  if (!pa || !pb) return null;
                  const status = (id: number) => id === 0 ? 'cleared' : world.nodes.find(n => n.id === id)?.state ?? 'locked';
                  const sa = status(a), sb = status(b);
                  const lit = sa !== 'locked' && sb !== 'locked' && (['cleared', 'unlocked'].includes(sa) || ['cleared', 'unlocked'].includes(sb));
                  return <line key={i} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} className={lit ? 'lit' : undefined} vectorEffect="non-scaling-stroke" />;
                })}
              </svg>
              <span className="world-capital" style={{ left: `${world.capital.x}%`, top: `${world.capital.y}%` }}>
                <a href={links.camp} title="王都 · 返回军营">{world.capital.name}</a>
              </span>
              {world.nodes.map(n => {
                const [label, tag] = STATE_TEXT[n.state];
                const open = n.state === 'unlocked' || n.state === 'cleared';
                return (
                  <button key={n.id} type="button" data-region={n.id}
                    className={`world-node ${n.state}${picked === n.id ? ' picked' : ''}`}
                    style={{ left: `${n.x}%`, top: `${n.y}%` }}
                    aria-pressed={picked === n.id}
                    aria-label={`${n.name} · ${label}${open ? ` · 探索度 ${n.exploration} / ${REGION_EXPLORATION_MAX}` : ''}`}
                    disabled={n.state === 'locked'}
                    title={n.state === 'locked' ? '未开通：先将相连地区探索度提升至 100' : `${n.name} · ${label}`}
                    onClick={() => setPicked(n.id)}>
                    <span className="wn-n">{n.name}</span>
                    {open ? <RegionExploration region={n} /> : <span className={`tag ${tag}`}>{label}</span>}
                  </button>
                );
              })}
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
                <p style={{ padding: '12px 16px', fontSize: 14, color: '#4E473D' }}>
                  点地图上的地区查看详情。<CompassIcon />可选路线（铜色）现在就能开通；已开通地区可以直达任务与出击。
                </p>
              </section>
            )}
            <section className="panel" aria-labelledby="wr-h">
              <div className="ph"><h2 id="wr-h">路线规则</h2></div>
              <ul className="sys-rules">
                <li>王都向四方各通向一个第一环地区；内环与中环道路把相邻地区连起来。</li>
                <li>野外获胜增加 {REGION_EXPLORATION_GAIN.field} 探索度；单图任务完成增加 {REGION_EXPLORATION_GAIN.quest}；各副本（含多图任务）首次完整通关增加 {REGION_EXPLORATION_GAIN.dungeon}。</li>
                <li>探索度满 {REGION_EXPLORATION_MAX} 才能选择相邻新路线；副本重复通关、中间关卡、失败、撤退、扫荡和后台派遣不增加探索度。</li>
                <li>选择路线立即开通该地区的出击与任务，派遣在首次讨伐后开放。</li>
                <li>远处的地区在相连路线开通前不可选择、不可提交。</li>
              </ul>
            </section>
          </div>
        </div>
      )}
    </Shell>
  );
}

function pointOf(world: WorldMapView, id: number): { x: number; y: number } | null {
  if (id === 0) return { x: world.capital.x, y: world.capital.y };
  return world.nodes.find(n => n.id === id) ?? null;
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
        {open ? (
          <>
            <dt>状态</dt><dd>{node.state === 'cleared' ? '已讨伐：扫荡与游历照常；继续完成任务或野外战斗，探索满后开放相邻新路线。' : '已开通：可以在此出击、做地区任务；首次讨伐后开放派遣。'}</dd>
          </>
        ) : (
          <>
            <dt>路线</dt><dd>{node.state === 'available' ? '选择后立即开通，不消耗行动日。' : '尚未开通：先将相连已开通地区的探索度提升至 100。'}</dd>
          </>
        )}
      </dl>
      {open && <div style={{ padding: '0 16px 14px' }}>
        <RegionExploration region={node} />
        <p style={{ fontSize: 12, color: '#6A6256', marginTop: 6 }}>{node.exploration >= REGION_EXPLORATION_MAX
          ? '探索完成，可以在地图上选择相邻新路线。'
          : `野外获胜 +${REGION_EXPLORATION_GAIN.field}，单图任务完成 +${REGION_EXPLORATION_GAIN.quest}，各副本首通 +${REGION_EXPLORATION_GAIN.dungeon}；满 ${REGION_EXPLORATION_MAX} 开放相邻新路线。`}</p>
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
        {node.state === 'locked' && <span style={{ fontSize: 13, color: '#6A6256' }}>先将相连地区探索度提升至 100，路线开放后才能选择。</span>}
      </div>
    </section>
  );
}
