/**
 * SETBFREE-RECREATE-LOSES-KNOBS: a knob edit made after picking a native preset must survive the synth being rebuilt
 * (createSetBfree), instead of the stale native patch overwriting it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const live = vi.hoisted(() => ({ map: new Map<number, unknown>() }));

vi.mock('@engine/ToneEngine', () => ({
  getToneEngine: () => ({
    invalidateInstrument: () => {},
    instancesOf: (id: number) => [...live.map].filter(([k]) => (k >>> 16) === id).map(([, v]) => v),
    updateComplexSynthParameters: () => {},
    instruments: live.map,
    setInstrumentVolume: () => {},
  }),
}));

vi.mock('@/utils/audio-context', () => {
  const ctx = {
    createGain: () => ({ gain: { value: 0 }, connect: () => {}, disconnect: () => {} }),
    audioWorklet: { addModule: () => new Promise(() => {}) },
    destination: {},
    sampleRate: 48000,
  };
  return { getDevilboxAudioContext: () => ctx, noteToMidi: () => 60 };
});

import { useInstrumentStore } from '../useInstrumentStore';
import { SetBfreeSynthEngine, DEFAULT_SETBFREE, type SetBfreeConfig } from '@/engine/setbfree/SetBfreeSynth';
import { SETBFREE_FACTORY_PRESETS } from '@/constants/zynthianPresets';
import { createSetBfree } from '@/engine/factories/CommunitySynthFactory';
import type { InstrumentConfig } from '@/types/instrument';

describe('setBfree synth recreation', () => {
  let calls: Array<[string, number]>;
  let id: number;

  beforeEach(() => {
    calls = [];
    vi.spyOn(SetBfreeSynthEngine.prototype, 'set').mockImplementation((k: string, v: number) => {
      calls.push([k, v]);
    });
    useInstrumentStore.getState().createInstrument({ synthType: 'SetBfree', name: 'Organ' } as Partial<InstrumentConfig>);
    id = useInstrumentStore.getState().instruments.at(-1)!.id;
    live.map.clear();
  });

  const inst = () => useInstrumentStore.getState().instruments.find((i) => i.id === id)!;

  it('a knob edit after a preset survives synth recreation', () => {
    const { type: _t, synthType: _s, ...rest } = SETBFREE_FACTORY_PRESETS.find((p) => p.name === 'Lenny Dee 1')!;
    void _t; void _s;
    useInstrumentStore.getState().updateInstrument(id, rest as Partial<InstrumentConfig>);
    const next: SetBfreeConfig = { ...DEFAULT_SETBFREE, ...(inst().setbfree ?? {}), upper16: 3 };
    useInstrumentStore.getState().updateInstrument(id, { setbfree: next } as Partial<InstrumentConfig>);

    calls.length = 0;
    createSetBfree(inst());
    const last: Record<string, number> = {};
    for (const [k, v] of calls) last[k] = v;
    expect(last.upper16).toBe(3);
    // the preset's other drawbars are still there
    expect(last.upper8).toBe(8);
  });

  it('an instrument saved with only the native patch still gets the preset on recreation', () => {
    calls.length = 0;
    createSetBfree({ ...inst(), setbfree: undefined, setbfreeNativePatch: 'Lenny Dee 1' } as unknown as InstrumentConfig);
    const last: Record<string, number> = {};
    for (const [k, v] of calls) last[k] = v;
    expect(last.upper16).toBe(8);
  });
});
