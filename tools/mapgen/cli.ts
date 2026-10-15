import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { generateMap } from '../../backend/common/maps/generate.ts';
import { validateMap } from '../../backend/common/maps/map.ts';
import type { Theme } from '../../backend/common/maps/themes.ts';
import { renderAscii, renderSvg } from './render.ts';

const help = `随机战场生成器（Node.js 22.18+，无需安装依赖）

生成：node tools/mapgen/cli.ts [选项]
校验：node tools/mapgen/cli.ts --check 地图.json

--width N      宽度，10–64，默认 20
--height N     高度，10–64，默认等于 width
--units N      每方出生点数量，1–8，默认 6
--theme NAME   grassland 草地（默认）/ city 城市 / palace 王宫内
               town 城镇街道 / mountain 山地 / forest 树林
--seed TEXT    固定种子；省略时随机生成并记录在结果中
--format TYPE ascii / json / svg，默认 ascii
--out PATH    写入新文件；拒绝覆盖已有文件，省略时输出到终端
--check PATH  校验已有 JSON 地图，失败时退出码为 1
--help        显示帮助

尺寸和人数是工具参数，并非正式游戏规则。使用同一参数和版本可复现地图。`;

async function main() {
  const { values } = parseArgs({
    options: {
      width: { type: 'string' }, height: { type: 'string' },
      units: { type: 'string' }, seed: { type: 'string' }, theme: { type: 'string' },
      format: { type: 'string' }, out: { type: 'string' },
      check: { type: 'string' }, help: { type: 'boolean' },
    },
    allowPositionals: false,
  });
  if (values.help) { console.log(help); return; }
  if (values.check !== undefined) {
    if (Object.keys(values).some(key => key !== 'check')) {
      throw new Error('--check 不能与生成或输出选项混用');
    }
    const result = validateMap(JSON.parse(await readFile(values.check, 'utf8')));
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exitCode = 1;
    return;
  }
  const format = values.format ?? 'ascii';
  if (!['ascii', 'json', 'svg'].includes(format)) throw new Error('format 必须为 ascii、json 或 svg');
  const width = values.width === undefined ? 20 : Number(values.width);
  const map = generateMap({
    seed: values.seed ?? randomBytes(8).toString('hex'), width,
    theme: values.theme as Theme | undefined,
    height: values.height === undefined ? width : Number(values.height),
    unitsPerSide: values.units === undefined ? 6 : Number(values.units),
  });
  const output = format === 'json' ? JSON.stringify(map, null, 2)
    : format === 'svg' ? renderSvg(map) : renderAscii(map);
  if (values.out !== undefined) {
    await writeFile(values.out, output + '\n', { flag: 'wx' });
    console.error(`已保存 ${values.out}（seed=${map.seed}，${map.theme}，${map.width}×${map.height}，四类移动校验通过）`);
  } else {
    console.log(output);
  }
}

main().catch(error => {
  console.error(`错误：${error.message}`);
  process.exitCode = 1;
});
