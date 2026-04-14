/**
 * DJPlaylistPanel - Full-featured playlist manager for the DJ view.
 *
 * Features: CRUD, multi-select (Shift/Cmd+click), keyboard nav, @dnd-kit drag
 * reorder, right-click context menu, search/filter, virtual scrolling,
 * import/export (M3U/JSON), undo/redo, confirmations, track metadata editing.
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  GripVertical,
  ArrowUpDown,
  Search,
  Copy,
  Download,
  Upload,
} from 'lucide-react';
import {
  useDJPlaylistStore,
  type PlaylistTrack,
  type DJPlaylist,
} from '@/stores/useDJPlaylistStore';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { detectBPM, estimateSongDuration } from '@/engine/dj/DJBeatDetector';
import { cacheSong } from '@/engine/dj/DJSongCache';
import { smartSort, sortByBPM, sortByKey, sortByEnergy, sortByName } from '@/engine/dj/DJPlaylistSort';
import { camelotDisplay, camelotColor } from '@/engine/dj/DJKeyUtils';
import { getDJPipeline } from '@/engine/dj/DJPipeline';
import { isAudioFile } from '@/lib/audioFileUtils';
import { isUADEFormat } from '@/lib/import/formats/UADEParser';
import { loadUADEToDeck } from '@/engine/dj/DJUADEPrerender';
import { precachePlaylist, type PrecacheProgress } from '@/engine/dj/DJPlaylistPrecache';
import { getCachedFilenames } from '@/engine/dj/DJAudioCache';
import { CustomSelect } from '@components/common/CustomSelect';
import { ContextMenu, useContextMenu, type MenuItemType } from '@components/common/ContextMenu';
import { showConfirm } from '@/stores/useConfirmStore';
import { DJTrackEditModal } from './DJTrackEditModal';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function exportToM3U(playlist: DJPlaylist): string {
  const lines = ['#EXTM3U', `#PLAYLIST:${playlist.name}`];
  for (const t of playlist.tracks) {
    const dur = Math.round(t.duration || -1);
    lines.push(`#EXTINF:${dur},${t.trackName}`);
    lines.push(t.fileName);
  }
  return lines.join('\n');
}

function exportToJSON(playlist: DJPlaylist): string {
  return JSON.stringify(playlist, null, 2);
}

function parseM3U(content: string): Array<Omit<PlaylistTrack, 'id'>> {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  const tracks: Array<Omit<PlaylistTrack, 'id'>> = [];
  let pendingName = '';
  let pendingDuration = 0;
  for (const line of lines) {
    if (line.startsWith('#EXTINF:')) {
      const match = line.match(/#EXTINF:(-?\d+),(.+)/);
      if (match) {
        pendingDuration = Math.max(0, parseInt(match[1], 10));
        pendingName = match[2].trim();
      }
    } else if (!line.startsWith('#')) {
      const fileName = line.trim();
      tracks.push({
        fileName,
        trackName: pendingName || fileName.replace(/\.[^.]+$/, ''),
        format: (fileName.split('.').pop() || 'MOD').toUpperCase(),
        bpm: 0,
        duration: pendingDuration,
        addedAt: Date.now(),
      });
      pendingName = '';
      pendingDuration = 0;
    }
  }
  return tracks;
}

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const TRACK_ROW_HEIGHT = 32;

// ── Sortable Track Row ──────────────────────────────────────────────────────

interface SortableTrackRowProps {
  track: PlaylistTrack;
  index: number;
  isSelected: boolean;
  isFocused: boolean;
  isLoading: boolean;
  loadingDeckId: string | null;
  isAutoDJCurrent: boolean;
  isAutoDJNext: boolean;
  thirdDeckActive: boolean;
  onLoadToDeck: (track: PlaylistTrack, deckId: 'A' | 'B' | 'C', index: number) => void;
  onRemove: (index: number) => void;
  onClick: (index: number, e: React.MouseEvent) => void;
  onDoubleClick: (track: PlaylistTrack, index: number) => void;
}

const SortableTrackRow: React.FC<SortableTrackRowProps> = React.memo(({
  track,
  index,
  isSelected,
  isFocused,
  isLoading,
  loadingDeckId,
  isAutoDJCurrent,
  isAutoDJNext,
  thirdDeckActive,
  onLoadToDeck,
  onRemove,
  onClick,
  onDoubleClick,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: track.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    height: TRACK_ROW_HEIGHT,
  };

  const [isHovered, setIsHovered] = useState(false);

  const bgClass = isLoading
    ? 'bg-cyan-900/20'
    : isDragging
      ? 'bg-accent-primary/20'
      : isSelected
        ? 'bg-accent-primary/10'
        : isAutoDJCurrent
          ? 'bg-green-900/20'
          : isAutoDJNext
            ? 'bg-blue-900/15'
            : isHovered
              ? 'bg-white/5'
              : '';

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-track-index={index}
      className={`flex items-center gap-1.5 px-1.5 border-b border-dark-border transition-colors cursor-pointer ${bgClass} ${isFocused ? 'ring-1 ring-accent-primary/40 ring-inset' : ''}`}
      onClick={(e) => onClick(index, e)}
      onDoubleClick={() => onDoubleClick(track, index)}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
    >
      <div {...attributes} {...listeners} className="cursor-grab touch-none">
        <GripVertical size={8} className="text-text-muted/20 hover:text-text-muted/50 shrink-0" />
      </div>
      <span className="text-xs font-mono text-text-muted/30 w-4 text-right shrink-0">
        {index + 1}
      </span>
      {isLoading ? (
        <span className="text-cyan-400 text-[9px] shrink-0 animate-pulse" title={`Loading to deck ${loadingDeckId}`}>
          {loadingDeckId}
        </span>
      ) : track.isBad ? (
        <span className="text-red-500 text-[9px] shrink-0" title={`Bad: ${track.badReason}`}>✗</span>
      ) : track.played ? (
        <span className="text-green-500/50 text-[9px] shrink-0" title="Played">P</span>
      ) : null}
      <span className={`flex-1 text-sm font-mono truncate min-w-0 ${
        isLoading ? 'text-cyan-400' : track.isBad ? 'text-red-500/90' : track.played ? 'text-text-muted/40' : 'text-text-secondary'
      }`}>
        {track.trackName}
      </span>
      {track.bpm > 0 && (
        <span className="text-xs font-mono text-text-muted/40 shrink-0">{track.bpm}</span>
      )}
      {track.musicalKey && (
        <span
          className="text-[10px] font-mono font-bold shrink-0 px-1 rounded"
          style={{ color: camelotColor(track.musicalKey), backgroundColor: `${camelotColor(track.musicalKey)}15` }}
        >
          {camelotDisplay(track.musicalKey)}
        </span>
      )}
      {track.duration > 0 && (
        <span className="text-xs font-mono text-text-muted/30 shrink-0">{formatDuration(track.duration)}</span>
      )}
      <span className={`flex items-center gap-0.5 shrink-0 transition-opacity ${isHovered || isFocused ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <button
          onClick={(e) => { e.stopPropagation(); onLoadToDeck(track, 'A', index); }}
          className="px-1 text-xs font-mono font-bold text-blue-400 hover:text-blue-300 transition-colors"
          title="Deck 1"
        >1</button>
        <button
          onClick={(e) => { e.stopPropagation(); onLoadToDeck(track, 'B', index); }}
          className="px-1 text-xs font-mono font-bold text-red-400 hover:text-red-300 transition-colors"
          title="Deck 2"
        >2</button>
        {thirdDeckActive && (
          <button
            onClick={(e) => { e.stopPropagation(); onLoadToDeck(track, 'C', index); }}
            className="px-1 text-xs font-mono font-bold text-emerald-400 hover:text-emerald-300 transition-colors"
            title="Deck 3"
          >3</button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(index); }}
          title="Remove from playlist"
          className="p-0.5 text-accent-error hover:text-red-400 transition-colors"
        >
          <X size={8} />
        </button>
      </span>
    </div>
  );
});

SortableTrackRow.displayName = 'SortableTrackRow';

// ── Main Component ──────────────────────────────────────────────────────────

interface DJPlaylistPanelProps {
  onClose?: () => void;
}

export const DJPlaylistPanel: React.FC<DJPlaylistPanelProps> = ({ onClose }) => {
  const playlists = useDJPlaylistStore((s) => s.playlists);
  const activePlaylistId = useDJPlaylistStore((s) => s.activePlaylistId);
  const createPlaylist = useDJPlaylistStore((s) => s.createPlaylist);
  const deletePlaylist = useDJPlaylistStore((s) => s.deletePlaylist);
  const renamePlaylist = useDJPlaylistStore((s) => s.renamePlaylist);
  const setActivePlaylist = useDJPlaylistStore((s) => s.setActivePlaylist);
  const addTrack = useDJPlaylistStore((s) => s.addTrack);
  const addTracks = useDJPlaylistStore((s) => s.addTracks);
  const removeTrack = useDJPlaylistStore((s) => s.removeTrack);
  const reorderTrack = useDJPlaylistStore((s) => s.reorderTrack);
  const sortTracksAction = useDJPlaylistStore((s) => s.sortTracks);
  const clonePlaylist = useDJPlaylistStore((s) => s.clonePlaylist);
  const selectedTrackIndices = useDJPlaylistStore((s) => s.selectedTrackIndices);
  const focusedTrackIndex = useDJPlaylistStore((s) => s.focusedTrackIndex);
  const selectTrack = useDJPlaylistStore((s) => s.selectTrack);
  const selectTrackRange = useDJPlaylistStore((s) => s.selectTrackRange);
  const toggleTrackSelection = useDJPlaylistStore((s) => s.toggleTrackSelection);
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

  const autoDJEnabled = useDJStore((s) => s.autoDJEnabled);
  const autoDJCurrentIdx = useDJStore((s) => s.autoDJCurrentTrackIndex);
  const autoDJNextIdx = useDJStore((s) => s.autoDJNextTrackIndex);
  const thirdDeckActive = useDJStore((s) => s.thirdDeckActive);

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [loadingTrackIndex, setLoadingTrackIndex] = useState<number | null>(null);
  const [loadingDeckId, setLoadingDeckId] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [editTrack, setEditTrack] = useState<{ index: number; track: PlaylistTrack } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastClickedRef = useRef<number>(-1);

  // Context menu
  const contextMenu = useContextMenu();
  const [contextMenuTrackIndex, setContextMenuTrackIndex] = useState<number>(-1);

  // Click-outside to close
  useEffect(() => {
    if (!onClose) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        const contextMenuEl = document.querySelector('[data-context-menu]');
        if (contextMenuEl?.contains(e.target as Node)) return;
        onClose();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [onClose]);

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? null;
  const selectedSet = useMemo(() => new Set(selectedTrackIndices), [selectedTrackIndices]);

  // ── Search/filter ─────────────────────────────────────────────────────────

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

  // Map filtered indices back to real indices
  const filteredIndexMap = useMemo(() => {
    if (!isFiltered || !activePlaylist) return null;
    const map = new Map<number, number>();
    let fi = 0;
    for (let i = 0; i < activePlaylist.tracks.length; i++) {
      if (filteredTracks.includes(activePlaylist.tracks[i])) {
        map.set(fi, i);
        fi++;
      }
    }
    return map;
  }, [isFiltered, activePlaylist, filteredTracks]);

  const getRealIndex = useCallback((displayIndex: number): number => {
    if (!filteredIndexMap) return displayIndex;
    return filteredIndexMap.get(displayIndex) ?? displayIndex;
  }, [filteredIndexMap]);

  // Native contextmenu listener - React synthetic events don't work reliably
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    const handler = (e: MouseEvent) => {
      // Check if we clicked on a track row
      const target = e.target as HTMLElement;
      const trackRow = target.closest('[data-track-index]');
      if (trackRow) {
        e.preventDefault();
        e.stopPropagation();
        const index = parseInt(trackRow.getAttribute('data-track-index') || '-1', 10);
        if (index >= 0) {
          console.log('[DJPlaylist] Native context menu on track:', index, 'at', e.clientX, e.clientY);
          const realIndex = getRealIndex(index);
          setContextMenuTrackIndex(realIndex);
          if (!selectedSet.has(realIndex)) {
            selectTrack(realIndex);
          }
          const fakeEvent = {
            preventDefault: () => {},
            stopPropagation: () => {},
            clientX: e.clientX,
            clientY: e.clientY,
          } as React.MouseEvent;
          contextMenu.open(fakeEvent);
        }
      }
    };
    
    container.addEventListener('contextmenu', handler, true);
    return () => container.removeEventListener('contextmenu', handler, true);
  }, [getRealIndex, selectedSet, selectTrack, contextMenu]);

  // ── Virtual scrolling ─────────────────────────────────────────────────────

  const virtualizer = useVirtualizer({
    count: filteredTracks.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => TRACK_ROW_HEIGHT,
    overscan: 5,
  });

  // ── @dnd-kit ──────────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sortableIds = useMemo(() =>
    filteredTracks.map((t) => t.id),
    [filteredTracks]
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    if (!activePlaylistId || isFiltered) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = filteredTracks.findIndex((t) => t.id === active.id);
    const newIndex = filteredTracks.findIndex((t) => t.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      reorderTrack(activePlaylistId, oldIndex, newIndex);
    }
  }, [activePlaylistId, isFiltered, filteredTracks, reorderTrack]);

  // ── Pre-cache for offline ───────────────────────────────────────────────

  const [precacheProgress, setPrecacheProgress] = useState<PrecacheProgress | null>(null);
  const precachingRef = useRef(false);
  const [cachedCount, setCachedCount] = useState(0);

  // ── Re-test bad tracks ───────────────────────────────────────────────────
  
  const [retestingBad, setRetestingBad] = useState(false);
  
  const badTrackCount = activePlaylist
    ? activePlaylist.tracks.filter(t => t.isBad).length
    : 0;

  const handleRetestBadTracks = useCallback(async () => {
    if (!activePlaylist || !activePlaylistId || retestingBad) return;
    
    const badTracks = activePlaylist.tracks
      .map((t, idx) => ({ track: t, index: idx }))
      .filter(({ track }) => track.isBad);
    
    if (badTracks.length === 0) {
      console.log('[DJPlaylist] No bad tracks to re-test');
      return;
    }
    
    setRetestingBad(true);
    console.log(`[DJPlaylist] Re-testing ${badTracks.length} bad tracks...`);
    
    const { loadPlaylistTrackToDeck } = await import('@/engine/dj/DJTrackLoader');
    const { clearTrackBadFlag } = useDJPlaylistStore.getState();
    
    let successCount = 0;
    for (const { track, index } of badTracks) {
      console.log(`[DJPlaylist] Re-testing track ${index}: ${track.trackName} (reason: ${track.badReason})`);
      
      // Clear bad flag before testing
      clearTrackBadFlag(activePlaylistId, index);
      
      // Try loading to a temporary deck (use whichever deck is idle or just use A)
      const success = await loadPlaylistTrackToDeck(track, 'A');
      
      if (success) {
        successCount++;
        console.log(`[DJPlaylist] ✓ Track ${index} now loads successfully`);
      } else {
        console.warn(`[DJPlaylist] ✗ Track ${index} still fails`);
      }
    }
    
    setRetestingBad(false);
    console.log(`[DJPlaylist] Re-test complete: ${successCount}/${badTracks.length} now working`);
  }, [activePlaylist, activePlaylistId, retestingBad]);

  useEffect(() => {
    if (!activePlaylist) { setCachedCount(0); return; }
    getCachedFilenames().then(names => {
      let count = 0;
      for (const t of activePlaylist.tracks) {
        if (!t.fileName.startsWith('modland:')) continue;
        const fn = t.fileName.slice('modland:'.length).split('/').pop() || '';
        if (names.has(fn)) count++;
      }
      setCachedCount(count);
    });
  }, [activePlaylist, precacheProgress]);

  const modlandCount = activePlaylist
    ? activePlaylist.tracks.filter(t => t.fileName.startsWith('modland:')).length
    : 0;
  const uncachedCount = modlandCount - cachedCount;

  const handlePrecache = useCallback(async () => {
    if (!activePlaylistId || precachingRef.current) return;
    precachingRef.current = true;
    setPrecacheProgress({ current: 0, total: 1, cached: 0, failed: 0, skipped: 0, trackName: 'Starting...', status: 'checking' });
    try {
      await precachePlaylist(activePlaylistId, (p) => setPrecacheProgress({ ...p }));
    } finally {
      precachingRef.current = false;
      setPrecacheProgress(null);
    }
  }, [activePlaylistId]);

  // ── Playlist CRUD ────────────────────────────────────────────────────────

  const handleCreate = useCallback(() => {
    if (!newName.trim()) return;
    createPlaylist(newName.trim());
    setNewName('');
    setIsCreating(false);
  }, [newName, createPlaylist]);

  const handleRename = useCallback(
    (id: string) => {
      if (!editName.trim()) return;
      renamePlaylist(id, editName.trim());
      setEditingId(null);
    },
    [editName, renamePlaylist],
  );

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

  // ── Add files to playlist ────────────────────────────────────────────────

  const handleAddFiles = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!activePlaylistId || !e.target.files) return;
      setIsLoadingFile(true);

      for (const file of Array.from(e.target.files)) {
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
          console.error(`[DJPlaylistPanel] Failed to process ${file.name}:`, err);
        }
      }

      setIsLoadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [activePlaylistId, addTrack],
  );

  // ── Import playlist ───────────────────────────────────────────────────────

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    const text = await file.text();

    if (file.name.endsWith('.json')) {
      try {
        const data = JSON.parse(text) as DJPlaylist;
        if (data.tracks && Array.isArray(data.tracks)) {
          const id = createPlaylist(data.name || 'Imported');
          addTracks(id, data.tracks);
        }
      } catch {
        console.error('[DJPlaylistPanel] Invalid JSON playlist file');
      }
    } else {
      const tracks = parseM3U(text);
      if (tracks.length > 0) {
        const name = file.name.replace(/\.[^.]+$/, '');
        const id = createPlaylist(name);
        addTracks(id, tracks);
      }
    }

    if (importInputRef.current) importInputRef.current.value = '';
  }, [createPlaylist, addTracks]);

  // ── Export playlist ───────────────────────────────────────────────────────

  const handleExportM3U = useCallback(() => {
    if (!activePlaylist) return;
    downloadFile(exportToM3U(activePlaylist), `${activePlaylist.name}.m3u8`, 'audio/mpegurl');
  }, [activePlaylist]);

  const handleExportJSON = useCallback(() => {
    if (!activePlaylist) return;
    downloadFile(exportToJSON(activePlaylist), `${activePlaylist.name}.json`, 'application/json');
  }, [activePlaylist]);

  // ── Load track to deck ────────────────────────────────────────────────────

  const pickFreeDeck = useCallback((): 'A' | 'B' => {
    const decks = useDJStore.getState().decks;
    if (!decks.A.isPlaying) return 'A';
    if (!decks.B.isPlaying) return 'B';
    return 'A';
  }, []);

  const loadSongToDeck = useCallback(
    async (song: import('@/engine/TrackerReplayer').TrackerSong, fileName: string, deckId: 'A' | 'B' | 'C', rawBuffer?: ArrayBuffer) => {
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
          await engine.loadAudioToDeck(deckId, result.wavData, fileName, song.name || fileName, result.analysis?.bpm || bpmResult.bpm, song);
          useDJStore.getState().setDeckViewMode('visualizer');
        } catch (err) {
          console.error(`[DJPlaylistPanel] Pipeline failed for ${fileName}:`, err);
        }
      }
    },
    [],
  );

  const loadTrackToDeck = useCallback(
    async (track: PlaylistTrack, deckId: 'A' | 'B' | 'C') => {
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
          } else if (isUADEFormat(filename)) {
            await loadUADEToDeck(engine, deckId, buffer, filename, true, undefined, track.trackName);
            useDJStore.getState().setDeckViewMode('visualizer');
          } else {
            const blob = new File([buffer], filename, { type: 'application/octet-stream' });
            const song = await parseModuleToSong(blob);
            cacheSong(track.fileName, song);
            await loadSongToDeck(song, track.fileName, deckId, buffer);
          }
          return;
        } catch (err) {
          console.error(`[DJPlaylistPanel] Modland re-download failed:`, err);
        }
      }

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '*/*';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          const rawBuffer = await file.arrayBuffer();
          if (isAudioFile(file.name)) {
            await engine.loadAudioToDeck(deckId, rawBuffer, file.name);
            useDJStore.getState().setDeckViewMode('vinyl');
          } else {
            const song = await parseModuleToSong(file);
            cacheSong(file.name, song);
            await loadSongToDeck(song, file.name, deckId, rawBuffer);
          }
        } catch (err) {
          console.error(`[DJPlaylistPanel] Failed to load track:`, err);
        }
      };
      input.click();
    },
    [loadSongToDeck],
  );

  const loadTrackWithProgress = useCallback(
    async (track: PlaylistTrack, deckId: 'A' | 'B' | 'C', index: number) => {
      setLoadingTrackIndex(index);
      setLoadingDeckId(deckId);
      try {
        await loadTrackToDeck(track, deckId);
      } finally {
        setLoadingTrackIndex(null);
        setLoadingDeckId(null);
      }
    },
    [loadTrackToDeck],
  );

  // ── Drop files onto playlist ──────────────────────────────────────────────

  const handleDropOnPlaylist = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!activePlaylistId) return;

      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length === 0) return;

      setIsLoadingFile(true);
      for (const file of droppedFiles) {
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
          console.error(`[DJPlaylistPanel] Drop process error:`, err);
        }
      }
      setIsLoadingFile(false);
    },
    [activePlaylistId, addTrack],
  );

  // ── Sort handlers ─────────────────────────────────────────────────────────

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
    setShowSortMenu(false);
  }, [activePlaylist, sortTracksAction]);

  // ── Multi-select click handler ────────────────────────────────────────────

  const handleTrackClick = useCallback((displayIndex: number, e: React.MouseEvent) => {
    const realIndex = getRealIndex(displayIndex);
    if (e.metaKey || e.ctrlKey) {
      toggleTrackSelection(realIndex);
    } else if (e.shiftKey && lastClickedRef.current >= 0) {
      selectTrackRange(lastClickedRef.current, realIndex);
    } else {
      selectTrack(realIndex);
    }
    lastClickedRef.current = realIndex;
  }, [getRealIndex, toggleTrackSelection, selectTrackRange, selectTrack]);

  const handleTrackDoubleClick = useCallback((track: PlaylistTrack, displayIndex: number) => {
    const realIndex = getRealIndex(displayIndex);
    loadTrackWithProgress(track, pickFreeDeck(), realIndex);
  }, [getRealIndex, loadTrackWithProgress, pickFreeDeck]);

  // ── Context menu ──────────────────────────────────────────────────────────

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Check if we clicked on a track row
    const target = e.target as HTMLElement;
    const trackRow = target.closest('[data-track-index]');
    
    if (trackRow) {
      const index = parseInt(trackRow.getAttribute('data-track-index') || '-1', 10);
      if (index >= 0) {
        const realIndex = getRealIndex(index);
        setContextMenuTrackIndex(realIndex);
        if (!selectedSet.has(realIndex)) {
          selectTrack(realIndex);
        }
        contextMenu.open(e);
      }
    }
  }, [getRealIndex, selectedSet, selectTrack, contextMenu]);

  const contextMenuItems = useMemo((): MenuItemType[] => {
    if (!activePlaylist || contextMenuTrackIndex < 0) return [];
    const track = activePlaylist.tracks[contextMenuTrackIndex];
    if (!track) return [];

    const otherPlaylists = playlists.filter((p) => p.id !== activePlaylistId);
    const selCount = selectedTrackIndices.length;

    const items: MenuItemType[] = [
      { id: 'load-1', label: 'Load to Deck 1', onClick: () => loadTrackWithProgress(track, 'A', contextMenuTrackIndex) },
      { id: 'load-2', label: 'Load to Deck 2', onClick: () => loadTrackWithProgress(track, 'B', contextMenuTrackIndex) },
    ];

    if (thirdDeckActive) {
      items.push({ id: 'load-3', label: 'Load to Deck 3', onClick: () => loadTrackWithProgress(track, 'C', contextMenuTrackIndex) });
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

    items.push({
      id: 'edit-info',
      label: 'Edit Track Info',
      onClick: () => setEditTrack({ index: contextMenuTrackIndex, track }),
    });

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
          console.log('[DJPlaylist] Track info copied to clipboard');
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
  }, [activePlaylist, activePlaylistId, contextMenuTrackIndex, playlists, selectedTrackIndices, thirdDeckActive, loadTrackWithProgress, moveSelectedTracks, copySelectedTracks, removeSelectedTracks, removeTrack, reorderTrack]);

  // ── Keyboard navigation ───────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!activePlaylist || !activePlaylistId) return;
    const trackCount = filteredTracks.length;
    if (trackCount === 0) return;

    const isMeta = e.metaKey || e.ctrlKey;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const next = Math.min(focusedTrackIndex + 1, trackCount - 1);
        const realNext = getRealIndex(next);
        if (e.shiftKey) {
          selectTrackRange(lastClickedRef.current >= 0 ? lastClickedRef.current : 0, realNext);
        } else {
          selectTrack(realNext);
          lastClickedRef.current = realNext;
        }
        setFocusedTrack(next);
        virtualizer.scrollToIndex(next, { align: 'auto' });
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prev = Math.max(focusedTrackIndex - 1, 0);
        const realPrev = getRealIndex(prev);
        if (e.shiftKey) {
          selectTrackRange(lastClickedRef.current >= 0 ? lastClickedRef.current : 0, realPrev);
        } else {
          selectTrack(realPrev);
          lastClickedRef.current = realPrev;
        }
        setFocusedTrack(prev);
        virtualizer.scrollToIndex(prev, { align: 'auto' });
        break;
      }
      case 'Enter': {
        e.preventDefault();
        if (focusedTrackIndex >= 0 && focusedTrackIndex < trackCount) {
          const realIdx = getRealIndex(focusedTrackIndex);
          const track = activePlaylist.tracks[realIdx];
          if (track) loadTrackWithProgress(track, pickFreeDeck(), realIdx);
        }
        break;
      }
      case 'Delete':
      case 'Backspace': {
        if (selectedTrackIndices.length > 0) {
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
        if (isMeta) {
          e.preventDefault();
          selectAllTracks();
        }
        break;
      }
      case 'z': {
        if (isMeta) {
          e.preventDefault();
          if (e.shiftKey) {
            if (canRedo) redo();
          } else {
            if (canUndo) undo();
          }
        }
        break;
      }
      case 'Escape': {
        clearSelection();
        break;
      }
    }
  }, [activePlaylist, activePlaylistId, filteredTracks, focusedTrackIndex, selectedTrackIndices, getRealIndex, selectTrack, selectTrackRange, setFocusedTrack, selectAllTracks, clearSelection, removeSelectedTracks, loadTrackWithProgress, pickFreeDeck, canUndo, canRedo, undo, redo, virtualizer]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div ref={panelRef} className="bg-dark-bgSecondary border border-dark-border rounded-lg p-2 flex flex-col gap-1 max-h-[500px]">
      {/* Header: dropdown + actions */}
      <div className="flex items-center gap-1.5">
        {playlists.length > 0 ? (
          <CustomSelect
            value={activePlaylistId ?? ''}
            onChange={(v) => setActivePlaylist(v)}
            options={playlists.map((pl) => {
              const totalSec = pl.tracks.reduce((s, t) => s + (t.duration || 0), 0);
              const durStr = totalSec > 0
                ? totalSec >= 3600
                  ? `${Math.floor(totalSec / 3600)}h${String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0')}m`
                  : `${Math.floor(totalSec / 60)}m`
                : '';
              return {
                value: pl.id,
                label: `${pl.name} (${pl.tracks.length}${durStr ? ` \u00b7 ${durStr}` : ''})`,
              };
            })}
            className="flex-1 px-2 py-1 text-[10px] font-mono bg-dark-bg border border-dark-borderLight rounded text-text-primary cursor-pointer min-w-0"
          />
        ) : (
          <span className="flex-1 text-[10px] font-mono text-text-muted">No playlists</span>
        )}

        {activePlaylist && !isCreating && (
          <>
            <button onClick={() => fileInputRef.current?.click()} disabled={isLoadingFile}
              className="p-1 text-text-muted hover:text-text-primary transition-colors disabled:opacity-50" title="Add tracks">
              <Plus size={12} />
            </button>
            <button onClick={() => setShowSearch((v) => !v)}
              className={`p-1 transition-colors ${showSearch ? 'text-accent-primary' : 'text-text-muted hover:text-text-primary'}`} title="Search">
              <Search size={11} />
            </button>
            <button onClick={() => { setEditingId(activePlaylist.id); setEditName(activePlaylist.name); }}
              className="p-1 text-text-muted hover:text-text-primary transition-colors" title="Rename">
              <Edit3 size={10} />
            </button>
            <button onClick={() => clonePlaylist(activePlaylist.id)}
              className="p-1 text-text-muted hover:text-text-primary transition-colors" title="Duplicate playlist">
              <Copy size={10} />
            </button>
            <button onClick={handleDeletePlaylist}
              className="p-1 text-text-muted hover:text-accent-error transition-colors" title="Delete">
              <Trash2 size={10} />
            </button>

            {/* Sort dropdown */}
            <div className="relative">
              <button onClick={() => setShowSortMenu(v => !v)}
                className={`p-1 transition-colors ${showSortMenu ? 'text-accent-primary' : 'text-text-muted hover:text-text-primary'}`} title="Sort">
                <ArrowUpDown size={12} />
              </button>
              {showSortMenu && (
                <div className="absolute top-full right-0 mt-1 z-50 bg-dark-bg border border-dark-border rounded shadow-xl min-w-[140px]">
                  <button onClick={() => handleSort('smart')}
                    className="w-full text-left px-3 py-1.5 text-xs font-mono text-accent-primary hover:bg-dark-bgTertiary transition-colors">
                    Smart Mix
                  </button>
                  <div className="border-t border-dark-border/30" />
                  {(['bpm', 'bpm-desc', 'key', 'energy', 'name'] as const).map((mode) => (
                    <button key={mode} onClick={() => handleSort(mode)}
                      className="w-full text-left px-3 py-1.5 text-xs font-mono text-text-secondary hover:bg-dark-bgTertiary transition-colors">
                      {{ bpm: 'BPM (low \u2192 high)', 'bpm-desc': 'BPM (high \u2192 low)', key: 'Key (Camelot)', energy: 'Energy', name: 'Name (A\u2192Z)' }[mode]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Export dropdown */}
            <div className="relative group">
              <button onClick={handleExportJSON}
                className="p-1 text-text-muted hover:text-text-primary transition-colors" title="Export (click=JSON, right-click=M3U)">
                <Download size={10} />
              </button>
              <div className="hidden group-hover:flex absolute top-full right-0 mt-1 z-50 bg-dark-bg border border-dark-border rounded shadow-xl min-w-[100px] flex-col">
                <button onClick={handleExportJSON}
                  className="w-full text-left px-3 py-1.5 text-xs font-mono text-text-secondary hover:bg-dark-bgTertiary transition-colors">
                  Export JSON
                </button>
                <button onClick={handleExportM3U}
                  className="w-full text-left px-3 py-1.5 text-xs font-mono text-text-secondary hover:bg-dark-bgTertiary transition-colors">
                  Export M3U
                </button>
              </div>
            </div>
            <button onClick={() => importInputRef.current?.click()}
              className="p-1 text-text-muted hover:text-text-primary transition-colors" title="Import (M3U/JSON)">
              <Upload size={10} />
            </button>
          </>
        )}

        {!isCreating ? (
          <button onClick={() => setIsCreating(true)}
            title="Create new playlist"
            className="px-2 py-1 text-[10px] font-mono text-text-secondary bg-dark-bgTertiary border border-dark-borderLight rounded hover:bg-dark-bgHover hover:text-text-primary transition-colors">
            New
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setIsCreating(false); }}
              placeholder="Name..."
              className="w-24 px-2 py-0.5 text-[10px] font-mono bg-dark-bg border border-dark-borderLight rounded text-text-primary placeholder:text-text-muted/40" />
            <button onClick={handleCreate} title="Create playlist" className="p-0.5 text-green-400 hover:text-green-300"><Check size={12} /></button>
            <button onClick={() => setIsCreating(false)} title="Cancel" className="p-0.5 text-text-muted hover:text-text-primary"><X size={12} /></button>
          </div>
        )}

        {onClose && (
          <button onClick={onClose} title="Close playlist panel" className="text-text-muted hover:text-text-primary p-1"><X size={12} /></button>
        )}
      </div>

      {/* Inline rename */}
      {editingId && (
        <div className="flex items-center gap-1">
          <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRename(editingId); if (e.key === 'Escape') setEditingId(null); }}
            onBlur={() => handleRename(editingId)}
            className="flex-1 px-2 py-0.5 text-[10px] font-mono bg-dark-bg border border-dark-borderLight rounded text-text-primary" />
          <button onClick={() => handleRename(editingId)} title="Save new name" className="p-0.5 text-green-400 hover:text-green-300"><Check size={12} /></button>
          <button onClick={() => setEditingId(null)} title="Cancel rename" className="p-0.5 text-text-muted hover:text-text-primary"><X size={12} /></button>
        </div>
      )}

      {/* Search bar */}
      {showSearch && activePlaylist && (
        <div className="flex items-center gap-1.5 px-1">
          <Search size={10} className="text-text-muted/40 shrink-0" />
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setSearchQuery(''); setShowSearch(false); } }}
            placeholder="Filter tracks..."
            className="flex-1 px-2 py-0.5 text-[10px] font-mono bg-dark-bg border border-dark-borderLight rounded text-text-primary placeholder:text-text-muted/30"
          />
          {isFiltered && (
            <span className="text-[9px] font-mono text-text-muted/50 shrink-0">
              {filteredTracks.length} of {activePlaylist.tracks.length}
            </span>
          )}
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} title="Clear search" className="p-0.5 text-text-muted hover:text-text-primary"><X size={10} /></button>
          )}
        </div>
      )}

      {/* Selection info bar */}
      {selectedTrackIndices.length > 1 && activePlaylist && (
        <div className="flex items-center gap-2 px-2 py-0.5 text-[9px] font-mono text-accent-primary/70">
          <span>{selectedTrackIndices.length} selected</span>
          <button onClick={clearSelection} title="Clear selection" className="text-text-muted hover:text-text-primary">clear</button>
          {canUndo && <button onClick={undo} title="Undo last action" className="text-text-muted hover:text-text-primary">undo</button>}
          {canRedo && <button onClick={redo} title="Redo last undone action" className="text-text-muted hover:text-text-primary">redo</button>}
        </div>
      )}

      <input ref={fileInputRef} type="file" multiple accept="*/*" onChange={handleAddFiles} className="hidden" />
      <input ref={importInputRef} type="file" accept=".m3u,.m3u8,.json" onChange={handleImport} className="hidden" />

      {/* Cache status & actions */}
      {activePlaylist && (modlandCount > 0 || badTrackCount > 0) && (
        <div className="px-2 py-1.5 border-b border-dark-border">
          {precacheProgress ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-amber-400">{precacheProgress.current}/{precacheProgress.total}</span>
                <span className="text-green-400 ml-1">{precacheProgress.cached + precacheProgress.skipped} cached</span>
                {precacheProgress.failed > 0 && <span className="text-red-400 ml-1">{precacheProgress.failed} fail</span>}
                <span className="text-text-tertiary truncate ml-2 flex-1 text-right">{precacheProgress.trackName}</span>
              </div>
              <div className="h-1 bg-dark-bgTertiary rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 transition-all duration-300"
                  style={{ width: `${(precacheProgress.current / precacheProgress.total) * 100}%` }} />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[10px]">
              {modlandCount > 0 && (
                <>
                  <span className="text-green-400">{cachedCount}/{modlandCount} cached</span>
                  {uncachedCount === 0 && <span className="text-green-500/80">Offline ready</span>}
                  {uncachedCount > 0 && (
                    <button onClick={handlePrecache}
                      title="Download and cache all uncached tracks for offline playback"
                      className="flex items-center gap-1 px-2 py-0.5 rounded border border-amber-700 bg-amber-900/20 text-amber-400 hover:bg-amber-900/40 transition-all">
                      Cache ({uncachedCount})
                    </button>
                  )}
                </>
              )}
              {badTrackCount > 0 && (
                <button onClick={handleRetestBadTracks}
                  disabled={retestingBad}
                  title="Re-test all tracks marked as bad (clears bad flag and attempts reload)"
                  className="flex items-center gap-1 px-2 py-0.5 rounded border border-red-700 bg-red-900/20 text-red-400 hover:bg-red-900/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed ml-auto">
                  {retestingBad ? 'Testing...' : `Re-test Bad (${badTrackCount})`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Track list */}
      {activePlaylist ? (
        filteredTracks.length === 0 ? (
          <div className="flex items-center justify-center py-4 text-text-muted">
            <p className="text-[10px] font-mono">
              {isFiltered ? 'No tracks match your search' : 'Drop files or click + to add tracks'}
            </p>
          </div>
        ) : (
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto min-h-0"
            style={{ maxHeight: 360 }}
            onContextMenuCapture={handleContextMenu}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDropOnPlaylist}
            tabIndex={0}
            onKeyDown={handleKeyDown}
          >
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                  {virtualizer.getVirtualItems().map((virtualRow) => {
                    const track = filteredTracks[virtualRow.index];
                    const realIndex = getRealIndex(virtualRow.index);
                    return (
                      <div
                        key={track.id}
                        data-track-index={virtualRow.index}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: virtualRow.size,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <SortableTrackRow
                          track={track}
                          index={virtualRow.index}
                          isSelected={selectedSet.has(realIndex)}
                          isFocused={focusedTrackIndex === virtualRow.index}
                          isLoading={loadingTrackIndex === realIndex}
                          loadingDeckId={loadingDeckId}
                          isAutoDJCurrent={autoDJEnabled && realIndex === autoDJCurrentIdx}
                          isAutoDJNext={autoDJEnabled && realIndex === autoDJNextIdx}
                          thirdDeckActive={thirdDeckActive}
                          onLoadToDeck={(t, d, _i) => loadTrackWithProgress(t, d, realIndex)}
                          onRemove={(i) => removeTrack(activePlaylist.id, getRealIndex(i))}
                          onClick={handleTrackClick}
                          onDoubleClick={handleTrackDoubleClick}
                        />
                      </div>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )
      ) : (
        <div className="flex-1 flex items-center justify-center py-4 text-text-muted">
          <p className="text-[10px] font-mono">Create a playlist to get started</p>
        </div>
      )}

      {/* Context menu */}
      <ContextMenu items={contextMenuItems} position={contextMenu.position} onClose={contextMenu.close} />

      {/* Track edit modal */}
      {editTrack && activePlaylistId && (
        <DJTrackEditModal
          isOpen={!!editTrack}
          onClose={() => setEditTrack(null)}
          playlistId={activePlaylistId}
          trackIndex={editTrack.index}
          track={editTrack.track}
        />
      )}
    </div>
  );
};
