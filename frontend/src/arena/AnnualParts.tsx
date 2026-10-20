import type { AnnualState, ServerAnnual } from '../api/session.ts';

type Entry = NonNullable<ServerAnnual['entry']>;

export const ANNUAL_STATE: Record<AnnualState, [string, string]> = {
  qualifier: ['海选中', 'tag-blue'],
  knockout: ['正赛中', 'tag-blue'],
  eliminated: ['已淘汰', 'tag-red'],
  champion: ['冠军', 'tag-brass'],
  withdrawn: ['已退赛', 'tag-grey'],
};

// 正赛 64 强单败六轮 (docs/00 §9.4.1).
export const KNOCKOUT_ROUNDS = ['64 强', '32 强', '16 强', '8 强', '半决赛', '决赛'];

export const isLive = (entry: Entry | null): boolean => !!entry && (entry.state === 'qualifier' || entry.state === 'knockout');

export function nextMatchLabel(entry: Entry): string {
  if (entry.state === 'qualifier') return `海选第 ${entry.qualifierCount + 1} 场`;
  return `正赛 · ${KNOCKOUT_ROUNDS[Math.max(0, entry.round - 1)] ?? '决赛'}`;
}

// The player's own path: three qualifiers (two wins needed), then six single-elimination rounds.
// Only counts are stored for the qualifiers, so they show as played or not, with the record beside.
export function Bracket({ entry, matches, wins }: { entry: Entry; matches: number; wins: number }) {
  const qualified = entry.qualifierCount >= matches && entry.qualifierWins >= wins;
  const outInKnockout = entry.state === 'eliminated' && qualified;
  const knock = (r: number): [string, string] => {
    if (entry.state === 'champion') return ['won', '胜'];
    if (!qualified) return ['todo', ''];
    if (r < entry.round) return ['won', '胜'];
    if (r === entry.round) return outInKnockout ? ['lost', '负'] : entry.state === 'knockout' ? ['next', '下一场'] : ['todo', ''];
    return ['todo', ''];
  };
  return (
    <div className="bracket" aria-label="本届赛程">
      <div className="br-row">
        <span className="br-k">海选</span>
        {Array.from({ length: matches }, (_, i) => (
          <span key={i} className={`br-cell ${i < entry.qualifierCount ? 'played' : entry.state === 'qualifier' && i === entry.qualifierCount ? 'next' : 'todo'}`}>
            第 {i + 1} 场{i < entry.qualifierCount ? ' · 已赛' : entry.state === 'qualifier' && i === entry.qualifierCount ? ' · 下一场' : ''}
          </span>
        ))}
        <span className="br-rec">{entry.qualifierWins} 胜 {entry.qualifierCount - entry.qualifierWins} 负</span>
      </div>
      <div className="br-row">
        <span className="br-k">正赛</span>
        {KNOCKOUT_ROUNDS.map((name, i) => {
          const [cls, mark] = knock(i + 1);
          return <span key={name} className={`br-cell ${cls}`}>{name}{mark && ` · ${mark}`}</span>;
        })}
      </div>
    </div>
  );
}
