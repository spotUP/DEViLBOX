/**
 * "tubbyScream can kill the master" (2026-09-21, reproduced 2026-09-27).
 *
 * The scream routes the spring's output back into its own input through a
 * bandpass and a tap at gain > 1. Nothing inside that loop bounded it: with
 * the sends open, the spring output reached 3.6e12 within 3 s of the fire,
 * then NaN — and the spring kept the NaN after release, so the bus return
 * and the master read 0 until a page reload. With a tape-saturation stage in
 * the loop the same fire peaks near 3 and recovers on release.
 *
 * Builds the real startTubbyScream on a recording fake context and walks the
 * loop from the spring's output back to its input.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('tone', async (importOriginal) => {
  const real = await importOriginal<typeof import('tone')>();
  return { ...real, connect: (a: { connect(b: unknown): void }, b: unknown) => a.connect(b) };
});

import { DubBus } from '../DubBus';

interface FakeNode {
  kind: string;
  out: FakeNode[];
  curve?: Float32Array;
  gain?: { value: number };
  connect(n: FakeNode): FakeNode;
  disconnect(): void;
}

function node(kind: string): FakeNode {
  const param = () => ({
    value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(),
  });
  const n: FakeNode & Record<string, unknown> = {
    kind, out: [],
    gain: param(), frequency: param(), Q: param(),
    connect(t: FakeNode) { n.out.push(t); return t; },
    disconnect() { n.out = []; },
  };
  return n;
}

function fakeContext() {
  return {
    currentTime: 0, sampleRate: 48000,
    createGain: () => node('gain'),
    createBiquadFilter: () => node('biquad'),
    createWaveShaper: () => node('waveshaper'),
    createBufferSource: () => Object.assign(node('source'), { start: vi.fn(), stop: vi.fn(), buffer: null }),
    createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
  };
}

/** Every path from `from` back to `to`, as lists of nodes. */
function loops(from: FakeNode, to: FakeNode, path: FakeNode[] = []): FakeNode[][] {
  if (from === to && path.length) return [path];
  if (path.includes(from)) return [];
  return from.out.flatMap((n) => loops(n, to, [...path, from]));
}

describe('the tubbyScream feedback loop', () => {
  it('saturates inside the loop, so nothing re-enters the spring above full scale', () => {
    const springIn = node('springIn');
    const springOut = node('springOut');
    const bus = Object.create(DubBus.prototype) as Record<string, unknown>;
    Object.assign(bus, {
      enabled: true,
      context: fakeContext(),
      spring: { input: springIn, output: springOut },
      _springWetCache: 0.5,
      settings: { springWet: 0.5 },
      _setSpringWet: () => {},
    });
    // The spring's own dry/wet path back to its input is what the scream adds.
    (bus.startTubbyScream as (c: number, t: number, s: number, f: number) => () => void)
      .call(bus, 500, 900, 3.5, 1.8);

    const paths = loops(springOut, springIn);
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      const sat = p.find((n) => n.kind === 'waveshaper');
      expect(sat, `loop ${p.map((n) => n.kind).join(' -> ')} has no saturation`).toBeDefined();
      const peak = Math.max(...Array.from(sat!.curve!, Math.abs));
      expect(peak).toBeLessThanOrEqual(1);
    }
  });
});
