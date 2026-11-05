/**
 * David Whittaker: deleting notes in the grid must leave a module the scan still recognises.
 * apb.dw went silent after note deletes: the edit has no in-place byte write (applyDwGridEdits warns), so the
 * play path fell back to patchModuleByVariableLayout, whose encoder re-packed the tick grid's blocks from
 * carriers the tick grid does not have and zero-filled them.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDavidWhittakerFile } from '@/lib/import/formats/DavidWhittakerParser';
import { walkDavidWhittaker, DW_WALK } from '@/lib/import/formats/DavidWhittakerWasmExtractor';
import { patchModuleByVariableLayout } from '@/lib/export/layoutPatch';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';
import { buildDWGridFromWalk } from '@/lib/import/formats/davidWhittakerGrid';
import { applyDwGridEdits } from '@/lib/import/formats/davidWhittakerEdits';
import { installDwNodeFetch } from '@/lib/import/__tests__/helpers/dwNodeFetch';

let restoreFetch = () => {};
beforeAll(() => { restoreFetch = installDwNodeFetch(); });
afterAll(() => { restoreFetch(); setGridBaseline(null); });

describe('David Whittaker: deleted notes', { timeout: 120000 }, () => {
  it('apb.dw: deleting a note leaves a module whose scan still finds the song', async () => {
    const f = readFileSync(resolve(process.cwd(), 'public/data/songs/formats/apb.dw'));
    const ab = f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
    const song = await parseDavidWhittakerFile(ab.slice(0), 'apb.dw');
    const layout = (song as unknown as { uadeVariableLayout?: Parameters<typeof patchModuleByVariableLayout>[1] }).uadeVariableLayout;
    expect(layout, 'apb.dw opens with a grid').toBeTruthy();
    setGridBaseline(baselineOf(song.patterns));
    const cell = song.patterns[0].channels[0].rows[0] as unknown as Record<string, number>;
    expect(cell.note).toBeGreaterThan(0);
    cell.note = 0; cell.instrument = 0;
    const r = patchModuleByVariableLayout(ab, layout!, song.patterns);
    const after = new Uint8Array(r.bytes);
    const orig = new Uint8Array(ab);
    let diff = 0;
    for (let i = 0; i < orig.length; i++) if (orig[i] !== after[i]) diff++;
    expect(diff, 'a delete that cannot be written in place must not change any byte of the module').toBe(0);
    const walk = await walkDavidWhittaker(after.slice().buffer as ArrayBuffer);
    expect(walk.events.length).toBeGreaterThan(0);
    const again = await parseDavidWhittakerFile(after.slice().buffer as ArrayBuffer, 'apb.dw');
    expect(again.patterns.length).toBeGreaterThan(0);
  });

  it('apb.dw: deleting the first note of voice 1 is written as a mute; later onsets keep their ticks', async () => {
    const f = readFileSync(resolve(process.cwd(), 'public/data/songs/formats/apb.dw'));
    const ab = f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
    const bytes = new Uint8Array(ab);
    const walk = await walkDavidWhittaker(ab.slice(0));
    const grid = buildDWGridFromWalk(walk).patterns;
    const cell = grid[0].channels[0].rows[0] as unknown as Record<string, number>;
    expect(cell.note, 'apb.dw voice 1 starts with a note').toBeGreaterThan(0);
    const first = walk.events.find((e) => e.kind === DW_WALK.note && e.channel === 0)!;
    const edited = structuredClone(grid);
    const ec = edited[0].channels[0].rows[0] as unknown as Record<string, number>;
    ec.note = 0; ec.instrument = 0;
    const r = applyDwGridEdits(bytes, walk, edited);
    expect(r.warnings, 'the delete is written, no warning').toEqual([]);
    expect(r.data.length, 'same length: nothing shifts').toBe(bytes.length);
    expect(r.data[first.block + first.pos], 'the note byte became the mute command').toBe(0x82);

    const walk2 = await walkDavidWhittaker(r.data.slice().buffer as ArrayBuffer);
    const key = (e: { channel: number; ptick: number }) => `${e.channel}:${e.ptick}`;
    // The block is shared by every pass that plays it: those notes go too. Every other onset stays on its tick.
    const gone = new Set(walk.events.filter((e) => e.kind === DW_WALK.note && e.block === first.block && e.pos === first.pos).map(key));
    const before = walk.events.filter((e) => e.kind === DW_WALK.note).map(key).filter((k) => !gone.has(k));
    const after = walk2.events.filter((e) => e.kind === DW_WALK.note).map(key);
    expect(gone.has(key(first))).toBe(true);
    expect(after, 'the deleted note no longer starts; the others do not move').toEqual(before);
    // and it stays gone on reload: the re-parsed grid has no note on that cell
    const again = buildDWGridFromWalk(walk2).patterns[0].channels[0].rows[0] as unknown as Record<string, number>;
    expect(again.note === 0 || again.note === 97).toBe(true);
  });
});
