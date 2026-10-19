// 各路线手绘形象共用的小工具：换色、披风、光环。坐标约定见 ../battle.ts：
// 站立的人形——头 (18,15)、躯干 (17,26)、腿 (16,38)、前臂 (27,28)，手在 (32,31)，脚踩 y=46。

// 把网格里的字母换成别的调色字母（同一张手绘图用在不同颜色上）。
export const recolor = (rows: readonly string[], map: Record<string, string>): string[] =>
  rows.map(row => [...row].map(ch => map[ch] ?? ch).join(''));

// 从后肩垂下的披风（画在躯干之前，右缘被躯干盖住）。
export const cape = (c = 'c', C = 'C', rows = 14): string[] => recolor([
  '......CCC',
  '.....cccc',
  '....ccccc',
  '....ccccc',
  '...cccccc',
  '...cccccc',
  '..ccccccc',
  '..ccccccC',
  '.cccccccC',
  '.ccccccCC',
  'cccccccC.',
  'ccccccCC.',
  'cccccCC..',
  'CCCCC....',
].slice(0, rows), { c, C });

// 下摆破成锯齿的斗篷。
export const tatteredCape = (c = 'c', C = 'C'): string[] => recolor([
  '......CCC',
  '.....cccc',
  '....ccccc',
  '....ccccc',
  '...cccccc',
  '...ccccCc',
  '..cccccCc',
  '..ccccccC',
  '.cCcccccC',
  '.ccccccCC',
  'cCccCccC.',
  'C.cC.cC..',
  '..C...C..',
], { c, C });

// 圆环（光环、气焰），半径 r，中心在网格中心；ch 为环色，inner 为内侧描色。
export function ring(r: number, ch: string, inner = ch, thickness = 1.3): string[] {
  const size = r * 2 + 3, c = (size - 1) / 2;
  return Array.from({ length: size }, (_, y) => [...Array(size)].map((_, x) => {
    const d = Math.hypot(x - c, y - c);
    return d <= r + 0.5 && d > r + 0.5 - thickness ? (d > r - 0.2 ? ch : inner) : '.';
  }).join(''));
}

// 火焰光轮：圆环外侧每隔几度冒一个火舌（只在上半圈）。
export function flameRing(r: number, ch: string, inner: string, tip: string): string[] {
  const rows = ring(r, ch, inner, 2).map(row => [...row]);
  const size = rows.length, c = (size - 1) / 2;
  for (let a = 200; a <= 340; a += 18) {
    const rad = (a * Math.PI) / 180;
    for (const extra of [1, 2]) {
      const x = Math.round(c + Math.cos(rad) * (r + extra)), y = Math.round(c + Math.sin(rad) * (r + extra));
      if (rows[y]?.[x] === '.') rows[y][x] = extra === 2 ? tip : ch;
    }
  }
  return rows.map(row => row.join(''));
}

// 背在后肩的箭袋（羽尾 k、袋身 w/W），放在 (15,19)，画在头和躯干之前。
export const QUIVER = ['..kk', '.kkK', '.ww.', '.ww.', 'ww..', 'ww..', 'WW..'];

export const BARE_ARM = [
  'ss.....',
  'sss....',
  '.ssss..',
  '..ssss.',
  '...sss.',
];

// 阵营色短衫（平民等的底衣）。
export const TUNIC = [
  '....kaaaak....',
  '..aaaaaaaaaa..',
  '.aaaaaaaaaaaa.',
  '.Aaaaaaaaaaaa.',
  '.Aaaaaaaaaaaa.',
  '.AAaaaaaaaaaA.',
  '..Aaaaaaaaaa..',
  '..AAaaaaaaaA..',
  '..WwwwwwwwwW..',
  '..AaaaaaaaaA..',
  '.AAaaaaaaaaAA.',
  '.AAaaaaaaaaaA.',
];

// 长袍下摆（施法者、僧侣）：从腰到脚面，脚尖露出。
export const robeSkirt = (c = 'c', C = 'C'): string[] => recolor([
  '..ccccccccccc..',
  '..ccccccccccc..',
  '..cccccccccccc.',
  '.ccccccccccccc.',
  '.ccccccccccccc.',
  '.cccccccccccccc',
  'cccccccccccccc.',
  'CccccccccccccCC',
  '.CCCWW...WWCCC.',
], { c, C });
