// Frontend check for the feature-flag route gate and the world-map era labels: base pages always open,
// locked modules fall back to the world map, in-progress activities are never yanked away, and class
// market / rules pages render calendar years in the 星辉历 era.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, next) {
    return next(specifier.startsWith('@common/')
      ? new URL(`../../backend/common/${specifier.slice(8)}`, import.meta.url).href : specifier, context);
  },
});
const { activityOf, LOCKED_FEATURES, featuresOf, isRouteAllowed } = await import('../src/model/access.ts');
const { eraYear } = await import('../src/ui/calendar.ts');
const { ERA_BASE_YEAR, ERA_NAME } = await import('../../backend/common/game/calendar.ts');
const { parseRoute, regionInHash } = await import('../src/router.ts');

const IDLE = { battle: null, runBattle: false, annualEntry: false };

test('missing flags keep unopened modules hidden until the server provides progress', () => {
  assert.deepEqual(featuresOf(null), LOCKED_FEATURES);
  assert.deepEqual(featuresOf(undefined), LOCKED_FEATURES);
  const partial = featuresOf({ features: { field: true, tavern: false } });
  assert.equal(partial.field, true);
  assert.equal(partial.tavern, false);
  assert.equal(partial.arena, false);
  assert.equal(partial.story, false);
});

test('base pages are always allowed; locked direct routes are refused', () => {
  const locked = featuresOf({ features: {
    field: false, dungeon: false, dispatch: false, quests: false, tower: false, workshop: false,
    tavern: false, arena: false, annual: false, story: false, legacy: false, reports: false, spectate: false,
  } });
  for (const hash of ['#/camp', '#/world', '#/roster', '#/roster/u1/mastery', '#/prep', '#/rules', '#/settings']) {
    assert.ok(isRouteAllowed(parseRoute(hash), locked, IDLE), hash);
  }
  for (const hash of ['#/field', '#/field/dungeon', '#/field/dispatch', '#/quests', '#/quests/tower', '#/workshop',
    '#/tavern', '#/arena', '#/arena/annual', '#/story', '#/legacy', '#/replay', '#/spectate']) {
    assert.ok(!isRouteAllowed(parseRoute(hash), locked, IDLE), hash);
  }
});

test('field / dungeon / dispatch / quests / tower gate separately', () => {
  const partial = featuresOf({ features: { field: true, dungeon: false, dispatch: false, quests: true, tower: false } });
  assert.ok(isRouteAllowed(parseRoute('#/field'), partial, IDLE));
  assert.ok(!isRouteAllowed(parseRoute('#/field/dungeon'), partial, IDLE));
  assert.ok(!isRouteAllowed(parseRoute('#/field/dispatch'), partial, IDLE));
  assert.ok(isRouteAllowed(parseRoute('#/quests'), partial, IDLE));
  assert.ok(!isRouteAllowed(parseRoute('#/quests/tower'), partial, IDLE));
  // Tower tab needs its own flag even when the quests hub is open.
  const towerOnly = featuresOf({ features: { quests: false, tower: true } });
  assert.ok(!isRouteAllowed(parseRoute('#/quests'), towerOnly, IDLE));
  assert.ok(isRouteAllowed(parseRoute('#/quests/tower'), towerOnly, IDLE));
});

test('in-progress battles and activity routes stay reachable while other modules are locked', () => {
  const locked = featuresOf({ features: { field: false, dungeon: false, annual: false } });
  const activity = {
    battle: { id: 'b1', name: '战斗', kind: 'field', mode: 'field', turn: 2, opponentId: null },
    runBattle: true,
    annualEntry: true,
  };
  assert.ok(isRouteAllowed(parseRoute('#/field'), locked, activity));
  assert.ok(isRouteAllowed(parseRoute('#/field/dungeon'), locked, activity));
  assert.ok(isRouteAllowed(parseRoute('#/arena/annual'), locked, activity));
  // 进行中的竞技场战斗可继续；没有活动时，猜测子页面地址也不能绕过开关。
  const arena = { ...IDLE, battle: { ...activity.battle, kind: 'arena', mode: 'arena', opponentId: 'o1' } };
  for (const hash of ['#/arena/o1/ban', '#/arena/o1/deploy', '#/arena/o1/battle']) {
    assert.ok(isRouteAllowed(parseRoute(hash), locked, arena), hash);
    assert.ok(!isRouteAllowed(parseRoute(hash), locked, IDLE), hash);
  }
  // Without activity the same routes stay locked.
  assert.ok(!isRouteAllowed(parseRoute('#/arena/annual'), locked, IDLE));
});

test('activityOf derives the gate context from one session snapshot', () => {
  const battle = { id: 'b', name: 'n', kind: 'arena', mode: 'arena', turn: 1, opponentId: 'o' };
  assert.deepEqual(
    activityOf({ state: null, today: { battle }, run: null, annual: null }),
    { battle, runBattle: false, annualEntry: false },
  );
  assert.equal(activityOf({ state: null, today: null, run: { state: 'between_maps' }, annual: null }).runBattle, true);
  assert.equal(activityOf({ state: null, today: null, run: { state: 'completed' }, annual: null }).runBattle, false);
});

test('map links preserve the chosen region and ignore malformed query values', () => {
  assert.equal(regionInHash('#/field?region=3'), 3);
  assert.equal(regionInHash('#/quests?region=12'), 12);
  for (const hash of ['#/field', '#/field?region=', '#/field?region=0', '#/field?region=13', '#/field?region=1.5', '#/field?region=bad']) {
    assert.equal(regionInHash(hash), null, hash);
  }
});

test('calendar-year labels render in the shared 星辉历 era (no relative years on screen)', () => {
  assert.equal(eraYear(1), `${ERA_NAME} ${ERA_BASE_YEAR} 年`);
  assert.equal(eraYear(2), '星辉历 1002 年');
  assert.equal(eraYear(8), '星辉历 1008 年');
  assert.equal(eraYear(2), eraYear(1).replace('1001', '1002'));
});
