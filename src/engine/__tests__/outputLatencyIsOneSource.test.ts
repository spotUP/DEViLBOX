/**
 * Output latency has ONE source, audioLatency.ts. The David Whittaker and Nuade engines hold their position reports
 * back by latencyFrames; both must get it from outputLatencyFrames(), not from their own outputLatency+baseLatency
 * sum (which double counted base latency against every other visual). Fails if an engine computes its own again.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../audioLatency', async (orig) => {
  const real = await orig<typeof import('../audioLatency')>();
  return { ...real, outputLatencyFrames: vi.fn(real.outputLatencyFrames) };
});

import { outputLatencyFrames, outputLatencySec } from '../audioLatency';
import { DavidWhittakerEngine } from '../davidwhittaker/DavidWhittakerEngine';
import { NuadeEngine } from '../nuade/NuadeEngine';

const ctx = { sampleRate: 48000, outputLatency: 0.028, baseLatency: 0.0053 };

describe('outputLatencyFrames', () => {
  it('is the shared output latency in whole frames; baseLatency only when outputLatency is hidden', () => {
    expect(outputLatencyFrames(ctx)).toBe(Math.round(0.028 * 48000));
    expect(outputLatencyFrames({ sampleRate: 44100, baseLatency: 0.01 })).toBe(441);
    expect(outputLatencyFrames({ sampleRate: 48000 })).toBe(0);
    expect(outputLatencyFrames(null)).toBe(0);
    expect(outputLatencyFrames(ctx)).toBe(Math.round(outputLatencySec(ctx) * ctx.sampleRate));
  });
});

describe('engines take latencyFrames from the audioLatency helper', () => {
  beforeEach(() => vi.mocked(outputLatencyFrames).mockClear());

  it('DavidWhittakerEngine.play', () => {
    const posts: unknown[] = [];
    const e = Object.create(DavidWhittakerEngine.prototype) as Record<string, unknown>;
    Object.assign(e, { audioContext: ctx, _tickLog: [], afterPlay: () => {}, workletNode: { port: { postMessage: (m: unknown) => posts.push(m) } } });
    (e as unknown as DavidWhittakerEngine).play();
    expect(outputLatencyFrames).toHaveBeenCalledWith(ctx);
    expect(posts).toEqual([{ type: 'play', latencyFrames: 1344 }]);
  });

  it('NuadeEngine.play', () => {
    const posts: unknown[] = [];
    const e = Object.create(NuadeEngine.prototype) as Record<string, unknown>;
    Object.assign(e, { audioContext: ctx, afterPlay: () => {}, post: (m: unknown) => posts.push(m) });
    (e as unknown as NuadeEngine).play();
    expect(outputLatencyFrames).toHaveBeenCalledWith(ctx);
    expect(posts).toEqual([{ type: 'play', latencyFrames: 1344 }]);
  });
});
