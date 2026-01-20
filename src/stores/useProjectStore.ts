/**
 * Project Store - Project Metadata & Save/Load State
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { ProjectMetadata } from '@typedefs/project';
import { idGenerator } from '../utils/idGenerator';
import { APP_VERSION } from '@constants/version';

interface ProjectStore {
  // State
  metadata: ProjectMetadata;
  isDirty: boolean;
  lastSavedAt: string | null;

  // Actions
  setMetadata: (updates: Partial<ProjectMetadata>) => void;
  setIsDirty: (dirty: boolean) => void;
  markAsSaved: () => void;
  markAsModified: () => void;
  resetProject: () => void;
}

export const useProjectStore = create<ProjectStore>()(
  immer((set) => ({
    // Initial state
    metadata: {
      id: idGenerator.generate('project'),
      name: 'Untitled',
      author: 'Unknown',
      description: '',
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      version: APP_VERSION,
    },
    isDirty: false,
    lastSavedAt: null,

    // Actions
    setMetadata: (updates) =>
      set((state) => {
        Object.assign(state.metadata, updates);
        state.metadata.modifiedAt = new Date().toISOString();
        state.isDirty = true;
      }),

    setIsDirty: (dirty) =>
      set((state) => {
        state.isDirty = dirty;
      }),

    markAsSaved: () =>
      set((state) => {
        state.isDirty = false;
        state.lastSavedAt = new Date().toISOString();
      }),

    markAsModified: () =>
      set((state) => {
        state.isDirty = true;
        state.metadata.modifiedAt = new Date().toISOString();
      }),

    resetProject: () =>
      set((state) => {
        state.metadata = {
          id: idGenerator.generate('project'),
          name: 'Untitled',
          author: 'Unknown',
          description: '',
          createdAt: new Date().toISOString(),
          modifiedAt: new Date().toISOString(),
          version: APP_VERSION,
        };
        state.isDirty = false;
        state.lastSavedAt = null;
      }),
  }))
);
