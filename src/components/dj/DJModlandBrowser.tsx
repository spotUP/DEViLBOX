/**
 * DJModlandBrowser - Browse and load tracker modules from ftp.modland.com
 *
 * Search 150K+ playable modules by title, author, or format.
 * Downloads are proxied through the DEViLBOX server (CORS + caching).
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Globe, Search, Loader2, X, ListPlus, AlertCircle } from 'lucide-react';
import {
  searchModland,
  getModlandFormats,
  downloadModlandFile,
  getModlandStatus,
  type ModlandFile,
  type ModlandFormat,
  type ModlandStatus,
} from '@/lib/modlandApi';
import { useDJStore, useThirdDeckActive } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { detectBPM, estimateSongDuration } from '@/engine/dj/DJBeatDetector';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { cacheSong } from '@/engine/dj/DJSongCache';
import { getDJPipeline } from '@/engine/dj/DJPipeline';
import { useDJPlaylistStore } from '@/stores/useDJPlaylistStore';

// ── Component ────────────────────────────────────────────────────────────────

interface DJModlandBrowserProps {
  onClose?: () => void;
}

export const DJModlandBrowser: React.FC<DJModlandBrowserProps> = ({ onClose }) => {
  const [query, setQuery] = useState('');
  const [format, setFormat] = useState('');
  const [results, setResults] = useState<ModlandFile[]>([]);
  const [formats, setFormats] = useState<ModlandFormat[]>([]);
  const [status, setStatus] = useState<ModlandStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [downloadingPaths, setDownloadingPaths] = useState<Set<string>>(new Set());
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const thirdDeckActive = useThirdDeckActive();
  const LIMIT = 50;

  // ── Init: fetch status + formats ────────────────────────────────────────

  useEffect(() => {
    getModlandStatus().then(setStatus).catch(() => {});
    getModlandFormats().then(setFormats).catch(() => {});
    // Auto-focus search input
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // ── Debounced search ────────────────────────────────────────────────────

  const doSearch = useCallback(
    async (q: string, fmt: string, newOffset: number, append: boolean) => {
      if (!q && !fmt) {
        if (!append) setResults([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const data = await searchModland({
          q: q || undefined,
          format: fmt || undefined,
          limit: LIMIT,
          offset: newOffset,
        });

        if (append) {
          setResults((prev) => [...prev, ...data.results]);
        } else {
          setResults(data.results);
        }
        setHasMore(data.results.length === LIMIT);
        setOffset(newOffset);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Trigger search on query/format change (debounced)
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      doSearch(query, format, 0, false);
      setSelectedIndex(0);
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [query, format, doSearch]);

  const loadMore = useCallback(() => {
    const newOffset = offset + LIMIT;
    doSearch(query, format, newOffset, true);
  }, [query, format, offset, doSearch]);

  // ── Scroll selected item into view ───────────────────────────────────
  useEffect(() => {
    if (selectedIndex < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-result-item]');
    items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // ── Download → Parse → Load to Deck ─────────────────────────────────────

  const loadToDeck = useCallback(
    async (file: ModlandFile, deckId: 'A' | 'B' | 'C') => {
      setDownloadingPaths((prev) => new Set(prev).add(file.full_path));
      setError(null);

      try {
        const buffer = await downloadModlandFile(file.full_path);
        const blob = new File([buffer], file.filename, { type: 'application/octet-stream' });
        const song = await parseModuleToSong(blob);
        const bpmResult = detectBPM(song);

        // Cache with modland: prefix for playlist re-download support
        const cacheKey = `modland:${file.full_path}`;
        cacheSong(cacheKey, song);

        const engine = getDJEngine();

        // Set loading state immediately
        useDJStore.getState().setDeckState(deckId, {
          fileName: cacheKey,
          trackName: song.name || file.filename,
          detectedBPM: bpmResult.bpm,
          effectiveBPM: bpmResult.bpm,
          analysisState: 'rendering',
          isPlaying: false,
        });

        // Render + analyze FIRST, then load audio directly (skip tracker mode)
        // This eliminates the "tracker bug window" — user hears perfect audio immediately
        const result = await getDJPipeline().loadOrEnqueue(buffer, file.filename, deckId, 'high');

        // Load the pre-rendered WAV directly in audio mode
        await engine.loadAudioToDeck(deckId, result.wavData, cacheKey, song.name || file.filename, result.analysis?.bpm || bpmResult.bpm, song);

        // Switch to visualizer view for modules
        useDJStore.getState().setDeckViewMode('visualizer');

        console.log(`[DJModlandBrowser] Loaded ${file.filename} in audio mode (skipped tracker bugs)`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setDownloadingPaths((prev) => {
          const next = new Set(prev);
          next.delete(file.full_path);
          return next;
        });
      }
    },
    [],
  );

  // ── Add to playlist ─────────────────────────────────────────────────────

  const addToPlaylist = useCallback(
    async (file: ModlandFile) => {
      const playlistId = useDJPlaylistStore.getState().activePlaylistId;
      if (!playlistId) return;

      setDownloadingPaths((prev) => new Set(prev).add(file.full_path));
      setError(null);

      try {
        const buffer = await downloadModlandFile(file.full_path);
        const blob = new File([buffer], file.filename, { type: 'application/octet-stream' });
        const song = await parseModuleToSong(blob);
        const bpmResult = detectBPM(song);
        const duration = estimateSongDuration(song);

        const cacheKey = `modland:${file.full_path}`;
        cacheSong(cacheKey, song);

        useDJPlaylistStore.getState().addTrack(playlistId, {
          fileName: cacheKey,
          trackName: song.name || file.filename,
          format: file.extension.toUpperCase(),
          bpm: bpmResult.bpm,
          duration,
          addedAt: Date.now(),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add to playlist');
      } finally {
        setDownloadingPaths((prev) => {
          const next = new Set(prev);
          next.delete(file.full_path);
          return next;
        });
      }
    },
    [],
  );

  // ── Keyboard navigation ─────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && selectedIndex >= 0 && selectedIndex < results.length) {
        e.preventDefault();
        const file = results[selectedIndex];
        if (!downloadingPaths.has(file.full_path)) {
          loadToDeck(file, e.shiftKey ? 'B' : 'A');
        }
      } else if ((e.key === '1' || e.key === '2' || e.key === '3') && selectedIndex >= 0 && selectedIndex < results.length) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT') return; // Don't intercept number keys while typing
        e.preventDefault();
        const file = results[selectedIndex];
        if (downloadingPaths.has(file.full_path)) return;
        const deckMap = { '1': 'A', '2': 'B', '3': 'C' } as const;
        const deckId = deckMap[e.key as '1' | '2' | '3'];
        if (deckId === 'C' && !thirdDeckActive) {
          useDJStore.getState().setThirdDeckActive(true);
        }
        loadToDeck(file, deckId);
      }
    },
    [results, selectedIndex, downloadingPaths, thirdDeckActive, loadToDeck],
  );

  // ── Render ──────────────────────────────────────────────────────────────

  const isDownloading = (path: string) => downloadingPaths.has(path);

  return (
    <div
      className="bg-dark-bgSecondary border border-dark-border rounded-lg p-3 flex flex-col gap-2 max-h-[400px]"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe size={14} className="text-green-400" />
          <h3 className="text-text-primary text-sm font-mono font-bold tracking-wider uppercase">
            Modland
          </h3>
          {status && status.status === 'ready' && (
            <span className="text-[10px] font-mono text-text-muted">
              {status.totalFiles.toLocaleString()} files
            </span>
          )}
          {status && status.status === 'indexing' && (
            <span className="text-[10px] font-mono text-amber-400 flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" /> Indexing...
            </span>
          )}
        </div>
        {onClose && (
          <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Search + Filter */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search modules..."
            className="w-full pl-7 pr-2 py-1.5 text-xs font-mono bg-dark-bg border border-dark-borderLight
                       rounded text-text-primary placeholder:text-text-muted/40
                       focus:border-green-600 focus:outline-none transition-colors"
          />
        </div>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          className="px-2 py-1.5 text-[10px] font-mono bg-dark-bg border border-dark-borderLight
                     rounded text-text-secondary cursor-pointer hover:bg-dark-bgHover transition-colors"
        >
          <option value="">All formats</option>
          {formats.map((f) => (
            <option key={f.format} value={f.format}>
              {f.format} ({f.count.toLocaleString()})
            </option>
          ))}
        </select>
      </div>

      {/* Error display */}
      {error && (
        <div className="flex items-center gap-1.5 text-red-400 text-[10px] font-mono px-2 py-1 bg-red-900/20 rounded border border-red-900/30">
          <AlertCircle size={10} />
          {error}
        </div>
      )}

      {/* Results list */}
      <div ref={listRef} className="flex-1 overflow-y-auto min-h-0">
        {results.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center py-8 text-text-muted">
            <Globe size={24} className="mb-2 opacity-40" />
            <p className="text-xs font-mono">
              {query || format ? 'No results found' : 'Search the modland archive'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {results.map((file, idx) => (
              <div
                key={file.full_path}
                data-result-item
                onClick={() => setSelectedIndex(idx)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded border transition-colors group cursor-pointer ${
                  idx === selectedIndex
                    ? 'bg-green-900/20 border-green-700/50'
                    : 'bg-dark-bg border-dark-borderLight hover:border-dark-border'
                }`}
              >
                {/* File info */}
                <div className="flex-1 min-w-0">
                  <div className="text-text-primary text-xs font-mono truncate">
                    {file.filename}
                  </div>
                  <div className="flex gap-3 text-[10px] text-text-muted font-mono">
                    <span>{file.format}</span>
                    <span className="text-text-muted/60">{file.author}</span>
                  </div>
                </div>

                {/* Actions */}
                {isDownloading(file.full_path) ? (
                  <Loader2 size={12} className="animate-spin text-green-400" />
                ) : (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); addToPlaylist(file); }}
                      className="p-1 text-text-muted hover:text-amber-400 transition-colors
                                 opacity-0 group-hover:opacity-100"
                      title="Add to active playlist"
                    >
                      <ListPlus size={12} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); loadToDeck(file, 'A'); }}
                      className="px-2 py-1 text-[10px] font-mono font-bold rounded
                                 bg-blue-900/30 text-blue-400 border border-blue-800/50
                                 hover:bg-blue-800/40 hover:text-blue-300 transition-colors
                                 opacity-0 group-hover:opacity-100"
                    >
                      1
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); loadToDeck(file, 'B'); }}
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
                        loadToDeck(file, 'C');
                      }}
                      className={`px-2 py-1 text-[10px] font-mono font-bold rounded
                                 bg-emerald-900/30 text-emerald-400 border border-emerald-800/50
                                 hover:bg-emerald-800/40 hover:text-emerald-300 transition-colors
                                 opacity-0 group-hover:opacity-100 ${!thirdDeckActive ? 'opacity-0 group-hover:opacity-50' : ''}`}
                    >
                      3
                    </button>
                  </>
                )}
              </div>
            ))}

            {/* Load more */}
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loading}
                className="mt-1 py-1.5 text-[10px] font-mono text-text-secondary bg-dark-bgTertiary
                           border border-dark-borderLight rounded hover:bg-dark-bgHover
                           hover:text-text-primary transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-1">
                    <Loader2 size={10} className="animate-spin" /> Loading...
                  </span>
                ) : (
                  'Load more'
                )}
              </button>
            )}
          </div>
        )}

        {/* Loading indicator for initial search */}
        {loading && results.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="animate-spin text-green-400" />
          </div>
        )}
      </div>

      {/* Keyboard hints */}
      {results.length > 0 && (
        <div className="text-[9px] font-mono text-text-muted/50 flex gap-3 px-1">
          <span>↑↓ navigate</span>
          <span>⏎ deck 1</span>
          <span>⇧⏎ deck 2</span>
        </div>
      )}
    </div>
  );
};
