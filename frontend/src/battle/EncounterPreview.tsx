import { useId, useState } from 'react';
import { CLASSES } from '@common/data/classes.ts';
import { STAT_KEYS, STAT_NAMES } from '@common/data/types.ts';
import { WEAPONS } from '@common/data/weapons.ts';
import { TERRAINS } from '@common/maps/map.ts';
import type { ActionQuote } from '../api/session.ts';

export function EncounterPreview({ encounter, names }: { encounter: NonNullable<ActionQuote['encounter']>; names: string[] }) {
  const { map, enemies } = encounter;
  const [selected, setSelected] = useState<string | null>(null);
  const tooltipId = useId();
  const enemy = enemies.find(unit => unit.id === selected);
  return <figure className="encounter-preview" aria-label="战场部署预览" onKeyDown={event => { if (event.key === 'Escape') setSelected(null); }}>
    <div className="encounter-map">
      <svg role="group" aria-label={`${encounter.name}：地形、我方小队与敌军部署`} viewBox={`0 0 ${map.width * 20} ${map.height * 20}`}>
        {map.tiles.flatMap((row, y) => row.map((tile, x) => <rect key={`${x},${y}`} x={x * 20} y={y * 20} width={20} height={20} fill={TERRAINS[tile].color} stroke="#0002"><title>({x}, {y}) {TERRAINS[tile].name}</title></rect>))}
        {map.spawns.player.map(([x, y], i) => <g key={`p${i}`} transform={`translate(${x * 20 + 10} ${y * 20 + 10})`} opacity={i < names.length ? 1 : .5}>
          <title>({x}, {y}) 小队 {(map.playerGroups?.[i] ?? 0) + 1}：{names[i] ?? '空位'}</title><circle r={9} fill={i < names.length ? '#174e76' : '#fff'} stroke="#fff" /><text textAnchor="middle" dominantBaseline="central" fontSize={11} fill={i < names.length ? '#fff' : '#174e76'}>{(map.playerGroups?.[i] ?? 0) + 1}</text>
        </g>)}
        {enemies.map(unit => <g key={unit.id} data-enemy-id={unit.id} role="button" tabIndex={0}
          aria-label={`${unit.name} · ${CLASSES[unit.classId].name} · Lv ${unit.level} · HP ${unit.hp}/${unit.stats.hp}`}
          aria-describedby={enemy?.id === unit.id ? tooltipId : undefined}
          transform={`translate(${unit.pos[0] * 20 + 10} ${unit.pos[1] * 20 + 10})`}
          onPointerEnter={() => setSelected(unit.id)} onPointerLeave={() => setSelected(null)}
          onFocus={() => setSelected(unit.id)} onBlur={() => setSelected(null)}
          onClick={() => setSelected(unit.id)} onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(unit.id); }
          }}>
          <path d="M0 -9L9 8H-9Z" fill={enemy?.id === unit.id ? '#d87925' : '#962e25'} stroke="white" />
        </g>)}
        {map.objective && <text pointerEvents="none" x={map.objective.position[0] * 20 + 10} y={map.objective.position[1] * 20 + 10} textAnchor="middle" dominantBaseline="central" fontSize={15} fill="#fff">★<title>{map.objective.label}</title></text>}
      </svg>
      {enemy && <div id={tooltipId} role="tooltip" className="encounter-tooltip">
        <b>{enemy.name}</b>
        <div>{CLASSES[enemy.classId].name} · Lv {enemy.level} · HP {enemy.hp}/{enemy.stats.hp}</div>
        <dl>{STAT_KEYS.filter(key => key !== 'hp').map(key => <div key={key}><dt>{STAT_NAMES[key]}</dt><dd>{enemy.stats[key]}</dd></div>)}</dl>
        <div>装备：{enemy.weapons.map(id => WEAPONS[id].name).join('、') || '无'}</div>
      </div>}
    </div>
    <div className="encounter-roster">
      {!!encounter.reinforcements?.length && <div className="pfoot" aria-label="敌方增援计划">
        初始 {encounter.enemyCount} 人；援军 {encounter.reinforcements.map(wave => `第${wave.turn}回合 ${wave.count}人`).join('、')}。提前一回合预警，我方回合开始抵达；击败主将即可结束。
      </div>}
      <table aria-label="敌方单位简表">
        <thead><tr><th scope="col">敌军</th><th scope="col">HP</th><th scope="col">等级</th><th scope="col">职业</th></tr></thead>
        <tbody>{enemies.map(unit => <tr key={unit.id} data-selected={enemy?.id === unit.id}>
          <th scope="row"><button type="button" aria-describedby={enemy?.id === unit.id ? tooltipId : undefined} onPointerEnter={() => setSelected(unit.id)} onPointerLeave={() => setSelected(null)} onFocus={() => setSelected(unit.id)} onBlur={() => setSelected(null)} onClick={() => setSelected(unit.id)}>{unit.name}</button></th>
          <td>{unit.hp}/{unit.stats.hp}</td><td>{unit.level}</td><td>{CLASSES[unit.classId].name}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </figure>;
}
