import { describe, expect, it } from 'vitest';
import fixture from './fixtures/e6.uprough-song.json';
import { visibleChannelMask } from '@/lib/tracker/visibleChannels';
import { LANES, parseSongFile, songFileToSong, type SongFileDoc } from '../songFile';

describe('an imported Up Rough song shows every lane', () => {
  it('keeps the empty clap lane visible: all 11 lanes are shown', () => {
    const doc = structuredClone(fixture) as unknown as SongFileDoc;
    for (const sec of doc.sections) delete (sec.lanes as Record<string, unknown>).clap;
    const song = songFileToSong(parseSongFile(doc));
    expect(song.patterns.every((p) => p.channels.length === LANES.length)).toBe(true);
    const mask = visibleChannelMask(song.patterns);
    expect(mask).toHaveLength(11);
    expect(mask.every(Boolean)).toBe(true);
  });
});
