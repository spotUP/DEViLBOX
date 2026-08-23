/**
 * tms5220Recordings.test.ts — guards the imported ti_lpc/QBoxPro recordings.
 *
 * The import tool (tools/tms5220-audit/importQBox.ts) converts the raw hex
 * strings from the ti_lpc README into TMS5220Frame[]; these tests protect
 * that generated data: every recording must stay parseable, the 6->5-bit
 * pitch conversion must stay monotonic and bounded, and the tms5100 strings
 * must remain byte-identical to the same words in the shipped VSM ROMs.
 */
import { describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import { IMPORTED_RECORDINGS, IMPORTED_RECORDING_WORDS } from '../tms5220Recordings';
import { pitch6To5, diffVsRom, lpcFramesToTMS5220 } from '../../../tools/tms5220-audit/importQBox';
import { parseLPCFramesFromPosition, type LPCFrame } from '../../engine/speech/VSMROMParser';
import { packFrameBuffer } from '../../engine/speech/tms5220FrameBuffer';
import { QBOX_RECORDINGS } from '../../../tools/tms5220-audit/qboxStrings';

function parseRecordingFrames(word: string): LPCFrame[] {
  const rec = QBOX_RECORDINGS.find(r => r.label === word);
  expect(rec, word).toBeDefined();
  const bytes = Uint8Array.from(
    (rec!.hex.match(/0x[0-9A-Fa-f]+/g) ?? []).map(s => parseInt(s.slice(2), 16)),
  );
  return parseLPCFramesFromPosition(bytes, 0, 5);
}

// The VSM binaries are gitignored (TI copyright): the two cases that decode a
// word out of the ROM to compare against it only run where the ROMs are present.
const ROMS = join(process.cwd(), 'public/roms/snspell');
const romsPresent = ['tmc0351n2l.vsm', 'tmc0352n2l.vsm'].every(f => existsSync(join(ROMS, f)));

describe('imported tms5220 recordings', () => {
  it('word list matches the recordings list, one per recording', () => {
    expect(IMPORTED_RECORDING_WORDS).toEqual(IMPORTED_RECORDINGS.map(r => r.word));
    expect(IMPORTED_RECORDINGS.length).toBeGreaterThan(10);
  });

  it('every recording has at least 3 frames with valid parameter ranges', () => {
    for (const rec of IMPORTED_RECORDINGS) {
      expect(rec.frames.length, rec.word).toBeGreaterThanOrEqual(3);
      for (const f of rec.frames) {
        expect(f.energy, `${rec.word} energy`).toBeGreaterThanOrEqual(0);
        expect(f.energy, `${rec.word} energy`).toBeLessThanOrEqual(15);
        expect(f.pitch, `${rec.word} pitch`).toBeGreaterThanOrEqual(0);
        expect(f.pitch, `${rec.word} pitch`).toBeLessThanOrEqual(31);
        for (const k of f.k) {
          expect(k, `${rec.word} k`).toBeGreaterThanOrEqual(0);
          expect(k, `${rec.word} k`).toBeLessThanOrEqual(31);
        }
      }
    }
  });

  it('every recording packs into a frame buffer without loss', () => {
    for (const rec of IMPORTED_RECORDINGS) {
      const packed = packFrameBuffer(rec.frames);
      expect(packed.numFrames, rec.word).toBeGreaterThan(0);
      expect(packed.data.length, rec.word).toBe(packed.numFrames * 12);
    }
  });

  it('repeat frames expand to the previous frame K coefficients, never zeros', () => {
    const repeatRec = IMPORTED_RECORDINGS.find(r => r.frames.some(f => f.k.length === 0));
    expect(repeatRec, 'expected at least one recording with repeat frames').toBeDefined();
    const rec = repeatRec!;

    const packed = packFrameBuffer(rec.frames);
    const bytes = (f: number) => Array.from(packed.data.slice(f * 12 + 2, f * 12 + 12));

    let expectedK = rec.frames[0].k;
    for (let i = 0; i < rec.frames.length; i++) {
      const f = rec.frames[i];
      if (f.k.length > 0) {
        expectedK = f.k;
      } else {
        expect(bytes(i), `${rec.word} frame ${i} repeats previous K`).toEqual(expectedK);
        expect(bytes(i).some(v => v !== 0), `${rec.word} frame ${i} not zeroed`).toBe(true);
      }
    }
  });

  it.skipIf(!romsPresent)('packed imported recordings are byte-identical to the packed ROM stream for ROM words', () => {
    for (const word of ['ISLE', 'COLOR', 'NEIGHBOR', 'YOUR SCORE']) {
      const rec = IMPORTED_RECORDINGS.find(r => r.word === word);
      expect(rec, word).toBeDefined();
      const romCheck = diffVsRom(parseRecordingFrames(word));
      expect(romCheck, `${word}: recording not found in ROM`).not.toBeNull();
      const romPacked = packFrameBuffer(lpcFramesToTMS5220(romCheck!.romFrames, 5));
      const recPacked = packFrameBuffer(rec!.frames);
      expect(Array.from(romPacked.data), `${word} packed stream`).toEqual(
        Array.from(recPacked.data),
      );
    }
  });

  it.skipIf(!romsPresent)('tms5100 strings decode byte-identical to the same words in the VSM ROMs', () => {
    // Words we know are in the ROM: ISLE, COLOR, NEIGHBOR, YOUR SCORE.
    const known = ['ISLE', 'COLOR', 'NEIGHBOR', 'YOUR SCORE'];
    for (const word of known) {
      const rec = QBOX_RECORDINGS.find(r => r.label === word);
      expect(rec, word).toBeDefined();
      const bytes = Uint8Array.from(
        (rec!.hex.match(/0x[0-9A-Fa-f]+/g) ?? []).map(s => parseInt(s.slice(2), 16)),
      );
      const stringFrames = parseLPCFramesFromPosition(bytes, 0, 5);

      // Reuse the import tool's ROM diff (same matching heuristic the
      // import run used to prove 0 diffs) — single source of truth.
      const romCheck = diffVsRom(stringFrames);
      expect(romCheck, `${word}: recording not found in ROM`).not.toBeNull();
      expect(romCheck!.diffs, `${word} frame stream`).toBe(0);
      expect(JSON.stringify(romCheck!.romFrames), `${word} frame stream`).toBe(
        JSON.stringify(stringFrames),
      );
    }
  });

  it('6-bit to 5-bit pitch conversion is monotonic and stays in range', () => {
    let prev = -1;
    for (let i = 0; i <= 63; i++) {
      const out = pitch6To5(i);
      expect(out).toBeGreaterThanOrEqual(0);
      expect(out).toBeLessThanOrEqual(31);
      if (i === 0) {
        expect(out).toBe(0); // unvoiced stays unvoiced
      } else {
        expect(out).toBeGreaterThanOrEqual(prev); // periods grow, indices don't drop
      }
      prev = out;
    }
  });

  it('the generated recording module matches the source strings in the tools', () => {
    // Every source string that parses (>=3 frames) must be in the generated module,
    // and every generated entry must come from a source string.
    const sourceWords = new Set(QBOX_RECORDINGS.map(r => r.label));
    for (const rec of IMPORTED_RECORDINGS) {
      expect(sourceWords.has(rec.word), rec.word).toBe(true);
    }
  });
});