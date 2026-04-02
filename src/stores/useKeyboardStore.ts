/**
 * Keyboard Store - Manages keyboard scheme preferences and platform overrides
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
    }
  )
);
