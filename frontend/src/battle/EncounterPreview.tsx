import { TERRAINS } from '@common/maps/map.ts';
import type { FieldEncounter } from '@common/game/encounters.ts';
import type { ActionQuote } from '../api/session.ts';

export function EncounterSummary({ plan }: { plan: FieldEncounter }) {
  return <p className="pfoot">{plan.name} · {plan.width} × {plan.height} · 最多 {plan.maxUnits} 人 · 敌军 {plan.enemyCount} 人<br />{plan.description}</p>;
}

export function EncounterPreview({ encounter, names }: { encounter: NonNullable<ActionQuote['encounter']>; names: string[] }) {
  const { map } = encounter;
  const groups = [...new Set(map.playerGroups ?? [0])];
  return <figure aria-label="战场部署预览" style={{ margin: 16, minWidth: 0 }}>
    <EncounterSummary plan={encounter} />
    <svg role="img" aria-label={`${encounter.name}：地形、我方小队与敌军部署`} viewBox={`0 0 ${map.width * 20} ${map.height * 20}`} style={{ display: 'block', width: '100%', maxWidth: 480, height: 'auto' }}>
      {map.tiles.flatMap((row, y) => row.map((tile, x) => <rect key={`${x},${y}`} x={x * 20} y={y * 20} width={20} height={20} fill={TERRAINS[tile].color} stroke="#0002"><title>({x}, {y}) {TERRAINS[tile].name}</title></rect>))}
      {map.spawns.player.map(([x, y], i) => <g key={`p${i}`} transform={`translate(${x * 20 + 10} ${y * 20 + 10})`} opacity={i < names.length ? 1 : .5}>
        <title>({x}, {y}) 小队 {(map.playerGroups?.[i] ?? 0) + 1}：{names[i] ?? '空位'}</title><circle r={9} fill={i < names.length ? '#174e76' : '#fff'} stroke="#fff" /><text textAnchor="middle" dominantBaseline="central" fontSize={11} fill={i < names.length ? '#fff' : '#174e76'}>{(map.playerGroups?.[i] ?? 0) + 1}</text>
      </g>)}
      {map.spawns.enemy.map(([x, y], i) => <g key={`e${i}`} transform={`translate(${x * 20 + 10} ${y * 20 + 10})`}><title>({x}, {y}) 敌军 {i + 1}</title><path d="M0 -9L9 8H-9Z" fill="#962e25" stroke="white" /></g>)}
      <text x={map.objective.position[0] * 20 + 10} y={map.objective.position[1] * 20 + 10} textAnchor="middle" dominantBaseline="central" fontSize={15} fill="#fff">★<title>占领目标</title></text>
    </svg>
    <figcaption style={{ fontSize: 12, overflowWrap: 'anywhere' }}>
      圆形数字：我方小队（空心为未出战位置）；三角：敌军；★：占领目标。坐标从 0 开始。
      {groups.map(group => <div key={group}>小队 {group + 1}：{map.spawns.player.map((pos, i) => (map.playerGroups?.[i] ?? 0) === group && names[i] ? `${names[i]} (${pos.join(', ')})` : null).filter(Boolean).join('、') || '空位'}</div>)}
      <div>地形：{[...new Set(map.tiles.flat())].map(tile => `${TERRAINS[tile].name} ${TERRAINS[tile].glyph}`).join(' · ')}</div>
    </figcaption>
  </figure>;
}
