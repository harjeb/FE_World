import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSIC_MAPS, classicMap } from './classic-catalog.ts';
import { CLASSIC_QUESTS } from './classic-quests.ts';
import { createClassicBattle } from './battles.ts';
import { createUnit } from './model.ts';
import { CLASSES } from '../data/classes.ts';
import classMapData from '../../../content/scenarios/classic-maps-v1/class-map.json' with { type: 'json' };
import reportData from '../../../content/scenarios/classic-maps-v1/adaptation-report.json' with { type: 'json' };

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

test('the tower final map uses an original work and chapter name', () => {
  const map = classicMap('fe8-chfinal-1-eirika');
  assert.equal(map.name, '神蚀纪 · 终焉王座');
  assert.ok(!map.name.includes('圣魔之光石'), 'the display name must not repeat the source work title');
});

test('the class map covers all 39 FE7 enemy class IDs and every catalog source class', () => {
  const entries = (classMapData as unknown as { classes: { game: string; sourceKey: string; sourceId: number; projectClass: string; review: string }[] }).classes;
  const fe7 = entries.filter(entry => entry.game === 'fe7');
  assert.equal(fe7.length, 39);
  assert.equal(new Set(fe7.map(entry => entry.sourceId)).size, 39);
  for (const entry of entries) {
    assert.ok(CLASSES[entry.projectClass as keyof typeof CLASSES], `${entry.game}:${entry.sourceKey} -> ${entry.projectClass}`);
    assert.equal(entry.review, 'accepted', `${entry.game}:${entry.sourceKey}`);
  }
  const byKey = new Map(entries.map(entry => [`${entry.game}:${entry.sourceKey}`, entry]));
  for (const map of CLASSIC_MAPS) for (const enemy of map.enemies) {
    if (!enemy.sourceClass) continue;
    const mapped = byKey.get(`${map.game}:${enemy.sourceClass}`);
    assert.ok(mapped, `${map.id}: ${enemy.sourceClass}`);
    assert.equal(mapped!.projectClass, enemy.classId, `${map.id}: ${enemy.sourceClass}`);
  }
  const report = reportData as unknown as { maps: { mapId: string; release: { status: string } }[] };
  assert.equal(report.maps.length, 60);
  assert.ok(report.maps.every(map => map.release.status === 'accepted'));
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

test('public classic dungeons retain the three late maps from each game', () => {
  const routes = Object.fromEntries(CLASSIC_QUESTS.filter(quest => !quest.archived).map(quest => [quest.id, quest.scenarioIds]));
  assert.deepEqual(routes, {
    'clx-fe1': ['fe1-ch23', 'fe1-ch24', 'fe1-ch25'],
    'clx-fe2': ['fe2-map-08', 'fe2-map-09', 'fe2-map-10'],
    'clx-fe3': ['fe3-book1-ch18', 'fe3-book1-ch19', 'fe3-book1-ch20'],
    'clx-fe6': ['fe6-ch22-main', 'fe6-ch23-main', 'fe6-ch24-main'],
    'clx-fe7': ['fe7-ch27-eliwood', 'fe7-ch30-eliwood', 'fe7-chfinal-1-eliwood'],
    'clx-fe8': ['fe8-ch17-eirika', 'fe8-ch20-eirika', 'fe8-chfinal-1-eirika'],
  });
});

test('archived classic quests retain single maps and legacy multi-map dungeons', () => {
  assert.equal(CLASSIC_QUESTS.filter(quest => quest.scenarioId).length, 60);
  const dungeons = CLASSIC_QUESTS.filter(quest => quest.archived && quest.scenarioIds);
  assert.equal(dungeons.length, 18);
  for (const quest of dungeons) {
    assert.ok(quest.scenarioIds!.length >= 3 && quest.scenarioIds!.length <= 4);
    assert.equal(quest.costDays, quest.scenarioIds!.length * 2);
    assert.equal(quest.classic?.stageCount, quest.scenarioIds!.length);
  }
});

test('classic dungeons cover every map once and keep exclusive routes separate', () => {
  for (const game of ['fe1', 'fe2', 'fe3', 'fe6', 'fe7', 'fe8']) {
    const dungeons = CLASSIC_QUESTS.filter(quest => quest.archived && quest.classic?.game === game && quest.scenarioIds);
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
    assert.equal(record.state.units.filter(unit => unit.side === 'enemy' && !unit.id.startsWith('scenario-')).length, map.enemies.length, map.id);
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

test('经典图按源 AI 选择抢宝单位，没有可抢物件的图不抢', () => {
  const lootMap = createClassicBattle([createUnit('erin', 20, 'hero')], { mapId: 'fe8-ch14-eirika', seed: 'thieves', day: 0 });
  const enemies = lootMap.state.units.filter(unit => unit.side === 'enemy');
  const thieves = enemies.filter(unit => unit.behavior === 'thief');
  assert.equal(thieves.length, 1, '伦纳克的源抢宝 AI 在降阶后仍然保留');
  assert.deepEqual(thieves[0].thiefTrigger, { kind: 'turn', turn: 1 });
  assert.ok(enemies.filter(unit => unit.behavior !== 'thief').length > 0, '其他敌军不受影响');
  const noLoot = createClassicBattle([createUnit('erin', 20, 'hero')], { mapId: 'fe7-ch25-eliwood-jerme', seed: 'thieves', day: 0 });
  assert.ok(noLoot.state.units.filter(unit => unit.side === 'enemy').every(unit => unit.behavior !== 'thief'), '没有宝箱的图不抢');
});
