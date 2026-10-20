/**
 * melodyBarNotes and songMelody against tools/hiphop.py (plan 2026-10-19 O6h).
 * The notes grid is hiphop.melody_bar_notes for every style, two tonics, every mode plus none, chord roots 0..11 and
 * variations 0..3, compared exactly (the decision is integer arithmetic). MODES and CHORDS must equal the host's.
 * The song cases compare every sample of every section melody lane to 1e-9 (same tolerance and cause as
 * melodyBarMatchesTheReference). The reference lane is rebuilt from the host's captured render_melody_bar returns with
 * the host's line melody_buf[o:o + len(m)] += MIX_GAINS["melody"] * m; it lives in fixtures/song_melody.lanes.br
 * (byte-shuffled float64, brotli) and each decoded lane must hash to the sha the generator recorded.
 * The last test is the reachability test: song file -> songFileToBarEvents -> songMelody with a call-count spy on
 * renderMelodyBar (one call per bar the host rendered, in the header's melody voice, with the section seed).
 * Regenerate with tools/softsynth-fixtures/gen_song_melody.py.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/song_melody.json';
import { songFileToBarEvents, type BarEvents } from '@/lib/uprough/barEvents';
import { songMelodyVoice, type SongFileDoc } from '@/lib/uprough/songFile';
import * as melodyBarModule from '../voices/melodyBar';
import { CHORDS, MODES, melodyBarNotes } from '../melodyNotes';
import { songMelody } from '../songMelody';

interface Arr { n: number; off: number; sha: string; peak: number }

const TOL = 1e-9;
// undo the generator's byte shuffle: plane k holds byte k of every sample
const lanesBytes = ((): Uint8Array => {
  const planes = brotliDecompressSync(readFileSync(join(__dirname, 'fixtures/song_melody.lanes.br')));
  const n = planes.length / 8;
  const out = new Uint8Array(planes.length);
  for (let k = 0; k < 8; k++) for (let i = 0; i < n; i++) out[i * 8 + k] = planes[k * n + i]!;
  return out;
})();
const laneOf = (a: Arr): Float64Array => {
  const bytes = lanesBytes.slice(a.off * 8, (a.off + a.n) * 8);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(a.sha);
  return new Float64Array(bytes.buffer);
};
interface Lane { played: number; bars: number; buf: Arr }
interface Case {
  name: string; style: string; rate: number; bpm: number; doc: SongFileDoc | null; events: BarEvents | null;
  melody_voice: string; lanes: Lane[]; played: number;
}
interface NotesRow { style: string; tonic: number; mode: string | null; ev: [number, number, number][]; out: number[][] }
const ref = fixture as unknown as {
  notes: NotesRow[]; harmony: Record<string, string>; chords: Record<string, number[]>; modes: Record<string, number[]>;
  cases: Case[];
};

const inputOf = (c: Case): BarEvents => (c.doc ? songFileToBarEvents(c.doc) : c.events!);
// a song file names the melody voice in its header; the fast path's host events do not, so that case reads the style's
const voiceOf = (c: Case): string => (c.doc ? songMelodyVoice(c.doc.song) : c.melody_voice);
const runCase = (c: Case): Float64Array[] => songMelody(inputOf(c), c.bpm, { melodyVoice: voiceOf(c) });
const maxErr = (a: Float64Array, b: Float64Array): number => { let m = a.length === b.length ? 0 : Infinity; for (let i = 0; i < b.length; i++) m = Math.max(m, Math.abs(a[i]! - b[i]!)); return m; };

afterEach(() => { vi.restoreAllMocks(); });

describe('melodyBarNotes matches hiphop.melody_bar_notes', () => {
  it('MODES and CHORDS equal the host vocabulary', () => {
    expect(MODES).toEqual(ref.modes);
    expect(CHORDS).toEqual(ref.chords);
  });
  it('decides every motif for every chord root and variation', () => {
    let changed = 0;
    for (const row of ref.notes) {
      const motif = row.ev.map(([semi, step, durSteps]) => ({ semi, step, durSteps }));
      const chordIntervals = CHORDS[ref.harmony[row.style]!] ?? CHORDS.min7!;
      let k = 0;
      for (let chordRoot = 0; chordRoot < 12; chordRoot++) {
        for (let variation = 0; variation < 4; variation++) {
          const got = melodyBarNotes(motif, { variation, chordRoot, mode: row.mode, tonic: row.tonic, chordIntervals });
          expect(got.map((n) => n.semi), `${row.style} ${row.mode} ${chordRoot} ${variation}`).toEqual(row.out[k]);
          expect(got.map((n) => [n.step, n.durSteps])).toEqual(row.ev.map(([, s, d]) => [s, d]));
          if (row.out[k]!.some((s, i) => s !== row.ev[i]![0])) changed++;
          k++;
        }
      }
    }
    expect(changed).toBeGreaterThan(0);
  });
  it('the grid exercises every branch (not dead knobs)', () => {
    expect(new Set(ref.notes.map((r) => r.mode))).toEqual(new Set([...Object.keys(MODES), null]));
    expect(new Set(ref.notes.map((r) => r.style)).size).toBe(Object.keys(ref.harmony).length);
    // the chord snap moves a bar-final note somewhere, and variation moves it somewhere
    let chordMoved = 0;
    let varied = 0;
    for (const row of ref.notes) {
      const motif = row.ev.map(([semi, step, durSteps]) => ({ semi, step, durSteps }));
      for (let chordRoot = 0; chordRoot < 12; chordRoot++) {
        const base = { chordRoot, mode: row.mode, tonic: row.tonic };
        const a = melodyBarNotes(motif, { ...base, variation: 0, chordIntervals: CHORDS.min7! }).at(-1)!.semi;
        const b = melodyBarNotes(motif, { ...base, variation: 0, chordIntervals: [] }).at(-1)!.semi;
        const c = melodyBarNotes(motif, { ...base, variation: 1, chordIntervals: [] }).at(-1)!.semi;
        if (a !== b) chordMoved++;
        if (b !== c) varied++;
      }
    }
    expect(chordMoved).toBeGreaterThan(0);
    expect(varied).toBeGreaterThan(0);
  });
});

describe('songMelody matches the hiphop section melody_buf', () => {
  for (const c of ref.cases) {
    it(c.name, () => {
      const lanes = runCase(c);
      expect(lanes.length).toBe(c.lanes.length);
      lanes.forEach((lane, i) => {
        const want = c.lanes[i]!;
        expect(lane.length).toBe(want.buf.n);
        expect(maxErr(lane, laneOf(want.buf))).toBeLessThan(TOL);
      });
    });
  }

  it('the fixture exercises every branch (not dead knobs)', () => {
    expect(new Set(ref.cases.map((c) => c.melody_voice))).toEqual(new Set(['piano', 'epiano', 'bell', 'lead', 'whistle', 'darkbell', 'fmbell']));
    const lanes = ref.cases.flatMap((c) => c.lanes);
    expect(lanes.some((l) => l.played > 0 && l.played < l.bars)).toBe(true);
    expect(lanes.some((l) => l.played === 0 && l.buf.peak === 0)).toBe(true);
    expect(ref.cases.some((c) => c.events !== null && c.played > 0)).toBe(true);
    expect(ref.cases.find((c) => c.name === 'lofi-stem-drums')!.played).toBe(0);
    const override = ref.cases.find((c) => c.name === 'east_coast-override-bell')!;
    expect(songMelodyVoice(override.doc!.song)).toBe('bell');
  });
});

describe('reachability', () => {
  it('the song entry renders one melody bar per bar the host rendered, in the header voice, with the section seed', () => {
    const c = ref.cases.find((x) => x.name === 'jazz_rap-24bars')!;
    const spy = vi.spyOn(melodyBarModule, 'renderMelodyBar');
    runCase(c);
    expect(c.played).toBeGreaterThan(0);
    expect(spy).toHaveBeenCalledTimes(c.played);
    expect(spy.mock.calls.every((call) => call[0] === 'epiano')).toBe(true);
    const seeds = new Set(spy.mock.calls.map((call) => call[2].seed));
    expect(seeds.size).toBe(c.lanes.filter((l) => l.played > 0).length);
  });
});
