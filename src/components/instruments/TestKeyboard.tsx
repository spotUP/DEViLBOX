/**
 * TestKeyboard - On-screen piano keyboard for testing sounds
 */

import React, { useState, useEffect } from 'react';
import { Music } from 'lucide-react';
import type { InstrumentConfig } from '../../types/instrument';
import { ToneEngine } from '../../engine/ToneEngine';

interface TestKeyboardProps {
  instrument: InstrumentConfig;
}

interface Key {
  note: string;
  label: string;
  isBlack: boolean;
  keyboardKey?: string;
}

const KEYS: Key[] = [
  { note: 'C4', label: 'C', isBlack: false, keyboardKey: 'a' },
  { note: 'C#4', label: 'C#', isBlack: true, keyboardKey: 'w' },
  { note: 'D4', label: 'D', isBlack: false, keyboardKey: 's' },
  { note: 'D#4', label: 'D#', isBlack: true, keyboardKey: 'e' },
  { note: 'E4', label: 'E', isBlack: false, keyboardKey: 'd' },
  { note: 'F4', label: 'F', isBlack: false, keyboardKey: 'f' },
  { note: 'F#4', label: 'F#', isBlack: true, keyboardKey: 't' },
  { note: 'G4', label: 'G', isBlack: false, keyboardKey: 'g' },
  { note: 'G#4', label: 'G#', isBlack: true, keyboardKey: 'y' },
  { note: 'A4', label: 'A', isBlack: false, keyboardKey: 'h' },
  { note: 'A#4', label: 'A#', isBlack: true, keyboardKey: 'u' },
  { note: 'B4', label: 'B', isBlack: false, keyboardKey: 'j' },
  { note: 'C5', label: 'C', isBlack: false, keyboardKey: 'k' },
];

export const TestKeyboard: React.FC<TestKeyboardProps> = ({ instrument }) => {
  const [activeNotes, setActiveNotes] = useState<Set<string>>(new Set());
  const [engine] = useState(() => ToneEngine.getInstance());

  const playNote = async (note: string) => {
    // Ensure audio context is started
    await engine.init();

    // Trigger the note
    engine.triggerNote(
      instrument.id,
      note,
      0.2, // Duration - 200ms
      0, // time - play now
      0.8, // velocity
      instrument
    );

    // Visual feedback
    setActiveNotes((prev) => new Set(prev).add(note));
    setTimeout(() => {
      setActiveNotes((prev) => {
        const next = new Set(prev);
        next.delete(note);
        return next;
      });
    }, 200);
  };

  const stopNote = (note: string) => {
    engine.triggerNoteRelease(instrument.id, note, 0, instrument);
  };

  // Keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      const key = KEYS.find((k) => k.keyboardKey === e.key.toLowerCase());
      if (key && !activeNotes.has(key.note)) {
        playNote(key.note);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = KEYS.find((k) => k.keyboardKey === e.key.toLowerCase());
      if (key) {
        stopNote(key.note);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [activeNotes, instrument]);

  return (
    <div className="space-y-3">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-ft2-highlight">
          <Music size={16} />
          <span>TEST KEYBOARD</span>
        </div>
        <div className="text-xs text-ft2-textDim font-mono">
          Use keyboard: A-K keys or click
        </div>
      </div>

      {/* Piano Keyboard */}
      <div className="bg-ft2-header rounded border-2 border-ft2-border p-4">
        <div className="relative h-32 flex items-end justify-center">
          <div className="flex gap-0.5 relative">
            {/* White keys */}
            {KEYS.filter((k) => !k.isBlack).map((key) => {
              const isActive = activeNotes.has(key.note);
              return (
                <button
                  key={key.note}
                  onMouseDown={() => playNote(key.note)}
                  onMouseUp={() => stopNote(key.note)}
                  onMouseLeave={() => stopNote(key.note)}
                  className={`
                    relative w-12 h-32 border-2 border-ft2-border rounded-b
                    transition-all cursor-pointer select-none
                    ${
                      isActive
                        ? 'bg-ft2-cursor shadow-lg shadow-ft2-cursor/50'
                        : 'bg-white hover:bg-gray-100 active:bg-ft2-cursor'
                    }
                  `}
                >
                  <div className="absolute bottom-2 left-0 right-0 text-center">
                    <div className="text-xs font-bold text-gray-700">{key.label}</div>
                    <div className="text-xs text-gray-500 font-mono">{key.keyboardKey}</div>
                  </div>
                </button>
              );
            })}

            {/* Black keys overlay */}
            {KEYS.filter((k) => k.isBlack).map((key) => {
              const isActive = activeNotes.has(key.note);
              // Position black keys between white keys - calculate based on note position
              const keyIndex = KEYS.findIndex((k) => k.note === key.note);
              const whiteKeysBefore = KEYS.slice(0, keyIndex).filter((k) => !k.isBlack).length;
              const leftPosition = whiteKeysBefore * 48 + 36; // 48px width + 0.5px gap, offset by 3/4 of white key

              return (
                <button
                  key={key.note}
                  onMouseDown={() => playNote(key.note)}
                  onMouseUp={() => stopNote(key.note)}
                  onMouseLeave={() => stopNote(key.note)}
                  className={`
                    absolute w-8 h-20 border-2 border-ft2-border rounded-b
                    transition-all cursor-pointer select-none z-10
                    ${
                      isActive
                        ? 'bg-ft2-highlight shadow-lg shadow-ft2-highlight/50'
                        : 'bg-gray-900 hover:bg-gray-700 active:bg-ft2-highlight'
                    }
                  `}
                  style={{ left: `${leftPosition}px` }}
                >
                  <div className="absolute bottom-1 left-0 right-0 text-center">
                    <div className="text-xs text-white font-mono">{key.keyboardKey}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Velocity Control */}
      <div className="flex items-center gap-3 bg-ft2-header rounded border border-ft2-border p-2">
        <span className="text-xs font-bold text-ft2-highlight">VELOCITY:</span>
        <input
          type="range"
          min="0"
          max="100"
          defaultValue="80"
          className="flex-1 h-1 bg-ft2-bg rounded-lg appearance-none cursor-pointer accent-ft2-cursor"
        />
        <span className="text-xs font-mono text-ft2-text">80%</span>
      </div>

      {/* Info */}
      <div className="text-xs text-ft2-textDim bg-ft2-header p-2 rounded border border-ft2-border">
        <span className="font-bold">Keyboard shortcuts:</span> A S D F G H J K (white keys), W E T Y U (black keys)
      </div>
    </div>
  );
};
