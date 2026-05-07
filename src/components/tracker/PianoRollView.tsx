/**
 * PianoRollView — note-level piano roll editor for the pattern editor
 *
 * Shows notes as horizontal bars on a pitch/time grid:
 * - Y axis: MIDI note pitches (piano keyboard on left)
 * - X axis: pattern rows (time)
 * - Notes rendered as colored bars spanning from note-on to note-off/next note
 *
 * Interactions:
 * - Click empty cell: place note
 * - Click existing note: remove note
 * - Drag right edge: resize note length
 * - Scroll wheel: zoom vertically (note range)
 * - Shift+scroll: scroll horizontally (time)
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useShallow } from 'zustand/react/shallow';
import type { TrackerCell } from '@/types/tracker';

// ── Constants ────────────────────────────────────────────────────────────────

const PIANO_KEY_W = 48;      // Width of piano keyboard column
const ROW_H = 14;             // Height per note row
const COL_W = 20;             // Width per pattern step
const HEADER_H = 20;          // Top header height for row numbers
const MIN_NOTE = 24;          // C-1 (XM note 13)
const MAX_NOTE = 84;          // C-6 (XM note 73)
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Colors
const BG = '#111';
const GRID_LINE = '#1e1e1e';
const GRID_LINE_BEAT = '#2a2a2a';
const GRID_LINE_BAR = '#383838';
const WHITE_KEY_BG = '#181818';
const BLACK_KEY_BG = '#111';
const PIANO_BORDER = '#333';
const NOTE_FILL = '#3b82f6';
const NOTE_BORDER = '#60a5fa';
const NOTE_TEXT = '#fff';
const PLAYHEAD_COLOR = '#f97316';

// Channel colors for multi-channel view
const CHANNEL_COLORS = [
  '#3b82f6', '#22c55e', '#f97316', '#ef4444',
  '#a855f7', '#06b6d4', '#eab308', '#ec4899',
  '#14b8a6', '#f43f5e', '#8b5cf6', '#84cc16',
  '#0ea5e9', '#d946ef', '#f59e0b', '#10b981',
];

function isBlackKey(noteNum: number): boolean {
  const semitone = noteNum % 12;
  return [1, 3, 6, 8, 10].includes(semitone);
}

function xmNoteToName(xmNote: number): string {
  if (xmNote === 0) return '';
  if (xmNote === 97) return '===';
  const n = xmNote - 1;
  const octave = Math.floor(n / 12);
  const semitone = n % 12;
  return `${NOTE_NAMES[semitone]}${octave}`;
}

// ── Note extraction ──────────────────────────────────────────────────────────

interface NoteBar {
  channel: number;
  startRow: number;
  endRow: number;     // Exclusive (note plays from startRow to endRow-1)
  xmNote: number;     // 1-96
  instrument: number;
  velocity: number;
}

function extractNotes(
  channels: Array<{ rows: TrackerCell[] }>,
  patternLength: number,
  channelIndices: number[],
): NoteBar[] {
  const notes: NoteBar[] = [];

  for (const ch of channelIndices) {
    const rows = channels[ch]?.rows;
    if (!rows) continue;

    let activeNote: NoteBar | null = null;

    for (let row = 0; row < patternLength; row++) {
      const cell = rows[row];
      if (!cell) continue;

      const hasNote = cell.note > 0 && cell.note < 97;
      const isNoteOff = cell.note === 97;

      if (hasNote) {
        // Close previous note
        if (activeNote) {
          activeNote.endRow = row;
          notes.push(activeNote);
        }
        // Start new note
        activeNote = {
          channel: ch,
          startRow: row,
          endRow: patternLength,
          xmNote: cell.note,
          instrument: cell.instrument || 0,
          velocity: cell.volume || 64,
        };
      } else if (isNoteOff && activeNote) {
        activeNote.endRow = row;
        notes.push(activeNote);
        activeNote = null;
      }
    }

    // Close note at pattern end
    if (activeNote) {
      notes.push(activeNote);
    }
  }

  return notes;
}

// ── Component ────────────────────────────────────────────────────────────────

interface PianoRollViewProps {
  channelIndex: number;
  allChannels?: boolean;
}

export const PianoRollView: React.FC<PianoRollViewProps> = ({
  channelIndex,
  allChannels = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollX, setScrollX] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const animFrameRef = useRef<number>(0);

  // Store data
  const { patterns, currentPatternIndex } = useTrackerStore(useShallow(s => ({
    patterns: s.patterns,
    currentPatternIndex: s.currentPatternIndex,
  })));
  const setCell = useTrackerStore(s => s.setCell);
  const { isPlaying, currentRow } = useTransportStore(useShallow(s => ({
    isPlaying: s.isPlaying,
    currentRow: s.currentRow,
  })));
  const currentInstrument = useInstrumentStore(s => s.currentInstrumentId);

  const pattern = patterns[currentPatternIndex];
  const patternLength = pattern?.length ?? 64;
  const channelCount = pattern?.channels?.length ?? 0;

  // Which channels to show
  const channelIndices = useMemo(() => {
    if (allChannels) return Array.from({ length: channelCount }, (_, i) => i);
    return [channelIndex];
  }, [allChannels, channelIndex, channelCount]);

  // Extract all note bars
  const noteBars = useMemo(() => {
    if (!pattern?.channels) return [];
    return extractNotes(pattern.channels, patternLength, channelIndices);
  }, [pattern, patternLength, channelIndices]);

  // Note range (visible pitch range)
  const noteRange = useMemo(() => {
    let minN = MIN_NOTE;
    let maxN = MAX_NOTE;
    // Expand to fit actual notes
    for (const bar of noteBars) {
      const n = bar.xmNote - 1; // Convert to 0-based
      if (n < minN) minN = Math.max(0, n - 2);
      if (n > maxN) maxN = Math.min(95, n + 2);
    }
    return { min: minN, max: maxN, count: maxN - minN + 1 };
  }, [noteBars]);

  // Canvas dimensions
  const gridW = patternLength * COL_W;
  const gridH = noteRange.count * ROW_H;

  // Auto-scroll to center of note range on mount
  useEffect(() => {
    if (containerRef.current) {
      const centerNote = Math.floor((noteRange.min + noteRange.max) / 2);
      const centerY = (noteRange.max - centerNote) * ROW_H - containerRef.current.clientHeight / 2 + HEADER_H;
      setScrollY(Math.max(0, centerY));
    }
  }, [noteRange.min, noteRange.max]);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cw = containerSize.w;
    const ch = containerSize.h;
    if (cw === 0 || ch === 0) return;

    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, cw, ch);

    const ox = -scrollX; // Horizontal offset
    const oy = -scrollY; // Vertical offset

    // ── Grid background ──────────────────────────────────────────────────

    // Note row backgrounds (alternating white/black key)
    for (let n = noteRange.max; n >= noteRange.min; n--) {
      const y = HEADER_H + (noteRange.max - n) * ROW_H + oy;
      if (y + ROW_H < 0 || y > ch) continue;
      ctx.fillStyle = isBlackKey(n) ? BLACK_KEY_BG : WHITE_KEY_BG;
      ctx.fillRect(PIANO_KEY_W, y, cw - PIANO_KEY_W, ROW_H);
    }

    // Vertical grid lines (per step)
    for (let col = 0; col <= patternLength; col++) {
      const x = PIANO_KEY_W + col * COL_W + ox;
      if (x < PIANO_KEY_W || x > cw) continue;
      const isBeat = col % 4 === 0;
      const isBar = col % 16 === 0;
      ctx.strokeStyle = isBar ? GRID_LINE_BAR : isBeat ? GRID_LINE_BEAT : GRID_LINE;
      ctx.lineWidth = isBar ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(x, HEADER_H);
      ctx.lineTo(x, ch);
      ctx.stroke();
    }

    // Horizontal grid lines (per note)
    for (let n = noteRange.max; n >= noteRange.min; n--) {
      const y = HEADER_H + (noteRange.max - n) * ROW_H + oy;
      if (y < HEADER_H || y > ch) continue;
      const isC = n % 12 === 0;
      ctx.strokeStyle = isC ? GRID_LINE_BAR : GRID_LINE;
      ctx.lineWidth = isC ? 1.5 : 0.5;
      ctx.beginPath();
      ctx.moveTo(PIANO_KEY_W, y);
      ctx.lineTo(cw, y);
      ctx.stroke();
    }

    // ── Note bars ────────────────────────────────────────────────────────

    for (const bar of noteBars) {
      const noteIdx = bar.xmNote - 1;
      if (noteIdx < noteRange.min || noteIdx > noteRange.max) continue;

      const x = PIANO_KEY_W + bar.startRow * COL_W + ox + 1;
      const y = HEADER_H + (noteRange.max - noteIdx) * ROW_H + oy + 1;
      const w = (bar.endRow - bar.startRow) * COL_W - 2;
      const h = ROW_H - 2;

      if (x + w < PIANO_KEY_W || x > cw || y + h < HEADER_H || y > ch) continue;

      const color = allChannels ? CHANNEL_COLORS[bar.channel % CHANNEL_COLORS.length] : NOTE_FILL;
      const borderColor = allChannels ? color : NOTE_BORDER;

      // Note body
      ctx.fillStyle = color + '99';
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, y, Math.max(w, 4), h, 2);
      ctx.fill();
      ctx.stroke();

      // Note name label (if wide enough)
      if (w > 24) {
        ctx.fillStyle = NOTE_TEXT;
        ctx.font = '9px monospace';
        ctx.textBaseline = 'middle';
        ctx.fillText(xmNoteToName(bar.xmNote), x + 3, y + h / 2);
      }
    }

    // ── Playhead ─────────────────────────────────────────────────────────

    if (isPlaying) {
      const px = PIANO_KEY_W + currentRow * COL_W + ox;
      if (px >= PIANO_KEY_W && px < cw) {
        ctx.fillStyle = PLAYHEAD_COLOR + '30';
        ctx.fillRect(px, HEADER_H, COL_W, ch - HEADER_H);
        ctx.strokeStyle = PLAYHEAD_COLOR;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, HEADER_H);
        ctx.lineTo(px, ch);
        ctx.stroke();
      }
    }

    // ── Piano keyboard (left column) ─────────────────────────────────────

    // Background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, PIANO_KEY_W, ch);

    for (let n = noteRange.max; n >= noteRange.min; n--) {
      const y = HEADER_H + (noteRange.max - n) * ROW_H + oy;
      if (y + ROW_H < 0 || y > ch) continue;

      const black = isBlackKey(n);
      const isC = n % 12 === 0;

      // Key background
      ctx.fillStyle = black ? '#1a1a1a' : '#2a2a2a';
      ctx.fillRect(0, y, PIANO_KEY_W - 1, ROW_H - 1);

      // C notes get octave label
      if (isC) {
        ctx.fillStyle = '#888';
        ctx.font = 'bold 9px monospace';
        ctx.textBaseline = 'middle';
        ctx.fillText(`C${Math.floor(n / 12)}`, 4, y + ROW_H / 2);
      } else {
        ctx.fillStyle = black ? '#555' : '#666';
        ctx.font = '8px monospace';
        ctx.textBaseline = 'middle';
        ctx.fillText(NOTE_NAMES[n % 12], 4, y + ROW_H / 2);
      }

      // Separator
      if (isC) {
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(PIANO_KEY_W, y);
        ctx.stroke();
      }
    }

    // Piano/grid separator
    ctx.strokeStyle = PIANO_BORDER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PIANO_KEY_W, 0);
    ctx.lineTo(PIANO_KEY_W, ch);
    ctx.stroke();

    // ── Top header (row numbers) ─────────────────────────────────────────

    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, cw, HEADER_H);

    ctx.fillStyle = '#555';
    ctx.font = '8px monospace';
    ctx.textBaseline = 'middle';
    for (let col = 0; col < patternLength; col++) {
      const x = PIANO_KEY_W + col * COL_W + ox;
      if (x < PIANO_KEY_W - COL_W || x > cw) continue;
      if (col % 4 === 0) {
        ctx.fillStyle = col % 16 === 0 ? '#888' : '#555';
        ctx.fillText(String(col).padStart(2, '0'), x + 2, HEADER_H / 2);
      }
    }

    // Header separator
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, HEADER_H);
    ctx.lineTo(cw, HEADER_H);
    ctx.stroke();
  }, [containerSize, scrollX, scrollY, noteBars, noteRange, patternLength, isPlaying, currentRow, allChannels]);

  // Render loop
  useEffect(() => {
    const frame = () => {
      render();
      animFrameRef.current = requestAnimationFrame(frame);
    };
    animFrameRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [render]);

  // ── Scroll handling ────────────────────────────────────────────────────

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.shiftKey) {
      // Horizontal scroll
      setScrollX(prev => Math.max(0, Math.min(gridW - containerSize.w + PIANO_KEY_W, prev + e.deltaY)));
    } else {
      // Vertical scroll
      setScrollY(prev => Math.max(0, Math.min(gridH - containerSize.h + HEADER_H, prev + e.deltaY)));
    }
  }, [gridW, gridH, containerSize]);

  // ── Click handling (place/remove notes) ────────────────────────────────

  const handleClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Only handle clicks in the grid area
    if (mx < PIANO_KEY_W || my < HEADER_H) return;

    const col = Math.floor((mx - PIANO_KEY_W + scrollX) / COL_W);
    const noteIdx = noteRange.max - Math.floor((my - HEADER_H + scrollY) / ROW_H);

    if (col < 0 || col >= patternLength) return;
    if (noteIdx < noteRange.min || noteIdx > noteRange.max) return;

    const xmNote = noteIdx + 1; // Convert to XM format (1-96)
    const ch = allChannels ? channelIndices[0] : channelIndex;

    // Check if there's already a note here
    const existingBar = noteBars.find(
      bar => bar.channel === ch && col >= bar.startRow && col < bar.endRow && bar.xmNote === xmNote,
    );

    if (existingBar) {
      // Remove note: clear the note-on cell
      setCell(ch, existingBar.startRow, { note: 0, instrument: 0, volume: 0 });
      // If there was a note-off, clear that too
      if (existingBar.endRow < patternLength) {
        const offCell = pattern?.channels[ch]?.rows[existingBar.endRow];
        if (offCell?.note === 97) {
          setCell(ch, existingBar.endRow, { note: 0 });
        }
      }
    } else {
      // Place note at click position
      const instNum = (currentInstrument ?? 0) + 1;
      setCell(ch, col, { note: xmNote, instrument: instNum, volume: 0x40 });

      // Place note-off 1 step later (default length = 1 step)
      // Unless next row already has a note
      const nextRow = col + 1;
      if (nextRow < patternLength) {
        const nextCell = pattern?.channels[ch]?.rows[nextRow];
        if (!nextCell?.note || nextCell.note === 0) {
          setCell(ch, nextRow, { note: 97 }); // note off
        }
      }
    }
  }, [scrollX, scrollY, noteRange, patternLength, noteBars, channelIndex, channelIndices, allChannels, setCell, currentInstrument, pattern]);

  // ── Follow playhead ────────────────────────────────────────────────────

  useEffect(() => {
    if (!isPlaying) return;
    const playheadX = currentRow * COL_W;
    const viewStart = scrollX;
    const viewEnd = scrollX + containerSize.w - PIANO_KEY_W;

    if (playheadX < viewStart || playheadX > viewEnd - COL_W * 4) {
      setScrollX(Math.max(0, playheadX - COL_W * 4));
    }
  }, [isPlaying, currentRow, scrollX, containerSize.w]);

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 min-w-0 overflow-hidden relative bg-dark-bg"
      style={{ cursor: 'crosshair' }}
    >
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        onWheel={handleWheel}
        className="absolute inset-0"
      />
    </div>
  );
};
