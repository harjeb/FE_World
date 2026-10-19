import { useId } from 'react';
import type { AiDifficulty } from '@common/engine/types.ts';
import { HARD_ENEMY_EFFECT } from '@common/game/enemies.ts';

export const difficultyLabel = (value?: AiDifficulty) => value === 'hard' ? '困难' : '普通';

export function DifficultyChoice({ value, onChange, disabled, hardUnlocked, unlockReason = '以普通难度通关此内容后解锁困难。' }: {
  value: AiDifficulty; onChange: (value: AiDifficulty) => void; disabled: boolean;
  hardUnlocked: boolean; unlockReason?: string;
}) {
  const id = useId();
  return (
    <fieldset disabled={disabled} aria-describedby={`${id}-help${hardUnlocked ? '' : ` ${id}-unlock`}`} style={{ border: 0, padding: '12px 16px', margin: 0 }}>
      <legend style={{ fontWeight: 600 }}>战斗难度</legend>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {(['normal', 'hard'] as const).map(option => (
          <label key={option} className="btn" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', minHeight: 44 }}>
            <input type="radio" name={id} value={option} checked={(hardUnlocked ? value : 'normal') === option} disabled={option === 'hard' && !hardUnlocked} onChange={() => onChange(option)} />
            {difficultyLabel(option)}
          </label>
        ))}
      </div>
      {!hardUnlocked && <p id={`${id}-unlock`} role="note" style={{ fontSize: 13, marginTop: 8, color: '#4E473D' }}>困难未解锁：{unlockReason}</p>}
      <p id={`${id}-help`} style={{ fontSize: 13, marginTop: 8, color: '#4E473D' }}>普通会集火、治疗和避险；困难会推演连续行动、安排让位，{HARD_ENEMY_EFFECT}。任务固定奖励与行动日成本不变；更多、更高等级的敌军会带来更多战斗经验与掉落机会。出发后整场战斗或远征的难度锁定，刷新不会重随机。</p>
    </fieldset>
  );
}
