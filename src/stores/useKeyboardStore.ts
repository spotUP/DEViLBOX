/**
 * Keyboard Store - Manages keyboard scheme preferences and platform overrides
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_EDIT_BEHAVIOUR, isEditBehaviourChoice, type EditBehaviourChoice } from '@/lib/tracker/entryAdvanceProfiles';

/** Persisted schema version of 'keyboard-preferences'. 1 added `editBehaviour`. */
export const KEYBOARD_PREFS_VERSION = 1;

/** Migration of the persisted state; exported for tests. Unknown or missing editBehaviour -> Follow keyboard scheme. */
export function migrateKeyboardPrefs(persisted: unknown, _fromVersion: number): Record<string, unknown> {
  const p = (persisted && typeof persisted === 'object' ? persisted : {}) as Record<string, unknown>;
  return { ...p, editBehaviour: isEditBehaviourChoice(p.editBehaviour) ? p.editBehaviour : DEFAULT_EDIT_BEHAVIOUR };
}

export type PlatformOverride = 'auto' | 'mac' | 'pc';

export interface CustomBindings {
  pc: Record<string, string>;
  mac: Record<string, string>;
}

interface KeyboardState {
  activeScheme: string;
  platformOverride: PlatformOverride;
  customBindings: CustomBindings | null;
  customBindingsVersion: number;
  baseScheme: string;
  /** What the cursor does after a data entry: a tracker's behaviour, or follow the keyboard scheme / song format. */
  editBehaviour: EditBehaviourChoice;
  setEditBehaviour: (choice: EditBehaviourChoice) => void;
  setActiveScheme: (scheme: string) => void;
  setPlatformOverride: (platform: PlatformOverride) => void;
  setCustomBinding: (keyCombo: string, command: string, platform: 'pc' | 'mac') => void;
  removeCustomBinding: (keyCombo: string, platform: 'pc' | 'mac') => void;
  initCustomFromScheme: (bindings: CustomBindings, schemeName: string) => void;
  resetCustomBindings: () => void;
}

export const useKeyboardStore = create<KeyboardState>()(
  persist(
    (set, get) => ({
      activeScheme: 'fasttracker2',
      platformOverride: 'auto',
      customBindings: null,
      customBindingsVersion: 0,
      baseScheme: 'fasttracker2',
      editBehaviour: DEFAULT_EDIT_BEHAVIOUR,

      setEditBehaviour: (choice: EditBehaviourChoice) => {
        if (!isEditBehaviourChoice(choice)) return;
        set({ editBehaviour: choice });
      },

      setActiveScheme: (scheme: string) => {
        if (!scheme || typeof scheme !== 'string') {
          console.warn('[KeyboardStore] Invalid scheme name:', scheme);
          return;
        }
        set({ activeScheme: scheme });
      },
      setPlatformOverride: (platform: PlatformOverride) => set({ platformOverride: platform }),

      setCustomBinding: (keyCombo: string, command: string, platform: 'pc' | 'mac') => {
        const current = get().customBindings;
        if (!current) return;
        set({
          customBindings: {
            ...current,
            [platform]: { ...current[platform], [keyCombo]: command },
          },
          customBindingsVersion: get().customBindingsVersion + 1,
        });
      },

      removeCustomBinding: (keyCombo: string, platform: 'pc' | 'mac') => {
        const current = get().customBindings;
        if (!current) return;
        const updated = { ...current[platform] };
        delete updated[keyCombo];
        set({
          customBindings: { ...current, [platform]: updated },
          customBindingsVersion: get().customBindingsVersion + 1,
        });
      },

      initCustomFromScheme: (bindings: CustomBindings, schemeName: string) => {
        set({
          customBindings: {
            pc: { ...bindings.pc },
            mac: { ...bindings.mac },
          },
          baseScheme: schemeName,
        });
      },

      resetCustomBindings: () => {
        set({ customBindings: null, baseScheme: 'fasttracker2' });
      },
    }),
    {
      name: 'keyboard-preferences',
      version: KEYBOARD_PREFS_VERSION,
      migrate: (persisted, fromVersion) => migrateKeyboardPrefs(persisted, fromVersion) as unknown as KeyboardState,
    }
  )
);
