import { describe, it, expect, beforeAll } from 'vitest';
import { WaveformProcessor } from '../WaveformProcessor';

class FakeBuffer {
  length!: number; numberOfChannels!: number; sampleRate!: number; private d: Float32Array[];
  constructor(o: { length: number; numberOfChannels: number; sampleRate: number }) {
    Object.assign(this, o);
    this.d = Array.from({ length: o.numberOfChannels }, () => new Float32Array(o.length));
  }
  getChannelData(c: number) { return this.d[c]; }
}

const make = (vals: number[], rate = 8000) => {
  const b = new (globalThis as unknown as { AudioBuffer: typeof AudioBuffer }).AudioBuffer({ length: vals.length, numberOfChannels: 1, sampleRate: rate });
  b.getChannelData(0).set(vals);
  return b;
};
const arr = (b: AudioBuffer) => Array.from(b.getChannelData(0)).map((v) => Math.round(v * 100) / 100);

describe('WaveformProcessor Furnace sample ops', () => {
  beforeAll(() => { (globalThis as unknown as { AudioBuffer: unknown }).AudioBuffer = FakeBuffer; });

  it('pasteReplace overwrites and extends past the end', () => {
    expect(arr(WaveformProcessor.pasteReplace(make([0.1, 0.2, 0.3]), 2, make([0.5, 0.6])))).toEqual([0.1, 0.2, 0.5, 0.6]);
  });
  it('pasteMix sums and clamps', () => {
    expect(arr(WaveformProcessor.pasteMix(make([0.5, 0.9]), 0, make([0.25, 0.5])))).toEqual([0.75, 1]);
  });
  it('resize truncates and pads', () => {
    expect(arr(WaveformProcessor.resize(make([0.1, 0.2, 0.3]), 2))).toEqual([0.1, 0.2]);
    expect(arr(WaveformProcessor.resize(make([0.1, 0.2]), 4))).toEqual([0.1, 0.2, 0, 0]);
  });
  it('insertSilence splices zeros', () => {
    expect(arr(WaveformProcessor.insertSilence(make([0.1, 0.2]), 1, 2))).toEqual([0.1, 0, 0, 0.2]);
  });
  it('resample doubles length and interpolates', () => {
    const r = WaveformProcessor.resample(make([0, 1], 8000), 16000);
    expect(r.length).toBe(4);
    expect(r.sampleRate).toBe(16000);
    expect(arr(r)).toEqual([0, 0.5, 1, 1]);
  });
});
