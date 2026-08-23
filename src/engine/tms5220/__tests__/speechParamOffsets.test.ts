/**
 * Regression tests for applySpeechParamOffsets (TMS5220Synth speech knob
 * plumbing). The formant (K1-K3) and noise-mode knobs used to be dead for
 * text/phoneme speech — they only reached active note voices in the C++.
 */
import { describe, expect, it } from 'vitest';
import type { TMS5220Frame } from '@engine/speech/tms5220PhonemeMap';
import { applySpeechParamOffsets } from '../speechParamOffsets';

function frame(overrides: Partial<TMS5220Frame> = {}): TMS5220Frame {
  return {
    k: [15, 15, 15, 15, 15, 15, 15, 15, 15, 15],
    energy: 10,
    pitch: 20,
    unvoiced: false,
    durationMs: 25,
    ...overrides,
  };
}

describe('applySpeechParamOffsets', () => {
  it('returns frames unchanged when all knobs are at default', () => {
    const f = frame();
    const out = applySpeechParamOffsets([f], {});
    expect(out).toEqual([f]);
  });

  it('offsets K1-K3 formant indices in the index domain', () => {
    const out = applySpeechParamOffsets([frame()], { kIndices: [20, 10, 15] });
    // K1: +5 → 20, K2: -5 → 10, K3: centered → untouched
    expect(out[0].k[0]).toBe(20);
    expect(out[0].k[1]).toBe(10);
    expect(out[0].k[2]).toBe(15);
  });

  it('clamps formant indices to the table ranges', () => {
    const out = applySpeechParamOffsets([frame({ k: [31, 0, 15] })], { kIndices: [31, 0, 15] });
    // K1: 31 + 16 → clamped 31, K2: 0 - 15 → clamped 0
    expect(out[0].k[0]).toBe(31);
    expect(out[0].k[1]).toBe(0);
  });

  it('forces noise excitation on all frames when noise mode is on', () => {
    const out = applySpeechParamOffsets([frame()], { noiseMode: 1 });
    expect(out[0].unvoiced).toBe(true);
  });

  it('does not touch unvoiced frames for pitch but still applies formants', () => {
    const f = frame({ pitch: 0, unvoiced: true });
    const out = applySpeechParamOffsets([f], { pitchIndex: 46, kIndices: [18, 15, 15] });
    expect(out[0].pitch).toBe(0);
    expect(out[0].unvoiced).toBe(true);
    expect(out[0].k[0]).toBe(18);
  });

  it('keeps pitch and energy behavior for the pitched path', () => {
    const out = applySpeechParamOffsets([frame({ pitch: 20, energy: 10 })], {
      pitchIndex: 40, // +8
      energyIndex: 5, // scale 0.5
    });
    expect(out[0].pitch).toBe(28);
    expect(out[0].energy).toBe(5);
  });

  it('clamps pitch into the 1-31 voiced range', () => {
    const out = applySpeechParamOffsets([frame({ pitch: 20 })], { pitchIndex: 63 });
    expect(out[0].pitch).toBe(31);
  });

  it('never mutates the input frames', () => {
    const f = frame();
    const snapshot = JSON.stringify(f);
    applySpeechParamOffsets([f], { kIndices: [18, 15, 15], noiseMode: 1, pitchIndex: 40 });
    expect(JSON.stringify(f)).toBe(snapshot);
  });
});