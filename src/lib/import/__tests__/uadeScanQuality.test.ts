import { describe, it, expect } from 'vitest';
import {
  isDegenerateSample,
  enhancedSamplesAreUnusable,
  MIN_SAMPLE_SWING,
  MIN_SAMPLE_BYTES,
} from '../uadeScanQuality';

/** The measured failure: 534 bytes of 0x7F, four times over. */
const DC = new Uint8Array(534).fill(0x7f);
const SILENCE = new Uint8Array(534).fill(0);
const WAVE = Uint8Array.from({ length: 534 }, (_, i) => 0x80 + Math.round(60 * Math.sin(i / 8)));

describe('isDegenerateSample', () => {
  it('rejects the DC constant the scan produced for sdr.nobuddiesland end 2', () => {
    expect(isDegenerateSample(DC)).toBe(true);
  });

  it('rejects digital silence and anything too short to judge', () => {
    expect(isDegenerateSample(SILENCE)).toBe(true);
    expect(isDegenerateSample(new Uint8Array(MIN_SAMPLE_BYTES - 1).fill(1))).toBe(true);
    expect(isDegenerateSample(null)).toBe(true);
    expect(isDegenerateSample(undefined)).toBe(true);
  });

  it('accepts a waveform', () => {
    expect(isDegenerateSample(WAVE)).toBe(false);
  });

  it('accepts a quiet waveform that still swings', () => {
    const quiet = Uint8Array.from({ length: 64 }, (_, i) => 0x80 + (i % 2 ? MIN_SAMPLE_SWING : 0));
    expect(isDegenerateSample(quiet)).toBe(false);
  });
});

describe('enhancedSamplesAreUnusable', () => {
  it('is true when every extracted sample is DC — the measured case', () => {
    expect(enhancedSamplesAreUnusable({ 1: { pcm: DC }, 2: { pcm: DC }, 3: { pcm: DC }, 4: { pcm: DC } })).toBe(true);
  });

  it('is false when even one sample carries a waveform', () => {
    expect(enhancedSamplesAreUnusable({ 1: { pcm: DC }, 2: { pcm: WAVE }, 3: { pcm: SILENCE } })).toBe(false);
  });

  it('is true when the scan extracted nothing at all', () => {
    expect(enhancedSamplesAreUnusable({})).toBe(true);
    expect(enhancedSamplesAreUnusable(null)).toBe(true);
  });

  it('reads PCM handed over as a transferred ArrayBuffer', () => {
    expect(enhancedSamplesAreUnusable({ 1: { pcm: WAVE.buffer.slice(0) } })).toBe(false);
    expect(enhancedSamplesAreUnusable({ 1: { pcm: DC.buffer.slice(0) } })).toBe(true);
  });
});
