import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type PlatformOverride = 'auto' | 'mac' | 'pc';

interface KeyboardState {
  activeScheme: string;
  platformOverride: PlatformOverride;
  setActiveScheme: (scheme: string) => void;
  setPlatformOverride: (platform: PlatformOverride) => void;
}

export const useKeyboardStore = create<KeyboardState>()(
  persist(
    (set) => ({
      activeScheme: 'fasttracker2',
      platformOverride: 'auto',

      setActiveScheme: (scheme: string) => set({ activeScheme: scheme }),
      setPlatformOverride: (platform: PlatformOverride) => set({ platformOverride: platform }),
    }),
    {
      name: 'keyboard-preferences',
    }
  )
);
