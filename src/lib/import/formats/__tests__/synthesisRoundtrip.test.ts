/**
 * Regression: Synthesis (.syn) write-back transposed every note by two octaves.
 *
 * The parser decodes a note byte with synNoteToXM (xm = noteIdx - 36), but the encoder
 * reversed it as `noteIdx = xmNote + 12` instead of `+ 36`, so every note cell was rewritten
 * 24 semitones (two octaves) too low — a corrupted file for any unedited note. The encoder now
 * uses the correct inverse (xmNote + 36).
 *
 * Known limitation (unexercised): decodeCell clamps decoded notes to XM 1-96, so note indices
 * outside 37-132 are not byte-exact. No fixture exercises them and the format has no public
 * source, so a verbatim carrier would be unverifiable.
 *
 * Fixture: public/data/songs/synthesis/space sound.syn (committed real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSynthesisFile } from '../SynthesisParser';
import { getCellFileOffset } from '@engine/uade/UADEPatternEncoder';

const FIXTURE = join(process.cwd(), 'public/data/songs/synthesis/space sound.syn');

describe('Synthesis pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over the whole pattern region', () => {
    const b = readFileSync(FIXTURE);
    const raw = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    const song = parseSynthesisFile(raw, 'space sound.syn');
    expect(song, 'parser returned a song').toBeTruthy();
    const layout = song!.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell) {
      throw new Error('layout incomplete');
    }

    let checked = 0;
    let sawNote = false; // at least one real note cell — the previously-transposed case
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = getCellFileOffset(layout, p, r, c);
          if (off < 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          if ((orig[0] ?? 0) > 0) sawNote = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawNote, 'fixture has at least one note cell').toBe(true);
  });
});
