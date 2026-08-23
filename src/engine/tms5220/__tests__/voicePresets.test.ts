/**
 * voicePresets.test.ts — preset labels must match the chip's pitch semantics.
 *
 * pitch_index indexes the TMS5220's PERIOD table: higher index = longer
 * period = LOWER voice, neutral at 32. The first presets assumed the
 * opposite, so Chipmunk (46) growled and Deep (18) squeaked — reported as
 * "chipmunk sounds like a dark angry robot".
 */
import { describe, it, expect } from 'vitest';
import { TMS5220_VOICE_PRESETS } from '../voicePresets';

const preset = (id: string) =>
  TMS5220_VOICE_PRESETS.find(p => p.id === id)!.params;

describe('TMS5220 voice presets', () => {
  it('Chipmunk raises the voice: pitch_index BELOW the 32 neutral', () => {
    expect(preset('chipmunk').pitch_index).toBeLessThan(32);
  });

  it('Deep lowers the voice: pitch_index ABOVE the 32 neutral', () => {
    expect(preset('deep').pitch_index).toBeGreaterThan(32);
  });

  it('Bright sits above neutral pitch, Muffled below', () => {
    expect(preset('bright').pitch_index).toBeLessThan(32);
    expect(preset('muffled').pitch_index).toBeGreaterThan(32);
  });

  it('Whisper forces noise excitation', () => {
    expect(preset('whisper').noise_mode).toBe(1);
  });
});
