import { describe, it, expect } from 'vitest';
import { noteStartLevel, type NoteVolumeCell } from '../volumeColumn';

const cell = (c: Partial<NoteVolumeCell>): NoteVolumeCell => ({ volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0, ...c });

describe('row meter level follows the volume the note starts at', () => {
  it('a C20 with an empty volume column shows half height, not a fixed 0.7', () => {
    expect(noteStartLevel(cell({ effTyp: 0xC, eff: 0x20 }), 'classic')).toBeCloseTo(0.5, 6);
    expect(noteStartLevel(cell({ effTyp2: 0xC, eff2: 0x10 }), 'classic')).toBeCloseTo(0.25, 6);
  });

  it('the last Cxx wins and Cxx above 64 clamps', () => {
    expect(noteStartLevel(cell({ effTyp: 0xC, eff: 0x10, effTyp2: 0xC, eff2: 0x30 }), 'classic')).toBeCloseTo(0.75, 6);
    expect(noteStartLevel(cell({ effTyp: 0xC, eff: 0x7F }), 'classic')).toBe(1);
  });

  it('with no volume command the instrument default volume sets the level', () => {
    expect(noteStartLevel(cell({}), 'classic', 32)).toBeCloseTo(0.5, 6);
    expect(noteStartLevel(cell({}), 'classic')).toBe(1);
  });

  it('a volume-column level overrides Cxx and the instrument volume', () => {
    // XM volume column 0x30 = set volume 0x20.
    expect(noteStartLevel(cell({ volume: 0x30, effTyp: 0xC, eff: 0x40 }), 'classic', 64)).toBeCloseTo(0.5, 6);
  });
});
