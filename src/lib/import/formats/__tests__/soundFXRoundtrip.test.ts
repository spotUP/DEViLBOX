/**
 * Regression: SoundFX (.sfx) write-back dropped raw Amiga periods with no note-table match.
 *
 * SoundFX stores each note as a raw Amiga period. Its period range is wider than the ProTracker
 * MOD table, so periods that decode to a note BELOW the MOD range (e.g. period 538 -> note 21)
 * have no canonical xmNoteToPeriod inverse (it returns 0). The old encoder re-derived the period
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
    // A cell whose source period has no canonical inverse (xmNoteToPeriod(note) !== period) —
    // the previously-lost pitch case that only cell.period preservation round-trips.
    let sawOutOfTablePeriod = false;
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = getCellFileOffset(layout, p, r, c);
          if (off < 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          const cell = layout.decodeCell(orig);
          const period = ((orig[0] << 8) | orig[1]);
          if (cell.note > 0 && period > 0 && xmNoteToPeriod(cell.note) !== period) {
            sawOutOfTablePeriod = true;
          }
          const re = layout.encodeCell(cell);
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawOutOfTablePeriod, 'fixture exercises a period with no canonical note inverse').toBe(true);
  });
});
