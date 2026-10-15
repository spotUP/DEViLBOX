/**
 * CZ-101 user patches: the sounds a user imported from Casio CZ SysEx dumps.
 * Persisted in localStorage under 'devilbox-cz101-user-patches' (versioned; bump `version`
 * and extend `migrate` when the stored shape changes). A patch is referenced from an
 * instrument by its numeric id (parameter `_userPatch`), so ids are never reused.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CZPatch } from '@engine/cz101/cz101Types';

export interface Cz101UserPatch {
  id: number;
  name: string;
  patch: CZPatch;
}

interface Cz101UserPatchState {
  patches: Cz101UserPatch[];
  nextId: number;
  /** Add patches (named by `patch.name`); returns their ids in order. */
  addPatches: (patches: CZPatch[]) => number[];
  removePatch: (id: number) => void;
}

export const CZ101_USER_PATCH_STORE_VERSION = 1;

export const useCz101UserPatchStore = create<Cz101UserPatchState>()(
  persist(
    (set, get) => ({
      patches: [],
      nextId: 1,
      addPatches: (patches) => {
        const first = get().nextId;
        const added = patches.map((patch, i) => ({ id: first + i, name: patch.name ?? `CZ patch ${first + i}`, patch }));
        set((state) => ({ patches: [...state.patches, ...added], nextId: first + added.length }));
        return added.map((entry) => entry.id);
      },
      removePatch: (id) => set((state) => ({ patches: state.patches.filter((entry) => entry.id !== id) })),
    }),
    {
      name: 'devilbox-cz101-user-patches',
      version: CZ101_USER_PATCH_STORE_VERSION,
      // v1 is the first stored shape; nothing older exists to migrate
      migrate: (persisted) => persisted as Cz101UserPatchState,
      partialize: (state) => ({ patches: state.patches, nextId: state.nextId }),
    },
  ),
);

/** Patch by id, or undefined when this browser does not hold it (a song carried the id from elsewhere). */
export function getCz101UserPatch(id: number): Cz101UserPatch | undefined {
  return useCz101UserPatchStore.getState().patches.find((entry) => entry.id === id);
}
