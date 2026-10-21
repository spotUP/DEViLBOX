/**
 * SETBFREE-PRESETS-SAME: picking a setBfree factory preset through useInstrumentStore must land that preset's own drawbar
 * registration on the engine, so two presets leave the synth with different drawbars at its set() calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const live = vi.hoisted(() => ({ map: new Map<number, unknown>() }));
const created = vi.hoisted(() => ({ fn: null as null | ((id: number) => void) }));

vi.mock('@engine/ToneEngine', () => ({
  getToneEngine: () => ({
    invalidateInstrument: (id: number) => created.fn?.(id),
    instancesOf: (id: number) => [...live.map].filter(([k]) => (k >>> 16) === id).map(([, v]) => v),
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
  return {
    getDevilboxAudioContext: () => ctx,
    noteToMidi: () => 60,
  };
});

import { useInstrumentStore } from '../useInstrumentStore';
import { SetBfreeSynthEngine } from '@/engine/setbfree/SetBfreeSynth';
import { createSetBfree } from '@/engine/factories/CommunitySynthFactory';
import { SETBFREE_FACTORY_PRESETS } from '@/constants/zynthianPresets';
import type { InstrumentConfig } from '@/types/instrument';

const DRAWBARS = ['upper16', 'upper513', 'upper8', 'upper4', 'upper223', 'upper2', 'upper135', 'upper113', 'upper1'];

/** Last value each set() call left on the engine, per key. */
function engineState(calls: Array<[string, number]>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of calls) out[k] = v;
  return out;
}

describe('setBfree factory preset applied through useInstrumentStore', () => {
  let calls: Array<[string, number]>;

  beforeEach(() => {
    calls = [];
    vi.spyOn(SetBfreeSynthEngine.prototype, 'set').mockImplementation((k: string, v: number) => {
      calls.push([k, v]);
    });
    created.fn = (id: number) => {
      const inst = useInstrumentStore.getState().instruments.find((i) => i.id === id);
      createSetBfree(inst as InstrumentConfig);
    };
  });

  it('two presets land different drawbar values at the synth set() calls', () => {
    const store = useInstrumentStore.getState();
    store.createInstrument({ synthType: 'SetBfree', name: 'Organ' } as Partial<InstrumentConfig>);
    const id = useInstrumentStore.getState().instruments.at(-1)!.id;

    const standardB = SETBFREE_FACTORY_PRESETS.find((p) => p.name === 'Standard B')!;
    const lennyDee = SETBFREE_FACTORY_PRESETS.find((p) => p.name === 'Lenny Dee 1')!;

    useInstrumentStore.getState().updateInstrument(id, { ...standardB } as Partial<InstrumentConfig>);
    const first = engineState(calls);
    calls.length = 0;
    useInstrumentStore.getState().updateInstrument(id, { ...lennyDee } as Partial<InstrumentConfig>);
    const second = engineState(calls);

    expect(DRAWBARS.map((k) => first[k])).toEqual([8, 8, 8, 0, 0, 0, 0, 0, 0]);
    expect(DRAWBARS.map((k) => second[k])).toEqual([8, 0, 8, 0, 8, 0, 8, 0, 8]);
  });

  it('the preset dropdown path (type and synthType stripped) reaches a running synth', async () => {
    useInstrumentStore.getState().createInstrument({ synthType: 'SetBfree', name: 'Organ' } as Partial<InstrumentConfig>);
    const id = useInstrumentStore.getState().instruments.at(-1)!.id;
    const { SetBfreeSynthImpl } = await import('@/engine/setbfree/SetBfreeSynth');
    // Per-channel native synth: one instance per tracker channel plus the shared one (key channel -1).
    live.map.set((id << 16) | 0, new SetBfreeSynthImpl());
    live.map.set((id << 16) | 0xffff, new SetBfreeSynthImpl());

    const pick = (name: string) => {
      const { type: _t, synthType: _s, ...rest } = SETBFREE_FACTORY_PRESETS.find((p) => p.name === name)!;
      void _t; void _s;
      useInstrumentStore.getState().updateInstrument(id, rest as Partial<InstrumentConfig>);
    };
    pick('Standard B');
    const first = engineState(calls);
    expect(calls.filter(([k]) => k === 'upper16')).toHaveLength(2); // both instances got the preset
    calls.length = 0;
    pick('Lenny Dee 1');
    const second = engineState(calls);
    expect(calls.filter(([k]) => k === 'upper16')).toHaveLength(2);
    expect(DRAWBARS.map((k) => first[k])).toEqual([8, 8, 8, 0, 0, 0, 0, 0, 0]);
    expect(DRAWBARS.map((k) => second[k])).toEqual([8, 0, 8, 0, 8, 0, 8, 0, 8]);
  });
});
