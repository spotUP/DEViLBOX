/**
 * The Ixalance grid (ixs_grid.cpp, decoded by the replayer's own IT unpacker) is the music the
 * replayer plays: every row the engine plays (IXS_rowHook row log) carries the grid's notes and
 * instruments on every channel. A save with no edit reopens to the same grid, and an edited note
 * survives save and reopen. Real songs from the corpus.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ixalanceEditModule, ixalanceGrid, ixalanceEdited } from '@/engine/ixalance/ixalanceEditWasm';

const SONGS = ['andes.ixs', 'cave.ixs', 'ixalance-theme.ixs'];
const MAX_ROWS = 4000;
/** IT note byte (row log) -> tracker note, the convention ixs_grid.cpp decodes with. */
const trackerNote = (n: number) => (n === 0 ? 0 : n < 120 ? n + 1 : 97);

describe('Ixalance wasm grid matches the replayer', () => {
  for (const name of SONGS) {
    const bytes = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/formats', name)));

    it(`${name}: every played row has the grid's notes and instruments`, async () => {
      const grid = await ixalanceGrid(bytes);
      expect(grid.patterns.length).toBeGreaterThan(0);
      const m = await ixalanceEditModule();
      const ptr = m._malloc(bytes.length);
      m.HEAPU8.set(bytes, ptr);
      m._ixs_rowlog_enable(1);
      expect(m._ixalance_init(ptr, bytes.length)).toBe(0);
      const buf = m._malloc(16384 * 8);
      for (let i = 0; i < 200000 && m._ixs_rowlog_count() < MAX_ROWS; i++) if (!m._ixalance_render(buf, 16384)) break;
      const count = m._ixs_rowlog_count();
      const size = m._ixs_rowlog_record_size();
      const lp = m._ixs_rowlog_ptr();
      const log = m.HEAPU8.slice(lp, lp + count * size);
      m._ixs_rowlog_enable(0);
      m._ixalance_stop();
      m._free(buf);
      m._free(ptr);
      expect(count).toBeGreaterThan(100);
      const bad: string[] = [];
      for (let i = 0; i < count; i++) {
        const rec = log.subarray(i * size);
        const pat = rec[1], row = rec[2] | (rec[3] << 8);
        const cells = grid.patterns[pat]?.[row];
        if (!cells) { bad.push(`pattern ${pat} row ${row} not in the grid`); continue; }
        for (let c = 0; c < 64; c++) {
          const g = cells[c] ?? { note: 0, instrument: 0 };
          const n = trackerNote(rec[4 + c]), ins = rec[68 + c];
          if (g.note !== n || g.instrument !== ins) { bad.push(`pattern ${pat} row ${row} ch ${c}: grid ${g.note}/${g.instrument} played ${n}/${ins}`); break; }
        }
      }
      expect(bad.slice(0, 5)).toEqual([]);
    });

    it(`${name}: save keeps the grid, an edited note survives save and reopen`, async () => {
      const grid = await ixalanceGrid(bytes);
      const same = await ixalanceGrid((await ixalanceEdited(bytes, gridAsPatterns(grid.patterns, grid.channels))).data);
      expect(same.patterns).toEqual(grid.patterns);
      const edited = grid.patterns.map((p) => p.map((r) => r.map((c) => ({ ...c }))));
      const p = grid.order[0] ?? 0;
      const row = edited[p].findIndex((r) => r[0].note === 0);
      edited[p][row][0] = { ...edited[p][row][0], note: 49, instrument: 1 };
      const back = await ixalanceGrid((await ixalanceEdited(bytes, gridAsPatterns(edited, grid.channels))).data);
      expect(back.patterns[p][row][0].note).toBe(49);
      expect(back.patterns[p][row][0].instrument).toBe(1);
    });
  }
});

function gridAsPatterns(patterns: { note: number; instrument: number }[][][], channels: number) {
  return patterns.map((rows) => ({ channels: Array.from({ length: channels }, (_, ch) => ({ rows: rows.map((r) => r[ch]) })) }));
}
