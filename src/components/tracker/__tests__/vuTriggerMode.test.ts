import { describe, it, expect } from 'vitest';
import { engineFedMeterTarget } from '../waveformVuLevel';

describe('channel VU meters in trigger mode (engine-fed channels)', () => {
  it('trigger mode does not follow a held level like live mode does', () => {
    expect(engineFedMeterTarget('realtime', 0.6, 0.6)).toBe(0.6);
    expect(engineFedMeterTarget('trigger', 0.6, 0.6)).toBe(0);
  });
  it('trigger mode flashes on the frame a note starts', () => {
    expect(engineFedMeterTarget('trigger', 0.7, 0)).toBe(0.7);
  });
  it('a silent channel stays dark in both modes', () => {
    expect(engineFedMeterTarget('trigger', 0, 0.5)).toBe(0);
    expect(engineFedMeterTarget('realtime', 0, 0)).toBe(0);
  });
});
