import { describe, it, expect } from 'vitest';
import { channelMeterTarget, type ChannelMeterInput } from '../waveformVuLevel';

const base: ChannelMeterInput = {
  mode: 'realtime', trigger: null, realtimeLevel: 0, engineLevel: null,
  waveform: null, fullScale: 1, prevSource: 0,
};

describe('realtime meter follows the measured level, not note triggers', () => {
  it('a note trigger on a measured channel does not lift the meter above its level', () => {
    expect(channelMeterTarget({ ...base, trigger: 1, realtimeLevel: 0.3 }).target).toBeCloseTo(0.3, 6);
  });

  it('a note trigger on an engine-metered channel does not lift the meter above the engine level', () => {
    expect(channelMeterTarget({ ...base, trigger: 1, realtimeLevel: 0.2, engineLevel: 0.2 }).target).toBeCloseTo(0.2, 6);
  });

  it('a channel with no measured level still flashes on its notes', () => {
    expect(channelMeterTarget({ ...base, trigger: 0.5 }).target).toBeCloseTo(0.5, 6);
  });
});

describe('an engine that reports its own levels is not also metered from its waveform', () => {
  const loud = new Float32Array([0.9, -0.9]);
  it('trigger mode: no waveform onset on top of the engine triggers', () => {
    const r = channelMeterTarget({ ...base, mode: 'trigger', engineLevel: 0, waveform: loud });
    expect(r.target).toBe(0);
  });

  it('realtime mode: the engine level wins over the waveform peak', () => {
    const r = channelMeterTarget({ ...base, engineLevel: 0.1, realtimeLevel: 0.1, waveform: loud });
    expect(r.target).toBeCloseTo(0.1, 6);
  });

  it('an engine with no levels is metered from its waveform onset', () => {
    const r = channelMeterTarget({ ...base, mode: 'trigger', waveform: loud });
    expect(r.target).toBeCloseTo(0.9, 6);
    expect(r.source).toBeCloseTo(0.9, 6);
  });
});

describe('trigger mode', () => {
  it('jumps to the note volume', () => {
    expect(channelMeterTarget({ ...base, mode: 'trigger', trigger: 0.5 }).target).toBeCloseTo(0.5, 6);
  });
});
