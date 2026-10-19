// 格斗路线 3 个职业的交战形象（见 ../battle.ts 的调色约定、./kit.ts 的坐标）。
import type { ClassLook } from '../battle.ts';
import { flameRing } from './kit.ts';

export const FIST_LOOKS = {
  // 斗拳手：白背心、阵营色拳击短裤、红头带垂尾、手缠白布、拳击鞋。
  brawler: {
    hand: [32, 31],
    signature: 'fist',
    palette: { c: '#C8443A', C: '#8E2A24' },
    layers: [
      { part: [
        '..aaa...aaa....',
        '...sss...sss...',
        '..sss.....sss..',
        '..sss.....sss..',
        '.sss.......sss.',
        '.sSs.......sSs.',
        '.kkk.......kkk.',
        'kkKk........kKk',
        'KKKK.......KKKK',
      ], x: 16, y: 38 },
      { part: [
        '....sSSs......',
        '..sskkkkss....',
        '.ssskkkkksss..',
        '.Ssskkkkksss..',
        '.Sskkkkkkkss..',
        '..Skkkkkkkks..',
        '..SkkkkkkkkS..',
        '..SKkkkkkkKS..',
        '..aaaaaaaaaa..',
        '..aAaaaaaaAa..',
        '.aaaaaaaaaaaa.',
        '.aaaaa..aaaaa.',
      ], x: 17, y: 26 },
      { part: 'head', x: 18, y: 15 },
      { part: ['.........', 'ccccccccc', 'cC.......', 'C........'], x: 16, y: 16 },
      { part: ['ss.....', 'sss....', '.ssss..', '..skkk.', '...kkk.'], x: 27, y: 28 },
    ],
  },

  // 武僧：四阶。橙黄袈裟斜披左肩、右肩裸露、木珠大念珠、阵营色腰带与灯笼裤、缠绑腿、草鞋。
  monk: {
    hand: [32, 31],
    signature: 'fist',
    palette: { c: '#D9862E', C: '#9E5A1A' },
    layers: [
      { part: [
        '..aaaaa.aaaaa..',
        '..aaaa...aaaa..',
        '..aaA.....aaA..',
        '..kkk.....kkk..',
        '.kKk.......kKk.',
        '.kkk.......kkk.',
        '.sss.......sss.',
        'wwWw........wWw',
        'WWWW.......WWWW',
      ], x: 16, y: 38 },
      { part: [
        '....sSwSw.....',
        '..ccwssssw....',
        '.cccwsssswss..',
        '.Ccccwssswsss.',
        '.Cccccwwwssss.',
        '.CCccccccsss..',
        '..Cccccccccs..',
        '..CCcccccccc..',
        '..aaaaaaaaaa..',
        '..CcccccccccC.',
        '.CcccccccccccC',
        '.Ccccc..cccccC',
      ], x: 17, y: 26 },
      { part: 'head', x: 18, y: 15 },
      { part: ['ss.....', 'sss....', '.ssss..', '..skkk.', '...kkk.'], x: 27, y: 28 },
    ],
  },

  // 破拳神将：格斗五阶。身后一圈燃烧的气焰光轮、赤膊戴金项圈金臂环、白色长裤、阵营色腰带垂下长长的带尾。
  fist_deity: {
    hand: [32, 31],
    signature: 'fist',
    palette: { o: '#F0A040', O: '#C8602A', p: '#FCE08A' },
    layers: [
      { part: flameRing(14, 'o', 'O', 'p'), x: 8, y: 12 },
      { part: ['......aa', '....aaaA', '..aaaA..', '.aAA....', 'aA......', 'A.......'], x: 12, y: 34 },
      { part: [
        '..kkkkk.kkkkk..',
        '..kkkK...kkkK..',
        '..kkK.....kkK..',
        '..kkK.....kkK..',
        '.kkK.......kkK.',
        '.kkK.......kkK.',
        '.yyy.......yyy.',
        'ssss........sss',
        'SSSS.......SSSS',
      ], x: 16, y: 38 },
      { part: [
        '...yyyyyy.....',
        '..syyyyyys....',
        '.ssssyysssss..',
        '.Ssssssssssy..',
        '.Ssssssssssy..',
        '.SSssssssssS..',
        '..Ssssssssss..',
        '..SSsssssssS..',
        '..yaaaaaaaay..',
        '..kkkkkkkkkk..',
        '.kkkkkkkkkkkk.',
        '.kkkkk..kkkkk.',
      ], x: 17, y: 26 },
      { part: 'head', x: 18, y: 15 },
      { part: ['ss.....', 'yyy....', '.ssss..', '..yyss.', '...sss.'], x: 27, y: 28 },
    ],
  },
} satisfies Record<string, ClassLook>;
