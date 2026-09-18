import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  computeMusicalPosition,
  computeMusicalPositionFromBeats,
  rowsPerBeat,
  DEFAULT_MUSICAL_CLOCK_SETTINGS,
  DEFAULT_PHRASE_BARS,
} from '../musicalClock';

/**
 * Plan item T3.
 *
 * The behaviour under test is the one Auto Dub hardcoded as
 * `bar = floor(row / 16)`: true only for 4/4 at speed 6. The speed-3 case is
 * the decider — a bar is 32 rows there, and the old arithmetic put bar edges
 * in the middle of bars.
 */
describe('MusicalClock — bar edges follow speed, not a hardcoded 16', () => {
  it('speed 6 reproduces the old arithmetic exactly (4 rows/beat, 16 rows/bar)', () => {
    for (const row of [0, 1, 15, 16, 17, 31, 32, 63, 64, 255]) {
      const p = computeMusicalPosition(row, 6);
      expect(p.rowsPerBeat).toBe(4);
      expect(p.rowsPerBar).toBe(16);
      expect(p.bar, `row ${row}`).toBe(Math.floor(row / 16));
      expect(p.positionInBar, `row ${row}`).toBeCloseTo((row % 16) / 16, 10);
    }
  });

  it('speed 3 puts bar edges at row 32 — the case the hardcode got wrong', () => {
    expect(rowsPerBeat(3)).toBe(8);
    const p0 = computeMusicalPosition(0, 3);
    expect(p0.rowsPerBar).toBe(32);

    // Row 16 is mid-bar at speed 3; the old code called it the start of bar 1.
    const mid = computeMusicalPosition(16, 3);
    expect(mid.bar).toBe(0);
    expect(mid.positionInBar).toBeCloseTo(0.5, 10);

    const edge = computeMusicalPosition(32, 3);
    expect(edge.bar).toBe(1);
    expect(edge.positionInBar).toBe(0);
  });

  it('speed 12 halves the grid — 2 rows/beat, 8 rows/bar', () => {
    const p = computeMusicalPosition(8, 12);
    expect(p.rowsPerBeat).toBe(2);
    expect(p.rowsPerBar).toBe(8);
    expect(p.bar).toBe(1);
  });

  it('beat index advances within the bar', () => {
    const beats = [0, 4, 8, 12].map(r => computeMusicalPosition(r, 6).beat);
    expect(beats).toEqual([0, 1, 2, 3]);
    expect(computeMusicalPosition(16, 6).beat).toBe(0); // wrapped into the next bar
  });
});

describe('MusicalClock — metre is supplied, never inferred', () => {
  it('3/4 gives 12-row bars at speed 6', () => {
    const s = { meter: { beatsPerBar: 3, beatUnit: 4 }, phraseBars: 16 };
    const p = computeMusicalPosition(12, 6, s);
    expect(p.rowsPerBar).toBe(12);
    expect(p.bar).toBe(1);
  });

  it('distinguishes 7/8 from 7/4 — same numerator, different bar length', () => {
    // The reason beatUnit exists at all. An eighth-note beat is half the rows
    // of a quarter-note beat, so 7/8 bars are half the length of 7/4 bars.
    const sevenFour = computeMusicalPosition(0, 6, { meter: { beatsPerBar: 7, beatUnit: 4 }, phraseBars: 16 });
    const sevenEight = computeMusicalPosition(0, 6, { meter: { beatsPerBar: 7, beatUnit: 8 }, phraseBars: 16 });
    expect(sevenFour.rowsPerBar).toBe(28);
    expect(sevenEight.rowsPerBar).toBe(14);
  });

  it('6/8 counts eighth-note beats', () => {
    const p = computeMusicalPosition(0, 6, { meter: { beatsPerBar: 6, beatUnit: 8 }, phraseBars: 16 });
    expect(p.rowsPerBeat).toBe(2);
    expect(p.rowsPerBar).toBe(12);
  });
});

describe('MusicalClock — phrases', () => {
  it('defaults to a 16-bar phrase regardless of pattern length', () => {
    // Explicitly NOT derived from pattern length: a 64-row 4-bar pattern still
    // sits inside a 16-bar phrase.
    expect(DEFAULT_MUSICAL_CLOCK_SETTINGS.phraseBars).toBe(DEFAULT_PHRASE_BARS);
    const p = computeMusicalPosition(16 * 16 - 1, 6);
    expect(p.phrase).toBe(0);
    expect(p.barInPhrase).toBe(15);
    expect(computeMusicalPosition(16 * 16, 6).phrase).toBe(1);
  });

  it('honours a shorter phrase setting', () => {
    const s = { ...DEFAULT_MUSICAL_CLOCK_SETTINGS, phraseBars: 8 };
    const p = computeMusicalPosition(8 * 16, 6, s);
    expect(p.phrase).toBe(1);
    expect(p.barInPhrase).toBe(0);
    expect(p.positionInPhrase).toBe(0);
  });

  it('positionInPhrase runs 0..1 across the phrase', () => {
    const half = computeMusicalPosition((16 * 16) / 2, 6);
    expect(half.positionInPhrase).toBeCloseTo(0.5, 10);
  });
});

describe('MusicalClock — boundary look-ahead', () => {
  it('reports the next beat, bar and phrase as absolute rows', () => {
    const p = computeMusicalPosition(5, 6);
    expect(p.nextBeatRow).toBe(8);
    expect(p.nextBarRow).toBe(16);
    expect(p.nextPhraseRow).toBe(256);
  });

  it('on an exact boundary the next boundary is strictly ahead', () => {
    // A PREPARE step schedules against this; returning the current row would
    // fire immediately and defeat anticipation.
    const p = computeMusicalPosition(16, 6);
    expect(p.nextBarRow).toBe(32);
    expect(p.nextBeatRow).toBe(20);
  });
});

describe('MusicalClock — robustness', () => {
  it('treats a missing or nonsense speed as the default', () => {
    for (const bad of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(rowsPerBeat(bad)).toBe(4);
    }
  });

  it('clamps negative and non-finite rows to the song start', () => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const p = computeMusicalPosition(bad, 6);
      expect(p.bar).toBe(0);
      expect(p.positionInBar).toBe(0);
    }
  });

  it('falls back to defaults for nonsense metre rather than dividing by zero', () => {
    const p = computeMusicalPosition(16, 6, { meter: { beatsPerBar: 0, beatUnit: 0 }, phraseBars: 0 });
    expect(p.rowsPerBar).toBe(16);
    expect(p.bar).toBe(1);
    expect(Number.isFinite(p.positionInPhrase)).toBe(true);
  });

  it('keeps fractional grids usable (speed 5 = 4.8 rows/beat)', () => {
    // Not rounded: rounding would place bar edges on rows the transport never
    // lands on. floor-based comparison stays correct.
    const p = computeMusicalPosition(19.2, 5);
    expect(p.rowsPerBeat).toBeCloseTo(4.8, 10);
    expect(p.rowsPerBar).toBeCloseTo(19.2, 10);
    expect(p.bar).toBe(1);
  });
});

describe('AutoDub consumes the clock — the hardcode is gone', () => {
  // The clock being correct is worthless if the caller still divides by 16.
  const src = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../../engine/dub/AutoDub.ts'),
    'utf8',
  );
  const barClock = src.slice(src.indexOf('function getAutoDubBarClock'));
  const body = barClock.slice(0, barClock.indexOf('\n}\n') + 2);

  it('derives the bar from MusicalClock, not from a fixed row count', () => {
    expect(body).toContain('computeMusicalPosition(');
    expect(body).not.toMatch(/rowLike\s*\/\s*16/);
    expect(body).not.toMatch(/rowLike\s*%\s*16/);
  });

  it('passes the transport speed in, so the grid tracks the song', () => {
    expect(body).toMatch(/computeMusicalPosition\([^)]*transport\.speed/);
  });

  it('the no-row fallback shares the same metre', () => {
    expect(body).toContain('computeMusicalPositionFromBeats(');
    expect(body).not.toMatch(/beats\s*\/\s*4/);
  });
});

describe('MusicalClock — beat-based fallback agrees with the row path', () => {
  it('four beats is one bar in 4/4', () => {
    expect(computeMusicalPositionFromBeats(4).bar).toBe(1);
    expect(computeMusicalPositionFromBeats(2).positionInBar).toBeCloseTo(0.5, 10);
  });

  it('three beats is one bar in 3/4', () => {
    const s = { meter: { beatsPerBar: 3, beatUnit: 4 }, phraseBars: 16 };
    expect(computeMusicalPositionFromBeats(3, s).bar).toBe(1);
  });
});
