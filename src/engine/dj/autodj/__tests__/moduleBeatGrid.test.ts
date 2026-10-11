/**
 * The module's own beat grid (dj-juggling plan P1.1 / P1.2): the order-list
 * walk honours speed, tempo, pattern breaks and song loops the way the
 * replayer does, and the grid it yields is the song's, not a guess from the
 * audio. Pure over TrackerSong objects.
 */
import { describe, it, expect } from 'vitest';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell } from '@/types/tracker';
import { timeOrderPositions, rowSeconds } from '../trackerMixAnalysis';
import { moduleBeatGrid, musicalBpm, MODULE_GRID_TOLERANCE } from '../moduleBeatGrid';

const empty = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

/** A pattern of `rows` rows; `fx` puts one effect on channel 0 at a row. */
function pattern(id: string, rows: number, fx: Record<number, [number, number]> = {}): Pattern {
  const cells = Array.from({ length: rows }, (_, r) => {
    const c = empty();
    if (fx[r]) { c.effTyp = fx[r][0]; c.eff = fx[r][1]; }
    return c;
  });
  return {
    id, name: id, length: rows,
    channels: [{ id: 'c0', name: 'c0', rows: cells, muted: false, solo: false, collapsed: false, volume: 100, pan: 0, instrumentId: 1, color: null }],
  } as unknown as Pattern;
}

function song(patterns: Pattern[], order: number[], opts: { speed?: number; bpm?: number; format?: string } = {}): TrackerSong {
  return {
    name: 't', format: opts.format ?? 'MOD', patterns, instruments: [], songPositions: order, songLength: order.length,
    restartPosition: 0, numChannels: 1, initialSpeed: opts.speed ?? 6, initialBPM: opts.bpm ?? 125,
  } as unknown as TrackerSong;
}

const walkEnd = (s: TrackerSong) => { const { positions } = timeOrderPositions(s); return positions[positions.length - 1].end; };

describe('timeOrderPositions honours the song flow', () => {
  it('a pattern break at row 31 (D00) halves a 64-row pattern', () => {
    const s = song([pattern('a', 64, { 31: [0x0d, 0] }), pattern('b', 64)], [0, 1]);
    const { positions, rowTimes } = timeOrderPositions(s);
    expect(positions[0].rows).toBe(32);
    expect(rowTimes[0]).toHaveLength(32);
    expect(positions[1].start).toBeCloseTo(32 * rowSeconds(6, 125), 9);
    expect(walkEnd(s)).toBeCloseTo(96 * rowSeconds(6, 125), 9);
  });

  it('a pattern break to row 16 starts the next position at row 16', () => {
    const s = song([pattern('a', 64, { 63: [0x0d, 0x16] }), pattern('b', 64)], [0, 1]);
    const { positions, rowTimes } = timeOrderPositions(s);
    // MOD breaks are BCD, as in the replayer: 0x16 = row 16.
    expect(positions[1].startRow).toBe(16);
    expect(positions[1].rows).toBe(48);
    expect(rowTimes[1]).toHaveLength(48);
  });

  it('a backward position jump (song loop) ends the walk', () => {
    const s = song([pattern('a', 64), pattern('b', 64, { 63: [0x0b, 0] }), pattern('c', 64)], [0, 1, 2]);
    const { positions } = timeOrderPositions(s);
    expect(positions).toHaveLength(2);
    expect(walkEnd(s)).toBeCloseTo(128 * rowSeconds(6, 125), 9);
  });

  it('a forward position jump skips the positions in between', () => {
    const s = song([pattern('a', 64, { 63: [0x0b, 2] }), pattern('b', 64), pattern('c', 64)], [0, 1, 2]);
    const { positions } = timeOrderPositions(s);
    expect(positions.map((p) => p.index)).toEqual([0, 2]);
  });

  it('an S3M set-speed / set-tempo (stored as Fxx by the importer) changes the timing', () => {
    // S3MParser / ITParser normalise A (speed) and T (tempo) to XM Fxx; the walk reads that numbering for every format.
    const s = song([pattern('a', 64, { 0: [0x0f, 3] })], [0], { format: 'S3M' });
    expect(walkEnd(s)).toBeCloseTo(64 * rowSeconds(3, 125), 9);
  });

  it('an XM key-off (Kxx, 0x14) is not read as a tempo command', () => {
    const s = song([pattern('a', 64, { 0: [0x14, 0x40] })], [0], { format: 'IT' });
    expect(walkEnd(s)).toBeCloseTo(64 * rowSeconds(6, 125), 9);
  });
});

describe('moduleBeatGrid', () => {
  const plain = (speed: number, bpm: number) => song([pattern('a', 64), pattern('b', 64)], [0, 1], { speed, bpm });

  it('speed 6 / tempo 125 is 125 BPM', () => {
    expect(musicalBpm(6, 125)).toBeCloseTo(125, 9);
    const s = plain(6, 125);
    expect(moduleBeatGrid(s, walkEnd(s))?.bpm).toBe(125);
  });

  it('speed 3 / tempo 125 is 250 BPM', () => {
    expect(musicalBpm(3, 125)).toBeCloseTo(250, 9);
    const s = plain(3, 125);
    expect(moduleBeatGrid(s, walkEnd(s))?.bpm).toBe(250);
  });

  it('a beat every 4 rows and a downbeat every 16 rows from each pattern start', () => {
    const s = song([pattern('a', 64, { 39: [0x0d, 0] }), pattern('b', 64)], [0, 1]);
    const g = moduleBeatGrid(s, walkEnd(s))!;
    const row = rowSeconds(6, 125);
    // 40 rows then 64: beats at rows 0,4..36 then 40,44,..
    expect(g.beats).toHaveLength(10 + 16);
    expect(g.beats[1]).toBeCloseTo(4 * row, 9);
    // Downbeats: rows 0, 16, 32 of pattern a, then row 0 of pattern b (bar 1 = row 0 of every position).
    expect(g.downbeats.map((t) => t / row)).toEqual([0, 16, 32, 40, 56, 72, 88].map((r) => expect.closeTo(r, 6)));
    expect(g.beatsPerBar).toBe(4);
    expect(g.confidence).toBe(1);
    expect(g.source).toBe('module');
  });

  it('scales the grid onto a render within the tolerance', () => {
    const s = plain(6, 125);
    const end = walkEnd(s);
    const g = moduleBeatGrid(s, end * 1.01)!;
    expect(g).not.toBeNull();
    expect(g.beats[g.beats.length - 1]).toBeCloseTo((end - 4 * rowSeconds(6, 125)) * 1.01, 6);
  });

  it('a render 5 % longer than the walk is not trusted: null', () => {
    const s = plain(6, 125);
    expect(MODULE_GRID_TOLERANCE).toBeLessThan(0.05);
    expect(moduleBeatGrid(s, walkEnd(s) * 1.05)).toBeNull();
  });

  it('a time-weighted BPM over a tempo change', () => {
    // Half the time at speed 6 (125), half the rows at speed 3 (250): 64 rows each.
    const s = song([pattern('a', 64), pattern('b', 64, { 0: [0x0f, 3] })], [0, 1]);
    const g = moduleBeatGrid(s, walkEnd(s))!;
    const t6 = 64 * rowSeconds(6, 125), t3 = 64 * rowSeconds(3, 125);
    expect(g.bpm).toBeCloseTo((125 * t6 + 250 * t3) / (t6 + t3), 2);
  });
});
