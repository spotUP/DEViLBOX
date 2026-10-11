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
import { moduleBeatGrid, modulePhrases, musicalBpm, MODULE_GRID_TOLERANCE } from '../moduleBeatGrid';
import { buildBeatGrids } from '../beatGrid';

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
    expect(musicalBpm(6, 125, 4)).toBeCloseTo(125, 9);
    const s = plain(6, 125);
    expect(moduleBeatGrid(s, walkEnd(s))?.bpm).toBe(125);
  });

  it('speed 3 / tempo 125 without drums is 125 BPM: a beat is 24 ticks (8 rows), not 4 rows', () => {
    expect(musicalBpm(3, 125, 4)).toBeCloseTo(250, 9);
    expect(musicalBpm(3, 125, 8)).toBeCloseTo(125, 9);
    const s = plain(3, 125);
    const g = moduleBeatGrid(s, walkEnd(s))!;
    expect(g.bpm).toBe(125);
    expect(g.rowsPerBeat).toBe(8);
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
    // No drums: the pattern lengths (16 beats each) say 4/4; the beat level rests on the speed convention.
    expect(g.beatsPerBar).toBe(4);
    expect(g.source).toBe('module');
  });

  it('a render with a tail (within the tolerance) keeps the song\'s beats: never stretched', () => {
    const s = plain(6, 125);
    const end = walkEnd(s);
    const g = moduleBeatGrid(s, end * 1.015)!;
    expect(g).not.toBeNull();
    expect(g.bpm).toBe(125);
    expect(g.beats[g.beats.length - 1]).toBeCloseTo(end - 4 * rowSeconds(6, 125), 9);
  });

  it('a render capped at its preview length gives the grid of the rendered part and the song\'s BPM', () => {
    const s = song([pattern('a', 64), pattern('b', 64)], [0, 1, 0, 1, 0, 1], { speed: 3 });
    const end = walkEnd(s);
    const cap = end / 2;
    expect(moduleBeatGrid(s, cap)).toBeNull();
    const g = moduleBeatGrid(s, cap, { renderCapSec: cap })!;
    expect(g.bpm).toBe(125);
    expect(g.beats.every((t) => t < cap)).toBe(true);
    // 192 rows rendered, a beat every 8 rows at speed 3.
    expect(g.beats).toHaveLength(24);
  });

  it('a render 5 % longer than the walk is not trusted: null', () => {
    const s = plain(6, 125);
    expect(MODULE_GRID_TOLERANCE).toBeLessThan(0.05);
    expect(moduleBeatGrid(s, walkEnd(s) * 1.05)).toBeNull();
  });

  it('the BPM is the tempo the song plays longest; a short slow-down does not drag it', () => {
    // 64 rows at speed 6 / 141, then 16 rows ramping down to tempo 64.
    const s = song([pattern('a', 64), pattern('b', 16, { 0: [0x0f, 0x60], 8: [0x0f, 0x40] })], [0, 0, 1], { bpm: 141 });
    const g = moduleBeatGrid(s, walkEnd(s))!;
    expect(g.bpm).toBe(141);
  });
});

describe('buildBeatGrids with a fixed meter (module timing)', () => {
  it('bars follow the song downbeats, a short pattern makes a short bar, confidence is the given value', () => {
    // 40 rows (Dxx at row 39) then 64: bars of 4, 4, 2 beats, then 4 x 4.
    const s = song([pattern('a', 64, { 39: [0x0d, 0] }), pattern('b', 64)], [0, 1]);
    const g = moduleBeatGrid(s, walkEnd(s))!;
    const r = buildBeatGrids({
      beats: g.beats, downbeats: g.downbeats, bpm: g.bpm, bpmConfidence: 1, timeSignature: 4,
      extended: null, durationSec: walkEnd(s), fixed: { beatsPerBar: 4, confidence: 1 },
    });
    // 40 rows is 10 beats: two 4-beat bars and a 2-beat bar.
    expect(r.downbeats.bars.map((b) => b.beats.length)).toEqual([4, 4, 2, 4, 4, 4, 4]);
    expect(r.downbeats.bars.map((b) => b.start)).toEqual(g.downbeats);
    expect(r.beatGrid.beats.filter((b) => b.isDownbeat).map((b) => b.time)).toEqual(g.downbeats);
    expect(r.beatGrid.confidence).toBe(1);
    expect(r.downbeats.confidence).toBe(1);
    expect(r.meter).toMatchObject({ beatsPerBar: 4, confidence: 1 });
  });
});

// ── Owner juggling plan sections 31, 38, 56 (audit 2026-10-11 rows 3, 5, 6) ──

/** Instruments the channel identity can name: a kick, a snare (drum machine types) and a 303 bass. */
const KICK = 1, SNARE = 2, BASS = 3;
const drumKit = [
  { id: KICK, name: 'kick', type: 'synth', synthType: 'Synth', drumMachine: { drumType: 'kick' } },
  { id: SNARE, name: 'snare', type: 'synth', synthType: 'Synth', drumMachine: { drumType: 'snare' } },
  { id: BASS, name: 'bass', type: 'synth', synthType: 'TB303' },
];

/** A pattern of `rows` rows over `chans` channels; `notes[ch][row] = instrument`. */
function notes(id: string, rows: number, chans: Array<Record<number, number>>): Pattern {
  return {
    id, name: id, length: rows,
    channels: chans.map((hits, ch) => ({
      id: `c${ch}`, name: `c${ch}`, muted: false, solo: false, collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: rows }, (_, r) => { const c = empty(); if (hits[r]) { c.note = 49; c.instrument = hits[r]; } return c; }),
    })),
  } as unknown as Pattern;
}

/** Instrument `inst` every `step` rows from `from`. */
const every = (rows: number, step: number, inst: number, from = 0): Record<number, number> => {
  const m: Record<number, number> = {};
  for (let r = from; r < rows; r += step) m[r] = inst;
  return m;
};

function drumSong(patterns: Pattern[], order: number[], opts: { speed?: number; bpm?: number } = {}): TrackerSong {
  return { ...song(patterns, order, opts), instruments: drumKit, numChannels: patterns[0].channels.length } as unknown as TrackerSong;
}

describe('the module grid reads the meter from the song (owner plan section 56)', () => {
  it('a waltz: drums that repeat every three beats make 3/4 bars, not 4/4', () => {
    // 48 rows = 12 beats (a whole number of 3/4 and of 4/4 bars): kick on beat 1, snare on beats 2 and 3.
    const bar: Record<number, number> = {};
    for (let r = 0; r < 48; r += 12) { bar[r] = KICK; bar[r + 4] = SNARE; bar[r + 8] = SNARE; }
    const s = drumSong([notes('w', 48, [bar])], [0, 0, 0, 0]);
    const g = moduleBeatGrid(s, walkEnd(s))!;
    expect(g.beatsPerBar).toBe(3);
    expect(g.meterConfidence).toBeGreaterThanOrEqual(0.6);
    const row = rowSeconds(6, 125);
    // A bar every 12 rows (3 beats of 4 rows).
    expect(g.downbeats.slice(0, 5).map((t) => Math.round(t / row))).toEqual([0, 12, 24, 36, 48]);
  });

  it('a backbeat that repeats every four beats is 4/4 with confidence from the drums', () => {
    const s = drumSong([notes('f', 64, [{ ...every(64, 8, KICK), ...every(64, 8, SNARE, 4) }])], [0, 0, 0]);
    const g = moduleBeatGrid(s, walkEnd(s))!;
    expect(g.beatsPerBar).toBe(4);
    expect(g.meterConfidence).toBeGreaterThanOrEqual(0.6);
  });

  it('the DJ analysis of a 3/4 module carries the song\'s meter into its bars', async () => {
    const { buildDJTrackAnalysis } = await import('../trackAnalysis');
    const { corpusPipelineAnalysis, corpusTrack } = await import('../testing/corpus');
    const bar: Record<number, number> = {};
    for (let r = 0; r < 48; r += 12) { bar[r] = KICK; bar[r + 4] = SNARE; bar[r + 8] = SNARE; }
    const s = drumSong([notes('w', 48, [bar])], [0, 0, 0, 0, 0, 0, 0, 0]);
    const end = walkEnd(s);
    const a = buildDJTrackAnalysis({ id: 'waltz', durationSec: end, analysis: corpusPipelineAnalysis(corpusTrack('steady')), extended: null, song: s });
    expect(a.meter.beatsPerBar).toBe(3);
    expect(a.downbeats.bars.slice(1, 4).map((b) => b.beats.length)).toEqual([3, 3, 3]);
  });
});

describe('the module grid confidence reflects its evidence (owner plan section 31)', () => {
  it('a beat level no drum confirms (the speed convention alone) is below the beat-juggling minimum, at phrase level', async () => {
    const { POLICY_MIN } = await import('../juggle/jugglePlanner');
    const s = song([pattern('a', 64), pattern('b', 64)], [0, 1]);
    const g = moduleBeatGrid(s, walkEnd(s))!;
    expect(g.confidence).toBeLessThan(POLICY_MIN.beat.beat);
    expect(g.confidence).toBeGreaterThanOrEqual(POLICY_MIN.phrase.beat);
    const r = buildBeatGrids({
      beats: g.beats, downbeats: g.downbeats, bpm: g.bpm, bpmConfidence: g.confidence, timeSignature: g.beatsPerBar,
      extended: null, durationSec: walkEnd(s), fixed: { beatsPerBar: g.beatsPerBar, confidence: g.confidence, meterConfidence: g.meterConfidence },
    });
    // Concrete numbers (audit 2026-10-11 M8): the convention's 0.7, and the meter from the pattern lengths
    // alone (16 beats a pattern: whole 4/4 bars, not whole 3/4 bars) at 0.65.
    expect(g.confidence).toBe(0.7);
    expect(g.meterConfidence).toBe(0.65);
    expect(r.beatGrid.confidence).toBe(0.7);
    expect(r.meter.confidence).toBe(0.65);
    expect(r.downbeats.confidence).toBe(0.65);
  });

  it('a meter nothing reads (48-row patterns fit 4/4 and 3/4, no drums) is assumed: 4/4 at 0.5', () => {
    const s = song([pattern('a', 48), pattern('b', 48)], [0, 1]);
    const g = moduleBeatGrid(s, walkEnd(s))!;
    expect(g.beatsPerBar).toBe(4);
    expect(g.meterConfidence).toBe(0.5);
  });

  it('drums that do not confirm the beat (all off the beat, the finer level implausible) leave it at the convention: 0.7', () => {
    // Speed 6 / tempo 125: 2 rows a beat would be 250 BPM, so only the 4-row level is judged, and no drum hit lands on it.
    const s = drumSong([notes('o', 64, [{ ...every(64, 8, KICK, 2), ...every(64, 8, SNARE, 6) }])], [0, 0, 0]);
    const g = moduleBeatGrid(s, walkEnd(s))!;
    expect(g.rowsPerBeat).toBe(4);
    expect(g.confidence).toBe(0.7);
  });

  it('a backbeat on the conventional level confirms the beat: confidence 1', () => {
    const s = drumSong([notes('f', 64, [{ ...every(64, 8, KICK), ...every(64, 8, SNARE, 4) }])], [0, 0, 0]);
    expect(moduleBeatGrid(s, walkEnd(s))!.confidence).toBe(1);
  });
});

describe('the drums that set the beat are found per order position (owner plan section 38)', () => {
  it('drums that move to another channel after the first pattern still decide the beat level', () => {
    // Speed 6 / tempo 80: 4 rows a beat is 80 BPM, 2 rows a beat 160. Pattern a: a stray kick on channel 0,
    // the bass on channel 1. Pattern b (the rest of the song): the bass moves to channel 0, the kit to channel 1 -
    // kick every 4 rows, snare between them: a backbeat at 2 rows a beat.
    const a = notes('a', 64, [{ 0: KICK, 32: KICK }, { 0: BASS }]);
    const b = notes('b', 64, [every(64, 4, BASS), { ...every(64, 4, KICK), ...every(64, 4, SNARE, 2) }]);
    const s = drumSong([a, b], [0, 1, 1, 1, 1], { bpm: 80 });
    const g = moduleBeatGrid(s, walkEnd(s))!;
    expect(g.rowsPerBeat).toBe(2);
    expect(g.bpm).toBe(160);
    expect(g.confidence).toBe(1);
  });
});

describe('the module phrase grid is read from the order list (audit 2026-10-11 M1, owner plan section 37)', () => {
  it('pattern changes every 8 bars count in 8-bar phrases at full confidence; a repeated pattern continues its phrase', () => {
    // Order a a b b a a b b, 4 bars each: changes at bars 8, 16, 24 (16 bars would miss two of three).
    expect(modulePhrases([0, 0, 1, 1, 0, 0, 1, 1], [0, 4, 8, 12, 16, 20, 24, 28], 32)).toEqual({ lengthBars: 8, confidence: 1, startBars: [0, 8, 16, 24] });
  });

  it('2-bar patterns that all differ: 4-bar phrases on every other pattern start; 3 of the 7 changes on them', () => {
    const g = modulePhrases([0, 1, 2, 3, 4, 5, 6, 7], [0, 2, 4, 6, 8, 10, 12, 14], 16)!;
    expect(g.lengthBars).toBe(4);
    expect(g.startBars).toEqual([0, 4, 8, 12]);
    expect(g.confidence).toBeCloseTo((1 + 3 / 7) / 2, 12);
  });

  it('3-bar patterns sit on no 4-bar grid: the unaligned confidence, phrases restarted on each pattern', () => {
    expect(modulePhrases([0, 1, 2, 3], [0, 3, 6, 9], 12)).toEqual({ lengthBars: 4, confidence: 0.3, startBars: [0, 3, 6, 9] });
  });

  it('a pattern break that shortens a position restarts the phrase on the next pattern', () => {
    // 4-bar patterns, the second cut to 2 bars (D00): positions on bars 0, 4, 6, 10, 14. The 4-bar grid misses
    // once (bar 8 is inside the pattern from 6) and restarts at 6: alignment 3/4, every change on a phrase start.
    expect(modulePhrases([0, 1, 2, 3, 4], [0, 4, 6, 10, 14], 18)).toEqual({ lengthBars: 4, confidence: 0.875, startBars: [0, 4, 6, 10, 14] });
  });

  it('one pattern repeated: aligned, but no change says the length: 4 bars at 0.5; too short to count: null', () => {
    expect(modulePhrases([0, 0, 0, 0], [0, 4, 8, 12], 16)).toEqual({ lengthBars: 4, confidence: 0.5, startBars: [0, 4, 8, 12] });
    expect(modulePhrases([0], [0], 4)).toBeNull();
  });
});
