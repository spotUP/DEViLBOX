/**
 * Match typed words against the recordings the VSM actually holds.
 *
 * The hybrid speaker only ever matched single letters, because the word table was guessed
 * and everything past the letters carried an invented name. Now that the ROM directory is
 * read properly, its 117 spelled words carry their real spellings, so a typed COLOR can be
 * the TI recording of COLOR instead of a synthesis from hand-authored coefficients.
 */
import type { VSMWord } from './VSMROMParser';

/** Digits are spelled out in the ROM, so "5" and "FIVE" are the same recording. */
const DIGIT_NAMES = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];

/** Entries whose name is not a word a user can type — "(beep)", "(tones 1)", phrases. */
const SPEAKABLE_NAME = /^[A-Z']+$/;

/** Index every recording whose name is a plain word, first occurrence winning. */
export function buildRomWordIndex(words: VSMWord[]): Map<string, number> {
  const index = new Map<string, number>();
  words.forEach((word, i) => {
    const name = word.name.toUpperCase();
    if (SPEAKABLE_NAME.test(name) && !index.has(name)) index.set(name, i);
  });
  return index;
}

/**
 * Resolve one typed token to a recording index, or -1 when the ROM has no such word.
 * Surrounding punctuation is ignored; the apostrophe is kept because the ROM spells
 * COULDN'T that way.
 */
export function lookupRomWord(index: Map<string, number>, token: string): number {
  const cleaned = token.toUpperCase().replace(/^[^A-Z0-9']+|[^A-Z0-9']+$/g, '');
  if (!cleaned) return -1;

  const direct = index.get(cleaned);
  if (direct !== undefined) return direct;

  if (/^\d$/.test(cleaned)) {
    const spelled = index.get(DIGIT_NAMES[Number(cleaned)]);
    if (spelled !== undefined) return spelled;
  }
  if (cleaned === '10') {
    const ten = index.get('TEN');
    if (ten !== undefined) return ten;
  }
  return -1;
}
