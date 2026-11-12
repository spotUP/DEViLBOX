import { describe, it, expect } from 'vitest';
import { exportToVGM } from '../VGMExporter';
import { FurnaceChipType } from '../../../engine/chips/FurnaceChipEngine';

const HEADER = 0x100;
const data = (vgm: Uint8Array) => Array.from(vgm.slice(HEADER, HEADER + 6));

describe('VGM export of the YM2610', () => {
  it('writes port 0 and port 1 as 0x58 and 0x59 and the clock at 0x4C', () => {
    const vgm = exportToVGM([
      { timestamp: 0, chipType: FurnaceChipType.OPNB, port: 0x28, data: 0xf1 },
      { timestamp: 0, chipType: FurnaceChipType.OPNB, port: 0x130, data: 0x7f },
    ]);
    const view = new DataView(vgm.buffer);
    expect(data(vgm)).toEqual([0x58, 0x28, 0xf1, 0x59, 0x30, 0x7f]);
    expect(view.getUint32(0x4c, true)).toBe(8000000);
  });

  it('sets bit 31 of the clock for the YM2610B', () => {
    const vgm = exportToVGM([{ timestamp: 0, chipType: FurnaceChipType.OPNB_B, port: 0x10, data: 1 }]);
    expect(new DataView(vgm.buffer).getUint32(0x4c, true)).toBe((8000000 | 0x80000000) >>> 0);
    expect(data(vgm).slice(0, 3)).toEqual([0x58, 0x10, 1]);
  });

  it('still writes the YM2612 as 0x52 and 0x53', () => {
    const vgm = exportToVGM([
      { timestamp: 0, chipType: FurnaceChipType.OPN2, port: 0x28, data: 1 },
      { timestamp: 0, chipType: FurnaceChipType.OPN2, port: 0x130, data: 2 },
    ]);
    expect(data(vgm)).toEqual([0x52, 0x28, 1, 0x53, 0x30, 2]);
    expect(new DataView(vgm.buffer).getUint32(0x4c, true)).toBe(0);
  });
});
