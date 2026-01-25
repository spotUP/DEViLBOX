/**
 * PatternEditorCanvas - Canvas-based pattern editor for maximum performance
 * Inspired by Bassoon Tracker's approach: canvas rendering with aggressive caching
 *
 * Hybrid approach: Canvas for pattern grid + HTML overlays for UI controls
 *
 * Features ported from PatternEditor:
 * - Smooth scrolling (Tone.js synced) and stepped scrolling modes
 * - Ghost patterns (previous/next pattern preview)
 * - Automation lanes overlay
 * - Custom horizontal scrollbar
 * - Full channel header controls
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import * as Tone from 'tone';
import { useTrackerStore, useTransportStore, useThemeStore } from '@stores';
import { useUIStore } from '@stores/useUIStore';
import { useShallow } from 'zustand/react/shallow';
import { ChannelVUMeter } from './ChannelVUMeter';
import { ChannelVUMeters } from './ChannelVUMeters';
import { ChannelColorPicker } from './ChannelColorPicker';
import { ChannelContextMenu } from './ChannelContextMenu';
import { CellContextMenu, useCellContextMenu } from './CellContextMenu';
import { AutomationLanes } from './AutomationLanes';
import { GENERATORS, type GeneratorType } from '@utils/patternGenerators';
import { Plus, Minus, Volume2, VolumeX, Headphones, ChevronLeft, ChevronRight, ChevronsDownUp } from 'lucide-react';
import { useResponsiveSafe } from '@contexts/ResponsiveContext';
import { useSwipeGesture } from '@hooks/useSwipeGesture';
import { getToneEngine } from '@engine/ToneEngine';

const ROW_HEIGHT = 24;
const CHAR_WIDTH = 10;
const LINE_NUMBER_WIDTH = 40;

// XM note names
const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function noteToString(note: number): string {
  if (note === 0) return '---';
  if (note === 97) return 'OFF';
  const noteIndex = (note - 1) % 12;
  const octave = Math.floor((note - 1) / 12);
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

function hexByte(value: number): string {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

interface NoteCache {
  [key: string]: HTMLCanvasElement;
}

interface ChannelTrigger {
  level: number;
  triggered: boolean;
}

interface PatternEditorCanvasProps {
  onAcidGenerator?: (channelIndex: number) => void;
}

// Status Bar component
const StatusBar: React.FC<{
  patternLength: number;
  channelCount: number;
}> = React.memo(({ patternLength, channelCount }) => {
  const { isPlaying, currentRow } = useTransportStore(
    useShallow((state) => ({ isPlaying: state.isPlaying, currentRow: state.currentRow }))
  );
  const cursorRow = useTrackerStore((state) => state.cursor.rowIndex);
  const cursorChannel = useTrackerStore((state) => state.cursor.channelIndex);
  const insertMode = useTrackerStore((state) => state.insertMode);
  const recordMode = useTrackerStore((state) => state.recordMode);
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
        <span className="text-text-muted" title={insertMode ? 'Insert mode: new data shifts rows down' : 'Overwrite mode: new data replaces existing'}>
          Mode: <span className={insertMode ? 'text-accent-warning' : 'text-accent-primary'}>{insertMode ? 'INS' : 'OVR'}</span>
        </span>
        <span className={`px-2 py-0.5 rounded ${recordMode ? 'bg-accent-error/20 text-accent-error' : 'text-text-muted'}`}>
          {recordMode ? 'REC' : 'EDIT'}
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

export const PatternEditorCanvas: React.FC<PatternEditorCanvasProps> = ({ onAcidGenerator }) => {
  const { isMobile } = useResponsiveSafe();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [scrollLeft, setScrollLeft] = useState(0);
  const [channelTriggers, setChannelTriggers] = useState<ChannelTrigger[]>([]);

  // Caches for rendered elements (Bassoon Tracker style)
  const noteCacheRef = useRef<NoteCache>({});
  const paramCacheRef = useRef<NoteCache>({});
  const lineNumberCacheRef = useRef<NoteCache>({});

  // Animation frame ref for smooth updates
  const rafRef = useRef<number | null>(null);

  // Smooth scrolling refs
  const playbackStartTimeRef = useRef(0);
  const playbackStartRowRef = useRef(0);
  const speedRef = useRef(6); // Default speed

  // Custom scrollbar state
  const [customScrollThumbLeft, setCustomScrollThumbLeft] = useState(0);
  const [customScrollThumbWidth, setCustomScrollThumbWidth] = useState(100);
  const customScrollTrackRef = useRef<HTMLDivElement>(null);
  const isDraggingScrollbar = useRef(false);
  const isScrollSyncing = useRef(false);

  // Get pattern and actions
  const pattern = useTrackerStore((state) => state.patterns[state.currentPatternIndex]);
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

  // Get adjacent patterns for ghost rendering
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

  // Transport state with smooth scrolling
  const { isPlaying, continuousRow, smoothScrolling, speed } = useTransportStore(
    useShallow((state) => ({
      isPlaying: state.isPlaying,
      continuousRow: state.continuousRow,
      smoothScrolling: state.smoothScrolling,
      speed: state.speed,
    }))
  );
  const mobileChannelIndex = useTrackerStore((state) => state.cursor.channelIndex);

  // Track theme for cache invalidation
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const lastThemeRef = useRef(currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  // Cell context menu - uses cursor position for context menu
  const cellContextMenu = useCellContextMenu();
  const cursorForMenu = useTrackerStore((state) => state.cursor);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    cellContextMenu.openMenu(e, cursorForMenu.rowIndex, cursorForMenu.channelIndex);
  }, [cellContextMenu, cursorForMenu.rowIndex, cursorForMenu.channelIndex]);

  // Clear caches when theme changes
  useEffect(() => {
    if (lastThemeRef.current !== currentThemeId) {
      noteCacheRef.current = {};
      paramCacheRef.current = {};
      lineNumberCacheRef.current = {};
      lastThemeRef.current = currentThemeId;
    }
  }, [currentThemeId]);

  // Colors based on theme
  const colors = useMemo(() => ({
    bg: '#0a0a0b',
    rowNormal: '#0d0d0e',
    rowHighlight: '#151518',
    rowGhost: isCyanTheme ? 'rgba(0, 255, 255, 0.05)' : 'rgba(100, 100, 100, 0.1)',
    centerLine: isCyanTheme ? 'rgba(0, 255, 255, 0.25)' : 'rgba(239, 68, 68, 0.25)',
    cursor: isCyanTheme ? '#00ffff' : '#ef4444',
    cursorBg: isCyanTheme ? 'rgba(0, 255, 255, 0.2)' : 'rgba(239, 68, 68, 0.2)',
    text: '#e0e0e0',
    textMuted: '#505050',
    textNote: '#ffffff',
    textInstrument: '#4ade80',
    textVolume: '#60a5fa',
    textEffect: '#f97316',
    textEffect2: '#ec4899', // Pink for effect2
    textAccent: '#fbbf24', // Yellow/amber for accent
    textSlide: '#a78bfa', // Purple for slide
    border: '#252530',
    lineNumber: '#707070',
    lineNumberHighlight: '#f97316',
  }), [isCyanTheme]);

  // Update speed ref when it changes (without restarting animation)
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  // Initialize smooth scrolling animation when playback starts
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

  // Mobile swipe handlers
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
      note: 49,
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
        note: 0,
        instrument: 0,
        volume: 0,
        effTyp: 0,
        eff: 0,
      });
    }
  }, [pattern, setCell]);

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
      if (cell.note && cell.note !== 0 && cell.note !== 97) {
        let newNote = cell.note + semitones;
        newNote = Math.max(1, Math.min(96, newNote));
        setCell(channelIndex, row, { ...cell, note: newNote });
      }
    }
  }, [pattern, setCell]);

  const handleHumanize = useCallback((channelIndex: number) => {
    if (!pattern) return;
    for (let row = 0; row < pattern.length; row++) {
      const cell = pattern.channels[channelIndex].rows[row];
      if (cell.volume !== null && cell.volume >= 0x10) {
        const variation = Math.floor(Math.random() * 8) - 4;
        const newVolume = Math.max(0x10, Math.min(0x50, cell.volume + variation));
        setCell(channelIndex, row, { ...cell, volume: newVolume });
      }
    }
  }, [pattern, setCell]);

  const handleInterpolate = useCallback((channelIndex: number) => {
    if (!pattern) return;
    const channel = pattern.channels[channelIndex];
    if (!channel) return;

    let firstRow = -1;
    let lastRow = -1;
    let firstVolume = 0;
    let lastVolume = 0;

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

    if (firstRow === -1 || lastRow === -1 || lastRow - firstRow < 2) return;

    const rowCount = lastRow - firstRow;
    for (let row = firstRow + 1; row < lastRow; row++) {
      const t = (row - firstRow) / rowCount;
      const interpolatedVolume = Math.round(firstVolume + (lastVolume - firstVolume) * t);
      const cell = channel.rows[row];
      setCell(channelIndex, row, { ...cell, volume: interpolatedVolume });
    }
  }, [pattern, setCell]);

  // VU meter polling during playback
  const vuPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!isPlaying || !pattern) {
      if (vuPollRef.current) {
        clearInterval(vuPollRef.current);
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
    };

    vuPollRef.current = setInterval(pollTriggers, 100);

    return () => {
      if (vuPollRef.current) {
        clearInterval(vuPollRef.current);
        vuPollRef.current = null;
      }
    };
  }, [isPlaying, pattern]);

  // Get the note canvas from cache or create it
  const getNoteCanvas = useCallback((note: number): HTMLCanvasElement => {
    const key = `${note}`;
    if (noteCacheRef.current[key]) {
      return noteCacheRef.current[key];
    }

    const canvas = document.createElement('canvas');
    canvas.width = CHAR_WIDTH * 3 + 4;
    canvas.height = ROW_HEIGHT;
    const ctx = canvas.getContext('2d')!;

    ctx.font = '14px "JetBrains Mono", "Fira Code", monospace';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = note === 0 ? colors.textMuted :
                    note === 97 ? colors.textEffect :
                    colors.textNote;
    ctx.fillText(noteToString(note), 0, ROW_HEIGHT / 2);

    noteCacheRef.current[key] = canvas;
    return canvas;
  }, [colors.textMuted, colors.textEffect, colors.textNote]);

  // Get parameter canvas from cache or create it
  const getParamCanvas = useCallback((
    instrument: number,
    volume: number,
    effTyp: number,
    eff: number,
    effect2: string | null | undefined,
    accent: boolean | undefined,
    slide: boolean | undefined
  ): HTMLCanvasElement => {
    const key = `${instrument}-${volume}-${effTyp}-${eff}-${effect2 || ''}-${accent ? 1 : 0}-${slide ? 1 : 0}`;
    if (paramCacheRef.current[key]) {
      return paramCacheRef.current[key];
    }

    // Width: inst(2) + vol(2) + eff1(3) + eff2(3) + accent(1) + slide(1) + gaps
    const canvas = document.createElement('canvas');
    canvas.width = CHAR_WIDTH * 12 + 28;
    canvas.height = ROW_HEIGHT;
    const ctx = canvas.getContext('2d')!;

    ctx.font = '14px "JetBrains Mono", "Fira Code", monospace';
    ctx.textBaseline = 'middle';

    let x = 0;
    const y = ROW_HEIGHT / 2;

    // Instrument (2 hex digits)
    ctx.fillStyle = instrument === 0 ? colors.textMuted : colors.textInstrument;
    ctx.fillText(instrument === 0 ? '..' : hexByte(instrument), x, y);
    x += CHAR_WIDTH * 2 + 4;

    // Volume (2 hex digits)
    const hasVolume = volume >= 0x10 && volume <= 0x50;
    ctx.fillStyle = hasVolume ? colors.textVolume : colors.textMuted;
    ctx.fillText(hasVolume ? hexByte(volume) : '..', x, y);
    x += CHAR_WIDTH * 2 + 4;

    // Effect 1 (3 hex digits: type + param)
    const hasEffect = effTyp !== 0 || eff !== 0;
    ctx.fillStyle = hasEffect ? colors.textEffect : colors.textMuted;
    const effectStr = hasEffect
      ? effTyp.toString(16).toUpperCase() + hexByte(eff)
      : '...';
    ctx.fillText(effectStr, x, y);
    x += CHAR_WIDTH * 3 + 4;

    // Effect 2 (3 chars string)
    const hasEffect2 = effect2 && effect2 !== '...' && effect2 !== '000';
    ctx.fillStyle = hasEffect2 ? colors.textEffect2 : colors.textMuted;
    ctx.fillText(effect2 || '...', x, y);
    x += CHAR_WIDTH * 3 + 4;

    // Accent (1 char)
    ctx.fillStyle = accent ? colors.textAccent : colors.textMuted;
    ctx.fillText(accent ? 'A' : '.', x, y);
    x += CHAR_WIDTH + 4;

    // Slide (1 char)
    ctx.fillStyle = slide ? colors.textSlide : colors.textMuted;
    ctx.fillText(slide ? 'S' : '.', x, y);

    paramCacheRef.current[key] = canvas;
    return canvas;
  }, [colors.textMuted, colors.textInstrument, colors.textVolume, colors.textEffect, colors.textEffect2, colors.textAccent, colors.textSlide]);

  // Get line number canvas from cache or create it
  const getLineNumberCanvas = useCallback((lineNum: number, useHex: boolean): HTMLCanvasElement => {
    const isHighlight = lineNum % 4 === 0;
    const key = `${lineNum}-${useHex}-${isHighlight}`;
    if (lineNumberCacheRef.current[key]) {
      return lineNumberCacheRef.current[key];
    }

    const canvas = document.createElement('canvas');
    canvas.width = LINE_NUMBER_WIDTH;
    canvas.height = ROW_HEIGHT;
    const ctx = canvas.getContext('2d')!;

    ctx.font = isHighlight ? 'bold 12px "JetBrains Mono", monospace' : '12px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = isHighlight ? colors.lineNumberHighlight : colors.lineNumber;

    const text = useHex
      ? lineNum.toString(16).toUpperCase().padStart(2, '0')
      : lineNum.toString(10).padStart(2, '0');
    ctx.fillText(text, LINE_NUMBER_WIDTH / 2, ROW_HEIGHT / 2);

    lineNumberCacheRef.current[key] = canvas;
    return canvas;
  }, [colors.lineNumber, colors.lineNumberHighlight]);

  // Main render function
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get state directly (no React re-render)
    const state = useTrackerStore.getState();
    const transportState = useTransportStore.getState();
    const uiState = useUIStore.getState();

    const pattern = state.patterns[state.currentPatternIndex];
    if (!pattern) {
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, dimensions.width, dimensions.height);
      ctx.fillStyle = colors.textMuted;
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No pattern loaded', dimensions.width / 2, dimensions.height / 2);
      return;
    }

    // Get ghost patterns for preview
    const prevPatternIndex = state.currentPatternIndex > 0
      ? state.currentPatternIndex - 1
      : state.patterns.length - 1;
    const nextPatternIndex = state.currentPatternIndex < state.patterns.length - 1
      ? state.currentPatternIndex + 1
      : 0;
    const prevPattern = state.patterns[prevPatternIndex];
    const nextPattern = state.patterns[nextPatternIndex];
    const showGhostPatterns = state.showGhostPatterns;

    const cursor = state.cursor;
    const isPlaying = transportState.isPlaying;
    const smoothScrollingActive = transportState.smoothScrolling && isPlaying;
    const isLooping = transportState.isLooping;
    const useHex = uiState.useHexNumbers;

    // Calculate current row position (fractional for smooth scrolling)
    let currentRowPosition: number;
    if (isPlaying && smoothScrollingActive) {
      // Smooth scrolling: calculate fractional row position based on time
      const transport = Tone.getTransport();
      const currentBpm = transport.bpm.value;
      const tickInterval = 2.5 / currentBpm;
      const secondsPerRow = tickInterval * speedRef.current;
      const elapsedMs = performance.now() - playbackStartTimeRef.current;
      const elapsedSeconds = elapsedMs / 1000;
      const rowsElapsed = elapsedSeconds / secondsPerRow;
      const rawRowPosition = playbackStartRowRef.current + rowsElapsed;
      currentRowPosition = rawRowPosition % pattern.length;
    } else if (isPlaying) {
      // Stepped scrolling: use integer row
      currentRowPosition = transportState.currentRow;
    } else {
      // Stopped: use cursor position
      currentRowPosition = cursor.rowIndex;
    }

    const { width, height } = dimensions;
    const patternLength = pattern.length;
    const numChannels = pattern.channels.length;

    // Calculate visible lines with extra buffer for smooth scrolling
    const visibleLines = Math.ceil(height / ROW_HEIGHT) + 4;
    const topLines = Math.floor(visibleLines / 2);
    const visibleStart = Math.floor(currentRowPosition) - topLines;
    const visibleEnd = visibleStart + visibleLines;

    // Center line position - offset by fractional part for smooth scrolling
    const fractionalOffset = smoothScrollingActive ? (currentRowPosition % 1) * ROW_HEIGHT : 0;
    const centerLineTop = Math.floor(height / 2) - ROW_HEIGHT / 2;
    const baseY = centerLineTop - (topLines * ROW_HEIGHT) - fractionalOffset;

    // Track widths - note(3) + inst(2) + vol(2) + eff1(3) + eff2(3) + accent(1) + slide(1) = 15 chars + gaps
    const noteWidth = CHAR_WIDTH * 3 + 4;
    const paramWidth = CHAR_WIDTH * 12 + 28; // inst + vol + eff1 + eff2 + accent + slide
    const channelWidth = noteWidth + paramWidth + 20;

    // Clear canvas
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, height);

    // Draw rows (including ghost patterns when playing with looping)
    for (let i = visibleStart; i < visibleEnd; i++) {
      let rowIndex: number;
      let patternType: 'prev' | 'current' | 'next' = 'current';
      let sourcePattern = pattern;

      if (isPlaying) {
        // During playback, handle ghost pattern rendering
        if (i < 0 && showGhostPatterns && prevPattern) {
          // Previous pattern (ghost)
          rowIndex = ((prevPattern.length + (i % prevPattern.length)) % prevPattern.length);
          patternType = 'prev';
          sourcePattern = prevPattern;
        } else if (i >= patternLength && showGhostPatterns && nextPattern) {
          // Next pattern (ghost)
          rowIndex = (i - patternLength) % nextPattern.length;
          patternType = 'next';
          sourcePattern = nextPattern;
        } else {
          // Current pattern with wrapping
          rowIndex = ((i % patternLength) + patternLength) % patternLength;
        }
      } else {
        // When stopped, don't wrap - just skip out-of-bounds rows
        if (i < 0 || i >= patternLength) continue;
        rowIndex = i;
      }

      const y = baseY + ((i - visibleStart) * ROW_HEIGHT);
      if (y < -ROW_HEIGHT || y > height + ROW_HEIGHT) continue;

      // Row background - dimmer for ghost rows
      const isHighlight = rowIndex % 4 === 0;
      const isGhostRow = patternType !== 'current';
      if (isGhostRow) {
        ctx.fillStyle = colors.rowGhost;
      } else {
        ctx.fillStyle = isHighlight ? colors.rowHighlight : colors.rowNormal;
      }
      ctx.fillRect(0, y, width, ROW_HEIGHT);

      // Line number (dimmed for ghost rows)
      ctx.globalAlpha = isGhostRow ? (isLooping ? 0.4 : 0.6) : 1;
      const lineNumCanvas = getLineNumberCanvas(rowIndex, useHex);
      ctx.drawImage(lineNumCanvas, 4, y);

      // Draw each channel
      const channelCount = Math.min(numChannels, sourcePattern.channels.length);
      for (let ch = 0; ch < channelCount; ch++) {
        const cell = sourcePattern.channels[ch]?.rows[rowIndex];
        if (!cell) continue;

        const x = LINE_NUMBER_WIDTH + ch * channelWidth + 8 - scrollLeft;

        // Skip if outside visible area
        if (x + channelWidth < 0 || x > width) continue;

        // Note
        const noteCanvas = getNoteCanvas(cell.note || 0);
        ctx.drawImage(noteCanvas, x, y);

        // Parameters (including effect2, accent, slide)
        const paramCanvas = getParamCanvas(
          cell.instrument || 0,
          cell.volume || 0,
          cell.effTyp || 0,
          cell.eff || 0,
          cell.effect2,
          cell.accent,
          cell.slide
        );
        ctx.drawImage(paramCanvas, x + noteWidth + 4, y);

        // Channel separator
        ctx.fillStyle = colors.border;
        ctx.fillRect(LINE_NUMBER_WIDTH + (ch + 1) * channelWidth - scrollLeft, y, 1, ROW_HEIGHT);
      }

      // Reset alpha for next row
      ctx.globalAlpha = 1;
    }

    // Draw center line highlight
    ctx.fillStyle = colors.centerLine;
    ctx.fillRect(0, centerLineTop, width, ROW_HEIGHT);

    // Draw cursor (only when not playing)
    if (!isPlaying) {
      const cursorX = LINE_NUMBER_WIDTH + cursor.channelIndex * channelWidth + 8 - scrollLeft;
      let cursorOffsetX = 0;
      let cursorW = noteWidth;

      switch (cursor.columnType) {
        case 'note':
          cursorW = noteWidth;
          break;
        case 'instrument':
          cursorOffsetX = noteWidth + 4;
          cursorW = CHAR_WIDTH * 2;
          break;
        case 'volume':
          cursorOffsetX = noteWidth + 4 + CHAR_WIDTH * 2 + 4;
          cursorW = CHAR_WIDTH * 2;
          break;
        case 'effTyp':
        case 'effParam':
          cursorOffsetX = noteWidth + 4 + CHAR_WIDTH * 4 + 8;
          cursorW = CHAR_WIDTH * 3;
          break;
        case 'effect2':
          cursorOffsetX = noteWidth + 4 + CHAR_WIDTH * 7 + 12;
          cursorW = CHAR_WIDTH * 3;
          break;
        case 'accent':
          cursorOffsetX = noteWidth + 4 + CHAR_WIDTH * 10 + 16;
          cursorW = CHAR_WIDTH;
          break;
        case 'slide':
          cursorOffsetX = noteWidth + 4 + CHAR_WIDTH * 11 + 20;
          cursorW = CHAR_WIDTH;
          break;
      }

      if ((cursor.columnType === 'instrument' || cursor.columnType === 'volume') && cursor.digitIndex > 0) {
        cursorOffsetX += cursor.digitIndex * CHAR_WIDTH;
        cursorW = CHAR_WIDTH;
      }
      if ((cursor.columnType === 'effTyp' || cursor.columnType === 'effParam' || cursor.columnType === 'effect2') && cursor.digitIndex > 0) {
        cursorOffsetX += cursor.digitIndex * CHAR_WIDTH;
        cursorW = CHAR_WIDTH;
      }

      ctx.fillStyle = colors.cursorBg;
      ctx.fillRect(cursorX + cursorOffsetX - 2, centerLineTop, cursorW + 4, ROW_HEIGHT);
      ctx.strokeStyle = colors.cursor;
      ctx.lineWidth = 2;
      ctx.strokeRect(cursorX + cursorOffsetX - 2, centerLineTop, cursorW + 4, ROW_HEIGHT);
    }

    // Draw fade overlays
    const gradient1 = ctx.createLinearGradient(0, 0, 0, 60);
    gradient1.addColorStop(0, 'rgba(10,10,11,0.98)');
    gradient1.addColorStop(1, 'rgba(10,10,11,0)');
    ctx.fillStyle = gradient1;
    ctx.fillRect(0, 0, width, 60);

    const gradient2 = ctx.createLinearGradient(0, height - 60, 0, height);
    gradient2.addColorStop(0, 'rgba(10,10,11,0)');
    gradient2.addColorStop(1, 'rgba(10,10,11,0.98)');
    ctx.fillStyle = gradient2;
    ctx.fillRect(0, height - 60, width, 60);

  }, [dimensions, colors, getNoteCanvas, getParamCanvas, getLineNumberCanvas, scrollLeft]);

  // Animation loop
  const animate = useCallback(() => {
    render();
    rafRef.current = requestAnimationFrame(animate);
  }, [render]);

  // Start animation loop
  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [animate]);

  // Handle resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });

    resizeObserver.observe(container);
    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setDimensions({ width: rect.width, height: rect.height });
    }

    return () => resizeObserver.disconnect();
  }, []);

  // Update canvas size when dimensions change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    // Clear caches when size changes
    noteCacheRef.current = {};
    paramCacheRef.current = {};
    lineNumberCacheRef.current = {};
  }, [dimensions]);

  // Handle mouse wheel for scrolling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const isPlaying = useTransportStore.getState().isPlaying;
      if (isPlaying) return;

      // Vertical scroll - move cursor
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        const delta = Math.sign(e.deltaY) * 2;
        const state = useTrackerStore.getState();
        const pattern = state.patterns[state.currentPatternIndex];
        if (!pattern) return;

        const currentRow = state.cursor.rowIndex;
        const newRow = Math.max(0, Math.min(pattern.length - 1, currentRow + delta));
        useTrackerStore.getState().moveCursorToRow(newRow);
      } else {
        // Horizontal scroll - scroll channels
        setScrollLeft(prev => Math.max(0, prev + e.deltaX));
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Handle header scroll sync with custom scrollbar
  const handleHeaderScroll = useCallback(() => {
    if (isScrollSyncing.current) return;
    if (headerScrollRef.current && contentScrollRef.current) {
      const scrollLeftVal = headerScrollRef.current.scrollLeft;

      isScrollSyncing.current = true;
      setScrollLeft(scrollLeftVal);
      contentScrollRef.current.scrollLeft = scrollLeftVal;

      // Update custom scrollbar thumb position
      if (!isDraggingScrollbar.current && customScrollTrackRef.current) {
        const scrollWidth = headerScrollRef.current.scrollWidth;
        const clientWidth = headerScrollRef.current.clientWidth;
        const maxScroll = scrollWidth - clientWidth;
        if (maxScroll > 0) {
          const scrollPercent = scrollLeftVal / maxScroll;
          const trackWidth = customScrollTrackRef.current.clientWidth;
          const thumbWidth = Math.max(30, (clientWidth / scrollWidth) * trackWidth);
          const maxThumbLeft = trackWidth - thumbWidth;
          setCustomScrollThumbLeft(scrollPercent * maxThumbLeft);
          setCustomScrollThumbWidth(thumbWidth);
        }
      }

      requestAnimationFrame(() => {
        isScrollSyncing.current = false;
      });
    }
  }, []);

  // Handle content scroll sync
  const handleContentScroll = useCallback(() => {
    if (isScrollSyncing.current) return;
    if (headerScrollRef.current && contentScrollRef.current) {
      const scrollLeftVal = contentScrollRef.current.scrollLeft;

      isScrollSyncing.current = true;
      setScrollLeft(scrollLeftVal);
      headerScrollRef.current.scrollLeft = scrollLeftVal;

      requestAnimationFrame(() => {
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
      setScrollLeft(scrollPercent * maxScroll);
      setCustomScrollThumbLeft(newThumbLeft);
    };

    const handleMouseUp = () => {
      isDraggingScrollbar.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    if (!clickedOnThumb) {
      const newThumbLeft = Math.max(0, Math.min(trackRect.width - thumbWidth, clickX - thumbWidth / 2));
      const scrollPercent = newThumbLeft / (trackRect.width - thumbWidth);

      const scrollWidth = headerScrollRef.current.scrollWidth;
      const clientWidth = headerScrollRef.current.clientWidth;
      const maxScroll = scrollWidth - clientWidth;

      headerScrollRef.current.scrollLeft = scrollPercent * maxScroll;
      setScrollLeft(scrollPercent * maxScroll);
      setCustomScrollThumbLeft(newThumbLeft);
    }
  }, [customScrollThumbLeft, customScrollThumbWidth]);

  // Calculate channel header width - match canvas render
  const noteWidth = CHAR_WIDTH * 3 + 4;
  const paramWidth = CHAR_WIDTH * 12 + 28; // inst + vol + eff1 + eff2 + accent + slide
  const channelHeaderWidth = noteWidth + paramWidth + 20;
  const totalChannelsWidth = pattern ? pattern.channels.length * channelHeaderWidth : 0;

  if (!pattern) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        No pattern loaded
      </div>
    );
  }

  const mobileChannel = pattern.channels[mobileChannelIndex];
  const mobileTrigger = channelTriggers[mobileChannelIndex] || { level: 0, triggered: false };

  return (
    <div className="flex flex-col h-full" {...(isMobile ? swipeHandlers : {})}>
      {/* Mobile Channel Header */}
      {isMobile && (
        <div className="flex-shrink-0 bg-dark-bgTertiary border-b border-dark-border">
          <div className="flex items-center justify-between px-3 py-2">
            <button
              onClick={handleSwipeRight}
              disabled={mobileChannelIndex <= 0}
              className={`p-2 rounded-lg transition-colors ${
                mobileChannelIndex <= 0 ? 'text-text-muted opacity-30' : 'text-text-secondary hover:bg-dark-bgHover'
              }`}
            >
              <ChevronLeft size={20} />
            </button>

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
              <ChannelVUMeter level={mobileTrigger.level} isActive={mobileTrigger.triggered} />
            </div>

            <button
              onClick={handleSwipeLeft}
              disabled={mobileChannelIndex >= pattern.channels.length - 1}
              className={`p-2 rounded-lg transition-colors ${
                mobileChannelIndex >= pattern.channels.length - 1 ? 'text-text-muted opacity-30' : 'text-text-secondary hover:bg-dark-bgHover'
              }`}
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="flex items-center justify-center gap-2 px-3 py-1 border-t border-dark-border/50">
            <button
              onClick={() => toggleChannelMute(mobileChannelIndex)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                mobileChannel?.muted ? 'bg-accent-error/20 text-accent-error' : 'text-text-muted hover:bg-dark-bgHover'
              }`}
            >
              {mobileChannel?.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <button
              onClick={() => toggleChannelSolo(mobileChannelIndex)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                mobileChannel?.solo ? 'bg-accent-primary/20 text-accent-primary' : 'text-text-muted hover:bg-dark-bgHover'
              }`}
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

      {/* Desktop Channel Header */}
      {!isMobile && (
        <div className="flex-shrink-0 bg-dark-bgTertiary border-b border-dark-border z-20">
          <div className="flex">
            {/* Row number column header */}
            <div className="flex-shrink-0 px-2 py-2 text-text-muted text-xs font-medium text-center border-r border-dark-border flex items-center justify-center"
                 style={{ width: LINE_NUMBER_WIDTH }}>
              ROW
            </div>

            {/* Scrollable channel headers */}
            <div
              ref={headerScrollRef}
              onScroll={handleHeaderScroll}
              className="overflow-x-auto scrollbar-hidden flex-1"
            >
              <div className="flex" style={{ width: totalChannelsWidth }}>
                {pattern.channels.map((channel, idx) => {
                  const trigger = channelTriggers[idx] || { level: 0, triggered: false };
                  return (
                    <div
                      key={channel.id}
                      className={`flex-shrink-0 flex items-center justify-between gap-2 px-3 py-1.5
                        border-r border-dark-border transition-colors relative
                        ${channel.muted ? 'opacity-50' : ''}
                        ${channel.solo ? 'bg-accent-primary/10' : ''}`}
                      style={{
                        width: channelHeaderWidth,
                        backgroundColor: channel.color ? `${channel.color}15` : undefined,
                        boxShadow: channel.color ? `inset 3px 0 0 ${channel.color}` : undefined,
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="font-bold font-mono text-sm"
                          style={{ color: channel.color || 'var(--color-accent)' }}
                        >
                          {(idx + 1).toString().padStart(2, '0')}
                        </span>
                        <ChannelVUMeter level={trigger.level} isActive={trigger.triggered} />
                      </div>

                      <div className="flex items-center gap-1">
                        {/* Collapse channel button (placeholder) */}
                        <button
                          className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-dark-bgHover transition-colors"
                          title="Collapse/Expand Channel"
                        >
                          <ChevronsDownUp size={12} />
                        </button>
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
            <div className="flex-shrink-0" style={{ width: LINE_NUMBER_WIDTH }} />

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

      {/* Canvas Pattern Grid */}
      <div
        ref={containerRef}
        className="flex-1 relative bg-dark-bg"
        style={{ minHeight: 200 }}
        tabIndex={0}
        onContextMenu={handleContextMenu}
      >
        {/* VU Meters overlay */}
        <div
          className="absolute left-0 right-0 pointer-events-none z-20"
          style={{ top: 0, height: `calc(50% - ${ROW_HEIGHT / 2}px)` }}
        >
          <ChannelVUMeters />
        </div>

        {/* Automation Lanes Overlay - render for all parameters with data */}
        <div
          ref={contentScrollRef}
          onScroll={handleContentScroll}
          className="absolute inset-0 overflow-x-auto overflow-y-hidden pointer-events-none z-5"
          style={{ left: LINE_NUMBER_WIDTH }}
        >
          <div style={{ width: totalChannelsWidth, height: '100%', position: 'relative' }}>
            {['cutoff', 'resonance', 'envMod', 'decay', 'accent', 'overdrive', 'volume', 'pan'].map((param) => (
              <AutomationLanes
                key={param}
                patternId={pattern.id}
                patternLength={pattern.length}
                rowHeight={ROW_HEIGHT}
                channelCount={pattern.channels.length}
                channelWidth={channelHeaderWidth}
                rowNumWidth={0}
                scrollOffset={0}
                parameter={param}
                prevPatternId={prevPattern?.id}
                prevPatternLength={prevPattern?.length}
                nextPatternId={nextPattern?.id}
                nextPatternLength={nextPattern?.length}
              />
            ))}
          </div>
        </div>

        {/* Fixed center edit bar */}
        <div
          className="absolute left-0 right-0 pointer-events-none z-40"
          style={{
            top: '50%',
            transform: 'translateY(-50%)',
            height: ROW_HEIGHT,
            backgroundColor: isCyanTheme ? 'rgba(0, 255, 255, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          }}
        />

        <canvas
          ref={canvasRef}
          style={{
            width: dimensions.width,
            height: dimensions.height,
            display: 'block',
          }}
        />

        {/* Cell context menu */}
        <CellContextMenu
          position={cellContextMenu.position}
          onClose={cellContextMenu.closeMenu}
          channelIndex={cellContextMenu.channelIndex}
          rowIndex={cellContextMenu.rowIndex}
        />
      </div>

      {/* Status Bar */}
      <StatusBar patternLength={pattern.length} channelCount={pattern.channels.length} />
    </div>
  );
};

export default PatternEditorCanvas;
