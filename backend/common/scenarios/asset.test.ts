import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertScenarioAsset, enemyTemplates, parseScenarioAsset } from './asset.ts';
import type { ScenarioAsset } from './asset.ts';

const root = new URL('../../../content/scenarios/gba-classics-v1/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
const load = (id: string): ScenarioAsset => {
  const entry = manifest.scenarios.find((entry: { id: string }) => entry.id === id);
  return parseScenarioAsset(readFileSync(new URL(entry.file, root), 'utf8'));
};

test('all thirty exported chapters are valid source assets and have enemy templates', () => {
  assert.equal(manifest.scenarios.length, 30);
  for (const entry of manifest.scenarios) {
    const asset = parseScenarioAsset(readFileSync(new URL(entry.file, root), 'utf8'));
    assert.equal(asset.adaptation.status, 'source-template');
    assert.ok(asset.coverage.enemyTemplateCount > 0, asset.id);
    assert.equal(asset.coverage.runtimeExecuted, false);
  }
});

test('rectangular map matrices reject accidental x/y transposition', () => {
  const asset = load('fe6-ch13-main');
  assert.notEqual(asset.map.width, asset.map.height);
  asset.map.terrainIds = asset.map.terrainIds[0].map((_, x) => asset.map.terrainIds.map(row => row[x]));
  assert.throws(() => assertScenarioAsset(asset), /行列尺寸/);
});

test('unknown versions and missing item/class definitions are rejected before adoption', () => {
  const version = { ...load('fe8-ch17-eirika'), schemaVersion: 2 };
  assert.throws(() => assertScenarioAsset(version), /schemaVersion/);
  const asset = load('fe7-ch27-eliwood');
  const unit = asset.unitGroups.flatMap(group => group.units).find(unit => unit.itemIds.length > 0)!;
  delete asset.itemCatalog[unit.itemIds[0]];
  assert.throws(() => assertScenarioAsset(asset), /物品.*缺少定义/);
  const other = load('fe6-ch21-main');
  delete other.classCatalog[other.unitGroups[0].units[0].effectiveClassId];
  assert.throws(() => assertScenarioAsset(other), /职业.*缺少定义/);
});

test('map-change keep masks survive serialization and mismatched masks are rejected', () => {
  const asset = load('fe6-ch16-main');
  const change = asset.mapChanges.find(change => change.terrainIds.some(row => row.includes(null)))!;
  assert.ok(change, 'actual ROM contains a masked map change');
  let found = false;
  for (let y = 0; y < change.height && !found; y++) for (let x = 0; x < change.width && !found; x++) {
    if (change.terrainIds[y][x] === null) { change.terrainIds[y][x] = Number(Object.keys(asset.terrainCatalog)[0]); found = true; }
  }
  assert.throws(() => assertScenarioAsset(asset), /保留掩码/);
});

test('duplicate group ids and incorrect enemy counts cannot enter the content pipeline', () => {
  const duplicate = load('fe8-ch15-eirika');
  duplicate.unitGroups[1].id = duplicate.unitGroups[0].id;
  assert.throws(() => assertScenarioAsset(duplicate), /ID重复/);
  const count = load('fe8-ch20-eirika');
  count.coverage.enemyTemplateCount++;
  assert.throws(() => assertScenarioAsset(count), /统计与实际数据/);
});

test('source off-map object coordinates are retained and cannot be mislabeled on-map', () => {
  const asset = load('fe7-chfinal-1-eliwood');
  const object = asset.objects.find(object => object.positionStatus === 'off-map')!;
  assert.deepEqual(object.position, [18, 19]);
  assertScenarioAsset(asset);
  object.positionStatus = 'on-map';
  assert.throws(() => assertScenarioAsset(asset), /坐标状态/);
});

test('explicit group selection keeps normal/hard and event templates separate', () => {
  const asset = load('fe7-ch27-eliwood');
  const group = asset.unitGroups.find(group => group.references.some(ref => ref.kind === 'enemy-table' && ref.variant === 'eliwood-normal'))!;
  const units = enemyTemplates(asset, group.id);
  assert.equal(units.length, asset.coverage.primaryEnemyTemplateCount);
  assert.ok(units.length < asset.coverage.enemyTemplateCount);
  assert.ok(units.every(unit => unit.faction === 'enemy' && typeof unit.effectiveClassId === 'number'));
  assert.throws(() => enemyTemplates(asset, 'missing-group'), /未知单位组/);
});
