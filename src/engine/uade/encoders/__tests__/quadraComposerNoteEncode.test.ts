/**
 * G24: a Quadra Composer note typed into the grid is written at the pitch the grid shows. The parser maps the module's
 * note byte 0-35 to XM note + 13; the encoder mapped XM 37-72 back, so an edited cell lost its note (any note the song
 * itself uses, 13-48, encoded as "no note") or came out two octaves up.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseQuadraComposerFile } from '@/lib/import/formats/QuadraComposerParser';
import { encodeQCCell } from '../QuadraComposerEncoder';

describe('Quadra Composer note encoding', () => {
  it('encodes a note the module uses as the byte the parser read it from', async () => {
    const bytes = readFileSync('public/data/songs/quadra-composer/poison.emod');
    const song = await parseQuadraComposerFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, 'poison.emod');
    let checked = 0;
    for (const p of song.patterns) for (const c of p.channels) for (const cell of c.rows) {
      if (cell.note < 13 || cell.note > 48) continue;
      // the parser read byte = note - 13; encoding what the grid shows must give it back
      expect(encodeQCCell({ ...cell, period: undefined, pan: undefined, cutoff: undefined })[1]).toBe(cell.note - 13);
      if (++checked >= 40) return;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('leaves a note outside the module range as no note', () => {
    expect(encodeQCCell({ note: 60, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 })[1]).toBe(0xff);
  });
});

describe('Quadra Composer live cell fields', () => {
  it('hands the replayer the sample and the 0-35 note byte, not the grid note in the sample slot', async () => {
    const { qcLiveCellFields } = await import('../QuadraComposerEncoder');
    // C-1 (grid note 13) with sample 5: qc_set_cell(sample=5, note=0); a rest is note byte -1
    expect(qcLiveCellFields({ note: 13, instrument: 5, effTyp: 0, eff: 0 })).toEqual({ sample: 5, note: 0, effect: 0, effectArg: 0 });
    expect(qcLiveCellFields({ note: 0, instrument: 0, effTyp: 0, eff: 0 }).note).toBe(-1);
  });
});
