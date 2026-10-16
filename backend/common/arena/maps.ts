import type { Point } from '../engine/types.ts';

// Arena map pool (docs/05「初版图池示例」). Each map brings its own rules: fielded units D, bans B
// (both sides), turn limit and the attacker's victory condition. Layouts are the pixel-art maps of the
// same key in design/pixel-art/gen_art.py; a test keeps them in sync.
export interface ArenaMap {
  id: ArenaMapId;
  name: string;
  rows: string[];
  deploy: number;
  bans: number;
  turnLimit: number;
  goal: 'boss' | 'rout' | 'seize';
  goalText: string;
  feature: string;
  attackerZone: Point[];
  defenderZone: Point[];
}

export type ArenaMapId = 'plains' | 'pass' | 'woods' | 'castle';

const WALKABLE = new Set(['.', 'r', 'b', 'p', 'v', 'f', 'F', 'T']);

// Every walkable cell of a rectangle; mountains, water and walls are never spawn cells.
function zone(rows: string[], [x0, x1]: [number, number], [y0, y1]: [number, number]): Point[] {
  const cells: Point[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) if (WALKABLE.has(rows[y][x])) cells.push([x, y]);
  }
  return cells;
}

const PLAINS = [
  'mm....ffw...mmm',
  'm.....f.w....fm',
  '..f.....w..f...',
  '........b......',
  'rrrrrrrrbrrrrF.',
  '...ff...w...f..',
  '.f......w..ff..',
  '....f...ss.....',
  'm........w...fm',
  'mm.......w..mmm',
];

const PASS = [
  'mmmmmmmmmmmmmmmm',
  'mmm..f.mmmm..mmm',
  'm...ff..mmm...mm',
  '..f.....mmm.#..m',
  '.........m..#.F.',
  'rrrrrrrrrrrrrppp',
  '...f.....m..#ppp',
  '..ff....mmm.#..m',
  'm.......mmm....m',
  'mm..f..mmmmm..mm',
  'mmm...mmmmmmm.mm',
  'mmmmmmmmmmmmmmmm',
];

const WOODS = [
  'fff..ffff.mm',
  'f.f...ff...m',
  'rrr.f...fff.',
  '..rrrr..f...',
  '.f...rrrrrrr',
  'ff.f....f...',
  'fff..ff..fff',
  'ffff.fff.fff',
];

// Moat with one bridge (armor must use it) and two fords, three gates, forts behind the gates and
// the throne at the back of the hall.
const CASTLE = [
  'mmm..fff..w.mmmmmmmm',
  'm....f....w.########',
  '..f.......w.#ppp#pp#',
  '..ff..v...s.pppF#pp#',
  '..........w.#pppppp#',
  '.f......f.w.##p###p#',
  '.ff.......w.#Fppppp#',
  'rrrrrrrrrrbrppppppT#',
  '.....f....w.#Fppppp#',
  '..f.......w.##p###p#',
  '..ff...v..w.#pppppp#',
  '..........s.pppF#pp#',
  'm..f......w.#ppp#pp#',
  'mmm.......w.########',
];

export const ARENA_MAPS: Record<ArenaMapId, ArenaMap> = {
  plains: {
    id: 'plains', name: '平原会战', rows: PLAINS, deploy: 6, bans: 2, turnLimit: 20,
    goal: 'boss', goalText: '击败主将或全灭', feature: '开阔地，骑兵与弓兵强',
    attackerZone: zone(PLAINS, [0, 2], [2, 7]), defenderZone: zone(PLAINS, [11, 14], [2, 7]),
  },
  pass: {
    id: 'pass', name: '山间隘口', rows: PASS, deploy: 5, bans: 1, turnLimit: 15,
    goal: 'boss', goalText: '击败主将', feature: '狭窄通道，重甲守口，飞行可绕路',
    attackerZone: zone(PASS, [0, 2], [3, 7]), defenderZone: zone(PASS, [11, 15], [2, 8]),
  },
  woods: {
    id: 'woods', name: '林中遭遇', rows: WOODS, deploy: 4, bans: 2, turnLimit: 15,
    goal: 'rout', goalText: '全灭', feature: '小规模、森林密布，精英单位决胜',
    attackerZone: zone(WOODS, [0, 2], [1, 5]), defenderZone: zone(WOODS, [9, 11], [1, 6]),
  },
  castle: {
    id: 'castle', name: '王城', rows: CASTLE, deploy: 8, bans: 3, turnLimit: 25,
    goal: 'seize', goalText: '压制王座', feature: '大规模攻城，防守方有堡垒和城墙',
    attackerZone: zone(CASTLE, [0, 2], [4, 10]), defenderZone: zone(CASTLE, [13, 18], [2, 12]),
  },
};

// The throne cell of a seize map.
export function throneOf(map: ArenaMap): Point {
  const y = map.rows.findIndex(row => row.includes('T'));
  return [map.rows[y].indexOf('T'), y];
}
