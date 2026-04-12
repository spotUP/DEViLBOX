/**
 * DJ Playlist Store
 *
 * Manages ordered playlists of tracker module files for the DJ view.
 * Persisted to localStorage and synced to server when logged in.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { pushToCloud } from '@/lib/cloudSync';
import { SYNC_KEYS } from '@/hooks/useCloudSync';
import type { EffectConfig } from '@/types/instrument/effects';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PlaylistTrack {
  /** Original filename (e.g. "axelf.mod") */
  fileName: string;
  /** Display name (from song.name or filename) */
  trackName: string;
  /** File format (MOD, XM, IT, S3M, etc.) */
  format: string;
  /** Detected BPM (0 if unknown) */
  bpm: number;
  /** Estimated duration in seconds (0 if unknown) */
  duration: number;
  /** When this track was added */
  addedAt: number;
  /** Optional download URL (e.g. Modland HTTP URL) */
  sourceUrl?: string;
  /** Musical key from analysis (e.g. "C minor", "8B") */
  musicalKey?: string;
  /** Energy level 0-1 from analysis */
  energy?: number;
  /** True if analysis was skipped (404, render fail) — don't re-scan */
  analysisSkipped?: boolean;
  /** True if this track was played in the current session (cleared on playlist load) */
  played?: boolean;
}

export interface DJPlaylist {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  tracks: PlaylistTrack[];
  /** Master FX chain saved with this playlist — applied when Auto DJ starts */
  masterEffects?: EffectConfig[];
}

interface DJPlaylistState {
  playlists: DJPlaylist[];
  activePlaylistId: string | null;

  // Actions
  createPlaylist: (name: string) => string;
  deletePlaylist: (playlistId: string) => void;
  renamePlaylist: (playlistId: string, name: string) => void;
  setActivePlaylist: (playlistId: string | null) => void;
  addTrack: (playlistId: string, track: PlaylistTrack) => void;
  removeTrack: (playlistId: string, index: number) => void;
  reorderTrack: (playlistId: string, fromIndex: number, toIndex: number) => void;
  sortTracks: (playlistId: string, sortedTracks: PlaylistTrack[]) => void;
  updateTrackMeta: (playlistId: string, index: number, meta: Partial<Pick<PlaylistTrack, 'musicalKey' | 'energy' | 'bpm' | 'duration' | 'fileName' | 'sourceUrl' | 'analysisSkipped' | 'played'>>) => void;
  markTrackPlayed: (playlistId: string, index: number) => void;
  importPlaylists: (playlists: DJPlaylist[]) => void;
  /** Save master FX chain to a playlist (applied when Auto DJ starts) */
  setPlaylistMasterEffects: (playlistId: string, effects: EffectConfig[] | undefined) => void;
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useDJPlaylistStore = create<DJPlaylistState>()(
  persist(
    immer((set, _get) => ({
      playlists: [],
      activePlaylistId: null,

      createPlaylist: (name: string) => {
        const id = `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const now = Date.now();
        set((state) => {
          state.playlists.push({
            id,
            name,
            createdAt: now,
            updatedAt: now,
            tracks: [],
          });
          state.activePlaylistId = id;
        });
        // Async sync — fire and forget
        syncPlaylists();
        return id;
      },

      deletePlaylist: (playlistId: string) => {
        set((state) => {
          state.playlists = state.playlists.filter((p) => p.id !== playlistId);
          if (state.activePlaylistId === playlistId) {
            state.activePlaylistId = state.playlists[0]?.id ?? null;
          }
        });
        syncPlaylists();
      },

      renamePlaylist: (playlistId: string, name: string) => {
        set((state) => {
          const p = state.playlists.find((pl) => pl.id === playlistId);
          if (p) {
            p.name = name;
            p.updatedAt = Date.now();
          }
        });
        syncPlaylists();
      },

      setActivePlaylist: (playlistId: string | null) => {
        set((state) => {
          state.activePlaylistId = playlistId;
        });
      },

      addTrack: (playlistId: string, track: PlaylistTrack) => {
        // Capture audio store state BEFORE mutating playlist store to avoid
        // reading stale data if the audio store is mid-mutation.
        let masterFxSnapshot: EffectConfig[] | null = null;
        try {
          const { useAudioStore } = require('@/stores/useAudioStore');
          const fx = useAudioStore.getState().masterEffects;
          if (fx.length > 0) {
            masterFxSnapshot = JSON.parse(JSON.stringify(fx));
          }
        } catch { /* audio store not available */ }

        set((state) => {
          const p = state.playlists.find((pl) => pl.id === playlistId);
          if (p) {
            p.tracks.push(track);
            p.updatedAt = Date.now();
            // Auto-snapshot master FX to playlist if none saved yet
            if (!p.masterEffects && masterFxSnapshot) {
              p.masterEffects = masterFxSnapshot;
            }
          }
        });
        syncPlaylists();
      },

      removeTrack: (playlistId: string, index: number) => {
        set((state) => {
          const p = state.playlists.find((pl) => pl.id === playlistId);
          if (p && index >= 0 && index < p.tracks.length) {
            p.tracks.splice(index, 1);
            p.updatedAt = Date.now();
          }
        });
        syncPlaylists();
      },

      reorderTrack: (playlistId: string, fromIndex: number, toIndex: number) => {
        set((state) => {
          const p = state.playlists.find((pl) => pl.id === playlistId);
          if (p) {
            const [removed] = p.tracks.splice(fromIndex, 1);
            p.tracks.splice(toIndex, 0, removed);
            p.updatedAt = Date.now();
          }
        });
        syncPlaylists();
      },

      sortTracks: (playlistId: string, sortedTracks: PlaylistTrack[]) => {
        set((state) => {
          const p = state.playlists.find((pl) => pl.id === playlistId);
          if (p) {
            p.tracks = sortedTracks;
            p.updatedAt = Date.now();
          }
        });
        syncPlaylists();
      },

      updateTrackMeta: (playlistId: string, index: number, meta: Partial<Pick<PlaylistTrack, 'musicalKey' | 'energy' | 'bpm' | 'duration' | 'fileName' | 'sourceUrl' | 'analysisSkipped' | 'played'>>) => {
        set((state) => {
          const p = state.playlists.find((pl) => pl.id === playlistId);
          if (p && index >= 0 && index < p.tracks.length) {
            Object.assign(p.tracks[index], meta);
          }
        });
      },

      markTrackPlayed: (playlistId: string, index: number) => {
        set((state) => {
          const p = state.playlists.find((pl) => pl.id === playlistId);
          if (p && index >= 0 && index < p.tracks.length) {
            p.tracks[index].played = true;
          }
        });
      },

      importPlaylists: (playlists: DJPlaylist[]) => {
        set((state) => {
          for (const incoming of playlists) {
            const existing = state.playlists.find((p) => p.id === incoming.id);
            if (existing) {
              // Server wins: overwrite
              Object.assign(existing, incoming);
            } else {
              state.playlists.push(incoming);
            }
          }
        });
      },

      setPlaylistMasterEffects: (playlistId: string, effects: EffectConfig[] | undefined) => {
        set((state) => {
          const p = state.playlists.find((pl) => pl.id === playlistId);
          if (p) {
            p.masterEffects = effects ? JSON.parse(JSON.stringify(effects)) : undefined;
            p.updatedAt = Date.now();
          }
        });
        syncPlaylists();
      },
    })),
    {
      name: 'devilbox-dj-playlists',
      version: 2,
      migrate: (persisted: unknown) => {
        // Wipe playlists on upgrade so bundled import re-runs with modland: prefixes
        const state = persisted as Record<string, unknown>;
        state.playlists = [];
        state.activePlaylistId = null;
        return state;
      },
      onRehydrateStorage: () => (state) => {
        // Clear all "played" flags on session start — they're per-session only
        if (state) {
          for (const pl of state.playlists) {
            for (const t of pl.tracks) {
              t.played = undefined;
            }
          }
        }
      },
    },
  ),
);

// ── Auto-import bundled playlists on first launch ────────────────────────────

let bundledImportAttempted = false;

async function importBundledIfEmpty(): Promise<void> {
  if (bundledImportAttempted) return;
  bundledImportAttempted = true;

  const { playlists } = useDJPlaylistStore.getState();
  if (playlists.length > 0) return; // Already have playlists

  try {
    const resp = await fetch('/data/playlists/imported-prg.json');
    if (!resp.ok) return;
    const data: DJPlaylist[] = await resp.json();
    if (Array.isArray(data) && data.length > 0) {
      useDJPlaylistStore.getState().importPlaylists(data);
      // Set the first playlist as active
      const first = useDJPlaylistStore.getState().playlists[0];
      if (first) useDJPlaylistStore.getState().setActivePlaylist(first.id);
      console.log(`[DJPlaylistStore] Imported ${data.length} bundled playlists`);
    }
  } catch {
    // Bundled file not available — no problem
  }
}

// Trigger on store hydration (persist middleware fires synchronously,
// so by the time this runs the localStorage data is already loaded)
setTimeout(importBundledIfEmpty, 100);

// ── Debounced server sync ────────────────────────────────────────────────────

let syncTimer: ReturnType<typeof setTimeout> | null = null;

function syncPlaylists(): void {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const { playlists } = useDJPlaylistStore.getState();
    pushToCloud(SYNC_KEYS.DJ_PLAYLISTS, playlists).catch(() => {});
  }, 2000); // Debounce 2s to avoid rapid fire during drag-reorder
}
