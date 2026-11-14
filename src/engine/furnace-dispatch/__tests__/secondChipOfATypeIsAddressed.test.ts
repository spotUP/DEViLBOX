/**
 * A song with two chips of one type (two AY-3-8910: BossGame final-boss.fur,
 * channels 4-6 on the second AY) runs them under separate chip keys. Two paths
 * still reached only the first chip:
 * - chipSpansOf looked up the synth's own platform only, so a synth whose
 *   platform has stand-ins (Genesis on a song of two YM2612) got no spans and
 *   fell back to the worklet's platform stand-in lookup: first chip only.
 * - The synth's setup (default instrument, the forced instrument on every
 *   channel after an upload) went to the platform key: the first chip.
 */
import { describe, it, expect, vi } from 'vitest';
import { chipKeysFor } from '../chipKey';

const { engine, spans } = vi.hoisted(() => {
  const spans: { key: number; offset: number; numChannels: number }[] = [];
  const calls: Record<string, ReturnType<typeof vi.fn>> = {};
  const returns: Record<string, unknown> = {
    init: Promise.resolve(),
    createChip: Promise.resolve(),
    waitForChipCreated: Promise.resolve(),
    getNativeCtx: { sampleRate: 48000 },
    getOrCreateSharedGain: null,
    getModuleWavetables: null,
    getModuleSamples: null,
    getChannelCount: 3,
    playsPlatform: true,
  };
  const engine = new Proxy(calls, {
    get: (t, k: string) => (t[k] ??= k === 'chipSpansOf' ? vi.fn(() => spans) : vi.fn(() => returns[k])),
  });
  return { engine, spans };
});

vi.mock('../FurnaceDispatchEngine', async (importActual) => {
  const actual = await importActual<typeof import('../FurnaceDispatchEngine')>();
  return { ...actual, FurnaceDispatchEngine: { getInstance: () => engine }, RealEngine: actual.FurnaceDispatchEngine };
});
vi.mock('@/utils/audio-context', async (importActual) => ({
  ...(await importActual<object>()),
  getDevilboxAudioContext: () => ({ createGain: () => ({ connect: vi.fn(), gain: { value: 1 } }) }),
}));
vi.mock('@engine/ToneEngine', () => ({ getToneEngine: () => ({ routeNativeEngineOutput: vi.fn() }) }));

import { FurnaceDispatchSynth } from '../FurnaceDispatchSynth';
import * as engineModule from '../FurnaceDispatchEngine';
import { FurnaceDispatchPlatform as P, DivCmd } from '../FurnaceDispatchEngine';

type Spans = { chipSpansOf(p: number): { key: number; offset: number; numChannels: number }[] };
const realEngine = (chips: [number, number][]): Spans => {
  const Real = (engineModule as unknown as { RealEngine: { getInstance(): Spans } }).RealEngine;
  const e = Real.getInstance();
  (e as unknown as { chips: Map<number, { handle: number; numChannels: number }> }).chips =
    new Map(chips.map(([key, numChannels], i) => [key, { handle: i + 1, numChannels }]));
  return e;
};
const calls = engine as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe('the second chip of a type', () => {
  it('chipSpansOf gives each chip of the type with its song-wide offset', () => {
    const [a0, a1] = chipKeysFor([P.AY8910, P.AY8910]);
    expect(realEngine([[a0, 3], [a1, 3]]).chipSpansOf(P.AY8910))
      .toEqual([{ key: a0, offset: 0, numChannels: 3 }, { key: a1, offset: 3, numChannels: 3 }]);
  });

  it('chipSpansOf of a platform with stand-ins gives every stand-in chip', () => {
    const [sn, y0, y1] = chipKeysFor([P.SMS, P.YM2612, P.YM2612]);
    expect(realEngine([[sn, 4], [y0, 6], [y1, 6]]).chipSpansOf(P.GENESIS).map((s) => [s.key, s.offset]))
      .toEqual([[y0, 4], [y1, 10]]);
  });

  it('the synth sets up its default instrument on both AY chips', async () => {
    const [a0, a1] = chipKeysFor([P.AY8910, P.AY8910]);
    spans.push({ key: a0, offset: 0, numChannels: 3 }, { key: a1, offset: 3, numChannels: 3 });
    const synth = new FurnaceDispatchSynth(P.AY8910);
    await synth.ready;
    // AY tone output needs STD_NOISE_MODE on every channel of each chip (reg 7).
    for (const key of [a0, a1]) {
      const chans = calls.dispatch.mock.calls.filter((c) => c[0] === DivCmd.STD_NOISE_MODE && c[4] === key).map((c) => c[1]);
      expect(chans).toEqual([0, 1, 2]);
    }
  });
});
