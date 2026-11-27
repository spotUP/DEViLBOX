/**
 * AXS (AXSF): grid time is replayer time, and a grid edit is heard.
 *
 * 1. Every corpus song: the grid's speed/BPM clock (initialSpeed / initialBPM, Fxx cells), walked
 *    along the rows the replayer actually plays (axs_position / axs_row), predicts each row's length;
 *    the replayer's measured row starts (48 kHz output frames) match it.
 * 2. A grid cell written through the live-edit route (gridCellEdits -> AxsEngine.setCell ->
 *    axs_set_grid_cell, the same call the worklet makes) changes the render from that row on and
 *    not before, both before play and while playing.
 * Corpus: test-data/axs (git-ignored, skipped when absent).
 */
import { describe, it, expect, vi } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { parseAxsFile } from '@/lib/import/formats/AxsParser';
import type { CreateAxsEdit } from '@/engine/axs/axsEditWasm';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const create: CreateAxsEdit = async () =>
  (await import('../../../../public/axs/AxsEdit.js')).default({ locateFile: (f: string) => resolve('public/axs', f) });

vi.mock('@/engine/axs/axsEditWasm', async (orig) => {
  const real = await orig<typeof import('@/engine/axs/axsEditWasm')>();
  return { ...real, axsGrid: (b: Uint8Array, c?: CreateAxsEdit) => real.axsGrid(b, c ?? create) };
});

const RATE = 48000;
const DIR = resolve('test-data/axs');
const songs = existsSync(DIR) ? readdirSync(DIR).filter(f => f.toLowerCase().endsWith('.axs')).sort() : [];
const SONATHACK = 'Luigi_Auriemma__sonathack.axs';

type Mod = Awaited<ReturnType<CreateAxsEdit>>;

function open(m: Mod, bytes: Uint8Array): void {
  const ptr = m._malloc(bytes.length);
  m.HEAPU8.set(bytes, ptr);
  expect(m._axs_open(ptr, bytes.length, RATE), m.UTF8ToString(m._axs_error())).toBe(1);
  m._free(ptr);
}

/** Render `frames` frames one at a time step of 64, calling `each(frameIndex)` after every block. */
function render(m: Mod, frames: number, each?: (at: number) => void): Float32Array {
  const out = m._malloc(64 * 2 * 4);
  const all = new Float32Array(frames * 2);
  let at = 0;
  while (at < frames) {
    const got = m._axs_render(out, Math.min(64, frames - at));
    all.set(m.HEAPF32.subarray(out >> 2, (out >> 2) + got * 2), at * 2);
    at += got;
    each?.(at);
    if (got === 0) break;
  }
  m._free(out);
  return all;
}

describe('AXS grid time is replayer time', () => {
  it.skipIf(songs.length === 0)('row lengths from the grid clock match the replayer on every corpus song', async () => {
    const m = await create();
    const report: string[] = [];
    let worstAll = 0, worstRowAll = 0;
    for (const name of songs) {
      const bytes = new Uint8Array(readFileSync(resolve(DIR, name)));
      const song = (await parseAxsFile(bytes, name, create)) as TrackerSong;
      open(m, bytes);
      // Measured: frame at which each played row starts, at 64-frame steps (1.3 ms).
      const starts: Array<{ p: number; r: number; at: number }> = [];
      let last = -1;
      const out = m._malloc(16 * 2 * 4);
      for (let at = 0; at < 30 * RATE && starts.length < 600;) {
        const got = m._axs_render(out, 16);
        if (got === 0) break;
        at += got;
        const p = m._axs_position(), r = m._axs_row(), key = p * 256 + r;
        if (key !== last) { last = key; starts.push({ p, r, at }); }
      }
      m._free(out);
      m._axs_close();
      // Predicted: the grid's clock along the same rows (Fxx: below 0x20 speed, else BPM, from that row).
      let speed = song.initialSpeed, bpm = song.initialBPM, worst = 0, worstRow = 0, fx = 0, want = 0;
      for (let i = 0; i + 1 < starts.length; i++) {
        const { p, r } = starts[i];
        const pat = song.patterns[song.songPositions[p]];
        for (const ch of pat.channels) {
          const c = ch.rows[r];
          if (c?.effTyp === 0x0f && c.eff > 0) { fx++; if (c.eff < 0x20) speed = c.eff; else bpm = c.eff; }
        }
        // From row 1 (row 0 is seen before the first tick): each row length, and the cumulative drift.
        // Row starts are seen at 16-frame steps; the 44.1 kHz tick edge adds under one engine frame.
        const row = (speed * 2.5 / bpm) * RATE;
        if (i > 0) want += row;
        if (i > 0) worstRow = Math.max(worstRow, Math.abs(starts[i + 1].at - starts[i].at - row));
        if (i > 0) worst = Math.max(worst, Math.abs(starts[i + 1].at - starts[1].at - want));
      }
      worstAll = Math.max(worstAll, worst);
      worstRowAll = Math.max(worstRowAll, worstRow);
      report.push(`${name}: speed ${song.initialSpeed} bpm ${song.initialBPM} rows ${starts.length - 1} Fxx ${fx} worst row ${(worstRow / RATE * 1000).toFixed(3)} ms drift ${(worst / RATE * 1000).toFixed(3)} ms`);
      expect(starts.length, name).toBeGreaterThan(8);
    }
    console.log(`[axsGridTime]\n${report.join('\n')}`);
    // 18 frames: the 16-frame observation step plus one engine frame. Drift: 2 ms over up to 30 s.
    expect(worstRowAll).toBeLessThanOrEqual(18);
    expect(worstAll).toBeLessThanOrEqual(0.002 * RATE);
  });
});

describe('AXS live edit', () => {
  const has = songs.includes(SONATHACK);

  it.skipIf(!has)('takes the grid-cell route to AxsEngine.setCell', async () => {
    const { liveEditRoute } = await import('@/engine/replayer/liveCellEdits');
    const bytes = new Uint8Array(readFileSync(resolve(DIR, SONATHACK)));
    const song = (await parseAxsFile(bytes, SONATHACK, create)) as TrackerSong;
    expect(liveEditRoute(song)).toEqual({ route: 'grid-cell', engine: 'AxsReplayer' });
  });

  it.skipIf(!has)('a grid note edit is heard from its row on, before play and while playing', async () => {
    const bytes = new Uint8Array(readFileSync(resolve(DIR, SONATHACK)));
    const song = (await parseAxsFile(bytes, SONATHACK, create)) as TrackerSong;
    const m = await create();
    // First note at row 8 or later of the first position's block (a synth track, not the drum track).
    const blk = song.songPositions[0];
    const pat = song.patterns[blk];
    let ch = -1, row = -1;
    for (let r = 8; r < pat.length && ch < 0; r++)
      for (let c = 0; c < pat.channels.length; c++) {
        const cell = pat.channels[c].rows[r];
        if (cell.note > 0 && cell.note < 90 && cell.instrument !== 8) { ch = c; row = r; break; }
      }
    expect(ch, 'a note cell to edit').toBeGreaterThanOrEqual(0);
    const cell = pat.channels[ch].rows[row];
    const rowFrames = Math.round((song.initialSpeed * 2.5 / song.initialBPM) * RATE);
    const total = (row + 8) * rowFrames;

    open(m, bytes);
    const base = render(m, total);
    m._axs_close();

    // Before play: the edit (+7 semitones) as the worklet applies it after open.
    open(m, bytes);
    expect(m._axs_set_grid_cell(blk, ch, row, cell.note + 7, cell.instrument, cell.effTyp, cell.eff, cell.volume)).toBe(1);
    const edited = render(m, total);
    m._axs_close();

    // The stored cell is the decoded one (grid shows the edited note back).
    open(m, bytes);
    m._axs_set_grid_cell(blk, ch, row, cell.note + 7, cell.instrument, cell.effTyp, cell.eff, cell.volume);
    const back = (await import('@/lib/import/formats/AxsParser')).axsCellToTracker;
    let o = m._axs_grid() >> 2;
    const h = m.HEAP32;
    const nBlocks = h[o++], len = h[o++]; o += len;
    for (let b = 0; b < blk && b < nBlocks; b++) { const T = h[o], R = h[o + 1]; o += 2 + 16 + T * R * 4; }
    const trackByte = h[o + 2 + ch], R = h[o + 1];
    const q = o + 2 + 16 + (ch * R + row) * 4;
    const shown = back({ note: h[q], vel: h[q + 1], cmd: h[q + 2], par: h[q + 3] }, trackByte);
    expect(shown).toEqual({ ...cell, note: cell.note + 7 });
    m._axs_close();

    // While playing: edit made half a row before the row plays.
    open(m, bytes);
    let done = false;
    const live = render(m, total, (at) => {
      if (!done && at >= (row - 1) * rowFrames) { done = true; m._axs_set_grid_cell(blk, ch, row, cell.note + 7, cell.instrument, cell.effTyp, cell.eff, cell.volume); }
    });
    m._axs_close();

    const firstDiff = (a: Float32Array, b: Float32Array) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i >> 1; return -1; };
    const d1 = firstDiff(base, edited), d2 = firstDiff(base, live);
    const rowStart = row * rowFrames;
    console.log(`[axsLiveEdit] block ${blk} track ${ch} row ${row} note ${cell.note}->${cell.note + 7}; row starts ~${rowStart} frames; first difference before play ${d1}, while playing ${d2}`);
    // The replayer starts row 0 one tick in; a row's note starts within that row (swing delays odd rows).
    for (const d of [d1, d2]) {
      expect(d).toBeGreaterThanOrEqual(rowStart);
      expect(d).toBeLessThan(rowStart + rowFrames + 2);
    }
    expect(Array.from(live)).toEqual(Array.from(edited));
  });
});
