/**
 * PixiDJModlandBrowser — GL-native Modland browser for the DJ view.
 *
 * Renders entirely in Pixi (no DOM). Provides search with debounce,
 * format dropdown filter, paginated results, keyboard navigation,
 * deck load buttons on hover, and "add to playlist" support.
 *
 * DOM reference: src/components/dj/DJModlandBrowser.tsx
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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
import { useDJStore, useThirdDeckActive } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { detectBPM, estimateSongDuration } from '@/engine/dj/DJBeatDetector';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { cacheSong } from '@/engine/dj/DJSongCache';
import { getDJPipeline } from '@/engine/dj/DJPipeline';
import { useDJPlaylistStore } from '@/stores/useDJPlaylistStore';
import { PixiButton } from '../../components/PixiButton';
import { PixiLabel } from '../../components/PixiLabel';
import { PixiSelect } from '../../components/PixiSelect';
import type { SelectOption } from '../../components/PixiSelect';
import { PixiPureTextInput } from '../../input/PixiPureTextInput';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';

// ── Layout constants ─────────────────────────────────────────────────────────

const PANEL_W = 600;
const PANEL_H = 280;
const HEADER_H = 24;
const SEARCH_ROW_H = 28;
const ROW_H = 32;
const FOOTER_H = 28;
const HINT_H = 14;
const LIST_H = PANEL_H - HEADER_H - SEARCH_ROW_H - FOOTER_H - HINT_H - 16;
const LIMIT = 50;

// ── Props ────────────────────────────────────────────────────────────────────

interface PixiDJModlandBrowserProps {
  visible?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

export const PixiDJModlandBrowser: React.FC<PixiDJModlandBrowserProps> = ({
  visible = true,
}) => {
  const theme = usePixiTheme();
  const thirdDeckActive = useThirdDeckActive();

  // ── State ────────────────────────────────────────────────────────────────
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
  const [hoveredIndex, setHoveredIndex] = useState(-1);
  const [scrollY, setScrollY] = useState(0);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
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
          setScrollY(0);
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
    doSearch(query, format, offset + LIMIT, true);
  }, [query, format, offset, doSearch]);

  // ── Download → Parse → Load to Deck ──────────────────────────────────────
  const loadToDeck = useCallback(
    async (file: ModlandFile, deckId: 'A' | 'B' | 'C') => {
      setDownloadingPaths((prev) => new Set(prev).add(file.full_path));
      setError(null);
      try {
        const [buffer, companion] = await Promise.all([
          downloadModlandFile(file.full_path),
          downloadTFMXCompanion(file.full_path),
        ]);
        if (companion) {
          const { UADEEngine } = await import('@engine/uade/UADEEngine');
          await UADEEngine.getInstance().addCompanionFile(companion.filename, companion.buffer);
        }
        const blob = new File([buffer], file.filename, { type: 'application/octet-stream' });
        const song = await parseModuleToSong(blob);
        const bpmResult = detectBPM(song);
        const cacheKey = `modland:${file.full_path}`;
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

  // ── Add to playlist ──────────────────────────────────────────────────────
  const addToPlaylist = useCallback(async (file: ModlandFile) => {
    const playlistId = useDJPlaylistStore.getState().activePlaylistId;
    if (!playlistId) return;
    setDownloadingPaths((prev) => new Set(prev).add(file.full_path));
    setError(null);
    try {
      const [buffer, companion] = await Promise.all([
        downloadModlandFile(file.full_path),
        downloadTFMXCompanion(file.full_path),
      ]);
      if (companion) {
        const { UADEEngine } = await import('@engine/uade/UADEEngine');
        await UADEEngine.getInstance().addCompanionFile(companion.filename, companion.buffer);
      }
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
        if (!downloadingRef.current.has(file.full_path)) {
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

  const isDownloading = (path: string) => downloadingPaths.has(path);
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
        <PixiLabel text="🌐" size="sm" color="success" />
        <PixiLabel text="MODLAND" size="sm" weight="bold" font="mono" color="text" />
        {statusText ? (
          <PixiLabel text={statusText} size="xs" font="mono" color="textMuted" />
        ) : null}
      </layoutContainer>

      {/* ── Search row ──────────────────────────────────────────────────── */}
      <layoutContainer layout={{ flexDirection: 'row', gap: 4, height: SEARCH_ROW_H }}>
        <PixiPureTextInput
          value={query}
          onChange={setQuery}
          placeholder="Search modules..."
          width={contentW - 160}
          height={SEARCH_ROW_H}
          fontSize={11}
        />
        <PixiSelect
          options={formatOptions}
          value={format}
          onChange={setFormat}
          width={200}
          height={SEARCH_ROW_H}
          searchable
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
            backgroundColor: 0x3B1515,
            borderWidth: 1,
            borderColor: 0x7F2020,
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
              text={query || format ? 'No results found' : 'Search the modland archive'}
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
          const downloading = isDownloading(file.full_path);

          return (
            <pixiContainer
              key={file.full_path}
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
                    g.fill({ color: 0x166534, alpha: 0.3 });
                  } else if (isHovered) {
                    g.fill({ color: theme.bgHover.color });
                  } else {
                    g.fill({ color: actualIdx % 2 === 0 ? theme.bg.color : theme.bgSecondary.color });
                  }
                }}
                layout={{ position: 'absolute', width: contentW - 8, height: ROW_H }}
              />

              {/* File info */}
              <layoutContainer layout={{ flex: 1, flexDirection: 'column', justifyContent: 'center', gap: 1, overflow: 'hidden' }}>
                <pixiBitmapText
                  text={file.filename}
                  style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 13, fill: 0xffffff }}
                  tint={theme.text.color}
                  layout={{ maxWidth: contentW - 180 }}
                />
                <layoutContainer layout={{ flexDirection: 'row', gap: 8 }}>
                  <pixiBitmapText
                    text={file.format}
                    style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
                    tint={theme.textMuted.color}
                    layout={{}}
                  />
                  <pixiBitmapText
                    text={file.author}
                    style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
                    tint={theme.textMuted.color}
                    alpha={0.6}
                    layout={{}}
                  />
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
