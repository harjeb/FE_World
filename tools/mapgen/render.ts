import { TERRAINS } from '../../backend/common/maps/map.ts';
import type { BattleMap, Terrain } from '../../backend/common/maps/map.ts';
import { THEMES } from '../../backend/common/maps/themes.ts';

// Common ground stays unlabeled in the SVG so that features stand out.
const UNLABELED = new Set<Terrain>(['plain', 'road', 'floor']);

// Legends list only the terrains a map uses, in rule-table order.
function usedTerrains(map: BattleMap): Terrain[] {
  const used = new Set(map.tiles.flat());
  return (Object.keys(TERRAINS) as Terrain[]).filter(tile => used.has(tile));
}

// Relative luminance below 0.23 gives white text more contrast than #302d28.
function isDark(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.23;
}

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[char]!);
}

export function renderAscii(map: BattleMap): string {
  const rows: string[][] = map.tiles.map(row => row.map(tile => TERRAINS[tile].glyph));
  for (const [x, y] of map.spawns.player) rows[y][x] = 'A';
  for (const [x, y] of map.spawns.enemy) rows[y][x] = 'E';
  return [
    `${THEMES[map.theme].name} | ${map.width}×${map.height} | seed=${map.seed} | generatorVersion=${map.generatorVersion}`,
    ...rows.map(row => row.join(' ')),
    'A 己方出生点 / E 敌方出生点 / T 压制目标',
    usedTerrains(map).map(tile => `${TERRAINS[tile].glyph} ${TERRAINS[tile].name}`).join(' / '),
  ].join('\n');
}

export function renderSvg(map: BattleMap): string {
  const terrains = usedTerrains(map);
  const cell = 28, left = 28, top = 80;
  const width = Math.max(580, map.width * cell + left * 2);
  const height = map.height * cell + top + 94 + Math.ceil(terrains.length / 4) * 26;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">`,
    '<title id="title">随机战场地图预览</title>',
    `<desc id="description">${map.width} 乘 ${map.height} 方格地图，蓝色为己方出生点，红色为敌方出生点，T 为王座目标。</desc>`,
    '<style>text{font-family:system-ui,sans-serif;fill:#302d28} .tile{font-size:13px;text-anchor:middle} .tile.inverse{fill:#ffffff} .unit{font-size:11px;fill:white;font-weight:bold;text-anchor:middle}</style>',
    `<rect width="${width}" height="${height}" fill="#f5eedf"/>`,
    `<text x="28" y="29" font-size="20">${THEMES[map.theme].name} · ${map.width} × ${map.height}</text>`,
    `<text x="28" y="53" font-size="12">种子：${escapeXml(map.seed.slice(0, 64))} · 生成器 v${map.generatorVersion}</text>`,
  ];
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    const tile = map.tiles[y][x];
    const terrain = TERRAINS[tile];
    const px = left + x * cell, py = top + y * cell;
    parts.push(`<rect x="${px}" y="${py}" width="${cell}" height="${cell}" fill="${terrain.color}" stroke="#302d28" stroke-opacity="0.12"/>`);
    if (!UNLABELED.has(tile)) {
      const tone = isDark(terrain.color) ? 'tile inverse' : 'tile';
      parts.push(`<text class="${tone}" x="${px + 14}" y="${py + 19}">${terrain.glyph}</text>`);
    }
  }
  for (const side of ['player', 'enemy'] as const) {
    map.spawns[side].forEach(([x, y], index) => {
      const cx = left + x * cell + 14, cy = top + y * cell + 14;
      parts.push(`<circle cx="${cx}" cy="${cy}" r="11" fill="${side === 'player' ? '#34556b' : '#a84940'}"/>`);
      parts.push(`<text class="unit" x="${cx}" y="${cy + 4}">${side === 'player' ? 'A' : 'E'}${index + 1}</text>`);
    });
  }
  const legendY = top + map.height * cell + 24;
  parts.push(`<text x="28" y="${legendY}" font-size="12">蓝 A：己方出生点　红 E：敌方出生点　T：王座目标</text>`);
  terrains.forEach((tile, i) => {
    const terrain = TERRAINS[tile];
    const x = 28 + (i % 4) * 136, y = legendY + 20 + Math.floor(i / 4) * 26;
    parts.push(`<rect x="${x}" y="${y}" width="18" height="18" fill="${terrain.color}"/>`);
    parts.push(`<text x="${x + 24}" y="${y + 14}" font-size="12">${terrain.glyph} ${terrain.name}</text>`);
  });
  parts.push(`<text x="28" y="${height - 18}" font-size="12">已校验四类移动连通性；不代表战斗必胜或竞技平衡。</text>`, '</svg>');
  return parts.join('\n');
}
