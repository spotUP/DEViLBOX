/**
 * Keyboard notes on a Furnace instrument went silent after the song was played
 * once. A song start destroys every chip the song does not use
 * (startWithCoordinator), and a song instrument's synth may sit on a chip of
 * its own: a YM2610 song's FM instruments play on Genesis (platform 2), its
 * SSG instruments on an AY-3-8910 (17). The synth stayed "ready" and sent its
 * notes to a chip that no longer existed; the worklet dropped them.
 * Seen with ironwing.fur / afterburn-run.fur: chips [58, 2, 17] before Play,
 * [58] after Stop.
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
    getChannelCount: 6,
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
import { FurnaceDispatchPlatform } from '../FurnaceDispatchEngine';

const calls = engine as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  for (const k of ['createChip', 'noteOn', 'playsPlatform']) calls[k].mockClear();
});

describe('a keyboard note after the song destroyed its chip', () => {
  it('recreates the chip and then plays the note', async () => {
    const synth = new FurnaceDispatchSynth(FurnaceDispatchPlatform.GENESIS, { fromModule: true });
    await synth.ready;
    calls.createChip.mockClear();

    calls.playsPlatform.mockReturnValueOnce(false); // the song start took the chip
    synth.triggerAttack('C5');
    await synth.ready;
    await Promise.resolve();

    expect(calls.createChip).toHaveBeenCalledWith(FurnaceDispatchPlatform.GENESIS, 48000);
    expect(calls.noteOn).toHaveBeenCalledTimes(1);
  });

  it('does not create a chip while its own (or a stand-in) still plays', async () => {
    const synth = new FurnaceDispatchSynth(FurnaceDispatchPlatform.GENESIS, { fromModule: true });
    await synth.ready;
    calls.createChip.mockClear();

    synth.triggerAttack('C5');

    expect(calls.createChip).not.toHaveBeenCalled();
    expect(calls.noteOn).toHaveBeenCalledTimes(1);
  });
});
