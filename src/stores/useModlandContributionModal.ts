/**
 * Modland Contribution Modal Store
 * 
 * Manages the state for showing the contribution modal when an unknown module is imported.
 */

import { create } from 'zustand';

interface ModlandContributionState {
  isOpen: boolean;
  filename: string;
  hash?: string;
  
  showModal: (filename: string, hash?: string) => void;
  closeModal: () => void;
}

export const useModlandContributionModal = create<ModlandContributionState>((set) => ({
  isOpen: false,
  filename: '',
  hash: undefined,
  
  showModal: (filename: string, hash?: string) => {
    set({ isOpen: true, filename, hash });
  },
  
  closeModal: () => {
    set({ isOpen: false, filename: '', hash: undefined });
  },
}));
