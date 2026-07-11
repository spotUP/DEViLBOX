/**
 * Regression: SoundMon / Brian Postma (.bp) pattern write-back rewrote every note byte
 * (only ~51% of cells survived).
 *
 * Each 3-byte SoundMon cell is [ note(s8), (sample<<4)|effect, param(s8) ]. The parser
 * decodes the note through bpNoteToXM — a two-table mapping (raw index → PERIODS → nearest
 * ProTracker period → XM note) that is not a simple additive offset — but
 * encodeSoundMonCell reversed it with `xmNote - 36`, which cannot invert that mapping, so
 * every note-bearing byte was rewritten. The sample|effect byte and param byte already
 * round-trip exactly (both nibbles / the whole byte survive).
 *
 * Fix: layout.decodeCell stashes the exact source note byte in the invisible `period`
 * carrier (a field the SoundMon grid loop never sets, so edited cells fall back to the
 * additive derivation), and the encoder emits it verbatim.
 *
 * Fixture: public/data/songs/bp-soundmon-2/nicktune1.bp (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSoundMonFile } from '../SoundMonParser';

const FIXTURE = join(process.cwd(), 'public/data/songs/bp-soundmon-2/nicktune1.bp');

describe('SoundMon pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every pattern cell', async () => {
    const b = readFileSync(FIXTURE);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const raw = new Uint8Array(ab);
    const song = await parseSoundMonFile(ab, 'nicktune1.bp');
    const layout = song.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell || !layout.getCellFileOffset) {
      throw new Error('layout incomplete');
    }

    let checked = 0;
    let sawNote = false; // note-bearing cell (the two-table-mapping lane)
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = layout.getCellFileOffset(p, r, c);
          if (off <= 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          if (orig[0] !== 0) sawNote = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawNote, 'fixture exercises a note byte the mapping could not invert').toBe(true);
  });
});
