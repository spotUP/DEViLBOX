/**
 * tms5220RomSpeechLevel.test.ts — the shipped Speak & Spell chip must not clip.
 *
 * The TMS5220 bundle in public/mame/ was built from a source state that is not in this
 * repository, and it ran 2x hot: speaking a word from the real snspell VSM ROMs peaked at
 * 1.60 (+4.08 dBFS) instead of 0.80 (-1.94 dBFS). Everything above 1.0 is hard-clipped by
 * the audio graph, which is what made the synth sound harsh and broken — the LPC decode
 * itself was fine (identical non-zero fraction before and after).
 *
 * This drives the shipped bundle exactly as the app does — same .js, same .wasm, same
 * ROMs — and asserts the output stays inside full scale. Rebuilding from
 * mame-wasm/tms5220/TMS5220Synth.cpp makes it pass; the previously shipped binary fails it.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const BUNDLE = join(ROOT, 'public/mame/TMS5220.js');
const ROM0 = join(ROOT, 'public/roms/snspell/tmc0351n2l.vsm');

// Byte address 0 is the start of the first VSM ROM: real Speak & Spell LPC data.
const WORD_ADDR = 0;
const SECONDS = 1.5;

describe('TMS5220 ROM speech — output level', () => {
  it.skipIf(!existsSync(BUNDLE) || !existsSync(ROM0))(
    'speaks a ROM word without exceeding full scale',
    async () => {
      const { renderRomWord } = await import('../../../../tools/tms5220-audit/renderWord');
      const r = await renderRomWord(WORD_ADDR, SECONDS);

      // The chip's own output is int16 / 32768 scaled by a volume of 0.8, so anything
      // at or above 1.0 means a gain stage that should not be there.
      expect(r.peak).toBeLessThanOrEqual(1.0);

      // ...and it must still actually speak: a silent chip would also "not clip".
      expect(r.nonzeroFraction).toBeGreaterThan(0.1);
      expect(r.peak).toBeGreaterThan(0.1);
    },
    120_000,
  );
});
