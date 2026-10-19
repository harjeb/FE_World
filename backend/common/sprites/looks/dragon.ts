// 龙族路线 5 个职业的交战形象（见 ../battle.ts 的调色约定、./kit.ts 的坐标）。龙角 x/X 为骨色，
// 翼膜和鳞片 g/G 每阶一种颜色；从觉醒者的小角小翼，到龙神将身后展开的大翼，逐阶长大。手里的龙石由武器层 dragon 画。
import type { ClassLook } from '../battle.ts';
import { cape, recolor, robeSkirt } from './kit.ts';

const HORN = { x: '#E8DCC0', X: '#A89878' };

// 收拢在背后的龙翼（骨线 X、翼膜 g/G），size 越大越高。
const FOLDED_WING_SMALL = [
  '..XX',
  '.Xgg',
  'Xggg',
  '.GGg',
];
const FOLDED_WING = [
  'X.........',
  'XX........',
  'gXX.......',
  'ggXX......',
  'gXgXX.....',
  'ggXggXX...',
  'gggXgggXX.',
  'ggggXggggX',
  'GgggXgggg.',
  '.GGgGXggg.',
  '..G.GG.G..',
];
const FOLDED_WING_BIG = [
  'X............',
  'XX...........',
  'gXX..........',
  'ggXX.........',
  'gXgXX........',
  'ggXggXX......',
  'gggXgggXX....',
  'ggXgXggggXX..',
  'gggXgXgggggX.',
  'ggggXgXggggg.',
  'GgggXggXgggg.',
  '.GGgGXggXggg.',
  '..G.GG.GG.G..',
];
// 根部粗、贴地弯下的龙尾（右上角是尾根，画在身体之前）。
const TAIL = [
  '.......ggg',
  '.....ggggG',
  '...gggggG.',
  '.gggggGG..',
  'ggggGG....',
  'GGGG......',
];
const BIG_TAIL = [
  '.........gggg',
  '.......ggggggG',
  '.....gggggggG.',
  '...ggggggGG...',
  '.gggggGGG.....',
  'gggGGG........',
  'GGG...........',
];
// 龙神将身后展开的大翼（左翼；右翼用镜像）。
const SPREAD_WING = [
  'X...................',
  'XX..................',
  'XgX.................',
  '.XggX...............',
  '.XgggXX.............',
  '.XggggggXX..........',
  '..XgggggggXX........',
  '..XggggggggggXX.....',
  '..XGgggggggggggXX...',
  '...XGgggggggggggggX.',
  '...XGGgggggggggggggX',
  '...XGGggggggggggggg.',
  '....XGGGgggggggggg..',
  '....XGG.GGgggggggg..',
  '.....X...GGgggggg...',
  '..........GGGgggg...',
  '.............GGgg...',
];

export const DRAGON_LOOKS = {
  // 觉醒者：刚觉醒的龙族少年——头顶一对小角、背后一对小翼、短尾，阵营色短衫系金色腰带。
  awakened: {
    hand: [32, 31],
    signature: 'dragon',
    palette: { ...HORN, g: '#5A9A7A', G: '#3A6A54', c: '#E8C060' },
    layers: [
      { part: FOLDED_WING_SMALL, x: 14, y: 24 },
      { part: ['.....gg', '...gggG', '.gggG..', 'gGG....'], x: 10, y: 36 },
      { part: 'legsStance', x: 16, y: 38 },
      { part: [
        '....kaaaak....',
        '..aaaaaaaaaa..',
        '.aaaaaaaaaaaa.',
        '.Aaaaaaaaaaaa.',
        '.Aaaaaaaaaaaa.',
        '.AAaaaaaaaaaA.',
        '..Aaaaaaaaaa..',
        '..AAaaaaaaaA..',
        '..cccccccccc..',
        '..AaaaaaaaaA..',
        '.AAaaaaaaaaAA.',
        '.AAaaaaaaaaaA.',
      ], x: 17, y: 26 },
      { part: 'head', x: 18, y: 15 },
      { part: ['.x...x.', 'xX..xX.', 'X...X..'], x: 20, y: 12 },
      { part: 'armForward', x: 27, y: 28 },
    ],
  },

  // 龙人：向后弯的双角、收拢的中型龙翼、鳞片背心、前臂覆鳞、粗长龙尾。
  dragonkin: {
    hand: [32, 31],
    signature: 'dragon',
    palette: { ...HORN, g: '#4A8A9A', G: '#2E5A68' },
    layers: [
      { part: FOLDED_WING, x: 9, y: 17 },
      { part: TAIL, x: 8, y: 36 },
      { part: 'legsStance', x: 16, y: 38 },
      { part: [
        '....sSSs......',
        '..gggsssgg....',
        '.gGgGgGgGgg...',
        '.GgGgGgGgGg...',
        '.gGgGgGgGgG...',
        '.GGgGgGgGgG...',
        '..GgGgGgGgG...',
        '..GGgGgGgGG...',
        '..WWWWyWWWWW..',
        '..aaaaaaaaaa..',
        '.aaaaaaaaaaaa.',
        '.AAaaaaaaaaaA.',
      ], x: 17, y: 26 },
      { part: 'head', x: 18, y: 15 },
      { part: ['x.....x...', '.x.....x..', '.Xx....Xx.', '..XX...XX.', '...X....X.'], x: 17, y: 10 },
      { part: ['ss.....', 'sss....', '.sgss..', '..gsss.', '...sss.'], x: 27, y: 28 },
    ],
  },

  // 古龙卫：古铜鳞甲、带龙角的头盔、收拢的大龙翼、粗尾，阵营色护腰与布条战裙。
  ancient_guard: {
    hand: [32, 31],
    signature: 'dragon',
    palette: { ...HORN, g: '#8A7A5A', G: '#5A4E38', m: '#B4BCC2', M: '#7C868E', n: '#4A5258' },
    layers: [
      { part: FOLDED_WING_BIG, x: 6, y: 15 },
      { part: BIG_TAIL, x: 5, y: 34 },
      { part: [
        '...bbb...bbb...',
        '...bbb...bbbb..',
        '..gGg.....gGg..',
        '..GgG.....GgG..',
        '.gGg.......gGg.',
        '.GgG.......GgG.',
        '.MMM.......MMM.',
        'MMmm........Mmm',
        'MMMM.......MMMM',
      ], x: 16, y: 38 },
      { part: [
        '....gGGg......',
        '..gGgGgGgG....',
        '.GgMmmmmmgGg..',
        '.gGmmmnmmmGg..',
        '.GgmmnmmmmgG..',
        '.gGgmmmmmgGg..',
        '..GgGgGgGgG...',
        '..gGgGgGgGg...',
        '..aaaayaaaaa..',
        '..aAaAaAaAaA..',
        '.aAaAaAaAaAa..',
        '.AA.AA.AA.AA..',
      ], x: 17, y: 26 },
      { part: 'head', x: 18, y: 15 },
      { part: [
        'x...........',
        'xX........x.',
        '.xX......xX.',
        '..XmmmmmmX..',
        '.mmmmmmmmmm.',
        'mmmmmmmmmmm.',
        'mMMMMMMMMM..',
        'mm..........',
        'mm..........',
        'mM..........',
      ], x: 16, y: 10 },
      { part: ['gggg...', 'GgGgg..', '.GgGs..', '..mmss.', '...sss.'], x: 27, y: 28 },
    ],
  },

  // 龙贤者：深蓝长袍绣金色符文、向后长长掠去的双角、龙翼像斗篷一样披在身后、阵营色长腰带。
  dragon_sage: {
    hand: [32, 31],
    signature: 'dragon',
    palette: { ...HORN, c: '#2E4A6A', C: '#1E3048', g: '#6A5A9A', G: '#44386A' },
    layers: [
      { part: recolor(cape('g', 'G'), {}), x: 10, y: 24 },
      { part: ['X.....', '.X....', '..XXX.'], x: 10, y: 24 },
      { part: robeSkirt('c', 'C'), x: 15, y: 38 },
      { part: [
        '....cyyc......',
        '..ccccyccc....',
        '.cccccyccccc..',
        '.Cccyccccycc..',
        '.Ccccccccccc..',
        '.CCcyccccycC..',
        '..Cccccccccc..',
        '..CCcccccccC..',
        '..aaaaaaaaaa..',
        '..cccaaccccc..',
        '.ccccaacyccc..',
        '.CcccaAcccccc.',
      ], x: 17, y: 26 },
      { part: 'head', x: 18, y: 15 },
      { part: ['xxxx.......', '..xxXX.....', '....XXX....'], x: 12, y: 13 },
      { part: ['cc.....', 'ccc....', '.caas..', '..ssss.', '...sss.'], x: 27, y: 28 },
    ],
  },

  // 龙神将：龙系五阶。身后展开的一对巨大龙翼、金色龙角冠、阵营色龙鳞王铠、长龙尾。
  dragon_lord: {
    hand: [32, 31],
    signature: 'dragon',
    palette: { ...HORN, g: '#A8343A', G: '#6E1E26', X: '#E7C266' },
    layers: [
      { part: SPREAD_WING, x: 1, y: 6 },
      { part: SPREAD_WING, x: 26, y: 6, flip: true },
      { part: BIG_TAIL, x: 5, y: 34 },
      { part: [
        '...aaa...aaa...',
        '...aAa...aaAa..',
        '..yaA.....yaA..',
        '..aaA.....aaA..',
        '.aaA.......aaA.',
        '.aAA.......aAA.',
        '.yyy.......yyy.',
        'AAaa........Aaa',
        'AAAA.......AAAA',
      ], x: 16, y: 38 },
      { part: [
        '....yaay......',
        '..aaaaaaaa....',
        '.aaaayaaaaay..',
        '.AaaayyyaaaA..',
        '.Aaaaayaaaaa..',
        '.AAaaayaaaaA..',
        '..Aaaaaaaaa...',
        '..AAaaaaaaA...',
        '..YyyyygyyyY..',
        '..AaaaaaaaaA..',
        '.AAaayyyaaaAA.',
        '.AAaaaaaaaaaA.',
      ], x: 17, y: 26 },
      { part: 'head', x: 18, y: 15 },
      { part: ['X.........X', 'XX.......XX', '.XyyyyyyyX.', '..YYYgYYY..'], x: 17, y: 11 },
      { part: ['aaaa...', 'yAaay..', '.aAAs..', '..aass.', '...sss.'], x: 27, y: 28 },
    ],
  },
} satisfies Record<string, ClassLook>;
