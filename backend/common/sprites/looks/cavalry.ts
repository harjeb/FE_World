// 骑乘路线 8 个职业的交战形象：飞鸵系 3 个、骑马系 5 个（坐骑部件与骑手坐标见 ./mounts.ts）。
import type { ClassLook } from '../battle.ts';
import { cape, recolor } from './kit.ts';
import { ARMORED_LEG, onHorse, onOrnius, RIDER_LEG } from './mounts.ts';

export const CAVALRY_LOOKS = {
  // 飞鸵兵：骑着顶红冠羽的沙色飞鸵，皮帽、阵营色短衫、皮护臂。
  ornius_rider: {
    hand: [32, 25],
    signature: 'lance',
    palette: { f: '#D8C8A0', F: '#9E8A60', o: '#E8A040', c: '#C8443A' },
    layers: onOrnius([
      '....kaaaak....',
      '..aaaaaaaaaa..',
      '.aaaaaaaaaaaa.',
      '.Aaaaaaaaaaaa.',
      '.Aaaaaaaaaaaa.',
      '.AAaaaaaaaaaA.',
      '..Aaaaaaaaaa..',
      '..WwwwwwwwwW..',
      '..AaaaaaaaaaA.',
      '.AAaaaaaaaaaaa',
    ], ['aa.....', 'aaa....', '.awws..', '..wwss.', '...sss.'], {
      head: [{ part: ['...wwww....', '.wwwwwwww..', 'wwwwwwwwww.', 'WWWWWWWW...'], x: 18, y: 8 }],
    }),
  },

  // 骑甲鸵兵：灰羽飞鸵披颈环与背甲，骑手锁子甲配阵营色罩袍、铁盔护颈。
  armored_ornius: {
    hand: [32, 25],
    signature: 'lance',
    palette: { f: '#A8A098', F: '#6E665E', o: '#D8903A', c: '#5A6E8A', m: '#C8CED2', M: '#8A9298', n: '#545C62' },
    layers: onOrnius([
      '....nMMn......',
      '..MnMaaaMn....',
      '.nMaaaaaaaMn..',
      '.MnaaayaaanM..',
      '.nMaayyyaaMn..',
      '.MnaaayaaanM..',
      '..naaaaaaan...',
      '..WwwwwwwwwW..',
      '..MnMnMnMnMnM.',
      '.nMnMnMnMnMnMn',
    ], ['MM.....', 'nMn....', '.MnMs..', '..ssss.', '...sss.'], {
      plates: true,
      leg: ARMORED_LEG,
      head: [{ part: ['....mmmm...', '..mmmmmmmm.', '.mmmmmmmmmm', 'MMMMMMMMMM.', 'mmm........', 'mmm........', 'MM.........'], x: 17, y: 7 }],
    }),
  },

  // 神鸵兵：三阶。金白羽的神鸵拖着长长的冠尾羽，骑手白金法铠、额前金环（也能用魔导书）。
  divine_ornius: {
    hand: [32, 25],
    signature: 'lance',
    palette: { f: '#F8F0D8', F: '#D8C088', o: '#E7C266', c: '#E7C266' },
    layers: onOrnius([
      '....kyyk......',
      '..kkkaakkk....',
      '.kkkkaakkkkk..',
      '.KkkyaaykkkK..',
      '.Kkkkaakkkkk..',
      '.KKkkaakkkkK..',
      '..Kkkaakkkk...',
      '..YyyyyyyyyY..',
      '..KkkkkkkkkkK.',
      '.KKkkkkkkkkkkk',
    ], ['kk.....', 'kyk....', '.kkys..', '..ssss.', '...sss.'], {
      before: [{ part: ['kk.......', 'ckk......', '.cck.....', '..cck....', '...ccck..', '....cccc.'], x: 0, y: 26 }],
      head: [{ part: ['yyyyyyy', '...k...'], x: 21, y: 13 }],
    }),
  },

  // 轻骑兵：栗色马、阵营色鞍褥，骑手皮甲罩阵营色短衣、圆铁盔顶一束阵营色盔缨。
  cavalier: {
    hand: [32, 27],
    signature: 'lance',
    palette: { r: '#8A5A34', R: '#5E3E24', q: '#3A2A1E' },
    layers: onHorse([
      '....kaaaak....',
      '..wwaaaawww...',
      '.wwwaaaawwww..',
      '.Wwwaaaawwww..',
      '.Wwwaaaawwww..',
      '.WWwaaaawwwW..',
      '..Wwaaaawww...',
      '..WWWWyWWWW...',
      '..AaaaaaaaaaA.',
      '.AAaaaaaaaaaaa',
    ], ['ww.....', 'www....', '.wwss..', '..ssss.', '...sss.'], {
      head: [{ part: ['.....aa.....', '....aAa.....', '...mmmmmm...', '..mmmmmmmm..', '.mmmmmmmmmm.', 'MMMMMMMMMMMM'], x: 17, y: 6 }],
    }),
  },

  // 荣光骑士：三阶。白马披银马铠，骑手银白板甲、阵营色披风、头盔插白羽。
  paladin: {
    hand: [32, 27],
    signature: 'lance',
    palette: { r: '#F0EADF', R: '#BFB5A4', q: '#C8C0B0' },
    layers: onHorse([
      '....mMMm......',
      '..mmmmmmmm....',
      '.mmmmmmmmmmm..',
      '.MmmmmymmmmM..',
      '.Mmmmyyymmmm..',
      '.MMmmmymmmmM..',
      '..Mmmmmmmmm...',
      '..YyyyyyyyyY..',
      '..MmmmmmmmmmM.',
      '.MMmmmmmmmmmmm',
    ], ['mm.....', 'mMm....', '.MmMm..', '..mmmm.', '...MMm.'], {
      barding: true,
      before: [{ part: cape('a', 'A', 10), x: 10, y: 21 }],
      leg: ARMORED_LEG,
      head: [{ part: ['...kkk......', '..kkKk......', '.kK.mmmm....', '...mmmmmmm..', '..mmmmmmmmm.', '..MMMMMMMMMM'], x: 16, y: 6 }],
    }),
  },

  // 奥利哈铁骑：四阶。人马同披黄绿色的奥利哈钢甲，头盔顶一道高高的金冠饰。
  orichaldia: {
    hand: [32, 27],
    signature: 'lance',
    palette: { r: '#5E3E24', R: '#3A2616', q: '#1E140C', m: '#D8E0A0', M: '#9AA858', n: '#5A6A2E' },
    layers: onHorse([
      '....nMMn......',
      '..mmmmmmmm....',
      '.mmmnmmnmmmm..',
      '.MmmmnnmmmmM..',
      '.Mmmmmmmmmmm..',
      '.MMmmnnmmmmM..',
      '..Mmmmmmmmm...',
      '..yyyyyyyyy...',
      '..MmmmmmmmmmM.',
      '.MMmmmmmmmmmmm',
    ], ['mm.....', 'mMn....', '.MmMm..', '..mmmm.', '...MMm.'], {
      barding: true,
      leg: ARMORED_LEG,
      head: [{ part: ['.....y......', '....yyy.....', '....yYy.....', '...mmmmmm...', '..mmmmmmmm..', '.mmmmmmmmmm.', 'MMMMMMMMMMM.', 'nn..........'], x: 17, y: 4 }],
    }),
  },

  // 英勇骑士：四阶重甲骑兵。黑马披厚重铁铠，骑手宽大的护肩、遮住后脑与面颊的重盔。
  great_knight: {
    hand: [32, 27],
    signature: 'axe',
    palette: { r: '#3A3A44', R: '#24242C', q: '#16161C', m: '#9AA2AA', M: '#646C74', n: '#3C4248' },
    layers: onHorse([
      '...mMMMMm.....',
      '.mmmmmmmmmmm..',
      'mmMmmmmmmmMmm.',
      'MMmmmmnmmmmMM.',
      '.Mmmmnmmmmmm..',
      '.MMmmmmmmmmM..',
      '..Mmmmmmmmm...',
      '..nnnnnnnnn...',
      '..MmmmmmmmmmM.',
      '.MMmmmmmmmmmmm',
    ], ['mmm....', 'mMMm...', '.MmMm..', '..mmmm.', '...MMm.'], {
      barding: true,
      leg: ARMORED_LEG,
      head: [{ part: ['....mmmm....', '..mmmmmmmm..', '.mmmmmmmmmm.', 'mmmmmmmmmmmm', 'mmmmmmmmmmm.', 'MMMMMMMMMMM.', 'mmmmm.......', 'mmmmm.......', 'mmmmm....n..', 'Mmmmm....n..', '.MMM........'], x: 17, y: 9 }],
    }),
  },

  // 烈骏神将：骑乘五阶。赤焰色神驹（火焰色鬃尾），骑手金白辉甲、带白翼的头盔、身后阵营色长披风。
  divine_cavalier: {
    hand: [32, 27],
    signature: 'lance',
    palette: { r: '#C8582A', R: '#8E3A1A', q: '#F0A040' },
    layers: onHorse([
      '....yYYy......',
      '..yyyyyyyy....',
      '.yyyykkyyyyy..',
      '.YyyykkkyyyY..',
      '.Yyyyykyyyyy..',
      '.YYyyykyyyyY..',
      '..Yyyyyyyyy...',
      '..kkkkkkkkk...',
      '..YyyyyyyyyyY.',
      '.YYyyyyyyyyyyy',
    ], ['yy.....', 'yYy....', '.YyYs..', '..ssss.', '...sss.'], {
      before: [{ part: cape('a', 'A'), x: 8, y: 20 }],
      leg: recolor(RIDER_LEG, { b: 'y', W: 'Y' }),
      head: [{ part: ['kk........kk', 'kkk.yyyy.kkk', '.kkyyyyyykk.', '..YYYYYYYY..'], x: 15, y: 8 }],
    }),
  },
} satisfies Record<string, ClassLook>;
