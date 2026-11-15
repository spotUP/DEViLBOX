import { describe, it, expect } from 'vitest';
import { FurnaceParser } from '../FurnaceParser';
import { encodeInstrumentAsINS2 } from '../furnace/FurnaceInstrumentParser';

// Standalone .fui load must read the SN feature with Furnace's layout (instrument.cpp readFeatureSN),
// the same layout the song-load parser and the INS2 encoder use.
describe('FurnaceParser SN feature', () => {
  it('reads ADSR, gain and sustain where Furnace writes them', () => {
    const snes = { a: 11, d: 5, s: 3, r: 21, useEnv: true, sus: 2, gainMode: 0, gain: 0x6A, d2: 19 };
    const bytes = encodeInstrumentAsINS2({ name: 'Pad', type: 29, macros: [], samples: [], wavetables: [], snes }, 228);
    const { config } = FurnaceParser.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    expect(config.snes).toEqual(snes);
  });
});
