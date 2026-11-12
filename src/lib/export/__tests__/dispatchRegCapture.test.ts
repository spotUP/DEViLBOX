import { describe, it, expect } from 'vitest';
import { batchesToRegisterWrites, vgmChipTypeOfPlatform } from '../dispatchRegCapture';
import { FurnaceChipType } from '../../../engine/chips/FurnaceChipEngine';
import { FurnaceDispatchPlatform } from '../../../engine/furnace-dispatch/platforms';

describe('batchesToRegisterWrites', () => {
  const P = FurnaceDispatchPlatform.YM2610_FULL;

  it('maps YM2610 pairs to log entries, keeping order and timestamps', () => {
    const log = batchesToRegisterWrites([
      { platformType: P, sample: 100, pairs: [0x28, 0xf0, 0x30, 0x71] },
      { platformType: P, sample: 900, pairs: new Int32Array([0x101, 0xc0]) },
    ]);
    expect(log).toEqual([
      { timestamp: 100, chipType: FurnaceChipType.OPNB, port: 0x28, data: 0xf0 },
      { timestamp: 100, chipType: FurnaceChipType.OPNB, port: 0x30, data: 0x71 },
      { timestamp: 900, chipType: FurnaceChipType.OPNB, port: 0x101, data: 0xc0 },
    ]);
  });

  it('keeps the port 1 bit (0x100) and masks the value to a byte', () => {
    const [w] = batchesToRegisterWrites([{ platformType: P, sample: 0, pairs: [0x1a5, 0x1ff] }]);
    expect(w.port).toBe(0x1a5);
    expect(w.data).toBe(0xff);
  });

  it('drops platforms without a VGM mapping and ignores a dangling odd element', () => {
    expect(vgmChipTypeOfPlatform(4)).toBeNull();
    expect(batchesToRegisterWrites([{ platformType: 4, sample: 0, pairs: [1, 2] }])).toEqual([]);
    expect(batchesToRegisterWrites([{ platformType: P, sample: 0, pairs: [1, 2, 3] }])).toHaveLength(1);
  });
});
