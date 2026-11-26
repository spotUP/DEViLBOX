/**
 * The Psycle grid (cpsycle_grid.c, PATD chunks unpacked by the vendored beerz77 decoder) is the
 * music the cpsycle sequencer plays: every entry the sequencer plays (row-log hook in
 * sequencer.c execute_line) has the grid's note and machine at its pattern, row and track, and
 * every grid note on a played row is played. A save with no edit reopens to the same grid, and an
 * edited note survives save and reopen. Real songs (Psycle 1.x PSY3 files).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { cpsycleEditModule, cpsycleGrid, cpsycleEdited } from '@/engine/cpsycle/cpsycleEditWasm';

const SONGS = ['acidate.psy', '8bit05.psy'];
const MAX_ENTRIES = 20000;
/** Psycle note byte (row log) -> tracker note, the convention cpsycle_grid.c decodes with. */
const trackerNote = (n: number) => (n === 120 ? 97 : n < 120 ? n + 1 : 0);

describe('Psycle wasm grid matches the cpsycle sequencer', () => {
  for (const name of SONGS) {
    const bytes = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/psycle', name)));

    it(`${name}: every played entry is the grid's note and machine`, async () => {
      const grid = await cpsycleGrid(bytes);
      expect(grid.order.length).toBeGreaterThan(0);
      const m = await cpsycleEditModule();
      const ptr = m._malloc(bytes.length);
      m.HEAPU8.set(bytes, ptr);
      expect(m._cpsycle_init(ptr, bytes.length)).toBe(0);
      m._cps_rowlog_enable(1);
      const buf = m._malloc(4096 * 8);
      for (let i = 0; i < 20000 && m._cps_rowlog_count() < MAX_ENTRIES; i++) m._cpsycle_render(buf, 4096);
      const count = m._cps_rowlog_count();
      const size = m._cps_rowlog_record_size();
      const lp = m._cps_rowlog_ptr() >> 2;
      const log = m.HEAP32.slice(lp, lp + count * size);
      m._cps_rowlog_enable(0);
      m._cpsycle_stop();
      m._free(buf);
      m._free(ptr);
      expect(count).toBeGreaterThan(100);
      const bad: string[] = [];
      const played = new Map<string, Set<number>>();
      for (let i = 0; i < count; i++) {
        const [pat, row, track, note, mach] = log.subarray(i * size, i * size + 5);
        const cell = grid.patterns[pat]?.[row]?.[track];
        if (!cell) { bad.push(`pattern ${pat} row ${row} track ${track} not in the grid`); continue; }
        const ins = mach === 255 ? 0 : mach + 1;
        if (cell.note !== trackerNote(note) || cell.instrument !== ins) bad.push(`pattern ${pat} row ${row} track ${track}: grid ${cell.note}/${cell.instrument} played ${trackerNote(note)}/${ins}`);
        const k = `${pat}:${row}`;
        if (!played.has(k)) played.set(k, new Set());
        played.get(k)!.add(track);
      }
      for (const [k, tracks] of played) {
        const [pat, row] = k.split(':').map(Number);
        grid.patterns[pat][row].forEach((c, t) => { if (c.note !== 0 && !tracks.has(t)) bad.push(`pattern ${pat} row ${row} track ${t}: grid note ${c.note} not played`); });
      }
      expect(played.size).toBeGreaterThan(50);
      expect(bad.slice(0, 5)).toEqual([]);
    });

    it(`${name}: save keeps the grid, an edited note survives save and reopen`, async () => {
      const grid = await cpsycleGrid(bytes);
      const same = await cpsycleGrid((await cpsycleEdited(bytes, gridAsPatterns(grid.patterns, grid.channels))).data);
      expect(same.patterns).toEqual(grid.patterns);
      const edited = grid.patterns.map((p) => p.map((r) => r.map((c) => ({ ...c }))));
      const p = grid.order[0] ?? 0;
      const row = edited[p].findIndex((r) => r[0].note === 0);
      edited[p][row][0] = { ...edited[p][row][0], note: 49, instrument: 1 };
      const saved = await cpsycleEdited(bytes, gridAsPatterns(edited, grid.channels));
      const back = await cpsycleGrid(saved.data);
      expect(back.patterns[p][row][0].note).toBe(49);
      expect(back.patterns[p][row][0].instrument).toBe(1);
      expect(back.order).toEqual(grid.order);
    });
  }
});

function gridAsPatterns(patterns: { note: number; instrument: number }[][][], channels: number) {
  return patterns.map((rows) => ({ channels: Array.from({ length: channels }, (_, ch) => ({ rows: rows.map((r) => r[ch]) })) }));
}
