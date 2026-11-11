import { describe, it, expect } from 'vitest';
import { filterSettingsEntries, matchesSettingsQuery, SETTINGS_SEARCH_INDEX, type SettingsSearchEntry } from '../settingsSearch';

const entries: SettingsSearchEntry[] = [
  { id: 'a', tab: 'audio', section: 'Engine', keywords: ['BLEP Synthesis', 'Startup Jingle'] },
  { id: 'b', tab: 'visual', section: 'VU Meters', keywords: ['Swing Animation'] },
];

describe('settingsSearch', () => {
  it('matches a row label', () => {
    expect(filterSettingsEntries(entries, 'jingle').map((e) => e.id)).toEqual(['a']);
  });
  it('matches a section name', () => {
    expect(filterSettingsEntries(entries, 'meters').map((e) => e.id)).toEqual(['b']);
  });
  it('is case-insensitive', () => {
    expect(matchesSettingsQuery('BLEP', ['blep synthesis'])).toBe(true);
    expect(matchesSettingsQuery('blep', ['BLEP Synthesis'])).toBe(true);
  });
  it('returns everything for an empty or blank query', () => {
    expect(filterSettingsEntries(entries, '')).toHaveLength(2);
    expect(filterSettingsEntries(entries, '   ')).toHaveLength(2);
  });
  it('returns nothing when no text matches', () => {
    expect(filterSettingsEntries(entries, 'zzzz')).toEqual([]);
  });
  it('has unique ids in the real index', () => {
    const ids = SETTINGS_SEARCH_INDEX.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
