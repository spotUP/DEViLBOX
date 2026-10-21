import { describe, expect, it } from 'vitest';
import fixture from './fixtures/dancehall_classic_seed1.uprough-song.json';
import { LANE_LABEL, dancehallInstrumentName, parseSongFile, songFileToSong, songToSongFile, type SongFileDoc } from '../songFile';
import { moveBlock } from '../songEdits';

const load = (): SongFileDoc => structuredClone(fixture) as unknown as SongFileDoc;
const open = () => songFileToSong(parseSongFile(load()));

describe('dancehall song file (D4d)', () => {
  it('names each dancehall keys instrument once, with no doubled word', () => {
    const names = load().instruments.map((i) => dancehallInstrumentName(i.voice));
    expect(new Set(names).size).toBe(names.length);
    expect(names.filter((n) => /\b(\w+) \1\b/i.test(n))).toEqual([]);
    expect(dancehallInstrumentName('dh:keys:dancehall_90s_chord_stab:stab')).toBe('Keys 90s Chord Stab (Stab Articulation)');
    expect(dancehallInstrumentName('dh:keys:dancehall_90s_hollow_keys:normal')).toBe('Keys 90s Hollow Keys');
  });
  it('imports the dancehall lanes with full-word names and exports the unedited file unchanged', () => {
    const f = load();
    const song = open();
    expect(song.patterns).toHaveLength(f.sections.length);
    const kick = song.patterns[0]!.channels.find((c) => c.id === 'kick')!;
    expect(kick.name).toBe(LANE_LABEL.kick);
    expect(kick.rows[0]!.note).toBeGreaterThan(0);
    expect(song.instruments.map((i) => i.name).every((n) => !n.startsWith('dh:'))).toBe(true);
    expect(JSON.stringify(songToSongFile(song))).toBe(JSON.stringify(f));
  });

  it('moving one kick cell one row changes only that cell and its order key, and drops its side entry', () => {
    const f = load();
    const sec = f.sections[0]!;
    expect(sec.lanes.kick![8]).not.toBeNull();
    expect(sec.lanes.kick![9]).toBeNull();
    const edited = songToSongFile(moveBlock(open(), 0, 'kick', 8, 1, 9));
    const out = edited.sections[0]!;
    expect(out.lanes.kick![8]).toBeNull();
    expect(out.lanes.kick![9]).toEqual(sec.lanes.kick![8]);
    expect(edited.side[sec.id]!['kick:8']).toBeUndefined();
    expect(edited.side[sec.id]!['kick:9']).toBeUndefined();
    expect(out.dancehall!.order).toContain('kick:9');
    expect(out.dancehall!.order).not.toContain('kick:8');
    // Everything else is the original.
    const restore = structuredClone(edited);
    restore.sections[0]!.lanes.kick = sec.lanes.kick;
    restore.sections[0]!.dancehall = sec.dancehall;
    restore.side[sec.id]!['kick:8'] = f.side[sec.id]!['kick:8']!;
    expect(restore).toEqual(f);
  });
});
