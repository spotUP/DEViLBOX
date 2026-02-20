/**
 * PixiPianoRollGrid — Note grid with scale highlighting and note rectangles.
 */

import { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { usePixiTheme } from '../../theme';

interface Note {
  note: number;      // MIDI note 0-127
  start: number;     // Start position in beats
  duration: number;  // Duration in beats
  velocity: number;  // 0-127
}

interface PixiPianoRollGridProps {
  width: number;
  height: number;
  notes: Note[];
  noteHeight?: number;
  pixelsPerBeat?: number;
  scrollNote?: number;
  scrollBeat?: number;
  totalBeats?: number;
  gridDivision?: number;
  selectedNotes?: Set<number>;
}

const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);

export const PixiPianoRollGrid: React.FC<PixiPianoRollGridProps> = ({
  width,
  height,
  notes,
  noteHeight = 12,
  pixelsPerBeat = 40,
  scrollNote = 36,
  scrollBeat = 0,
  totalBeats = 64,
  gridDivision = 4,
  selectedNotes,
}) => {
  const theme = usePixiTheme();

  const drawGrid = useCallback((g: GraphicsType) => {
    g.clear();

    // Background
    g.rect(0, 0, width, height);
    g.fill({ color: theme.bg.color });

    const visibleNotes = Math.ceil(height / noteHeight) + 1;
    const startNote = Math.max(0, Math.floor(scrollNote));
    const endNote = Math.min(128, startNote + visibleNotes);

    // Horizontal note rows
    for (let note = startNote; note < endNote; note++) {
      const y = height - (note - scrollNote + 1) * noteHeight;
      if (y > height || y + noteHeight < 0) continue;

      const noteInOctave = note % 12;
      const isBlack = BLACK_KEYS.has(noteInOctave);

      // Alternating row background
      g.rect(0, y, width, noteHeight);
      g.fill({ color: isBlack ? theme.bgSecondary.color : theme.bg.color, alpha: isBlack ? 0.6 : 1 });

      // Row border
      g.rect(0, y + noteHeight - 1, width, 1);
      g.fill({ color: theme.border.color, alpha: noteInOctave === 0 ? 0.3 : 0.08 });
    }

    // Vertical beat grid
    const startBeat = Math.floor(scrollBeat);
    const endBeat = Math.ceil(scrollBeat + width / pixelsPerBeat);

    for (let beat = startBeat; beat <= Math.min(endBeat, totalBeats); beat++) {
      for (let sub = 0; sub < gridDivision; sub++) {
        const x = (beat + sub / gridDivision - scrollBeat) * pixelsPerBeat;
        if (x < 0 || x > width) continue;

        g.rect(x, 0, 1, height);
        g.fill({ color: theme.border.color, alpha: sub === 0 ? 0.25 : 0.08 });
      }
    }

    // Note rectangles
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const x = (n.start - scrollBeat) * pixelsPerBeat;
      const y = height - (n.note - scrollNote + 1) * noteHeight;
      const w = n.duration * pixelsPerBeat;

      if (x + w < 0 || x > width || y + noteHeight < 0 || y > height) continue;

      const isSelected = selectedNotes?.has(i);
      const velAlpha = 0.4 + (n.velocity / 127) * 0.6;

      // Note body
      g.roundRect(x + 0.5, y + 1, Math.max(2, w - 1), noteHeight - 2, 2);
      g.fill({ color: isSelected ? theme.warning.color : theme.accent.color, alpha: velAlpha });

      // Note border
      g.roundRect(x + 0.5, y + 1, Math.max(2, w - 1), noteHeight - 2, 2);
      g.stroke({ color: isSelected ? theme.warning.color : theme.accent.color, alpha: 0.8, width: 1 });
    }
  }, [width, height, notes, noteHeight, pixelsPerBeat, scrollNote, scrollBeat, totalBeats, gridDivision, selectedNotes, theme]);

  return (
    <pixiContainer layout={{ width, height }}>
      <pixiGraphics draw={drawGrid} layout={{ position: 'absolute', width, height }} />
    </pixiContainer>
  );
};
