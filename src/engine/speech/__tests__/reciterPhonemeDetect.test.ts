/**
 * reciterPhonemeDetect.test.ts — phoneme-string detection + smart tokenizing.
 * Guards the speak path against running SAM text→phoneme conversion on input
 * that is already phonemes ("DH* AH N*" was converting to garbage like
 * " D AE4STERIHSK AE EH4N AE4STERIHSK").
 */
import { describe, it, expect } from 'vitest';
import { looksLikePhonemeString, textToTokensSmart } from '../Reciter';

describe('looksLikePhonemeString', () => {
  it('accepts a plain phoneme string', () => {
    expect(looksLikePhonemeString('DH* AH N*')).toBe(true);
  });

  it('accepts phonemes with stress digits', () => {
    expect(looksLikePhonemeString('/HEH4LOW')).toBe(true);
  });

  it('rejects plain words', () => {
    expect(looksLikePhonemeString('hello world')).toBe(false);
    expect(looksLikePhonemeString('MACHINE')).toBe(false);
  });

  it('rejects mixed word+phoneme strings (routes as text)', () => {
    expect(looksLikePhonemeString('MACHINE DH* AH N*')).toBe(false);
  });

  it('rejects empty and punctuation-only strings', () => {
    expect(looksLikePhonemeString('')).toBe(false);
    expect(looksLikePhonemeString('   ')).toBe(false);
    expect(looksLikePhonemeString('???')).toBe(false);
  });
});

describe('textToTokensSmart', () => {
  it('parses a pure phoneme string without running SAM', () => {
    const tokens = textToTokensSmart('DH* AH N*');
    expect(tokens?.map(t => t.code)).toEqual(['DH', ' ', 'AH', ' ', 'N*']);
  });

  it('parses plain text through SAM', () => {
    const tokens = textToTokensSmart('is');
    expect(tokens && tokens.length).toBeGreaterThan(0);
  });

  it('mixes kept words with phoneme tokens', () => {
    const tokens = textToTokensSmart('MACHINE DH* AH N*');
    expect(tokens).not.toBeNull();
    // MACHINE runs through SAM, the phoneme part parses directly.
    expect(tokens!.some(t => t.code !== ' ')).toBe(true);
  });

  it('returns null for empty input', () => {
    expect(textToTokensSmart('')).toBeNull();
    expect(textToTokensSmart('   ')).toBeNull();
  });
});