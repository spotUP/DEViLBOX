/**
 * PixiDJModlandBrowser — GL-native unified online music browser for the DJ view.
 *
 * Searches Modland (190K+ tracker modules) and HVSC (80K+ C64 SID tunes)
 * from a single search bar. Source selector lets you filter or search all.
 *
 * DOM reference: src/components/dj/DJModlandBrowser.tsx
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { tintBg } from '../../colors';
import type { Graphics as GraphicsType } from 'pixi.js';
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
import { PixiButton } from '../../components/PixiButton';
import { PixiIcon } from '../../components/PixiIcon';
import { PixiLabel } from '../../components/PixiLabel';
import { PixiSelect } from '../../components/PixiSelect';
import type { SelectOption } from '../../components/PixiSelect';
import { PixiPureTextInput } from '../../input/PixiPureTextInput';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';

// ── Layout constants ─────────────────────────────────────────────────────────

const PANEL_W = 700;
const PANEL_H = 280;
const HEADER_H = 24;
const SEARCH_ROW_H = 28;
const ROW_H = 32;
const FOOTER_H = 28;
const HINT_H = 14;
const LIST_H = PANEL_H - HEADER_H - SEARCH_ROW_H - FOOTER_H - HINT_H - 16;
const LIMIT = 50;

// ── Unified result type ──────────────────────────────────────────────────────

type SearchSource = 'all' | 'modland' | 'hvsc';

interface OnlineResult {
  source: 'modland' | 'hvsc';
  key: string;          // unique key for cache/download: modland full_path or hvsc path
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

const SOURCE_OPTIONS: SelectOption[] = [
  { value: 'all', label: 'All sources' },
  { value: 'modland', label: 'Modland (190K+)' },
  { value: 'hvsc', label: 'HVSC / SID (80K+)' },
];

// ── Star rating helpers ──────────────────────────────────────────────────────

const STAR_SIZE = 16;
const STAR_GAP = 2;
const STAR_EMPTY = 0xffffff;

function drawStar(g: GraphicsType, cx: number, cy: number, r: number, color: number, alpha = 1) {
  const inner = r * 0.45;
  const step = Math.PI / 5;
  g.moveTo(cx + r * Math.sin(0), cy - r * Math.cos(0));
  for (let i = 1; i < 10; i++) {
    const radius = i % 2 === 0 ? r : inner;
    const angle = i * step;
    g.lineTo(cx + radius * Math.sin(angle), cy - radius * Math.cos(angle));
  }
  g.closePath();
  g.fill({ color, alpha });
}

// ── Props ────────────────────────────────────────────────────────────────────

interface PixiDJModlandBrowserProps {
  visible?: boolean;
  onClose?: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export const PixiDJModlandBrowser: React.FC<PixiDJModlandBrowserProps> = ({
  visible = true,
  onClose,
}) => {
  const theme = usePixiTheme();
  const thirdDeckActive = useThirdDeckActive();
  const STAR_FILLED = theme.warning.color;
  const STAR_USER = theme.warning.color;
  const STAR_HOVER = theme.warning.color;

  // ── State ────────────────────────────────────────────────────────────────
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
  const [hoveredIndex, setHoveredIndex] = useState(-1);
  const [scrollY, setScrollY] = useState(0);
  const [ratings, setRatings] = useState<RatingMap>({});
  const [hoveredStar, setHoveredStar] = useState<{ path: string; star: number } | null>(null);
  const [, setLoadedDecks] = useState<Set<string>>(new Set());

  const isLoggedIn = useAuthStore(s => !!s.token);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef(results);
  const selectedIndexRef = useRef(selectedIndex);
  const downloadingRef = useRef(downloadingPaths);

  useEffect(() => { resultsRef.current = results; }, [results]);
  useEffect(() => { selectedIndexRef.current = selectedIndex; }, [selectedIndex]);
  useEffect(() => { downloadingRef.current = downloadingPaths; }, [downloadingPaths]);

  // ── Init: fetch status + formats ─────────────────────────────────────────
  useEffect(() => {
    getModlandStatus().then(setStatus).catch(() => {});
    getModlandFormats().then(setFormats).catch(() => {});
  }, []);

  // ── Format options for PixiSelect ────────────────────────────────────────
  const formatOptions = useMemo<SelectOption[]>(() => {
    const sorted = [...formats].sort((a, b) => a.format.localeCompare(b.format));
    const opts: SelectOption[] = [{ value: '', label: 'All formats' }];
    for (const f of sorted) {
      opts.push({ value: f.format, label: `${f.format} (${f.count.toLocaleString()})` });
    }
    return opts;
  }, [formats]);

  // ── Debounced search ─────────────────────────────────────────────────────
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

        // Search Modland
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

        // Search HVSC (no format filter — always SID)
        if ((src === 'all' || src === 'hvsc') && q && !fmt) {
          try {
            const hvscResults = await searchHVSC(q, LIMIT, newOffset);
            combined.push(...hvscResults.filter(e => !e.isDirectory).map(hvscToResult));
            if (hvscResults.length === LIMIT) moreResults = true;
          } catch {
            // HVSC search may fail if server not running — continue with Modland results
          }
        }

        // Sort: interleave sources for variety when searching "all"
        if (src === 'all') {
          combined.sort((a, b) => a.filename.localeCompare(b.filename));
        }

        if (append) {
          setResults((prev) => [...prev, ...combined]);
        } else {
          setResults(combined);
          setScrollY(0);
        }
        setHasMore(moreResults);
        setOffset(newOffset);

        // Fetch ratings for results
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
    doSearch(query, format, source, offset + LIMIT, true);
  }, [query, format, source, offset, doSearch]);

  // ── Rate handler ──────────────────────────────────────────────────────────
  const handleRate = useCallback(async (item: OnlineResult, star: number) => {
    if (!isLoggedIn) return;
    const itemKey = item.key;
    const ratingSource = item.source;
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

  // ── Download → Parse → Load to Deck ──────────────────────────────────────
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
        // HVSC SIDs: render via WebSID in the pipeline (NOT UADE/parseModuleToSong)
        if (file.source === 'hvsc') {
          const cacheKey = `${file.source}:${file.key}`;
          const engine = getDJEngine();
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
          useDJStore.getState().setDeckViewMode('visualizer');
        } else {
        const blob = new File([buffer], file.filename, { type: 'application/octet-stream' });
        const song = await parseModuleToSong(blob);
        const bpmResult = detectBPM(song);
        const cacheKey = `${file.source}:${file.key}`;
        cacheSong(cacheKey, song);
        const engine = getDJEngine();
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
        useDJStore.getState().setDeckViewMode('visualizer');
        }

        // Auto-close when all active decks are filled
        setLoadedDecks((prev) => {
          const next = new Set(prev).add(deckId);
          const requiredDecks = thirdDeckActive ? 3 : 2;
          if (next.size >= requiredDecks && onClose) {
            setTimeout(onClose, 300);
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

  // ── Add to playlist ──────────────────────────────────────────────────────
  const addToPlaylist = useCallback(async (file: OnlineResult) => {
    const playlistId = useDJPlaylistStore.getState().activePlaylistId;
    if (!playlistId) return;
    setDownloadingPaths((prev) => new Set(prev).add(file.key));
    setError(null);
    try {
      const cacheKey = `${file.source}:${file.key}`;

      // SID files can't be parsed as tracker modules — add directly
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

      const [modBuffer, companion] = await Promise.all([
        downloadModlandFile(file.key),
        downloadTFMXCompanion(file.key),
      ]);
      const buffer = modBuffer;
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
  }, []);

  // ── Keyboard navigation ──────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      // Don't intercept if a Pixi text input is focused
      if ((window as any).__pixiInputFocused) return;

      const res = resultsRef.current;
      const idx = selectedIndexRef.current;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, res.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && idx >= 0 && idx < res.length) {
        e.preventDefault();
        const file = res[idx];
        if (!downloadingRef.current.has(file.key)) {
          loadToDeck(file, e.shiftKey ? 'B' : 'A');
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, loadToDeck]);

  // ── Scroll selected into view ────────────────────────────────────────────
  useEffect(() => {
    if (selectedIndex < 0) return;
    const itemTop = selectedIndex * ROW_H;
    const itemBottom = itemTop + ROW_H;
    if (itemTop < scrollY) setScrollY(itemTop);
    else if (itemBottom > scrollY + LIST_H) setScrollY(itemBottom - LIST_H);
  }, [selectedIndex, scrollY]);

  // ── Scroll / virtual list ────────────────────────────────────────────────
  const totalContentH = results.length * ROW_H + (hasMore ? FOOTER_H : 0);
  const maxScroll = Math.max(0, totalContentH - LIST_H);

  const handleWheel = useCallback((e: { deltaY: number; stopPropagation: () => void }) => {
    e.stopPropagation();
    setScrollY((prev) => Math.max(0, Math.min(maxScroll, prev + (e as any).deltaY)));
  }, [maxScroll]);

  const buffer = 3;
  const startIdx = Math.max(0, Math.floor(scrollY / ROW_H) - buffer);
  const endIdx = Math.min(results.length, Math.ceil((scrollY + LIST_H) / ROW_H) + buffer);
  const visibleItems = useMemo(() => results.slice(startIdx, endIdx), [results, startIdx, endIdx]);

  // ── Scrollbar geometry ───────────────────────────────────────────────────
  const trackH = LIST_H - 4;
  const thumbH = maxScroll > 0 ? Math.max(20, (LIST_H / totalContentH) * trackH) : 0;
  const thumbTop = maxScroll > 0 ? 2 + (scrollY / maxScroll) * (trackH - thumbH) : 2;

  const drawScrollTrack = useCallback((g: GraphicsType) => {
    g.clear();
    if (maxScroll <= 0) return;
    g.roundRect(0, 2, 6, trackH, 3);
    g.fill({ color: theme.bgActive.color, alpha: 0.3 });
  }, [trackH, maxScroll, theme]);

  const drawScrollThumb = useCallback((g: GraphicsType) => {
    g.clear();
    if (maxScroll <= 0) return;
    g.roundRect(0, 0, 6, thumbH, 3);
    g.fill({ color: theme.textMuted.color, alpha: 0.4 });
  }, [thumbH, maxScroll, theme]);

  // ── Status text ──────────────────────────────────────────────────────────
  const statusText = useMemo(() => {
    if (!status) return '';
    if (status.status === 'indexing') return 'Indexing…';
    if (status.status === 'ready') return `${status.totalFiles.toLocaleString()} files`;
    return '';
  }, [status]);

  if (!visible) return null;

  const isDownloading = (key: string) => downloadingPaths.has(key);
  const contentW = PANEL_W - 12;

  return (
    <layoutContainer
      layout={{
        width: PANEL_W,
        height: PANEL_H,
        flexDirection: 'column',
        padding: 6,
        gap: 4,
        backgroundColor: theme.bgSecondary.color,
        borderWidth: 1,
        borderColor: theme.border.color,
        borderRadius: 6,
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: HEADER_H }}>
        <PixiLabel text="ONLINE" size="sm" weight="bold" font="mono" color="text" />
        {statusText ? (
          <PixiLabel text={statusText} size="xs" font="mono" color="textMuted" />
        ) : null}
        {onClose && (
          <layoutContainer layout={{ marginLeft: 'auto' }}>
            <PixiButton icon="close" label="" variant="ghost" size="sm" width={24} height={24} onClick={onClose} />
          </layoutContainer>
        )}
      </layoutContainer>

      {/* ── Search row ──────────────────────────────────────────────────── */}
      <layoutContainer layout={{ flexDirection: 'row', gap: 4, height: SEARCH_ROW_H }}>
        <PixiPureTextInput
          value={query}
          onChange={setQuery}
          placeholder="Search online archives..."
          width={contentW - 310}
          height={SEARCH_ROW_H}
          fontSize={11}
        />
        <PixiSelect
          options={SOURCE_OPTIONS}
          value={source}
          onChange={v => setSource(v as SearchSource)}
          width={150}
          height={SEARCH_ROW_H}
        />
        <PixiSelect
          options={formatOptions}
          value={format}
          onChange={setFormat}
          width={200}
          height={SEARCH_ROW_H}
          searchable
          disabled={source === 'hvsc'}
        />
      </layoutContainer>

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && (
        <layoutContainer
          layout={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingLeft: 6,
            paddingRight: 6,
            paddingTop: 3,
            paddingBottom: 3,
            backgroundColor: tintBg(theme.error.color),
            borderWidth: 1,
            borderColor: theme.error.color,
            borderRadius: 4,
          }}
        >
          <PixiLabel text="⚠" size="xs" color="error" />
          <PixiLabel text={error} size="xs" font="mono" color="error" />
        </layoutContainer>
      )}

      {/* ── Results list ────────────────────────────────────────────────── */}
      <pixiContainer
        eventMode="static"
        onWheel={handleWheel as any}
        layout={{
          width: contentW,
          height: LIST_H,
          overflow: 'hidden',
          backgroundColor: theme.bg.color,
          borderRadius: 4,
        }}
      >
        {/* Empty state */}
        {results.length === 0 && !loading && (
          <layoutContainer layout={{ alignItems: 'center', justifyContent: 'center', width: contentW, height: LIST_H }}>
            <PixiLabel
              text={query || format ? 'No results found' : 'Search 270K+ tracker modules & SID tunes'}
              size="xs"
              font="mono"
              color="textMuted"
            />
          </layoutContainer>
        )}

        {/* Loading spinner (initial) */}
        {loading && results.length === 0 && (
          <layoutContainer layout={{ alignItems: 'center', justifyContent: 'center', width: contentW, height: LIST_H }}>
            <PixiLabel text="Loading…" size="xs" font="mono" color="textMuted" />
          </layoutContainer>
        )}

        {/* Virtual rows */}
        {visibleItems.map((file, i) => {
          const actualIdx = startIdx + i;
          const y = actualIdx * ROW_H - scrollY;
          const isSelected = actualIdx === selectedIndex;
          const isHovered = actualIdx === hoveredIndex;
          const downloading = isDownloading(file.key);
          const sourceTag = file.source === 'hvsc' ? 'SID' : '';

          return (
            <pixiContainer
              key={file.key}
              eventMode="static"
              cursor="pointer"
              onPointerUp={() => setSelectedIndex(actualIdx)}
              onPointerOver={() => setHoveredIndex(actualIdx)}
              onPointerOut={() => setHoveredIndex(-1)}
              layout={{
                position: 'absolute',
                left: 0,
                top: y,
                width: contentW - 8,
                height: ROW_H,
                flexDirection: 'row',
                alignItems: 'center',
                paddingLeft: 6,
                gap: 4,
              }}
            >
              {/* Row background */}
              <pixiGraphics
                draw={(g: GraphicsType) => {
                  g.clear();
                  g.rect(0, 0, contentW - 8, ROW_H);
                  if (isSelected) {
                    g.fill({ color: theme.success.color, alpha: 0.3 });
                  } else if (isHovered) {
                    g.fill({ color: theme.bgHover.color });
                  } else {
                    g.fill({ color: actualIdx % 2 === 0 ? theme.bg.color : theme.bgSecondary.color });
                  }
                }}
                layout={{ position: 'absolute', width: contentW - 8, height: ROW_H }}
              />

              {/* File icon */}
              <PixiIcon name="diskio" size={14} color={theme.textMuted.color} layout={{ flexShrink: 0, marginRight: 4 }} />

              {/* File info */}
              <layoutContainer layout={{ flex: 1, flexDirection: 'column', justifyContent: 'center', gap: 1, overflow: 'hidden' }}>
                <pixiBitmapText
                  text={file.filename}
                  style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 13, fill: 0xffffff }}
                  tint={theme.text.color}
                  layout={{ maxWidth: contentW - 180 }}
                />
                <layoutContainer layout={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <pixiBitmapText
                    text={file.format}
                    style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
                    tint={file.source === 'hvsc' ? theme.accent.color : theme.textMuted.color}
                    layout={{}}
                  />
                  {sourceTag ? (
                    <pixiBitmapText
                      text="HVSC"
                      style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
                      tint={theme.accent.color}
                      layout={{}}
                    />
                  ) : null}
                  <pixiBitmapText
                    text={file.author}
                    style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
                    tint={theme.textMuted.color}
                    alpha={0.6}
                    layout={{}}
                  />
                  {/* Star ratings */}
                  <layoutContainer layout={{ flexDirection: 'row', gap: STAR_GAP, marginLeft: 4 }}>
                    {[1, 2, 3, 4, 5].map(star => {
                      const r = ratings[file.key];
                      const avg = r?.avg ?? file.avg_rating ?? 0;
                      const userR = r?.userRating;
                      const isStarHovered = hoveredStar?.path === file.key && hoveredStar.star >= star;
                      const isFilled = star <= (hoveredStar?.path === file.key ? hoveredStar.star : (userR || Math.round(avg)));
                      const color = isStarHovered ? STAR_HOVER : (userR && star <= userR) ? STAR_USER : isFilled ? STAR_FILLED : STAR_EMPTY;
                      const starAlpha = color === STAR_EMPTY ? 0.4 : 1;
                      return (
                        <pixiGraphics
                          key={star}
                          eventMode={isLoggedIn ? 'static' : 'none'}
                          cursor={isLoggedIn ? 'pointer' : undefined}
                          onPointerOver={() => isLoggedIn && setHoveredStar({ path: file.key, star })}
                          onPointerOut={() => setHoveredStar(null)}
                          onPointerUp={() => {
                            if (!isLoggedIn) return;
                            handleRate(file, userR === star ? 0 : star);
                          }}
                          draw={(g: GraphicsType) => {
                            g.clear();
                            drawStar(g, STAR_SIZE / 2, STAR_SIZE / 2, STAR_SIZE / 2, color, starAlpha);
                          }}
                          layout={{ width: STAR_SIZE, height: STAR_SIZE }}
                        />
                      );
                    })}
                    {(ratings[file.key]?.count ?? file.vote_count ?? 0) > 0 && (
                      <pixiBitmapText
                        text={`(${ratings[file.key]?.count ?? file.vote_count ?? 0})`}
                        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
                        tint={theme.textMuted.color}
                        alpha={0.4}
                        layout={{ marginLeft: 2 }}
                      />
                    )}
                  </layoutContainer>
                </layoutContainer>
              </layoutContainer>

              {/* Actions (visible on hover/selected) */}
              {downloading ? (
                <PixiLabel text="…" size="xs" font="mono" color="accent" />
              ) : (isHovered || isSelected) ? (
                <layoutContainer layout={{ flexDirection: 'row', gap: 2, flexShrink: 0 }}>
                  <PixiButton
                    label="♫"
                    variant="ghost"
                    size="sm"
                    width={24}
                    height={22}
                    onClick={() => addToPlaylist(file)}
                  />
                  <PixiButton
                    label="1"
                    variant="ft2"
                    color="blue"
                    size="sm"
                    width={24}
                    height={22}
                    onClick={() => loadToDeck(file, 'A')}
                  />
                  <PixiButton
                    label="2"
                    variant="ft2"
                    color="red"
                    size="sm"
                    width={24}
                    height={22}
                    onClick={() => loadToDeck(file, 'B')}
                  />
                  <PixiButton
                    label="3"
                    variant="ft2"
                    color="green"
                    size="sm"
                    width={24}
                    height={22}
                    onClick={() => {
                      if (!thirdDeckActive) useDJStore.getState().setThirdDeckActive(true);
                      loadToDeck(file, 'C');
                    }}
                  />
                </layoutContainer>
              ) : null}
            </pixiContainer>
          );
        })}

        {/* Load more button (positioned absolutely inside the scroll area) */}
        {hasMore && results.length > 0 && (
          <pixiContainer
            layout={{
              position: 'absolute',
              left: 0,
              top: results.length * ROW_H - scrollY,
              width: contentW - 8,
              height: FOOTER_H,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <PixiButton
              label={loading ? 'Loading…' : 'Load more'}
              variant="ghost"
              size="sm"
              width={120}
              height={24}
              disabled={loading}
              onClick={loadMore}
            />
          </pixiContainer>
        )}

        {/* Scrollbar */}
        {maxScroll > 0 && (
          <pixiContainer layout={{ position: 'absolute', left: contentW - 8, top: 0, width: 6, height: LIST_H }}>
            <pixiGraphics draw={drawScrollTrack} layout={{ position: 'absolute', width: 6, height: LIST_H }} />
            <pixiGraphics
              draw={drawScrollThumb}
              layout={{ position: 'absolute', top: thumbTop, width: 6, height: thumbH }}
            />
          </pixiContainer>
        )}
      </pixiContainer>

      {/* ── Keyboard hints ──────────────────────────────────────────────── */}
      {results.length > 0 && (
        <layoutContainer layout={{ flexDirection: 'row', gap: 12, height: HINT_H, paddingLeft: 4 }}>
          <PixiLabel text="↑↓ navigate" size="xs" font="mono" color="textMuted" layout={{ opacity: 0.5 }} />
          <PixiLabel text="⏎ deck 1" size="xs" font="mono" color="textMuted" layout={{ opacity: 0.5 }} />
          <PixiLabel text="⇧⏎ deck 2" size="xs" font="mono" color="textMuted" layout={{ opacity: 0.5 }} />
        </layoutContainer>
      )}
    </layoutContainer>
  );
};
