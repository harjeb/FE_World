import { useEffect, useId, useRef } from 'react';
import { WEAPON_TYPE_NAMES } from '@common/data/types.ts';
import { WEAPONS } from '@common/data/weapons.ts';
import type { WeaponId } from '@common/data/weapons.ts';
import { artObjectForecast, expPreview, forecast, forecastOnHit, healAmount, terrainAt, unitById } from '@common/engine/index.ts';
import type { BattleState, Forecast, Point, SideForecast, UnitState } from '@common/engine/index.ts';
import { areaHeals, artInfo, commandAction, commandForecast, commandStatus, isCommand, spellHeal, spellInfo, STAFF_EFFECT_TEXT, weaponLabel } from './commands.ts';
import type { CommandMode } from './commands.ts';
import type { Mode } from './selection.ts';
import { TERRAINS } from '@common/maps/map.ts';
import { itemIconFor } from '../assets.ts';
import { AttackIcon, HealIcon } from '../ui/icons.tsx';
import { displayName } from './names.ts';
import { Portrait } from './UnitCard.tsx';

const pct = (p: number) => `${Math.round(p * 100)}%`;
const AILMENT: Record<string, string> = { poison: '中毒', root: '定身', silence: '沉默', confusion: '混乱' };

function terrainNote(side: SideForecast) {
  if (!side.terrain.applies) return '飞行，不受地形加成';
  if (side.terrain.avoid === 0 && side.terrain.def === 0) return `${side.terrain.name} · 无地形加成`;
  return `${side.terrain.name} · 回避 ${side.terrain.avoid >= 0 ? '+' : ''}${side.terrain.avoid} 物防 +${side.terrain.def}`;
}

// HP bar: solid = current HP, hatched = what this exchange could take away if every strike lands.
function HpBox({ unit, loss, color, note, right }: { unit: UnitState; loss: number; color: string; note: string; right?: boolean }) {
  const max = unit.stats.hp;
  return (
    <div style={right ? { textAlign: 'right' } : undefined}>
      <div className="hpline"><span>HP</span><span><b>{unit.hp}</b> / {max}</span></div>
      <div className="hpbar">
        <span className="cur" style={{ width: `${(unit.hp / max) * 100}%`, background: color }} />
        {loss > 0 && <span className="loss" style={{ left: `${((unit.hp - loss) / max) * 100}%`, width: `${(loss / max) * 100}%` }} />}
      </div>
      <div className="hpnote">{note}</div>
    </div>
  );
}

function Fighter({ unit, label, weapon, side, enemy, weaponName }: { unit: UnitState; label: string; weapon: WeaponId | null; side: SideForecast; enemy?: boolean; weaponName?: string }) {
  const w = weapon ? WEAPONS[weapon] ?? null : null;
  return (
    <div className={`fc-side${enemy ? ' enemy' : ''}`}>
      <Portrait unit={unit} flip={enemy} />
      <div className="min-w-0">
        <div className="fc-name">{label}</div>
        <div className="fc-sub">
          {weaponName ? <>{w && weapon && <img className="px" src={itemIconFor(weapon)} width={16} height={16} alt="" />}{weaponName}</> : w && weapon ? <><img className="px" src={itemIconFor(weapon)} width={16} height={16} alt="" />{w.name}</> : weapon ? weaponLabel(weapon) : '无武器'}
        </div>
        <div className="fc-ter">{terrainNote(side)}</div>
        {(unit.skill === 'lightshot' || unit.skills?.includes('lightshot')) && <div className="fc-ter">光明神射 · 本次有效技巧 {side.skl ?? unit.stats.skl}</div>}
      </div>
    </div>
  );
}

export function ForecastPanel({ state, unitId, to, weapon, targetId, given, title = '交战预测', weaponName }: {
  state: BattleState; unitId: string; to: Point; weapon: WeaponId; targetId: string;
  // 战技、攻击法术的预测由调用方用同一个 forecast 算好传入（法术书只在施法时登记为武器）。
  given?: Forecast; title?: string; weaponName?: string;
}) {
  const heading = useId();
  const f = given ?? forecast(state, unitId, to, weapon, targetId);
  const attacker = { ...unitById(state, unitId), pos: to };
  const defender = unitById(state, targetId);
  const a = f.attacker, d = f.defender;
  const onHit = forecastOnHit(f), aHits = onHit.filter(s => s.side === 'attacker'), dHits = onHit.filter(s => s.side === 'defender');
  const dealt = aHits.reduce((sum, s) => sum + s.damage, 0), taken = dHits.reduce((sum, s) => sum + s.damage, 0);
  const dLoss = Math.min(defender.hp - (d.protected ? 1 : 0), dealt);
  const aLoss = Math.min(attacker.hp - (a.protected ? 1 : 0), taken);
  const damageText = (s: (typeof onHit)[number]) => `${s.damage === s.maxDamage ? s.damage : `${s.damage}–${s.maxDamage}`}${s.chance !== undefined ? `（出手 ${s.chance}%）` : ''}`;
  const exp = attacker.side === 'player' && state.kind === 'field' ? expPreview(attacker, defender) : null;
  const tri = d.weapon && WEAPONS[weapon] ? `${WEAPON_TYPE_NAMES[WEAPONS[weapon].type]}${a.triangle > 0 ? '克' : '被'}${WEAPON_TYPE_NAMES[WEAPONS[d.weapon].type]}${a.triangle > 0 ? '' : '克'}` : '';
  const dash = '—';
  return (
    <section className="panel" aria-labelledby={heading}>
      <div className="ph"><h2 id={heading}>{title}</h2></div>
      <div className="fc-sides">
        <Fighter unit={attacker} label={displayName(state, attacker.id)} weapon={weapon} side={a} weaponName={weaponName} />
        <span className="fc-vs" aria-hidden="true">VS</span>
        <Fighter unit={defender} label={displayName(state, defender.id)} weapon={d.weapon} side={d} enemy />
      </div>
      {f.branches && f.branches.length > 1 && <div className="fc-sum">
        <p>概率特性在交战开始时判定；下方基础数值为未触发分支。</p>
        {f.branches.map((branch, index) => {
          const bf = branch.forecast;
          const hits = forecastOnHit(bf);
          return <div key={index}>
            <b>{pct(branch.probability)}</b> · {Object.entries(branch.rolls).map(([id, active]) => `${displayName(state, id)}${active ? '触发' : '未触发'}`).join('、')}
            <div>伤害 {hits.filter(s => s.side === 'attacker').map(s => s.damage).join(' + ')} / 反击 {hits.filter(s => s.side === 'defender').map(s => s.damage).join(' + ') || '—'}
              {' · '}命中 {bf.attacker.hit}% / {bf.defender.canAttack ? `${bf.defender.hit}%` : '—'}
              {' · '}必杀 {bf.attacker.crit}% / {bf.defender.crit}%
              {' · '}攻速 {bf.attacker.attackSpeed} / {bf.defender.attackSpeed}
              {' · '}击败 {pct(bf.defenderDies)} / 阵亡 {pct(bf.attackerDies)}</div>
          </div>;
        })}
      </div>}
      <div className="fc-hps">
        <HpBox unit={attacker} loss={aLoss} color="#4A7FA6"
          note={dHits.length ? `反击伤害 ${aLoss}` : d.canAttack ? '可能受到反击' : '对方无法反击'} />
        <HpBox unit={defender} loss={dLoss} color="#B8574A" right note={`预计伤害 ${dLoss}`} />
      </div>
      <table className="fc-tbl">
        <caption className="sr-only">双方数值对比：左为{attacker.name}，右为{defender.name}</caption>
        <tbody>
          <tr><td className="l fc-val">{aHits.map(damageText).join(' + ') || dash}</td><th scope="row" className="c">命中伤害</th><td className="r fc-val">{dHits.map(damageText).join(' + ') || dash}</td></tr>
          <tr><td className="l fc-val">{a.hit}<small>%</small></td><th scope="row" className="c">命中</th><td className="r fc-val">{d.canAttack ? <>{d.hit}<small>%</small></> : dash}</td></tr>
          <tr>
            <td className="l fc-val">{a.crit}<small>%{a.doubles && a.followUpCrit !== a.crit ? ` 追击 ${a.followUpCrit}%` : ''}</small></td>
            <th scope="row" className="c">必杀</th>
            <td className="r fc-val">{d.canAttack ? <>{d.crit}<small>%</small></> : dash}</td>
          </tr>
          <tr><td className="l fc-val">{a.attackSpeed}<small>{a.doubles ? '可追击' : '无追击'}</small></td><th scope="row" className="c">攻速</th><td className="r fc-val">{d.attackSpeed}<small>{d.doubles ? '可追击' : '无追击'}</small></td></tr>
        </tbody>
      </table>
      <div className="fc-adv">
        {f.art?.procChance !== undefined && <span className="tag tag-brass">战技触发 {f.art.procChance}%</span>}
        {!!f.art?.forceProbability && <span className="tag tag-brass">额外追击概率 {f.art.forceProbability}%</span>}
        {a.triangle > 0 && <span className="tag tag-green">▲ 武器克制：{tri} · 命中 +15 伤害 +1</span>}
        {a.triangle < 0 && <span className="tag tag-red">▼ 被克制：{tri} · 命中 −15 伤害 −1</span>}
        {a.effective && <span className="tag tag-brass">特效：威力 ×3</span>}
        {d.effective && d.canAttack && <span className="tag tag-red">对方对我方特效</span>}
        {!d.canAttack && <span className="tag tag-blue">对方无法反击</span>}
        {f.art?.sealFollowUp && <span className="tag tag-blue">{f.art.sealOnHit ? '命中封锁攻速追击；失手时仍可能被追击' : '本次交战封锁攻速追击（无需命中）'}</span>}
        {(a.barrier > 0 || d.barrier > 0) && <span className="tag tag-blue">护鳞已计入第一段命中伤害</span>}
        {a.backlash > 0 && <span className="tag tag-red">反噬 {a.backlash}%：命中时这一击改由自己承受（不朽盾照常保命）</span>}
        {d.backlash > 0 && d.canAttack && <span className="tag tag-blue">对方反击反噬 {d.backlash}%</span>}
        {a.afflicts.length > 0 && <span className="tag tag-brass">命中附加：{a.afflicts.map(s => AILMENT[s]).join('、')}{a.locks ? '（对方不能追击）' : ''}</span>}
        {d.afflicts.length > 0 && d.canAttack && <span className="tag tag-red">对方命中附加：{d.afflicts.map(s => AILMENT[s]).join('、')}</span>}
        {a.slows > 0 && <span className="tag tag-brass">命中后对方速度 −{a.slows}</span>}
        {a.drain > 0 && <span className="tag tag-green">吸血：回复实际伤害的 {Math.round(a.drain * 100)}%</span>}
        {a.charges !== null && <span className="tag tag-grey">本书剩 {a.charges} 次{a.doubles ? '，追击另扣 1 次' : a.charges < 2 ? '，次数不足以追击' : ''}</span>}
        {d.charges !== null && d.canAttack && <span className="tag tag-grey">对方书剩 {d.charges} 次</span>}
        {d.ward > 0 && <span className="tag tag-blue">对方屏障：受到伤害 −{d.ward}%</span>}
        {a.ward > 0 && <span className="tag tag-blue">我方屏障：受到伤害 −{a.ward}%</span>}
      </div>
      <div className="fc-sum">
        <div>
          <span className="muted">期望净 HP 减少</span> <b>{f.expectedDealt.toFixed(1)}</b>（负数为净回复） ·
          <span className="muted">击败概率</span> <b style={{ fontSize: 16 }}>{pct(f.defenderDies)}</b>
          <span className="muted"> · 被击败风险 </span><b>{pct(f.attackerDies)}</b>
        </div>
        {exp && (
          <div>
            <span className="muted">可获经验</span> 交战 +{exp.fight} · 击败 +{exp.kill}
            {attacker.exp + exp.kill >= 100 && <>（Lv {attacker.level} → 击败时可升至 Lv {attacker.level + 1}）</>}
          </div>
        )}
      </div>
    </section>
  );
}

export function HealPreview({ state, unitId, targetId, weapon, to }: { state: BattleState; unitId: string; targetId: string; weapon: WeaponId; to?: Point }) {
  const healer = unitById(state, unitId), target = unitById(state, targetId);
  const staff = WEAPONS[weapon];
  const amount = healAmount(healer, target, weapon);
  if (staff.area) return <AreaHealPreview state={state} title={`范围治疗 · ${staff.name}`} heals={areaHeals(state, unitId, to ?? healer.pos, weapon)} />;
  return (
    <section className="panel" aria-labelledby="heal-h">
      <div className="ph"><h2 id="heal-h">治疗预览</h2><span style={{ fontSize: 12, color: '#6A6256' }}>{staff.name}：{staff.note}</span></div>
      <div className="ucard">
        <Portrait unit={target} />
        <div className="flex-1">
          <div className="uname">{target.name}</div>
          <div className="num" style={{ fontSize: 15 }}>HP {target.hp} → <b>{target.hp + amount}</b> / {target.stats.hp}（+{amount}）</div>
          {healer.skill === 'shelter' && <div style={{ fontSize: 13, color: '#4E473D' }}>庇护：{target.name} 本回合防 +2</div>}
          {state.kind === 'field' && <div style={{ fontSize: 13, color: '#6A6256' }}>可获经验 +12</div>}
        </div>
      </div>
    </section>
  );
}

function AreaHealPreview({ state, title, heals }: { state: BattleState; title: string; heals: { unit: UnitState; amount: number }[] }) {
  return (
    <section className="panel" aria-labelledby="area-h">
      <div className="ph"><h2 id="area-h">{title}</h2><span style={{ fontSize: 12, color: '#6A6256' }}>射程内每名受伤友军各回复一次</span></div>
      <ul className="eq">
        {heals.map(({ unit, amount }) => (
          <li key={unit.id}><Portrait unit={unit} /><div className="min-w-0"><div className="nm">{displayName(state, unit.id)}</div>
            <div className="sp num">HP {unit.hp} → {unit.hp + amount} / {unit.stats.hp}（+{amount}）</div></div></li>
        ))}
        {heals.length === 0 && <li className="empty-row">射程内没有受伤的友军</li>}
      </ul>
    </section>
  );
}

// 状态杖与控场法术：显示命中率；命中后施加状态，不进入交战、目标不反击。
function StatusPreview({ state, targetId, chance, effect }: { state: BattleState; targetId: string; chance: ReturnType<typeof commandStatus> & object; effect: string }) {
  const target = unitById(state, targetId);
  const label = { sleep: '睡眠', silence: '沉默', root: '定身' }[chance.status];
  return (
    <section className="panel" aria-labelledby="status-h">
      <div className="ph"><h2 id="status-h">状态命中预览</h2><span style={{ fontSize: 12, color: '#6A6256' }}>不进入交战，目标不能反击</span></div>
      <div className="ucard">
        <Portrait unit={target} flip={target.side === 'enemy'} />
        <div className="flex-1">
          <div className="uname">{target.name}</div>
          <div className="num" style={{ fontSize: 15 }}>{label}命中 <b>{chance.chance}%</b>{chance.boss ? '（首领减半）' : ''}{chance.immune ? '（免疫）' : ''}</div>
          <div style={{ fontSize: 13, color: '#4E473D' }}>{effect}</div>
          <div style={{ fontSize: 12, color: '#6A6256' }}>命中 = 基础命中 + 技×2 + 运÷2 − 目标回避；与普通攻击一样取两个随机数的平均值判定。</div>
        </div>
      </div>
    </section>
  );
}

const VERB: Record<'attack' | 'heal' | 'art' | 'cast' | 'staff' | 'dance', string> = { attack: '攻击', heal: '治疗', art: '使用战技', cast: '施法', staff: '用杖', dance: '舞蹈' };

export function ConfirmPanel({ state, to, kind, ready = true, onConfirm, onCancel }: { state: BattleState; to: Point; kind: 'attack' | 'heal' | 'art' | 'cast' | 'staff' | 'dance'; ready?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const place = TERRAINS[terrainAt(state, to)].name;
  const ref = useRef<HTMLElement>(null);
  // Keep the confirm button on screen when the forecast pushes it below the side column's fold.
  useEffect(() => { ref.current?.scrollIntoView({ block: 'nearest' }); }, []);
  return (
    <section ref={ref} className="panel confirm" aria-label="确认">
      <div className="flex gap-2.5">
        <button type="button" className="btn btn-primary btn-lg flex-1" onClick={onConfirm} disabled={!ready}>
          {kind === 'heal' ? <HealIcon /> : <AttackIcon />}
          确认{VERB[kind]} <span className="kbd">ENTER</span>
        </button>
        <button type="button" className="btn btn-lg" style={{ fontWeight: 500 }} onClick={onCancel} data-own-enter>取消 <span className="kbd">ESC</span></button>
      </div>
      <p style={{ fontSize: 13, color: '#6A6256' }}>
        确认后，移动到{place}与{VERB[kind]}将一并提交，提交后不可撤销；取消则回到上一步。
      </p>
    </section>
  );
}

// 战技／法术／杖／舞蹈的预览：能交战的用引擎 forecast（战技加修正、攻击法术按法术书数值），其余显示效果。
export function CommandPreview({ state, mode }: { state: BattleState; mode: CommandMode }) {
  if (!mode.target) return null;
  if (mode.kind === 'art' && !state.units.some(u => u.id === mode.target)) {
    if (!mode.art || !mode.weapon || !commandAction(state, mode)) return null;
    const art = artInfo(mode.art);
    if (!art) return null;
    const preview = artObjectForecast(state, unitById(state, mode.unit), mode.to, mode.weapon, art, mode.target);
    return <section className="panel"><div className="ph"><h2>墙体破坏预览</h2></div><p>墙体 {preview.object} · HP {preview.hp} → {preview.hpAfter} · 伤害 {preview.damage} · 耐久 −{preview.cost}</p></section>;
  }
  const target = unitById(state, mode.target);
  const f = commandForecast(state, mode);
  if (f && mode.kind === 'art' && mode.art && mode.weapon) {
    const art = artInfo(mode.art);
    return <><p className="pfoot">{art?.effect} · 随机触发效果按概率结算，非必定发生。</p>{(f.targets ?? [{ target: mode.target, forecast: f }]).map((entry, index) => <ForecastPanel key={entry.target} state={state} unitId={mode.unit} to={mode.to} weapon={mode.weapon!} targetId={entry.target} given={entry.forecast} title={`战技预测 · ${art?.name ?? mode.art} · ${displayName(state, entry.target)}${index > 0 ? '（前段未中止时）' : ''}`} weaponName={`${WEAPONS[mode.weapon!].name} · ${art?.name ?? ''}`} />)}</>;
  }
  if (f && mode.kind === 'cast' && mode.spell) {
    return <ForecastPanel state={state} unitId={mode.unit} to={mode.to} weapon={mode.spell as WeaponId} targetId={mode.target} given={f} title={`法术预测 · ${spellInfo(mode.spell)?.name ?? mode.spell}`} weaponName={spellInfo(mode.spell)?.name} />;
  }
  const status = commandStatus(state, mode);
  const book = mode.kind === 'cast' ? spellInfo(mode.spell ?? '') : undefined;
  if (status) return <StatusPreview state={state} targetId={mode.target} chance={status} effect={book?.effect ?? (mode.kind === 'staff' && mode.weapon ? WEAPONS[mode.weapon].note ?? '' : '')} />;
  if (book?.effects.area) return <AreaHealPreview state={state} title={`范围治疗 · ${book.name}`} heals={areaHeals(state, mode.unit, mode.to, book.id as WeaponId, book.id)} />;
  const heal = spellHeal(state, mode);
  const effect = mode.kind === 'cast' ? spellInfo(mode.spell ?? '')?.effect
    : mode.kind === 'staff' && mode.weapon ? `${STAFF_EFFECT_TEXT[mode.weapon === 'sleep_staff' ? 'sleep' : mode.weapon === 'silence_staff' ? 'silence' : mode.weapon === 'warp_staff' ? 'warp' : 'rescue']}：${WEAPONS[mode.weapon].note ?? ''}`
      : mode.kind === 'dance' ? '目标本回合可以再行动一次；舞者自己的行动结束。' : '';
  return (
    <section className="panel" aria-labelledby="cmd-h">
      <div className="ph"><h2 id="cmd-h">效果预览</h2><span style={{ fontSize: 12, color: '#6A6256' }}>以服务端结算为准</span></div>
      <div className="ucard">
        <Portrait unit={target} flip={target.side === 'enemy'} />
        <div className="flex-1">
          <div className="uname">{target.name}</div>
          {heal !== null
            ? <div className="num" style={{ fontSize: 15 }}>HP {target.hp} → <b>{Math.min(target.stats.hp, target.hp + heal)}</b> / {target.stats.hp}（+{Math.min(heal, target.stats.hp - target.hp)}）</div>
            : <div className="num" style={{ fontSize: 15 }}>HP {target.hp} / {target.stats.hp}</div>}
          <div style={{ fontSize: 13, color: '#4E473D' }}>{effect}</div>
        </div>
      </div>
    </section>
  );
}

export function CommandConfirm({ state, mode, onConfirm, onCancel }: { state: BattleState; mode: Mode; onConfirm: () => void; onCancel: () => void }) {
  if (!isCommand(mode) || !mode.target) return null;
  return <>{mode.kind === 'art' && (mode.postTo || mode.support) && <p className="pfoot">已选：{mode.postTo ? `战后移动至 (${mode.postTo[0]},${mode.postTo[1]})。` : ''}{mode.support ? `战后支援 ${displayName(state, mode.support.target)}${mode.support.dest ? `，落点 (${mode.support.dest[0]},${mode.support.dest[1]})` : ''}。` : ''}仅在结算时条件仍满足时执行；无法执行则跳过且不消耗支援费用。</p>}<ConfirmPanel state={state} to={mode.to} kind={mode.kind} ready={commandAction(state, mode) !== null} onConfirm={onConfirm} onCancel={onCancel} /></>;
}
