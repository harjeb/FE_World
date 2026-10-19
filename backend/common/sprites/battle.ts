// 交战演出的职业形象（48x48，面朝右，显示时 4 倍）。每个职业一张，逐个设计：职业在 CLASS_LOOKS
// 里写明它用哪些手绘部件、摆在哪里、配什么颜色，外加只属于它自己的细节层。部件只是为了让同一身体比例
// 在 77 个职业间保持一致，不做随机组合。
//
// 调色约定（大写为暗部）：
//   s/S 肤色、h/H 发色——按角色头像换色，所以战斗里认得出是谁
//   a/A/l 阵营布料（己方蓝、敌方红）；c/C/d 职业专属布料（每个职业自己定）
//   m/M/n 金属亮/中/暗；w/W 皮革；y/Y 金饰；k/K 白布；b 深色裤装；e 眼睛与勾线
//   其余字母由职业在 palette 里自定（坐骑毛色、羽毛、鳞片等）
// 手持的武器单独一层（WEAPONS），按当前装备的武器类型画在职业声明的手部位置 hand 上。
import { CLASSES } from '../data/classes.ts';
import type { CatalogClassId } from '../data/classes.ts';
import type { WeaponType } from '../data/types.ts';
import { ARMOR_LOOKS } from './looks/armor.ts';
import { AXE_LOOKS } from './looks/axe.ts';
import { BEAST_LOOKS } from './looks/beast.ts';
import { BOW_LOOKS } from './looks/bow.ts';
import { CAVALRY_LOOKS } from './looks/cavalry.ts';
import { DRAGON_LOOKS } from './looks/dragon.ts';
import { FIST_LOOKS } from './looks/fist.ts';
import { FLYING_LOOKS } from './looks/flying.ts';
import { HEALING_LOOKS } from './looks/healing.ts';
import { MAGIC_LOOKS } from './looks/magic.ts';
import { STEALTH_LOOKS } from './looks/stealth.ts';
import { SWORD_LOOKS } from './looks/sword.ts';

export const BATTLE_SIZE = 48;
type Rgba = readonly [number, number, number, number];
const C = (hex: string): Rgba => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];
const OL = C('#2B2421');

export const BASE_COLORS: Record<string, string> = {
  s: '#F0C8A0', S: '#CC9270', h: '#8A5A34', H: '#5E3E24', e: '#2B2421',
  m: '#E4E8E6', M: '#A0A8AC', n: '#5E666C', w: '#9A683C', W: '#5E3E24',
  y: '#E7C266', Y: '#9E7A30', k: '#F0EADF', K: '#BFB5A4', b: '#4E3A2C', B: '#33261C',
  c: '#7A6A58', C: '#4E4438', d: '#A89884',
};
export const FACTION_COLORS = {
  player: { a: '#3F6B8C', A: '#284A63', l: '#7FA9C6' },
  enemy: { a: '#B0473C', A: '#74302A', l: '#DA7E66' },
} as const;

// A layer is a small hand-drawn grid placed at (x, y); '.' is transparent.
export interface Layer { part: keyof typeof PARTS | string[]; x: number; y: number; flip?: boolean }
export interface ClassLook {
  layers: Layer[];
  hand: [number, number]; // grip pixel of the front hand; weapons are drawn from here
  palette?: Record<string, string>; // class-specific colours (c/C/d and any extra letters)
  weaponBehind?: boolean; // e.g. mounted lancers hold the lance behind the mount's head
  signature?: WeaponType; // the weapon the class is known for (previews; drawn when nothing else is known)
}

// ---------------------------------------------------------------- shared hand-drawn parts

export const PARTS = {
  // 3/4 head facing right, short hair; class headgear is drawn on top.
  head: [
    '...hhhhh...',
    '.hhhhhhhhh.',
    'hhhhhhhhhhh',
    'hhhhhhhHhh.',
    'hhhhHsssssh',
    'hhhhsssssss',
    'hhhSsssesss',
    '.hhSssssss.',
    '.hhSsssSs..',
    '..hSsssS...',
    '....SSS....',
  ],
  // Front arm reaching forward; the hand ends at (+6, +4) of the part.
  armForward: [
    'aa.....',
    'aaa....',
    '.aass..',
    '..ssss.',
    '...sss.',
  ],
  // Legs in a fighting stance with boots.
  legsStance: [
    '...bbb...bbb...',
    '...bbb...bbbb..',
    '..bbb.....bbb..',
    '..bbb.....bbb..',
    '.bbb.......bbb.',
    '.bbb.......bbb.',
    '.WWW.......WWW.',
    'WWww........Www',
    'WWWW.......WWWW',
  ],
} satisfies Record<string, string[]>;

// ---------------------------------------------------------------- weapons (drawn from the hand)

// Each grid's grip pixel is at (gx, gy); colours: m/M/n metal, w/W wood/leather, y/Y gold, k white, g gem.
export const WEAPON_LAYERS: Record<WeaponType, { rows: string[]; grip: [number, number]; behind?: boolean }> = {
  sword: {
    grip: [2, 12],
    rows: [
      '...........m.',
      '..........mM.',
      '.........mM..',
      '........mM...',
      '.......mM....',
      '......mM.....',
      '.....mM......',
      '....mM.......',
      '...mM........',
      '.y.M.........',
      '..yY.........',
      '.Y.y.........',
      '.WW..........',
      'W............',
    ],
  },
  lance: {
    grip: [6, 2],
    rows: [
      '................mm.',
      '.............mmmmMm',
      'wwwwwwwwwwwwwyMMM..',
      '................M..',
    ],
  },
  axe: {
    grip: [2, 10],
    rows: [
      '......Mmm.',
      '.....wMMmm',
      '.....wnMMm',
      '.....wnMMm',
      '.....wMMmm',
      '....w.Mmm.',
      '....w.....',
      '...w......',
      '...w......',
      '..w.......',
      '..w.......',
      '.w........',
      'W.........',
    ],
  },
  bow: {
    grip: [1, 7],
    rows: [
      'WW.....',
      '.wK....',
      '.w.K...',
      '..w.K..',
      '..w..K.',
      '..w..K.',
      '..w..K.',
      '.yY..K.',
      '..w..K.',
      '..w..K.',
      '..w..K.',
      '..w.K..',
      '.w.K...',
      '.wK....',
      'WW.....',
    ],
  },
  tome: {
    grip: [0, 3],
    rows: [
      '.vvvvvk',
      'vvvyvvk',
      'vvyyyvk',
      'vvvyvvk',
      'VVVVVVk',
    ],
  },
  staff: {
    grip: [2, 10],
    rows: [
      '.....yy.',
      '....ygy.',
      '....yyy.',
      '....w...',
      '...w....',
      '...w....',
      '..w.....',
      '..w.....',
      '..w.....',
      '.w......',
      '.w......',
      'w.......',
      'W.......',
    ],
  },
  dagger: {
    grip: [1, 4],
    rows: [
      '......m',
      '....mmM',
      '..ymM..',
      '.yY....',
      'WW.....',
    ],
  },
  fist: {
    grip: [1, 1],
    rows: [
      '.mmm.',
      'mmmmM',
      'MmmMM',
      '.MMM.',
    ],
  },
  beast: {
    grip: [0, 2],
    rows: [
      '...k.k',
      '..kK.K',
      '.kK.K.',
    ],
  },
  dragon: {
    grip: [1, 2],
    rows: [
      '.vvv.',
      'vkvvV',
      'vvvVV',
      '.VVV.',
    ],
  },
};
const WEAPON_COLORS: Record<string, string> = { g: '#7CC6DA', v: '#C8584E', V: '#8E3A34' };

// ---------------------------------------------------------------- class looks

// 77 个在用职业各一张；已停用的旧职业没有，交战演出里退回路线小人。
export const CLASS_LOOKS: Partial<Record<CatalogClassId, ClassLook>> = { ...SWORD_LOOKS, ...AXE_LOOKS, ...FIST_LOOKS, ...STEALTH_LOOKS, ...BEAST_LOOKS, ...DRAGON_LOOKS, ...CAVALRY_LOOKS, ...BOW_LOOKS, ...ARMOR_LOOKS, ...MAGIC_LOOKS, ...HEALING_LOOKS, ...FLYING_LOOKS };

// ---------------------------------------------------------------- drawing

export interface SpriteColors { side: 'player' | 'enemy'; skin?: [string, string]; hair?: [string, string] }

export function drawBattleSprite(classId: CatalogClassId, colors: SpriteColors, weapon: WeaponType | null): Uint8ClampedArray | null {
  const look = CLASS_LOOKS[classId];
  if (!look) return null;
  const palette: Record<string, string> = {
    ...BASE_COLORS, ...WEAPON_COLORS, ...FACTION_COLORS[colors.side], ...look.palette,
    ...(colors.skin ? { s: colors.skin[0], S: colors.skin[1] } : {}),
    ...(colors.hair ? { h: colors.hair[0], H: colors.hair[1] } : {}),
  };
  const px = new Map<number, Rgba>();
  const put = (rows: readonly string[], ox: number, oy: number, flip = false) => rows.forEach((row, y) => {
    const width = row.length;
    [...row].forEach((ch, i) => {
      if (ch === '.') return;
      const x = ox + (flip ? width - 1 - i : i), yy = oy + y;
      if (x < 0 || yy < 0 || x >= BATTLE_SIZE || yy >= BATTLE_SIZE) return;
      const hex = palette[ch];
      if (hex) px.set(yy * BATTLE_SIZE + x, C(hex));
    });
  });
  const drawWeapon = () => {
    if (!weapon) return;
    const w = WEAPON_LAYERS[weapon];
    put(w.rows, look.hand[0] - w.grip[0], look.hand[1] - w.grip[1]);
  };
  if (look.weaponBehind) drawWeapon();
  for (const layer of look.layers) put(typeof layer.part === 'string' ? PARTS[layer.part as keyof typeof PARTS] : layer.part, layer.x, layer.y, layer.flip);
  if (!look.weaponBehind) drawWeapon();
  // Outline: every empty pixel touching a filled one (4-neighbourhood), like the other pixel art.
  const out = new Uint8ClampedArray(BATTLE_SIZE * BATTLE_SIZE * 4);
  for (const [k, c] of px) out.set(c, k * 4);
  for (let y = 0; y < BATTLE_SIZE; y++) for (let x = 0; x < BATTLE_SIZE; x++) {
    const k = y * BATTLE_SIZE + x;
    if (px.has(k)) continue;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return nx >= 0 && ny >= 0 && nx < BATTLE_SIZE && ny < BATTLE_SIZE && px.has(ny * BATTLE_SIZE + nx);
    });
    if (near) out.set(OL, k * 4);
  }
  return out;
}

export const classNameOf = (id: CatalogClassId) => CLASSES[id].name;
