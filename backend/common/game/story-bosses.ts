import type { ClassId } from '../data/classes.ts';
import type { Stats } from '../data/types.ts';
import { STORY_ENEMY_IDENTITIES } from './enemy-identities.ts';

// 替换新建剧情／禁忌之地战斗的最终首领；其余命名见 enemy-identities.ts。
// 身份、数值和目标一并冻结在 BattleRecord。
export interface NarrativeBoss {
  name: string;
  classId: ClassId;
  bonus: Partial<Stats>;
}
export const ROYAL_CAPITAL_BOSS: NarrativeBoss = {
  name: STORY_ENEMY_IDENTITIES[8].commander, classId: 'high_epitaph', bonus: { hp: 25, mag: 8, def: 5, res: 8 },
};
