import { describe, it, expect } from 'vitest';
import { songPositionAtMs, type TimedSong } from '../timeToPosition';
import type { TrackerCell } from '@/types/tracker';

const empty = { effTyp: 0, eff: 0 } as unknown as TrackerCell;
const cell = (effTyp: number, eff: number) => ({ effTyp, eff }) as unknown as TrackerCell;

function pattern(len: number, fx: Record<number, TrackerCell>) {
  const rows = Array.from({ length: len }, (_, r) => fx[r] ?? empty);
  return { id: 'p', name: 'p', length: len, channels: [{ rows }] };
}

// Speed 6 at 125 BPM = 120 ms per row. Row 2 sets speed 3 (60 ms per row from row 2 on). Order 1 holds a second pattern.
const song = {
  initialSpeed: 6,
  initialBPM: 125,
  songLength: 2,
  songPositions: [0, 1],
  patterns: [pattern(8, { 2: cell(0xF, 3) }), pattern(8, {})],
} as unknown as TimedSong;

describe('songPositionAtMs', () => {
  it('walks speed changes: rows 0,1 take 120 ms, row 2 onward 60 ms', () => {
    expect(songPositionAtMs(song, 0)).toEqual({ songPos: 0, pattPos: 0 });
    expect(songPositionAtMs(song, 239)).toEqual({ songPos: 0, pattPos: 1 });
    expect(songPositionAtMs(song, 240)).toEqual({ songPos: 0, pattPos: 2 });
    expect(songPositionAtMs(song, 300)).toEqual({ songPos: 0, pattPos: 3 });
    // 240 + 6 rows * 60 = 600 ms ends order 0; order 1 row 0 starts at 600.
    expect(songPositionAtMs(song, 600)).toEqual({ songPos: 1, pattPos: 0 });
  });

  it('applies a tempo change (F96 = 150 BPM) to later rows', () => {
    const t = { ...song, patterns: [pattern(8, { 1: cell(0xF, 150) }), pattern(8, {})] } as unknown as TimedSong;
    // Row 0: 120 ms; from row 1 at 150 BPM, speed 6: 100 ms per row. 120 + 3 * 100 = 420 ms is row 4.
    expect(songPositionAtMs(t, 420)).toEqual({ songPos: 0, pattPos: 4 });
  });

  it('holds the last row reached when the time is past the song end', () => {
    expect(songPositionAtMs(song, 10_000_000)).toEqual({ songPos: 1, pattPos: 7 });
  });

  // 120 ms per row. E60 at row 1, E62 at row 3: rows 0-3, then two more passes over 1-3, then row 4.
  it('honours E6x pattern loops (loop start row, loop count)', () => {
    const t = { ...song, patterns: [pattern(8, { 1: cell(0xE, 0x60), 3: cell(0xE, 0x62) }), pattern(8, {})] } as unknown as TimedSong;
    expect(songPositionAtMs(t, 3 * 120)).toEqual({ songPos: 0, pattPos: 3 });
    expect(songPositionAtMs(t, 4 * 120)).toEqual({ songPos: 0, pattPos: 1 });
    expect(songPositionAtMs(t, 9 * 120)).toEqual({ songPos: 0, pattPos: 3 });
    expect(songPositionAtMs(t, 10 * 120)).toEqual({ songPos: 0, pattPos: 4 });
  });

  // XM: EE2 at row 1 holds the row for 2 row-times in total (replayer: pattDelTime 2 gives one repeat).
  it('honours EEx pattern delay on XM songs and ignores it for MOD', () => {
    const t = { ...song, patterns: [pattern(8, { 1: cell(0xE, 0xE2) }), pattern(8, {})] } as unknown as TimedSong;
    expect(songPositionAtMs(t, 3 * 120 - 1, true)).toEqual({ songPos: 0, pattPos: 1 });
    expect(songPositionAtMs(t, 3 * 120, true)).toEqual({ songPos: 0, pattPos: 2 });
    expect(songPositionAtMs(t, 3 * 120, false)).toEqual({ songPos: 0, pattPos: 3 });
  });
});
