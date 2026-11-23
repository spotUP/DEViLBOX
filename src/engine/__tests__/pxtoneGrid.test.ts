/**
 * pxtone editability stage 3: the tick grid over the event list (wasm pxtone_grid_*), read from a real
 * .ptcop, and a grid cell edit reaching the event list and pxtone_write.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadWebBundle, type WebBundle } from '@/test/wasm/webBundle';
import { readPxtoneGrid, editPxtoneCell, PXTONE_ROWS_PER_BEAT, type PxtoneWasmModule } from '@/lib/import/formats/PxtoneWasmGrid';

const ROOT = process.cwd();
const src = new Uint8Array(readFileSync(join(ROOT, 'public/data/songs/piston-collage/obj1263-1.ptcop')));
let b: WebBundle<PxtoneWasmModule>;
const heap = () => b.heap();

beforeAll(async () => {
  b = await loadWebBundle<PxtoneWasmModule>(join(ROOT, 'public/pxtone/Pxtone.js'), join(ROOT, 'public/pxtone/Pxtone.wasm'), 'createPxtone');
}, 60_000);

describe('pxtone grid', () => {
  it('carrier holds every event and each ON is a cell', () => {
    const g = readPxtoneGrid(b.module, src, heap);
    const ons = [...Array(g.events.length / 4).keys()].filter((i) => g.events[i * 4 + 2] === 1).length;
    expect(ons).toBeGreaterThan(0);
    expect(g.cells.length).toBe(ons);
    expect(g.cells.every((c) => c.note >= 1 && c.note <= 96 && c.unit < g.units && c.durRows >= 1)).toBe(true);
    expect(g.cells.some((c) => c.row > 0)).toBe(true);
  });

  it('a cell edit reaches the event list and the written file', () => {
    const g = readPxtoneGrid(b.module, src, heap);
    const t = g.cells.find((c) => c.row >= PXTONE_ROWS_PER_BEAT && c.row * g.beatClock % PXTONE_ROWS_PER_BEAT === 0)!;
    const newNote = t.note === 60 ? 61 : 60;
    const ev = editPxtoneCell(b.module, t.unit, t.row, newNote, heap);
    const clock = Math.floor(t.row * g.beatClock / PXTONE_ROWS_PER_BEAT);
    const find = (e: Int32Array, kind: number) => [...Array(e.length / 4).keys()].map((i) => [...e.slice(i * 4, i * 4 + 4)])
      .find((r) => r[0] === clock && r[1] === t.unit && r[2] === kind);
    expect(find(ev, 2)?.[3]).toBe((newNote + 38) * 256);

    // the written file, read back, shows the new pitch in the grid
    const m = b.module;
    const n = m._pxtone_write();
    expect(n).toBeGreaterThan(0);
    const out = new Uint8Array(heap().buffer, m._pxtone_write_data(), n).slice();
    const g2 = readPxtoneGrid(m, out, heap);
    expect(g2.cells.find((c) => c.row === t.row && c.unit === t.unit)?.note).toBe(newNote);

    // clearing the cell removes the ON
    editPxtoneCell(m, t.unit, t.row, 0, heap);
    expect(m._pxtone_grid_build(PXTONE_ROWS_PER_BEAT)).toBe(g2.cells.length - 1);
  });
});
