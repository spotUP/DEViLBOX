/**
 * KLYS-INSTRUMENT-EDITOR (KIE-3.3, KIE-3.4): the program table shows klystrack's own program: NOP is an empty
 * step, a 0x8xxx word is the instruction with the chain flag, an Arp step names the note it plays, and typing a
 * command keeps the step's chain flag. Edits reach the store and the engine through editKlysProgramStep.
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
import {
  KLYS_PROGRAM_COLUMNS, klysProgramToRows, klysProgramCellChange, makeKlysProgramCellChange,
} from '../klysProgramAdapter';
import { KLYS_PROGRAM_COMMANDS, describeKlysStep, klysCommandOf } from '@/engine/klystrack/klysProgramCommands';
import { KLYS_EMPTY_STEP } from '@/engine/klystrack/klysInstrumentFields';

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
    klysNative: { instruments: [inst([0x8C40, 0x0C40, 0x0000, 0xFFFE])] } as unknown as KlysNativeData,
    klysInstrumentUndoStack: [], klysInstrumentRedoStack: [],
  });
});

describe('klystrack program table', () => {
  it('has the original 63 instructions', () => {
    expect(KLYS_PROGRAM_COMMANDS.length).toBe(63);
    expect(klysCommandOf(0x0C40)?.name).toBe('Set Volume');
    expect(klysCommandOf(0xFFFE)?.name).toBe('No Operation');
  });

  it('shows NOP as an empty step and 0x8xxx as the instruction with the chain flag', () => {
    const cols = KLYS_PROGRAM_COLUMNS(60);
    const rows = klysProgramToRows([0x8C40, 0xFFFE]);
    expect(rows).toHaveLength(32);
    expect(rows[0]).toMatchObject({ cmd: 0x0C40, chain: 1 });
    expect(cols[0].formatter(rows[0].cmd)).toBe('0C40');
    expect(rows[1]).toMatchObject({ cmd: KLYS_EMPTY_STEP, chain: 0 });
    expect(rows[1].cmd).toBe(cols[0].emptyValue);
    expect(rows[31].cmd).toBe(KLYS_EMPTY_STEP);
    expect(describeKlysStep(0xFFFE, 60)).toBe('');
  });

  it('describes an Arp step as base + n and an absolute arp as its note', () => {
    expect(describeKlysStep(0x0007, 60)).toBe('G-5');
    expect(describeKlysStep(0x0000, 60)).toBe('C-5');
    expect(describeKlysStep(0x4018, 60)).toBe('C-2');
    expect(describeKlysStep(0x00F0, 60)).toBe('External Arpeggio 1');
    expect(describeKlysStep(0x00F1, 60)).toBe('External Arpeggio 2');
    expect(describeKlysStep(0x8007, 60)).toBe('G-5');
    expect(describeKlysStep(0x0C40, 60)).toBe('Set Volume 40');
    expect(KLYS_PROGRAM_COLUMNS(60)[2].formatter(0x0007)).toBe('G-5');
  });

  it('typing a command keeps the step\'s chain flag, and chain toggles bit 15', () => {
    const change = klysProgramCellChange(0);
    change(0, 0, 'cmd', 0x0F03);           // step 0 is chained
    change(0, 1, 'cmd', 0x0F03);           // step 1 is not
    change(0, 1, 'chain', 1);
    change(0, 0, 'chain', 0);
    flushKlysInstrumentEdits();
    expect(stored().slice(0, 2)).toEqual([0x0F03, 0x8F03]);
    expect(sent.steps).toContainEqual([0, 0, 0x8F03]);
    // Delete on the command column writes NOP; NOP has no chain flag.
    change(0, 0, 'cmd', KLYS_EMPTY_STEP);
    flushKlysInstrumentEdits();
    expect(stored()[0]).toBe(0xFFFE);
  });

  it('never gives the 0xFxxx group a chain flag and writes nothing for the meaning column', () => {
    const writes: Array<[number, number]> = [];
    const change = makeKlysProgramCellChange((s) => [0x8C40, 0xFF05][s] ?? 0xFFFE, (s, w) => writes.push([s, w]));
    change(0, 1, 'chain', 1);
    change(0, 0, 'cmd', 0xFF02);
    change(0, 0, 'meaning', 0x1234);
    expect(writes).toEqual([[0, 0xFF02]]);
  });
});
