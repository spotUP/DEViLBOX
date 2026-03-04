/**
 * PixiPianoKeyboard — Vertical piano keyboard display.
 * Renders white and black keys with note labels.
 * Supports click-to-play and chord mode (Shift+click accumulates pitches).
 */

import { useCallback, useMemo } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';

interface PixiPianoKeyboardProps {
  width?: number;
  height: number;
  noteHeight?: number;
  scrollNote?: number;
  /** Total note range (MIDI 0-127) */
  totalNotes?: number;
  /** Pitches currently in the chord buffer (shown with accent tint) */
  chordBuffer?: number[];
  /** Called when a key is clicked (pitch = MIDI note number, shiftHeld = Shift was held) */
  onKeyClick?: (pitch: number, shiftHeld: boolean) => void;
  /** Called when pointer is released over the keyboard */
  onKeyRelease?: (pitch: number) => void;
}

// Black key pattern per octave (C=0): C# D# - F# G# A#
const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);

/** Gold tint used to highlight keys in the chord buffer */
const CHORD_TINT = 0xffd700;

export const PixiPianoKeyboard: React.FC<PixiPianoKeyboardProps> = ({
  width = 60,
  height,
  noteHeight = 12,
  scrollNote = 36,
  totalNotes = 128,
  chordBuffer = [],
  onKeyClick,
  onKeyRelease,
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
      const isInChord = chordBuffer.includes(note);

      if (isBlack) {
        // Black key
        const keyColor = isInChord ? CHORD_TINT : 0x1a1a1d;
        g.rect(0, y, width * 0.65, noteHeight);
        g.fill({ color: keyColor });
        g.rect(0, y, width * 0.65, 1);
        g.fill({ color: isInChord ? 0xffe566 : 0x333338 });
      } else {
        // White key
        const keyColor = isInChord ? CHORD_TINT : 0xe8e8e8;
        g.rect(0, y, width, noteHeight);
        g.fill({ color: keyColor });
        g.rect(0, y + noteHeight - 1, width, 1);
        g.fill({ color: isInChord ? 0xccaa00 : 0xcccccc });
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
  }, [width, height, noteHeight, scrollNote, totalNotes, theme, chordBuffer]);

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

  /** Convert a pointer Y position to the MIDI note number it corresponds to */
  const yToMidiNote = useCallback((localY: number): number => {
    // note at bottom = scrollNote, note at top = scrollNote + visibleNotes
    const noteFromBottom = (height - localY) / noteHeight;
    return Math.floor(scrollNote + noteFromBottom);
  }, [height, noteHeight, scrollNote]);

  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    if (!onKeyClick) return;
    const localY = e.getLocalPosition((e.currentTarget as any)).y;
    const pitch = Math.max(0, Math.min(127, yToMidiNote(localY)));
    onKeyClick(pitch, e.shiftKey);
  }, [onKeyClick, yToMidiNote]);

  const handlePointerUp = useCallback((e: FederatedPointerEvent) => {
    if (!onKeyRelease) return;
    const localY = e.getLocalPosition((e.currentTarget as any)).y;
    const pitch = Math.max(0, Math.min(127, yToMidiNote(localY)));
    onKeyRelease(pitch);
  }, [onKeyRelease, yToMidiNote]);

  return (
    <pixiContainer layout={{ width, height }}>
      <pixiGraphics draw={drawKeyboard} layout={{ position: 'absolute', width, height }} />
      {cLabels.map(({ y, text }) => (
        <pixiBitmapText
          key={text}
          text={text}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
          tint={0x333338}
          x={width * 0.68}
          y={y}
        />
      ))}
      {/* Transparent hit-area overlay for click handling */}
      {onKeyClick && (
        <pixiGraphics
          draw={(g: GraphicsType) => {
            g.clear();
            g.rect(0, 0, width, height);
            g.fill({ color: 0xffffff, alpha: 0 });
          }}
          eventMode="static"
          cursor="pointer"
          layout={{ position: 'absolute', width, height }}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
        />
      )}
    </pixiContainer>
  );
};
