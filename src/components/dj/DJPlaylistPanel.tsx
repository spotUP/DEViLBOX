/**
 * DJPlaylistPanel - Playlist browser for the DJ view.
 *
 * Two-pane layout matching the Modland browser style:
 *   Top: playlist selector dropdown + search filter + sort controls
 *   Bottom: scrollable track list with deck load buttons (1/2/3)
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  ListMusic,
  Plus,
  Trash2,
  Search,
  X,
  Music,
  Loader2,
} from 'lucide-react';
import {
  useDJPlaylistStore,
  type PlaylistTrack,
  type PlaylistSortField,
  type PlaylistSortOrder,
  loadBundledPlaylists,
} from '@/stores/useDJPlaylistStore';
import { useDJStore, useThirdDeckActive } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { detectBPM, estimateSongDuration } from '@/engine/dj/DJBeatDetector';
import { cacheSong } from '@/engine/dj/DJSongCache';
import { getDJPipeline } from '@/engine/dj/DJPipeline';
import { isAudioFile } from '@/lib/audioFileUtils';

// ── Component ────────────────────────────────────────────────────────────────

interface DJPlaylistPanelProps {
  onClose?: () => void;
}

export const DJPlaylistPanel: React.FC<DJPlaylistPanelProps> = ({ onClose }) => {
  useEffect(() => { loadBundledPlaylists(); }, []);

  const playlists = useDJPlaylistStore((s) => s.playlists);
  const activePlaylistId = useDJPlaylistStore((s) => s.activePlaylistId);
  const createPlaylist = useDJPlaylistStore((s) => s.createPlaylist);
  const deletePlaylist = useDJPlaylistStore((s) => s.deletePlaylist);
  const setActivePlaylist = useDJPlaylistStore((s) => s.setActivePlaylist);
  const addTrack = useDJPlaylistStore((s) => s.addTrack);
  const removeTrack = useDJPlaylistStore((s) => s.removeTrack);
  const sortPlaylist = useDJPlaylistStore((s) => s.sortPlaylist);
  const thirdDeckActive = useThirdDeckActive();

  const [filter, setFilter] = useState('');
  const [sortFields, setSortFields] = useState<PlaylistSortField[]>([]);
  const [sortOrder, setSortOrder] = useState<PlaylistSortOrder>('asc');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [loadingTracks, setLoadingTracks] = useState<Set<number>>(new Set());

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? null;

  // Filter tracks by search query
  const filteredTracks = useMemo(() => {
    if (!activePlaylist) return [];
    if (!filter.trim()) return activePlaylist.tracks;
    const q = filter.toLowerCase();
    return activePlaylist.tracks.filter(t =>
      t.trackName.toLowerCase().includes(q) ||
      t.fileName.toLowerCase().includes(q) ||
      t.format.toLowerCase().includes(q)
    );
  }, [activePlaylist, filter]);

  // ── Load track to deck ──────────────────────────────────────────────────

  const loadToDeck = useCallback(
    async (track: PlaylistTrack, trackIndex: number, deckId: 'A' | 'B' | 'C') => {
      setLoadingTracks(prev => new Set(prev).add(trackIndex));
      try {
        const engine = getDJEngine();

        // Tracks with sourceUrl: download from remote
        if (track.sourceUrl) {
          const { downloadModlandFile } = await import('@/lib/modlandApi');
          const buffer = await downloadModlandFile(track.sourceUrl.replace('http://ftp.modland.com/', 'pub/'));
          const filename = track.sourceUrl.split('/').pop() || track.fileName;

          if (isAudioFile(filename)) {
            await engine.loadAudioToDeck(deckId, buffer, track.fileName);
          } else {
            const blob = new File([buffer], filename, { type: 'application/octet-stream' });
            const song = await parseModuleToSong(blob);
            cacheSong(track.fileName, song);
            const bpmResult = detectBPM(song);
            useDJStore.getState().setDeckState(deckId, {
              fileName: track.fileName,
              trackName: song.name || track.trackName,
              detectedBPM: bpmResult.bpm,
              effectiveBPM: bpmResult.bpm,
              analysisState: 'rendering',
              isPlaying: false,
            });
            const result = await getDJPipeline().loadOrEnqueue(buffer, filename, deckId, 'high');
            await engine.loadAudioToDeck(deckId, result.wavData, filename, song.name || track.trackName, result.analysis?.bpm || bpmResult.bpm, song);
          }
          useDJStore.getState().setDeckViewMode('visualizer');
          return;
        }

        // Modland-cached tracks
        if (track.fileName.startsWith('modland:')) {
          const modlandPath = track.fileName.slice('modland:'.length);
          const { downloadModlandFile } = await import('@/lib/modlandApi');
          const buffer = await downloadModlandFile(modlandPath);
          const filename = modlandPath.split('/').pop() || 'download.mod';
          if (isAudioFile(filename)) {
            await engine.loadAudioToDeck(deckId, buffer, track.fileName);
          } else {
            const blob = new File([buffer], filename, { type: 'application/octet-stream' });
            const song = await parseModuleToSong(blob);
            cacheSong(track.fileName, song);
            const bpmResult = detectBPM(song);
            useDJStore.getState().setDeckState(deckId, {
              fileName: track.fileName,
              trackName: song.name || track.trackName,
              detectedBPM: bpmResult.bpm,
              effectiveBPM: bpmResult.bpm,
              analysisState: 'rendering',
              isPlaying: false,
            });
            const result = await getDJPipeline().loadOrEnqueue(buffer, filename, deckId, 'high');
            await engine.loadAudioToDeck(deckId, result.wavData, filename, song.name || track.trackName, result.analysis?.bpm || bpmResult.bpm, song);
          }
          useDJStore.getState().setDeckViewMode('visualizer');
          return;
        }

        // Local file: prompt user
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '*/*';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          const rawBuffer = await file.arrayBuffer();
          if (isAudioFile(file.name)) {
            await engine.loadAudioToDeck(deckId, rawBuffer, file.name);
          } else {
            const song = await parseModuleToSong(file);
            cacheSong(file.name, song);
            const bpmResult = detectBPM(song);
            useDJStore.getState().setDeckState(deckId, {
              fileName: file.name,
              trackName: song.name || file.name,
              detectedBPM: bpmResult.bpm,
              effectiveBPM: bpmResult.bpm,
              analysisState: 'rendering',
              isPlaying: false,
            });
            const result = await getDJPipeline().loadOrEnqueue(rawBuffer, file.name, deckId, 'high');
            await engine.loadAudioToDeck(deckId, result.wavData, file.name, song.name || file.name, result.analysis?.bpm || bpmResult.bpm, song);
          }
          useDJStore.getState().setDeckViewMode('visualizer');
        };
        input.click();
      } catch (err) {
        console.error(`[DJPlaylist] Failed to load track:`, err);
      } finally {
        setLoadingTracks(prev => { const n = new Set(prev); n.delete(trackIndex); return n; });
      }
    },
    [],
  );

  // ── Add files ───────────────────────────────────────────────────────────

  const handleAddFiles = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!activePlaylistId || !e.target.files) return;
      for (const file of Array.from(e.target.files)) {
        try {
          const fileExt = file.name.split('.').pop()?.toUpperCase() ?? 'MOD';
          if (isAudioFile(file.name)) {
            addTrack(activePlaylistId, { fileName: file.name, trackName: file.name.replace(/\.[^.]+$/, ''), format: fileExt, bpm: 0, duration: 0, addedAt: Date.now() });
          } else {
            const song = await parseModuleToSong(file);
            cacheSong(file.name, song);
            const bpmResult = detectBPM(song);
            addTrack(activePlaylistId, { fileName: file.name, trackName: song.name || file.name, format: fileExt, bpm: bpmResult.bpm, duration: estimateSongDuration(song), addedAt: Date.now() });
          }
        } catch { /* skip */ }
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [activePlaylistId, addTrack],
  );

  // ── Keyboard navigation ─────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredTracks.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && selectedIndex >= 0 && selectedIndex < filteredTracks.length) {
        e.preventDefault();
        loadToDeck(filteredTracks[selectedIndex], selectedIndex, e.shiftKey ? 'B' : 'A');
      } else if ((e.key === '1' || e.key === '2' || e.key === '3') && selectedIndex >= 0) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'SELECT') return;
        e.preventDefault();
        const deckMap = { '1': 'A', '2': 'B', '3': 'C' } as const;
        const deckId = deckMap[e.key as '1' | '2' | '3'];
        if (deckId === 'C' && !thirdDeckActive) useDJStore.getState().setThirdDeckActive(true);
        loadToDeck(filteredTracks[selectedIndex], selectedIndex, deckId);
      }
    },
    [filteredTracks, selectedIndex, thirdDeckActive, loadToDeck],
  );

  // ── Sort handler ────────────────────────────────────────────────────────
  // Click a field to add it to the sort chain. Click again to toggle order.
  // Click an active field a third time to remove it from the chain.

  const handleSort = useCallback((field: PlaylistSortField) => {
    setSortFields(prev => {
      const idx = prev.indexOf(field);
      let next: PlaylistSortField[];
      let order = sortOrder;

      if (idx === -1) {
        // Field not active — add it to the chain
        next = [...prev, field];
      } else if (idx === prev.length - 1) {
        // Last field clicked again — toggle order
        order = sortOrder === 'asc' ? 'desc' : 'asc';
        setSortOrder(order);
        next = prev;
      } else {
        // Already in chain but not last — move to end
        next = [...prev.filter(f => f !== field), field];
      }

      if (activePlaylistId && next.length > 0) {
        sortPlaylist(activePlaylistId, next, order);
      }
      return next;
    });
  }, [sortOrder, activePlaylistId, sortPlaylist]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div
      className="bg-dark-bgSecondary border border-dark-border rounded-lg p-3 flex flex-col gap-2 max-h-[400px] relative z-[99990]"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListMusic size={14} className="text-accent-primary" />
          <h3 className="text-text-primary text-sm font-mono font-bold tracking-wider uppercase">
            Playlists
          </h3>
          <span className="text-[10px] font-mono text-text-muted">
            {playlists.length} lists
          </span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Playlist selector + search + sort */}
      <div className="flex-shrink-0 flex gap-2">
        <select
          value={activePlaylistId ?? ''}
          onChange={(e) => { setActivePlaylist(e.target.value || null); setSelectedIndex(-1); setFilter(''); }}
          className="w-48 px-2 py-1.5 text-xs font-mono bg-dark-bg border border-dark-borderLight rounded
                     text-text-primary focus:border-accent-primary focus:outline-none transition-colors"
        >
          <option value="">Select playlist...</option>
          {playlists.map(pl => (
            <option key={pl.id} value={pl.id}>
              {pl.name} ({pl.tracks.length})
            </option>
          ))}
        </select>

        <div className="flex-1 relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            ref={inputRef}
            value={filter}
            onChange={(e) => { setFilter(e.target.value); setSelectedIndex(-1); }}
            placeholder="Filter tracks..."
            className="w-full pl-7 pr-2 py-1.5 text-xs font-mono bg-dark-bg border border-dark-borderLight
                       rounded text-text-primary placeholder:text-text-muted/40
                       focus:border-accent-primary focus:outline-none transition-colors"
          />
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-2 py-1 text-[10px] font-mono text-text-secondary bg-dark-bgTertiary border
                     border-dark-borderLight rounded hover:bg-dark-bgHover hover:text-text-primary
                     transition-colors shrink-0"
          title="Add files to active playlist"
        >
          <Plus size={12} />
        </button>
        <input ref={fileInputRef} type="file" multiple accept="*/*" onChange={handleAddFiles} className="hidden" />

        <button
          onClick={() => { const name = prompt('Playlist name:'); if (name?.trim()) createPlaylist(name.trim()); }}
          className="px-2 py-1 text-[10px] font-mono text-text-secondary bg-dark-bgTertiary border
                     border-dark-borderLight rounded hover:bg-dark-bgHover hover:text-text-primary
                     transition-colors shrink-0"
          title="New playlist"
        >
          New
        </button>

        {activePlaylistId && (
          <button
            onClick={() => { if (confirm('Delete this playlist?')) deletePlaylist(activePlaylistId); }}
            className="px-1 py-1 text-text-muted hover:text-red-400 transition-colors shrink-0"
            title="Delete playlist"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {/* Sort row */}
      {activePlaylist && activePlaylist.tracks.length > 1 && (
        <div className="flex-shrink-0 flex items-center gap-1 px-1">
          <span className="text-[9px] text-text-muted mr-1">Sort:</span>
          {([
            ['trackName', 'Name'],
            ['bpm', 'BPM'],
            ['key', 'Key'],
            ['duration', 'Dur'],
            ['format', 'Fmt'],
          ] as const).map(([field, label]) => {
            const sortIdx = sortFields.indexOf(field);
            const isActive = sortIdx !== -1;
            const isLast = sortIdx === sortFields.length - 1;
            return (
              <button
                key={field}
                onClick={() => handleSort(field)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  // Right-click removes from sort chain
                  if (isActive) {
                    const next = sortFields.filter(f => f !== field);
                    setSortFields(next);
                    if (activePlaylistId && next.length > 0) sortPlaylist(activePlaylistId, next, sortOrder);
                  }
                }}
                className={`px-1.5 py-0.5 text-[9px] font-mono rounded transition-colors ${
                  isActive
                    ? 'bg-accent-primary/20 text-accent-primary'
                    : 'text-text-muted hover:text-text-primary hover:bg-dark-bgHover'
                }`}
                title={isActive ? `Sort priority ${sortIdx + 1}. Right-click to remove.` : `Click to sort by ${label}`}
              >
                {label}
                {isActive && sortFields.length > 1 && <sup className="ml-0.5 text-[7px]">{sortIdx + 1}</sup>}
                {isActive && isLast ? (sortOrder === 'asc' ? ' \u2191' : ' \u2193') : ''}
              </button>
            );
          })}
          <span className="flex-1" />
          <span className="text-[9px] font-mono text-text-muted/40">
            {filteredTracks.length}{filter ? `/${activePlaylist.tracks.length}` : ''} tracks
          </span>
        </div>
      )}

      {/* Track list — matches Modland browser row style */}
      <div ref={listRef} className="flex-1 overflow-y-auto min-h-0">
        {!activePlaylist ? (
          <div className="flex flex-col items-center justify-center py-8 text-text-muted">
            <ListMusic size={24} className="mb-2 opacity-40" />
            <p className="text-xs font-mono">Select a playlist</p>
          </div>
        ) : filteredTracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-text-muted">
            <Music size={24} className="mb-2 opacity-40" />
            <p className="text-xs font-mono">{filter ? 'No matches' : 'Empty playlist'}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {filteredTracks.map((track, idx) => (
              <div
                key={`${track.fileName}-${idx}`}
                onClick={() => setSelectedIndex(idx)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded border transition-colors group cursor-pointer ${
                  idx === selectedIndex
                    ? 'bg-accent-primary/10 border-accent-primary/30'
                    : 'bg-dark-bg border-dark-borderLight hover:border-dark-border'
                }`}
              >
                {/* Track info */}
                <div className="flex-1 min-w-0">
                  <div className="text-text-primary text-xs font-mono truncate">
                    {track.trackName}
                  </div>
                  <div className="flex gap-3 text-[10px] text-text-muted font-mono">
                    <span>{track.format}</span>
                    {track.bpm > 0 && <span>{track.bpm} BPM</span>}
                    {track.key && <span>{track.key}</span>}
                  </div>
                </div>

                {/* Actions */}
                {loadingTracks.has(idx) ? (
                  <Loader2 size={12} className="animate-spin text-accent-primary" />
                ) : (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); loadToDeck(track, idx, 'A'); }}
                      className="px-2 py-1 text-[10px] font-mono font-bold rounded
                                 bg-blue-900/30 text-blue-400 border border-blue-800/50
                                 hover:bg-blue-800/40 hover:text-blue-300 transition-colors
                                 opacity-0 group-hover:opacity-100"
                    >
                      1
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); loadToDeck(track, idx, 'B'); }}
                      className="px-2 py-1 text-[10px] font-mono font-bold rounded
                                 bg-red-900/30 text-red-400 border border-red-800/50
                                 hover:bg-red-800/40 hover:text-red-300 transition-colors
                                 opacity-0 group-hover:opacity-100"
                    >
                      2
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!thirdDeckActive) useDJStore.getState().setThirdDeckActive(true);
                        loadToDeck(track, idx, 'C');
                      }}
                      className={`px-2 py-1 text-[10px] font-mono font-bold rounded
                                 bg-emerald-900/30 text-emerald-400 border border-emerald-800/50
                                 hover:bg-emerald-800/40 hover:text-emerald-300 transition-colors
                                 opacity-0 group-hover:opacity-100 ${!thirdDeckActive ? 'opacity-0 group-hover:opacity-50' : ''}`}
                    >
                      3
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (activePlaylistId) {
                          const realIdx = activePlaylist!.tracks.indexOf(track);
                          if (realIdx >= 0) removeTrack(activePlaylistId, realIdx);
                        }
                      }}
                      className="p-1 text-text-muted hover:text-red-400 transition-colors
                                 opacity-0 group-hover:opacity-100"
                    >
                      <X size={10} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Keyboard hints */}
      {filteredTracks.length > 0 && (
        <div className="text-[9px] font-mono text-text-muted/50 flex gap-3 px-1">
          <span>↑↓ navigate</span>
          <span>⏎ deck 1</span>
          <span>⇧⏎ deck 2</span>
          <span>1/2/3 load deck</span>
        </div>
      )}
    </div>
  );
};
