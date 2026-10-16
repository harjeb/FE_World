import { useEffect, useRef } from 'react';
import { WEAPON_TYPE_NAMES } from '@common/data/types.ts';
import { WEAPONS } from '@common/data/weapons.ts';
import type { WeaponId } from '@common/data/weapons.ts';
import { expPreview, forecast, healAmount, terrainAt, unitById } from '@common/engine/index.ts';
import type { BattleState, Point, SideForecast, UnitState } from '@common/engine/index.ts';
import { TERRAINS } from '@common/maps/map.ts';
import { weaponIcon } from '../assets.ts';
import { AttackIcon, HealIcon } from '../ui/icons.tsx';
import { displayName } from './names.ts';
import { Portrait } from './UnitCard.tsx';

const pct = (p: number) => `${Math.round(p * 100)}%`;

function terrainNote(side: SideForecast) {
  if (!side.terrain.applies) return '飞行，不受地形加成';
  if (side.terrain.avoid === 0 && side.terrain.def === 0) return `${side.terrain.name} · 无地形加成`;
  return `${side.terrain.name} · 回避 ${side.terrain.avoid >= 0 ? '+' : ''}${side.terrain.avoid} 防御 +${side.terrain.def}`;
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

function Fighter({ unit, label, weapon, side, enemy }: { unit: UnitState; label: string; weapon: WeaponId | null; side: SideForecast; enemy?: boolean }) {
  const w = weapon ? WEAPONS[weapon] : null;
  return (
    <div className={`fc-side${enemy ? ' enemy' : ''}`}>
      <Portrait unit={unit} flip={enemy} />
      <div className="min-w-0">
        <div className="fc-name">{label}</div>
        <div className="fc-sub">
          {w ? <><img className="px" src={weaponIcon(w.type)} width={16} height={16} alt="" />{w.name}</> : '无武器'}
        </div>
        <div className="fc-ter">{terrainNote(side)}</div>
      </div>
    </div>
  );
}

export function ForecastPanel({ state, unitId, to, weapon, targetId }: { state: BattleState; unitId: string; to: Point; weapon: WeaponId; targetId: string }) {
  const f = forecast(state, unitId, to, weapon, targetId);
  const attacker = { ...unitById(state, unitId), pos: to };
  const defender = unitById(state, targetId);
  const a = f.attacker, d = f.defender;
  const dLoss = Math.min(defender.hp, a.damage * a.strikes);
  const aLoss = d.canAttack ? Math.min(attacker.hp, d.damage * d.strikes) : 0;
  const killNote = a.damage * a.strikes >= defender.hp ? '全部命中即可击败'
    : a.crit > 0 && a.damage * 3 >= defender.hp ? '需要必杀才能击败' : '本次无法击败';
  const exp = attacker.side === 'player' && state.kind === 'field' ? expPreview(attacker, defender) : null;
  const tri = d.weapon ? `${WEAPON_TYPE_NAMES[WEAPONS[weapon].type]}${a.triangle > 0 ? '克' : '被'}${WEAPON_TYPE_NAMES[WEAPONS[d.weapon].type]}${a.triangle > 0 ? '' : '克'}` : '';
  const dash = '—';
  return (
    <section className="panel" aria-labelledby="fc-h">
      <div className="ph">
        <h2 id="fc-h">交战预测</h2>
        <span style={{ fontSize: 12, color: '#6A6256' }}>命中与必杀为概率，实际结果以判定为准</span>
      </div>
      <div className="fc-sides">
        <Fighter unit={attacker} label={displayName(state, attacker.id)} weapon={weapon} side={a} />
        <span className="fc-vs" aria-hidden="true">VS</span>
        <Fighter unit={defender} label={displayName(state, defender.id)} weapon={d.weapon} side={d} enemy />
      </div>
      <div className="fc-hps">
        <HpBox unit={attacker} loss={aLoss} color="#4A7FA6"
          note={d.canAttack ? `被反击命中时 −${d.damage}${d.strikes > 1 ? ` ×${d.strikes}` : ''}（${d.hit}%）` : '对方无法反击'} />
        <HpBox unit={defender} loss={dLoss} color="#B8574A" right
          note={`${a.strikes > 1 ? `${a.strikes} 击` : '1 击'}命中 −${a.damage * a.strikes}；${killNote}`} />
      </div>
      <table className="fc-tbl">
        <caption className="sr-only">双方数值对比：左为{attacker.name}，右为{defender.name}</caption>
        <tbody>
          <tr><td className="l fc-val">{a.damage}<small>× {a.strikes}</small></td><th scope="row" className="c">伤害</th><td className="r fc-val">{d.canAttack ? <>{d.damage}<small>× {d.strikes}</small></> : dash}</td></tr>
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
        {a.triangle > 0 && <span className="tag tag-green">▲ 武器克制：{tri} · 命中 +15 伤害 +1</span>}
        {a.triangle < 0 && <span className="tag tag-red">▼ 被克制：{tri} · 命中 −15 伤害 −1</span>}
        {a.effective && <span className="tag tag-brass">特效：威力 ×3</span>}
        {d.effective && d.canAttack && <span className="tag tag-red">对方对我方特效</span>}
        {!d.canAttack && <span className="tag tag-blue">对方无法反击</span>}
      </div>
      <div className="fc-sum">
        <div>
          <span className="muted">击败概率</span> <b style={{ fontSize: 16 }}>{pct(f.defenderDies)}</b>
          <span className="muted"> · 被击败风险 </span><b>{pct(f.attackerDies)}</b>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>概率按实际判定计算：命中取两个随机数的平均值，必杀取一个随机数。</div>
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

export function HealPreview({ state, unitId, targetId, weapon }: { state: BattleState; unitId: string; targetId: string; weapon: WeaponId }) {
  const healer = unitById(state, unitId), target = unitById(state, targetId);
  const staff = WEAPONS[weapon];
  const amount = healAmount(healer, target, weapon);
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

export function ConfirmPanel({ state, to, kind, onConfirm, onCancel }: { state: BattleState; to: Point; kind: 'attack' | 'heal'; onConfirm: () => void; onCancel: () => void }) {
  const place = TERRAINS[terrainAt(state, to)].name;
  const ref = useRef<HTMLElement>(null);
  // Keep the confirm button on screen when the forecast pushes it below the side column's fold.
  useEffect(() => { ref.current?.scrollIntoView({ block: 'nearest' }); }, []);
  return (
    <section ref={ref} className="panel confirm" aria-label="确认">
      <div className="flex gap-2.5">
        <button type="button" className="btn btn-primary btn-lg flex-1" onClick={onConfirm}>
          {kind === 'attack' ? <AttackIcon /> : <HealIcon />}
          {kind === 'attack' ? '确认攻击' : '确认治疗'} <span className="kbd">ENTER</span>
        </button>
        <button type="button" className="btn btn-lg" style={{ fontWeight: 500 }} onClick={onCancel} data-own-enter>取消 <span className="kbd">ESC</span></button>
      </div>
      <p style={{ fontSize: 13, color: '#6A6256' }}>
        确认后，移动到{place}与{kind === 'attack' ? '攻击' : '治疗'}将一并提交，提交后不可撤销；取消则回到选择目标。
      </p>
    </section>
  );
}
