/**
 * Owner, 2026-10-07: "after loading sunvox and playing it the whole pattern
 * display is dead, even for all formats loaded after it". The SunVox loader
 * sets trackerViewMode 'sunvox'; a plain (classic) song loaded afterwards never
 * left it, so the pattern editor stayed hidden.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useFormatStore } from '@/stores/useFormatStore';
import { useUIStore } from '@/stores/useUIStore';

describe('SunVox view mode does not outlive the SunVox song', () => {
  beforeEach(() => {
    useUIStore.getState().setTrackerViewMode('tracker');
  });

  it('a MOD loaded after a SunVox song shows the pattern display again', () => {
    useUIStore.getState().setActiveView('tracker');
    useUIStore.getState().setTrackerViewMode('sunvox');
    useFormatStore.getState().applyEditorMode({});
    expect(useFormatStore.getState().editorMode).toBe('classic');
    expect(useUIStore.getState().trackerViewMode).toBe('tracker');
  });

  it('a user-chosen grid view is left alone by a classic load', () => {
    useUIStore.getState().setTrackerViewMode('grid');
    useFormatStore.getState().applyEditorMode({});
    expect(useUIStore.getState().trackerViewMode).toBe('grid');
  });
});
