import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { WEAPONS } from '@common/data/weapons.ts';
import type { WeaponType } from '@common/data/types.ts';
import { classOf, equipped, forecast, forecastOnHit } from '@common/engine/index.ts';
import type { UnitState } from '@common/engine/index.ts';
import { battleSheetUrl, battleSpriteFor, SPARK, spriteFor, STAGE, weaponIcon } from '../assets.ts';
import { SkipIcon } from '../ui/icons.tsx';
import { combatAt, combatTimeline, criticalHit, idleSheetFrame, impactTarget, loopFrame } from './combat-motion.ts';
import { battleSheetSpec } from './battle-sheets.ts';
import type { CombatShow } from './controller.ts';
import { weaponLabel } from './commands.ts';
import { displayName } from './names.ts';
import { Portrait, SideTag } from './UnitCard.tsx';

// Side-view exchange (交战演出 artboard): enemy on the left, ally on the right, one strike at a time.
// Skippable with the button, Space, Enter or Esc; the map is paused meanwhile.
export function CombatScene({ show }: { show: CombatShow }) {
  const { event, before } = show;
  const find = (id: string) => before.units.find(u => u.id === id)!;
  const attacker = find(event.attacker), defender = find(event.defender);
  const ally = attacker.side === 'player' ? attacker : defender;
  const enemy = ally === attacker ? defender : attacker;
  const weaponOf = (u: UnitState) => (u.id === attacker.id ? event.weapons[0] : event.weapons[1]);
  const typeOf = (u: UnitState): WeaponType | null => {
    const held = weaponOf(u) ?? equipped(u);
    return held ? WEAPONS[held]?.type ?? 'tome' : null;
  };
  const distance = Math.abs(attacker.pos[0] - defender.pos[0]) + Math.abs(attacker.pos[1] - defender.pos[1]);
  const sheets = useMemo(() => Object.fromEntries([attacker, defender].map(u => [u.id, battleSheetSpec(u.classId, typeOf(u), weaponOf(u) ? distance : 1)])), [before, event]);
  const [loadedSheets, setLoadedSheets] = useState<{ event: typeof event; urls: Record<string, string> } | null>(null);
  const ready = !Object.values(sheets).some(Boolean) || loadedSheets?.event === event;
  const f = useMemo(() => event.forecast ?? forecast(before, attacker.id, attacker.pos, event.weapons[0], defender.id), [before, event]);
  const onHit = useMemo(() => forecastOnHit(f), [f]);
  const playableSheets = useMemo(() => Object.fromEntries(Object.entries(sheets).map(([id, sheet]) =>
    [id, loadedSheets?.event === event && !loadedSheets.urls[id] ? null : sheet])), [sheets, loadedSheets, event]);
  const timeline = useMemo(() => combatTimeline(event.strikes, playableSheets), [event.strikes, playableSheets]);
  const end = (timeline.at(-1)?.end ?? 0) + 350;
  const [elapsed, setMs] = useState(0);
  const playing = useRef(event);
  const ms = playing.current === event ? elapsed : 0;
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const finished = useRef(false);
  const doneRef = useRef(show.done);
  doneRef.current = show.done;
  const finish = () => { if (!finished.current) { finished.current = true; doneRef.current(); } };
  const { shown, active, pose, reaction, frame: attackFrame } = combatAt(timeline, ms);
  const hp: Record<string, number> = { [attacker.id]: attacker.hp, [defender.id]: defender.hp };
  for (const strike of event.strikes.slice(0, shown)) {
    hp[strike.target] = strike.hpAfter;
    if (strike.byHpAfter !== undefined) hp[strike.by] = strike.byHpAfter;
  }

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);

  useEffect(() => {
    playing.current = event;
    finished.current = false;
    setMs(0);
    let cancelled = false;
    Promise.all([attacker, defender].map(async u => {
      const sheet = sheets[u.id];
      // A missing image must never block returning to the tactical map.
      const url = sheet ? await battleSheetUrl(u, sheet).catch(() => '') : '';
      return [u.id, url] as const;
    })).then(entries => { if (!cancelled) setLoadedSheets({ event, urls: Object.fromEntries(entries) }); });
    return () => { cancelled = true; };
  }, [before, event, sheets]);

  useEffect(() => {
    if (!ready || finished.current) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      if (finished.current) return;
      const elapsed = Math.min(end, now - start);
      setMs(elapsed);
      if (elapsed < end) frame = requestAnimationFrame(tick);
      else finish();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [end, event, ready]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, []);

  const last = shown > 0 ? event.strikes[shown - 1] : null;
  const crit = !!last && criticalHit(last);
  const shake = !!reaction && crit;
  const spark = crit ? 114 : 76;
  const sheetUrl = (u: UnitState) => (loadedSheets?.event === event ? loadedSheets.urls[u.id] : '');
  // Sheets with their own arrow, spell, knife or breath attack from where they stand and replace the generic shot.
  const ownShot = (u: UnitState) => !!sheets[u.id]?.projectile && !!sheetUrl(u);
  // Converted animations dash and charge inside their own frames.
  const inPlace = (u: UnitState) => !!sheets[u.id]?.inPlace && !!sheetUrl(u);
  // Each side's ground point: converted FE fighters keep FE's closer spacing, which their dashes are drawn for.
  const markOf = (u: UnitState) => {
    const left = u.id === enemy.id, sheet = sheets[u.id];
    return sheet?.stand !== undefined && sheetUrl(u) ? 400 + (left ? -1 : 1) * sheet.stand * sheet.scale : left ? 238 : 562;
  };
  const impactMark = last ? markOf(find(impactTarget(last))) : 400;
  const ranged = (u: UnitState) => distance > 1 || ['bow', 'tome', 'staff', 'dragon'].includes(typeOf(u) ?? '') || ownShot(u);
  const sideSpec = (u: UnitState) => (u.id === attacker.id ? f.attacker : f.defender);
  const shooting = active && ms >= active.release && ms < active.impact && ranged(find(active.strike.by)) && !ownShot(find(active.strike.by)) && !reduced;
  // Leave room below the standing foot for a thrown weapon, trail or critical pose.
  const ground = Math.max(42, ...Object.values(playableSheets).map(sheet => sheet?.reacts ? (sheet.frameSize[1] - sheet.origin[1]) * sheet.scale : 0));

  const fighter = (u: UnitState, left: boolean) => {
    const acting = active?.strike.by === u.id;
    const reacting = reaction?.id === u.id;
    const currentPose = reduced ? 'idle' : reacting ? reaction.pose : acting ? pose : 'idle';
    const toward = left ? 'r' : 'l';
    const motion = !reduced && acting && !reacting && !inPlace(u) && pose === 'windup' && criticalHit(active.strike) ? ` charge-${toward}`
      : !reduced && acting && !reacting && !inPlace(u) && pose === 'strike' && !ranged(u) ? ` lunge-${toward}${criticalHit(active.strike) ? ' dash' : ''}` : '';
    const cls = `px fighter${motion}${reacting && reaction.pose === 'hurt' ? ' hurt' : ''}`;
    const sheet = sheets[u.id], url = sheetUrl(u);
    if (sheet && url && (!reacting || reduced || sheet.reacts)) {
      const clip = acting ? active.clip : null;
      const frame = reduced ? sheet.idle.frames[0]
        : clip && attackFrame !== null ? clip.frames[attackFrame]
        : reacting && reaction.pose === 'dodge' && sheet.dodge ? loopFrame(sheet.dodge, ms - active!.impact, false)
        : idleSheetFrame(sheet, ms);
      const [w, h] = sheet.frameSize, [ox, oy] = sheet.origin, scale = sheet.scale, cols = sheet.columns;
      // The ground point stands on its side's mark; a flipped cell mirrors around its centre.
      const mark = markOf(u);
      return <div className={`${cls}${left ? '' : ' flip'}`} aria-hidden="true" data-unit={u.id} data-pose={currentPose} data-sheet={sheet.id} data-frame={frame}
        style={{ width: w * scale, height: h * scale, left: left ? mark - ox * scale : mark - (w - ox) * scale, bottom: ground - (h - oy) * scale,
          backgroundImage: `url(${url})`, backgroundRepeat: 'no-repeat',
          backgroundSize: `${cols * w * scale}px ${Math.ceil(sheet.frames / cols) * h * scale}px`,
          backgroundPosition: `${-(frame % cols) * w * scale}px ${-Math.floor(frame / cols) * h * scale}px`,
          transitionDuration: acting && pose === 'strike' ? `${active.impact - active.release}ms` : undefined }} />;
    }
    const own = battleSpriteFor(u, typeOf(u), currentPose, !reduced && currentPose === 'idle' ? Math.floor(ms / 300) % 2 : 0);
    return own
      ? <img className={`${cls}${left ? '' : ' flip'}`} src={own} width={192} height={192} alt="" data-unit={u.id} data-pose={currentPose} style={{ left: left ? 142 : 466, bottom: ground }} />
      : <img className={`${cls} flip`} src={spriteFor(u)} width={128} height={128} alt="" data-unit={u.id} data-pose={currentPose} style={{ left: left ? 190 : 482, bottom: ground }} />;
  };

  const projectile = () => {
    if (!shooting || !active) return null;
    const by = find(active.strike.by), type = typeOf(by)!;
    const right = by.id === enemy.id;
    const width = ['bow', 'tome', 'staff', 'dragon'].includes(type) ? 64 : 40;
    // From just in front of the shooter to just in front of the target.
    const from = markOf(by) + (right ? 44 : -44), to = markOf(right ? ally : enemy) + (right ? -40 : 40);
    return <span key={`shot-${active.windup}`} className="combat-projectile" style={{ left: right ? from - width : from, '--travel': `${to - from}px`, animationDuration: `${active.impact - active.release}ms` } as CSSProperties}>
      {type === 'bow' ? <svg className={right ? '' : 'flip'} width="64" height="24" viewBox="0 0 32 12" shapeRendering="crispEdges" aria-hidden="true">
        <path fill="#E7C266" d="M1 5h25v2H1z" /><path fill="#E4E8E6" d="M23 1h3v2h3v2h3v2h-3v2h-3v2h-3z" /><path fill="#F0EADF" d="M1 2h5v3H1zm0 5h5v3H1z" />
      </svg> : ['tome', 'staff', 'dragon'].includes(type) ? <svg className={right ? '' : 'flip'} width="64" height="40" viewBox="0 0 32 20" shapeRendering="crispEdges" aria-hidden="true">
        <path fill={type === 'dragon' ? '#D85830' : '#7C9CE0'} d="M0 4h12V1h12v3h5v3h3v6h-3v3h-5v3H12v-3H4v-4H0z" />
        <path fill={type === 'dragon' ? '#F8C858' : '#C8F0F8'} d="M10 6h8V4h7v3h4v6h-4v3h-7v-2h-8z" /><path fill="#FFF8DA" d="M20 7h6v6h-6z" />
      </svg> : <img className={`px${right ? '' : ' flip'}`} src={weaponIcon(type)} width={40} height={40} alt="" />}
    </span>;
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
            <div style={{ fontSize: 13, color: '#6A6256' }}>{w ? weaponLabel(w) : '无法反击'} · Lv {u.level}</div>
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
          <button type="button" className="btn btn-sm" onClick={finish}>
            跳过演出 <SkipIcon /><span className="kbd">SPACE</span>
          </button>
        </div>
        <div className="scene-wrap">
          <div className="scene" role="img" style={{ height: 384 + ground - 42 }}
            aria-label={last ? `${find(last.by).name}${last.backlash ? `反噬，自己承受 ${last.damage} 点伤害` : last.hit ? `命中，造成 ${last.damage} 点伤害${last.crit ? '（必杀）' : ''}` : '未命中'}` : '双方就位'}>
            <div className={`camera${shake ? ' shake' : ''}`}>
              <img className="px" src={STAGE} width={800} height={384} alt="" style={{ position: 'absolute', left: 0, top: 0 }} />
              <span className="side-tag" style={{ left: 10, background: '#A84940' }}>◆ 敌方 · {sideSpec(enemy).terrain.name}</span>
              <span className="side-tag" style={{ right: 10, background: '#34556B' }}>● 己方 · {sideSpec(ally).terrain.name}</span>
              {fighter(enemy, true)}
              {fighter(ally, false)}
              {projectile()}
              {last && last.hit && (
                <img key={`spark-${shown}`} className={`px spark${crit ? ' crit' : ''}`} src={SPARK} width={spark} height={spark} alt=""
                  style={{ left: impactMark - spark / 2, top: 274 - spark / 2 }} />
              )}
              {crit && <span key={`flash-${shown}`} className="scene-flash" />}
              {last && (
                <Fragment key={`hit-${shown}`}>
                  <span className={`dmg${crit ? ' crit' : ''}`} style={{ left: impactMark - 28 }}>
                    {last.hit ? last.damage : 'MISS'}
                  </span>
                  <span className="dmg-label" style={{ left: impactMark - 40 }}>
                    {!last.hit ? '未命中' : last.backlash ? '反噬！伤害落在自己身上' : `${last.proc ? '战技触发 · ' : ''}${last.crit ? '必杀！' : '命中'}`}
                  </span>
                </Fragment>
              )}
            </div>
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
