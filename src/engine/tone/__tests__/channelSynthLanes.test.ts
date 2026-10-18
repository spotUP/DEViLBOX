/**
 * Per-channel synth lanes: a per-channel native synth instance plays into its
 * channel strip through a lane (gain, then pitch resampler), so channel
 * volume, pan, mute and channel effects reach it like they reach samples.
 */
import { describe, it, expect, vi } from 'vitest';

const { Gain, nativeOf } = vi.hoisted(() => {
  class Param { value = 0; constructor(v = 0) { this.value = v; } }
  class FakeAudioNode {
    connections: FakeAudioNode[] = [];
    connect(n: FakeAudioNode) { this.connections.push(n); }
    disconnect(n?: FakeAudioNode) { this.connections = n ? this.connections.filter((c) => c !== n) : []; }
  }
  class Gain {
    gain: Param;
    native = new FakeAudioNode();
    connections: unknown[] = [];
    disposed = false;
    constructor(v = 1) { this.gain = new Param(v); }
    connect(n: unknown) { this.connections.push(n); this.native.connect((n as Gain).native); }
    disconnect(n?: unknown) { this.connections = n ? this.connections.filter((c) => c !== n) : []; }
    dispose() { this.disposed = true; }
  }
  const nativeOf = (g: unknown) => (g as Gain).native;
  return { Gain, nativeOf };
});
vi.mock('tone', () => ({ Gain }));
vi.mock('@utils/audio-context', () => ({ getNativeAudioNode: nativeOf }));

import {
  getChannelSynthLane,
  applyChannelSynthLaneGains,
  setChannelSynthLanePitchRate,
  disposeChannelSynthLanes,
  type ChannelSynthLaneContext,
} from '../ChannelSynthLanes';

function fakeResampler() {
  const node = {
    connections: [] as unknown[],
    messages: [] as unknown[],
    port: { postMessage(m: unknown) { node.messages.push(m); } },
    connect(n: unknown) { node.connections.push(n); },
    disconnect() { node.connections = []; },
  };
  return node;
}

function ctx(opts: { module?: Promise<void>; busGain?: number } = {}) {
  const strips = new Map<number, InstanceType<typeof Gain>>();
  const resamplers: ReturnType<typeof fakeResampler>[] = [];
  let busGain = opts.busGain ?? 0.5;
  const c: ChannelSynthLaneContext = {
    lanes: new Map(),
    synthBusGain: () => busGain,
    createGain: (g) => new Gain(g) as never,
    getChannelOutput: (ch) => {
      let s = strips.get(ch);
      if (!s) { s = new Gain(); strips.set(ch, s); }
      return s as never;
    },
    ensurePitchResamplerModule: () => opts.module ?? Promise.resolve(),
    createPitchResamplerNode: () => { const r = fakeResampler(); resamplers.push(r); return r as never; },
  };
  return { c, strips, resamplers, setBusGain: (g: number) => { busGain = g; } };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('channel synth lanes', () => {
  it('route the lane gain into the channel strip at once, at the synth bus gain', () => {
    const { c, strips } = ctx({ busGain: 0.25 });
    const lane = getChannelSynthLane(c, 3);
    expect(lane.gain.gain.value).toBe(0.25);
    expect((lane.gain as unknown as InstanceType<typeof Gain>).connections).toEqual([strips.get(3)]);
    expect(getChannelSynthLane(c, 3)).toBe(lane);
    expect(c.lanes.size).toBe(1);
  });

  it('splice the pitch resampler between gain and strip once the worklet module loads', async () => {
    const { c, strips, resamplers } = ctx();
    const lane = getChannelSynthLane(c, 0);
    expect(lane.resampler).toBeNull();
    await flush();
    expect(lane.resampler).toBe(resamplers[0]);
    const gainNative = nativeOf(lane.gain);
    expect(gainNative.connections).toEqual([resamplers[0]]);
    expect(resamplers[0].connections).toEqual([nativeOf(strips.get(0))]);
  });

  it('stay unshifted (gain straight into strip) when the worklet module is unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { c, strips, resamplers } = ctx({ module: Promise.reject(new Error('no worklet')) });
    const lane = getChannelSynthLane(c, 1);
    await flush();
    expect(lane.resampler).toBeNull();
    expect(resamplers).toHaveLength(0);
    expect(nativeOf(lane.gain).connections).toEqual([nativeOf(strips.get(1))]);
    warn.mockRestore();
  });

  it('fan the pitch rate out to every lane resampler', async () => {
    const { c, resamplers } = ctx();
    getChannelSynthLane(c, 0);
    getChannelSynthLane(c, 5);
    await flush();
    setChannelSynthLanePitchRate(c, 1.25);
    expect(resamplers.map((r) => r.messages)).toEqual([
      [{ type: 'set-rate', rate: 1.25 }],
      [{ type: 'set-rate', rate: 1.25 }],
    ]);
  });

  it('mirror a synth bus gain change on every lane', () => {
    const { c, setBusGain } = ctx({ busGain: 0.5 });
    const a = getChannelSynthLane(c, 0);
    const b = getChannelSynthLane(c, 2);
    setBusGain(0.125);
    applyChannelSynthLaneGains(c);
    expect(a.gain.gain.value).toBe(0.125);
    expect(b.gain.gain.value).toBe(0.125);
  });

  it('dispose every lane and do not splice a resampler into a disposed lane', async () => {
    let resolve!: () => void;
    const module = new Promise<void>((r) => { resolve = r; });
    const { c, resamplers } = ctx({ module });
    const lane = getChannelSynthLane(c, 4);
    disposeChannelSynthLanes(c);
    expect(c.lanes.size).toBe(0);
    expect((lane.gain as unknown as InstanceType<typeof Gain>).disposed).toBe(true);
    resolve();
    await flush();
    expect(lane.resampler).toBeNull();
    expect(resamplers).toHaveLength(0);
  });
});
