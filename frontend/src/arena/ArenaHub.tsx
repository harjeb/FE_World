import { MY_DEFENSE, OPPONENTS } from '@common/arena/demo.ts';
import { ARENA_MAPS } from '@common/arena/maps.ts';
import { arenaPoints } from '@common/arena/rules.ts';
import { CHARACTERS } from '@common/data/characters.ts';
import type { Behavior } from '@common/engine/index.ts';
import { links } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { Crest, SnapshotTag } from './ArenaParts.tsx';
import { arena, useArena } from './store.ts';
import type { AttackRecord } from './store.ts';

const STATUS: Record<AttackRecord['status'], [string, string]> = {
  new: ['○ 未开始', 'todo'],
  revealed: ['● 待部署', 'live'],
  fighting: ['● 进行中', 'live'],
  won: ['✓ 胜利', 'win'],
  lost: ['✕ 落败', 'lose'],
};

const BEHAVIOR_NAMES: Record<Behavior, string> = { aggressive: '进攻', opportunist: '伺机', hold: '固守', guard: '护卫', healer: '治疗优先' };

function outcome(record: AttackRecord): string {
  const battle = record.battle;
  if (!battle?.result) return '';
  const p = arenaPoints(battle);
  if (battle.result.reason === '投降') return '已投降，按落败计';
  return p.total > 0 ? `第 ${battle.turn} 回合${battle.result.reason}${p.flawless ? ' · 无人阵亡' : ''}` : `第 ${battle.turn} 回合 · ${battle.result.reason}`;
}

// 竞技场日 (ArenaResults artboard): three attacks to play today, my defense, scoring.
export function ArenaHub() {
  const day = useArena();
  const myMap = ARENA_MAPS[MY_DEFENSE.map];
  return (
    <Shell current="arena">
      <div className="headrow">
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>第 6 月竞技场 · 竞技场日</h1>
        <SnapshotTag />
      </div>
      <p style={{ fontSize: 13, color: '#4E473D' }}>今日 24:00 截止；未完成的进攻按落败计。每个对手只能进攻一次，开始后不能重来。</p>

      <div className="sum">
        <div><span>今日积分</span><b className="num">{day.points}</b></div>
        <div><span>进攻</span><b className="num">{day.done} / {OPPONENTS.length}</b><small>已完成</small></div>
        <div><span>防守</span><b style={{ fontSize: 16 }}>24:00 后结算</b><small>3 名玩家进攻我方快照</small></div>
      </div>

      <div className="arena-cols">
        <section className="panel" aria-labelledby="atk-h" style={{ flex: '999 1 560px', minWidth: 0 }}>
          <div className="ph"><h2 id="atk-h">我方进攻</h2><span style={{ fontSize: 12, color: '#6A6256' }}>防守方由规则 AI 按其设置操作</span></div>
          <ol>
            {OPPONENTS.map(o => {
              const record = day.attacks[o.id];
              const map = ARENA_MAPS[o.map];
              const [label, tone] = STATUS[record.status];
              const finished = record.status === 'won' || record.status === 'lost';
              const action = record.status === 'new' ? ['查看对手', links.ban(o.id)]
                : record.status === 'revealed' ? ['继续部署', links.deploy(o.id)]
                  : record.status === 'fighting' ? ['继续战斗', links.battle(o.id)] : ['查看结果', links.battle(o.id)];
              return (
                <li key={o.id} className="match">
                  <span className={`res ${tone}`}>{label}</span>
                  <Crest id={o.id} size={40} />
                  <div className="min-w-0">
                    <div className="m-n">{o.legion} · {map.name}</div>
                    <div className="m-d">{finished ? outcome(record) : `出战 ${map.deploy} · 禁用 ${map.bans} · ${map.turnLimit} 回合 · ${map.goalText}`}</div>
                  </div>
                  <div className="pts">
                    <b style={{ color: record.points > 0 ? '#2C4A5E' : undefined }}>{finished ? `+${record.points}` : '—'}</b>
                    <span>{finished ? '本场积分' : `对手积分 ${o.points.toLocaleString()}`}</span>
                  </div>
                  <a className={`btn btn-sm${record.status === 'new' || record.status === 'revealed' || record.status === 'fighting' ? ' btn-primary' : ''}`} href={action[1]}>{action[0]}</a>
                </li>
              );
            })}
          </ol>
        </section>

        <div className="flex flex-col gap-3" style={{ flex: '1 1 340px', minWidth: 0 }}>
          <section className="panel" aria-labelledby="def-h">
            <div className="ph"><h2 id="def-h">我方防守</h2><span className="tag tag-grey">{myMap.name} · {myMap.deploy} + {myMap.bans}</span></div>
            <ul className="info">
              {MY_DEFENSE.slots.map((s, i) => (
                <li key={s.unit.character}>
                  <span>{i + 1}. {CHARACTERS[s.unit.character].name}{MY_DEFENSE.commanders[0] === s.unit.character ? '（主将）' : ''}</span>
                  <span className="muted">Lv {s.unit.level} · {BEHAVIOR_NAMES[s.behavior]}</span>
                </li>
              ))}
              <li><span>预设禁用</span><b>{MY_DEFENSE.bans.map(c => CHARACTERS[c].name).join('、') || '无'}</b></li>
            </ul>
            <p style={{ padding: '0 14px 12px', fontSize: 12, color: '#6A6256' }}>防守设置已随快照锁定；防守结果与回放在 24:00 后公开。</p>
          </section>
          <section className="panel" aria-labelledby="rule-h">
            <div className="ph"><h2 id="rule-h">积分规则</h2></div>
            <ul className="info">
              <li><span>进攻胜利</span><b>+20</b></li>
              <li><span>无人阵亡</span><b>+5</b></li>
              <li><span>回合数在上限一半以内获胜</span><b>+5</b></li>
              <li><span>防守成功</span><b>+10</b></li>
              <li><span>失败、投降、未完成</span><b>0</b></li>
            </ul>
          </section>
          <button type="button" className="btn btn-ghost btn-sm self-start" onClick={() => arena.reset()}>
            重置今日进攻（演示用）
          </button>
        </div>
      </div>
    </Shell>
  );
}
