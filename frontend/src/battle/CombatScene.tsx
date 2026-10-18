import { Fragment, useEffect, useRef, useState } from 'react';
import { WEAPONS } from '@common/data/weapons.ts';
import { classOf, forecast, forecastOnHit } from '@common/engine/index.ts';
import type { UnitState } from '@common/engine/index.ts';
import { fighterFor, SPARK, spriteFor, STAGE } from '../assets.ts';
import { SkipIcon } from '../ui/icons.tsx';
import type { CombatShow } from './controller.ts';
import { displayName } from './names.ts';
import { Portrait, SideTag } from './UnitCard.tsx';

const STRIKE_MS = 900;

// Side-view exchange (交战演出 artboard): enemy on the left, ally on the right, one strike at a time.
// Skippable with the button, Space, Enter or Esc; the map is paused meanwhile.
export function CombatScene({ show }: { show: CombatShow }) {
  const { event, before } = show;
  const find = (id: string) => before.units.find(u => u.id === id)!;
  const attacker = find(event.attacker), defender = find(event.defender);
  const ally = attacker.side === 'player' ? attacker : defender;
  const enemy = ally === attacker ? defender : attacker;
  const f = event.forecast ?? forecast(before, attacker.id, attacker.pos, event.weapons[0], defender.id);
  const onHit = forecastOnHit(f);
  const [shown, setShown] = useState(0);
  const [lunge, setLunge] = useState<string | null>(null);
  const [hp, setHp] = useState<Record<string, number>>({ [attacker.id]: attacker.hp, [defender.id]: defender.hp });
  const doneRef = useRef(show.done);

  // Each strike: wind up (lunge), land (HP and number update), pull back before the next one.
  useEffect(() => {
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    if (shown > 0) at(260, () => setLunge(null));
    if (shown >= event.strikes.length) {
      at(STRIKE_MS, () => doneRef.current());
    } else {
      const s = event.strikes[shown];
      const start = shown === 0 ? 350 : STRIKE_MS - 300;
      at(start, () => setLunge(s.by));
      at(start + 160, () => {
        setHp(prev => ({ ...prev, [s.target]: s.hpAfter, ...(s.byHpAfter !== undefined ? { [s.by]: s.byHpAfter } : {}) }));
        setShown(n => n + 1);
      });
    }
    return () => timers.forEach(t => clearTimeout(t));
  }, [shown, event.strikes]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        doneRef.current();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, []);

  const last = shown > 0 ? event.strikes[shown - 1] : null;
  const strikerSide = last ? (find(last.by).side === 'player' ? 'ally' : 'enemy') : null;
  const weaponOf = (u: UnitState) => (u.id === attacker.id ? event.weapons[0] : event.weapons[1]);
  const sideSpec = (u: UnitState) => (u.id === attacker.id ? f.attacker : f.defender);

  const fighter = (u: UnitState, left: boolean) => {
    const own = fighterFor(u);
    const lunging = lunge === u.id;
    const hurt = last && last.target === u.id && last.hit;
    const cls = `px fighter${lunging ? (left ? ' lunge-r' : ' lunge-l') : ''}${hurt ? ' hurt' : ''}`;
    // Map sprites face right for allies and left for enemies; flip them so both sides face each other.
    return own
      ? <img className={cls} src={own} width={176} height={176} alt="" style={{ left: left ? 150 : 474 }} />
      : <img className={`${cls} flip`} src={spriteFor(u)} width={128} height={128} alt="" style={{ left: left ? 190 : 482 }} />;
  };

  const card = (u: UnitState) => {
    const side = u.side === 'player' ? 'ally' : 'enemy';
    const spec = sideSpec(u);
    const w = weaponOf(u);
    const damages = onHit.filter(s => s.side === (u.id === attacker.id ? 'attacker' : 'defender'));
    return (
      <div className={`hpcard ${side}`}>
        <div className="hp-top">
          <Portrait unit={u} size={32} flip={u.side === 'enemy'} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{u.name} <SideTag unit={u} /></div>
            <div style={{ fontSize: 13, color: '#6A6256' }}>{w ? WEAPONS[w].name : '无法反击'} · Lv {u.level}</div>
          </div>
          <div className="hp-num" aria-label={`HP ${hp[u.id]} / ${u.stats.hp}`}>{hp[u.id]}<small>/ {u.stats.hp}</small></div>
        </div>
        <div className="ticks" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${u.stats.hp}, minmax(0, 1fr))` }}>
          {Array.from({ length: u.stats.hp }, (_, i) => (
            <i key={i} style={{ background: i < hp[u.id] ? (side === 'ally' ? '#4A7FA6' : '#B8574A') : undefined }} />
          ))}
        </div>
        <div className="mini">
          <span>伤害 <b>{w ? damages.map(s => s.damage === s.maxDamage ? s.damage : `${s.damage}–${s.maxDamage}`).join(' + ') || '—' : '—'}</b></span>
          <span>命中 <b>{w ? `${spec.hit}%` : '—'}</b></span>
          <span>必杀 <b>{w ? `${spec.crit}%` : '—'}</b></span>
        </div>
      </div>
    );
  };

  const verb = (byAttacker: boolean, followUp: boolean) => (followUp ? '追击' : byAttacker ? '攻击' : '反击');

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="c-title">
      <section className="combat">
        <div className="c-head">
          <h1 id="c-title" style={{ fontSize: 16, fontWeight: 700 }}>交战 · {displayName(before, attacker.id)} 攻击 {displayName(before, defender.id)}</h1>
          <span className="tag tag-grey">{f.attacker.terrain.name} → {f.defender.terrain.name}</span>
          <span className="ml-auto" style={{ fontSize: 13, color: '#6A6256' }}>
            第 <b style={{ color: '#302D28' }}>{Math.max(1, shown)}</b> 击 / 共 {event.strikes.length} 击
          </span>
          <button type="button" className="btn btn-sm" onClick={() => doneRef.current()}>
            跳过演出 <SkipIcon /><span className="kbd">SPACE</span>
          </button>
        </div>
        <div className="scene-wrap">
          <div className="scene" role="img"
            aria-label={last ? `${find(last.by).name}${last.hit ? `命中，造成 ${last.damage} 点伤害${last.crit ? '（必杀）' : ''}` : '未命中'}` : '双方就位'}>
            <img className="px" src={STAGE} width={800} height={288} alt="" style={{ position: 'absolute', left: 0, top: 0 }} />
            <span className="side-tag" style={{ left: 10, background: '#A84940' }}>◆ 敌方 · {sideSpec(enemy).terrain.name}</span>
            <span className="side-tag" style={{ right: 10, background: '#34556B' }}>● 己方 · {sideSpec(ally).terrain.name}</span>
            {fighter(enemy, true)}
            {fighter(ally, false)}
            {last && last.hit && (
              <img key={`spark-${shown}`} className="px spark" src={SPARK} width={76} height={76} alt=""
                style={{ left: strikerSide === 'ally' ? 250 : 470, top: 140 }} />
            )}
            {last && (
              <Fragment key={`hit-${shown}`}>
                <span className={`dmg${last.crit ? ' crit' : ''}`} style={{ left: strikerSide === 'ally' ? 210 : 520 }}>
                  {last.hit ? last.damage : 'MISS'}
                </span>
                <span className="dmg-label" style={{ left: strikerSide === 'ally' ? 214 : 524 }}>
                  {!last.hit ? '未命中' : last.backlash ? '反噬！伤害落在自己身上' : `${last.proc ? '战技触发 · ' : ''}${last.crit ? '必杀！' : '命中'}`}
                </span>
              </Fragment>
            )}
          </div>
        </div>
        <div className="hpwrap">{card(enemy)}{card(ally)}</div>
        <ol className="seq" aria-label="出手顺序">
          {event.strikes.map((s, i) => {
            const by = find(s.by);
            const result = !s ? '' : !s.hit ? '未命中' : s.backlash ? `反噬，自己承受 ${s.damage} 伤害` : s.crit ? `必杀，${s.damage} 伤害` : `命中，${s.damage} 伤害`;
            return (
              <li key={i} className={i < shown ? 'done' : 'next'}>
                <b className="n">{i + 1}</b>
                <span><b>{by.name} {verb(s.by === attacker.id, false)}</b>{i < shown ? ` —— ${result}` : <span className="muted"> · 命中 {sideSpec(by).hit}%</span>}</span>
              </li>
            );
          })}
        </ol>
        <div className="c-foot">
          <span style={{ fontSize: 13, color: '#6A6256' }}>演出结束后回到战术地图，结果写入战况记录。{classOf(ally).moveType === 'flying' ? '飞行单位不受地形加成。' : ''}</span>
          <span style={{ fontSize: 13, color: '#4E473D' }}>可在地图下方关闭交战演出</span>
        </div>
      </section>
    </div>
  );
}
