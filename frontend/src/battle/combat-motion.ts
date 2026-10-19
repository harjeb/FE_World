import type { Strike } from '@common/engine/index.ts';
import type { BattlePose } from '@common/sprites/battle.ts';
import type { BattleSheet, SheetClip, SheetLoop } from './battle-sheets.ts';

export const criticalHit = (strike: Strike) => strike.hit && strike.crit && !strike.backlash;
export const impactTarget = (strike: Strike) => strike.backlash ? strike.by : strike.target;

export interface CombatBeat {
  strike: Strike;
  clip: SheetClip | null;
  start: number;
  windup: number;
  release: number;
  impact: number;
  recover: number;
  end: number;
  frameStarts: number[] | null;
}

// Atlas frame of a run at `ms`: looping (idle breathing) or played once and held (a dodge).
export function loopFrame(loop: SheetLoop, ms: number, repeat = true): number {
  const total = loop.durationsMs.reduce((sum, duration) => sum + duration, 0);
  if (!repeat && ms >= total) return loop.frames[loop.frames.length - 1];
  let remaining = total ? Math.max(0, ms) % total : 0;
  for (let i = 0; i < loop.frames.length; i++) {
    if (remaining < loop.durationsMs[i]) return loop.frames[i];
    remaining -= loop.durationsMs[i];
  }
  return loop.frames[0];
}

export const idleSheetFrame = (sheet: BattleSheet, ms: number) => loopFrame(sheet.idle, ms);

// Only the presentation clock lives here; outcomes and HP always come from the recorded strikes.
export function combatTimeline(strikes: Strike[], sheets: Readonly<Record<string, BattleSheet | null>> = {}): CombatBeat[] {
  let start = 250;
  return strikes.map(strike => {
    const crit = criticalHit(strike), sheet = sheets[strike.by];
    const clip = sheet ? (crit && sheet.critical) || sheet.attack : null;
    let beat: CombatBeat;
    if (clip) {
      // A critical without its own clip holds the charge and the hit longer.
      const held = crit && clip === sheet!.attack;
      let cursor = start;
      const frameStarts = clip.durationsMs.map((duration, step) => {
        const at = cursor;
        cursor += duration + (held && step === clip.charge ? 360 : held && step === clip.hit ? 220 : 0);
        return at;
      });
      // A clip may recover only at its very end.
      beat = { strike, clip, start, windup: frameStarts[clip.windup], release: frameStarts[clip.release], impact: frameStarts[clip.hit],
        recover: frameStarts[clip.recover] ?? cursor, end: cursor, frameStarts };
    } else {
      const release = start + (crit ? 580 : 220);
      const impact = release + 180;
      const recover = impact + (crit ? 400 : 180);
      beat = { strike, clip: null, start, windup: start, release, impact, recover, end: recover + 200, frameStarts: null };
    }
    start = beat.end + 120;
    return beat;
  });
}

export function combatAt(beats: CombatBeat[], ms: number) {
  const shown = beats.filter(beat => ms >= beat.impact).length;
  const active = beats.find(beat => ms >= beat.start && ms < beat.end) ?? null;
  const pose: BattlePose = !active || ms < active.windup ? 'idle' : ms < active.release ? 'windup' : ms < active.recover ? 'strike' : 'recover';
  const frame = active?.frameStarts?.findLastIndex(start => ms >= start) ?? null;
  const reaction = active && ms >= active.impact && ms < active.recover
    ? { id: impactTarget(active.strike), pose: (active.strike.hit ? 'hurt' : 'dodge') as BattlePose } : null;
  return { shown, active, pose, reaction, frame };
}
