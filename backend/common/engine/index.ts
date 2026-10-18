// Public surface of the battle engine. The frontend, the future API and the simulator all use these
// functions, so every number a player or Agent sees comes from the same code (docs/07).
export { step } from './step.ts';
export { decide, GUARD_RADIUS } from './ai.ts';
export { autoplay } from './autoplay.ts';
export { artForecast, forecast, forecastOnHit, trueHit, unitCombatStats, terrainBonus } from './combat.ts';
export type { Forecast, SideForecast } from './combat.ts';
export { moveRange, pathTo } from './movement.ts';
export type { MoveRange } from './movement.ts';
export { actionOptions, canFinishGather, canSeize, reachCells, targetsFrom, threatMap } from './ranges.ts';
export type { ActionOptions } from './ranges.ts';
export { expPreview, growthRates } from './growth.ts';
export { healAmount } from './resolve.ts';
export { seedRng } from './rng.ts';
export {
  attackWeapons, cellKey, classOf, distance, equipped, hasCurableStatus, isAsleep, isBerserk, isSilenced, inBounds, keyPoint, living, staffWeapons, terrainAt, unitAt, unitById, weaponRange,
} from './units.ts';
export { EngineError } from './types.ts';
export type { Action, ActAction, BattleEvent, BattleObject, BattleObjectState, BattleState, Behavior, Point, ScenarioEvent, Side, Strike, UnitState } from './types.ts';
export { interactionOptions, objectAt, objectBlocks, runScenarioEvents, scenarioLoot } from './scenario.ts';
export { artTargets, defaultDestination, destinationCells, destinationValid, freeCell, isHostileSpell, spellDestination, spellTargets, spellWeapon, staffDestination, staffEffect, staffTargets, withSpellWeapon } from './support.ts';
export type { DestinationRule, StaffEffect } from './support.ts';
