// Personal skills of the sample characters (docs/02). v1 skills are passive; the engine applies them
// in engine/skills.ts.
export const SKILLS = {
  divine_inspiration: { name: '神之鼓舞', text: '回合开始时，若周围2格内有我方单位，则自己和周围2格内的我方单位伤害、速度＋3，持续1回合；30级起提升为＋6，60级起额外赋予猛攻。猛攻：主动攻击且可以追击时，在首次攻击后立即追击。' },
  desperation: { name: '猛攻', text: '自己发动攻击时，若可以进行追击，则会在自己攻击后立即进行追击' },
  dragon_guard: { name: '一身是胆', text: '相邻有半血友军时回避＋10，受到首击最终伤害－2' },
  xiliang: { name: '西凉铁骑', text: '交战开始33%概率速度＋10，持续本次交战' },
  changban: { name: '长坂断桥', text: '防守且2格内至多1名友军时防御＋4，敌方命中－10' },
  capture_banner: { name: '斩将夺旗', text: '主动攻击开场满血敌人，首击伤害＋4' },
  eight_formations: { name: '八阵之策', text: '本阵营回合未移动时，2格内其他友军命中＋10，与老练取最高' },
  royal_aid: { name: '王佐之才', text: '单体直接治疗杖与法术最大距离＋1' },
  prudent_poison: { name: '明哲毒计', text: '主动攻击半血敌人，首击伤害＋3，敌方反击命中－15' },
  risky_scheme: { name: '奇谋险策', text: '交战开始33%概率技巧＋10，持续本次交战' },
  linked_scheme: { name: '连环之计', text: '主动交战命中后，存活目标速度－3至己方下回合开始' },
  grand_strategy: { name: '大局布势', text: '主动攻击目标相邻有其他友军时，命中＋15、首击伤害＋2' },
  red_cliffs: { name: '赤壁火策', text: '主动使用火系攻击法术，命中＋10、首击伤害＋3' },
  thunder_majesty: { name: '霆威', text: '主动使用雷系攻击法术，首击伤害＋4，首击命中则反击命中－10' },
  wise_shield: { name: '智勇护盾', text: '相邻有友军且防守时防御、魔防＋3' },
  fallen_pride: { name: '堕天之傲', text: '2格内无友军时主动交战命中＋10、首击伤害＋3' },
  underworld: { name: '冥府裁断', text: '主动击杀且存活回复最大HP的10%向上取整、最多6，每己方回合一次' },
  peerless: { name: '天下无双', text: '交战开始33%概率力量、魔力各＋10，持续本次交战' },
  opening: { name: '破绽', text: '追击时必杀 +10' },
  surge: { name: '怒涛', text: 'HP ≤ 50% 时伤害 +3' },
  veteran: { name: '老练', text: '相邻友军命中 +10' },
  nimble: { name: '轻盈', text: '回避 +10' },
  hawkeye: { name: '鹰眼', text: '命中 +15' },
  focus: { name: '聚魔', text: '理魔法必杀 +10' },
  shelter: { name: '庇护', text: '治疗目标下回合防 +2' },
  steadfast: { name: '坚守', text: '本回合未移动时防 +3' },
  keen: { name: '锐眼', text: '必杀 +10' },
  grit: { name: '斗志', text: 'HP ≤ 50% 时命中 +20' },
  prayer: { name: '祈愿', text: '治疗量 +5' },
  charge: { name: '冲阵', text: '本回合移动后伤害 +2' },
  lightshot: { name: '光明神射', text: '开战时满 HP 且使用弓，本次交战有效技巧 ×2；主动、反击、连击、追击及引用技巧的战技均生效，不改变永久属性或射程' },
} as const;
export type SkillId = keyof typeof SKILLS;

// 按单位等级生成技能描述：神之鼓舞只显示当前等级生效的效果，不预告 30／60 级的后续提升；
// 其余技能与 SKILLS.text 相同。level 缺省按 1 级处理。
export function skillText(id: SkillId, level = 1): string {
  if (id !== 'divine_inspiration') return SKILLS[id].text;
  const amount = level >= 30 ? 6 : 3;
  const extra = level >= 60 ? '，并额外赋予猛攻。猛攻：主动攻击且可以追击时，在首次攻击后立即追击。' : '。';
  return `回合开始时，若周围2格内有我方单位，则自己和周围2格内的我方单位伤害、速度＋${amount}，持续1回合${extra}`;
}
