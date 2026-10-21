import type { ClassId } from '../data/classes.ts';
import type { Stats } from '../data/types.ts';

// 仅替换新建剧情／禁忌之地战斗的首领。身份、数值和目标一并冻结在 BattleRecord。
export interface NarrativeBoss {
  name: string;
  classId: ClassId;
  bonus: Partial<Stats>;
}
export const ROYAL_CAPITAL_BOSS: NarrativeBoss = {
  name: '邪神化教首·洛德里克', classId: 'high_epitaph', bonus: { hp: 25, mag: 8, def: 5, res: 8 },
};
