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
import { useUIStore } from '@stores/useUIStore';
import { GENERATORS, type GeneratorType } from '@utils/patternGenerators';
import { useShallow } from 'zustand/react/shallow';
import { Plus, Minus, Volume2, VolumeX, Headphones, ChevronLeft, ChevronRight, ChevronsDownUp } from 'lucide-react';
import { useResponsiveSafe } from '@contexts/ResponsiveContext';
import { useSwipeGesture } from '@hooks/useSwipeGesture';
import { getToneEngine } from '@engine/ToneEngine';
import type { TrackerCell } from '@typedefs';

interface ChannelTrigger {
  level: number;
  triggered: boolean;
}

const ROW_HEIGHT = 28; // Height of each row in pixels
const VISIBLE_ROWS_BUFFER = 10; // Extra rows to render above/below viewport

interface PatternEditorProps {
  onAcidGenerator?: (channelIndex: number) => void;
}

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
  const insertMode = useTrackerStore((state) => state.insertMode);
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
        <span className="text-text-muted" title={insertMode ? 'Insert mode: new data shifts rows down (press Insert to toggle)' : 'Overwrite mode: new data replaces existing (press Insert to toggle)'}>
          Mode: <span className={insertMode ? 'text-accent-warning' : 'text-accent-primary'}>{insertMode ? 'INS' : 'OVR'}</span>
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

const PatternEditorComponent: React.FC<PatternEditorProps> = ({ onAcidGenerator }) => {
  const { isMobile } = useResponsiveSafe();

  // CRITICAL OPTIMIZATION: Use selectors to prevent re-renders on every pattern change
  // Only subscribe to specific data needed, not entire patterns array
  const pattern = useTrackerStore((state) => state.patterns[state.currentPatternIndex]);
  const cursor = useTrackerStore((state) => state.cursor);
  const showGhostPatterns = useTrackerStore((state) => state.showGhostPatterns);

  // Get adjacent patterns for ghost rendering (memoized to prevent flicker)
  const prevPattern = useTrackerStore((state) => {
    const prevIndex = state.currentPatternIndex > 0
      ? state.currentPatternIndex - 1
      : state.patterns.length - 1;
    return state.patterns[prevIndex];
  });
  const nextPattern = useTrackerStore((state) => {
    const nextIndex = state.currentPatternIndex < state.patterns.length - 1
      ? state.currentPatternIndex + 1
      : 0;
    return state.patterns[nextIndex];
  });

  // Get actions (these don't cause re-renders)
  const addChannel = useTrackerStore((state) => state.addChannel);
  const removeChannel = useTrackerStore((state) => state.removeChannel);
  const toggleChannelMute = useTrackerStore((state) => state.toggleChannelMute);
  const toggleChannelSolo = useTrackerStore((state) => state.toggleChannelSolo);
  const setChannelColor = useTrackerStore((state) => state.setChannelColor);
  const setCell = useTrackerStore((state) => state.setCell);
  const moveCursorToChannel = useTrackerStore((state) => state.moveCursorToChannel);
  const copyTrack = useTrackerStore((state) => state.copyTrack);
  const cutTrack = useTrackerStore((state) => state.cutTrack);
  const pasteTrack = useTrackerStore((state) => state.pasteTrack);
  // Use selectors to minimize re-renders during playback
  // Only subscribe to isPlaying and continuousRow - NOT currentRow
  // currentRow updates frequently and is only needed by the StatusBar component
  const { isPlaying, continuousRow, isLooping, smoothScrolling, currentRow, speed } = useTransportStore(
    useShallow((state) => ({
      isPlaying: state.isPlaying,
      continuousRow: state.continuousRow,
      isLooping: state.isLooping,
      smoothScrolling: state.smoothScrolling,
      currentRow: state.currentRow, // Needed for stepped scrolling mode
      speed: state.speed, // Ticks per row for accurate visual sync
    }))
  );

  // Get current theme for ghost row visibility adjustments
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const rowNumbersRef = useRef<HTMLDivElement>(null); // Row numbers container
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(600);
  const [isReady, setIsReady] = useState(false);
  const [channelTriggers, setChannelTriggers] = useState<ChannelTrigger[]>([]);
  const lastTriggerRowRef = useRef<number>(-1);
  const isScrollSyncing = useRef(false);

  // Custom scrollbar state
  const [customScrollThumbLeft, setCustomScrollThumbLeft] = useState(0);
  const [customScrollThumbWidth, setCustomScrollThumbWidth] = useState(100);
  const customScrollTrackRef = useRef<HTMLDivElement>(null);
  const isDraggingScrollbar = useRef(false);

  // Cell context menu
  const cellContextMenu = useCellContextMenu();

  // Smooth scroll - use ref for direct DOM updates (avoids React re-render overhead)
  const animationFrameRef = useRef<number | null>(null);
  const playbackStartTimeRef = useRef(0);
  const playbackStartRowRef = useRef(0);
  const speedRef = useRef(speed); // Track speed without restarting animation
  const containerHeightRef = useRef(0); // Cache container height to avoid layout thrashing

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

  // Debug logging disabled for performance
  // Re-enable if needed for debugging pattern data issues
  // useEffect(() => {
  //     currentPatternIndex,
  //     hasPattern: !!pattern,
  //     patternLength: pattern?.length,
  //     channelsCount: pattern?.channels?.length,
  //   });
  // }, [currentPatternIndex, pattern]);

  // For non-playing state, use cursor position
  // During playback, the animation loop handles scroll directly via DOM
  const scrollRow = cursor.rowIndex;

  // Track note triggers for VU meters - only when stopped (editing)
  // When NOT playing: update triggers based on cursor row (pattern preview)
  useEffect(() => {
    if (!pattern || isPlaying) return;

    const targetRow = cursor.rowIndex;
    if (lastTriggerRowRef.current === targetRow) return;
    lastTriggerRowRef.current = targetRow;

    const newTriggers: ChannelTrigger[] = pattern.channels.map((channel) => {
      const cell = channel.rows[targetRow];
      // XM format: note 0 = empty, 97 = note off, 1-96 = valid notes
      const hasNote = cell?.note && cell.note !== 0 && cell.note !== 97;
      // Use volume if set, otherwise default to 0.8
      // XM volume: 0x10-0x50 = volume 0-64, need to extract actual volume
      let volume = 0.8;
      if (cell?.volume != null && cell.volume > 0) {
        if (cell.volume >= 0x10 && cell.volume <= 0x50) {
          volume = (cell.volume - 0x10) / 64;
        } else {
          volume = cell.volume / 64;
        }
      }

      return {
        level: hasNote ? Math.min(1, volume * 1.2) : 0,
        triggered: hasNote || false,
      };
    });

    setChannelTriggers(newTriggers);
  }, [cursor.rowIndex, pattern, isPlaying]);

  // When PLAYING: poll ToneEngine for real-time trigger levels
  const vuPollRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isPlaying || !pattern) {
      // Clear polling when not playing
      if (vuPollRef.current) {
        cancelAnimationFrame(vuPollRef.current);
        vuPollRef.current = null;
      }
      return;
    }

    const engine = getToneEngine();
    const numChannels = pattern.channels.length;

    const pollTriggers = () => {
      const levels = engine.getChannelTriggerLevels(numChannels);
      const newTriggers: ChannelTrigger[] = levels.map((level) => ({
        level,
        triggered: level > 0.01,
      }));
      setChannelTriggers(newTriggers);
      vuPollRef.current = requestAnimationFrame(pollTriggers);
    };

    vuPollRef.current = requestAnimationFrame(pollTriggers);

    return () => {
      if (vuPollRef.current) {
        cancelAnimationFrame(vuPollRef.current);
        vuPollRef.current = null;
      }
    };
  }, [isPlaying, pattern]);

  // Wait for first proper measurement before enabling transitions
  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Initialize animation when playback starts (only once per playback session)
  const isPlayingRef = useRef(isPlaying);
  const smoothScrollingRef = useRef(smoothScrolling);

  // Update speed ref when it changes (without restarting animation)
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

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
    const rowNumbersEl = rowNumbersRef.current;
    // STEPPED SCROLLING MODE: Classic tracker style, jumps row-by-row
    const currentHeight = containerRef.current?.clientHeight || containerHeight;
    const halfContainer = currentHeight / 2;
    const offset = halfContainer - (currentRow * ROW_HEIGHT) - (ROW_HEIGHT / 2);
    contentEl.style.transform = `translate3d(0, ${offset}px, 0)`;
    // Also update row numbers to stay in sync
    if (rowNumbersEl) {
      rowNumbersEl.style.transform = `translate3d(0, ${offset}px, 0)`;
    }
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

    const rowNumbersEl = rowNumbersRef.current;

    // Cache container height once at start (avoid layout thrashing every frame)
    if (containerRef.current) {
      containerHeightRef.current = containerRef.current.clientHeight;
    }

    const animate = () => {
      if (!contentEl) return;

      // Use actual tracker timing: tickInterval = 2.5 / BPM, secondsPerRow = tickInterval * speed
      // This matches TrackerReplayer's timing exactly
      // Use speedRef to get live speed updates without restarting animation
      const currentBpm = transport.bpm.value;
      const tickInterval = 2.5 / currentBpm;
      const secondsPerRow = tickInterval * speedRef.current;

      // Calculate elapsed time since animation started
      const elapsedMs = performance.now() - playbackStartTimeRef.current;
      const elapsedSeconds = elapsedMs / 1000;

      // Calculate how many rows we've scrolled since start
      const rowsElapsed = elapsedSeconds / secondsPerRow;

      // Continuous row position - wrap around pattern length for seamless looping
      const rawRowPosition = playbackStartRowRef.current + rowsElapsed;
      // Use modulo to wrap, keeping scroll in valid range
      const wrappedRowPosition = rawRowPosition % patternLength;

      // Use cached container height to avoid layout thrashing
      const halfContainer = containerHeightRef.current / 2;
      const offset = halfContainer - (wrappedRowPosition * ROW_HEIGHT) - (ROW_HEIGHT / 2);
      contentEl.style.transform = `translate3d(0, ${offset}px, 0)`;

      // Also update row numbers to stay in sync during smooth scrolling
      if (rowNumbersEl) {
        rowNumbersEl.style.transform = `translate3d(0, ${offset}px, 0)`;
      }

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
    // Speed is tracked via ref so animation doesn't restart on Fxx commands
  }, [isPlaying, pattern, smoothScrolling]);

  // Calculate the scroll offset for the pattern
  // Active row is ALWAYS centered at the edit bar, pattern wraps seamlessly
  const scrollOffset = useMemo(() => {
    if (!isReady || !pattern || !containerHeight || containerHeight <= 0) return 0;

    const halfContainer = containerHeight / 2;
    // Center the scroll row under the edit bar
    // Use scrollRow (continuous) for smooth looping, not activeRow
    return halfContainer - (scrollRow * ROW_HEIGHT) - (ROW_HEIGHT / 2);
  }, [scrollRow, containerHeight, isReady, pattern]);

  // Track container size using ResizeObserver for accurate sizing
  // This properly handles when other elements (like TB303KnobPanel) resize
  // Enhanced with debouncing to handle rapid layout changes
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }


    let frameId: number | null = null;
    let debounceTimer: number | null = null;

    const updateHeight = () => {
      if (!containerRef.current) return;

      const height = containerRef.current.clientHeight;

      if (height > 0) {
        setContainerHeight(height);
      } else {
        console.warn('[PatternEditor] Measured 0 height, retrying...');
        // Retry on next frame
        frameId = requestAnimationFrame(updateHeight);
      }
    };

    const debouncedUpdate = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (frameId) cancelAnimationFrame(frameId);

      // Wait for layout to settle before measuring (one frame ~16ms)
      debounceTimer = setTimeout(() => {
        frameId = requestAnimationFrame(updateHeight);
      }, 16); // One frame delay to let flex layout complete
    };

    // ResizeObserver for container size changes
    const resizeObserver = new ResizeObserver(() => {
      debouncedUpdate();
      // Also update cached height for smooth scrolling animation
      if (containerRef.current) {
        containerHeightRef.current = containerRef.current.clientHeight;
      }
    });

    resizeObserver.observe(containerRef.current);

    // Initial measurement
    frameId = requestAnimationFrame(updateHeight);
    // Initialize cached height for smooth scrolling
    containerHeightRef.current = containerRef.current.clientHeight;

    // Cleanup
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      if (debounceTimer) clearTimeout(debounceTimer);
      resizeObserver.disconnect();
    };
  }, []);

  // Immediately update height when mobile/desktop layout changes
  useEffect(() => {
    if (!containerRef.current) return;

    // Use requestAnimationFrame to measure after layout completes
    const frameId = requestAnimationFrame(() => {
      if (!containerRef.current) return;
      const height = containerRef.current.clientHeight;
      if (height > 0) {
        setContainerHeight(height);
      }
    });

    return () => cancelAnimationFrame(frameId);
  }, [isMobile]);

  // Sync custom scrollbar dimensions when header or channels change
  useEffect(() => {
    if (!headerScrollRef.current || !customScrollTrackRef.current) return;

    const updateScrollbarDimensions = () => {
      if (!headerScrollRef.current || !customScrollTrackRef.current) return;

      const scrollWidth = headerScrollRef.current.scrollWidth;
      const clientWidth = headerScrollRef.current.clientWidth;
      const scrollLeft = headerScrollRef.current.scrollLeft;
      const trackWidth = customScrollTrackRef.current.clientWidth;

      if (scrollWidth > clientWidth) {
        const thumbWidth = Math.max(30, (clientWidth / scrollWidth) * trackWidth);
        const maxScroll = scrollWidth - clientWidth;
        const maxThumbLeft = trackWidth - thumbWidth;
        const scrollPercent = scrollLeft / maxScroll;

        setCustomScrollThumbWidth(thumbWidth);
        setCustomScrollThumbLeft(scrollPercent * maxThumbLeft);
      } else {
        // No scrolling needed, hide thumb by making it full width
        setCustomScrollThumbWidth(trackWidth);
        setCustomScrollThumbLeft(0);
      }
    };

    // Update immediately
    updateScrollbarDimensions();

    // Update on resize
    const resizeObserver = new ResizeObserver(updateScrollbarDimensions);
    resizeObserver.observe(headerScrollRef.current);

    return () => resizeObserver.disconnect();
  }, [pattern?.channels.length]);

  // Validate containerHeight matches actual rendered height (development only)
  useEffect(() => {
    if (import.meta.env.MODE === 'production') return;

    const validateHeight = () => {
      if (!containerRef.current) return;

      const actualHeight = containerRef.current.clientHeight;
      const diff = Math.abs(actualHeight - containerHeight);

      if (diff > 10) {
        console.error('[PatternEditor] HEIGHT MISMATCH!', {
          containerHeight,
          actualHeight,
          difference: diff,
          containerStyles: window.getComputedStyle(containerRef.current)
        });
      }
    };

    const interval = setInterval(validateHeight, 2000);
    return () => clearInterval(interval);
  }, [containerHeight]);

  // Calculate which virtual rows are visible (always wraps for seamless looping)
  // During playback, includes rows from previous/next patterns for preview
  // NOTE: prevPattern and nextPattern are defined via selectors at the top of the component
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
    // Guard against invalid containerHeight
    if (!containerHeight || containerHeight <= 0) return 1;

    // Calculate where this virtual row appears in the viewport
    const rowTop = virtualIndex * ROW_HEIGHT + scrollOffset;
    const viewportCenter = containerHeight / 2;
    const distanceFromCenter = Math.abs(rowTop + ROW_HEIGHT / 2 - viewportCenter);
    const maxDistance = containerHeight / 2;

    // Guard against division by zero
    if (maxDistance <= 0) return 1;

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
      note: 49, // XM format: C-4 = (4 * 12) + 0 + 1 = 49
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
        note: 0,        // XM format: 0 = no note
        instrument: 0,  // XM format: 0 = no instrument
        volume: 0,      // XM format: 0x00 = nothing
        effTyp: 0,      // XM format: 0 = no effect
        eff: 0,         // XM format: 0x00 = no parameter
      });
    }
  }, [pattern, setCell]);

  // FT2 track operations - copy/cut/paste entire channel
  const handleCopyChannel = useCallback((channelIndex: number) => {
    copyTrack(channelIndex);
  }, [copyTrack]);

  const handleCutChannel = useCallback((channelIndex: number) => {
    cutTrack(channelIndex);
  }, [cutTrack]);

  const handlePasteChannel = useCallback((channelIndex: number) => {
    pasteTrack(channelIndex);
  }, [pasteTrack]);

  const handleTranspose = useCallback((channelIndex: number, semitones: number) => {
    if (!pattern) return;

    for (let row = 0; row < pattern.length; row++) {
      const cell = pattern.channels[channelIndex].rows[row];

      // XM format: 0 = no note, 97 = note off, 1-96 = valid notes
      if (cell.note && cell.note !== 0 && cell.note !== 97) {
        // XM note format: (octave * 12) + semitone + 1
        // So to transpose, we just add/subtract semitones
        let newNote = cell.note + semitones;

        // Clamp to valid XM range (1-96)
        newNote = Math.max(1, Math.min(96, newNote));

        setCell(channelIndex, row, { ...cell, note: newNote });
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
    // Interpolate volume values across the channel
    // Find first and last non-zero volume values and interpolate between them
    if (!pattern) return;

    const channel = pattern.channels[channelIndex];
    if (!channel) return;

    let firstRow = -1;
    let lastRow = -1;
    let firstVolume = 0;
    let lastVolume = 0;

    // Find first and last cells with volume data
    for (let row = 0; row < pattern.length; row++) {
      const cell = channel.rows[row];
      if (cell.volume !== null && cell.volume >= 0x10 && cell.volume <= 0x50) {
        if (firstRow === -1) {
          firstRow = row;
          firstVolume = cell.volume;
        }
        lastRow = row;
        lastVolume = cell.volume;
      }
    }

    // Need at least 2 rows with volume to interpolate
    if (firstRow === -1 || lastRow === -1 || lastRow - firstRow < 2) {
      console.log('Interpolate: Need at least 2 rows with volume data');
      return;
    }

    // Interpolate volume values between first and last
    const rowCount = lastRow - firstRow;
    for (let row = firstRow + 1; row < lastRow; row++) {
      const t = (row - firstRow) / rowCount;
      const interpolatedVolume = Math.round(firstVolume + (lastVolume - firstVolume) * t);
      const cell = channel.rows[row];
      setCell(channelIndex, row, { ...cell, volume: interpolatedVolume });
    }

    console.log(`Interpolated volume ${firstVolume}→${lastVolume} across rows ${firstRow}→${lastRow}`);
  }, [pattern, setCell]);

  // Handle manual scroll to allow user override
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!isPlaying) {
      e.preventDefault();
      const delta = Math.sign(e.deltaY) * 2; // Half sensitivity
      const newRow = Math.max(0, Math.min((pattern?.length || 1) - 1, cursor.rowIndex + delta));
      useTrackerStore.getState().moveCursorToRow(newRow);
    }
  }, [isPlaying, cursor.rowIndex, pattern?.length]);

  // Sync horizontal scroll between header and content with debouncing
  const scrollSyncTimeoutRef = useRef<number | null>(null);

  const handleHeaderScroll = useCallback(() => {
    if (isScrollSyncing.current) return;
    if (headerScrollRef.current && contentScrollRef.current) {
      const scrollLeft = headerScrollRef.current.scrollLeft;

      // Clear any pending sync
      if (scrollSyncTimeoutRef.current !== null) {
        cancelAnimationFrame(scrollSyncTimeoutRef.current);
      }

      // Sync immediately but debounce the unlock
      isScrollSyncing.current = true;
      contentScrollRef.current.scrollLeft = scrollLeft;

      // Update custom scrollbar thumb position
      if (!isDraggingScrollbar.current) {
        const scrollWidth = headerScrollRef.current.scrollWidth;
        const clientWidth = headerScrollRef.current.clientWidth;
        const maxScroll = scrollWidth - clientWidth;
        if (maxScroll > 0) {
          const scrollPercent = scrollLeft / maxScroll;
          const trackWidth = customScrollTrackRef.current?.clientWidth || clientWidth;
          const thumbWidth = Math.max(30, (clientWidth / scrollWidth) * trackWidth);
          const maxThumbLeft = trackWidth - thumbWidth;
          setCustomScrollThumbLeft(scrollPercent * maxThumbLeft);
          setCustomScrollThumbWidth(thumbWidth);
        }
      }

      scrollSyncTimeoutRef.current = requestAnimationFrame(() => {
        scrollSyncTimeoutRef.current = null;
        isScrollSyncing.current = false;
      });
    }
  }, []);

  const handleContentScroll = useCallback(() => {
    if (isScrollSyncing.current) return;
    if (headerScrollRef.current && contentScrollRef.current) {
      const scrollLeft = contentScrollRef.current.scrollLeft;

      // Clear any pending sync
      if (scrollSyncTimeoutRef.current !== null) {
        cancelAnimationFrame(scrollSyncTimeoutRef.current);
      }

      // Sync immediately but debounce the unlock
      isScrollSyncing.current = true;
      headerScrollRef.current.scrollLeft = scrollLeft;

      scrollSyncTimeoutRef.current = requestAnimationFrame(() => {
        scrollSyncTimeoutRef.current = null;
        isScrollSyncing.current = false;
      });
    }
  }, []);

  // Custom scrollbar handlers
  const handleCustomScrollbarMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!headerScrollRef.current || !customScrollTrackRef.current) return;

    e.preventDefault();
    isDraggingScrollbar.current = true;

    const track = customScrollTrackRef.current;
    const trackRect = track.getBoundingClientRect();
    const clickX = e.clientX - trackRect.left;
    const thumbWidth = customScrollThumbWidth;

    // If clicking on thumb, start dragging from current position
    const thumbLeft = customScrollThumbLeft;
    const clickedOnThumb = clickX >= thumbLeft && clickX <= thumbLeft + thumbWidth;

    const startDragX = clickedOnThumb ? clickX - thumbLeft : thumbWidth / 2;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!headerScrollRef.current || !customScrollTrackRef.current) return;

      const moveX = moveEvent.clientX - trackRect.left;
      const newThumbLeft = Math.max(0, Math.min(trackRect.width - thumbWidth, moveX - startDragX));
      const scrollPercent = newThumbLeft / (trackRect.width - thumbWidth);

      const scrollWidth = headerScrollRef.current.scrollWidth;
      const clientWidth = headerScrollRef.current.clientWidth;
      const maxScroll = scrollWidth - clientWidth;

      headerScrollRef.current.scrollLeft = scrollPercent * maxScroll;
      setCustomScrollThumbLeft(newThumbLeft);
    };

    const handleMouseUp = () => {
      isDraggingScrollbar.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // If clicked on track (not thumb), jump to that position
    if (!clickedOnThumb) {
      const newThumbLeft = Math.max(0, Math.min(trackRect.width - thumbWidth, clickX - thumbWidth / 2));
      const scrollPercent = newThumbLeft / (trackRect.width - thumbWidth);

      const scrollWidth = headerScrollRef.current.scrollWidth;
      const clientWidth = headerScrollRef.current.clientWidth;
      const maxScroll = scrollWidth - clientWidth;

      headerScrollRef.current.scrollLeft = scrollPercent * maxScroll;
      setCustomScrollThumbLeft(newThumbLeft);
    }
  }, [customScrollThumbLeft, customScrollThumbWidth]);

  // Calculate total width needed for all channels (includes accent/slide columns)
  const CHANNEL_WIDTH = 260;
  const ROW_NUM_WIDTH = 48;

  // Calculate explicit total content width for scrolling
  // Both header and content use channels-only width since row numbers are outside scroll area
  const channelsOnlyWidth = useMemo(() => {
    if (!pattern) return 0;
    return pattern.channels.length * CHANNEL_WIDTH;
  }, [pattern?.channels.length]);

  // Mobile: Use full width minus row numbers for single channel
  const [containerWidth, setContainerWidth] = useState(0);
  const mobileChannelWidth = Math.max(260, containerWidth - ROW_NUM_WIDTH - 16); // 16px padding

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
      className="w-full flex flex-col bg-dark-bg"
      style={{
        flex: '1 1 0%',
        minHeight: 0,
        overflowY: 'hidden'
      }}
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
        <div className="flex-shrink-0 bg-dark-bgTertiary border-b border-dark-border z-20">
          <div className="flex" style={{ width: '100%' }}>
            {/* Row number column header */}
            <div className="flex-shrink-0 w-12 px-2 py-2 text-text-muted text-xs font-medium text-center border-r border-dark-border flex items-center justify-center">
              ROW
            </div>

            {/* Scrollable channel headers - synced with content */}
            <div
              ref={headerScrollRef}
              onScroll={handleHeaderScroll}
              className="overflow-x-auto scrollbar-hidden"
              style={{ flexGrow: 1, minWidth: 0 }}
            >
              <div className="flex" style={{ width: `${channelsOnlyWidth}px`, minWidth: `${channelsOnlyWidth}px` }}>
                {pattern.channels.map((channel, idx) => {
                const trigger = channelTriggers[idx] || { level: 0, triggered: false };
                return (
                  <div
                    key={channel.id}
                    className={`
                      flex-shrink-0 w-[260px] flex items-center justify-between gap-2 px-3 py-1.5
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
                      {/* Collapse channel button */}
                      <button
                        className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-dark-bgHover transition-colors"
                        title="Collapse/Expand Channel"
                      >
                        <ChevronsDownUp size={12} />
                      </button>
                      {/* Channel context menu dropdown */}
                      <ChannelContextMenu
                        channelIndex={idx}
                        channel={channel}
                        patternId={pattern.id}
                        patternLength={pattern.length}
                        onFillPattern={handleFillPattern}
                        onClearChannel={handleClearChannel}
                        onCopyChannel={handleCopyChannel}
                        onCutChannel={handleCutChannel}
                        onPasteChannel={handlePasteChannel}
                        onTranspose={handleTranspose}
                        onHumanize={handleHumanize}
                        onInterpolate={handleInterpolate}
                        onAcidGenerator={onAcidGenerator || (() => {})}
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

        {/* Custom always-visible scrollbar */}
        <div className="flex w-full">
          {/* Spacer for row number column */}
          <div className="flex-shrink-0 w-12" />

          {/* Custom scrollbar track */}
          <div
            ref={customScrollTrackRef}
            className="flex-1 bg-dark-bgSecondary border-t border-dark-border cursor-pointer"
            style={{ height: '12px', minWidth: 0 }}
            onMouseDown={handleCustomScrollbarMouseDown}
          >
            {/* Custom scrollbar thumb */}
            <div
              className="bg-accent-primary hover:bg-accent-primary/80 transition-colors"
              style={{
                height: '100%',
                width: `${customScrollThumbWidth}px`,
                transform: `translateX(${customScrollThumbLeft}px)`,
                borderRadius: '2px',
                pointerEvents: 'none',
              }}
            />
          </div>
        </div>
      </div>
      )}

      {/* Pattern Grid with smooth scrolling */}
      <div
        ref={containerRef}
        className="relative"
        style={{
          flex: '1 1 0%',
          minHeight: 0,
          overflowY: 'hidden'
        }}
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
        {/* FT2-style: Highlights individual characters within cells */}
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
          const CHAR_WIDTH = 14; // Approximate width of one monospace character

          // Base position: row number + channel offset
          const channelIndex = isMobile ? 0 : cursor.channelIndex; // Mobile always shows channel at index 0
          let caretX = ROW_NUM_WIDTH + (channelIndex * CHANNEL_WIDTH) + 8; // +8 for channel padding

          // Add offset based on column type
          // Column order: note, instrument, volume, effect, effect2, accent, slide
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
            case 'effTyp':
            case 'effParam':
              caretX += NOTE_WIDTH + CELL_GAP + INSTRUMENT_WIDTH + CELL_GAP + VOLUME_WIDTH + CELL_GAP;
              break;
            case 'effect2':
              caretX += NOTE_WIDTH + CELL_GAP + INSTRUMENT_WIDTH + CELL_GAP + VOLUME_WIDTH + CELL_GAP + EFFECT_WIDTH + CELL_GAP;
              break;
            case 'accent':
              caretX += NOTE_WIDTH + CELL_GAP + INSTRUMENT_WIDTH + CELL_GAP + VOLUME_WIDTH + CELL_GAP + EFFECT_WIDTH + CELL_GAP + EFFECT_WIDTH + CELL_GAP;
              break;
            case 'slide':
              caretX += NOTE_WIDTH + CELL_GAP + INSTRUMENT_WIDTH + CELL_GAP + VOLUME_WIDTH + CELL_GAP + EFFECT_WIDTH + CELL_GAP + EFFECT_WIDTH + CELL_GAP + ACCENT_WIDTH + CELL_GAP;
              break;
          }

          // FT2: Add character-level offset for editable columns
          let caretWidth = NOTE_WIDTH;
          if (cursor.columnType === 'instrument' || cursor.columnType === 'volume') {
            // 2-digit columns: highlight one character at digitIndex
            caretX += cursor.digitIndex * CHAR_WIDTH;
            caretWidth = CHAR_WIDTH;
          } else if (cursor.columnType === 'effTyp' || cursor.columnType === 'effParam' || cursor.columnType === 'effect2') {
            // 3-character columns (effect): highlight one character at digitIndex
            caretX += cursor.digitIndex * CHAR_WIDTH;
            caretWidth = CHAR_WIDTH;
          } else if (cursor.columnType === 'accent' || cursor.columnType === 'slide') {
            caretWidth = ACCENT_WIDTH;
          }
          // Note column keeps full width highlighting

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

        {/* Fixed row numbers column - scrolls in sync with pattern */}
        {!isMobile && (
          <div
            className="absolute left-0 overflow-hidden z-5"
            style={{
              width: `${ROW_NUM_WIDTH}px`,
              top: 0,
              bottom: 0,
            }}
          >
            <div
              ref={rowNumbersRef}
              className="relative"
              style={{
                height: containerHeight || 600,
                transform: isPlaying ? undefined : `translate3d(0, ${scrollOffset}px, 0)`,
                transition: 'none',
                willChange: 'transform',
              }}
            >
              {visibleVirtualRows.map(({ virtualIndex, actualIndex, patternType }) => {
                const useHexNumbers = useUIStore.getState().useHexNumbers;
                const rowNumber = useHexNumbers
                  ? actualIndex.toString(16).toUpperCase().padStart(2, '0')
                  : actualIndex.toString(10).padStart(2, '0');

                const rowTop = virtualIndex * ROW_HEIGHT;
                let opacity = getRowOpacity(virtualIndex);
                const isGhostRow = patternType !== 'current';
                if (isGhostRow && isLooping) {
                  opacity = isCyanTheme ? 1 : opacity * 0.5;
                }

                const getRowBgClass = () => {
                  if (actualIndex % 4 === 0) return 'bg-tracker-row-highlight';
                  return actualIndex % 2 === 0 ? 'bg-tracker-row-even' : 'bg-tracker-row-odd';
                };

                return (
                  <div
                    key={`rownum-${patternType}-${virtualIndex}`}
                    className={`absolute flex items-center justify-center text-xs font-mono border-r border-dark-border ${getRowBgClass()} ${isGhostRow ? 'ghost-row' : ''}`}
                    style={{
                      top: `${rowTop}px`,
                      left: 0,
                      width: `${ROW_NUM_WIDTH}px`,
                      height: `${ROW_HEIGHT}px`,
                      opacity,
                      color: actualIndex % 4 === 0 ? 'var(--color-text-secondary)' : 'var(--color-text-muted)',
                      fontWeight: actualIndex % 4 === 0 ? 'bold' : 'normal',
                    }}
                  >
                    {rowNumber}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Scrollable content with horizontal scroll */}
        <div
          ref={contentScrollRef}
          onScroll={handleContentScroll}
          className="absolute overflow-y-hidden scrollbar-modern z-0"
          style={{
            left: isMobile ? 0 : `${ROW_NUM_WIDTH}px`,
            right: 0,
            top: 0,
            bottom: 0,
            overflowX: 'auto'
          }}
        >
          <div
            ref={contentRef}
            className="relative"
            style={{
              width: `${isMobile ? (ROW_NUM_WIDTH + mobileChannelWidth) : (ROW_NUM_WIDTH + channelsOnlyWidth)}px`,
              minWidth: `${isMobile ? (ROW_NUM_WIDTH + mobileChannelWidth) : (ROW_NUM_WIDTH + channelsOnlyWidth)}px`,
              height: containerHeight || 600, // Fallback to 600px
              minHeight: containerHeight || 600,
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
                  className={`absolute inline-flex ${isGhostRow ? 'ghost-row' : ''}`}
                  data-pattern-type={patternType}
                  style={{
                    left: isMobile ? 0 : -ROW_NUM_WIDTH,
                    top: rowTop,
                    height: ROW_HEIGHT,
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
