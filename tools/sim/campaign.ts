import { autoplay } from '../../backend/common/engine/autoplay.ts';
import { createFieldBattle } from '../../backend/common/game/battles.ts';
import { createUnit } from '../../backend/common/game/model.ts';
import type { CharacterId } from '../../backend/common/data/characters.ts';
import { DAYS_PER_YEAR, REGIONS, enemyLevel } from '../../backend/common/game/calendar.ts';

// Eight-year self-play smoke run (docs/28): deterministic encounters, rule AI, no database.
// It is a budget/hand feel check, not a replacement for a human 40–60 hour playtest.
const ROSTER: CharacterId[] = ['erin', 'victor', 'gustav', 'lina', 'owen', 'noah', 'karl', 'sera'];

export interface CampaignYear {
  year: number; day: number; level: number; battles: number; wins: number; turns: number; deaths: number;
}

export function campaign(years = 8, battlesPerRegion = 2): CampaignYear[] {
  const rows: CampaignYear[] = [];
  for (let year = 0; year < years; year += 1) {
    const day = year * DAYS_PER_YEAR + 60;
    const level = Math.min(80, enemyLevel(day));
    let battles = 0, wins = 0, turns = 0, deaths = 0;
    for (const region of REGIONS) {
      for (let i = 0; i < battlesPerRegion; i += 1) {
        const party = ROSTER.map((character, index) => createUnit(character, level, `campaign-${year}-${region.id}-${i}-${index}`, day, true));
        const record = createFieldBattle(party, { region: region.id, day, cleared: region.id - 1, seed: `campaign-${year}-${region.id}-${i}` });
        const final = autoplay(record.state);
        battles += 1;
        turns += final.turn;
        if (final.result?.winner === 'player') wins += 1;
        deaths += final.units.filter(unit => unit.side === 'player' && !unit.alive).length;
      }
    }
    rows.push({ year: year + 1, day, level, battles, wins, turns, deaths });
  }
  return rows;
}

if (process.argv[1]?.endsWith('campaign.ts')) {
  const rows = campaign();
  const total = rows.reduce((sum, row) => sum + row.battles, 0);
  const wins = rows.reduce((sum, row) => sum + row.wins, 0);
  console.log(JSON.stringify({ rows, total, winRate: wins / total }, null, 2));
}
