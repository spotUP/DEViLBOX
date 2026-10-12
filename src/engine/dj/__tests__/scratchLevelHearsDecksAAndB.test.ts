/**
 * The scratch layer's level is three_deck's (X6, owner decision 2026-10-12): 0.60 x the RMS of decks A AND B
 * summed, not only the deck under the routine, and a module deck (no buffer to read ahead) is measured on its
 * output - the Deck C bus hears decks A + B on its input.
 *
 *   live      a Deck C bus following its input: the layer settles at 0.60 x the input's RMS
 *   planned   a routine planned whole reads both playing decks from where they will be, weighted as the
 *             crossfader sends them, summed: its level grows with the second deck by rms(A + B) / rms(A)
 *   module    a playing deck with no buffer leaves the planned shape to the live input
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installRealWebAudio, resolveWorkletsFromPublic } from '@/test/audio/realWebAudio';
import { NumpyRandomState } from '@/engine/turntable/turntableSim';

const RATE = 22050;

function noise(n: number, rms: number, seed: number): Float32Array {
  const rng = new NumpyRandomState(seed);
  const k = rms * Math.sqrt(3); // uniform(-1, 1) has RMS 1 / sqrt(3)
  return Float32Array.from({ length: n }, () => k * rng.uniform(-1, 1));
}
function rmsOf(x: ArrayLike<number>, a = 0, b = x.length): number {
  let s = 0;
  for (let i = a; i < b; i++) s += x[i]! * x[i]!;
  return Math.sqrt(s / Math.max(1, b - a));
}
const bufferOf = (x: Float32Array) => ({ sampleRate: RATE, numberOfChannels: 1, length: x.length, getChannelData: () => x as Float32Array<ArrayBuffer> });

describe('the scratch level hears decks A and B (X6)', () => {
  beforeAll(() => { installRealWebAudio(); resolveWorkletsFromPublic(); });

  it('live: a bus following decks A + B on its input holds the layer at 0.60 x their RMS', async () => {
    const { createDeckCBus } = await import('@/engine/dj/scratch/scratchDeckC');
    const n = 6 * RATE;
    const ctx = new OfflineAudioContext(1, n, RATE);
    const beatBuf = ctx.createBuffer(1, n, RATE);
    beatBuf.copyToChannel(noise(n, 0.2, 3) as Float32Array<ArrayBuffer>, 0);
    const beat = ctx.createBufferSource();
    beat.buffer = beatBuf;
    beat.start(0);
    const bus = await createDeckCBus(ctx, ctx.destination, { chain: 'threeDeck', follow: true, beat });
    bus.stroke(0, Float64Array.from(noise(n, 0.1, 4)));
    await new Promise((r) => setTimeout(r, 20));
    const out = (await ctx.startRendering()).getChannelData(0);
    // the level glides over ~1 s; from 3 s on the layer sits at the demo's ratio
    expect(rmsOf(out, 3 * RATE, n) / (0.60 * 0.2)).toBeGreaterThan(0.9);
    expect(rmsOf(out, 3 * RATE, n) / (0.60 * 0.2)).toBeLessThan(1.1);
  }, 120_000);

  it('planned: both playing decks are read and summed (A at its routine offset, B from where it will be), weighted by the crossfader', async () => {
    const { routineShapeDecks } = await import('@/engine/dj/scratch/scratchDeckC');
    const a = { tag: 'A' }, b = { tag: 'B' };
    const shape = { deck: 'A' as const, startSec: 12, trackFromSec: 40 };
    const both = routineShapeDecks(shape, { A: { playing: true, audio: a, position: 30, rate: 1 }, B: { playing: true, audio: b, position: 5, rate: 1.02 } }, [0.6, 0.8], 10)!;
    expect(both.map((d) => [d.audio, d.gain])).toEqual([[a, 0.6], [b, 0.8]]);
    expect(both[0]!.trackFromSec).toBe(40);
    expect(both[1]!.trackFromSec).toBeCloseTo(5 + 2 * 1.02, 12);
    // B stopped: only the routine's deck
    expect(routineShapeDecks(shape, { A: { playing: true, audio: a, position: 30, rate: 1 }, B: { playing: false, audio: b, position: 0, rate: 1 } }, [0.6, 0.8], 10)!.map((d) => d.audio)).toEqual([a]);
    // a module deck playing (no buffer): no planned shape - the live bus measures it on its input
    expect(routineShapeDecks(shape, { A: { playing: true, audio: a, position: 30, rate: 1 }, B: { playing: true, audio: null, position: 0, rate: 1 } }, [0.6, 0.8], 10)).toBeNull();
  });

  it('planned: the level grows with the second deck by rms(A + B) / rms(A)', async () => {
    const { ScratchVoicePool } = await import('@/engine/dj/scratch/scratchVoicePool');
    const n = 2 * RATE;
    const A = noise(3 * RATE, 0.2, 5), B = noise(3 * RATE, 0.2, 6);
    const ctx = new OfflineAudioContext(1, 128, RATE);
    const pool = new ScratchVoicePool(ctx, ctx.destination);
    const shape = { deck: 'A' as const, track: {} as never, chain: 'threeDeck' as const, startSec: 0.5, endSec: 0.5 + n / RATE, trackFromSec: 0.25, bpm: 92, strokes: [] };
    const one = await pool.shapeRoutinePlan(shape, [{ audio: bufferOf(A), trackFromSec: 0.25, gain: 1 }]);
    const two = await pool.shapeRoutinePlan(shape, [{ audio: bufferOf(A), trackFromSec: 0.25, gain: 1 }, { audio: bufferOf(B), trackFromSec: 0.5, gain: 1 }]);
    const sum = Float32Array.from({ length: n }, (_, i) => Math.fround(A[Math.trunc(0.25 * RATE) + i]!) + Math.fround(B[Math.trunc(0.5 * RATE) + i]!));
    const expected = rmsOf(sum) / rmsOf(A.subarray(Math.trunc(0.25 * RATE), Math.trunc(0.25 * RATE) + n));
    expect(two!.level / one!.level).toBeCloseTo(expected, 4);
    expect(two!.level / one!.level).toBeGreaterThan(1.3);
  }, 120_000);
});
