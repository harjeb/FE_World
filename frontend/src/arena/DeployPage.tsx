import { useEffect, useMemo, useRef, useState } from 'react';
import { MY_ROSTER, OPPONENTS } from '../demo/live.ts';
import { ARENA_MAPS, throneOf } from '@common/arena/maps.ts';
import { validateAttack } from '@common/arena/rules.ts';
import type { AttackPlan, SnapshotUnit } from '@common/arena/rules.ts';
import { CHARACTERS } from '@common/data/characters.ts';
import type { CharacterId } from '@common/data/characters.ts';
import { CLASSES } from '@common/data/classes.ts';
import { WEAPONS } from '@common/data/weapons.ts';
import type { Point } from '@common/engine/index.ts';
import { portraitFor, spriteFor } from '../assets.ts';
import { go, links } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { Flow, MapPreview, SnapshotTag, attackIndex, useFitCell } from './ArenaParts.tsx';
import type { PreviewUnit } from './ArenaParts.tsx';
import { arena, useArena } from './store.ts';

const name = (c: CharacterId) => CHARACTERS[c].name;
const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];

function UnitLine({ unit, side }: { unit: SnapshotUnit; side: 'player' | 'enemy' }) {
  const s = unit.stats;
  return (
    <span>
      <b>{side === 'enemy' ? '◆ ' : '● '}{name(unit.character)}</b> {CLASSES[unit.classId].name} Lv {unit.level} ·
      HP {s.hp} 力 {s.str} 魔 {s.mag} 技 {s.skl} 速 {s.spd} 运 {s.lck} 防 {s.def} 魔防 {s.res} ·
      {' '}{unit.weapons.map(w => WEAPONS[w].name).join(' ')}
    </span>
  );
}

// Steps 3–4 (docs/05): see who actually defends and where (AI stays hidden), learn which of my
// characters are barred, then pick D units, a commander and their cells in my spawn zone.
export function DeployPage({ id }: { id: string }) {
  const day = useArena();
  const defense = arena.opponent(id);
  const record = day.attacks[id];
  const reveal = useMemo(() => (record.status === 'revealed' ? arena.reveal(id) : null), [record, id]);
  const map = defense ? ARENA_MAPS[defense.map] : null;
  const allowed = MY_ROSTER.filter(u => !reveal?.barred.includes(u.character));
  const need = map ? Math.min(map.deploy, allowed.length) : 0;
  const [picks, setPicks] = useState<AttackPlan['picks']>(() => (map
    ? allowed.slice(0, need).map((u, i) => ({ character: u.character, pos: map.attackerZone[i] }))
    : []));
  const [commander, setCommander] = useState<CharacterId | null>(() => picks[0]?.character ?? null);
  const [selected, setSelected] = useState<CharacterId | null>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const [fitRef, cell] = useFitCell(map?.rows[0].length ?? 16, [48, 32]);

  useEffect(() => {
    if (!defense) go(links.arena);
    else if (record.status === 'new') go(links.ban(id));
    else if (record.status !== 'revealed') go(links.battle(id));
  }, [defense, record, id]);

  // Keyboard placement: arrow keys move the selected unit to the next zone cell (swapping places).
  const moveRef = useRef<(dx: number, dy: number) => void>(() => {});
  useEffect(() => {
    const steps: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const onKey = (e: KeyboardEvent) => {
      if (!steps[e.key] || (e.target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName))) return;
      e.preventDefault();
      moveRef.current(...steps[e.key]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (!defense || !map || !reveal) return null;

  const placed = (c: CharacterId) => picks.find(p => p.character === c);
  const freeCell = (taken: AttackPlan['picks']) => map.attackerZone.find(z => !taken.some(p => same(p.pos, z)));
  const togglePick = (c: CharacterId) => {
    if (placed(c)) {
      setPicks(picks.filter(p => p.character !== c));
      if (commander === c) setCommander(null);
      if (selected === c) setSelected(null);
    } else if (picks.length < need) {
      setPicks([...picks, { character: c, pos: freeCell(picks)! }]);
      setSelected(c);
    }
  };
  // Clicking a zone cell moves the selected unit there, swapping with whoever stands on it.
  const onCell = (at: Point) => {
    const mineAt = picks.find(p => same(p.pos, at));
    if (!map.attackerZone.some(z => same(z, at))) return;
    if (!selected || !placed(selected)) {
      if (mineAt) setSelected(mineAt.character);
      return;
    }
    const from = placed(selected)!.pos;
    setPicks(picks.map(p => (p.character === selected ? { ...p, pos: at } : mineAt && p.character === mineAt.character ? { ...p, pos: from } : p)));
  };

  moveRef.current = (dx, dy) => {
    const from = selected && placed(selected)?.pos;
    if (from) onCell([from[0] + dx, from[1] + dy]);
  };

  const plan: AttackPlan | null = commander ? { picks, commander } : null;
  const throne = map.goal === 'seize' ? throneOf(map) : null;
  const errors = plan ? validateAttack(defense, reveal, MY_ROSTER, plan) : ['请指定主将'];
  const enemyAt = (at: Point) => reveal.fielded.find(s => same(s.pos, at));
  const hovered = hover && (enemyAt(hover)?.unit ?? MY_ROSTER.find(u => same(placed(u.character)?.pos ?? [-1, -1], hover)));
  const units: PreviewUnit[] = [
    ...reveal.fielded.map(s => ({
      key: `d-${s.unit.character}`, side: 'enemy' as const, pos: s.pos, boss: s.unit.character === reveal.commander,
      sprite: spriteFor({ classId: s.unit.classId, side: 'enemy' }),
    })),
    ...picks.map(p => ({
      key: p.character, side: 'player' as const, pos: p.pos, lead: p.character === commander, selected: p.character === selected,
      sprite: spriteFor({ classId: MY_ROSTER.find(u => u.character === p.character)!.classId, side: 'player' }),
    })),
  ];

  return (
    <Shell current="arena">
      <div className="headrow">
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>
          进攻 {attackIndex(id)} / {OPPONENTS.length} · {defense.legion} <span className="tag tag-grey" style={{ verticalAlign: 'middle' }}>{map.name} · 出战 {map.deploy} · {map.turnLimit} 回合 · {map.goalText}</span>
        </h1>
        <SnapshotTag text="开战时锁定双方阵容 · 之后的养成变化不影响本场" />
      </div>
      <Flow current={3} />
      <div className="arena-cols">
        <section className="panel" aria-labelledby="map-h" style={{ flex: '999 1 600px', minWidth: 0 }}>
          <div className="ph">
            <h2 id="map-h">{map.name} · 防守阵容已揭晓</h2>
            <span className="flex flex-wrap gap-1.5"><span className="tag tag-red">◆ 防守方 {reveal.fielded.length} 人</span><span className="tag tag-grey">对手 AI 行为：不公开</span></span>
          </div>
          <div className="mapscroll" ref={fitRef}>
            <MapPreview map={map} cell={cell} mine={map.attackerZone} units={units} cursor={selected ? placed(selected)?.pos : null}
              onCell={onCell} onHover={setHover}
              label={`${map.name}：右侧为对方 ${reveal.fielded.length} 名防守单位，主将${name(reveal.commander)}；左侧蓝色为我方部署区。${throne ? `王座在 (${throne[0]},${throne[1]})，金色虚线框。` : ''}`} />
          </div>
          <div className="deploy-help">
            {hovered
              ? <UnitLine unit={hovered} side={enemyAt(hover!) ? 'enemy' : 'player'} />
              : <span>在名单中选择出战人员；点名字选中后，点蓝色格子或按方向键调整站位，遇到己方单位会交换位置。鼠标停在单位上可查看属性。</span>}
            <span>
              <b style={{ color: '#34556B' }}>★</b> 我方主将 · <b style={{ color: '#A84940' }}>旗帜</b> 敌方主将 {name(reveal.commander)}
              {throne && <> · <b style={{ color: '#6E5322' }}>金框</b> 王座</>}
            </span>
          </div>
        </section>

        <div className="flex flex-col gap-3" style={{ flex: '1 1 400px', minWidth: 0 }}>
          <section className="panel" aria-labelledby="bans-h">
            <div className="ph"><h2 id="bans-h">禁用结果</h2></div>
            <div className="flex flex-col gap-2" style={{ padding: '10px 14px', fontSize: 13 }}>
              <div><span className="tag tag-red">你禁用了</span> {record.bans.map(name).join('、')}（对方）</div>
              <div>
                <span className="tag tag-red">对方禁用了</span>{' '}
                {reveal.barred.length > 0
                  ? <><b>{reveal.barred.map(name).join('、')}</b>（防守方预设）—— 本场不能出战</>
                  : '没有禁用你的角色'}
              </div>
            </div>
          </section>

          <section className="panel" aria-labelledby="pick-h">
            <div className="ph">
              <h2 id="pick-h">出战编成 <span className="num" style={{ fontWeight: 500, color: '#6A6256' }}>{picks.length} / {need}</span></h2>
              <span style={{ fontSize: 12, color: '#6A6256' }}>全员满 HP 参赛</span>
            </div>
            <ul>
              {MY_ROSTER.map(u => {
                const barred = reveal.barred.includes(u.character);
                const spot = placed(u.character);
                const looks = { classId: u.classId, side: 'player' as const, character: u.character };
                return (
                  <li key={u.character} className={`urow${barred ? ' ban' : spot ? '' : ' off'}${selected === u.character ? ' sel' : ''}`}>
                    <span className="pf ally" style={{ width: 34, height: 34 }}><img className="px" src={portraitFor(looks) ?? spriteFor(looks)} width={32} height={32} alt="" /></span>
                    <button type="button" className="who" disabled={!spot} onClick={() => setSelected(u.character)} aria-label={`调整 ${name(u.character)} 的站位`}>
                      <span className="nm">{name(u.character)}</span>
                      <span className="cl">{CLASSES[u.classId].name} · Lv {u.level}</span>
                    </button>
                    <span style={{ fontSize: 12, color: '#4E473D', textAlign: 'center' }}>{barred ? '被禁用' : spot ? `(${spot.pos[0]},${spot.pos[1]})` : '待命'}</span>
                    <button type="button" className="pick" aria-pressed={!!spot} disabled={barred || (!spot && picks.length >= need)} onClick={() => togglePick(u.character)}>
                      {spot ? '出战' : '待命'}
                    </button>
                    <button type="button" className="star" aria-pressed={commander === u.character} disabled={!spot}
                      onClick={() => setCommander(u.character)} aria-label={`设为主将：${name(u.character)}`}>★</button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="panel ready" aria-label="开始战斗">
            <div style={{ fontSize: 13, color: '#4E473D' }}>
              已放置 {picks.length} / {need} · 主将：<b>{commander ? name(commander) : '未指定'}</b> · 我方先手
            </div>
            {throne && <div style={{ fontSize: 13, color: '#4E473D' }}>王城：只有我方主将能压制王座，全歼守军不算胜利；主将被击败即落败。</div>}
            {errors.length > 0 && <div role="status" style={{ fontSize: 13, color: '#93392F' }}>{errors[0]}</div>}
            <button type="button" className="btn btn-primary btn-lg" disabled={errors.length > 0}
              onClick={() => { if (plan) void arena.start(id, plan).then(() => go(links.battle(id))); }}>
              开始战斗
            </button>
            <div style={{ fontSize: 12, color: '#6A6256' }}>开始后不能再更换出战人员；进攻中可随时投降，按落败计。</div>
          </section>
        </div>
      </div>
    </Shell>
  );
}
