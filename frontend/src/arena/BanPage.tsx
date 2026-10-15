import { useEffect, useState } from 'react';
import { MY_ROSTER } from '@common/arena/demo.ts';
import { ARENA_MAPS } from '@common/arena/maps.ts';
import { opponentList } from '@common/arena/rules.ts';
import type { SnapshotUnit } from '@common/arena/rules.ts';
import { CHARACTERS } from '@common/data/characters.ts';
import type { CharacterId } from '@common/data/characters.ts';
import { CLASSES } from '@common/data/classes.ts';
import { STAT_KEYS } from '@common/data/types.ts';
import { WEAPONS } from '@common/data/weapons.ts';
import { portraitFor, spriteFor, weaponIcon } from '../assets.ts';
import { go, links } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { Flow, MapPreview, RulesGrid, Versus, useFitCell } from './ArenaParts.tsx';
import { arena, useArena } from './store.ts';

function Face({ unit, size }: { unit: SnapshotUnit; size: 32 | 44 }) {
  const looks = { classId: unit.classId, side: 'enemy' as const, character: unit.character };
  return (
    <span className="pf enemy" style={{ width: size + 2, height: size + 2 }}>
      <img className="px flip" src={portraitFor(looks) ?? spriteFor(looks)} width={size} height={size} alt="" />
    </span>
  );
}

// Steps 1–2 (docs/05): the defense list with full stats and gear, no positions, AI or priority;
// ban exactly B before anything is revealed.
export function BanPage({ id }: { id: string }) {
  const day = useArena();
  const defense = arena.opponent(id);
  const record = day.attacks[id];
  const [bans, setBans] = useState<CharacterId[]>([]);
  const [fitRef, cell] = useFitCell(defense ? ARENA_MAPS[defense.map].rows[0].length : 16, [32]);

  useEffect(() => {
    if (!defense) go(links.arena);
    else if (record.status === 'revealed') go(links.deploy(id));
    else if (record.status !== 'new') go(links.battle(id));
  }, [defense, record, id]);
  if (!defense || record.status !== 'new') return null;

  const map = ARENA_MAPS[defense.map];
  const list = opponentList(defense);
  const full = bans.length >= map.bans;
  const toggle = (c: CharacterId) => setBans(bans.includes(c) ? bans.filter(b => b !== c) : full ? bans : [...bans, c]);

  return (
    <Shell current="arena">
      <Versus defense={defense} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Flow current={1} />
        <span style={{ fontSize: 13, color: '#4E473D' }}>今日 24:00 截止；未完成的进攻按落败计</span>
      </div>
      <div className="arena-cols">
        <section className="panel" aria-labelledby="list-h" style={{ flex: '999 1 640px', minWidth: 0 }}>
          <div className="ph">
            <h2 id="list-h">防守名单 <span style={{ fontWeight: 500, color: '#6A6256' }}>{list.length} 人 · 本图出战 {map.deploy} + 禁用 {map.bans}</span></h2>
            <span style={{ fontSize: 12, color: '#6A6256' }}>按等级排序 · 防守优先级不公开</span>
          </div>
          <div className="listscroll">
            <div className="thead" aria-hidden="true">
              <span /><span>角色</span>
              {STAT_KEYS.map(k => <span key={k}>{{ hp: 'HP', str: '力', mag: '魔', skl: '技', spd: '速', lck: '运', def: '防', res: '魔防' }[k]}</span>)}
              <span>武器</span><span />
            </div>
            <ul aria-label="防守方角色">
              {list.map(u => {
                const banned = bans.includes(u.character);
                const name = CHARACTERS[u.character].name;
                return (
                  <li key={u.character} className={`drow${banned ? ' banned' : ''}`}>
                    <Face unit={u} size={44} />
                    <span className="min-w-0">
                      <span className="dn">{name}</span>
                      <span className="dc">{CLASSES[u.classId].name} · Lv {u.level}</span>
                    </span>
                    {STAT_KEYS.map(k => <span key={k} className="s">{u.stats[k]}</span>)}
                    <span className="wpns" title={u.weapons.map(w => WEAPONS[w].name).join('、')}>
                      {u.weapons.map(w => <img key={w} className="px" src={weaponIcon(WEAPONS[w].type)} width={16} height={16} alt={WEAPONS[w].name} />)}
                      <span className="wnames">{u.weapons.map(w => WEAPONS[w].name).join(' ')}</span>
                    </span>
                    <button type="button" className="btn btn-sm ban" aria-pressed={banned} disabled={!banned && full}
                      onClick={() => toggle(u.character)} aria-label={`${banned ? '撤销禁用' : '禁用'} ${name}`}>
                      {banned ? '已禁用' : '禁用'}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
        <section className="panel" aria-labelledby="map-h" style={{ flex: '1 1 496px', minWidth: 0 }}>
          <div className="ph"><h2 id="map-h">防守地图 · {map.name}</h2><span className="tag tag-grey">规则由地图决定</span></div>
          <RulesGrid map={map} />
          <div className="mapscroll" ref={fitRef}>
            <MapPreview map={map} cell={cell} mine={map.attackerZone} foe={map.defenderZone}
              label={`${map.name}地形预览：左侧为我方部署区，右侧为防守方部署区；防守站位在禁用后揭晓。`} />
          </div>
          <ul className="info">
            <li><span>地图特点</span><span className="muted">{map.feature}</span></li>
            <li><span>防守站位</span><b>禁用后揭晓</b></li>
            <li><span>防守方 AI 行为</span><b>全程不公开</b></li>
            <li><span>防守方对我方的预设禁用</span><b>揭晓阵容时显示</b></li>
            <li><span>我方可出战</span><b>快照名册 {MY_ROSTER.length} 人</b></li>
          </ul>
        </section>
      </div>
      <section className="panel bottombar" aria-label="禁用确认">
        <div className="flex flex-col">
          <span style={{ fontSize: 13, color: '#4E473D' }}>已禁用</span>
          <b className="num" style={{ fontSize: 22 }}>{bans.length} <span style={{ fontSize: 15, color: '#6A6256' }}>/ {map.bans}</span></b>
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: map.bans }, (_, i) => {
            const c = bans[i];
            const u = c ? list.find(x => x.character === c)! : null;
            return u ? (
              <span key={i} className="slot">
                <Face unit={u} size={32} />
                <b style={{ fontSize: 14 }}>{CHARACTERS[u.character].name}</b>
                <button type="button" className="btn btn-sm btn-ghost" style={{ minHeight: 32, padding: '0 8px' }}
                  onClick={() => toggle(u.character)} aria-label={`撤销禁用 ${CHARACTERS[u.character].name}`}>撤销</button>
              </span>
            ) : <span key={i} className="slot empty">空位：从左侧名单选择</span>;
          })}
        </div>
        <span style={{ flex: 1, minWidth: 220, fontSize: 13, color: '#4E473D' }}>
          确认后揭晓实际出战的 {map.deploy} 人与站位，禁用不可更改。
        </span>
        <a className="btn btn-ghost" href={links.arena}>稍后再打</a>
        <button type="button" className="btn btn-primary btn-lg" disabled={bans.length !== map.bans}
          onClick={() => { arena.confirmBans(id, bans); go(links.deploy(id)); }}>
          确认禁用并揭晓阵容
        </button>
      </section>
    </Shell>
  );
}
