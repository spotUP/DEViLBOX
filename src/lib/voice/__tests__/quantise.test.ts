/**
 * quantise.test.ts - quantiseTime and the strength / tolerance knobs.
 *
 * Row length here is 0.1 s (150 bpm, speed 6), so offsets read in tenths.
 */
import { describe, expect, it } from 'vitest';
import { nearestRow, quantiseNotes, quantiseTime, rowSeconds, rowTime, type QuantiseSettings } from '../quantise';
import type { VoiceNote } from '../pitchNotes';

const base: QuantiseSettings = { bpm: 150, speed: 6, swing: 0, minLengthRows: 1, latencyNudgeMs: 0, strength: 1, toleranceRows: 0 };

function note(start: number, dur: number, midi: number, amp = 0.8): VoiceNote {
  return { startTimeSeconds: start, durationSeconds: dur, pitchMidi: midi, amplitude: amp };
}

describe('quantiseTime', () => {
  it('strength 1 lands every note on its nearest row', () => {
    const t = quantiseTime(0.43, base);
    expect(t.row).toBe(4);
    expect(t.offsetRows).toBe(0);
    expect(t.heardSeconds).toBe(0.43);
    expect(t.writtenSeconds).toBeCloseTo(0.4, 9);
  });

  it('strength 0 keeps the sung offset, signed in rows', () => {
    const late = quantiseTime(0.43, { ...base, strength: 0 });
    expect(late.row).toBe(4);
    expect(late.offsetRows).toBeCloseTo(0.3, 9);
    expect(late.writtenSeconds).toBeCloseTo(0.43, 9);

    const early = quantiseTime(0.37, { ...base, strength: 0 });
    expect(early.row).toBe(4);
    expect(early.offsetRows).toBeCloseTo(-0.3, 9);
    expect(early.writtenSeconds).toBeCloseTo(0.37, 9);
  });

  it('strength in between scales the offset', () => {
    const t = quantiseTime(0.44, { ...base, strength: 0.5 });
    expect(t.offsetRows).toBeCloseTo(0.2, 9);
    expect(t.writtenSeconds).toBeCloseTo(0.42, 9);
  });

  it('tolerance zeroes an offset that small whatever the strength', () => {
    const inside = quantiseTime(0.41, { ...base, strength: 0, toleranceRows: 0.1 });
    expect(inside.offsetRows).toBe(0);
    expect(inside.writtenSeconds).toBeCloseTo(0.4, 9);
    const outside = quantiseTime(0.42, { ...base, strength: 0, toleranceRows: 0.1 });
    expect(outside.offsetRows).toBeCloseTo(0.2, 9);
  });

  it('measures the offset from the swung grid time', () => {
    const swung: QuantiseSettings = { ...base, swing: 0.5, strength: 0 };
    const rs = rowSeconds(150, 6);
    expect(rowTime(1, rs, 0.5)).toBeCloseTo(0.125, 9);
    expect(rowTime(2, rs, 0.5)).toBeCloseTo(0.2, 9);
    expect(nearestRow(0.13, rs, 0.5)).toBe(1);
    const t = quantiseTime(0.13, swung);
    expect(t.row).toBe(1);
    expect(t.offsetRows).toBeCloseTo(0.05, 9);
    expect(t.writtenSeconds).toBeCloseTo(0.13, 9);
  });
});

describe('quantiseNotes with strength and tolerance', () => {
  it('carries heardSeconds and offsetRows onto each written note', () => {
    const [n] = quantiseNotes([note(0.43, 0.2, 60)], { ...base, strength: 0 });
    expect(n.row).toBe(4);
    expect(n.heardSeconds).toBeCloseTo(0.43, 9);
    expect(n.offsetRows).toBeCloseTo(0.3, 9);
  });

  it('heardSeconds is after the latency nudge', () => {
    const [n] = quantiseNotes([note(0.63, 0.2, 60)], { ...base, latencyNudgeMs: 200 });
    expect(n.row).toBe(4);
    expect(n.heardSeconds).toBeCloseTo(0.43, 9);
    expect(n.offsetRows).toBe(0);
  });
});
