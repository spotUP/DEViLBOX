import { describe, it, expect } from 'vitest';
import { markKnownSource, isKnownSource } from '../ModlandDetector';

// A song the app fetched from Modland (the Modland browser) or from its own library is never a "rare find":
// the hash database said "no match" for corpus songs (believe.dmu), and the contribution prompt fired.
describe('contribution prompt: files from Modland or the song library', () => {
  it('a marked file is a known source, whatever the case of its name; an unmarked one is not', () => {
    expect(isKnownSource('believe.dmu')).toBe(false);
    markKnownSource('Believe.dmu');
    expect(isKnownSource('believe.dmu')).toBe(true);
    expect(isKnownSource('other.dmu')).toBe(false);
  });
});
