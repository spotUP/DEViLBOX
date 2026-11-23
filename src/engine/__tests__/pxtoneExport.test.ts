/**
 * pxtone stage 5: exportPxtone writes the song's own event list, also after another song was loaded into the
 * wasm singleton; an unedited export reloads to the identical grid, an edit shows in the reloaded grid.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadWebBundle, type WebBundle } from '@/test/wasm/webBundle';
import { readPxtoneGrid, editPxtoneCell, type PxtoneWasmModule } from '@/lib/import/formats/PxtoneWasmGrid';
import { exportPxtone } from '@/lib/export/PxtoneExporter';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const ROOT = process.cwd();
const rd = (f: string): Uint8Array => new Uint8Array(readFileSync(join(ROOT, 'public/data/songs', f)));
const a = rd('piston-collage/obj1263-1.ptcop');
const other = rd('piston-collage-protected/obj0983-1.pttune');
let b: WebBundle<PxtoneWasmModule>;

vi.mock('@/lib/import/formats/PxtoneWasmGrid', async (orig) => {
  const real = await orig<typeof import('@/lib/import/formats/PxtoneWasmGrid')>();
  return { ...real, getPxtoneWasm: async () => b.module };
});

beforeAll(async () => {
  b = await loadWebBundle<PxtoneWasmModule>(join(ROOT, 'public/pxtone/Pxtone.js'), join(ROOT, 'public/pxtone/Pxtone.wasm'), 'createPxtone');
}, 60_000);

const songOf = (file: Uint8Array, events: Int32Array): TrackerSong =>
  ({ format: 'PxTone', name: 't', pxtoneFileData: file.slice().buffer, pxtoneEvents: events }) as unknown as TrackerSong;
const cellsOf = (bytes: Uint8Array) => JSON.stringify(readPxtoneGrid(b.module, bytes, () => b.heap()).cells);

describe('pxtone export', () => {
  it('unedited export reloads to the identical grid, after another song was loaded', async () => {
    const g = readPxtoneGrid(b.module, a, () => b.heap());
    readPxtoneGrid(b.module, other, () => b.heap()); // wasm now holds the other song
    const out = new Uint8Array(await (await exportPxtone(songOf(a, g.events))).data.arrayBuffer());
    expect(cellsOf(out)).toBe(JSON.stringify(g.cells));
  }, 60_000);

  it('an edit made before another song was loaded survives the export', async () => {
    const g = readPxtoneGrid(b.module, a, () => b.heap());
    const t = g.cells.find((c) => c.row >= 4)!;
    const note = t.note === 60 ? 61 : 60;
    const events = editPxtoneCell(b.module, t.unit, t.row, note, () => b.heap());
    readPxtoneGrid(b.module, other, () => b.heap());
    const out = new Uint8Array(await (await exportPxtone(songOf(a, events))).data.arrayBuffer());
    const back = readPxtoneGrid(b.module, out, () => b.heap()).cells.find((c) => c.row === t.row && c.unit === t.unit);
    expect(back?.note).toBe(note);
  }, 60_000);
});
