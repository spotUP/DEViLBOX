/**
 * Regression: MaxTrax (MXTX) native playback contract.
 *
 * The song "played silent" because the parser tagged it with `uadeEditableFileData`
 * (which routes playback to UADEEditableSynth — UADE returns ret=-1 for MaxTrax → silence)
 * and produced placeholder synths instead of real Sampler instruments. Native playback
 * requires:
 *   1. nativeSamplePlayback === true  — so the TS scheduler drives + triggers the samplers
 *      (and the song is NOT funneled into the empty-XM libopenmpt fresh-song path).
 *   2. maxTraxFileData set, uadeEditableFileData UNSET — so it is not UADE-routed but still
 *      exports byte-exactly via the MXTX magic dispatch.
 *   3. Real Sampler instruments carrying sample data.
 *   4. Every note cell references an instrument id that actually exists.
 *
 * Fixtures: public/data/songs/maxtrax/*.mxtx (real MXTX modules).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseMaxTraxFile, isMaxTraxFormat } from '../MaxTraxParser';

const DIR = join(process.cwd(), 'public/data/songs/maxtrax');
const files = readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.mxtx'));

const load = (name: string) => readFileSync(join(DIR, name));

describe('MaxTrax native playback contract', () => {
  it('has real fixtures', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const name of files) {
    it(`${name} parses to a TS-scheduler-playable sample song`, () => {
      const buf = load(name);
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      expect(isMaxTraxFormat(ab)).toBe(true);
      const song = parseMaxTraxFile(ab, name) as any;

      // 1. Drives the TS scheduler (not the empty-XM libopenmpt path).
      expect(song.nativeSamplePlayback).toBe(true);

      // 2. Export bytes live in maxTraxFileData, NOT uadeEditableFileData (no UADE routing).
      expect(song.maxTraxFileData).toBeInstanceOf(ArrayBuffer);
      expect(song.maxTraxFileData.byteLength).toBe(ab.byteLength);
      expect(song.uadeEditableFileData).toBeUndefined();

      // 3. Real Sampler instruments with sample data.
      expect(song.instruments.length).toBeGreaterThan(0);
      const samplers = song.instruments.filter(
        (i: any) => i.synthType === 'Sampler' && i.sample,
      );
      expect(samplers.length).toBeGreaterThan(0);

      // 4. Every note cell references an existing instrument id (else silent notes).
      const ids = new Set<number>(song.instruments.map((i: any) => i.id));
      for (const pat of song.patterns) {
        for (const chan of pat.channels) {
          for (const cell of chan.rows) {
            if (cell.note > 0 && cell.note < 97) {
              expect(ids.has(cell.instrument), `cell inst ${cell.instrument} exists`).toBe(true);
            }
          }
        }
      }
    });
  }
});
