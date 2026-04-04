/**
 * PixiVirtualKeyboard — GL-native on-screen piano keyboard.
 *
 * Draws 2-3 octaves of piano keys using PixiJS Graphics.
 * White keys use theme.text.color, black keys use theme.bg.color,
 * active/pressed keys highlighted with theme.accent.color.
 *
 * Mirrors DOM VirtualKeyboard (src/components/ui/VirtualKeyboard.tsx).
 */

import React, { useCallback, useMemo, useState } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { usePixiTheme } from '../theme';
import { PixiLabel } from './PixiLabel';

// ─── Constants ──────────────────────────────────────────────────────────────

const BLACK_KEY_INDICES = new Set([1, 3, 6, 8, 10]); // Semitones that are black keys

/** Number of octaves to display */
const NUM_OCTAVES = 2;
const WHITE_KEYS_PER_OCTAVE = 7;
const TOTAL_WHITE_KEYS = NUM_OCTAVES * WHITE_KEYS_PER_OCTAVE;

/** Layout dimensions */
const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 120;
const BLACK_KEY_HEIGHT_RATIO = 0.6;
const BLACK_KEY_WIDTH_RATIO = 0.6;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Map from semitone index within an octave to the white key index before it */
function whiteKeysBefore(semitone: number): number {
  let count = 0;
  for (let i = 0; i < semitone; i++) {
    if (!BLACK_KEY_INDICES.has(i)) count++;
  }
  return count;
}

/** Build a mapping of all keys (24 semitones for 2 octaves) */
interface KeyInfo {
  index: number;       // 0-23 semitone index
  semitone: number;    // 0-11 within octave
  isBlack: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

function buildKeyLayout(width: number, height: number): KeyInfo[] {
  const whiteKeyW = width / TOTAL_WHITE_KEYS;
  const blackKeyW = whiteKeyW * BLACK_KEY_WIDTH_RATIO;
  const blackKeyH = height * BLACK_KEY_HEIGHT_RATIO;
  const keys: KeyInfo[] = [];

  for (let i = 0; i < NUM_OCTAVES * 12; i++) {
    const semitone = i % 12;
    const octaveOffset = Math.floor(i / 12);
    const isBlack = BLACK_KEY_INDICES.has(semitone);

    if (isBlack) {
      const whitesBefore = whiteKeysBefore(semitone);
      const x = (octaveOffset * WHITE_KEYS_PER_OCTAVE + whitesBefore) * whiteKeyW - blackKeyW / 2;
      keys.push({ index: i, semitone, isBlack: true, x, y: 0, w: blackKeyW, h: blackKeyH });
    } else {
      const whiteIndex = octaveOffset * WHITE_KEYS_PER_OCTAVE + whiteKeysBefore(semitone);
      const x = whiteIndex * whiteKeyW;
      keys.push({ index: i, semitone, isBlack: false, x, y: 0, w: whiteKeyW, h: height });
    }
  }

  return keys;
}

// ─── Props ──────────────────────────────────────────────────────────────────

export interface PixiVirtualKeyboardProps {
  octave?: number;
  activeNotes?: number[];
  onNoteOn?: (note: number) => void;
  onNoteOff?: (note: number) => void;
  width?: number;
  height?: number;
  layout?: Record<string, unknown>;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const PixiVirtualKeyboard: React.FC<PixiVirtualKeyboardProps> = ({
  octave = 4,
  activeNotes = [],
  onNoteOn,
  onNoteOff,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  layout: layoutProp,
}) => {
  const theme = usePixiTheme();
  const [pressedKeys, setPressedKeys] = useState<Set<number>>(new Set());

  const keyLayout = useMemo(() => buildKeyLayout(width, height), [width, height]);
  const activeNoteSet = useMemo(() => new Set(activeNotes), [activeNotes]);

  // Compute MIDI note from semitone index
  const toMidi = useCallback((index: number) => octave * 12 + index + 12, [octave]);

  const handlePointerDown = useCallback((index: number) => {
    const midi = octave * 12 + index + 12;
    setPressedKeys((prev) => new Set(prev).add(index));
    onNoteOn?.(midi);
  }, [octave, onNoteOn]);

  const handlePointerUp = useCallback((index: number) => {
    const midi = octave * 12 + index + 12;
    setPressedKeys((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
    onNoteOff?.(midi);
  }, [octave, onNoteOff]);

  // ── Draw white keys ──────────────────────────────────────────────────────

  const whiteKeys = useMemo(() => keyLayout.filter((k) => !k.isBlack), [keyLayout]);
  const blackKeys = useMemo(() => keyLayout.filter((k) => k.isBlack), [keyLayout]);

  const drawWhiteKeys = useCallback((g: GraphicsType) => {
    g.clear();
    for (const key of whiteKeys) {
      const midi = toMidi(key.index);
      const isActive = pressedKeys.has(key.index) || activeNoteSet.has(midi);
      const fillColor = isActive ? theme.accent.color : theme.text.color;

      // Key body
      g.roundRect(key.x + 0.5, key.y, key.w - 1, key.h - 1, 2);
      g.fill({ color: fillColor });

      // Subtle border
      g.roundRect(key.x + 0.5, key.y, key.w - 1, key.h - 1, 2);
      g.stroke({ color: theme.border.color, width: 0.5 });
    }
  }, [whiteKeys, pressedKeys, activeNoteSet, theme, toMidi]);

  // ── Draw black keys ──────────────────────────────────────────────────────

  const drawBlackKeys = useCallback((g: GraphicsType) => {
    g.clear();
    for (const key of blackKeys) {
      const midi = toMidi(key.index);
      const isActive = pressedKeys.has(key.index) || activeNoteSet.has(midi);
      const fillColor = isActive ? theme.accent.color : theme.bg.color;

      g.roundRect(key.x, key.y, key.w, key.h, 2);
      g.fill({ color: fillColor });

      // Border for definition
      g.roundRect(key.x, key.y, key.w, key.h, 2);
      g.stroke({ color: theme.border.color, width: 0.5 });
    }
  }, [blackKeys, pressedKeys, activeNoteSet, theme, toMidi]);

  // ── Hit testing for pointer events ───────────────────────────────────────
  // Black keys are on top, so check them first

  const findKeyAtPosition = useCallback((localX: number, localY: number): number | null => {
    // Check black keys first (higher z-order)
    for (const key of blackKeys) {
      if (localX >= key.x && localX <= key.x + key.w && localY >= key.y && localY <= key.y + key.h) {
        return key.index;
      }
    }
    // Then white keys
    for (const key of whiteKeys) {
      if (localX >= key.x && localX <= key.x + key.w && localY >= key.y && localY <= key.y + key.h) {
        return key.index;
      }
    }
    return null;
  }, [blackKeys, whiteKeys]);

  const handleContainerPointerDown = useCallback((e: FederatedPointerEvent) => {
    const local = e.getLocalPosition(e.currentTarget);
    const keyIndex = findKeyAtPosition(local.x, local.y);
    if (keyIndex !== null) {
      handlePointerDown(keyIndex);
    }
  }, [findKeyAtPosition, handlePointerDown]);

  const handleContainerPointerUp = useCallback((_e: FederatedPointerEvent) => {
    // Release all pressed keys
    pressedKeys.forEach((index) => {
      handlePointerUp(index);
    });
  }, [pressedKeys, handlePointerUp]);

  // ── Octave controls ──────────────────────────────────────────────────────

  const CONTROLS_HEIGHT = 28;
  const totalHeight = height + CONTROLS_HEIGHT + 4;

  return (
    <layoutContainer
      layout={{
        width,
        height: totalHeight,
        flexDirection: 'column',
        gap: 4,
        ...layoutProp,
      }}
    >
      {/* Octave controls row */}
      <layoutContainer
        layout={{
          width,
          height: CONTROLS_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <PixiLabel
          text={`Oct ${octave}`}
          size="xs"
          weight="bold"
          color="accent"
        />
      </layoutContainer>

      {/* Piano keyboard area */}
      <layoutContainer
        eventMode="static"
        cursor="pointer"
        onPointerDown={handleContainerPointerDown}
        onPointerUp={handleContainerPointerUp}
        onPointerUpOutside={handleContainerPointerUp}
        layout={{
          width,
          height,
          backgroundColor: theme.bgSecondary.color,
          borderRadius: 4,
          borderWidth: 1,
          borderColor: theme.border.color,
          overflow: 'hidden',
        }}
      >
        {/* White keys layer (behind) */}
        <pixiGraphics
          draw={drawWhiteKeys}
          layout={{ position: 'absolute', left: 0, top: 0, width, height }}
        />

        {/* Black keys layer (on top) */}
        <pixiGraphics
          draw={drawBlackKeys}
          layout={{ position: 'absolute', left: 0, top: 0, width, height }}
        />
      </layoutContainer>
    </layoutContainer>
  );
};
