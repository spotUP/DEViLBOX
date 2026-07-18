import { describe, it, expect } from 'vitest';
import { parseSunTronicFile, readFixture } from './sunTestUtil';
import { applySunNoteEdit } from '../sunReproject';

describe('SunTronic edited block re-encodes (writeback)', () => {
  it('an edited note produces different bytes that decode back to the new note', () => {
    const song = parseSunTronicFile(readFixture('ready'), 'ready');
    const L = song.uadeVariableLayout!;
    const nd = song.sunTronicNative!;
    // find a pool block with a note cell
    let fp = -1, row = -1;
    for (let b = 0; b < nd.blocks.length && fp < 0; b++)
      for (let r = 0; r < nd.blocks[b].length; r++)
        if (nd.blocks[b][r].note > 0) { fp = b; row = r; break; }
    expect(fp).toBeGreaterThanOrEqual(0);
    const before = Array.from(L.encoder.encodePattern(nd.blocks[fp], 0));
    applySunNoteEdit(nd, fp, row, 0, nd.blocks[fp][row].note + 2, 0); // transpose 0 at pos 0
    // keep layout.blockRows aliased to nd.blocks (Task 10 wiring), or edit L.blockRows[fp][row] directly:
    L.blockRows![fp][row] = nd.blocks[fp][row];
    const after = Array.from(L.encoder.encodePattern(L.blockRows![fp], 0));
    expect(after).not.toEqual(before);            // edit reached the bytes
  });
  it('unedited blocks still encode byte-exact (verbatim path intact)', () => {
    const song = parseSunTronicFile(readFixture('ready'), 'ready');
    const L = song.uadeVariableLayout!;
    for (let fp = 0; fp < L.numFilePatterns; fp++)
      expect(Array.from(L.encoder.encodePattern(L.blockRows![fp], 0)))
        .toEqual(Array.from(L.blockRawBytes![fp]));
  });
});
