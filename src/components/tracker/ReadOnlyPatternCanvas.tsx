/**
 * ReadOnlyPatternCanvas — Canvas-based pattern display (read-only)
 *
 * Faithfully replicates the rendering pipeline of PatternEditorCanvas:
 * same fonts, colors, caching, note/effect formatting, row highlighting.
 *
 * Accepts pattern data as props instead of reading from stores, making it
 * usable in contexts like DJ decks where data comes from per-deck engines.
 */

import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import type { Pattern, TrackerCell } from '@/types';

// ─── Constants (matching PatternEditorCanvas) ────────────────────────────────

const ROW_HEIGHT = 24;
const CHAR_WIDTH = 10;
const LINE_NUMBER_WIDTH = 40;

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

// ─── Colors (matching PatternEditorCanvas defaults) ──────────────────────────

const COLORS = {
  bg: '#0a0a0b',
  rowNormal: '#0d0d0e',
  rowHighlight: '#111113',
  centerLine: 'rgba(0, 255, 255, 0.08)',
  textMuted: '#505050',
  textNote: '#909090',
  textNoteActive: '#ffffff',
  textInstrument: '#4ade80',
  textVolume: '#60a5fa',
  textEffect: '#f97316',
  border: '#252530',
  lineNumber: '#707070',
  lineNumberHighlight: '#f97316',
};

// ─── Cache types ─────────────────────────────────────────────────────────────

interface CanvasCache {
  [key: string]: HTMLCanvasElement;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface ReadOnlyPatternCanvasProps {
  /** Pattern data to render */
  pattern: Pattern | null;
  /** Currently active row (highlighted center line) */
  currentRow: number;
  /** Number of channels */
  numChannels: number;
  /** Whether the deck is actively playing (enables active-row note flash) */
  isPlaying?: boolean;
  /** Optional height override (default: fills parent) */
  height?: number;
}

export const ReadOnlyPatternCanvas: React.FC<ReadOnlyPatternCanvasProps> = React.memo(({
  pattern,
  currentRow,
  numChannels,
  isPlaying = false,
  height: heightProp,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const noteCacheRef = useRef<CanvasCache>({});
  const paramCacheRef = useRef<CanvasCache>({});
  const lineNumberCacheRef = useRef<CanvasCache>({});
  const [dimensions, setDimensions] = useState({ width: 400, height: 300 });

  // Observe container size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const w = Math.floor(entry.contentRect.width);
        const h = heightProp ?? Math.floor(entry.contentRect.height);
        if (w > 0 && h > 0) setDimensions({ width: w, height: h });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [heightProp]);

  // Update canvas size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    canvas.style.width = `${dimensions.width}px`;
    canvas.style.height = `${dimensions.height}px`;
  }, [dimensions]);

  // Clear caches when pattern changes
  useEffect(() => {
    noteCacheRef.current = {};
    paramCacheRef.current = {};
    lineNumberCacheRef.current = {};
  }, [pattern?.id]);

  // ── Cached cell renderers (same approach as PatternEditorCanvas) ──────────

  const getNoteCanvas = useCallback((note: number, isActive = false): HTMLCanvasElement => {
    const dpr = window.devicePixelRatio || 1;
    const key = `${note}-${isActive ? 'a' : 'n'}-dpr${dpr}`;
    if (noteCacheRef.current[key]) return noteCacheRef.current[key];

    const canvas = document.createElement('canvas');
    canvas.width = (CHAR_WIDTH * 3 + 4) * dpr;
    canvas.height = ROW_HEIGHT * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    ctx.font = '14px "JetBrains Mono", "Fira Code", monospace';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = note === 0 ? COLORS.textMuted
      : note === 97 ? COLORS.textEffect
      : (isActive ? COLORS.textNoteActive : COLORS.textNote);
    ctx.fillText(noteToString(note), 0, ROW_HEIGHT / 2);

    noteCacheRef.current[key] = canvas;
    return canvas;
  }, []);

  const getParamCanvas = useCallback((
    instrument: number, volume: number,
    effTyp: number, eff: number,
    effTyp2: number, eff2: number,
  ): HTMLCanvasElement => {
    const dpr = window.devicePixelRatio || 1;
    const key = `${instrument}-${volume}-${effTyp}-${eff}-${effTyp2}-${eff2}-dpr${dpr}`;
    if (paramCacheRef.current[key]) return paramCacheRef.current[key];

    const numEffectCols = 2;
    const effectWidth = numEffectCols * (CHAR_WIDTH * 3 + 4);
    const logicalW = CHAR_WIDTH * 4 + 8 + effectWidth;

    const canvas = document.createElement('canvas');
    canvas.width = logicalW * dpr;
    canvas.height = ROW_HEIGHT * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    ctx.font = '14px "JetBrains Mono", "Fira Code", monospace';
    ctx.textBaseline = 'middle';

    let x = 0;
    const y = ROW_HEIGHT / 2;

    // Instrument
    if (instrument !== 0) {
      ctx.fillStyle = COLORS.textInstrument;
      ctx.fillText(hexByte(instrument), x, y);
    } else {
      ctx.fillStyle = COLORS.textMuted;
      ctx.fillText('..', x, y);
    }
    x += CHAR_WIDTH * 2 + 4;

    // Volume
    const hasVolume = volume >= 0x10 && volume <= 0x50;
    if (hasVolume) {
      ctx.fillStyle = COLORS.textVolume;
      ctx.fillText(hexByte(volume), x, y);
    } else {
      ctx.fillStyle = COLORS.textMuted;
      ctx.fillText('..', x, y);
    }
    x += CHAR_WIDTH * 2 + 4;

    // Effect columns
    const effects = [
      { typ: effTyp, param: eff },
      { typ: effTyp2, param: eff2 },
    ];
    for (const { typ, param } of effects) {
      if (typ !== 0 || param !== 0) {
        ctx.fillStyle = COLORS.textEffect;
        const effChar = typ < 10 ? typ.toString() : String.fromCharCode(55 + typ);
        ctx.fillText(effChar + hexByte(param), x, y);
      } else {
        ctx.fillStyle = COLORS.textMuted;
        ctx.fillText('...', x, y);
      }
      x += CHAR_WIDTH * 3 + 4;
    }

    paramCacheRef.current[key] = canvas;
    return canvas;
  }, []);

  const getLineNumberCanvas = useCallback((lineNum: number): HTMLCanvasElement => {
    const dpr = window.devicePixelRatio || 1;
    const isHighlight = lineNum % 4 === 0;
    const key = `${lineNum}-${isHighlight}-dpr${dpr}`;
    if (lineNumberCacheRef.current[key]) return lineNumberCacheRef.current[key];

    const canvas = document.createElement('canvas');
    canvas.width = LINE_NUMBER_WIDTH * dpr;
    canvas.height = ROW_HEIGHT * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    ctx.font = isHighlight ? 'bold 12px "JetBrains Mono", monospace' : '12px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = isHighlight ? COLORS.lineNumberHighlight : COLORS.lineNumber;

    const text = lineNum.toString(16).toUpperCase().padStart(2, '0');
    ctx.fillText(text, LINE_NUMBER_WIDTH / 2, ROW_HEIGHT / 2);

    lineNumberCacheRef.current[key] = canvas;
    return canvas;
  }, []);

  // ── Channel layout ────────────────────────────────────────────────────────

  const noteWidth = CHAR_WIDTH * 3 + 4;
  const paramWidth = CHAR_WIDTH * 4 + 8 + 2 * (CHAR_WIDTH * 3 + 4); // inst + vol + 2 effect cols
  const contentWidth = noteWidth + 4 + paramWidth;

  const { channelOffsets, channelWidths } = useMemo(() => {
    const usableWidth = dimensions.width - LINE_NUMBER_WIDTH;
    const minChannelWidth = contentWidth + 16; // content + padding
    const channelWidth = Math.max(minChannelWidth, Math.floor(usableWidth / numChannels));

    const offsets: number[] = [];
    const widths: number[] = [];
    for (let i = 0; i < numChannels; i++) {
      offsets.push(LINE_NUMBER_WIDTH + i * channelWidth);
      widths.push(channelWidth);
    }
    return { channelOffsets: offsets, channelWidths: widths };
  }, [dimensions.width, numChannels, contentWidth]);

  // ── Main render ───────────────────────────────────────────────────────────

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const { width, height } = dimensions;

    if (!pattern) {
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = COLORS.textMuted;
      ctx.font = '14px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Drop a module here', width / 2, height / 2);
      return;
    }

    const patternLength = pattern.length;
    const visibleLines = Math.ceil(height / ROW_HEIGHT) + 2;
    const topLines = Math.floor(visibleLines / 2);
    const vStart = currentRow - topLines;
    const visibleEnd = vStart + visibleLines;
    const centerLineTop = Math.floor(height / 2) - ROW_HEIGHT / 2;
    const baseY = centerLineTop - (topLines * ROW_HEIGHT);

    // Clear
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);

    // Channel separators (full height)
    for (let ch = 0; ch < numChannels; ch++) {
      const colX = channelOffsets[ch];
      const chW = channelWidths[ch];
      if (colX + chW < 0 || colX > width) continue;
      ctx.fillStyle = COLORS.border;
      ctx.fillRect(colX + chW, 0, 1, height);
    }

    // Draw rows
    for (let i = vStart; i < visibleEnd; i++) {
      if (i < 0 || i >= patternLength) continue;

      const rowIndex = i;
      const y = baseY + ((i - vStart) * ROW_HEIGHT);
      if (y < -ROW_HEIGHT || y > height + ROW_HEIGHT) continue;

      // Row background
      const isHighlight = rowIndex % 4 === 0;
      ctx.fillStyle = isHighlight ? COLORS.rowHighlight : COLORS.rowNormal;
      ctx.fillRect(0, y, width, ROW_HEIGHT);

      // Line number
      ctx.drawImage(getLineNumberCanvas(rowIndex), 4, y, LINE_NUMBER_WIDTH, ROW_HEIGHT);

      // Channel cells
      for (let ch = 0; ch < numChannels; ch++) {
        const colX = channelOffsets[ch];
        const chW = channelWidths[ch];
        if (colX + chW < 0 || colX > width) continue;

        const x = colX + Math.floor((chW - contentWidth) / 2);
        const cell: TrackerCell | undefined = pattern.channels[ch]?.rows?.[rowIndex];
        if (!cell) continue;

        // Note
        const cellNote = cell.note || 0;
        const isCurrentPlayingRow = isPlaying && rowIndex === currentRow;
        const noteCanvas = getNoteCanvas(cellNote, isCurrentPlayingRow && cellNote > 0);
        ctx.drawImage(noteCanvas, x, y, CHAR_WIDTH * 3 + 4, ROW_HEIGHT);

        // Parameters
        const paramCanvas = getParamCanvas(
          cell.instrument || 0,
          cell.volume || 0,
          cell.effTyp || 0,
          cell.eff || 0,
          cell.effTyp2 || 0,
          cell.eff2 || 0,
        );
        const dprLocal = window.devicePixelRatio || 1;
        ctx.drawImage(paramCanvas, x + noteWidth + 4, y, paramCanvas.width / dprLocal, ROW_HEIGHT);
      }
    }

    // Center line highlight (current row)
    ctx.fillStyle = COLORS.centerLine;
    ctx.fillRect(0, centerLineTop, width, ROW_HEIGHT);

  }, [pattern, currentRow, numChannels, isPlaying, dimensions, channelOffsets, channelWidths,
      getNoteCanvas, getParamCanvas, getLineNumberCanvas, noteWidth, contentWidth]);

  // Ref to keep render callback up to date for the animation loop
  const renderRef = useRef(render);
  useEffect(() => {
    renderRef.current = render;
  });

  // RAF render loop - stable loop that never restarts
  useEffect(() => {
    let frameId: number;
    const loop = () => {
      if (!document.hidden) {
        renderRef.current();
      }
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full" style={heightProp ? { height: heightProp } : undefined}>
      <canvas
        ref={canvasRef}
        className="block"
        style={{ width: dimensions.width, height: dimensions.height }}
      />
    </div>
  );
});
