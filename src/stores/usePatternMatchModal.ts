/**
 * usePatternMatchModal.ts
 * 
 * Store for managing the "Find Similar Tunes" pattern match modal.
 * Shows remixes/covers that share the same melody (pattern hash).
 */

import { create } from 'zustand';
import type { ModlandHashFile } from '@/lib/modlandApi';

interface PatternMatchModalState {
  isOpen: boolean;
  patternHash: string | null;
  originalFile: ModlandHashFile | null;
  matches: ModlandHashFile[];
  loading: boolean;
  
  // Actions
  showModal: (patternHash: string, originalFile: ModlandHashFile | null) => void;
  setMatches: (matches: ModlandHashFile[]) => void;
  setLoading: (loading: boolean) => void;
  closeModal: () => void;
}

export const usePatternMatchModal = create<PatternMatchModalState>((set) => ({
  isOpen: false,
  patternHash: null,
  originalFile: null,
  matches: [],
  loading: false,
  
  showModal: (patternHash, originalFile) => 
    set({ 
      isOpen: true, 
      patternHash, 
      originalFile,
      matches: [],
      loading: true
    }),
  
  setMatches: (matches) => 
    set({ matches, loading: false }),
  
  setLoading: (loading) => 
    set({ loading }),
  
  closeModal: () => 
    set({ 
      isOpen: false, 
      patternHash: null, 
      originalFile: null,
      matches: [],
      loading: false
    }),
}));
