import { beforeEach, describe, expect, it } from 'vitest';
import { isQuietPage, startupPolicy } from '../startupPolicy';
import { useSettingsStore } from '@stores/useSettingsStore';

const on = { welcomeDialogEnabled: true, welcomeJingleEnabled: true };

describe('startupPolicy', () => {
  it('opens the dialog and runs the jingle with both settings on', () => {
    expect(startupPolicy('', on)).toEqual({ openDialog: true, runJingle: true });
  });

  it('dialog setting off: no dialog and no jingle (no gesture would unlock audio)', () => {
    expect(startupPolicy('', { ...on, welcomeDialogEnabled: false })).toEqual({ openDialog: false, runJingle: false });
  });

  it('jingle setting off: the dialog still opens', () => {
    expect(startupPolicy('', { ...on, welcomeJingleEnabled: false })).toEqual({ openDialog: true, runJingle: false });
  });

  it('?quiet: no dialog, no jingle, whatever the settings', () => {
    expect(isQuietPage('?quiet')).toBe(true);
    expect(isQuietPage('?a=1&quiet=1')).toBe(true);
    expect(isQuietPage('')).toBe(false);
    expect(startupPolicy('?quiet', on)).toEqual({ openDialog: false, runJingle: false });
    expect(startupPolicy('?quiet&collab=ABCDEF', on)).toEqual({ openDialog: false, runJingle: false });
  });

  it('a ?collab= link opens its modal even when the welcome dialog is off', () => {
    expect(startupPolicy('?collab=ABCDEF', { ...on, welcomeDialogEnabled: false }).openDialog).toBe(true);
  });

  describe('?quiet does not write settings', () => {
    beforeEach(() => useSettingsStore.setState({ welcomeDialogEnabled: true, welcomeJingleEnabled: true }));
    it('leaves the store and localStorage untouched', () => {
      const before = JSON.stringify(useSettingsStore.getState());
      const keys = Object.keys(localStorage).length;
      startupPolicy('?quiet', useSettingsStore.getState());
      expect(JSON.stringify(useSettingsStore.getState())).toBe(before);
      expect(Object.keys(localStorage).length).toBe(keys);
    });
  });
});
