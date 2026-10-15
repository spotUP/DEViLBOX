/**
 * Review fix (KLYS-INSTRUMENT-EDITOR): store writes are coalesced to the animation frame, so the program table's
 * handler read a stale word for the second of two edits in one frame. Typing a command and then its chain flag
 * lost the command; a chain edit then a chain edit of another step lost the first. Edits read the pending
 * instrument (klysInstrumentEdit.readKlysInstrument), not the store.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { KlysNativeData, KlysNativeInstrument } from '@/types/tracker';

const sent = vi.hoisted(() => ({ steps: [] as Array<[number, number, number]> }));
vi.mock('@/engine/klystrack/KlysEngine', () => ({
  KlysEngine: {
    hasInstance: () => true,
    getInstance: () => ({ setInstrumentProgramStep: (i: number, s: number, v: number) => sent.steps.push([i, s, v]) }),
  },
}));

import { useFormatStore } from '@stores/useFormatStore';
import { flushKlysInstrumentEdits } from '../klysInstrumentEdit';
import { klysProgramCellChange } from '../klysProgramAdapter';

const inst = (program: number[]): KlysNativeInstrument => ({
  name: 'Lead', adsr: { a: 1, d: 2, s: 3, r: 4 }, flags: 0, cydflags: 0, baseNote: 60, finetune: 0, slideSpeed: 0,
  pw: 0, volume: 128, progPeriod: 2, vibratoSpeed: 0, vibratoDepth: 0, pwmSpeed: 0, pwmDepth: 0, cutoff: 0, resonance: 0,
  flttype: 0, ymEnvShape: 0, buzzOffset: 0, fxBus: 0, vibShape: 0, vibDelay: 0, pwmShape: 0, lfsrType: 0, wavetableEntry: 0,
  ringMod: 255, syncSource: 255,
  fm: { flags: 0, modulation: 0, feedback: 0, wave: 0, harmonic: 0, adsr: { a: 0, d: 0, s: 0, r: 0 }, attackStart: 0 },
  program,
});
const frames: Array<() => void> = [];
const stored = () => useFormatStore.getState().klysNative!.instruments[0].program;

beforeEach(() => {
  useFormatStore.setState({ klysNative: { instruments: [inst([])] } as unknown as KlysNativeData });
  flushKlysInstrumentEdits();
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { frames.push(cb); return frames.length; });
  frames.length = 0; sent.steps.length = 0;
  useFormatStore.setState({
    klysNative: { instruments: [inst([0xFFFE, 0xFFFE, 0xFFFE])] } as unknown as KlysNativeData,
    klysInstrumentUndoStack: [], klysInstrumentRedoStack: [],
  });
});

describe('program edits inside one frame', () => {
  it('a command and then its chain flag in one frame keep both', () => {
    const change = klysProgramCellChange(0);
    change(0, 1, 'cmd', 0x0C40);
    change(0, 1, 'chain', 1);
    expect(sent.steps.at(-1)).toEqual([0, 1, 0x8C40]);
    frames.splice(0).forEach((cb) => cb());
    expect(stored()[1]).toBe(0x8C40);
  });

  it('chain flags on two steps in one frame keep both', () => {
    useFormatStore.setState({ klysNative: { instruments: [inst([0x0C40, 0x0C41, 0xFFFE])] } as unknown as KlysNativeData });
    const change = klysProgramCellChange(0);
    change(0, 0, 'chain', 1);
    change(0, 1, 'chain', 1);
    frames.splice(0).forEach((cb) => cb());
    expect(stored().slice(0, 2)).toEqual([0x8C40, 0x8C41]);
  });
});
