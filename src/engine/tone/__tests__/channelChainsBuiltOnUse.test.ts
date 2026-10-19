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

const { Gain, Channel, Meter, Delay } = vi.hoisted(() => {
  class Param { value = 0; }
  class Node {
    targets: unknown[] = [];
    connect = (d: unknown) => { this.targets.push(d); };
    disconnect = (d?: unknown) => { this.targets = d === undefined ? [] : this.targets.filter((t) => t !== d); };
    dispose = () => {};
  }
  class Gain extends Node { gain = new Param(); }
  class Channel extends Node { volume = new Param(); pan = new Param(); mute = false; }
  class Meter extends Node {}
  class Delay extends Node { delayTime = new Param(); }
  return { Gain, Channel, Meter, Delay };
});
vi.mock('tone', () => ({ Gain, Channel, Meter, Delay }));
vi.mock('../../ChannelEffectsManager', () => ({ getChannelEffectsManager: () => ({ getChainInput: () => new Gain(), getChainOutput: () => new Gain() }) }));
vi.mock('../../ChannelFilterManager', () => ({ getChannelFilterManager: () => ({ getInput: () => ({}), getOutput: () => ({}), disposeAll: () => {} }) }));
vi.mock('../connectAudio', () => ({ connectAudio: vi.fn() }));

import { getChannelOutput, setChannelStripDestination, setChannelMute, setMixerChannelVolume, setMixerChannelPan, type ChannelRoutingContext } from '../ChannelRouting';

function ctx(): ChannelRoutingContext {
  return { masterInput: new Gain(), sampleDelaySec: () => 0, channelOutputs: new Map(), channelMuteStates: new Map() } as unknown as ChannelRoutingContext;
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

  it('carry the fader and pan when each call gets a new context over the same strips, as ToneEngine does', () => {
    const shared = ctx();
    const engineCtx = (): ChannelRoutingContext => ({ ...shared });
    setMixerChannelVolume(engineCtx(), 2, -20);
    setMixerChannelPan(engineCtx(), 2, 0.5);
    getChannelOutput(engineCtx(), 2);
    const out = shared.channelOutputs.get(2) as unknown as { channel: InstanceType<typeof Channel> };
    expect(out.channel.volume.value).toBe(-20);
    expect(out.channel.pan.value).toBe(0.5);
  });

  it('send their strip to the channel effect it is routed into, built before or after the route', () => {
    // A master effect aimed at a synth channel routes that channel's strip into
    // the effect; the strip must not also reach the master input.
    const c = ctx();
    const effect = new Gain();
    setChannelStripDestination(c, 1, effect as never);   // route recorded before the strip exists
    getChannelOutput(c, 1);
    const strip = (c.channelOutputs.get(1) as unknown as { channel: InstanceType<typeof Channel> }).channel;
    expect(strip.targets).toContain(effect);
    expect(strip.targets).not.toContain(c.masterInput);

    setChannelStripDestination(c, 1, null);              // effect removed: back to the master input
    expect(strip.targets).toContain(c.masterInput);
    expect(strip.targets).not.toContain(effect);

    setChannelStripDestination(c, 1, effect as never);   // strip already built
    expect(strip.targets).toContain(effect);
    expect(strip.targets).not.toContain(c.masterInput);
  });
});
