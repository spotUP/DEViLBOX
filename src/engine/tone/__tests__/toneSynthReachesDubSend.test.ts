/**
 * A channel whose sound is a Tone synth reaches the dub bus.
 *
 * Measured 2026-10-21 on fade_away.mid (an imported MIDI of Tone synths,
 * sequenced by libopenmpt through a module without samples): the channel dub
 * sends were fed only by the engine worklet's per-channel dub outputs, which
 * carry silence for such a song, so the dub bus input stayed at 0 while the
 * master read 0.012. A wired send now also taps the channel's Tone strip.
 * Fails on revert: without the strip tap no call reaches the ToneEngine.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import type * as Tone from 'tone';

const setChannelStripDubTap = vi.fn();
vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => ({ setChannelStripDubTap }) }));
vi.mock('../../ToneEngine', () => ({ getToneEngine: () => ({ setChannelStripDubTap }) }));

import { registerTrackerStore } from '@stores/storeAccess';
import { ChannelRoutedEffectsManager, setPlayingIsolationEngine } from '../ChannelRoutedEffects';
import { setChannelStripDubTap as tapStrip, type ChannelRoutingContext, type ChannelOutput } from '../ChannelRouting';

function fakeGain() {
  const param = {
    value: 0,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn((v: number) => { param.value = v; }),
  };
  return { gain: param, connect: vi.fn(), disconnect: vi.fn() };
}

beforeAll(async () => {
  registerTrackerStore({ getState: () => ({ patterns: [{ channels: [{}, {}, {}, {}] }], currentPatternIndex: 0 }) });
  await import('../../dub/DubBus');
  const worklet = { numberOfOutputs: 64, port: { postMessage: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
  setPlayingIsolationEngine({
    isAvailable: () => true,
    getWorkletNode: () => worklet,
  } as unknown as Parameters<typeof setPlayingIsolationEngine>[0]);
}, 30000);

describe('a Tone synth channel and its dub send', () => {
  it('opening the send taps the channel strip into the send, closing it untaps', async () => {
    const mgr = new ChannelRoutedEffectsManager({} as unknown as Tone.Gain);
    const m = mgr as unknown as { channelDubGains: unknown[]; dubBusInput: unknown };
    for (let i = 0; i < 4; i++) m.channelDubGains[i] = fakeGain();
    m.dubBusInput = { context: { currentTime: 0 } };

    mgr.setChannelDubSend(2, 0.6);
    await vi.waitFor(() => expect(setChannelStripDubTap).toHaveBeenCalledWith(2, m.channelDubGains[2]));

    mgr.setChannelDubSend(2, 0);
    await vi.waitFor(() => expect(setChannelStripDubTap).toHaveBeenLastCalledWith(2, null), { timeout: 2000 });
    void mgr.dispose();
  });
});

describe('the strip dub tap', () => {
  function stripCtx() {
    const channel = { connect: vi.fn(), disconnect: vi.fn() };
    const ctx = { channelOutputs: new Map([[1, { channel } as unknown as ChannelOutput]]) } as unknown as ChannelRoutingContext;
    return { ctx, channel };
  }

  it('adds the tap next to the strip route and removes only the tap', () => {
    const { ctx, channel } = stripCtx();
    const tap = {} as Tone.InputNode;
    tapStrip(ctx, 1, tap);
    expect(channel.connect).toHaveBeenCalledWith(tap);
    expect(channel.disconnect).not.toHaveBeenCalled();
    tapStrip(ctx, 1, null);
    expect(channel.disconnect).toHaveBeenCalledWith(tap);
  });

  it('moves the tap when the send gain changes', () => {
    const { ctx, channel } = stripCtx();
    const a = {} as Tone.InputNode;
    const b = {} as Tone.InputNode;
    tapStrip(ctx, 1, a);
    tapStrip(ctx, 1, b);
    expect(channel.disconnect).toHaveBeenCalledWith(a);
    expect(channel.connect).toHaveBeenLastCalledWith(b);
  });
});
