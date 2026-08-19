/**
 * romWordLookup.test.ts — typed words must reach the ROM recordings that exist.
 *
 * The hybrid speaker matched single letters only, a leftover from the era when every
 * vocabulary entry past the letters carried a guessed name. Typing COLOR therefore
 * synthesised it from hand-authored coefficients while the TI recording of COLOR sat in
 * the ROM unused, and "the ones I type sound bad" is what that produces.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { buildRomWordIndex, lookupRomWord } from '../romWordLookup';
import { parseVSMDirectory } from '../VSMROMParser';

const ROMS = join(process.cwd(), 'public/roms/snspell');
const VSM0 = join(ROMS, 'tmc0351n2l.vsm');
const VSM1 = join(ROMS, 'tmc0352n2l.vsm');
const present = [VSM0, VSM1].every(existsSync);

function romIndex() {
  const rom = new Uint8Array(Buffer.concat([readFileSync(VSM0), readFileSync(VSM1)]));
  const words = parseVSMDirectory(rom);
  return { words, index: buildRomWordIndex(words) };
}

describe('ROM word lookup', () => {
  it.skipIf(!present)('finds spelled vocabulary words, not just letters', () => {
    const { words, index } = romIndex();
    for (const typed of ['color', 'Mother', 'QUESTION', 'rhythm']) {
      const hit = lookupRomWord(index, typed);
      expect(hit).toBeGreaterThanOrEqual(0);
      expect(words[hit].name).toBe(typed.toUpperCase());
    }
  });

  it.skipIf(!present)('still finds single letters', () => {
    const { words, index } = romIndex();
    expect(words[lookupRomWord(index, 'a')].name).toBe('A');
    expect(words[lookupRomWord(index, 'Z')].name).toBe('Z');
  });

  it.skipIf(!present)('ignores surrounding punctuation but keeps the ROM apostrophe', () => {
    const { words, index } = romIndex();
    expect(words[lookupRomWord(index, 'color,')].name).toBe('COLOR');
    expect(words[lookupRomWord(index, '"mother"')].name).toBe('MOTHER');
    expect(words[lookupRomWord(index, "couldn't")].name).toBe("COULDN'T");
  });

  it.skipIf(!present)('speaks digits through their spelled recordings', () => {
    const { words, index } = romIndex();
    expect(words[lookupRomWord(index, '5')].name).toBe('FIVE');
    expect(words[lookupRomWord(index, '0')].name).toBe('ZERO');
    expect(words[lookupRomWord(index, '10')].name).toBe('TEN');
  });

  it.skipIf(!present)('reports a miss for words the ROM does not hold', () => {
    const { index } = romIndex();
    expect(lookupRomWord(index, 'synthesiser')).toBe(-1);
    expect(lookupRomWord(index, '')).toBe(-1);
  });

  it.skipIf(!present)('never indexes an entry that is not a typeable word', () => {
    const { index } = romIndex();
    for (const name of ['(beep)', '(tones 1)', '"that is correct"']) {
      expect(index.has(name.toUpperCase())).toBe(false);
    }
  });
});
