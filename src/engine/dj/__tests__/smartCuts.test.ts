/**
 * smartCuts tests — detectDrumBreakTail decides whether Auto DJ should
 * cut instead of crossfade. Uses fixture patterns constructed with known
 * channel roles so we can verify the heuristic without pulling in real songs.
 */

import { describe, it, expect } from 'vitest';
import { detectDrumBreakTail } from '../smartCuts';
import type { Pattern, ChannelData, TrackerCell } from '@/types/tracker';

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function noteCell(note: number): TrackerCell {
  return { note, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

/** Build a channel with a specific name (used for percussion classification) and
 *  a list of row → note mappings. Empty rows default to no note. */
function makeChannel(name: string, length: number, notes: Record<number, number>): ChannelData {
  const rows: TrackerCell[] = Array.from({ length }, () => emptyCell());
  for (const [rowStr, note] of Object.entries(notes)) {
    const row = parseInt(rowStr, 10);
    if (row >= 0 && row < length) rows[row] = noteCell(note);
  }
  return {
    id: name,
    name,
    rows,
    muted: false,
    solo: false,
    collapsed: false,
    volume: 100,
    pan: 0,
    instrumentId: 1,
    color: null,
  };
}

function makePattern(channels: ChannelData[]): Pattern {
  return {
    id: 'p0',
    name: 'test',
    length: channels[0]?.rows.length ?? 64,
    channels,
  };
}

describe('detectDrumBreakTail', () => {
  it('returns false for null/undefined/empty song', () => {
    expect(detectDrumBreakTail({ song: null })).toBe(false);
    expect(detectDrumBreakTail({ song: undefined })).toBe(false);
    expect(detectDrumBreakTail({ song: { patterns: [] } })).toBe(false);
  });

  it('returns false when pattern has < 16 rows', () => {
    const drum = makeChannel('drums', 8, { 0: 24, 2: 24, 4: 24, 6: 24 });
    const pattern = makePattern([drum]);
    expect(detectDrumBreakTail({ song: { patterns: [pattern] } })).toBe(false);
  });

  it('returns false when no percussion channel exists', () => {
    // Only bass + lead with distinct patterns classify cleanly.
    // Bass: low octave (C-2, D-2), <= 4 unique, <= 7 semitone interval
    const bass = makeChannel('bass', 64, { 0: 13, 4: 15, 8: 13, 12: 15 });   // C-1, D-1
    // Lead: high octave
    const lead = makeChannel('lead', 64, { 0: 61, 4: 63, 8: 65, 12: 67 });   // C-5, D-5...
    const pattern = makePattern([bass, lead]);
    expect(detectDrumBreakTail({ song: { patterns: [pattern] } })).toBe(false);
  });

  it('returns true for percussion-dominated tail', () => {
    // Percussion: channel NAME contains "drum" → classified as percussion.
    // Dense hits in last 8 rows (rows 56–63).
    const drums = makeChannel('drums', 64, {
      0: 24, 4: 24, 8: 24, 12: 24,    // intro
      56: 24, 57: 24, 58: 24, 59: 24, // tail — dense perc
      60: 24, 61: 24, 62: 24, 63: 24,
    });
    // Bass: silent in tail
    const bass = makeChannel('bass', 64, { 0: 13, 4: 15 });
    const pattern = makePattern([drums, bass]);
    expect(detectDrumBreakTail({ song: { patterns: [pattern] } })).toBe(true);
  });

  it('returns false when non-perc channels are active in the tail', () => {
    const drums = makeChannel('drums', 64, {
      56: 24, 57: 24, 58: 24, 59: 24,
    });
    // Bass plays under the drums in the tail → not a pure break
    const bass = makeChannel('bass', 64, {
      56: 13, 57: 13, 58: 13, 59: 13,
      60: 13, 61: 13, 62: 13, 63: 13,
    });
    const pattern = makePattern([drums, bass]);
    expect(detectDrumBreakTail({ song: { patterns: [pattern] } })).toBe(false);
  });

  it('uses the final pattern when patternIndex unspecified', () => {
    // First pattern: no break. Last pattern: break.
    const boringDrums = makeChannel('drums', 64, { 0: 24, 4: 24, 8: 24 });
    const boringBass = makeChannel('bass', 64, { 0: 13, 4: 13, 8: 13, 12: 13, 16: 13, 20: 13 });
    const boring = makePattern([boringDrums, boringBass]);

    const breakDrums = makeChannel('drums', 64, {
      56: 24, 57: 24, 58: 24, 59: 24,
      60: 24, 61: 24, 62: 24, 63: 24,
    });
    const breakBass = makeChannel('bass', 64, { 0: 13, 8: 13 });
    const breakPattern = makePattern([breakDrums, breakBass]);

    expect(detectDrumBreakTail({ song: { patterns: [boring, breakPattern] } })).toBe(true);
    // Explicit index override also works
    expect(detectDrumBreakTail({ song: { patterns: [boring, breakPattern] }, patternIndex: 0 })).toBe(false);
  });
});
