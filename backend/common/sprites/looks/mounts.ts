import type { Layer } from '../battle.ts';
import { recolor } from './kit.ts';

// 坐骑与骑手的手绘部件（骑乘、飞行、重甲骑兵、弓骑、魔骑、治疗骑共用）。坐骑面朝右，蹄子踩在 y=46。
// 骑手坐姿：头 (18,11)、上身 (17,22)、腿 (20,31) 跨在鞍上，前臂 (27,24)，手在 (32,27)。
// 坐骑毛色：r/R 毛色亮/暗、q 鬃毛与蹄、e 眼睛；各职业在 palette 里换色。

// 马：36x25，放在 (5,22)。
export const HORSE = [
  '..............................qq....',
  '.............................qrrq...',
  '............................qrrrrr..',
  '...........................qqrrerrr.',
  '..........................qqrrrrrrrr',
  '.........................qqrrrrr.RRr',
  '........................qqrrrrr...RR',
  '.......................qqrrrrr......',
  '......................qqrrrrr.......',
  '.....................qqrrrrrr.......',
  '..qq...............qqrrrrrrr........',
  '.qqqq.rrrrrrrrrrrrrrrrrrrrrr........',
  'qqqqqrrrrrrrrrrrrrrrrrrrrrrr........',
  'qqq.rrrrrrrrrrrrrrrrrrrrrrrr........',
  'qq..rrrrrrrrrrrrrrrrrrrrrrRr........',
  'q...rrrrrrrrrrrrrrrrrrrrrRRr........',
  'q...RrrrrrrrrrrrrrrrrrrrRRR.........',
  '....RRrrrrrrrrrrrrrrrrrRRR..........',
  '.....RRRrrRRRRRRRRRrrRRRR...........',
  '.....rrR.rR........rrR.rR...........',
  '.....rR..rR........rR..rR...........',
  '.....rR..rR........rR..rR...........',
  '.....rR...rR.......rR...rR..........',
  '.....RR...RR.......RR...RR..........',
  '.....qq...qq.......qq...qq..........',
];

// 马铠：盖在马身和马颈上的金属甲片（m/M/n），叠在 HORSE 之上，同样放在 (5,22)。
export const HORSE_BARDING = [
  '....................................',
  '....................................',
  '............................mmm.....',
  '...........................mMMm.....',
  '..........................mM........',
  '.........................mM.........',
  '........................mM..........',
  '.......................mMm..........',
  '......................mMMm..........',
  '.....................mMMmm..........',
  '...................mmMMmmm..........',
  '......mmmmmmmmmmmmmMMmmmmm..........',
  '.....mMMMMMMMMMMMMMMMmmmmm..........',
  '....mMmmmmmmmmmmmmmmmMmmmm..........',
  '....mMmmnmmmmmnmmmmmmMmmm...........',
  '....mMmmmmmmmmmmmmmmmMmM............',
  '....MMMMMMMMMMMMMMMMMMMM............',
  '.....nMnMnMnMnMnMnMnMn..............',
];

// 鞍下垂的阵营色鞍褥（叠在马身上）。
export const SADDLE_CLOTH = [
  '..wwwwwwwww..',
  '.aaaaaaaaaaa.',
  '.aaaaaaaaaaa.',
  '.aaaaaaaaaaa.',
  '.AaaaaaaaaaA.',
  '..ykykykyky..',
];

// 骑手跨在鞍上的腿：大腿沿马背向前、小腿垂下踩镫。b 裤、W 靴，可换色。
export const RIDER_LEG = [
  'bbbbbbb..',
  '.bbbbbbb.',
  '....bbbb.',
  '.....bbb.',
  '.....WWW.',
  '.....WWW.',
  '....WWWWW',
];

// 飞鸵：大型走禽，头顶冠羽 c、长颈小翼、粗壮双腿，40x29，放在 (2,18)。f/F 羽色、k 翼斑、o 喙与腿。
export const ORNIUS = [
  '...............................cc.......',
  '..............................ccoo......',
  '.............................ffooooo....',
  '.............................ffeoooooo..',
  '.............................ffffoo.....',
  '..............................fff.......',
  '..............................fff.......',
  '..............................fff.......',
  '.............................ffF........',
  '.............................ffF........',
  '............................fffF........',
  '...........................ffffF........',
  '..f.f.....................fffff.........',
  '.fFfFf.fffffffffffffff..ffffff..........',
  'ffFfFffffffffffffffffffffffff...........',
  'fFfFfffffffffffffffffffffffF............',
  '.FFffffffffkkkkkfffffffffffF............',
  '..FFfffffkkkkkkkkfffffffFF..............',
  '...FFffffkkkkkkkkfffffFF................',
  '.....FFFffkkkkkkfffFFF..................',
  '........FFFFFFFFFFF.....................',
  '..........oo....oo......................',
  '..........oo....oo......................',
  '..........oo.....oo.....................',
  '.........oo......oo.....................',
  '.........oo.......oo....................',
  '........oo........oo....................',
  '.......ooo.......ooo....................',
  '......oooo......oooo....................',
];

// 天马的大白翼：右下角接在马背 (17,33)，放在 (4,23)；画在马之后、骑手之前。
export const PEGASUS_WING = [
  'kk............',
  'kkkk..........',
  '.kkkkk........',
  '.KkkkkKk......',
  '..KkkkkkKk....',
  '..KKkkkkkkkk..',
  '...KKkkkkkkkkk',
  '....KKKkkkkkkk',
  '......KKKkkkkK',
  '.........KKKK.',
];

// 飞龙：40x28，放在 (4,18)，爪踩 y=45。g/G 鳞色、d 腹甲、x 角牙与爪、e 眼；骑手坐在肩背 y≈29。
export const WYVERN = [
  '..............................x.x.......',
  '.............................xggxg......',
  '............................ggggggg.....',
  '............................gggeggggg...',
  '...........................ggggggggggg..',
  '...........................ggggg.dddddx.',
  '..........................ggggg.........',
  '.........................ggggdd.........',
  '........................ggggdd..........',
  '.......................ggggdd...........',
  '......................gggggdd...........',
  '...........ggggggggggggggggdd...........',
  '.........ggggggggggggggggggdd...........',
  '........gggggggggggggggggggdd...........',
  '.......ggggggggggggggggggggdd...........',
  '......gggGggggggggggggggggdd............',
  '.....ggGGgggggggggggggggggdd............',
  '....ggG..GGgggggggggggggddd.............',
  '...ggG.....GGGgggggggGGdd...............',
  '..ggG.........GGggggGGG.................',
  '.ggG...........ggGGgg...................',
  'gG.............gggGgg...................',
  'G...............ggGG....................',
  '................gGG.....................',
  '...............ggG......................',
  '..............gGG.......................',
  '.............xxGx.......................',
  '............xx.xx.......................',
];

// 飞龙翼：从肩部向后上方张开，右下角接在 (24,28)，放在 (3,13)；g/G 翼膜、X 翼骨。
export const WYVERN_WING = [
  'X.....................',
  'XX....................',
  'XgX...................',
  '.XggX.................',
  '.XgggXX...............',
  '.XggggggX.............',
  '..XgggggggXX..........',
  '..XgggggggggXX........',
  '..XGgggggggggggX......',
  '...XGgggggggggggXX....',
  '...XGGgggggggggggggX..',
  '....XGGggggggggggggggX',
  '.....XGG.GGggggggggggX',
  '......X....GGGggggggX.',
  '.............GGGgggX..',
  '................GGX...',
];

// 战车：车厢 + 大车轮 + 前辕，22x16，放在 (4,30)。w/W 木、m/M 铁箍、y 铜饰。
export const CHARIOT = [
  '..wwwwwwwwwwwwwwwww...',
  '.wWyWyWyWyWyWyWyWyw...',
  '.wwwwwwwwwwwwwwwwww...',
  '.waaaaaaaaaaaaaaaaw...',
  '.waaaaaaaaaaaaaaaaw...',
  '.wAAAAAAAAAAAAAAAAwwww',
  '..wwwwwwMMMMwwwwwww..W',
  '......MMwwwwMM........',
  '.....MwW.ww.WwM.......',
  '....Mw..Www...wM......',
  '....MwwwwWwwwwwM......',
  '....Mw..Www...wM......',
  '.....MwW.ww.WwM.......',
  '......MMwwwwMM........',
  '........MMMM..........',
];

// 骑马：马 (5,22)、鞍褥 (13,32)、腿 (20,31)、上身 (17,22)、头 (18,11)、前臂 (27,24)，手 (32,27)。
export const onHorse = (torso: string[], arm: string[], extra: { before?: Layer[]; head?: Layer[]; leg?: string[]; barding?: boolean } = {}): Layer[] => [
  { part: HORSE, x: 5, y: 22, fixed: true },
  ...(extra.barding ? [{ part: HORSE_BARDING, x: 5, y: 22, fixed: true }] : []),
  { part: SADDLE_CLOTH, x: 13, y: 32, fixed: true },
  ...(extra.before ?? []),
  { part: extra.leg ?? RIDER_LEG, x: 20, y: 31 },
  { part: torso, x: 17, y: 22 },
  { part: 'head', x: 18, y: 11 },
  ...(extra.head ?? []),
  { part: arm, x: 27, y: 24 },
];
// 骑飞鸵：鸟 (2,18)、鞍褥 (13,30)，骑手整体比骑马高 2 格，手 (32,25)。
export const onOrnius = (torso: string[], arm: string[], extra: { before?: Layer[]; head?: Layer[]; leg?: string[]; plates?: boolean; after?: Layer[] } = {}): Layer[] => [
  ...(extra.before ?? []),
  { part: ORNIUS, x: 2, y: 18, fixed: true },
  ...(extra.plates ? [{ part: ORNIUS_PLATES, x: 2, y: 18, fixed: true }] : []),
  { part: SADDLE_CLOTH, x: 13, y: 30, fixed: true },
  { part: extra.leg ?? RIDER_LEG, x: 20, y: 29 },
  { part: torso, x: 17, y: 20 },
  { part: 'head', x: 18, y: 9 },
  ...(extra.head ?? []),
  { part: arm, x: 27, y: 22 },
  ...(extra.after ?? []),
];
// 飞鸵护甲：颈环与背甲，叠在 ORNIUS 上。
const ORNIUS_PLATES = [
  '........................................',
  '........................................',
  '........................................',
  '........................................',
  '........................................',
  '........................................',
  '........................................',
  '..............................mm........',
  '.............................mMM........',
  '.............................mMM........',
  '............................mMMM........',
  '...........................mMMMM........',
  '..........................mMMMM.........',
  '.........mmmmmmmmmmmmmmmMMMMMm..........',
  '........mMMMMMMMMMMMMMMMMMMMm...........',
  '.........nMnMnMnMnMnMnMnMnMn............',
];
export const ARMORED_LEG = recolor(RIDER_LEG, { b: 'm', W: 'M' });
