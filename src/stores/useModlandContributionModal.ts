/**
 * Modland Contribution Modal Store
 * 
 * Manages the state for showing the contribution modal when an unknown module is imported.
 * Tracks dismissed hashes in localStorage to avoid showing the modal again for the same file.
 */

import { create } from 'zustand';

const DISMISSED_HASHES_KEY = 'modland-dismissed-hashes';

/** Get dismissed hashes from localStorage */
function getDismissedHashes(): Set<string> {
  try {
    const stored = localStorage.getItem(DISMISSED_HASHES_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

/** Save dismissed hashes to localStorage */
function saveDismissedHashes(hashes: Set<string>): void {
  try {
    localStorage.setItem(DISMISSED_HASHES_KEY, JSON.stringify(Array.from(hashes)));
  } catch (error) {
    console.warn('[ModlandContributionModal] Failed to save dismissed hashes:', error);
  }
}

interface ModlandContributionState {
  isOpen: boolean;
  filename: string;
  hash?: string;
  dismissedHashes: Set<string>;
  
  showModal: (filename: string, hash?: string) => void;
  closeModal: () => void;
  dismissForFile: () => void;
  isDismissed: (hash: string) => boolean;
  clearDismissedHashes: () => void;
}

export const useModlandContributionModal = create<ModlandContributionState>((set, get) => ({
  isOpen: false,
  filename: '',
  hash: undefined,
  dismissedHashes: getDismissedHashes(),
  
  showModal: (filename: string, hash?: string) => {
    // Don't show if this hash has been dismissed
    if (hash && get().dismissedHashes.has(hash)) {
      console.log('[ModlandContributionModal] Skipping dismissed hash:', hash);
      return;
    }
    set({ isOpen: true, filename, hash });
  },
  
  closeModal: () => {
    set({ isOpen: false, filename: '', hash: undefined });
  },
  
  dismissForFile: () => {
    const { hash, dismissedHashes } = get();
    if (hash) {
      const newDismissed = new Set(dismissedHashes);
      newDismissed.add(hash);
      saveDismissedHashes(newDismissed);
      set({ dismissedHashes: newDismissed });
      console.log('[ModlandContributionModal] Dismissed hash:', hash);
    }
    // Close the modal
    get().closeModal();
  },
  
  isDismissed: (hash: string) => {
    return get().dismissedHashes.has(hash);
  },
  
  clearDismissedHashes: () => {
    saveDismissedHashes(new Set());
    set({ dismissedHashes: new Set() });
    console.log('[ModlandContributionModal] Cleared all dismissed hashes');
  },
}));
