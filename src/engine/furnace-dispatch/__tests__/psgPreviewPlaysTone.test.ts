/**
 * Every AY instrument of ironwing.fur played white noise from the keyboard.
 * Furnace keeps a PSG channel's tone/noise mode until a wave macro changes it
 * (ay.cpp), and all of a chip's keyboard synths share one channel: after a hat
 * (wave macro = noise) the arps, which have no wave macro, played noise too.
 * The Snare's previewChannel 7 also reached past the AY's three channels.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { engine } = vi.hoisted(() => {
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
    get: (t, k: string) => (t[k] ??= vi.fn(() => returns[k])),
  });
  return { engine };
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
import { FurnaceDispatchPlatform, DivCmd } from '../FurnaceDispatchEngine';

const calls = engine as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  for (const k of ['dispatch', 'setInstrument', 'noteOn']) calls[k].mockClear();
});

function noiseModeCalls(): unknown[][] {
  return calls.dispatch.mock.calls.filter((c) => c[0] === DivCmd.STD_NOISE_MODE);
}

describe('a PSG keyboard note', () => {
  it('sets tone mode on its channel before the note on an AY', async () => {
    const synth = new FurnaceDispatchSynth(FurnaceDispatchPlatform.AY, { fromModule: true });
    await synth.ready;
    calls.dispatch.mockClear();

    synth.triggerAttack('C5');

    expect(noiseModeCalls()).toEqual([[DivCmd.STD_NOISE_MODE, 0, 0, 0, FurnaceDispatchPlatform.AY, undefined]]);
    const resetOrder = calls.dispatch.mock.invocationCallOrder[0];
    expect(resetOrder).toBeLessThan(calls.noteOn.mock.invocationCallOrder[0]);
  });

  it('sends no tone-mode reset on an FM chip', async () => {
    const synth = new FurnaceDispatchSynth(FurnaceDispatchPlatform.GENESIS, { fromModule: true });
    await synth.ready;
    calls.dispatch.mockClear();

    synth.triggerAttack('C5');

    expect(noiseModeCalls()).toEqual([]);
  });

  it('plays a preview channel past the chip channels on channel 0', async () => {
    const synth = new FurnaceDispatchSynth(FurnaceDispatchPlatform.AY, { fromModule: true });
    await synth.ready;
    // Only the channel pick matters here; the encode after it may reject on this bare config.
    await synth.uploadInstrumentFromConfig({ chipType: 6, previewChannel: 7 }, 'Snare').catch(() => undefined);

    synth.triggerAttack('C5');

    expect(calls.noteOn.mock.calls[0][0]).toBe(0);
  });
});
