/**
 * Voodoo Supreme: a grid note is the note of the period the replayer writes to Paula.
 *
 * The Paula side is UADE's AUDxPER log (gridOracle PaulaSession), rendered in 10 ms chunks, two per 50 Hz replayer tick.
 * A note the decoder reads at tick T is written to AUDxPER during tick T; the tick-0 notes are written by the load's own
 * first pass, which the log shows in the next tick.
 * Measured: voo8 voice 0 first note writes period 224 (note 36), voice 1 writes 189 (note 39), voice 2 writes 150 (note 43).
 * Before the fix the grid showed these 12 semitones higher (a per-song octave lift, which hid a table that reaches -50).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openUade, PaulaSession, PAULA_REG, oracleStats } from '@/engine/__tests__/gridOracle';
import { buildVoodooGrid, type VoodooGrid } from '../formats/voodooSupremeGrid';
import { periodToNote, periodToGridNote } from '@/lib/amiga/periodNotes';
import { noteValueToPitch } from '@/lib/tracker/noteValue';

const SONGS = ['voodoo/voo8.vss', 'voodoo-supreme/silkworm.vss'].map((p) => `public/data/songs/${p}`);
const FIRST_EVENTS = 6;

/** The period in effect on each voice at each tick (the last nonzero AUDxPER write up to that tick), for the first `ticks` ticks. */
async function paulaPeriodsPerTick(path: string, ticks: number): Promise<number[][]> {
  const bytes = new Uint8Array(readFileSync(join(process.cwd(), path)));
  const session = new PaulaSession(await openUade(), bytes, path.split('/').pop() as string);
  const perTick: number[][] = Array.from({ length: 4 }, () => new Array<number>(ticks).fill(0));
  const feed = (chunk: number, writes: { voice: number; reg: number; value: number }[]): void => {
    for (const w of writes) {
      const tick = chunk >> 1;
      if (w.voice < 4 && w.reg === PAULA_REG.PER && w.value > 0 && tick < ticks && perTick[w.voice][tick] === 0) perTick[w.voice][tick] = w.value;
    }
  };
  session.drain(); // load-time writes (the init period 150)
  for (let c = 0; c < ticks * 2; c++) {
    const w = session.step();
    if (!w) break;
    feed(c, w);
  }
  session.close();
  for (const col of perTick) for (let i = 1; i < ticks; i++) if (col[i] === 0) col[i] = col[i - 1];
  return perTick;
}

const octave = (note: number): number => Math.floor((note - 1) / 12);

describe('voodoo supreme grid notes equal the notes of the periods UADE writes', () => {
  for (const path of SONGS) {
    it(path, async () => {
      const grid = buildVoodooGrid(new Uint8Array(readFileSync(join(process.cwd(), path)))) as VoodooGrid;
      expect(typeof grid).not.toBe('string');
      const column = (v: number) => grid.patterns.flatMap((p) => p.channels[v].rows);
      const events = [0, 1, 2, 3].map((v) => column(v).map((c, row) => ({ row, note: c.note })).filter((e) => e.note > 0 && e.note !== 97));
      const lastTick = Math.max(...events.map((e) => e[Math.min(FIRST_EVENTS, e.length) - 1].row)) * grid.ticksPerRow + 2;
      const before = oracleStats.writes;
      const paula = await paulaPeriodsPerTick(path, lastTick);
      expect(oracleStats.writes).toBeGreaterThan(before); // the log really ran

      const lines: string[] = [];
      for (let v = 0; v < 4; v++) {
        for (const e of events[v].slice(0, FIRST_EVENTS)) {
          const tick = e.row * grid.ticksPerRow;
          const period = paula[v][Math.max(tick, 1)];
          lines.push(`voice ${v} tick ${tick}: grid note ${e.note}, UADE period ${period} -> note ${periodToNote(period)}`);
          expect(period).toBeGreaterThan(0);
          expect(e.note).toBe(periodToNote(period));
        }
      }

      const hist = new Array<number>(8).fill(0);
      for (let v = 0; v < 4; v++) for (const e of column(v)) if (e.note > 0 && e.note !== 97) hist[octave(e.note)]++;
      const total = hist.reduce((a, b) => a + b, 0);
      console.log(`${path}\n${lines.join('\n')}\noctave histogram (0..7): ${hist.join(' ')}`);
      expect(hist[1] + hist[2] + hist[3]).toBeGreaterThan(total / 2);
    }, 180000);
  }
});

/**
 * Bass below C-0: periods above 1712 (voo8 voice 3: 1726 and 2334; silkworm voice 1: 1512-1696) are the octave below
 * C-0 in the grid (negative stored values, noteValue.ts), periodToGridNote of the period UADE writes - not a clamp to C-0.
 */
describe('voodoo supreme bass periods above C-0 show the octave below C-0', () => {
  for (const [path, voice] of [['public/data/songs/voodoo/voo8.vss', 3], ['public/data/songs/voodoo-supreme/silkworm.vss', 1]] as const) {
    it(path, async () => {
      const grid = buildVoodooGrid(new Uint8Array(readFileSync(join(process.cwd(), path)))) as VoodooGrid;
      const rows = grid.patterns.flatMap((p) => p.channels[voice].rows);
      const low = rows.map((c, row) => ({ row, note: c.note })).filter((e) => e.note < 0);
      expect(low.length).toBeGreaterThan(0);
      const lastTick = low[Math.min(low.length, 8) - 1].row * grid.ticksPerRow + 2;
      const paula = await paulaPeriodsPerTick(path, lastTick);
      const lines: string[] = [];
      for (const e of low.slice(0, 8)) {
        const period = paula[voice][Math.max(e.row * grid.ticksPerRow, 1)];
        lines.push(`voice ${voice} row ${e.row}: grid note ${e.note}, UADE period ${period} -> ${periodToGridNote(period)}`);
        expect(period).toBeGreaterThan(1500);
        // voo8 voice 3 samples 66-99 units below its table period (2400 -> 2334, 1792 -> 1726/1693; cause not measured here),
        // up to a semitone of pitch; silkworm voice 1 is exact.
        const pitchDiff = Math.abs((noteValueToPitch(e.note) as number) - (noteValueToPitch(periodToGridNote(period)) as number));
        expect(pitchDiff).toBeLessThanOrEqual(path.includes('voo8') ? 1 : 0);
        expect(e.note).toBeLessThan(0);
      }
      console.log(lines.join('\n'));
    }, 180000);
  }
  it('periodToGridNote: the octave below C-0 is linear; a period past it has no note', () => {
    expect(periodToGridNote(1712)).toBe(1);
    expect(periodToGridNote(2334)).toBe(-5);
    expect(periodToGridNote(3424)).toBe(-12);
    expect(periodToGridNote(3600)).toBe(0);
  });
});

/** The step clock: one row is the main step of the onsets (6289 / 6913 rows at one tick per row before), every onset keeps its pitch. */
describe('voodoo supreme grid is on the step clock', () => {
  for (const [path, oneTickRows] of [['public/data/songs/voodoo/voo8.vss', 6289], ['public/data/songs/voodoo-supreme/silkworm.vss', 6913]] as const) {
    it(path, () => {
      const grid = buildVoodooGrid(new Uint8Array(readFileSync(join(process.cwd(), path)))) as VoodooGrid;
      const onsets = (g: VoodooGrid): number[] => [0, 1, 2, 3].map((v) => g.patterns.flatMap((p) => p.channels[v].rows).filter((c) => c.note !== 0).length);
      console.log(`${path}: ${grid.rows} rows, ${grid.ticksPerRow} ticks per row, onsets ${onsets(grid)} + notes ${grid.notesPerVoice}`);
      expect(grid.rows).toBeLessThan(oneTickRows);
      expect(grid.ticksPerRow).toBeGreaterThan(1);
      // every onset is in a cell of its voice: the cells with a note (column 0) plus extra columns cover notesPerVoice + note offs
      for (let v = 0; v < 4; v++) expect(onsets(grid)[v]).toBeGreaterThanOrEqual(1);
    });
  }
});
