/**
 * DJModlandBrowser - Unified online music browser for the DJ view
 *
 * Search 190K+ Modland tracker modules and 80K+ HVSC C64 SID tunes
 * from a single search bar. Downloads are proxied through the DEViLBOX server.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Globe, Search, Loader2, X, ListPlus, AlertCircle } from 'lucide-react';
import {
  searchModland,
  getModlandFormats,
  downloadModlandFile,
  downloadTFMXCompanion,
  getModlandStatus,
  type ModlandFile,
  type ModlandFormat,
  type ModlandStatus,
} from '@/lib/modlandApi';
import {
  searchHVSC,
  downloadHVSCFile,
  type HVSCEntry,
} from '@/lib/hvscApi';
import { useDJStore, useThirdDeckActive } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { detectBPM, estimateSongDuration } from '@/engine/dj/DJBeatDetector';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { isUADEFormat } from '@/lib/import/formats/UADEParser';
import { loadUADEToDeck } from '@/engine/dj/DJUADEPrerender';
import { cacheSong } from '@/engine/dj/DJSongCache';
import { getDJPipeline } from '@/engine/dj/DJPipeline';
import { useDJPlaylistStore } from '@/stores/useDJPlaylistStore';
import {
  batchGetRatings,
  setRating,
  removeRating,
  type RatingMap,
} from '@/lib/ratingsApi';
import { useAuthStore } from '@/stores/useAuthStore';
import { AuthModal } from '@/components/dialogs/AuthModal';
import { StarRating } from '@/components/shared/StarRating';
import { CustomSelect } from '@components/common/CustomSelect';

// ── Unified result type ──────────────────────────────────────────────────────

type SearchSource = 'all' | 'modland' | 'hvsc';

interface OnlineResult {
  source: 'modland' | 'hvsc';
  key: string;
  filename: string;
  format: string;
  author: string;
  avg_rating?: number;
  vote_count?: number;
}

function modlandToResult(f: ModlandFile): OnlineResult {
  return { source: 'modland', key: f.full_path, filename: f.filename, format: f.format, author: f.author, avg_rating: f.avg_rating, vote_count: f.vote_count };
}

function hvscToResult(e: HVSCEntry): OnlineResult {
  return { source: 'hvsc', key: e.path, filename: e.name, format: 'SID', author: e.author || '', avg_rating: e.avg_rating, vote_count: e.vote_count };
}

// ── Component ────────────────────────────────────────────────────────────────

interface DJModlandBrowserProps {
  onClose?: () => void;
}

export const DJModlandBrowser: React.FC<DJModlandBrowserProps> = ({ onClose }) => {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<SearchSource>('all');
  const [format, setFormat] = useState('');
  const [results, setResults] = useState<OnlineResult[]>([]);
  const [formats, setFormats] = useState<ModlandFormat[]>([]);
  const [status, setStatus] = useState<ModlandStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [downloadingPaths, setDownloadingPaths] = useState<Set<string>>(new Set());
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [, setLoadedDecks] = useState<Set<string>>(new Set());
  const [ratings, setRatings] = useState<RatingMap>({});

  const isLoggedIn = useAuthStore(s => !!s.token);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const thirdDeckActive = useThirdDeckActive();
  const LIMIT = 50;

  // ── Init: fetch status + formats ────────────────────────────────────────

  useEffect(() => {
    getModlandStatus().then(setStatus).catch((err) => console.warn('Modland status unavailable:', err));
    getModlandFormats().then(fmts => setFormats(fmts.sort((a, b) => a.format.localeCompare(b.format)))).catch((err) => console.warn('Modland formats unavailable:', err));
    // Auto-focus search input
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  // ── Click outside to close ──────────────────────────────────────────────

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

  // ── Debounced search ────────────────────────────────────────────────────

  const doSearch = useCallback(
    async (q: string, fmt: string, src: SearchSource, newOffset: number, append: boolean) => {
      if (!q && !fmt) {
        if (!append) setResults([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        let combined: OnlineResult[] = [];
        let moreResults = false;

        if (src === 'all' || src === 'modland') {
          const data = await searchModland({
            q: q || undefined,
            format: fmt || undefined,
            limit: LIMIT,
            offset: newOffset,
          });
          combined.push(...data.results.map(modlandToResult));
          if (data.results.length === LIMIT) moreResults = true;
        }

        if ((src === 'all' || src === 'hvsc') && q && !fmt) {
          try {
            const hvscResults = await searchHVSC(q, LIMIT, newOffset);
            combined.push(...hvscResults.filter(e => !e.isDirectory).map(hvscToResult));
            if (hvscResults.length === LIMIT) moreResults = true;
          } catch {
            // HVSC may fail if server not running
          }
        }

        if (src === 'all') {
          combined.sort((a, b) => a.filename.localeCompare(b.filename));
        }

        if (append) {
          setResults((prev) => [...prev, ...combined]);
        } else {
          setResults(combined);
        }
        setHasMore(moreResults);
        setOffset(newOffset);

        const modlandKeys = combined.filter(r => r.source === 'modland').map(r => r.key);
        const hvscKeys = combined.filter(r => r.source === 'hvsc').map(r => r.key);
        const ratingPromises: Promise<RatingMap>[] = [];
        if (modlandKeys.length > 0) ratingPromises.push(batchGetRatings('modland', modlandKeys));
        if (hvscKeys.length > 0) ratingPromises.push(batchGetRatings('hvsc', hvscKeys));
        if (ratingPromises.length > 0) {
          Promise.all(ratingPromises).then(maps => {
            const merged = Object.assign({}, ...maps);
            setRatings(prev => append ? { ...prev, ...merged } : merged);
          }).catch(() => {});
        } else if (!append) {
          setRatings({});
        }
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
      // Cancel any in-flight search
      if (abortRef.current) abortRef.current.abort();
      doSearch(query, format, source, 0, false);
      setSelectedIndex(0);
    }, 500);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [query, format, source, doSearch]);

  const loadMore = useCallback(() => {
    const newOffset = offset + LIMIT;
    doSearch(query, format, source, newOffset, true);
  }, [query, format, source, offset, doSearch]);

  // ── Rate handler ──────────────────────────────────────────────────────

  const handleRate = useCallback(async (item: OnlineResult, star: number) => {
    if (!isLoggedIn) { setShowAuthModal(true); return; }
    const itemKey = item.key;
    const ratingSource = item.source;
    // Optimistic update
    setRatings(prev => {
      const existing = prev[itemKey];
      if (star === 0) {
        if (!existing) return prev;
        const newCount = Math.max(0, existing.count - 1);
        const newAvg = newCount > 0
          ? (existing.avg * existing.count - (existing.userRating || 0)) / newCount
          : 0;
        return { ...prev, [itemKey]: { avg: newAvg, count: newCount } };
      }
      const oldUser = existing?.userRating;
      const oldCount = existing?.count || 0;
      const oldAvg = existing?.avg || 0;
      const newCount = oldUser ? oldCount : oldCount + 1;
      const newAvg = oldUser
        ? (oldAvg * oldCount - oldUser + star) / newCount
        : (oldAvg * oldCount + star) / newCount;
      return { ...prev, [itemKey]: { avg: newAvg, count: newCount, userRating: star } };
    });
    try {
      if (star === 0) {
        await removeRating(ratingSource, itemKey);
      } else {
        await setRating(ratingSource, itemKey, star);
      }
    } catch {
      batchGetRatings(ratingSource, [itemKey]).then(rm => {
        setRatings(prev => ({ ...prev, ...rm }));
      }).catch(() => {});
    }
  }, [isLoggedIn]);

  // ── Scroll selected item into view ───────────────────────────────────
  useEffect(() => {
    if (selectedIndex < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-result-item]');
    items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // ── Download → Parse → Load to Deck ─────────────────────────────────────

  /** Pick the deck that isn't currently playing (fallback: A) */
  const pickFreeDeck = useCallback((): 'A' | 'B' => {
    const decks = useDJStore.getState().decks;
    if (!decks.A.isPlaying) return 'A';
    if (!decks.B.isPlaying) return 'B';
    return 'A';
  }, []);

  const loadToDeck = useCallback(
    async (file: OnlineResult, deckId: 'A' | 'B' | 'C') => {
      setDownloadingPaths((prev) => new Set(prev).add(file.key));
      setError(null);

      try {
        let buffer: ArrayBuffer;
        if (file.source === 'hvsc') {
          buffer = await downloadHVSCFile(file.key);
        } else {
          const [modBuffer, companion] = await Promise.all([
            downloadModlandFile(file.key),
            downloadTFMXCompanion(file.key),
          ]);
          buffer = modBuffer;
          if (companion) {
            const { UADEEngine } = await import('@engine/uade/UADEEngine');
            await UADEEngine.getInstance().addCompanionFile(companion.filename, companion.buffer);
          }
        }

        const cacheKey = `${file.source}:${file.key}`;
        const engine = getDJEngine();

        // HVSC SIDs: render via WebSID in the pipeline (NOT UADE)
        if (file.source === 'hvsc') {
          useDJStore.getState().setDeckState(deckId, {
            fileName: cacheKey,
            trackName: file.filename.replace(/\.sid$/i, ''),
            detectedBPM: 125,
            effectiveBPM: 125,
            analysisState: 'rendering',
            isPlaying: false,
          });
          const result = await getDJPipeline().loadOrEnqueue(buffer, file.filename, deckId, 'high');
          await engine.loadAudioToDeck(deckId, result.wavData, cacheKey, file.filename.replace(/\.sid$/i, ''), result.analysis?.bpm || 125);
          if (useDJStore.getState().deckViewMode !== '3d') {
            useDJStore.getState().setDeckViewMode('visualizer');
          }
        } else if (isUADEFormat(file.filename)) {
          // Amiga formats: use UADE pre-render path
          await loadUADEToDeck(
            engine, deckId, buffer, file.filename, true, undefined, file.filename
          );
          if (useDJStore.getState().deckViewMode !== '3d') {
            useDJStore.getState().setDeckViewMode('visualizer');
          }
        } else {
          // Non-UADE tracker (XM/IT/S3M/etc.) — parse + pipeline render
          const blob = new File([buffer], file.filename, { type: 'application/octet-stream' });
          const song = await parseModuleToSong(blob);
          const bpmResult = detectBPM(song);

          cacheSong(cacheKey, song);

          useDJStore.getState().setDeckState(deckId, {
            fileName: cacheKey,
            trackName: song.name || file.filename,
            detectedBPM: bpmResult.bpm,
            effectiveBPM: bpmResult.bpm,
            analysisState: 'rendering',
            isPlaying: false,
          });

          const result = await getDJPipeline().loadOrEnqueue(buffer, file.filename, deckId, 'high');
          await engine.loadAudioToDeck(deckId, result.wavData, cacheKey, song.name || file.filename, result.analysis?.bpm || bpmResult.bpm, song);

          if (useDJStore.getState().deckViewMode !== '3d') {
            useDJStore.getState().setDeckViewMode('visualizer');
          }
        }

        setLoadedDecks((prev) => {
          const next = new Set(prev).add(deckId);
          const requiredDecks = thirdDeckActive ? 3 : 2;
          if (next.size >= requiredDecks && onClose) {
            closeTimerRef.current = setTimeout(onClose, 300);
          }
          return next;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setDownloadingPaths((prev) => {
          const next = new Set(prev);
          next.delete(file.key);
          return next;
        });
      }
    },
    [thirdDeckActive, onClose],
  );

  // ── Add to playlist ─────────────────────────────────────────────────────

   const addToPlaylist = useCallback(
    async (file: OnlineResult) => {
      const playlistId = useDJPlaylistStore.getState().activePlaylistId;
      if (!playlistId) return;

      setDownloadingPaths((prev) => new Set(prev).add(file.key));
      setError(null);

      try {
        const cacheKey = `${file.source}:${file.key}`;

        // SID files can't be parsed as tracker modules — add directly with metadata
        if (file.source === 'hvsc') {
          useDJPlaylistStore.getState().addTrack(playlistId, {
            fileName: cacheKey,
            trackName: file.filename.replace(/\.sid$/i, ''),
            format: 'SID',
            bpm: 0,
            duration: 180,
            addedAt: Date.now(),
          });
          return;
        }

        let buffer: ArrayBuffer;
        const [modBuffer, companion] = await Promise.all([
          downloadModlandFile(file.key),
          downloadTFMXCompanion(file.key),
        ]);
        buffer = modBuffer;
        if (companion) {
          const { UADEEngine } = await import('@engine/uade/UADEEngine');
          await UADEEngine.getInstance().addCompanionFile(companion.filename, companion.buffer);
        }

        const blob = new File([buffer], file.filename, { type: 'application/octet-stream' });
        const song = await parseModuleToSong(blob);
        const bpmResult = detectBPM(song);
        const duration = estimateSongDuration(song);

        cacheSong(cacheKey, song);

        useDJPlaylistStore.getState().addTrack(playlistId, {
          fileName: cacheKey,
          trackName: song.name || file.filename,
          format: file.format,
          bpm: bpmResult.bpm,
          duration,
          addedAt: Date.now(),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add to playlist');
      } finally {
        setDownloadingPaths((prev) => {
          const next = new Set(prev);
          next.delete(file.key);
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
        if (!downloadingPaths.has(file.key)) {
          loadToDeck(file, e.shiftKey ? 'B' : 'A');
        }
      } else if ((e.key === '1' || e.key === '2' || e.key === '3') && selectedIndex >= 0 && selectedIndex < results.length) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT') return; // Don't intercept number keys while typing
        e.preventDefault();
        const file = results[selectedIndex];
        if (downloadingPaths.has(file.key)) return;
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

  const isDownloading = (key: string) => downloadingPaths.has(key);

  return (
    <>
    <div
      ref={panelRef}
      className="bg-dark-bgSecondary border border-dark-border rounded-lg p-3 flex flex-col gap-2 max-h-[400px] relative z-[99990]"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe size={14} className="text-green-400" />
          <h3 className="text-text-primary text-sm font-mono font-bold tracking-wider uppercase">
            Online
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
      <div className="flex-shrink-0 flex gap-2">
        <div className="flex-1 relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search online archives..."
            className="w-full pl-7 pr-2 py-1.5 text-xs font-mono bg-dark-bg border border-dark-borderLight
                       rounded text-text-primary placeholder:text-text-muted/40
                       focus:border-green-600 focus:outline-none transition-colors"
          />
        </div>
        <CustomSelect
          value={source}
          onChange={(v) => setSource(v as SearchSource)}
          options={[
            { value: 'all', label: 'All sources' },
            { value: 'modland', label: 'Modland (190K+)' },
            { value: 'hvsc', label: 'HVSC / SID (80K+)' },
          ]}
          className="px-2 py-1.5 text-[10px] font-mono bg-dark-bg border border-dark-borderLight rounded text-text-secondary cursor-pointer hover:bg-dark-bgHover transition-colors"
        />
        <CustomSelect
          value={format}
          onChange={(v) => setFormat(v)}
          disabled={source === 'hvsc'}
          options={[
            { value: '', label: 'All formats' },
            ...formats.map((f) => ({
              value: f.format,
              label: `${f.format} (${f.count.toLocaleString()})`,
            })),
          ]}
          className="px-2 py-1.5 text-[10px] font-mono bg-dark-bg border border-dark-borderLight rounded text-text-secondary cursor-pointer hover:bg-dark-bgHover transition-colors"
        />
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
              {query || format ? 'No results found' : 'Search 270K+ tracker modules & SID tunes'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {results.map((file, idx) => (
              <div
                key={file.key}
                data-result-item
                onClick={() => setSelectedIndex(idx)}
                onDoubleClick={() => loadToDeck(file, pickFreeDeck())}
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
                  <div className="flex gap-3 text-[10px] text-text-muted font-mono items-center">
                    <span className={file.source === 'hvsc' ? 'text-blue-400' : ''}>{file.format}</span>
                    {file.source === 'hvsc' && <span className="text-blue-400/60 text-[9px]">HVSC</span>}
                    <span className="text-text-muted/60">{file.author}</span>
                    <StarRating
                      avg={ratings[file.key]?.avg ?? file.avg_rating ?? 0}
                      count={ratings[file.key]?.count ?? file.vote_count ?? 0}
                      userRating={ratings[file.key]?.userRating}
                      onRate={(star) => handleRate(file, star)}
                    />
                  </div>
                </div>

                {/* Actions */}
                {isDownloading(file.key) ? (
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
    <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </>
  );
};
