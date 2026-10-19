// 飞行路线 4 个职业的交战形象：天马系 2 个、飞龙系 2 个（坐骑部件与骑手坐标见 ./mounts.ts）。
import type { ClassLook } from '../battle.ts';
import { cape, recolor } from './kit.ts';
import { ARMORED_LEG, HORSE, HORSE_BARDING, PEGASUS_WING, RIDER_LEG, SADDLE_CLOTH, WYVERN, WYVERN_WING } from './mounts.ts';

// 骑天马：马 (5,22)、翼 (4,23)、鞍褥、骑手同骑马坐标，手 (32,27)。
const PEGASUS_BASE = [
  { part: HORSE, x: 5, y: 22 },
  { part: PEGASUS_WING, x: 4, y: 23 },
  { part: SADDLE_CLOTH, x: 13, y: 32 },
];
// 骑飞龙：翼 (3,13)、龙 (4,18)、鞍褥 (12,29)；骑手坐在肩背，比骑马高 2 格，手 (32,25)。
const WYVERN_BASE = [
  { part: WYVERN_WING, x: 3, y: 13 },
  { part: WYVERN, x: 4, y: 18 },
  { part: SADDLE_CLOTH, x: 12, y: 29 },
];
// 飞龙颈甲与额甲，叠在 WYVERN 上。
const WYVERN_PLATES = [
  '........................................',
  '.............................mmm........',
  '............................mMMMm.......',
  '........................................',
  '........................................',
  '........................................',
  '..........................mm............',
  '.........................mMm............',
  '........................mMm.............',
  '.......................mMm..............',
  '......................mMm...............',
];

export const FLYING_LOOKS = {
  // 天翼兵：白天马，骑手银胸甲罩阵营色短衣、白色发带。
  pegasus: {
    hand: [32, 27],
    signature: 'lance',
    palette: { r: '#F0EADF', R: '#BFB5A4', q: '#C8D8E8' },
    layers: [
      ...PEGASUS_BASE,
      { part: RIDER_LEG, x: 20, y: 31 },
      { part: [
        '....kaaaak....',
        '..aammmmaa....',
        '.aammmmmmaaa..',
        '.AaMmmmmmMaa..',
        '.AaaMmmmMaaa..',
        '.AAaaMMMaaaA..',
        '..Aaaaaaaaaa..',
        '..WwwwwwwwwW..',
        '..AaaaaaaaaaA.',
        '.AAaaaaaaaaaaa',
      ], x: 17, y: 22 },
      { part: 'head', x: 18, y: 11 },
      { part: ['kkkkkkkkk', 'k........', '.k.......'], x: 17, y: 14 },
      { part: 'armForward', x: 27, y: 24 },
    ],
  },

  // 圣天翼兵：四阶。天马披金饰马铠、羽翼更大，骑手银甲配阵营色披风、头盔拖一束长白羽。
  falcon: {
    hand: [32, 27],
    signature: 'lance',
    palette: { r: '#F0EADF', R: '#BFB5A4', q: '#E7C266' },
    layers: [
      { part: HORSE, x: 5, y: 22 },
      { part: recolor(HORSE_BARDING, { m: 'y', M: 'Y', n: 'Y' }).slice(0, 12), x: 5, y: 22 },
      { part: recolor(PEGASUS_WING, { K: 'y' }), x: 3, y: 21 },
      { part: PEGASUS_WING, x: 5, y: 23 },
      { part: SADDLE_CLOTH, x: 13, y: 32 },
      { part: cape('a', 'A', 10), x: 10, y: 21 },
      { part: ARMORED_LEG, x: 20, y: 31 },
      { part: [
        '....mMMm......',
        '..mmmmmmmm....',
        '.mmmmmymmmmm..',
        '.Mmmmyyymmmm..',
        '.MMmmmymmmmM..',
        '..Mmmmmmmmm...',
        '..MMmmmmmmM...',
        '..yyyyyyyyy...',
        '..AaaaaaaaaaA.',
        '.AAaaaaaaaaaaa',
      ], x: 17, y: 22 },
      { part: 'head', x: 18, y: 11 },
      { part: ['kkkk.........', '..kkkk.......', '....kKmmmm...', '....mmmmmmm..', '...mmmmmmmmm.', '...MMMMMMMMMM'], x: 13, y: 6 },
      { part: ['mm.....', 'mMm....', '.MmMm..', '..mmmm.', '...MMm.'], x: 27, y: 24 },
    ],
  },

  // 驭龙兵：绿鳞飞龙，骑手铁黑铠甲、带尖刺的护肩、阵营色短披风、护颊铁盔。
  dragon_knight: {
    hand: [32, 25],
    signature: 'lance',
    palette: { g: '#5A8A4A', G: '#3A5E30', d: '#C8B880', x: '#E8DCC0', X: '#3A5E30', m: '#9AA2AA', M: '#646C74', n: '#3C4248' },
    layers: [
      ...WYVERN_BASE,
      { part: cape('a', 'A', 9), x: 10, y: 19 },
      { part: ARMORED_LEG, x: 20, y: 29 },
      { part: [
        '..m.nMMn......',
        '..mmmmmmmm....',
        '.mmmmmmmmmmm..',
        '.MmmmnnmmmmM..',
        '.Mmmmmmmmmmm..',
        '.MMmmnnmmmmM..',
        '..Mmmmmmmmm...',
        '..aaaaaaaaaa..',
        '..MmmmmmmmmmM.',
        '.MMmmmmmmmmmmm',
      ], x: 17, y: 20 },
      { part: 'head', x: 18, y: 9 },
      { part: ['...mmmmmm...', '..mmmmmmmmm.', '.mmmmmmmmmmm', 'mmmmmmmmmmm.', 'mmMMMMMMMMM.', 'mmm......n..', 'mmm......n..', 'mMm.........'], x: 17, y: 5 },
      { part: ['mm.m...', 'mMmm...', '.MmMm..', '..mmmm.', '...MMm.'], x: 27, y: 22 },
    ],
  },

  // 飞龙将领：四阶。赤鳞飞龙披颈甲额甲，骑手金边重甲、阵营色大披风、头盔顶红缨冠。
  dragon_commander: {
    hand: [32, 25],
    signature: 'axe',
    palette: { g: '#A8443A', G: '#6E2A24', d: '#E8C890', x: '#F0E6D0', X: '#6E2A24', m: '#C8CED2', M: '#868E94', n: '#4E565C', o: '#C8443A' },
    layers: [
      ...WYVERN_BASE,
      { part: WYVERN_PLATES, x: 4, y: 18 },
      { part: cape('a', 'A', 11), x: 9, y: 19 },
      { part: recolor(RIDER_LEG, { b: 'm', W: 'M' }), x: 20, y: 29 },
      { part: [
        '...ymMMmy.....',
        '..mmmmmmmmm...',
        '.ymmmmmmmmmy..',
        '.MmmmyyymmmM..',
        '.Mmmmmymmmmm..',
        '.MMmmmymmmmM..',
        '..Mmmmmmmmm...',
        '..yyyyyyyyyy..',
        '..MmmmmmmmmmM.',
        '.MMmmmmmmmmmmm',
      ], x: 17, y: 20 },
      { part: 'head', x: 18, y: 9 },
      { part: ['....oo......', '...ooOo.....', '...mmmmm....', '..mmmmmmmmm.', '.mmmmmmmmmmm', 'mmmmmmmmmmm.', 'mmyyyyyyyyy.', 'mmm.........', 'mmm.........', 'mMm.........'], x: 17, y: 3 },
      { part: ['yy.....', 'mMm....', '.MmMm..', '..mmmm.', '...MMm.'], x: 27, y: 22 },
    ],
  },
} satisfies Record<string, ClassLook>;
