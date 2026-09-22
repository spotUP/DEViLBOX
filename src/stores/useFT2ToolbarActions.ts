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
  /**
   * No `openFileBrowser` here, deliberately. It used to be one, pointing at
   * the toolbar's local `setShowFileBrowser` — a state setter of a component
   * that is UNMOUNTED exactly when the NavBar's replacement row is shown
   * (the Dub Deck expands by setting editorFullscreen, which hides the
   * toolbar). Setting state on an unmounted component does nothing, so the
   * NavBar's Load was dead whenever the dub deck was open: "i cant press
   * some buttons when the dub bus is active/fold out, load for example"
   * (2026-09-22). The file browser that is always mounted is the App-level
   * one behind `useUIStore.showFileBrowser`; the NavBar opens that.
   */
}

interface FT2ToolbarActionsStore extends FT2Actions {
  register: (actions: Required<FT2Actions>) => void;
  unregister: () => void;
}

const NULL_ACTIONS: FT2Actions = {
  playSong: null, playPattern: null, save: null,
  undo: null, redo: null,
};

export const useFT2ToolbarActions = create<FT2ToolbarActionsStore>((set) => ({
  ...NULL_ACTIONS,
  register: (actions) => set({ ...actions }),
  unregister: () => set({ ...NULL_ACTIONS }),
}));
