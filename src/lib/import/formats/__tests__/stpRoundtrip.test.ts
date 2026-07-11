/**
 * Regression: SoundTracker Pro II (.stp) pattern write-back was lossy.
 *
 * Each 4-byte STP cell is [instr, note, command, param]. decodeCell renders a narrow
 * XM view where the command/param bytes lose information because convertSTPEffect is
 * many-to-one and reverseSTPEffect is not its inverse:
 *   - STP command 0x0C (set volume) decodes to XM 0x0C, but reverseSTPEffect maps XM
 *     0x0C back to STP 0x04 -> command byte rewritten 0x0C -> 0x04;
 *   - the tempo command decodes param>>4, dropping the low nibble (param 78 -> 4).
 * Instrument/note (bytes 0-1) round-trip losslessly.
 *
 * decodeCell now stashes the exact raw command/param bytes in invisible carriers
 * (cutoff/pan) and encodeSTPCell reproduces bytes 2/3 verbatim. These carriers are
 * private to the round-trip codec — the editor grid is built by parsePatternChannels,
 * which sets no such fields, so an edited grid cell arrives carrier-less and keeps the
 * canonical (lossy) derivation.
 *
 * Fixture: public/data/songs/formats/noname.stp (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSTPFile } from '../STPParser';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/noname.stp');

describe('SoundTracker Pro II pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every pattern cell', async () => {
    const b = readFileSync(FIXTURE);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const raw = new Uint8Array(ab);
    const song = await parseSTPFile(ab, 'noname.stp');
    const layout = song.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell || !layout.getCellFileOffset) {
      throw new Error('layout incomplete');
    }

    let checked = 0;
    let sawSetVolume = false;   // command 0x0C -> XM 0x0C -> STP 0x04 (many-to-one reverse)
    let sawTempoDrop = false;   // tempo command whose param>>4 drops the low nibble
    for (let p = 0; p < song.patterns.length; p++) {
      const pat = song.patterns[p];
      for (let r = 0; r < pat.length; r++) {
        for (let c = 0; c < pat.channels.length; c++) {
          const off = layout.getCellFileOffset(p, r, c);
          if (off <= 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          if (orig[2] === 0x0C) sawSetVolume = true;
          if (orig[2] === 0x0F && (orig[3] & 0x0F) !== 0) sawTempoDrop = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawSetVolume, 'fixture exercises a set-volume command the reverse map mangles').toBe(true);
    expect(sawTempoDrop, 'fixture exercises a tempo command whose low nibble is dropped').toBe(true);
  });
});
