/**
 * KLYS-INSTRUMENT-EDITOR (KIE-1.3): the old editor wrote the engine only (store untouched, so .kt save and project
 * save lost the edit) and let cutoff reach 4095. klysInstrumentEdit is the one write path: clamp to the original
 * editor's ranges, one engine message per edit, one store write per frame, undo/redo restore both.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { KlysNativeData, KlysNativeInstrument } from '@/types/tracker';

const sent = vi.hoisted(() => ({ params: [] as Array<[number, number, number]>, steps: [] as Array<[number, number, number]>, names: [] as Array<[number, string]> }));
vi.mock('@/engine/klystrack/KlysEngine', () => ({
  KlysEngine: {
    hasInstance: () => true,
    getInstance: () => ({
      setInstrumentParam: (i: number, p: number, v: number) => sent.params.push([i, p, v]),
      setInstrumentProgramStep: (i: number, s: number, v: number) => sent.steps.push([i, s, v]),
      setInstrumentName: (i: number, n: string) => sent.names.push([i, n]),
    }),
  },
}));

import { useFormatStore } from '@stores/useFormatStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import {
  editKlysField, toggleKlysBit, editKlysProgramStep, insertKlysProgramStep, renameKlysInstrument,
  undoKlysInstrumentEdit, redoKlysInstrumentEdit, flushKlysInstrumentEdits,
} from '../klysInstrumentEdit';
import { KLYS_EMPTY_STEP, KLYS_PARAM_IDS } from '@/engine/klystrack/klysInstrumentFields';

const inst = (): KlysNativeInstrument => ({
  name: 'Lead', adsr: { a: 1, d: 2, s: 3, r: 4 }, flags: 0x1 | 0x8, cydflags: 0x20 | 0x200, baseNote: 48, finetune: 0, slideSpeed: 0,
  pw: 0, volume: 128, progPeriod: 2, vibratoSpeed: 0, vibratoDepth: 0, pwmSpeed: 0, pwmDepth: 0, cutoff: 100, resonance: 0,
  flttype: 0, ymEnvShape: 0, buzzOffset: 0, fxBus: 0, vibShape: 0, vibDelay: 0, pwmShape: 0, lfsrType: 0, wavetableEntry: 0,
  ringMod: 255, syncSource: 255,
  fm: { flags: 0, modulation: 0, feedback: 0, wave: 0, harmonic: 0x12, adsr: { a: 0, d: 0, s: 0, r: 0 }, attackStart: 0 },
  program: [],
});
const stored = (i = 2) => useFormatStore.getState().klysNative!.instruments[i];

beforeEach(() => {
  // The edit module queues per instrument across tests: drain it into a throwaway store first.
  useFormatStore.setState({ klysNative: { instruments: [inst(), inst(), inst()] } as unknown as KlysNativeData });
  flushKlysInstrumentEdits();
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { frames.push(cb); return frames.length; });
  frames.length = 0;
  sent.params.length = 0; sent.steps.length = 0; sent.names.length = 0;
  useFormatStore.setState({
    klysNative: { instruments: [inst(), inst(), inst()] } as unknown as KlysNativeData,
    klysInstrumentUndoStack: [], klysInstrumentRedoStack: [],
  });
  useInstrumentStore.setState({ instruments: [{ id: 3, name: 'Lead', synthType: 'KlysSynth' }] as never });
});
const frames: Array<() => void> = [];
const runFrame = () => { const f = frames.splice(0); f.forEach((cb) => cb()); };

describe('klystrack instrument edits', () => {
  it('clamps to the original editor ranges and sends exactly one setInstrumentParam with the right paramId', () => {
    editKlysField(2, 'cutoff', 4095);
    editKlysField(2, 'sustain', 99);
    editKlysField(2, 'attack', 99);
    editKlysField(2, 'fmFeedback', 40);
    editKlysField(2, 'volume', 999);
    expect(sent.params).toEqual([
      [2, KLYS_PARAM_IDS.cutoff, 2047], [2, KLYS_PARAM_IDS['adsr.s'], 31], [2, KLYS_PARAM_IDS['adsr.a'], 63],
      [2, KLYS_PARAM_IDS['fm.feedback'], 7], [2, KLYS_PARAM_IDS.volume, 255],
    ]);
  });

  it('writes the store once per frame, not once per edit', () => {
    for (let v = 1; v <= 10; v++) editKlysField(2, 'cutoff', v);
    expect(stored().cutoff, 'store waits for the frame').toBe(100);
    runFrame();
    expect(stored().cutoff).toBe(10);
    expect(useFormatStore.getState().klysInstrumentUndoStack.length, 'one undo entry for the frame').toBe(1);
    expect(sent.params.length, 'the engine heard every edit').toBe(10);
  });

  it('a bit toggle flips only that bit and keeps the exempt bits, and an exempt bit is not toggleable', () => {
    toggleKlysBit(2, 'cydflags', 512);
    toggleKlysBit(2, 'cydflags', 32);
    toggleKlysBit(2, 'flags', 1);
    runFrame();
    expect(stored().cydflags).toBe(0x20);
    expect(stored().flags).toBe(0x1 | 0x8);
    expect(sent.params).toEqual([[2, KLYS_PARAM_IDS.cydflags, 0x20]]);
  });

  it('packed fields edit their half: buzz semitones keep the fine byte, carrier multiplier keeps the modulator nibble', () => {
    editKlysField(2, 'buzzFine', -3);
    editKlysField(2, 'buzzSemitones', 12);
    editKlysField(2, 'fmCarrierMultiplier', 7);
    runFrame();
    expect(stored().buzzOffset).toBe((12 << 8) | 0xFD);
    expect(stored().fm.harmonic).toBe(0x72);
  });

  it('a program step edit pads the stub program and reaches the engine; insert shifts and NOP-fills', () => {
    editKlysProgramStep(2, 1, 0x0C40);
    insertKlysProgramStep(2, 0);
    runFrame();
    expect(stored().program.length).toBe(32);
    expect(stored().program.slice(0, 3)).toEqual([KLYS_EMPTY_STEP, KLYS_EMPTY_STEP, 0x0C40]);
    expect(sent.steps).toContainEqual([2, 1, 0x0C40]);
    expect(sent.steps.at(-1)).toEqual([2, 2, 0x0C40]);
  });

  it('rename reaches the native model, the engine and InstrumentConfig.name', () => {
    renameKlysInstrument(2, 'Bass');
    runFrame();
    expect(stored().name).toBe('Bass');
    expect(sent.names).toEqual([[2, 'Bass']]);
    expect(useInstrumentStore.getState().instruments[0].name).toBe('Bass');
  });

  it('undo and redo restore the store and tell the engine', () => {
    editKlysField(2, 'cutoff', 500);
    flushKlysInstrumentEdits();
    sent.params.length = 0;
    undoKlysInstrumentEdit();
    expect(stored().cutoff).toBe(100);
    expect(sent.params).toEqual([[2, KLYS_PARAM_IDS.cutoff, 100]]);
    redoKlysInstrumentEdit();
    expect(stored().cutoff).toBe(500);
    expect(sent.params.at(-1)).toEqual([2, KLYS_PARAM_IDS.cutoff, 500]);
  });
});
