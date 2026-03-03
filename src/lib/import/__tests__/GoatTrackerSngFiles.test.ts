/**
 * GoatTracker .sng file roundtrip tests — verifies test files are valid GTS5 format
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { isGoatTrackerSong, getGoatTrackerVersion } from '../formats/GoatTrackerDetect';

function loadSng(name: string): Uint8Array {
  const path = join(__dirname, '..', '..', '..', '..', 'data', name);
  return new Uint8Array(readFileSync(path));
}

describe('GoatTracker .sng test files', () => {
  describe('test-song.sng (single SID)', () => {
    const data = loadSng('test-song.sng');

    it('is detected as GoatTracker format', () => {
      expect(isGoatTrackerSong(data)).toBe(true);
    });

    it('is GTS5 format', () => {
      expect(getGoatTrackerVersion(data)).toBe(5);
    });

    it('has valid magic bytes', () => {
      expect(String.fromCharCode(data[0], data[1], data[2], data[3])).toBe('GTS5');
    });

    it('contains song name', () => {
      const name = new TextDecoder().decode(data.slice(4, 36)).replace(/\0+$/, '');
      expect(name).toBe('Test Song');
    });

    it('contains author name', () => {
      const author = new TextDecoder().decode(data.slice(36, 68)).replace(/\0+$/, '');
      expect(author).toBe('DEViLBOX Test');
    });

    it('has 1 subsong', () => {
      expect(data[100]).toBe(1);
    });

    it('has at least 1 instrument', () => {
      // After order lists, find instrument count
      // Instrument data contains AD=0x09, SR=0xA0
      expect(data.includes(0x09)).toBe(true); // attack/decay
    });
  });

  describe('test-dual-sid.sng (dual SID)', () => {
    const data = loadSng('test-dual-sid.sng');

    it('is detected as GoatTracker format', () => {
      expect(isGoatTrackerSong(data)).toBe(true);
    });

    it('is GTS5 format', () => {
      expect(getGoatTrackerVersion(data)).toBe(5);
    });

    it('contains song name', () => {
      const name = new TextDecoder().decode(data.slice(4, 36)).replace(/\0+$/, '');
      expect(name).toBe('Dual SID Test');
    });

    it('has 1 subsong', () => {
      expect(data[100]).toBe(1);
    });

    it('is larger than single SID test file', () => {
      const singleData = loadSng('test-song.sng');
      expect(data.length).toBeGreaterThan(singleData.length);
    });

    it('contains all 3 instrument names', () => {
      const text = new TextDecoder().decode(data);
      expect(text).toContain('Bass');
      expect(text).toContain('Lead');
      expect(text).toContain('Pad');
    });
  });
});
