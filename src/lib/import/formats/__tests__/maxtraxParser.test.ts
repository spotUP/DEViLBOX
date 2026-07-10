/**
 * Regression: MaxTrax (MXTX) native playback contract.
 *
 * The song "played silent" because the parser tagged it with `uadeEditableFileData`
 * (which routes playback to UADEEditableSynth — UADE returns ret=-1 for MaxTrax → silence).
 *
 * Audio is driven entirely by the transpiled WASM replayer (MaxTraxEngine), activated by
 * NativeEngineRouting's `maxTraxFileData` entry (formats:null, suppressNotes:true — the TS
 * scheduler does NOT trigger notes). The parser output is the editable display model. The
 * contract:
 *   1. maxTraxFileData set (byte-exact), uadeEditableFileData UNSET — so playback routes to
 *      the WASM engine, not UADE, and export dispatches byte-exactly via the MXTX magic.
 *   2. Sampler instruments carrying sample data for the editor.
 *   3. Every note cell references an instrument id that actually exists.
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
    it(`${name} parses to a WASM-routed, editable sample song`, () => {
      const buf = load(name);
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      expect(isMaxTraxFormat(ab)).toBe(true);
      const song = parseMaxTraxFile(ab, name) as any;

      // 1. Byte-exact bytes in maxTraxFileData (WASM engine + MXTX export dispatch),
      //    NOT uadeEditableFileData (UADE cannot play MaxTrax → silence).
      expect(song.maxTraxFileData).toBeInstanceOf(ArrayBuffer);
      expect(song.maxTraxFileData.byteLength).toBe(ab.byteLength);
      expect(song.uadeEditableFileData).toBeUndefined();

      // 2. Sampler instruments with sample data (editor display model).
      expect(song.instruments.length).toBeGreaterThan(0);
      const samplers = song.instruments.filter(
        (i: any) => i.synthType === 'Sampler' && i.sample,
      );
      expect(samplers.length).toBeGreaterThan(0);

      // 3. Every note cell references an existing instrument id (else silent notes).
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
