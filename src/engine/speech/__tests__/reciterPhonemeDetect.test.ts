/**
 * reciterPhonemeDetect.test.ts — phoneme notation is marked, never guessed.
 *
 * Two failure modes bracket this rule, and both were live:
 *
 * 1. Running SAM text→phoneme conversion on input that is already phonemes
 *    ("DH* AH N*" converts to garbage like " D AE4STERIHSK AE EH4N ...").
 * 2. Guessing from spelling instead. An English word tiles into phoneme codes
 *    as readily as a phoneme string does, so WAX was read as W* AX — a schwa,
 *    plainly the wrong vowel — along with SIX, MIX, NIX, SAY and OH.
 *
 * Requiring a '*' or a stress digit as the tell does not work either: 2858 of
 * the first 4000 lexicon words convert to output containing neither (SIX ->
 * SIHKS), so most converted text would be converted a second time.
 */
import { describe, it, expect } from 'vitest';
import {
  isPhonemeNotation,
  markPhonemes,
  stripPhonemeMarks,
  textToPhonemes,
  textToTokensSmart,
} from '../Reciter';

describe('isPhonemeNotation', () => {
  it('accepts bracketed phonemes', () => {
    expect(isPhonemeNotation('[SIHKS]')).toBe(true);
    expect(isPhonemeNotation('[HEH4LOW]')).toBe(true);
  });

  it('accepts unbracketed notation carrying a star, which no word has', () => {
    expect(isPhonemeNotation('DH*')).toBe(true);
    expect(isPhonemeNotation('N*')).toBe(true);
  });

  it('rejects plain words that happen to tile as phoneme codes', () => {
    // The bug: each of these was spoken as phonemes instead of as a word.
    for (const word of ['WAX', 'SIX', 'MIX', 'NIX', 'SAY', 'OH']) {
      expect(isPhonemeNotation(word), word).toBe(false);
    }
  });

  it('rejects ordinary words and empty input', () => {
    expect(isPhonemeNotation('MACHINE')).toBe(false);
    expect(isPhonemeNotation('hello')).toBe(false);
    expect(isPhonemeNotation('')).toBe(false);
    expect(isPhonemeNotation('   ')).toBe(false);
    expect(isPhonemeNotation('???')).toBe(false);
  });

  it('round-trips through markPhonemes and stripPhonemeMarks', () => {
    const marked = markPhonemes('SIHKS');
    expect(marked).toBe('[SIHKS]');
    expect(isPhonemeNotation(marked)).toBe(true);
    expect(stripPhonemeMarks(marked)).toBe('SIHKS');
    expect(stripPhonemeMarks('SIX')).toBe('SIX');
  });
});

describe('textToTokensSmart', () => {
  it('speaks a bracketed sequence exactly as written, without re-converting', () => {
    const tokens = textToTokensSmart('[DH* AH N*]');
    expect(tokens?.map(t => t.code)).toEqual(['DH', ' ', 'AH', ' ', 'N*']);
  });

  it('speaks a word that tiles as phonemes as a word', () => {
    // WAX must reach the vowel SAM gives it (AE), not the schwa AX that the old
    // spelling-shaped detection produced by reading the spelling as W* + AX.
    const asWord = textToTokensSmart('WAX')?.map(t => t.code).filter(c => c !== ' ');
    const viaSam = textToPhonemes('WAX');
    expect(viaSam).not.toBe(false);
    const marked = textToTokensSmart(markPhonemes(viaSam as string))
      ?.map(t => t.code).filter(c => c !== ' ');
    expect(asWord).toEqual(marked);
    expect(asWord).toContain('AE');
    expect(asWord).not.toEqual(['W*', 'AX']);
  });

  it('parses plain text through SAM', () => {
    const tokens = textToTokensSmart('is');
    expect(tokens && tokens.length).toBeGreaterThan(0);
  });

  it('mixes literal words with bracketed phonemes', () => {
    const tokens = textToTokensSmart('MACHINE [DH* AH N*]');
    expect(tokens).not.toBeNull();
    expect(tokens!.some(t => t.code === 'DH')).toBe(true);
    expect(tokens!.some(t => t.code !== ' ')).toBe(true);
  });

  it('returns null for empty input', () => {
    expect(textToTokensSmart('')).toBeNull();
    expect(textToTokensSmart('   ')).toBeNull();
  });
});
