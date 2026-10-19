/**
 * Per-channel synth lanes: a per-channel native synth instance plays into its
 * channel strip through a lane (gain, then pitch shifter), so channel volume,
 * pan, mute and channel effects reach it like they reach samples.
 */
import { describe, it, expect, vi } from 'vitest';

const { Gain } = vi.hoisted(() => {
  class Param { value = 0; constructor(v = 0) { this.value = v; } }
  class Gain {
    gain: Param;
    connections: unknown[] = [];
    disposed = false;
    constructor(v = 1) { this.gain = new Param(v); }
    connect(n: unknown) { this.connections.push(n); }
    disconnect(n?: unknown) { this.connections = n ? this.connections.filter((c) => c !== n) : []; }
    dispose() { this.disposed = true; }
  }
  return { Gain };
});
vi.mock('tone', () => ({ Gain }));

import {
  getChannelSynthLane,
  applyChannelSynthLaneGains,
  setChannelSynthLanePitchRate,
  disposeChannelSynthLanes,
  type ChannelSynthLaneContext,
  type PitchShiftInsert,
} from '../ChannelSynthLanes';

type FakeGain = InstanceType<typeof Gain>;

/** A DeckKeyLock stand-in that records what the lane asked of it. */
function fakeShift() {
  const shift = {
    input: new Gain(),
    output: new Gain(),
    active: false,
    semitones: 0,
    calls: [] as string[],
    disposed: false,
    setActive(a: boolean) { shift.active = a; shift.calls.push(`active:${a}`); },
    setPitchSemiTones(s: number) { shift.semitones = s; shift.calls.push(`semis:${s.toFixed(3)}`); },
    latencySec() { return shift.active ? 0.1 : 0; },
    dispose() { shift.disposed = true; },
  };
  return shift;
}

function ctx(opts: { busGain?: number; rate?: number } = {}) {
  const strips = new Map<number, FakeGain>();
  const shifts: ReturnType<typeof fakeShift>[] = [];
  let busGain = opts.busGain ?? 0.5;
  const c: ChannelSynthLaneContext = {
    lanes: new Map(),
    synthBusGain: () => busGain,
    createGain: (g) => new Gain(g) as never,
    getLaneDestination: (ch) => {
      let s = strips.get(ch);
      if (!s) { s = new Gain(); strips.set(ch, s); }
      return s as never;
    },
    synthPitchRate: () => opts.rate ?? 1,
    createPitchShift: () => { const s = fakeShift(); shifts.push(s); return s as unknown as PitchShiftInsert; },
  };
  return { c, strips, shifts, setBusGain: (g: number) => { busGain = g; } };
}

describe('channel synth lanes', () => {
  it('route gain -> shifter -> strip at once, at the synth bus gain, bypassed at pitch 0', () => {
    const { c, strips, shifts } = ctx({ busGain: 0.25 });
    const lane = getChannelSynthLane(c, 3);
    expect(lane.gain.gain.value).toBe(0.25);
    expect((lane.gain as unknown as FakeGain).connections).toEqual([shifts[0].input]);
    expect(shifts[0].output.connections).toEqual([strips.get(3)]);
    expect(shifts[0].active).toBe(false);
    expect(getChannelSynthLane(c, 3)).toBe(lane);
    expect(c.lanes.size).toBe(1);
    expect(shifts).toHaveLength(1);
  });

  it('a lane built while the slider is up starts shifted, semitones set before engaging', () => {
    const { c, shifts } = ctx({ rate: 2 });
    getChannelSynthLane(c, 0);
    expect(shifts[0].active).toBe(true);
    expect(shifts[0].semitones).toBeCloseTo(12, 6);
    expect(shifts[0].calls).toEqual(['semis:12.000', 'active:true']);
  });

  it('fan the pitch rate out to every lane shifter, as semitones; rate 1 bypasses', () => {
    const { c, shifts } = ctx();
    getChannelSynthLane(c, 0);
    getChannelSynthLane(c, 5);
    setChannelSynthLanePitchRate(c, 1.25);
    for (const s of shifts) {
      expect(s.active).toBe(true);
      expect(s.semitones).toBeCloseTo(12 * Math.log2(1.25), 6);
    }
    setChannelSynthLanePitchRate(c, 1);
    for (const s of shifts) {
      expect(s.active).toBe(false);
      expect(s.semitones).toBe(0);
    }
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

  it('dispose every lane, shifter included', () => {
    const { c, shifts } = ctx();
    const lane = getChannelSynthLane(c, 4);
    disposeChannelSynthLanes(c);
    expect(c.lanes.size).toBe(0);
    expect((lane.gain as unknown as FakeGain).disposed).toBe(true);
    expect(shifts[0].disposed).toBe(true);
  });
});
