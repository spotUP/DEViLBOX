/**
 * Guards the generated TMS5220 lexicon TSV (public/data/tms5220-lexicon.tsv):
 * every entry is constructible from the ROM-mined phoneme library, tiers are
 * consistent, and the key substitution words are present. Regenerate via
 * tools/tms5220-audit/buildLexicon.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

interface LexiconEntry {
  word: string;
  phonemes: string;
  tier: number;
  rom: boolean;
}

function loadLexicon(): LexiconEntry[] {
  const tsv = readFileSync(join(__dirname, '../../../public/data/tms5220-lexicon.tsv'), 'utf8');
  return tsv.split('\n').filter(Boolean).map((line) => {
    const [word, phonemes, tier, rom] = line.split('\t');
    return { word, phonemes, tier: Number(tier), rom: rom === '1' };
  });
}

describe('TMS5220 lexicon', () => {
  it('is a non-empty, well-formed word database', () => {
    const entries = loadLexicon();
    expect(entries.length).toBeGreaterThan(100000);
    for (const e of entries) {
      expect(e.word).toMatch(/^[A-Z]{1,14}$/);
      expect(e.phonemes.length).toBeGreaterThan(0);
      expect([0, 1, 2, 3]).toContain(e.tier);
      expect(typeof e.rom).toBe('boolean');
    }
  }, 30000);

  it('contains the substitution words at authentic quality', () => {
    const entries = loadLexicon();
    for (const target of ['ROUGH', 'COUGH', 'BOUGH', 'DOUGH', 'SOUGH']) {
      const e = entries.find((x) => x.word === target);
      expect(e, `${target} missing`).toBeDefined();
      expect(e!.tier, `${target} quality`).toBe(0);
      expect(e!.phonemes, `${target} phonemes`).toMatch(/ AH F\*$/);
    }
  });

  it('marks ROM built-in words and keeps them at tier 0', () => {
    const entries = loadLexicon();
    for (const w of ['MOTHER', 'TOUGH', 'COLOR', 'ONE', 'TWO', 'MACHINE']) {
      const e = entries.find((x) => x.word === w);
      expect(e, `${w} missing`).toBeDefined();
      expect(e!.rom, `${w} rom flag`).toBe(true);
      expect(e!.tier, `${w} tier`).toBe(0);
    }
  });

  it('contains the common English words at constructible quality', () => {
    const entries = loadLexicon();
    const common = 'THE AND A OF TO IN IS YOU THAT IT HE WAS FOR ON ARE AS WITH HIS THEY AT BE THIS HAVE FROM OR ONE HAD BY WORD BUT NOT WHAT ALL WERE WE WHEN YOUR CAN SAID THERE USE AN EACH WHICH SHE DO HOW THEIR IF WILL UP OTHER ABOUT OUT MANY THEN THEM THESE SO SOME HER WOULD MAKE LIKE HIM INTO TIME HAS LOOK TWO MORE WRITE GO SEE NUMBER NO WAY COULD PEOPLE MY THAN FIRST WATER BEEN CALL WHO OIL ITS NOW FIND LONG DOWN DAY DID GET COME MADE MAY PART'.split(' ');
    for (const w of common) {
      const e = entries.find((x) => x.word === w);
      expect(e, `${w} missing`).toBeDefined();
      expect(e!.tier, `${w} quality`).toBeLessThan(3);
      expect(e!.phonemes.length, `${w} phonemes`).toBeGreaterThan(0);
    }
  });

  it('does not silently fall back to the static table', () => {
    const entries = loadLexicon();
    expect(entries.every((e) => e.tier < 3)).toBe(true);
  });

  it('is sorted: ROM built-ins first, then by tier, then by length', () => {
    const entries = loadLexicon();
    const key = (e: LexiconEntry) => [e.rom ? 0 : 1, e.tier, e.word.length];
    for (let i = 1; i < entries.length; i++) {
      const a = key(entries[i - 1]);
      const b = key(entries[i]);
      expect(a[0] <= b[0] && (a[0] !== b[0] || a[1] <= b[1]) && (a[0] !== b[0] || a[1] !== b[1] || a[2] <= b[2])).toBe(true);
    }
  });
});