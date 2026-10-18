// Turns engine events into the compact 战况记录 lines. Each command becomes one line.
import { STAT_NAMES } from '@common/data/types.ts';
import type { StatKey } from '@common/data/types.ts';
import { GAME_ITEMS } from '@common/game/items.ts';
import type { ItemKey } from '@common/game/items.ts';
import type { BattleEvent, BattleState, Side } from '@common/engine/index.ts';
import { artInfo, spellInfo, weaponLabel } from './commands.ts';
import { displayName } from './names.ts';

export interface LogEntry {
  id: number;
  turn: number;
  side: Side;
  kind: 'a' | 'e' | 'g';
  text: string;
  // The event the line describes (回放 filters by it).
  t: BattleEvent['t'];
}

let nextId = 1;

export function describe(events: BattleEvent[], before: BattleState): LogEntry[] {
  const name = (id: string) => displayName(before, id);
  const sideOf = (id: string) => before.units.find(u => u.id === id)?.side ?? 'player';
  let turn = before.turn, phase: Side = before.phase;
  const entries: LogEntry[] = [];
  let moved = new Set<string>();
  let t: BattleEvent['t'] = 'wait';
  const push = (text: string, kind: LogEntry['kind'], side: Side = phase) => entries.push({ id: nextId++, turn, side, kind, text, t });
  const mark = (id: string): LogEntry['kind'] => (sideOf(id) === 'player' ? 'a' : 'e');

  for (const e of events) {
    t = e.t;
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
        const weapon = weaponLabel(e.weapons[0]);
        const counter = e.weapons[1] ? '' : `（${name(e.defender)} 无法反击）`;
        push(`${name(e.attacker)} 用${weapon}攻击 ${name(e.defender)}${counter}：${parts.join('，') || '未出手'}。`, mark(e.attacker));
        break;
      }
      case 'defeated':
        push(`${name(e.unit)} 被击败，退出战斗。`, mark(e.unit));
        break;
      case 'seize':
        push(`${name(e.unit)} 压制了王座。`, mark(e.unit));
        break;
      case 'loot':
        push(`${name(e.unit)} 拾取物资箱（共 ${e.boxes} 箱）。`, mark(e.unit));
        break;
      case 'drop':
        push(`${name(e.unit)} 的 ${e.boxes} 箱物资落在原地。`, mark(e.unit));
        break;
      case 'escape':
        push(`${name(e.unit)} 撤离了战场。`, mark(e.unit));
        break;
      case 'object': {
        const label = before.objects?.find(o => o.id === e.object)?.label ?? '物件';
        push(`${name(e.by)} ${e.state === 'destroyed' ? '破坏' : e.state === 'open' || e.state === 'opened' ? '打开' : e.state === 'visited' ? '访问' : '启动'}了${label}。`, mark(e.by));
        break;
      }
      case 'treasure': {
        const label = before.objects?.find(o => o.id === e.object)?.label ?? '宝物';
        push(`${name(e.unit)} 从${label}获得 ${GAME_ITEMS[e.item as ItemKey]?.name ?? e.item} ×${e.count}。`, mark(e.unit));
        break;
      }
      case 'art': {
        // The art event follows its exchange: tag that line instead of adding a new one.
        const last = [...entries].reverse().find(entry => entry.t === 'combat');
        const art = artInfo(e.art);
        if (last) last.text = `【战技·${art?.name ?? e.art}】${last.text}`;
        else push(`${name(e.unit)} 使用战技「${art?.name ?? e.art}」。`, mark(e.unit));
        break;
      }
      case 'cast':
        push(`${name(e.unit)} 对 ${name(e.target)} 施放「${spellInfo(e.spell)?.name ?? e.spell}」。`, mark(e.unit));
        break;
      case 'dance':
        push(`${name(e.unit)} 为 ${name(e.target)} 起舞，${name(e.target)} 可以再行动一次。`, mark(e.unit));
        break;
      case 'shield':
        push(`${name(e.unit)} 的不朽盾发动：保留 1 HP 并石化到下个己方阶段。`, mark(e.unit));
        break;
      case 'spawn':
        push(`增援抵达：${name(e.unit)}。`, mark(e.unit));
        break;
      case 'scenario':
        push(e.message, 'g');
        break;
      case 'hazard':
        if (e.kind === 'damage') push(`${name(e.unit)} 被${e.source === 'ballista' ? '炮台' : e.source === 'ember' ? '余烬' : '机关'}命中，损失 ${e.amount} HP（剩余 ${e.hpAfter}）。`, mark(e.unit));
        else push(`${name(e.unit)} 被状态杖命中。`, mark(e.unit));
        break;
      case 'status': {
        const label = { sleep: '睡眠', silence: '沉默', berserk: '混乱', petrified: '石化', regen: '再生' }[e.status];
        push(`${name(e.unit)} ${e.active ? `陷入${label}${e.turns ? `（${e.turns} 回合）` : ''}` : `解除${label}`}。`, mark(e.unit));
        break;
      }
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
