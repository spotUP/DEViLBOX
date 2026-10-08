/**
 * A channel button in the master FX takes effect on the beat, not at the click.
 *
 * Owner, 2026-10-08: "the channel on/offs in the master fx's needs to be
 * quantized, maybe a quantize switch that is on by default". Row, speed and
 * BPM come from the Dub Deck's grid (msToNextGridBoundary); only the row is
 * pinned here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let row = 0;
vi.mock('@/engine/dub/dubGrid', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/engine/dub/dubGrid')>()),
  getCurrentRow: () => row,
}));

import { requestChannelRouting, usePendingChannelRouting, channelRoutingWaitMs } from '../quantizedChannelRouting';
import { useSettingsStore } from '@stores/useSettingsStore';
import { useTransportStore } from '@stores/useTransportStore';

const pick = { selectedChannels: [1], channelRole: undefined };

describe('master FX channel buttons, quantized', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useTransportStore.setState({ isPlaying: true, bpm: 120, speed: 6 } as never);
    useSettingsStore.setState({ masterFxQuantize: true } as never);
    row = 2; // half way through a beat; at 120 BPM a beat is 500 ms
  });
  afterEach(() => { vi.useRealTimers(); usePendingChannelRouting.setState({ pending: {} }); });

  it('is on by default', () => {
    expect(useSettingsStore.getInitialState().masterFxQuantize).toBe(true);
  });

  it('a mid-beat click changes the routing at the next beat, not at the click', () => {
    const apply = vi.fn();
    requestChannelRouting('fx', pick, apply);
    expect(apply).not.toHaveBeenCalled();
    expect(usePendingChannelRouting.getState().pending.fx).toEqual(pick); // the button already shows it
    vi.advanceTimersByTime(240);
    expect(apply).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20); // 250 ms to the boundary
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith('fx', pick);
    expect(usePendingChannelRouting.getState().pending.fx).toBeUndefined();
  });

  it('a click just after a beat waits for the following one, not for the one just gone', () => {
    row = 0.2;
    expect(channelRoutingWaitMs()).toBeGreaterThan(400);
  });

  it('clicks before the boundary fold into one change carrying the latest pick', () => {
    const apply = vi.fn();
    requestChannelRouting('fx', { selectedChannels: [1], channelRole: undefined }, apply);
    requestChannelRouting('fx', { selectedChannels: [1, 2], channelRole: undefined }, apply);
    vi.advanceTimersByTime(300);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith('fx', { selectedChannels: [1, 2], channelRole: undefined });
  });

  it('with Quantize off the click changes the routing at once', () => {
    useSettingsStore.setState({ masterFxQuantize: false } as never);
    const apply = vi.fn();
    requestChannelRouting('fx', pick, apply);
    expect(apply).toHaveBeenCalledWith('fx', pick);
  });

  it('with nothing playing the click changes the routing at once', () => {
    useTransportStore.setState({ isPlaying: false } as never);
    const apply = vi.fn();
    requestChannelRouting('fx', pick, apply);
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
