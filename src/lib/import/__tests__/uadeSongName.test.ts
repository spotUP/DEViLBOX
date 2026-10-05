/**
 * The song tab showed the format token instead of the song: a Forgotten
 * Worlds song read "fw" because the router hands UADE the prefix form
 * (theend.fw -> fw.theend) and the parser cut the last extension off that
 * (2026-10-05).
 */
import { describe, it, expect } from 'vitest';
import { uadeSongName } from '../formats/UADEParser';

describe('uadeSongName', () => {
  it('names a prefix-form song after the song, not the format', () => {
    expect(uadeSongName('fw.forgotten worlds theend')).toBe('forgotten worlds theend');
    expect(uadeSongName('cus.skyfox2')).toBe('skyfox2');
    expect(uadeSongName('mod_comp.packed tune')).toBe('packed tune');
    expect(uadeSongName('songs/x/cust.paranoimia')).toBe('paranoimia');
  });

  it('still cuts the extension off an extension-form song', () => {
    expect(uadeSongName('forgotten worlds theend.fw')).toBe('forgotten worlds theend');
    expect(uadeSongName('skyfox2.cus')).toBe('skyfox2');
  });

  it('keeps a song whose own name is a format token', () => {
    expect(uadeSongName('fred.mod')).toBe('fred');
    expect(uadeSongName('hot.fw')).toBe('hot');
  });
});
