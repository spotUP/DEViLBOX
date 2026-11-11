import { describe, it, expect } from 'vitest';
import { encodeFurnaceInstrument, resolveInsType, DIV_INS_AY, DIV_INS_ADPCMA, DIV_INS_ADPCMB, DIV_INS_FM } from '../FurnaceInstrumentEncoder';
import { encodeInstrumentAsINS2, parseInstrument } from '@lib/import/formats/furnace/FurnaceInstrumentParser';
import { BinaryReader } from '@/utils/BinaryReader';
import { getDefaultFurnaceConfig } from '@engine/factories/furnaceDefaultConfig';

describe('divInsType names the Furnace instrument type', () => {
  const base = getDefaultFurnaceConfig('FurnaceOPNB')!;
  it('absent: an OPNB instrument stays FM', () => {
    expect(resolveInsType({ ...base, divInsType: undefined })).toBe(DIV_INS_FM);
    expect(encodeFurnaceInstrument({ ...base, divInsType: undefined }, 'x')[3]).toBe(DIV_INS_FM);
  });
  it('set: wins over the chip type, byte 3 of the blob', () => {
    for (const t of [DIV_INS_AY, DIV_INS_ADPCMA, DIV_INS_ADPCMB]) {
      expect(resolveInsType({ ...base, divInsType: t })).toBe(t);
      expect(encodeFurnaceInstrument({ ...base, divInsType: t }, 'x')[3]).toBe(t);
    }
  });
});

describe('INS2 round trip keeps type and initSample', () => {
  for (const [type, label] of [[DIV_INS_AY, 'SSG'], [DIV_INS_ADPCMA, 'ADPCM-A'], [DIV_INS_ADPCMB, 'ADPCM-B']] as const) {
    it(label, () => {
      const inst = { name: label, type, macros: [], samples: [4], wavetables: [],
        amiga: { initSample: 4, useNoteMap: false, useSample: true, useWave: false, waveLen: 0 } };
      const bytes = encodeInstrumentAsINS2(inst, 228);
      const back = parseInstrument(new BinaryReader(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer));
      expect(back.type).toBe(type);
      expect(back.amiga?.initSample).toBe(4);
    });
  }
});
