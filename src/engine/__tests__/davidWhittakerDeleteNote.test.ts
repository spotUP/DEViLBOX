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
import { walkDavidWhittaker } from '@/lib/import/formats/DavidWhittakerWasmExtractor';
import { patchModuleByVariableLayout } from '@/lib/export/layoutPatch';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';
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
});
