import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSIC_MAPS, classicMap } from './classic-catalog.ts';
import { CLASSIC_QUESTS } from './classic-quests.ts';
import { createClassicBattle } from './battles.ts';
import { createUnit } from './model.ts';
import { CLASSES } from '../data/classes.ts';

const TERRAINS = new Set(['plain', 'road', 'bridge', 'floor', 'village', 'forest', 'mountain', 'fort', 'shallow', 'water', 'wall', 'throne']);

test('the classic catalog covers six games, every terrain and every class', () => {
  assert.equal(CLASSIC_MAPS.length, 60);
  const games = new Set(CLASSIC_MAPS.map(map => map.game));
  assert.deepEqual([...games].sort(), ['fe1', 'fe2', 'fe3', 'fe6', 'fe7', 'fe8']);
  for (const map of CLASSIC_MAPS) {
    assert.ok(map.width >= 10 && map.height >= 10, map.id);
    assert.equal(map.terrain.length, map.height);
    assert.ok(map.terrain.every(row => row.length === map.width));
    for (const row of map.terrain) for (const tile of row) assert.ok(TERRAINS.has(tile), `${map.id}: ${tile}`);
    assert.ok(map.enemies.length > 0, map.id);
    for (const enemy of map.enemies) {
      assert.ok(CLASSES[enemy.classId as keyof typeof CLASSES], `${map.id}: ${enemy.classId}`);
      assert.ok(enemy.pos[0] >= 0 && enemy.pos[0] < map.width && enemy.pos[1] >= 0 && enemy.pos[1] < map.height, map.id);
    }
    assert.ok(map.enemies.some(enemy => enemy.boss), `${map.id} has a commander`);
  }
});

test('every classic map has at least one usable deployment tile', () => {
  for (const map of CLASSIC_MAPS) {
    const usable = map.playerSpawns.filter(([x, y]) => !['wall', 'water'].includes(map.terrain[y][x]));
    assert.ok(usable.length > 0 || map.terrain.flat().some(tile => !['wall', 'water'].includes(tile)), map.id);
  }
});

test('a classic battle is built from the real map, not the random generator', () => {
  for (const id of ['fe6-ch13-main', 'fe1-ch16', 'fe3-book1-ch11', 'fe3-book1-ch13', 'fe2-map-01', 'fe6-ch22-main', 'fe8-ch14-eirika']) {
    const map = classicMap(id);
    const units = (['erin', 'victor', 'gustav', 'lina', 'owen', 'noah'] as const).map((character, index) =>
      createUnit(character, 20, `u${index}`, 0));
    const record = createClassicBattle(units, { mapId: id, seed: 'test' });
    assert.equal(record.state.map.width, map.width);
    assert.equal(record.state.map.height, map.height);
    assert.deepEqual(record.state.map.tiles, map.terrain);
    assert.equal(record.state.units.filter(unit => unit.side === 'enemy').length, map.enemies.length);
    assert.equal(record.state.units.filter(unit => unit.side === 'player').length, units.length);
    assert.ok(record.state.units.filter(unit => unit.side === 'player').every(unit => unit.boss === (unit.id === 'u0')));
    const commander = record.state.units.find(unit => unit.side === 'enemy' && unit.boss);
    assert.ok(commander);
    if (map.goal.kind === 'boss') assert.deepEqual(record.state.goal, { kind: 'boss', target: commander!.id });
    if (map.goal.kind === 'seize') assert.deepEqual(record.state.goal, { kind: 'seize', throne: map.goal.position });
    const positions = new Set(record.state.units.map(unit => `${unit.pos[0]},${unit.pos[1]}`));
    assert.equal(positions.size, record.state.units.length, 'no overlapping units');
    for (const unit of record.state.units) {
      assert.notEqual(record.state.map.tiles[unit.pos[1]][unit.pos[0]], 'wall');
      assert.notEqual(record.state.map.tiles[unit.pos[1]][unit.pos[0]], 'water');
    }
  }
});

function mapPassable(map: { terrain: string[][] }, x: number, y: number): boolean {
  return map.terrain[y][x] !== 'wall' && map.terrain[y][x] !== 'water';
}

test('every exported classic map is playable: passable units and a reachable goal', () => {
  for (const map of CLASSIC_MAPS) {
    assert.ok(map.playerSpawns.length > 0, `${map.id}: 没有出击格`);
    const occupied = new Set<string>();
    for (const [x, y] of map.playerSpawns) {
      assert.ok(mapPassable(map, x, y), `${map.id}: 出击格不可站立`);
      occupied.add(`${x},${y}`);
    }
    for (const enemy of map.enemies) {
      const [x, y] = enemy.pos;
      assert.ok(mapPassable(map, x, y), `${map.id}: 敌军格不可站立`);
      const key = `${x},${y}`;
      assert.ok(!occupied.has(key), `${map.id}: 单位重叠 ${key}`);
      occupied.add(key);
    }
    let goal: [number, number] | null = null;
    if (map.goal.kind === 'seize') {
      goal = map.goal.position;
      assert.equal(map.terrain[goal[1]][goal[0]], 'throne', `${map.id}: 制压点不是王座`);
    } else {
      const boss = map.enemies.find(enemy => enemy.boss);
      assert.ok(boss, `${map.id}: 没有主将`);
      goal = boss.pos;
    }
    const seen = new Set<number>();
    const queue: [number, number][] = map.playerSpawns.map(([x, y]) => [x, y]);
    for (const [x, y] of queue) seen.add(y * map.width + x);
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i];
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as [number, number][]) {
        if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
        const key = ny * map.width + nx;
        if (seen.has(key) || !mapPassable(map, nx, ny)) continue;
        seen.add(key); queue.push([nx, ny]);
      }
    }
    assert.ok(seen.has(goal[1] * map.width + goal[0]), `${map.id}: 目标从出击区不可达`);
  }
});

test('classic quests cover single maps and multi-map dungeons', () => {
  assert.equal(CLASSIC_QUESTS.filter(quest => quest.scenarioId).length, 60);
  const dungeons = CLASSIC_QUESTS.filter(quest => quest.scenarioIds);
  assert.equal(dungeons.length, 18);
  for (const quest of dungeons) {
    assert.ok(quest.scenarioIds!.length >= 3 && quest.scenarioIds!.length <= 4);
    assert.equal(quest.costDays, quest.scenarioIds!.length * 2);
    assert.equal(quest.classic?.stageCount, quest.scenarioIds!.length);
  }
});

test('classic dungeons cover every map once and keep exclusive routes separate', () => {
  for (const game of ['fe1', 'fe2', 'fe3', 'fe6', 'fe7', 'fe8']) {
    const dungeons = CLASSIC_QUESTS.filter(quest => quest.classic?.game === game && quest.scenarioIds);
    const ids = dungeons.flatMap(quest => quest.scenarioIds!);
    assert.equal(ids.length, 10, `${game}: 副本地图总数`);
    assert.equal(new Set(ids).size, 10, `${game}: 地图不得重复`);
    for (const quest of dungeons) {
      const group = quest.scenarioIds!;
      if (game === 'fe7') {
        assert.ok(!(group.some(id => id.includes('lloyd')) && group.some(id => id.includes('linus'))), `${quest.id}: 洛伊德/莱纳斯互斥`);
        assert.ok(!(group.some(id => id.includes('kenneth')) && group.some(id => id.includes('jerme'))), `${quest.id}: 肯尼斯/杰尔梅互斥`);
      }
      if (game === 'fe8') {
        const eirika = group.some(id => id.endsWith('-eirika'));
        const ephraim = group.some(id => id.endsWith('-ephraim'));
        assert.ok(!(eirika && ephraim), `${quest.id}: 艾瑞珂/艾夫拉姆路线互斥`);
      }
    }
  }
});

test('every classic map builds a battle with a six-unit party and its full garrison', () => {
  for (const map of CLASSIC_MAPS) {
    const units = (['erin', 'victor', 'gustav', 'lina', 'owen', 'noah'] as const).map((character, index) =>
      createUnit(character, 20, `all-${index}`, 0));
    const record = createClassicBattle(units, { mapId: map.id, seed: 'all-maps' });
    assert.equal(record.state.units.filter(unit => unit.side === 'player').length, units.length, map.id);
    assert.equal(record.state.units.filter(unit => unit.side === 'enemy').length, map.enemies.length, map.id);
    const positions = new Set(record.state.units.map(unit => `${unit.pos[0]},${unit.pos[1]}`));
    assert.equal(positions.size, record.state.units.length, `${map.id}: unit overlap`);
    for (const unit of record.state.units) {
      assert.notEqual(record.state.map.tiles[unit.pos[1]][unit.pos[0]], 'wall', `${map.id}: unit on wall`);
      assert.notEqual(record.state.map.tiles[unit.pos[1]][unit.pos[0]], 'water', `${map.id}: unit in water`);
    }
    if (map.goal.kind === 'boss') {
      const boss = record.state.units.find(unit => unit.side === 'enemy' && unit.boss)!;
      assert.deepEqual(record.state.goal, { kind: 'boss', target: boss.id }, map.id);
    } else {
      assert.deepEqual(record.state.goal, { kind: 'seize', throne: map.goal.position }, map.id);
    }
  }
});
