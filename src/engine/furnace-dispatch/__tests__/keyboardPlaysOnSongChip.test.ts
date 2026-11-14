/**
 * Keyboard notes of ironwing.fur (a YM2610 song) were far louder than the song:
 * its FM instruments (FurnaceOPN) played on a Genesis chip of their own (post-amp
 * 2.0, no song mix) and its SSG instruments (FurnaceAY) on an AY-3-8910 of their
 * own, at full level instead of 6 dB under the FM as inside the YM2610. A module
 * instrument now plays on the song chip that plays it, so the song's post-amp and
 * mix (setMixVolumes, keyed by that chip) set its level.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { engine, running } = vi.hoisted(() => {
  const running = new Map<number, number>(); // chip key -> channel count
  const calls: Record<string, ReturnType<typeof vi.fn>> = {};
  const returns: Record<string, unknown> = {
    init: Promise.resolve(),
    createChip: Promise.resolve(),
    waitForChipCreated: Promise.resolve(),
    getNativeCtx: { sampleRate: 48000 },
    getOrCreateSharedGain: null,
    getModuleWavetables: null,
    getModuleSamples: null,
    playsPlatform: true,
    chipSpansOf: [],
  };
  calls.hasChip = vi.fn((p: number) => running.has(p));
  calls.getChannelCount = vi.fn((p: number) => running.get(p) ?? 0);
  const engine = new Proxy(calls, {
    get: (t, k: string) => (t[k] ??= vi.fn(() => returns[k])),
  });
  return { engine, running };
});

vi.mock('../FurnaceDispatchEngine', async (importActual) => {
  const actual = await importActual<typeof import('../FurnaceDispatchEngine')>();
  return { ...actual, FurnaceDispatchEngine: { getInstance: () => engine } };
});
vi.mock('@/utils/audio-context', async (importActual) => ({
  ...(await importActual<object>()),
  getDevilboxAudioContext: () => ({ createGain: () => ({ connect: vi.fn(), gain: { value: 1 } }) }),
}));
vi.mock('@engine/ToneEngine', () => ({ getToneEngine: () => ({ routeNativeEngineOutput: vi.fn() }) }));

import { FurnaceDispatchSynth } from '../FurnaceDispatchSynth';
import { FurnaceDispatchPlatform } from '../FurnaceDispatchEngine';
import { LIVE_VOICE_BASE_CHANNEL } from '../chipChannel';

const calls = engine as unknown as Record<string, ReturnType<typeof vi.fn>>;
const YM2610 = FurnaceDispatchPlatform.YM2610;
const AY = FurnaceDispatchPlatform.AY8910;
const SSG_INSTRUMENT = { previewPlatform: YM2610, previewChannel: 4 };

beforeEach(() => {
  running.clear();
  for (const k of ['setVolume', 'noteOn']) calls[k].mockClear();
});

describe('a module instrument keyboard note', () => {
  it('plays on its song chip while that chip runs, at that chip channel volume range', async () => {
    running.set(AY, 3);
    const synth = new FurnaceDispatchSynth(AY, { fromModule: true });
    await synth.ready;
    running.set(YM2610, 14);

    synth.setSongChannel(LIVE_VOICE_BASE_CHANNEL, SSG_INSTRUMENT);
    synth.triggerAttack('C5', undefined, 1);

    expect(calls.noteOn.mock.calls[0][0]).toBe(4);
    expect(calls.noteOn.mock.calls[0][2]).toBe(YM2610);
    expect(calls.setVolume.mock.calls[0]).toEqual([4, 15, YM2610, undefined]);
  });

  it('plays on its own chip when no song chip runs', async () => {
    running.set(AY, 3);
    const synth = new FurnaceDispatchSynth(AY, { fromModule: true });
    await synth.ready;

    synth.setSongChannel(LIVE_VOICE_BASE_CHANNEL, SSG_INSTRUMENT);
    synth.triggerAttack('C5', undefined, 1);

    expect(calls.noteOn.mock.calls[0][0]).toBe(0);
    expect(calls.noteOn.mock.calls[0][2]).toBe(AY);
  });
});
