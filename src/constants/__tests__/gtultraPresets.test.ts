/**
 * GTUltra Presets Tests — Validate SID instrument preset data integrity
 */
import { describe, it, expect } from 'vitest';
import { SID_PRESETS, getPresetsByCategory, getPresetCategories, type GTSIDPreset } from '../../constants/gtultraPresets';

describe('GTUltra Presets', () => {
  it('has presets defined', () => {
    expect(SID_PRESETS.length).toBeGreaterThan(0);
  });

  it('has categories defined', () => {
    expect(getPresetCategories().length).toBeGreaterThan(0);
  });

  it('all presets have required fields', () => {
    for (const preset of SID_PRESETS) {
      expect(preset.name).toBeTruthy();
      expect(preset.category).toBeTruthy();
      expect(typeof preset.ad).toBe('number');
      expect(typeof preset.sr).toBe('number');
      expect(typeof preset.waveform).toBe('number');
    }
  });

  it('AD/SR values are within 0-255 range', () => {
    for (const preset of SID_PRESETS) {
      expect(preset.ad).toBeGreaterThanOrEqual(0);
      expect(preset.ad).toBeLessThanOrEqual(255);
      expect(preset.sr).toBeGreaterThanOrEqual(0);
      expect(preset.sr).toBeLessThanOrEqual(255);
    }
  });

  it('waveform values use valid SID control register bits', () => {
    // Valid bits: gate(0x01), sync(0x02), ring(0x04), test(0x08), tri(0x10), saw(0x20), pulse(0x40), noise(0x80)
    const validBits = 0xFF;
    const waveformBits = 0xF0;
    for (const preset of SID_PRESETS) {
      expect(preset.waveform & ~validBits).toBe(0);
      // Should have at least one waveform selected
      expect(preset.waveform & waveformBits).toBeGreaterThan(0);
    }
  });

  it('pulse width values are within SID range when present', () => {
    for (const preset of SID_PRESETS) {
      if (preset.pulseWidth !== undefined) {
        expect(preset.pulseWidth).toBeGreaterThanOrEqual(0);
        expect(preset.pulseWidth).toBeLessThanOrEqual(0xFFF);
      }
    }
  });

  it('categories contain all presets', () => {
    const categories = getPresetCategories();
    let totalInCategories = 0;
    for (const cat of categories) {
      const presets = getPresetsByCategory(cat);
      totalInCategories += presets.length;
      for (const preset of presets) {
        expect(preset.category).toBe(cat);
      }
    }
    expect(totalInCategories).toBe(SID_PRESETS.length);
  });

  it('preset names are unique', () => {
    const names = new Set<string>();
    for (const preset of SID_PRESETS) {
      expect(names.has(preset.name)).toBe(false);
      names.add(preset.name);
    }
  });
});
