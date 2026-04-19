import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '../useSettingsStore';
import { resetStore } from './_harness';

describe('useSettingsStore — format engine preferences', () => {
  beforeEach(() => resetStore(useSettingsStore));

  it('exposes a populated FormatEnginePreferences object', () => {
    const s = useSettingsStore.getState();
    expect(s.formatEngine).toBeDefined();
    // At minimum, the well-known keys mentioned throughout the codebase
    // must exist. If someone deletes one, downstream code (parseModuleToSong,
    // NativeEngineRouting) silently falls back to defaults.
    for (const key of ['mod', 'hvl', 'med', 'fc', 'okt', 'tfmx'] as const) {
      expect(s.formatEngine[key], `formatEngine.${key}`).toMatch(/^(native|uade)$/);
    }
  });

  it('setFormatEngine assigns a single entry without disturbing the rest', () => {
    const before = { ...useSettingsStore.getState().formatEngine };
    const flip = before.mod === 'native' ? 'uade' : 'native';
    useSettingsStore.getState().setFormatEngine('mod', flip);
    const after = useSettingsStore.getState().formatEngine;
    expect(after.mod).toBe(flip);
    expect(after.hvl).toBe(before.hvl);
    expect(after.med).toBe(before.med);
  });
});

describe('useSettingsStore — numeric settings', () => {
  beforeEach(() => resetStore(useSettingsStore));

  it('setMasterTuning accepts reasonable hertz values', () => {
    useSettingsStore.getState().setMasterTuning(432);
    expect(useSettingsStore.getState().masterTuning).toBe(432);
    useSettingsStore.getState().setMasterTuning(440);
    expect(useSettingsStore.getState().masterTuning).toBe(440);
  });

  it('setStereoSeparation stores any number (engine handles clamping)', () => {
    useSettingsStore.getState().setStereoSeparation(0);
    expect(typeof useSettingsStore.getState().stereoSeparation).toBe('number');
    useSettingsStore.getState().setStereoSeparation(100);
    expect(useSettingsStore.getState().stereoSeparation).toBe(100);
  });
});
