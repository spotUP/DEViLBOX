import { describe, it, expect, vi } from 'vitest';

vi.mock('tone', () => ({}));
vi.mock('../../TrackerEnvelope', () => ({ TrackerEnvelope: class {} }));
vi.mock('../../ChannelEffectsManager', () => ({ getChannelEffectsManager: () => null }));
vi.mock('../../ChannelFilterManager', () => ({ getChannelFilterManager: () => null }));
vi.mock('../connectAudio', () => ({ connectAudio: () => {} }));

import { ChannelMeterState, triggerChannelMeter, getChannelTriggerLevels } from '../ChannelRouting';

describe('channel meter trigger height', () => {
  it('a C20 note peaks at half height, not boosted towards C40', () => {
    const st = new ChannelMeterState();
    triggerChannelMeter(st, 0, 0x20 / 64);
    triggerChannelMeter(st, 1, 0x40 / 64);
    triggerChannelMeter(st, 2, 0x30 / 64);
    const levels = getChannelTriggerLevels(st, 3);
    expect(levels[0]).toBeCloseTo(0.5, 6);
    expect(levels[1]).toBeCloseTo(1, 6);
    expect(levels[2]).toBeCloseTo(0.75, 6);
  });

  it('keeps out-of-range velocities inside 0..1', () => {
    const st = new ChannelMeterState();
    triggerChannelMeter(st, 0, 1.5);
    triggerChannelMeter(st, 1, -0.2);
    const levels = getChannelTriggerLevels(st, 2);
    expect(levels[0]).toBe(1);
    expect(levels[1]).toBe(0);
  });
});
