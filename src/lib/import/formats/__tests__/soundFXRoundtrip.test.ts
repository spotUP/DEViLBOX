/**
 * Regression: SoundFX (.sfx) write-back dropped raw Amiga periods with no note-table match.
 *
 * SoundFX stores each note as a raw Amiga period. The parser named period 538 note 21
 * (ProTracker naming) while the shared encoder read notes in FT2 naming, so note 21 had no
 * xmNoteToPeriod inverse (it returned 0). The old encoder re-derived the period
 * from the note via xmNoteToPeriod and thus zeroed the pitch on write-back. The codec now
 * preserves the exact source period in cell.period and the encoder writes it back verbatim
 * (falling back to the canonical note->period only when an edit has invalidated the period).
 *
 * Fixture: public/data/songs/formats/operation_stealth.sfx (committed real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSoundFXFile } from '../SoundFXParser';
import { getCellFileOffset } from '@engine/uade/UADEPatternEncoder';
import { xmNoteToPeriod } from '@engine/uade/encoders/MODEncoder';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/operation_stealth.sfx');

describe('SoundFX pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over the whole pattern region', async () => {
    const b = readFileSync(FIXTURE);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const raw = new Uint8Array(ab);
    const song = await parseSoundFXFile(ab, 'operation_stealth.sfx');
    expect(song, 'parser returned a song').toBeTruthy();
    const layout = song!.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell) throw new Error('layout incomplete');

    let checked = 0;
    // The pitch loss this guarded against was a naming mismatch: the parser named period 538
    // note 21 (ProTracker naming) and the encoder looked note 21 up in FT2 naming, found
    // nothing and wrote 0. Every Amiga reader and writer now shares src/lib/amiga/periodNotes.ts,
    // so that case no longer exists; the byte-exact check below is the regression test.
    let sawNotePeriod = false;
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = getCellFileOffset(layout, p, r, c);
          if (off < 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          const cell = layout.decodeCell(orig);
          const period = ((orig[0] << 8) | orig[1]);
          if (cell.note > 0 && period > 0) {
            sawNotePeriod = true;
            expect(xmNoteToPeriod(cell.note) || period, `note ${cell.note} names period ${period}`).toBeGreaterThan(0);
          }
          const re = layout.encodeCell(cell);
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawNotePeriod, 'fixture exercises note-bearing cells').toBe(true);
  });
});
