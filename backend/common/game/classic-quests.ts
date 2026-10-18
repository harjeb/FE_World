import { CLASSIC_GAME_NAMES, CLASSIC_MAPS } from './classic-catalog.ts';
import type { ClassicGame, ClassicMap } from './classic-catalog.ts';
import type { Quest, QuestKind } from './quests.ts';

// 经典地图任务线：每张地图一个任务，另按「3–4 图」组成地区副本。
// 目标与地形来自 catalog；这里只生成任务外壳（地区、前置、奖励、耗日）。

const GAME_REGION: Record<ClassicGame, number> = { fe1: 2, fe2: 3, fe6: 2, fe7: 3, fe3: 5, fe8: 5 };
const GAME_ORDER: ClassicGame[] = ['fe1', 'fe2', 'fe6', 'fe7', 'fe3', 'fe8'];

// 副本分组必须保持路线自洽：FE7 的洛伊德/莱纳斯、肯尼斯/杰尔梅是互斥分支，
// FE8 的艾瑞珂/艾夫拉姆路线也不能混在同一组。其余作品按目录顺序三三分组。
const DUNGEON_GROUPS: Partial<Record<ClassicGame, string[][]>> = {
  fe7: [
    ['fe7-ch19-eliwood', 'fe7-ch20-eliwood', 'fe7-ch22-eliwood'],
    ['fe7-ch23-eliwood-lloyd', 'fe7-ch25-eliwood-kenneth', 'fe7-ch27-eliwood'],
    ['fe7-ch23-eliwood-linus', 'fe7-ch25-eliwood-jerme', 'fe7-ch30-eliwood', 'fe7-chfinal-1-eliwood'],
  ],
  fe8: [
    ['fe8-ch11-ephraim', 'fe8-ch13-ephraim', 'fe8-ch14-ephraim'],
    ['fe8-ch12-eirika', 'fe8-ch14-eirika', 'fe8-ch15-eirika'],
    ['fe8-ch16-eirika', 'fe8-ch17-eirika', 'fe8-ch20-eirika', 'fe8-chfinal-1-eirika'],
  ],
};

function kindOf(map: ClassicMap): QuestKind {
  return map.goal.kind === 'seize' ? 'seize' : map.goal.kind === 'boss' ? 'rout' : 'rout';
}

function objectiveOf(map: ClassicMap): string {
  return map.goal.kind === 'seize' ? '压制王座' : map.goal.kind === 'boss' ? '击败敌军主将' : '消灭全部敌军';
}

function soloQuests(): Quest[] {
  const out: Quest[] = [];
  for (const game of GAME_ORDER) {
    const maps = CLASSIC_MAPS.filter(map => map.game === game);
    maps.forEach((map, index) => {
      const kind = kindOf(map);
      out.push({
        id: `cl-${map.id}`,
        region: GAME_REGION[game],
        name: map.name,
        objective: objectiveOf(map),
        kind,
        tier: 'standard',
        turnLimit: map.turnLimit,
        requires: index > 0 ? { quest: `cl-${maps[index - 1].id}` } : undefined,
        // 经典内容的金币、战利品独立于十二地声望路线，避免三地靠额外地图提前满声望。
        reward: { gold: 900 + index * 120, reputation: 0 },
        scenarioId: map.id,
        classic: { game, mapName: map.name, stageCount: 1, adapted: map.adapted },
      });
    });
  }
  return out;
}

function dungeonQuests(): Quest[] {
  const out: Quest[] = [];
  for (const game of GAME_ORDER) {
    const maps = CLASSIC_MAPS.filter(map => map.game === game);
    const explicit = DUNGEON_GROUPS[game];
    const groups = explicit
      ? explicit.map(ids => ids.map(id => {
          const map = maps.find(entry => entry.id === id);
          if (!map) throw new Error(`副本 ${game} 引用了未知地图 ${id}`);
          return map;
        }))
      : [maps.slice(0, 3), maps.slice(3, 6), maps.slice(6)];
    const covered = groups.flat().map(map => map.id);
    if (covered.length !== maps.length || new Set(covered).size !== maps.length) {
      throw new Error(`副本分组未且仅未覆盖 ${game} 的全部地图`);
    }
    groups.forEach((group, index) => {
      if (group.length === 0) return;
      const last = group[group.length - 1];
      out.push({
        id: `cld-${game}-${index + 1}`,
        region: GAME_REGION[game],
        name: `${CLASSIC_GAME_NAMES[game]} · 副本 ${index + 1}`,
        objective: `${group.length} 图连战：${group.map(map => map.name).join(' → ')}`,
        kind: 'rout',
        tier: 'region',
        turnLimit: Math.max(...group.map(map => map.turnLimit)),
        requires: { quest: `cl-${last.id}` },
        reward: { gold: 2_500 + index * 800, reputation: 0 },
        scenarioIds: group.map(map => map.id),
        costDays: group.length * 2,
        stageDays: 2,
        classic: { game, mapName: group.map(map => map.name).join(' → '), stageCount: group.length, adapted: group.some(map => map.adapted) },
      });
    });
  }
  return out;
}

export const CLASSIC_QUESTS: Quest[] = [...soloQuests(), ...dungeonQuests()];
