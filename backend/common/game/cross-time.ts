import { SKILLS, type SkillId } from '../data/skills.ts';
import { seedRng, nextU32 } from '../engine/rng.ts';
import { createUnit, type UnitRecord } from './model.ts';
import { CROSS_TIME_DATA } from './cross-time-data.ts';

export const CROSS_TIME_QUEST_ID = 'cross-time-throne';
export const CROSS_TIME_SHARD = 'cross_time_shard';
export const CROSS_TIME_COST = 3;
export const CROSS_TIME_SLOT_LIMIT = 3;
export const CROSS_TIME_MAP_ID = 'fe8-chfinal-1-eirika';
export const CROSS_TIME_DAYS = 8;
export const CROSS_TIME_MAX_UNITS = 8;
export const CROSS_TIME_TURN_LIMIT = 40;

// Resolve the registered personal skill by its fixed design name. No portrait skill fallback.
const skillNames = ['一身是胆', '西凉铁骑', '长坂断桥', '斩将夺旗', '八阵之策', '王佐之才', '明哲毒计', '奇谋险策', '连环之计', '大局布势', '赤壁火策', '霆威', '智勇护盾', '堕天之傲', '冥府裁断', '天下无双', '光明神射'];
export const CROSS_TIME_ROSTER = CROSS_TIME_DATA.map((row, index) => ({
  ...row,
  get personalSkill(): SkillId {
    const id = (Object.keys(SKILLS) as SkillId[]).find(id => SKILLS[id].name === skillNames[index]);
    if (!id) throw new Error(`Cross-time personal skill is not registered: ${skillNames[index]}`);
    return id;
  },
}));
export type CrossTimeIdentity = typeof CROSS_TIME_ROSTER[number];

export function crossTimeById(identity: string): CrossTimeIdentity | undefined {
  return CROSS_TIME_ROSTER.find(row => row.id === identity);
}

export function crossTimeSlots(units: readonly UnitRecord[]): number {
  return units.filter(unit => !!unit.crossTimeIdentity && unit.status === 'active' && unit.cycle === 0).length;
}

export function createCrossTimeRecruit(identity: string, id: string, day: number, seed = id): UnitRecord {
  const row = crossTimeById(identity);
  if (!row) throw new Error(`Unknown cross-time identity: ${identity}`);
  const age = 20 + nextU32(seedRng(`cross-time-age:${identity}:${seed}`)) % 11;
  const unit = createUnit('roland', 20, id, day, false, {
    classId: row.classId, base: { ...row.base }, personalGrowth: { ...row.personalGrowth },
    personalSkill: row.personalSkill, growthType: 'growth', age, startingGear: 'recruit',
  });
  unit.crossTimeIdentity = row.id;
  unit.name = row.name;
  unit.stats = { ...row.level20 };
  unit.hp = unit.stats.hp;
  unit.con = row.con;
  return unit;
}
