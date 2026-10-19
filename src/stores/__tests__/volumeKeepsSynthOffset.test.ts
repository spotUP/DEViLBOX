/**
 * Changing the volume (or loading a preset, which carries one) must not change a synth's level relative to how it was
 * created. InstrumentFactory sets a registry synth's output level to volume + volumeOffsetDb (the DX7's is +14 dB); the
 * store's volume path used to set volume alone, so the first preset change or volume move dropped a DX7 by 14 dB.
 * Both paths now go through ToneEngine.setInstrumentVolume, which applies getNormalizedVolume like creation does.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setInstrumentVolumeOn } from '../../engine/instrumentOutputLevel';

const fakeSynth = { loadSysex: vi.fn(), loadVcedPreset: vi.fn(), output: { gain: { value: 1 } } };
const fakeEngine = {
  instruments: new Map<number, unknown>(),
  getInstrumentKey: (id: number) => (id << 16) | 0xFFFF,
  instancesOf: (id: number) => [...fakeEngine.instruments.entries()].filter(([k]) => (k >> 16) === id).map(([, v]) => v),
  ensureInstrumentReady: async () => {},
  setInstrumentVolume: (id: number, synthType: string, volumeDb: number | undefined) =>
    setInstrumentVolumeOn(fakeEngine.instruments, id, synthType, volumeDb),
};
vi.mock('@engine/ToneEngine', () => ({ getToneEngine: () => fakeEngine }));
vi.mock('../../engine/ToneEngine', () => ({ getToneEngine: () => fakeEngine }));

import '../../engine/registry/builtin/dx7';
import { useInstrumentStore } from '../useInstrumentStore';
import { getNormalizedVolume } from '../../engine/factories/volumeNormalization';

const db = (gain: number) => 20 * Math.log10(gain);

beforeEach(() => {
  useInstrumentStore.setState({ instruments: [] });
  fakeEngine.instruments.clear();
  fakeSynth.output.gain.value = 1;
});

describe('getNormalizedVolume', () => {
  it('adds the descriptor offset (DX7 +14 dB); an unknown synth and a Furnace synth get none', () => {
    expect(getNormalizedVolume('DX7', -12)).toBeCloseTo(2, 5);
    expect(getNormalizedVolume('NoSuchSynth', -12)).toBeCloseTo(-12, 5);
    expect(getNormalizedVolume('FurnaceOPN', -12)).toBeCloseTo(-12, 5);
  });
});

describe('the store keeps the synth offset when the volume changes', () => {
  it('a DX7 edit that carries a volume (-10) together with a voice change leaves the output gain at volume + 14 dB, as at creation', () => {
    const id = useInstrumentStore.getState().createInstrument({ name: 'DX7', type: 'synth', synthType: 'DX7', volume: -12, dx7: {} } as never);
    fakeEngine.instruments.set((id << 16) | 0xFFFF, fakeSynth);
    useInstrumentStore.getState().updateInstrument(id, { volume: -10, dx7: { bank: 1, program: 3 } } as never);
    expect(db(fakeSynth.output.gain.value)).toBeCloseTo(-10 + 14, 5);
  });

  it('a volume-only change keeps the offset too', () => {
    const id = useInstrumentStore.getState().createInstrument({ name: 'DX7', type: 'synth', synthType: 'DX7', volume: -12, dx7: {} } as never);
    fakeEngine.instruments.set((id << 16) | 0xFFFF, fakeSynth);
    useInstrumentStore.getState().updateInstrument(id, { volume: -20 } as never);
    expect(db(fakeSynth.output.gain.value)).toBeCloseTo(-20 + 14, 5);
  });
});
