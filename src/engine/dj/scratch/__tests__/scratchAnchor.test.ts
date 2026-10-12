/**
 * Scratch anchors, position-to-rate and the step grid (owner scratch plan
 * sections 8, 11, 17, 18; ledger SCR-P3.1, P3.2, P3.6).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  anchorFor, deckAnchor, pickDeckAnchor, stepToBeat, beatToStep,
  allowedGrids, type ResolvedCrateAnchor,
} from '../scratchAnchor';
import { getScratchRecord } from '../scratchCatalogue';
import { getGesture } from '../scratchGestureCatalog';
import type { DeckScratchAnchor, ScratchSource } from '../scratchTypes';

const crate = (recordId: string): ScratchSource => ({ type: 'CRATE', recordId, anchor: { position: 0, safe: [0, 1], safeForward: [0, 1], safeReverse: [0, 1] } });

describe('anchors (SCR-P3.1, SCR-PHRASING-PARITY: the demo cues one anchor)', () => {
  const rec = getScratchRecord('AH_STANDARD')!;

  it('every hand gesture scratches a record from its vowel, as the demo does; a throw rides from the attack', () => {
    const baby = anchorFor(crate('AH_STANDARD'), 'baby') as ResolvedCrateAnchor;
    const orbit = anchorFor(crate('AH_STANDARD'), 'orbit') as ResolvedCrateAnchor;
    const drop = anchorFor(crate('AH_STANDARD'), 'drop') as ResolvedCrateAnchor;
    expect(baby.cue).toBe('vowel');
    expect(baby.position).toBeCloseTo(3300 / 22050, 9);
    expect(orbit.position).toBe(baby.position);
    // the vowel leaves reverse room: an orbit cued there is never refused at the safe start
    expect(orbit.position - rec.safeReverse[0]).toBeGreaterThan(0.01);
    expect(drop.cue).toBe('attack');
    // the attack is marked at 0, before the safe start: the anchor sits on the safe edge, as the voice plays it
    expect(drop.position).toBe(Math.max(rec.safe[0], rec.anchors.attack));
    expect(baby.safeForward).toEqual(rec.safeForward);
  });

  it('an unknown record has no anchor', () => {
    expect(anchorFor(crate('NO_SUCH_RECORD'), 'baby')).toBeNull();
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
    expect(anchorFor({ type: 'DECK', deck: 'A', anchor: cands[0]! }, 'baby')).toBe(cands[0]);
    expect(pickDeckAnchor(cands, 'ACCENT')!.kind).toBe('snare');
    expect(pickDeckAnchor(cands, 'FEATURE')!.kind).toBe('vocalOnset');
    expect(pickDeckAnchor(cands, 'THEME')!.kind).toBe('downbeat');
    expect(pickDeckAnchor([], 'THEME')).toBeNull();
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
