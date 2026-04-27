/**
 * useFT2ToolbarActions — thin bridge so NavBar can invoke FT2Toolbar
 * handlers without duplicating logic.
 *
 * FT2Toolbar registers its callbacks once on mount using stable ref-wrappers
 * (so the store always calls the latest version). NavBar reads the callbacks
 * and renders a compact transport row when the dub deck is expanded.
 */

import { create } from 'zustand';

interface FT2Actions {
  playSong: (() => void) | null;
  playPattern: (() => void) | null;
  save: (() => void) | null;
  undo: (() => void) | null;
  redo: (() => void) | null;
  openFileBrowser: (() => void) | null;
}

interface FT2ToolbarActionsStore extends FT2Actions {
  register: (actions: Required<FT2Actions>) => void;
  unregister: () => void;
}

const NULL_ACTIONS: FT2Actions = {
  playSong: null, playPattern: null, save: null,
  undo: null, redo: null, openFileBrowser: null,
};

export const useFT2ToolbarActions = create<FT2ToolbarActionsStore>((set) => ({
  ...NULL_ACTIONS,
  register: (actions) => set({ ...actions }),
  unregister: () => set({ ...NULL_ACTIONS }),
}));
