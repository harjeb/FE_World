import { CLASSES, CLASS_PATHS, canonicalClassId } from './classes.ts';
import type { ClassId, ClassRoute, ClassDef } from './classes.ts';
import { stats } from './types.ts';

export interface Promotion extends Pick<ClassDef, 'name' | 'moveType' | 'move' | 'weapons' | 'growth'> {
  from: ClassId;
  to: ClassId;
  bonus: ClassDef['growth'];
  con: number;
  skill: { name: string; text: string };
  mods?: { attack?: number; hit?: number; crit?: number; avoid?: number };
  tagline: string;
  fit: string;
}
export const PROMOTIONS: Promotion[] = [];
// Human paths are suggestions; beast and dragon promotions must follow their own chain.
for (const route of Object.keys(CLASS_PATHS) as ClassRoute[]) {
  for (const path of CLASS_PATHS[route]) for (let i = 1; i < path.length; i++) {
    const from = path[i - 1], to = path[i];
    if (PROMOTIONS.some(p => p.from === from && p.to === to)) continue;
    const cls = CLASSES[to];
    PROMOTIONS.push({ name: cls.name, from, to, moveType: cls.moveType, move: cls.move, weapons: cls.weapons, growth: cls.growth,
      bonus: stats(0,0,0,0,0,0,0,0), con: 0,
      skill: { name: '职业专长', text: '不额外赠送永久属性或未实现的技能。' },
      tagline: `第 ${cls.stage} 阶 · 总等级保留`, fit: '仅应用当前职业成长，不累加前置职业修正。',
    });
  }
}
export function promotionsFor(classId: ClassId): Promotion[] {
  return PROMOTIONS.filter(p => p.from === canonicalClassId(classId)).map(p => ({ ...p, from: classId }));
}
