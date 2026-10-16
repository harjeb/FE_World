import { useState } from 'react';
import { CHARACTERS } from '@common/data/characters.ts';
import { CLASSES, CLASS_PATHS, initialClassOf, ROUTE_NAMES, STAGE_NAMES } from '@common/data/classes.ts';
import type { ClassId, ClassRoute } from '@common/data/classes.ts';
import { STAT_KEYS, STAT_NAMES } from '@common/data/types.ts';
import type { StatKey } from '@common/data/types.ts';
import { LEGACY_MIN_LEVEL, REINCARNATION_GOLD, REINCARNATION_LEVEL, REINCARNATION_POINTS, REINCARNATION_STAT_MAX } from '@common/game/legacy.ts';
import { OP } from '@common/protocol/ops.ts';
import { session, useSession } from '../api/session.ts';
import type { ClassMarketRow, ServerUnit } from '../api/session.ts';
import { useServerData } from '../api/useServerData.ts';
import { go, links } from '../router.ts';
import { Checks, stock, useAct } from './SystemParts.tsx';

const ROUTES = Object.keys(CLASS_PATHS) as ClassRoute[];
const STAGES = [1, 2, 3, 4, 5] as const;

// Which class routes a unit's species may buy into (handlers.ts::BUY_CLASS_QUALIFICATION).
const allowed = (unit: ServerUnit, route: ClassRoute) =>
  unit.species === 'beast' ? route === 'beast' : unit.species === 'dragon' ? route === 'dragon' : route !== 'beast' && route !== 'dragon';

// 职业资格 (docs/00 §5「职业按年份开放并花钱购买，允许跨路线」): every class by route and stage, when
// it opens and its price. Picking a class only selects it; the purchase is confirmed below.
export function ClassMarketPanel({ unit }: { unit: ServerUnit }) {
  const { state } = useSession();
  const { data, error } = useServerData(() => session.classMarket(unit.id), [unit.id]);
  const { busy, act } = useAct();
  const [pick, setPick] = useState<string | null>(null);
  if (!data) return <section className="panel"><p className="sys-note">{error ? `读不到职业市场：${error}` : '读取职业市场…'}</p></section>;
  const gold = state?.gold ?? 0;
  const owned = data.classes.filter(c => c.owned);
  const head = STAGES.map(s => data.classes.find(c => c.stage === s));
  const chosen = data.classes.find(c => c.id === pick && c.open && !c.owned) ?? null;
  const excluded = ROUTES.filter(r => !allowed(unit, r));

  const cell = (c: ClassMarketRow) => {
    const current = c.id === unit.classId;
    if (c.owned) return <span key={c.id} className="mk-cls owned" title="已拥有资格">✓ {c.name}{current && <i>当前</i>}</span>;
    if (!c.open) return <span key={c.id} className="mk-cls locked" title={`第 ${c.openYear} 年开放`}>{c.name}{current && <i>当前</i>}</span>;
    return (
      <button key={c.id} type="button" className="mk-cls" aria-pressed={pick === c.id} onClick={() => setPick(c.id)}>
        {c.name}{current && <i>当前</i>}
      </button>
    );
  };

  return (
    <section className="panel" aria-labelledby="mk-h">
      <div className="ph"><h2 id="mk-h">职业资格 · 第 {data.year} 年</h2><span style={{ fontSize: 12, color: '#6A6256' }}>{unit.name}已拥有 {owned.length} 项 · 金币 {gold.toLocaleString()}</span></div>
      <div className="tbl-scroll">
        <table className="mk">
          <thead>
            <tr>
              <th scope="col">路线</th>
              {head.map((c, i) => <th key={STAGES[i]} scope="col">{STAGE_NAMES[i]}{c && <small>{c.open ? '已开放' : `第 ${c.openYear} 年开放`} · {c.price.toLocaleString()} 金</small>}</th>)}
            </tr>
          </thead>
          <tbody>
            {ROUTES.filter(r => allowed(unit, r)).map(r => (
              <tr key={r} className={CLASSES[unit.classId as ClassId]?.route === r ? 'own-route' : undefined}>
                <th scope="row">{ROUTE_NAMES[r]}</th>
                {STAGES.map(s => <td key={s}>{data.classes.filter(c => c.route === r && c.stage === s).map(cell)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {excluded.length > 0 && (
        <p className="pfoot">
          {unit.species === 'human' ? `${excluded.map(r => ROUTE_NAMES[r]).join('、')}路线需要对应种族${unit.isProtagonist ? '；主角不能使用兽、龙职业' : ''}。` : `${unit.name}只能购买${ROUTE_NAMES[unit.species]}路线的资格。`}
        </p>
      )}
      {chosen && (
        <div className="promo-confirm mk-buy">
          <span style={{ flex: 1, minWidth: 220 }}>
            为{unit.name}购买<b>「{chosen.name}」</b>资格（{ROUTE_NAMES[chosen.route as ClassRoute]} · {STAGE_NAMES[chosen.stage - 1]}）：
            <b className="num">{chosen.price.toLocaleString()}</b> 金币{gold >= chosen.price ? `，剩 ${(gold - chosen.price).toLocaleString()}` : '，金币不足'}
          </span>
          <button type="button" className="btn btn-ghost" onClick={() => setPick(null)}>取消</button>
          <button type="button" className="btn btn-primary" disabled={busy !== null || gold < chosen.price || unit.status !== 'active'}
            onClick={() => void act('buy', () => session.run<{ price: number }>(OP.BUY_CLASS_QUALIFICATION, { unitId: unit.id, classId: chosen.id }),
              r => `${unit.name}获得「${chosen.name}」资格，金币 −${r.price.toLocaleString()}`).then(ok => { if (ok) setPick(null); })}>
            {busy === 'buy' ? '购买中…' : '确认购买'}
          </button>
        </div>
      )}
      <p className="pfoot">资格按年份开放，可以跨路线购买；轮回会清空已购资格，不退款。现在转职仍沿相邻职业进行，暂不检查资格。</p>
    </section>
  );
}

// 退役与轮回 (docs/00 §5.2, §7.4): both are permanent, so each panel lists what it needs and does, and
// asks once more before the op runs.
export function RetireTab({ unit }: { unit: ServerUnit }) {
  return (
    <div className="cols2">
      <RetirePanel unit={unit} />
      <ReincarnatePanel unit={unit} />
    </div>
  );
}

function RetirePanel({ unit }: { unit: ServerUnit }) {
  const { legacies } = useSession();
  const { busy, act } = useAct();
  const [sure, setSure] = useState(false);
  const minLevel = legacies?.minLevel ?? LEGACY_MIN_LEVEL;
  const leaves = !unit.isProtagonist && unit.lineageDepth === 0 && unit.level >= minLevel;
  return (
    <section className="panel" aria-labelledby="rt-h">
      <div className="ph"><h2 id="rt-h">退役</h2><span className={`tag ${leaves ? 'tag-green' : 'tag-grey'}`}>{leaves ? '会留下遗产' : '不会留下遗产'}</span></div>
      <p className="sys-note">退役后{unit.name}不再出战，携带的武器和道具回到仓库，名字写进纪念名册。退役不能撤销；普通解雇不会留下遗产。</p>
      <div className="grp">留下遗产的条件</div>
      <Checks items={[
        [unit.level >= minLevel, `等级 ${unit.level} / ${minLevel}`],
        [!unit.isProtagonist, unit.isProtagonist ? '主角不能退役，也不会留下遗产' : '不是主角'],
        [unit.lineageDepth === 0, unit.lineageDepth === 0 ? '本人没有接受过遗产' : '本人接受过遗产：传承只有一代，不能再传下去'],
      ]} />
      {sure && <p className="a-warn" role="alert">确定让{unit.name}退役吗？{leaves ? '会留下一份遗产，可以在「传承」里交给 1 级新角色。' : '不满足条件，不会留下遗产。'}</p>}
      <div className="go-bar">
        {sure && <button type="button" className="btn btn-ghost" onClick={() => setSure(false)}>再想想</button>}
        <button type="button" className={`btn ${sure ? 'btn-danger' : ''}`} disabled={busy !== null || unit.isProtagonist || unit.status !== 'active'}
          onClick={() => (sure
            ? void act('retire', () => session.run<{ legacyId: string | null }>(OP.RETIRE_UNIT, { unitId: unit.id }),
              r => (r.legacyId ? `${unit.name}退役了，留下一份遗产` : `${unit.name}退役了`)).then(ok => { if (ok) go(leaves ? links.legacy : links.roster()); })
            : setSure(true))}>
          {busy === 'retire' ? '退役中…' : sure ? `确认让${unit.name}退役` : `让${unit.name}退役…`}
        </button>
      </div>
    </section>
  );
}

const ZERO = Object.fromEntries(STAT_KEYS.map(k => [k, 0])) as Record<StatKey, number>;

function ReincarnatePanel({ unit }: { unit: ServerUnit }) {
  const { state, run } = useSession();
  const { busy, act } = useAct();
  const [alloc, setAlloc] = useState<Record<StatKey, number>>(ZERO);
  const [sure, setSure] = useState(false);
  if (!state) return null;
  const cores = stock(state, 'reincarnation_core');
  const inRun = !!run && (run.state === 'battle' || run.state === 'between_maps') && run.unitIds.includes(unit.id);
  const used = STAT_KEYS.reduce((n, k) => n + alloc[k], 0);
  const initial = CLASSES[initialClassOf(CHARACTERS[unit.character].classId)].name;
  const prior = STAT_KEYS.some(k => (unit.growthAllocation[k] ?? 0) !== 0);
  const ready = unit.level >= REINCARNATION_LEVEL && unit.cycle === 0 && !unit.isProtagonist && !inRun && cores > 0 && state.gold >= REINCARNATION_GOLD;
  const bump = (k: StatKey, d: number) => setAlloc(a => {
    const next = Math.max(0, Math.min(REINCARNATION_STAT_MAX, a[k] + d));
    return used - a[k] + next > REINCARNATION_POINTS ? a : { ...a, [k]: next };
  });

  return (
    <section className="panel" aria-labelledby="rc-h">
      <div className="ph"><h2 id="rc-h">轮回</h2><span className={`tag ${unit.cycle ? 'tag-brass' : 'tag-grey'}`}>{unit.cycle ? '已轮回' : '一生一次'}</span></div>
      <p className="sys-note">
        回到 1 级与初始职业（{initial}），年龄 16 岁；清空武器熟练度、职业资格和学习进度，能力药额度重置；携带的武器与道具回到仓库。身份、纪念记录和传承关系保留。
      </p>
      <Checks items={[
        [unit.level >= REINCARNATION_LEVEL, `等级 ${unit.level} / ${REINCARNATION_LEVEL}`],
        [unit.cycle === 0, unit.cycle === 0 ? '还没轮回过' : '已经轮回过，一生只能一次'],
        [!unit.isProtagonist, unit.isProtagonist ? '主角不能轮回' : '不是主角'],
        [!inRun, inRun ? '正在远征中' : '不在远征中'],
        [cores > 0, cores > 0 ? `轮回核心：仓库 ${cores} 枚` : '缺少轮回核心：仓库里没有，商店也不卖'],
        [state.gold >= REINCARNATION_GOLD, `金币 ${state.gold.toLocaleString()} / ${REINCARNATION_GOLD.toLocaleString()}`],
      ]} />
      <div className="grp">额外成长分配 · 还剩 {REINCARNATION_POINTS - used} / {REINCARNATION_POINTS} 点（单项最多 {REINCARNATION_STAT_MAX}）</div>
      <div className="alloc">
        {STAT_KEYS.map(k => {
          const base = CHARACTERS[unit.character].growth[k];
          return (
            <div key={k}>
              <span className="al-k">{STAT_NAMES[k]}</span>
              <button type="button" className="btn btn-sm" aria-label={`${STAT_NAMES[k]} −1`} disabled={alloc[k] === 0} onClick={() => bump(k, -1)}>−</button>
              <b className="num">{alloc[k]}</b>
              <button type="button" className="btn btn-sm" aria-label={`${STAT_NAMES[k]} +1`} disabled={alloc[k] >= REINCARNATION_STAT_MAX || used >= REINCARNATION_POINTS} onClick={() => bump(k, 1)}>+</button>
              <span className="al-v">个人成长 {base}%{alloc[k] > 0 && <> → <b>{base + alloc[k]}%</b></>}</span>
            </div>
          );
        })}
      </div>
      {prior && <p className="pfoot">现有的成长分配（含成长传承带来的部分）会被这次的分配替换。</p>}
      {sure && <p className="a-warn" role="alert">确定让{unit.name}轮回吗？等级、职业与学习成果会清空，这一步不能撤销。</p>}
      <div className="go-bar">
        {sure && <button type="button" className="btn btn-ghost" onClick={() => setSure(false)}>再想想</button>}
        <button type="button" className={`btn ${sure ? 'btn-danger' : 'btn-primary'}`} disabled={busy !== null || !ready}
          onClick={() => (sure
            ? void act('rebirth', () => session.run(OP.REINCARNATE_UNIT, { unitId: unit.id, allocation: alloc }), () => `${unit.name}完成轮回，回到 ${initial} 与 16 岁`).then(ok => { if (ok) { setSure(false); setAlloc(ZERO); } })
            : setSure(true))}>
          {busy === 'rebirth' ? '轮回中…' : sure ? `确认让${unit.name}轮回` : '轮回…'}
        </button>
      </div>
    </section>
  );
}
