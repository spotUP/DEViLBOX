/**
 * A song whose first pattern is a silent intro is not an empty song. The
 * smoke test asked get_pattern_stats about pattern 0 only and failed the
 * Digital Symphony song drwho_final4.dsym, whose notes start in pattern 1
 * (2026-10-05).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { parseDigitalSymphonyFile } from '@/lib/import/formats/DigitalSymphonyParser';
import { noteCellsPerPattern } from '@/lib/tracker/patternNoteCells';

describe('get_pattern_stats wholeSong', () => {
  it('finds the notes of a song that opens with an empty pattern', () => {
    const bytes = new Uint8Array(readFileSync('public/data/songs/formats/drwho_final4.dsym'));
    const song = parseDigitalSymphonyFile(bytes, 'drwho_final4.dsym');
    expect(song).not.toBeNull();
    const counts = noteCellsPerPattern(song!.patterns);
    expect(counts[0]).toBe(0);
    expect(counts.reduce((a, b) => a + b, 0)).toBeGreaterThan(300);
    expect(counts.findIndex((n) => n > 0)).toBe(1);
  });

  it('counts nothing in a song of empty patterns, and ignores note-offs', () => {
    const empty = { channels: [{ rows: [{ note: 0 }, { note: 97 }, undefined] }] };
    expect(noteCellsPerPattern([empty, empty])).toEqual([0, 0]);
  });
});
