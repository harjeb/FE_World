import { CLASSES } from '../data/classes.ts';
import type { ClassId, ClassRoute } from '../data/classes.ts';
import type { Behavior } from '../engine/types.ts';

// Frozen into each new battle, including the names used by later waves and hard-mode reserves.
export interface EnemyIdentity {
  faction: string;
  commander: string;
  roles?: Partial<Record<ClassRoute | 'thief', string>>;
}

export const STORY_ENEMY_IDENTITIES: Readonly<Record<number, EnemyIdentity>> = {
  1: { faction: '蒙面卫队', commander: '焚信头目·格雷' },
  2: { faction: '北道关门军', commander: '关门监守·哈洛' },
  3: { faction: '焚卷卫队', commander: '焚卷官·塞默' },
  4: { faction: '慈济室护卫', commander: '慈济室卫长·罗恩', roles: { healing: '医护修士' } },
  5: { faction: '暗仓私兵', commander: '暗仓督卫·萨恩', roles: { healing: '维生术士' } },
  6: { faction: '铸器工坊', commander: '工坊卫队长·赫洛', roles: { armor: '装置卫士', magic: '导晶术士', healing: '工坊医师' } },
  7: { faction: '归灯追缉队', commander: '追缉官·卡德' },
  8: { faction: '归灯祭卫', commander: '邪神化教首·洛德里克', roles: { magic: '祭仪术士', healing: '祭仪修士' } },
};

export const STORY_DUEL_NAMES = {
  'story-3-a': '刮名人·奥斯',
  'story-5-b': '走私头目·巴克',
  'story-8-a': '祭台守卫·艾德',
} as const;

const COMPANION_IDENTITIES: Readonly<Record<string, EnemyIdentity>> = {
  ren: { faction: '盗墓团', commander: '盗墓头目·格里姆' },
  ig: { faction: '占矿佣兵', commander: '矿监·铁牙' },
  mira: { faction: '黑碑守卫', commander: '封村监守·奈赫' },
};

export const CHALLENGE_ENEMY_IDENTITIES: Readonly<Record<string, EnemyIdentity>> = {
  'tower-1': { faction: '下层塔卫', commander: '塔卫统领·格鲁' },
  'tower-2': { faction: '上层塔卫', commander: '塔卫祭司·瑟芙' },
  'tower-3': { faction: '缚门守军', commander: '缚门者·乌尔', roles: { armor: '锁甲卫士', magic: '封印术士' } },
  'forbidden-altar': { faction: '逆祷教团', commander: '逆祷者·赫缇', roles: { magic: '导晶术士', healing: '逆祷修士' } },
  'forbidden-abyss': { faction: '断锁眷属', commander: '魔神·阿扎赫', roles: { magic: '噬光术士', beast: '渊兽', dragon: '深渊龙裔' } },
};

const REGION_IDENTITIES: Readonly<Record<number, EnemyIdentity>> = {
  1: { faction: '荒野劫掠团', commander: '劫掠团头目' },
  2: { faction: '林道掠夺者', commander: '林道匪首' },
  3: { faction: '占矿佣兵', commander: '矿道监军' },
  4: { faction: '叛乱驻军', commander: '叛军指挥官' },
  5: { faction: '湖岸私兵', commander: '封渡头目' },
  6: { faction: '遗都守卫', commander: '回廊监守' },
  7: { faction: '裂岭战团', commander: '裂岭统领' },
  8: { faction: '断翼佣兵', commander: '风崖统领' },
  9: { faction: '沙海劫掠团', commander: '沙海匪首' },
  10: { faction: '失控龙裔', commander: '龙谷守门者' },
  11: { faction: '王陵傀儡', commander: '王陵守将' },
  12: { faction: '星门残影', commander: '星门执刑者' },
};
const CORE_COMMANDERS: Readonly<Record<string, string>> = { gw9: '侵蚀守林者', ih9: '熔炉巨像', wl9: '潮汐祭司' };

export function battleEnemyIdentity(options: {
  quest?: { id: string; story?: number; companion?: string; region: number };
  region?: number;
  mapName?: string;
}): EnemyIdentity {
  const quest = options.quest;
  const specific = quest?.story ? STORY_ENEMY_IDENTITIES[quest.story]
    : quest?.companion ? COMPANION_IDENTITIES[quest.companion] : undefined;
  if (specific) return structuredClone(specific);
  const regional = REGION_IDENTITIES[quest?.region || options.region || 0];
  if (regional) {
    const identity = structuredClone(regional);
    if (quest && CORE_COMMANDERS[quest.id]) identity.commander = CORE_COMMANDERS[quest.id];
    else if (quest && /^r\d+-9$/.test(quest.id)) identity.commander = `侵蚀${identity.commander}`;
    return identity;
  }
  // Standalone classic maps use their chapter title, without the game's title.
  const title = options.mapName?.split('·').at(-1)?.trim() || '据点';
  return { faction: `${title}守军`, commander: `${title}守将` };
}

const ROLE_NAMES: Record<ClassRoute | 'thief', string> = {
  sword: '剑士', axe: '斧兵', armor: '重甲卫士', cavalry: '骑兵', flying: '飞骑', bow: '弓手',
  magic: '术士', healing: '医师', stealth: '暗哨', fist: '拳斗士', beast: '兽战士', dragon: '龙裔', thief: '窃贼',
};
export function enemyIdentityName(identity: EnemyIdentity, spec: { classId: ClassId; boss?: boolean; behavior?: Behavior }, reinforcement = false): string {
  if (spec.boss) return reinforcement ? `${identity.faction}·援军长` : identity.commander;
  const role = spec.behavior === 'thief' ? 'thief' : spec.behavior === 'healer' ? 'healing' : CLASSES[spec.classId].route;
  return `${identity.faction}·${identity.roles?.[role] ?? ROLE_NAMES[role]}`;
}
