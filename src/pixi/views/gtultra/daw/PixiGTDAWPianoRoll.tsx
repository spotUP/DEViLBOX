/**
 * PixiGTDAWPianoRoll — Full DAW-quality piano roll with click-to-place editing.
 *
 * Layout: Piano keys (left) | Note grid (scrollable H+V) | Velocity lane (bottom)
 *
 * Click to place notes, right-click to delete, drag to move pitch.
 * Notes are rendered as rounded rectangles in channel colors.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import { MegaText, type GlyphLabel } from '@/pixi/utils/MegaText';
import { useGTUltraStore } from '@/stores/useGTUltraStore';
import {
  DAW_BG, DAW_PANEL_BORDER, DAW_ACCENT_WARM, DAW_TEXT_MUTED,
  DAW_CH_COLORS, DAW_PIANO_KEYS_W, DAW_VELOCITY_H,
  DAW_GRID_WHITE_KEY, DAW_GRID_BLACK_KEY, DAW_GRID_BEAT, DAW_GRID_SUB,
} from './dawTheme';

const BLACK_KEYS = [1, 3, 6, 8, 10]; // C#, D#, F#, G#, A#
const MIN_NOTE = 24;  // C-2
const MAX_NOTE = 84;  // C-7
const VISIBLE_NOTES = MAX_NOTE - MIN_NOTE;

interface Props {
  width: number;
  height: number;
}

export const PixiGTDAWPianoRoll: React.FC<Props> = ({ width, height }) => {
  const containerRef = useRef<any>(null);
  const bgRef = useRef<GraphicsType>(null);
  const notesRef = useRef<GraphicsType>(null);
  const overlayRef = useRef<GraphicsType>(null);
  const megaRef = useRef<MegaText | null>(null);

  const patternData = useGTUltraStore((s) => s.patternData);
  const cursor = useGTUltraStore((s) => s.cursor);
  const playbackPos = useGTUltraStore((s) => s.playbackPos);
  const playing = useGTUltraStore((s) => s.playing);
  const dawSelectedChannel = useGTUltraStore((s) => s.dawSelectedChannel);
  const dawSelectedPattern = useGTUltraStore((s) => s.dawSelectedPattern);
  const currentInstrument = useGTUltraStore((s) => s.currentInstrument);
  const dawZoomX = useGTUltraStore((s) => s.dawZoomX);
  const dawGridSnap = useGTUltraStore((s) => s.dawGridSnap);
  const engine = useGTUltraStore((s) => s.engine);

  useEffect(() => {
    const mega = new MegaText();
    megaRef.current = mega;
    if (containerRef.current) containerRef.current.addChild(mega);
    return () => { mega.destroy(); megaRef.current = null; };
  }, []);

  const gridH = height - DAW_VELOCITY_H;
  const gridW = width - DAW_PIANO_KEYS_W;
  const noteH = Math.max(2, gridH / VISIBLE_NOTES);
  const cellW = dawZoomX;

  // Get pattern data for selected pattern
  const pd = patternData.get(dawSelectedPattern);
  const maxRows = pd ? pd.length : 32;

  const noteToY = useCallback((note: number) => {
    return (MAX_NOTE - 1 - note) * noteH;
  }, [noteH]);

  const yToNote = useCallback((y: number) => {
    return Math.max(MIN_NOTE, Math.min(MAX_NOTE - 1, MAX_NOTE - 1 - Math.floor(y / noteH)));
  }, [noteH]);

  const xToRow = useCallback((x: number) => {
    const raw = Math.floor((x - DAW_PIANO_KEYS_W) / cellW);
    const snapped = Math.round(raw / dawGridSnap) * dawGridSnap;
    return Math.max(0, Math.min(maxRows - 1, snapped));
  }, [cellW, maxRows, dawGridSnap]);

  const redraw = useCallback(() => {
    const bg = bgRef.current;
    const notes = notesRef.current;
    const overlay = overlayRef.current;
    const mega = megaRef.current;
    if (!bg || !notes || !overlay || !mega) return;

    bg.clear();
    notes.clear();
    overlay.clear();

    const labels: GlyphLabel[] = [];
    const ff = PIXI_FONTS.MONO;
    const keysW = DAW_PIANO_KEYS_W;

    // Background
    bg.rect(0, 0, width, height).fill({ color: DAW_BG });

    // Piano keys + grid rows
    for (let n = MIN_NOTE; n < MAX_NOTE; n++) {
      const y = noteToY(n);
      const semitone = n % 12;
      const isBlack = BLACK_KEYS.includes(semitone);

      // Piano key
      bg.rect(0, y, keysW, noteH).fill({ color: isBlack ? 0x0a0a0a : 0x141414 });
      bg.rect(0, y, keysW, noteH).stroke({ color: DAW_PANEL_BORDER, width: 0.5, alpha: 0.3 });

      // Grid row
      bg.rect(keysW, y, gridW, noteH).fill({ color: isBlack ? DAW_GRID_BLACK_KEY : DAW_GRID_WHITE_KEY });

      // Octave label
      if (semitone === 0) {
        const octave = Math.floor(n / 12);
        labels.push({ x: 2, y: y + 1, text: `C${octave}`, color: DAW_TEXT_MUTED, fontFamily: ff });
        bg.moveTo(keysW, y).lineTo(width, y).stroke({ color: DAW_GRID_BEAT, width: 1 });
      }
    }

    // Piano key border
    bg.rect(0, 0, keysW, gridH).stroke({ color: DAW_PANEL_BORDER, width: 1 });

    // Beat grid lines (vertical)
    for (let row = 0; row < maxRows; row++) {
      const x = keysW + row * cellW;
      const isBeat = row % 4 === 0;
      bg.moveTo(x, 0).lineTo(x, gridH).stroke({
        color: isBeat ? DAW_GRID_BEAT : DAW_GRID_SUB,
        width: isBeat ? 1 : 0.5,
        alpha: isBeat ? 0.6 : 0.3,
      });

      if (isBeat) {
        labels.push({
          x: x + 2, y: gridH + 2,
          text: row.toString(16).toUpperCase().padStart(2, '0'),
          color: DAW_TEXT_MUTED,
          fontFamily: ff,
        });
      }
    }

    // Velocity lane separator
    bg.rect(keysW, gridH, gridW, 1).fill({ color: DAW_PANEL_BORDER });
    bg.rect(0, gridH, keysW, DAW_VELOCITY_H).fill({ color: DAW_BG });
    labels.push({ x: 4, y: gridH + 4, text: 'VEL', color: DAW_TEXT_MUTED, fontFamily: ff });

    // Draw notes from pattern data
    if (pd) {
      const bytesPerCell = 4;
      const color = DAW_CH_COLORS[dawSelectedChannel % DAW_CH_COLORS.length];

      for (let row = 0; row < maxRows; row++) {
        const offset = row * bytesPerCell;
        if (offset >= pd.data.length) break;

        const noteVal = pd.data[offset];
        if (noteVal === 0 || noteVal === 0xBE || noteVal === 0xBF) continue;
        if (noteVal < 1 || noteVal > 96) continue;

        const midiNote = noteVal - 1 + 24;
        if (midiNote < MIN_NOTE || midiNote >= MAX_NOTE) continue;

        // Find note length (scan ahead)
        let noteLen = 1;
        for (let r2 = row + 1; r2 < maxRows; r2++) {
          const off2 = r2 * bytesPerCell;
          if (off2 >= pd.data.length) break;
          if (pd.data[off2] !== 0) break;
          noteLen++;
        }

        const x = keysW + row * cellW;
        const w = noteLen * cellW - 1;
        const y = noteToY(midiNote);

        // Note bar (rounded)
        notes.roundRect(x, y + 1, Math.max(4, w), noteH - 2, 2)
          .fill({ color, alpha: 0.7 });
        notes.roundRect(x, y + 1, Math.max(4, w), noteH - 2, 2)
          .stroke({ color, width: 1 });

        // Velocity bar
        const velocity = pd.data[offset + 1]; // instrument column as velocity proxy
        const velH = velocity > 0 ? (velocity / 63) * (DAW_VELOCITY_H - 8) : DAW_VELOCITY_H * 0.5;
        notes.rect(x, gridH + DAW_VELOCITY_H - velH - 2, Math.max(2, cellW - 2), velH)
          .fill({ color, alpha: 0.6 });
      }
    }

    // Cursor
    const cursorX = keysW + cursor.row * cellW;
    overlay.rect(cursorX, 0, cellW, gridH).fill({ color: 0xffffff, alpha: 0.05 });

    // Playhead
    if (playing) {
      const phX = keysW + playbackPos.row * cellW;
      overlay.rect(phX, 0, 2, height).fill({ color: DAW_ACCENT_WARM });
    }

    mega.updateLabels(labels, 7);
  }, [width, height, gridH, gridW, noteH, cellW, maxRows, pd, dawSelectedChannel, cursor, playing, playbackPos, noteToY]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // Click to place/delete notes
  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    if (!engine || !pd) return;
    const local = e.getLocalPosition(containerRef.current);
    if (local.x < DAW_PIANO_KEYS_W || local.y > gridH) return;

    const row = xToRow(local.x);
    const note = yToNote(local.y);
    const gtNote = note - 24 + 1; // Convert back to GT note (1-based)

    const bytesPerCell = 4;
    const offset = row * bytesPerCell;
    const existingNote = offset < pd.data.length ? pd.data[offset] : 0;

    if (e.button === 2 || (e.button === 0 && existingNote > 0 && existingNote < 0xBD)) {
      // Right-click or click existing note: delete
      engine.setPatternCell(dawSelectedPattern, row, 0, 0);
      engine.setPatternCell(dawSelectedPattern, row, 1, 0);
      useGTUltraStore.getState().refreshPatternData(dawSelectedPattern);
    } else if (e.button === 0 && (existingNote === 0 || existingNote >= 0xBD)) {
      // Left-click empty: place note
      if (gtNote >= 1 && gtNote <= 95) {
        engine.setPatternCell(dawSelectedPattern, row, 0, gtNote);
        engine.setPatternCell(dawSelectedPattern, row, 1, currentInstrument);
        useGTUltraStore.getState().refreshPatternData(dawSelectedPattern);
        // Preview the note
        engine.jamNoteOn(dawSelectedChannel, gtNote, currentInstrument);
        setTimeout(() => engine.jamNoteOff(dawSelectedChannel), 200);
      }
    }
  }, [engine, pd, gridH, xToRow, yToNote, dawSelectedPattern, dawSelectedChannel, currentInstrument]);

  return (
    <pixiContainer
      ref={containerRef}
      layout={{ width, height }}
      eventMode="static"
      onPointerDown={handlePointerDown}
      onRightDown={handlePointerDown}
    >
      <pixiGraphics ref={bgRef} draw={() => {}} />
      <pixiGraphics ref={notesRef} draw={() => {}} />
      <pixiGraphics ref={overlayRef} draw={() => {}} />
    </pixiContainer>
  );
};
