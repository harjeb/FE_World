// 治疗路线 9 个职业的交战形象（见 ../battle.ts 的调色约定、./kit.ts 与 ./mounts.ts 的坐标）。
import type { ClassLook } from '../battle.ts';
import { cape, recolor, robeSkirt } from './kit.ts';
import { ARMORED_LEG, onHorse, RIDER_LEG } from './mounts.ts';

const WHITE_ROBE = { c: '#F0EADF', C: '#BFB5A4' };

export const HEALING_LOOKS = {
  // 牧师：白长袍、胸前垂两条阵营色圣带、金边短头纱。
  cleric: {
    hand: [32, 31],
    signature: 'staff',
    palette: { ...WHITE_ROBE },
    layers: [
      { part: robeSkirt('c', 'C'), x: 15, y: 38 },
      { part: [
        '....kyyk......',
        '..ccaccacc....',
        '.cccaccacccc..',
        '.Cccaccacccc..',
        '.Cccaccacccc..',
        '.CCcaccaccC...',
        '..Ccaccaccc...',
        '..CCaccacC....',
        '..yyayyayyyy..',
        '..cccaccaccc..',
        '.ccccaccacccc.',
        '.Ccccayyaccccc',
      ], x: 17, y: 26 },
      { part: 'head', x: 18, y: 15 },
      { part: ['...ccccc....', '.ccccccccc..', 'cccccccccc..', 'yyyyyyyyy...', 'cc..........', 'cc..........', 'cC..........', 'C...........'], x: 17, y: 12 },
      { part: ['ccc....', 'cccc...', '.ccccs.', '..ssss.', '...sss.'], x: 27, y: 28 },
    ],
  },

  // 主教：白底金纹的高主教冠、金绣长袍、肩上一领阵营色斗篷。
  bishop: {
    hand: [32, 31],
    signature: 'staff',
    palette: { ...WHITE_ROBE },
    layers: [
      { part: cape('a', 'A', 13), x: 11, y: 25 },
      { part: robeSkirt('c', 'C'), x: 15, y: 38 },
      { part: ['..y.....y.....', '..yyyyyyy.....'], x: 16, y: 44 },
      { part: [
        '..aaaaaaaa....',
        '.aaAaayaAaa...',
        '.cAcccyccAcc..',
        '.Cccyyyyyccc..',
        '.Ccccyycccc...',
        '.CCcccycccC...',
        '..Ccccyccc....',
        '..CCcccccC....',
        '..yyyyyyyyyy..',
        '..cccccyccccc.',
        '.cccccyyyccccc',
        '.Cccccyccccccc',
      ], x: 17, y: 26 },
      { part: 'head', x: 18, y: 15 },
      { part: ['....kk....', '...kkkk...', '..kkykkk..', '..kyyykk..', '..kkykkk..', '..kkkkkk..', '..yyyyyy..', '..y....y..'], x: 18, y: 8 },
      { part: ['ccc....', 'cccc...', '.cyccs.', '..ssss.', '...sss.'], x: 27, y: 28 },
    ],
  },

  // 游唱诗人：金鬃的浅色马，骑手白衫配阵营色束腰、玫瑰色插羽贝雷帽、身后奶白短披风。
  troubadour: {
    hand: [32, 27],
    signature: 'staff',
    palette: { r: '#D8B070', R: '#A8803E', q: '#F0E2B0', c: '#C86A86', C: '#8E4460', d: '#F0E6C8', D: '#C8BC98' },
    layers: onHorse([
      '....kkkk......',
      '..kkaaaakk....',
      '.kkkaaaakkkk..',
      '.Kkkaaaakkkk..',
      '.Kkkaaaakkkk..',
      '.KKkaaaakkkK..',
      '..Kkaaaakkk...',
      '..yyyyyyyyy...',
      '..ddddddddddd.',
      '.dddddddddddddd',
    ], ['kk.....', 'kkk....', '.kkks..', '..ssss.', '...sss.'], {
      before: [{ part: cape('d', 'D', 9), x: 10, y: 21 }],
      leg: recolor(RIDER_LEG, { b: 'd', W: 'W' }),
      head: [{ part: ['.......kk..', '......kKk..', '..ccccccc..', '.ccccccccc.', '..CCCCCCC..'], x: 17, y: 8 }],
    }),
  },

  // 卫士：白银板甲外罩阵营色十字罩袍、敞面盔插白羽，持枪亦持杖的护卫圣职。
  guardian: {
    hand: [32, 31],
    signature: 'lance',
    palette: { m: '#E0E4E6', M: '#9AA2A8', n: '#646C72' },
    layers: [
      { part: [
        '...mmm...mmm...',
        '...mMm...mmMm..',
        '..mnM.....mnM..',
        '..mmM.....mmM..',
        '.mmM.......mmM.',
        '.mMM.......mMM.',
        '.MnM.......MnM.',
        'MMmm........Mmm',
        'MMMM.......MMMM',
      ], x: 16, y: 38 },
      { part: [
        '....mMMm......',
        '..mmaaaamm....',
        '.mmaaakaaamm..',
        '.MmaakkkaamM..',
        '.Mmaaakaaamm..',
        '.MMaaakaaamM..',
        '..Maaaaaaam...',
        '..MMaaaaaaM...',
        '..yyyyyyyyyy..',
        '..aaaaaaaaaa..',
        '.Maaaaaaaaaam.',
        '.MMaaaa.aaaMM.',
      ], x: 17, y: 26 },
      { part: 'head', x: 18, y: 15 },
      { part: ['...kkk......', '..kkKk......', '.kK.mmmmm...', '...mmmmmmmm.', '..mmmmmmmmm.', '..MMMMMMMMMM', '..mm........', '..mm........', '..mM........'], x: 16, y: 8 },
      { part: ['mm.....', 'mMm....', '.MmMm..', '..mmmm.', '...MMm.'], x: 27, y: 28 },
    ],
  },

  // 圣枪师：四阶。锁子甲外罩白色长罩衣、高耸的双翼盔、阵营色斜肩圣带。
  sentinel: {
    hand: [32, 31],
    signature: 'lance',
    palette: { ...WHITE_ROBE, m: '#D0D6DA', M: '#8A9298', n: '#545C62' },
    layers: [
      { part: [
        '...nMn...nMn...',
        '...MnM...nMnM..',
        '..nMn.....nMn..',
        '..MnM.....MnM..',
        '.nMn.......nMn.',
        '.MnM.......MnM.',
        '.WWW.......WWW.',
        'WWww........Www',
        'WWWW.......WWWW',
      ], x: 16, y: 38 },
      { part: [
        '....nMMn......',
        '..ccaccccc....',
        '.ccccaccccccc.',
        '.Ccccca.ccccc.',
        '.Cccccc.acccc.',
        '.CCcccccaacC..',
        '..Ccccccccac..',
        '..CCccccccaC..',
        '..aaaaaaaaaa..',
        '.Ccccccccccccc',
        'CCcccccccccccC',
        'Cccc......cccC',
      ], x: 17, y: 26 },
      { part: 'head', x: 18, y: 15 },
      { part: ['k........k..', 'kk......kk..', 'kkk.mmm.kkk.', '.kkmmmmmmk..', '..mmmmmmmmm.', '..MMMMMMMMMM', '..mm........', '..mM........'], x: 16, y: 7 },
      { part: ['cc.....', 'ccc....', '.cnns..', '..ssss.', '...sss.'], x: 27, y: 28 },
    ],
  },

  // 贤士：四阶。宽檐斗笠、褐色行脚僧袍、木念珠、腰间挂着酒葫芦、阵营色腰带。
  wiseman: {
    hand: [32, 31],
    signature: 'staff',
    palette: { c: '#7A5A3E', C: '#4E3A26', d: '#D8B868', D: '#9E8040', o: '#C8843A', O: '#8E5A24' },
    layers: [
      { part: robeSkirt('c', 'C'), x: 15, y: 38 },
      { part: [
        '....wSwSw.....',
        '..ccwccccw....',
        '.cccwcccwccc..',
        '.Ccccwcwcccc..',
        '.Cccccwccccc..',
        '.CCcccccccC...',
        '..Ccccccccc...',
        '..CCcccccccC..',
        '..aaaaaaaaaa..',
        '..ccccccoocc..',
        '.cccccccoOccc.',
        '.Cccccccccccc.',
      ], x: 17, y: 26 },
      { part: 'head', x: 18, y: 15 },
      { part: ['......d......', '....ddddd....', '..aaaaaaaaaa.', 'dddDDDDDDDDdd', '.D.........D.'], x: 16, y: 11 },
      { part: ['cc.....', 'ccc....', '.cccs..', '..ssss.', '...sss.'], x: 27, y: 28 },
    ],
  },

  // 瓦尔基里姆：四阶骑乘圣职。白马，骑手银胸甲配短裙甲、两侧带白翼的头盔、阵营色长披风。
  valkyrie: {
    hand: [32, 27],
    signature: 'staff',
    palette: { r: '#F0EADF', R: '#BFB5A4', q: '#E7C266' },
    layers: onHorse([
      '....mMMm......',
      '..mmmmmmmm....',
      '.mmmmyymmmmm..',
      '.MmmmyymmmmM..',
      '.Mmmmmmmmmmm..',
      '.MMmmmmmmmmM..',
      '..yyyyyyyyy...',
      '..mMmMmMmMm...',
      '..aaaaaaaaaaa.',
      '.aaaaaaaaaaaaa',
    ], ['mm.....', 'mMm....', '.Mmss..', '..ssss.', '...sss.'], {
      before: [{ part: cape('a', 'A', 11), x: 9, y: 21 }],
      leg: ARMORED_LEG,
      head: [{ part: ['kk.........', 'kkk..mmmm..', '.kkkmmmmmm.', '..kmmmmmmmm', '..MMMMMMMM.'], x: 15, y: 8 }],
    }),
  },

  // 岚枪神将：治疗系五阶枪圣。蓝白雷纹铠、闪电锯齿边的阵营色大披风、高翼冠盔，周身迸着电光。
  storm_lancer: {
    hand: [32, 31],
    signature: 'lance',
    palette: { m: '#E4ECF4', M: '#8AA4C0', n: '#4E6A8A', g: '#9EE8FF', d: '#F4E27A' },
    layers: [
      { part: ['......AAA', '.....aaaa', '....aaaaa', '....aaaaa', '...aaaaaa', '...aaaaad', '..aaaaaad', '..aaaaaaA', '.aaaaadaA', '.aaaaadAA', 'aaaadaaA.', 'aadaaaAA.', 'adAAdA...', 'd..d.....'], x: 10, y: 26 },
      { part: [
        '...mmm...mmm...',
        '...mMm...mmMm..',
        '..mdM.....mdM..',
        '..mmM.....mmM..',
        '.mmM.......mmM.',
        '.mMM.......mMM.',
        '.MnM.......MnM.',
        'MMmm........Mmm',
        'MMMM.......MMMM',
      ], x: 16, y: 38 },
      { part: [
        '....mMMm......',
        '..mmmmmmmmm...',
        '.mmmmdmmmmmm..',
        '.Mmmmmdmmmmm..',
        '.Mmmmdmmmmmm..',
        '.MMmmmdmmmmM..',
        '..Mmmdmmmmm...',
        '..MMmmmmmmM...',
        '..aaaadaaaaa..',
        '..MmmmmmmmmM..',
        '.MMmmmmmmmmMM.',
        '.MMmmmmmmmmmM.',
      ], x: 17, y: 26 },
      { part: 'head', x: 18, y: 15 },
      { part: ['k...d.....k.', 'kk..dd...kk.', 'kkkmmmmmmkk.', '.kmmmmmmmmk.', '..mmmmmmmmm.', '..MMMMMMMMMM', '..mm........', '..mM........'], x: 16, y: 8 },
      { part: ['mm.....', 'mMm....', '.MmMm..', '..mmmm.', '...MMm.'], x: 27, y: 28 },
      { part: ['g......g', '.g......', '........', 'g.....g.'], x: 13, y: 16 },
    ],
  },

  // 圣转神将：治疗系五阶。头顶金色光环、背后一对白色光之翼、白金层叠圣袍、阵营色圣带。
  saint: {
    hand: [32, 31],
    signature: 'staff',
    palette: { ...WHITE_ROBE, g: '#FCE08A' },
    layers: [
      { part: ['kk........', 'kkkk......', '.kkkkk....', '.KkkkkKk..', '..KkkkkkKk', '..KKkkkkkk', '...KKkkkkk', '....KKkkkk', '......KKkK', '........KK'], x: 9, y: 19 },
      { part: robeSkirt('c', 'C'), x: 15, y: 38 },
      { part: ['.yyyyyyyyyyyy.', '..y.........y.'], x: 15, y: 44 },
      { part: [
        '....kyyk......',
        '..cccaacccc...',
        '.ccyyaayyccc..',
        '.Cccyaayccc...',
        '.Ccccaacccc...',
        '.CCycaacycC...',
        '..Ccyaayccc...',
        '..CCcaaccC....',
        '..yyyyyyyyyy..',
        '..cccaacccccc.',
        '.ccccaaccccccc',
        '.Ccccyyccccccc',
      ], x: 17, y: 26 },
      { part: 'head', x: 18, y: 15 },
      { part: ['..yyyyyyy..', '.y.......y.', '..yyyyyyy..'], x: 18, y: 10 },
      { part: ['ccc....', 'cccc...', '.cycc..', '..ssss.', '...sss.'], x: 27, y: 28 },
      { part: ['g.....', '......', '.....g'], x: 15, y: 18 },
    ],
  },
} satisfies Record<string, ClassLook>;
