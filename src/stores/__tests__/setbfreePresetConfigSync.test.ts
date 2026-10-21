/**
 * SETBFREE-PRESET-UI-SYNC: a native setBfree preset picked through useInstrumentStore must become the instrument's own
 * setbfree config (what the editor shows), and a later knob move must keep the preset's other drawbars on the engine.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const live = vi.hoisted(() => ({ map: new Map<number, unknown>() }));

vi.mock('@engine/ToneEngine', () => ({
  getToneEngine: () => ({
    invalidateInstrument: () => {},
    instancesOf: (id: number) => [...live.map].filter(([k]) => (k >>> 16) === id).map(([, v]) => v),
    updateComplexSynthParameters: (id: number, cfg: Record<string, number>) => {
      for (const s of [...live.map].filter(([k]) => (k >>> 16) === id).map(([, v]) => v) as Array<{ applyConfig: (c: unknown) => void }>) {
        s.applyConfig(cfg);
      }
    },
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
import { SetBfreeSynthEngine, SetBfreeSynthImpl, DEFAULT_SETBFREE, type SetBfreeConfig } from '@/engine/setbfree/SetBfreeSynth';
import { SETBFREE_NATIVE_FACTORY_PRESETS } from '@/engine/setbfree/setbfreeNativePresets';
import { SETBFREE_FACTORY_PRESETS } from '@/constants/zynthianPresets';
import type { InstrumentConfig } from '@/types/instrument';

const UPPER = ['upper16', 'upper513', 'upper8', 'upper4', 'upper223', 'upper2', 'upper135', 'upper113', 'upper1'] as const;
const LENNY = [8, 0, 8, 0, 8, 0, 8, 0, 8];

describe('setBfree native preset becomes the instrument config', () => {
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
    live.map.set((id << 16) | 0, new SetBfreeSynthImpl());
    live.map.set((id << 16) | 0xffff, new SetBfreeSynthImpl());
  });

  const pick = (name: string) => {
    const { type: _t, synthType: _s, ...rest } = SETBFREE_FACTORY_PRESETS.find((p) => p.name === name)!;
    void _t; void _s;
    useInstrumentStore.getState().updateInstrument(id, rest as Partial<InstrumentConfig>);
  };
  const stored = (): SetBfreeConfig => ({ ...DEFAULT_SETBFREE, ...(useInstrumentStore.getState().instruments.find((i) => i.id === id)!.setbfree ?? {}) });

  it('instrument.setbfree carries the preset drawbars and the preset own keyClick', () => {
    pick('Lenny Dee 1');
    expect(UPPER.map((k) => stored()[k])).toEqual(LENNY);
    const data = SETBFREE_NATIVE_FACTORY_PRESETS.find((p) => p.name === 'Lenny Dee 1')!;
    expect(stored().keyClick).toBe(data.values[49]);
  });

  it('a later single knob move keeps the other preset drawbars on the engine', () => {
    pick('Lenny Dee 1');
    calls.length = 0;
    // The editor sends the whole config with one key changed (SetBfreeControls.updateParam).
    const next = { ...stored(), upper16: 5 };
    useInstrumentStore.getState().updateInstrument(id, { setbfree: next } as Partial<InstrumentConfig>);
    const last: Record<string, number> = {};
    for (const [k, v] of calls) last[k] = v;
    expect(last.upper16).toBe(5);
    expect(UPPER.slice(1).map((k) => last[k])).toEqual(LENNY.slice(1));
  });
});
