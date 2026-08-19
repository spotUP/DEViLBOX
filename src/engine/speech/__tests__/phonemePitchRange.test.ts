/**
 * phonemePitchRange.test.ts — synthesised phonemes must land in the human voice range.
 *
 * TMS pitch values are periods in samples, so F0 = 8000 / pitchTable[index]. The chip
 * decodes with the TMC0281/TMS5100 32-entry table; tms5220PhonemeMap.ts originally
 * carried indices written for the TMS5220's 64-entry table. Same 0-63 range, completely
 * different periods: every voiced phoneme came out at 52-71 Hz — below the floor of
 * human speech (~85 Hz) — which is audible as a wrong, unnatural voice rather than as
 * an obvious bug.
 *
 * This asserts the physics, not a preference: whatever the table says must produce an
 * F0 a human voice can actually make.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/** TMC0281 / TMS5100 pitch table — periods in samples. Mirrors TMS5220Synth.cpp. */
const PITCH_TABLE_5100 = [
  0, 41, 43, 45, 47, 49, 51, 53, 55, 58, 60, 63, 66, 70, 73, 76,
  79, 83, 87, 90, 94, 99, 103, 107, 112, 118, 123, 129, 134, 140, 147, 153,
];
const INTERNAL_RATE = 8000;

// Generous bounds: deep male voice to high female/child.
const F0_MIN_HZ = 85;
const F0_MAX_HZ = 300;

function phonemePitchIndices(): Array<{ phoneme: string; pitch: number }> {
  const src = readFileSync(
    join(process.cwd(), 'src/engine/speech/tms5220PhonemeMap.ts'), 'utf8');
  const re = /'([^']+)':\s*\{\s*k:\s*\[[^\]]+\][^}]*?energy:\s*\d+[^}]*?pitch:\s*(\d+)/g;
  const out: Array<{ phoneme: string; pitch: number }> = [];
  for (let m = re.exec(src); m; m = re.exec(src)) {
    out.push({ phoneme: m[1], pitch: Number(m[2]) });
  }
  return out;
}

describe('phoneme pitch indices', () => {
  it('parses the phoneme table', () => {
    expect(phonemePitchIndices().length).toBeGreaterThan(20);
  });

  it('places every voiced phoneme inside the human F0 range', () => {
    const offenders = phonemePitchIndices()
      .filter(p => p.pitch > 0) // 0 = unvoiced, no pitch
      .map(p => ({ ...p, hz: INTERNAL_RATE / PITCH_TABLE_5100[p.pitch] }))
      .filter(p => p.hz < F0_MIN_HZ || p.hz > F0_MAX_HZ)
      .map(p => `${p.phoneme}: index ${p.pitch} = ${p.hz.toFixed(0)} Hz`);

    expect(offenders).toEqual([]);
  });

  it('keeps every index inside the chip table', () => {
    for (const { phoneme, pitch } of phonemePitchIndices()) {
      expect(pitch, `${phoneme} pitch index`).toBeLessThan(PITCH_TABLE_5100.length);
    }
  });
});
