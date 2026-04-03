/**
 * PixiTestKeyboard — On-screen piano keyboard for the Pixi instrument editor.
 * Horizontal layout, 2-4 octaves centered on C4, pointer-driven note triggering.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Graphics, FederatedPointerEvent } from 'pixi.js';
import { getToneEngine } from '../../../engine/ToneEngine';
import type { InstrumentConfig } from '../../../types/instrument';

interface PixiTestKeyboardProps {
  instrument: InstrumentConfig;
  width: number;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const WHITE_NOTE_INDICES = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
// Black key note indices within an octave: C#=1, D#=3, F#=6, G#=8, A#=10
const WHITE_KEYS_PER_OCTAVE = 7;
const KEY_HEIGHT = 60;
const BLACK_KEY_HEIGHT = 38;

function noteFromPosition(x: number, y: number, whiteKeyWidth: number, startOctave: number, totalWhiteKeys: number): string | null {
  if (x < 0 || y < 0 || y > KEY_HEIGHT) return null;

  const whiteIndex = Math.floor(x / whiteKeyWidth);
  if (whiteIndex >= totalWhiteKeys) return null;

  // Check black keys first (they overlap white keys)
  if (y < BLACK_KEY_HEIGHT) {
    const blackWidth = whiteKeyWidth * 0.6;
    // Check each black key
    const octave = Math.floor(whiteIndex / WHITE_KEYS_PER_OCTAVE);

    // Black key positions relative to white keys
    const blackPositions: [number, string][] = [
      [0, 'C#'], [1, 'D#'], [3, 'F#'], [4, 'G#'], [5, 'A#'],
    ];

    for (const [whitePos, noteName] of blackPositions) {
      const blackX = (octave * WHITE_KEYS_PER_OCTAVE + whitePos) * whiteKeyWidth + whiteKeyWidth - blackWidth / 2;
      if (x >= blackX && x <= blackX + blackWidth) {
        return `${noteName}${startOctave + octave}`;
      }
    }
  }

  // White key
  const octave = Math.floor(whiteIndex / WHITE_KEYS_PER_OCTAVE);
  const noteInOctave = whiteIndex % WHITE_KEYS_PER_OCTAVE;
  const noteIndex = WHITE_NOTE_INDICES[noteInOctave];
  if (noteIndex === undefined) return null;
  return `${NOTE_NAMES[noteIndex]}${startOctave + octave}`;
}

export const PixiTestKeyboard: React.FC<PixiTestKeyboardProps> = ({ instrument, width }) => {
  const activeNotesRef = useRef<Set<string>>(new Set());
  const [activeNotes, setActiveNotes] = useState<Set<string>>(new Set());
  const graphicsRef = useRef<Graphics | null>(null);

  // Calculate octaves that fit
  const { whiteKeyWidth, numOctaves, startOctave, totalWhiteKeys } = useMemo(() => {
    const available = width - 4;
    let octaves = 4;
    while (octaves >= 2) {
      const total = octaves * WHITE_KEYS_PER_OCTAVE + 1;
      const kw = available / total;
      if (kw >= 20) {
        return { whiteKeyWidth: Math.min(kw, 36), numOctaves: octaves, startOctave: Math.max(1, 4 - Math.floor(octaves / 2)), totalWhiteKeys: total };
      }
      octaves--;
    }
    const total = 2 * WHITE_KEYS_PER_OCTAVE + 1;
    return { whiteKeyWidth: available / total, numOctaves: 2, startOctave: 3, totalWhiteKeys: total };
  }, [width]);

  const triggerNote = useCallback((note: string) => {
    if (activeNotesRef.current.has(note)) return;
    activeNotesRef.current.add(note);
    setActiveNotes(new Set(activeNotesRef.current));
    try {
      const engine = getToneEngine();
      engine.syncResume();
      engine.triggerPolyNoteAttack(instrument.id, note, 80, instrument);
    } catch { /* engine not ready */ }
  }, [instrument]);

  const releaseNote = useCallback((note: string) => {
    if (!activeNotesRef.current.has(note)) return;
    activeNotesRef.current.delete(note);
    setActiveNotes(new Set(activeNotesRef.current));
    try {
      const engine = getToneEngine();
      engine.triggerPolyNoteRelease(instrument.id, note, instrument);
    } catch { /* engine not ready */ }
  }, [instrument]);

  const releaseAll = useCallback(() => {
    for (const note of activeNotesRef.current) {
      try {
        const engine = getToneEngine();
        engine.triggerPolyNoteRelease(instrument.id, note, instrument);
      } catch { /* */ }
    }
    activeNotesRef.current.clear();
    setActiveNotes(new Set());
  }, [instrument]);

  // Draw keys
  const drawKeys = useCallback((g: Graphics) => {
    g.clear();
    const blackWidth = whiteKeyWidth * 0.6;

    // White keys
    for (let i = 0; i < totalWhiteKeys; i++) {
      const x = i * whiteKeyWidth;
      const octave = Math.floor(i / WHITE_KEYS_PER_OCTAVE);
      const noteInOctave = i % WHITE_KEYS_PER_OCTAVE;
      const noteIndex = WHITE_NOTE_INDICES[noteInOctave];
      const noteName = noteIndex !== undefined ? `${NOTE_NAMES[noteIndex]}${startOctave + octave}` : '';
      const isActive = activeNotes.has(noteName);

      g.rect(x, 0, whiteKeyWidth - 1, KEY_HEIGHT);
      g.fill(isActive ? 0x4488ff : 0xf0f0f0);
      g.stroke({ color: 0x888888, width: 1 });
    }

    // Black keys
    for (let oct = 0; oct < numOctaves; oct++) {
      const blackPositions = [0, 1, 3, 4, 5]; // C# D# F# G# A#
      const blackNames = ['C#', 'D#', 'F#', 'G#', 'A#'];
      for (let b = 0; b < blackPositions.length; b++) {
        const whitePos = blackPositions[b];
        const x = (oct * WHITE_KEYS_PER_OCTAVE + whitePos) * whiteKeyWidth + whiteKeyWidth - blackWidth / 2;
        const noteName = `${blackNames[b]}${startOctave + oct}`;
        const isActive = activeNotes.has(noteName);

        g.rect(x, 0, blackWidth, BLACK_KEY_HEIGHT);
        g.fill(isActive ? 0x2266cc : 0x222222);
        g.stroke({ color: 0x000000, width: 1 });
      }
    }
  }, [whiteKeyWidth, totalWhiteKeys, numOctaves, startOctave, activeNotes]);

  // Pointer handlers
  const onPointerDown = useCallback((e: FederatedPointerEvent) => {
    const g = graphicsRef.current;
    if (!g) return;
    const local = g.toLocal(e.global);
    const note = noteFromPosition(local.x, local.y, whiteKeyWidth, startOctave, totalWhiteKeys);
    if (note) triggerNote(note);
  }, [whiteKeyWidth, startOctave, totalWhiteKeys, triggerNote]);

  const onPointerMove = useCallback((e: FederatedPointerEvent) => {
    if (e.buttons === 0) return;
    const g = graphicsRef.current;
    if (!g) return;
    const local = g.toLocal(e.global);
    const note = noteFromPosition(local.x, local.y, whiteKeyWidth, startOctave, totalWhiteKeys);

    // Release notes that are no longer under cursor
    for (const active of activeNotesRef.current) {
      if (active !== note) releaseNote(active);
    }
    if (note && !activeNotesRef.current.has(note)) triggerNote(note);
  }, [whiteKeyWidth, startOctave, totalWhiteKeys, triggerNote, releaseNote]);

  const onPointerUp = useCallback(() => {
    releaseAll();
  }, [releaseAll]);

  return (
    <layoutContainer
      layout={{ display: 'flex', flexDirection: 'column', width: '100%', paddingTop: 4 }}
    >
      <pixiGraphics
        ref={(g: Graphics | null) => { graphicsRef.current = g; }}
        draw={drawKeys}
        eventMode="static"
        cursor="pointer"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerUpOutside={onPointerUp}
        layout={{ width: totalWhiteKeys * whiteKeyWidth, height: KEY_HEIGHT }}
      />
    </layoutContainer>
  );
};
