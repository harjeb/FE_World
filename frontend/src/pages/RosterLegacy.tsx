import { useState } from 'react';
import { CHARACTERS } from '@common/data/characters.ts';
import { CLASSES, CLASS_PATHS, initialClass, initialClassOf, ROUTE_NAMES, STAGE_NAMES, canonicalClassId, classEntryReason, CLASS_REQUIRED_RANK } from '@common/data/classes.ts';
import type { ClassId, ClassRoute } from '@common/data/classes.ts';
import { STAT_KEYS, STAT_NAMES, WEAPON_TYPE_NAMES } from '@common/data/types.ts';
import type { StatKey, WeaponType } from '@common/data/types.ts';
import { LEGACY_MIN_LEVEL, REINCARNATION_GOLD, REINCARNATION_LEVEL, REINCARNATION_POINTS, REINCARNATION_STAT_MAX, reincarnationBase, totalStats } from '@common/game/legacy.ts';
import { OP } from '@common/protocol/ops.ts';
import { regionById } from '@common/game/calendar.ts';
import { session, useSession } from '../api/session.ts';
import type { ClassMarketRow, ServerUnit } from '../api/session.ts';
import { useServerData } from '../api/useServerData.ts';
import { busyReason } from '../model/roster.ts';
import { go, links } from '../router.ts';
import { eraYear } from '../ui/calendar.ts';
import { personalGrowth } from './RosterParts.tsx';
import { Checks, stock, useAct } from './SystemParts.tsx';

const ROUTES = Object.keys(CLASS_PATHS) as ClassRoute[];
const STAGES = [1, 2, 3, 4, 5] as const;

// Which class routes a unit's species may buy into (handlers.ts::BUY_CLASS_QUALIFICATION).
const allowed = (unit: ServerUnit, route: ClassRoute) =>
  unit.species === 'beast' ? route === 'beast' : unit.species === 'dragon' ? route === 'dragon' : route !== 'beast' && route !== 'dragon';

// 本命职业与已购资格可以免费切回（SWITCH_CLASS，不占月度购买额度）。
const homeClass = (unit: ServerUnit) => canonicalClassId((unit.homeClassId ?? CHARACTERS[unit.character].classId) as ClassId);

// 职业资格 (docs/00 §5「职业按年份开放并花钱购买，允许跨路线」): every class by route and stage, when it
// opens and its price. Picking a class shows its real growth for this unit; owned ones switch for free.
export function ClassMarketPanel({ unit }: { unit: ServerUnit }) {
  const { state, annual } = useSession();
  const { data, error } = useServerData(() => session.classMarket(unit.id), [unit.id]);
  const { busy, act } = useAct();
  const [pick, setPick] = useState<string | null>(null);
  if (!data) return <section className="panel"><p className="sys-note">{error ? `读不到职业市场：${error}` : '读取职业市场…'}</p></section>;
  const gold = state?.gold ?? 0;
  const owned = data.classes.filter(c => c.owned);
  const head = STAGES.map(s => data.classes.find(c => c.stage === s));
  const chosen = data.classes.find(c => c.id === pick) ?? null;
  const current = data.classes.find(c => c.id === canonicalClassId(unit.classId as ClassId)) ?? null;
  const excluded = ROUTES.filter(r => !allowed(unit, r));
  const away = busyReason(unit, annual);
  const free = (c: ClassMarketRow) => c.owned || c.id === homeClass(unit);
  const quotaLeft = data.monthLimit - data.monthUsed;
  const reasonFor = (c: ClassMarketRow) => free(c) ? classEntryReason({ ...unit, classId: unit.classId as ClassId, homeClassId: unit.homeClassId as ClassId }, c.id as ClassId, (unit.homeClassId ?? CHARACTERS[unit.character].classId) as ClassId) : c.eligibilityReason;
  const entryReason = chosen ? reasonFor(chosen) : null;

  const cell = (c: ClassMarketRow) => {
    const isCurrent = c.id === canonicalClassId(unit.classId as ClassId);
    const state = free(c) ? 'owned' : c.eligibilityReason && !c.unavailableReason ? 'locked' : !c.open ? 'locked' : '';
    return (
      <button key={c.id} type="button" className={`mk-cls ${state}`} aria-pressed={pick === c.id} onClick={() => setPick(c.id)}
        title={c.unavailableReason ?? reasonFor(c) ?? (c.open ? undefined : `${eraYear(c.openYear)}开放`)}>
        {free(c) && '✓ '}{c.name}{isCurrent && <i>当前</i>}{c.unavailableReason && <i>待实现</i>}
      </button>
    );
  };

  return (
    <section className="panel" aria-labelledby="mk-h">
      <div className="ph"><h2 id="mk-h">职业资格 · {eraYear(data.year)}</h2><span style={{ fontSize: 12, color: '#6A6256' }}>{unit.name}已拥有 {owned.length} 项 · 本月还能买 {Math.max(0, quotaLeft)} / {data.monthLimit} 项 · 金币 {gold.toLocaleString()}</span></div>
      <div className="tbl-scroll">
        <table className="mk-table">
          <thead>
            <tr>
              <th scope="col">路线</th>
              {head.map((c, i) => <th key={STAGES[i]} scope="col">{STAGE_NAMES[i]}{c && <small>{c.open ? '已开放' : `${eraYear(c.openYear)}开放`} · {c.price.toLocaleString()} 金</small>}</th>)}
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
          {unit.species === 'human' ? `${excluded.map(r => ROUTE_NAMES[r]).join('、')}路线需要对应种族${unit.isProtagonist ? '；主角不能使用兽、龙职业' : ''}。` : `${unit.name}只能沿${ROUTE_NAMES[unit.species]}路线逐阶进阶，不能跳阶、降阶或跨种族转职。`}
        </p>
      )}
      {chosen && (
        <div className="mk-buy">
          <div className="promo-confirm" style={{ border: 0 }}>
            <span style={{ flex: 1, minWidth: 220 }}>
              <b>「{chosen.name}」</b>（{ROUTE_NAMES[chosen.route as ClassRoute]} · {STAGE_NAMES[chosen.stage - 1]}）
              {free(chosen) ? ' · 已有免费切换权限（仍需满足准入条件）' : ` · 资格 ${chosen.price.toLocaleString()} 金币${gold >= chosen.price ? `，购买后剩 ${(gold - chosen.price).toLocaleString()}` : '，金币不足'}`}
            </span>
            <button type="button" className="btn btn-ghost" onClick={() => setPick(null)}>取消</button>
            {free(chosen)
              ? <button type="button" className="btn btn-primary" disabled={busy !== null || chosen.id === current?.id || !!entryReason || !!away}
                onClick={() => void act('switch', () => session.run(OP.SWITCH_CLASS, { unitId: unit.id, classId: chosen.id }), () => `${unit.name}切换为${chosen.name}`).then(ok => { if (ok) setPick(null); })}>
                {busy === 'switch' ? '切换中…' : chosen.id === current?.id ? '当前职业' : '免费切换'}
              </button>
              : <button type="button" className="btn btn-primary" disabled={busy !== null || gold < chosen.price || !chosen.open || !!chosen.eligibilityReason || quotaLeft <= 0 || !!away}
                onClick={() => void act('buy', () => session.run<{ price: number }>(OP.BUY_CLASS_QUALIFICATION, { unitId: unit.id, classId: chosen.id }),
                  r => `${unit.name}获得「${chosen.name}」资格，金币 −${r.price.toLocaleString()}`).then(ok => { if (ok) setPick(null); })}>
                {busy === 'buy' ? '购买中…' : '确认购买资格'}
              </button>}
          </div>
          <p className="pfoot">准入熟练度：{(Object.keys(chosen.weapons) as WeaponType[]).map(type => WEAPON_TYPE_NAMES[type]).join('／')}中任意一种达到 {CLASS_REQUIRED_RANK[chosen.stage as keyof typeof CLASS_REQUIRED_RANK]}（购买起始职业资格也需要；返回当前／起始职业除外）。</p>
          {(entryReason || chosen.unavailableReason || !chosen.open || away) && (
            <p className="pfoot why">{chosen.unavailableReason ?? entryReason ?? (away ? `${unit.name}${away}，不能换职或购买资格` : `${eraYear(chosen.openYear)}开放`)}</p>
          )}
          {chosen.growth && current?.growth && (
            <div className="tbl-scroll">
              <table className="st cmp">
                <thead><tr><th scope="col">合计成长</th>{STAT_KEYS.map(k => <th key={k} scope="col">{STAT_NAMES[k]}</th>)}</tr></thead>
                <tbody>
                  <tr><th scope="row">{current.name}（现在）</th>{STAT_KEYS.map(k => <td key={k}>{current.growth![k]}%</td>)}</tr>
                  <tr><th scope="row">{chosen.name}</th>{STAT_KEYS.map(k => {
                    const d = chosen.growth![k] - current.growth![k];
                    return <td key={k}>{chosen.growth![k]}%{d !== 0 && <i className={d > 0 ? 'd-up' : 'd-dn'}>{d > 0 ? `+${d}` : `−${-d}`}</i>}</td>;
                  })}</tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <p className="pfoot">资格按年份开放，购买新资格受现实月额度限制；已购资格和本命职业随时免费切回，学会的技能与精通保留。人类可以跨路线；兽人与龙人只能沿本族路线逐阶进阶。轮回清空资格，不退款。</p>
    </section>
  );
}

// 退役与轮回 (docs/00 §5.2, §7.4): both are permanent, so each panel lists what it needs, what it keeps,
// what it clears, and asks once more before the op runs.
export function RetireTab({ unit }: { unit: ServerUnit }) {
  return (
    <div className="cols2">
      <RetirePanel unit={unit} />
      <ReincarnatePanel unit={unit} />
    </div>
  );
}

function RetirePanel({ unit }: { unit: ServerUnit }) {
  const { legacies, state, annual } = useSession();
  const { busy, act } = useAct();
  const [sure, setSure] = useState(false);
  const minLevel = legacies?.minLevel ?? LEGACY_MIN_LEVEL;
  const leaves = !unit.isProtagonist && unit.lineageDepth === 0 && unit.level >= minLevel;
  const away = busyReason(unit, annual);
  return (
    <section className="panel" aria-labelledby="rt-h">
      <div className="ph"><h2 id="rt-h">退役</h2><span className={`tag ${leaves ? 'tag-green' : 'tag-grey'}`}>{leaves ? '会留下遗产' : '不会留下遗产'}</span></div>
      <p className="sys-note">退役后{unit.name}不再出战，携带的武器和道具连同剩余耐久／次数回到仓库，名字写进纪念名册。退役不能撤销；普通解雇不会留下遗产。</p>
      <div className="grp">留下遗产的条件</div>
      <Checks items={[
        [unit.level >= minLevel, `等级 ${unit.level} / ${minLevel}`],
        [!unit.isProtagonist, unit.isProtagonist ? '主角不能退役，也不会留下遗产' : '不是主角'],
        [unit.lineageDepth === 0, unit.lineageDepth === 0 ? '本人没有接受过遗产' : '本人接受过遗产：传承只有一代，不能再传下去'],
      ]} />
      {leaves && (
        <dl className="facts">
          <dt>遗产内容</dt><dd>冻结退役时的等级 {unit.level}、九项属性总和 {totalStats(unit.snapshot.stats)} 与个人基础成长；继承者二选一：成长传承或数值传承。</dd>
          <dt>兑现条件</dt><dd>{state?.legacyUnlocked ? '传承已解锁；' : '传承尚未解锁（完成林地、丘陵或湖镇的核心终章并领奖后开放）；'}交给一名没接受过遗产的 1 级现役角色，并消耗对应的传承石。</dd>
        </dl>
      )}
      {away && <p className="a-warn" role="note">{unit.name}{away}，现在不能退役。</p>}
      {sure && <p className="a-warn" role="alert">确定让{unit.name}退役吗？{leaves ? '会留下一份遗产，可以在「传承」里交给 1 级新角色。' : '不满足条件，不会留下遗产。'}</p>}
      <div className="go-bar">
        {sure && <button type="button" className="btn btn-ghost" onClick={() => setSure(false)}>再想想</button>}
        <button type="button" className={`btn ${sure ? 'btn-danger' : ''}`} disabled={busy !== null || unit.isProtagonist || unit.status !== 'active' || !!away}
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
  const { state, annual } = useSession();
  const { busy, act } = useAct();
  const [alloc, setAlloc] = useState<Record<StatKey, number>>(ZERO);
  const [sure, setSure] = useState(false);
  if (!state) return null;
  const cores = stock(state, 'reincarnation_core');
  const away = busyReason(unit, annual);
  const used = STAT_KEYS.reduce((n, k) => n + alloc[k], 0);
  const initialId = unit.species === 'human' ? initialClassOf((unit.homeClassId ?? CHARACTERS[unit.character].classId) as ClassId) : initialClass(unit.species);
  const initial = CLASSES[initialId];
  // 轮回后 1 级的固定基准（game/legacy.ts::reincarnationBase），与服务端执行用同一个函数。
  const base = reincarnationBase(unit.character, initialId, unit.crossTimeIdentity);
  const prior = STAT_KEYS.some(k => (unit.growthAllocation[k] ?? 0) !== 0);
  const ready = unit.level >= REINCARNATION_LEVEL && unit.cycle === 0 && !unit.isProtagonist && !away && cores > 0 && state.gold >= REINCARNATION_GOLD;
  const bump = (k: StatKey, d: number) => setAlloc(a => {
    const next = Math.max(0, Math.min(REINCARNATION_STAT_MAX, a[k] + d));
    return used - a[k] + next > REINCARNATION_POINTS ? a : { ...a, [k]: next };
  });
  const personal = (k: StatKey) => personalGrowth(unit, k) - (unit.growthAllocation[k] ?? 0);
  const carried = unit.snapshot.weapons.length + unit.snapshot.items.length;

  return (
    <section className="panel" aria-labelledby="rc-h">
      <div className="ph"><h2 id="rc-h">轮回</h2><span className={`tag ${unit.cycle ? 'tag-brass' : 'tag-grey'}`}>{unit.cycle ? '已轮回' : '一生一次'}</span></div>
      <Checks items={[
        [unit.level >= REINCARNATION_LEVEL, `等级 ${unit.level} / ${REINCARNATION_LEVEL}`],
        [unit.cycle === 0, unit.cycle === 0 ? '还没轮回过' : '已经轮回过，一生只能一次'],
        [!unit.isProtagonist, unit.isProtagonist ? '主角不能轮回' : '不是主角'],
        [!away, away ? `${away}中` : '没有被远征、派遣或赛事占用'],
        [cores > 0, cores > 0 ? `轮回核心：仓库 ${cores} 枚` : `缺少轮回核心：${regionById(5).name}的核心任务或挑战塔第一层首通可以获得，商店不卖`],
        [state.gold >= REINCARNATION_GOLD, `金币 ${state.gold.toLocaleString()} / ${REINCARNATION_GOLD.toLocaleString()}`],
      ]} />
      <div className="grp">轮回后 · {initial.name} Lv 1 的属性</div>
      <div className="tbl-scroll">
        <table className="st cmp">
          <thead><tr><th scope="col" /> {STAT_KEYS.map(k => <th key={k} scope="col">{STAT_NAMES[k]}</th>)}</tr></thead>
          <tbody>
            <tr><th scope="row">现在 Lv {unit.level}</th>{STAT_KEYS.map(k => <td key={k}>{unit.snapshot.stats[k] ?? 0}</td>)}</tr>
            <tr><th scope="row">轮回后</th>{STAT_KEYS.map(k => <td key={k}><b>{base[k]}</b></td>)}</tr>
          </tbody>
        </table>
      </div>
      <dl className="facts">
        <dt>清除</dt>
        <dd>等级与经验（回到 Lv 1）、升级记录、能力药额度、职业资格、各职业精通与学习进度、已学与已装备的技能、已学战技、武器熟练度{unit.hasInheritance ? '、数值传承的保底合同' : ''}{prior ? '、原有的成长分配（被这次分配替换）' : ''}；职业回到{initial.name}。</dd>
        <dt>保留</dt>
        <dd>姓名与形象、成长类型、个人基础成长{unit.inheritedGrowth ? '（含成长传承）' : ''}、传承关系（接受过遗产的仍不能再接）、纪念与战报记录；年龄回到 16 岁重新计算。</dd>
        <dt>物品</dt>
        <dd>{carried > 0 ? `携带的 ${carried} 件武器与道具连同剩余耐久／次数回到仓库。` : '没有携带物品。'}</dd>
        <dt>花费</dt>
        <dd>{REINCARNATION_GOLD.toLocaleString()} 金币 + 轮回核心 ×1</dd>
      </dl>
      <div className="grp">额外成长分配 · 还剩 {REINCARNATION_POINTS - used} / {REINCARNATION_POINTS} 点（单项最多 {REINCARNATION_STAT_MAX}）</div>
      <div className="alloc">
        {STAT_KEYS.map(k => (
          <div key={k}>
            <span className="al-k">{STAT_NAMES[k]}</span>
            <button type="button" className="btn btn-sm" aria-label={`${STAT_NAMES[k]} −1`} disabled={alloc[k] === 0} onClick={() => bump(k, -1)}>−</button>
            <b className="num">{alloc[k]}</b>
            <button type="button" className="btn btn-sm" aria-label={`${STAT_NAMES[k]} +1`} disabled={alloc[k] >= REINCARNATION_STAT_MAX || used >= REINCARNATION_POINTS} onClick={() => bump(k, 1)}>+</button>
            <span className="al-v">个人成长 {personal(k)}%{alloc[k] > 0 && <> → <b>{personal(k) + alloc[k]}%</b></>}</span>
          </div>
        ))}
      </div>
      {sure && <p className="a-warn" role="alert">确定让{unit.name}轮回吗？等级、职业与学习成果会清空，这一步不能撤销。</p>}
      <div className="go-bar">
        {sure && <button type="button" className="btn btn-ghost" onClick={() => setSure(false)}>再想想</button>}
        <button type="button" className={`btn ${sure ? 'btn-danger' : 'btn-primary'}`} disabled={busy !== null || !ready}
          onClick={() => (sure
            ? void act('rebirth', () => session.run(OP.REINCARNATE_UNIT, { unitId: unit.id, allocation: alloc }), () => `${unit.name}完成轮回，回到 ${initial.name} 与 16 岁`).then(ok => { if (ok) { setSure(false); setAlloc(ZERO); } })
            : setSure(true))}>
          {busy === 'rebirth' ? '轮回中…' : sure ? `确认让${unit.name}轮回` : '轮回…'}
        </button>
      </div>
    </section>
  );
}
