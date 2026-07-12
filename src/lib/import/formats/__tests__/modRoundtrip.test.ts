/**
 * Regression: plain ProTracker MOD had a two-octave note-naming mismatch between
 * the parser's display grid and the pattern codec. parseMODFile derived each grid
 * note via periodToNote() (ProTracker "C-1=856" naming) → noteNameToIndex, giving
 * XM 13 for period 856, but encodeMODCell/decodeMODCell use the app-wide XM
 * convention (XM 37 = C-3 = period 856). So editing a MOD note wrote the period
 * back two octaves off, and the encoderRoundtrip harness measured only ~55% of
 * cells byte-exact (encode-parsed method — the mod layout has no decodeCell, so it
 * encodes the parsed grid cell directly).
 *
 * Fix (root cause, not a carrier): the parser's PERIOD_TABLE now uses XM octave
 * labels (856 = 'C-3'), so noteNameToIndex(periodToNote(period)) matches
 * encodeMODCell(note) exactly and every table period round-trips byte-for-byte.
 *
 * On revert (PERIOD_TABLE two octaves low) the grid note re-encodes to the wrong
 * period and this fails.
 *
 * Fixture: public/data/songs/audio-sculpture/m.mod (real 4-channel M.K. module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseMODFile } from '../MODParser';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';

const FIXTURE = join(process.cwd(), 'public/data/songs/audio-sculpture/m.mod');

describe('MOD pattern grid round-trip', () => {
  it('encodeMODCell(parsed grid cell) is byte-exact over every pattern cell', async () => {
    const b = readFileSync(FIXTURE);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const raw = new Uint8Array(ab);
    const song = await parseMODFile(ab, 'm.mod');
    const layout = song.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.encodeCell) throw new Error('layout incomplete');
    expect(layout.formatId).toBe('mod');
    // encode-parsed: the mod layout has no decodeCell — it encodes the parsed grid.
    expect(layout.decodeCell).toBeUndefined();
    expect(layout.bytesPerCell).toBe(4);

    let checked = 0;
    let sawNote = false; // a real note cell — the two-octave bug rewrote these periods
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = getCellFileOffset(layout, p, r, c);
          if (off < 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          const cell = song.patterns[p]?.channels[c]?.rows[r];
          if (!cell) continue;
          if ((cell.note ?? 0) > 0) sawNote = true;
          const re = layout.encodeCell(cell);
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawNote, 'fixture exercises real note cells').toBe(true);
  });
});
