/**
 * DJModlandBrowser - Unified online music browser for the DJ view
 *
 * Search 190K+ Modland tracker modules and 80K+ HVSC C64 SID tunes
 * from a single search bar. Downloads are proxied through the DEViLBOX server.
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Globe, Search, Loader2, X, ListPlus, AlertCircle, Play, Square } from 'lucide-react';
import { ContextMenu, useContextMenu, type MenuItemType } from '@components/common/ContextMenu';
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
  /** `popover`: rounded card, capped at 400px (default). `fullHeight`: stretches to fill parent, no border. */
  variant?: 'popover' | 'fullHeight';
}

export const DJModlandBrowser: React.FC<DJModlandBrowserProps> = ({ onClose, variant = 'popover' }) => {
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
  // Row hover is tracked in React state instead of via Tailwind's
  // `group-hover:*` CSS because StarRating re-renders rapidly on per-star
  // mouse-enter — Chrome sometimes drops the ancestor `:hover` state for
  // a frame during class-change reconciliation, causing the row's action
  // buttons to flicker in and out while the cursor is still over the row.
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const isLoggedIn = useAuthStore(s => !!s.token);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Context menu — right-click on a result row to copy/move to playlists, load to deck, etc.
  const contextMenu = useContextMenu();
  const [contextMenuFile, setContextMenuFile] = useState<OnlineResult | null>(null);
  const playlists = useDJPlaylistStore(s => s.playlists);
  const activePlaylistId = useDJPlaylistStore(s => s.activePlaylistId);

  // Preview — single-flight direct-UADE playback. For UADE-family modules
  // (mod/cust/smod/tfmx/hip/…) we feed the raw bytes straight to UADEEngine
  // and route its output node into the DJ mixer's sampler input, no WAV
  // render + no deck-load round trip. This makes preview effectively
  // instant (<100 ms vs ~5-10 s for the pipeline path) since the search
  // result just needs to AUDIBLE, not be ready for scrubbing / BPM sync /
  // effects. Loading to a deck (the 1/2/3 buttons) still uses the full
  // pre-render path so you get the whole beatgrid/key/etc.
  const [previewingKey, setPreviewingKey] = useState<string | null>(null);
  const previewModeRef = useRef<'uade' | 'deck' | null>(null);
  const previewDeckRef = useRef<'A' | null>(null);

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

  // ── Preview (single-flight on deck A) ──────────────────────────────────

  const stopPreview = useCallback(() => {
    const mode = previewModeRef.current;
    if (mode === 'uade') {
      // Direct-UADE preview path: stop the engine + unplug its output from
      // the cue bus. Lazy-import the engine so we don't drag UADEEngine
      // into the bundle on browsers that never opened the Modland browser.
      void (async () => {
        try {
          const { UADEEngine } = await import('@engine/uade/UADEEngine');
          const uade = UADEEngine.getInstance();
          uade.stop();
          try {
            // Preview routes to the cue bus (headphones) — disconnect from
            // both it and the legacy samplerInput so any older in-flight
            // connection is cleaned up cleanly.
            const mixer = getDJEngine().mixer;
            const cueInput = mixer.getCueInput();
            if (cueInput) {
              try { uade.output.disconnect(cueInput.input as unknown as AudioNode); } catch { /* */ }
            }
            try { uade.output.disconnect(mixer.samplerInput); } catch { /* */ }
          } catch { /* already disconnected or engine gone */ }
        } catch { /* UADE not loaded yet */ }
      })();
    } else if (mode === 'deck' && previewDeckRef.current) {
      try {
        getDJEngine().getDeck(previewDeckRef.current).stop();
        useDJStore.getState().setDeckPlaying(previewDeckRef.current, false);
      } catch { /* deck not ready */ }
    }
    previewModeRef.current = null;
    previewDeckRef.current = null;
    setPreviewingKey(null);
  }, []);

  // Intentionally do NOT stop the preview on unmount. Closing the Modland
  // browser to go back to DJ view would otherwise kill whatever track is
  // currently playing on deck A — catastrophic mid-gig. The DJ engine owns
  // the deck; this component is only a UI view that triggered the load. Use
  // the explicit Stop button if you want to kill it.

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

  // ── Preview handler (depends on loadToDeck) ─────────────────────────────

  const handlePreview = useCallback(async (file: OnlineResult) => {
    // Toggle off if already previewing this result.
    if (previewingKey === file.key) { stopPreview(); return; }
    stopPreview();
    setPreviewingKey(file.key);

    // Direct-UADE path for Amiga/UADE modules: skip the render-to-WAV
    // pipeline entirely. Download the bytes, hand them to UADEEngine,
    // route UADE.output → DJ mixer sampler input, hit play. No deck
    // involvement, no WAV render wait, no beatgrid/analysis overhead.
    // Finishes in <100 ms after the download completes vs ~5-10 s for
    // the pipeline path. SIDs + non-UADE trackers fall back to the
    // original loadToDeck() path because UADE can't play them.
    if (file.source === 'modland' && isUADEFormat(file.filename)) {
      previewModeRef.current = 'uade';
      try {
        const [buffer, companion] = await Promise.all([
          downloadModlandFile(file.key),
          downloadTFMXCompanion(file.key),
        ]);
        // User may have hit Stop (or previewed something else) while we
        // were downloading — bail out cleanly in that case.
        if (previewingKey !== file.key && previewModeRef.current !== 'uade') {
          return;
        }

        const { UADEEngine } = await import('@engine/uade/UADEEngine');
        const uade = UADEEngine.getInstance();
        await uade.ready();

        if (companion) {
          await uade.addCompanionFile(companion.filename, companion.buffer);
        }

        // Stop any prior UADE playback before loading a new module —
        // leaving it playing leaks audio during the ~100 ms load window.
        uade.stop();
        await uade.load(buffer, file.filename);

        // Route UADE.output to the CUE bus (headphones) so preview is
        // audible to the DJ but NOT to the crowd — classic sound-system
        // workflow. Falls back to the master sampler input only if the
        // cue engine hasn't been injected yet (e.g. pre-DJEngine init).
        const mixer = getDJEngine().mixer;
        const cueInput = mixer.getCueInput();
        if (cueInput) {
          try {
            // Tone.Gain .input is the raw AudioNode the Tone-side graph
            // expects to receive from. Connecting UADE's native GainNode
            // straight to Tone's .input is safe because Web Audio treats
            // both as AudioNode.
            uade.output.connect(cueInput.input as unknown as AudioNode);
          } catch { /* already connected */ }
        } else {
          console.warn('[ModlandBrowser] cue input unavailable — falling back to master sampler input');
          try { uade.output.connect(mixer.samplerInput); }
          catch { /* already connected */ }
        }

        uade.play();
        return;
      } catch (err) {
        console.warn('[ModlandBrowser] Direct UADE preview failed, falling back to pipeline:', err);
        previewModeRef.current = null;
        // Fall through to the pipeline path as a safety net.
      }
    }

    // Fallback (SIDs, XM/IT/S3M, or if the UADE path errored above):
    // use the old deck-load path which renders via the pipeline.
    previewModeRef.current = 'deck';
    previewDeckRef.current = 'A';
    try {
      await loadToDeck(file, 'A');
      try {
        getDJEngine().getDeck('A').play();
        useDJStore.getState().setDeckPlaying('A', true);
      } catch { /* engine not ready */ }
    } catch {
      previewDeckRef.current = null;
      previewModeRef.current = null;
      setPreviewingKey(null);
    }
  }, [previewingKey, stopPreview, loadToDeck]);

  // ── Add to playlist ─────────────────────────────────────────────────────

   const addToPlaylist = useCallback(
    async (file: OnlineResult, targetPlaylistId?: string) => {
      const playlistId = targetPlaylistId ?? useDJPlaylistStore.getState().activePlaylistId;
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
            author: file.author || undefined,
            format: 'SID',
            bpm: 0,
            duration: 180,
            addedAt: Date.now(),
          });
          // Only clear the result on "add to active playlist" (the default button
          // click path). When copying to a different playlist from the context
          // menu, keep the result so the user can copy to more playlists.
          if (!targetPlaylistId) setResults((prev) => prev.filter((r) => r.key !== file.key));
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
          author: file.author || undefined,
          format: file.format,
          bpm: bpmResult.bpm,
          duration,
          addedAt: Date.now(),
        });
        if (!targetPlaylistId) setResults((prev) => prev.filter((r) => r.key !== file.key));
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

  // ── Context menu items ────────────────────────────────────
  const contextMenuItems = useMemo((): MenuItemType[] => {
    const file = contextMenuFile;
    if (!file) return [];

    const activePlaylistName = playlists.find((p) => p.id === activePlaylistId)?.name;
    const items: MenuItemType[] = [
      { id: 'load-1', label: 'Load to Deck 1', onClick: () => loadToDeck(file, 'A') },
      { id: 'load-2', label: 'Load to Deck 2', onClick: () => loadToDeck(file, 'B') },
      {
        id: 'load-3',
        label: 'Load to Deck 3',
        onClick: () => {
          if (!thirdDeckActive) useDJStore.getState().setThirdDeckActive(true);
          loadToDeck(file, 'C');
        },
      },
      { type: 'divider' },
    ];

    if (activePlaylistId) {
      items.push({
        id: 'add-active',
        label: activePlaylistName ? `Add to "${activePlaylistName}"` : 'Add to active playlist',
        onClick: () => addToPlaylist(file),
      });
    }

    if (playlists.length > 0) {
      items.push({
        id: 'add-to',
        label: 'Add to playlist…',
        submenu: playlists.map((pl) => ({
          id: `add-${pl.id}`,
          label: pl.name,
          onClick: () => addToPlaylist(file, pl.id),
        })),
      });
    }

    items.push({ type: 'divider' });
    items.push({
      id: 'copy-info',
      label: 'Copy Track Info',
      onClick: () => {
        const info = [
          `Name: ${file.filename}`,
          file.format && `Format: ${file.format}`,
          file.author && `Author: ${file.author}`,
          `Source: ${file.source}`,
          `Key: ${file.key}`,
        ].filter(Boolean).join('\n');
        navigator.clipboard.writeText(info);
      },
    });

    return items;
  }, [contextMenuFile, playlists, activePlaylistId, thirdDeckActive, loadToDeck, addToPlaylist]);

  const handleContextMenu = useCallback((e: React.MouseEvent, file: OnlineResult, idx: number) => {
    setContextMenuFile(file);
    setSelectedIndex(idx);
    contextMenu.open(e);
  }, [contextMenu]);

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
      className={`bg-dark-bgSecondary flex flex-col gap-2 relative z-[99990] ${
        variant === 'fullHeight'
          ? 'h-full p-3'
          : 'border border-dark-border rounded-lg p-3 max-h-[400px]'
      }`}
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
                onContextMenu={(e) => handleContextMenu(e, file, idx)}
                onPointerEnter={() => setHoveredIdx(idx)}
                onPointerLeave={() => setHoveredIdx((prev) => (prev === idx ? null : prev))}
                className={`flex items-center gap-2 px-2 py-1.5 rounded border transition-colors cursor-pointer ${
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
                {isDownloading(file.key) && previewingKey !== file.key ? (
                  <Loader2 size={12} className="animate-spin text-green-400" />
                ) : (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); handlePreview(file); }}
                      className={`p-1 rounded transition-all ${
                        previewingKey === file.key
                          ? 'text-accent-success bg-accent-success/15 hover:bg-accent-success/25 opacity-100'
                          : `text-text-muted hover:text-text-primary ${hoveredIdx === idx ? 'opacity-100' : 'opacity-0 pointer-events-none'}`
                      }`}
                      title={previewingKey === file.key ? 'Stop preview' : 'Preview track'}
                    >
                      {previewingKey === file.key ? <Square size={12} /> : <Play size={12} />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); addToPlaylist(file); }}
                      className={`p-1 text-text-muted hover:text-amber-400 transition-opacity ${
                        hoveredIdx === idx ? 'opacity-100' : 'opacity-0 pointer-events-none'
                      }`}
                      title="Add to active playlist"
                    >
                      <ListPlus size={12} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); loadToDeck(file, 'A'); }}
                      className={`px-2 py-1 text-[10px] font-mono font-bold rounded
                                 bg-blue-900/30 text-blue-400 border border-blue-800/50
                                 hover:bg-blue-800/40 hover:text-blue-300 transition-opacity ${
                        hoveredIdx === idx ? 'opacity-100' : 'opacity-0 pointer-events-none'
                      }`}
                    >
                      1
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); loadToDeck(file, 'B'); }}
                      className={`px-2 py-1 text-[10px] font-mono font-bold rounded
                                 bg-red-900/30 text-red-400 border border-red-800/50
                                 hover:bg-red-800/40 hover:text-red-300 transition-opacity ${
                        hoveredIdx === idx ? 'opacity-100' : 'opacity-0 pointer-events-none'
                      }`}
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
                                 hover:bg-emerald-800/40 hover:text-emerald-300 transition-opacity ${
                        hoveredIdx === idx
                          ? (thirdDeckActive ? 'opacity-100' : 'opacity-50')
                          : 'opacity-0 pointer-events-none'
                      }`}
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
    <ContextMenu items={contextMenuItems} position={contextMenu.position} onClose={contextMenu.close} zIndex={99999} />
    </>
  );
};
