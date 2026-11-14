/**
 * A Neo Geo (YM2610) instrument is an FM, SSG, ADPCM-A or ADPCM-B voice. Entry:
 * FurnaceDispatchSynth.uploadInstrumentFromConfig, then a note. The sentinel is
 * the call record of the fake engine: the blob uploaded, the sample list handed
 * to setModuleSamples, and the channel the note goes to.
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
    getChannelCount: 14,
    chipSpansOf: [],
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
import { DIV_INS_AY, DIV_INS_ADPCMA, DIV_INS_ADPCMB } from '@lib/export/FurnaceInstrumentEncoder';

const calls = engine as unknown as Record<string, ReturnType<typeof vi.fn>>;
const PT = FurnaceDispatchPlatform.YM2610_FULL;

beforeEach(() => {
  for (const k of ['uploadFurnaceInstrument', 'setModuleSamples', 'uploadModuleSamplesToPlatform', 'noteOn']) calls[k].mockClear();
});

async function play(config: Record<string, unknown>) {
  const synth = new FurnaceDispatchSynth(PT);
  await synth.ready;
  calls.uploadFurnaceInstrument.mockClear();
  await synth.uploadInstrumentFromConfig({ chipType: 14, ...config }, 'neo');
  synth.triggerAttack('C-4');
  return synth;
}

const blobOf = () => calls.uploadFurnaceInstrument.mock.calls.at(-1)![1] as Uint8Array;

describe('Neo Geo voice kinds reach the chip', () => {
  it.each([
    ['ssg', DIV_INS_AY, 6, 4],
    ['adpcma', DIV_INS_ADPCMA, 37, 7],
    ['adpcmb', DIV_INS_ADPCMB, 38, 13],
  ])('%s: blob type byte, first chip channel', async (_id, divInsType, byte3, channel) => {
    await play({ divInsType, operators: [] });
    expect(calls.uploadFurnaceInstrument).toHaveBeenCalled();
    expect(blobOf()[3]).toBe(byte3);
    expect(calls.noteOn).toHaveBeenCalled();
    expect(calls.noteOn.mock.calls.at(-1)![0]).toBe(channel);
  });

  // The owner heard SSG drums far too weak: a full-velocity note sent volume 127
  // (the FM maximum) to a 4-bit SSG channel.
  it.each([
    ['ssg', DIV_INS_AY, 15],
    ['adpcma', DIV_INS_ADPCMA, 31],
    ['adpcmb', DIV_INS_ADPCMB, 255],
  ])('%s: a full-velocity note sets the channel kind maximum, not the FM 127', async (_id, divInsType, max) => {
    calls.setVolume.mockClear();
    await play({ divInsType, operators: [] });
    const [channel, volume] = calls.setVolume.mock.calls.at(-1)!;
    expect(channel).toBe(calls.noteOn.mock.calls.at(-1)![0]);
    expect(volume).toBe(max);
  });

  it('an FM voice still gets 127 at full velocity', async () => {
    calls.setVolume.mockClear();
    await play({ operators: [] });
    expect(calls.setVolume.mock.calls.at(-1)![1]).toBe(127);
  });

  it('an SSG voice with no macros uploads as the same blob as one with a volume and a tone macro', async () => {
    const macro = (code: number, v: number) => ({ code, type: 0, data: [v], loop: -1, release: -1, mode: 0 });
    await play({ divInsType: DIV_INS_AY, operators: [], macros: [] });
    const bare = Array.from(blobOf());
    await play({ divInsType: DIV_INS_AY, operators: [], macros: [macro(0, 15), macro(3, 1)] });
    expect(bare).toEqual(Array.from(blobOf()));
  });

  it.each([
    ['adpcma', DIV_INS_ADPCMA],
    ['adpcmb', DIV_INS_ADPCMB],
  ])('%s: the user sample is in the list at the index the blob names', async (_id, divInsType) => {
    const data = new Int16Array([0, 1000, -1000, 500]);
    await play({ divInsType, operators: [], userSample: { data, rate: 18500, name: 'kick' } });
    const list = calls.setModuleSamples.mock.calls.at(-1)![0] as Array<{ data: Int16Array; depth: number }>;
    const index = list.findIndex(s => s.data === data);
    expect(index).toBe(0);
    expect(list[index].depth).toBe(16);
    expect(calls.uploadModuleSamplesToPlatform).toHaveBeenCalledWith(PT, true);
    // Header bytes 20-23: offset of the sample block, which starts with initSample.
    const b = blobOf();
    const at = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(20, true);
    const found = (b[at] | (b[at + 1] << 8)) === index;
    expect(found).toBe(true);
  });
});
