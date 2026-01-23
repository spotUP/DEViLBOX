/**
 * MiniKeyboard - Piano keyboard showing active arpeggio notes
 *
 * Displays a compact piano keyboard with:
 * - Highlighted notes from the arpeggio pattern
 * - Current playing note indicator
 * - Root note marker
 */

import React, { useMemo } from 'react';
import type { ArpeggioStep } from '@typedefs/instrument';

interface MiniKeyboardProps {
  steps: ArpeggioStep[];
  currentStep: number;
  isPlaying: boolean;
  baseNote?: string;
  octaves?: number;
}

// Key configuration
const NOTES_PER_OCTAVE = 12;
const BLACK_KEY_INDICES = [1, 3, 6, 8, 10]; // C#, D#, F#, G#, A#
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const isBlackKey = (noteIndex: number): boolean => {
  return BLACK_KEY_INDICES.includes(noteIndex % NOTES_PER_OCTAVE);
};

// Get position of black key relative to white keys
const getBlackKeyPosition = (noteIndex: number, whiteKeyWidth: number): number => {
  const octaveOffset = Math.floor(noteIndex / NOTES_PER_OCTAVE);
  const noteInOctave = noteIndex % NOTES_PER_OCTAVE;

  // Position black keys between white keys
  const whiteKeyPositions: Record<number, number> = {
    1: 1, // C# between C and D
    3: 2, // D# between D and E
    6: 4, // F# between F and G
    8: 5, // G# between G and A
    10: 6, // A# between A and B
  };

  const basePos = (whiteKeyPositions[noteInOctave] ?? 0) + octaveOffset * 7;
  return basePos * whiteKeyWidth - whiteKeyWidth * 0.3;
};

export const MiniKeyboard: React.FC<MiniKeyboardProps> = ({
  steps,
  currentStep,
  isPlaying,
  baseNote = 'C4',
  octaves = 3,
}) => {
  // Parse base note
  const baseNoteIndex = useMemo(() => {
    const match = baseNote.match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
    if (!match) return 48; // Default C4

    const noteName = match[1].toUpperCase();
    const accidental = match[2];
    const octave = parseInt(match[3], 10);

    const noteNameToIndex: Record<string, number> = {
      'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11,
    };

    let noteIndex = noteNameToIndex[noteName] ?? 0;
    if (accidental === '#') noteIndex += 1;
    if (accidental === 'b') noteIndex -= 1;

    return (octave + 1) * 12 + noteIndex;
  }, [baseNote]);

  // Calculate which notes are in the pattern
  const patternNotes = useMemo(() => {
    const notes = new Map<number, { inPattern: boolean; isRoot: boolean; isCurrent: boolean }>();

    steps.forEach((step, index) => {
      const noteIndex = baseNoteIndex + step.noteOffset;
      const existing = notes.get(noteIndex);

      notes.set(noteIndex, {
        inPattern: true,
        isRoot: step.noteOffset === 0 || existing?.isRoot || false,
        isCurrent: isPlaying && currentStep === index,
      });
    });

    return notes;
  }, [steps, baseNoteIndex, currentStep, isPlaying]);

  // Calculate keyboard range
  const startNote = baseNoteIndex - 12; // One octave below
  const endNote = startNote + octaves * 12;

  // Render keys
  const whiteKeys: React.ReactElement[] = [];
  const blackKeys: React.ReactElement[] = [];

  const totalWhiteKeys = octaves * 7;
  const keyboardWidth = 100;
  const whiteKeyWidth = keyboardWidth / totalWhiteKeys;

  let whiteKeyIndex = 0;

  for (let note = startNote; note < endNote; note++) {
    const isBlack = isBlackKey(note);
    const noteInfo = patternNotes.get(note);

    if (isBlack) {
      const x = getBlackKeyPosition(note - startNote, whiteKeyWidth);

      let fillColor = '#1f2937';
      if (noteInfo?.isCurrent) fillColor = '#eab308';
      else if (noteInfo?.isRoot) fillColor = '#3b82f6';
      else if (noteInfo?.inPattern) fillColor = '#059669';

      blackKeys.push(
        <rect
          key={`black-${note}`}
          x={`${x}%`}
          y="0"
          width={`${whiteKeyWidth * 0.6}%`}
          height="60%"
          fill={fillColor}
          stroke="#000"
          strokeWidth="0.5"
          rx="1"
          className={noteInfo?.isCurrent ? 'animate-pulse' : ''}
        />
      );
    } else {
      const x = whiteKeyIndex * whiteKeyWidth;

      let fillColor = '#e5e7eb';
      if (noteInfo?.isCurrent) fillColor = '#fcd34d';
      else if (noteInfo?.isRoot) fillColor = '#60a5fa';
      else if (noteInfo?.inPattern) fillColor = '#34d399';

      whiteKeys.push(
        <g key={`white-${note}`}>
          <rect
            x={`${x}%`}
            y="0"
            width={`${whiteKeyWidth}%`}
            height="100%"
            fill={fillColor}
            stroke="#374151"
            strokeWidth="0.5"
            rx="1"
            className={noteInfo?.isCurrent ? 'animate-pulse' : ''}
          />
          {/* Note name label for root note */}
          {noteInfo?.isRoot && (
            <text
              x={`${x + whiteKeyWidth / 2}%`}
              y="90%"
              fontSize="7"
              textAnchor="middle"
              fill="#1f2937"
              fontWeight="bold"
            >
              {NOTE_NAMES[note % 12]}
            </text>
          )}
        </g>
      );

      whiteKeyIndex++;
    }
  }

  return (
    <div className="bg-gray-900/50 rounded-lg border border-gray-800 p-2">
      {/* Keyboard */}
      <svg
        viewBox={`0 0 ${keyboardWidth} 30`}
        className="w-full h-8"
        preserveAspectRatio="none"
      >
        {/* White keys first (background) */}
        {whiteKeys}
        {/* Black keys on top */}
        {blackKeys}
      </svg>

      {/* Legend */}
      <div className="flex items-center justify-center gap-3 mt-1.5 text-[9px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-green-400" />
          Pattern
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-blue-400" />
          Root
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-yellow-400" />
          Playing
        </span>
      </div>
    </div>
  );
};
