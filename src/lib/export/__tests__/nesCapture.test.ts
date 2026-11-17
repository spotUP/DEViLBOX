import { describe, it, expect } from 'vitest';
import { batchesToNesEvents, nesCaptureFromBatches, nesChipOfPlatform, NES_CONTROL } from '../nes/nesCapture';
import { FurnaceDispatchPlatform as P } from '../../../engine/furnace-dispatch/platforms';

const b = (platformType: number, sample: number, ...pairs: number[]) => ({ platformType, sample, pairs: new Int32Array(pairs) });

describe('batchesToNesEvents', () => {
  it('tags each chip and keeps address, value, sample and order', () => {
    const ev = batchesToNesEvents([
      b(P.NES, 10, 0x4000, 0xbf, 0x4015, 0x1f),
      b(P.VRC6, 20, 0xA001, 0x34, 0x9003, 0),
      b(P.VRC7, 30, 0x30, 0x1f, 0x10, 0x80),
      b(P.FDS, 40, 0x4080, 0xa0, 0x4040, 0x3f),
      b(P.MMC5, 50, 0x5000, 0x7f, 0x5015, 3),
      b(P.N163, 60, 0x78, 0x55, 0x7f, 0x70),
      b(P.AY8910, 70, 0x07, 0x38),
    ], { sunsoft: true });
    expect(ev.map((e) => [e.chip, e.kind === 'control' ? -1 : e.addr, e.kind === 'control' ? -1 : e.value, e.sample, e.kind])).toEqual([
      ['nes', 0x4000, 0xbf, 10, 'write'], ['nes', 0x4015, 0x1f, 10, 'write'],
      ['vrc6', 0xA001, 0x34, 20, 'write'], ['vrc6', 0x9003, 0, 20, 'write'],
      ['vrc7', 0x30, 0x1f, 30, 'write'], ['vrc7', 0x10, 0x80, 30, 'write'],
      ['fds', 0x4080, 0xa0, 40, 'write'], ['fds', 0x4040, 0x3f, 40, 'write'],
      ['mmc5', 0x5000, 0x7f, 50, 'write'], ['mmc5', 0x5015, 3, 50, 'write'],
      ['n163', 0x78, 0x55, 60, 'write'], ['n163', 0x7f, 0x70, 60, 'write'],
      ['s5b', 0x07, 0x38, 70, 'write'],
    ]);
  });

  it('keeps pseudo-addresses as control events, even as negative int32', () => {
    expect(new Int32Array([0xffff0001])[0]).toBeLessThan(0);
    const ev = batchesToNesEvents([
      b(P.NES, 5, 0xffff0001, 8287, 0xffff0004, 3, 0xffff0002, 0, 0xffff0000, 7),
      b(P.VRC6, 6, 0xffff0101, 4000, 0xffff0102, 0),
    ]);
    expect(ev).toEqual([
      { kind: 'control', chip: 'nes', sample: 5, control: NES_CONTROL.DAC_RATE, channel: 0, value: 8287 },
      { kind: 'control', chip: 'nes', sample: 5, control: NES_CONTROL.DPCM_BANK, channel: 0, value: 3 },
      { kind: 'control', chip: 'nes', sample: 5, control: NES_CONTROL.SAMPLE_STOP, channel: 0, value: 0 },
      { kind: 'control', chip: 'nes', sample: 5, control: NES_CONTROL.DAC_SAMPLE, channel: 0, value: 7 },
      { kind: 'control', chip: 'vrc6', sample: 6, control: NES_CONTROL.DAC_RATE, channel: 1, value: 4000 },
      { kind: 'control', chip: 'vrc6', sample: 6, control: NES_CONTROL.SAMPLE_STOP, channel: 1, value: 0 },
    ]);
  });

  it('marks $4011 and VRC6 digital-mode writes as timed pcm events, not plain writes', () => {
    const ev = batchesToNesEvents([b(P.NES, 99, 0x4011, 0x40), b(P.VRC6, 100, 0x9000, 0x85, 0x9000, 0x1f, 0xB000, 0x80)]);
    expect(ev.map((e) => e.kind)).toEqual(['pcm', 'pcm', 'write', 'write']);
    expect(ev[0]).toMatchObject({ sample: 99, addr: 0x4011, value: 0x40 });
  });

  it('drops unmapped platforms and 5B without the sunsoft flag; records tick rate', () => {
    expect(nesChipOfPlatform(P.AY8910)).toBeNull();
    expect(batchesToNesEvents([b(P.AY8910, 0, 1, 2), b(P.GENESIS, 0, 1, 2)])).toEqual([]);
    expect(nesCaptureFromBatches([], 48000, 60.0988).tickRateHz).toBe(60.0988);
  });
});
