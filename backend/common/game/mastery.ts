import { CLASS_ABILITY_BY_ID } from '../data/class-abilities.ts';
import { CATALOG_CLASS_IDS, CLASSES, canonicalClassId, classEntryReason } from '../data/classes.ts';
import type { CatalogClassId, ClassId, ClassRoute } from '../data/classes.ts';
import { CHARACTERS } from '../data/characters.ts';
import { SKILLS } from '../data/skills.ts';
import type { SkillId } from '../data/skills.ts';
import { CLASS_ART_MASTERY, WEAPON_ART_BY_ID } from '../data/weapon-arts.ts';
import type { UnitRecord } from './model.ts';

// Mastery is separate from character level; passive rewards use the project skill pool.
// Weapon-art rewards and thresholds come from the audited class teaching plans.

export const SKILL_SLOTS = 5;
// 有效参战与职业训练的进度；投降、空图或零日不产生（由调用方只对有效来源入账）。
export const MASTERY_PER_BATTLE = 8;
export const MASTERY_PER_WIN = 4;
export const MASTERY_PER_TRAIN_DAY = 3;
export const MASTERY_TRAIN_MAX_DAYS = 30;

export interface MasteryNode { id: string; threshold: number; skill?: SkillId; art?: string; name: string; referenceIds?: string[] }

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

const NODE_NAMES = Object.fromEntries(Object.entries(SKILLS).map(([id, skill]) => [id, skill.name])) as Record<SkillId, string>;

export const MASTERY_NODES: Record<CatalogClassId, MasteryNode[]> = Object.fromEntries(
  CATALOG_CLASS_IDS.map(classId => {
    const cls = CLASSES[classId];
    const pool = ROUTE_SKILLS[cls.route];
    const [first, second] = STAGE_THRESHOLDS[cls.stage] ?? STAGE_THRESHOLDS[1];
    const references = CLASS_ABILITY_BY_ID.get(classId as never)?.masteryIds ?? [];
    return [classId, [
      { id: `${classId}-1`, threshold: first, skill: pool[0], name: NODE_NAMES[pool[0]], referenceIds: references },
      { id: `${classId}-2`, threshold: second, skill: pool[1] ?? pool[0], name: NODE_NAMES[pool[1] ?? pool[0]], referenceIds: references },
      ...(CLASS_ART_MASTERY[classId] ?? []).map(node => ({ ...node, name: WEAPON_ART_BY_ID.get(node.art)!.name })),
    ].sort((a, b) => a.threshold - b.threshold)];
  }),
) as unknown as Record<CatalogClassId, MasteryNode[]>;

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

// 给指定职业加精通；0 只补领已有点数达到的新节点，供旧存档兼容读取。
export function gainMastery(unit: UnitRecord, amount: number, classId: ClassId = unit.classId): MasteryNode[] {
  if (!Number.isFinite(amount) || amount < 0) return [];
  classId = canonicalClassId(classId);
  unit.classMastery ??= {};
  unit.learningProgress ??= {};
  unit.learnedSkills ??= [];
  unit.learnedArts ??= [];
  unit.equippedSkills ??= [];
  unit.classMastery[classId] = classMasteryOf(unit, classId) + amount;
  const unlocked: MasteryNode[] = [];
  for (const node of masteryNodesFor(classId)) {
    if (unit.classMastery[classId]! < node.threshold) continue;
    const known = unlockedNodes(unit, classId);
    if (known.includes(node.id)) continue;
    unit.learningProgress[classId] = [...known, node.id];
    if (node.art && !unit.learnedArts.includes(node.art)) unit.learnedArts.push(node.art);
    if (node.skill) {
      if (!unit.learnedSkills.includes(node.skill)) unit.learnedSkills.push(node.skill);
      // 有空位就自动装上，之后可在 5 格内自由调整。
      if (unit.equippedSkills.length + (unit.equippedArts?.length ?? 0) < SKILL_SLOTS && !unit.equippedSkills.includes(node.skill)) unit.equippedSkills.push(node.skill);
    }
    unlocked.push(node);
  }
  return unlocked;
}

function hasLearnedArt(unit: UnitRecord, id: string): boolean {
  const art = WEAPON_ART_BY_ID.get(id);
  return !!art && art.unlock.kind !== 'equipment_grant' && !!unit.learnedArts?.includes(id);
}

// 旧存档保留被动优先，再用旧习得库填空格；显式空选择不再次自动装备。
export function normalizeLoadout(unit: UnitRecord): void {
  unit.equippedSkills = [...new Set(unit.equippedSkills ?? [])]
    .filter(id => Object.hasOwn(SKILLS, id) && unit.learnedSkills?.includes(id)).slice(0, SKILL_SLOTS);
  unit.equippedArts = [...new Set(unit.equippedArts ?? unit.learnedArts ?? [])]
    .filter(id => hasLearnedArt(unit, id)).slice(0, SKILL_SLOTS - unit.equippedSkills.length);
}

// 习得技能与战技共用五格；省略 arts 的旧调用保留当前战技选择。
export function setEquippedSkills(unit: UnitRecord, skills: SkillId[], arts: string[] = unit.equippedArts ?? []): string | null {
  const unique = [...new Set(skills)];
  const selectedArts = [...new Set(arts)];
  if (unique.length + selectedArts.length > SKILL_SLOTS) return `最多装备 ${SKILL_SLOTS} 个已学技能／战技`;
  for (const skill of unique) if (!Object.hasOwn(SKILLS, skill) || !(unit.learnedSkills ?? []).includes(skill)) return `尚未学会技能 ${skill}`;
  for (const art of selectedArts) if (!hasLearnedArt(unit, art)) return `尚未学会可装备战技 ${art}`;
  unit.equippedSkills = unique;
  unit.equippedArts = selectedArts;
  return null;
}

// 换职后当前职业自带能力重算，但已学技能与精通保留（docs/00 §4.2）。
export function switchClass(unit: UnitRecord, classId: ClassId): void {
  const problem = classEntryReason(unit, classId, unit.homeClassId ?? CHARACTERS[unit.character].classId);
  if (problem) throw new Error(problem);
  classId = canonicalClassId(classId);
  unit.classId = classId;
  for (const type of Object.keys(CLASSES[classId].weapons) as (keyof typeof CLASSES[ClassId]['weapons'])[]) {
    unit.ranks[type] ??= 'E';
  }
}
