import { describe, it, expect } from 'vitest';
import { shownMacroIndices } from '../MacroEditor';
import { FurnaceMacroType, type FurnaceMacro } from '@typedefs/instrument';

const m = (type: number, code?: number): FurnaceMacro => ({ type, code, data: [1], loop: -1, release: -1, mode: 0, speed: 1 });

describe('shownMacroIndices (Waveform Studio macro lanes)', () => {
  const macros = [m(FurnaceMacroType.WAVE), m(FurnaceMacroType.VOL), m(FurnaceMacroType.ALG), m(0, FurnaceMacroType.ARP)];

  it('shows every macro when no lane filter is given', () => {
    expect(shownMacroIndices(macros)).toEqual([0, 1, 2, 3]);
  });

  it('returns indices into the full list so edits write back in place and hidden macros stay', () => {
    const lanes = [FurnaceMacroType.VOL, FurnaceMacroType.PITCH, FurnaceMacroType.DUTY, FurnaceMacroType.ARP];
    expect(shownMacroIndices(macros, lanes)).toEqual([1, 3]);
  });
});
