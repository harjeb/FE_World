import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { CLASSES } from '@common/data/classes.ts';
import { SKILLS } from '@common/data/skills.ts';
import { STAT_KEYS, STAT_NAMES } from '@common/data/types.ts';
import type { AiDifficulty } from '@common/engine/types.ts';
import { CROSS_TIME_ROSTER } from '@common/game/cross-time.ts';
import { crossTimeInitialState } from '@common/game/cross-time-battle.ts';
import { moveRange } from '@common/engine/movement.ts';
import { reachCells } from '@common/engine/ranges.ts';
import { mapArt } from '../assets.ts';
import { CellLayer, ObjectLayer, UnitLayer } from '../battle/MapLayers.tsx';
import { weaponLabel, spellInfo } from '../battle/commands.ts';

export function CrossTimeEnemyPreview({ difficulty, day }: { difficulty: AiDifficulty; day: number }) {
  const [selected, setSelected] = useState(CROSS_TIME_ROSTER[0].id);
  const battle = useMemo(() => crossTimeInitialState([], { region: 0, day, seed: 'preview', aiDifficulty: difficulty }), [day, difficulty]);
  const row = CROSS_TIME_ROSTER.find(row => row.id === selected) ?? CROSS_TIME_ROSTER[0];
  const stats = difficulty === 'hard' ? row.hard52 : row.normal48;
  const skill = SKILLS[row.personalSkill];
  const unit = battle.units.find(unit => unit.id === `cross-time:${row.id}`)!;
  const range = moveRange(battle, unit), attack = reachCells(battle, unit, range, 'attack');
  const cell = 32, width = battle.map.width * cell, height = battle.map.height * cell;
  return <details className="sys-note">
    <summary>查看 17 名敌军的站位、装备、属性与激活后范围</summary>
    <label>名将 <select value={row.id} onChange={e => setSelected(e.target.value as typeof selected)}>
      {CROSS_TIME_ROSTER.map(row => <option key={row.id} value={row.id}>{row.group} · {row.name}</option>)}
    </select></label>
    <p>{row.name} · {CLASSES[row.classId].name} · Lv {difficulty === 'hard' ? 52 : 48} · {row.group} 组 · 坐标 ({row.pos.join(', ')})</p>
    <p>{skill.name}：{skill.text}</p>
    <div className="basestats">{STAT_KEYS.map(key => <div key={key}><span>{STAT_NAMES[key]}</span><b>{stats[key]}</b></div>)}</div>
    <p>体格 {row.con + (difficulty === 'hard' ? 2 : 0)} · 职业移动 {CLASSES[row.classId].move}</p>
    <p>装备：{row.weapons.map(weaponLabel).join('、') || '无'}{row.books.map(book => ` · ${spellInfo(book.id)?.name ?? book.id} ${book.charges} 次`).join('')}</p>
    <p>以上包含副本敌军强化，不包含交战时的概率特性、装备或光环加成。</p>
    <p>准备地图：蓝色纹路为所选敌人激活后的移动范围，红色纹路为移动后攻击范围；金色虚线为警戒线。按出发季节和开局物件计算，战中会随站位、开门和地形变化。</p>
    <div style={{ overflow: 'auto', maxHeight: 560 }}>
      <div className="mapbox compact" style={{ width, height, '--cell': `${cell}px` } as CSSProperties} role="img" aria-label={`${row.name}激活后的移动、攻击范围及三条警戒线`}>
        <img className="px" src={mapArt(battle.name, battle.map.tiles, battle.map.season)} width={width} height={height} alt="" draggable={false} />
        <CellLayer cells={range.stops} width={battle.map.width} cell={cell} className="mv" />
        <CellLayer cells={attack} width={battle.map.width} cell={cell} className="atk" />
        <ObjectLayer state={battle} cell={cell} />
        <UnitLayer view={battle} cell={cell} selected={unit.id} ghostElsewhere={false} fading={new Set()} />
        {battle.crossTimeGroups!.filter(group => group.thresholdY !== undefined).map(group => <div key={group.id} style={{ position: 'absolute', pointerEvents: 'none', left: 0, top: (group.thresholdY! + 1) * cell, width, borderTop: '2px dashed #E8B45B', color: '#fff', textShadow: '1px 1px 2px #000', fontSize: 12, zIndex: 2 }}>{group.id} · Y≤{group.thresholdY}</div>)}
      </div>
    </div>
  </details>;
}
