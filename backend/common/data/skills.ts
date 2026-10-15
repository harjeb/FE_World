// Personal skills of the sample characters (docs/02). v1 skills are passive; the engine applies them
// in engine/skills.ts.
export const SKILLS = {
  opening: { name: '破绽', text: '追击时必杀 +10' },
  surge: { name: '怒涛', text: 'HP ≤ 50% 时伤害 +3' },
  veteran: { name: '老练', text: '相邻友军命中 +10' },
  nimble: { name: '轻盈', text: '回避 +10' },
  hawkeye: { name: '鹰眼', text: '命中 +15' },
  focus: { name: '聚魔', text: '理魔法必杀 +10' },
  shelter: { name: '庇护', text: '治疗目标下回合防 +2' },
  steadfast: { name: '坚守', text: '本回合未移动时防 +3' },
} as const;
export type SkillId = keyof typeof SKILLS;
