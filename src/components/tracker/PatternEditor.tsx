/**
 * PatternEditor - Main pattern grid with smooth scrolling follow mode
 * Features: GPU-accelerated scrolling, responsive channels, add/remove channels
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as Tone from 'tone';
import { TrackerRow } from './TrackerRow';
import { ChannelVUMeter } from './ChannelVUMeter';
import { ChannelVUMeters } from './ChannelVUMeters';
import { ChannelColorPicker } from './ChannelColorPicker';
import { ChannelContextMenu } from './ChannelContextMenu';
import { CellContextMenu, useCellContextMenu } from './CellContextMenu';
import { AutomationLanes } from './AutomationLanes';
import { useTrackerStore, useTransportStore, useThemeStore } from '@stores';
import { GENERATORS, type GeneratorType } from '@utils/patternGenerators';
import { useShallow } from 'zustand/react/shallow';
import { Plus, Minus, Volume2, VolumeX, Headphones, ChevronLeft, ChevronRight } from 'lucide-react';
import { useResponsiveSafe } from '@contexts/ResponsiveContext';
import { useSwipeGesture } from '@hooks/useSwipeGesture';
import type { TrackerCell } from '@typedefs';

interface ChannelTrigger {
  level: number;
  triggered: boolean;
}

const ROW_HEIGHT = 28; // Height of each row in pixels
const VISIBLE_ROWS_BUFFER = 10; // Extra rows to render above/below viewport

// Separate component for status bar to isolate currentRow subscription
// This prevents the entire grid from re-rendering when currentRow changes
const StatusBar: React.FC<{
  patternLength: number;
  channelCount: number;
  cursorChannel: number;
}> = React.memo(({ patternLength, channelCount, cursorChannel }) => {
  const { isPlaying, currentRow } = useTransportStore(
    useShallow((state) => ({ isPlaying: state.isPlaying, currentRow: state.currentRow }))
  );
  const cursorRow = useTrackerStore((state) => state.cursor.rowIndex);
  const displayRow = isPlaying ? currentRow : cursorRow;

  return (
    <div className="flex-shrink-0 bg-dark-bgSecondary border-t border-dark-border px-4 py-2 flex items-center justify-between text-xs font-mono">
      <div className="flex items-center gap-4">
        <span className="text-text-muted">
          Row: <span className="text-accent-primary">{displayRow.toString().padStart(2, '0')}</span>
          /<span className="text-text-secondary">{(patternLength - 1).toString().padStart(2, '0')}</span>
        </span>
        <span className="text-text-muted">
          Ch: <span className="text-accent-primary">{(cursorChannel + 1).toString().padStart(2, '0')}</span>
          /<span className="text-text-secondary">{channelCount.toString().padStart(2, '0')}</span>
        </span>
      </div>
      <div className="flex items-center gap-2 text-text-muted">
        <span className={isPlaying ? 'text-accent-success' : ''}>
          {isPlaying ? '▶ PLAYING' : '⏸ STOPPED'}
        </span>
      </div>
    </div>
  );
});
StatusBar.displayName = 'StatusBar';

const PatternEditorComponent: React.FC = () => {
  const { isMobile } = useResponsiveSafe();
  const {
    patterns,
    currentPatternIndex,
    cursor,
    showGhostPatterns,
    addChannel,
    removeChannel,
    toggleChannelMute,
    toggleChannelSolo,
    setChannelColor,
    setCell,
    moveCursorToChannel,
  } = useTrackerStore();
  // Use selectors to minimize re-renders during playback
  // Only subscribe to isPlaying and continuousRow - NOT currentRow
  // currentRow updates frequently and is only needed by the StatusBar component
  const { isPlaying, continuousRow, isLooping, smoothScrolling, currentRow } = useTransportStore(
    useShallow((state) => ({
      isPlaying: state.isPlaying,
      continuousRow: state.continuousRow,
      isLooping: state.isLooping,
      smoothScrolling: state.smoothScrolling,
      currentRow: state.currentRow, // Needed for stepped scrolling mode
    }))
  );

  // Get current theme for ghost row visibility adjustments
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(600);
  const [isReady, setIsReady] = useState(false);
  const [channelTriggers, setChannelTriggers] = useState<ChannelTrigger[]>([]);
  const lastTriggerRowRef = useRef<number>(-1);
  const isScrollSyncing = useRef(false);

  // Cell context menu
  const cellContextMenu = useCellContextMenu();

  // Smooth scroll - use ref for direct DOM updates (avoids React re-render overhead)
  const animationFrameRef = useRef<number | null>(null);
  const playbackStartTimeRef = useRef(0);
  const playbackStartRowRef = useRef(0);

  const pattern = patterns[currentPatternIndex];

  // Mobile: Track which channel is currently visible (synced with cursor)
  const mobileChannelIndex = cursor.channelIndex;

  // Mobile: Swipe gesture handlers
  const handleSwipeLeft = useCallback(() => {
    if (!pattern || !isMobile) return;
    const nextChannel = Math.min(pattern.channels.length - 1, mobileChannelIndex + 1);
    if (nextChannel !== mobileChannelIndex) {
      moveCursorToChannel(nextChannel);
    }
  }, [pattern, isMobile, mobileChannelIndex, moveCursorToChannel]);

  const handleSwipeRight = useCallback(() => {
    if (!pattern || !isMobile) return;
    const prevChannel = Math.max(0, mobileChannelIndex - 1);
    if (prevChannel !== mobileChannelIndex) {
      moveCursorToChannel(prevChannel);
    }
  }, [pattern, isMobile, mobileChannelIndex, moveCursorToChannel]);

  const swipeHandlers = useSwipeGesture({
    threshold: 50,
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
  });

  // Debug logging for pattern data
  useEffect(() => {
    const firstCell = pattern?.channels?.[0]?.rows?.[0];
    console.log('[PatternEditor] patterns changed:', {
      patternsLength: patterns.length,
      currentPatternIndex,
      hasPattern: !!pattern,
      patternLength: pattern?.length,
      channelsCount: pattern?.channels?.length,
      firstChannelRowsCount: pattern?.channels?.[0]?.rows?.length,
      firstCellNote: firstCell?.note,
      firstCellInstrument: firstCell?.instrument,
      // Find first non-empty cell
      firstNonEmptyCell: (() => {
        if (!pattern) return null;
        for (const ch of pattern.channels) {
          for (let i = 0; i < ch.rows.length; i++) {
            const cell = ch.rows[i];
            if (cell.note) return { row: i, note: cell.note, instrument: cell.instrument };
          }
        }
        return null;
      })(),
    });
  }, [patterns, currentPatternIndex, pattern]);

  // For non-playing state, use cursor position
  // During playback, the animation loop handles scroll directly via DOM
  const scrollRow = cursor.rowIndex;

  // Track note triggers for VU meters - only when stopped (editing)
  // During playback, skip updates to avoid re-renders causing flicker
  useEffect(() => {
    if (!pattern || isPlaying) return;

    const targetRow = cursor.rowIndex;
    if (lastTriggerRowRef.current === targetRow) return;
    lastTriggerRowRef.current = targetRow;

    const newTriggers: ChannelTrigger[] = pattern.channels.map((channel) => {
      const cell = channel.rows[targetRow];
      const hasNote = cell?.note && cell.note !== '...' && cell.note !== '===';
      // Use volume if set, otherwise default to 0.8
      const volume = cell?.volume != null ? cell.volume / 64 : 0.8;

      return {
        level: hasNote ? Math.min(1, volume * 1.2) : 0,
        triggered: hasNote || false,
      };
    });

    setChannelTriggers(newTriggers);
  }, [cursor.rowIndex, pattern, isPlaying]);

  // Wait for first proper measurement before enabling transitions
  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Initialize animation when playback starts (only once per playback session)
  const isPlayingRef = useRef(isPlaying);
  const smoothScrollingRef = useRef(smoothScrolling);

  useEffect(() => {
    const wasPlaying = isPlayingRef.current;
    const wasSmoothScrolling = smoothScrollingRef.current;
    isPlayingRef.current = isPlaying;
    smoothScrollingRef.current = smoothScrolling;

    // Initialize refs when playback starts or when switching to smooth mode during playback
    if (isPlaying && smoothScrolling && (!wasPlaying || !wasSmoothScrolling)) {
      playbackStartTimeRef.current = performance.now();
      playbackStartRowRef.current = continuousRow;
    }
  }, [isPlaying, smoothScrolling, continuousRow]);

  // Stepped scrolling effect (updates on row changes)
  useEffect(() => {
    if (!isPlaying || !pattern || !contentRef.current || smoothScrolling) {
      return;
    }

    const contentEl = contentRef.current;
    // STEPPED SCROLLING MODE: Classic tracker style, jumps row-by-row
    const currentHeight = containerRef.current?.clientHeight || containerHeight;
    const halfContainer = currentHeight / 2;
    const offset = halfContainer - (currentRow * ROW_HEIGHT) - (ROW_HEIGHT / 2);
    contentEl.style.transform = `translate3d(0, ${offset}px, 0)`;
  }, [isPlaying, pattern, smoothScrolling, currentRow, containerHeight]);

  // Smooth scrolling animation (continuous, doesn't restart on row changes)
  useEffect(() => {
    if (!isPlaying || !pattern || !contentRef.current || !smoothScrolling) {
      // Stop animation when not playing or not in smooth mode
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const contentEl = contentRef.current;
    const patternLength = pattern.length;
    const transport = Tone.getTransport();

    const animate = () => {
      if (!contentEl || !containerRef.current) return;

      const bpm = transport.bpm.value;
      const beatsPerRow = 0.25; // 4 rows per beat (standard tracker timing)
      const secondsPerRow = (60 / bpm) * beatsPerRow;

      // Calculate elapsed time since animation started
      const elapsedMs = performance.now() - playbackStartTimeRef.current;
      const elapsedSeconds = elapsedMs / 1000;

      // Calculate how many rows we've scrolled since start
      const rowsElapsed = elapsedSeconds / secondsPerRow;

      // Continuous row position - wrap around pattern length for seamless looping
      const rawRowPosition = playbackStartRowRef.current + rowsElapsed;
      // Use modulo to wrap, keeping scroll in valid range
      const wrappedRowPosition = rawRowPosition % patternLength;

      // Read actual container height from DOM for accuracy
      const currentHeight = containerRef.current.clientHeight;
      const halfContainer = currentHeight / 2;
      const offset = halfContainer - (wrappedRowPosition * ROW_HEIGHT) - (ROW_HEIGHT / 2);
      contentEl.style.transform = `translate3d(0, ${offset}px, 0)`;

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    // Start animation loop (only if not already running)
    if (!animationFrameRef.current) {
      animationFrameRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
    // Only restart when playback state or pattern changes, NOT on row updates
  }, [isPlaying, pattern, smoothScrolling]);

  // Calculate the scroll offset for the pattern
  // Active row is ALWAYS centered at the edit bar, pattern wraps seamlessly
  const scrollOffset = useMemo(() => {
    if (!isReady || !pattern) return 0;

    const halfContainer = containerHeight / 2;
    // Center the scroll row under the edit bar
    // Use scrollRow (continuous) for smooth looping, not activeRow
    return halfContainer - (scrollRow * ROW_HEIGHT) - (ROW_HEIGHT / 2);
  }, [scrollRow, containerHeight, isReady, pattern]);

  // Track container size using ResizeObserver for accurate sizing
  // This properly handles when other elements (like TB303KnobPanel) resize
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.contentRect.height;
        if (height > 0) {
          setContainerHeight(height);
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    // Initial measurement
    setContainerHeight(containerRef.current.clientHeight);

    return () => resizeObserver.disconnect();
  }, []);

  // Get previous and next patterns for preview during playback
  const prevPatternIndex = currentPatternIndex > 0 ? currentPatternIndex - 1 : patterns.length - 1;
  const nextPatternIndex = currentPatternIndex < patterns.length - 1 ? currentPatternIndex + 1 : 0;
  const prevPattern = patterns[prevPatternIndex];
  const nextPattern = patterns[nextPatternIndex];

  // Calculate which virtual rows are visible (always wraps for seamless looping)
  // During playback, includes rows from previous/next patterns for preview
  const visibleVirtualRows = useMemo(() => {
    const patternLength = pattern?.length || 64;

    // During playback, render current pattern plus adjacent pattern rows for preview
    if (isPlaying) {
      const rows: Array<{ virtualIndex: number; actualIndex: number; patternType: 'prev' | 'current' | 'next' }> = [];
      const prevLen = prevPattern?.length || patternLength;
      const nextLen = nextPattern?.length || patternLength;

      // Add rows from previous pattern (shown above current, dimmed) - only if ghosts enabled
      if (showGhostPatterns) {
        for (let i = 0; i < prevLen; i++) {
          rows.push({ virtualIndex: i - prevLen, actualIndex: i, patternType: 'prev' });
        }
      }
      // Add rows from current pattern
      for (let i = 0; i < patternLength; i++) {
        rows.push({ virtualIndex: i, actualIndex: i, patternType: 'current' });
      }
      // Add rows from next pattern (shown below current, dimmed) - only if ghosts enabled
      if (showGhostPatterns) {
        for (let i = 0; i < nextLen; i++) {
          rows.push({ virtualIndex: patternLength + i, actualIndex: i, patternType: 'next' });
        }
      }
      return rows;
    }

    // When stopped, only render visible rows for performance (current pattern only)
    const firstVirtualRow = Math.floor(-scrollOffset / ROW_HEIGHT) - VISIBLE_ROWS_BUFFER;
    const lastVirtualRow = Math.ceil((containerHeight - scrollOffset) / ROW_HEIGHT) + VISIBLE_ROWS_BUFFER;

    // Generate array of virtual rows with their actual pattern row index
    const rows: Array<{ virtualIndex: number; actualIndex: number; patternType: 'prev' | 'current' | 'next' }> = [];
    for (let v = firstVirtualRow; v <= lastVirtualRow; v++) {
      // Always wrap around for seamless looping
      let actual = v % patternLength;
      if (actual < 0) actual += patternLength;
      rows.push({ virtualIndex: v, actualIndex: actual, patternType: 'current' });
    }

    return rows;
  }, [scrollOffset, isPlaying, containerHeight, pattern?.length, prevPattern?.length, nextPattern?.length, showGhostPatterns]);

  // Memoize channel colors - same for all rows, only changes when pattern changes
  const channelColors = useMemo(() => {
    if (!pattern) return [];
    return pattern.channels.map((channel) => channel.color);
  }, [pattern]);

  // Helper to extract row cells from a pattern
  const extractRowCells = useCallback((p: typeof pattern) => {
    if (!p) return [];
    const data: TrackerCell[][] = [];
    for (let i = 0; i < p.length; i++) {
      const rowCells = p.channels.map((channel) =>
        channel.rows[i] || { note: null, instrument: null, volume: null, effect: null, accent: false, slide: false }
      );
      data.push(rowCells);
    }
    return data;
  }, []);

  // Memoize row cells data for current, previous, and next patterns
  const rowCellsData = useMemo(() => extractRowCells(pattern), [pattern, extractRowCells]);
  const prevRowCellsData = useMemo(() => extractRowCells(prevPattern), [prevPattern, extractRowCells]);
  const nextRowCellsData = useMemo(() => extractRowCells(nextPattern), [nextPattern, extractRowCells]);

  // Calculate row opacity based on position in viewport (uses virtual row index for positioning)
  // Rows near edges fade out slightly for visual depth
  // During playback, return full opacity (the transform handles positioning)
  const getRowOpacity = useCallback((virtualIndex: number) => {
    if (!isReady) return 1;
    // During playback, use full opacity - the CSS fade overlays handle edge fading
    if (isPlaying) return 1;

    // Calculate where this virtual row appears in the viewport
    const rowTop = virtualIndex * ROW_HEIGHT + scrollOffset;
    const viewportCenter = containerHeight / 2;
    const distanceFromCenter = Math.abs(rowTop + ROW_HEIGHT / 2 - viewportCenter);
    const maxDistance = containerHeight / 2;

    // Gentle fade at edges, full opacity in center
    const opacity = Math.max(0.4, 1 - (distanceFromCenter / maxDistance) * 0.6);
    return opacity;
  }, [scrollOffset, isPlaying, containerHeight, isReady]);

  // Channel context menu handlers
  const handleFillPattern = useCallback((channelIndex: number, generatorType: GeneratorType) => {
    if (!pattern) return;
    const generator = GENERATORS[generatorType];
    if (!generator) return;

    const channel = pattern.channels[channelIndex];
    const instrumentId = channel.instrumentId ?? 1;
    const cells = generator.generate({
      patternLength: pattern.length,
      instrumentId,
      note: 'C-4', // Default note
      velocity: 0x40,
    });

    cells.forEach((cell, row) => {
      setCell(channelIndex, row, cell);
    });
  }, [pattern, setCell]);

  const handleClearChannel = useCallback((channelIndex: number) => {
    if (!pattern) return;
    for (let row = 0; row < pattern.length; row++) {
      setCell(channelIndex, row, {
        note: null,
        instrument: null,
        volume: null,
        effect: null,
      });
    }
  }, [pattern, setCell]);

  const handleCopyChannel = useCallback((channelIndex: number) => {
    // TODO: Implement channel clipboard
    console.log('Copy channel', channelIndex);
  }, []);

  const handlePasteChannel = useCallback((channelIndex: number) => {
    // TODO: Implement channel clipboard
    console.log('Paste channel', channelIndex);
  }, []);

  const handleTranspose = useCallback((channelIndex: number, semitones: number) => {
    if (!pattern) return;
    const noteNames = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

    for (let row = 0; row < pattern.length; row++) {
      const cell = pattern.channels[channelIndex].rows[row];
      if (cell.note && cell.note !== '===' && cell.note !== '...') {
        const noteName = cell.note.substring(0, 2);
        const octave = parseInt(cell.note.substring(2));
        const noteIndex = noteNames.indexOf(noteName);
        if (noteIndex === -1) continue;

        const newNoteIndex = (noteIndex + semitones + 120) % 12;
        const octaveOffset = Math.floor((noteIndex + semitones) / 12);
        const newOctave = Math.max(0, Math.min(9, octave + octaveOffset));
        const newNote = `${noteNames[newNoteIndex]}${newOctave}`;

        setCell(channelIndex, row, { ...cell, note: newNote as any });
      }
    }
  }, [pattern, setCell]);

  const handleHumanize = useCallback((channelIndex: number) => {
    if (!pattern) return;
    for (let row = 0; row < pattern.length; row++) {
      const cell = pattern.channels[channelIndex].rows[row];
      if (cell.volume !== null) {
        const variation = Math.floor(Math.random() * 8) - 4; // ±4
        const newVolume = Math.max(0x10, Math.min(0x40, cell.volume + variation));
        setCell(channelIndex, row, { ...cell, volume: newVolume });
      }
    }
  }, [pattern, setCell]);

  const handleInterpolate = useCallback((channelIndex: number) => {
    // TODO: Open interpolate dialog
    console.log('Interpolate channel', channelIndex);
  }, []);

  // Handle manual scroll to allow user override
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!isPlaying) {
      e.preventDefault();
      const delta = Math.sign(e.deltaY) * 2; // Half sensitivity
      const newRow = Math.max(0, Math.min((pattern?.length || 1) - 1, cursor.rowIndex + delta));
      useTrackerStore.getState().moveCursorToRow(newRow);
    }
  }, [isPlaying, cursor.rowIndex, pattern?.length]);

  // Sync horizontal scroll between header and content
  const handleHeaderScroll = useCallback(() => {
    if (isScrollSyncing.current) return;
    if (headerScrollRef.current && contentScrollRef.current) {
      isScrollSyncing.current = true;
      contentScrollRef.current.scrollLeft = headerScrollRef.current.scrollLeft;
      requestAnimationFrame(() => { isScrollSyncing.current = false; });
    }
  }, []);

  const handleContentScroll = useCallback(() => {
    if (isScrollSyncing.current) return;
    if (headerScrollRef.current && contentScrollRef.current) {
      isScrollSyncing.current = true;
      headerScrollRef.current.scrollLeft = contentScrollRef.current.scrollLeft;
      requestAnimationFrame(() => { isScrollSyncing.current = false; });
    }
  }, []);

  // Calculate total width needed for all channels (includes accent/slide columns)
  const CHANNEL_WIDTH = 260;
  const ROW_NUM_WIDTH = 48;
  const ADD_BTN_WIDTH = 48;

  // Mobile: Use full width minus row numbers for single channel
  const [containerWidth, setContainerWidth] = useState(0);
  const mobileChannelWidth = Math.max(260, containerWidth - ROW_NUM_WIDTH - 16); // 16px padding

  const totalContentWidth = isMobile
    ? ROW_NUM_WIDTH + mobileChannelWidth
    : ROW_NUM_WIDTH + (pattern?.channels.length || 0) * CHANNEL_WIDTH +
      ((pattern?.channels.length || 0) < 16 ? ADD_BTN_WIDTH : 0);

  // Track container width for mobile
  useEffect(() => {
    if (!containerRef.current || !isMobile) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(containerRef.current);
    setContainerWidth(containerRef.current.clientWidth);

    return () => resizeObserver.disconnect();
  }, [isMobile]);

  if (!pattern) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted bg-dark-bg">
        <div className="text-center">
          <div className="text-4xl mb-4 opacity-20">♪</div>
          <div>No pattern loaded</div>
        </div>
      </div>
    );
  }

  // Mobile channel for header display
  const mobileChannel = pattern.channels[mobileChannelIndex];
  const mobileTrigger = channelTriggers[mobileChannelIndex] || { level: 0, triggered: false };

  return (
    <div
      className="flex-1 flex flex-col bg-dark-bg overflow-hidden min-w-0"
      {...(isMobile ? swipeHandlers : {})}
    >
      {/* Mobile Channel Header */}
      {isMobile && (
        <div className="flex-shrink-0 bg-dark-bgTertiary border-b border-dark-border z-20">
          <div className="flex items-center justify-between px-3 py-2">
            {/* Left nav button */}
            <button
              onClick={handleSwipeRight}
              disabled={mobileChannelIndex === 0}
              className={`
                p-2 rounded-lg transition-colors touch-target
                ${mobileChannelIndex === 0
                  ? 'text-text-muted opacity-30'
                  : 'text-text-secondary hover:bg-dark-bgHover active:bg-dark-bgTertiary'
                }
              `}
            >
              <ChevronLeft size={20} />
            </button>

            {/* Channel info */}
            <div className="flex items-center gap-3">
              <span
                className="font-bold font-mono text-lg"
                style={{ color: mobileChannel?.color || 'var(--color-accent)' }}
              >
                CH {(mobileChannelIndex + 1).toString().padStart(2, '0')}
              </span>
              <span className="text-xs text-text-muted">
                / {pattern.channels.length.toString().padStart(2, '0')}
              </span>
              <ChannelVUMeter
                level={mobileTrigger.level}
                isActive={mobileTrigger.triggered}
              />
            </div>

            {/* Right nav button */}
            <button
              onClick={handleSwipeLeft}
              disabled={mobileChannelIndex >= pattern.channels.length - 1}
              className={`
                p-2 rounded-lg transition-colors touch-target
                ${mobileChannelIndex >= pattern.channels.length - 1
                  ? 'text-text-muted opacity-30'
                  : 'text-text-secondary hover:bg-dark-bgHover active:bg-dark-bgTertiary'
                }
              `}
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Channel controls bar */}
          <div className="flex items-center justify-center gap-2 px-3 py-1 border-t border-dark-border/50">
            <button
              onClick={() => toggleChannelMute(mobileChannelIndex)}
              className={`
                px-3 py-1 rounded text-xs font-medium transition-colors touch-target
                ${mobileChannel?.muted
                  ? 'bg-accent-error/20 text-accent-error'
                  : 'text-text-muted hover:bg-dark-bgHover'
                }
              `}
            >
              {mobileChannel?.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <button
              onClick={() => toggleChannelSolo(mobileChannelIndex)}
              className={`
                px-3 py-1 rounded text-xs font-medium transition-colors touch-target
                ${mobileChannel?.solo
                  ? 'bg-accent-primary/20 text-accent-primary'
                  : 'text-text-muted hover:bg-dark-bgHover'
                }
              `}
            >
              <Headphones size={14} />
            </button>
            <ChannelColorPicker
              currentColor={mobileChannel?.color}
              onColorSelect={(color) => setChannelColor(mobileChannelIndex, color)}
            />
          </div>
        </div>
      )}

      {/* Desktop Channel Header - Sticky with controls */}
      {!isMobile && (
        <div className="flex-shrink-0 bg-dark-bgTertiary border-b border-dark-border z-20 min-w-0">
          <div className="flex min-w-0">
            {/* Row number column header */}
            <div className="flex-shrink-0 w-12 px-2 py-2 text-text-muted text-xs font-medium text-center border-r border-dark-border flex items-center justify-center">
              ROW
            </div>

            {/* Scrollable channel headers - scrollbar hidden, synced with content */}
            <div
              ref={headerScrollRef}
              onScroll={handleHeaderScroll}
              className="flex-1 min-w-0 overflow-x-auto scrollbar-hidden"
            >
              <div className="flex" style={{ minWidth: totalContentWidth - ROW_NUM_WIDTH }}>
                {pattern.channels.map((channel, idx) => {
                const trigger = channelTriggers[idx] || { level: 0, triggered: false };
                return (
                  <div
                    key={channel.id}
                    className={`
                      flex-shrink-0 min-w-[260px] flex items-center justify-between gap-2 px-3 py-1.5
                      border-r border-dark-border transition-colors relative
                      ${channel.muted ? 'opacity-50' : ''}
                      ${channel.solo ? 'bg-accent-primary/10' : ''}
                    `}
                    style={{
                      backgroundColor: channel.color ? `${channel.color}15` : undefined,
                      boxShadow: channel.color ? `inset 3px 0 0 ${channel.color}` : undefined,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      {/* Channel number */}
                      <span
                        className="font-bold font-mono text-sm"
                        style={{ color: channel.color || 'var(--color-accent)' }}
                      >
                        {(idx + 1).toString().padStart(2, '0')}
                      </span>

                      {/* VU Meter - ProTracker style */}
                      <ChannelVUMeter
                        level={trigger.level}
                        isActive={trigger.triggered}
                      />
                    </div>

                    {/* Channel controls */}
                    <div className="flex items-center gap-1">
                      {/* Channel context menu dropdown */}
                      <ChannelContextMenu
                        channelIndex={idx}
                        channel={channel}
                        patternId={pattern.id}
                        patternLength={pattern.length}
                        onFillPattern={handleFillPattern}
                        onClearChannel={handleClearChannel}
                        onCopyChannel={handleCopyChannel}
                        onPasteChannel={handlePasteChannel}
                        onTranspose={handleTranspose}
                        onHumanize={handleHumanize}
                        onInterpolate={handleInterpolate}
                      />
                      <ChannelColorPicker
                        currentColor={channel.color}
                        onColorSelect={(color) => setChannelColor(idx, color)}
                      />
                      <button
                        onClick={() => toggleChannelMute(idx)}
                        className={`p-1 rounded transition-colors ${
                          channel.muted
                            ? 'bg-accent-error/20 text-accent-error'
                            : 'text-text-muted hover:text-text-primary hover:bg-dark-bgHover'
                        }`}
                        title={channel.muted ? 'Unmute' : 'Mute'}
                        aria-pressed={channel.muted}
                        aria-label={`${channel.muted ? 'Unmute' : 'Mute'} channel ${idx + 1}`}
                      >
                        {channel.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                      </button>
                      <button
                        onClick={() => toggleChannelSolo(idx)}
                        className={`p-1 rounded transition-colors ${
                          channel.solo
                            ? 'bg-accent-primary/20 text-accent-primary'
                            : 'text-text-muted hover:text-text-primary hover:bg-dark-bgHover'
                        }`}
                        title={channel.solo ? 'Unsolo' : 'Solo'}
                        aria-pressed={channel.solo}
                        aria-label={`${channel.solo ? 'Unsolo' : 'Solo'} channel ${idx + 1}`}
                      >
                        <Headphones size={12} />
                      </button>
                      {pattern.channels.length > 1 && (
                        <button
                          onClick={() => removeChannel(idx)}
                          className="p-1 rounded text-text-muted hover:text-accent-error hover:bg-dark-bgHover transition-colors"
                          title="Remove Channel"
                        >
                          <Minus size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Add channel button */}
              {pattern.channels.length < 16 && (
                <button
                  onClick={addChannel}
                  className="flex-shrink-0 w-12 flex items-center justify-center border-r border-dark-border
                    text-text-muted hover:text-accent-primary hover:bg-dark-bgHover transition-colors"
                  title="Add Channel"
                >
                  <Plus size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Pattern Grid with smooth scrolling */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden"
        onWheel={handleWheel}
      >
        {/* Fixed center edit bar - always vertically centered using CSS */}
        <div
          className="absolute left-0 right-0 pointer-events-none z-40"
          style={{
            top: '50%',
            transform: 'translateY(-50%)',
            height: ROW_HEIGHT,
            backgroundColor: isCyanTheme ? 'rgba(0, 255, 255, 0.2)' : 'rgba(239, 68, 68, 0.2)',
          }}
        />

        {/* Fixed caret overlay - never moves vertically, only horizontally */}
        {!isPlaying && pattern && (() => {
          const ROW_NUM_WIDTH = 48; // Width of row number column
          const CHANNEL_WIDTH = isMobile ? mobileChannelWidth : 260;
          const CELL_GAP = 4; // gap-1 = 4px

          // Calculate cell widths (approximate from TrackerRow)
          const NOTE_WIDTH = 42; // 3ch ~ 42px for monospace
          const INSTRUMENT_WIDTH = 28; // 2ch
          const VOLUME_WIDTH = 28; // 2ch
          const EFFECT_WIDTH = 42; // 3ch
          const ACCENT_WIDTH = 24;

          // Base position: row number + channel offset
          const channelIndex = isMobile ? 0 : cursor.channelIndex; // Mobile always shows channel at index 0
          let caretX = ROW_NUM_WIDTH + (channelIndex * CHANNEL_WIDTH) + 8; // +8 for channel padding

          // Add offset based on column type
          switch (cursor.columnType) {
            case 'note':
              // caretX stays at start
              break;
            case 'instrument':
              caretX += NOTE_WIDTH + CELL_GAP;
              break;
            case 'volume':
              caretX += NOTE_WIDTH + CELL_GAP + INSTRUMENT_WIDTH + CELL_GAP;
              break;
            case 'effect':
              caretX += NOTE_WIDTH + CELL_GAP + INSTRUMENT_WIDTH + CELL_GAP + VOLUME_WIDTH + CELL_GAP;
              break;
            case 'accent':
              caretX += NOTE_WIDTH + CELL_GAP + INSTRUMENT_WIDTH + CELL_GAP + VOLUME_WIDTH + CELL_GAP + EFFECT_WIDTH + CELL_GAP;
              break;
            case 'slide':
              caretX += NOTE_WIDTH + CELL_GAP + INSTRUMENT_WIDTH + CELL_GAP + VOLUME_WIDTH + CELL_GAP + EFFECT_WIDTH + CELL_GAP + ACCENT_WIDTH + CELL_GAP;
              break;
          }

          // Get cell width for the current column
          let caretWidth = NOTE_WIDTH;
          switch (cursor.columnType) {
            case 'instrument':
              caretWidth = INSTRUMENT_WIDTH;
              break;
            case 'volume':
              caretWidth = VOLUME_WIDTH;
              break;
            case 'effect':
              caretWidth = EFFECT_WIDTH;
              break;
            case 'accent':
            case 'slide':
              caretWidth = ACCENT_WIDTH;
              break;
          }

          return (
            <div
              className="absolute pointer-events-none z-50"
              style={{
                top: '50%',
                transform: 'translateY(-50%)',
                left: caretX,
                width: caretWidth,
                height: ROW_HEIGHT,
                border: `2px solid ${isCyanTheme ? '#00ffff' : '#ef4444'}`,
                borderRadius: '2px',
                backgroundColor: isCyanTheme ? 'rgba(0, 255, 255, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                transition: 'left 0.08s ease-out, width 0.08s ease-out',
              }}
            />
          );
        })()}

        {/* VU Meters - Heart Tracker style, extend UP from edit bar */}
        <div
          className="absolute left-0 right-0 pointer-events-none z-20"
          style={{
            top: 0,
            height: `calc(50% - ${ROW_HEIGHT / 2}px)`,
          }}
        >
          <ChannelVUMeters />
        </div>

        {/* Fade overlay at top */}
        <div
          className="absolute top-0 left-0 right-0 h-24 pointer-events-none z-10"
          style={{
            background: 'linear-gradient(to bottom, rgba(10,10,11,0.9), transparent)',
          }}
        />

        {/* Fade overlay at bottom */}
        <div
          className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none z-10"
          style={{
            background: 'linear-gradient(to top, rgba(10,10,11,0.9), transparent)',
          }}
        />

        {/* Scrollable content with horizontal scroll */}
        <div
          ref={contentScrollRef}
          onScroll={handleContentScroll}
          className="h-full overflow-x-auto overflow-y-hidden scrollbar-modern relative z-0"
        >
          <div
            ref={contentRef}
            className="relative"
            style={{
              height: containerHeight,
              minWidth: totalContentWidth,
              // During playback, animation loop handles transform directly via DOM
              // When stopped, use React-managed scrollOffset
              transform: isPlaying ? undefined : `translate3d(0, ${scrollOffset}px, 0)`,
              // No transition - instant response for crisp keyboard navigation
              transition: 'none',
              willChange: 'transform',
              backfaceVisibility: 'hidden',
            }}
          >
            {/* Automation Lanes Overlay - render for all parameters with data */}
            {['cutoff', 'resonance', 'envMod', 'decay', 'accent', 'overdrive', 'volume', 'pan'].map((param) => (
              <AutomationLanes
                key={param}
                patternId={pattern.id}
                patternLength={pattern.length}
                rowHeight={ROW_HEIGHT}
                channelCount={pattern.channels.length}
                channelWidth={CHANNEL_WIDTH}
                rowNumWidth={ROW_NUM_WIDTH}
                scrollOffset={0}
                parameter={param}
                prevPatternId={prevPattern?.id}
                prevPatternLength={prevPattern?.length}
                nextPatternId={nextPattern?.id}
                nextPatternLength={nextPattern?.length}
              />
            ))}

            {/* Render visible rows with wrapping support */}
            {visibleVirtualRows.map(({ virtualIndex, actualIndex, patternType }) => {
              // Use memoized row cells data based on which pattern this row belongs to
              const allRowCells = patternType === 'prev'
                ? (prevRowCellsData[actualIndex] || [])
                : patternType === 'next'
                  ? (nextRowCellsData[actualIndex] || [])
                  : (rowCellsData[actualIndex] || []);

              // On mobile, only show the selected channel
              const rowCells = isMobile
                ? [allRowCells[mobileChannelIndex]].filter(Boolean)
                : allRowCells;

              // Mobile: only show the selected channel's color
              const rowChannelColors = isMobile
                ? [channelColors[mobileChannelIndex]]
                : channelColors;

              // Never show cursor on rows - caret is rendered as a fixed overlay on the edit bar
              const isCursorRow = false;

              // Base opacity from viewport position
              let opacity = getRowOpacity(virtualIndex);
              // Apply dimming to adjacent pattern rows only when looping (pattern mode)
              // When playing full song, show all patterns at full opacity
              if (patternType !== 'current' && isLooping) {
                // Cyan theme: use full opacity, rely on CSS for visual distinction
                // Other themes: dim to 50%
                opacity = isCyanTheme ? 1 : opacity * 0.5;
              }

              // Ghost row detection
              const isGhostRow = patternType !== 'current';

              // Row position - virtualIndex determines vertical position
              const rowTop = virtualIndex * ROW_HEIGHT;

              return (
                <div
                  key={`row-${patternType}-${virtualIndex}`}
                  className={`absolute left-0 flex ${isGhostRow ? 'ghost-row' : ''}`}
                  data-pattern-type={patternType}
                  style={{
                    top: rowTop,
                    height: ROW_HEIGHT,
                    minWidth: totalContentWidth,
                    opacity,
                    transition: isReady ? 'opacity 0.08s linear' : 'none',
                    contain: 'layout style paint',
                  }}
                  onContextMenu={(e) => {
                    // Determine which channel was clicked based on x position
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left - 40; // 40px for row number
                    const channelWidth = isMobile ? mobileChannelWidth : 180; // approximate channel width
                    const clickedChannel = isMobile
                      ? mobileChannelIndex
                      : Math.max(0, Math.min(pattern.channels.length - 1, Math.floor(x / channelWidth)));
                    cellContextMenu.openMenu(e, actualIndex, clickedChannel);
                  }}
                >
                  <TrackerRow
                    rowIndex={actualIndex}
                    cells={rowCells}
                    channelColors={rowChannelColors}
                    cursor={cursor}
                    isCursorRow={isCursorRow}
                    isCurrentPlaybackRow={false}
                    channelWidth={isMobile ? mobileChannelWidth : undefined}
                    baseChannelIndex={isMobile ? mobileChannelIndex : 0}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Status bar - separate component to isolate currentRow updates */}
      <StatusBar
        patternLength={pattern.length}
        channelCount={pattern.channels.length}
        cursorChannel={cursor.channelIndex}
      />

      {/* Cell context menu */}
      <CellContextMenu
        position={cellContextMenu.position}
        onClose={cellContextMenu.closeMenu}
        rowIndex={cellContextMenu.rowIndex}
        channelIndex={cellContextMenu.channelIndex}
      />
    </div>
  );
};

// Memoize to prevent unnecessary re-renders from parent component updates
export const PatternEditor = React.memo(PatternEditorComponent);
PatternEditor.displayName = 'PatternEditor';
