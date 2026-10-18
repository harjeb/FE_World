import { createUnit, toSnapshot } from '../common/game/model.ts';
import type { CharacterId } from '../common/data/characters.ts';
import type { Defense } from '../common/arena/rules.ts';
import type { Store, Player } from './store.ts';
import { DEMO_LEVEL, SEED_DAY } from './store.ts';

// 测试用：开局只发主角，但多数测试需要整套演示名册，这里补全（等级与旧 SEED_LEVELS 一致）。
export function seedFullRoster(store: Store, player: Player): void {
  // 测试夹具继续使用旧演示日，保证年度／剧情用例稳定；正式新档仍从 D0 开始。
  player.day = SEED_DAY;
  store.savePlayer(player);
  const owned = new Set(store.units(player.id).map(u => u.character));
  for (const [character, level] of Object.entries(DEMO_LEVEL)) {
    if (owned.has(character)) continue;
    store.addUnit(player.id, createUnit(character as CharacterId, level, `u_${character}`, player.day, true));
  }
}

// 测试用：重建旧版演示防守（pass 图 6 人），供防守／竞技场相关测试使用。
export function seedDefense(store: Store, player: Player): void {
  const byCharacter = new Map(store.units(player.id).map(u => [u.character, u]));
  const at = (character: CharacterId, pos: [number, number], behavior: Defense['slots'][number]['behavior']) => ({
    unit: toSnapshot(byCharacter.get(character)!), pos, behavior,
  });
  player.defense = {
    id: `mine-${player.id}`, legion: player.legion, points: 1317, record: '本季防守 8 胜 5 负', map: 'pass',
    slots: [
      at('victor', [14, 4], 'hold'), at('gustav', [13, 5], 'guard'), at('owen', [13, 3], 'opportunist'),
      at('sera', [14, 6], 'opportunist'), at('noah', [15, 5], 'healer'), at('erin', [11, 6], 'aggressive'),
    ],
    commanders: ['victor', 'gustav'], bans: ['lina'],
  };
  store.savePlayer(player);
}
