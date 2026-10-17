import { createFieldBattle } from '../../backend/common/game/battles.ts';
import { createUnit } from '../../backend/common/game/model.ts';
import type { UnitRecord } from '../../backend/common/game/model.ts';
import { autoplay } from '../../backend/common/engine/autoplay.ts';
import { REGIONS, enemyLevel } from '../../backend/common/game/calendar.ts';
import type { CharacterId } from '../../backend/common/data/characters.ts';

// Self-play calibration (docs/07 `tools/sim/`): plays the rule AI against generated encounters and
// reports win rate, length and losses. No server, no database — just the shared engine and game rules.

const ROSTER: CharacterId[] = ['erin', 'victor', 'gustav', 'lina', 'owen', 'noah', 'karl', 'sera'];

function party(level: number, size: number): UnitRecord[] {
  return ROSTER.slice(0, size).map((character, i) => createUnit(character, level, `sim-${character}-${i}`, 0, true));
}

export interface SimRow { region: number; regionName: string; level: number; runs: number; wins: number; avgTurns: number; avgDeaths: number }

export function runSim(runsPerRegion = 20, partyLevel = 12, partySize = 6, day = 60): SimRow[] {
  const rows: SimRow[] = [];
  for (const region of REGIONS) {
    let wins = 0, turns = 0, deaths = 0;
    for (let i = 0; i < runsPerRegion; i++) {
      const record = createFieldBattle(party(partyLevel, partySize), {
        region: region.id, day, cleared: region.id - 1, seed: `sim-${region.id}-${i}`,
      });
      const final = autoplay(record.state);
      if (final.result?.winner === 'player') wins++;
      turns += final.turn;
      deaths += final.units.filter(u => u.side === 'player' && !u.alive).length;
    }
    rows.push({
      region: region.id, regionName: region.name, level: enemyLevel(day, region.offset),
      runs: runsPerRegion, wins, avgTurns: turns / runsPerRegion, avgDeaths: deaths / runsPerRegion,
    });
  }
  return rows;
}

if (process.argv[1] && process.argv[1].endsWith('sim.ts')) {
  const partyLevel = Number(process.env.SIM_LEVEL ?? 12);
  const runs = Number(process.env.SIM_RUNS ?? 20);
  const rows = runSim(runs, partyLevel, 6, Number(process.env.SIM_DAY ?? 60));
  console.log(`自走模拟：队伍 Lv${partyLevel}，每地区 ${runs} 场`);
  console.log('地区           敌方Lv  胜率    平均回合  平均阵亡');
  for (const row of rows) {
    const rate = `${Math.round((row.wins / row.runs) * 100)}%`.padStart(5);
    console.log(`${row.regionName.padEnd(6, '　')}  ${String(row.level).padStart(4)}  ${rate}  ${row.avgTurns.toFixed(1).padStart(8)}  ${row.avgDeaths.toFixed(1).padStart(8)}`);
  }
  const json = process.env.SIM_JSON === '1';
  if (json) process.stdout.write(`${JSON.stringify(rows)}\n`);
}
