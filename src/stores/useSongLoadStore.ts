/**
 * useSongLoadStore - the song lifecycle's state: which song generation is
 * current, and whether a load is in flight (the UI shows it at once; a load
 * that fails leaves silence, owner decision D3 of plan
 * 2026-10-07-one-load-save-export-path).
 */
import { create } from 'zustand';

interface SongLoadState {
  /** Bumped by every unload; frames from an older generation are late frames. */
  generation: number;
  /** Nested loads in flight (a project load may import a module). */
  depth: number;
  /** What is loading (file name), for the status line. */
  label: string;
  /** The outgoing song was already unloaded by the opener of this load. */
  unloadedForLoad: boolean;
}

export const useSongLoadStore = create<SongLoadState>(() => ({
  generation: 0,
  depth: 0,
  label: '',
  unloadedForLoad: false,
}));
