/**
 * AI Wizard Store - open state of the AI setup wizard, plus a persisted flag
 * so it opens on its own only once. Closing it by any route (finished or
 * dismissed) sets the flag; the "Set Up AI Help" buttons can still reopen it.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AIWizardState {
  isOpen: boolean;
  /** true once the wizard was completed or dismissed. */
  settled: boolean;
}

interface AIWizardActions {
  open: () => void;
  close: () => void;
}

export const useAIWizardStore = create<AIWizardState & AIWizardActions>()(
  persist(
    (set) => ({
      isOpen: false,
      settled: false,
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false, settled: true }),
    }),
    {
      name: 'devilbox-ai-wizard',
      version: 1,
      partialize: (state) => ({ settled: state.settled }),
      migrate: (persistedState) => {
        const state = (persistedState ?? {}) as { settled?: unknown };
        return { settled: state.settled === true };
      },
    },
  ),
);
