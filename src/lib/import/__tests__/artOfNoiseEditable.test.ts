/**
 * Art of Noise (.aon) is editable: one reachability test from the product load path through the live edit
 * entry (sendCellEditsToEngine) with a call-count sentinel, a byte-exact unedited export, and the shared
 * stored pattern case (positions that show one stored pattern), on the real song inside.blipp.aon.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../formats/artOfNoiseGrid', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../formats/artOfNoiseGrid')>();
  return { ...mod, applyArtOfNoiseGridEdits: vi.fn(mod.applyArtOfNoiseGridEdits) };
});

import { parseModuleToSong } from '../parseModuleToSong';
import {
  applyArtOfNoiseGridEdits, aonCellOffset, aonLinkedEdits, decodeArtOfNoiseModule, siblingPositions,
} from '../formats/artOfNoiseGrid';
import { exportArtOfNoise } from '@lib/export/ArtOfNoiseExporter';
import { liveEditRoute, sendCellEditsToEngine } from '@/engine/replayer/liveCellEdits';
import { WASM_ENGINES, shouldActivate } from '@/engine/replayer/wasmEngineRegistry';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const NAME = 'inside.blipp.aon';
const bytes = new Uint8Array(readFileSync(resolve(__dirname, '../../../../public/data/songs/art-of-noise', NAME)));
// inside.blipp.aon has no shared stored pattern; action_section.aon shows 8 of its 14 positions from shared ones.
const SHARED = 'action_section.aon';
const sharedBytes = new Uint8Array(readFileSync(resolve(__dirname, '../../../../public/data/songs/formats', SHARED)));
const load = (b = bytes, name = NAME) => parseModuleToSong(new File([b.slice().buffer as ArrayBuffer], name));
const exported = async (song: TrackerSong) => new Uint8Array(await (await exportArtOfNoise(song)).data.arrayBuffer());
const diffAt = (a: Uint8Array, b: Uint8Array) => a.reduce<number[]>((l, v, k) => (v !== b[k] ? [...l, k] : l), []);

beforeEach(() => { vi.mocked(applyArtOfNoiseGridEdits).mockClear(); });

describe('Art of Noise is editable through the product load path', () => {
  it('a grid edit reaches the module bytes through sendCellEditsToEngine and exports', async () => {
    const song = await load();
    expect(song.format).toBe('AON');
    expect(bytes.length).toBe(63356);
    expect(shouldActivate(WASM_ENGINES.find((d) => d.key === 'ArtOfNoise')!, song)).toBe(true);
    expect(liveEditRoute(song).route).toBe('aon-module');
    expect(Array.from(await exported(song))).toEqual(Array.from(bytes));

    const m = decodeArtOfNoiseModule(bytes)!;
    const pos = 0;
    const row = song.patterns[pos].channels[0].rows.findIndex((c) => c.note > 0);
    expect(row).toBeGreaterThanOrEqual(0);
    const cell = { ...song.patterns[pos].channels[0].rows[row], instrument: (song.patterns[pos].channels[0].rows[row].instrument % 60) + 1 };
    vi.mocked(applyArtOfNoiseGridEdits).mockClear();
    await sendCellEditsToEngine(song, [{ pattern: pos, row, channel: 0, cell }]);
    expect(applyArtOfNoiseGridEdits).toHaveBeenCalledTimes(1);
    const live = new Uint8Array(song.artOfNoiseFileData as ArrayBuffer);
    const off = aonCellOffset(m, m.positions[pos], row, 0);
    expect(live[off + 1] & 0x3f).toBe(cell.instrument);
    expect(diffAt(live, bytes)).toEqual([off + 1]);
  }, 60000);

  it('an edit of a shared stored pattern reaches the sibling position and only the changed cell differs', async () => {
    const song = await load(sharedBytes, SHARED);
    const m = decodeArtOfNoiseModule(sharedBytes)!;
    const pos = m.positions.findIndex((_, p) => siblingPositions(m, p).length > 0);
    expect(pos).toBeGreaterThanOrEqual(0);
    const sib = siblingPositions(m, pos)[0];
    const row = song.patterns[pos].channels[0].rows.findIndex((c) => c.note > 0);
    const before = structuredClone(song.patterns[pos]);
    const after = structuredClone(song.patterns[pos]);
    const next = (before.channels[0].rows[row].instrument % 60) + 1;
    after.channels[0].rows[row].instrument = next;
    const linked = aonLinkedEdits(sharedBytes, pos, before, after, song.patterns);
    expect(linked.some((e) => e.pattern === sib && e.row === row && e.channel === 0 && e.values.instrument === next)).toBe(true);

    // The store applies the linked edits to the grid copies; the exporter then writes one stored cell.
    song.patterns[pos] = after;
    for (const e of linked) Object.assign(song.patterns[e.pattern].channels[e.channel].rows[e.row], e.values);
    const out = await exported(song);
    expect(diffAt(out, sharedBytes)).toEqual([aonCellOffset(m, m.positions[pos], row, 0) + 1]);

    // A sibling still showing the old value never undoes the edit.
    const stale = await load(sharedBytes, SHARED);
    stale.patterns[pos].channels[0].rows[row].instrument = next;
    expect(diffAt(await exported(stale), sharedBytes)).toHaveLength(1);
  }, 60000);

  it('a note put on an empty row reaches the exported module', async () => {
    const song = await load(sharedBytes, SHARED);
    const row = song.patterns[0].channels[0].rows.findIndex((c) => c.note === 0 && c.instrument === 0 && c.effTyp === 0);
    expect(row).toBeGreaterThanOrEqual(0);
    const src = song.patterns[0].channels[0].rows.find((c) => c.note > 0)!;
    song.patterns[0].channels[0].rows[row].note = src.note;
    const back = await parseModuleToSong(new File([(await exported(song)).slice().buffer as ArrayBuffer], SHARED));
    expect(back.patterns[0].channels[0].rows[row].note).toBe(src.note);
  }, 60000);
});
