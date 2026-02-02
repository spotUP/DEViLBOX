/**
 * Sample Pack Store - Management for factory and user-uploaded sample packs
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { SamplePack } from '@typedefs/samplePack';
import { SAMPLE_PACKS as FACTORY_PACKS } from '@constants/samplePacks';
import { loadSamplePackFromZip, loadSamplePackFromDirectory } from '@lib/audio/SamplePackLoader';

interface SamplePackStore {
  // State
  userPacks: SamplePack[];
  
  // Computed (via getter)
  allPacks: SamplePack[];

  // Actions
  uploadZip: (file: File) => Promise<SamplePack>;
  uploadDirectory: (files: FileList) => Promise<SamplePack>;
  removeUserPack: (id: string) => void;
  clearUserPacks: () => void;
}

export const useSamplePackStore = create<SamplePackStore>()(
  immer((set, get) => ({
    // Initial state
    userPacks: [],

    // Getter for all packs
    get allPacks() {
      const state = get();
      return [...FACTORY_PACKS, ...state.userPacks];
    },

    // Actions
    uploadZip: async (file: File) => {
      try {
        const pack = await loadSamplePackFromZip(file);
        set((state) => {
          state.userPacks.push(pack);
        });
        return pack;
      } catch (error) {
        console.error('[SamplePackStore] Failed to upload ZIP:', error);
        throw error;
      }
    },

    uploadDirectory: async (files: FileList) => {
      try {
        const pack = await loadSamplePackFromDirectory(files);
        set((state) => {
          state.userPacks.push(pack);
        });
        return pack;
      } catch (error) {
        console.error('[SamplePackStore] Failed to upload directory:', error);
        throw error;
      }
    },

    removeUserPack: (id: string) => {
      set((state) => {
        state.userPacks = state.userPacks.filter((p) => p.id !== id);
      });
    },

    clearUserPacks: () => {
      set((state) => {
        state.userPacks = [];
      });
    },
  }))
);
