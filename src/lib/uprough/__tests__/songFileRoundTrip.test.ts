import { describe, expect, it } from 'vitest';
import fixture from './fixtures/e6.uprough-song.json';
import { parseSongFile, songFileToSong, songToSongFile, type SongFileDoc } from '../songFile';

const load = (): SongFileDoc => structuredClone(fixture) as unknown as SongFileDoc;

describe('song file round trip', () => {
  it('e6 sample: export(import(f)) deep-equals f', () => {
    const f = load();
    const song = songFileToSong(parseSongFile(structuredClone(f)));
    expect(song.patterns).toHaveLength(6);
    expect(song.patterns[0]!.channels.find((c) => c.id === 'kick')!.rows[0]!.note).toBeGreaterThan(0);
    expect(songToSongFile(song)).toEqual(f);
  });

  it('mutated copy (edited cells, extra lane, empty lane) round trips', () => {
    const f = load();
    const sec = f.sections[1]!;
    sec.lanes.perc2 = Array.from({ length: (sec.header.bars as number) * 16 }, (_, r) => (r === 4 ? ['C-4', 6, 40, null] : null));
    sec.bars[0]!.order.push('perc2:4');
    const song = songFileToSong(parseSongFile(structuredClone(f)));
    expect(songToSongFile(song)).toEqual(f);
  });
});
