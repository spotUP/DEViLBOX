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

describe('encoder sends all 180 note map entries (index = row note)', () => {
  it('entry 150 lands at its own 8-byte slot after the sample header', () => {
    const base = getDefaultFurnaceConfig('FurnaceOPNB')!;
    const noteMap = Array.from({ length: 180 }, (_, note) => ({ note, frequency: 0, sample: -1 }));
    noteMap[150] = { note: 150, frequency: 7, sample: 3 };
    const bytes = encodeFurnaceInstrument({ ...base, amiga: { initSample: 0, useNoteMap: true, useSample: true, useWave: false, waveLen: 0, noteMap } }, 'x');
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const sampleOffset = dv.getUint32(20, true);
    const slot = sampleOffset + 4 + 150 * 8;
    expect(bytes.length).toBe(sampleOffset + 4 + 180 * 8);
    expect(dv.getInt32(slot, true)).toBe(7);
    expect(dv.getInt16(slot + 4, true)).toBe(3);
  });
});
