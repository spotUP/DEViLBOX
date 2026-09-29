/**
 * savedSongToApply reads every saved-song shape into one song.
 *
 * The Export dialog's import read a legacy nested automation format
 * ({ [pattern]: { [channel]: { [param]: curve } } }) that no other loader
 * knew; it moved into the one parser when that import went through applySong
 * (2026-09-29).
 */
import { describe, it, expect } from 'vitest';
import { savedSongToApply } from '../savedSong';

const base = { metadata: { name: 'x' } as never, bpm: 120, patterns: [{ id: 'a', name: 'A', length: 64, channels: [] }] as never, instruments: [] };

describe('savedSongToApply', () => {
  it('reads the flat curve array (SongExport.automationCurves)', () => {
    const curve = { id: 'c1', parameter: 'volume' } as never;
    expect(savedSongToApply({ ...base, automationCurves: [curve] }).extras?.automation).toEqual([curve]);
  });

  it('reads the legacy nested automation object', () => {
    const c1 = { id: 'c1' } as never, c2 = { id: 'c2' } as never;
    const song = savedSongToApply({ ...base, automation: { a: { 0: { volume: c1 }, 1: { pan: c2 } } } });
    expect(song.extras?.automation).toEqual([c1, c2]);
  });

  it('turns an old id sequence into a playback order', () => {
    const song = savedSongToApply({ ...base, patterns: [{ id: 'a', channels: [] }, { id: 'b', channels: [] }] as never, sequence: ['b', 'a', 'b'] });
    expect(song.order).toEqual([1, 0, 1]);
  });

  it('keeps originalModuleData only when it carries bytes', () => {
    expect(savedSongToApply({ ...base, originalModuleData: { base64: '', format: 'MOD' } }).originalModuleData).toBeNull();
    expect(savedSongToApply({ ...base, originalModuleData: { base64: 'AAA=', format: 'MOD' } }).originalModuleData).not.toBeNull();
  });
});
