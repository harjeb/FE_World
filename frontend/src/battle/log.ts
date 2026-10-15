// Turns engine events into the compact 战况记录 lines. Each command becomes one line.
import { STAT_NAMES } from '@common/data/types.ts';
import type { StatKey } from '@common/data/types.ts';
import { WEAPONS } from '@common/data/weapons.ts';
import type { BattleEvent, BattleState, Side } from '@common/engine/index.ts';
import { displayName } from './names.ts';

export interface LogEntry {
  id: number;
  turn: number;
  side: Side;
  kind: 'a' | 'e' | 'g';
  text: string;
}

let nextId = 1;

export function describe(events: BattleEvent[], before: BattleState): LogEntry[] {
  const name = (id: string) => displayName(before, id);
  const sideOf = (id: string) => before.units.find(u => u.id === id)?.side ?? 'player';
  let turn = before.turn, phase: Side = before.phase;
  const entries: LogEntry[] = [];
  let moved = new Set<string>();
  const push = (text: string, kind: LogEntry['kind'], side: Side = phase) => entries.push({ id: nextId++, turn, side, kind, text });
  const mark = (id: string): LogEntry['kind'] => (sideOf(id) === 'player' ? 'a' : 'e');

  for (const e of events) {
    switch (e.t) {
      case 'phase':
        turn = e.turn;
        phase = e.side;
        moved = new Set();
        break;
      case 'move':
        moved.add(e.unit);
        break;
      case 'wait':
        push(`${name(e.unit)} ${moved.has(e.unit) ? '移动后待机' : '待机'}。`, mark(e.unit));
        break;
      case 'combat': {
        const parts = e.strikes.map(s => {
          const result = !s.hit ? '未命中' : s.crit ? `必杀 ${s.damage}` : `命中 ${s.damage}`;
          return `${name(s.by)} ${result}`;
        });
        const weapon = WEAPONS[e.weapons[0]].name;
        const counter = e.weapons[1] ? '' : `（${name(e.defender)} 无法反击）`;
        push(`${name(e.attacker)} 用${weapon}攻击 ${name(e.defender)}${counter}：${parts.join('，') || '未出手'}。`, mark(e.attacker));
        break;
      }
      case 'defeated':
        push(`${name(e.unit)} 被击败，退出战斗。`, mark(e.unit));
        break;
      case 'heal':
        if (e.source === 'terrain') push(`${name(e.target)} 在据点回复 ${e.amount} HP。`, 'g');
        else if (e.source === 'item') push(`${name(e.target)} 使用伤药，回复 ${e.amount} HP。`, mark(e.target));
        else push(`${name(e.by!)} 治疗 ${name(e.target)}，回复 ${e.amount} HP。`, mark(e.by!));
        break;
      case 'levelUp': {
        const gains = Object.entries(e.gains).map(([k, v]) => `${STAT_NAMES[k as StatKey]} +${v}`);
        push(`${name(e.unit)} 升至 Lv ${e.level}：${gains.length > 0 ? gains.join(' · ') : '没有属性提升'}。`, 'g');
        break;
      }
      case 'end':
        push(`战斗结束：${e.reason}。`, e.winner === 'player' ? 'a' : 'e');
        break;
    }
  }
  return entries;
}
