import { describe, it, expect } from 'vitest';
import { exportAsSunTronic } from '../SunTronicExporter';
import { parseSunTronicFile, readFixture } from '@/lib/import/formats/__tests__/sunTestUtil';
import { parseSunTronicV13Score } from '@/lib/import/formats/SunTronicV13';
import { applySunNoteEdit } from '@/lib/import/formats/sunReproject';

describe('SunTronic recompile on length change', () => {
  it('inserting a longer group re-lays blocks and the module re-parses', () => {
    const song = parseSunTronicFile(readFixture('ready'), 'ready');
    const nd = song.sunTronicNative!;
    // force a length change: give a pool cell a note that had none (adds a note byte)
    let fp = -1, row = -1;
    for (let b = 0; b < nd.blocks.length && fp < 0; b++)
      for (let r = 0; r < nd.blocks[b].length; r++)
        if (nd.blocks[b][r].note === 0 && nd.blocks[b][r].sunRaw?.length === 1) { fp = b; row = r; break; }
    expect(fp).toBeGreaterThanOrEqual(0);
    applySunNoteEdit(nd, fp, row, 0, 48, 0);
    song.uadeVariableLayout!.blockRows![fp][row] = nd.blocks[fp][row];
    const res = exportAsSunTronic(song);
    // must NOT throw and must re-parse cleanly
    const reparsed = parseSunTronicV13Score(new Uint8Array(res.data));
    expect(reparsed.blocks.length).toBe(nd.blocks.length);
    for (const e of reparsed.subsongs[0].entries)
      for (const tp of e.trackPtrs)
        if (tp > 0) expect(reparsed.blockIndexByOffset.has(tp)).toBe(true);
  });
  it('unedited export stays byte-identical (fast path)', () => {
    const song = parseSunTronicFile(readFixture('ready'), 'ready');
    const res = exportAsSunTronic(song);
    expect(Array.from(new Uint8Array(res.data)))
      .toEqual(Array.from(new Uint8Array(song.uadeEditableFileData!)));
  });
});
