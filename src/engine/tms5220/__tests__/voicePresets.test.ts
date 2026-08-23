/**
 * voicePresets.test.ts — preset labels must match the chip's pitch semantics.
 *
 * pitch_index indexes the TMS5220's PERIOD table: higher index = longer
 * period = LOWER voice, neutral at 32. The first presets assumed the
 * opposite, so Chipmunk (46) growled and Deep (18) squeaked — reported as
 * "chipmunk sounds like a dark angry robot".
 */
import { describe, it, expect } from 'vitest';
import { TMS5220_VOICE_PRESETS, NEUTRAL_VOICE_PARAMS, resolvePresetParams } from '../voicePresets';

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

  it('NO preset bends K1-K3 — formant-index offsets garble the liquids', () => {
    // K indices are reflection-coefficient table positions — shifting them
    // relocates formants, and W/ER/L collapse first: every preset that
    // carried K offsets said "hello frrzzll" instead of "hello world".
    for (const { id, params } of TMS5220_VOICE_PRESETS) {
      expect(params.k1_index, `${id} must not bend K1`).toBeUndefined();
      expect(params.k2_index, `${id} must not bend K2`).toBeUndefined();
      expect(params.k3_index, `${id} must not bend K3`).toBeUndefined();
    }
    expect(preset('bright').brightness).toBeGreaterThan(0.5);
    expect(preset('muffled').brightness).toBeLessThan(0.5);
  });

  it('Speak & Spell is the neutral chip plus the toy cabinet', () => {
    const resolved = resolvePresetParams('speakandspell')!;
    expect(resolved.cabinet).toBeGreaterThan(0);
    for (const [key, value] of Object.entries(NEUTRAL_VOICE_PARAMS)) {
      if (key === 'cabinet') continue;
      expect(resolved[key], key).toBe(value);
    }
  });

  it('resolvePresetParams fills every neutral value so presets leave no residue', () => {
    // Picking Muffled after Alien must clear Alien's formant shifts.
    const muffled = resolvePresetParams('muffled')!;
    expect(muffled.k1_index).toBe(NEUTRAL_VOICE_PARAMS.k1_index);
    expect(muffled.k2_index).toBe(NEUTRAL_VOICE_PARAMS.k2_index);
    expect(muffled.chirp_type).toBe(0);
    // And Default is exactly the neutral chip.
    expect(resolvePresetParams('default')).toEqual(NEUTRAL_VOICE_PARAMS);
  });
});
