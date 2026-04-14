/**
 * PixiDJPlaylistPanel — GL-native DJ playlist panel for the Pixi.js scene graph.
 *
 * GL port of src/components/dj/DJPlaylistPanel.tsx.
 * Features: playlist CRUD, track list with deck-load buttons, reorder controls,
 * multi-select, keyboard nav (arrows/Enter/Delete/Cmd+A/Z), type-to-filter search,
 * sort, clone, undo/redo, confirmations, move/copy between playlists.
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { usePixiTheme } from '../../theme';
import { DECK_A, DECK_B, DECK_C } from '../../colors';
import { PixiButton } from '../../components/PixiButton';
import { PixiLabel } from '../../components/PixiLabel';
import { PixiList } from '../../components/PixiList';
import { pickFiles } from '../../services/glFilePicker';
import {
  useDJPlaylistStore,
  type PlaylistTrack,
} from '@/stores/useDJPlaylistStore';
import { useDJStore, type DeckId } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { detectBPM, estimateSongDuration } from '@/engine/dj/DJBeatDetector';
import { cacheSong } from '@/engine/dj/DJSongCache';
import { getDJPipeline } from '@/engine/dj/DJPipeline';
import { isAudioFile } from '@/lib/audioFileUtils';
import { smartSort, sortByBPM, sortByKey, sortByEnergy, sortByName } from '@/engine/dj/DJPlaylistSort';
import { showConfirm } from '@/stores/useConfirmStore';
import { ContextMenu, useContextMenu, type MenuItemType } from '@components/common/ContextMenu';

// ── Layout constants ─────────────────────────────────────────────────────────

const PANEL_H = 340;
const HEADER_H = 30;
const TABS_H = 28;
const TOOLBAR_H = 28;
const SEARCH_H = 22;
const PAD = 6;
const ACCEPT_AUDIO = 'audio/*,.mod,.xm,.s3m,.it,.mptm,.stm,.669,.med,.oct,.okt,.far,.ult,.dmf,.fur';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function trackSublabel(t: PlaylistTrack): string {
  const parts = [t.format];
  if (t.bpm > 0) parts.push(`${t.bpm} BPM`);
  if (t.musicalKey) parts.push(t.musicalKey);
  if (t.duration > 0) parts.push(formatDuration(t.duration));
  return parts.join(' \u00b7 ');
}

// ── Component ────────────────────────────────────────────────────────────────

interface PixiDJPlaylistPanelProps {
  visible?: boolean;
  onClose?: () => void;
}

export const PixiDJPlaylistPanel: React.FC<PixiDJPlaylistPanelProps> = ({
  visible = true,
  onClose,
}) => {
  const theme = usePixiTheme();

  // Store state
  const playlists = useDJPlaylistStore((s) => s.playlists);
  const activePlaylistId = useDJPlaylistStore((s) => s.activePlaylistId);
  const createPlaylist = useDJPlaylistStore((s) => s.createPlaylist);
  const deletePlaylist = useDJPlaylistStore((s) => s.deletePlaylist);
  const setActivePlaylist = useDJPlaylistStore((s) => s.setActivePlaylist);
  const addTrack = useDJPlaylistStore((s) => s.addTrack);
  const removeTrack = useDJPlaylistStore((s) => s.removeTrack);
  const reorderTrack = useDJPlaylistStore((s) => s.reorderTrack);
  const sortTracksAction = useDJPlaylistStore((s) => s.sortTracks);
  const clonePlaylist = useDJPlaylistStore((s) => s.clonePlaylist);
  const selectedTrackIndices = useDJPlaylistStore((s) => s.selectedTrackIndices);
  const focusedTrackIndex = useDJPlaylistStore((s) => s.focusedTrackIndex);
  const selectTrack = useDJPlaylistStore((s) => s.selectTrack);
  const selectTrackRange = useDJPlaylistStore((s) => s.selectTrackRange);
  const selectAllTracks = useDJPlaylistStore((s) => s.selectAllTracks);
  const clearSelection = useDJPlaylistStore((s) => s.clearSelection);
  const setFocusedTrack = useDJPlaylistStore((s) => s.setFocusedTrack);
  const removeSelectedTracks = useDJPlaylistStore((s) => s.removeSelectedTracks);
  const moveSelectedTracks = useDJPlaylistStore((s) => s.moveSelectedTracks);
  const copySelectedTracks = useDJPlaylistStore((s) => s.copySelectedTracks);
  const canUndo = useDJPlaylistStore((s) => s.canUndo);
  const canRedo = useDJPlaylistStore((s) => s.canRedo);
  const undo = useDJPlaylistStore((s) => s.undo);
  const redo = useDJPlaylistStore((s) => s.redo);
  const thirdDeckActive = useDJStore((s) => s.thirdDeckActive);

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? null;

  // Local state
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [showSort, setShowSort] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMoveMenu, setShowMoveMenu] = useState<'move' | 'copy' | null>(null);
  const [retestingBad, setRetestingBad] = useState(false);
  const contextMenu = useContextMenu();
  const [contextMenuTrackId, setContextMenuTrackId] = useState<string | null>(null);
  const lastClickedRef = useRef(-1);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadTrackRef = useRef<((track: PlaylistTrack, deckId: DeckId) => Promise<void>) | undefined>(undefined);

  // ── Bad track re-test ─────────────────────────────────────────────────────
  
  const badTrackCount = activePlaylist
    ? activePlaylist.tracks.filter(t => t.isBad).length
    : 0;

  const handleRetestBadTracks = useCallback(async () => {
    if (!activePlaylist || !activePlaylistId || retestingBad) return;
    
    const badTracks = activePlaylist.tracks
      .map((t, idx) => ({ track: t, index: idx }))
      .filter(({ track }) => track.isBad);
    
    if (badTracks.length === 0) {
      console.log('[PixiDJPlaylist] No bad tracks to re-test');
      return;
    }
    
    setRetestingBad(true);
    console.log(`[PixiDJPlaylist] Re-testing ${badTracks.length} bad tracks...`);
    
    const { loadPlaylistTrackToDeck } = await import('@/engine/dj/DJTrackLoader');
    const { clearTrackBadFlag } = useDJPlaylistStore.getState();
    
    let successCount = 0;
    for (const { track, index } of badTracks) {
      console.log(`[PixiDJPlaylist] Re-testing track ${index}: ${track.trackName} (reason: ${track.badReason})`);
      
      // Clear bad flag before testing
      clearTrackBadFlag(activePlaylistId, index);
      
      // Try loading to deck A
      const success = await loadPlaylistTrackToDeck(track, 'A');
      
      if (success) {
        successCount++;
        console.log(`[PixiDJPlaylist] ✓ Track ${index} now loads successfully`);
      } else {
        console.warn(`[PixiDJPlaylist] ✗ Track ${index} still fails`);
      }
    }
    
    setRetestingBad(false);
    console.log(`[PixiDJPlaylist] Re-test complete: ${successCount}/${badTracks.length} now working`);
  }, [activePlaylist, activePlaylistId, retestingBad]);

  // Sync PixiList selection with store
  useEffect(() => {
    if (selectedTrackId && activePlaylist) {
      const idx = activePlaylist.tracks.findIndex((t) => t.id === selectedTrackId);
      if (idx >= 0 && !selectedTrackIndices.includes(idx)) {
        selectTrack(idx);
        lastClickedRef.current = idx;
      }
    }
  }, [selectedTrackId, activePlaylist, selectedTrackIndices, selectTrack]);

  // ── Search / filter ───────────────────────────────────────────────────────

  const filteredTracks = useMemo(() => {
    if (!activePlaylist || !searchQuery.trim()) return activePlaylist?.tracks ?? [];
    const q = searchQuery.toLowerCase();
    return activePlaylist.tracks.filter((t) =>
      t.trackName.toLowerCase().includes(q) ||
      t.fileName.toLowerCase().includes(q) ||
      t.format.toLowerCase().includes(q) ||
      (t.musicalKey && t.musicalKey.toLowerCase().includes(q))
    );
  }, [activePlaylist, searchQuery]);

  const isFiltered = searchQuery.trim().length > 0;

  // ── Keyboard navigation ───────────────────────────────────────────────────

  useEffect(() => {
    if (!visible) return;

    const handler = (e: KeyboardEvent) => {
      // Don't capture when typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const tracks = filteredTracks;
      const trackCount = tracks.length;
      if (!activePlaylist || !activePlaylistId) return;

      const isMeta = e.metaKey || e.ctrlKey;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const next = Math.min(focusedTrackIndex + 1, trackCount - 1);
          if (e.shiftKey) {
            selectTrackRange(lastClickedRef.current >= 0 ? lastClickedRef.current : 0, next);
          } else {
            selectTrack(next);
            lastClickedRef.current = next;
          }
          setFocusedTrack(next);
          // Sync PixiList selection
          if (tracks[next]) setSelectedTrackId(tracks[next].id);
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const prev = Math.max(focusedTrackIndex - 1, 0);
          if (e.shiftKey) {
            selectTrackRange(lastClickedRef.current >= 0 ? lastClickedRef.current : 0, prev);
          } else {
            selectTrack(prev);
            lastClickedRef.current = prev;
          }
          setFocusedTrack(prev);
          if (tracks[prev]) setSelectedTrackId(tracks[prev].id);
          break;
        }
        case 'Enter': {
          e.preventDefault();
          if (focusedTrackIndex >= 0 && focusedTrackIndex < trackCount) {
            const track = tracks[focusedTrackIndex];
            if (track && loadTrackRef.current) {
              const decks = useDJStore.getState().decks;
              const deckId = !decks.A.isPlaying ? 'A' : !decks.B.isPlaying ? 'B' : 'A';
              loadTrackRef.current(track, deckId as DeckId);
            }
          }
          break;
        }
        case 'Delete':
        case 'Backspace': {
          if (selectedTrackIndices.length > 0 && trackCount > 0) {
            e.preventDefault();
            if (selectedTrackIndices.length > 3) {
              showConfirm({
                title: 'Remove Tracks',
                message: `Remove ${selectedTrackIndices.length} selected tracks?`,
                confirmLabel: 'Remove',
                danger: true,
              }).then((confirmed) => {
                if (confirmed) removeSelectedTracks(activePlaylistId);
              });
            } else {
              removeSelectedTracks(activePlaylistId);
            }
          }
          break;
        }
        case 'a': {
          if (isMeta) { e.preventDefault(); selectAllTracks(); }
          break;
        }
        case 'z': {
          if (isMeta) {
            e.preventDefault();
            if (e.shiftKey) { if (canRedo) redo(); }
            else { if (canUndo) undo(); }
          }
          break;
        }
        case 'Escape': {
          if (searchQuery) {
            setSearchQuery('');
          } else {
            clearSelection();
          }
          break;
        }
        default: {
          // Type-to-filter: single printable character starts/extends search
          if (e.key.length === 1 && !isMeta && !e.altKey) {
            setSearchQuery((prev) => prev + e.key);
            // Clear search after 1.5s of no typing
            if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
            searchTimeoutRef.current = setTimeout(() => setSearchQuery(''), 1500);
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [visible, activePlaylist, activePlaylistId, filteredTracks, focusedTrackIndex, selectedTrackIndices, searchQuery, canUndo, canRedo, selectTrack, selectTrackRange, setFocusedTrack, selectAllTracks, clearSelection, removeSelectedTracks, undo, redo]);

  // ── Playlist CRUD ──────────────────────────────────────────────────────────

  const handleNewPlaylist = useCallback(() => {
    const name = `Playlist ${playlists.length + 1}`;
    createPlaylist(name);
  }, [playlists.length, createPlaylist]);

  const handleDeletePlaylist = useCallback(async () => {
    if (!activePlaylist) return;
    const confirmed = await showConfirm({
      title: 'Delete Playlist',
      message: `Delete "${activePlaylist.name}" and all ${activePlaylist.tracks.length} tracks?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (confirmed) deletePlaylist(activePlaylist.id);
  }, [activePlaylist, deletePlaylist]);

  const handleClonePlaylist = useCallback(() => {
    if (activePlaylistId) clonePlaylist(activePlaylistId);
  }, [activePlaylistId, clonePlaylist]);

  // ── Add files ──────────────────────────────────────────────────────────────

  const handleAddTracks = useCallback(async () => {
    if (!activePlaylistId) return;
    const files = await pickFiles({ accept: ACCEPT_AUDIO });
    if (files.length === 0) return;

    setIsLoadingFile(true);
    for (const file of files) {
      try {
        const isAudio = isAudioFile(file.name);
        const fileExt = file.name.split('.').pop()?.toUpperCase() ?? 'MOD';

        if (isAudio) {
          addTrack(activePlaylistId, {
            fileName: file.name,
            trackName: file.name.replace(/\.[^.]+$/, ''),
            format: fileExt,
            bpm: 0,
            duration: 0,
            addedAt: Date.now(),
          });
        } else {
          const song = await parseModuleToSong(file);
          cacheSong(file.name, song);
          const bpmResult = detectBPM(song);
          const duration = estimateSongDuration(song);
          addTrack(activePlaylistId, {
            fileName: file.name,
            trackName: song.name || file.name,
            format: fileExt,
            bpm: bpmResult.bpm,
            duration,
            addedAt: Date.now(),
          });
        }
      } catch (err) {
        console.error(`[PixiDJPlaylistPanel] Failed to process ${file.name}:`, err);
      }
    }
    setIsLoadingFile(false);
  }, [activePlaylistId, addTrack]);

  // ── Load to deck ───────────────────────────────────────────────────────────

  const loadSongToDeck = useCallback(
    async (
      song: import('@/engine/TrackerReplayer').TrackerSong,
      fileName: string,
      deckId: DeckId,
      rawBuffer?: ArrayBuffer,
    ) => {
      const engine = getDJEngine();
      const bpmResult = detectBPM(song);

      if (rawBuffer) {
        useDJStore.getState().setDeckState(deckId, {
          fileName,
          trackName: song.name || fileName,
          detectedBPM: bpmResult.bpm,
          effectiveBPM: bpmResult.bpm,
          analysisState: 'rendering',
          isPlaying: false,
        });

        try {
          const result = await getDJPipeline().loadOrEnqueue(rawBuffer, fileName, deckId, 'high');
          await engine.loadAudioToDeck(
            deckId, result.wavData, fileName,
            song.name || fileName, result.analysis?.bpm || bpmResult.bpm, song,
          );
          useDJStore.getState().setDeckViewMode('visualizer');
        } catch (err) {
          console.error(`[PixiDJPlaylistPanel] Pipeline failed for ${fileName}:`, err);
        }
      }
    },
    [],
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loadTrackToDeck = useCallback(
    async (track: PlaylistTrack, deckId: DeckId) => {
      const engine = getDJEngine();

      if (track.fileName.startsWith('modland:')) {
        const modlandPath = track.fileName.slice('modland:'.length);
        try {
          const { downloadModlandFile } = await import('@/lib/modlandApi');
          const buffer = await downloadModlandFile(modlandPath);
          const filename = modlandPath.split('/').pop() || 'download.mod';

          if (isAudioFile(filename)) {
            await engine.loadAudioToDeck(deckId, buffer, track.fileName);
            useDJStore.getState().setDeckViewMode('vinyl');
          } else {
            const blob = new File([buffer], filename, { type: 'application/octet-stream' });
            const song = await parseModuleToSong(blob);
            cacheSong(track.fileName, song);
            await loadSongToDeck(song, track.fileName, deckId, buffer);
          }
          return;
        } catch (err) {
          console.error(`[PixiDJPlaylistPanel] Modland re-download failed:`, err);
        }
      }

      if (track.fileName.startsWith('hvsc:')) {
        const hvscPath = track.fileName.slice('hvsc:'.length);
        try {
          const { downloadHVSCFile } = await import('@/lib/hvscApi');
          const buffer = await downloadHVSCFile(hvscPath);
          const filename = hvscPath.split('/').pop() || 'download.sid';

          const { loadUADEToDeck } = await import('@engine/dj/DJUADEPrerender');
          await loadUADEToDeck(engine, deckId, buffer, filename, true, undefined, filename);
          if (useDJStore.getState().deckViewMode !== '3d') {
            useDJStore.getState().setDeckViewMode('vinyl');
          }
          return;
        } catch (err) {
          console.error(`[PixiDJPlaylistPanel] HVSC re-download failed:`, err);
        }
      }

      const file = await pickFiles({ accept: ACCEPT_AUDIO });
      const selected = file[0];
      if (!selected) return;
      try {
        const rawBuffer = await selected.arrayBuffer();
        if (isAudioFile(selected.name)) {
          await engine.loadAudioToDeck(deckId, rawBuffer, selected.name);
          useDJStore.getState().setDeckViewMode('vinyl');
        } else {
          const song = await parseModuleToSong(selected);
          cacheSong(selected.name, song);
          await loadSongToDeck(song, selected.name, deckId, rawBuffer);
        }
      } catch (err) {
        console.error(`[PixiDJPlaylistPanel] Failed to load track:`, err);
      }
    },
    [loadSongToDeck],
  );

  // ── Context menu ──────────────────────────────────────────────────────────

  const handleTrackRightClick = useCallback((trackId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[PixiDJPlaylist] Right-click on track:', trackId, 'at', e.clientX, e.clientY);
    setContextMenuTrackId(trackId);
    contextMenu.open(e);
  }, [contextMenu]);

  const contextMenuTrackIndex = useMemo(() => {
    if (!activePlaylist || !contextMenuTrackId) return -1;
    return activePlaylist.tracks.findIndex(t => t.id === contextMenuTrackId);
  }, [activePlaylist, contextMenuTrackId]);

  const contextMenuItems = useMemo((): MenuItemType[] => {
    if (!activePlaylist || contextMenuTrackIndex < 0) return [];
    const track = activePlaylist.tracks[contextMenuTrackIndex];
    if (!track) return [];

    const otherPlaylists = playlists.filter((p) => p.id !== activePlaylistId);
    const selCount = selectedTrackIndices.length;

    const items: MenuItemType[] = [
      { id: 'load-1', label: 'Load to Deck 1', onClick: () => loadTrackToDeck(track, 'A') },
      { id: 'load-2', label: 'Load to Deck 2', onClick: () => loadTrackToDeck(track, 'B') },
    ];

    if (thirdDeckActive) {
      items.push({ id: 'load-3', label: 'Load to Deck 3', onClick: () => loadTrackToDeck(track, 'C') });
    }

    items.push({ type: 'divider' });

    // Move up/down
    if (selCount <= 1) {
      items.push({
        id: 'move-up',
        label: 'Move Up',
        disabled: contextMenuTrackIndex === 0,
        onClick: () => {
          if (activePlaylistId && contextMenuTrackIndex > 0) {
            reorderTrack(activePlaylistId, contextMenuTrackIndex, contextMenuTrackIndex - 1);
          }
        },
      });
      items.push({
        id: 'move-down',
        label: 'Move Down',
        disabled: contextMenuTrackIndex === activePlaylist.tracks.length - 1,
        onClick: () => {
          if (activePlaylistId && contextMenuTrackIndex < activePlaylist.tracks.length - 1) {
            reorderTrack(activePlaylistId, contextMenuTrackIndex, contextMenuTrackIndex + 1);
          }
        },
      });
      items.push({ type: 'divider' });
    }

    if (otherPlaylists.length > 0) {
      items.push({
        id: 'move-to',
        label: selCount > 1 ? `Move ${selCount} to...` : 'Move to...',
        submenu: otherPlaylists.map((pl) => ({
          id: `move-${pl.id}`,
          label: pl.name,
          onClick: () => { if (activePlaylistId) moveSelectedTracks(activePlaylistId, pl.id); },
        })),
      });
      items.push({
        id: 'copy-to',
        label: selCount > 1 ? `Copy ${selCount} to...` : 'Copy to...',
        submenu: otherPlaylists.map((pl) => ({
          id: `copy-${pl.id}`,
          label: pl.name,
          onClick: () => { if (activePlaylistId) copySelectedTracks(activePlaylistId, pl.id); },
        })),
      });
      items.push({ type: 'divider' });
    }

    // Copy track info
    items.push({
      id: 'copy-info',
      label: 'Copy Track Info',
      onClick: () => {
        const info = [
          `Name: ${track.trackName}`,
          `File: ${track.fileName}`,
          track.format && `Format: ${track.format}`,
          track.bpm > 0 && `BPM: ${track.bpm}`,
          track.musicalKey && `Key: ${track.musicalKey}`,
          track.duration > 0 && `Duration: ${formatDuration(track.duration)}`,
        ].filter(Boolean).join('\n');
        navigator.clipboard.writeText(info).then(() => {
          console.log('[PixiDJPlaylist] Track info copied to clipboard');
        });
      },
    });

    items.push({ type: 'divider' });

    // Bad track management
    if (track.isBad) {
      items.push({
        id: 'clear-bad',
        label: 'Clear Bad Flag',
        onClick: () => {
          if (activePlaylistId) {
            useDJPlaylistStore.getState().clearTrackBadFlag(activePlaylistId, contextMenuTrackIndex);
          }
        },
      });
    } else {
      items.push({
        id: 'mark-bad',
        label: 'Mark as Bad',
        onClick: () => {
          if (activePlaylistId) {
            const reason = prompt('Reason (optional):') || 'Manually marked';
            useDJPlaylistStore.getState().markTrackBad(activePlaylistId, contextMenuTrackIndex, reason);
          }
        },
      });
    }

    items.push({ type: 'divider' });

    if (selCount > 1) {
      items.push({
        id: 'remove-selected',
        label: `Remove ${selCount} tracks`,
        danger: true,
        onClick: async () => {
          if (!activePlaylistId) return;
          const confirmed = await showConfirm({
            title: 'Remove Tracks',
            message: `Remove ${selCount} selected tracks from this playlist?`,
            confirmLabel: 'Remove',
            danger: true,
          });
          if (confirmed) removeSelectedTracks(activePlaylistId);
        },
      });
    } else {
      items.push({
        id: 'remove',
        label: 'Remove from playlist',
        danger: true,
        onClick: () => { if (activePlaylistId) removeTrack(activePlaylistId, contextMenuTrackIndex); },
      });
    }

    return items;
  }, [activePlaylist, activePlaylistId, contextMenuTrackIndex, playlists, selectedTrackIndices, thirdDeckActive, loadTrackToDeck, moveSelectedTracks, copySelectedTracks, removeSelectedTracks, removeTrack, reorderTrack]);

  // Keep ref in sync for keyboard handler
  loadTrackRef.current = loadTrackToDeck;

  // ── Reorder helpers ────────────────────────────────────────────────────────

  const handleMoveUp = useCallback(
    (idx: number) => {
      if (!activePlaylistId || idx <= 0) return;
      reorderTrack(activePlaylistId, idx, idx - 1);
    },
    [activePlaylistId, reorderTrack],
  );

  const handleMoveDown = useCallback(
    (idx: number) => {
      if (!activePlaylistId || !activePlaylist) return;
      if (idx >= activePlaylist.tracks.length - 1) return;
      reorderTrack(activePlaylistId, idx, idx + 1);
    },
    [activePlaylistId, activePlaylist, reorderTrack],
  );

  const handleRemoveTrack = useCallback(
    (idx: number) => {
      if (activePlaylistId) removeTrack(activePlaylistId, idx);
    },
    [activePlaylistId, removeTrack],
  );

  const handleRemoveSelected = useCallback(async () => {
    if (!activePlaylistId || selectedTrackIndices.length === 0) return;
    if (selectedTrackIndices.length > 3) {
      const confirmed = await showConfirm({
        title: 'Remove Tracks',
        message: `Remove ${selectedTrackIndices.length} selected tracks?`,
        confirmLabel: 'Remove',
        danger: true,
      });
      if (!confirmed) return;
    }
    removeSelectedTracks(activePlaylistId);
  }, [activePlaylistId, selectedTrackIndices, removeSelectedTracks]);

  // ── Move/Copy to playlist ─────────────────────────────────────────────────

  const otherPlaylists = useMemo(
    () => playlists.filter((p) => p.id !== activePlaylistId),
    [playlists, activePlaylistId],
  );

  const handleMoveToPlaylist = useCallback((targetId: string) => {
    if (activePlaylistId) moveSelectedTracks(activePlaylistId, targetId);
    setShowMoveMenu(null);
  }, [activePlaylistId, moveSelectedTracks]);

  const handleCopyToPlaylist = useCallback((targetId: string) => {
    if (activePlaylistId) copySelectedTracks(activePlaylistId, targetId);
    setShowMoveMenu(null);
  }, [activePlaylistId, copySelectedTracks]);

  // ── Sort ───────────────────────────────────────────────────────────────────

  const handleSort = useCallback((mode: 'smart' | 'bpm' | 'bpm-desc' | 'key' | 'energy' | 'name') => {
    if (!activePlaylist) return;
    const tracks = [...activePlaylist.tracks];
    let sorted: PlaylistTrack[];
    switch (mode) {
      case 'smart': sorted = smartSort(tracks); break;
      case 'bpm': sorted = sortByBPM(tracks); break;
      case 'bpm-desc': sorted = sortByBPM(tracks, true); break;
      case 'key': sorted = sortByKey(tracks); break;
      case 'energy': sorted = sortByEnergy(tracks); break;
      case 'name': sorted = sortByName(tracks); break;
      default: sorted = tracks;
    }
    sortTracksAction(activePlaylist.id, sorted);
    setShowSort(false);
  }, [activePlaylist, sortTracksAction]);

  // ── Track list items for PixiList ──────────────────────────────────────────

  const selectedSet = useMemo(() => new Set(selectedTrackIndices), [selectedTrackIndices]);

  const trackListItems = useMemo(() => {
    if (!activePlaylist) return [];
    const tracks = isFiltered ? filteredTracks : activePlaylist.tracks;
    return tracks.map((t, i) => {
      const realIndex = isFiltered ? activePlaylist.tracks.indexOf(t) : i;
      const badBadge = t.isBad ? '[✗] ' : '';
      const playedBadge = t.played ? '[P] ' : '';
      return {
        id: t.id,
        label: `${(realIndex + 1).toString().padStart(2, ' ')}  ${badBadge}${playedBadge}${t.trackName}`,
        labelColor: t.isBad ? 0xff5555 : undefined,
        sublabel: trackSublabel(t),
        iconName: 'diskio',
        iconColor: t.isBad ? 0xff5555 : t.played ? theme.success.color : undefined,
        selected: selectedSet.has(realIndex),
        actions: [
          { label: '1', color: DECK_A, onClick: () => loadTrackToDeck(t, 'A') },
          { label: '2', color: DECK_B, onClick: () => loadTrackToDeck(t, 'B') },
          ...(thirdDeckActive ? [{ label: '3', color: DECK_C, onClick: () => loadTrackToDeck(t, 'C' as DeckId) }] : []),
          { label: '\u25b2', color: 0x666666, onClick: () => handleMoveUp(realIndex) },
          { label: '\u25bc', color: 0x666666, onClick: () => handleMoveDown(realIndex) },
          { label: 'X', color: 0x666666, onClick: () => handleRemoveTrack(realIndex) },
        ],
      };
    });
  }, [activePlaylist, isFiltered, filteredTracks, thirdDeckActive, selectedSet, loadTrackToDeck, handleMoveUp, handleMoveDown, handleRemoveTrack, theme.success.color]);

  // Find selected track index
  const selectedIdx = useMemo(() => {
    if (!selectedTrackId || !activePlaylist) return -1;
    return trackListItems.findIndex((item) => item.id === selectedTrackId);
  }, [selectedTrackId, trackListItems, activePlaylist]);

  // ── Dimensions ─────────────────────────────────────────────────────────────

  const extraRows = (showSort ? 24 : 0) + (isFiltered ? SEARCH_H : 0) + (showMoveMenu ? 80 : 0);
  const listH = PANEL_H - HEADER_H - TABS_H - TOOLBAR_H - extraRows - PAD * 4;

  if (!visible) return null;

  return (
    <layoutContainer
      eventMode="static"
      layout={{
        width: '100%' as unknown as number,
        height: PANEL_H,
        flexDirection: 'column',
        backgroundColor: theme.bgSecondary.color,
        borderWidth: 1,
        borderColor: theme.border.color,
        borderRadius: 6,
        padding: PAD,
        gap: 2,
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <layoutContainer
        layout={{
          height: HEADER_H,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
        }}
      >
        <PixiLabel
          text="PLAYLISTS"
          size="xs"
          weight="bold"
          font="mono"
          color="accent"
          layout={{ marginLeft: 2 }}
        />
        <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
          <PixiButton label="+ New" variant="ghost" size="sm" width={52} height={22} onClick={handleNewPlaylist} />
          {activePlaylistId && (
            <>
              <PixiButton label="Clone" variant="ghost" size="sm" width={44} height={22} onClick={handleClonePlaylist} />
              <PixiButton label="Delete" variant="ghost" size="sm" width={52} height={22} color="red" onClick={handleDeletePlaylist} />
            </>
          )}
          {canUndo && <PixiButton icon="undo" label="" variant="ghost" size="sm" width={24} height={22} onClick={undo} />}
          {canRedo && <PixiButton icon="redo" label="" variant="ghost" size="sm" width={24} height={22} onClick={redo} />}
          {onClose && (
            <PixiButton icon="close" label="" variant="ghost" size="sm" width={24} height={22} onClick={onClose} />
          )}
        </layoutContainer>
      </layoutContainer>

      {/* ── Playlist tabs ───────────────────────────────────────────────── */}
      {playlists.length > 0 && (
        <layoutContainer
          layout={{
            height: TABS_H,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 3,
            overflow: 'hidden',
          }}
        >
          {playlists.map((pl) => (
            <PixiButton
              key={pl.id}
              label={`${pl.name} (${pl.tracks.length})`}
              variant="ft2"
              size="sm"
              height={22}
              active={activePlaylistId === pl.id}
              onClick={() => setActivePlaylist(pl.id)}
            />
          ))}
        </layoutContainer>
      )}

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      {activePlaylist && (
        <layoutContainer
          layout={{
            height: TOOLBAR_H,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <PixiButton
            label={isLoadingFile ? '...' : '+ Add'}
            variant="default"
            size="sm"
            width={56}
            height={22}
            disabled={isLoadingFile}
            onClick={handleAddTracks}
          />
          <PixiButton label="Sort" variant="ghost" size="sm" width={40} height={22} onClick={() => setShowSort((v) => !v)} />
          
          {badTrackCount > 0 && (
            <PixiButton
              label={retestingBad ? 'Testing...' : `Re-test (${badTrackCount})`}
              variant="ghost"
              size="sm"
              width={retestingBad ? 70 : 88}
              height={22}
              color="red"
              disabled={retestingBad}
              onClick={handleRetestBadTracks}
            />
          )}

          {selectedTrackIndices.length > 1 && (
            <>
              <PixiLabel text={`${selectedTrackIndices.length} sel`} size="xs" color="accent" />
              {otherPlaylists.length > 0 && (
                <>
                  <PixiButton label="Move" variant="ghost" size="sm" width={40} height={22} onClick={() => setShowMoveMenu((v) => v === 'move' ? null : 'move')} />
                  <PixiButton label="Copy" variant="ghost" size="sm" width={40} height={22} onClick={() => setShowMoveMenu((v) => v === 'copy' ? null : 'copy')} />
                </>
              )}
              <PixiButton label="Del sel" variant="ghost" size="sm" width={50} height={22} color="red" onClick={handleRemoveSelected} />
              <PixiButton label="Clear" variant="ghost" size="sm" width={42} height={22} onClick={clearSelection} />
            </>
          )}

          {selectedIdx >= 0 && (
            <>
              <layoutContainer layout={{ flex: 1 }} />
              <layoutContainer layout={{ flexDirection: 'row', gap: 3 }}>
                <PixiButton label="Deck 1" variant="ft2" size="sm" color="blue" width={50} height={22}
                  onClick={() => loadTrackToDeck(activePlaylist.tracks[selectedIdx], 'A')} />
                <PixiButton label="Deck 2" variant="ft2" size="sm" color="red" width={50} height={22}
                  onClick={() => loadTrackToDeck(activePlaylist.tracks[selectedIdx], 'B')} />
                {thirdDeckActive && (
                  <PixiButton label="Deck 3" variant="ft2" size="sm" color="green" width={50} height={22}
                    onClick={() => loadTrackToDeck(activePlaylist.tracks[selectedIdx], 'C')} />
                )}
              </layoutContainer>
            </>
          )}
        </layoutContainer>
      )}

      {/* ── Sort row ────────────────────────────────────────────────────── */}
      {showSort && activePlaylist && (
        <layoutContainer layout={{ height: 24, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <PixiButton label="Smart" variant="ft2" size="sm" width={48} height={20} onClick={() => handleSort('smart')} />
          <PixiButton label="BPM" variant="ft2" size="sm" width={36} height={20} onClick={() => handleSort('bpm')} />
          <PixiButton label="Key" variant="ft2" size="sm" width={32} height={20} onClick={() => handleSort('key')} />
          <PixiButton label="Energy" variant="ft2" size="sm" width={48} height={20} onClick={() => handleSort('energy')} />
          <PixiButton label="Name" variant="ft2" size="sm" width={40} height={20} onClick={() => handleSort('name')} />
        </layoutContainer>
      )}

      {/* ── Move/Copy target selector ───────────────────────────────────── */}
      {showMoveMenu && otherPlaylists.length > 0 && (
        <layoutContainer layout={{ height: 80, flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
          <PixiLabel text={showMoveMenu === 'move' ? 'Move to:' : 'Copy to:'} size="xs" color="textMuted" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 3, flexWrap: 'wrap' as unknown as undefined }}>
            {otherPlaylists.map((pl) => (
              <PixiButton
                key={pl.id}
                label={pl.name}
                variant="ft2"
                size="sm"
                height={20}
                onClick={() => showMoveMenu === 'move' ? handleMoveToPlaylist(pl.id) : handleCopyToPlaylist(pl.id)}
              />
            ))}
          </layoutContainer>
        </layoutContainer>
      )}

      {/* ── Search indicator ────────────────────────────────────────────── */}
      {isFiltered && (
        <layoutContainer layout={{ height: SEARCH_H, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <PixiLabel text={`Filter: "${searchQuery}" \u2014 ${filteredTracks.length} of ${activePlaylist?.tracks.length ?? 0}`} size="xs" color="textMuted" />
          <PixiButton label="Clear" variant="ghost" size="sm" width={36} height={18} onClick={() => setSearchQuery('')} />
        </layoutContainer>
      )}

      {/* ── Track list ──────────────────────────────────────────────────── */}
      {activePlaylist ? (
        trackListItems.length > 0 ? (
          <PixiList
            items={trackListItems}
            width={600}
            height={listH > 0 ? listH : 100}
            itemHeight={26}
            selectedId={selectedTrackId}
            onSelect={setSelectedTrackId}
            onRightClick={handleTrackRightClick}
            layout={{ flex: 1 }}
          />
        ) : (
          <layoutContainer layout={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <PixiLabel text={isFiltered ? 'No tracks match' : 'Empty playlist \u2014 add tracks above'} size="xs" color="textMuted" />
          </layoutContainer>
        )
      ) : (
        <layoutContainer layout={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <PixiLabel text="Create a playlist to get started" size="xs" color="textMuted" />
        </layoutContainer>
      )}

      {/* ── Context Menu ─────────────────────────────────────────────────── */}
      <ContextMenu items={contextMenuItems} position={contextMenu.position} onClose={contextMenu.close} />
    </layoutContainer>
  );
};

export default PixiDJPlaylistPanel;
