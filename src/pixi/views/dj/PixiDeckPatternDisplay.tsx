/**
 * PixiDeckPatternDisplay — GL-native pattern overlay for DJ decks.
 *
 * Shows a scrolling window of tracker pattern rows centered on the current
 * playback position. Used as a semi-transparent overlay on vinyl/3D deck modes
 * when a tracker module is loaded.
 *
 * Mirrors DeckPatternDisplay.tsx (DOM) — same data source, GL-native rendering.
 */

import React, { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@engine/dj/DJEngine';

// ── Display constants ───────────────────────────────────────────────────────
const ROW_HEIGHT = 14;
const VISIBLE_ROWS = 13; // Odd → current row is centered
const HALF = Math.floor(VISIBLE_ROWS / 2);
const MAX_DISPLAY_CHANNELS = 4; // Cap for readability in the small overlay

// ── Note/hex formatting (matches TrackerGLRenderer) ─────────────────────────
const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function formatNote(n: number): string {
  if (n === 0) return '---';
  if (n === 97) return 'OFF';
  const adj = n - 1;
  const noteIndex = ((adj % 12) + 12) % 12;
  const octave = Math.floor(adj / 12);
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

function hexByte(v: number): string {
  return v.toString(16).toUpperCase().padStart(2, '0');
}

// Format a single cell as a compact string: "C-4 01 C40 E01"
function formatCell(cell: { note: number; instrument: number; volume: number; effTyp: number; eff: number }): string {
  const note = formatNote(cell.note);
  const inst = cell.instrument > 0 ? hexByte(cell.instrument) : '..';
  const vol = cell.volume > 0 ? hexByte(cell.volume) : '..';
  const eff = cell.effTyp > 0 || cell.eff > 0
    ? `${cell.effTyp < 10 ? cell.effTyp.toString() : String.fromCharCode(55 + cell.effTyp)}${hexByte(cell.eff)}`
    : '...';
  return `${note} ${inst} ${vol} ${eff}`;
}

// ── Component ───────────────────────────────────────────────────────────────

interface PixiDeckPatternDisplayProps {
  deckId: 'A' | 'B' | 'C';
}

export const PixiDeckPatternDisplay: React.FC<PixiDeckPatternDisplayProps> = ({ deckId }) => {
  const theme = usePixiTheme();
  const songPos = useDJStore(s => s.decks[deckId].songPos);
  const pattPos = useDJStore(s => s.decks[deckId].pattPos);
  const fileName = useDJStore(s => s.decks[deckId].fileName);
  const totalPositions = useDJStore(s => s.decks[deckId].totalPositions);
  const activePatternName = useDJStore(s => s.decks[deckId].activePatternName);

  // Backward scratch visual offset (matches DOM DeckPatternDisplay)
  const [visualOffset, setVisualOffset] = useState(0);
  const lastTickRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!activePatternName) {
      setVisualOffset(0);
      lastTickRef.current = 0;
      return;
    }
    const tick = () => {
      const now = performance.now();
      const store = useDJStore.getState();
      const vel = store.decks[deckId].scratchVelocity;
      if (lastTickRef.current > 0 && vel < -0.1) {
        const bpm = store.decks[deckId].effectiveBPM || 125;
        const rowsPerSec = (bpm / 60) * 6;
        const dt = (now - lastTickRef.current) / 1000;
        const rowDelta = Math.abs(vel) * rowsPerSec * dt;
        setVisualOffset(prev => prev + rowDelta);
      } else if (vel > 0.1) {
        setVisualOffset(prev => prev > 0 ? Math.max(0, prev - 2) : 0);
      }
      lastTickRef.current = now;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(rafRef.current); lastTickRef.current = 0; };
  }, [deckId, activePatternName]);

  // Extract pattern data from DJ engine
  const { rows, numRows } = useMemo(() => {
    try {
      const engine = getDJEngine();
      const deck = engine.getDeck(deckId);
      const song = deck.replayer.getSong();
      if (!song?.songPositions?.length) return { rows: null, numRows: 64 };
      const patternIndex = song.songPositions[songPos] ?? 0;
      const pat = song.patterns[patternIndex];
      if (!pat) return { rows: null, numRows: 64 };

      const nCh = Math.min(pat.channels.length, MAX_DISPLAY_CHANNELS);
      const nRows = pat.length;

      // Build row strings for all rows in the pattern
      const rowStrings: string[][] = [];
      for (let r = 0; r < nRows; r++) {
        const rowCells: string[] = [];
        for (let c = 0; c < nCh; c++) {
          const cell = pat.channels[c]?.rows[r];
          if (cell) {
            rowCells.push(formatCell(cell));
          } else {
            rowCells.push('--- .. .. ...');
          }
        }
        rowStrings.push(rowCells);
      }
      return { rows: rowStrings, numRows: nRows };
    } catch {
      return { rows: null, numChannels: 4, numRows: 64 };
    }
  }, [deckId, songPos, fileName, totalPositions]);

  // Compute visual row with scratch offset
  const currentRow = activePatternName && visualOffset > 0
    ? ((pattPos - Math.round(visualOffset)) % numRows + numRows) % numRows
    : pattPos;

  // Build visible rows around current position
  const visibleRows = useMemo(() => {
    if (!rows) return null;
    const result: { rowIdx: number; text: string; isActive: boolean }[] = [];
    for (let i = 0; i < VISIBLE_ROWS; i++) {
      const rowIdx = ((currentRow - HALF + i) % numRows + numRows) % numRows;
      const cells = rows[rowIdx];
      const rowNum = hexByte(rowIdx);
      const text = cells ? `${rowNum}|${cells.join('|')}` : `${rowNum}|`;
      result.push({ rowIdx, text, isActive: rowIdx === currentRow });
    }
    return result;
  }, [rows, currentRow, numRows]);

  // Background draw callback
  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    const w = (g as any).layout?.computedLayout?.width ?? 300;
    const h = VISIBLE_ROWS * ROW_HEIGHT;
    // Dark background
    g.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.7 });
    // Highlight active row
    const activeY = HALF * ROW_HEIGHT;
    g.rect(0, activeY, w, ROW_HEIGHT).fill({ color: theme.accent.color, alpha: 0.3 });
  }, [theme.accent]);

  if (!visibleRows) return null;

  return (
    <pixiContainer
      eventMode="none"
      layout={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <pixiContainer layout={{ width: '100%', height: VISIBLE_ROWS * ROW_HEIGHT, flexDirection: 'column' }}>
        <pixiGraphics
          draw={drawBg}
          layout={{ position: 'absolute', width: '100%', height: VISIBLE_ROWS * ROW_HEIGHT }}
          eventMode="none"
        />
        {visibleRows.map((row, i) => (
          <pixiBitmapText
            key={i}
            text={row.text}
            style={{
              fontFamily: PIXI_FONTS.MONO,
              fontSize: 10,
              fill: 0xffffff,
            }}
            tint={row.isActive ? 0xffffff : 0x999999}
            alpha={row.isActive ? 1.0 : 0.6}
            layout={{ height: ROW_HEIGHT, paddingLeft: 4, paddingTop: 2 }}
            eventMode="none"
          />
        ))}
      </pixiContainer>
    </pixiContainer>
  );
};
