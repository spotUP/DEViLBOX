/**
 * Gesture catalogue (owner scratch plan sections 9, 10, 38, 39, 67, Gate B;
 * ledger SCR-P1.2, P1.3, P1.10, P1.11): the 31 gestures, their computed
 * ranking, the legacy pattern mapping, the structural validity rules and the
 * source compatibility rule, read from the data the engine executes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SCRATCH_GESTURES, SCRATCH_GESTURE_IDS, GESTURE_LEVELS, getGesture, gestureActivity,
  rankByActivity, compatibleGestures, handPathReversals,
} from '../scratchGestureCatalog';
import { SCRATCH_STYLES } from '../scratchStyles';
import { SCRATCH_PATTERNS } from '../../DJScratchEngine';
import type { ScratchGesture } from '../scratchTypes';

const REQUIRED_FIELDS: ReadonlyArray<keyof ScratchGesture> = [
  'id', 'name', 'durationSteps', 'activity', 'difficulty', 'styles', 'roles', 'velocityCurve',
  'faderWindows', 'trueReverse', 'returnsToAnchor', 'intensity', 'requiresReverse',
  'allowsSampleSource', 'cycleBeats', 'interpolateVelocity', 'loop',
];

describe('scratch gesture catalogue (SCR-P1.2)', () => {
  it('holds the 31 ids: section 9 + throws + the DEViLBOX extras + the reference cut, echo, brake and spin-up (SCR-PG-A4), each once', () => {
    expect(SCRATCH_GESTURES).toHaveLength(31);
    expect(SCRATCH_GESTURE_IDS).toHaveLength(31);
    expect(new Set(SCRATCH_GESTURES.map((g) => g.id)).size).toBe(31);
    expect(SCRATCH_GESTURES.map((g) => g.id)).toEqual(SCRATCH_GESTURE_IDS);
  });

  it('every gesture carries every section 10 field (Gate B completion)', () => {
    for (const g of SCRATCH_GESTURES) {
      for (const f of REQUIRED_FIELDS) expect(g[f], `${g.id}.${String(f)}`).toBeDefined();
      expect(g.velocityCurve.length, `${g.id} velocity`).toBeGreaterThan(0);
      expect(g.faderWindows.length, `${g.id} windows`).toBeGreaterThan(0);
      expect(g.styles.length, `${g.id} styles`).toBeGreaterThan(0);
      expect(g.roles.length, `${g.id} roles`).toBeGreaterThan(0);
      expect(g.durationSteps, `${g.id} steps`).toBeGreaterThan(0);
      expect(g.name).toMatch(/^[A-Z][A-Za-z-]*( [A-Z][A-Za-z-]*)*$/); // full English words
    }
  });

  it('activity is read from the definition (windows + reversals): forwardStab < chirp < orbit, a throw is 0', () => {
    expect(gestureActivity('forwardStab')).toBeLessThan(gestureActivity('chirp'));
    expect(gestureActivity('chirp')).toBeLessThan(gestureActivity('orbit'));
    expect(gestureActivity('drop')).toBe(0);
    expect(gestureActivity('dropPhrase')).toBe(0);
    expect(gestureActivity('nonsense')).toBe(0);
    // reference `gesture_activity` on the reference baby path: 2 reversals
    expect(handPathReversals(getGesture('baby').handPath)).toBe(2);
    expect(gestureActivity('chirp')).toBe(3); // 2 windows + 1 reversal
    expect(rankByActivity(['orbit', 'chirp', 'drop', 'forwardStab'])).toEqual(['drop', 'forwardStab', 'chirp', 'orbit']);
    for (const g of SCRATCH_GESTURES) expect(g.intensity).toBeGreaterThanOrEqual(0);
    expect(Math.max(...SCRATCH_GESTURES.map((g) => g.intensity))).toBe(1);
  });

  it('ports the reference timings: chirp windows (0.06,0.44),(0.56,0.94) lead -2 ms; forwardStab (0,0.42); backwardStab (0.45,1); steps = the tuned stroke (SA-B2)', () => {
    expect(getGesture('chirp').faderWindows.map((w) => w.open)).toEqual([[0.06, 0.44], [0.56, 0.94]]);
    expect(getGesture('chirp').cutLeadMs).toBe(-2);
    expect(getGesture('chirpDouble').faderWindows).toHaveLength(4);
    expect(getGesture('orbit').faderWindows).toHaveLength(4);
    expect(getGesture('forwardStab').faderWindows.map((w) => w.open)).toEqual([[0, 0.42]]);
    expect(getGesture('backwardStab').faderWindows.map((w) => w.open)).toEqual([[0.45, 1]]);
    expect(getGesture('transformer4').faderWindows).toHaveLength(4);
    expect(getGesture('transformer8').faderWindows).toHaveLength(8);
    // the reference cut patterns (O3, SCR-PG-A3): crab's uneven edges, the flares, transform duty 0.5, hydroplane 12 cuts
    expect(getGesture('crab').faderWindows.map((w) => w.open)).toEqual([[0, 0.12], [0.19, 0.34], [0.4, 0.58], [0.63, 0.8], [0.85, 1]]);
    expect(getGesture('flare1').faderWindows.map((w) => w.open)).toEqual([[0, 0.45], [0.55, 1]]);
    expect(getGesture('flare2').faderWindows.map((w) => w.open)).toEqual([[0, 0.3], [0.37, 0.63], [0.7, 1]]);
    expect(getGesture('transformer4').faderWindows.map((w) => w.open)).toEqual([[0, 0.125], [0.25, 0.375], [0.5, 0.625], [0.75, 0.875]]);
    expect(getGesture('hydroplane').faderWindows).toHaveLength(12);
    for (const id of ['baby', 'babySlow', 'tearForward', 'tearReverse', 'scribble', 'drag'] as const) expect(getGesture(id).faderWindows.map((w) => w.open), id).toEqual([[0, 1]]);
    // SA-B2: one length per gesture = the tuned stroke (cycle x strokes); baby and slow baby take the
    // reference lengths since O3 (owner 2026-10-12, the beep fix); the rest are not yet the reference
    // `_GESTURE_STEPS` (baby 2, babySlow 3, stabs 1, chirp 2, transformer4 2, tears 2, flares 2,
    // orbit 3, crab 2, hydroplane 3, drag 4), which overlap when one hand performs them
    const steps = { baby: 2, babySlow: 3, forwardStab: 2, backwardStab: 2, chirp: 1, chirpDouble: 2, transformer4: 4, transformer8: 4, tearForward: 4, tearReverse: 4, flare1: 4, flare2: 4, orbit: 4, scribble: 2, drag: 8, crab: 4, hydroplane: 4, drop: 4, dropPhrase: 16 } as const;
    for (const [id, n] of Object.entries(steps)) expect(getGesture(id as keyof typeof steps).durationSteps, id).toBe(n);
  });
});

describe('SCRATCH_PATTERNS is derived from the catalogue (SCR-P1.3, D3)', () => {
  it('every legacy pattern maps to a gesture, 19 distinct, frames = the gesture velocity curve', () => {
    expect(SCRATCH_PATTERNS).toHaveLength(19);
    const ids = SCRATCH_PATTERNS.map((p) => p.gestureId);
    expect(new Set(ids).size).toBe(19);
    for (const p of SCRATCH_PATTERNS) {
      const g = getGesture(p.gestureId);
      expect(p.frames.map((f) => f.velocity)).toEqual(g.velocityCurve.map((v) => v.velocity));
      expect(p.durationBeats).toBe(g.cycleBeats);
      expect(p.trueReverse).toBe(g.trueReverse);
    }
  });
});

describe('pattern data validity (section 67, SCR-P1.11)', () => {
  it('anchor validity: a returnsToAnchor gesture starts its stroke at the anchor (0 +- 0.05)', () => {
    for (const g of SCRATCH_GESTURES.filter((g) => g.returnsToAnchor)) {
      expect(g.handPath, `${g.id} needs a hand path to return from`).toBeDefined();
      expect(Math.abs(g.handPath![0]!.position), g.id).toBeLessThanOrEqual(0.05);
    }
    for (const g of SCRATCH_GESTURES.filter((g) => !g.returnsToAnchor)) {
      // continuous-platter techniques and throws: no stroke home
      expect(g.handPath === undefined || g.id === 'drop' || g.id === 'dropPhrase', g.id).toBe(true);
    }
  });

  it('safe-range validity: every hand path stays within [-2.1, 2.1] strokes, t monotone in [0, 1]', () => {
    for (const g of SCRATCH_GESTURES) {
      if (!g.handPath) continue;
      let prev = -1;
      for (const p of g.handPath) {
        expect(Math.abs(p.position), g.id).toBeLessThanOrEqual(2.1);
        expect(p.t, g.id).toBeGreaterThanOrEqual(0);
        expect(p.t, g.id).toBeLessThanOrEqual(1);
        expect(p.t, g.id).toBeGreaterThanOrEqual(prev);
        prev = p.t;
      }
    }
  });

  it('gesture/style compatibility: every style bias lies within its allowed levels and names its own gestures', () => {
    for (const style of Object.values(SCRATCH_STYLES)) {
      for (const id of style.bias) {
        expect(GESTURE_LEVELS[id], `${style.id} bias ${id}`).toBeLessThanOrEqual(style.maxLevel);
        expect(getGesture(id).styles, `${style.id} bias ${id}`).toContain(style.id);
      }
    }
  });

  it('gesture/difficulty validity: every gesture has exactly one level 1-4 and it is its difficulty', () => {
    for (const g of SCRATCH_GESTURES) {
      expect([1, 2, 3, 4]).toContain(g.difficulty);
      expect(GESTURE_LEVELS[g.id]).toBe(g.difficulty);
    }
    expect(Object.keys(GESTURE_LEVELS)).toHaveLength(31);
  });

  it('fader window validity: 0 <= start < end <= 1, windows of one curve never overlap', () => {
    for (const g of SCRATCH_GESTURES) {
      for (const curve of ['deck', 'crossfader'] as const) {
        const ws = g.faderWindows.filter((w) => w.curve === curve).map((w) => w.open).sort((a, b) => a[0] - b[0]);
        let lastEnd = -1;
        for (const [s, e] of ws) {
          expect(s, `${g.id} start`).toBeGreaterThanOrEqual(0);
          expect(e, `${g.id} end`).toBeLessThanOrEqual(1);
          expect(s, `${g.id} start < end`).toBeLessThan(e);
          expect(s, `${g.id} overlap`).toBeGreaterThanOrEqual(lastEnd);
          lastEnd = e;
        }
      }
    }
  });

  it('cut lead validity: |lead| <= 10 ms', () => {
    for (const g of SCRATCH_GESTURES) expect(Math.abs(g.cutLeadMs ?? 0), g.id).toBeLessThanOrEqual(10);
  });
});

describe('source + gesture compatibility (sections 38, 39, SCR-P1.10)', () => {
  const metadata = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/samples/packs/scratch-originals/scratch_bank_metadata.json'), 'utf8')) as Record<string, { recommended_gestures: string[]; source_is_pre_scratched: boolean; category: string }>;
  const hints = (name: string) => ({ recommendedGestures: metadata[name]!.recommended_gestures, preScratched: metadata[name]!.source_is_pre_scratched });

  it('COUNT records allow forwardStab and transformer8', () => {
    for (const name of Object.keys(metadata).filter((k) => metadata[k]!.category === 'COUNT')) {
      const ids = compatibleGestures(hints(name));
      expect(ids, name).toContain('forwardStab');
      expect(ids, name).toContain('transformer8');
    }
  });

  it('a pre-scratched record (SCRATCH_005) allows only drop', () => {
    expect(compatibleGestures(hints('SCRATCH_005'))).toEqual(['drop']);
    for (const name of Object.keys(metadata).filter((k) => metadata[k]!.source_is_pre_scratched)) {
      expect(compatibleGestures(hints(name)), name).toEqual(['drop']);
    }
  });

  it('every reference gesture id in the crate resolves to a catalogue id', () => {
    const refs = new Set(Object.values(metadata).flatMap((r) => r.recommended_gestures));
    for (const ref of refs) {
      // a stab brings its variants (cut, echo); everything else maps one to one
      expect(compatibleGestures({ recommendedGestures: [ref], preScratched: false }), ref).toHaveLength(ref === 'forward_stab' ? 3 : 1);
    }
    // the reference's cut and echo are their own gestures since SCR-PG-A4
    expect(compatibleGestures({ recommendedGestures: ['cut', 'forward_stab', 'echo'], preScratched: false })).toEqual(['cut', 'forwardStab', 'echo']);
    expect(compatibleGestures({ recommendedGestures: ['tear_fwd'], preScratched: false })).toEqual(['tearForward']);
  });
});
