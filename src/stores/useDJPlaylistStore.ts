/**
 * DJ Playlist Store
 *
 * Manages ordered playlists of tracker module files for the DJ view.
 * Persisted to localStorage and synced to server when logged in.
 *
 * Features: CRUD, multi-select, undo/redo, batch ops, duplicate detection,
 * clone, import/export, cloud sync.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { pushToCloud } from '@/lib/cloudSync';
import { SYNC_KEYS } from '@/hooks/useCloudSync';
import type { EffectConfig } from '@/types/instrument/effects';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PlaylistTrack {
  /** Stable unique ID for this track entry (for @dnd-kit, selection, etc.) */
  id: string;
  /** Original filename (e.g. "axelf.mod") or "modland:path/to/file" */
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
  /** True if this track failed to load (UADE crash, parse error, timeout, etc.) */
  isBad?: boolean;
  /** Error message from last failed load attempt */
  badReason?: string;
  /** Timestamp of last failed load */
  badTimestamp?: number;
  /** Number of consecutive load failures */
  badFailCount?: number;
}

export interface DJPlaylist {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  tracks: PlaylistTrack[];
  /** Master FX chain saved with this playlist — applied when Auto DJ starts */
  masterEffects?: EffectConfig[];
}

interface DJPlaylistState {
  playlists: DJPlaylist[];
  activePlaylistId: string | null;

  // ── Selection (ephemeral, not persisted) ──────────────────────────────
  selectedTrackIndices: number[];
  focusedTrackIndex: number;

  // ── Undo/Redo (ephemeral, not persisted) ──────────────────────────────
  _undoStack: DJPlaylist[][];
  _redoStack: DJPlaylist[][];
  canUndo: boolean;
  canRedo: boolean;

  // ── Playlist CRUD ─────────────────────────────────────────────────────
  createPlaylist: (name: string) => string;
  deletePlaylist: (playlistId: string) => void;
  renamePlaylist: (playlistId: string, name: string) => void;
  setActivePlaylist: (playlistId: string | null) => void;
  updatePlaylistDescription: (playlistId: string, description: string) => void;
  clonePlaylist: (playlistId: string) => string;

  // ── Track CRUD ────────────────────────────────────────────────────────
  addTrack: (playlistId: string, track: Omit<PlaylistTrack, 'id'> & { id?: string }) => void;
  addTracks: (playlistId: string, tracks: Array<Omit<PlaylistTrack, 'id'> & { id?: string }>, opts?: { skipDuplicates?: boolean }) => void;
  removeTrack: (playlistId: string, index: number) => void;
  reorderTrack: (playlistId: string, fromIndex: number, toIndex: number) => void;
  sortTracks: (playlistId: string, sortedTracks: PlaylistTrack[]) => void;
  updateTrackMeta: (playlistId: string, index: number, meta: Partial<Pick<PlaylistTrack, 'trackName' | 'musicalKey' | 'energy' | 'bpm' | 'duration' | 'fileName' | 'sourceUrl' | 'analysisSkipped' | 'played' | 'isBad' | 'badReason' | 'badTimestamp' | 'badFailCount'>>) => void;
  markTrackPlayed: (playlistId: string, index: number) => void;
  markTrackBad: (playlistId: string, index: number, reason: string) => void;
  clearTrackBadFlag: (playlistId: string, index: number) => void;
  importPlaylists: (playlists: DJPlaylist[]) => void;
  setPlaylistMasterEffects: (playlistId: string, effects: EffectConfig[] | undefined) => void;

  // ── Selection actions ─────────────────────────────────────────────────
  selectTrack: (index: number) => void;
  selectTrackRange: (from: number, to: number) => void;
  toggleTrackSelection: (index: number) => void;
  selectAllTracks: () => void;
  clearSelection: () => void;
  setFocusedTrack: (index: number) => void;

  // ── Batch operations ──────────────────────────────────────────────────
  removeSelectedTracks: (playlistId: string) => void;
  moveSelectedTracks: (fromPlaylistId: string, toPlaylistId: string) => void;
  copySelectedTracks: (fromPlaylistId: string, toPlaylistId: string) => void;

  // ── Undo/Redo actions ─────────────────────────────────────────────────
  undo: () => void;
  redo: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateTrackId(): string {
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ensureTrackId(track: Omit<PlaylistTrack, 'id'> & { id?: string }): PlaylistTrack {
  return { ...track, id: track.id || generateTrackId() } as PlaylistTrack;
}

function deepClonePlaylists(playlists: DJPlaylist[]): DJPlaylist[] {
  return JSON.parse(JSON.stringify(playlists));
}

const MAX_UNDO = 30;

// SID playlist detection keywords (used by repairSIDTracks below)
const SID_PLAYLIST_KEYWORDS = ['sid', 'c64', 'commodore', 'dual sid', '6581', '8580'];

// ── Store ────────────────────────────────────────────────────────────────────

export const useDJPlaylistStore = create<DJPlaylistState>()(
  persist(
    immer((set, _get) => ({
      playlists: [],
      activePlaylistId: null,

      // Ephemeral state
      selectedTrackIndices: [],
      focusedTrackIndex: -1,
      _undoStack: [],
      _redoStack: [],
      canUndo: false,
      canRedo: false,

      // ── Internal: push undo snapshot ──────────────────────────────────

      // ── Playlist CRUD ─────────────────────────────────────────────────

      createPlaylist: (name: string) => {
        const id = `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const now = Date.now();
        set((state) => {
          pushUndo(state);
          state.playlists.push({
            id,
            name,
            createdAt: now,
            updatedAt: now,
            tracks: [],
          });
          state.activePlaylistId = id;
        });
        syncPlaylists();
        return id;
      },

      deletePlaylist: (playlistId: string) => {
        set((state) => {
          pushUndo(state);
          state.playlists = state.playlists.filter((p) => p.id !== playlistId);
          if (state.activePlaylistId === playlistId) {
            state.activePlaylistId = state.playlists[0]?.id ?? null;
          }
          state.selectedTrackIndices = [];
          state.focusedTrackIndex = -1;
        });
        syncPlaylists();
      },

      renamePlaylist: (playlistId: string, name: string) => {
        set((state) => {
          pushUndo(state);
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
          state.selectedTrackIndices = [];
          state.focusedTrackIndex = -1;
        });
      },

      updatePlaylistDescription: (playlistId: string, description: string) => {
        set((state) => {
          const p = state.playlists.find((pl) => pl.id === playlistId);
          if (p) {
            p.description = description;
            p.updatedAt = Date.now();
          }
        });
        syncPlaylists();
      },

      clonePlaylist: (playlistId: string) => {
        const newId = `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        set((state) => {
          pushUndo(state);
          const source = state.playlists.find((p) => p.id === playlistId);
          if (!source) return;
          const clone: DJPlaylist = JSON.parse(JSON.stringify(source));
          clone.id = newId;
          clone.name = `${source.name} (Copy)`;
          clone.createdAt = Date.now();
          clone.updatedAt = Date.now();
          // Give cloned tracks new IDs
          for (const t of clone.tracks) {
            t.id = generateTrackId();
          }
          state.playlists.push(clone);
          state.activePlaylistId = newId;
        });
        syncPlaylists();
        return newId;
      },

      // ── Track CRUD ────────────────────────────────────────────────────

      addTrack: (playlistId: string, track: Omit<PlaylistTrack, 'id'> & { id?: string }) => {
        let masterFxSnapshot: EffectConfig[] | null = null;
        try {
          const { useAudioStore } = require('@/stores/useAudioStore');
          const fx = useAudioStore.getState().masterEffects;
          if (fx.length > 0) {
            masterFxSnapshot = JSON.parse(JSON.stringify(fx));
          }
        } catch { /* audio store not available */ }

        set((state) => {
          pushUndo(state);
          const p = state.playlists.find((pl) => pl.id === playlistId);
          if (p) {
            p.tracks.push(ensureTrackId(track));
            p.updatedAt = Date.now();
            if (!p.masterEffects && masterFxSnapshot) {
              p.masterEffects = masterFxSnapshot;
            }
          }
        });
        syncPlaylists();
      },

      addTracks: (playlistId: string, tracks: Array<Omit<PlaylistTrack, 'id'> & { id?: string }>, opts?: { skipDuplicates?: boolean }) => {
        let masterFxSnapshot: EffectConfig[] | null = null;
        try {
          const { useAudioStore } = require('@/stores/useAudioStore');
          const fx = useAudioStore.getState().masterEffects;
          if (fx.length > 0) {
            masterFxSnapshot = JSON.parse(JSON.stringify(fx));
          }
        } catch { /* audio store not available */ }

        set((state) => {
          pushUndo(state);
          const p = state.playlists.find((pl) => pl.id === playlistId);
          if (!p) return;

          let added = 0;
          let skipped = 0;
          for (const track of tracks) {
            if (opts?.skipDuplicates) {
              const isDuplicate = p.tracks.some((t) => t.fileName === track.fileName);
              if (isDuplicate) { skipped++; continue; }
            }
            p.tracks.push(ensureTrackId(track));
            added++;
          }
          p.updatedAt = Date.now();
          if (!p.masterEffects && masterFxSnapshot) {
            p.masterEffects = masterFxSnapshot;
          }

          if (skipped > 0) {
            // Import notify lazily to avoid circular deps
            import('@/stores/useNotificationStore').then(({ notify }) => {
              notify.warning(`Skipped ${skipped} duplicate track${skipped > 1 ? 's' : ''}`);
            });
          }
          if (added > 0) {
            import('@/stores/useNotificationStore').then(({ notify }) => {
              notify.success(`Added ${added} track${added > 1 ? 's' : ''}`);
            });
          }
        });
        syncPlaylists();
      },

      removeTrack: (playlistId: string, index: number) => {
        set((state) => {
          pushUndo(state);
          const p = state.playlists.find((pl) => pl.id === playlistId);
          if (p && index >= 0 && index < p.tracks.length) {
            p.tracks.splice(index, 1);
            p.updatedAt = Date.now();
            // Adjust selection
            state.selectedTrackIndices = state.selectedTrackIndices
              .filter((i) => i !== index)
              .map((i) => (i > index ? i - 1 : i));
            if (state.focusedTrackIndex === index) {
              state.focusedTrackIndex = Math.min(index, p.tracks.length - 1);
            } else if (state.focusedTrackIndex > index) {
              state.focusedTrackIndex--;
            }
          }
        });
        syncPlaylists();
      },

      reorderTrack: (playlistId: string, fromIndex: number, toIndex: number) => {
        set((state) => {
          const p = state.playlists.find((pl) => pl.id === playlistId);
          if (p) {
            pushUndo(state);
            const [removed] = p.tracks.splice(fromIndex, 1);
            p.tracks.splice(toIndex, 0, removed);
            p.updatedAt = Date.now();
            // Update focused index to follow the moved track
            if (state.focusedTrackIndex === fromIndex) {
              state.focusedTrackIndex = toIndex;
            }
            state.selectedTrackIndices = [];
          }
        });
        syncPlaylists();
      },

      sortTracks: (playlistId: string, sortedTracks: PlaylistTrack[]) => {
        set((state) => {
          pushUndo(state);
          const p = state.playlists.find((pl) => pl.id === playlistId);
          if (p) {
            p.tracks = sortedTracks;
            p.updatedAt = Date.now();
            state.selectedTrackIndices = [];
            state.focusedTrackIndex = -1;
          }
        });
        syncPlaylists();
      },

      updateTrackMeta: (playlistId: string, index: number, meta) => {
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

      markTrackBad: (playlistId: string, index: number, reason: string) => {
        set((state) => {
          const p = state.playlists.find((pl) => pl.id === playlistId);
          if (p && index >= 0 && index < p.tracks.length) {
            const track = p.tracks[index];
            track.isBad = true;
            track.badReason = reason;
            track.badTimestamp = Date.now();
            track.badFailCount = (track.badFailCount || 0) + 1;
            console.warn(`[DJPlaylist] Marked track ${index} as bad: ${track.trackName} - ${reason}`);
          }
        });
      },

      clearTrackBadFlag: (playlistId: string, index: number) => {
        set((state) => {
          const p = state.playlists.find((pl) => pl.id === playlistId);
          if (p && index >= 0 && index < p.tracks.length) {
            const track = p.tracks[index];
            track.isBad = false;
            track.badReason = undefined;
            track.badTimestamp = undefined;
            track.badFailCount = 0;
            console.log(`[DJPlaylist] Cleared bad flag for track ${index}: ${track.trackName}`);
          }
        });
      },

      importPlaylists: (playlists: DJPlaylist[]) => {
        set((state) => {
          for (const incoming of playlists) {
            const existing = state.playlists.find((p) => p.id === incoming.id);
            if (existing) {
              Object.assign(existing, incoming);
            } else {
              state.playlists.push(incoming);
            }
          }
          // Ensure all imported tracks have IDs
          for (const pl of state.playlists) {
            for (const t of pl.tracks) {
              if (!t.id) t.id = generateTrackId();
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

      // ── Selection actions ─────────────────────────────────────────────

      selectTrack: (index: number) => {
        set((state) => {
          state.selectedTrackIndices = [index];
          state.focusedTrackIndex = index;
        });
      },

      selectTrackRange: (from: number, to: number) => {
        set((state) => {
          const min = Math.min(from, to);
          const max = Math.max(from, to);
          const range: number[] = [];
          for (let i = min; i <= max; i++) range.push(i);
          state.selectedTrackIndices = range;
          state.focusedTrackIndex = to;
        });
      },

      toggleTrackSelection: (index: number) => {
        set((state) => {
          const idx = state.selectedTrackIndices.indexOf(index);
          if (idx >= 0) {
            state.selectedTrackIndices.splice(idx, 1);
          } else {
            state.selectedTrackIndices.push(index);
          }
          state.focusedTrackIndex = index;
        });
      },

      selectAllTracks: () => {
        set((state) => {
          const p = state.playlists.find((pl) => pl.id === state.activePlaylistId);
          if (p) {
            state.selectedTrackIndices = p.tracks.map((_, i) => i);
          }
        });
      },

      clearSelection: () => {
        set((state) => {
          state.selectedTrackIndices = [];
        });
      },

      setFocusedTrack: (index: number) => {
        set((state) => {
          state.focusedTrackIndex = index;
        });
      },

      // ── Batch operations ──────────────────────────────────────────────

      removeSelectedTracks: (playlistId: string) => {
        set((state) => {
          pushUndo(state);
          const p = state.playlists.find((pl) => pl.id === playlistId);
          if (!p) return;
          const toRemove = new Set(state.selectedTrackIndices);
          p.tracks = p.tracks.filter((_, i) => !toRemove.has(i));
          p.updatedAt = Date.now();
          state.selectedTrackIndices = [];
          state.focusedTrackIndex = Math.min(state.focusedTrackIndex, p.tracks.length - 1);
        });
        syncPlaylists();
      },

      moveSelectedTracks: (fromPlaylistId: string, toPlaylistId: string) => {
        set((state) => {
          pushUndo(state);
          const from = state.playlists.find((p) => p.id === fromPlaylistId);
          const to = state.playlists.find((p) => p.id === toPlaylistId);
          if (!from || !to) return;
          const indices = [...state.selectedTrackIndices].sort((a, b) => a - b);
          const moved: PlaylistTrack[] = [];
          for (const i of indices) {
            if (i >= 0 && i < from.tracks.length) {
              moved.push({ ...from.tracks[i], id: generateTrackId() });
            }
          }
          // Remove from source (reverse order to preserve indices)
          for (let j = indices.length - 1; j >= 0; j--) {
            from.tracks.splice(indices[j], 1);
          }
          to.tracks.push(...moved);
          from.updatedAt = Date.now();
          to.updatedAt = Date.now();
          state.selectedTrackIndices = [];
          state.focusedTrackIndex = -1;
        });
        syncPlaylists();
      },

      copySelectedTracks: (fromPlaylistId: string, toPlaylistId: string) => {
        set((state) => {
          pushUndo(state);
          const from = state.playlists.find((p) => p.id === fromPlaylistId);
          const to = state.playlists.find((p) => p.id === toPlaylistId);
          if (!from || !to) return;
          const indices = [...state.selectedTrackIndices].sort((a, b) => a - b);
          for (const i of indices) {
            if (i >= 0 && i < from.tracks.length) {
              to.tracks.push({ ...from.tracks[i], id: generateTrackId() });
            }
          }
          to.updatedAt = Date.now();
        });
        syncPlaylists();
      },

      // ── Undo/Redo ─────────────────────────────────────────────────────

      undo: () => {
        set((state) => {
          if (state._undoStack.length === 0) return;
          const snapshot = state._undoStack.pop()!;
          state._redoStack.push(deepClonePlaylists(state.playlists));
          state.playlists = snapshot as DJPlaylist[];
          state.canUndo = state._undoStack.length > 0;
          state.canRedo = true;
          state.selectedTrackIndices = [];
          state.focusedTrackIndex = -1;
        });
        syncPlaylists();
      },

      redo: () => {
        set((state) => {
          if (state._redoStack.length === 0) return;
          const snapshot = state._redoStack.pop()!;
          state._undoStack.push(deepClonePlaylists(state.playlists));
          state.playlists = snapshot as DJPlaylist[];
          state.canUndo = true;
          state.canRedo = state._redoStack.length > 0;
          state.selectedTrackIndices = [];
          state.focusedTrackIndex = -1;
        });
        syncPlaylists();
      },
    })),
    {
      name: 'devilbox-dj-playlists',
      version: 2,
      migrate: (persisted: unknown) => {
        const state = persisted as Record<string, unknown>;
        // Preserve existing playlists during migration; only init if missing
        if (!state.playlists) state.playlists = [];
        if (!state.activePlaylistId) state.activePlaylistId = null;
        return state;
      },
      partialize: (state) => ({
        playlists: state.playlists,
        activePlaylistId: state.activePlaylistId,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          for (const pl of state.playlists) {
            for (const t of pl.tracks) {
              t.played = undefined;
              // Migrate: ensure all tracks have IDs
              if (!t.id) t.id = generateTrackId();
            }
          }
          // Async migration: resolve SID tracks missing hvsc: prefix
          repairSIDTracks(state.playlists);
        }
      },
    },
  ),
);

// ── Internal: push undo snapshot (called inside immer set()) ────────────────

function pushUndo(state: DJPlaylistState): void {
  state._undoStack.push(deepClonePlaylists(state.playlists));
  if (state._undoStack.length > MAX_UNDO) {
    state._undoStack.shift();
  }
  state._redoStack = [];
  state.canUndo = true;
  state.canRedo = false;
}

// ── Repair SID tracks missing hvsc: prefix ───────────────────────────────────

function isSIDPlaylist(name: string): boolean {
  const lower = name.toLowerCase();
  return SID_PLAYLIST_KEYWORDS.some(kw => lower.includes(kw));
}

async function repairSIDTracks(playlists: DJPlaylist[]): Promise<void> {
  const toFix: { playlistId: string; index: number; track: PlaylistTrack }[] = [];

  for (const pl of playlists) {
    const plIsSID = isSIDPlaylist(pl.name);
    for (let i = 0; i < pl.tracks.length; i++) {
      const t = pl.tracks[i];
      if (t.fileName.startsWith('hvsc:') || t.fileName.startsWith('modland:')) continue;

      // Detect SID by: playlist name keywords, format field, or .sid extension
      const isSID = plIsSID ||
        t.format === 'SID' ||
        t.fileName.toLowerCase().endsWith('.sid') ||
        t.trackName?.toLowerCase().endsWith('.sid');
      if (isSID) toFix.push({ playlistId: pl.id, index: i, track: t });
    }
  }
  if (toFix.length === 0) return;

  console.log(`[DJPlaylistStore] Repairing ${toFix.length} SID tracks missing hvsc: prefix...`);

  try {
    const { searchHVSC } = await import('@/lib/hvscApi');
    let fixed = 0;

    for (const { playlistId, index, track } of toFix) {
      try {
        const raw = (track.trackName || track.fileName);
        // Step 1: basic cleanup (keep hyphens — they're part of HVSC filenames)
        const stripped = raw
          .replace(/\.sid$/i, '')
          .replace(/\s*\([^)]*\)\s*$/i, '')     // strip any trailing parenthetical: (sid), (DCP), (Low+High, Res. F)
          .replace(/^(\d{1,3})\.\s*/, '')         // strip leading track number "01. "
          .replace(/\s+(?:2SID|3SID|SCC\s+Extended)\s*$/i, '') // strip SID variant suffixes
          .trim();
        if (!stripped) continue;

        // Step 2: split artist/title on " - " BEFORE replacing hyphens
        let artist = '';
        let songTitle = '';
        const dashSplit = stripped.split(/\s+-\s+/);
        if (dashSplit.length >= 2) {
          artist = dashSplit[0].replace(/_/g, ' ').trim();
          songTitle = dashSplit.slice(1).join(' - ').replace(/_/g, ' ').trim();
        } else {
          // No " - " separator — try double-space split (old format)
          const underscored = stripped.replace(/_/g, ' ');
          const parts = underscored.split(/\s{2,}/);
          if (parts.length >= 2) {
            artist = parts[0].trim();
            songTitle = parts.slice(1).join(' ').trim();
          } else {
            songTitle = underscored;
          }
        }
        // Also strip 2SID/SCC Extended from song title after splitting
        songTitle = songTitle
          .replace(/\s+(?:2SID|3SID|SCC\s+Extended)\s*$/i, '')
          .trim();

        type HVSCResult = { isDirectory: boolean; name: string; path: string; author?: string };
        const filterSID = (r: HVSCResult) => !r.isDirectory && r.path.toLowerCase().endsWith('.sid');

        // Build search queries in priority order
        let sidResults: HVSCResult[] = [];
        const searches: string[] = [];

        // 1. Song title (most specific — preserves hyphens like "Disco-Data")
        if (songTitle.length >= 2) searches.push(songTitle);
        // 2. Artist + song title
        if (artist && songTitle && artist !== songTitle) searches.push(`${artist} ${songTitle}`);
        // 3. Fallback: shorter queries — multi-word titles often fail the API
        const words = songTitle.split(/[\s-]+/).filter(w => w.length >= 3);
        if (words.length > 2) searches.push(words.slice(0, 2).join(' '));
        // 4. Single longest word (catches "Doublebass v2" → "Doublebass")
        const longest = words.length > 0 ? words.reduce((a, b) => a.length >= b.length ? a : b) : '';
        if (longest.length >= 4 && !searches.includes(longest)) searches.push(longest);
        // 5. Final fallback: full cleaned string
        if (searches.length === 0) searches.push(stripped.replace(/_/g, ' '));

        for (const query of searches) {
          sidResults = (await searchHVSC(query, 100)).filter(filterSID);
          if (sidResults.length > 0) break;
          await new Promise(r => setTimeout(r, 150));
        }

        // Score results: prefer exact name match, then artist match, then first result
        let match: HVSCResult | undefined;
        if (sidResults.length > 0) {
          // Normalize for comparison: underscores→spaces, hyphens→hyphens, lowercase
          const norm = (s: string) => s.toLowerCase().replace(/\.sid$/i, '').replace(/_/g, ' ').trim();
          const lowerSong = norm(songTitle);
          const lowerArtist = artist.toLowerCase();

          // Exact song name match
          match = sidResults.find(r => norm(r.name) === lowerSong);
          // Also try with hyphens normalized to spaces on both sides
          if (!match) {
            const flatSong = lowerSong.replace(/-/g, ' ');
            match = sidResults.find(r => norm(r.name).replace(/-/g, ' ') === flatSong);
          }
          // Partial song name match + artist in path/author
          if (!match && lowerArtist) {
            match = sidResults.find(r => {
              const rName = norm(r.name);
              const rPath = r.path.toLowerCase();
              const rAuthor = (r.author || '').toLowerCase();
              return rName.includes(lowerSong) &&
                (rPath.includes(lowerArtist) || rAuthor.includes(lowerArtist));
            });
          }
          // Partial song name match
          if (!match) {
            match = sidResults.find(r => norm(r.name).includes(lowerSong));
          }
          if (!match) match = sidResults[0];
        }

        if (match) {
          useDJPlaylistStore.getState().updateTrackMeta(playlistId, index, {
            fileName: `hvsc:${match.path}`,
            trackName: track.trackName || match.name.replace(/\.sid$/i, ''),
          });
          fixed++;
          console.log(`[DJPlaylistStore] Fixed: "${songTitle}" → hvsc:${match.path}`);
        } else {
          console.warn(`[DJPlaylistStore] No HVSC match for: "${songTitle}" (raw: "${raw}")`);
        }
        await new Promise(r => setTimeout(r, 150));
      } catch (err) {
        console.warn(`[DJPlaylistStore] Failed to repair "${track.trackName}":`, err);
      }
    }

    console.log(`[DJPlaylistStore] SID repair complete: ${fixed}/${toFix.length} fixed`);
  } catch (err) {
    console.warn('[DJPlaylistStore] SID repair skipped (server unavailable):', err);
  }
}

// ── Auto-import bundled playlists on first launch ────────────────────────────

let bundledImportAttempted = false;

async function importBundledIfEmpty(): Promise<void> {
  if (bundledImportAttempted) return;
  bundledImportAttempted = true;

  const { playlists } = useDJPlaylistStore.getState();
  if (playlists.length > 0) return;

  try {
    const resp = await fetch('/data/playlists/imported-prg.json');
    if (!resp.ok) return;
    const data: DJPlaylist[] = await resp.json();
    if (Array.isArray(data) && data.length > 0) {
      useDJPlaylistStore.getState().importPlaylists(data);
      const first = useDJPlaylistStore.getState().playlists[0];
      if (first) useDJPlaylistStore.getState().setActivePlaylist(first.id);
      console.log(`[DJPlaylistStore] Imported ${data.length} bundled playlists`);
    }
  } catch {
    // Bundled file not available — no problem
  }
}

setTimeout(importBundledIfEmpty, 100);

// ── Debounced server sync ────────────────────────────────────────────────────

let syncTimer: ReturnType<typeof setTimeout> | null = null;

function syncPlaylists(): void {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const { playlists } = useDJPlaylistStore.getState();
    pushToCloud(SYNC_KEYS.DJ_PLAYLISTS, playlists).catch(() => {});
  }, 2000);
}
