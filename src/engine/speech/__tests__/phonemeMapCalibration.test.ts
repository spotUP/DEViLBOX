/**
 * phonemeMapCalibration.test.ts — regression test for calibrated static phoneme map.
 *
 * Verifies that the samToTMS5220 map contains calibrated values for the 16
 * phonemes extracted from A-Z letter recordings, and hand-authored values for
 * the remaining phonemes.
 */
import { describe, it, expect } from 'vitest';
import { samToTMS5220, type TMS5220Frame } from '../tms5220PhonemeMap';
import { KNOWN_PHONEMES } from '../Reciter';

describe('samToTMS5220 calibrated static map', () => {
  // Phonemes calibrated from A-Z letter recordings (middle 40%, mean K, energy capped at 10)
  const CALIBRATED_PHONEMES = new Set([
    'AA', 'AY', 'B*', 'CH', 'EH', 'EY', 'F*', 'IY',
    'K*', 'OW', 'P*', 'S*', 'T*', 'UW', 'W*', 'Y*',
  ]);

  // Expected calibrated values (from tools/tms5220-audit/calibratedStaticMap.ts)
  const expectedCalibrated: Record<string, Partial<TMS5220Frame>> = {
    'AA': { k: [10, 26, 9, 8, 8, 9, 9, 5, 5, 2], energy: 10, pitch: 21, unvoiced: false, durationMs: 325 },
    'AY': { k: [13, 23, 9, 9, 7, 10, 12, 3, 2, 4], energy: 10, pitch: 18, unvoiced: false, durationMs: 325 },
    'B*': { k: [1, 17, 10, 7, 7, 10, 10, 4, 2, 2], energy: 4, pitch: 20, unvoiced: false, durationMs: 125 },
    'CH': { k: [23, 26, 14, 13, 8, 8, 8, 4, 4, 4], energy: 8, pitch: 0, unvoiced: true, durationMs: 225 },
    'EH': { k: [15, 17, 6, 6, 8, 11, 9, 3, 2, 4], energy: 10, pitch: 17, unvoiced: false, durationMs: 325 },
    'EY': { k: [15, 12, 5, 7, 13, 11, 10, 4, 2, 4], energy: 10, pitch: 20, unvoiced: false, durationMs: 350 },
    'F*': { k: [20, 17, 9, 9, 8, 8, 8, 4, 4, 4], energy: 7, pitch: 0, unvoiced: true, durationMs: 175 },
    'IY': { k: [18, 13, 2, 4, 8, 14, 12, 3, 2, 4], energy: 10, pitch: 16, unvoiced: false, durationMs: 375 },
    'K*': { k: [24, 27, 12, 10, 8, 8, 8, 4, 4, 4], energy: 7, pitch: 0, unvoiced: true, durationMs: 100 },
    'OW': { k: [7, 19, 13, 8, 4, 5, 10, 4, 5, 4], energy: 10, pitch: 20, unvoiced: false, durationMs: 300 },
    'P*': { k: [19, 19, 10, 8, 8, 8, 8, 4, 4, 4], energy: 7, pitch: 0, unvoiced: true, durationMs: 50 },
    'S*': { k: [29, 21, 7, 9, 8, 8, 8, 4, 4, 4], energy: 7, pitch: 0, unvoiced: true, durationMs: 250 },
    'T*': { k: [24, 20, 12, 8, 8, 8, 8, 4, 4, 4], energy: 7, pitch: 0, unvoiced: true, durationMs: 75 },
    'UW': { k: [8, 15, 9, 7, 6, 6, 8, 6, 5, 2], energy: 10, pitch: 19, unvoiced: false, durationMs: 250 },
    'W*': { k: [5, 27, 11, 8, 4, 7, 9, 3, 4, 3], energy: 10, pitch: 18, unvoiced: false, durationMs: 150 },
    'Y*': { k: [19, 7, 1, 7, 9, 11, 11, 5, 2, 2], energy: 10, pitch: 19, unvoiced: false, durationMs: 150 },
  };

  it('has entries for all KNOWN_PHONEMES', () => {
    const missing: string[] = [];
    for (const code of KNOWN_PHONEMES) {
      if (!samToTMS5220(code)) missing.push(code);
    }
    expect(missing).toEqual([]);
  });

  it('has calibrated values for the 16 letter-derived phonemes', () => {
    for (const code of CALIBRATED_PHONEMES) {
      const frame = samToTMS5220(code);
      expect(frame, `missing frame for ${code}`).not.toBeNull();
      if (!frame) continue;

      const expected = expectedCalibrated[code];
      expect(frame.k).toEqual(expected.k);
      expect(frame.energy).toBe(expected.energy);
      expect(frame.pitch).toBe(expected.pitch);
      expect(frame.unvoiced).toBe(expected.unvoiced);
      expect(frame.durationMs).toBe(expected.durationMs);
    }
  });

  it('vowel formant ratios spot-check', () => {
    // IY: front high vowel — K1 low (open), K2 high (front)
    const iy = samToTMS5220('IY')!;
    expect(iy.k[0]).toBeLessThan(20); // K1 low = open jaw / high vowel
    expect(iy.k[1]).toBeGreaterThan(10); // K2 high = front tongue

    // AH: central mid vowel — K1 mid, K2 mid
    const ah = samToTMS5220('AH')!;
    expect(ah.k[0]).toBeGreaterThan(15); // K1 mid
    expect(ah.k[0]).toBeLessThan(25);
    expect(ah.k[1]).toBeGreaterThan(8); // K2 mid
    expect(ah.k[1]).toBeLessThan(15);

    // UW: back high vowel — K1 low, K2 low
    const uw = samToTMS5220('UW')!;
    expect(uw.k[0]).toBeLessThan(15); // K1 low
    expect(uw.k[1]).toBeLessThan(20); // K2 low = back tongue
  });

  it('frame duration consistency', () => {
    for (const code of KNOWN_PHONEMES) {
      const frame = samToTMS5220(code);
      expect(frame, `missing ${code}`).not.toBeNull();
      if (!frame) continue;
      // Duration should be at least class minimum (stops 50ms, vowels 150ms, etc.)
      expect(frame.durationMs).toBeGreaterThanOrEqual(20);
    }
  });

  it('energy and pitch within valid bounds', () => {
    for (const code of KNOWN_PHONEMES) {
      const frame = samToTMS5220(code);
      expect(frame, `missing ${code}`).not.toBeNull();
      if (!frame) continue;
      expect(frame.energy).toBeGreaterThanOrEqual(1);
      expect(frame.energy).toBeLessThanOrEqual(14);
      expect(frame.pitch).toBeGreaterThanOrEqual(0);
      expect(frame.pitch).toBeLessThanOrEqual(31);
      // K indices within valid ranges
      expect(frame.k[0]).toBeGreaterThanOrEqual(0);
      expect(frame.k[0]).toBeLessThanOrEqual(31);
      expect(frame.k[1]).toBeGreaterThanOrEqual(0);
      expect(frame.k[1]).toBeLessThanOrEqual(31);
      for (let i = 2; i < 7; i++) {
        expect(frame.k[i]).toBeGreaterThanOrEqual(0);
        expect(frame.k[i]).toBeLessThanOrEqual(15);
      }
      for (let i = 7; i < 10; i++) {
        expect(frame.k[i]).toBeGreaterThanOrEqual(0);
        expect(frame.k[i]).toBeLessThanOrEqual(7);
      }
    }
  });

  it('unvoiced phonemes have pitch=0 and unvoiced=true', () => {
    const unvoicedCodes = ['S*', 'F*', 'TH', '/H', '/X', 'CH', 'SH', 'P*', 'T*', 'K*', 'KX'];
    for (const code of unvoicedCodes) {
      const frame = samToTMS5220(code);
      expect(frame, `missing ${code}`).not.toBeNull();
      if (!frame) continue;
      expect(frame.unvoiced).toBe(true);
      expect(frame.pitch).toBe(0);
    }
  });

  it('voiced phonemes have pitch>0 and unvoiced=false', () => {
    const vowelCodes = ['IY', 'IH', 'EH', 'AE', 'AA', 'AH', 'AO', 'UH', 'AX', 'IX', 'ER', 'UX', 'OH'];
    for (const code of vowelCodes) {
      const frame = samToTMS5220(code);
      expect(frame, `missing ${code}`).not.toBeNull();
      if (!frame) continue;
      expect(frame.unvoiced).toBe(false);
      expect(frame.pitch).toBeGreaterThan(0);
    }
  });
});