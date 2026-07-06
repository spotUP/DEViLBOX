/**
 * Guards the generated Sonix presets: every entry is a valid, editable SonixSynth config
 * with a complete sonix parameter block. Regenerate via scripts/generate-sonix-presets.mjs.
 */
import { describe, it, expect } from 'vitest';
import { SONIX_PRESETS } from '../sonixPresets';

describe('SONIX_PRESETS', () => {
  it('contains presets', () => {
    expect(SONIX_PRESETS.length).toBeGreaterThan(0);
  });

  it('every preset is an editable SonixSynth with a complete sonix param block', () => {
    for (const p of SONIX_PRESETS) {
      expect(p.type).toBe('synth');
      expect(p.synthType).toBe('SonixSynth');
      const sonix = (p.parameters as any)?.sonix;
      expect(sonix).toBeDefined();
      expect(Array.isArray(sonix.wave)).toBe(true);
      expect(sonix.wave).toHaveLength(128);
      expect(sonix.envTable).toHaveLength(128);
      expect(sonix.lfoWave).toHaveLength(128);
      expect(sonix.egLevels).toHaveLength(4);
      expect(sonix.egRates).toHaveLength(4);
      expect(typeof sonix.baseVol).toBe('number');
      // i8 sample range
      expect(Math.max(...sonix.wave)).toBeLessThanOrEqual(127);
      expect(Math.min(...sonix.wave)).toBeGreaterThanOrEqual(-128);
    }
  });

  it('has unique preset names', () => {
    const names = SONIX_PRESETS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
