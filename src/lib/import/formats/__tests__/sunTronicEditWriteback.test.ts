import { describe, it, expect } from 'vitest';
import { parseSunTronicFile, readFixture } from './sunTestUtil';
import { applySunNoteEdit } from '../sunReproject';
import { decodeSunGroup } from '../sunGroupCodec';
import { parseSunTronicV13Score } from '../SunTronicV13';
import type { SunTronicNativeData } from '../sunNativeData';

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

    // capture originalNote (raw, transpose=0) BEFORE applySunNoteEdit mutates the pool cell
    const originalRawNote = nd.blocks[fp][row].note;

    // The pool stores raw notes (decoded at transpose=0). applySunNoteEdit takes a
    // DISPLAY note and undoes the position's transpose: rawNote = editedNote + transpose
    // (display = poolNote - transpose, so the inverse ADDS transpose). Use voice=0,
    // position=0 and find the actual transpose so we can compute the expected pool
    // value and assert the round-trip correctly.
    const transpose0 = nd.positions[0].transpose[0];
    const originalDisplayNote = originalRawNote - transpose0;   // what the grid shows
    const editedDisplayNote = originalDisplayNote + 2;          // display note 2 semitones up
    const expectedPoolNote = editedDisplayNote + transpose0;    // = originalRawNote + 2

    const before = Array.from(L.encoder.encodePattern(nd.blocks[fp], 0));
    applySunNoteEdit(nd, fp, row, 0, editedDisplayNote, 0); // voice=0, position=0
    // keep layout.blockRows aliased to nd.blocks (Task 10 wiring), or edit L.blockRows[fp][row] directly:
    L.blockRows![fp][row] = nd.blocks[fp][row];
    const after = Array.from(L.encoder.encodePattern(L.blockRows![fp], 0));
    expect(after).not.toEqual(before);            // edit reached the bytes

    // Decisive regression: decode `after` back and verify the edited note is present.
    // Pool is always decoded at transpose=0, so decodedNote should equal expectedPoolNote.
    // This fails if the encoder emitted zero bytes (old const sunTronicV13Encoder path)
    // or if encodeSunGroup wrote the wrong pitch.
    const rawBuf = new Uint8Array(readFixture('ready'));
    const score = parseSunTronicV13Score(rawBuf);
    const widths = { arpShift: score.arpShift, volSlideRateFromStream: score.volSlideRateFromStream };
    const numSampled = score.sampledInstruments.length;
    const afterU8 = new Uint8Array(after);

    // Walk decodeSunGroup across `after` to reach the `row`-th group.
    let pos = 0;
    let curInstr = 0;
    let decodedNote = -1;
    for (let r = 0; r <= row; r++) {
      const result = decodeSunGroup(afterU8, pos, 0, curInstr, numSampled, widths, afterU8.length);
      if (r === row) decodedNote = result.cell.note;
      curInstr = result.curInstr;
      pos = result.nextPos;
    }

    expect(decodedNote).toBe(expectedPoolNote);
  });
  it('rest edit under nonzero transpose stores pool note 0 (not negative)', () => {
    // Regression: old code stored editedNote - transpose = 0 - 5 = -5 (negative),
    // which encodeSunGroup silently drops. New code maps editedNote<=0 -> rawNote=0.
    const nd: SunTronicNativeData = {
      blocks: [[{ note: 40, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }]],
      positions: [{ blockIndex: [0, 0, 0, 0], transpose: [5, 5, 5, 5] }],
      widths: { arpShift: 4, volSlideRateFromStream: false },
      numSampled: 0,
    };
    applySunNoteEdit(nd, 0, 0, 0, 0, 0); // rest edit (editedNote=0) under transpose 5
    expect(nd.blocks[0][0].note).toBe(0); // must be 0 (rest), not -5
  });

  it('real note edit below transpose floor clamps to pool note 1 (not non-positive)', () => {
    // rawNote = editedNote + transpose. A negative position transpose can push a real
    // display note below 1; the encoder silently drops non-positive raw notes, so we
    // clamp to max(1, ...). Here 3 + (-5) = -2 -> clamped to 1.
    const nd: SunTronicNativeData = {
      blocks: [[{ note: 40, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }]],
      positions: [{ blockIndex: [0, 0, 0, 0], transpose: [-5, -5, -5, -5] }],
      widths: { arpShift: 4, volSlideRateFromStream: false },
      numSampled: 0,
    };
    applySunNoteEdit(nd, 0, 0, 0, 3, 0); // editedNote=3, transpose=-5 -> raw would be -2
    expect(nd.blocks[0][0].note).toBe(1); // clamped to 1, not -2
  });

  it('unedited blocks still encode byte-exact (verbatim path intact)', () => {
    const song = parseSunTronicFile(readFixture('ready'), 'ready');
    const L = song.uadeVariableLayout!;
    for (let fp = 0; fp < L.numFilePatterns; fp++)
      expect(Array.from(L.encoder.encodePattern(L.blockRows![fp], 0)))
        .toEqual(Array.from(L.blockRawBytes![fp]));
  });
});
