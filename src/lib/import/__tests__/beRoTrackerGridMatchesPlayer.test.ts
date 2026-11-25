/**
 * BeRoTracker grid = what the engine plays. Each song is parsed (C++ cell decode, BeRoTrackerEdit
 * build) and played by the same engine in node. Every pattern's grid cells equal the engine's own
 * cells; at every row the sequencer reaches, the grid position holds the pattern the engine is in.
 * Then a live poke (C++ encode) changes the audio only from the poked row on.
 * Real songs in test-data/berotracker (Modland, git-ignored); cases skip without them.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { parseBeRoTrackerFile } from '@/lib/import/formats/BeRoTrackerParser';
import {
  beRoTrackerCellOffset, beRoTrackerEncodeCell, readBeRoTrackerPattern, type BeRoTrackerEditModule,
} from '@/engine/berotracker/beRoTrackerEditWasm';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const ROOT = resolve(__dirname, '../../../..');
const DIR = join(ROOT, 'test-data/berotracker');
const songs = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.brt')).sort().map((f) => join(DIR, f)) : [];
const create = async (): Promise<BeRoTrackerEditModule> =>
  (await import('../../../../public/berotracker/BeRoTrackerEdit.js')).default({ locateFile: (f: string) => join(ROOT, 'public/berotracker', f) });

const RATE = 44100;
const FRAMES = 128;

interface Poke { pattern: number; offset: number; bytes: Uint8Array }

function open(m: BeRoTrackerEditModule, bytes: Uint8Array, pokes: Poke[] = []): void {
  const ptr = m._malloc(bytes.length);
  m.HEAPU8.set(bytes, ptr);
  const ok = m._brt_open(ptr, bytes.length, RATE);
  m._free(ptr);
  if (!ok) throw new Error(m.UTF8ToString(m._brt_error()));
  for (const p of pokes) {
    const b = m._malloc(p.bytes.length);
    m.HEAPU8.set(p.bytes, b);
    expect(m._brt_poke(p.pattern, p.offset, b, p.bytes.length)).toBe(1);
    m._free(b);
  }
}

/** Play `bytes` (after `pokes`) calling `onRow` at each new sequencer position; returns the audio. */
function play(m: BeRoTrackerEditModule, bytes: Uint8Array, maxSeconds: number, onRow: (order: number, row: number, frame: number) => void,
  pokes: Poke[] = []): Float32Array {
  open(m, bytes, pokes);
  const out = m._malloc(FRAMES * 8);
  const chunks: Float32Array[] = [];
  let last = -1;
  for (let f = 0; f < maxSeconds * RATE; f += FRAMES) {
    const n = m._brt_render(out, FRAMES);
    const pos = m._brt_position();
    if (pos !== last) { last = pos; onRow(pos >>> 16, pos & 0xffff, f); } // the row started inside [f, f + n)
    chunks.push(m.HEAPF32.slice(out >> 2, (out >> 2) + n * 2));
    if (n < FRAMES) break;
  }
  m._free(out);
  m._brt_close();
  const all = new Float32Array(chunks.reduce((a, c) => a + c.length, 0));
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  return all;
}

const gridCells = (song: TrackerSong, p: number) =>
  Array.from({ length: song.patterns[p].length }, (_, r) => song.patterns[p].channels.map((ch) => ch.rows[r]));

describe('BeRoTracker grid matches the player', () => {
  it.skipIf(songs.length === 0)('every pattern equals the engine cells and every played row sits on the grid', async () => {
    let rows = 0;
    for (const path of songs) {
      const bytes = new Uint8Array(readFileSync(path));
      const song = (await parseBeRoTrackerFile(bytes, 'a.brt', create))!;
      expect(song.patterns.some((p) => p.channels.some((ch) => ch.rows.some((c) => c.note !== 0))), path).toBe(true);
      const m = await create();
      open(m, bytes);
      for (const p of new Set(song.songPositions)) {
        const len = m._brt_pattern_rows(p);
        expect(song.patterns[p].length, `${path} pattern ${p}`).toBe(len);
        expect(gridCells(song, p), `${path} pattern ${p}`).toEqual(readBeRoTrackerPattern(m, m._brt_play_pattern(p), len, song.numChannels));
      }
      m._brt_close();
      play(m, bytes, 90, (order, row) => {
        rows++;
        expect(song.songPositions[order], `${path} order ${order} row ${row}`).toBe(m._brt_play_pattern_index());
        expect(row, `${path} order ${order}`).toBeLessThan(song.patterns[song.songPositions[order]].length);
      });
    }
    expect(rows).toBeGreaterThan(1000);
  }, 600_000);

  it.skipIf(songs.length === 0)('a poked note is heard from its row on, not before', async () => {
    const bytes = new Uint8Array(readFileSync(songs[0]));
    const song = (await parseBeRoTrackerFile(bytes, 'a.brt', create))!;
    // The first note cell from row 8 of order 0 on; transpose it an octave.
    const p = song.songPositions[0];
    const len = song.patterns[p].length;
    let at: { row: number; ch: number } | null = null;
    for (let r = 8; r < len && !at; r++) for (let c = 0; c < song.numChannels && !at; c++) {
      const n = song.patterns[p].channels[c].rows[r].note;
      if (n > 0 && n < 85) at = { row: r, ch: c };
    }
    expect(at).not.toBeNull();
    const { row, ch } = at!;
    const cell = { ...song.patterns[p].channels[ch].rows[row] };
    cell.note += 12;
    const m = await create();
    const offset = beRoTrackerCellOffset(len, row, ch);
    const bytesNew = beRoTrackerEncodeCell(m, cell);
    // Encode is decode's inverse: the edited cell poked in reads back as the edited cell, the rest unchanged.
    const want = gridCells(song, p).map((r) => r.map((c) => ({ ...c })));
    want[row][ch] = cell;
    open(m, bytes, [{ pattern: p, offset, bytes: bytesNew.slice(0, 4) }, { pattern: p, offset: offset + 6, bytes: bytesNew.slice(6, 10) }]);
    expect(readBeRoTrackerPattern(m, m._brt_play_pattern(p), len, song.numChannels)).toEqual(want);
    m._brt_close();
    const pokes: Poke[] = [
      { pattern: p, offset, bytes: bytesNew.slice(0, 4) },
      { pattern: p, offset: offset + 6, bytes: bytesNew.slice(6, 10) },
    ];
    let rowCall = -1;
    const plain = play(m, bytes, 30, (order, r, f) => { if (rowCall < 0 && order === 0 && r === row) rowCall = f; });
    const poked = play(m, bytes, 30, () => {}, pokes);
    expect(rowCall).toBeGreaterThan(0);
    let diff = -1;
    for (let i = 0; i < Math.min(plain.length, poked.length); i++) if (plain[i] !== poked[i]) { diff = i >> 1; break; }
    // Same audio up to the render call the row starts in, changed after.
    expect(diff, `row ${row} channel ${ch}`).toBeGreaterThanOrEqual(rowCall);
    expect(diff).toBeLessThan(rowCall + 64 * FRAMES);
  }, 120_000);
});
