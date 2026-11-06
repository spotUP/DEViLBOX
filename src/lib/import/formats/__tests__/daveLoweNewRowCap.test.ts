/**
 * Dave Lowe New: a section longer than 256 rows loads and exports in full.
 * Both parsers capped a pattern at 256 rows, so the tail of a longer section was cut from the grid and the grid
 * re-encode (the only export path of a Dave Lowe edit) wrote the section back without it.
 *
 * Fixture: public/data/songs/dave-lowe-new/m-bison.dln. Measured: its longest pattern is 1024 rows (one pattern is
 * above 256); incredibleshrinkingsphere.dl (Dave Lowe) peaks at 144 rows, so no real Dave Lowe song reaches the cap.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDaveLoweNewFile } from '../DaveLoweNewParser';
import { patchModuleByVariableLayout } from '@/lib/export/layoutPatch';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';

afterAll(() => setGridBaseline(null));

const load = () => {
  const f = readFileSync(resolve(process.cwd(), 'public/data/songs/dave-lowe-new/m-bison.dln'));
  const ab = f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
  return { ab, parse: () => parseDaveLoweNewFile(ab.slice(0), 'm-bison.dln') };
};

describe('Dave Lowe New: sections past 256 rows', () => {
  it('m-bison.dln: the long section loads in full, exports byte-exact unedited, and a tail edit survives export and reload', async () => {
    const { ab, parse } = load();
    const song = await parse();
    const layout = (song as unknown as { uadeVariableLayout: UADEVariablePatternLayout }).uadeVariableLayout;
    const orig = new Uint8Array(ab);

    const pi = song.patterns.findIndex((p) => p.length > 256);
    expect(pi, 'a pattern longer than 256 rows').toBeGreaterThanOrEqual(0);
    const pat = song.patterns[pi];
    // a note past row 256 on a channel whose section is longer than the cap
    let ch = -1, row = -1;
    for (let c = 0; c < 4 && ch < 0; c++) {
      for (let r = pat.length - 1; r >= 256; r--) if (pat.channels[c].rows[r].note > 0) { ch = c; row = r; break; }
    }
    expect(ch, 'a note in the tail (past row 256)').toBeGreaterThanOrEqual(0);

    // unedited: the grid re-encode of every block reproduces the section bytes (the tail included)
    setGridBaseline(baselineOf(song.patterns));
    const same = patchModuleByVariableLayout(ab, layout, song.patterns);
    expect(Array.from(same.bytes)).toEqual(Array.from(orig));
    const fp = layout.trackMap[pi][ch];
    const addr = layout.filePatternAddrs[fp];
    const size = layout.filePatternSizes[fp];
    const carried = layout.encoder.encodePattern(layout.blockRows![fp], ch);
    expect(Array.from(carried), 'the carrier rows encode to the section bytes').toEqual(Array.from(orig.subarray(addr, addr + size)));
    // the grid re-encode keeps the tail: its last note is still there (instrument commands are not in the grid)
    const gridBytes = layout.encoder.encodePattern(pat.channels[ch].rows, ch);
    expect(gridBytes.length, 'the grid re-encode carries the whole long section').toBeGreaterThan(1000);

    // edited tail note
    const cell = pat.channels[ch].rows[row] as unknown as Record<string, number>;
    const was = cell.note;
    cell.note = was + 2;
    const out = patchModuleByVariableLayout(ab, layout, song.patterns);
    expect(out.refused, 'the re-encoded section fits its slot').toEqual([]);
    expect(out.patched, 'the edit wrote bytes').toBeGreaterThan(0);
    const again = await parseDaveLoweNewFile(out.bytes.slice().buffer as ArrayBuffer, 'm-bison.dln');
    const back = again.patterns[pi].channels[ch].rows;
    expect(again.patterns[pi].length, 'the long pattern is still long').toBe(pat.length);
    expect(back[row].note, 'the tail edit reloads').toBe(was + 2);
    cell.note = was;
    for (let r = 0; r < pat.length; r++) if (r !== row) expect(back[r].note, `row ${r}`).toBe(pat.channels[ch].rows[r].note);
  });
});
