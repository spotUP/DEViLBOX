/**
 * An edited Synthesis (.syn) file lost its arpeggios: byte 2 of a track line is
 * (arpeggio << 4) | effect, the grid cell has no arpeggio field, and the encoder
 * wrote the effect nibble alone. The layout now asks writers for the stored
 * bytes (encodeOverStored) and the encoder keeps the stored high nibble.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSynthesisFile } from '@/lib/import/formats/SynthesisParser';
import { encodeSynthesisCell } from '@/engine/uade/encoders/SynthesisEncoder';

const FIXTURE = resolve(process.cwd(), 'public/data/songs/synthesis/space sound.syn');

describe('Synthesis cell encoder keeps the arpeggio', () => {
  it('an arpeggio cell survives decode, edit of its note, and encode: byte 2 keeps its high nibble', () => {
    const file = new Uint8Array(readFileSync(FIXTURE));
    const song = parseSynthesisFile(file, 'space sound.syn')!;
    const layout = song.uadePatternLayout!;
    expect(layout.encodeOverStored).toBe(true);

    // The fixture has no arpeggios: put one (index 0xA) in the first track line that has a note.
    const patched = file.slice();
    let off = 0;
    for (let r = 0; r < layout.rowsPerPattern && !off; r++) {
      const o = layout.getCellFileOffset!(0, r, 0);
      if (o && patched[o] !== 0) off = o;
    }
    expect(off).toBeGreaterThan(0);
    patched[off + 2] = (0xA << 4) | (patched[off + 2] & 0x0F);
    const stored = patched.slice(off, off + 4);

    // Unedited: byte-exact.
    const cell = layout.decodeCell!(stored);
    expect(Array.from(encodeSynthesisCell(cell, stored))).toEqual(Array.from(stored));
    // Edited note: the arpeggio stays, the note moves.
    const edited = encodeSynthesisCell({ ...cell, note: cell.note + 2 }, stored);
    expect(edited[2]).toBe(stored[2]);
    expect(edited[0]).toBe(stored[0] + 2);
  });

  it('a new cell with nothing stored writes no arpeggio, and the effect nibble is still written', () => {
    const out = encodeSynthesisCell({ note: 40, instrument: 1, volume: 0, effTyp: 0xF, eff: 3, effTyp2: 0, eff2: 0 });
    expect(out[2]).toBe(0x0F);
  });
});
