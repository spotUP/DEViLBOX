import { describe, it, expect } from 'vitest';
import { batchesToGbEvents, gbCaptureFromBatches } from '../gb/gbCapture';
import { FurnaceDispatchPlatform as P } from '../../../engine/furnace-dispatch/platforms';

const b = (platformType: number, sample: number, ...pairs: number[]) => ({ platformType, sample, pairs: new Int32Array(pairs) });

describe('batchesToGbEvents', () => {
  it('maps APU offsets to $FF00 bus addresses and keeps value, sample and order', () => {
    const ev = batchesToGbEvents([
      b(P.GB, 10, 0x12, 0xf0, 0x14, 0x87, 0x25, 0xff),
      b(P.GB, 20, 0x1a, 0x00, 0x30, 0x01, 0x3f, 0xfe, 0x1a, 0x80),
    ]);
    expect(ev).toEqual([
      { kind: 'write', sample: 10, addr: 0xff12, value: 0xf0 },
      { kind: 'write', sample: 10, addr: 0xff14, value: 0x87 },
      { kind: 'write', sample: 10, addr: 0xff25, value: 0xff },
      { kind: 'write', sample: 20, addr: 0xff1a, value: 0x00 },
      { kind: 'write', sample: 20, addr: 0xff30, value: 0x01 },
      { kind: 'write', sample: 20, addr: 0xff3f, value: 0xfe },
      { kind: 'write', sample: 20, addr: 0xff1a, value: 0x80 },
    ]);
  });

  it('ignores other chips and keeps pseudo-addresses as control events', () => {
    const ev = batchesToGbEvents([
      b(P.NES, 1, 0x4000, 0xbf),
      b(P.GB, 2, 0xffff0201, 1234),
    ]);
    expect(ev).toEqual([{ kind: 'control', sample: 2, control: 1, channel: 2, value: 1234 }]);
  });

  it('records sample rate and tick rate', () => {
    const cap = gbCaptureFromBatches([b(P.GB, 0, 0x21, 0x08)], 48000, 59.7275);
    expect(cap.sampleRate).toBe(48000);
    expect(cap.tickRateHz).toBe(59.7275);
    expect(cap.events).toHaveLength(1);
  });
});
