/**
 * useSongLoadStore - the song lifecycle's state: which song generation is
 * current, whether a load is in flight (the UI shows it at once; a load
 * that fails leaves silence, owner decision D3 of plan
 * 2026-10-07-one-load-save-export-path), and which phase of the load it is in.
 *
 * Phase and elapsed time are published by openSong and by the opener steps it
 * runs (setSongLoadPhase). The status bar and the pattern editor's loading
 * panel (SongLoadPanel, with its Cancel button) read the same fields.
 */
import { create } from 'zustand';

/** The steps of opening a song, in the order they run. */
export type OpenPhase =
  | 'idle'
  | 'acquire'      // reading the file / fetching it
  | 'companions'   // fetching the partner files of a multi-file format
  | 'unload'       // the old song leaves
  | 'scan'         // reading the file to learn what it is (UADE scan, format sniff)
  | 'parse'        // building the editable pattern grid
  | 'apply'        // putting the song into the stores
  | 'start';       // starting playback

export const OPEN_PHASE_LABEL: Record<OpenPhase, string> = {
  idle: '',
  acquire: 'Reading file',
  companions: 'Fetching companion files',
  unload: 'Stopping previous song',
  scan: 'Scanning',
  parse: 'Building pattern grid',
  apply: 'Applying song',
  start: 'Starting playback',
};

interface SongLoadState {
  /** Bumped by every unload; frames from an older generation are late frames. */
  generation: number;
  /** Nested loads in flight (a project load may import a module). */
  depth: number;
  /** What is loading (file name), for the status line. */
  label: string;
  /** The outgoing song was already unloaded by the opener of this load. */
  unloadedForLoad: boolean;
  /** Where the load is now. 'idle' when nothing loads. */
  phase: OpenPhase;
  /** performance.now() when the load began (elapsed time = now - startedAt). */
  startedAt: number;
  /** The load was asked for by a person at a dialog (may raise questions); false for MCP, jukebox, tour, embed. */
  interactive: boolean;
  /** The load was cancelled (the panel's Cancel button); the opener steps stop at their next check. */
  cancelled: boolean;
  /**
   * The silent boot restore: the editor is still covered (its fade-in waits for
   * the load) but no loading panel shows, so the jingle's lips fade straight
   * into the restored song.
   */
  silent: boolean;
  /** The loading panel's Cancel button: the running openSong sets it, the panel calls it. */
  cancel: (() => void) | null;
}

export const useSongLoadStore = create<SongLoadState>(() => ({
  generation: 0,
  depth: 0,
  label: '',
  unloadedForLoad: false,
  phase: 'idle',
  startedAt: 0,
  interactive: true,
  cancelled: false,
  silent: false,
  cancel: null,
}));

/** Publish the phase of the load in flight (no-op outside a load). */
export function setSongLoadPhase(phase: OpenPhase): void {
  if (useSongLoadStore.getState().depth === 0) return;
  useSongLoadStore.setState({ phase });
}

/** Throw when the person pressed Cancel; the opener steps call this between phases. */
export function throwIfSongLoadCancelled(): void {
  if (useSongLoadStore.getState().cancelled) throw new Error('Load cancelled');
}
