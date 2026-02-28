/**
 * PixiPianoKeyboard — Vertical piano keyboard display.
 * Renders white and black keys with note labels.
 */

import { useCallback, useMemo } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';

interface PixiPianoKeyboardProps {
  width?: number;
  height: number;
  noteHeight?: number;
  scrollNote?: number;
  /** Total note range (MIDI 0-127) */
  totalNotes?: number;
}

// Black key pattern per octave (C=0): C# D# - F# G# A#
const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);

export const PixiPianoKeyboard: React.FC<PixiPianoKeyboardProps> = ({
  width = 60,
  height,
  noteHeight = 12,
  scrollNote = 36,
  totalNotes = 128,
}) => {
  const theme = usePixiTheme();

  const drawKeyboard = useCallback((g: GraphicsType) => {
    g.clear();

    // Background
    g.rect(0, 0, width, height);
    g.fill({ color: theme.bgSecondary.color });

    const visibleNotes = Math.ceil(height / noteHeight) + 1;
    const startNote = Math.max(0, Math.floor(scrollNote));
    const endNote = Math.min(totalNotes, startNote + visibleNotes);

    for (let note = startNote; note < endNote; note++) {
      const y = height - (note - scrollNote + 1) * noteHeight;
      if (y > height || y + noteHeight < 0) continue;

      const noteInOctave = note % 12;
      const isBlack = BLACK_KEYS.has(noteInOctave);

      if (isBlack) {
        // Black key
        g.rect(0, y, width * 0.65, noteHeight);
        g.fill({ color: 0x1a1a1d });
        g.rect(0, y, width * 0.65, 1);
        g.fill({ color: 0x333338 });
      } else {
        // White key
        g.rect(0, y, width, noteHeight);
        g.fill({ color: 0xe8e8e8 });
        g.rect(0, y + noteHeight - 1, width, 1);
        g.fill({ color: 0xcccccc });
      }

      // C note labels
      if (noteInOctave === 0) {
        // Draw a slightly stronger border at C
        g.rect(0, y + noteHeight - 1, width, 1);
        g.fill({ color: theme.accent.color, alpha: 0.3 });
      }
    }

    // Right border
    g.rect(width - 1, 0, 1, height);
    g.fill({ color: theme.border.color, alpha: 0.3 });
  }, [width, height, noteHeight, scrollNote, totalNotes, theme]);

  // Note labels for C notes
  const cLabels = useMemo(() => {
    const labels: { y: number; text: string }[] = [];
    const visibleNotes = Math.ceil(height / noteHeight) + 1;
    const startNote = Math.max(0, Math.floor(scrollNote));
    const endNote = Math.min(totalNotes, startNote + visibleNotes);

    for (let note = startNote; note < endNote; note++) {
      if (note % 12 === 0) {
        const y = height - (note - scrollNote + 1) * noteHeight;
        if (y >= 0 && y <= height) {
          const octave = Math.floor(note / 12) - 1;
          labels.push({ y: y + 1, text: `C${octave}` });
        }
      }
    }
    return labels;
  }, [height, noteHeight, scrollNote, totalNotes]);

  return (
    <pixiContainer layout={{ width, height }}>
      <pixiGraphics draw={drawKeyboard} layout={{ position: 'absolute', width, height }} />
      {cLabels.map(({ y, text }) => (
        <pixiBitmapText
          key={text}
          text={text}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 8, fill: 0xffffff }}
          tint={0x333338}
          x={width * 0.68}
          y={y}
        />
      ))}
    </pixiContainer>
  );
};
