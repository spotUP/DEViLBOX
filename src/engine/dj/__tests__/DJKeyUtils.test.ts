import { describe, it, expect } from 'vitest';
import {
  toCamelot,
  camelotDisplay,
  keyCompatibility,
  camelotToKeyName,
  buildCamelotWheel,
} from '../DJKeyUtils';

describe('DJKeyUtils — Camelot core (regression lock)', () => {
  it('maps standard key names to Camelot notation', () => {
    expect(camelotDisplay('C major')).toBe('8B');
    expect(camelotDisplay('A minor')).toBe('8A');
    expect(camelotDisplay('G major')).toBe('9B');
  });

  it('parses shorthand key names (Am, C#m, Cmaj)', () => {
    expect(toCamelot('Am')?.display).toBe('8A');
    expect(toCamelot('C#m')?.display).toBe('12A');
    expect(toCamelot('Cmaj')?.display).toBe('8B');
  });

  it('classifies harmonic-mix relations around 8B', () => {
    expect(keyCompatibility('C major', 'C major')).toBe('perfect');    // 8B → 8B
    expect(keyCompatibility('C major', 'G major')).toBe('energy-boost'); // 8B → 9B
    expect(keyCompatibility('C major', 'F major')).toBe('energy-drop');  // 8B → 7B
    expect(keyCompatibility('C major', 'A minor')).toBe('mood-change');  // 8B → 8A
    expect(keyCompatibility('C major', 'Db major')).toBe('clash');       // 8B → 3B
  });
});

describe('DJKeyUtils — buildCamelotWheel', () => {
  it('produces all 24 segments in ring order (B ring first, then A ring)', () => {
    const w = buildCamelotWheel('C major', []);
    expect(w).toHaveLength(24);
    expect(w[0].display).toBe('1B');
    expect(w[11].display).toBe('12B');
    expect(w[12].display).toBe('1A');
    expect(w[23].display).toBe('12A');
  });

  it('tags each segment with its relation to the focus key', () => {
    const w = buildCamelotWheel('C major', []);
    const rel = (d: string) => w.find((s) => s.display === d)!.relation;
    expect(rel('8B')).toBe('perfect');
    expect(rel('9B')).toBe('energy-boost');
    expect(rel('7B')).toBe('energy-drop');
    expect(rel('8A')).toBe('mood-change');
    expect(rel('3B')).toBe('clash');
  });

  it('places deck markers on the segment matching each deck key', () => {
    const w = buildCamelotWheel('C major', [
      { deckId: 'A', key: 'C major' }, // 8B
      { deckId: 'B', key: 'G major' }, // 9B
    ]);
    expect(w.find((s) => s.display === '8B')!.decks).toEqual(['A']);
    expect(w.find((s) => s.display === '9B')!.decks).toEqual(['B']);
    expect(w.find((s) => s.display === '10B')!.decks).toEqual([]);
  });

  it('accepts shorthand and Camelot-notation deck keys', () => {
    const w = buildCamelotWheel('8B', [
      { deckId: 'A', key: '8B' },
      { deckId: 'B', key: 'Am' }, // 8A
    ]);
    expect(w.find((s) => s.display === '8B')!.decks).toEqual(['A']);
    expect(w.find((s) => s.display === '8A')!.decks).toEqual(['B']);
  });

  it('marks every segment as clash when there is no valid focus key', () => {
    const w = buildCamelotWheel(null, [{ deckId: 'A', key: 'C major' }]);
    expect(w.every((s) => s.relation === 'clash')).toBe(true);
    // deck markers still land regardless of focus
    expect(w.find((s) => s.display === '8B')!.decks).toEqual(['A']);
  });

  it('round-trips Camelot display back to a key name', () => {
    expect(camelotToKeyName('8B')).toBe('C major');
    expect(camelotToKeyName('8A')).toBe('A minor');
  });
});
