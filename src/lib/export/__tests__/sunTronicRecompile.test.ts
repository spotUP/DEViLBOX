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
  it('edit -> export -> re-parse: the edited note survives, others untouched', () => {
    const song = parseSunTronicFile(readFixture('ready'), 'ready');
    const nd = song.sunTronicNative!;
    // Find the first pool cell that carries an actual note.
    let fp = -1, row = -1;
    for (let b = 0; b < nd.blocks.length && fp < 0; b++)
      for (let r = 0; r < nd.blocks[b].length; r++)
        if (nd.blocks[b][r].note > 0) { fp = b; row = r; break; }
    expect(fp).toBeGreaterThanOrEqual(0);

    const newRaw = nd.blocks[fp][row].note + 2;
    const editedInstr = nd.blocks[fp][row].instrument;
    const editedEffTyp = nd.blocks[fp][row].effTyp;
    const editedEff = nd.blocks[fp][row].eff;
    // Baseline a note in a DIFFERENT block that must survive the round-trip.
    expect(nd.blocks.length).toBeGreaterThan(1);
    let otherBlock = -1, otherRow = -1;
    for (let b = 0; b < nd.blocks.length && otherBlock < 0; b++) {
      if (b === fp) continue;
      for (let r = 0; r < nd.blocks[b].length; r++) {
        if (nd.blocks[b][r].note > 0) { otherBlock = b; otherRow = r; break; }
      }
    }
    expect(otherBlock).toBeGreaterThanOrEqual(0);
    const otherNote = nd.blocks[otherBlock][otherRow].note;

    // applySunNoteEdit takes the DISPLAY note at a position and stores the raw
    // pool note (raw = displayNote - position transpose). The pool is decoded at
    // transpose 0, so to land `newRaw` in the pool we pass the display note for
    // position 0 = newRaw + positions[0].transpose[voice]. (`ready`'s position-0
    // transpose is non-zero, so a literal 0 would shift the stored raw.)
    const pos0Transpose = nd.positions[0].transpose[0];
    applySunNoteEdit(nd, fp, row, 0, newRaw + pos0Transpose, 0); // -> raw = newRaw
    song.uadeVariableLayout!.blockRows![fp][row] = nd.blocks[fp][row];

    const res = exportAsSunTronic(song);
    const reloadedBuf = res.data.slice().buffer as ArrayBuffer;
    const reloaded = parseSunTronicFile(reloadedBuf, 'ready-edited');
    const rnd = reloaded.sunTronicNative!;

    // The edited pool cell decodes to the new raw note.
    expect(rnd.blocks[fp][row].note).toBe(newRaw);
    // Instrument + FX on the edited cell are unchanged.
    expect(rnd.blocks[fp][row].instrument).toBe(editedInstr);
    expect(rnd.blocks[fp][row].effTyp).toBe(editedEffTyp);
    expect(rnd.blocks[fp][row].eff).toBe(editedEff);
    // A note in a different block is untouched.
    expect(rnd.blocks[otherBlock][otherRow].note).toBe(otherNote);
  });
  it('unedited export stays byte-identical (fast path)', () => {
    const song = parseSunTronicFile(readFixture('ready'), 'ready');
    const res = exportAsSunTronic(song);
    expect(Array.from(new Uint8Array(res.data)))
      .toEqual(Array.from(new Uint8Array(song.uadeEditableFileData!)));
  });
});
