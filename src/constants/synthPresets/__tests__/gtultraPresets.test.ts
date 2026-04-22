/**
 * GT Ultra SID synth preset contract tests.
 * Verifies preset structure, SID register byte validity,
 * and wiring into the global preset system.
 */

import { describe, it, expect } from 'vitest';
import { GTULTRA_PRESETS } from '../gtultra';
import { ALL_PRESETS } from '../allPresets';

describe('GT Ultra presets structure', () => {
  it('has at least 10 presets', () => {
    expect(GTULTRA_PRESETS.length).toBeGreaterThanOrEqual(10);
  });

  it('all presets have unique IDs', () => {
    const ids = GTULTRA_PRESETS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all presets have valid SID register bytes', () => {
    for (const preset of GTULTRA_PRESETS) {
      const cfg = preset.config as Record<string, number>;
      // ad and sr must be valid bytes (0-255)
      expect(cfg.ad).toBeGreaterThanOrEqual(0);
      expect(cfg.ad).toBeLessThanOrEqual(255);
      expect(cfg.sr).toBeGreaterThanOrEqual(0);
      expect(cfg.sr).toBeLessThanOrEqual(255);
      // firstwave must have gate bit set (0x01) for sound
      expect(cfg.firstwave & 0x01).toBe(1);
      // firstwave must have at least one waveform bit set (TRI|SAW|PUL|NOI)
      expect(cfg.firstwave & 0xF0).toBeGreaterThan(0);
    }
  });

  it('all presets have valid categories', () => {
    const validCategories = ['bass', 'lead', 'pad', 'key', 'fx', 'drum', 'pluck', 'string'];
    for (const preset of GTULTRA_PRESETS) {
      expect(validCategories).toContain(preset.category);
    }
  });

  it('includes bass presets with 303 character', () => {
    const bassPresets = GTULTRA_PRESETS.filter(p => p.category === 'bass');
    expect(bassPresets.length).toBeGreaterThanOrEqual(3);
    // Should have acid/303-style preset
    const acidPreset = GTULTRA_PRESETS.find(p => p.id.includes('acid') || p.id.includes('303'));
    expect(acidPreset).toBeDefined();
  });

  it('includes dub siren preset', () => {
    const siren = GTULTRA_PRESETS.find(p => p.name.toLowerCase().includes('siren'));
    expect(siren).toBeDefined();
  });

  it('is wired into ALL_PRESETS', () => {
    expect(ALL_PRESETS['GTUltraSynth']).toBe(GTULTRA_PRESETS);
  });
});
