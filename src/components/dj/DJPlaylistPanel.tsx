/**
 * DJPlaylistPanel - Playlist manager for the DJ view.
 *
 * Create, rename, delete playlists. Add tracks from loaded files.
 * Click a track to load it to a deck. Reorder via drag handles.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  GripVertical,
  ArrowUpDown,
} from 'lucide-react';
import {
  useDJPlaylistStore,
  type PlaylistTrack,
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Component ────────────────────────────────────────────────────────────────

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
  const removeTrack = useDJPlaylistStore((s) => s.removeTrack);
  const reorderTrack = useDJPlaylistStore((s) => s.reorderTrack);
  const sortTracksAction = useDJPlaylistStore((s) => s.sortTracks);

  const autoDJEnabled = useDJStore((s) => s.autoDJEnabled);
  const autoDJCurrentIdx = useDJStore((s) => s.autoDJCurrentTrackIndex);
  const autoDJNextIdx = useDJStore((s) => s.autoDJNextTrackIndex);

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [loadingTrackIndex, setLoadingTrackIndex] = useState<number | null>(null);
  const [loadingDeckId, setLoadingDeckId] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Click-outside to close
  useEffect(() => {
    if (!onClose) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [onClose]);

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? null;

  // ── Pre-cache for offline ───────────────────────────────────────────────

  const [precacheProgress, setPrecacheProgress] = useState<PrecacheProgress | null>(null);
  const precachingRef = useRef(false);
  const [cachedCount, setCachedCount] = useState(0);

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
            const track: PlaylistTrack = {
              fileName: file.name,
              trackName: file.name.replace(/\.[^.]+$/, ''),
              format: fileExt,
              bpm: 0,
              duration: 0,
              addedAt: Date.now(),
            };
            addTrack(activePlaylistId, track);
          } else {
            const song = await parseModuleToSong(file);
            cacheSong(file.name, song);
            const bpmResult = detectBPM(song);
            const duration = estimateSongDuration(song);

            const track: PlaylistTrack = {
              fileName: file.name,
              trackName: song.name || file.name,
              format: fileExt,
              bpm: bpmResult.bpm,
              duration,
              addedAt: Date.now(),
            };

            addTrack(activePlaylistId, track);
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

  // ── Load track to deck (uses song cache, falls back to file picker) ─────

  /** Pick the deck that isn't currently playing (fallback: A) */
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

      // We MUST have the raw buffer to render
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
      } else {
        console.warn(`[DJPlaylistPanel] Cannot load ${fileName}: missing raw buffer for rendering`);
      }
    },
    [],
  );

  const loadTrackToDeck = useCallback(
    async (track: PlaylistTrack, deckId: 'A' | 'B' | 'C') => {
      const engine = getDJEngine();

      // Modland tracks: auto re-download from server to get the raw buffer
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

      // Prompt user to select the file to get the raw buffer
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
            // loadSongToDeck already sets 'visualizer'
          }
        } catch (err) {
          console.error(`[DJPlaylistPanel] Failed to load track:`, err);
        }
      };
      input.click();
    },
    [loadSongToDeck],
  );

  /** Wrapper that shows inline loading state on the track row */
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

  // ── Drag reorder ─────────────────────────────────────────────────────────

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (dragIndex === null || dragIndex === index || !activePlaylistId) return;
      reorderTrack(activePlaylistId, dragIndex, index);
      setDragIndex(index);
    },
    [dragIndex, activePlaylistId, reorderTrack],
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
  }, []);

  // ── Drop files from file browser onto playlist ───────────────────────────

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

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div ref={panelRef} className="bg-dark-bgSecondary border border-dark-border rounded-lg p-2 flex flex-col gap-1 max-h-[400px]">
      {/* Header: dropdown + actions in one row */}
      <div className="flex items-center gap-1.5">
        {playlists.length > 0 ? (
          <select
            value={activePlaylistId ?? ''}
            onChange={(e) => setActivePlaylist(e.target.value)}
            className="flex-1 px-2 py-1 text-[10px] font-mono bg-dark-bg border border-dark-borderLight
                       rounded text-text-primary cursor-pointer min-w-0"
          >
            {playlists.map((pl) => (
              <option key={pl.id} value={pl.id}>
                {pl.name} ({pl.tracks.length})
              </option>
            ))}
          </select>
        ) : (
          <span className="flex-1 text-[10px] font-mono text-text-muted">No playlists</span>
        )}

        {activePlaylist && !isCreating && (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoadingFile}
              className="p-1 text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
              title={isLoadingFile ? 'Loading...' : 'Add tracks'}
            >
              <Plus size={12} />
            </button>
            <button
              onClick={() => { setEditingId(activePlaylist.id); setEditName(activePlaylist.name); }}
              className="p-1 text-text-muted hover:text-text-primary transition-colors"
              title="Rename playlist"
            >
              <Edit3 size={10} />
            </button>
            <button
              onClick={() => deletePlaylist(activePlaylist.id)}
              className="p-1 text-text-muted hover:text-accent-error transition-colors"
              title="Delete playlist"
            >
              <Trash2 size={10} />
            </button>
            {/* Sort dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowSortMenu(v => !v)}
                className={`p-1 transition-colors ${showSortMenu ? 'text-accent-primary' : 'text-text-muted hover:text-text-primary'}`}
                title="Sort playlist"
              >
                <ArrowUpDown size={12} />
              </button>
              {showSortMenu && (
                <div className="absolute top-full right-0 mt-1 z-50 bg-dark-bg border border-dark-border rounded shadow-xl min-w-[140px]">
                  <button onClick={() => handleSort('smart')}
                    className="w-full text-left px-3 py-1.5 text-xs font-mono text-accent-primary hover:bg-dark-bgTertiary transition-colors"
                    title="AI-optimized order: BPM flow + harmonic keys + energy arc"
                  >
                    Smart Mix
                  </button>
                  <div className="border-t border-dark-border/30" />
                  <button onClick={() => handleSort('bpm')}
                    className="w-full text-left px-3 py-1.5 text-xs font-mono text-text-secondary hover:bg-dark-bgTertiary transition-colors">
                    BPM (low → high)
                  </button>
                  <button onClick={() => handleSort('bpm-desc')}
                    className="w-full text-left px-3 py-1.5 text-xs font-mono text-text-secondary hover:bg-dark-bgTertiary transition-colors">
                    BPM (high → low)
                  </button>
                  <button onClick={() => handleSort('key')}
                    className="w-full text-left px-3 py-1.5 text-xs font-mono text-text-secondary hover:bg-dark-bgTertiary transition-colors">
                    Key (Camelot)
                  </button>
                  <button onClick={() => handleSort('energy')}
                    className="w-full text-left px-3 py-1.5 text-xs font-mono text-text-secondary hover:bg-dark-bgTertiary transition-colors">
                    Energy
                  </button>
                  <button onClick={() => handleSort('name')}
                    className="w-full text-left px-3 py-1.5 text-xs font-mono text-text-secondary hover:bg-dark-bgTertiary transition-colors">
                    Name (A→Z)
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {!isCreating ? (
          <button
            onClick={() => setIsCreating(true)}
            className="px-2 py-1 text-[10px] font-mono text-text-secondary
                       bg-dark-bgTertiary border border-dark-borderLight rounded
                       hover:bg-dark-bgHover hover:text-text-primary transition-colors"
          >
            New
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') setIsCreating(false);
              }}
              placeholder="Name..."
              className="w-24 px-2 py-0.5 text-[10px] font-mono bg-dark-bg border border-dark-borderLight
                         rounded text-text-primary placeholder:text-text-muted/40"
            />
            <button onClick={handleCreate} className="p-0.5 text-green-400 hover:text-green-300">
              <Check size={12} />
            </button>
            <button onClick={() => setIsCreating(false)} className="p-0.5 text-text-muted hover:text-text-primary">
              <X size={12} />
            </button>
          </div>
        )}

        {onClose && (
          <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1">
            <X size={12} />
          </button>
        )}
      </div>

      {/* Inline rename */}
      {editingId && (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename(editingId);
              if (e.key === 'Escape') setEditingId(null);
            }}
            onBlur={() => handleRename(editingId)}
            className="flex-1 px-2 py-0.5 text-[10px] font-mono bg-dark-bg border border-dark-borderLight
                       rounded text-text-primary"
          />
          <button onClick={() => handleRename(editingId)} className="p-0.5 text-green-400 hover:text-green-300">
            <Check size={12} />
          </button>
          <button onClick={() => setEditingId(null)} className="p-0.5 text-text-muted hover:text-text-primary">
            <X size={12} />
          </button>
        </div>
      )}

      <input ref={fileInputRef} type="file" multiple accept="*/*" onChange={handleAddFiles} className="hidden" />

      {/* Cache status + pre-cache button */}
      {activePlaylist && modlandCount > 0 && (
        <div className="px-2 py-1.5 border-b border-white/[0.04]">
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
              <span className="text-green-400">{cachedCount}/{modlandCount} cached</span>
              {uncachedCount === 0 && <span className="text-green-500/80 ml-auto">Offline ready</span>}
              {uncachedCount > 0 && (
                <button
                  onClick={handlePrecache}
                  className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded border border-amber-700 bg-amber-900/20 text-amber-400 hover:bg-amber-900/40 transition-all"
                >
                  Cache ({uncachedCount})
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Track list */}
      {activePlaylist ? (
        <div
          className="flex-1 overflow-y-auto min-h-0"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDropOnPlaylist}
        >
          {activePlaylist.tracks.length === 0 ? (
            <div className="flex items-center justify-center py-4 text-text-muted">
              <p className="text-[10px] font-mono">Drop files or click + to add tracks</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {activePlaylist.tracks.map((track, i) => (
                <div
                  key={`${track.fileName}-${i}`}
                  draggable
                  onDragStart={() => handleDragStart(i)}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDragEnd={handleDragEnd}
                  onDoubleClick={() => loadTrackWithProgress(track, pickFreeDeck(), i)}
                  className={`flex items-center gap-1.5 px-1.5 py-1 border-b border-white/[0.04] transition-colors group cursor-pointer ${
                    loadingTrackIndex === i
                      ? 'bg-cyan-900/20'
                      : dragIndex === i
                        ? 'bg-accent-primary/10'
                        : autoDJEnabled && i === autoDJCurrentIdx
                          ? 'bg-green-900/20'
                          : autoDJEnabled && i === autoDJNextIdx
                            ? 'bg-blue-900/15'
                            : 'hover:bg-white/[0.08]'
                  }`}
                >
                  <GripVertical
                    size={8}
                    className="text-text-muted/20 group-hover:text-text-muted/50 shrink-0 cursor-grab"
                  />
                  <span className="text-xs font-mono text-text-muted/30 w-4 text-right shrink-0">
                    {i + 1}
                  </span>
                  {loadingTrackIndex === i ? (
                    <span className="text-cyan-400 text-[9px] shrink-0 animate-pulse" title={`Loading to deck ${loadingDeckId}`}>
                      {loadingDeckId}
                    </span>
                  ) : track.played ? (
                    <span className="text-green-500/50 text-[9px] shrink-0" title="Played">P</span>
                  ) : null}
                  <span className={`flex-1 text-sm font-mono truncate min-w-0 ${
                    loadingTrackIndex === i ? 'text-cyan-400' : track.played ? 'text-text-muted/40' : 'text-text-secondary'
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
                  <button
                    onClick={() => loadTrackWithProgress(track, 'A', i)}
                    className="px-1 text-xs font-mono font-bold text-blue-400/70 hover:text-blue-300
                               opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Deck 1"
                  >
                    1
                  </button>
                  <button
                    onClick={() => loadTrackWithProgress(track, 'B', i)}
                    className="px-1 text-xs font-mono font-bold text-red-400/70 hover:text-red-300
                               opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Deck 2"
                  >
                    2
                  </button>
                  {useDJStore.getState().thirdDeckActive && (
                    <button
                      onClick={() => loadTrackWithProgress(track, 'C', i)}
                      className="px-1 text-xs font-mono font-bold text-emerald-400/70 hover:text-emerald-300
                                 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Deck 3"
                    >
                      3
                    </button>
                  )}
                  <button
                    onClick={() => removeTrack(activePlaylist.id, i)}
                    className="p-0.5 text-text-muted/30 hover:text-accent-error transition-colors
                               opacity-0 group-hover:opacity-100"
                  >
                    <X size={8} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center py-4 text-text-muted">
          <p className="text-[10px] font-mono">Create a playlist to get started</p>
        </div>
      )}
    </div>
  );
};
