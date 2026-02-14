/**
 * VirtualKeyboard - On-screen piano keyboard for mobile
 * Full piano keyboard with velocity sensitivity and MIDI output mode
 */

import React, { useCallback, useState } from 'react';
import { haptics } from '@/utils/haptics';

export interface VirtualKeyboardProps {
  octave?: number;
  onNoteOn: (note: number, velocity: number) => void;
  onNoteOff: (note: number) => void;
  onOctaveChange?: (octave: number) => void;
  className?: string;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_KEYS = [1, 3, 6, 8, 10]; // Indices of black keys

export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({
  octave = 4,
  onNoteOn,
  onNoteOff,
  onOctaveChange,
  className = '',
}) => {
  const [pressedKeys, setPressedKeys] = useState<Set<number>>(new Set());

  // Handle key press with velocity sensitivity
  const handleKeyPress = useCallback((semitone: number, e: React.TouchEvent) => {
    const touch = e.touches[0];
    // @ts-ignore - force property exists on Touch in iOS Safari
    const force = touch.force || 1.0; // Default to 1.0 on Android
    const velocity = Math.min(127, Math.floor(force * 127));

    const midiNote = octave * 12 + semitone + 12; // MIDI note number (C4 = 60)

    haptics.soft();
    onNoteOn(midiNote, velocity);

    setPressedKeys((prev) => new Set(prev).add(semitone));
  }, [octave, onNoteOn]);

  // Handle key release
  const handleKeyRelease = useCallback((semitone: number) => {
    const midiNote = octave * 12 + semitone + 12;
    onNoteOff(midiNote);

    setPressedKeys((prev) => {
      const next = new Set(prev);
      next.delete(semitone);
      return next;
    });
  }, [octave, onNoteOff]);

  // Handle octave change
  const handleOctaveUp = useCallback(() => {
    if (octave < 7 && onOctaveChange) {
      haptics.light();
      onOctaveChange(octave + 1);
    }
  }, [octave, onOctaveChange]);

  const handleOctaveDown = useCallback(() => {
    if (octave > 0 && onOctaveChange) {
      haptics.light();
      onOctaveChange(octave - 1);
    }
  }, [octave, onOctaveChange]);

  return (
    <div className={`virtual-keyboard ${className}`}>
      {/* Octave controls */}
      {onOctaveChange && (
        <div className="flex items-center justify-center gap-2 mb-2">
          <button
            onClick={handleOctaveDown}
            disabled={octave === 0}
            className="px-4 py-2 bg-dark-bgTertiary rounded-lg font-mono text-sm disabled:opacity-30 touch-target"
          >
            OCT -
          </button>
          <div className="px-4 py-2 bg-dark-bg rounded-lg font-mono font-bold text-accent-primary min-w-[60px] text-center">
            {octave}
          </div>
          <button
            onClick={handleOctaveUp}
            disabled={octave === 7}
            className="px-4 py-2 bg-dark-bgTertiary rounded-lg font-mono text-sm disabled:opacity-30 touch-target"
          >
            OCT +
          </button>
        </div>
      )}

      {/* Piano keys - 2 octaves */}
      <div className="relative h-[140px] bg-dark-bg rounded-lg overflow-hidden">
        <div className="absolute inset-0 flex">
          {[...Array(24)].map((_, index) => {
            const semitone = index % 12;
            const isBlackKey = BLACK_KEYS.includes(semitone);
            const isPressed = pressedKeys.has(index);
            const displayOctave = Math.floor(index / 12) + octave;

            return (
              <button
                key={index}
                onTouchStart={(e) => handleKeyPress(index, e)}
                onTouchEnd={() => handleKeyRelease(index)}
                onTouchCancel={() => handleKeyRelease(index)}
                className={`
                  piano-key
                  ${isBlackKey ? 'piano-key-black' : 'piano-key-white'}
                  ${isPressed ? 'opacity-70 scale-95' : ''}
                `}
                style={{
                  flex: isBlackKey ? '0 0 6%' : '1 1 auto',
                  zIndex: isBlackKey ? 2 : 1,
                  marginLeft: isBlackKey ? '-3%' : '0',
                  marginRight: isBlackKey ? '-3%' : '0',
                }}
                aria-label={`${NOTE_NAMES[semitone]}${displayOctave}`}
              >
                <span className="piano-key-label">
                  {NOTE_NAMES[semitone]}
                  <span className="text-[9px] opacity-50">{displayOctave}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default VirtualKeyboard;
