// 魔法路线 8 个职业的交战形象（见 ../battle.ts 的调色约定、./kit.ts 与 ./mounts.ts 的坐标）。
import type { ClassLook } from '../battle.ts';
import { cape, recolor, robeSkirt, tatteredCape } from './kit.ts';
import { onHorse, RIDER_LEG } from './mounts.ts';

export const MAGIC_LOOKS = {
  // 诅咒师：压低的深紫兜帽长袍、阵营色镶边、麻绳腰带垂着护符。
  adept: {
    hand: [32, 31],
    signature: 'tome',
    palette: { c: '#4E3A66', C: '#30223F' },
    layers: [
      { part: robeSkirt('c', 'C'), x: 15, y: 38 },
      { part: [
        '....caac......',
        '..cccaaccc....',
        '.ccccaaccccc..',
        '.Cccccaacccc..',
        '.Ccccccaaccc..',
        '.CCcccccaacC..',
        '..Cccccccaac..',
        '..CCccccccaC..',
        '..KkKkKkKkKk..',
        '..cccccKcccc..',
        '.ccccccyccccc.',
        '.Cccccccccccc.',
      ], x: 17, y: 26 },
      { part: 'head', x: 18, y: 15 },
      { part: ['....ccccc....', '..ccccccccc..', '.cccccccccccc', 'cccccccccccc.', 'ccccccCcccc..', 'cccccC.......', 'ccccC........', 'ccccC........', 'cccC.........', 'ccC..........', 'cC...........'], x: 17, y: 13 },
      { part: ['cc.....', 'ccc....', '.cccs..', '..cass.', '...sss.'], x: 27, y: 28 },
    ],
  },

  // 萨满巫师：三根长羽的头饰、阵营色锯齿纹斗篷、兽骨项链、褐色长裙、赤足。
  mage: {
    hand: [32, 31],
    signature: 'tome',
    palette: { c: '#8A5A34', C: '#5E3E24', d: '#E8C060', o: '#C8443A' },
    layers: [
      { part: robeSkirt('c', 'C'), x: 15, y: 38 },
      { part: [
        '....kkkk......',
        '..aakKKkaa....',
        '.aaaaaaaaaaa..',
        '.aAaAaAaAaAa..',
        'aAdAdAdAdAdAa.',
        'AdAdAdAdAdAdA.',
        '.AAAAAAAAAAA..',
        '..cccccccccc..',
        '..dddddddddd..',
        '..cccccccccc..',
        '.ccccccccccccc',
        '.Cccccccccccc.',
      ], x: 17, y: 26 },
      { part: 'head', x: 18, y: 15 },
      { part: ['..k...o.....', '..kK..oo..d.', '...kK.oO.dd.', '....kKoOdd..', 'dodododododo', 'DDDDDDDDDDDD'], x: 17, y: 9 },
      { part: ['ss.....', 'sss....', '.ssss..', '..dsss.', '...sss.'], x: 27, y: 28 },
    ],
  },

  // 先知：深蓝长袍镶金纹、高立领、额前嵌宝石的金环、阵营色腰带与前襟、阵营色袖口。
  sage: {
    hand: [32, 31],
    signature: 'tome',
    palette: { c: '#3A5A8A', C: '#24406A', d: '#E7C266', g: '#7CC6DA' },
    layers: [
      { part: robeSkirt('c', 'C'), x: 15, y: 38 },
      { part: ['.dddddddddddd.', '..d.......d...'], x: 15, y: 45 },
      { part: [
        '...yddddy.....',
        '..cyccccyc....',
        '.cccccdcccccc.',
        '.Cccccdcccccc.',
        '.Ccccydyccccc.',
        '.CCcccdccccC..',
        '..CccydycccC..',
        '..CCcccccccC..',
        '..aaaaaaaaaa..',
        '..ccccaccccc..',
        '.cccccacccccc.',
        '.CccccAcccccc.',
      ], x: 17, y: 26 },
      { part: 'head', x: 18, y: 15 },
      { part: ['yyyyyyyyy', '....g....'], x: 19, y: 17 },
      { part: ['ccc....', 'cccc...', '.cccaa.', '..aass.', '...sss.'], x: 27, y: 28 },
    ],
  },

  // 锻造师：额上推着护目镜、卷起袖子的阵营色衬衫外系厚皮围裙、粗皮手套、腰挂锤子与钳子。
  blacksmith: {
    hand: [32, 31],
    signature: 'axe',
    palette: { g: '#7CC6DA' },
    layers: [
      { part: [
        '...bbb...bbb...',
        '...bbb...bbbb..',
        '..bbb.....bbb..',
        '..bbb.....bbb..',
        '.WWW.......WWW.',
        '.WWW.......WWW.',
        '.WWW.......WWW.',
        'WWWW........WWW',
        'WWWW.......WWWW',
      ], x: 16, y: 38 },
      { part: [
        '....kaaaak....',
        '..aaaaaaaaaa..',
        '.aaaWwwwwWaa..',
        '.AaaWwwwwWaa..',
        '.AaaWwwwwWaa..',
        '.AAaWwwwwWaA..',
        '..AaWwwwwWa...',
        '..WWWwwwwWWW..',
        '..MbWwwwwWbn..',
        '..MbWwwwwWbn..',
        '.bbbWwwwwWbbb.',
        '.bbbbWWWWbbbb.',
      ], x: 17, y: 26 },
      { part: 'head', x: 18, y: 15 },
      { part: ['.WWWWWWWWW.', 'WWWnggnggnW', '....nn.nn..'], x: 17, y: 16 },
      { part: ['aa.....', 'sss....', '.ssss..', '..WWWW.', '...WWW.'], x: 27, y: 28 },
    ],
  },

  // 高阶墓志铭：四阶魔骑。灰紫色的幽灵马（眼泛青光、鬃尾如烟），骑手黑兜帽长袍、胸前骷髅扣。
  high_epitaph: {
    hand: [32, 27],
    signature: 'tome',
    palette: { r: '#8A8498', R: '#5E586C', q: '#B8E0E8', e: '#7CE0E8', c: '#2A2632', C: '#18161E' },
    layers: onHorse([
      '....ckkc......',
      '..ccckkccc....',
      '.ccccKKccccc..',
      '.Ccccccccccc..',
      '.Cccaaacccc...',
      '.CCcaaaccccC..',
      '..Cccccccccc..',
      '..aaaaaaaaaa..',
      '..CcccccccccC.',
      '.CCcccccccccccc',
    ], ['cc.....', 'ccc....', '.cccs..', '..ccss.', '...sss.'], {
      before: [{ part: tatteredCape('c', 'C'), x: 9, y: 21 }],
      leg: recolor(RIDER_LEG, { b: 'c', W: 'C' }),
      head: [{ part: ['....ccccc....', '..ccccccccc..', '.cccccccccccc', 'cccccccccccc.', 'ccccccCcccc..', 'cccccC.......', 'ccccC........', 'ccccC........', 'cccC.........', 'ccC..........'], x: 17, y: 9 }],
    }),
  },

  // 德鲁伊：鹿角兜帽、层层叶片的绿披肩、藤蔓缠身的褐色长袍、阵营色腰绳。
  druid: {
    hand: [32, 31],
    signature: 'tome',
    palette: { c: '#6A4E34', C: '#45321F', d: '#4E8A3A', D: '#2E5A22' },
    layers: [
      { part: cape('d', 'D', 12), x: 11, y: 26 },
      { part: robeSkirt('c', 'C'), x: 15, y: 38 },
      { part: [
        '..dDdDdDdD....',
        '.dDdDdDdDdD...',
        'dDdcccccdDdD..',
        '.Dccdccccdcc..',
        '.Cccdcccdccc..',
        '.CCcccdcdccC..',
        '..Ccccdccccc..',
        '..CCccdccccC..',
        '..aaaaaaaaaa..',
        '..cccccacccc..',
        '.ccccccaccccc.',
        '.CcccccAcccccc.',
      ], x: 17, y: 26 },
      { part: 'head', x: 18, y: 15 },
      { part: ['w.w....w.w', '.ww....ww.', '..w....w..', '..waaaaw..', '.dddddddd.', 'ddDDDDDDdd', 'dD........', 'D.........'], x: 18, y: 8 },
      { part: ['dd.....', 'ddd....', '.ddcs..', '..ssss.', '...sss.'], x: 27, y: 28 },
    ],
  },

  // 神军师：黑色高冠、白底蓝边的宽袖长袍、肩上一对轻甲片、阵营色腰带，文武兼备的军师。
  mage_knight: {
    hand: [32, 31],
    signature: 'tome',
    palette: { c: '#F0EADF', C: '#BFB5A4', z: '#22222A' },
    layers: [
      { part: robeSkirt('c', 'C'), x: 15, y: 38 },
      { part: ['.aaaaaaaaaaaaa', '..a.......aa..'], x: 15, y: 45 },
      { part: [
        '....acca......',
        '..mmmacamm....',
        '.mmmccacmmmc..',
        '.Mmcccacccmm..',
        '.Ccccacccccc..',
        '.CCccacccccC..',
        '..Cccacccccc..',
        '..CCcacccccC..',
        '..aaaaaaaaaa..',
        '..cccacccccc..',
        '.ccccacccccac.',
        '.Ccccacccccac.',
      ], x: 17, y: 26 },
      { part: 'head', x: 18, y: 15 },
      { part: ['...zzzz....', '..zzzzzz...', '..zZZZZz...', '.zzzzzzzz..', 'zzzzzzzzzz.'], x: 18, y: 10 },
      { part: ['ccc....', 'cccc...', '.cccaa.', '..aass.', '...sss.'], x: 27, y: 28 },
    ],
  },

  // 黑暗骑士：黑马、乌黑带尖刺的铠甲、弯角头盔、身后暗紫披风、阵营色腰带。
  dark_knight: {
    hand: [32, 27],
    signature: 'sword',
    palette: { r: '#2E2A34', R: '#1C1A22', q: '#4A3A5A', m: '#5E5A66', M: '#3A3644', n: '#24222C', c: '#4A2A5E', C: '#2E1A3E' },
    layers: onHorse([
      '..m.nMMn.m....',
      '..mmmmmmmm....',
      '.mmMmmmmMmmm..',
      '.MmmmnnmmmmM..',
      '.Mmmmmmmmmmm..',
      '.MMmmnnmmmmM..',
      '..Mmmmmmmmm...',
      '..aaaaaaaaaa..',
      '..MmmmmmmmmmM.',
      '.MMmmmmmmmmmmm',
    ], ['mm.....', 'mMm....', '.MmMm..', '..mmmm.', '...MMm.'], {
      barding: true,
      before: [{ part: cape('c', 'C', 10), x: 10, y: 21 }],
      leg: recolor(RIDER_LEG, { b: 'm', W: 'M' }),
      head: [{ part: ['K..........K', 'KK........KK', '.KK.mmmm.KK.', '..mmmmmmmm..', '.mmmmmmmmmm.', 'mmmmmmmmmmm.', 'mmMMMMMMMMM.', 'mmm.........', 'mmm.........', 'mMm.........'], x: 16, y: 6 }],
    }),
  },
} satisfies Record<string, ClassLook>;
