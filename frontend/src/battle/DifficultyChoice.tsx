import { useId } from 'react';
import type { AiDifficulty } from '@common/engine/types.ts';

export const difficultyLabel = (value?: AiDifficulty) => value === 'hard' ? '困难' : '普通';

export function DifficultyChoice({ value, onChange, disabled, hardUnlocked, unlockReason = '以普通难度通关此内容后解锁困难。' }: {
  value: AiDifficulty; onChange: (value: AiDifficulty) => void; disabled: boolean;
  hardUnlocked: boolean; unlockReason?: string;
}) {
  const id = useId();
  return (
    <fieldset disabled={disabled} style={{ border: 0, padding: '12px 16px', margin: 0 }}>
      <legend style={{ fontWeight: 600 }}>战斗难度</legend>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {(['normal', 'hard'] as const).map(option => (
          <label key={option} className="btn" title={option === 'hard' && !hardUnlocked ? `困难未解锁：${unlockReason}` : undefined} style={{ display: 'inline-flex', gap: 8, alignItems: 'center', minHeight: 44 }}>
            <input type="radio" name={id} value={option} aria-label={option === 'hard' && !hardUnlocked ? `困难未解锁：${unlockReason}` : undefined} checked={(hardUnlocked ? value : 'normal') === option} disabled={option === 'hard' && !hardUnlocked} onChange={() => onChange(option)} />
            {difficultyLabel(option)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
