import { describe, it, expect } from 'vitest';
import { useEditorStore } from '@stores/useEditorStore';
import { typedPitch } from '@/lib/tracker/formatEntryPlan';
import { keyNoteValue, noteValueName, TYPING_OCTAVE_LOWEST } from '@/lib/tracker/noteValue';

// G21: the octave below C-0 (stored -12..-1, shown c_1..b_1) must be typeable.
describe('typing the octave below C-0', () => {
  it('lets the editor octave go down to -1', () => {
    useEditorStore.getState().setCurrentOctave(-1);
    expect(useEditorStore.getState().currentOctave).toBe(TYPING_OCTAVE_LOWEST);
    expect(TYPING_OCTAVE_LOWEST).toBe(-1);
    useEditorStore.getState().setCurrentOctave(-5);
    expect(useEditorStore.getState().currentOctave).toBe(-1);
    useEditorStore.getState().setCurrentOctave(4);
  });

  it('Z at octave -1 types c_1 (stored -12), the classic grid path', () => {
    const v = keyNoteValue('C', -1);
    expect(v).toBe(-12);
    expect(noteValueName(v)).toBe('c_1');
    expect(noteValueName(keyNoteValue('B', -1))).toBe('b_1');
    expect(keyNoteValue('C', 0)).toBe(1);
    expect(keyNoteValue('C#', 4)).toBe(50);
  });

  it('Z at octave -1 is a pitch on the format-editor path', () => {
    expect(typedPitch('z', -1)).toBe(-12);
    expect(typedPitch('z', 0)).toBe(0);
  });
});
