/**
 * A song's Furnace instrument gets a FurnaceDispatchSynth of its own. On init
 * each one uploaded a default "electric piano" patch into instrument slot 0 of
 * the dispatch's single shared table and put it on every channel of its
 * platform. Slot 0 is the song's own instrument 0, uploaded before the synths
 * finished init — so every part on instrument 0 played the stock patch.
 * Seen in the console as a run of
 *     [FurnaceDispatch] Uploading instrument 0, 147 bytes, platform=2
 * after the song's own upload of instrument 0.
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
  for (const k of ['uploadFurnaceInstrument', 'setInstrument', 'setVolume', 'loadIns2']) calls[k].mockClear();
});

describe('a Furnace synth coming up', () => {
  it('leaves slot 0 and the channels alone when its instrument belongs to a song', async () => {
    const synth = new FurnaceDispatchSynth(FurnaceDispatchPlatform.GENESIS, { fromModule: true });
    await synth.ready;
    expect(synth._isReady).toBe(true);
    expect(calls.uploadFurnaceInstrument).not.toHaveBeenCalled();
    expect(calls.setInstrument).not.toHaveBeenCalled();
  });

  it('is told so by the synth registry for an instrument that carries its INS2', async () => {
    // The entry a loaded song's instruments are created through.
    await import('@engine/registry/builtin/furnace');
    const { SynthRegistry } = await import('@engine/registry/SynthRegistry');
    const ins2 = new Uint8Array([0x49, 0x4e, 0x53, 0x32, 1, 2, 3, 4]);
    const synth = SynthRegistry.get('FurnaceOPN')!.create({
      id: 1, name: 'Strings', synthType: 'FurnaceOPN',
      furnace: { furnaceIndex: 0, rawBinaryData: ins2 },
    } as never) as FurnaceDispatchSynth;
    await synth.ensureInitialized(); // waits for its INS2 upload as well
    expect(calls.loadIns2).toHaveBeenCalledWith(0, ins2);
    expect(calls.uploadFurnaceInstrument).not.toHaveBeenCalledWith(0, expect.anything(), expect.anything());
    // Nor does it force its instrument onto the song's channels: a platform
    // with no chip of its own falls through to the song's chip in the worklet.
    expect(calls.setInstrument).not.toHaveBeenCalled();
  });

  it('still seeds a playable default for an instrument made in DEViLBOX', async () => {
    const synth = new FurnaceDispatchSynth(FurnaceDispatchPlatform.GENESIS);
    await synth.ready;
    expect(calls.uploadFurnaceInstrument).toHaveBeenCalledWith(0, expect.any(Uint8Array), FurnaceDispatchPlatform.GENESIS);
  });
});
