// 酒馆「青蛙赛跑」的演出（docs/18）：四条赛道、像素青蛙一跳一跳冲线，可 2 倍速或跳过。
// 名次在下注时已由服务端定好；这里按 model/frog-race.ts 的时间轴播放，冲线顺序与结果完全一致。
import { useEffect, useMemo, useRef, useState } from 'react';
import { drawPixelGrid } from '@common/icons/draw.ts';
import { frogAt, leaderAt, raceTimeline, TRACK } from '../model/frog-race.ts';

// 16x16，面朝右。g 身体、G 身体暗部、y 肚皮、k 眼白、e 瞳孔；配饰另叠一层。
const SIT = [
  '................',
  '................',
  '................',
  '.........ggg....',
  '........gkkgg...',
  '........gkegGg..',
  '...ggggggggggGg.',
  '..gggggggggggGG.',
  '.ggyyyyygggggGG.',
  '.gyyyyyyygggGGG.',
  '..yyyyyyGGGGGG..',
  '.GGg..GGg..GGg..',
  'GGGG..GGGG.GGGG.',
];
const LEAP = [
  '................',
  '................',
  '................',
  '..........ggg...',
  '.........gkkgg..',
  '.........gkegGg.',
  '.....gggggggggGg',
  '...ggggggggggGG.',
  '.GgggyyyyyygGG..',
  'GG..yyyyyyyGG...',
  'G......GGGg.....',
  '..........Gg....',
];

// 四只青蛙（FROG_NAMES 的顺序）：历史人物的名字配各自的行头——凯撒的桂冠、克利奥帕特拉的条纹头巾、
// 拿破仑的双角帽、汉尼拔的眼罩。强弱（夺冠率与赔率）由服务端规则表决定，外观不影响结果。
const LOOKS: { body: [string, string]; hat: string[] }[] = [
  { body: ['#C8C048', '#8A8424'], hat: ['', '', '.........jLj....', '........j...j...'] },
  { body: ['#4FA8B0', '#2E6E78'], hat: ['', '', '........FaFaF...', '.......FaFaFa...', '.......a........', '.......F........'] },
  { body: ['#6FB04A', '#3E7A2E'], hat: ['', '.......zzzzzzz..', '........zzFzz...'] },
  { body: ['#D88A3A', '#94561E'], hat: ['', '', '', '........z...z...', '.........zz.....', '.........zz.....'] },
];
const ACCESSORY = { z: '#2E2A36', F: '#E7C266', a: '#3F6B8C', j: '#4F8A3A', L: '#A8D878' };

function overlay(base: string[], hat: string[], dx: number): string[] {
  return base.map((row, y) => {
    const top = hat[y];
    if (!top) return row;
    return [...row].map((ch, x) => { const h = top[x - dx]; return h && h !== '.' ? h : ch; }).join('');
  });
}

const sprites = new Map<string, string>();
function frogSprite(frog: number, leap: boolean): string {
  const key = `${frog}:${leap}`;
  let url = sprites.get(key);
  if (!url) {
    const look = LOOKS[frog];
    const rows = overlay(leap ? LEAP : SIT, look.hat, leap ? 1 : 0);
    const px = drawPixelGrid(rows, { g: look.body[0], G: look.body[1], y: '#F0E6B8', k: '#FBF8F1', e: '#2B2421', ...ACCESSORY });
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(16, 16);
    image.data.set(px);
    ctx.putImageData(image, 0, 0);
    url = canvas.toDataURL();
    sprites.set(key, url);
  }
  return url;
}

export function FrogFace({ frog, size = 32 }: { frog: number; size?: number }) {
  return <img className="px" src={frogSprite(frog, false)} width={size} height={size} alt="" />;
}

export function FrogRace({ order, pick, names, seed, onDone }: { order: number[]; pick: number; names: readonly string[]; seed: string; onDone: () => void }) {
  const tracks = useMemo(() => raceTimeline(order, seed), [order, seed]);
  const end = Math.max(...tracks.map(t => t.finish));
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [ms, setMs] = useState(reduced ? end : 0);
  const [fast, setFast] = useState(false);
  const speed = useRef(1);
  speed.current = fast ? 2 : 1;
  const done = ms >= end;
  const told = useRef(false);

  useEffect(() => {
    if (done) return;
    let frame = 0, last = performance.now();
    const tick = (now: number) => {
      const step = Math.min(100, now - last) * speed.current;
      last = now;
      setMs(t => Math.min(end, t + step));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [done, end]);

  useEffect(() => {
    if (done && !told.current) { told.current = true; onDone(); }
  }, [done, onDone]);

  const rankOf = (frog: number) => order.indexOf(frog) + 1;
  const leader = leaderAt(tracks, ms);
  return (
    <div className="frog-race" aria-label="青蛙赛跑">
      <div className="fr-call" aria-live="polite">
        {done
          ? <>冲线！冠军 <b>{names[order[0]]}</b>{order[0] === pick ? '——押中了！' : `，押的${names[pick]}第 ${rankOf(pick)} 名`}</>
          : ms < 600 ? <>各就各位……开跑！</> : <>领先：<b>{names[leader]}</b></>}
      </div>
      <ul className="fr-lanes">
        {tracks.map(track => {
          const at = frogAt(track, ms);
          const finished = ms >= track.finish;
          return (
            <li key={track.frog} className={`fr-lane${track.frog === pick ? ' picked' : ''}`}>
              <span className="fr-name">{track.frog === pick && <span className="fr-bet">押</span>}{names[track.frog]}</span>
              <span className="fr-track">
                <img className="px fr-frog" src={frogSprite(track.frog, at.lift > 0.05)} width={32} height={32} alt=""
                  style={{ left: `calc(${(at.x / TRACK) * 100}% - ${(at.x / TRACK) * 32}px)`, transform: `translateY(${-at.lift * 12}px)` }} />
                {finished && <span className={`fr-rank r${rankOf(track.frog)}`}>{rankOf(track.frog)}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      {!done && (
        <div className="fr-ctl">
          <button type="button" className="btn btn-sm" aria-pressed={fast} onClick={() => setFast(f => !f)}>{fast ? '恢复 1 倍速' : '2 倍速'}</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMs(end)}>跳过</button>
        </div>
      )}
    </div>
  );
}
