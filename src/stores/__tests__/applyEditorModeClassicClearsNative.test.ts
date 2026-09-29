/**
 * A plain song after a native one leaves no native data behind.
 *
 * Dragging micro15.mod in after an AHX opened the AHX editor (2026-09-29).
 * applyEditorMode's classic branch set editorMode = 'classic' but, unlike
 * every other branch, never called clearNative: hivelyNative and
 * hivelyFileData from the previous song stayed in the store, and anything
 * reading them still saw an AHX.
 */
import { describe, it, expect } from 'vitest';
import { useFormatStore } from '../useFormatStore';

describe('applyEditorMode, classic after native', () => {
  it('a MOD after an AHX is classic with the AHX native data cleared', () => {
    const fs = useFormatStore.getState();
    fs.applyEditorMode({
      hivelyNative: { song: {} } as never,
      hivelyFileData: new ArrayBuffer(16),
      hivelyMeta: { stereoMode: 0, mixGain: 1, speedMultiplier: 1, version: 0 },
    });
    expect(useFormatStore.getState().editorMode).toBe('hively');

    useFormatStore.getState().applyEditorMode({});
    const s = useFormatStore.getState();
    expect(s.editorMode).toBe('classic');
    expect(s.hivelyNative).toBeNull();
    expect(s.hivelyFileData).toBeNull();
    expect(s.hivelyMeta).toBeNull();
  });
});
