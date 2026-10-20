import { CROSS_TIME_DATA } from '@common/game/cross-time-data.ts';
import { CLASSES } from '@common/data/classes.ts';
import { SKILLS } from '@common/data/skills.ts';
import { STAT_KEYS, STAT_NAMES } from '@common/data/types.ts';
import { OP } from '@common/protocol/ops.ts';
import { session } from '../api/session.ts';
import { useServerData } from '../api/useServerData.ts';

import { useAct } from './SystemParts.tsx';

export function CrossTimeExchange() {
  const { data } = useServerData(() => session.crossTimeRecruits(), []);
  const { busy, act } = useAct();
  // 跨时空兑换未解锁时不渲染面板；但已兑换过的记录永久可见。
  const exchangedAny = data?.recruits.some(row => row.exchanged) ?? false;
  if (!data || (!data.unlocked && !exchangedAny)) return null;
  return <section className="panel" id="cross-time" aria-labelledby="cross-time-heading">
    <div className="ph"><h2 id="cross-time-heading">跨时空兑换</h2>
      {data && <span className="tag tag-brass">时空碎片 {data.shards} · 名额 {data.slotsUsed}/{data.slotLimit}</span>}
    </div>
    {data && <>
    {data.busy && <p className="sys-note" role="status">战斗、远征或年度赛事进行中，请先返回营地。</p>}
      {data.rosterFull && <p className="sys-note" role="status">名册已满，先腾出普通名册空位。</p>}
      <ul className="eq">
        {data.recruits.map(row => {
          const skill = SKILLS[row.personalSkill as keyof typeof SKILLS];
          const identity = CROSS_TIME_DATA.find(identity => identity.id === row.identityId);
          const stats = row.stats ?? identity?.level20;
          const cls = CLASSES[row.classId as keyof typeof CLASSES];
          return <li key={row.identityId} style={{ alignItems: 'start', flexWrap: 'wrap' }}>
            <div className="min-w-0" style={{ flex: '1 1 220px' }}>
              <div className="nm">{row.name} <span className="tag tag-grey">{cls?.name ?? row.classId} · Lv {row.level} · 成长型</span></div>
              <p className="sp">{skill ? `${skill.name}：${skill.text}` : row.personalSkill}</p>
              {stats && <details><summary>查看入队属性与成长</summary>
                <table className="fc-tbl"><caption className="sr-only">{row.name}的招募数据</caption>
                  <thead><tr><th scope="col">属性</th><th scope="col">Lv 20</th><th scope="col">成长率</th></tr></thead>
                  <tbody>{STAT_KEYS.map(key => <tr key={key}><th scope="row">{STAT_NAMES[key]}</th><td>{stats[key]}</td><td>{row.growth?.[key] ?? (identity && cls ? Math.max(0, identity.personalGrowth[key] + cls.growth[key]) + 5 : '—')}</td></tr>)}</tbody>
                </table><p className="sp">体格 {row.con ?? identity?.con ?? '—'}</p>
              </details>}
              {!row.exchanged && row.blockedReason && <p className="sp">{row.blockedReason}</p>}
            </div>
            {row.exchanged ? <span className="tag tag-grey">已兑换 · 永久记录</span> : <button type="button" className="btn btn-sm btn-primary"
              disabled={busy !== null || !row.eligible} title={row.blockedReason ?? undefined}
              onClick={() => void act(row.identityId, () => session.run(OP.EXCHANGE_CROSS_TIME_RECRUIT, { identityId: row.identityId }), () => `${row.name}加入名册，消耗 ${data.cost} 枚时空碎片`)}>
              {busy === row.identityId ? '兑换中…' : `兑换 ${row.name} · ${data.cost} 碎片`}
            </button>}
          </li>;
        })}
      </ul>
    </>}
  </section>;
}
