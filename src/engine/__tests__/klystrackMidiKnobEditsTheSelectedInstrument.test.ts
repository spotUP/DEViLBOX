/**
 * KLYS-INSTRUMENT-EDITOR (KIE-1.5): KlysSynth.set wrote instrument 0 whatever instrument the panel showed, with its
 * own paramId table, and never touched the store. It now edits the instrument it was created for, through the one
 * edit path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { KlysNativeData, KlysNativeInstrument } from '@/types/tracker';

const sent = vi.hoisted(() => ({ params: [] as Array<[number, number, number]> }));
vi.mock('@/engine/klystrack/KlysEngine', () => {
  const engine = {
    output: { connect() {}, disconnect() {} },
    setInstrumentParam: (i: number, p: number, v: number) => sent.params.push([i, p, v]),
    setInstrumentProgramStep() {}, setInstrumentName() {},
  };
  return { KlysEngine: { hasInstance: () => true, getInstance: () => engine } };
});
vi.mock('@/utils/audio-context', () => ({
  getDevilboxAudioContext: () => ({ createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }) }),
}));

import { useFormatStore } from '@stores/useFormatStore';
import { KlysSynth } from '@/engine/klystrack/KlysSynth';
import { flushKlysInstrumentEdits } from '@/components/klystrack/klysInstrumentEdit';
import { KLYS_PARAM_IDS } from '@/engine/klystrack/klysInstrumentFields';
import { KLYSTRACK_NKS_PARAMETERS } from '@/midi/performance/remainingParameterMaps';

const inst = (cutoff: number): KlysNativeInstrument => ({
  name: '', adsr: { a: 0, d: 0, s: 0, r: 0 }, flags: 0, cydflags: 0, baseNote: 48, finetune: 0, slideSpeed: 0, pw: 0, volume: 0,
  progPeriod: 0, vibratoSpeed: 0, vibratoDepth: 0, pwmSpeed: 0, pwmDepth: 0, cutoff, resonance: 0, flttype: 0, ymEnvShape: 0,
  buzzOffset: 0, fxBus: 0, vibShape: 0, vibDelay: 0, pwmShape: 0, lfsrType: 0, wavetableEntry: 0, ringMod: 255, syncSource: 255,
  fm: { flags: 0, modulation: 0, feedback: 0, wave: 0, harmonic: 0, adsr: { a: 0, d: 0, s: 0, r: 0 }, attackStart: 0 },
  program: [],
});

describe('klystrack MIDI knobs', () => {
  beforeEach(() => {
    sent.params.length = 0;
    useFormatStore.setState({ klysNative: { instruments: [inst(1), inst(2), inst(3), inst(4)] } as unknown as KlysNativeData });
  });

  it('KlysSynth(id 3).set(cutoff, 0.5) edits instrument index 2 in the store and the engine, not instrument 0', () => {
    new KlysSynth(3).set('cutoff', 0.5);
    flushKlysInstrumentEdits();
    expect(sent.params).toEqual([[2, KLYS_PARAM_IDS.cutoff, Math.round(0.5 * 2047)]]);
    const stored = useFormatStore.getState().klysNative!.instruments;
    expect(stored[2].cutoff).toBe(1024);
    expect(stored[0].cutoff).toBe(1);
  });

  it('the NKS map is generated from the field table: the 16 original ids keep their page and index, no page slot is used twice', () => {
    const byId = new Map(KLYSTRACK_NKS_PARAMETERS.map((p) => [p.id, p]));
    expect(byId.get('klystrack.attack')).toMatchObject({ page: 0, index: 0 });
    expect(byId.get('klystrack.fmFeedback')).toMatchObject({ page: 1, index: 7 });
    const slots = KLYSTRACK_NKS_PARAMETERS.map((p) => `${p.page}:${p.index}`);
    expect(new Set(slots).size).toBe(slots.length);
    expect(KLYSTRACK_NKS_PARAMETERS.length).toBe(28);
  });
});
