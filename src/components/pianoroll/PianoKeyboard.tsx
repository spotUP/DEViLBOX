/**
 * PianoKeyboard - Vertical piano keyboard for note reference
 */

import React, { useMemo } from 'react';
import { isBlackKey, getNoteNameFromMidi } from '../../types/pianoRoll';

interface PianoKeyboardProps {
  verticalZoom: number;      // Pixels per semitone
  scrollY: number;           // Scroll offset (MIDI note number)
  visibleNotes: number;      // Number of visible notes
  onNoteClick?: (midiNote: number) => void;
}

export const PianoKeyboard: React.FC<PianoKeyboardProps> = ({
  verticalZoom,
  scrollY,
  visibleNotes,
  onNoteClick,
}) => {
  // Generate visible keys
  const keys = useMemo(() => {
    const result: { midiNote: number; isBlack: boolean; name: string }[] = [];

    // Start from top (higher notes) and go down
    const startNote = Math.min(127, scrollY + visibleNotes);
    const endNote = Math.max(0, scrollY);

    for (let note = startNote; note >= endNote; note--) {
      result.push({
        midiNote: note,
        isBlack: isBlackKey(note),
        name: getNoteNameFromMidi(note),
      });
    }

    return result;
  }, [scrollY, visibleNotes]);

  return (
    <div
      className="flex flex-col bg-gray-900 border-r border-dark-border"
      style={{ width: 48 }}
    >
      {keys.map(({ midiNote, isBlack, name }) => {
        const isC = midiNote % 12 === 0;

        return (
          <div
            key={midiNote}
            className={`
              flex items-center justify-end pr-1 text-[9px] font-mono cursor-pointer
              select-none border-b transition-colors
              ${isBlack
                ? 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'
                : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
              }
              ${isC ? 'font-bold' : ''}
            `}
            style={{ height: verticalZoom }}
            onClick={() => onNoteClick?.(midiNote)}
            title={name}
          >
            {isC ? name : ''}
          </div>
        );
      })}
    </div>
  );
};

export default PianoKeyboard;
