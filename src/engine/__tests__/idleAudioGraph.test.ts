/**
 * The audio graph holds no always-running sources for features nobody uses.
 *
 * Oscillators, constant sources and delay feedback loops never go silent, so
 * Chrome processes everything behind them every quantum. Measured 2026-09-28
 * with the song stopped: PerChannelDubFx had 32 LFO oscillators running (one
 * per channel slot, sweep off) and ChannelFilterManager 136 ConstantSources
 * (Tone.Filter signals), with the audio thread ~50 % busy.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setDevilboxAudioContext } from '@utils/audio-context';

type Rec = { kind: string; started: boolean; stopped: boolean; connections: unknown[] };

function param(v = 0) {
  return { value: v, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() };
}

function mockContext() {
  const made: Rec[] = [];
  const node = (kind: string, extra: Record<string, unknown> = {}) => {
    const rec: Rec = { kind, started: false, stopped: false, connections: [] };
    made.push(rec);
    return Object.assign(rec, {
      connect(d: unknown) { rec.connections.push(d); return d; },
      disconnect() { rec.connections = []; },
      start() { rec.started = true; },
      stop() { rec.stopped = true; },
      ...extra,
    });
  };
  const ctx = {
    currentTime: 0,
    createGain: () => node('Gain', { gain: param(1) }),
    createBiquadFilter: () => node('Biquad', { type: 'lowpass', frequency: param(350), Q: param(1) }),
    createDelay: () => node('Delay', { delayTime: param(0) }),
    createOscillator: () => node('Oscillator', { type: 'sine', frequency: param(440) }),
    createConstantSource: () => node('ConstantSource', { offset: param(0) }),
  };
  return { ctx: ctx as unknown as AudioContext, made };
}

const running = (made: Rec[]) => made.filter((r) => (r.kind === 'Oscillator' || r.kind === 'ConstantSource') && r.started && !r.stopped);

describe('idle audio graph', () => {
  let ctx: AudioContext;
  let made: Rec[];
  beforeEach(() => {
    ({ ctx, made } = mockContext());
    setDevilboxAudioContext(ctx);
  });

  it('builds a channel dub FX with no oscillator until its comb sweep engages', async () => {
    vi.useFakeTimers();
    const { PerChannelDubFx } = await import('../dub/PerChannelDubFx');
    const fx = new PerChannelDubFx(ctx, ctx.createGain(), ctx.createGain());
    expect(running(made)).toHaveLength(0);
    expect(fx.sweepBuilt).toBe(false);

    fx.setSweepRate(2);
    fx.setSweepAmount(0.6);
    expect(fx.sweepBuilt).toBe(true);
    const lfos = running(made);
    expect(lfos).toHaveLength(1);
    expect((lfos[0] as unknown as { frequency: { value: number } }).frequency.value).toBe(2); // rate kept while unbuilt

    fx.setSweepAmount(0);
    expect(fx.sweepBuilt).toBe(true);          // still ramping out
    vi.advanceTimersByTime(500);
    expect(fx.sweepBuilt).toBe(false);
    expect(running(made)).toHaveLength(0);

    // Re-engaging during the ramp-out keeps the same nodes.
    fx.setSweepAmount(0.3);
    fx.setSweepAmount(0);
    fx.setSweepAmount(0.4);
    vi.advanceTimersByTime(500);
    expect(fx.sweepBuilt).toBe(true);
    expect(running(made)).toHaveLength(1);
    fx.dispose();
    expect(running(made)).toHaveLength(0);
    vi.useRealTimers();
  });

  it('gives each channel a filter pair with no always-running source', async () => {
    const { getChannelFilterManager } = await import('../ChannelFilterManager');
    const mgr = getChannelFilterManager();
    mgr.disposeAll();
    for (let ch = 0; ch < 16; ch++) mgr.getOrCreate(ch);
    expect(made.filter((r) => r.kind === 'Biquad')).toHaveLength(32);
    expect(made.filter((r) => r.kind === 'ConstantSource' || r.kind === 'Oscillator')).toHaveLength(0);
    // A sweep still reaches the filters.
    mgr.setPosition(3, 0.5);
    const lpf = mgr.getOutput(3) as unknown as { frequency: { setTargetAtTime: ReturnType<typeof vi.fn> } };
    expect(lpf.frequency.setTargetAtTime).toHaveBeenCalled();
    mgr.disposeAll();
  });

  it('builds per-channel dub chains only for channels whose send is open', async () => {
    const { registerMixerStore, registerTrackerStore } = await import('@stores/storeAccess');
    const channels = Array.from({ length: 7 }, (_, i) => ({ dubSend: i === 1 || i === 4 ? 0.5 : 0 }));
    registerMixerStore({ getState: () => ({ channels }) });
    registerTrackerStore({ getState: () => ({ patterns: [{ channels: new Array(7).fill({}) }], currentPatternIndex: 0 }) });
    const { ChannelRoutedEffectsManager } = await import('../tone/ChannelRoutedEffects');
    const mgr = new ChannelRoutedEffectsManager({} as never);
    const before = made.length;
    const busInput = Object.assign(ctx.createGain(), { context: ctx });
    const drySpring = ctx.createGain();
    mgr.setupDubBusWiring(busInput as unknown as AudioNode, { drySpringBusNode: drySpring } as never);
    // Two open sends: two chains, not 32. Measured 2026-09-28: all 32 were
    // built up front on a 7-channel song, about 200 nodes processed per quantum.
    expect(mgr.getPerChannelFx(1)).not.toBeNull();
    expect(mgr.getPerChannelFx(4)).not.toBeNull();
    expect(mgr.getPerChannelFx(0)).toBeNull();
    expect(mgr.getPerChannelFx(31)).toBeNull();
    const builtGains = made.slice(before).filter((r) => r.kind === 'Gain').length;
    expect(builtGains).toBeLessThan(40);

    // Opening another send builds its chain then.
    mgr.setChannelDubSend(6, 0.7);
    expect(mgr.getPerChannelFx(6)).not.toBeNull();
    void mgr.dispose();
  });

  it('builds the space echo from native filters and oscillator, with no always-running Tone signals', async () => {
    // Tone.EQ3 / Tone.Filter / Tone.LFO / Tone.Signal each run ConstantSources
    // that keep the echo graph computing per-sample coefficients in silence:
    // SpaceEcho held 34 of them, ~9 % of the audio thread with nothing
    // playing (2026-09-28, stopped, RE-201 swap 35.7 % -> 27.0 %).
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(__dirname, '../effects/SpaceEchoEffect.ts'), 'utf8');
    expect(src).not.toMatch(/new Tone\.(EQ3|Filter|LFO|Signal|Multiply|Add|Scale)\b/);
    expect(src).toContain('createBiquadFilter()');
    expect(src).toContain('createOscillator()');
  });

  it('links a dub-bus LFO to its delay only while its feature is on', async () => {
    vi.useFakeTimers();
    const { LfoLink } = await import('../dub/lfoLink');
    const lfoGain = ctx.createGain() as unknown as Rec & AudioNode;
    const delay = ctx.createDelay() as unknown as { delayTime: AudioParam };
    const link = new LfoLink(lfoGain, delay.delayTime);
    expect(lfoGain.connections).toHaveLength(0);
    link.set(true);
    expect(lfoGain.connections).toEqual([delay.delayTime]);
    link.set(false, 300);
    expect(link.isLinked).toBe(true);            // kept through the feature's fade
    link.set(true);                              // re-engaged in time: stays linked
    vi.advanceTimersByTime(400);
    expect(link.isLinked).toBe(true);
    link.set(false, 300);
    vi.advanceTimersByTime(400);
    expect(link.isLinked).toBe(false);
    expect(lfoGain.connections).toHaveLength(0);
    vi.useRealTimers();
  });
});
