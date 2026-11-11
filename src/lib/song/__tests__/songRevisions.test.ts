import { describe, it, expect } from 'vitest';
import { decideSnapshot, isBlankSong, keysToDrop, newestFirst, songFingerprint, MAX_REPLACED_REVISIONS } from '../songRevisions';

const cell = (over: Record<string, number> = {}) => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, ...over });
const song = (cells = [cell()], instruments: unknown[] = []) =>
  ({ patterns: [{ channels: [{ rows: cells }] }], instruments } as never);

describe('songRevisions', () => {
  it('a song of empty cells with no instruments is blank', () => {
    expect(isBlankSong(song())).toBe(true);
  });
  it('a note, an instrument or a stored module makes it worth keeping', () => {
    expect(isBlankSong(song([cell({ note: 49 })]))).toBe(false);
    expect(isBlankSong(song([cell()], [{ id: 1 }]))).toBe(false);
    expect(isBlankSong({ ...(song() as object), originalModuleData: { base64: 'x', format: 'mod' } } as never)).toBe(false);
  });
  it('skips blank, skips a repeat of the newest revision, saves otherwise', () => {
    const s = song([cell({ note: 49 })]);
    const fp = songFingerprint(s);
    expect(decideSnapshot(song(), songFingerprint(song()), undefined)).toBe('blank');
    expect(decideSnapshot(s, fp, fp)).toBe('identical');
    expect(decideSnapshot(s, fp, 'other')).toBe('save');
    expect(decideSnapshot(s, fp, undefined)).toBe('save');
  });
  it('the fingerprint differs when a cell differs', () => {
    expect(songFingerprint(song([cell({ note: 49 })]))).not.toBe(songFingerprint(song([cell({ note: 50 })])));
  });
  it('keeps the newest 20 and drops the oldest', () => {
    const keys = Array.from({ length: 23 }, (_, i) => i + 1);
    expect(keysToDrop(keys)).toEqual([1, 2, 3]);
    expect(keysToDrop(keys.slice(0, MAX_REPLACED_REVISIONS))).toEqual([]);
  });
  it('lists newest first', () => {
    const rows = [{ savedAt: '2026-01-01T00:00:00Z' }, { savedAt: '2026-03-01T00:00:00Z' }, { savedAt: '2026-02-01T00:00:00Z' }];
    expect(newestFirst(rows).map((r) => r.savedAt[6])).toEqual(['3', '2', '1']);
  });
});
