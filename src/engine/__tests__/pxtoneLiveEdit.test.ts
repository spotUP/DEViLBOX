/**
 * pxtone stage 4: a grid cell edit goes sendCellEditsToEngine -> editPxtoneCell -> PxtoneEngine.setEvents
 * with the event list that carries the typed note.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadWebBundle, type WebBundle } from '@/test/wasm/webBundle';
import { readPxtoneGrid, type PxtoneWasmModule } from '@/lib/import/formats/PxtoneWasmGrid';
import { liveEditRoute, sendCellEditsToEngine } from '@/engine/replayer/liveCellEdits';
import { PxtoneEngine } from '@/engine/pxtone/PxtoneEngine';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const ROOT = process.cwd();
const src = new Uint8Array(readFileSync(join(ROOT, 'public/data/songs/piston-collage/obj1263-1.ptcop')));
let b: WebBundle<PxtoneWasmModule>;

vi.mock('@/lib/import/formats/PxtoneWasmGrid', async (orig) => {
  const real = await orig<typeof import('@/lib/import/formats/PxtoneWasmGrid')>();
  return { ...real, getPxtoneWasm: async () => b.module };
});

beforeAll(async () => {
  b = await loadWebBundle<PxtoneWasmModule>(join(ROOT, 'public/pxtone/Pxtone.js'), join(ROOT, 'public/pxtone/Pxtone.wasm'), 'createPxtone');
}, 60_000);

describe('pxtone live edit', () => {
  it('routes to pxtone-module and swaps the edited event list into the engine', async () => {
    const g = readPxtoneGrid(b.module, src, () => b.heap());
    const t = g.cells.find((c) => c.row >= 4 && c.row % 4 === 0)!;
    const note = t.note === 60 ? 61 : 60;
    const song = {
      format: 'PxTone', pxtoneFileData: src.buffer, pxtoneEvents: g.events, numChannels: g.units,
      patterns: [{ length: 64, channels: [] }],
    } as unknown as TrackerSong;
    expect(liveEditRoute(song).route).toBe('pxtone-module');

    const setEvents = vi.fn(async () => 1);
    vi.spyOn(PxtoneEngine, 'hasInstance').mockReturnValue(true);
    vi.spyOn(PxtoneEngine, 'getInstance').mockReturnValue({ setEvents } as unknown as PxtoneEngine);
    await sendCellEditsToEngine(song, [{ pattern: 0, row: t.row, channel: t.unit, cell: { note, instrument: t.unit + 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 } as never }]);

    expect(setEvents).toHaveBeenCalledTimes(1);
    const sent = (setEvents.mock.calls[0] as unknown as [Int32Array])[0];
    const clock = Math.floor(t.row * g.beatClock / 4);
    const rec = [...Array(sent.length / 4).keys()].map((i) => [...sent.slice(i * 4, i * 4 + 4)])
      .find((r) => r[0] === clock && r[1] === t.unit && r[2] === 2);
    expect(rec?.[3]).toBe((note + 38) * 256);
    expect(song.pxtoneEvents).toBe(sent);
  }, 60_000);
});
