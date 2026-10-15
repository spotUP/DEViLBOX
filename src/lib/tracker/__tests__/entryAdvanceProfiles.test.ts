import { describe, it, expect } from 'vitest';
import {
  resolveEntryProfile, ENTRY_PROFILES, EDIT_BEHAVIOUR_OPTIONS, isEditBehaviourChoice,
} from '../entryAdvanceProfiles';
import { migrateKeyboardPrefs } from '@stores/useKeyboardStore';

describe('resolveEntryProfile', () => {
  it('follow-keymap: the ProTracker keymap gets ProTracker behaviour', () => {
    expect(resolveEntryProfile({ choice: 'follow-keymap', keymap: 'protracker' }).id).toBe('protracker');
  });
  it('follow-keymap: impulse-tracker and openmpt keymaps get their own', () => {
    expect(resolveEntryProfile({ choice: 'follow-keymap', keymap: 'impulse-tracker' }).id).toBe('impulse-tracker');
    expect(resolveEntryProfile({ choice: 'follow-keymap', keymap: 'openmpt' }).id).toBe('openmpt');
  });
  it('follow-keymap: unverified keymaps and the FT2 keymap keep the DEViLBOX default', () => {
    for (const k of ['fasttracker2', 'renoise', 'octamed', 'nonsense']) {
      expect(resolveEntryProfile({ choice: 'follow-keymap', keymap: k }).id).toBe('devilbox');
    }
  });
  it('an explicit choice beats the keymap', () => {
    expect(resolveEntryProfile({ choice: 'devilbox', keymap: 'protracker' }).id).toBe('devilbox');
    expect(resolveEntryProfile({ choice: 'fasttracker2', keymap: 'protracker' }).id).toBe('fasttracker2');
  });
  it('follow-format uses the song format, and falls back to the keymap when unknown', () => {
    expect(resolveEntryProfile({ choice: 'follow-format', keymap: 'fasttracker2', sourceFormat: 'MOD' }).id).toBe('protracker');
    expect(resolveEntryProfile({ choice: 'follow-format', keymap: 'protracker', sourceFormat: 'XM' }).id).toBe('fasttracker2');
    expect(resolveEntryProfile({ choice: 'follow-format', keymap: 'protracker', sourceFormat: 'Weird' }).id).toBe('protracker');
  });
  it('every option in the settings list is a valid choice; every profile is selectable', () => {
    for (const o of EDIT_BEHAVIOUR_OPTIONS) expect(isEditBehaviourChoice(o.value)).toBe(true);
    for (const id of Object.keys(ENTRY_PROFILES)) expect(EDIT_BEHAVIOUR_OPTIONS.some((o) => o.value === id)).toBe(true);
    expect(isEditBehaviourChoice('bogus')).toBe(false);
  });
});

describe('keyboard preferences migration', () => {
  it('adds editBehaviour = follow-keymap to a version-0 state and keeps the rest', () => {
    expect(migrateKeyboardPrefs({ activeScheme: 'protracker' }, 0)).toEqual({ activeScheme: 'protracker', editBehaviour: 'follow-keymap' });
  });
  it('keeps a valid stored choice, replaces an invalid one', () => {
    expect(migrateKeyboardPrefs({ editBehaviour: 'openmpt' }, 1).editBehaviour).toBe('openmpt');
    expect(migrateKeyboardPrefs({ editBehaviour: 'zzz' }, 1).editBehaviour).toBe('follow-keymap');
    expect(migrateKeyboardPrefs(null, 0).editBehaviour).toBe('follow-keymap');
  });
});
