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
  /** Musical key in standard notation (e.g. "A minor", "C major") or Camelot ("8A") */
  key?: string;
  /** When this track was added */
  addedAt: number;
  /** Remote URL for loading (e.g. Modland ftp URL) */
  sourceUrl?: string;
}

export type PlaylistSortField = 'trackName' | 'bpm' | 'key' | 'duration' | 'format' | 'fileName';
export type PlaylistSortOrder = 'asc' | 'desc';

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
  sortPlaylist: (playlistId: string, fields: PlaylistSortField | PlaylistSortField[], order?: PlaylistSortOrder) => void;
  updateTrackMeta: (playlistId: string, index: number, meta: Partial<Pick<PlaylistTrack, 'bpm' | 'key' | 'duration'>>) => void;
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

      sortPlaylist: (playlistId: string, fields: PlaylistSortField | PlaylistSortField[], order: PlaylistSortOrder = 'asc') => {
        set((state) => {
          const p = state.playlists.find((pl) => pl.id === playlistId);
          if (!p || p.tracks.length < 2) return;

          const fieldArr = Array.isArray(fields) ? fields : [fields];
          const dir = order === 'asc' ? 1 : -1;

          const compareField = (a: PlaylistTrack, b: PlaylistTrack, field: PlaylistSortField): number => {
            switch (field) {
              case 'bpm':
                return (a.bpm - b.bpm);
              case 'duration':
                return (a.duration - b.duration);
              case 'key': {
                const ak = a.key ?? '', bk = b.key ?? '';
                const aMatch = ak.match(/^(\d+)([AB])$/i);
                const bMatch = bk.match(/^(\d+)([AB])$/i);
                if (aMatch && bMatch) {
                  const aNum = parseInt(aMatch[1]), bNum = parseInt(bMatch[1]);
                  if (aNum !== bNum) return aNum - bNum;
                  return aMatch[2].localeCompare(bMatch[2]);
                }
                return ak.localeCompare(bk);
              }
              case 'format':
                return a.format.localeCompare(b.format);
              case 'fileName':
                return a.fileName.localeCompare(b.fileName);
              case 'trackName':
              default:
                return a.trackName.localeCompare(b.trackName);
            }
          };

          p.tracks.sort((a, b) => {
            for (const field of fieldArr) {
              const cmp = compareField(a, b, field);
              if (cmp !== 0) return cmp * dir;
            }
            return 0;
          });
          p.updatedAt = Date.now();
        });
        syncPlaylists();
      },

      updateTrackMeta: (playlistId: string, index: number, meta: Partial<Pick<PlaylistTrack, 'bpm' | 'key' | 'duration'>>) => {
        set((state) => {
          const p = state.playlists.find((pl) => pl.id === playlistId);
          if (p && index >= 0 && index < p.tracks.length) {
            Object.assign(p.tracks[index], meta);
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

// ── Load bundled playlists on first use ──────────────────────────────────────

let _bundledLoaded = false;

export async function loadBundledPlaylists(): Promise<void> {
  if (_bundledLoaded) return;
  _bundledLoaded = true;

  const { playlists, importPlaylists } = useDJPlaylistStore.getState();
  // Skip if any bundled playlists already exist (user has seen them before)
  if (playlists.some(p => p.id.startsWith('playlist-prg-'))) return;

  try {
    const resp = await fetch('/data/playlists/imported-prg.json');
    if (!resp.ok) return;
    const data: DJPlaylist[] = await resp.json();
    importPlaylists(data);
    console.log(`[DJPlaylist] Loaded ${data.length} bundled playlists`);
  } catch {
    // Silent fail — bundled playlists are optional
  }
}
