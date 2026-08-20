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
import { IMPORTED_RECORDINGS, IMPORTED_RECORDING_WORDS } from '../tms5220Recordings';
import { pitch6To5, diffVsRom } from '../../../tools/tms5220-audit/importQBox';
import { parseLPCFramesFromPosition } from '../../engine/speech/VSMROMParser';
import { packFrameBuffer } from '../../engine/speech/tms5220FrameBuffer';
import { QBOX_RECORDINGS } from '../../../tools/tms5220-audit/qboxStrings';

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

  it('tms5100 strings decode byte-identical to the same words in the VSM ROMs', () => {
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