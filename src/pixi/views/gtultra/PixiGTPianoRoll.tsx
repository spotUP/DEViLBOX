/**
 * PixiGTPianoRoll — Visual piano-roll pattern editor for Studio Mode.
 *
 * Shows notes as horizontal bars on a piano grid, similar to DAW editors.
 * This is the beginner-friendly alternative to the hex pattern view.
 *
 * Layout: Piano keys on the left (C-0..B-7), time flows left-to-right,
 * channels shown in different colors.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import { MegaText, type GlyphLabel } from '@/pixi/utils/MegaText';
import { useGTUltraStore } from '@/stores/useGTUltraStore';

const C_BG       = 0x0e1525;
const C_BORDER   = 0x333366;
const C_KEY_WHITE = 0x1a2640;
const C_KEY_BLACK = 0x0d1420;
const C_KEY_LABEL = 0x556677;
const C_GRID     = 0x182030;
const C_GRIDBEAT = 0x223040;
const C_PLAYHEAD = 0xe94560;
const C_CURSOR_ROW = 0xffffff;

// Channel colors (3 channels per SID)
const CH_COLORS = [
  0x4488ff, // CH1 blue
  0xff6644, // CH2 orange
  0x44dd88, // CH3 green
  0x8866ff, // CH4 purple (SID2)
  0xffcc44, // CH5 yellow (SID2)
  0xff44aa, // CH6 pink (SID2)
];

const BLACK_KEYS = [1, 3, 6, 8, 10]; // C#, D#, F#, G#, A#

const PIANO_W = 36;
const MIN_NOTE = 24; // C-2
const MAX_NOTE = 84; // C-7
const VISIBLE_NOTES = MAX_NOTE - MIN_NOTE;

interface Props {
  width: number;
  height: number;
}

export const PixiGTPianoRoll: React.FC<Props> = ({ width, height }) => {
  const containerRef = useRef<any>(null);
  const bgRef = useRef<GraphicsType>(null);
  const notesRef = useRef<GraphicsType>(null);
  const overlayRef = useRef<GraphicsType>(null);
  const megaRef = useRef<MegaText | null>(null);

  const patternData = useGTUltraStore((s) => s.patternData);
  const orderData = useGTUltraStore((s) => s.orderData);
  const cursor = useGTUltraStore((s) => s.cursor);
  const currentRow = useGTUltraStore((s) => s.playbackPos.row);
  const channelCount = useGTUltraStore((s) => s.sidCount * 3);
  const isPlaying = useGTUltraStore((s) => s.playing);

  // Init MegaText
  useEffect(() => {
    const mega = new MegaText();
    megaRef.current = mega;
    if (containerRef.current) containerRef.current.addChild(mega);
    return () => { mega.destroy(); megaRef.current = null; };
  }, []);

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

    const gridW = width - PIANO_W;
    const noteH = Math.max(2, height / VISIBLE_NOTES);

    // Background
    bg.rect(0, 0, width, height).fill({ color: C_BG });

    // Piano keys
    for (let n = MIN_NOTE; n < MAX_NOTE; n++) {
      const y = (MAX_NOTE - 1 - n) * noteH;
      const semitone = n % 12;
      const isBlack = BLACK_KEYS.includes(semitone);
      const keyColor = isBlack ? C_KEY_BLACK : C_KEY_WHITE;

      bg.rect(0, y, PIANO_W, noteH).fill({ color: keyColor });
      bg.rect(0, y, PIANO_W, noteH).stroke({ color: C_BORDER, width: 0.5, alpha: 0.3 });

      // Grid row background
      bg.rect(PIANO_W, y, gridW, noteH).fill({ color: isBlack ? C_KEY_BLACK : C_GRID });

      // Note labels (every C)
      if (semitone === 0) {
        const octave = Math.floor(n / 12);
        labels.push({
          x: 2, y: y + 1,
          text: `C-${octave}`,
          color: C_KEY_LABEL,
          fontFamily: ff,
        });
        bg.moveTo(PIANO_W, y).lineTo(width, y).stroke({ color: C_GRIDBEAT, width: 1 });
      }
    }

    // Piano key border
    bg.rect(0, 0, PIANO_W, height).stroke({ color: C_BORDER, width: 1 });

    // Determine visible pattern data for active channels
    const numCh = Math.min(channelCount, 6);
    const patNums: number[] = [];
    for (let ch = 0; ch < numCh; ch++) {
      const od = orderData[ch];
      if (od && od.length > 0) {
        const orderPos = Math.min(cursor.row, od.length - 1);
        patNums.push(od[orderPos] ?? 0);
      } else {
        patNums.push(0);
      }
    }

    // Get pattern lengths and find max
    let maxRows = 32;
    const cellW = gridW / maxRows;

    // Draw beat grid lines
    for (let row = 0; row < maxRows; row++) {
      const x = PIANO_W + row * cellW;
      const isBeat = row % 4 === 0;
      bg.moveTo(x, 0).lineTo(x, height).stroke({
        color: isBeat ? C_GRIDBEAT : C_GRID,
        width: isBeat ? 1 : 0.5,
        alpha: isBeat ? 0.6 : 0.3,
      });

      // Row numbers (every 4)
      if (isBeat) {
        labels.push({
          x: x + 2, y: height - 10,
          text: row.toString(16).toUpperCase().padStart(2, '0'),
          color: C_KEY_LABEL,
          fontFamily: ff,
        });
      }
    }

    // Draw notes from pattern data
    for (let ch = 0; ch < numCh; ch++) {
      const patNum = patNums[ch];
      const pd = patternData.get(patNum);
      if (!pd) continue;

      const color = CH_COLORS[ch % CH_COLORS.length];
      const bytesPerCell = 4; // note, instrument, command, data

      for (let row = 0; row < maxRows; row++) {
        const offset = row * bytesPerCell;
        if (offset >= pd.length) break;

        const note = pd.data[offset];
        if (note === 0 || note === 0xBE || note === 0xBF) continue;
        if (note < 1 || note > 96) continue;

        const midiNote = note - 1 + 24; // GT notes start at C-0, offset to MIDI-ish
        if (midiNote < MIN_NOTE || midiNote >= MAX_NOTE) continue;

        // Find note length (scan ahead for next note or key-off)
        let noteLen = 1;
        for (let r2 = row + 1; r2 < maxRows; r2++) {
          const off2 = r2 * bytesPerCell;
          if (off2 >= pd.length) break;
          const n2 = pd.data[off2];
          if (n2 !== 0) break; // any non-empty = end of this note
          noteLen++;
        }

        const x = PIANO_W + row * cellW;
        const w = noteLen * cellW - 1;
        const y = (MAX_NOTE - 1 - midiNote) * noteH;

        // Note bar
        notes.rect(x, y + 1, w, noteH - 2).fill({ color, alpha: 0.7 });
        notes.rect(x, y + 1, w, noteH - 2).stroke({ color, width: 1, alpha: 1 });
      }
    }

    // Cursor position
    const cursorX = PIANO_W + cursor.row * cellW;
    overlay.rect(cursorX, 0, cellW, height).fill({ color: C_CURSOR_ROW, alpha: 0.08 });
    overlay.moveTo(cursorX, 0).lineTo(cursorX, height).stroke({ color: C_CURSOR_ROW, width: 1, alpha: 0.3 });

    // Playhead
    if (isPlaying) {
      const phX = PIANO_W + currentRow * cellW;
      overlay.moveTo(phX, 0).lineTo(phX, height).stroke({ color: C_PLAYHEAD, width: 2 });
    }

    mega.updateLabels(labels, 7);
  }, [width, height, patternData, orderData, cursor, currentRow, channelCount, isPlaying]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  return (
    <pixiContainer ref={containerRef} layout={{ width, height }}>
      <pixiGraphics ref={bgRef} draw={() => {}} />
      <pixiGraphics ref={notesRef} draw={() => {}} />
      <pixiGraphics ref={overlayRef} draw={() => {}} />
    </pixiContainer>
  );
};
