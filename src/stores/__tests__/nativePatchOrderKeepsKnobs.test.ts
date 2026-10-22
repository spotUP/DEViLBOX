/**
 * NATIVE-PATCH-ORDER: for Calf Monosynth and TAL-NoiseMaker a native preset becomes the instrument's own config, a knob
 * edit after it survives the synth being rebuilt (the native patch is the base, instrument config goes on top), and the
 * config the factory hands over is sent after the patch once the worklet is ready.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const live = vi.hoisted(() => ({ map: new Map<number, unknown>() }));

vi.mock('@engine/ToneEngine', () => ({
  getToneEngine: () => ({
    invalidateInstrument: () => {},
    instancesOf: () => [],
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

// The engines fetch their WASM on init; keep that pending so no real network request is made.
vi.stubGlobal('fetch', () => new Promise(() => {}));

import { useInstrumentStore } from '../useInstrumentStore';
import { CalfMonoSynthImpl } from '@/engine/calf-mono/CalfMonoSynth';
import { CALFMONO_NATIVE_FACTORY_PRESETS } from '@/engine/calf-mono/calfMonoNativePresets';
import { TalNoizeMakerSynthImpl, CONFIG_TO_INDEX } from '@/engine/tal-noizemaker/TalNoizeMakerSynth';
import { TAL_NATIVE_FACTORY_PRESETS } from '@/engine/tal-noizemaker/talNativePresets';
import { createCalfMono, createTalNoizeMaker } from '@/engine/factories/CommunitySynthFactory';
import { CALF_MONO_FACTORY_PRESETS, TAL_NOIZEMAKER_FACTORY_PRESETS } from '@/constants/zynthianPresets';
import type { InstrumentConfig } from '@/types/instrument';

type Case = {
  label: string;
  synthType: string;
  configKey: 'calfMono' | 'talNoizeMaker';
  presets: InstrumentConfig[];
  patches: Array<{ name: string; values: number[] }>;
  engine: typeof CalfMonoSynthImpl | typeof TalNoizeMakerSynthImpl;
  create: (c: InstrumentConfig) => unknown;
  /** config key and the WASM param index it maps to */
  knob: string;
  index: number;
  /** make the engine look ready, send what it holds for after the patch, report [index, value] of every param sent */
  flush: (synth: unknown, sent: Array<[number, number]>) => void;
};

const cases: Case[] = [
  {
    label: 'Calf Monosynth', synthType: 'CalfMono', configKey: 'calfMono',
    presets: CALF_MONO_FACTORY_PRESETS as unknown as InstrumentConfig[],
    patches: CALFMONO_NATIVE_FACTORY_PRESETS,
    engine: CalfMonoSynthImpl, create: (c) => createCalfMono(c),
    knob: 'cutoff', index: 9,
    flush: (synth, sent) => {
      const s = synth as unknown as Record<string, unknown> & { sendPendingOverrides(): void };
      s.ready = true;
      s.node = {};
      vi.spyOn(CalfMonoSynthImpl.prototype, 'setParam').mockImplementation((i: number, v: number) => { sent.push([i, v]); });
      s.sendPendingOverrides();
    },
  },
  {
    label: 'TAL-NoiseMaker', synthType: 'TalNoizeMaker', configKey: 'talNoizeMaker',
    presets: TAL_NOIZEMAKER_FACTORY_PRESETS as unknown as InstrumentConfig[],
    patches: TAL_NATIVE_FACTORY_PRESETS,
    engine: TalNoizeMakerSynthImpl, create: (c) => createTalNoizeMaker(c),
    knob: 'cutoff', index: CONFIG_TO_INDEX.cutoff,
    flush: (synth, sent) => {
      const s = synth as unknown as Record<string, unknown> & { sendPendingOverrides(): void };
      s.isInitialized = true;
      s._worklet = { port: { postMessage: (m: { type: string; index: number; value: number }) => { if (m.type === 'setParam') sent.push([m.index, m.value]); } } };
      s.sendPendingOverrides();
    },
  },
];

describe.each(cases)('$label native patch order', (c) => {
  let id: number;
  const patchName = c.patches[1].name;
  const patch = c.patches[1].values;

  beforeEach(() => {
    vi.restoreAllMocks();
    useInstrumentStore.getState().createInstrument({ synthType: c.synthType, name: 'Native' } as Partial<InstrumentConfig>);
    id = useInstrumentStore.getState().instruments.at(-1)!.id;
    live.map.clear();
    const { type: _t, synthType: _s, ...rest } = c.presets.find((p) => (p as { name: string }).name === patchName)!;
    void _t; void _s;
    useInstrumentStore.getState().updateInstrument(id, rest as Partial<InstrumentConfig>);
  });

  const inst = () => useInstrumentStore.getState().instruments.find((i) => i.id === id)! as unknown as Record<string, Record<string, number>>;

  it('the preset values become the instrument config (editor shows them)', () => {
    expect(inst()[c.configKey][c.knob]).toBe(patch[c.index]);
  });

  it('a knob edit after the preset is sent after the patch, other preset params stay untouched', () => {
    useInstrumentStore.getState().updateInstrument(id, { [c.configKey]: { ...inst()[c.configKey], [c.knob]: 0.123 } } as Partial<InstrumentConfig>);
    const order: string[] = [];
    vi.spyOn(c.engine.prototype as { loadNativePreset(n: string): void }, 'loadNativePreset').mockImplementation(() => { order.push('patch'); });
    const realApply = (c.engine.prototype as { applyConfig(x: object): void }).applyConfig;
    vi.spyOn(c.engine.prototype as { applyConfig(x: object): void }, 'applyConfig').mockImplementation(function (this: unknown, x: object) { order.push('config'); realApply.call(this, x); });
    const synth = c.create(inst() as unknown as InstrumentConfig);
    expect(order.indexOf('patch')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('patch')).toBeLessThan(order.indexOf('config'));

    const sent: Array<[number, number]> = [];
    c.flush(synth, sent);
    const last = new Map(sent);
    expect(last.get(c.index)).toBe(0.123);
    // every other value sent equals the patch's own value for that param (the config never carries stale defaults over it)
    for (const [i, v] of sent) if (i !== c.index) expect(v).toBe(patch[i]);
  });
});
