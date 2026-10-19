import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, next) {
    return next(specifier.startsWith('@common/')
      ? new URL(`../../backend/common/${specifier.slice(8)}`, import.meta.url).href : specifier, context);
  },
});
const { combatAt, combatTimeline, criticalHit, idleSheetFrame, impactTarget, loopFrame } = await import('../src/battle/combat-motion.ts');
const { BATTLE_SHEETS } = await import('../src/battle/battle-sheets.ts');
const total = durations => durations.reduce((sum, duration) => sum + duration, 0);

const hit = { by: 'ally', target: 'enemy', hit: true, crit: false, damage: 6, hpAfter: 14 };

test('windup, strike, impact and recovery keep the recorded hit in order', () => {
  const beats = combatTimeline([hit]);
  const beat = beats[0];
  assert.deepEqual(combatAt(beats, 0), { shown: 0, active: null, pose: 'idle', reaction: null, frame: null });
  assert.equal(combatAt(beats, beat.windup).pose, 'windup');
  assert.equal(combatAt(beats, beat.release).pose, 'strike');
  assert.equal(combatAt(beats, beat.impact - 1).shown, 0);
  assert.equal(combatAt(beats, beat.impact).shown, 1);
  assert.deepEqual(combatAt(beats, beat.impact).reaction, { id: 'enemy', pose: 'hurt' });
  assert.equal(combatAt(beats, beat.recover).pose, 'recover');
  assert.equal(combatAt(beats, beat.recover).reaction, null);
  assert.equal(combatAt(beats, beat.end).active, null);
});

test('misses dodge, counterattacks reverse actors, follow-ups never overlap', () => {
  const strikes = [hit, { ...hit, by: 'enemy', target: 'ally', hit: false }, hit];
  const beats = combatTimeline(strikes);
  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    assert.equal(combatAt(beats, beat.impact).shown, i + 1);
    assert.equal(combatAt(beats, beat.windup).active.strike.by, strikes[i].by);
    if (i) assert.ok(beat.windup > beats[i - 1].end);
  }
  assert.deepEqual(combatAt(beats, beats[1].impact).reaction, { id: 'ally', pose: 'dodge' });
  assert.equal(combatAt(beats, beats[2].end).shown, 3);
  assert.equal(combatAt([], 1000).shown, 0);
});

test('a critical hit charges and holds longer; backlash hurts the striker without a critical flash', () => {
  const crit = { ...hit, crit: true };
  const backlash = { ...crit, backlash: true, byHpAfter: 9 };
  const normal = combatTimeline([hit])[0], charged = combatTimeline([crit])[0];
  assert.ok(charged.release - charged.windup > normal.release - normal.windup);
  assert.ok(charged.recover - charged.impact > normal.recover - normal.impact);
  assert.equal(criticalHit(crit), true);
  assert.equal(criticalHit({ ...crit, hit: false }), false);
  assert.equal(criticalHit(backlash), false);
  assert.equal(impactTarget(backlash), 'ally');
  const beats = combatTimeline([backlash]);
  assert.deepEqual(combatAt(beats, beats[0].impact).reaction, { id: 'ally', pose: 'hurt' });
  assert.equal(beats[0].end, normal.end);
});

for (const sheet of BATTLE_SHEETS) {
  test(`${sheet.id}: every attack step plays in order and damage lands on its hit step`, () => {
    const sheets = { ally: sheet }, clip = sheet.attack;
    const beats = combatTimeline([hit, { ...hit, by: 'enemy', target: 'ally' }, hit], sheets);
    const beat = beats[0];
    assert.equal(beat.clip, clip);
    assert.equal(beat.end - beat.start, total(clip.durationsMs));
    for (let step = 0; step < clip.frames.length; step++) {
      const at = beat.frameStarts[step];
      const state = combatAt(beats, at);
      assert.equal(state.frame, step);
      assert.equal(state.shown, step >= clip.hit ? 1 : 0);
      if (!sheet.reacts) assert.equal(state.pose, ['idle', 'windup', 'strike', 'recover'][Math.floor(step / 4)]);
      assert.equal(combatAt(beats, at + clip.durationsMs[step] - 1).frame, step);
    }
    assert.equal(combatAt(beats, beat.impact - 1).reaction, null);
    assert.deepEqual(combatAt(beats, beat.impact).reaction, { id: 'enemy', pose: 'hurt' });
    assert.equal(beats[1].frameStarts, null, 'counter with a different weapon keeps procedural animation');
    assert.ok(beats[1].start > beat.end);
    assert.ok(beats[2].start > beats[1].end);
    assert.equal(combatAt(beats, beats[2].start).frame, 0, 'follow-up restarts the entire clip');

    const charged = combatTimeline([{ ...hit, crit: true }], sheets)[0];
    if (sheet.critical) {
      // An authored critical plays its own clip at its own pace.
      assert.equal(charged.clip, sheet.critical);
      assert.equal(charged.end - charged.start, total(sheet.critical.durationsMs));
      assert.equal(combatAt([charged], charged.impact).frame, sheet.critical.hit);
    } else {
      assert.equal(charged.impact - beat.impact, clip.charge < clip.hit ? 360 : 0);
      assert.equal(charged.end - beat.end, (clip.charge === undefined ? 0 : 360) + 220);
      assert.equal(combatAt([charged], charged.impact).frame, clip.hit);
      assert.equal(combatAt([charged], charged.recover - 1).frame, clip.recover - 1);
    }
    const idle = total(sheet.idle.durationsMs);
    assert.equal(idleSheetFrame(sheet, idle - 1), sheet.idle.frames.at(-1));
    assert.equal(idleSheetFrame(sheet, idle), sheet.idle.frames[0]);
  });
}

test('a dodge plays once and holds its last frame', () => {
  const run = { frames: [4, 5, 6], durationsMs: [50, 50, 100] };
  assert.deepEqual([0, 49, 50, 120, 199, 200, 5000].map(ms => loopFrame(run, ms, false)), [4, 4, 5, 6, 6, 6, 6]);
  assert.deepEqual([0, 200, 250].map(ms => loopFrame(run, ms)), [4, 4, 5]);
});
