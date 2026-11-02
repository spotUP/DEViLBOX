/**
 * New Song wizard search. Typing a format's file extension ("dw") must find it:
 * before the fix the wizard matched only the display name, so "dw" hid the
 * David Whittaker format although the format is registered.
 */
import { describe, it, expect } from 'vitest';
import { listNewSongFormats, newSongFormatMatches } from '@lib/formats/EditableFormatRegistry';
import '@lib/formats/EditableFormatRegistry.builtins';

const search = (q: string) => listNewSongFormats().filter((f) => newSongFormatMatches(f, q)).map((f) => f.formatId);

describe('New Song format search', () => {
  it('finds David Whittaker by its .dw extension and by name', () => {
    expect(search('dw')).toContain('davidWhittaker');
    expect(search('whittaker')).toContain('davidWhittaker');
    expect(search('DW')).toContain('davidWhittaker');
  });

  it('matches every format on an empty query', () => {
    expect(search('  ').length).toBe(listNewSongFormats().length);
  });

  it('does not match an unrelated query', () => {
    expect(search('zzzz-not-a-format')).toEqual([]);
  });
});
