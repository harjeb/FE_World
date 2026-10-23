import { CLASSES } from '../../backend/common/data/classes.ts';
import { decide } from '../../backend/common/engine/ai.ts';
import { autoplay } from '../../backend/common/engine/autoplay.ts';
import { createFieldBattle } from '../../backend/common/game/battles.ts';
import { fieldEncounter } from '../../backend/common/game/encounters.ts';
import { createUnit } from '../../backend/common/game/model.ts';
import type { CharacterId } from '../../backend/common/data/characters.ts';
import { REGIONS, enemyLevel } from '../../backend/common/game/calendar.ts';

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openDb } from '../../backend/api/db.ts';
import { Store } from '../../backend/api/store.ts';
import { loginOrRegister } from '../../backend/api/auth.ts';
import { dispatch, type Context } from '../../backend/api/handlers.ts';
import { OP } from '../../backend/common/protocol/ops.ts';
import { DAYS_PER_YEAR } from '../../backend/common/game/calendar.ts';

export interface CampaignYear {
  year: number; day: number; gold: number; bexp: number;
  units: { id: string; level: number; status: string; mastery: unknown; weaponExp: unknown }[];
  resources: { item: string; count: number }[]; deaths: number; dispatches: number; battles: number;
}

// Fixed action policy; production battle/drop seeds remain server-generated.
export function campaign(years = 8, postgameDays = 30) {
  assert.ok(Number.isInteger(years) && years > 0 && years <= 8);
  assert.ok(Number.isInteger(postgameDays) && postgameDays >= 0 && postgameDays <= 500);
  const dir = mkdtempSync(join(tmpdir(), 'agent-campaign-'));
  let store = new Store(openDb(join(dir, 'campaign.sqlite')));
  try {
    const { accountId, player } = loginOrRegister(store, 'campaign', 'test-password', '长期验证');
    const playerId = player.id;
    let ctx: Context = { store, accountId, player, agentModel: null, push: () => {} };
    let commands = 0;
    const call = (op: number, data: Record<string, any> = {}) => dispatch(ctx, op, { ...data, commandId: `campaign-${commands++}` });
    call(OP.COMPLETE_SETUP, {
      protagonist: { name: '长期验证', sex: 'female', portrait: 'random:female:campaign', allocation: { str: 5, def: 5 } },
      companions: ['victor', 'lina'],
    });
    call(OP.CHOOSE_ROUTE, { region: 1 });
    const initialIds = store.units(playerId).map(u => u.id);
    const rows: CampaignYear[] = [];
    let battles = 0;
    const protagonistId = store.units(playerId).find(u => u.isProtagonist)!.id;
    let openingVictory = false;
    // Only the immortal protagonist risks defeat; earned BEXP supports later attempts.
    for (let attempt = 0; attempt < 20 && !openingVictory; attempt++) {
      const hero = store.units(playerId).find(u => u.id === protagonistId)!;
      if (ctx.player.bexp > 0 && hero.level < CLASSES[hero.classId].maxLevel) call(OP.ASSIGN_BEXP, { unitId: hero.id, amount: ctx.player.bexp });
      const { battleId } = call(OP.SORTIE, { region: 1, unitIds: [protagonistId] }) as { battleId: string };
      for (let actions = 0; actions < 1000; actions++) {
        const state = store.battle(playerId, battleId)!.state;
        if (state.result) break;
        const unit = state.units.find(u => u.side === 'player' && u.alive && !u.acted);
        if (!unit) call(OP.END_PHASE);
        else {
          const action = decide(state, unit);
          call(OP.UNIT_ACT, { unitId: action.unit, moveTo: action.to, action: action.act,
            targetId: 'target' in action ? action.target : undefined,
            weapon: 'weapon' in action ? action.weapon : undefined,
            item: 'item' in action ? action.item : undefined });
        }
      }
      const result = store.battle(playerId, battleId)!.state.result;
      assert.ok(result, 'opening battle exceeded 1000 API actions');
      battles++;
      openingVictory = result.winner === 'player';
    }
    assert.ok(openingVictory, 'normal campaign policy failed to win a first field battle within 20 attempts');
    assert.ok(ctx.player.flags.clearedRegions.includes(1), 'opening victory must persist region-one clearance');
    assert.equal(store.activeBattle(playerId), null);
    const openingBattles = battles;
    const snapshot = (year: number): CampaignYear => ({
      year, day: ctx.player.day, gold: ctx.player.gold, bexp: ctx.player.bexp,
      units: store.units(playerId).map(u => ({ id: u.id, level: u.level, status: u.status, mastery: u.classMastery, weaponExp: u.weaponExp })),
      resources: store.inventory(playerId).map(r => ({ item: r.item, count: r.count })),
      deaths: store.memorials(playerId).length, dispatches: store.dispatches(playerId).filter(d => d.state === 'returned').length, battles,
    });
    for (let year = 1; year <= years; year++) {
      const target = year * DAYS_PER_YEAR;
      while (ctx.player.day < target) {
        const days = Math.min(30, target - ctx.player.day);
        for (const unit of store.units(playerId).filter(u => u.status === 'active')) {
          call(OP.START_DISPATCH, { region: 1, unitIds: [unit.id], durationDays: days });
        }
        call(OP.REST, { days });
        assert.equal(store.runningDispatches(playerId).length, 0);
      }
      // Persist a real field encounter and settle it through the retreat lifecycle.
      // shortcut: retreat avoids random combat deaths; use encounter smoke for AI combat coverage.
      call(OP.SORTIE, { region: 1, unitIds: [store.units(playerId).find(u => u.isProtagonist)!.id] });
      call(OP.RETREAT);
      battles++;
      const trainee = store.units(playerId).find(u => u.status === 'active')!;
      if (ctx.player.gold >= 200) call(OP.TRAIN, { unitId: trainee.id });
      assert.equal(store.activeBattle(playerId), null);
      const before = snapshot(year);
      store.db.close();
      store = new Store(openDb(join(dir, 'campaign.sqlite')));
      ctx = { ...ctx, store, player: store.getPlayer(playerId)! };
      assert.deepEqual(snapshot(year), before, 'reopening must preserve campaign state');
      assert.deepEqual(store.units(playerId).map(u => u.id), initialIds);
      assert.ok(ctx.player.gold >= 0);
      rows.push(before);
    }
    const postgameStart = ctx.player.day;
    if (postgameDays) call(OP.REST, { days: postgameDays });
    assert.equal(ctx.player.day, postgameStart + postgameDays);
    return { mode: 'persistent-api', openingBattles, rows, postgame: snapshot(years + 1), commands,
      checks: { firstFieldVictory: openingVictory, reopenedEveryYear: true, stableRosterIds: true, dispatchesSettled: true, battlesSettled: true, postgameAdvanced: true },
      limitations: ['Fixed dispatch/rest policy, not human balance evidence', 'Annual field encounters retreat; opening victory does not establish long-run combat viability or story completion', 'Production UUID seeds make weapon drops nondeterministic'] };
  } finally {
    store.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}



const ROSTER: CharacterId[] = ['erin', 'victor', 'gustav', 'lina', 'owen', 'noah', 'karl', 'sera'];

export interface EncounterYear {
  year: number; day: number; level: number; battles: number; wins: number; turns: number; deaths: number;
}

export function encounterSmoke(years = 8, battlesPerRegion = 2): EncounterYear[] {
  const rows: EncounterYear[] = [];
  for (let year = 0; year < years; year += 1) {
    const day = year * DAYS_PER_YEAR + 60;
    const level = Math.min(80, enemyLevel(day));
    let battles = 0, wins = 0, turns = 0, deaths = 0;
    for (const region of REGIONS) {
      for (let i = 0; i < battlesPerRegion; i += 1) {
        const party = ROSTER.map((character, index) => createUnit(character, level, `campaign-${year}-${region.id}-${i}-${index}`, day, true));
        const seed = `campaign-${year}-${region.id}-${i}`;
        const encounter = fieldEncounter(seed, day, region.id);
        const record = createFieldBattle(party.slice(0, encounter.maxUnits), { encounter, region: region.id, day, cleared: region.id - 1, seed });
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


if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(process.argv.includes('--encounters') ? { mode: 'independent-encounters', rows: encounterSmoke() } : campaign(), null, 2));
