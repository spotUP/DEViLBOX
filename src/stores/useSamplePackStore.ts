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
  
  // Actions
  uploadZip: (file: File) => Promise<SamplePack>;
  uploadDirectory: (files: FileList) => Promise<SamplePack>;
  removeUserPack: (id: string) => void;
  clearUserPacks: () => void;
}

export const useSamplePackStore = create<SamplePackStore>()(
  immer((set) => ({
    // Initial state
    userPacks: [],

    // Actions
    uploadZip: async (file: File) => {
      console.log(`[SamplePackStore] uploadZip starting: ${file.name}`);
      try {
        const pack = await loadSamplePackFromZip(file);
        console.log(`[SamplePackStore] ZIP loaded, adding pack: ${pack.name} (${pack.sampleCount} samples)`);
        
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
      console.log(`[SamplePackStore] uploadDirectory starting: ${files.length} files`);
      try {
        const pack = await loadSamplePackFromDirectory(files);
        console.log(`[SamplePackStore] Directory loaded, adding pack: ${pack.name} (${pack.sampleCount} samples)`);
        
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

/**
 * Derived selector for all sample packs (Factory + User)
 * Use this in components to get the combined list
 */
export const useAllSamplePacks = () => {
  const userPacks = useSamplePackStore((state) => state.userPacks);
  return [...FACTORY_PACKS, ...userPacks];
};
