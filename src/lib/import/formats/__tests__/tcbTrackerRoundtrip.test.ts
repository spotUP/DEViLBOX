/**
 * Regression: TCB Tracker ("AN COOL!") write-back corrupted notes and dropped effects.
 *
 * Two codec bugs:
 *   1. The note-byte inverse used `(xmNote-1)/12` and ignored the parser's +37+noteOffset
 *      bias, so every real note re-encoded to octave 6+ (out of TCB's 1..3 range) and was
 *      written as 0x00 — ~8% of cells silently lost their note on chip-RAM write-back.
 *   2. Only effect 0x0D was preserved; every other effect nibble in byte[1] was dropped.
 *
 * encodeTCBTrackerCell now takes the song's noteOffset and inverts the note byte exactly,
 * and decodeCell stores the raw TCB effect nibble VERBATIM, so the codec is byte-exact.
 *
 * Fixture: public/data/songs/formats/cannonfodder.tcb (committed real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseTCBTrackerFile } from '../TCBTrackerParser';
import { encodeTCBTrackerCell } from '@engine/uade/encoders/TCBTrackerEncoder';
import { getCellFileOffset } from '@engine/uade/UADEPatternEncoder';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/cannonfodder.tcb');

function loadFixture(): Uint8Array {
  const b = readFileSync(FIXTURE);
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
}

describe('TCBTracker pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over the whole pattern region', async () => {
    const buf = loadFixture();
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const song = await parseTCBTrackerFile(ab, 'cannonfodder.tcb');
    const layout = song.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell) throw new Error('layout incomplete');

    let checked = 0;
    let sawNote = false;
    let sawEffect = false;
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = getCellFileOffset(layout, p, r, c);
          if (off < 0 || off + layout.bytesPerCell > buf.length) continue;
          const orig = buf.subarray(off, off + layout.bytesPerCell);
          const cell = layout.decodeCell(orig);
          if ((orig[0] ?? 0) >= 0x10 && (orig[0] ?? 0) <= 0x3b) sawNote = true;
          if (((orig[1] ?? 0) & 0x0f) !== 0) sawEffect = true;
          const re = layout.encodeCell(cell);
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawNote, 'fixture has real notes').toBe(true);
    expect(sawEffect, 'fixture exercises a non-zero effect nibble').toBe(true);
  });

  it('standalone encodeTCBTrackerCell inverts the note byte with the song noteOffset (non-Amiga=3)', () => {
    // noteByte 0x29 = octave 2, semitone 9 → xmNote = 24+9+37+3 = 73 (non-Amiga freqs).
    const cell = { note: 73, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
    expect(encodeTCBTrackerCell(cell, 3)[0]).toBe(0x29);
    // With Amiga freqs (noteOffset=0) the same noteByte maps to xmNote 70 (= 24+9+37).
    expect(encodeTCBTrackerCell({ ...cell, note: 70 }, 0)[0]).toBe(0x29);
  });
});
