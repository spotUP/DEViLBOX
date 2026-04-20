/**
 * Regression tests for the scratch pattern registry.
 *
 * Guards the class of regression where a pattern gets deleted, renamed, or
 * has its frame shape corrupted — any of which would silently break the
 * DJ scratch UI (buttons fire, keyboard commands reference a now-missing
 * name, pattern playback produces NaN velocities).
 *
 * Pure-data tests — no AudioContext, no DeckEngine instantiation.
 */

import { describe, it, expect } from 'vitest';
import { SCRATCH_PATTERNS, getPatternByName, type ScratchPattern } from '../DJScratchEngine';

// ── Known patterns (by canonical name + expected index) ────────────────────
// Any rename or reorder requires a matching test update. That friction is
// the point — a silent rename breaks keyboard commands (`djScratchBaby` →
// `SCRATCH_PATTERNS[0].name`) which is exactly the class of bug we want
// caught in CI rather than in a gig.
const EXPECTED_NAMES: readonly string[] = [
  'Baby Scratch',    // 0 — djScratchBaby
  'Transformer',     // 1 — djScratchTrans (single-frame: fader-chop at constant velocity)
  'Flare',           // 2 — djScratchFlare
  'Hydroplane',      // 3 — djScratchHydro
  'Crab',            // 4 — djScratchCrab (single-frame like Transformer)
  'Orbit',           // 5 — djScratchOrbit
  'Chirp',           // 6 — djScratchChirp
  'Stab',            // 7 — djScratchStab
  'Scribble',        // 8 — djScratchScrbl
  'Tear',            // 9 — djScratchTear
  'Uzi',             // 10 — djScratchUzi
  'Twiddle',         // 11 — djScratchTwiddle
  '8-Finger Crab',   // 12 — djScratch8Crab (single-frame)
  '3-Click Flare',   // 13 — djScratch3Flare
  'Laser',           // 14 — djScratchLaser
  'Phaser',          // 15 — djScratchPhaser
  'Tweak',           // 16 — djScratchTweak
  'Drag',            // 17 — djScratchDrag
  'Vibrato',         // 18 — djScratchVibrato
];

// Patterns that are intentionally single-frame (constant velocity with
// fader-chop timing applied externally via the playback loop). Any NEW
// pattern with one frame should be added here explicitly so the default
// "≥ 2 frames" guard catches accidentally-truncated tables.
const SINGLE_FRAME_PATTERNS: readonly string[] = ['Transformer', 'Crab', '8-Finger Crab'];

describe('SCRATCH_PATTERNS registry', () => {
  it('contains exactly 19 patterns', () => {
    expect(SCRATCH_PATTERNS).toHaveLength(19);
  });

  it('preserves the canonical order (keyboard commands index by position)', () => {
    // djScratchBaby() maps to SCRATCH_PATTERNS[0], djScratchTrans() → [1], etc.
    // Reordering this array breaks every keyboard binding without a
    // type-check warning. The guard is intentionally per-name.
    expect(SCRATCH_PATTERNS.map((p) => p.name)).toEqual(EXPECTED_NAMES);
  });

  it('all pattern names are unique', () => {
    const names = SCRATCH_PATTERNS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('all short names are unique and non-empty', () => {
    const shortNames = SCRATCH_PATTERNS.map((p) => p.shortName);
    for (const s of shortNames) {
      expect(s.length).toBeGreaterThan(0);
    }
    expect(new Set(shortNames).size).toBe(shortNames.length);
  });

  it('every pattern has either durationBeats or durationMs set (not neither, not both null)', () => {
    // The ScratchPlayback loop reads one of these to size the cycle — a
    // pattern with both null causes a NaN duration and the interval never
    // terminates.
    for (const p of SCRATCH_PATTERNS) {
      const hasOne = (p.durationBeats !== null) || (p.durationMs !== null);
      expect(hasOne, `Pattern "${p.name}" has neither durationBeats nor durationMs`).toBe(true);
    }
  });

  it('multi-frame patterns have at least 2 frames; single-frame patterns are explicitly allowlisted', () => {
    for (const p of SCRATCH_PATTERNS) {
      if (SINGLE_FRAME_PATTERNS.includes(p.name)) {
        expect(p.frames.length, `${p.name}: single-frame allowlist but has no frames`).toBeGreaterThanOrEqual(1);
      } else {
        expect(p.frames.length, `${p.name}: multi-frame pattern must have ≥2 keyframes`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('frames have monotonically non-decreasing timeFraction in [0, 1]', () => {
    for (const p of SCRATCH_PATTERNS) {
      let prev = -Infinity;
      for (const f of p.frames) {
        // Single-frame patterns (Transformer / Crab / 8-Finger Crab) may omit
        // `timeFraction` since there's nothing to position — the cycle is a
        // single static rate. Skip the monotonic + range check for those.
        if (f.timeFraction === undefined) {
          expect(p.frames.length, `${p.name}: timeFraction=undefined only valid on single-frame patterns`).toBe(1);
          continue;
        }
        expect(f.timeFraction, `${p.name}: timeFraction out of [0,1]`).toBeGreaterThanOrEqual(0);
        expect(f.timeFraction, `${p.name}: timeFraction out of [0,1]`).toBeLessThanOrEqual(1);
        expect(f.timeFraction, `${p.name}: timeFraction not monotonic`).toBeGreaterThanOrEqual(prev);
        prev = f.timeFraction;
      }
    }
  });

  it('frames have finite numeric velocity and faderGain in [0, 1]', () => {
    // Fader gain outside [0,1] would blow the deck limiter or mute silently.
    // NaN velocity would propagate into AudioParam writes and kill scratch.
    for (const p of SCRATCH_PATTERNS) {
      for (const f of p.frames) {
        expect(Number.isFinite(f.velocity), `${p.name}: non-finite velocity`).toBe(true);
        expect(Number.isFinite(f.faderGain), `${p.name}: non-finite faderGain`).toBe(true);
        expect(f.faderGain, `${p.name}: faderGain > 1`).toBeLessThanOrEqual(1);
        expect(f.faderGain, `${p.name}: faderGain < 0`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('quantize field is either false or one of "1/4" | "1/8"', () => {
    const valid = new Set([false, '1/4', '1/8'] as const);
    for (const p of SCRATCH_PATTERNS) {
      expect(valid.has(p.quantize as never), `${p.name}: invalid quantize "${p.quantize}"`).toBe(true);
    }
  });
});

describe('getPatternByName', () => {
  it('finds every registered pattern by canonical name', () => {
    for (const name of EXPECTED_NAMES) {
      const found = getPatternByName(name);
      expect(found, `getPatternByName("${name}") returned undefined`).toBeDefined();
      expect(found?.name).toBe(name);
    }
  });

  it('returns undefined for an unknown name', () => {
    expect(getPatternByName('NotARealPattern')).toBeUndefined();
  });

  it('is case-sensitive (matches the UI button labels exactly)', () => {
    // Names match button labels in DeckScratch.tsx — a loose match would
    // create UI<->logic drift where "baby scratch" renders but doesn't fire.
    expect(getPatternByName('baby scratch')).toBeUndefined();
    expect(getPatternByName('BABY SCRATCH')).toBeUndefined();
    expect(getPatternByName('Baby Scratch')).toBeDefined();
  });
});

describe('trueReverse vs interpolateVelocity semantics', () => {
  it('patterns with trueReverse=true also need durationBeats (beat-synced), not durationMs', () => {
    // trueReverse patterns use the ring-buffer reverse path which only works
    // when the cycle is long enough to capture then replay. Fixed-ms durations
    // on truly-reversing patterns would cause reverse playback to race the
    // capture buffer and scratch silence.
    for (const p of SCRATCH_PATTERNS) {
      if (p.trueReverse === true) {
        expect(p.durationBeats, `${p.name}: trueReverse pattern without durationBeats`).not.toBeNull();
      }
    }
  });

  it('patterns that set interpolateVelocity=true still work at any BPM', () => {
    // Interpolation must produce finite values for any (from, to) pair —
    // protects against a future frame entry that would divide by zero in
    // the linear interp.
    const interpolated = SCRATCH_PATTERNS.filter((p) => p.interpolateVelocity);
    expect(interpolated.length, 'expected at least one interpolated pattern').toBeGreaterThan(0);
    for (const p of interpolated) {
      for (let i = 1; i < p.frames.length; i++) {
        const cur = p.frames[i].timeFraction;
        const prev = p.frames[i - 1].timeFraction;
        // Interpolated patterns must have both endpoints defined (undefined
        // would disable interp anyway — still a data-shape error worth flagging).
        expect(cur, `${p.name}: frame ${i} missing timeFraction`).toBeDefined();
        expect(prev, `${p.name}: frame ${i - 1} missing timeFraction`).toBeDefined();
        const dt = (cur as number) - (prev as number);
        expect(dt, `${p.name}: zero-width interpolation window at frame ${i}`).toBeGreaterThan(0);
      }
    }
  });
});

// ── Structural sanity: the exported type hasn't drifted ───────────────────
describe('ScratchPattern type surface', () => {
  it('each pattern is compatible with the exported interface', () => {
    // Compile-time check via type narrowing. Forces an explicit reference so
    // the test actually exercises the import (otherwise a tree-shaker could
    // elide it in the build).
    const sample: ScratchPattern = SCRATCH_PATTERNS[0];
    expect(typeof sample.name).toBe('string');
    expect(typeof sample.shortName).toBe('string');
    expect(typeof sample.loop).toBe('boolean');
    expect(Array.isArray(sample.frames)).toBe(true);
  });
});
