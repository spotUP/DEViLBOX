/**
 * PianoKeyboard - Vertical piano keyboard for note reference
 * Supports note preview on click and scale highlighting
 */

import React, { useMemo, useCallback } from 'react';
import { isBlackKey, getNoteNameFromMidi } from '../../types/pianoRoll';

interface PianoKeyboardProps {
  verticalZoom: number;      // Pixels per semitone
  scrollY: number;           // Scroll offset (MIDI note number)
  visibleNotes: number;      // Number of visible notes
  containerHeight?: number;  // Actual container height for proper sizing
  activeNotes?: Set<number>; // MIDI notes currently playing
  scaleNotes?: Set<number>;  // Notes in current scale (0-11 note indices)
  onNoteClick?: (midiNote: number) => void;
  onNotePreview?: (midiNote: number) => void;
  onNoteRelease?: () => void;
}

const PianoKeyboardComponent: React.FC<PianoKeyboardProps> = ({
  verticalZoom,
  scrollY,
  visibleNotes,
  containerHeight,
  activeNotes = new Set(),
  scaleNotes,
  onNoteClick,
  onNotePreview,
  onNoteRelease,
}) => {
  // Handle mouse down for note preview
  const handleMouseDown = useCallback((midiNote: number) => {
    onNotePreview?.(midiNote);
    onNoteClick?.(midiNote);
  }, [onNoteClick, onNotePreview]);

  const handleMouseUp = useCallback(() => {
    onNoteRelease?.();
  }, [onNoteRelease]);

  // Generate visible keys
  const keys = useMemo(() => {
    const result: { midiNote: number; isBlack: boolean; name: string; inScale: boolean }[] = [];

    // Start from top (higher notes) and go down
    const startNote = Math.min(127, scrollY + visibleNotes);
    const endNote = Math.max(0, scrollY);

    for (let note = startNote; note >= endNote; note--) {
      const noteInOctave = note % 12;
      const inScale = scaleNotes ? scaleNotes.has(noteInOctave) : true;

      result.push({
        midiNote: note,
        isBlack: isBlackKey(note),
        name: getNoteNameFromMidi(note),
        inScale,
      });
    }

    return result;
  }, [scrollY, visibleNotes, scaleNotes]);

  return (
    <div
      className="flex flex-col bg-gray-900 border-r border-dark-border overflow-hidden shrink-0"
      style={{
        width: 48,
        height: containerHeight || 'auto',
      }}
      role="group"
      aria-label="Piano keyboard"
    >
      {keys.map(({ midiNote, isBlack, name, inScale }) => {
        const isC = midiNote % 12 === 0;
        const isActive = activeNotes.has(midiNote);
        const outOfScale = !inScale;
        const keyWidth = isBlack ? '66%' : '100%';

        return (
          <div
            key={midiNote}
            className={`
              flex items-center justify-end pr-1 text-[9px] font-mono cursor-pointer
              select-none border-b transition-all duration-75 shrink-0
              ${isActive
                ? 'bg-accent-primary text-text-inverse border-accent-primary brightness-110 shadow-lg'
                : isBlack
                  ? `bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700 ${outOfScale ? 'opacity-40' : ''}`
                  : `bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200 ${outOfScale ? 'opacity-40' : ''}`
              }
              ${isC ? 'font-bold' : ''}
            `}
            style={{
              height: verticalZoom,
              width: keyWidth,
              transform: isActive ? 'translateX(2px)' : 'translateX(0)', // Pressed effect
            }}
            onMouseDown={() => handleMouseDown(midiNote)}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            title={name}
            role="button"
            aria-label={`Play ${name}`}
            aria-pressed={isActive}
          >
            {isC ? name : ''}
          </div>
        );
      })}
    </div>
  );
};

// PERFORMANCE: Wrap in React.memo to prevent unnecessary re-renders
export const PianoKeyboard = React.memo(PianoKeyboardComponent);
export default PianoKeyboard;
