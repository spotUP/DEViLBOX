/**
 * T0AST grid = what the engine plays. Each song is parsed (C++ cell decode, T0astEdit build) and
 * played by the same engine in node; at every row the sequencer reaches, the grid position holds
 * the pattern the engine is in, and that pattern's grid cells equal the engine's own cells. Then
 * a live poke (C++ encode) changes the audio only from the poked row on.
 * Real songs in test-data/t0ast (Modland, git-ignored); cases skip without them.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { parseT0astFile } from '@/lib/import/formats/T0astParser';
import { readT0astPattern, t0astCellOffset, t0astEncodeCell, type T0astEditModule } from '@/engine/t0ast/t0astEditWasm';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const ROOT = resolve(__dirname, '../../../..');
const DIR = join(ROOT, 'test-data/t0ast');
const songs = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.t0ast')).map((f) => join(DIR, f)) : [];
const create = async (): Promise<T0astEditModule> =>
  (await import('../../../../public/t0ast/T0astEdit.js')).default({ locateFile: (f: string) => join(ROOT, 'public/t0ast', f) });

const RATE = 44100;
const FRAMES = 128;

/** Play `bytes` (after `pokes`) calling `onRow` at each new sequencer position; returns the audio. */
function play(m: T0astEditModule, bytes: Uint8Array, maxSeconds: number, onRow: (order: number, row: number, frame: number) => void,
  pokes: Array<{ offset: number; bytes: Uint8Array }> = []): Float32Array {
  const ptr = m._malloc(bytes.length);
  m.HEAPU8.set(bytes, ptr);
  const ok = m._t0ast_open(ptr, bytes.length, RATE);
  m._free(ptr);
  if (!ok) throw new Error(m.UTF8ToString(m._t0ast_error()));
  for (const p of pokes) {
    const b = m._malloc(p.bytes.length);
    m.HEAPU8.set(p.bytes, b);
    expect(m._t0ast_poke(p.offset, b, p.bytes.length)).toBe(1);
    m._free(b);
  }
  const out = m._malloc(FRAMES * 8);
  const chunks: Float32Array[] = [];
  let last = -1;
  for (let f = 0; f < maxSeconds * RATE; f += FRAMES) {
    const n = m._t0ast_render(out, FRAMES);
    const pos = m._t0ast_position();
    if (pos !== last) { last = pos; onRow(pos >> 6, pos & 63, f); } // the row started inside [f, f + n)
    chunks.push(m.HEAPF32.slice(out >> 2, (out >> 2) + n * 2));
    if (n < FRAMES) break;
  }
  m._free(out);
  m._t0ast_close();
  const all = new Float32Array(chunks.reduce((a, c) => a + c.length, 0));
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  return all;
}

const gridCells = (song: TrackerSong, p: number) =>
  Array.from({ length: 64 }, (_, r) => song.patterns[p].channels.map((ch) => ch.rows[r]));

describe('T0AST grid matches the player', () => {
  it.skipIf(songs.length === 0)('every row the engine plays sits on the grid with the engine cells', async () => {
    let rows = 0;
    for (const path of songs) {
      const bytes = new Uint8Array(readFileSync(path));
      const song = (await parseT0astFile(bytes, 'a.t0ast', create))!;
      expect(song.patterns.some((p) => p.channels.some((ch) => ch.rows.some((c) => c.note !== 0))), path).toBe(true);
      const m = await create();
      const checked = new Set<number>();
      play(m, bytes, 600, (order, row) => {
        rows++;
        const p = m._t0ast_play_pattern_index();
        expect(song.songPositions[order], `${path} order ${order} row ${row}`).toBe(p);
        if (checked.has(p)) return;
        checked.add(p);
        const engine = readT0astPattern(m, m._t0ast_play_pattern(p)).map((r) => r.slice(0, song.numChannels));
        expect(gridCells(song, p), `${path} pattern ${p}`).toEqual(engine);
      });
      expect(checked.size, path).toBeGreaterThan(0);
    }
    expect(rows).toBeGreaterThan(1000);
  }, 300_000);

  it.skipIf(songs.length === 0)('a poked note is heard from its row on, not before', async () => {
    const bytes = new Uint8Array(readFileSync(songs[0]));
    const song = (await parseT0astFile(bytes, 'a.t0ast', create))!;
    // The first note cell from row 16 of order 0 on; transpose it an octave.
    const p = song.songPositions[0];
    let at: { row: number; ch: number } | null = null;
    for (let r = 16; r < 64 && !at; r++) for (let c = 0; c < song.numChannels && !at; c++) {
      const n = song.patterns[p].channels[c].rows[r].note;
      if (n > 0 && n < 85) at = { row: r, ch: c };
    }
    expect(at).not.toBeNull();
    const { row, ch } = at!;
    const cell = { ...song.patterns[p].channels[ch].rows[row] };
    cell.note += 12;
    const m = await create();
    const poke = { offset: t0astCellOffset(p, row, ch), bytes: t0astEncodeCell(m, cell) };
    expect(Array.from(t0astEncodeCell(m, song.patterns[p].channels[ch].rows[row])).slice(2)).toEqual(Array.from(poke.bytes).slice(2));
    let rowCall = -1;
    const plain = play(m, bytes, 20, (order, r, f) => { if (rowCall < 0 && order === 0 && r === row) rowCall = f; });
    const poked = play(m, bytes, 20, () => {}, [poke]);
    expect(rowCall).toBeGreaterThan(0);
    let diff = -1;
    for (let i = 0; i < Math.min(plain.length, poked.length); i++) if (plain[i] !== poked[i]) { diff = i >> 1; break; }
    // Same audio up to the render call the row starts in, changed after.
    expect(diff, `row ${row} channel ${ch}`).toBeGreaterThanOrEqual(rowCall);
    expect(diff).toBeLessThan(rowCall + 64 * FRAMES);
  }, 120_000);
});
