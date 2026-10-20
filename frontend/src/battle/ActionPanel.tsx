import { WEAPON_TYPE_NAMES } from '@common/data/types.ts';
import { ITEMS, WEAPONS } from '@common/data/weapons.ts';
import { actionOptions, forecast, unitById } from '@common/engine/index.ts';
import type { BattleState } from '@common/engine/index.ts';
import { itemIconFor } from '../assets.ts';
import { spellbookItem } from '@common/game/items.ts';
import { ArtIcon, AttackIcon, BackIcon, BagIcon, DanceIcon, HealIcon, RetreatIcon, SeizeIcon, SpellIcon, StaffIcon, WaitIcon } from '../ui/icons.tsx';
import { artInfo, commandDest, commandOptions, isCommand, spellInfo, STAFF_EFFECT_TEXT } from './commands.ts';
import type { CommandMode } from './commands.ts';
import type { BattleController } from './controller.ts';
import { actionMenu } from './menu.ts';
import type { MenuEntry } from './menu.ts';
import { displayName } from './names.ts';
import type { Mode } from './selection.ts';

type ActMode = Extract<Mode, { to: unknown }>;

function actIcon(id: MenuEntry['action']['id']) {
  switch (id) {
    case 'attack': return <AttackIcon />;
    case 'art': return <ArtIcon />;
    case 'cast': return <SpellIcon />;
    case 'heal': return <HealIcon />;
    case 'staff': return <StaffIcon />;
    case 'dance': return <DanceIcon />;
    case 'item': return <BagIcon />;
    case 'wait': return <WaitIcon />;
    case 'seize': return <SeizeIcon />;
    case 'escape': return <RetreatIcon />;
    case 'move': return <BackIcon />;
    default: return null;
  }
}

// 行动 / 武器 / 目标 / 道具 / 战技 / 法术 / 杖 / 舞蹈. Only what applies at the planned destination is
// offered (docs/08); the lists come from the engine's actionOptions, which the server also checks.
export function ActionPanel({ state, mode, ctl }: { state: BattleState; mode: ActMode; ctl: BattleController }) {
  const unit = unitById(state, mode.unit);
  const options = actionOptions(state, unit, mode.to);
  const kind = mode.kind === 'attack' || mode.kind === 'heal' ? mode.kind : null;
  const weaponOptions = kind ? options[kind] : [];
  const targets = kind
    ? (weaponOptions.find(o => o.weapon === (mode as { weapon: string }).weapon)?.targets ?? [])
    : [];
  const target = kind ? (mode as { target: string | null }).target : null;
  const goal = state.goal;
  const onThrone = goal.kind === 'seize' && goal.throne[0] === mode.to[0] && goal.throne[1] === mode.to[1];
  const onExit = (goal.kind === 'escape' || goal.kind === 'gather' || goal.kind === 'escort')
    && goal.exits.some(e => e[0] === mode.to[0] && e[1] === mode.to[1]);
  // Same source as the map's contextual menu: exactly what the engine offers at the destination.
  const entries = actionMenu(state, unit.id, mode.to);
  const run = (entry: MenuEntry) => {
    if (entry.action.id === 'interact') ctl.interact(entry.action.object);
    else if (entry.action.id === 'move') ctl.cancel();
    else ctl.chooseAction(entry.action.id);
  };

  return (
    <section className="panel" aria-label="行动与武器">
      <div className="sect">
        <div className="sect-k"><span>行动</span></div>
        <div className="acts">
          {entries.map(entry => {
            const id = entry.action.id;
            const active = id === mode.kind || (id === 'item' && mode.kind === 'item');
            return (
              <button key={id === 'interact' ? `i:${entry.action.object}` : id} type="button"
                className={`btn btn-sm${entry.tone === 'primary' ? ' btn-primary' : ''}`} aria-pressed={active}
                onClick={() => run(entry)}>
                {actIcon(id)}{entry.label}
              </button>
            );
          })}
        </div>
        {mode.kind === 'action' && (
          <p style={{ fontSize: 12, color: '#6A6256' }}>
            {options.seize ? '压制王座会立即赢下这场战斗。' : onThrone ? '只有主将能压制王座。' : ''}
            {options.escape ? '站上撤离点的单位可以撤离，带出的物资才算带回。' : onExit ? '只有站在撤离点上的单位才能撤离。' : ''}
            再点一次落点格＝移动后待机；点地图上红色范围内的敌人直接选目标；Esc 返回重选落点。
          </p>
        )}
      </div>

      {kind && (
        <div className="sect">
          <div className="sect-k"><span>{kind === 'attack' ? '武器' : '杖'}</span></div>
          <div className="wopts" role="group" aria-label="选择武器">
            {weaponOptions.map(o => {
              const w = WEAPONS[o.weapon];
              let desc = w.type === 'staff' ? (w.note ?? '') : `威力 ${w.might} · 命中 ${w.hit} · 必杀 ${w.crit} · 重 ${w.weight}`;
              if (kind === 'attack' && target && o.targets.some(t => t.id === target)) {
                const f = forecast(state, unit.id, mode.to, o.weapon, target);
                desc = `伤害 ${f.attacker.damage}×${f.attacker.strikes} · 命中 ${f.attacker.hit}% · 必杀 ${f.attacker.crit}%`;
              }
              const book = unit.bookInstances?.find(b => b.id === o.weapon);
              return (
                <button key={o.weapon} type="button" className="wopt" aria-pressed={(mode as { weapon: string }).weapon === o.weapon}
                  onClick={() => ctl.chooseWeapon(o.weapon)}>
                  <img className="px" src={itemIconFor(o.weapon)} width={32} height={32} alt="" />
                  <span className="wn">{w.name} <span style={{ fontWeight: 400, color: '#6A6256' }}>{w.rank}{book ? ` · 剩 ${book.charges} 次` : ''}</span></span>
                  <span className="wd num">{desc}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {kind && targets.length > 0 && !(targets.length === 1 && target) && (
        <div className="sect">
          <div className="sect-k"><span>目标</span></div>
          <div className="acts">
            {targets.map(t => (
              <button key={t.id} type="button" className="btn btn-sm" aria-pressed={target === t.id} onClick={() => ctl.chooseTarget(t.id)}>
                {displayName(state, t.id)} <span className="num" style={{ color: '#6A6256' }}>HP {t.hp}/{t.stats.hp}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {isCommand(mode) && <CommandSection state={state} mode={mode} ctl={ctl} />}

      {mode.kind === 'item' && (
        <div className="sect">
          <div className="sect-k"><span>持有物</span></div>
          <div className="acts">
            {options.items.map(i => {
              const stack = unit.items[i];
              return (
                <button key={i} type="button" className="btn" onClick={() => ctl.useItem(i)}>
                  <img className="px" src={itemIconFor(stack.id)} width={32} height={32} alt="" />
                  使用{ITEMS[stack.id].name}（{'cure' in ITEMS[stack.id] ? '解除中毒' : `回复 ${Math.min(ITEMS[stack.id].heal, unit.stats.hp - unit.hp)}`}，剩 {stack.uses} 次）
                </button>
              );
            })}
            {options.items.length === 0 && (
              <p style={{ fontSize: 13, margin: 0 }}>
                {unit.hp >= unit.stats.hp ? 'HP 已满，无需用药。' : '现在没有能用的道具。'}
                全部武器与道具见地图上的行动菜单「持有物」。
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function CommandSection({ state, mode, ctl }: { state: BattleState; mode: CommandMode; ctl: BattleController }) {
  const o = commandOptions(state, mode);
  const targetsOf = (list: { id: string }[]) => list.map(t => state.units.find(u => u.id === t.id)!).filter(Boolean);
  let title = '', picker: React.ReactNode = null, targets: { id: string; hp: number; stats: { hp: number } }[] = [];
  if (mode.kind === 'art') {
    title = '战技';
    picker = (
      <div className="wopts" role="group" aria-label="选择战技">
        {o.arts.map(a => {
          const art = artInfo(a.art);
          const w = WEAPONS[a.weapon];
          return (
            <button key={`${a.art}:${a.weapon}`} type="button" className="wopt" aria-pressed={mode.art === a.art && mode.weapon === a.weapon} disabled={!a.usable}
              onClick={() => ctl.chooseArt(a.art, a.weapon)} title={art?.effect}>
              <img className="px" src={itemIconFor(a.weapon)} width={32} height={32} alt="" />
              <span className="wn">{art?.name ?? a.art} <span style={{ fontWeight: 400, color: '#6A6256' }}>{w.name}{art?.original ? ' · 原创' : ''}{art?.rank ? ` · ${art.rank}` : ''}</span></span>
              <span className="wd">{art?.effect}</span>
              <span className="wd num">耐久 −{a.cost}{a.durability !== null ? `（现 ${a.durability}）` : ''} · 射程 {art?.range.join('–')}{art?.might ? ` · 威力 ${art.might > 0 ? '+' : ''}${art.might}` : ''}{art?.hit ? ` · 命中 ${art.hit > 0 ? '+' : ''}${art.hit}` : ''}{art?.crit ? ` · 必杀 +${art.crit}` : ''}{!a.usable ? ' · 耐久不足' : ''}</span>
            </button>
          );
        })}
      </div>
    );
    targets = o.arts.find(a => a.art === mode.art && a.weapon === mode.weapon)?.targets ?? [];
  } else if (mode.kind === 'cast') {
    title = '法术';
    picker = (
      <div className="wopts" role="group" aria-label="选择法术">
        {o.casts.map(c => {
          const book = spellInfo(c.spell);
          return (
            <button key={c.spell} type="button" className="wopt" aria-pressed={mode.spell === c.spell} onClick={() => ctl.chooseSpell(c.spell)} title={book?.effect}>
              <img className="px" src={itemIconFor(spellbookItem(c.spell))} width={32} height={32} alt="" />
              <span className="wn">{book?.name ?? c.spell} <span style={{ fontWeight: 400, color: '#6A6256' }}>剩 {c.charges} / {c.maxCharges} 次</span></span>
              <span className="wd">{book?.effect}</span>
            </button>
          );
        })}
      </div>
    );
    targets = o.casts.find(c => c.spell === mode.spell)?.targets ?? [];
  } else if (mode.kind === 'staff') {
    title = '杖';
    picker = (
      <div className="wopts" role="group" aria-label="选择杖">
        {o.staves.map(st => {
          const w = WEAPONS[st.weapon];
          const book = state.units.find(u => u.id === mode.unit)?.bookInstances?.find(b => b.id === st.weapon);
          return (
            <button key={st.weapon} type="button" className="wopt" aria-pressed={mode.weapon === st.weapon} onClick={() => ctl.chooseStaff(st.weapon)}>
              <img className="px" src={itemIconFor(st.weapon)} width={32} height={32} alt="" />
              <span className="wn">{w.name} <span style={{ fontWeight: 400, color: '#6A6256' }}>{STAFF_EFFECT_TEXT[st.effect]}{book ? ` · 剩 ${book.charges} 次` : ''}</span></span>
              <span className="wd">{w.note} · 射程 {w.range.join('–')}</span>
            </button>
          );
        })}
      </div>
    );
    targets = o.staves.find(st => st.weapon === mode.weapon)?.targets ?? [];
  } else {
    title = '舞蹈';
    targets = targetsOf(o.dance);
  }
  const artOption = mode.kind === 'art' ? o.arts.find(a => a.art === mode.art && a.weapon === mode.weapon) : undefined;
  const dest = mode.target ? commandDest(state, mode) : null;
  const destPoint = mode.kind === 'cast' || mode.kind === 'staff' ? mode.dest : null;
  return (
    <>
      <div className="sect">
        <div className="sect-k"><span>{title}</span></div>
        {picker}
      </div>
      {targets.length > 0 && (
        <div className="sect">
          <div className="sect-k"><span>目标</span></div>
          <div className="acts">
            {targets.map(t => (
              <button key={t.id} type="button" className="btn btn-sm" aria-pressed={mode.target === t.id} onClick={() => ctl.chooseTarget(t.id)}>
                {displayName(state, t.id)} <span className="num" style={{ color: '#6A6256' }}>HP {t.hp}/{t.stats.hp}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {mode.kind === 'art' && artOption && <>
        {artOption.objects.length > 0 && <div className="sect"><label>墙体目标 <select value={artOption.objects.includes(mode.target ?? '') ? mode.target! : ''} onChange={e => { if (e.target.value) ctl.chooseTarget(e.target.value); }}><option value="">请选择墙体</option>{artOption.objects.map(id => <option key={id} value={id}>墙体 · {id}</option>)}</select></label></div>}
        {mode.target && artOption.postMoves.length > 0 && <div className="sect"><label>战后移动（可选） <select value={artOption.postMoves.findIndex(p => p[0] === mode.postTo?.[0] && p[1] === mode.postTo?.[1])} onChange={e => ctl.chooseArtFollowup('postTo', Number(e.target.value))}><option value={-1}>不移动</option>{artOption.postMoves.map((p, i) => <option key={i} value={i}>({p[0]},{p[1]})</option>)}</select></label></div>}
        {mode.target && artOption.supportOptions.length > 0 && <div className="sect"><label>战后支援（可选） <select value={artOption.supportOptions.findIndex(s => JSON.stringify(s) === JSON.stringify(mode.support))} onChange={e => ctl.chooseArtFollowup('support', Number(e.target.value))}><option value={-1}>不支援</option>{artOption.supportOptions.map((s, i) => <option key={i} value={i}>{displayName(state, s.target)} · {s.spell ? spellInfo(s.spell)?.name ?? s.spell : s.weapon ? WEAPONS[s.weapon].name : '支援'}{s.dest ? ` → (${s.dest[0]},${s.dest[1]})` : ''}</option>)}</select></label></div>}
      </>}
      {mode.kind === 'art' && artOption && (['ally', 'secondary'] as const).map(kind => {
        const ids = kind === 'ally' ? artOption.allies : artOption.secondaries[mode.target ?? ''] ?? [];
        const offered = kind === 'ally' ? mode.art === 'fe_art_cover_exchange' || mode.art === 'fe_art_scale_rebuff' : !!mode.target && ids.length > 0;
        if (!offered) return null;
        return <div className="sect" key={kind}>
          <label>{kind === 'ally' ? '友军（可选）' : '次目标（可选）'}{' '}
            <select value={mode[kind] ?? ''} onChange={e => ctl.chooseArtExtra(kind, e.target.value || undefined)}>
              <option value="">不选择</option>
              {ids.map(id => <option key={id} value={id}>{displayName(state, id)}</option>)}
            </select>
          </label>
        </div>;
      })}
      {dest && (
        <div className="sect">
          <div className="sect-k"><span>落点</span></div>
          <p style={{ fontSize: 13 }}>
            {destPoint ? <>已选落点 ({destPoint[0]},{destPoint[1]})。<button type="button" className="btn btn-sm btn-ghost" onClick={() => ctl.chooseDest(null)}>重选</button></>
              : dest.cells.length === 0 ? '附近没有可用的空格。'
                : dest.rule.required ? '在地图上点一个高亮的格子作为落点。' : '可以在地图上点选落点；不选时放到施法者相邻的第一个空格。'}
          </p>
        </div>
      )}
      {mode.kind === 'art' && mode.art && <p className="pfoot">{artInfo(mode.art)?.effect}{WEAPON_TYPE_NAMES[artInfo(mode.art)?.weapon as keyof typeof WEAPON_TYPE_NAMES] ? `（${WEAPON_TYPE_NAMES[artInfo(mode.art)!.weapon as keyof typeof WEAPON_TYPE_NAMES]}）` : ''}</p>}
    </>
  );
}
