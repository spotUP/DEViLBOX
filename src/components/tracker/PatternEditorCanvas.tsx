/**
 * PatternEditorCanvas - Canvas-based pattern editor for maximum performance
 * Inspired by Bassoon Tracker's approach: canvas rendering with aggressive caching
 *
 * Hybrid approach: Canvas for pattern grid + HTML overlays for UI controls
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useTrackerStore, useTransportStore, useThemeStore } from '@stores';
import { useUIStore } from '@stores/useUIStore';
import { useShallow } from 'zustand/react/shallow';
import { ChannelVUMeter } from './ChannelVUMeter';
import { ChannelVUMeters } from './ChannelVUMeters';
import { ChannelColorPicker } from './ChannelColorPicker';
import { ChannelContextMenu } from './ChannelContextMenu';
import { CellContextMenu, useCellContextMenu } from './CellContextMenu';
import { GENERATORS, type GeneratorType } from '@utils/patternGenerators';
import { Plus, Minus, Volume2, VolumeX, Headphones, ChevronLeft, ChevronRight } from 'lucide-react';
import { useResponsiveSafe } from '@contexts/ResponsiveContext';
import { useSwipeGesture } from '@hooks/useSwipeGesture';
import { getTrackerReplayer, type DisplayState } from '@engine/TrackerReplayer';
import * as Tone from 'tone';

const ROW_HEIGHT = 24;
const CHAR_WIDTH = 10;
const LINE_NUMBER_WIDTH = 40;
export const CHANNEL_WIDTH = 140; // Width per channel in canvas

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
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [scrollLeft, setScrollLeft] = useState(0);
  // PERF: Use ref instead of state for channel triggers to avoid re-renders
  const channelTriggersRef = useRef<ChannelTrigger[]>([]);

  // Caches for rendered elements (Bassoon Tracker style)
  const noteCacheRef = useRef<NoteCache>({});
  const paramCacheRef = useRef<NoteCache>({});
  const lineNumberCacheRef = useRef<NoteCache>({});

  // Animation frame ref for smooth updates
  const rafRef = useRef<number | null>(null);


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

  const mobileChannelIndex = useTrackerStore((state) => state.cursor.channelIndex);

  // Audio-synced display state ref (BassoonTracker pattern)
  // This stores the last state retrieved from TrackerReplayer.getStateAtTime()
  const lastAudioStateRef = useRef<DisplayState | null>(null);
  // Fallback refs for when audio sync is not available
  const lastRowValueRef = useRef<number>(-1);
  const lastSmoothOffsetRef = useRef<number>(0);

  // Track theme for cache invalidation
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const lastThemeRef = useRef(currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  // Cell context menu
  const cellContextMenu = useCellContextMenu();

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
    centerLine: isCyanTheme ? 'rgba(0, 255, 255, 0.25)' : 'rgba(239, 68, 68, 0.25)',
    cursor: isCyanTheme ? '#00ffff' : '#ef4444',
    cursorBg: isCyanTheme ? 'rgba(0, 255, 255, 0.2)' : 'rgba(239, 68, 68, 0.2)',
    text: '#e0e0e0',
    textMuted: '#505050',
    textNote: '#909090',  // Grey by default, flashes white on current row
    textNoteActive: '#ffffff',  // White for currently playing notes
    textInstrument: '#4ade80',
    textVolume: '#60a5fa',
    textEffect: '#f97316',
    border: '#252530',
    lineNumber: '#707070',
    lineNumberHighlight: '#f97316',
  }), [isCyanTheme]);

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

  // PERF: VU meter polling moved to ref-based update (no React re-renders)
  // The ChannelVUMeters component handles its own animation loop
  // Header VU indicators are updated via refs in the render loop
  useEffect(() => {
    if (pattern) {
      channelTriggersRef.current = pattern.channels.map(() => ({ level: 0, triggered: false }));
    }
  }, [pattern?.channels.length]);

  // Get the note canvas from cache or create it
  const getNoteCanvas = useCallback((note: number, isActive = false): HTMLCanvasElement => {
    const key = `${note}-${isActive ? 'a' : 'n'}`;
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
                    (isActive ? colors.textNoteActive : colors.textNote);
    ctx.fillText(noteToString(note), 0, ROW_HEIGHT / 2);

    noteCacheRef.current[key] = canvas;
    return canvas;
  }, [colors.textMuted, colors.textEffect, colors.textNote, colors.textNoteActive]);

  // Get parameter canvas from cache or create it
  const getParamCanvas = useCallback((
    instrument: number,
    volume: number,
    effTyp: number,
    eff: number,
    accent?: boolean,
    slide?: boolean
  ): HTMLCanvasElement => {
    const key = `${instrument}-${volume}-${effTyp}-${eff}-${accent ? 'A' : ''}-${slide ? 'S' : ''}`;
    if (paramCacheRef.current[key]) {
      return paramCacheRef.current[key];
    }

    // TB-303 accent/slide adds 2 columns
    const hasAcidColumns = accent !== undefined || slide !== undefined;
    const canvas = document.createElement('canvas');
    canvas.width = CHAR_WIDTH * 9 + 16 + (hasAcidColumns ? CHAR_WIDTH * 2 + 8 : 0);
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

    // Effect (3 hex digits: type + param)
    const hasEffect = effTyp !== 0 || eff !== 0;
    ctx.fillStyle = hasEffect ? colors.textEffect : colors.textMuted;
    const effectStr = hasEffect
      ? effTyp.toString(16).toUpperCase() + hexByte(eff)
      : '...';
    ctx.fillText(effectStr, x, y);
    x += CHAR_WIDTH * 3 + 4;

    // TB-303 Accent/Slide columns (if present)
    if (hasAcidColumns) {
      // Accent - yellow/orange for active
      ctx.fillStyle = accent ? '#f59e0b' : colors.textMuted;
      ctx.fillText(accent ? 'A' : '.', x, y);
      x += CHAR_WIDTH + 4;

      // Slide - cyan/blue for active
      ctx.fillStyle = slide ? '#06b6d4' : colors.textMuted;
      ctx.fillText(slide ? 'S' : '.', x, y);
    }

    paramCacheRef.current[key] = canvas;
    return canvas;
  }, [colors.textMuted, colors.textInstrument, colors.textVolume, colors.textEffect]);

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
    const smoothScrolling = transportState.smoothScrolling;

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

    const cursor = state.cursor;
    const isPlaying = transportState.isPlaying;
    const useHex = uiState.useHexNumbers;
    const speed = transportState.speed;
    const bpm = transportState.bpm;

    const { width, height } = dimensions;
    const patternLength = pattern.length;
    const numChannels = pattern.channels.length;

    // Audio-synced scrolling (BassoonTracker pattern)
    // Get state from audio context time, NOT from wall-clock or store updates
    let currentRow: number;
    let smoothOffset = 0;

    if (isPlaying) {
      const replayer = getTrackerReplayer();

      // Get current Web Audio time with 10ms lookahead for latency compensation
      const audioTime = Tone.now() + 0.01;
      const audioState = replayer.getStateAtTime(audioTime);

      if (audioState) {
        lastAudioStateRef.current = audioState;
        currentRow = audioState.row;

        if (smoothScrolling) {
          // Calculate smooth offset based on time elapsed within current row
          const timeSinceRowStart = audioTime - audioState.time;
          const secondsPerRow = (2.5 / bpm) * speed;

          // Progress through current row (0 to 1)
          const progress = Math.min(Math.max(timeSinceRowStart / secondsPerRow, 0), 1);
          smoothOffset = progress * ROW_HEIGHT;
        } else {
          smoothOffset = 0;
        }

        // Store for fallback
        lastRowValueRef.current = currentRow;
        lastSmoothOffsetRef.current = smoothOffset;
      } else {
        // Fallback to store state if no audio state available yet
        currentRow = transportState.currentRow;
      }
    } else {
      // Not playing - use cursor position
      currentRow = cursor.rowIndex;
      // Reset all tracking
      lastAudioStateRef.current = null;
      lastRowValueRef.current = -1;
      lastSmoothOffsetRef.current = 0;
    }

    // Calculate visible lines
    const visibleLines = Math.ceil(height / ROW_HEIGHT) + 2;
    const topLines = Math.floor(visibleLines / 2);
    const visibleStart = currentRow - topLines;
    const visibleEnd = visibleStart + visibleLines;

    // Center line position - apply smooth offset
    const centerLineTop = Math.floor(height / 2) - ROW_HEIGHT / 2;
    const baseY = centerLineTop - (topLines * ROW_HEIGHT) - smoothOffset;

    // Track widths
    const noteWidth = CHAR_WIDTH * 3 + 4;
    const paramWidth = CHAR_WIDTH * 9 + 16;
    const channelWidth = noteWidth + paramWidth + 20;

    // Clear canvas
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, height);

    // Draw rows
    for (let i = visibleStart; i < visibleEnd; i++) {
      let rowIndex: number;
      if (isPlaying) {
        rowIndex = ((i % patternLength) + patternLength) % patternLength;
      } else {
        if (i < 0 || i >= patternLength) continue;
        rowIndex = i;
      }

      const y = baseY + ((i - visibleStart) * ROW_HEIGHT);
      if (y < -ROW_HEIGHT || y > height + ROW_HEIGHT) continue;

      // Row background
      const isHighlight = rowIndex % 4 === 0;
      ctx.fillStyle = isHighlight ? colors.rowHighlight : colors.rowNormal;
      ctx.fillRect(0, y, width, ROW_HEIGHT);

      // Line number
      const lineNumCanvas = getLineNumberCanvas(rowIndex, useHex);
      ctx.drawImage(lineNumCanvas, 4, y);

      // Draw each channel
      for (let ch = 0; ch < numChannels; ch++) {
        const cell = pattern.channels[ch].rows[rowIndex];
        if (!cell) continue;

        const x = LINE_NUMBER_WIDTH + ch * channelWidth + 8 - scrollLeft;

        // Skip if outside visible area
        if (x + channelWidth < 0 || x > width) continue;

        // Note - flash white on current playing row
        const isCurrentPlayingRow = isPlaying && rowIndex === currentRow;
        const noteCanvas = getNoteCanvas(cell.note || 0, isCurrentPlayingRow && cell.note > 0);
        ctx.drawImage(noteCanvas, x, y);

        // Parameters (including TB-303 accent/slide if present)
        const paramCanvas = getParamCanvas(
          cell.instrument || 0,
          cell.volume || 0,
          cell.effTyp || 0,
          cell.eff || 0,
          cell.accent,
          cell.slide
        );
        ctx.drawImage(paramCanvas, x + noteWidth + 4, y);

        // Channel separator
        ctx.fillStyle = colors.border;
        ctx.fillRect(LINE_NUMBER_WIDTH + (ch + 1) * channelWidth - scrollLeft, y, 1, ROW_HEIGHT);
      }
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
      }

      if ((cursor.columnType === 'instrument' || cursor.columnType === 'volume') && cursor.digitIndex > 0) {
        cursorOffsetX += cursor.digitIndex * CHAR_WIDTH;
        cursorW = CHAR_WIDTH;
      }
      if ((cursor.columnType === 'effTyp' || cursor.columnType === 'effParam') && cursor.digitIndex > 0) {
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

  // Track last render time for frame skipping during playback
  const lastRenderTimeRef = useRef<number>(0);

  // Animation loop - throttle to 30fps during playback to give audio priority
  const animate = useCallback(() => {
    const now = performance.now();
    const isPlaying = useTransportStore.getState().isPlaying;

    // During playback, throttle to ~30fps (33ms) to reduce main thread load
    // This gives audio scheduling more CPU time
    const minFrameTime = isPlaying ? 33 : 16; // 30fps during playback, 60fps otherwise

    if (now - lastRenderTimeRef.current >= minFrameTime) {
      lastRenderTimeRef.current = now;
      render();
    }

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

  // Handle header scroll sync
  const handleHeaderScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft);
  }, []);

  // Calculate channel header width
  const noteWidth = CHAR_WIDTH * 3 + 4;
  const paramWidth = CHAR_WIDTH * 9 + 16;
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
  const mobileTrigger = channelTriggersRef.current[mobileChannelIndex] || { level: 0, triggered: false };

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
                  const trigger = channelTriggersRef.current[idx] || { level: 0, triggered: false };
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
        </div>
      )}

      {/* Canvas Pattern Grid */}
      <div
        ref={containerRef}
        className="flex-1 relative bg-dark-bg"
        style={{ minHeight: 200 }}
        tabIndex={0}
        onContextMenu={cellContextMenu.handleContextMenu}
      >
        {/* VU Meters overlay */}
        <div
          className="absolute left-0 right-0 pointer-events-none z-20"
          style={{ top: 0, height: `calc(50% - ${ROW_HEIGHT / 2}px)` }}
        >
          <ChannelVUMeters />
        </div>

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
          isOpen={cellContextMenu.isOpen}
          position={cellContextMenu.position}
          onClose={cellContextMenu.closeMenu}
          channelIndex={cellContextMenu.cellInfo?.channelIndex ?? 0}
          rowIndex={cellContextMenu.cellInfo?.rowIndex ?? 0}
        />
      </div>

      {/* Status Bar */}
      <StatusBar patternLength={pattern.length} channelCount={pattern.channels.length} />
    </div>
  );
};

export default PatternEditorCanvas;
