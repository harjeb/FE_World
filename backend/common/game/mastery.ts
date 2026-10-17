import { CATALOG_CLASS_IDS, CLASSES, canonicalClassId, classChangeReason } from '../data/classes.ts';
import type { CatalogClassId, ClassId, ClassRoute } from '../data/classes.ts';
import type { SkillId } from '../data/skills.ts';
import type { UnitRecord } from './model.ts';

// Mastery is separate from character level. Nodes remain provisional game content,
// not a claim that the reference game's complete class/mastery skills are implemented.

export const SKILL_SLOTS = 5;
// 有效参战与职业训练的进度；投降、空图或零日不产生（由调用方只对有效来源入账）。
export const MASTERY_PER_BATTLE = 8;
export const MASTERY_PER_WIN = 4;
export const MASTERY_PER_TRAIN_DAY = 3;
export const MASTERY_TRAIN_MAX_DAYS = 30;

export interface MasteryNode { id: string; threshold: number; skill: SkillId; name: string }

// 各路线可提供的技能池；同一路线不同职业按阶段取不同节点，不默认为所有职业同一节点。
const ROUTE_SKILLS: Record<ClassRoute, SkillId[]> = {
  sword: ['opening', 'keen'],
  axe: ['surge', 'grit'],
  armor: ['steadfast', 'grit'],
  cavalry: ['charge', 'veteran'],
  flying: ['nimble', 'charge'],
  bow: ['hawkeye', 'keen'],
  magic: ['focus', 'veteran'],
  healing: ['shelter', 'prayer'],
  stealth: ['nimble', 'keen'],
  fist: ['surge', 'steadfast'],
  beast: ['surge', 'grit'],
  dragon: ['focus', 'steadfast'],
};

// 每阶两个节点的阈值；越高阶越晚解锁，避免刚换职业就学满。
const STAGE_THRESHOLDS: Record<number, [number, number]> = {
  1: [15, 40], 2: [30, 80], 3: [60, 140], 4: [100, 220], 5: [160, 320],
};

const NODE_NAMES: Record<SkillId, string> = {
  opening: '破绽', surge: '怒涛', veteran: '老练', nimble: '轻盈', hawkeye: '鹰眼', focus: '聚魔',
  shelter: '庇护', steadfast: '坚守', keen: '锐眼', grit: '斗志', prayer: '祈愿', charge: '冲阵',
};

export const MASTERY_NODES: Record<CatalogClassId, MasteryNode[]> = Object.fromEntries(
  CATALOG_CLASS_IDS.map(classId => {
    const cls = CLASSES[classId];
    const pool = ROUTE_SKILLS[cls.route];
    const [first, second] = STAGE_THRESHOLDS[cls.stage] ?? STAGE_THRESHOLDS[1];
    return [classId, [
      { id: `${classId}-1`, threshold: first, skill: pool[0], name: NODE_NAMES[pool[0]] },
      { id: `${classId}-2`, threshold: second, skill: pool[1] ?? pool[0], name: NODE_NAMES[pool[1] ?? pool[0]] },
    ]];
  }),
) as Record<CatalogClassId, MasteryNode[]>;

export function masteryNodesFor(classId: ClassId): MasteryNode[] {
  return MASTERY_NODES[canonicalClassId(classId)] ?? [];
}

export function classMasteryOf(unit: UnitRecord, classId: ClassId = unit.classId): number {
  const canonical = canonicalClassId(classId);
  return Math.max(0, ...Object.entries(unit.classMastery ?? {})
    .filter(([id]) => canonicalClassId(id as ClassId) === canonical).map(([, value]) => value ?? 0));
}

export function unlockedNodes(unit: UnitRecord, classId: ClassId = unit.classId): string[] {
  const canonical = canonicalClassId(classId);
  return [...new Set(Object.entries(unit.learningProgress ?? {})
    .filter(([id]) => canonicalClassId(id as ClassId) === canonical)
    .flatMap(([id, nodes]) => (nodes ?? []).map(node => node.startsWith(id + '-') ? canonical + node.slice(id.length) : node)))];
}

// 给当前职业加精通；返回本次新解锁的节点。只应传有效参战／训练来源。
export function gainMastery(unit: UnitRecord, amount: number, classId: ClassId = unit.classId): MasteryNode[] {
  if (amount <= 0) return [];
  classId = canonicalClassId(classId);
  unit.classMastery ??= {};
  unit.learningProgress ??= {};
  unit.learnedSkills ??= [];
  unit.equippedSkills ??= [];
  unit.classMastery[classId] = classMasteryOf(unit, classId) + amount;
  const unlocked: MasteryNode[] = [];
  for (const node of masteryNodesFor(classId)) {
    if (unit.classMastery[classId]! < node.threshold) continue;
    const known = unlockedNodes(unit, classId);
    if (known.includes(node.id)) continue;
    unit.learningProgress[classId] = [...known, node.id];
    if (!unit.learnedSkills.includes(node.skill)) unit.learnedSkills.push(node.skill);
    // 有空位就自动装上，之后可在 5 格内自由调整。
    if (unit.equippedSkills.length < SKILL_SLOTS && !unit.equippedSkills.includes(node.skill)) unit.equippedSkills.push(node.skill);
    unlocked.push(node);
  }
  return unlocked;
}

// 跨职业自由装备已学技能，共用 5 格；未学过的不能装备。
export function setEquippedSkills(unit: UnitRecord, skills: SkillId[]): string | null {
  const unique = [...new Set(skills)];
  if (unique.length > SKILL_SLOTS) return `最多装备 ${SKILL_SLOTS} 个已学技能`;
  for (const skill of unique) if (!(unit.learnedSkills ?? []).includes(skill)) return `尚未学会技能 ${skill}`;
  unit.equippedSkills = unique;
  return null;
}

// 换职后当前职业自带能力重算，但已学技能与精通保留（docs/00 §4.2）。
export function switchClass(unit: UnitRecord, classId: ClassId): void {
  const problem = classChangeReason(unit, classId);
  if (problem) throw new Error(problem);
  classId = canonicalClassId(classId);
  unit.classId = classId;
  for (const type of Object.keys(CLASSES[classId].weapons) as (keyof typeof CLASSES[ClassId]['weapons'])[]) {
    unit.ranks[type] ??= 'E';
  }
}
