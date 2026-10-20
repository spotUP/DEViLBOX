import { describe, expect, it } from 'vitest';
import { SONG_FILE_ACCEPT, SONG_FILE_EXTENSION } from '../songFile';

// The macOS file picker matches only the last extension segment: an accept list holding only
// '.uprough-song.json' greys every song file out and Import Up Rough Song does nothing.
describe('SONG_FILE_ACCEPT', () => {
  it('offers a single-segment extension that matches a song file name', () => {
    const tokens = SONG_FILE_ACCEPT.split(',');
    const fileName = `e6${SONG_FILE_EXTENSION}`;
    const lastSegment = fileName.slice(fileName.lastIndexOf('.'));
    expect(tokens).toContain(lastSegment);
    expect(tokens).toContain(SONG_FILE_EXTENSION);
  });
});
