// 魅力/幸运的原作职责登记。没有可靠来源的条目保持 unverified，不参与战斗计算。
export type ReferenceStatus = 'verified' | 'unverified';
export interface CharmMechanism {
  id: string;
  stat: 'cha' | 'lck';
  source: string;
  effect: string;
  status: ReferenceStatus;
}

export const CHARM_REFERENCE: CharmMechanism[] = [
  { id: 'fe-gba-luck-critavoid', stat: 'lck', source: 'GBA 战斗公式', effect: '幸运参与必杀回避', status: 'verified' },
  { id: 'fe-gba-charm-command', stat: 'cha', source: '待核对', effect: '计略／骑士团等作品专属机制；本作未确认对应公式', status: 'unverified' },
  { id: 'fe-3ds-charm-recruit', stat: 'cha', source: '待核对', effect: '不把魅力当作招募概率加成', status: 'unverified' },
];

export function verifiedCharmMechanisms(): CharmMechanism[] {
  return CHARM_REFERENCE.filter(entry => entry.status === 'verified');
}
