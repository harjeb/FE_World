import { ITEMS, WEAPONS } from '@common/data/weapons.ts';
import { actionOptions, forecast, terrainAt, unitById } from '@common/engine/index.ts';
import type { BattleState } from '@common/engine/index.ts';
import { TERRAINS } from '@common/maps/map.ts';
import { VULNERARY, weaponIcon } from '../assets.ts';
import { AttackIcon, BagIcon, HealIcon, SeizeIcon, WaitIcon } from '../ui/icons.tsx';
import type { BattleController } from './controller.ts';
import { displayName } from './names.ts';
import type { Mode } from './selection.ts';

type ActMode = Extract<Mode, { to: unknown }>;

// 行动 / 武器 / 目标 / 道具. Only actions that apply at the planned destination are offered (docs/08).
export function ActionPanel({ state, mode, ctl }: { state: BattleState; mode: ActMode; ctl: BattleController }) {
  const unit = unitById(state, mode.unit);
  const options = actionOptions(state, unit, mode.to);
  const terrain = TERRAINS[terrainAt(state, mode.to)].name;
  const kind = mode.kind === 'attack' || mode.kind === 'heal' ? mode.kind : null;
  const weaponOptions = kind ? options[kind] : [];
  const targets = kind
    ? (weaponOptions.find(o => o.weapon === (mode as { weapon: string }).weapon)?.targets ?? [])
    : [];
  const target = kind ? (mode as { target: string | null }).target : null;
  const goal = state.goal;
  const onThrone = goal.kind === 'seize' && goal.throne[0] === mode.to[0] && goal.throne[1] === mode.to[1];

  return (
    <section className="panel" aria-label="行动与武器">
      <div className="sect">
        <div className="sect-k"><span>行动</span><small>落点 {terrain} · 仅显示可用项</small></div>
        <div className="acts">
          {options.seize && (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => ctl.chooseAction('seize')}>
              <SeizeIcon />压制
            </button>
          )}
          {options.attack.length > 0 && (
            <button type="button" className="btn btn-sm" aria-pressed={mode.kind === 'attack'} onClick={() => ctl.chooseAction('attack')}>
              <AttackIcon />攻击
            </button>
          )}
          {options.heal.length > 0 && (
            <button type="button" className="btn btn-sm" aria-pressed={mode.kind === 'heal'} onClick={() => ctl.chooseAction('heal')}>
              <HealIcon />治疗
            </button>
          )}
          {options.items.length > 0 && (
            <button type="button" className="btn btn-sm" aria-pressed={mode.kind === 'item'} onClick={() => ctl.chooseAction('item')}>
              <BagIcon />道具
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={() => ctl.chooseAction('wait')}>
            <WaitIcon />待机
          </button>
        </div>
        {mode.kind === 'action' && (
          <p style={{ fontSize: 12, color: '#6A6256' }}>
            {options.seize ? '压制王座会立即赢下这场战斗。' : onThrone ? '只有主将能压制王座。' : ''}
            待机会立即提交移动；也可以直接点地图上红色范围内的敌人。
          </p>
        )}
      </div>

      {kind && (
        <div className="sect">
          <div className="sect-k"><span>{kind === 'attack' ? '武器' : '杖'}</span><small>切换后预测立即更新</small></div>
          <div className="wopts" role="group" aria-label="选择武器">
            {weaponOptions.map(o => {
              const w = WEAPONS[o.weapon];
              let desc = w.type === 'staff' ? (w.note ?? '') : `威力 ${w.might} · 命中 ${w.hit} · 必杀 ${w.crit} · 重 ${w.weight}`;
              if (kind === 'attack' && target && o.targets.some(t => t.id === target)) {
                const f = forecast(state, unit.id, mode.to, o.weapon, target);
                desc = `伤害 ${f.attacker.damage}×${f.attacker.strikes} · 命中 ${f.attacker.hit}% · 必杀 ${f.attacker.crit}%`;
              }
              return (
                <button key={o.weapon} type="button" className="wopt" aria-pressed={(mode as { weapon: string }).weapon === o.weapon}
                  onClick={() => ctl.chooseWeapon(o.weapon)}>
                  <img className="px" src={weaponIcon(w.type)} width={32} height={32} alt="" />
                  <span className="wn">{w.name} <span style={{ fontWeight: 400, color: '#6A6256' }}>{w.rank}</span></span>
                  <span className="wd num">{desc}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {kind && targets.length > 0 && !(targets.length === 1 && target) && (
        <div className="sect">
          <div className="sect-k"><span>目标</span><small>也可以在地图上点选</small></div>
          <div className="acts">
            {targets.map(t => (
              <button key={t.id} type="button" className="btn btn-sm" aria-pressed={target === t.id} onClick={() => ctl.chooseTarget(t.id)}>
                {displayName(state, t.id)} <span className="num" style={{ color: '#6A6256' }}>HP {t.hp}/{t.stats.hp}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {mode.kind === 'item' && (
        <div className="sect">
          <div className="sect-k"><span>道具</span><small>使用后立即提交，结束该单位的行动</small></div>
          <div className="acts">
            {unit.items.map((stack, i) => (
              <button key={i} type="button" className="btn" onClick={() => ctl.useItem(i)}>
                <img className="px" src={VULNERARY} width={32} height={32} alt="" />
                使用{ITEMS[stack.id].name}（回复 {Math.min(ITEMS[stack.id].heal, unit.stats.hp - unit.hp)}，剩 {stack.uses} 次）
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
