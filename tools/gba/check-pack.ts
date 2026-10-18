#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { assertScenarioAsset } from '../../backend/common/scenarios/asset.ts';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { report: { type: 'string' } } });
const root = resolve(positionals[0] ?? fileURLToPath(new URL('../../content/scenarios/gba-classics-v1', import.meta.url)));
const manifestText = await readFile(resolve(root, 'manifest.json'), 'utf8');
const manifest = JSON.parse(manifestText);
if (manifest.format !== 'agent-tactics.scenario-pack' || manifest.schemaVersion !== 1
  || manifest.scenarioCount !== 30 || manifest.scenarios?.length !== 30 || manifest.games?.length !== 3) {
  throw new Error('目录必须是 v1 关卡包，三作共30张');
}
const counts = new Map<string, number>();
const ids = new Set<string>();
const chapterIds = new Set<string>();
const layouts = new Set<string>();
const games = new Map<string, { maps: number; enemyTemplates: number; cells: number; romSha1: string }>();
for (const entry of manifest.scenarios) {
  if (typeof entry.file !== 'string') throw new Error('关卡文件名缺失');
  const path = resolve(root, entry.file);
  const rel = relative(root, path);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('关卡文件必须在目录内');
  const text = await readFile(path, 'utf8');
  if (createHash('sha256').update(text).digest('hex') !== entry.sha256) throw new Error(`文件校验值不匹配：${entry.file}`);
  const asset: unknown = JSON.parse(text);
  assertScenarioAsset(asset);
  const game = asset.source.game;
  if (asset.id !== entry.id || game !== entry.game || asset.name !== entry.name
    || asset.chapter.number !== entry.chapter || asset.chapter.route !== entry.route
    || asset.map.width !== entry.width || asset.map.height !== entry.height
    || asset.coverage.enemyTemplateCount !== entry.enemyTemplates) throw new Error(`目录与关卡内容不一致：${entry.id}`);
  const key = `${game}:${asset.chapter.tableIndex}`;
  if (ids.has(asset.id) || chapterIds.has(key) || layouts.has(asset.provenance.layoutSha256)) throw new Error(`重复章节或地图：${asset.id}`);
  ids.add(asset.id); chapterIds.add(key); layouts.add(asset.provenance.layoutSha256);
  const summary = games.get(game) ?? { maps: 0, enemyTemplates: 0, cells: 0, romSha1: asset.source.sha1 };
  if (summary.romSha1 !== asset.source.sha1) throw new Error(`同作混入其他ROM版本：${asset.id}`);
  summary.maps++; summary.enemyTemplates += asset.coverage.enemyTemplateCount; summary.cells += asset.map.width * asset.map.height;
  games.set(game, summary);
  counts.set(game, (counts.get(game) ?? 0) + 1);
}
for (const game of ['fe6', 'fe7', 'fe8']) {
  if (counts.get(game) !== 10) throw new Error(`${game} 必须恰好10张`);
  const declared = manifest.games.find((g: { game: string }) => g.game === game);
  if (declared?.count !== 10 || declared.romSha1 !== games.get(game)?.romSha1) throw new Error(`${game} 的ROM/数量声明不匹配`);
}
const report = {
  passed: true, format: 'agent-tactics.scenario-pack-validation', schemaVersion: 1,
  manifestSha256: createHash('sha256').update(manifestText).digest('hex'), scenarioCount: 30, uniqueChapterCount: chapterIds.size,
  uniqueLayoutCount: layouts.size, games: Object.fromEntries(games),
  checks: ['json-schema', 'matrix-dimensions', 'catalog-references', 'unit-coordinates', 'map-change-masks',
    'unique-ids', 'enemy-counts', 'file-sha256', 'manifest-consistency', '10-maps-per-game', 'distinct-map-layouts', 'edition-consistency'],
  runtimePlayable: false,
};
if (values.report) await writeFile(resolve(values.report), JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(report, null, 2));
