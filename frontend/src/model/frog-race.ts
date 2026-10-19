// 青蛙赛跑的演出时间轴（docs/18）。名次由服务端 PLAY_MINIGAME 生成并保存；这里只把已定的名次
// 演成一场赛跑：每只青蛙一跳一跳前进，途中领先会交替，但冲线顺序严格等于 order。
// 同一局（同一种子）每次重播都一样；纯函数，不影响结算。

export const TRACK = 100; // 终点线位置（赛道长度单位）
export const RACE_MS = 20_000; // 1 倍速时冠军的冲线时间

export interface Hop { t0: number; t1: number; x0: number; x1: number }
export interface FrogTrack { frog: number; finish: number; hops: Hop[] }

// 种子字符串 → 可复现的 [0, 1) 随机数（FNV-1a 散列 + mulberry32）。
function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 把总量 total 按随机权重拆成 n 份（每份不小于平均值的 floor 倍）。
function split(total: number, n: number, rand: () => number, floor: number): number[] {
  const weights = Array.from({ length: n }, () => floor + rand());
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map(w => (w / sum) * total);
}

export function raceTimeline(order: number[], seed: string): FrogTrack[] {
  const rand = rng(`frogs:${seed}:${order.join('')}`);
  // 冲线时间：冠军 RACE_MS，之后每名落后 0.4–1.1 秒，保证名次严格递增。
  let finish = RACE_MS;
  const finishes = new Map<number, number>();
  order.forEach((frog, rank) => {
    if (rank > 0) finish += 400 + rand() * 700;
    finishes.set(frog, finish);
  });
  return [...order].sort((a, b) => a - b).map(frog => {
    const end = finishes.get(frog)!;
    const n = 11 + Math.floor(rand() * 5);
    // 每跳由「起跳前的蹲伏」和「空中」组成；蹲伏长短不一，所以途中会有人突然冲前或掉队。
    const gaps = split(end, n, rand, 0.45);
    const dists = split(TRACK, n, rand, 0.6);
    const hops: Hop[] = [];
    let t = 0, x = 0;
    for (let i = 0; i < n; i++) {
      const air = Math.min(gaps[i] * 0.55, 520);
      const t1 = t + gaps[i];
      hops.push({ t0: t1 - air, t1, x0: x, x1: x + dists[i] });
      t = t1;
      x += dists[i];
    }
    hops[hops.length - 1].x1 = TRACK; // 浮点误差归零：最后一跳正好落在终点线
    hops[hops.length - 1].t1 = end;
    return { frog, finish: end, hops };
  });
}

// t 毫秒时青蛙的位置与离地高度（0–1，跳跃弧线），用于绘制。
export function frogAt(track: FrogTrack, t: number): { x: number; lift: number; done: boolean } {
  if (t >= track.finish) return { x: TRACK, lift: 0, done: true };
  for (const hop of track.hops) {
    if (t < hop.t0) return { x: hop.x0, lift: 0, done: false };
    if (t < hop.t1) {
      const k = (t - hop.t0) / (hop.t1 - hop.t0);
      return { x: hop.x0 + (hop.x1 - hop.x0) * k, lift: Math.sin(Math.PI * k), done: false };
    }
  }
  return { x: TRACK, lift: 0, done: true };
}

// 当前领先者（最靠前的；并列取先到的），用于解说条。
export function leaderAt(tracks: FrogTrack[], t: number): number {
  return [...tracks].sort((a, b) => frogAt(b, t).x - frogAt(a, t).x || a.finish - b.finish)[0].frog;
}
