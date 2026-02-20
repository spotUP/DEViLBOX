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
}

export interface DJPlaylist {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  tracks: PlaylistTrack[];
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
  importPlaylists: (playlists: DJPlaylist[]) => void;
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
        set((state) => {
          const p = state.playlists.find((pl) => pl.id === playlistId);
          if (p) {
            p.tracks.push(track);
            p.updatedAt = Date.now();
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
    })),
    {
      name: 'devilbox-dj-playlists',
      version: 1,
    },
  ),
);

// ── Debounced server sync ────────────────────────────────────────────────────

let syncTimer: ReturnType<typeof setTimeout> | null = null;

function syncPlaylists(): void {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const { playlists } = useDJPlaylistStore.getState();
    pushToCloud(SYNC_KEYS.DJ_PLAYLISTS, playlists).catch(() => {});
  }, 2000); // Debounce 2s to avoid rapid fire during drag-reorder
}
