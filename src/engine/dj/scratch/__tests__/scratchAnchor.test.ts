/**
 * Scratch anchors, position-to-rate and the step grid (owner scratch plan
 * sections 8, 11, 17, 18; ledger SCR-P3.1, P3.2, P3.6).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  anchorFor, deckAnchor, pickDeckAnchor, positionCurveToRateCurve, integrateRateCurve, stepToBeat, beatToStep,
  allowedGrids, STROKE_SEC, MAX_RATE, CRATE_CUE_BY_ROLE, type ResolvedCrateAnchor,
} from '../scratchAnchor';
import { getScratchRecord } from '../scratchCatalogue';
import { getGesture } from '../scratchGestureCatalog';
import type { DeckScratchAnchor, ScratchHandPath, ScratchSource } from '../scratchTypes';

const crate = (recordId: string): ScratchSource => ({ type: 'CRATE', recordId, anchor: { position: 0, safe: [0, 1], safeForward: [0, 1], safeReverse: [0, 1] } });

describe('anchors by role (SCR-P3.1)', () => {
  const rec = getScratchRecord('AH_STANDARD')!;

  it('a THEME scratches from the vowel, an ACCENT from the attack, an OUTRO from the tail', () => {
    const theme = anchorFor(crate('AH_STANDARD'), 'THEME') as ResolvedCrateAnchor;
    const accent = anchorFor(crate('AH_STANDARD'), 'ACCENT') as ResolvedCrateAnchor;
    const outro = anchorFor(crate('AH_STANDARD'), 'OUTRO') as ResolvedCrateAnchor;
    expect(theme.cue).toBe('vowel');
    expect(theme.position).toBeCloseTo(3300 / 22050, 9);
    expect(accent.cue).toBe('attack');
    // the attack is marked at 0, before the safe start: the anchor sits on the safe edge, as the voice plays it
    expect(accent.position).toBe(Math.max(rec.safe[0], rec.anchors.attack));
    expect(outro.cue).toBe('tail');
    expect(outro.position).toBe(rec.anchors.tail);
    expect(theme.safeForward).toEqual(rec.safeForward);
    expect(Object.keys(CRATE_CUE_BY_ROLE)).toHaveLength(8);
  });

  it('an unknown record has no anchor', () => {
    expect(anchorFor(crate('NO_SUCH_RECORD'), 'THEME')).toBeNull();
  });

  it('a deck anchor keeps +1 beat forward and -0.5 beat reverse: 0.5 s and 0.25 s at 120 BPM', () => {
    const a = deckAnchor(10, 20, 'downbeat', 120);
    expect(a.safe[1] - a.position).toBeCloseTo(0.5, 9);
    expect(a.position - a.safe[0]).toBeCloseTo(0.25, 9);
    expect(a.beat).toBe(20);
    // the track start clamps the reverse room
    expect(deckAnchor(0.1, 0, 'downbeat', 120).safe[0]).toBe(0);
  });

  it('a deck source returns its own anchor; a role picks its preferred kind among candidates', () => {
    const cands: DeckScratchAnchor[] = [deckAnchor(1, 2, 'downbeat', 120), deckAnchor(1.5, 3, 'snare', 120), deckAnchor(2, 4, 'vocalOnset', 120)];
    expect(anchorFor({ type: 'DECK', deck: 'A', anchor: cands[0]! }, 'THEME')).toBe(cands[0]);
    expect(pickDeckAnchor(cands, 'ACCENT')!.kind).toBe('snare');
    expect(pickDeckAnchor(cands, 'FEATURE')!.kind).toBe('vocalOnset');
    expect(pickDeckAnchor(cands, 'THEME')!.kind).toBe('downbeat');
    expect(pickDeckAnchor([], 'THEME')).toBeNull();
  });
});

describe('hand position to playback rate (section 17, SCR-P3.2)', () => {
  const SR = 48000;

  it('a baby over one beat at 120 BPM returns home: the rate integrates to 0 within 1 ms', () => {
    const baby = getGesture('baby');
    const dur = 0.5; // one beat at 120 BPM
    const r = positionCurveToRateCurve(baby.handPath!, dur, SR);
    expect(Math.abs(integrateRateCurve(r.points, dur))).toBeLessThan(0.001);
    expect(Math.abs(r.netTravelSec)).toBeLessThan(0.001);
    expect(r.clamped).toBe(false);
    expect(r.points.some((p) => p.rate > 0.1) && r.points.some((p) => p.rate < -0.1)).toBe(true);
  });

  it('a forward stab travels 1.3 strokes out, then returns', () => {
    const stab = getGesture('forwardStab');
    const dur = 0.5;
    const r = positionCurveToRateCurve(stab.handPath!, dur, SR);
    // cumulative travel peaks at the apex (t = 0.42 of the cycle)
    let cum = 0, peak = -Infinity;
    for (let i = 0; i < r.points.length; i++) {
      const end = i + 1 < r.points.length ? r.points[i + 1]!.t : dur;
      cum += r.points[i]!.rate * (end - r.points[i]!.t);
      peak = Math.max(peak, cum);
    }
    expect(peak).toBeCloseTo(1.3 * STROKE_SEC, 2);
    expect(Math.abs(peak - 1.3 * STROKE_SEC)).toBeLessThan(0.0015);
    expect(Math.abs(cum)).toBeLessThan(0.001);
  });

  it('a laser asked for rate 5 is clamped to 4 and reported', () => {
    // 1 stroke-unit path fast enough to need rate 5: STROKE_SEC x p / dur = 5
    const dur = 0.1;
    const p = 5 * dur / STROKE_SEC;
    const path: ScratchHandPath = [{ t: 0, position: 0, grip: 1 }, { t: 1, position: p, grip: 1 }];
    const r = positionCurveToRateCurve(path, dur, SR);
    expect(r.requestedPeak).toBeCloseTo(5, 3);
    expect(r.clamped).toBe(true);
    expect(Math.max(...r.points.map((x) => Math.abs(x.rate)))).toBe(MAX_RATE);
  });

  it('the rate bends through zero at a reversal instead of flipping', () => {
    const r = positionCurveToRateCurve(getGesture('baby').handPath!, 0.5, SR);
    let maxJump = 0;
    for (let i = 1; i < r.points.length; i++) maxJump = Math.max(maxJump, Math.abs(r.points[i]!.rate - r.points[i - 1]!.rate));
    // unsmoothed: a flip from +x to -x is 2x; smoothed it is at most ~a third of that per step
    const peak = Math.max(...r.points.map((p) => Math.abs(p.rate)));
    expect(maxJump).toBeLessThan(peak * 1.2);
  });
});

describe('the planner grid (section 8, SCR-P3.6)', () => {
  it('bar 17, step 14 at 4/4 on a 1/16 grid is beat 71.5 (the owner sample 68.875 is not consistent with its own definitions)', () => {
    expect(stepToBeat({ bar: 17, step: 14 }, '1/16')).toBe(71.5);
    expect(stepToBeat({ bar: 17, step: 0 })).toBe(68);
    expect(stepToBeat({ bar: 0, step: 3 }, '1/8')).toBe(1.5);
    expect(stepToBeat({ bar: 0, step: 3 }, '1/32')).toBe(0.375);
    expect(beatToStep(71.5, '1/16')).toEqual({ bar: 17, step: 14 });
  });

  it('1/32 only for one-step gestures under 110 BPM', () => {
    const stab = getGesture('laser'); // one-step stroke (SA-B2: the forward stab is an eighth)
    const orbit = getGesture('orbit');
    expect(stab.durationSteps).toBeLessThanOrEqual(1);
    expect(allowedGrids(stab, 100)).toContain('1/32');
    expect(allowedGrids(stab, 120)).not.toContain('1/32');
    expect(allowedGrids(orbit, 90)).not.toContain('1/32');
    expect(allowedGrids(orbit, 90)).toEqual(['1/8', '1/16']);
  });

  it('the planner modules carry no milliseconds', () => {
    const src = readFileSync(resolve(__dirname, '../scratchAnchor.ts'), 'utf8')
      .split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//') && !l.trim().startsWith('/*')).join('\n');
    expect(src).not.toMatch(/\bms\b|Ms\b|\* ?1000|\/ ?1000/);
  });
});
