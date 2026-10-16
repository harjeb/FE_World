import { useEffect, useMemo } from 'react';
import { ARENA_MAPS } from '@common/arena/maps.ts';
import { arenaPoints } from '@common/arena/rules.ts';
import { unitById } from '@common/engine/index.ts';
import { BattlePage } from '../battle/BattlePage.tsx';
import { fallenLine } from '../battle/Dialogs.tsx';
import type { BattleSession } from '../battle/session.ts';
import { go, links } from '../router.ts';
import { attackIndex } from './ArenaParts.tsx';
import { session as api } from '../api/session.ts';
import { arena } from './store.ts';

// Step 5–6: the attack itself on the shared battle page. Every accepted command is saved, so 暂离 or
// a reload continues the same battle; the end result is scored by docs/05 and cannot be replayed.
export function ArenaBattle({ id }: { id: string }) {
  const defense = arena.opponent(id);
  const record = defense ? arena.record(id) : null;
  const ready = !!defense && !!record?.battle;

  useEffect(() => {
    if (!defense) go(links.arena);
    else if (record?.status === 'new') go(links.ban(id));
    else if (record?.status === 'revealed') go(links.deploy(id));
  }, [defense, record, id]);

  const session = useMemo<BattleSession | null>(() => {
    if (!defense || !record?.battle) return null;
    const map = ARENA_MAPS[defense.map];
    const state = record.battle;
    const lead = state.units.find(u => u.side === 'player' && u.boss)!;
    const goal = state.goal.kind === 'boss'
      ? `击败主将 · ${unitById(state, state.goal.target).name}${map.goalText.includes('全灭') ? '（或全灭）' : ''}`
      : state.goal.kind === 'seize' ? `主将 ${lead.name} 压制王座`
      : `全灭防守方 ${state.units.filter(u => u.side === 'enemy').length} 人`;
    return {
      key: `arena-${id}`,
      initial: state,
      meta: {
        region: `竞技场 · 进攻 ${attackIndex(id)} / 3 · ${defense.legion}`,
        goal,
        extraLabel: '积分',
        extraValue: `胜 +20 · 无阵亡 +5 · ${Math.floor(map.turnLimit / 2)} 回合内 +5`,
      },
      surrender: true,
      apply: action => api.applyBattle(record.battleId!, action),
      onChange: next => arena.saveBattle(id, next),
      exit: { label: '暂离（战斗保留）', href: links.arena },
      result: end => {
        const p = arenaPoints(end);
        const won = end.result?.winner === 'player';
        const parts = won ? [`胜利 +${p.win}`, p.flawless ? `无人阵亡 +${p.flawless}` : '有人阵亡 +0', p.swift ? `速胜 +${p.swift}` : '未在半数回合内获胜 +0'] : ['落败 0'];
        return {
          title: won ? '进攻胜利' : '进攻失败',
          won,
          lines: [fallenLine(end), `本场积分 ${p.total}：${parts.join(' · ')}。`, '回放已保存，可以在「战报」里看。'],
          action: { label: '返回竞技场', run: () => go(links.arena) },
        };
      },
    };
    // Built once per attack: later saves must not remount the battle page.
  }, [id, ready]);

  if (!session) return null;
  return <BattlePage key={session.key} session={session} />;
}
