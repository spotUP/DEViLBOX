/**
 * Furnace instrument.cpp: before version 193 the AY/AY8930 wave macro is stored one lower and the loader adds 1.
 * The old-INST importer re-encodes instruments as INS2 tagged with the song version, which the engine
 * (readFeatureMA/readInsData, version<193) converts again. The re-encode must hold the on-disk value so
 * the engine's single +1 yields the same macro the TS parser shows.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { parseFurnaceSong } from '../FurnaceSongParser';
import { parseInstrument } from '../furnace/FurnaceInstrumentParser';
import { BinaryReader } from '../../../../utils/BinaryReader';

// Old INST-format songs (version < 127) with AY instruments carrying a wave macro
const FILES = [
  'public/data/songs/furnace/multichip/Fusion.fur', // v99
  'public/data/songs/furnace/multichip/double-dragon-stage1.fur', // v117
  'public/data/songs/furnace/msx/Princess_of_the_Dead.fur', // v122
];

function load(path: string): ArrayBuffer {
  let b = readFileSync(path);
  if (b[0] === 0x78) b = inflateSync(b);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

describe('Furnace pre-193 AY wave macro +1 applied exactly once', () => {
  for (const path of FILES) {
    it(`${path}: rawBinaryData re-read by the engine equals the parsed macro`, async () => {
      const mod = await parseFurnaceSong(load(path));
      const ay = mod.instruments.filter((i) => (i.type === 6 || i.type === 7) && i.rawBinaryData && i.macros.some((m) => m.code === 3 && m.data.length > 0));
      expect(ay.length).toBeGreaterThan(0);
      for (const inst of ay) {
        // parseInstrument on INS2 bytes with version < 193 does what the engine does: stored value + 1
        const engine = parseInstrument(new BinaryReader(inst.rawBinaryData!.buffer.slice(inst.rawBinaryData!.byteOffset, inst.rawBinaryData!.byteOffset + inst.rawBinaryData!.byteLength) as ArrayBuffer));
        const want = inst.macros.find((m) => m.code === 3)!.data;
        const got = engine.macros.find((m) => m.code === 3)!.data;
        expect(got).toEqual(want);
        expect(Math.min(...want)).toBeGreaterThanOrEqual(1); // tone bit always set after conversion
      }
    });
  }
});
