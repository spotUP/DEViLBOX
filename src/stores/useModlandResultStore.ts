/**
 * useModlandResultStore.ts
 * 
 * Stores the last Modland check result so UI can access pattern hash info
 * and show "Find Similar Tunes" button when applicable.
 */

import { create } from 'zustand';
import type { ModlandCheckResult } from '@/lib/modland/ModlandDetector';

interface ModlandResultState {
  lastResult: ModlandCheckResult | null;
  setLastResult: (result: ModlandCheckResult | null) => void;
  clearResult: () => void;
}

export const useModlandResultStore = create<ModlandResultState>((set) => ({
  lastResult: null,
  
  setLastResult: (result) => set({ lastResult: result }),
  
  clearResult: () => set({ lastResult: null }),
}));
