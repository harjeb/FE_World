import { SKILLS } from '@common/data/skills.ts';
import { ITEMS, WEAPONS } from '@common/data/weapons.ts';
import type { WeaponId } from '@common/data/weapons.ts';
import { classOf, equipped, staffWeapons, unitCombatStats } from '@common/engine/index.ts';
import type { BattleState, UnitState } from '@common/engine/index.ts';
import { portraitFor, spriteFor } from '../assets.ts';
import { spellInfo } from './commands.ts';

export function Portrait({ unit, size = 64, flip = false }: { unit: UnitState; size?: 32 | 64; flip?: boolean }) {
  const own = portraitFor(unit);
  const side = unit.side === 'player' ? 'ally' : 'enemy';
  return (
    <div className={`pf ${side}`} style={{ width: size + 2, height: size + 2 }}>
      <img className={`px${flip ? ' flip' : ''}`} src={own ?? spriteFor(unit)} width={size} height={size} alt="" />
    </div>
  );
}

export function SideTag({ unit }: { unit: UnitState }) {
  return unit.side === 'player'
    ? <span className="tag tag-blue">● 己方</span>
    : <span className="tag tag-red">◆ 敌方</span>;
}

export function HpLine({ unit }: { unit: UnitState }) {
  const color = unit.side === 'player' ? '#4A7FA6' : '#B8574A';
  return (
    <div className="flex items-center gap-2">
      <span style={{ fontSize: 13, color: '#6A6256' }}>HP</span>
      <div className="hpbar-thin"><i style={{ width: `${(unit.hp / unit.stats.hp) * 100}%`, background: color }} /></div>
      <b className="num">{unit.hp} / {unit.stats.hp}</b>
    </div>
  );
}

// Selected or hovered unit: identity, HP, skill, combat numbers with the weapon in use, base stats.
export function UnitCard({ state, unit, weapon, compact = false }: { state: BattleState; unit: UnitState; weapon?: WeaponId | null; compact?: boolean }) {
  const cls = classOf(unit);
  const shown = weapon ?? equipped(unit) ?? staffWeapons(unit)[0] ?? null;
  const armed = shown !== null && WEAPONS[shown].type !== 'staff';
  const combat = unitCombatStats(state, unit, armed ? shown : null);
  const dash = (n: number) => (armed ? n : '—');
  const skill = unit.skill ? SKILLS[unit.skill] : null;
  const statuses = [unit.statuses?.sleep && '睡眠', unit.statuses?.silence && `沉默 ${unit.statuses.silence}`, unit.statuses?.berserk && `混乱 ${unit.statuses.berserk}`,
    unit.statuses?.regen && `再生 ${unit.statuses.regen}`, unit.petrified && '石化（禁止一切回复）', (unit.shields ?? 0) > 0 && '持不朽盾'].filter(Boolean) as string[];
  const gear = unit.weapons.map((id, i) => {
    const nth = unit.weapons.slice(0, i).filter(w => w === id).length;
    const book = unit.bookInstances?.filter(b => b.id === id)[nth];
    const inst = unit.weaponInstances?.filter(w => w.id === id)[nth];
    return `${WEAPONS[id]?.name ?? id}${book ? ` ${book.charges}/${book.maxCharges}次` : inst ? ` ${inst.durability}/${inst.maxDurability}` : ''}`;
  });
  const base: [string, number | string][] = [
    ['力', unit.stats.str], ['魔', unit.stats.mag], ['技', unit.stats.skl], ['速', unit.stats.spd], ['运', unit.stats.lck],
    ['防', unit.stats.def], ['魔防', unit.stats.res], ['体格', unit.con], ['移动', cls.move], ['EXP', unit.side === 'player' ? unit.exp : '—'],
  ];
  return (
    <section className="panel" aria-label={`${unit.name} 的信息`}>
      <div className="ucard">
        <Portrait unit={unit} flip={unit.side === 'enemy' && !portraitFor(unit)} />
        <div className="flex-1 min-w-0">
          <div className="uname">
            {unit.name} <SideTag unit={unit} /> <span className="tag tag-grey">{cls.name} · Lv {unit.level}</span>
            {unit.boss && <span className="tag tag-brass">主将</span>}
            {unit.npc && <span className="tag tag-green">护送对象</span>}
            {statuses.map(text => <span key={text} className="tag tag-red">{text}</span>)}
          </div>
          <div className="mt-1"><HpLine unit={unit} /></div>
          <div style={{ fontSize: 13, color: '#4E473D', marginTop: 2 }}>
            {skill ? <>技能 <b>{skill.name}</b>：{skill.text}</> : '无个人技能'}
          </div>
        </div>
      </div>
      <div className="ustats" style={{ padding: '0 14px 8px' }}>
        <div><span>攻击</span><b>{dash(combat.attack)}</b></div>
        <div><span>命中</span><b>{dash(combat.hit)}</b></div>
        <div><span>必杀</span><b>{dash(combat.crit)}</b></div>
        <div><span>攻速</span><b>{combat.attackSpeed}</b></div>
        <div><span>回避</span><b>{combat.avoid}</b></div>
      </div>
      {!compact && (
        <>
          <div className="basestats" style={{ padding: '0 14px 10px' }}>
            {base.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
          </div>
          <div style={{ padding: '0 14px 12px', fontSize: 13, color: '#4E473D' }}>
            携带：{gear.join(' · ') || '无武器'}
            {unit.items.length > 0 && <> · {unit.items.map(s => `${ITEMS[s.id]?.name ?? s.id} ×${s.uses}`).join(' · ')}</>}
            {(unit.spellbooks ?? []).length > 0 && <div>法术书：{unit.spellbooks!.map(b => `${spellInfo(b.id)?.name ?? b.id} ${b.charges}/${b.maxCharges}`).join(' · ')}</div>}
            {(unit.arts ?? []).length > 0 && unit.side === 'player' && <div>战技：{unit.arts!.length} 项</div>}
          </div>
        </>
      )}
    </section>
  );
}

const STEPS = ['选单位', '预览落点', '行动与目标', '查看预测', '确认执行'];

export function Steps({ index }: { index: number }) {
  return (
    <ol className="panel steps" aria-label="操作流程">
      {STEPS.map((label, i) => (
        <li key={label} className={`step${i < index ? ' done' : i === index ? ' cur' : ''}`} aria-current={i === index ? 'step' : undefined}>
          <b>{i < index ? '✓' : i + 1}</b>{label}
          {i < STEPS.length - 1 && <span className="step-arrow" aria-hidden="true">›</span>}
        </li>
      ))}
    </ol>
  );
}
