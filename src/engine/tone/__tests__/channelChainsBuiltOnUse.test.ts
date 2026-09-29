/**
 * Mixer state does not build channel chains; playing a channel does.
 *
 * setChannelMute / setMixerChannelVolume / setMixerChannelPan built a
 * channel's whole chain (input, Tone.Channel, meter, effect chain, HPF/LPF)
 * when it did not exist yet. The mixer re-applies all 16 channels' state, so
 * every song got 16 chains processed each quantum - about 150 unused nodes on
 * a 4-channel MOD (2026-09-29 audio trace).
 */
import { describe, it, expect, vi } from 'vitest';

const { Gain, Channel, Meter } = vi.hoisted(() => {
  class Param { value = 0; }
  class Node { connect = () => {}; disconnect = () => {}; dispose = () => {}; }
  class Gain extends Node { gain = new Param(); }
  class Channel extends Node { volume = new Param(); pan = new Param(); mute = false; }
  class Meter extends Node {}
  return { Gain, Channel, Meter };
});
vi.mock('tone', () => ({ Gain, Channel, Meter }));
vi.mock('../../ChannelEffectsManager', () => ({ getChannelEffectsManager: () => ({ getChainInput: () => new Gain(), getChainOutput: () => new Gain() }) }));
vi.mock('../../ChannelFilterManager', () => ({ getChannelFilterManager: () => ({ getInput: () => ({}), getOutput: () => ({}), disposeAll: () => {} }) }));
vi.mock('../connectAudio', () => ({ connectAudio: vi.fn() }));

import { getChannelOutput, setChannelMute, setMixerChannelVolume, setMixerChannelPan, type ChannelRoutingContext } from '../ChannelRouting';

function ctx(): ChannelRoutingContext {
  return { masterInput: new Gain(), channelOutputs: new Map(), channelMuteStates: new Map() } as unknown as ChannelRoutingContext;
}

describe('channel chains', () => {
  it('are not built by the mixer re-applying state to 16 channels', () => {
    const c = ctx();
    for (let ch = 0; ch < 16; ch++) {
      setChannelMute(c, ch, false);
      setMixerChannelVolume(c, ch, -6);
      setMixerChannelPan(c, ch, 0.5);
    }
    expect(c.channelOutputs.size).toBe(0);
  });

  it('carry the mixer state set before they were built', () => {
    const c = ctx();
    setChannelMute(c, 2, true);
    setMixerChannelVolume(c, 2, -12);
    setMixerChannelPan(c, 2, -0.25);
    getChannelOutput(c, 2);
    const out = c.channelOutputs.get(2) as unknown as { channel: InstanceType<typeof Channel> };
    expect(out.channel.mute).toBe(true);
    expect(out.channel.volume.value).toBe(-12);
    expect(out.channel.pan.value).toBe(-0.25);
  });
});
