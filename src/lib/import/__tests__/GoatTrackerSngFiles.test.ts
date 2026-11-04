/**
 * GoatTracker .sng header tests against real songs shipped under
 * public/data/songs/goat-tracker-ultra (GTS5 header: magic, 32-byte name,
 * 32-byte author, copyright, subsong count at offset 100).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { isGoatTrackerSong, getGoatTrackerVersion } from '../formats/GoatTrackerDetect';

const SONG_DIR = join(__dirname, '..', '..', '..', '..', 'public', 'data', 'songs', 'goat-tracker-ultra');

function loadSng(relPath: string): Uint8Array {
  return new Uint8Array(readFileSync(join(SONG_DIR, relPath)));
}

function headerString(data: Uint8Array, start: number): string {
  return new TextDecoder().decode(data.slice(start, start + 32)).replace(/\0+$/, '');
}

const SINGLE = 'Linus/$3childhood-ends.sng';
const TWO_SUBSONGS = '$3jammar-akhbar.sng';
const DUAL_SID = 'JasonPage/RType_Amiga2SID.sng';

describe('GoatTracker .sng real song headers', () => {
  describe('Childhood ends (single SID, Linus)', () => {
    const data = loadSng(SINGLE);

    it('is detected as GoatTracker format', () => {
      expect(isGoatTrackerSong(data)).toBe(true);
    });

    it('is GTS5 format', () => {
      expect(getGoatTrackerVersion(data)).toBe(5);
      expect(String.fromCharCode(data[0], data[1], data[2], data[3])).toBe('GTS5');
    });

    it('contains song and author name', () => {
      expect(headerString(data, 4)).toBe('Childhood ends, you end.');
      expect(headerString(data, 36)).toBe('Linus/MSL');
    });

    it('has 1 subsong', () => {
      expect(data[100]).toBe(1);
    });
  });

  describe('Jammar akhbar (two subsongs)', () => {
    const data = loadSng(TWO_SUBSONGS);

    it('reads the subsong count from the header', () => {
      expect(headerString(data, 4)).toBe('Jammar akhbar');
      expect(data[100]).toBe(2);
    });
  });

  describe('RType Amiga-2-SID (dual SID, Jason Page)', () => {
    const data = loadSng(DUAL_SID);

    it('is detected as GoatTracker GTS5', () => {
      expect(isGoatTrackerSong(data)).toBe(true);
      expect(getGoatTrackerVersion(data)).toBe(5);
    });

    it('contains song and author name', () => {
      expect(headerString(data, 4)).toBe('RType Amiga-2-SID');
      expect(headerString(data, 36)).toBe('Jason Page & Chris Huelsbeck');
    });

    it('has 1 subsong', () => {
      expect(data[100]).toBe(1);
    });

    it('is larger than the single SID song', () => {
      expect(data.length).toBeGreaterThan(loadSng(SINGLE).length);
    });
  });
});
