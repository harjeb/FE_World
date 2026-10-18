import { CHARACTERS, CHARACTER_IDS } from './characters.ts';
import { CLASSES } from './classes.ts';
import { SKILLS } from './skills.ts';
import type { CharacterId } from './characters.ts';

// 固定人物的首版内容骨架：人物简介、个人任务、探索发现和酒馆短对话。
// 这些是本作原创占位文案，不冒充参考作品剧情；美术/长对话不在首版功能范围。
export interface CharacterStory {
  profile: string;
  personalQuest: { id: string; name: string; region: number; description: string };
  discovery: string;
  tavern: string[];
}

const REGION_BY_INDEX = [2, 3, 5, 2, 3, 5, 2, 3, 5, 2, 3, 5];

export const CHARACTER_STORIES: Record<CharacterId, CharacterStory> = Object.fromEntries(
  CHARACTER_IDS.map((id, index) => {
    const character = CHARACTERS[id];
    const region = REGION_BY_INDEX[index] ?? 2;
    return [id, {
      profile: `${character.name}，以${CLASSES[character.classId].name}的身份在边境活动；「${character.skill ? SKILLS[character.skill].name : '随机应变'}」是其一贯的战斗方式。`,
      personalQuest: {
        id: `story-${id}`, name: `${character.name}的旧约`, region,
        description: `在地区声望达到信任后，听${character.name}讲完旧事，并完成一场只属于这名伙伴的试炼。`,
      },
      discovery: `${character.name}的随身物上刻着同一个旧记号；它指向一段尚未讲完的旅程。`,
      tavern: [`「今天也一起走吧。」——${character.name}`, `「有些仗不是为了赢才打的。」——${character.name}`],
    }];
  }),
) as Record<CharacterId, CharacterStory>;
