import { useEffect, useRef, useState } from 'react';
import { ARENA_MAPS, throneOf } from '@common/arena/maps.ts';
import type { ArenaMapId } from '@common/arena/maps.ts';
import { validateAttack } from '@common/arena/rules.ts';
import type { AttackPlan, Defense, SnapshotUnit } from '@common/arena/rules.ts';
import type { CharacterId } from '@common/data/characters.ts';
import { CLASSES } from '@common/data/classes.ts';
import type { ClassId } from '@common/data/classes.ts';
import { WEAPONS } from '@common/data/weapons.ts';
import type { WeaponId } from '@common/data/weapons.ts';
import type { Point } from '@common/engine/index.ts';
import { portraitFor, spriteFor } from '../assets.ts';
import { session, useSession } from '../api/session.ts';
import type { ArenaReveal, OpponentUnit } from '../api/session.ts';
import { useServerData } from '../api/useServerData.ts';
import { go, links } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { toast } from '../ui/toast.tsx';
import { Flow, MapPreview, SnapshotTag, attackIndex, useFitCell } from './ArenaParts.tsx';
import type { PreviewUnit } from './ArenaParts.tsx';
import { arena, useArena } from './store.ts';

const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];
interface Placement { unitId: string; character: CharacterId; pos: Point }

function UnitLine({ unit, side }: { unit: UnitInfo; side: 'player' | 'enemy' }) {
  const s = unit.stats;
  return (
    <span>
      <b>{side === 'enemy' ? '◆ ' : '● '}{unit.name}</b> {CLASSES[unit.classId as ClassId]?.name ?? unit.classId} Lv {unit.level} ·
      HP {s.hp} 力 {s.str} 魔 {s.mag} 技 {s.skl} 速 {s.spd} 运 {s.lck} 防 {s.def} 魔防 {s.res} ·
      {' '}{unit.weapons.map(w => WEAPONS[w as WeaponId]?.name ?? w).join(' ')}
    </span>
  );
}
type UnitInfo = Pick<SnapshotUnit, 'classId' | 'level' | 'stats'> & { name: string; weapons: string[] };

// Steps 3–4 (docs/05): see who actually defends and where (AI stays hidden), learn which of my units
// are barred, then pick D units, a commander and their cells in my spawn zone.
export function DeployPage({ id }: { id: string }) {
  const day = useArena();
  const { state } = useSession();
  const opponent = arena.opponent(id);
  const record = day.attacks[id] ?? arena.record(id);
  const [reveal, setReveal] = useState<ArenaReveal | null>(() => arena.cachedReveal(id));
  const { data: detail } = useServerData(() => session.opponent(id), [id]);
  const map = opponent ? ARENA_MAPS[opponent.map as ArenaMapId] : null;
  const [picks, setPicks] = useState<Placement[] | null>(null);
  const [commander, setCommander] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const [busy, setBusy] = useState(false);
  const [fitRef, cell] = useFitCell(map?.rows[0].length ?? 16, [48, 32]);

  useEffect(() => {
    if (!opponent) go(links.arena);
    else if (record.status === 'new') go(links.ban(id));
    else if (record.status !== 'revealed') go(links.battle(id));
  }, [opponent, record.status, id]);
  useEffect(() => {
    if (!reveal && record.status === 'revealed') void arena.reveal(id).then(setReveal, e => toast(`读不到揭晓结果：${e instanceof Error ? e.message : String(e)}`));
  }, [id, record.status, reveal]);

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
  if (!opponent || !map || !state) return null;
  if (!reveal) return <Shell current="arena"><p style={{ color: '#4E473D' }}>正在读取揭晓的阵容…</p></Shell>;

  // 派遣中的角色不能出战（服务端 activeSnapshot）。被对方预设禁用的按实例或角色匹配。
  const roster = state.units.filter(u => u.status === 'active' && !u.lockedDispatchId);
  const barred = (u: { id: string; character: string }) => reveal.barred.includes(u.id) || reveal.barred.includes(u.character);
  const allowed = roster.filter(u => !barred(u));
  const need = Math.min(map.deploy, allowed.length);
  const current = picks ?? allowed.slice(0, need).map((u, i) => ({ unitId: u.id, character: u.character, pos: map.attackerZone[i] }));
  const lead = commander && current.some(p => p.unitId === commander) ? commander : current[0]?.unitId ?? null;
  const placed = (unitId: string) => current.find(p => p.unitId === unitId);
  const freeCell = (taken: Placement[]) => map.attackerZone.find(z => !taken.some(p => same(p.pos, z)));
  // 竞技场按角色校验出战（同一形象只能上一人）。
  const clash = (unitId: string, character: string) => current.some(p => p.character === character && p.unitId !== unitId);
  const togglePick = (unitId: string) => {
    const unit = roster.find(u => u.id === unitId)!;
    if (placed(unitId)) {
      setPicks(current.filter(p => p.unitId !== unitId));
      if (selected === unitId) setSelected(null);
    } else if (current.length < need && !clash(unitId, unit.character)) {
      setPicks([...current, { unitId, character: unit.character, pos: freeCell(current)! }]);
      setSelected(unitId);
    }
  };
  const onCell = (at: Point) => {
    const mineAt = current.find(p => same(p.pos, at));
    if (!map.attackerZone.some(z => same(z, at))) return;
    if (!selected || !placed(selected)) {
      if (mineAt) setSelected(mineAt.unitId);
      return;
    }
    const from = placed(selected)!.pos;
    setPicks(current.map(p => (p.unitId === selected ? { ...p, pos: at } : mineAt && p.unitId === mineAt.unitId ? { ...p, pos: from } : p)));
  };
  moveRef.current = (dx, dy) => {
    const from = selected && placed(selected)?.pos;
    if (from) onCell([from[0] + dx, from[1] + dy]);
  };

  const leadCharacter = current.find(p => p.unitId === lead)?.character ?? null;
  const plan: AttackPlan | null = leadCharacter ? { picks: current.map(p => ({ character: p.character, unitId: p.unitId, pos: p.pos })), commander: leadCharacter } : null;
  const throne = map.goal === 'seize' ? throneOf(map) : null;
  // validateAttack only reads the map from the defense; the fielded units come from the server reveal.
  const shell: Defense = { id: opponent.id, legion: opponent.legion, points: opponent.points, record: opponent.record, map: opponent.map as ArenaMapId, slots: [], commanders: [], bans: [] };
  const errors = plan ? validateAttack(shell, { fielded: [], commander: reveal.commander, barred: reveal.barred }, roster.map(u => u.snapshot), plan) : ['请指定主将'];
  const enemyInfo = (character: string): OpponentUnit | undefined => detail?.list.find(u => u.character === character);
  const enemyAt = (at: Point) => reveal.fielded.find(s => same(s.pos, at));
  const hoverEnemy = hover ? enemyAt(hover) : undefined;
  const hoverMine = hover ? current.find(p => same(p.pos, hover)) : undefined;
  const hovered: UnitInfo | null = hoverEnemy && enemyInfo(hoverEnemy.character)
    ? { ...enemyInfo(hoverEnemy.character)!, classId: enemyInfo(hoverEnemy.character)!.classId as ClassId }
    : hoverMine ? (() => { const u = roster.find(x => x.id === hoverMine.unitId)!; return { name: u.name, classId: u.classId as ClassId, level: u.level, stats: u.snapshot.stats, weapons: u.snapshot.weapons }; })() : null;
  const units: PreviewUnit[] = [
    ...reveal.fielded.map(s => ({
      key: `d-${s.character}`, side: 'enemy' as const, pos: s.pos, boss: s.character === reveal.commander,
      sprite: spriteFor({ classId: (enemyInfo(s.character)?.classId ?? 'fighter') as ClassId, side: 'enemy' }),
    })),
    ...current.map(p => ({
      key: p.unitId, side: 'player' as const, pos: p.pos, lead: p.unitId === lead, selected: p.unitId === selected,
      sprite: spriteFor({ classId: roster.find(u => u.id === p.unitId)!.classId as ClassId, side: 'player' }),
    })),
  ];
  const commanderName = reveal.fielded.find(s => s.character === reveal.commander)?.name ?? reveal.commander;
  const start = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      await arena.start(id, current.map(p => ({ character: p.character, unitId: p.unitId, pos: [p.pos[0], p.pos[1]] })), plan.commander);
      go(links.battle(id));
    } catch (e) { toast(`开战失败：${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(false); }
  };

  return (
    <Shell current="arena">
      <div className="headrow">
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>
          进攻 {attackIndex(id)} / {arena.opponents().length} · {opponent.legion} <span className="tag tag-grey" style={{ verticalAlign: 'middle' }}>{map.name} · 出战 {map.deploy} · {map.turnLimit} 回合 · {map.goalText}</span>
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
              label={`${map.name}：右侧为对方 ${reveal.fielded.length} 名防守单位，主将${commanderName}；左侧蓝色为我方部署区。${throne ? `王座在 (${throne[0]},${throne[1]})，金色虚线框。` : ''}`} />
          </div>
          <div className="deploy-help">
            {hovered
              ? <UnitLine unit={hovered} side={hoverEnemy ? 'enemy' : 'player'} />
              : <span>在名单中选择出战人员；点名字选中后，点蓝色格子或按方向键调整站位，遇到己方单位会交换位置。鼠标停在单位上可查看属性。</span>}
            <span>
              <b style={{ color: '#34556B' }}>★</b> 我方主将 · <b style={{ color: '#A84940' }}>旗帜</b> 敌方主将 {commanderName}
              {throne && <> · <b style={{ color: '#6E5322' }}>金框</b> 王座</>}
            </span>
          </div>
        </section>

        <div className="flex flex-col gap-3" style={{ flex: '1 1 400px', minWidth: 0 }}>
          <section className="panel" aria-labelledby="bans-h">
            <div className="ph"><h2 id="bans-h">禁用结果</h2></div>
            <div className="flex flex-col gap-2" style={{ padding: '10px 14px', fontSize: 13 }}>
              <div><span className="tag tag-red">你禁用了</span> {record.bans.map(c => detail?.list.find(u => u.character === c)?.name ?? c).join('、') || '无'}（对方）</div>
              <div>
                <span className="tag tag-red">对方禁用了</span>{' '}
                {reveal.barred.length > 0
                  ? <><b>{roster.filter(barred).map(u => u.name).join('、') || reveal.barred.join('、')}</b>（防守方预设）—— 本场不能出战</>
                  : '没有禁用你的角色'}
              </div>
            </div>
          </section>

          <section className="panel" aria-labelledby="pick-h">
            <div className="ph">
              <h2 id="pick-h">出战编成 <span className="num" style={{ fontWeight: 500, color: '#6A6256' }}>{current.length} / {need}</span></h2>
              <span style={{ fontSize: 12, color: '#6A6256' }}>全员满 HP 参赛</span>
            </div>
            <ul>
              {roster.map(u => {
                const ban = barred(u);
                const spot = placed(u.id);
                const dupe = !spot && clash(u.id, u.character);
                const looks = { classId: u.classId as ClassId, side: 'player' as const, character: u.character, portrait: u.portrait ?? undefined };
                return (
                  <li key={u.id} className={`urow${ban ? ' ban' : spot ? '' : ' off'}${selected === u.id ? ' sel' : ''}`}>
                    <span className="pf ally" style={{ width: 34, height: 34 }}><img className="px" src={portraitFor(looks) ?? spriteFor(looks)} width={32} height={32} alt="" /></span>
                    <button type="button" className="who" disabled={!spot} onClick={() => setSelected(u.id)} aria-label={`调整 ${u.name} 的站位`}>
                      <span className="nm">{u.name}</span>
                      <span className="cl">{u.className} · Lv {u.level}</span>
                    </button>
                    <span style={{ fontSize: 12, color: '#4E473D', textAlign: 'center' }}>{ban ? '被禁用' : dupe ? '同形象已上场' : spot ? `(${spot.pos[0]},${spot.pos[1]})` : '待命'}</span>
                    <button type="button" className="pick" aria-pressed={!!spot} disabled={ban || dupe || (!spot && current.length >= need)} onClick={() => togglePick(u.id)}>
                      {spot ? '出战' : '待命'}
                    </button>
                    <button type="button" className="star" aria-pressed={lead === u.id} disabled={!spot}
                      onClick={() => setCommander(u.id)} aria-label={`设为主将：${u.name}`}>★</button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="panel ready" aria-label="开始战斗">
            <div style={{ fontSize: 13, color: '#4E473D' }}>
              已放置 {current.length} / {need} · 主将：<b>{roster.find(u => u.id === lead)?.name ?? '未指定'}</b> · 我方先手 · 入场推进 1 日
            </div>
            {throne && <div style={{ fontSize: 13, color: '#4E473D' }}>王城：只有我方主将能压制王座，全歼守军不算胜利；主将被击败即落败。</div>}
            {errors.length > 0 && <div role="status" style={{ fontSize: 13, color: '#93392F' }}>{errors[0]}</div>}
            <button type="button" className="btn btn-primary btn-lg" disabled={errors.length > 0 || busy} onClick={() => void start()}>
              {busy ? '入场中…' : '开始战斗 · 推进 1 日'}
            </button>
            <div style={{ fontSize: 12, color: '#6A6256' }}>开始后不能再更换出战人员；竞技场是模拟战，没有真实伤亡；进攻中可随时投降，按落败计。</div>
          </section>
        </div>
      </div>
    </Shell>
  );
}
